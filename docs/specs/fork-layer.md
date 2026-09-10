---
id: fork-layer
# A design document, authored outside the spec command and excluded from the site build.
status: shipped-with-1.5.0
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
at `f62d526` (main after the 1.4.0 release and the post-release cleanup).

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

### REQ-FORK-010 — APM consumes the resolved package layer

`scripts/generate-apm-package.mjs` emits reachable corpus and fork winners from the catalog,
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

### REQ-FORK-011 — Public and private compatibility is proved independently

Privacy changes authentication and publication destinations, not catalog precedence.
Independent fixtures specify expected additions, replacements and patches in all four
classes, plus skill support files and collision refusals. Real APM installation verifies
consumer bytes and discovery; a tarball install verifies CLI source edits, fork precedence
and supported clients. Neither a clean textual upstream merge nor successful generation
proves arbitrary downstream source changes semantically compatible; downstream behavior
gates remain necessary. See REQ-APM-006 through -009 in the APM distribution spec.

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
- GIVEN `fork/rules/ops.customize.yaml` where only a pack supplies `ops` WHEN the pack is not
  installed THEN the index builds, the patch is skipped, and `validate` shows a warning that it
  waits for the pack; WHEN the pack is installed THEN the patch applies.
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
