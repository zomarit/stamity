---
id: packs
# A design document, authored from docs/plans/018-packs-rebuilt-01.md on 2026-10-21 at the Prove phase of run 2026-10-20_packs-rebuilt, by its unit u18-spec-docs against the integration head 936350cb, and excluded from the site build.
# The records moved to the `records` branch on 2026-10-14; every path below that names this repository's own records — under `.stamity/runs/`, `.stamity/evidence/`, `.stamity/handoffs/`, `.stamity/inbox.md`, `docs/plans/`, `evals/runs/`, `evals/measurements/` or `evals/reach/` — reads on that branch (REQ-PROVE-023 in docs/specs/prove-behavior-and-value.md). A path of the run layout a consuming repository writes, such as `.stamity/runs/<run-id>/`, is the product's and is not one of them.
status: design
obsolete_when: every requirement below is pinned by a test or an eval case that names its id and the packs reference carries it, or a decision row cuts the surface
---
# Packs

What the pack engine does with the packs this package bundles, how a skill leaves the core for a pack, and what the
per-pack suite and lint hold. The area code is `PACK`. The change is Package 22's first file, which ships in the next
minor after 1.16.0 with Package 20's cut; the cut flips `status: design`.

The requirement text comes from the `## Spec delta` of `docs/plans/018-packs-rebuilt-01.md` (REQ-PACK-001 to
REQ-PACK-014), with REQ-PACK-003 as the plan amended it at the build (ledger `review/23` of run
`2026-10-20_packs-rebuilt`), merged once by that run's unit `u18-spec-docs`. Where a unit's or fixer's report declared
a clause the delta is silent on, a line headed "As built" adds it; where the landed code differs from the delta, the
requirement states the code and the "As built" line says what moved. A ledger id (`review/12`, `build/3`) is that
run's own.

Every citation reads at the integration head `936350cb` unless it names another commit. Three units landed beside the
merge, on their own lanes, and are cited at their lane heads: `u4-pack-fit` at `164b31d1`, its fix round (branch `p22/u4`),
`u15-moved-customizations` at `3bd36771` (branch `p22/u15`) and `u16-frontend-suggestion` at `017834e1` (branch
`p22/u16`); the reference page's skill-count fix (`integrate/2`) at `c87ad244`. `u17-pack-suite` had not run when this
merge ran: the requirements it carries (REQ-PACK-011, REQ-PACK-012, and REQ-PACK-006's lint) name the suites it lands,
`test/packs/packs.test.ts` and `test/packs/lint.test.ts`, as its cell declares them. Citations into the modules the
run rewrote name the file and the symbol, as the plan's own cells anchor them; a citation of a content file names its
lines.

## Intent

A pack is how this package ships an optional line of work without loading it into every repository. A fork should add
one by adding a folder, a retired pack name should say where its parts went, and nothing should be written by `add`
that `sync` would then refuse. A skill that leaves the core should leave cleanly: the old copies go where they are
unedited, an edited one is kept and named, and every core reader still works where the pack is absent.

## Invariants

1. **The catalog is the folder.** The bundled catalog is derived from `packs/*/pack.json` and the generated pins; no
   code edit adds or removes a pack (REQ-PACK-001).
2. **Pinned or refused.** A bundled pack installs only when its integrity map aggregates to its pin; the build stamps
   the release version into the shipped manifest and moves nothing else (REQ-PACK-001).
3. **`add` refuses before it writes.** Every refusal this spec adds is decided before any byte is written, `--dry-run`
   included (REQ-PACK-002, REQ-PACK-004, REQ-PACK-005).
4. **A delete needs the bytes.** `sync` removes a moved skill's old copy only where its bytes hash to the frozen core
   rendering at exactly that engine path; a row alone proves nothing (REQ-PACK-008).
5. **No name or row id from outside this repository** appears in this spec. The leak gate is the check.

## Requirements

### REQ-PACK-001 — The catalog is derived from the packs folder, and a built pack carries the release version

Given a folder `packs/<id>/` holding a `pack.json` named `<id>` and a generated pin, When `stamity add <id>` resolves a
bare id, Then the bundled catalog lists it with no code edit, so a fork adds a pack by adding the folder and
regenerating the pins; a folder whose name differs, one with no description, no pin or a stale pin is refused naming
each, by the verbs that read the catalog alone. Given the built package, Then every `dist/packs/*/pack.json` reads
`package.json`'s version, a test holds each source `pack.json` to it, `generate-pack-manifests.mjs --write` sets it,
and no pin moves.

- **As built:** the catalog is `curatedPacks()`, `deriveCatalog(bundledPacksRoot(), CATALOG_PINS)` read on first use
  and memoized, never at import; `deriveCatalog` lists every defect in one `CONFIG_ERROR`, a pin naming no folder
  among them, and a `null` root yields an empty catalog; `listBundledPackIds` refuses a folder with no `pack.json` and
  ignores a plain file; `resolveBundledPackRoot` resolves under the one root the catalog read, so a stale
  `dist/packs/<id>` in a source checkout never resolves (`src/pack/curated.ts`). `CURATED_PACKS` left the module; the
  registry keeps `createEngine().pack.curated.CURATED_PACKS` as a non-enumerable getter that reads `curatedPacks()`
  on first read, marked deprecated (`src/composition/root.ts`; `review/13`). The build's `stampPackVersions` rewrites
  `version` alone, the field order kept (`tsdown.config.mjs`). `check`'s `pack-integrity` row keeps its `fail` when
  the catalog cannot be derived, the re-add source read as none (`reAddArgsOf`, `src/cli/commands/check.ts`;
  `review/12`, security). The tarball smoke derives its pack folders from `packs/` and fails an installed `pack.json`
  that does not read the package's version (`scripts/tarball-smoke.mjs`).
- **Proof:** `test/pack/curated.test.ts`, `test/ci/tarballStaging.test.ts`, `test/support/support.test.ts` (the
  `stampPackVersions` cases), `test/composition/root.test.ts` (the lazy getter), `test/cli/commands/check.test.ts`
  ("still fails a tampered catalog-installed pack when the bundled catalog cannot be derived"); `test/packs/packs.test.ts`
  holds every pack at the release version (lands in `u17-pack-suite`).
- **Source:** `src/pack/curated.ts`, `scripts/generate-pack-manifests.mjs`, `tsdown.config.mjs`.

### REQ-PACK-002 — Retired pack names point at their successors and are never reused

Given a retired-names entry for `<id>` (`src/pack/retired.ts`, a typed constant, empty in this file), When
`stamity add <id>` names it as a bare id the catalog lacks, Then it refuses before any plan with `VALIDATION_ERROR`,
naming the release that retired it, where each of its parts went, `add <successor>`, and `./node_modules/<id>` as the
way to install a package of that name on purpose; a path or scoped spec, and a local or npm pack whose manifest is named
`<id>`, resolve as today. A test holds no retired id in the catalog and no `packs/<retired id>/` folder.

- **As built:** the message is `describeRetiredPack`'s line, `pack "<id>" was retired after <ver>: <part> → <pack>
  <name>; <part> → dropped (<note>); …`, a part moved into the core reading `→ core <name>`
  (`src/pack/retired.ts:64-77`); its why is "a retired name is never reused". Its next leads with the repository's
  replace order (`replaceSteps`: `clean --pack <id>`, each kept client copy deleted, `sync`, then `add <successor>` per
  successor pack, then `sync`) only where a first-party copy of that id is installed, and otherwise names
  `add <successor>` per successor; `add ./node_modules/<id>` closes it (`retiredPackRefusal`,
  `installedFirstPartyCopy`, `src/cli/commands/add.ts`; `review/22`, `review/24`). The map is read through the engine
  registry, `engine.pack.retired.RETIRED_PACKS`, so a command-level test injects one (`review/21`); a spec starting
  with `@` never consults it.
- **Proof:** `test/pack/retired.test.ts`, `test/cli/commands/add.test.ts` ("add — retired pack names").
- **Source:** `src/pack/retired.ts`, `src/cli/commands/add.ts`.

### REQ-PACK-003 — `check` reports a retired or stale catalog pack

Given `stamity check`, Then a `pack-catalog` row reads `pass` with no pack installed, or with each installed catalog
pack's content matching its bundled pin, judged from the receipt's file hashes and never from the version; `warn` for
an installed first-party copy of a retired pack (installed from the catalog, or from a path or npm with content a
retired release shipped), naming where its parts went and the fix in the repo's replace order (`clean --pack <id>`, each
kept client copy deleted, `sync`, then `add <successor>`, then `sync`), and for an installed catalog pack whose content
no longer matches the bundled copy, naming `add <id>`. Any other path or npm pack is not judged, and the row never fails.

- **As built:** the row is `checkPackCatalog`, registered after `pack-reach` and before `model-pins`
  (`src/cli/commands/check.ts`). Its pass reads "no installed pack is recorded in the ledger", or "<n> catalog pack(s)
  match the copy this release bundles", adding "<n> pack(s) from a path or npm not judged" where any is; a receipt whose
  bytes do not match its ledger row is not compared and adds `Content not compared for pack "<id>" (<reason>).`
  (`readVerifiedReceipt`, `installedCopyOf` and `isFirstPartyRetiredCopy`, which the row and `add` share,
  `src/cli/commands/add.ts`). `docs/troubleshooting.md` carries the row in its doctor sample and its table.
- **Proof:** `test/cli/commands/check.test.ts` ("check — pack-catalog", and "reads the retired map through the engine
  registry when run as a doctor row"); `test/docsPages.test.ts` (the doctor table's row set).
- **Source:** `src/cli/commands/check.ts`, `src/cli/commands/add.ts`.

### REQ-PACK-004 — `add` checks that a pack fits Codex's skills list before it writes

Given Codex selected, When `stamity add <spec>` plans a pack, Then before any write, `--dry-run` included, it measures
the list Codex would show with the pack in it, an installed copy of the same id replaced, through the one function
`sync`'s refusal counts with (`measureCodexSkillsList`), and past 8,000 characters refuses with `VALIDATION_ERROR`,
exit 1, naming the pack, its share and the total; a pack whose skills each ship `allow_implicit_invocation: false` adds
nothing, a setup without Codex is not measured, and the receipt and `sync`'s refusal text are unchanged.

- **As built (`164b31d1`):** the refusal is a fourth part beside collisions, name clashes and left-behind files,
  reading `pack "<id>" does not fit Codex's skills list: its <k> skill(s) add <n> characters, <t> of 8,000`, digits
  grouped (`src/cli/commands/add.ts`). Its next shortens the pack's descriptions, marks a skill explicit-only, or sets
  `ruleDelivery: "always-on"`, and where another installed pack already holds a share it names
  `clean --pack <that pack>` first, the largest; neither `add`'s refusal nor `sync`'s advises narrowing the content
  selection any more, since `sync` plans the full corpus every run (`review/32`, `build/26`). The plan stages the pack
  in place of an installed copy of its id (`StagedPack` and `resolveInstalledPackContent`'s `opts.staged`,
  `src/pack/projection.ts`), and `add` and `sync`'s residue planner measure through one helper, the same shown rows
  and attribution from the same inputs (`measureCodexSkillsListFor`, `src/adapters/codex.ts`; `planPackFit`,
  `src/cli/engine/packFit.ts`, given `sync`'s selection and installation identity; `review/31`, `review/33`).
  `add --json`'s `planned.fit` carries the measure, `{ codex: { applies: false } }` without Codex, and is `null` only
  where another part already refuses and the staged emission cannot be planned.
- **Proof (`164b31d1`):** `test/cli/engine/packFit.test.ts` (among its cases, "measures the total, the core's share and
  the pack's that sync's refusal prints for the same setup"), `test/cli/commands/add.test.ts` ("add — the Codex
  skills-list fit (REQ-PACK-004)", and "names removing the installed pack first when another pack already takes the
  list past 8,000"), `test/adapters/codex.test.ts` (the `measureCodexSkillsList` pin, and the refusal pins with no
  narrowing step), `test/pack/packEngineDefects.test.ts` (C2 through `installBypassingAdd`, C3).
- **Source:** `src/cli/engine/packFit.ts`, `src/adapters/codex.ts` (`measureCodexSkillsList`), `src/pack/projection.ts`.

### REQ-PACK-005 — `add` refuses a pack name that collides in its own class

Given an incoming pack artifact whose catalog id or emitted name equals one that a core artifact, selected or not, a
fork, an override or another installed pack holds in the same class, When `stamity add` plans it, Then it refuses before
any write, naming each owner and its remedy as the cross-class check does, where today such a pack passes `add` and is
refused at `sync`; a made-up-pack test shows that gap red before the fix lands.

- **As built:** the emitted-name half is `findInvocableNameClashes`'s `sameClassFrom` option, which `collectNameClashes`
  passes as "the incoming pack's own item" (`src/content/catalog.ts`, `src/pack/install.ts`); the catalog-id half reads
  the content index of every existing layer once (`readExistingLayers`), so an id another layer holds and no ledger row
  records yet is refused too, naming the holder (`heldIdOwnerOf`), and another installed pack's id is read from its
  declared id, not its file name (`review/17`; `src/pack/install.ts`). An id line prints under its own `id collisions`
  part, whose next renames the incoming id or removes the other layer's copy where it is the operator's, with no `sync`
  step; a ledger row held only by a client copy keeps the paths remedy (`idCollisionPart` and `isIdCollision`,
  `src/cli/commands/add.ts`, `src/pack/install.ts`; `fix/1`). A name-clash part's why names each kind's mechanism, two
  commands being one command on every client (`nameClashMechanismOf`; `review/7`). `sync`'s walk is unchanged.
- **Proof:** `test/pack/packEngineDefects.test.ts` (B6 to B12, B6 on the five client sets, each red on the code before
  it), `test/cli/commands/add.test.ts` (the two-command clash and the two id-collision cases), `test/pack/install.test.ts`.
- **Source:** `src/content/catalog.ts`, `src/pack/install.ts`, `src/cli/commands/add.ts`.

### REQ-PACK-006 — Two client keys pass through, and rule-skills leave the `/` menu

Given a core or pack skill declaring `user-invocable` or `disable-model-invocation`, Then each projects as a top-level
key, never hoisted under `metadata`, and a value that is not a boolean is refused naming the file and the key; a lint
fails a skill declaring `disable-model-invocation: true` that ships no `agents/openai.yaml` setting
`policy.allow_implicit_invocation: false`. Every rule-skill takes `user-invocable: false` from its class, no `content/`
line moving; the Claude touchpoint commands carry no `disable-model-invocation` and `st-unattended` stays in the menu,
so a Claude-only setup's `/` menu lists 16 Stamity entries, the 9 commands and 7 skills.

- **As built:** `PASSTHROUGH_KEYS` keeps the two keys after `description` when their value is a boolean; any other value
  throws `VALIDATION_ERROR` reading `` <file>: `<key>` must be true or false, got <json>. `` (`toSpecFrontmatter`,
  `src/emit/skillsProjection.ts`). `projectRuleAsSkill` writes `user-invocable: false` in every rule-skill head. A head
  declaring neither key emits the bytes it did. The pack lane borrows the same function, so a pack skill is held the
  same way (`src/pack/projection.ts`). An override or pack skill that wrote either key as a string, which emitted before,
  now stops `sync` (`build/2`).
- **Proof:** `test/emit/skillsProjection.test.ts` ("the two client keys", and the rule-skill head case),
  `test/pack/projection.test.ts`, `test/corpus/census.test.ts` (seven core skills); the lint lands in
  `test/packs/lint.test.ts` (`u17-pack-suite`).
- **Source:** `src/emit/skillsProjection.ts`.

### REQ-PACK-007 — The `frontend` pack holds the two interface skills, and the core reads them where installed

Given the package, Then `packs/frontend/` ships `st-design-system-detect` and `st-browser-evidence` with their
companions, each description at most 250 characters, the core corpus no longer ships them, and `add frontend` resolves
through the catalog. Given no `frontend` pack, Then `/st-work`'s QA step and the qa skill offer a browser run only where
that skill is installed, and the design-quality agent, the UI-states rule and the verify skill's `ui-token-usage` check
each state what they read with no design-system inventory and say it is absent; no line is added to `/st-work`.

- **As built:** the bodies moved byte-identical but for `description`, 246 and 249 characters, each keeping its
  "Triggers when…" clause (`packs/frontend/skills/st-design-system-detect/SKILL.md:6`,
  `packs/frontend/skills/st-browser-evidence/SKILL.md:6`); `packs/frontend/pack.json` declares the four clients and the
  two paths its skills write. The readers: `content/commands/st-work.md:285-286` (step 3) and `:288-291`, which marks
  browser evidence "not installed" where the skill is absent (`review/19`); `content/skills/st-qa/SKILL.md:101-103`;
  `content/agents/stamity-design-quality.md:45-49`; `content/rules/stamity-ui-states.md:54-56`, which reads the
  stylesheet layer's token source with no inventory, as the two judges do, and says the inventory is absent
  (`review/18`, `review/20`); `content/skills/st-verify/references/ui.md:28-32`. Each file keeps its line count.
- **Proof:** `test/packs/frontend.test.ts`, `test/corpus/census.test.ts`, `test/corpus/agents/specialists.test.ts`,
  `test/corpus/rules/quality.test.ts`, `test/corpus/commands/work.test.ts`, `test/corpus/skills/flow.test.ts`.
- **Source:** `packs/frontend/`, and the five reader files above.

### REQ-PACK-008 — `sync` removes the moved skills' unedited copies and says so once

Given a setup an earlier release synced, its ledger holding `st-design-system-detect` or `st-browser-evidence` rows,
When `sync` runs, Then each copy under `.claude/skills/` or `.agents/skills/` whose bytes match its recorded hash and a
frozen 1.16.0 rendering of that file (`SKILL.md`, `agents/openai.yaml`; byte-identical since 1.9.0) is deleted on that
proof, an edited copy is kept and named, and one notice, printed once, names both skills, the `frontend` pack, what it
removed or kept and `stamity add frontend`; with `frontend` installed its copies stand at those paths and none is kept.

- **As built:** the frozen digests are `MOVED_CORE_SKILLS`, each moved skill `pack: "frontend"`, `since: "1.17.0"`, read
  at exactly `<folder>/st-<id>/<file>` for `.agents/skills` and `.claude/skills` (`movedRenderingAt`,
  `src/pack/moved.ts:47-86`); `engineRenderingsFor` adds them only for a client-owned skill row of a moved id the
  running corpus no longer holds (`src/cli/engine/emissionWrite.ts`). The notice is one line per skill,
  `moved: skill st-<id> left the core for the frontend pack in 1.17.0; its copies were <outcomes>. To keep it: stamity
  add frontend`, its outcomes `removed: <paths>`; `kept — edited since sync wrote it; delete by hand: <paths>` (a copy
  whose every row records the frozen digest); `kept — its ledger row does not record the last core rendering; delete it
  by hand only if it is yours to remove: <paths>`; and `left in place — the sweep refused the path as unsafe to touch,
  for the reason the reclaim report gives: <paths>` (`movedSkillLines`, `src/cli/commands/sync/report.ts`; `review/9`,
  `review/10`). It prints on a live run only, and a removed or kept copy's row leaves the ledger, so the next `sync`
  prints nothing. This repository's own `sync` at `936350cb` printed the notice for both skills and removed their four
  tracked copies.
- **Proof:** `test/cli/engine/movedPrune.test.ts` (fifteen cases, the forged-row and symlinked-folder cases among them),
  `test/emit/upgradeFrom1140.e2e.test.ts` (eight reclaims from the 1.14.0 tree).
- **Source:** `src/pack/moved.ts`, `src/cli/engine/emissionWrite.ts`, `src/cli/commands/sync/report.ts`.

### REQ-PACK-009 — An override or overlay of a moved skill is named, and `check` reports it

Given an overlay of `design-system-detect` or `browser-evidence` under `.stamity/overrides/skills/`, Then `sync`,
`check`'s drift gate and `validate` refuse it with `VALIDATION_ERROR` whose text names the move and `stamity add
frontend`, with or without the pack (REQ-OVERLAY-009); a full override warns on `sync`, dry run included, that it now
stands alone, and with the pack installed the planner's refusal names the move. A `moved-skills` row of `check` reads
`fail` for such an overlay, `warn` for a full override or a moved id's core ledger row, and `pass` otherwise.

- **As built (`3bd36771`):** the refusal reads `skill "<id>" moved from the core to the <pack> pack in <since>, and
  overlays on pack skills are not applied. Fold your change into a full override under another id, or remove <path>;
  to keep the shipped skill, stamity add <pack>.`, each half named by its POSIX path (`refuseMovedSkillOverlay`,
  `src/content/catalog.ts`); a skill of a moved id supplied by another pack keeps the pack-skill text, and a fork-stage
  patch of a moved skill stays a skip, its reason naming the move and the pack (`forkMovedSkillSkipReason`). The
  warning reads `your override <path> replaced a core skill that moved to the <pack> pack; it now stands alone and
  tracks no shipped copy. Keep it, or remove it and stamity add <pack>.` (`movedSkillOverrideWarnings`,
  `src/emit/planner.ts`). `checkMovedSkills` sits after `pack-catalog`, reads the override folder and the ledger
  directly so it answers when the plan throws, finds a full override by the id it declares, as the index does, and with
  the pack installed names the collision and `clean --pack <pack>` (`src/cli/commands/check.ts`).
- **Proof (`3bd36771`):** `test/content/catalog.test.ts`, `test/emit/plannerOverlay.test.ts`,
  `test/cli/commands/check.test.ts` ("check — moved-skills"), `test/cli/commands/validate.test.ts`.
- **Source:** `src/content/catalog.ts`, `src/emit/planner.ts`, `src/cli/commands/check.ts`.

### REQ-PACK-010 — `init` suggests the `frontend` pack where a front-end framework is detected

Given a detected Next.js, React, Vue, Svelte, SvelteKit, Nuxt, Angular, Astro, Remix, SolidStart, TanStack Start or
Qwik stack, When `init` prints its stack suggestions, Then a row names the `frontend` pack with its pinned
`add frontend` line, once however many of those stacks are detected; a pack id `add` cannot resolve is never offered,
no row offers a pack the ledger already records as installed, and `init` installs nothing.

- **As built (`017834e1`):** `STACK_PACK_CATALOG` maps the twelve subjects, read from `FRAMEWORK_SUBJECTS`, to
  `frontend`, and `resolvableStackPacks` keeps the ids the catalog resolves that no `pack:<id>` ledger owner holds
  (`src/detect/stackSupport.ts`; `offeredStackPacks`, `src/cli/commands/init.ts`). The first row offering a pack leads
  the block, so the panel's three-row cap never cuts it, and reads `<subject> (framework) — Install the frontend pack:
  <pinned call> add frontend`; a later row naming the same pack reads "covered by the frontend pack above"
  (`stackSuggestionLines`, `src/cli/commands/init/panel.ts`). A catalog or manifest that cannot be read after the
  writes offers no pack and `init` still exits 0.
- **Proof (`017834e1`):** `test/detect/stackSupport.test.ts` ("STACK_PACK_CATALOG and resolvableStackPacks
  (REQ-PACK-010)"), `test/cli/commands/initPanel.test.ts` ("renderInitPanel — the frontend pack suggestion
  (REQ-PACK-010)"), `test/cli/commands/init.test.ts`.
- **Source:** `src/detect/stackSupport.ts`, `src/cli/commands/init.ts`, `src/cli/commands/init/panel.ts`.

### REQ-PACK-011 — The pack lint

Given any file under `packs/`, made-up fixture packs included, Then the lint fails on text opening `${STAMITY:`,
well-formed or not, and on a CLI call (`npx … stamity`, `@zomarit/stamity`, a fenced line or table cell opening on
`stamity `, or `stamity <verb>` for a registered verb), never on a `.stamity/` path or a `stamity-` id; and it holds
every pack skill's description to at most 250 characters, `ops` and `product-audit` exempt through an entry that fails
once that pack's folder is gone.

- **Proof:** `test/packs/lint.test.ts` (lands in `u17-pack-suite`; each probe with a made-up pack that makes it fail).
- **Source:** `test/support/packFixtures.ts` (the shared made-up-pack helper `u17-pack-suite` extends).

### REQ-PACK-012 — One per-pack suite proves every pack

Given `test/packs/packs.test.ts`, Then it enumerates the packs from `packs/*/pack.json`, equal to the catalog's ids, and
in-process holds each to a valid manifest at the release version, its integrity map in both directions, the installer's
ingress gates, the frontmatter contract, names unique across the core and every pack, and cross-references resolved
against the core and every pack, the scaffold suite's resolver widened the same way; then `add <id>` by catalog id,
`sync` and `check` exit 0 on the five client sets and with every pack on all four clients, each check shown red on a
made-up pack first. The three per-pack suites stay until their packs leave.

- **As built, before the suite:** the scaffold suite's cross-reference resolver already reads every bundled pack
  (`listBundledPackIds`, `test/packs/scaffold.test.ts`; unit `u13-frontend-move`).
- **Proof:** `test/packs/packs.test.ts` (lands in `u17-pack-suite`), `test/packs/scaffold.test.ts`.
- **Source:** `test/support/packFixtures.ts`.

### REQ-PACK-013 — The eval surface takes in `packs/`

Given the eval gates and the runner, Then the coverage gate enumerates each pack's commands, agents, rules and skills
beside `content/`, a case may source a file under either, the locator gate checks a block naming a pack file, the
runner admits a pack source and holds `packs` to its clean tree, a pack skill's probe takes its folder as its recall
label, and `evals/SET-v7.md` and `evals/README.md` name the surface; each of the sixteen artifacts of `ops`,
`product-audit` and `scaffold` carries a dated exemption row that fails once its folder is gone, and the two moved
skills' select probes source their `packs/frontend/` copies.

- **As built:** the runner's admission is `isSurfaceSource` (`scripts/eval/instrument.mjs`), held equal to the gate's
  copy in `test/evals/support.ts` by a case in `test/evals/coverage.test.ts`; `recallLabel` returns none for a pack
  rule's path, so a probe sourced there is refused by name. SET-v7's release-rule span is left byte-identical, and the
  sentence naming `packs/**` follows it inside the Incremental section. The release checklist's eval line names
  `packs/**` beside `content/**` (`.github/release-controls-checklist.md:180-181`; `build/10`).
- **Proof:** `test/evals/coverage.test.ts` ("eval coverage — a pack is part of the surface"), `test/evals/locators.test.ts`,
  `test/evals/manualRunner.test.ts`.
- **Source:** `test/evals/support.ts`, `scripts/eval/instrument.mjs`, `scripts/eval/run.mjs`,
  `evals/coverage-exemptions-v6.md`.

### REQ-PACK-014 — The packs reference lists each pack's skills and commands

Given the generated `docs/reference/packs.md`, Then each pack's block lists its skills and commands by name with their
descriptions, read from the pack's files, beside its class counts, and the page's test derives the pack ids, their
count and their classes from `packs/` rather than from a typed list; the page is regenerated, never edited by hand.

- **As built:** the lines read ``- `st-<id>` — <description>`` under `Skills:` and ``- `/st-<id>` — <description>`` under
  `Commands:`, after the field list; an item with no `id` or `description` refuses, naming its file (`readPacks` and
  `packBlock`, `src/cli/docs/referencePages.ts`). A skill counts by its `SKILL.md`, so a support file such as
  `agents/openai.yaml` is not a skill (`c87ad244`, `integrate/2`).
- **Proof:** `test/cli/docs/referencePages.test.ts`.
- **Source:** `src/cli/docs/referencePages.ts`.

## Acceptance criteria

One set per requirement. Each is machine-checkable unless tagged `judgment:`. Once a test named under a requirement
exists, it is the normative record for that requirement.

**REQ-PACK-001**

- GIVEN a temp root holding a made-up `packs/acme-demo/` with a regenerated pin WHEN `deriveCatalog` reads it THEN the
  entry is listed with no code edit; GIVEN a name that differs from its folder, a missing description, no pin and a
  stale pin THEN one `CONFIG_ERROR` lists all four; GIVEN a `null` root THEN the catalog is empty.
  *(test: `test/pack/curated.test.ts`)*
- GIVEN the built package WHEN every `dist/packs/*/pack.json` is read THEN each reads `package.json`'s version and
  every other field and its key order equal its source. *(test: `test/ci/tarballStaging.test.ts`)*
- GIVEN `createEngine()` WHEN the registry is imported, built and spread THEN no packs folder is read, and WHEN
  `pack.curated.CURATED_PACKS` is read THEN it returns `curatedPacks()`. *(test: `test/composition/root.test.ts`)*

**REQ-PACK-002**

- GIVEN a made-up retired map WHEN `add <retired id>` runs THEN it exits non-zero with `VALIDATION_ERROR` before any
  plan call, naming the successors, with the replace order first only where a first-party copy is installed; GIVEN
  `./packs/<id>`, `./node_modules/<id>` or a scoped spec THEN the map is not consulted.
  *(test: `test/cli/commands/add.test.ts`)*
- GIVEN the shipped map THEN no retired id is a catalog id or a folder under `packs/`. *(test: `test/pack/retired.test.ts`)*

**REQ-PACK-003**

- GIVEN no pack installed, or a catalog pack installed through its pin THEN `pack-catalog` reads `pass`; GIVEN a
  catalog-tier copy of other content THEN `warn` naming `add <id>`; GIVEN a first-party copy of a retired pack THEN
  `warn` naming the replace order; GIVEN a receipt that does not match its ledger row THEN the comparison is skipped and
  named; GIVEN any of these THEN `check` does not fail on the row. *(test: `test/cli/commands/check.test.ts`)*

**REQ-PACK-004**

- GIVEN Codex selected and a made-up pack past the cap WHEN `add` runs, `--dry-run` included THEN it exits 1 with
  `VALIDATION_ERROR` naming the pack, its share and the total, and the tree and ledger are unchanged; GIVEN a pack whose
  skills set `allow_implicit_invocation: false` THEN its share is 0; GIVEN a re-add THEN the installed copy is measured
  once; GIVEN no Codex THEN `fit` reads `applies: false`; GIVEN another installed pack already past the cap THEN the
  refusal's next opens on removing that pack with `clean --pack`. *(test, at `164b31d1`:
  `test/cli/engine/packFit.test.ts`, `test/cli/commands/add.test.ts`)*
- GIVEN the same over-cap pack installed past `add` WHEN `sync` runs THEN it refuses, and the total, the core's share and
  the pack's share it prints equal the ones `add`'s measure reads for that setup; neither refusal names narrowing the
  content selection. *(test, at `164b31d1`: `test/cli/engine/packFit.test.ts`, `test/pack/packEngineDefects.test.ts` C2,
  `test/adapters/codex.test.ts`)*

**REQ-PACK-005**

- GIVEN a setup that has not synced core skill `handoff` and a made-up pack shipping a skill of that id WHEN `add` runs
  on each of the five client sets THEN it refuses before writing, naming the core owner; GIVEN a pack skill in folder
  `st-verify` under another id, or a second pack's skill taking a first pack's folder THEN it refuses; GIVEN the same
  pack re-added THEN it installs. *(test: `test/pack/packEngineDefects.test.ts`, B6 to B9)*
- GIVEN a pack agent, skill or rule whose id a core artifact holds with no ledger row THEN `add` refuses it under
  `id collisions`, with no `sync` step in its next. *(test: `test/pack/packEngineDefects.test.ts` B10 to B12,
  `test/cli/commands/add.test.ts`)*

**REQ-PACK-006**

- GIVEN a content skill declaring `disable-model-invocation: true` WHEN projected THEN the key is top-level and absent
  from `metadata`; GIVEN `user-invocable: "no"` THEN `VALIDATION_ERROR` naming the file and the key; GIVEN a skill
  declaring neither THEN its bytes are unchanged; GIVEN a rule-skill THEN its head keys are exactly `description`,
  `metadata`, `name` and `user-invocable`, the last `false`. *(test: `test/emit/skillsProjection.test.ts`)*
- GIVEN a pack skill declaring `disable-model-invocation: true` with no `agents/openai.yaml` setting
  `policy.allow_implicit_invocation: false` THEN the lint fails. *(test: `test/packs/lint.test.ts`, lands in
  `u17-pack-suite`)*
- GIVEN a Claude-only scratch setup WHEN its `/` menu is opened THEN it lists 16 Stamity entries, the 9 commands and 7
  skills. *(judgment: the maintainer, at plan 018 file 2's close, where the menu takes its final shape)*

**REQ-PACK-007**

- GIVEN the package THEN `packs/frontend/` holds both skills with their `agents/openai.yaml`, each description at most
  250 characters, `content/skills/` holds neither, and `lookupCatalogEntry("frontend")` resolves at its generated pin.
  *(test: `test/packs/frontend.test.ts`, `test/corpus/census.test.ts`)*
- GIVEN `/st-work`, the qa skill, the design-quality agent, the UI-states rule and `ui.md` THEN each carries its
  conditional sentence and none its old unconditional one, and `/st-work` keeps 485 body lines and 871 characters before
  the cut. *(corpus: `test/corpus/commands/work.test.ts`, `test/corpus/skills/flow.test.ts`,
  `test/corpus/agents/specialists.test.ts`, `test/corpus/rules/quality.test.ts`)*

**REQ-PACK-008**

- GIVEN a temp corpus lacking both skills and a ledger holding their 1.16.0 rows WHEN `sync` runs THEN the unedited
  copies at both folders are deleted and named, a copy edited by one byte is kept and named as edited, a CRLF copy of
  the frozen bytes is deleted, a forged row recording an owner's own bytes keeps the file, and a second `sync` prints
  nothing; GIVEN `pack:frontend` rows THEN no notice; GIVEN a dry run THEN nothing is deleted and no notice prints.
  *(test: `test/cli/engine/movedPrune.test.ts`)*
- GIVEN the 1.14.0 release tree WHEN the running engine syncs it THEN the eight moved paths are reclaimed, four per
  folder. *(test: `test/emit/upgradeFrom1140.e2e.test.ts`)*

**REQ-PACK-009**

- GIVEN an overlay of a moved skill, with the pack absent and installed THEN the walk refuses with the one text; GIVEN a
  full override with the pack absent THEN it projects and the plan carries the stands-alone warning; GIVEN it with the
  pack installed THEN the planner refuses, naming the move; GIVEN `validate` THEN it exits 1 with the walk's text.
  *(test, at `3bd36771`: `test/content/catalog.test.ts`, `test/emit/plannerOverlay.test.ts`)*
- GIVEN no customization THEN `moved-skills` reads `pass`; an overlay THEN `fail`, through `check --json` with the
  drift gate failed; a full override, in its own folder or under another declaring the moved id, or a moved id's core
  ledger row THEN `warn`. *(test, at `3bd36771`: `test/cli/commands/check.test.ts`)*

**REQ-PACK-010**

- GIVEN a Next.js repository WHEN `init` prints its panel THEN the `next (framework)` row carries the pinned
  `add frontend` call once; GIVEN Next.js and React THEN the call prints once and the second row reads covered; GIVEN
  `frontend` installed, or a backend repository THEN no install line; GIVEN a catalog read that throws after the writes
  THEN no install line and exit 0. *(test, at `017834e1`: `test/cli/commands/initPanel.test.ts`,
  `test/cli/commands/init.test.ts`, `test/detect/stackSupport.test.ts`)*

**REQ-PACK-011**

- GIVEN a made-up pack carrying `${STAMITY:`, an `npx … stamity` call, a fenced line opening `stamity `, a registered
  verb, or a skill description of 251 characters THEN the lint fails on each; GIVEN a `.stamity/` path or a
  `stamity-<id>` name THEN it passes; GIVEN the `ops` or `product-audit` folder gone THEN its exemption fails.
  *(test: `test/packs/lint.test.ts`, lands in `u17-pack-suite`)*

**REQ-PACK-012**

- GIVEN the packs folder THEN the suite's pack ids equal `curatedPacks()`'s, and each pack passes the static checks
  and `add <id>`, `sync` and `check` at exit 0 on `["claude"]`, `["cursor"]`, `["codex"]`, `["copilot"]` and all four,
  every pack together on all four; GIVEN a made-up pack breaking each check THEN that check fails. *(test:
  `test/packs/packs.test.ts`, lands in `u17-pack-suite`)*

**REQ-PACK-013**

- GIVEN a temp tree with a pack holding a command, an agent, a rule and a skill THEN the coverage surface enumerates
  all four and a folder with no `pack.json` none; GIVEN a case sourced at `packs/<id>/skills/<dir>/SKILL.md:6-6` THEN
  the gate and the runner both admit it and its recall label is `<dir>`; GIVEN an exempted pack file deleted THEN the
  exemption check fails. *(test: `test/evals/coverage.test.ts`, `test/evals/locators.test.ts`)*

**REQ-PACK-014**

- GIVEN `docs/reference/packs.md` THEN its pack ids and "N packs." count are derived from `packs/`, each item line
  appears in its pack's block, and a skill shipping a support file counts once; GIVEN an item with no description THEN
  the render refuses. *(test: `test/cli/docs/referencePages.test.ts`)*

## References

- `docs/plans/018-packs-rebuilt-01.md` — the decisions, the declared defaults and the `## Spec delta` this spec merges.
- `.stamity/runs/2026-10-20_packs-rebuilt/` — its `record.md` (the sign-offs on `build/` and `review/` rows) and the
  units' and fixers' reports under `reports/`, whose spec-delta sections the "As built" lines take.
- `test`: each requirement names its suites above; once a test exists it is the normative record.
- `source`: `src/pack/curated.ts`, `src/pack/retired.ts`, `src/pack/moved.ts`, `src/pack/install.ts`,
  `src/pack/projection.ts`, `src/cli/commands/add.ts`, `src/cli/commands/check.ts`, `src/cli/engine/emissionWrite.ts`,
  `src/cli/engine/packFit.ts` and `src/adapters/codex.ts` (at `164b31d1`), `src/cli/commands/sync/report.ts`, `src/emit/skillsProjection.ts`,
  `src/emit/planner.ts` and `src/content/catalog.ts` (at `3bd36771`), `src/detect/stackSupport.ts` and
  `src/cli/commands/init/panel.ts` (at `017834e1`), `src/cli/docs/referencePages.ts`, `tsdown.config.mjs`,
  `scripts/generate-pack-manifests.mjs`, `scripts/eval/instrument.mjs`, `packs/frontend/`.
- Pages: `docs/troubleshooting.md` (the `pack-catalog` and `moved-skills` rows), `docs/customization.md` (a moved
  skill's overlay and override), `docs/packs-and-trust.md`, `docs/reference/packs.md`.

## Risks

- **Warning** — the moved skills' descriptions change their trigger text, and the probes measuring selection run only
  at the release eval (REQ-PACK-007). What bounds it: each new description keeps the old "Triggers when…" clause's
  terms, and the release run measures both select probes and their listings.
- **Warning** — `add` on a Codex setup now plans the core emission, so a setup whose planning already fails for an
  unrelated reason fails `add` with that planner error one verb earlier (REQ-PACK-004; `u4-pack-fit`'s report, M-1).
- **Minor** — `ops` and `product-audit` stay over the description cap until plan 018 file 2 deletes them; their
  exemption expires with their folders (REQ-PACK-011).
- **Minor** — Cursor's `/` menu and Codex's `$` list keep showing rule-skills: the hide works where the client honours
  `user-invocable` (REQ-PACK-006).

## Concerns

- REQ-PACK-002's command-level refusal is proven against an injected map; the shipped map is empty until plan 018
  file 2 fills it, so the first real retired id is that file's to prove end to end.
- REQ-PACK-004's fit check mirrors the residue planner's context-widening rather than calling it, since that function
  is private to `src/emit/planner.ts`; the equality case goes red if the two diverge (`u4-pack-fit`'s fixer report,
  its deferral). The dropped-rules warning in `src/adapters/codex.ts` still advises narrowing the content selection,
  which `sync` does not honour (that report's M-1, decision needed).
- REQ-PACK-011 and REQ-PACK-012 name suites `u17-pack-suite` lands; until then their criteria have no test, and the
  frontend pack's install is covered by `test/packs/frontend.test.ts` and a manual `add frontend` then `sync`
  (`u13-frontend-move`'s report), not by the install smoke, which lists three packs (`build/23`, to file 2).
</content>
