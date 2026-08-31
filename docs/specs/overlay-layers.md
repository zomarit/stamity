# Overlay customization layers

Field-level customization of a shipped artifact: `.customize.yaml` patches its
frontmatter, `.customize.md` appends to its body. This spec designs the surface
three module headers have promised and nothing has read.

Every claim about existing behaviour below carries a `path:line` citation taken
from the tree at the time of writing. Citations are code spans rather than
links: they address lines, which no link form can resolve, and a spec that
cannot be checked against the code is prose.

## Intent

Give a repo a way to change one field of a bundled agent, rule, command or skill
without taking a copy of the whole artifact.

Replacement — layer 1, implemented — is all-or-nothing: an author who wants a
different `description` on a shipped rule must copy the entire body into
`.stamity/overrides/rules/<slug>.md` and then carry that copy forward past every
upstream edit to the original. The copy is the cost, and it is paid in silence:
the shipped body keeps improving, the override does not, and nothing reports the
divergence because a shadow is a legitimate state
(`src/content/catalog.ts:242-251`).

An overlay is the smaller instrument. It states the delta and nothing else, so
the base artifact keeps flowing from the corpus or the pack that supplies it,
and the patch survives an upstream rewrite of everything it did not name.

## Context

### The promise, and the four places it is written down

The overlay surface is documented as shipped behaviour in four module comments
and implemented nowhere:

- `src/content/userContent.ts:71-75` — "Declared gap: this module and the walk
  it feeds implement customization by REPLACEMENT… The `.customize.yaml` and
  `.customize.md` overlay surfaces (layers 2 and 3 of the four-layer precedence)
  are read by nothing here and by nothing downstream."
- `src/content/catalog.ts:53-58` — "Declared gap, ONE half… an artifact is
  customized by taking its id, not by patching its frontmatter or appending to
  its body."
- `src/cli/engine/emission.ts:71-73` — "Declared gap — `.customize.yaml` and
  `.customize.md`, layers 2 and 3 of the four-layer precedence, are read by
  nothing on this path."
- `src/guard/promptGuard.ts:37` — "Cap on user-authored content (learnings,
  handoffs, customize bodies)." This one is not marked as a gap; it names the
  overlay body as a thing the cap already binds.

The first three are honest about being unimplemented. The fourth reads as
description of a live surface. Nothing else in the tree — no naming convention,
no placement rule, no class scope, no merge semantics — exists, and no
`.customize.*` file exists on disk.

### What layer 1 does today, precisely

Three roots feed one index in precedence order USER > PACK > CORPUS
(`src/content/catalog.ts:41-51`). The layer resolve is one loop
(`src/content/catalog.ts:466-502`): within a layer the first claimant of an id
wins and a second is reported as a duplicate; a pack claiming an id the corpus
already holds is refused outright (`src/content/catalog.ts:479-489`); a user
artifact claiming a lower layer's id takes it and the replaced items leave
`items` entirely — "one identity, one body"
(`src/content/catalog.ts:505-511`). What was replaced survives only as a
`ContentShadow` row (`src/content/catalog.ts:539-564`).

The item that resolve produces is the patchable model. `CatalogItem`
(`src/content/catalog.ts:95-139`) carries a frontmatter map and a body;
`description`, `tags`, `precedence` and `tools` are derived from that map by
`buildItem` (`src/content/catalog.ts:805-849`) through closed-vocabulary checks
— `requireEnum` over `RULE_PRECEDENCES`, `requireStringArray` over `tags`,
`extractToolsFrontmatter` over the closed `TOOLS` set
(`src/content/frontmatter.ts:159-181`). `id` and `type` are identity.
`origin`, `provenance`, `filePath` and `relativePath` are stamped by the walk
and are not frontmatter at all.

### The gap is worse than "read by nothing"

The research handed over said the `.md`-only extension filter makes
`.customize.*` files invisible. That is true of one half and false of the other,
and the difference changes a requirement:

- `.customize.yaml` **is** excluded by the extension filter
  (`src/content/catalog.ts:717-719`, `src/content/userContent.ts:396-400`).
  It is dropped before any read, and it is not reported: `SkippedUserEntry`
  covers symlinks only (`src/content/userContent.ts:356-388`).
- `.customize.md` is **not** excluded by that filter. It ends in `.md`, so it
  becomes a walk candidate, and it is dropped one step later by the
  no-frontmatter skip (`src/content/catalog.ts:765`) — also silently. A
  `.customize.md` that happens to carry a frontmatter block is worse than
  dropped: it indexes as a phantom artifact under the id `<slug>.customize`,
  because a dot passes `assertSafePath` (`src/content/catalog.ts:336-360`) and
  the filename slug is the id when none is declared
  (`src/content/catalog.ts:813-819`).

So the surface fails three different ways and reports none of them. Silent
invisibility is the bug class this spec closes, which is why every failure below
is loud.

### What has no vocabulary for a patch

`stamity validate` knows two outcomes for a contested identity: `replaces <x>`,
and `takes the id of <x> — not emitted, the bundled body is still what ships`
(`src/cli/commands/validate.ts:582-597`, over `ValidateShadow`,
`src/cli/commands/validate.ts:71-93`). A patched item is neither. `LedgerEntry`
(`src/types/manifest.ts:76-97`) has no field for it and, per REQ-OVERLAY-013,
needs none.

### The dependency

Skill overlays index under this spec and do not emit until lane D11 lands.
`OVERRIDE_EMITTING_CLASSES` is `agent`, `rule`, `command`
(`src/cli/engine/emission.ts:92-100`); `skill` is absent because the projection
takes a bare corpus-root string with no slot to narrow into
(`ProjectSkillsOptions.contentRoot`, `src/emit/skillsProjection.ts:141`, feeding
`buildContentIndex` at `src/emit/skillsProjection.ts:167`).

## Invariants

Floors for this lane. They hold whatever the merge does.

1. **Identity never moves.** An overlay cannot change the `id` or the `type` of
   the artifact it patches. Those are what address it.
2. **One identity, one body.** The merged artifact is one item at one id, with
   one base file on disk. The overlay adds no second claimant.
3. **The effective precedence chain is declared, not counted.** Two chains
   exist, and exactly one applies to any `(class, id)`:
   - corpus-or-pack → `.customize.yaml` → `.customize.md`
   - corpus-or-pack → full override (`<slug>.md` in the override tree)

   They are mutually exclusive (REQ-OVERLAY-004). The phrase "four-layer
   precedence" is retired: it counted a canonical layer and three customization
   layers that were never simultaneously reachable, and counting them is what
   made the surface unimplementable without first deciding what layer 2 applied
   to.
4. **Fail closed, name the file and the field.** Parity with decision 13. Every
   overlay defect throws `VALIDATION_ERROR`, stops the sync, and names the
   absolute path plus the offending field or condition.
5. **A repo with no overlay files is byte-identical.** No item changes, no
   report line appears, no ledger row moves, no emitted byte differs.
6. **Author bytes stay author-owned.** Overlay files live inside
   `.stamity/overrides/`, which no emission path targets
   (`src/cli/engine/emission.ts:74-81`): never planned, never wrapped in a
   managed block, never reclaimed.

## Requirements

Each requirement states the decision, why it was taken, and the alternative it
rules out. All fifteen were settled here; the operator delegated the design and
none of them is left open.

### REQ-OVERLAY-001 — Placement is a per-artifact sibling in the override tree

**Decision.** Overlay files live beside the full override they are an
alternative to, under `<rootDir>/.stamity/overrides/`:

| Class | Layout | Frontmatter patch | Body patch |
|---|---|---|---|
| `agent` | file | `agents/<slug>.customize.yaml` | `agents/<slug>.customize.md` |
| `rule` | file | `rules/<slug>.customize.yaml` | `rules/<slug>.customize.md` |
| `command` | file | `commands/<slug>.customize.yaml` | `commands/<slug>.customize.md` |
| `skill` | directory | `skills/<slug>/SKILL.customize.yaml` | `skills/<slug>/SKILL.customize.md` |

`<slug>` is the filename slug the walk already derives — `slugOf`
(`src/content/catalog.ts:909`), which strips the reserved `stamity-` and `st-`
filename prefixes. For commands this is the bare slug, not the `cmd-`-prefixed
catalog id, exactly as a full override's filename is
(`src/content/catalog.ts:819`). Either file may appear without the other.
Overlays never sit beside a corpus or a pack file.

**Rationale.** The override tree is the one tree the engine writes into and
never emits into, and that ownership split is already stated and already held
(`src/cli/engine/emission.ts:74-81`, `src/content/userContent.ts:60-69`). An
overlay placed there inherits the whole contract with no new rule. Deriving the
target id from the filename rather than from a key inside the file means the
address is visible in a directory listing and cannot disagree with itself.

**Dropped.** A separate `overrides/customize/<class>/<id>.yaml` index tree —
one more convention to learn, and it puts the two halves of one patch in a
different place from the replacement they are an alternative to. Corpus-adjacent
placement is dropped outright: it would put author bytes inside the tree the
corpus walk and the pack walk read, which is framework territory.

### REQ-OVERLAY-002 — Discovery is a distinct pass, and `.customize.md` is never an artifact candidate

**Decision.** The override-tree walk gains an overlay discovery pass that lists
`*.customize.yaml` and `*.customize.md` for file-layout classes, and
`SKILL.customize.yaml` / `SKILL.customize.md` inside each skill directory. In
the same change, the artifact candidate filters
(`src/content/catalog.ts:717-719`, `src/content/userContent.ts:396-400`) are
narrowed so that a name ending `.customize.md` is never a candidate artifact in
any layer.

A skill directory that holds overlay files and no `SKILL.md` is an overlay
carrier, not work in progress. A skill directory holding neither remains work in
progress and is still passed over in silence
(`src/content/userContent.ts:346-348`).

**Rationale.** Without the narrowing, the body patch is simultaneously an
overlay and a phantom artifact at id `<slug>.customize` — the defect evidenced
in the context section. The filter change is not an optimisation; it is what
makes the two files mean one thing each.

**Dropped.** Renaming the halves to something the `.md` filter already excludes
(`<slug>.customize.patch`, `<slug>.overlay.txt`). The `.customize.` infix is
what three module headers already promise, and a doc-visible surface is cheaper
to implement than to rename.

### REQ-OVERLAY-003 — An overlay targets the shadow-resolved item

**Decision.** An overlay for `(class, slug)` applies to whichever item the
layered walk RESOLVES for that `(class, id)` — the corpus artifact, or the pack
artifact, whichever holds the key after the resolve loop
(`src/content/catalog.ts:466-502`). Application runs after that loop and before
`items` is assembled (`src/content/catalog.ts:505-511`).

**Rationale.** "The artifact currently in force" is the only target that stays
correct when a pack is installed or removed, and it is unambiguous by
construction: a pack that claims an id the corpus already holds is refused at
the walk (`src/content/catalog.ts:479-489`), so the resolved base is never
contested between those two layers.

**Dropped.** Targeting the corpus item specifically. It reads simpler and is
wrong the first time a pack legitimately supplies the id: the author would patch
a body nobody emits, and the report would say the patch applied.

### REQ-OVERLAY-004 — An overlay and a full override of one id are refused together

**Decision.** For one `(class, slug)`, an overlay file and a full override
(`<slug>.md`, or `<slug>/SKILL.md` for a skill) present at the same time is a
refusal at read time. The message names both absolute paths and says which one
to remove.

**Rationale.** A full override is the author's own file. Patching it means
editing it, so the combination has no use case that a text editor does not serve
better. Refusing it is also what keeps invariant 3 legible: with the exclusivity
in place, an id is either replaced or patched, and `validate` has exactly two
customization outcomes to print instead of four.

**Dropped.** Letting the overlay apply on top of the full override — the literal
reading of the retired "four-layer" phrasing. It buys the ability to patch your
own bytes and costs the comprehensibility of every downstream report.

### REQ-OVERLAY-005 — Frontmatter merge is a shallow key set, with null as removal

**Decision.** `.customize.yaml` is a YAML document whose root is a map, parsed by
the existing strict parser (`src/content/frontmatter.ts:94-107`). Merging it
over the base frontmatter map:

- a key present in the overlay **replaces** the base value entirely;
- a key whose value is YAML null — written `key:` or `key: null` — is
  **removed** from the merged map;
- a key absent from the overlay is **untouched**;
- list-valued keys (`tags`, `tools`) replace whole. There are no append or
  remove verbs in v1;
- a nested map replaces whole. The merge does not recurse.

Key ORDER of the merged map is the base's order for every key the base declared,
with overlay-only keys appended in the order the overlay declared them.

**Rationale.** Predictability over power. Every merge verb is a second language
an author writes and a reviewer has to simulate, and the corpus frontmatter is
flat — `id`, `type`, `description`, `tags`, `load`, `obsolete_when`,
`precedence`, `tools` — so a recursive merge would have no nested field to act
on today and would fix its semantics before any field needed them. Declared key
order keeps a re-emitted head diff-minimal rather than reshuffled.

**Dropped.** Append verbs (`tags+:`) and JSON-Merge-Patch-style recursion: both
are v2 candidates that a real use case can justify later. List UNION as the
default is dropped on a stronger ground — it is the option that looks helpful
and is not, because under union a tag can never be REMOVED without introducing
the verb anyway, so the first author who needs a removal pays for the union
twice.

### REQ-OVERLAY-006 — `id` and `type` in an overlay are a refusal

**Decision.** An `id` or `type` key in a `.customize.yaml` — at any value, null
included — is refused, naming the file and the key.

**Rationale.** They are the identity the overlay is addressed BY. A patch that
moved either would silently re-target itself and orphan its own base. The
walk-stamped fields (`origin`, `provenance`, `filePath`, `relativePath`) need no
rule: they are not frontmatter, so an overlay cannot reach them
(`src/content/catalog.ts:829-842`).

**Dropped.** Ignoring the keys with a warning. An ignored key is
indistinguishable from a working one to the author who wrote it, which is the
same silence this lane exists to end.

### REQ-OVERLAY-007 — Body merge is append-only

**Decision.** `.customize.md` carries a body and nothing else. Its full text is
appended after the base body, separated by exactly one blank line. It declares no
frontmatter: a `---` fence at the head of a `.customize.md` is a refusal naming
the file, and it points the author at the `.customize.yaml` half.

**Rationale.** Append is the only insertion the corpus can support today. No
section-anchor convention exists in any of the four classes, so an anchored
insert would have to invent one, and an invented anchor fails at the first
artifact it is pointed at. Refusing the fence rather than ignoring it follows
from REQ-OVERLAY-006's reasoning: an author who writes frontmatter there means
it to apply.

**Dropped.** Prepend — a prepended note lands above the artifact's own first
heading and reads as the artifact's opening, which is the one position that
changes how a client renders the file. Section-anchored insertion and
placeholder substitution are named non-goals for v1 (see below).

### REQ-OVERLAY-008 — The merged artifact is materialized and built by the existing path

**Decision.** The merged frontmatter map and merged body are composed back into
a single document with `composeFrontmatter` (`src/content/frontmatter.ts:122-129`)
and that document is handed to `buildItem` (`src/content/catalog.ts:805-849`) as
`raw`, alongside the merged map and merged body. The resulting item keeps the
BASE artifact's `filePath`, `relativePath`, `origin` and `provenance`. The
`source` label used for refusal messages is a composite: the base file's absolute
path, plus the absolute paths of the overlay files applied.

**Rationale.** This is what makes "re-validates through the exact `buildItem`
checks" implementable rather than aspirational. `buildItem` reads `tools` by
re-parsing the RAW document text, not the frontmatter map
(`src/content/catalog.ts:825-827` into `src/content/frontmatter.ts:159-165`), so
a merge that produced a map with no raw twin would either skip the closed
tool-vocabulary check or need a second implementation of it — and a gate that
disagrees with itself is the defect `src/content/userContent.ts:32-38` already
records. `composeFrontmatter` is documented as making parse → compose → parse an
identity on both halves (`src/content/frontmatter.ts:109-121`), which is exactly
the property the round trip needs. The composite `source` label gives
decision-13 naming parity for free: every `require*` and
`extractToolsFrontmatter` message is already prefixed `${source}:` and already
names the field, so both files and the field appear in one line with no new
plumbing.

**Dropped.** Validating the overlay in isolation and then merging: a removal is
only judgeable against its base — `description:` is a no-op alone and a missing
required field once merged. A bespoke merged-item builder is dropped for the
divergence reason above. Per-key blame (naming which of the two files supplied
the offending key) is dropped for v1: it needs a provenance-carrying map through
the YAML parser, and the composite label already puts the author in front of
both candidate files with the field named.

### REQ-OVERLAY-009 — Every overlay defect fails closed, naming file and field

**Decision.** The walk throws `VALIDATION_ERROR`, sync stops, and `check`
reports `drift: not evaluated` — decision-13 parity — for each of:

| Defect | Named in the message |
|---|---|
| `.customize.yaml` is not valid YAML | absolute path, parser detail |
| its root is not a map | absolute path |
| it declares `id` or `type` | absolute path, the key |
| `.customize.md` opens with a `---` fence | absolute path |
| an overlay coexists with a full override | both absolute paths |
| the overlay is an orphan | absolute path, the id looked for |
| the merged artifact fails any `buildItem` check | composite label, the field |

**Rationale.** Parity with the settled posture for a malformed override, and
with the reason it was settled: a walk that carries on past a defective artifact
indexes a half-formed entry, which is worse than a run that stops and names the
file (`src/content/catalog.ts:35-39`).

**Dropped.** Warn-and-skip — report the overlay as ignored and emit the base.
Rejected because its observable outcome is exactly today's bug: a tree that
looks customized and a sync that ships the bundled body. The walk already
records that outcome as the reason its symlink skip was made loud
(`src/content/catalog.ts:687-695`).

### REQ-OVERLAY-010 — An orphan overlay is an error

**Decision.** An overlay whose `(class, slug)` resolves to no item in the merged
index is an error. The message names the overlay file and the id it looked for.

**Rationale.** An overlay is addressed by its filename, so a filename typo is
the single likeliest authoring mistake and is otherwise undetectable — the
author sees a file on disk and an unchanged artifact, with no signal connecting
the two.

**Dropped.** Treating an orphan as a forward declaration for an artifact a pack
will supply later. No lifecycle in the engine makes that state legible, and the
error text ("remove the file, or correct the name") is a one-step fix either
way.

### REQ-OVERLAY-011 — `validate` gains a third customization outcome, `patched`

**Decision.** The report row type (`ValidateShadow`,
`src/cli/commands/validate.ts:71-93`) gains a discriminator distinguishing
`replaced` from `patched`. A `patched` row carries the class, the id, the base
artifact's content-root-relative path and its origin (`corpus`, or the pack id),
and the repo-relative paths of the overlay files applied. The shadowing block
(`src/cli/commands/validate.ts:582-597`) prints it as a third line shape. `emits`
keeps its meaning and its `OVERRIDE_EMITTING_CLASSES` derivation
(`src/cli/commands/validate.ts:296-302`). A `patched` row is information and
never moves the exit code, exactly as a shadow does not
(`src/cli/commands/validate.ts:56`).

**Rationale.** Today's two outcomes are both false of a patched item: nothing
was replaced, and nothing left the index. A report that squeezed a patch into
either row would be wrong in both directions.

**Dropped.** Emitting a patch as a finding. A patch is the customization lane
working, which is the same argument that keeps a shadow out of the findings
channel.

### REQ-OVERLAY-012 — One gate judges the merged artifact, at the two lanes that already judge

**Decision.** `stamity validate` materializes the merged artifact (REQ-OVERLAY-008)
and runs `checkUserArtifact` (`src/content/userContent.ts:469-503`) over it,
whole: required frontmatter, id/filename agreement, lifecycle declarations,
deny-scan over frontmatter keys, values and comments, and
`validateContentBody`'s body judgment with its lean line cap. The save path
(`saveUserContent`, `src/content/userContent.ts:265`) gains the same treatment
when it writes an overlay. Two clarifications the merge forces:

- The id/filename agreement check reads the BASE's identity, since the merged
  artifact's file is the base's file.
- The 250 000-character user-content ceiling
  (`MAX_USER_CONTENT_LENGTH`, `src/guard/promptGuard.ts:38`) binds the overlay
  body, which is what that constant's own comment already claims.

Emission does not deny-scan an overlay, for the reason it does not deny-scan
anything: a scan at emission time reprints the author's own flagged text on every
sync (`src/cli/engine/emission.ts:86-89`).

**Rationale.** One gate, two callers, unchanged. `src/content/userContent.ts:32-38`
records what happened the last time a second lane grew checks of its own — an
artifact landed through one surface and was reported by the other.

**Dropped.** An overlay-only linter. It is the divergence above, pre-built.

### REQ-OVERLAY-013 — No overlay files means byte-identical, and the ledger is untouched

**Decision.** The discovery pass returns empty for an absent or overlay-free
override tree; no item changes, no report row appears, and no emitted byte
differs. `LedgerEntry` (`src/types/manifest.ts:76-97`) gains no field: a patched
item IS the item, emitted under the base's `artifactId` and `artifactType`, and
`contentHash` already covers content drift.

**Rationale.** The override layer is already held to exactly this property —
"indexes identically with and without an override root, so no shipped lane
regresses" (`test/content/catalog.test.ts:486`) — and the overlay layer earns the
same case. On the ledger: its job is reclaim and drift over EMITTED paths, and an
overlay source file is never an emitted path
(`src/cli/engine/emission.ts:74-81`), so a `patched` flag there would be state
nothing reads.

**Dropped.** A `patched: true` ledger field, for the reason above.

### REQ-OVERLAY-014 — All four classes index; skill emission waits on lane D11

**Decision.** Overlays apply to all four content classes at the index. `agent`,
`rule` and `command` reach emission today (`OVERRIDE_EMITTING_CLASSES`,
`src/cli/engine/emission.ts:92-100`). `skill` does not, because the skills
projection takes a bare corpus-root string
(`src/emit/skillsProjection.ts:141,167`), so a skill overlay indexes and does not
emit until lane D11 widens that option to the full `ContentRoots` spec. This spec
does not make D11's edit. While `skill` is outside
`OVERRIDE_EMITTING_CLASSES`, a `patched` row for a skill carries `emits: false`
and says the bundled body is still what ships — the wording the `replaced` row
already uses for that case (`src/cli/commands/validate.ts:591-595`).

**Rationale.** The index-level behaviour is class-uniform, and the emission
carve-out already exists and is already reported. If D11 lands first, as the
batch order intends, skill overlays emit with no further edit here — the merge
happens inside the walk the widened projection reads.

**Dropped.** Shipping three classes and adding `skill` later. It would create a
second class carve-out, at the index, beside the one at emission — and the two
would then have to be kept in agreement.

### REQ-OVERLAY-015 — The pinned negative test and the four comments migrate with the implementation

**Decision.** `test/corpus/commands/lightTrio.test.ts:756-764` asserts that the
creator agent's body mentions neither `.customize.` nor a four-layer precedence.
It gates the behaviour this spec changes, so it is rewritten in place — not
deleted, not skipped — in the same change, carrying an inline reason naming what
about the contract changed. Its replacement asserts the positive: the creator
body names both overlay files, states the effective precedence chain of
invariant 3, and states the exclusivity refusal of REQ-OVERLAY-004. In the same
change the three declared-gap comments
(`src/content/userContent.ts:71-75`, `src/content/catalog.ts:53-58`,
`src/cli/engine/emission.ts:71-73`) are rewritten to describe what the code now
does, and `src/guard/promptGuard.ts:37` becomes accurate rather than
aspirational.

**Rationale.** Leaving the negative case green would require the creator agent to
go on hiding a shipped surface from the authors it exists to serve. Rewriting
rather than deleting is what the repository's testing rule requires of a gating
test, and it leaves a record that the claim moved.

**Dropped.** Deleting the case. A deleted gating test leaves nobody a way to see
that the contract changed.

## Acceptance criteria

One set per requirement. Thirty-two criteria; each is machine-checkable unless
tagged otherwise.

**REQ-OVERLAY-001**

- GIVEN an override tree holding `rules/my-rule.customize.yaml` and no other
  file WHEN the index is built THEN the overlay is discovered for
  `(rule, my-rule)`.
- GIVEN `skills/my-skill/SKILL.customize.md` and no `SKILL.md` in that directory
  WHEN the index is built THEN the overlay is discovered for
  `(skill, my-skill)` and the directory is not reported as work in progress.

**REQ-OVERLAY-002**

- GIVEN `commands/deploy.customize.yaml` WHEN the index is built THEN it is
  discovered as an overlay and never as an artifact candidate.
- GIVEN `rules/my-rule.customize.md` whose text opens with a frontmatter fence
  WHEN the index is built THEN no item with id `my-rule.customize` exists in the
  index (the file is refused per REQ-OVERLAY-007, and is a candidate artifact in
  no code path).
- GIVEN an override tree with no `.customize.*` file WHEN the index is built
  THEN the overlay discovery pass reports nothing at all.

**REQ-OVERLAY-003**

- GIVEN a corpus rule `my-rule` and `rules/my-rule.customize.yaml` WHEN the index
  is built THEN the merged item's `origin` is `corpus` and its
  `relativePath` is the corpus file's.
- GIVEN an installed pack supplying agent `my-agent`, no corpus artifact of that
  id, and `agents/my-agent.customize.yaml` WHEN the index is built THEN the
  overlay applies to the pack item and the merged item keeps that pack's
  `provenance`.

**REQ-OVERLAY-004**

- GIVEN both `rules/my-rule.md` and `rules/my-rule.customize.yaml` in the
  override tree WHEN the index is built THEN the walk throws `VALIDATION_ERROR`
  and the message contains both absolute paths.

**REQ-OVERLAY-005**

- GIVEN a base declaring `description: "old"` and an overlay declaring
  `description: "new"` WHEN merged THEN the merged item's `description` is
  `"new"` and every other base key is unchanged.
- GIVEN a base declaring `precedence: high` and an overlay declaring
  `precedence:` with no value WHEN merged THEN `precedence` is absent from the
  merged frontmatter and absent from the merged item.
- GIVEN a base declaring `tags: [a, b, c]` and an overlay declaring
  `tags: [d]` WHEN merged THEN the merged `tags` is exactly `["d"]`.
- GIVEN an overlay declaring only `description` WHEN merged THEN `tags`,
  `load`, `obsolete_when` and `tools` carry their base values byte-for-byte.
- GIVEN a base declaring keys in the order `id, type, description, tags` and an
  overlay declaring `tags` and a new key `precedence` WHEN merged THEN the merged
  map's key order is `id, type, description, tags, precedence`.

**REQ-OVERLAY-006**

- GIVEN an overlay declaring `id: something-else` WHEN the index is built THEN
  the walk throws `VALIDATION_ERROR` naming the overlay's absolute path and the
  key `id`; the same holds for `type`, and for either key set to null.

**REQ-OVERLAY-007**

- GIVEN a base body ending `...last line\n` and a `.customize.md` reading
  `Extra paragraph.\n` WHEN merged THEN the merged body is the base body, one
  blank line, then `Extra paragraph.` — and the base body's own bytes are
  otherwise unaltered.
- GIVEN a `.customize.md` whose first line is `---` WHEN the index is built THEN
  the walk throws `VALIDATION_ERROR` naming that absolute path.

**REQ-OVERLAY-008**

- GIVEN an overlay declaring `tools: [not-a-tool]` WHEN the index is built THEN
  the walk throws `VALIDATION_ERROR` naming `tools` and listing the valid tool
  set — the same message an authored artifact would produce.
- GIVEN any merged-artifact refusal WHEN the message is read THEN it contains
  the base file's absolute path, every applied overlay file's absolute path, and
  the offending field name.

**REQ-OVERLAY-009**

- GIVEN a `.customize.yaml` containing malformed YAML WHEN the index is built
  THEN the walk throws `VALIDATION_ERROR` naming that absolute path, and no
  partially merged item reaches the index.
- GIVEN any refusal in the table above WHEN `stamity sync` runs THEN it stops,
  and `stamity check` reports `drift: not evaluated` — matching the settled
  behaviour for a malformed override.

**REQ-OVERLAY-010**

- GIVEN `rules/no-such-rule.customize.yaml` and no artifact of that id in any
  layer WHEN the index is built THEN the walk throws `VALIDATION_ERROR` naming
  the overlay file and the id `no-such-rule`.

**REQ-OVERLAY-011**

- GIVEN a corpus rule patched by an overlay WHEN `stamity validate` runs THEN
  the shadowing block prints one `patched` row naming the base's path, its
  origin, and every overlay file applied — and no `replaced` row for that id.
- GIVEN that same repo, otherwise clean, WHEN `stamity validate` runs THEN the
  exit code is 0 and the finding count is unchanged.

**REQ-OVERLAY-012**

- GIVEN a `.customize.md` body carrying a block-severity deny pattern WHEN
  `stamity validate` runs THEN it reports an error finding against that repo and
  exits non-zero.
- GIVEN an overlay whose null removes `description` from a base that declared it
  WHEN `stamity validate` runs THEN it reports the missing required field as an
  error, exactly as it would for an authored artifact missing it.
- GIVEN a merged body that crosses its class's lean line threshold WHEN
  `stamity validate` runs THEN it reports a warning and the exit code stays 0.

**REQ-OVERLAY-013**

- GIVEN a repo with no `.customize.*` file anywhere WHEN the emission plan is
  built before and after this change THEN every planned row is byte-identical,
  in a repo with packs installed and in one without.
- GIVEN a repo whose only customization is an overlay WHEN sync runs THEN the
  ledger entries for the affected artifact differ from the unpatched run only in
  `contentHash`, and carry no new field.

**REQ-OVERLAY-014**

- GIVEN an overlay on an agent, a rule and a command WHEN sync runs THEN each
  merged body reaches every selected client that receives that class.
- GIVEN an overlay on a skill, with lane D11 not yet landed, WHEN the index is
  built and `stamity validate` runs THEN the item is patched in the index AND
  the `patched` row carries `emits: false` and says the bundled body is still
  what ships.

**REQ-OVERLAY-015**

- GIVEN the creator agent's body WHEN the light-trio suite runs THEN it asserts
  the body names `.customize.yaml`, `.customize.md`, the effective precedence
  chain, and the overlay/override exclusivity — and the retired
  `not.toMatch(/\.customize\./)` assertion is gone, with an inline reason in its
  place.
- GIVEN the four comment sites cited in the context section WHEN the change
  lands THEN none of them describes the overlay surface as read by nothing.
  *(judgment: reviewer — prose accuracy is not machine-checkable; the light-trio
  case above covers the agent-facing half.)*

## Non-goals for v1

Named so a later change can add them deliberately rather than discover them:

- **Section-anchored insertion.** No heading-anchor convention exists in the
  corpus; inventing one belongs with the change that establishes it.
- **Merge verbs.** No `tags+:`, no remove-by-value, no recursion into nested
  maps.
- **Prepend, or insertion at any position other than the end.**
- **Per-key blame in a merged refusal.** The composite source label names both
  files; it does not say which one supplied the offending key.
- **Patching a full override.** Refused by REQ-OVERLAY-004.
- **Overlaying an overlay, or more than one overlay pair per id.** One pair, one
  base.
- **A ledger vocabulary for patches.** REQ-OVERLAY-013.
- **Templating or variable substitution in either half.**

## Test plan sketch

The suites that extend, and what each takes:

- `test/content/catalog.test.ts` — a new `describe("the overlay layer")` block
  beside the existing `describe("the override layer")`
  (`test/content/catalog.test.ts:347`), on the same virtual-volume harness. It
  carries REQ-OVERLAY-002 through 010: discovery, target resolution over corpus
  and over pack, every refusal in the REQ-OVERLAY-009 table, the merge semantics
  of REQ-OVERLAY-005 and 007, and the byte-identity case modelled on
  `test/content/catalog.test.ts:486`.
- `test/content/userContent.test.ts` — the discovery/skip vocabulary and the save
  path writing an overlay through the same gate (REQ-OVERLAY-012).
- `test/content/frontmatter.test.ts` — parse → compose → parse identity over a
  MERGED map, including a removed key and a reordered overlay-only key
  (REQ-OVERLAY-005, 008).
- `test/cli/commands/validate.test.ts` — the `patched` row's content, its
  `emits` value per class, the unchanged exit code, and the deny-scan and
  missing-required-field findings over merged text (REQ-OVERLAY-011, 012).
- `test/cli/engine/emission.test.ts` — the overlay-free byte-identity case held
  to the same four dialects in a pack-having repo as in a pack-free one, matching
  the shape already pinned there; plus the three emitting classes carrying merged
  bodies, and the skill class pinned to whichever side of lane D11 the tree is on
  (REQ-OVERLAY-013, 014).
- `test/corpus/commands/lightTrio.test.ts` — the case at lines 756-764 rewritten
  in place, with its inline reason (REQ-OVERLAY-015).

## References

Cited as `path:line` against the tree at the time of writing; line numbers drift
and the surrounding symbol is the durable address.

| Pointer | Target | Why |
|---|---|---|
| `source` | `src/content/catalog.ts:466-523` | the layer resolve and `items` assembly the merge slots into |
| `source` | `src/content/catalog.ts:805-849` | `buildItem` — the checks the merged artifact re-runs |
| `source` | `src/content/frontmatter.ts:122-129` | `composeFrontmatter` — the materialization mechanism |
| `source` | `src/content/frontmatter.ts:159-181` | `extractToolsFrontmatter` — why the raw round trip is required |
| `source` | `src/content/userContent.ts:469-503` | `checkUserArtifact` — the one gate REQ-OVERLAY-012 reuses |
| `source` | `src/cli/commands/validate.ts:71-93,582-597` | the report row type and the block that prints it |
| `source` | `src/cli/engine/emission.ts:74-100` | ownership of the override tree, and the emitting-class set |
| `source` | `src/emit/skillsProjection.ts:141,167` | the lane D11 dependency |
| `source` | `src/guard/promptGuard.ts:38` | the user-content ceiling that binds an overlay body |
| `test` | `test/content/catalog.test.ts:347-731` | the override-layer block the overlay block is written beside |
| `test` | `test/corpus/commands/lightTrio.test.ts:756-764` | the negative case REQ-OVERLAY-015 migrates |

## Risks

- **An overlay can make a shipped artifact fail a check the shipped artifact
  passes.** That is the design working — merge-then-validate is what
  REQ-OVERLAY-008 asks for — but it means an author can break an artifact they
  did not write. Mitigated by fail-closed with both files named, and by the base
  being unchanged on disk: deleting the overlay restores the shipped artifact
  exactly.
- **A skill overlay before lane D11 lands is index-visible and
  emission-invisible.** The same silent shape D11 exists to close.
  REQ-OVERLAY-014's `emits: false` row is the mitigation, and it is the same
  mitigation already in place for a full skill override.
- **Fail-closed on an orphan overlay makes a filename typo stop the sync.** The
  loud failure is the decision (REQ-OVERLAY-010), and the cost is real: a typo
  now blocks a run that previously succeeded. Weighed against a silent no-op the
  author cannot see, and the error text makes the fix one step.
- **Retiring "four-layer precedence" moves published vocabulary.** Anyone who
  read the phrase in a module header will not find it. REQ-OVERLAY-015 rewrites
  every site that spells it, in the same change.

## Concerns

- This spec creates `docs/specs/`. The page publishes as an unlisted route
  (`website/sidebars.ts` lists pages by name, and an unlisted page under `docs/`
  still renders), and it is not a member of the hand-page bucket in
  `test/docsPages.test.ts`, whose membership is an explicit list — so it
  inherits no currency-header or re-open-trigger contract. If that bucket is
  ever widened to a glob over `docs/`, this page needs both before the widening
  lands.
- The page is not indexed in `llms.txt`. That index lists generated pages and a
  named set of guides; adding a specs section to it is a reasonable follow-up
  and is not required by any current check.
- Line-number citations drift. `SECURITY.md` retired them for exactly that
  reason and moved to `file::symbol`. This spec keeps them because the evidence
  here is often a comment block or a loop rather than a named export, and a
  citation that cannot be spelled is a claim with no evidence at all. A reader
  who finds a citation off by a few lines should trust the named symbol.
