---
id: fork-layer
# A design document, authored outside the spec command, amended at the close of run 2026-10-03_pack-engine-defects on 2026-10-06, amended in run 2026-10-14_cli-native on 2026-10-14, amended from docs/plans/022-autonomy-distribution-01.md in run 2026-10-25_autonomy-distribution-02 on 2026-10-25, and excluded from the site build.
# The records moved to the `records` branch on 2026-10-14; every path below that names this repository's own records — under `.stamity/runs/`, `.stamity/evidence/`, `.stamity/handoffs/`, `.stamity/inbox.md`, `docs/plans/`, `evals/runs/`, `evals/measurements/` or `evals/reach/` — reads on that branch (REQ-PROVE-023 in docs/specs/prove-behavior-and-value.md). A path of the run layout a consuming repository writes, such as `.stamity/runs/<run-id>/`, is the product's and is not one of them.
status: shipped-with-1.15.0
obsolete_when: the enterprise-forks guide and the customization page stop carrying the fork layer's behaviour, or a decision cuts the surface
---
# The fork layer

A directory inside the package, `fork/`, that a downstream fork of this repository fills with
its own agents, rules, commands and skills. Its artifacts add new ids, replace bundled ones
whole, or patch them field by field, and every one of them ships to the fork's consumers
through the same emission the corpus takes — without a single edit under `content/`. The
enterprise upstream lane (`docs/specs/enterprise-upstream-lane.md`) already carries direct
core edits through an upstream release; this layer removes the reason for the most common of
those edits. The 1.4.0 guide named it as a non-goal with a trigger; the maintainer pulled the
trigger on 2026-09-10.

Every claim about existing behaviour below carries a `path:line` citation taken from the tree
at `f62d526` (main after the 1.4.0 release and the post-release cleanup). The paragraphs headed
"Amended 2026-10-06" come from the spec delta the unit `u5a-overlay-refusal` declared in run
`2026-10-03_pack-engine-defects`, merged at its close; they cite `eb4f0727` and shipped with
1.12.0. Those that name a review row (`review/60`, `review/66`) come from the same run's
close review and cite the commit that carries them.

The text dated 2026-10-14 comes from the spec delta of `docs/plans/020-cli-native-01.md` (plan 020 file 1, run
`2026-10-14_cli-native`), which deletes the APM and plugin distribution routes in 1.15.0. It moved three requirements
here from `docs/specs/plugin-lifecycle.md`, each keeping its id: REQ-PLUGIN-027 (a fork's release workflow),
REQ-PLUGIN-028 (the identity script, joined by the publisher half of the retired REQ-APM-007) and REQ-PLUGIN-048 (a
registry fork's pinned calls). Each is the text as it stood there at `c96c7146`, with every route clause dropped in
place and marked "(route clause dropped 1.15.0)", then a paragraph headed "Amended 2026-10-14" that states what
1.15.0 holds. That text cites the tree at `d590a266`, the integration head the deletion landed on, and shipped with
1.15.0, which set `status: shipped-with-1.15.0`. REQ-FORK-010 and REQ-FORK-011 lose their APM halves the same day.

REQ-PLUGIN-031 and REQ-PLUGIN-050 come from the spec delta of `docs/plans/022-autonomy-distribution-01.md` (plan 022
file 1, run `2026-10-23_autonomy-distribution-01`, unit `a11-release-workflows`), which replaces plan 016's file 1
for them; REQ-PLUGIN-031 is one of the ids `docs/specs/plugin-lifecycle.md` held for plan 016's later files, and
REQ-PLUGIN-050 is reduced from plan 016's text. That run reached `main` as pull request #125 without this merge; pass
`spec1` of run `2026-10-25_autonomy-distribution-02` made it afterwards, and every `path:line` in that text reads at
`864d0111`, `main` after #125. A ledger id in that text (`review/11`) is that run's own. It is not in a release yet.

## Intent

Let a fork say "our version of this rule", "this agent too", and "this default, but with our
tags" in files that are its own, that upstream never writes, and that a release from upstream
merges past without a conflict. What the lane then reports for those files is drift — the
bundled default behind a replaced or patched artifact moved — which is a review, not a merge.

## Context

### Three layers exist; two of them are the shape this one copies

The content index is built from four scans issued together — the corpus, each installed
pack, the consumer repository's override tree and the overlay discovery — and ordered by
layer, not by which scan finished (`src/content/catalog.ts:535-569`). The origin union is
`"corpus" | "pack" | "user"` (`catalog.ts:114`), read through `originOf` (`catalog.ts:648-650`).
Precedence is decided in one loop (`catalog.ts:576-613`): a pack claiming a taken id is a
`VALIDATION_ERROR` on contact ("Packs must not shadow existing content", `:589-599`); a user
item claiming a lower layer's id takes the slot and the replaced item leaves the index —
"one identity, one body" (`:605-609`, `:624-630`). Patching runs after resolution on the
resolved item (`applyOverlays`, `:615-622`), discovered from `.customize.yaml` and
`.customize.md` siblings (`:1036-1144`), with exclusivity against a full override of the same
id (`:1000-1010`). Shadow rows are built for every lower-layer claimant (`buildShadows`,
`:661-686`) and surface through `validate` (`src/cli/commands/validate.ts:453-462`, rendered at
`:931-971`); `check` never reads a layer (`src/cli/commands/check.ts:690-709`).

The user layer is the shape to copy: admitted by presence in selection
(`src/content/selection.ts:182`), emitted to every per-client agent, rule and command location
for all four classes (`src/cli/engine/emission.ts:47-53`, `OVERRIDE_EMITTING_CLASSES`
`:132-137`), its source files never planned, wrapped or reclaimed (`:104-112`), and switched
on at one seam, `overlayContentRoots` (`:266-277`), with the three-part `ContentRoots` carried
whole so the layer cannot appear or disappear with unrelated state (`catalog.ts:76-82`,
`src/emit/planner.ts:770-778`, `residueContext` `:791-803`). Skills from the corpus and the
override tree project through `projectSkills` with widened roots
(`src/emit/skillsProjection.ts:157-192`); pack skills take their own lane and the planner
filters `origin !== "pack"` before merging (`planner.ts:361`), refuses an override of a pack
skill (`:457-473`) and refuses an override directory clashing with a shipped skill's
projection directory (`:524-546`).

### What the package ships, and what counts

`package.json` ships `dist` alone; `tsdown.config.mjs` copies `content` and `packs` beneath it
and classifies those two prefixes as the corpus half of the size budget, with an unlisted
prefix falling into an unbudgeted line that can never fail (`classifyDistEntry`; pinned by
`test/support/support.test.ts:556-612`). The bundled corpus root is probed source-first
(`src/content/contentRoot.ts:28`, `:51-70`). The README's corpus counts and the corpus census
read `content/` alone through the test harness's `loadCorpusIndex()`
(`test/corpus/harness.ts:68-73`, `test/docsPages.test.ts:417-427`,
`test/corpus/census.test.ts:15-20`), so a fourth layer moves neither. The generated reference
pages render the bundled index (`src/cli/docs/referencePages.ts:665-680`), so in a fork they
would render the fork's artifacts too — which is what a fork's own reference should say.

### The names that are taken

"org" means the organisation trust policy (`src/pack/orgPolicy.ts`, `.stamity/policy.json`);
"overlay" means the `.customize.*` patch mechanism (`docs/specs/overlay-layers.md`); the phrase
"four-layer precedence" is retired in three module headers because it once counted layers
that were never reachable together (`catalog.ts:72-75`, `src/content/userContent.ts:96-99`,
`emission.ts:95-99`). This layer is therefore the **fork layer**, its directory `fork/`, its
origin `"fork"`, and those three headers are rewritten to state the chain that now applies:
corpus or pack → fork (a full replacement or a patch) → user (a full replacement or a patch).

## Invariants

1. **A package with no `fork/` directory is byte-identical** in its index, its plans, its
   ledger and its goldens to the package today. This repository ships no `fork/`.
2. **Upstream never writes under `fork/`.** No generator, no `sync`, no emission targets it;
   the directory is the fork's, the way `.stamity/overrides/` is the consumer's.
3. **One identity, one body.** A fork artifact claiming a corpus id replaces it whole and the
   replaced item leaves the index; a user override claiming a fork id does the same to the fork
   item. A pack and the fork layer never share an id: the pack is refused on contact whichever
   arrived first, the rule packs already meet against the corpus, and a fork that wants to change
   a pack's artifact patches it or ships its own under another id. Precedence is user > fork >
   pack > corpus, decided in the one loop that decides it today.

   Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, review row `review/60`): the patch
   remedy does not hold for a pack's skill. A pack skill is never patched — a fork patch of one is
   skipped (REQ-FORK-004's amendment) — so a fork that wants to change a pack's skill ships its own
   under another id, and that is the only remedy the refusal names on the fork's side for a skill.
4. **The same gate.** A fork artifact passes the index-time contract the corpus passes and
   the safety screen user content passes; nothing about the layer relaxes a floor.
5. **Same emission, same ownership.** A fork artifact reaches every client location its class
   reaches for corpus content; the per-client copy is an adapter-owned, regenerated, reclaimable
   row; the source under `fork/` is never planned.
6. **Reported, not silent.** Every id the fork layer replaces or patches is a shadow row in
   `validate` with `fork` as the winner, and the upstream lane derives a drift pair for every
   fork file whose bundled counterpart exists.

## Requirements

### REQ-FORK-001 — Placement and spelling

`fork/<class>/<id>.md` for agents, rules and commands; `fork/skills/<id>/SKILL.md` plus the
skill's own files for skills; `fork/<class>/<id>.customize.yaml` and
`fork/<class>/<id>.customize.md` (and `fork/skills/<id>/SKILL.customize.*`) for patches —
the same layout the override tree uses (`docs/customization.md:26-34`), rooted at the package
instead of at a consumer repository. Ids are bare slugs: a filename spelled with the reserved
`stamity-`/`st-` prefix is refused at index time with the canonical spelling named, the way an
overlay filename is today (`catalog.ts:984-998`). A bare slug that matches a prefixed corpus
file's id replaces it, prefix and all, exactly as a user override does
(`src/content/userContent.ts:1395-1418`).

### REQ-FORK-002 — Discovery is a fourth scan, ordered by layer

`buildContentIndex` scans `<forkRoot>` with `origin: "fork"` beside the three scans it issues
today, and orders the layers corpus, packs, fork, user before resolving. `ContentRoots` gains
a fourth part, `forkRoot`, carried everywhere the other three are carried
(`catalog.ts:189-229`, `residueContext`, `buildCoreEmissionPlan`'s spec, `overlayContentRoots`);
the bundled fork root resolves beside the corpus root — `fork` in a source checkout,
`dist/fork` in the published package — and resolves to nothing, never to an error, when the
directory is absent.

### REQ-FORK-003 — Precedence in the one loop

In the resolve loop: a fork item claiming a corpus id takes the slot and the claimant is
recorded as shadowed; a pack and a fork item claiming one id are refused on contact with the
existing "must not shadow" error, whichever was installed first, and the message names both
remedies — the consumer's (remove the pack, or ask its author to rename) and the fork author's
(patch the pack's artifact with `fork/<class>/<id>.customize.*`, or ship the artifact under
another id); a user item claiming a fork id takes the slot as it takes any lower layer's. Duplicate ids inside `fork/` are the existing duplicate-id collision.
`originOf` returns `"fork"` for fork items; `ContentOrigin` is `"corpus" | "pack" | "fork" |
"user"`, and every reader the union's doc block enumerates (`catalog.ts:96-113`) is updated
or verified.

Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, review row `review/60`): the fork
author's patch remedy is named for every class but skill. A fork patch of a pack skill is skipped
(REQ-FORK-004's amendment), so following it would ship the fork's change nowhere. When the pack's
artifact is a skill, the refusal keeps the consumer's two remedies and says, on the fork's side,
that a pack skill cannot be patched and that the fork's skill ships under another id; it names no
`SKILL.customize.*` file (`refusePackShadow`, `src/content/catalog.ts:1111-1145`, the skill arm at
`:1123-1129`). An agent, command or rule keeps the text above unchanged.
`test/content/catalog.test.ts:1600` pins the rule's text whole, and `:1644` the skill's.

### REQ-FORK-004 — Patches from the fork layer

Overlay discovery runs over `<forkRoot>` as it runs over the override root; a fork patch
applies to the item resolved from corpus or pack, and a user patch applies after it to
whatever the fork stage produced. Exclusivity holds per layer: a fork full replacement and a
fork patch of one id are refused together, as the user pair is today (`catalog.ts:1000-1010`);
across layers, a user full override simply replaces a fork-patched item. Every overlay
refusal (`REQ-OVERLAY-005` through `-010`) applies unchanged, naming the fork file — with one
asymmetry the layer's scope forces: the fork layer is package-global and packs are
per-repository, so a fork patch whose base exists in none of the corpus, an installed pack and the fork layer is
not an orphan error but a patch that waits — skipped in that repository and reported by
`validate` as a warning that names the artifact it waits for — while a consumer's
own orphan patch stays the error it is today, because the consumer can fix the file.

Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, unit `u5a-overlay-refusal`, integrated as
`8484b70a`; cited at `eb4f0727`): a second asymmetry of the same kind. A fork patch whose base is an
installed pack's SKILL is skipped in that repository, each half recorded in `ContentIndex.skipped`
with a reason naming the pack and the skill, and `validate` prints that reason as a warning at exit 0
(`forkPackSkillSkipReason`, `src/content/catalog.ts:1562-1576`, applied at `:1851-1857`;
`classifyForkOverlays`, `src/cli/commands/validate.ts:700-753`, the warning mapping at `:749-751`). A consumer's own patch of a pack
skill is an error (REQ-OVERLAY-009's pack-skill row, amended 2026-10-06). A pack skill projects from
the pack's own files and is never patched, so the waiting rule above does not reach skills: the skip
reason for a fork skill patch with no base says it will not apply even once a pack supplies the
skill, and names the pack's own source as the place for the change (`forkOrphanSkipReason`,
`src/content/catalog.ts:1496-1522`). A fork patch of a pack's agent, command or rule still applies.
`test/content/overlayPackSkill.test.ts` holds each case.

### REQ-FORK-005 — Selection, emission, skills

Fork items are admitted by presence, as user items are (`selection.ts:182`): a fork ships what
it put there. Every class emits to every client location its class reaches; the copy is
adapter-owned. Fork skills project through the corpus-and-override skills lane with the fork
root among the widened roots. A customizing skill — fork or user — that replaces a bundled
skill projects under the bundled skill's emitted spelling (its `st-` directory and `name`), so
every reference to the skill keeps resolving; a customizing skill that is an addition projects
under its own bare directory. A fork skill claiming a pack skill's id is refused the way a user
override of a pack skill is (`planner.ts:457-473`); the directory-clash refusal treats a fork
skill as it treats a user skill (`:524-546`). The per-file coverage floors on
`src/emit/planner.ts` and `src/emit/skillsProjection.ts` hold.

Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, the stale citations named by unit
`u5a-overlay-refusal`; cited at `eb4f0727`): the two `planner.ts` line ranges above date from
`f62d526` and have moved. The refusal a fork skill claiming a pack skill's id or directory meets is
the one whose message opens "Pack-skill overrides are unsupported today", in `mergeSkillProjections`
(`src/emit/planner.ts:653-658`, the function at `:634-673`, whose doc names the fork skill's side at
`:626-632`); the directory-clash refusal is `refuseOverrideDirectoryClash` (`:708-742`). The names
are the durable address; the line ranges drift.

Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, review row `review/66`): the cross-class
name check covers fork artifacts too. Before any row is planned, `sync` — and `check`, `init` and
`plugin setup`, which plan through the same seam — refuses when one invocable name is claimed by
artifacts of more than one class, and a fork-layer file is an owner like any other
(`refuseInvocableNameClashes`, `src/emit/planner.ts:812-867`, run at `:965`). For a fork owner
the remedy printed is to rename or remove the file in the fork's source and publish the package
again, named as a defect in the package's fork layer rather than in the consumer's repository
(`remedyOf`, `:889-894`). `test/emit/plannerNameClash.test.ts:256` holds the case.

### REQ-FORK-006 — Validate names the fork

`validate` reports a fork replacement as a shadow row with `winner: "fork"` and a fork patch
as a `patched` row with `layer: "fork"`, rendered so a reader can tell the fork layer from a
consumer override; a fork patch whose id a consumer override replaced is reported as inert
under that override, never as a patch, and no finding about the consumer's artifact is
addressed to the fork file; a fork patch that waits for a pack is a warning row; the JSON
envelope's `shadows` list carries the same rows.

### REQ-FORK-007 — Shipping and the size budget

`tsdown.config.mjs` copies `fork` beneath `dist` when the directory exists, and
`classifyDistEntry` counts the `fork/` prefix as corpus, so a fork's content is budgeted
rather than unbudgeted; `test/support/support.test.ts` pins the classification.

### REQ-FORK-008 — The upstream lane derives the drift pairs

`deriveShadowPairs` in `scripts/upstream.mjs` maps `fork/<class>/<id>.md`,
`fork/<class>/<id>.customize.{yaml,md}` and `fork/skills/<id>/SKILL.md` to the bundled
counterpart, and the counterpart is the file that exists at the target head among the three
spellings the corpus uses — `<id>.md`, `stamity-<id>.md`, `st-<id>.md` — rather than the bare
name alone, which also repairs the same derivation for `.stamity/overrides/` pairs. The
`ls-tree` census that feeds it lists `fork/` beside `.stamity/overrides/`. A fork file with no
counterpart derives no pair: it is an addition, and the lane has nothing to compare.

### REQ-FORK-009 — Documented where a fork reads

`docs/enterprise-forks.md` gains the layer as the boundary between "Pack" and "Direct core
edit" in its table, a section on authoring under `fork/` (layout, replace, patch, what
`validate` shows, what the lane reports), and the non-goal paragraph becomes the pointer;
`docs/customization.md` states the chain in one paragraph and points at the guide;
`docs/specs/overlay-layers.md`'s "four-layer precedence is retired" note is amended to name
the chain that now applies; the CHANGELOG's Unreleased section records the addition.

### REQ-FORK-010 — The fork layer's consumers

The APM generator (route clause dropped 1.15.0: its file is deleted) emits reachable corpus and fork winners from the catalog,
including patched bodies, through the four APM primitive classes. Selecting only
corpus-origin items after resolution removes the original and its fork replacement together
and is forbidden. Direct source edits remain valid. Package generation does not read a
consumer's override tree; the packaged CLI continues to apply user > fork > bundled
precedence where its existing emission supports it. No CLI signature changes are required.

Skill directory identity is derived from `replacedClaimantOf(index, item)` or the addition's
own authored directory. APM and CLI use that rule, preserve the winning skill's supported
companion files and refuse unsafe paths and target collisions. Bare additions retain their
bare names; replacements retain the original bundled skill's name. Corpus output without a
fork layer stays byte-identical apart from deliberate release metadata. This 2026-09-10
extension repairs APM's reader of the layer shipped in 1.5.0; the earlier dated design
context remains historical evidence.
The extension shipped in 1.6.0. Its publication and compatibility evidence are recorded at
`docs/plans/005-enterprise-downstream-support.md:222-256`, separately from this document.

The APM skill primitive's frontmatter is the Agent Skills six-key head: `name` and `description`
plus the authored `license`, `compatibility`, `allowed-tools` and `metadata`. Those four are
passed through from the winning `SKILL.md` and are never synthesized, so a key the corpus does
not declare reaches neither the APM primitive nor the CLI projection, and a key it does declare
reaches both (route clause dropped 1.15.0: the citation named the APM generator, which is deleted). Corrected
2026-09-19: the generator dropped the four authored keys, which made one package promise a downstream one thing
through the CLI and another through APM.

Amended 2026-10-14 (plan 020 file 1, run `2026-10-14_cli-native`; the APM half dropped). The heading read "APM
consumes the resolved package layer". 1.15.0 deletes the APM route, and with it `scripts/generate-apm-package.mjs`,
the APM primitive tree and the APM skill primitive, so every clause above that binds them no longer has a subject;
they read at `c96c7146`. The packaged CLI is the one consumer of the resolved layer: it applies user > fork > bundled
precedence where its emission supports it, a replacing skill projects under the bundled skill's emitted directory
and `name` while an addition keeps its bare directory (REQ-FORK-005), its companion files travel with it, unsafe
paths and target collisions are refused, and corpus output without a fork layer stays byte-identical. Those clauses
stand as written. No CLI signature changes.

### REQ-FORK-011 — Public and private compatibility is proved independently

Privacy changes authentication and publication destinations, not catalog precedence.
Independent fixtures specify expected additions, replacements and patches in all four
classes, plus skill support files and collision refusals. Real APM installation verifies
consumer bytes and discovery; a tarball install verifies CLI source edits, fork precedence
and supported clients. Neither a clean textual upstream merge nor successful generation
proves arbitrary downstream source changes semantically compatible; downstream behavior
gates remain necessary. See REQ-APM-006 through -009 in the APM distribution spec.

Amended 2026-10-14 (plan 020 file 1, run `2026-10-14_cli-native`; the APM half dropped). The sentence "Real APM
installation verifies consumer bytes and discovery" has no route left to verify: 1.15.0 deletes the APM route, and
REQ-APM-006 to REQ-APM-009 are retired in `docs/specs/apm-canonical-distribution.md`, which the pointer above names.
What holds is the CLI half: independent fixtures specify the additions, replacements and patches, and a tarball
install verifies CLI source edits, fork precedence and the supported clients. A private fork's release route is
REQ-PLUGIN-028's identity step and REQ-PLUGIN-027's workflow, below.

### REQ-PLUGIN-027 — A fork releases through its own workflow

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`). The text below is the requirement as it stood there at `c96c7146`, its route clauses dropped
in place; the paragraph headed "Amended 2026-10-14" states the workflow as 1.15.0 ships it.

Added 2026-09-26 (plan 010 file 1, E1). `.github/workflows/fork-release.yml` releases a fork's CLI from one tag
(route clause dropped 1.15.0: it read "a fork's CLI, plugin distribution and APM refs"). It is inert until the fork
names its destinations in repository variables, and the canonical `release.yml` stays canonical-only. A fork's release
is proved by checksums and the registry's own authentication. It carries no provenance and no attestation: npm
provenance needs a public source repository, and GitHub attestations need GitHub Enterprise Cloud and are not built
(decided 2026-09-24).

- GIVEN the canonical repository, or a fork whose `STAMITY_FORK_RELEASE` is unset or names another
  repository, WHEN a `v*` tag is pushed THEN the probe job ends green with `armed=false`, and no
  gates or publish job runs.
- GIVEN an armed fork whose `STAMITY_RELEASE_REGISTRY` is not an https URL, or carries userinfo, a
  query or a fragment, WHEN the workflow runs THEN the probe fails naming the variable and never
  prints its value.
- GIVEN an armed fork with all of the following, WHEN the tag is pushed THEN gates run the canonical
  ladder holding no secret, and publish verifies the tarball's digest before npm, publishes the tarball to the
  registry, and creates a release carrying the tarball and its `.sha256` file (route clause dropped 1.15.0: it read
  "verifies every digest before npm, publishes the tarball to the registry, pushes the distribution branch and the
  `plugins/v<version>` tag, and creates a release carrying the tarball, `release.json` and every `.sha256` file"):
  - a tag `v<package.json version>` reachable from the release branch;
  - a package name other than the canonical one;
  - no `private: true`;
  - `publishConfig.registry` equal to the registry variable.
- GIVEN any one of those proofs failing WHEN gates run THEN they fail before any publish step, with
  a remedy naming `scripts/fork-identity.mjs`.
- GIVEN a publish re-run for a version already published with the same integrity WHEN it runs THEN
  npm is skipped and no ref moves (route clause dropped 1.15.0: "a tag that points elsewhere is refused, never
  moved", the guard of the distribution tag, which publish no longer pushes).
- GIVEN the fork guide's "Release your fork" section THEN every `STAMITY_` name it prints is read
  by `.github/workflows/fork-release.yml`, and every `vars.` or `secrets.` name the workflow reads is
  printed there (added from the `docs-guides` unit's report).

The paragraph headed "As built (2026-09-26)" cited the workflow by line before 1.15.0 rewrote it; it reads at
`c96c7146`, and the next paragraph replaces it.

Amended 2026-10-14 (plan 020 file 1, unit `d3-ci-qa`; cited at `d590a266`). The workflow releases a fork's CLI and
nothing else (`.github/workflows/fork-release.yml:1-3`). The **probe** (`:78-164`) ends green with `armed=false` and
a notice for the canonical repository (`:105-112`) and for a fork whose `STAMITY_FORK_RELEASE` is empty or names
another repository (`:114-121`); it refuses a registry that is not https or carries userinfo, a query, a fragment or
white space, naming the variable and never its value (`:123-143`), and a release branch git would not accept as a
name (`:145-157`); it reads the registry once and hands it on as a job output (`:84-90`, `:159-163`). **Gates**
(`:167-334`) hold `contents: read` and no secret (`:173-174`) and output the version, the package name, the tarball and
its SHA-256 alone (`:175-179`). Their proofs (`:209-287`) require, on every run that can publish, the tag
`v<package.json version>` and a commit reachable from the release branch (`:224-248`), a rehearsal skipping those two
and saying so (`:247`); on every run they refuse the canonical name, `private: true`, a `publishConfig.registry` other
than the variable, and, on GitHub Packages, a scope other than the owner (`:250-276`), a failure printing the remedy
naming `scripts/fork-identity.mjs` (`:278-281`). The ladder copied from `release.yml` follows (`:289-311`), then the
pack (`:313-325`), and the job uploads the tarball alone as `fork-release-dist` (`:328-334`). **Publish**
(`:341-561`) runs in the `fork-release` environment with `contents: write` and `packages: write` and no `id-token`
(`:351-357`). It re-checks the destination (`:361-383`), downloads that one artifact (`:385-388`), verifies the
tarball's digest against the gates job's output before anything irreversible (`:392-409`), and holds the tarball's own
members, name, version and registry to the proved ones (`:423-483`). The npm step gives the per-run token only to the
exact GitHub Packages host and `STAMITY_REGISTRY_TOKEN` otherwise, skips a version already published with the same
integrity, refuses one published from another tarball, and publishes with no `--provenance` (`:491-522`). The release
step creates `v<version>` carrying the tarball and its `.sha256`, a re-run uploading only the assets it finds missing
and replacing none, and `--verify-tag` keeps `gh` from inventing a tag (`:524-561`). No step of publish runs `git push`,
so no branch and no tag moves. A dispatch that leaves `dry_run` at its default `true` runs `dry-run-summary` instead of
publish (`:567-602`). The guide's section is `docs/enterprise-forks.md:751-861`.

- GIVEN an armed fork's tag push WHEN publish runs THEN it publishes the npm package and creates the release
  `v<version>` carrying exactly the tarball and its `.sha256`, pushes no branch and no tag, and holds no `id-token`;
  GIVEN a `plugins/` tree left in the workspace THEN none of it is attached (added 2026-10-14;
  `test/ci/forkReleaseWorkflow.test.ts`, the case "attaches the npm assets only, even beside a leftover plugin
  tree").
- **Expand/contract:** the plugin and APM steps left in one change. A fork that merges 1.15.0 takes upstream's side of
  a conflict that falls inside the removed distribution steps (`docs/enterprise-forks.md:359-361`), and a
  distribution branch and tags a fork already pushed stay where they are (`:362-364`). Rollback is a revert of the
  change.
- **Proof:** `test/ci/forkReleaseWorkflow.test.ts`, and the closed lists in `test/ci/workflow.test.ts` that admit
  `fork-release.yml`'s publish job.

### REQ-PLUGIN-031 — A fork release publishes its suffixed version under an explicit npm dist-tag

Added 2026-10-25 (plan 022 file 1, unit `a11-release-workflows`).

Given an armed fork's publish, When npm runs, Then the call is `npm publish "./$TARBALL" --registry "$REGISTRY" --tag
"$DIST_TAG"`, with `DIST_TAG: latest` set once at workflow level, read by the gates rehearsal, the publish and the
rehearsal report alike (`.github/workflows/fork-release.yml:75-78`, `:579`; `dry-run-summary` names the dist-tag,
`:654`). `latest` is the tag the CLI's update notice reads (`probeRegistry`, `src/cli/notice/updateNotice.ts:265-273`).
npm 11 refuses to publish a prerelease, which a fork's suffixed version (`1.10.0-acme.1`) is, without `--tag`
(`fork-release.yml:45-47`).

- **As built:** the delta cited the npm measurement as "measured on 11.21.0, `docs/plans/016-fork-distribution-01.md:1342`";
  that line is a table rule of the unit's cell, so the version measured is not restated here, and the claim rests on
  the workflow's own header. A variable dist-tag channel (plan 016's `STAMITY_RELEASE_DIST_TAG`) is on plan 022 file 1's
  drop list, revisited when a fork asks for a second channel. The guide says the publish names `latest` and why
  (`docs/enterprise-forks.md`, "Tag a release").
- GIVEN the stub-npm publish run THEN it records `publish ./<tgz> --registry <GH Packages> --tag latest` (added
  2026-10-25; `test/ci/forkReleaseWorkflow.test.ts`).
- **Proof:** `test/ci/forkReleaseWorkflow.test.ts`, `test/ci/workflow.test.ts`, `test/docsPages.test.ts` (the fork
  guide's re-attestation).
- **Source:** `.github/workflows/fork-release.yml`.

### REQ-PLUGIN-050 — A fork release is rehearsed before its approval

Added 2026-10-25 (plan 022 file 1, unit `a11-release-workflows` and its fix round for `review/11`; reduced from plan
016's text).

Given any armed run (a tag push, a real dispatch or a rehearsal), When `gates` has packed the tarball, Then it runs
`npm publish "./$TARBALL" --dry-run --registry "$REGISTRY" --tag "$DIST_TAG"` with `contents: read` and no secret, so
npm's refusal stops the run before the `fork-release` approval ("Rehearse the registry publish",
`.github/workflows/fork-release.yml:341-382`). The guide tells a fork to rehearse by dispatch, `dry_run` left at true,
before it pushes the tag (`docs/enterprise-forks.md:796-800`). Plan 016's `distribution.commit` and `release.json`
clauses and its changelog clauses are dropped: 1.15.0 deleted their surface (`fork-release.yml:1-3`).

- **As built, where the delta differed:** the step first requires npm 11 or newer, the npm the publish job runs, and
  exits 1 naming the version where it is older; it prints `npm <version>; dist-tag <tag>`; npm's tag-rule refusal
  ("must specify a tag") and any error but an authentication refusal fail the step; an authentication refusal (`E401`,
  `E403`, `ENEEDAUTH`) passes with a warning that the dist-tag rule was not reached, since what npm does with a
  tokenless dry run against a registry that wants a token was not measured (`review/11`, a declared default: the
  measurement needs a person, the guard asking before any publish line, `--dry-run` included). So the delta's "npm's
  refusal stops the run" holds for every refusal but that one. A dry run uploads nothing.
- GIVEN `gates` THEN exactly one `npm publish` line, after "Pack tarball", carrying `--dry-run`, `--registry "$REGISTRY"`
  and `--tag "$DIST_TAG"`, with `contents: read` and no `secrets.`; GIVEN a parsed copy with `--dry-run` dropped THEN the
  closed list in `test/ci/workflow.test.ts` fails; GIVEN a stub npm answering `10.9.8`, or failing the publish for a
  reason other than authentication, THEN the step exits 1 (added 2026-10-25; `test/ci/forkReleaseWorkflow.test.ts`,
  `test/ci/workflow.test.ts`).
- **Proof:** `test/ci/forkReleaseWorkflow.test.ts`, `test/ci/workflow.test.ts`.
- **Source:** `.github/workflows/fork-release.yml`, `docs/enterprise-forks.md`.

### REQ-PLUGIN-028 — One command sets a fork's identity

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`), and joined by the publisher half of REQ-APM-007, which retires in
`docs/specs/apm-canonical-distribution.md`. The text below is the requirement as it stood there at `c96c7146`, its
route clauses dropped in place; the paragraph headed "Amended 2026-10-14" states the script as 1.15.0 ships it.

Added 2026-09-26 (plan 010 file 1, E2).
`node scripts/fork-identity.mjs --repository <url> [--scope <scope>] [--registry <url>] [--check]`
replaces the guide's copy-paste identity block. It does the following:

- sets the package name `@<scope>/stamity`. The unscoped name stays `stamity` (route clause dropped 1.15.0: "so the
  plugin id, the marketplace name and the command namespace do not change").
- sets the repository, homepage, bugs URL and publisher.
- sets `private: true` without `publishConfig`, or, with `--registry`, sets `publishConfig.registry`
  and no `private`.
- moves the Renovate preset `renovate/companion.json` (route clause dropped 1.15.0: it read "moves the two Renovate
  presets", the second being `renovate/plugins.json`).
- (route clause dropped 1.15.0: "regenerates the plugin and APM manifests".)
- validates through `scripts/distribution-identity.mjs`.

It imports no history and switches no workflow.

- GIVEN a downstream checkout WHEN the command runs with a github.com repository URL THEN every field
  and the companion preset hold the fork's values (route clause dropped 1.15.0: it read "every field and both presets
  hold the fork's values, and both generators' `--check` exit 0").
- GIVEN the command run a second time with the same arguments THEN it exits 0, reports every file
  unchanged, and moves no byte.
- GIVEN `--check` on a tree that differs from the targets THEN it exits 1, names each drifting file,
  and writes nothing.
- GIVEN an invalid identity (a repository URL off github.com, an uppercase scope, an unclean registry
  URL) THEN it exits 1, writes nothing and echoes no URL. GIVEN a file it would change that has
  uncommitted edits THEN it exits 1 naming the file. GIVEN bad arguments THEN it exits 2.
- GIVEN a file already at its target that has uncommitted edits THEN the command proceeds (added from the unit's
  report; route clause dropped 1.15.0: "and GIVEN a generator that fails THEN it exits 1 naming the rerun, and the
  identity it wrote stays in place").
- GIVEN the fork guide's identity step THEN its command block runs `node scripts/fork-identity.mjs --repository`,
  refreshes the lockfile after it, and carries no `node -e` (added from the `docs-guides` unit's report; amended
  2026-10-14: it read "installs first, runs", and the block no longer installs, since the script runs no generator).

The paragraph headed "As built (2026-09-26)" cited the script by line before 1.15.0 rewrote it; it reads at
`c96c7146`, and the next paragraph replaces it.

Amended 2026-10-14 (plan 020 file 1, units `d1-fork-identity` and `d5-scripts-trees`; cited at `d590a266`). The script
writes two targets, `package.json` and the `renovate/companion.json` package pin (`scripts/fork-identity.mjs:220-236`),
and runs no generator; a fork tree that still holds `renovate/plugins.json` has it left byte-identical, and `--check`
exits 0 on such a tree once the identity is set (`:27-30`). Every target is computed and validated before any write
(`:210-238`); a target that would change and has uncommitted edits is refused (`:298-304`); each write is a temporary
file and a rename (`:254-267`); the output is one `updated`, `unchanged` or `drift` line per file, then the identity
line (`:292-314`). The usage and exit codes are its header (`:5-18`), unchanged. `--repository` and `--registry`
refusals echo no value (`:96-119`, `:130-139`).

The check it validates through is `resolveDistributionIdentity` (`scripts/distribution-identity.mjs:29-65`), which
since 1.15.0 checks the publisher alone: the distribution half it resolved through 1.14.0 is deleted with the routes
(`:6-10`). It returns `{ publisher, notices }`. `package.json`'s `stamity` object accepts `publisher` and, for one
release, a leftover `distribution` key, which is never read and earns one fixed notice, "package.json
`stamity.distribution` is ignored since 1.15.0; remove it" (`:16`, `:47`); any other key, or a `stamity` that is not
an object, is refused (`:32-40`). The identity script prints each notice to stderr and its exit code does not change
(`scripts/fork-identity.mjs:288-289`).

The publisher half of REQ-APM-007 holds here: `stamity.publisher` is a GitHub owner slug, checked against the owner
in the normalized `repository.url`, and absent it defaults to `zomarit` (`scripts/distribution-identity.mjs:12-13`,
`:41-46`, `:50-63`); an invalid identity fails with a remedy before any file is written, and no message echoes a
configured value (`:56-62`; `scripts/fork-identity.mjs:213-219`); and no configuration grants permission to publish
publicly (`scripts/distribution-identity.mjs:1-4`). The guide's identity step is `docs/enterprise-forks.md:130-169`,
its command block `:134-137`.

- GIVEN a fork tree that still holds `renovate/plugins.json` WHEN the script applies, reruns and runs under `--check`
  THEN each exits 0, the preset's bytes and git status are unchanged, and no output line names it
  (`test/ci/forkIdentityScript.test.ts`, "leaves a fork's leftover renovate/plugins.json untouched, applied, rerun and
  under --check"; added 2026-10-14).
- GIVEN a `package.json` whose `stamity` carries `distribution` THEN `resolveDistributionIdentity` returns the notice
  and the publisher, and `fork-identity.mjs --check` exits 0; GIVEN `distribution` beside any other unknown key, or a
  `stamity` that is not an object, THEN it is refused, echoing no value (`test/ci/distributionIdentity.test.ts`; added
  2026-10-14).
- **Proof:** `test/ci/forkIdentityScript.test.ts`, `test/ci/distributionIdentity.test.ts`; the opt-in
  `STAMITY_FORK_SUITE` group of `test/ci/forkIdentity.test.ts` runs the script; the guide's pin is the fork-guide
  rename case of `test/docsPages.test.ts`. The gap recorded before stays: with `--registry https://npm.pkg.github.com`,
  a `--scope` other than the owner is accepted here and refused later by REQ-PLUGIN-027's gates.

### REQ-PLUGIN-048 — A registry fork's every pinned CLI call names its registry for its scope

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`). The text below is the requirement as it stood there at `c96c7146`, its route clauses dropped
in place. Its call-form half is REQ-FLOW-002's in `docs/specs/everyday-flows.md`.

Added 2026-10-07 (plan 016 file 0, unit `u0-registry-bound-calls`). A fork made with `fork-identity.mjs --registry
<url>` publishes `@<scope>/stamity` to its own registry, and npx finds a scope's registry only in npm's configuration:
on a machine without the scope mapping, a bare `npx -y @<scope>/stamity@<v>` asks the default registry, where anyone may
hold that name. So every pinned call the CLI renders for such a fork — the emitted bodies, hook hints, guard messages,
`.codex/hooks.json`, the CLI's remedies, the update banner and `sync --help` (route clause dropped 1.15.0: "and the
plugin roots' bodies") — names the registry for the scope ahead of the package:
`npx -y --@<scope>:registry=<url> @<scope>/stamity@<version> <verb>`. npm then takes the fork's package from the fork's
registry and every other package from the default one. The canonical build and a fork with no
`publishConfig.registry` render what they rendered before. A registry that is not a plain https URL is never written
into a command; such a fork renders `npx --no`, which fetches nothing.

Amended 2026-10-07 (build): such a fork is not made in the first place — `scripts/fork-identity.mjs --registry` refuses
a URL outside the same `REGISTRY_URL` grammar at fork creation, naming the rule and never echoing the value, so one
grammar holds from the fork to every rendered call.

- GIVEN a fork whose `package.json` names `publishConfig.registry` WHEN `init` writes four clients THEN every pinned call
  carries `--@<scope>:registry=<url>` before the package spec, and none is bare.
- GIVEN the same fork THEN `sync --help` and the update banner name the registry the same way; GIVEN the canonical
  package THEN every surface is byte-identical to before.
- GIVEN a stub fork registry and a stub default registry that serves a look-alike under the fork's name WHEN the
  rendered call runs on a machine with no scope mapping THEN the fork's build runs and the default registry is asked only
  for unscoped dependencies.
- GIVEN a registry with credentials, a query, a fragment or a shell metacharacter THEN no call names it and the CLI's
  calls render `npx --no`.
- GIVEN `scripts/fork-identity.mjs --registry` with a URL outside `REGISTRY_URL` (`https://r.example/a%20b`,
  `https://u:p@r.example`, one holding `$` or a space) THEN it exits 1 with nothing written, the message names the plain
  https rule, and no output line contains the value (added from the build).

As built (2026-10-07): measured 2026-10-06, a `--registry` fork wrote 44 pinned calls in 23 files with no registry;
against local registry stubs, npm 10.9.8, 11.21.0 and 12.2.0 alike ran a public look-alike for the bare call, the fork's
build for the scoped-registry call, and failed with 404 for `--registry <url>`. The rendering is `scopeRegistryArg` and
`REGISTRY_URL` in `src/shared/cliCall.ts` (route clause dropped 1.15.0: it read "restated in
`scripts/plugins/tokens.mjs` and held equal by `test/ci/pluginModules.test.ts`"); the identity read is `npmRegistry()`
and `packageCommandAt` in `src/cli/kit/packageName.ts`. Tests: `test/shared/cliCall.test.ts`,
`test/emit/noBareCliCall.test.ts`, `test/corpus/npxScopeRegistry.test.ts`, `test/cli/commands/sync.test.ts`,
`test/cli/notice/updateNotice.test.ts`, `test/ci/forkIdentityScript.test.ts`. Plan 016 file 2's `u2-upgrade-verb` uses
the same rendering (route clause dropped 1.15.0: "and `u2-apm-placeholders`").

Amended 2026-10-14 (plan 020 file 1, unit `d1-fork-identity`; cited at `d590a266`). The substance is unchanged. The
restatement the script applies is `REGISTRY_URL` in `scripts/registry-url.mjs:13`, equal in `source` and `flags` to
`REGISTRY_URL` in `src/shared/cliCall.ts:100`; `scripts/fork-identity.mjs` imports it (`:48`) and refuses through it
(`requireCleanRegistry`, `:130-139`).

- GIVEN the two `REGISTRY_URL`s THEN their `source` and `flags` are equal (`test/ci/forkIdentityScript.test.ts`,
  "restates the CLI's REGISTRY_URL in scripts/registry-url.mjs, equal in source and flags"; added 2026-10-14). GIVEN
  `--registry https://r.example/a%20b` THEN the script exits 1, names `--registry`, echoes neither `r.example` nor
  `a%20b`, and moves no target (the same file, "refuses a registry with a percent escape in its path, exit 1, without
  echoing it").

## Acceptance criteria

- GIVEN no `fork/` directory WHEN the index, the plan and the goldens are built THEN they are
  byte-identical to today's, and the cross-client goldens do not move.
- GIVEN `fork/rules/security.md` WHEN the index is built THEN the corpus rule with id
  `security` is replaced whole, `originOf` says `fork`, a shadow row names the corpus claimant,
  and every selected client's rules location carries the fork's body.
- GIVEN `fork/agents/reviewer.customize.yaml` WHEN the index is built THEN the corpus agent
  carries the patched frontmatter, the item's origin stays `corpus`, and `validate` reports a
  `patched` row naming the fork file.
- GIVEN both `fork/rules/security.md` and `fork/rules/security.customize.md` THEN the index
  refuses with the exclusivity error naming both files.
- GIVEN `fork/rules/security.md` and `.stamity/overrides/rules/security.md` in a consumer
  repository THEN the user override wins, the fork item leaves the index, and the shadow row
  lists both lower claimants.
- GIVEN a pack and a fork item claiming one id, in either install order, THEN the pack is
  refused on contact and the message names the fork file and both remedies.
- GIVEN a pack skill and a fork skill claiming one id THEN the pack is refused on contact, the
  message names the consumer's two remedies, and on the fork's side it says a pack skill cannot be
  patched and names shipping the fork's skill under another id, with no `SKILL.customize.*` file
  (added 2026-10-06, review row `review/60`; `test/content/catalog.test.ts:1644`).
- GIVEN `fork/rules/ops.customize.yaml` where only a pack supplies `ops` WHEN the pack is not
  installed THEN the index builds, the patch is skipped, and `validate` shows a warning that it
  waits for the pack; WHEN the pack is installed THEN the patch applies.
- GIVEN `fork/skills/acme-lint/SKILL.customize.md` and an installed pack supplying skill `acme-lint`
  WHEN the index is built THEN the pack skill is unchanged and each half is skipped with a reason
  naming the pack and the skill, and `validate` reports it as a warning and exits 0 (added 2026-10-06;
  `test/content/overlayPackSkill.test.ts:185`, `:273`).
- GIVEN `fork/rules/security.customize.yaml` and a consumer override of `security` THEN the
  index carries the override, and `validate` reports the fork patch as inert under it.
- GIVEN `fork/rules/stamity-security.md` THEN the index refuses, naming `security.md`.
- GIVEN `fork/skills/acme-review/SKILL.md` THEN the skill projects to every client's skills
  location the corpus skills reach under its bare directory; GIVEN `fork/skills/verify/SKILL.md`
  replacing the bundled `st-verify` THEN it projects under `st-verify` with that `name` and no
  bare directory is emitted; GIVEN a fork skill claiming a pack skill's id THEN it is refused.
- GIVEN a `fork/` directory in a built package THEN `dist/fork/**` exists and its bytes count
  in the corpus budget.
- GIVEN a fork checkout with `fork/rules/security.md` WHEN the lane's census runs THEN a
  shadow pair maps it to `content/rules/stamity-security.md`, and a release that changes that
  file produces a `shadowed` row.

## Non-goals for v1

- Selecting fork artifacts per tier or per tool through the manifest: a fork ships what it
  put there; a fork that wants per-repository choice uses the consumer override tree.
- Fork-level hooks, MCP servers or agent grants: those remain pack and engine inputs.
- Counting fork artifacts in this repository's README or census: both read `content/`.

## Test plan sketch

`test/content/catalog.test.ts` (precedence, shadows, patches, exclusivity, prefix refusal,
absent-directory identity, pack refusal), the fork-root cases in `test/content/contentRoot.test.ts` beside the content-root
tests, `test/cli/engine/emission.test.ts` (fork body to every client; skills), `test/emit/`
(the planner's three origin seams under the paired shape), `test/cli/commands/validate.test.ts`
(the fork rows), `test/support/support.test.ts` (the budget prefix), `test/upstream/lane.test.ts`
(the derived pairs with the prefix restoration), and the cross-client goldens untouched.

## Risks

- A fork skill's projection directory colliding with a corpus skill it does not shadow is the
  same clash the user layer refuses; held by reusing that refusal.
- Reference pages in a fork now render fork artifacts; the count line moves with them, which is
  what a fork's own reference should say — stated in the guide.
- Adding a fourth part to `ContentRoots` touches every carrier; the census names each one, and
  the paired-shape tests in `test/emit/plannerOverlay.test.ts` are extended rather than
  bypassed.
