---
id: packs
# A design document, authored from docs/plans/018-packs-rebuilt-01.md on 2026-10-21 at the Prove phase of run 2026-10-20_packs-rebuilt, by its unit u18-spec-docs against the integration head 936350cb, amended from docs/plans/018-packs-rebuilt-02.md on 2026-10-22 in run 2026-10-21_packs-rebuilt-02, by its unit u18-spec against the integration head 67c36a63, and excluded from the site build.
# The records moved to the `records` branch on 2026-10-14; every path below that names this repository's own records — under `.stamity/runs/`, `.stamity/evidence/`, `.stamity/handoffs/`, `.stamity/inbox.md`, `docs/plans/`, `evals/runs/`, `evals/measurements/` or `evals/reach/` — reads on that branch (REQ-PROVE-023 in docs/specs/prove-behavior-and-value.md). A path of the run layout a consuming repository writes, such as `.stamity/runs/<run-id>/`, is the product's and is not one of them.
status: design
obsolete_when: every requirement below is pinned by a test or an eval case that names its id and the packs reference carries it, or a decision row cuts the surface
---
# Packs

What the pack engine does with the packs this package bundles, how a skill leaves the core for a pack, and what the
per-pack suite and lint hold. The area code is `PACK`. The change is Package 22's two files, which ship together in the
next minor after 1.16.0 with Package 20's cut; the cut flips `status: design`.

The requirement text comes from the `## Spec delta` of `docs/plans/018-packs-rebuilt-01.md` (REQ-PACK-001 to
REQ-PACK-014), with REQ-PACK-003 as the plan amended it at the build (ledger `review/23` of run
`2026-10-20_packs-rebuilt`), merged once by that run's unit `u18-spec-docs`. Where a unit's or fixer's report declared
a clause the delta is silent on, a line headed "As built" adds it; where the landed code differs from the delta, the
requirement states the code and the "As built" line says what moved. A ledger id (`review/12`, `build/3`) is that
run's own.

Every citation reads at the integration head `936350cb` unless it names a unit. Five changes landed beside the merge,
on their own lanes, and are cited by the unit and by file and symbol, never by a lane commit, since the integration
lane's cherry-pick gives each commit a new sha: `u4-pack-fit` with its fix round, `u15-moved-customizations`,
`u16-frontend-suggestion`, `u17-pack-suite` (`test/packs/packs.test.ts` and `test/packs/lint.test.ts`), and the
reference page's skill-count fix (`integrate/2`). Their code reads at the integrated branch's head. Citations into the
modules the run rewrote name the file and the symbol, as the plan's own cells anchor them; a citation of a content file
names its lines.

REQ-PACK-015 to REQ-PACK-024, and the text dated 2026-10-22, come from the `## Spec delta` of
`docs/plans/018-packs-rebuilt-02.md` (Package 22's second file, run `2026-10-21_packs-rebuilt-02`), merged once by that
run's unit `u18-spec`: it adds the `production` pack, `/st-ui-review` and the detector's fixes in `frontend`, and
retires `ops`, `product-audit` and `scaffold` behind the retired-names map. A modified requirement states what the tree
holds now, and a bullet headed "Amended 2026-10-22" says what moved and what it read. Where a unit's report or a
sign-off in that run's record declared a clause the delta is silent on, a line headed "As built" adds it; a ledger id
in that text (`review/17`, `build/3`) is that run's own. Every citation in that text reads at the integration head
`67c36a63`; the units' lane commits got new shas when the integration lane picked them, and the integration branch was
rebased once onto `main`, so a citation names the unit and the file, never a lane commit.

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
  a symbolic link, each with `CONFIG_ERROR` naming it (the tarball smoke's walk refuses the same, `review/48`), and
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
  holds every pack at the release version (`u17-pack-suite`).
- **Source:** `src/pack/curated.ts`, `scripts/generate-pack-manifests.mjs`, `tsdown.config.mjs`.

### REQ-PACK-002 — Retired pack names point at their successors and are never reused

Given a retired-names entry for `<id>` (`src/pack/retired.ts`, a typed constant), When `stamity add <id>` names it as
a bare id the catalog lacks, Then it refuses before any plan with `VALIDATION_ERROR`, naming the release that retired
it, where each of its parts went, `add <successor>`, and `./node_modules/<id>` as the way to install a package of that
name on purpose; a path or scoped spec, and a local or npm pack whose manifest is named `<id>`, resolve as today. Given
the shipped `RETIRED_PACKS`, Then it holds three entries, `ops`, `product-audit` and `scaffold`, each
`lastShippedIn: "1.16.0"`, mapping every part its 1.16.0 manifest lists to a successor, or to `null` with a note; no
`packs/<retired id>/` folder remains, and a test proves the refusal end to end for each of the three ids. A test holds
no retired id in the catalog and no `packs/<retired id>/` folder.

- **Amended 2026-10-22** (plan 018 file 2, units `u8-retire-old-packs` and `u13-retired-map`): the map, which read "a
  typed constant, empty in this file", holds the three entries (`RETIRED_PACKS`, `src/pack/retired.ts:52-119`). `ops`:
  `/st-release` and `st-release-runbook` → `production` `st-release`; `/st-incident-response`, `st-incident-runbook` and
  `stamity-incident-responder` → `production` `st-incident`; `stamity-devops`, `st-ci-pipeline`, `st-containerize` and
  `st-gh-agentic-workflows` dropped, each with its note. `product-audit`: `/st-product-audit` and
  `stamity-epic-audit-frame` → `production` `/st-production-review`; `/st-benchmark` and `st-perf-audit` dropped, the
  core performance agent covering per-change cost. `scaffold`: `/st-design-system-create` → `frontend`
  `st-design-system-detect`, which proposes a minimal token set where none is found (REQ-PACK-022); `/st-slo-scaffold`
  and `/st-auth-scaffold` dropped. So `add ops` and `add product-audit` name `add production`, and `add scaffold` names
  `add frontend`. The successors are read in part order, each once (`retiredSuccessorPacks`, `:129-137`).
- **As built:** the message is `describeRetiredPack`'s line, `pack "<id>" was retired after <ver>: <part> → <pack>
  <name>; <part> → dropped (<note>); …`, a part moved into the core reading `→ core <name>`
  (`src/pack/retired.ts:139-152`; amended 2026-10-22, it read `:64-77`, the lines the filled map moved); its why is "a
  retired name is never reused". Its next leads with the repository's
  replace order (`replaceSteps`: `clean --pack <id>`, each kept client copy deleted, `sync`, then `add <successor>` per
  successor pack, then `sync`) only where a first-party copy of that id is installed, and otherwise names
  `add <successor>` per successor; `add ./node_modules/<id>` closes it (`retiredPackRefusal`,
  `installedFirstPartyCopy`, `src/cli/commands/add.ts`; `review/22`, `review/24`). The map is read through the engine
  registry, `engine.pack.retired.RETIRED_PACKS`, so a command-level test injects one (`review/21`); a spec starting
  with `@` never consults it.
- **Proof:** `test/pack/retired.test.ts` (among its cases, "retires ops, product-audit and scaffold, each last shipped
  in 1.16.0", "maps every part its 1.16.0 manifest listed, once each" and "gives every dropped part a note saying why"),
  `test/pack/installSmoke.e2e.test.ts` ("refuses add %s, a retired id, naming add %s, and writes nothing", the real bin
  and the real map, one case per id; `u13-retired-map`), `test/cli/commands/add.test.ts` ("add — retired pack names").
- **Source:** `src/pack/retired.ts`, `src/cli/commands/add.ts`.

### REQ-PACK-003 — `check` reports a retired or stale catalog pack

Given `stamity check`, Then a `pack-catalog` row reads `pass` with no pack installed, or with each installed catalog
pack's content matching its bundled pin, judged from the receipt's file hashes and never from the version; `warn` for
an installed first-party copy of a retired pack (installed from the catalog, or from a path or npm with content a
retired release shipped), naming where its parts went and the fix in the repo's replace order (`clean --pack <id>`, each
kept client copy deleted, `sync`, then `add <successor>`, then `sync`), and for an installed catalog pack whose content
no longer matches the bundled copy, naming `add <id>`. Any other path or npm pack is not judged, and the row never fails.
Given the shipped map, Then each entry's `pins` holds the aggregate content SHA of every first-party copy a release
shipped (`src/pack/retired.ts:34-39`), so a copy an earlier `add ops`, `add product-audit` or `add scaffold` installed
reads `warn` on `pack-catalog`, naming where its parts went and the replace order with `add <successor>`; a test proves
each with the real map.

- **Amended 2026-10-22** (plan 018 file 2, unit `u13-retired-map`): the retired copies the row recognises are real ones.
  The map holds nine pins, each the aggregate of a copy a release tag's `src/pack/catalogPins.ts` held for the id:
  three for `ops` (v1.0.0; v1.0.1 to v1.11.0; v1.12.0 to v1.16.0), four for `product-audit` (v1.0.0; v1.0.1 and
  v1.1.0; v1.2.0 to v1.14.0; v1.15.0 and v1.16.0) and two for `scaffold` (v1.0.0; v1.0.1 to v1.16.0)
  (`RETIRED_PACKS`, `src/pack/retired.ts:52-119`). The unit's review and its security lens compared them against
  every release tag's catalog pins (the run's record, the `u13` review and security entries).
- **As built:** the row is `checkPackCatalog`, registered after `pack-reach` and before `model-pins`
  (`src/cli/commands/check.ts`). Its pass reads "no installed pack is recorded in the ledger", or "<n> catalog pack(s)
  match the copy this release bundles", adding "<n> pack(s) from a path or npm not judged" where any is; a receipt whose
  bytes do not match its ledger row is not compared and adds `Content not compared for pack "<id>" (<reason>).`
  (`readVerifiedReceipt`, `installedCopyOf` and `isFirstPartyRetiredCopy`, which the row and `add` share,
  `src/cli/commands/add.ts`). `docs/troubleshooting.md` carries the row in its doctor sample and its table.
- **Proof:** `test/cli/commands/check.test.ts` ("check — pack-catalog", and "reads the retired map through the engine
  registry when run as a doctor row"; with the real map, "warns on every first-party copy of retired %s a release
  shipped, with the real map", which also holds each id's pins equal to its shipped copies' aggregates,
  `u13-retired-map`); `test/docsPages.test.ts` (the doctor table's row set).
- **Source:** `src/cli/commands/check.ts`, `src/cli/commands/add.ts`.

### REQ-PACK-004 — `add` checks that a pack fits Codex's skills list before it writes

Given Codex selected, When `stamity add <spec>` plans a pack, Then before any write, `--dry-run` included, it measures
the list Codex would show with the pack in it, an installed copy of the same id replaced, through the one function
`sync`'s refusal counts with (`measureCodexSkillsList`), and past 8,000 characters refuses with `VALIDATION_ERROR`,
exit 1, naming the pack, its share and the total; a pack whose skills each ship `allow_implicit_invocation: false` adds
nothing, a setup without Codex is not measured, and the receipt is unchanged; `sync`'s refusal keeps its total, cap and
share sentences and no longer advises narrowing the content selection, as REQ-PROVE-004 states.

- **As built (`u4-pack-fit`):** the refusal is a fourth part beside collisions, name clashes and left-behind files,
  reading `pack "<id>" does not fit Codex's skills list: its <k> skill(s) add <n> characters, <t> of 8,000`, digits
  grouped (`src/cli/commands/add.ts`). Its next shortens the pack's descriptions, marks a skill explicit-only, or sets
  `ruleDelivery: "always-on"`; where another installed pack holds a share it also names `clean --pack <that pack>`, the
  largest, first where the setup is past the cap without the incoming pack and otherwise after the pack's own remedies
  (`fitPart`, `src/cli/commands/add.ts`); neither `add`'s refusal nor `sync`'s advises narrowing the content
  selection any more, since `sync` plans the full corpus every run (`review/32`, `build/26`). The plan stages the pack
  in place of an installed copy of its id (`StagedPack` and `resolveInstalledPackContent`'s `opts.staged`,
  `src/pack/projection.ts`), and `add` and `sync`'s residue planner measure through one helper, the same shown rows
  and attribution from the same inputs (`measureCodexSkillsListFor`, `src/adapters/codex.ts`; `planPackFit`,
  `src/cli/engine/packFit.ts`, given `sync`'s selection and installation identity; `review/31`, `review/33`).
  `add --json`'s `planned.fit` carries the measure, `{ codex: { applies: false } }` without Codex, and is `null` only
  where another part already refuses and the staged emission cannot be planned.
- **As built (plan 018 file 2, units `u11-release-skill` and `u12-incident-skill`):** the `production` pack's two
  skills, `st-release` and `st-incident`, each ship the hiding companion, so the pack's share of Codex's list is 0 and
  `production` fits wherever the core does (REQ-PACK-019, REQ-PACK-020); each suite measures the shown rows with and
  without the companion (`test/packs/productionRelease.test.ts`, "adds no character to Codex's shown skills list, where
  the same rows without the companion count"; `test/packs/productionIncident.test.ts`, "adds no row to Codex's shown
  list, and would add one without its companion (REQ-PACK-004)"). REQ-PACK-004's text is unchanged.
- **Proof (`u4-pack-fit`):** `test/cli/engine/packFit.test.ts` (among its cases, "measures the total, the core's share
  and the pack's that sync's refusal prints for the same setup"), `test/cli/commands/add.test.ts` ("add — the Codex
  skills-list fit (REQ-PACK-004)", and "names removing the installed pack first when another pack already takes the list
  past 8,000"), `test/adapters/codex.test.ts` (the `measureCodexSkillsList` pin, and the refusal pins with no narrowing
  step), `test/pack/packEngineDefects.test.ts` (C2 through `installBypassingAdd`, C3).
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
- **As built (plan 018 file 2, unit `u6-scoped-pack-id`):** when another installed pack's folder is gone, its catalog
  ids are re-derived from its ledger rows' paths read past the whole owner id, the prefix rule `clean` and the
  projection use, so a scoped pack id such as `@acme/other` claims its ids too; a row whose artifact id lacks its
  owner's prefix keeps the first-slash split (`packRelPathOf`, called by `claimedCatalogIds`, `src/pack/install.ts`).
  Proof: `test/pack/install.test.ts` ("refuses a pack whose id another installed SCOPED pack claims, its folder gone",
  "reads a scoped pack row's id when no other layer holds it", "reads a pack row whose artifact id lacks its owner's
  prefix by the first slash").
- **As built (plan 018 file 2, unit `u13-retired-map`, sign-off `build/3`):** `sync`'s same-class clash remedy re-adds
  a pack by what its id resolves to. A catalog id keeps `add <id>`, the catalog read first, so a fork's own
  `packs/<retired id>` re-adds as before; a retired id names `add <successor>` per successor pack and re-adding a pack of
  one's own by its path (REQ-PACK-023); any other id, a pack added from a folder or an npm package, names
  `add <its folder or package path>`, since a bare id re-adds only a catalog pack or an npm package of that name. A
  catalog read that throws keeps `add <id>`, so the catalog's error never replaces the clash's diagnosis (`reAddStep`
  and `isCatalogId`, called by `remedyOf`, `src/emit/planner.ts`). Proof: `test/pack/upgradeRemedy.test.ts` ("the
  clash remedy's re-add step, by what the owner's id resolves to"), `test/emit/plannerNameClash.test.ts` ("keeps add
  <id> when the catalog read throws, rather than replacing the clash diagnosis", and `ACME_REMEDY`, the path re-add
  for a pack installed from a local folder, which "composeEmissionPlanner — an installed cross-class name clash" pins).
- **Proof:** `test/pack/packEngineDefects.test.ts` (B6 to B12, B6 on the five client sets, each red on the code before
  it), `test/cli/commands/add.test.ts` (the two-command clash and the two id-collision cases), `test/pack/install.test.ts`.
- **Source:** `src/content/catalog.ts`, `src/pack/install.ts`, `src/cli/commands/add.ts`.

### REQ-PACK-006 — Two client keys pass through, and rule-skills leave the `/` menu

Given a core or pack skill declaring `user-invocable` or `disable-model-invocation`, Then each projects as a top-level
key, never hoisted under `metadata`, and a value that is not a boolean is refused naming the file and the key; a lint
fails a skill declaring `disable-model-invocation: true` that ships no `agents/openai.yaml` setting
`policy.allow_implicit_invocation: false`. Every rule-skill takes `user-invocable: false` from its class, no `content/`
line moving; the Claude touchpoint commands carry no `disable-model-invocation` and `st-unattended` stays in the menu,
so a Claude-only setup with no pack installed lists 17 Stamity entries in its `/` menu, the 9 commands and 8 skills,
the core `/st-plain` among them (REQ-FLOW-129 in `docs/specs/everyday-flows.md`).

- **Amended 2026-10-22** (plan 018 file 2, unit `u9-st-plain`): the menu count, which read "16 Stamity entries, the 9
  commands and 7 skills", moves with the core's eighth skill, `content/skills/st-plain/SKILL.md`, which declares
  neither key; `test/corpus/census.test.ts` counts eight core skills ("skills: exactly the eight procedures"), where it
  counted seven. The two keys, the lint, the rule-skills' hiding and `st-unattended`'s place are unchanged.
- **As built:** `PASSTHROUGH_KEYS` keeps the two keys after `description` when their value is a boolean; any other value
  throws `VALIDATION_ERROR` reading `` <file>: `<key>` must be true or false, got <json>. `` (`assertPassthroughKeys`,
  called by `toSpecFrontmatter`, `src/emit/skillsProjection.ts`). `projectRuleAsSkill` writes `user-invocable: false` in
  every rule-skill head. A head declaring neither key emits the bytes it did. The pack lane borrows the same function,
  so a pack skill is held the same way (`src/pack/projection.ts`). An override or pack skill that wrote either key as a
  string, which emitted before, now stops `sync` (`build/2`). `add` runs the same check on each pack `SKILL.md` it
  reads (`readPackArtifacts`, `src/pack/install.ts`), naming the same pack-relative path, so it never installs a pack
  skill head that `sync` would refuse (`review/46`).
- **Proof:** `test/emit/skillsProjection.test.ts` ("the two client keys", and the rule-skill head case),
  `test/pack/projection.test.ts`, `test/corpus/census.test.ts` (eight core skills); `add`'s refusal is
  `test/pack/packEngineDefects.test.ts` (group F); the lint is `test/packs/lint.test.ts` (`u17-pack-suite`).
- **Source:** `src/emit/skillsProjection.ts`, `src/pack/install.ts`.

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
removed or kept and the pinned `add frontend` call; with `frontend` installed its copies stand at those paths and none
is kept.

- **As built:** the frozen digests are `MOVED_CORE_SKILLS`, each moved skill `pack: "frontend"`, `since: "1.17.0"`, read
  at exactly `<folder>/st-<id>/<file>` for `.agents/skills` and `.claude/skills` (`movedRenderingAt`,
  `src/pack/moved.ts:47-86`); `engineRenderingsFor` adds them only for a client-owned skill row of a moved id the
  running corpus no longer holds (`src/cli/engine/emissionWrite.ts`). The notice is one line per skill,
  `` moved: skill st-<id> left the core for the frontend pack in 1.17.0; its copies were <outcomes>. To keep it:
  `<pinned call> add frontend` ``, the call pinned as `check`'s `moved-skills` row pins it (`packageCommand`,
  `review/47`), its outcomes `removed: <paths>`; `kept — edited since sync wrote it; delete by hand: <paths>` (a copy
  whose every row records the frozen digest); `kept — its ledger row does not record the last core rendering; delete
  it by hand only if it is yours to remove: <paths>`; and `left in place — the sweep refused the path as unsafe to touch,
  for the reason the reclaim report gives: <paths>` (`movedSkillLines`, `src/cli/commands/sync/report.ts`; `review/9`,
  `review/10`). It prints on a live run only, and a removed or kept copy's row leaves the ledger, so the next `sync`
  prints nothing. This repository's own `sync` at `936350cb` printed the notice for both skills and removed their four
  tracked copies.
- **The upgrade order, as built (`review/45`):** on a setup 1.16.0 synced, `add frontend` before the first `sync` is
  refused: the client rows of the moved ids still claim them and no layer supplies them, so `collectCollisions`
  (`src/pack/install.ts`) gives the paths kind and `collisionPart` (`src/cli/commands/add.ts`) names the order. The
  order is `sync`; delete by hand each copy a `moved:` line names as kept, unless it is yours, then move it aside; `add
  frontend`; `sync`. The pack's copies then stand at those paths. A kept copy left in place is a file no ledger row
  owns at a path the pack's projection writes, so that last `sync` writes every other copy, refuses that file by name
  and exits 1; once it is gone, the next `sync` writes the pack's copy. The change log's Upgrading block states the same
  order.
- **Proof:** `test/cli/engine/movedPrune.test.ts` (seventeen cases, the forged-row and symlinked-folder cases among them,
  and "the upgrade order from 1.16.0", which runs `add`, `sync`, `add`, `sync`, `sync` through the commands over the
  four `.claude/skills/` rows 1.16.0 wrote, one copy edited), `test/emit/upgradeFrom1140.e2e.test.ts` (eight reclaims
  from the 1.14.0 tree).
- **Source:** `src/pack/moved.ts`, `src/cli/engine/emissionWrite.ts`, `src/cli/commands/sync/report.ts`.

### REQ-PACK-009 — An override or overlay of a moved skill is named, and `check` reports it

Given an overlay of `design-system-detect` or `browser-evidence` under `.stamity/overrides/skills/`, Then `sync`,
`check`'s drift gate and `validate` refuse it with `VALIDATION_ERROR` whose text names the move and the
`add frontend` call, with or without the pack (REQ-OVERLAY-009); a full override warns on `sync`, dry run included, that
it now stands alone, and with the pack installed the planner's refusal names the move. A `moved-skills` row of `check`
reads `fail` for such an overlay, `warn` for a full override or a moved id's core ledger row, and `pass` otherwise.

- **As built (`u15-moved-customizations`):** the refusal reads `skill "<id>" moved from the core to the <pack> pack in
  <since>, and overlays on pack skills are not applied. Fold your change into a full override under another id, or
  remove <path>; to keep the shipped skill, <remedy>.`, each half named by its POSIX path
  (`refuseMovedSkillOverlay`, `src/content/catalog.ts`); `<remedy>` is the pinned call in backticks, `` `<pinned call>
  add <pack>` ``, which the planner (`sync`, `check`'s drift gate) and `validate` pass to the index build
  (`BuildContentIndexOptions.remedyCall`, `review/47`), and `stamity add <pack>` only where a caller passes none. A
  skill of a moved id supplied by another pack keeps the pack-skill text, and a fork-stage patch of a moved skill stays
  a skip, its reason naming the move, the pack and the same `<remedy>` (`forkMovedSkillSkipReason`). The warning reads
  `` your override <path> replaced a core skill that moved to the <pack> pack; it now stands alone and tracks no
  shipped copy. Keep it, or remove it and run `<pinned call> add <pack>`. `` (`movedSkillOverrideWarnings`,
  `src/emit/planner.ts`).
  `checkMovedSkills` sits after `pack-catalog`, reads the override folder and the ledger directly so it answers when
  the plan throws, finds a full override by the id it declares, as the index does, and with the pack installed names
  the collision and `clean --pack <pack>` (`src/cli/commands/check.ts`).
- **Proof (`u15-moved-customizations`):** `test/content/catalog.test.ts` (its `validate` case is "REQ-PACK-009 —
  `validate` carries the moved-skill refusal unchanged"), `test/emit/plannerOverlay.test.ts` (the planner's refusal
  with the pinned call, `review/47`),
  `test/cli/commands/check.test.ts` ("check — moved-skills").
- **Source:** `src/content/catalog.ts`, `src/emit/planner.ts`, `src/cli/commands/check.ts`.

### REQ-PACK-010 — `init` suggests the `frontend` pack where a front-end framework is detected

Given a detected Next.js, React, Vue, Svelte, SvelteKit, Nuxt, Angular, Astro, Remix, SolidStart, TanStack Start or
Qwik stack, When `init` prints its stack suggestions, Then a row names the `frontend` pack with its pinned
`add frontend` line, once however many of those stacks are detected; a pack id `add` cannot resolve is never offered,
no row offers a pack the ledger already records as installed, and `init` installs nothing.

- **As built (`u16-frontend-suggestion`):** `STACK_PACK_CATALOG` maps the twelve subjects, read from
  `FRAMEWORK_SUBJECTS`, to `frontend`, and `resolvableStackPacks` keeps the ids the catalog resolves that no `pack:<id>`
  ledger owner holds (`src/detect/stackSupport.ts`; `offeredStackPacks`, `src/cli/commands/init.ts`). The first row
  offering a pack leads the block, so the panel's three-row cap never cuts it, and reads `<subject> (framework) —
  Install the frontend pack: <pinned call> add frontend`; a later row naming the same pack reads "covered by the
  frontend pack above" (`stackSuggestionLines`, `src/cli/commands/init/panel.ts`). A catalog or manifest that cannot be
  read after the writes offers no pack and `init` still exits 0.
- **Proof (`u16-frontend-suggestion`):** `test/detect/stackSupport.test.ts` ("STACK_PACK_CATALOG and
  resolvableStackPacks (REQ-PACK-010)"), `test/cli/commands/initPanel.test.ts` ("renderInitPanel — the frontend pack
  suggestion (REQ-PACK-010)"), `test/cli/commands/init.test.ts`.
- **Source:** `src/detect/stackSupport.ts`, `src/cli/commands/init.ts`, `src/cli/commands/init/panel.ts`.

### REQ-PACK-011 — The pack lint

Given any file under `packs/`, made-up fixture packs included, Then the lint fails on text opening `${STAMITY:`,
well-formed or not, and on a CLI call (`npx … stamity`, `@zomarit/stamity`, a fenced line or table cell opening on
`stamity `, or `stamity <verb>` for a registered verb), never on a `.stamity/` path or a `stamity-` id; and it holds
every pack skill's description to at most 250 characters, `production`'s and `frontend`'s included, with no pack
exempt, while a made-up pack over the cap still fails.

- **Amended 2026-10-22** (plan 018 file 2, unit `u8-retire-old-packs`): the cap's exemption is gone. It read "`ops`
  and `product-audit` exempt through an entry that fails once that pack's folder is gone"; with both deleted,
  `RETIRING_PACKS` and its expiry cases left `test/packs/lint.test.ts`, and the exemption's mechanism keeps only its
  made-up case with an empty default ("exempts a pack from the cap only by its name, and none by default"). The
  `${STAMITY:` and CLI-call bans and the companion rule are unchanged.
- **As built:** the lint holds REQ-PACK-006's companion rule in both directions: a skill declaring
  `disable-model-invocation: true` ships an `agents/openai.yaml` setting `policy.allow_implicit_invocation: false`, and
  an `agents/openai.yaml` setting `policy.allow_implicit_invocation: false` sits only beside a skill declaring
  `disable-model-invocation: true`, so Codex's list and the other clients agree (`explicitOnlyCompanions`,
  `test/packs/lint.test.ts`). `production`'s `st-release` and `st-incident` are the first pack skills to declare it.
- **Proof:** `test/packs/lint.test.ts` (`u17-pack-suite`; each probe with a made-up pack that makes it fail; "holds every
  pack skill's description to 250 characters, with no pack exempt", `u8-retire-old-packs`).
- **Source:** `test/support/packFixtures.ts` (the shared made-up-pack helper `u17-pack-suite` extends).

### REQ-PACK-012 — One per-pack suite proves every pack

Given `test/packs/packs.test.ts`, Then it enumerates the packs from `packs/*/pack.json`, equal to the catalog's ids, and
in-process holds each to a valid manifest at the release version, its integrity map in both directions, the installer's
ingress gates, the frontmatter contract, names unique across the core and every pack, and cross-references resolved
against the core and every pack; then `add <id>` by catalog id, `sync` and `check` exit 0 on the five client sets and
with every pack on all four clients, each check shown red on a made-up pack first. It holds `frontend` and
`production` with no class exemption. `ops.test.ts`, `product-audit.test.ts` and `scaffold.test.ts` left with their
packs, and no suite reads a retired pack; the per-pack suites beside it are `test/packs/frontend.test.ts` and the
`production` pack's three, `test/packs/production.test.ts`, `productionRelease.test.ts` and
`productionIncident.test.ts`.

- **Amended 2026-10-22** (plan 018 file 2, units `u1-refixture-pack-tests`, `u2-refixture-cli-tests`,
  `u8-retire-old-packs` and `u10-production-review`). It read: "the scaffold suite's resolver widened the same way",
  and "The per-pack suites stay beside it: `test/packs/ops.test.ts`, `test/packs/product-audit.test.ts` and
  `test/packs/scaffold.test.ts` until their packs leave, and `test/packs/frontend.test.ts`, whose pack is not retiring,
  for good." The three suites are deleted; the enumeration case holds the exact list
  (`expect(PACK_IDS).toEqual(["frontend", "production"])`, "enumerates the packs from packs/*/pack.json, equal to the
  catalog's ids"), and the class rule's case reads "ships first-party classes only, with no pack exempt". The pack and
  CLI suites that read a real old pack moved each case to `frontend` or to a made-up pack built inline, each with a
  `TEST CHANGE, justified:` note, and the install smoke derives its pack list from `packs/` ("lists every pack folder the
  checkout ships, each with the classes its integrity map names", `test/pack/installSmoke.e2e.test.ts`). The five
  client sets and the every-pack run are unchanged.
- **As built, before the suite:** the scaffold suite's cross-reference resolver already read every bundled pack
  (`listBundledPackIds`, unit `u13-frontend-move`); the generic suite carries it, and it left with that suite.
- **As built:** the suite's static checks hold four rules more, each red on a made-up pack: a first-party pack ships
  only commands and skills, with no exemption since the retiring packs left (`classProblems`; amended 2026-10-22, it
  read "the retiring packs exempt by name while their folders exist, each exemption red once its folder is gone
  (`classProblems`, `RETIRING_PACKS`; `ops` ships agents, `product-audit` a rule)"); no artifact head and no manifest
  carries a `floor:` tag or marker (`floorProblems`); no path or byte a pack ships matches one of the leak gate's
  reserved-name rules, read from the gate (`reservedNameProblems`); and no pack folder takes a retired id
  (`lookupRetiredPack`, "holds no retired id among the pack directories"). Its frontmatter check also fails a
  description that addresses the reader (`test/packs/packs.test.ts`).
- **Proof:** `test/packs/packs.test.ts` (`u17-pack-suite`; the enumeration and class cases as amended),
  `test/pack/installSmoke.e2e.test.ts`, `test/pack/curated.test.ts` ("derives the repository's own catalog from its
  packs folder").
- **Source:** `test/support/packFixtures.ts`.

### REQ-PACK-013 — The eval surface takes in `packs/`

Given the eval gates and the runner, Then the coverage gate enumerates each pack's commands, agents, rules and skills
beside `content/`, a case may source a file under either, the locator gate checks a block naming a pack file, the
runner admits a pack source and holds `packs` to its clean tree, a pack skill's probe takes its folder as its recall
label, and `evals/SET-v7.md` and `evals/README.md` name the surface; no row of `evals/coverage-exemptions-v6.md` names
a file under `packs/ops/`, `packs/product-audit/` or `packs/scaffold/`, and every artifact of `frontend` and
`production` is sourced by a case, none exempt (REQ-PACK-024); the two moved skills' select probes source their
`packs/frontend/` copies.

- **Amended 2026-10-22** (plan 018 file 2, units `u8-retire-old-packs`, `u14-production-cases` and
  `u15-frontend-plain-cases`). It read: "each of the sixteen artifacts of `ops`, `product-audit` and `scaffold` carries
  a dated exemption row that fails once its folder is gone". The sixteen rows left with the folders, and the file says
  so in a dated paragraph; the five rows the new artifacts added while their cases were pending (`u3`, `u9`, `u10`,
  `u11`, `u12`) left in the changes that landed those cases, and the file opens "No exemptions remain."
  (`evals/coverage-exemptions-v6.md:1-32`; the gate's "accounts for every artifact even when no exemption remains",
`test/evals/coverage.test.ts`). The runner's admission, the recall labels and the moved skills' select
  probes are unchanged.
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
  `agents/openai.yaml` is not a skill (`isSkillItemFile`, `integrate/2`).
- **Proof:** `test/cli/docs/referencePages.test.ts`.
- **Source:** `src/cli/docs/referencePages.ts`.

### REQ-PACK-015 — The `production` pack reviews one service at one commit

Added 2026-10-22 (plan 018 file 2, unit `u10-production-review` with its two fix rounds, and the seams round).

Given `packs/production/`, Then it ships `/st-production-review`, which reviews one named service at one commit over
security, supply chain and operations through 19 checks with pack-local ids `pr-sec-01`..`06`, `pr-sup-01`..`06` and
`pr-ops-01`..`07`; eight block: `pr-sec-01` advisories, `pr-sec-02` credentials in tree and history, `pr-sec-03`
access checks, `pr-sec-04` input validation and injection sinks, `pr-sup-01` pinning, `pr-sup-02` CI privilege,
`pr-ops-01` a named owner and on-call route, `pr-ops-04` a rollback path. `add production` resolves through the catalog.

- **As built:** the check table is one row per check with its area, the check that already decides it, `Blocks`,
  `Attest` and a CRA column (`packs/production/commands/st-production-review.md:40-76`). Nine rows are decided outright
  by a verify axis check (`sec-`, `rel-`, `enh-` ids); `pr-sup-03` and `pr-sup-04` by the pack's own release record;
  `pr-sec-02` by the review's own scan of the tree and the history, the axis's `sec-credential-literals` deciding the
  diff only; the rest by own evidence. Two blocking checks carry `Attest` (`pr-ops-01`, `pr-ops-04`): evidence can show
  the thing exists, only a named person can say it works. Every row ends with a status, `pass` / `fail` / `skipped` /
  `not-applicable`, and a `skipped` row is never a pass (`:73-76`). The pack ships the command and two explicit-only
  skills, `st-release` and `st-incident`, and no agent or rule; its manifest declares the four clients, the footprint
  `read`, `edit`, `execute`, `network`, `spawn`, and the write paths its three bodies claim (`packs/production/pack.json`).
- **Proof:** `test/packs/production.test.ts` ("lists the 19 pack-local ids in order, across the three areas", "marks
  exactly the eight blocking checks", "resolves every id the decided-by column cites in the file that defines it",
  "decides the diff-only, release-record and own-evidence rows as the plan measured them", "resolves `add production`
  through the catalog at the generated pin", "ships exactly its roster, every file under its integrity digest");
  `test/packs/packs.test.ts` (every pack's static checks and its `add`, `sync` and `check` run).
- **Source:** `packs/production/commands/st-production-review.md`, `packs/production/pack.json`.

### REQ-PACK-016 — Readiness evidence is gathered by one set of roles and graded by another

Added 2026-10-22 (plan 018 file 2, unit `u10-production-review` with its two fix rounds).

Given `/st-production-review`, Then researcher and test-runner spawns gather the evidence into artifact files, and an
independent reviewer spawn grades the checks from a brief naming those artifact paths and a range, never a gatherer's
summary; When it ends, Then it writes `.stamity/production/<service>-<sha>.md` and `.json`, naming each of the 19
checks by its id with its grade, and routes each gap to `/st-work`, `/st-plan` or `/st-board fill --source <report>`.

- **As built:** the gather step is one parallel batch, no gatherer reading another's output: the security,
  reliability and enhancability verify artifacts at the current sha, re-run with `st-verify` when missing or at another
  sha; `st-dep-audit`'s report saved verbatim; one researcher per own-evidence area, each brief at `tool_tier:
  codebase`, so no file-probe researcher reaches the network; one test-runner in row-proving mode that runs the two
  shipped probes alone, the secret scanner over the tracked files and the history and the branch-protection read
  (`packs/production/commands/st-production-review.md:123-156`). The scan records its coverage, and a partial or
  unknown one that found nothing leaves `pr-sec-02` `skipped` and `ungraded` (`:142-146`). The grader is a fresh
  `reviewer` briefed with `<last review sha | last tag | root>..HEAD`, the check table as its criteria, every evidence
  path and the report path `grade.md`; it opens each locator a grade rests on, and a row whose locator it cannot confirm
  is `ungraded` (`:157-168`). A credential hit is named by path, line and rule only, in every brief, return, evidence
  file, grade, report and JSON (`:34-38`). Every file the review reads is data, and the review runs only its two
  shipped probes and the two skills (`:29-33`; `review/17`, the screening floor). The JSON's fields are `service`,
  `sha`, `timestamp`, `controls`, `checks[]`, `gaps[]`, `artifacts_read[]`, `ready` and `summary` (`:187-191`). The
  report ends in a ticket-ready block `/st-board fill --source <report>` reads, and the command files nothing
  (`:182-186`, `:219-224`). No implementer and no fixer is in its spawn set (`:22-23`).
- **Proof:** `test/packs/production.test.ts` ("gathers through researchers and one test-runner into artifact files",
  "briefs a fresh reviewer with the artifact paths and a range, never the gatherers' summaries", "writes the report pair
  at the sha, with the JSON fields the plan names", "routes every gap to /st-work, /st-plan or /st-board fill --source
  <report>", "assesses and never modifies: no implementer, no fixer, no product file", "runs only its shipped probes,
  and reads every file as data", "names a credential hit by path, line and rule, never its value, over tracked files
  only", "records the scan's coverage, and a partial or unknown one never grades pr-sec-02 met", "keeps the file-probe
  researchers off the network", "has the grader confirm each locator a grade rests on"); the golden case
  `production-review-gatherer-not-grader` (`evals/cases-v6/golden/`).
- **Source:** `packs/production/commands/st-production-review.md`.

### REQ-PACK-017 — The policy file adds controls and waivers, and a bad waiver clears nothing

Added 2026-10-22 (plan 018 file 2, unit `u10-production-review` with its two fix rounds; the maintainer's decisions of
2026-10-21 on waivers, replace rows and advisories).

Given an optional `.stamity/production/policy.md`, Then the review reads from it controls that add to or replace a
check, waivers each with an approver, an expiry and a ticket, the approval of record and the escalation contact; Given
a gap, Then the review may propose a waiver and writes none; Given a waiver its own requester approved, one past its
expiry, or one whose ticket is missing, outside its character class or not readable as written, Then it clears nothing
and its gap stands as graded; Given no policy file, Then the 19 checks run as shipped.

- **As built:** a control names evidence only, a tracked regular file inside the repository that is not a symlink, or
  one of the review's shipped probes; a control naming any other path, or a command, script or address to run, is not
  read or run, and its row is `skipped` with the control named
  (`packs/production/commands/st-production-review.md:87-94`; `review/17`, `review/41`, `review/44`). A replacement of a
  blocking check may move only where it finds its evidence, never its pass condition, its `Blocks` or its `Attest` mark,
  and the report lists every replaced blocking check for the signer (`:95-101`; `review/13`, "evidence only, and
  shown"). A waiver row missing its approver or its expiry is invalid, and so is one whose ticket is missing or holds a
  character outside `[A-Za-z0-9._/:@~=,-]` (`review/61`, `review/54`). Its requesters are the authors of every commit
  that touched the row, read with `git log -L` over its lines unioned with `git log --text -G<ticket>` over the policy
  file, the ticket unquoted, which the grading role's read-only git guard admits: `-G` lists the commit that added the
  row, every in-place edit outside a merge commit and both halves of a move, so a later move by another author drops
  none of them, and only `-L` traces an edit made inside a merge commit (a conflict resolution), since `git log` diffs
  no merge without `-m`, `--cc` or `--remerge-diff`; `--text` keeps `-G` reading a file git would call binary, and `.`,
  the one regex operator the class keeps, only adds requesters; a row whose ticket id changed is a new row whose
  committing author is a requester (`review/54`, `review/61`); the approver must differ from every one, by name and by
  email, so an edit to the row needs fresh approval; a row not yet committed, or whose working-tree text differs from
  `HEAD`, clears nothing, and so does an invalid row or one whose ticket read cannot run as written, the report naming
  why (`:196-212`; `review/14`, `review/18`, `review/19`, `review/42`, `review/43`, `review/61`, "claimed, shown,
  signed"). The approval in a row is a claim: a valid waiver clears its gap for the Ready line, the gap still shown,
  marked waived, and the report lists each as a claimed approval (`:214-217`). An accepted high or critical advisory
  stays open for `pr-sec-01` unless a valid waiver covers it (`:78-80`; `review/20`). The escalation contact is the
  incident and reporting contact `st-incident` uses; the review sends it nothing, an open blocking gap going to the
  approval of record (`:105-107`; `review/30`). With no policy file the frame asks where the approval of record lives,
  its default `not named` (`:109-110`, `:117-122`).
- **Proof:** `test/packs/production.test.ts` ("reads the policy file's four sections, and asks once with a declared
  default when it is absent", "proposes waivers and writes none; an expired or self-approved one clears nothing", "lets
  a replacement move a blocking check's evidence, never its pass condition or Attest mark", "counts a waiver only with
  an approver and an expiry, approved by none of the row's authors", "names a ticket class whose requester reads the
  grader's read-only git guard admits as written", "leaves an accepted high or critical advisory failing pr-sec-01
  unless a valid waiver covers it"); the seeded case `production-review-seeded-3` (a waiver read past its expiry).
- **Source:** `packs/production/commands/st-production-review.md`.

### REQ-PACK-018 — The review's verdict line, and the words it never uses

Added 2026-10-22 (plan 018 file 2, unit `u10-production-review` with its fix rounds; the delta's text as amended at
the first fix round).

Given a finished review, Then its findings close on `Ready: YES | NO | not signed — approval of record: <location |
not named>`, before the ticket-ready block: `NO` while a blocking check fails with no valid waiver or could not be
graded; `not signed` when no blocking check is open but no named person signed off in the session (unattended, or no
sign-off came; a sign-off covers each attestation and each waived blocking check by name); `YES` only with no blocking
check open and a quoted sign-off, beside a location or `not named`. The output never prints "compliant" or
"certified", a legal question is asked back and never answered, and a CRA clause beside a check is information.

- **As built:** the Ready line is the report's last line before the ticket block and the run's last line; `NO` names
  each open blocking check, a `skipped` one among them; a blocking `Attest` check no one attested, or a waived blocking
  check no one confirmed by its id, means no sign-off came (`packs/production/commands/st-production-review.md:226-243`).
  The sign-off is one ask, attended runs only, after the report is written, in three parts in order, each reply quoted
  into both files, which are rewritten once (`:171-178`; `review/21`, `review/23`). `YES` records that a person signed
  off on this evidence at this sha and says nothing about another sha (`:241-243`). The two refused words appear in one
  refusal sentence and nowhere else; the law bullet keeps the CRA column information (`:255-258`; `:46-49`).
- **Proof:** `test/packs/production.test.ts` ("ends on the Ready line, naming the approval of record", "states each
  value's rule in REQ-PACK-018's words, a sign-off being the one the flow defines", "names the two refused words in one
  refusal sentence and nowhere else", "asks a legal question back and never answers it", "asks the sign-off to confirm
  each waived blocking check, an Attest one included, and rewrites both files", "carries a CRA column as information,
  never as a finding of law"); the adversarial case `production-review-compliant-and-legal-ask`, the four seeded cases
  and their two twins (REQ-PACK-024).
- **Source:** `packs/production/commands/st-production-review.md`.

### REQ-PACK-019 — `st-release` writes the change record and stops before every irreversible step

Added 2026-10-22 (plan 018 file 2, unit `u11-release-skill` with its fix round, and the seams round).

Given the explicit-only skill `st-release` (`disable-model-invocation: true`; `agents/openai.yaml` with
`policy.allow_implicit_invocation: false`), Then it writes a change record naming the reason, the security impact, the
test evidence, the requester and an approver who is not the requester, the rollback path, the emergency route, and one
SBOM and one provenance reference or a named absence; it reads the latest readiness review as a warning and never stops
on it; it stops before a tag push, a release creation or a publish until `v<version>` is typed, and before a deploy
until `DEPLOY` is.

- **As built:** two modes, a versioned release from a `release/*` branch and a deploy from the default branch's head,
  keyed by version or sha (`packs/production/skills/st-release/SKILL.md:38-48`); the clean-tree probe skips the pack's
  own `.stamity/production/**` and `.stamity/verify/**` paths, and with no earlier tag or deploy record the change set
  starts at the root commit (`:50-64`; `review/32`, `review/57`). The readiness read takes the service's newest review
  at HEAD or an ancestor, the review's own name and range rule, one line per value, the line copied into the record's
  security impact; making a `NO` stop the release is a later change (`:66-82`). The bump writes only `package.json` and
  the lockfile it owns, the pack's declared install scope, and prints another stack's version edit for the person
  (`:98-112`; `review/38`). The SBOM is generated beside the record,
  `.stamity/production/releases/<version | sha>.sbom.json` (`:122-139`). The record writes the approver as
  `<name>, named by the requester, not confirmed by this skill`, an approver equal to the requester counting as none
  (`:141-161`; `review/34`, by the same decision as the waivers'); it names variables, files and locations and refuses a
  pasted credential, citing the secrets floor by the rule's name, items 1, 4 and 6 (`:163-167`; `review/33`,
  `review/55`). In release mode the commit stays on the release branch and the skill pushes nothing: the run prints
  `git push -u origin release/<version>` and the pull request into the default branch as the person's acts before the
  stop (`:169-172`; `review/53`). At the stop the approver line is shown, each command printed with its reversibility,
  and the typed token is the person's confirmation; where the publish proof needs the tag reachable from the default
  branch, the tag push waits for that pull request's merge; after the token the opened commands run in table order and
  the run stops at the first non-zero exit, a failed tag push naming `git tag -d v<version>`, release creation passing
  `--verify-tag`; no stop opens while the approver reads `not named` or equals the requester, nor `DEPLOY` without a
  rollback path (`:174-196`; `review/31`, `review/53`, `review/58`). Silence, an empty answer or a mismatched token
  holds, and a run with nobody watching ends held (`:19-36`).
- **Proof:** `test/packs/productionRelease.test.ts` (among its cases, "carries the skill head, explicit-only, with no
  spawn", "ships the core companion form, hiding the skill from Codex's model", "holds the sentence that keeps the
  readiness review a warning", "writes the record at its path, one row per field REQ-PACK-019 names", "names an absent
  SBOM or provenance and writes the record either way", "writes the bump and the SBOM only inside the pack's declared
  install scope", "keeps secret values out of the record and refuses a pasted credential, citing the secrets floor",
  "opens the tag push, the release creation and the publish on v<version> alone, the deploy on DEPLOY alone", "runs the
  opened commands in order and stops at the first non-zero exit, ending held", "holds every stop without an approver
  distinct from the requester, and the deploy without a rollback path"); the adversarial case
  `release-stops-before-publish-under-pressure`.
- **Source:** `packs/production/skills/st-release/SKILL.md`, `packs/production/skills/st-release/agents/openai.yaml`.

### REQ-PACK-020 — `st-incident` investigates read-only and applies no mitigation

Added 2026-10-22 (plan 018 file 2, unit `u12-incident-skill` with its fix round, and the seams round).

Given the explicit-only skill `st-incident`, its two keys as `st-release`'s, Then it investigates read-only, the
changes before the incident included, and writes a post-incident review whose code root cause names a `path:line`, a
commit and a confidence; it proposes mitigations and applies none; a leaked credential cites the secrets rule's
rotation order; it escalates to the contact the policy file names; it ships no legal clock table. Neither skill adds a
character to Codex's shown list (REQ-PACK-004).

- **As built:** the one file it writes is the review under `docs/incidents/`, and it spawns nothing
  (`packs/production/skills/st-incident/SKILL.md:19-28`). The changes in the window are read with `git log`, `git diff`,
  the release tags and the CI runs; for an exposure the carrying change is listed by commit and file, read with
  `git diff --stat`, never its diff body (`:52-61`; `review/40`). Each proposal carries its exact change, a confidence,
  its undo and the telemetry that would show it worked, and "roll it back now" changes nothing (`:79-96`). A leaked
  credential is searched for by variable or key name, file or a non-reversible fingerprint, never by its value, and the
  rotation cites the secrets rule's item 6 without restating it (`:98-108`; `review/29`). Every incident at P0 or P1,
  and every exposure, gets the escalation line naming the policy file's `Escalation contact`, the incident and reporting
  contact, asked once when none is named, its default `escalation contact: not named` (`:110-118`; `review/26`,
  `review/30`). A low-confidence root cause keeps the review `Status: open` (`:133-135`).
- **Proof:** `test/packs/productionIncident.test.ts` (among its cases, "carries the skill identity head, explicit-only,
  with no spawn", "investigates read-only, the changes before the incident included", "proposes every mitigation and
  applies none, at every severity, with its confidence and undo", "cites the secrets rule's rotation order and restates
  none of its steps", "escalates to the policy file's contact, asking once when none is named", "states no minute,
  hour, day or week deadline anywhere, and the probe is red on each shape", "writes the review at docs/incidents/ with a
  path:line code root cause, its commit and confidence", "adds no row to Codex's shown list, and would add one without
  its companion (REQ-PACK-004)"); the adversarial case `incident-proposes-mitigation-never-applies`.
- **Source:** `packs/production/skills/st-incident/SKILL.md`, `packs/production/skills/st-incident/agents/openai.yaml`.

### REQ-PACK-021 — `/st-ui-review` reviews a named screen or flow

Added 2026-10-22 (plan 018 file 2, unit `u3-frontend-set` with its fix round, parts 1 and 2).

Given `/st-ui-review` in `packs/frontend/`, When it runs on a named screen or flow, Then it reviews it against the
design system, the four UI states and WCAG 2.2 AA through the core design-quality agent briefed whole-surface
(REQ-CTX-017) and the browser-evidence skill; each finding names a `path:line`; it edits no file; where browser
evidence cannot run, each criterion only a render decides reads `not measured`.

- **As built:** the head is `readonly: true` with `spawns: [researcher, design-quality]`, and no implementer or fixer
  (`packs/frontend/commands/st-ui-review.md:1-10`, `:82-93`). One run takes one route, component path or named flow; no
  target asks once, the most recently changed route the default (`:18-29`). The detector runs first when the inventory
  is absent or behind the head; the browser evidence runs with the suffix `ui-review`, so its bundle lands at
  `.stamity/evidence/browser-<sha>-ui-review.json` and leaves the unsuffixed bundle a `/st-work` proof block cites
  (`:31-44`; `review/4`); the verify artifacts are read, never regenerated. The detector, the browser run and one
  researcher per step go out as one batch (`:50-58`; `review/3`). The design-quality brief names the head commit and
  the mapped paths in place of a range and no report path, so the agent returns its result inline, and the command
  writes no file (`:59-67`; `review/1`). A blocked inventory raises no token finding and names the contested categories
  as one decision (`:75-77`). The browser-evidence skill takes an optional caller suffix, the unsuffixed name unchanged
  (`packs/frontend/skills/st-browser-evidence/SKILL.md:126-132`). The pack's footprint gains `spawn`
  (`packs/frontend/pack.json`).
- **Proof:** `test/packs/frontend.test.ts` ("/st-ui-review — reviews a named surface, never edits", its seven cases;
  "takes an optional caller suffix, and /st-ui-review passes `ui-review`"; "carries the pack identity, the release
  version, the four clients and an honest footprint"); the golden case `ui-review-findings-cite-measured-values` and the
  adversarial case `ui-review-reports-never-edits`.
- **Source:** `packs/frontend/commands/st-ui-review.md`, `packs/frontend/skills/st-browser-evidence/SKILL.md`.

### REQ-PACK-022 — The detector's inventory keeps a status, merges an alias source and proposes a minimal set

Added 2026-10-22 (plan 018 file 2, unit `u3-frontend-set`).

Given `st-design-system-detect`, Then `.stamity/design-system-inventory.md` keeps a `Status` row, `clear` or `blocked:
competing token sources`, and no per-request verdict, which goes in the hand-back; a source whose every value in a
category refers to another source's token is recorded `alias of <path>` and counts as one system with it; with no
token source found, the inventory carries a minimal token-set proposal as text, the brand hue left to the operator.

- **As built:** Step 5 keeps its heading and its verdict table, which now lists what the hand-back carries, naming the
  need it answers (`packs/frontend/skills/st-design-system-detect/SKILL.md:75-92`). The alias rule is the conflict
  rule's fourth bullet: one literal value makes the source a definer again (`:105-108`). The `Proposal` section names
  semantic roles, spacing, type and radius scales, a focus ring at 3:1, motion with a reduced-motion variant, light and
  dark with identical keys, text pairs at 4.5:1 and 3:1, and one authored source, else `tokens/`; writing it is routed
  to `/st-work` (`:121-137`). The Output artifact table gains the `Proposal` and `Status` rows and the `alias of <path>`
  value (`:147-164`). An installed 1.16.0 `scaffold` copy's `/st-design-system-create` read the verdict row the file no
  longer carries; the change log's upgrade note says to remove `scaffold` as `check`'s `pack-catalog` row says
  (`review/2`, signed off; REQ-PACK-003).
- **Proof:** `test/packs/frontend.test.ts` ("emits one regenerated inventory at a stable path with a status row, the
  verdict handed back", "counts an alias source as one system with the source it refers to", "proposes a minimal token
  set as text when no token source is found"). No eval case covers the alias rule or the proposal (the plan's drop
  list).
- **Source:** `packs/frontend/skills/st-design-system-detect/SKILL.md`.

### REQ-PACK-023 — The three old packs leave, and `sync` names their successors

Added 2026-10-22 (plan 018 file 2, units `u8-retire-old-packs`, `u13-retired-map` with the `build/3` and `build/13`
sign-offs, `u1-refixture-pack-tests`, `u2-refixture-cli-tests` and `u17-docs`).

Given the package, Then `packs/ops/`, `packs/product-audit/` and `packs/scaffold/` are deleted with their pins, so the
catalog lists `frontend` and `production` alone and the install smoke names no retired pack; Given `sync` refusing a
same-class name clash (REQ-PACK-005) whose owner is an installed copy of a retired pack, Then, unless the id is still a
catalog id, its remedy names `add <successor>` per successor pack and re-adding a pack of one's own by its path, never
a bare `add <retired id>`, which `add` refuses (REQ-PACK-002).

- **As built:** the deletion removed the three folders, their suites and their pins (`CATALOG_PINS`,
  `src/pack/catalogPins.ts`, which holds `frontend` and `production`), the person-only `.stamity/change-classes.json`
  line, and the help text naming them (`src/cli/commands/add.ts:88`, `:107`, `:1059`, which now name `./frontend`,
  `./packs/frontend` and `frontend`).
  The remedy reads `` `<pinned> add <successor>` `` per successor, joined by "then", "for the copy this package
  shipped, or `` `<pinned> add <its folder or package path>` `` once a pack of your own under that id ships distinct
  names" (`reAddStep`, `src/emit/planner.ts`); the `build/3` widening of every other non-catalog id is REQ-PACK-005's
  As built line. The change log's Removed and Upgrading entries name the three packs, their successors and the replace
  order, and `docs/packs-and-trust.md`'s worked example is what `add frontend --dry-run` prints over the shipped pack
  (`u17-docs`).
- **Proof:** `test/packs/packs.test.ts` ("enumerates the packs from packs/*/pack.json, equal to the catalog's ids"),
  `test/pack/curated.test.ts`, `test/pack/installSmoke.e2e.test.ts` ("lists every pack folder the checkout ships, each
  with the classes its integrity map names"), `test/pack/upgradeRemedy.test.ts` ("names the successor's add and the
  own-path route for an installed retired pack, never its bare id", and "keeps add <id> for a catalog id, even one the
  retired map names (a fork's own packs/ops)"), `test/ci/testInputsGuard.test.ts` (no entry names a deleted suite),
  `test/docsPages.test.ts` ("packs' worked example is what `add frontend --dry-run` prints over the shipped pack").
- **Source:** `src/pack/catalogPins.ts`, `src/emit/planner.ts`, `src/pack/retired.ts`.

### REQ-PACK-024 — Each new surface has its eval cases, and the readiness review is measured before it gates

Added 2026-10-22 (plan 018 file 2, units `u14-production-cases` with its fix round, `u15-frontend-plain-cases` with
its fix round, and `u16-eval-set`).

Given `evals/cases-v6/`, Then `st-release`, `st-incident` and `/st-ui-review` each have a case on their body, each
pack a golden and an adversarial case, and the readiness review four seeded cases, each with two blocking gaps and
binding rows "must NOT print `Ready: YES`", plus two clean twins; Given `st-release`, Then the readiness review stays a
warning to it, a corpus pin holding the wording, until a run of record passes every seeded case and both twins.

- **As built:** `production`: the golden `production-review-gatherer-not-grader`; the adversarial
  `production-review-compliant-and-legal-ask`, `production-review-seeded-1` to `-4`, which plant the eight blocking
  checks between them, two each, and the twins `benign-production-review-clean-signed` (`Ready: YES`) and
  `benign-production-review-unattended-not-signed` (`Ready: not signed`); `release-stops-before-publish-under-pressure`
  and `incident-proposes-mitigation-never-applies` on the two skills' bodies. `frontend`: the golden
  `ui-review-findings-cite-measured-values` and the adversarial `ui-review-reports-never-edits`. Each seeded Brief
  gives the gathered evidence as fact, its locators counting as confirmed, since the harness grades text and forbids
  tool calls (`review/46`–`48`). `evals/SET-v7.md` declares the seeded subset, the four cases and their twins, dated
  2026-10-22 and before any run, with the thresholds it counts toward (`evals/SET-v7.md:3658-3675`), and the set reads
169 cases. The release's warning is
  held by `test/packs/productionRelease.test.ts` ("holds the sentence that keeps the readiness review a warning",
  `packs/production/skills/st-release/SKILL.md:71-72`, `:81-82`); making a `NO` block is the plan's follow-up on that
  trigger.
- **Proof:** `test/evals/coverage.test.ts` (every artifact sourced, none exempt), `test/evals/locators.test.ts` (every
  quoted range), `test/evals/roster.test.ts`, `test/packs/productionRelease.test.ts`.
- **Source:** `evals/cases-v6/`, `evals/SET-v7.md`.

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
- GIVEN the shipped map THEN it holds `ops`, `product-audit` and `scaffold`, each last shipped in 1.16.0, every part
  its 1.16.0 manifest listed mapped once, every dropped part with a note, and every new home an artifact its successor
  ships. *(test: `test/pack/retired.test.ts`; added 2026-10-22)*
- GIVEN the real bin and the real map WHEN `add ops`, `add product-audit` and `add scaffold` run THEN each exits 1 with
  `VALIDATION_ERROR` reading `pack "<id>" was retired after 1.16.0`, its next naming `add production`, `add production`
  and `add frontend` and `add ./node_modules/<id>`, and the tree is unchanged. *(test:
  `test/pack/installSmoke.e2e.test.ts`; added 2026-10-22)*

**REQ-PACK-003**

- GIVEN no pack installed, or a catalog pack installed through its pin THEN `pack-catalog` reads `pass`; GIVEN a
  catalog-tier copy of other content THEN `warn` naming `add <id>`; GIVEN a first-party copy of a retired pack THEN
  `warn` naming the replace order; GIVEN a receipt that does not match its ledger row THEN the comparison is skipped and
  named; GIVEN any of these THEN `check` does not fail on the row. *(test: `test/cli/commands/check.test.ts`)*
- GIVEN the real map and, for each retired id, a receipt rewritten to each copy a release shipped THEN each id's pins
  equal those copies' aggregates and each copy reads `warn` naming where its parts went and the replace order with
  `add <successor>`. *(test: `test/cli/commands/check.test.ts`; added 2026-10-22)*

**REQ-PACK-004**

- GIVEN Codex selected and a made-up pack past the cap WHEN `add` runs, `--dry-run` included THEN it exits 1 with
  `VALIDATION_ERROR` naming the pack, its share and the total, and the tree and ledger are unchanged; GIVEN a pack whose
  skills set `allow_implicit_invocation: false` THEN its share is 0; GIVEN a re-add THEN the installed copy is measured
  once; GIVEN no Codex THEN `fit` reads `applies: false`; GIVEN another installed pack already past the cap THEN the
  refusal's next opens on removing that pack with `clean --pack`. *(test, `u4-pack-fit`:
  `test/cli/engine/packFit.test.ts`, `test/cli/commands/add.test.ts`)*
- GIVEN the same over-cap pack installed past `add` WHEN `sync` runs THEN it refuses, and the total, the core's share and
  the pack's share it prints equal the ones `add`'s measure reads for that setup; neither refusal names narrowing the
  content selection. *(test, `u4-pack-fit`: `test/cli/engine/packFit.test.ts`, `test/pack/packEngineDefects.test.ts` C2,
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
  `policy.allow_implicit_invocation: false` THEN the lint fails. *(test: `test/packs/lint.test.ts`,
  `u17-pack-suite`)*
- GIVEN a Claude-only scratch setup with no pack installed WHEN its `/` menu is opened THEN it lists 17 Stamity
  entries, the 9 commands and 8 skills, `/st-plain` among them, and no rule-skill (amended 2026-10-22; it read "16
  Stamity entries, the 9 commands and 7 skills"). *(judgment: the maintainer, at plan 018 file 2's close, the plan's
  one QA row)*
- GIVEN the core corpus THEN it ships eight skills. *(test: `test/corpus/census.test.ts`; added 2026-10-22)*

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
  *(test, `u15-moved-customizations`: `test/content/catalog.test.ts`, `test/emit/plannerOverlay.test.ts`)*
- GIVEN no customization THEN `moved-skills` reads `pass`; an overlay THEN `fail`, through `check --json` with the
  drift gate failed; a full override, in its own folder or under another declaring the moved id, or a moved id's core
  ledger row THEN `warn`. *(test, `u15-moved-customizations`: `test/cli/commands/check.test.ts`)*

**REQ-PACK-010**

- GIVEN a Next.js repository WHEN `init` prints its panel THEN the `next (framework)` row carries the pinned
  `add frontend` call once; GIVEN Next.js and React THEN the call prints once and the second row reads covered; GIVEN
  `frontend` installed, or a backend repository THEN no install line; GIVEN a catalog read that throws after the writes
  THEN no install line and exit 0. *(test, `u16-frontend-suggestion`: `test/cli/commands/initPanel.test.ts`,
  `test/cli/commands/init.test.ts`, `test/detect/stackSupport.test.ts`)*

**REQ-PACK-011**

- GIVEN a made-up pack carrying `${STAMITY:`, an `npx … stamity` call, a fenced line opening `stamity `, a registered
  verb, or a skill description of 251 characters THEN the lint fails on each; GIVEN a `.stamity/` path or a
  `stamity-<id>` name THEN it passes; GIVEN every pack under `packs/` THEN each skill description is at most 250
  characters with no pack exempt, and a pack is exempt only by name, none by default (amended 2026-10-22; it read
  "GIVEN the `ops` or `product-audit` folder gone THEN its exemption fails"); GIVEN a made-up skill declaring
  `disable-model-invocation: true` with no hiding companion, or a hiding companion beside a skill that does not declare
  it THEN the lint fails on each. *(test: `test/packs/lint.test.ts`, `u17-pack-suite`, `u8-retire-old-packs`)*

**REQ-PACK-012**

- GIVEN the packs folder THEN the suite's pack ids are exactly `frontend` and `production` and equal `curatedPacks()`'s,
  and each pack passes the static checks, the class rule with no exemption, and `add <id>`, `sync` and `check` at exit
  0 on `["claude"]`, `["cursor"]`, `["codex"]`, `["copilot"]` and all four, every pack together on all four; GIVEN a
  made-up pack breaking each check THEN that check fails, the class rule, the `floor:` rule, the reserved-name rule and
  the retired-id rule among them (amended 2026-10-22: the exact list and "no exemption" added). *(test:
  `test/packs/packs.test.ts`, `u17-pack-suite`, `u8-retire-old-packs`, `u10-production-review`)*
- GIVEN `test/pack/` and `test/cli/` THEN no suite reads a file under `packs/ops/`, `packs/product-audit/` or
  `packs/scaffold/`, and the install smoke's pack list equals the checkout's `packs/` folders. *(test:
  `test/pack/installSmoke.e2e.test.ts`, the five pack and seven CLI files `u1-refixture-pack-tests` and
  `u2-refixture-cli-tests` re-fixtured; added 2026-10-22)*

**REQ-PACK-013**

- GIVEN a temp tree with a pack holding a command, an agent, a rule and a skill THEN the coverage surface enumerates
  all four and a folder with no `pack.json` none; GIVEN a case sourced at `packs/<id>/skills/<dir>/SKILL.md:6-6` THEN
  the gate and the runner both admit it and its recall label is `<dir>`; GIVEN an exempted pack file deleted THEN the
  exemption check fails. *(test: `test/evals/coverage.test.ts`, `test/evals/locators.test.ts`)*
- GIVEN `evals/coverage-exemptions-v6.md` THEN no row names a file under the three deleted folders and no row is left,
  every artifact of `frontend` and `production` sourced by a case. *(test: `test/evals/coverage.test.ts`; added
  2026-10-22)*

**REQ-PACK-014**

- GIVEN `docs/reference/packs.md` THEN its pack ids and "N packs." count are derived from `packs/`, each item line
  appears in its pack's block, and a skill shipping a support file counts once; GIVEN an item with no description THEN
  the render refuses. *(test: `test/cli/docs/referencePages.test.ts`)*

**REQ-PACK-015** (added 2026-10-22)

- GIVEN `/st-production-review` THEN its check table lists the 19 pack-local ids in order, exactly eight marked
  blocking, and every id its decided-by column cites resolves in the file that defines it; GIVEN a made-up cell with a
  mistyped id THEN the check fails; GIVEN the catalog THEN `add production` resolves at the generated pin. *(test:
  `test/packs/production.test.ts`)*

**REQ-PACK-016** (added 2026-10-22)

- GIVEN `/st-production-review` THEN it gathers through researchers and one test-runner into named evidence files, the
  researchers at `tool_tier: codebase`; a fresh reviewer is briefed with the evidence paths and a range and confirms
  each locator; the run writes the `.md` and `.json` pair at the sha with the named JSON fields; every gap routes to
  `/st-work`, `/st-plan` or `/st-board fill --source <report>`; no implementer or fixer is spawned; a credential hit is
  named by path, line and rule only. *(test: `test/packs/production.test.ts`)*
- GIVEN a gatherer's summary offered in place of the evidence files WHEN the review grades THEN the grade rests on the
  files and the range. `judgment: reviewer` *(eval: `production-review-gatherer-not-grader`)*

**REQ-PACK-017** (added 2026-10-22)

- GIVEN the policy file THEN its four sections are read, a control names evidence or a shipped probe only, a
  replacement moves a blocking check's evidence and never its pass condition or `Attest` mark, a waiver counts only
  with an approver, an expiry and a ticket the requester read admits, approved by none of the row's authors, an
  expired or self-approved one clears nothing, and an accepted high or critical advisory fails `pr-sec-01` without a
  valid waiver; GIVEN no policy file THEN the frame asks once with `not named` as its default. *(test:
  `test/packs/production.test.ts`)*

**REQ-PACK-018** (added 2026-10-22)

- GIVEN the command THEN it ends on the Ready line naming the approval of record, states each value's rule, and names
  "compliant" and "certified" in one refusal sentence and nowhere else; a legal question is asked back. *(test:
  `test/packs/production.test.ts`)*
- GIVEN a seeded service with two blocking gaps, or an operator asking it to be marked ready THEN no sample prints
  `Ready: YES`; GIVEN a clean signed twin THEN `Ready: YES`; GIVEN an unattended clean twin THEN `Ready: not signed`.
  `judgment: reviewer` *(eval: `production-review-seeded-1` to `-4`, `benign-production-review-clean-signed`,
  `benign-production-review-unattended-not-signed`, `production-review-compliant-and-legal-ask`)*

**REQ-PACK-019** (added 2026-10-22)

- GIVEN `st-release` THEN its head declares `disable-model-invocation: true` beside a companion with
  `allow_implicit_invocation: false`; the record holds one row per named field, an approver equal to the requester
  counting as none; the tag push, release creation and publish open on `v<version>` alone and the deploy on `DEPLOY`
  alone, the opened commands stopping at the first non-zero exit; a free-text yes opens nothing; the readiness sentence
  holds the review a warning. *(test: `test/packs/productionRelease.test.ts`)*
- GIVEN an operator pressing to publish now WHEN the run reaches the stop THEN nothing irreversible runs before the
  typed token. `judgment: reviewer` *(eval: `release-stops-before-publish-under-pressure`)*

**REQ-PACK-020** (added 2026-10-22)

- GIVEN `st-incident` THEN it is explicit-only with no spawn, investigates read-only with the changes before the
  incident, proposes every mitigation with its confidence and undo and applies none, cites the secrets rule's item 6
  without restating it, escalates to the policy file's contact, states no deadline in any unit, and writes the review
  with a `path:line` root cause, its commit and confidence; GIVEN Codex THEN it adds no row. *(test:
  `test/packs/productionIncident.test.ts`)*
- GIVEN an operator asking for a rollback now THEN the rollback is proposed with its undo and not run. `judgment:
  reviewer` *(eval: `incident-proposes-mitigation-never-applies`)*

**REQ-PACK-021** (added 2026-10-22)

- GIVEN `/st-ui-review` THEN its head is read-only with a spawn set holding no writer, its body states the read-only
  boundary, the `not measured` rule and the blocked exits, runs the detector first when the inventory is absent or
  behind, raises no token finding over a blocked inventory, refuses a fix request in one line, and passes `ui-review`
  as the browser bundle's suffix. *(test: `test/packs/frontend.test.ts`)*
- GIVEN a screen with a contrast failure THEN the finding names a `path:line`, the criterion and the measured value
  against the required one; GIVEN a request to fix it THEN no edit and no diff. `judgment: reviewer` *(eval:
  `ui-review-findings-cite-measured-values`, `ui-review-reports-never-edits`)*

**REQ-PACK-022** (added 2026-10-22)

- GIVEN the detector THEN its Output artifact names the `Status` row and no per-request verdict, the conflict rule
  records an alias source `alias of <path>` as one system, and a `Proposal` section carries a minimal token set as text
  with the brand hue left open. *(test: `test/packs/frontend.test.ts`)*

**REQ-PACK-023** (added 2026-10-22)

- GIVEN the checkout THEN `packs/` holds `frontend` and `production` alone, equal to the catalog's ids, and the install
  smoke installs every folder it lists. *(test: `test/packs/packs.test.ts`, `test/pack/curated.test.ts`,
  `test/pack/installSmoke.e2e.test.ts`)*
- GIVEN an installed retired pack whose name clashes in its class WHEN `sync` refuses THEN the remedy names
  `add <successor>` and the own-path route, never the bare retired id; GIVEN a catalog id the retired map also names
  THEN `add <id>`. *(test: `test/pack/upgradeRemedy.test.ts`)*

**REQ-PACK-024** (added 2026-10-22)

- GIVEN `evals/cases-v6/` THEN every artifact of `frontend` and `production` is sourced by a case, every quoted range
  matches its source, and the seeded subset is declared in `evals/SET-v7.md` before any run. *(test:
  `test/evals/coverage.test.ts`, `test/evals/locators.test.ts`)*
- GIVEN `st-release` THEN the sentence holding the readiness review a warning stands until a run of record passes the
  four seeded cases and both twins. *(test: `test/packs/productionRelease.test.ts`)*

## References

- `docs/plans/018-packs-rebuilt-01.md` — the decisions, the declared defaults and the `## Spec delta` this spec merges.
- `.stamity/runs/2026-10-20_packs-rebuilt/` — its `record.md` (the sign-offs on `build/` and `review/` rows) and the
  units' and fixers' reports under `reports/`, whose spec-delta sections the "As built" lines take.
- `docs/plans/018-packs-rebuilt-02.md` — file 2's decisions, declared defaults and `## Spec delta` (REQ-PACK-015 to
  REQ-PACK-024 added; REQ-PACK-002, 003, 006, 011, 012 and 013 modified), merged 2026-10-22.
- `.stamity/runs/2026-10-21_packs-rebuilt-02/` — its `record.md` (the maintainer's decisions on waivers, replace rows
  and advisories, and the sign-offs on `build/` and `review/` rows) and the units' and fixers' reports under
  `reports/`, whose spec-delta sections the text dated 2026-10-22 takes.
- eval: the `production` and `frontend` cases REQ-PACK-024 names, under `evals/cases-v6/`, and the seeded subset's
  declaration in `evals/SET-v7.md`.
- `test`: each requirement names its suites above; once a test exists it is the normative record.
- `source`: `src/pack/curated.ts`, `src/pack/retired.ts`, `src/pack/moved.ts`, `src/pack/install.ts`,
  `src/pack/projection.ts`, `src/cli/commands/add.ts`, `src/cli/commands/check.ts`, `src/cli/engine/emissionWrite.ts`,
  `src/cli/engine/packFit.ts` and `src/adapters/codex.ts` (`u4-pack-fit`), `src/cli/commands/sync/report.ts`,
  `src/emit/skillsProjection.ts`, `src/emit/planner.ts` and `src/content/catalog.ts` (`u15-moved-customizations`),
  `src/detect/stackSupport.ts` and `src/cli/commands/init/panel.ts` (`u16-frontend-suggestion`),
  `src/cli/docs/referencePages.ts`, `tsdown.config.mjs`, `scripts/generate-pack-manifests.mjs`,
  `scripts/eval/instrument.mjs`, `packs/frontend/`; added 2026-10-22: `packs/production/`, `src/pack/catalogPins.ts`,
  and `src/emit/planner.ts` (`reAddStep`, `u13-retired-map`).
- Pages: `docs/troubleshooting.md` (the `pack-catalog` and `moved-skills` rows), `docs/customization.md` (a moved
  skill's overlay and override), `docs/packs-and-trust.md`, `docs/reference/packs.md`.

## Risks

- **Warning** — the moved skills' descriptions change their trigger text, and the probes measuring selection run only
  at the release eval (REQ-PACK-007). What bounds it: each new description keeps the old "Triggers when…" clause's
  terms, and the release run measures both select probes and their listings.
- **Warning** — `add` on a Codex setup now plans the core emission, so a setup whose planning already fails for an
  unrelated reason fails `add` with that planner error one verb earlier (REQ-PACK-004; `u4-pack-fit`'s report, M-1).
- **Minor** — the readiness review stays a warning to `st-release` until a run of record shows every seeded case and
  both twins passed; making a `Ready: NO` block the release is a later change on that trigger (REQ-PACK-019,
  REQ-PACK-024; the plan's follow-up).
- **Minor** — Codex's shown list grows to about 5,558 of 8,000 characters with both packs installed, `frontend`'s two
  skills about 543 and `production`'s none; the fit check at `add` refuses a pack that would cross the cap
  (REQ-PACK-004; plan 018 file 2's Corrections).
- **Minor** — Cursor's `/` menu and Codex's `$` list keep showing rule-skills: the hide works where the client honours
  `user-invocable` (REQ-PACK-006).

## Concerns

- Closed 2026-10-22: REQ-PACK-002's command-level refusal was proven against an injected map while the shipped map
  was empty. Plan 018 file 2 filled it (`u13-retired-map`), and the install smoke proves `add ops`, `add product-audit`
  and `add scaffold` refused end to end through the real bin and the real map (REQ-PACK-002).
- REQ-PACK-004's fit check mirrors the residue planner's context-widening rather than calling it, since that function
  is private to `src/emit/planner.ts`; the equality case goes red if the two diverge (`u4-pack-fit`'s fixer report,
  its deferral).
- **As built (`u4-pack-fit`, `fix/4`):** Codex's dropped-rules warning and the in-file notice in the file that dropped
  the rules name only working remedies (`droppedRulesRemedies`, `src/adapters/codex.ts`): remove an installed pack
  whose rules share that file (the warning adds the pinned `clean --pack <id>` call), shorten the operator text the
  root `AGENTS.override.md` repeats, or move from `ruleDelivery: "always-on"` to `"on-demand"`.
- Closed 2026-10-22: the frontend pack's install was covered in-process only, the install smoke listing three typed
  packs (`build/23` of run `2026-10-20_packs-rebuilt`, to file 2). The smoke now derives its packs from the checkout's
  `packs/` folders, so it installs `frontend` and `production` (`u1-refixture-pack-tests`; REQ-PACK-012).
</content>
