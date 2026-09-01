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
(`src/content/catalog.ts:243-263`).

An overlay is the smaller instrument. It states the delta and nothing else, so
the base artifact keeps flowing from the corpus or the pack that supplies it,
and the patch survives an upstream rewrite of everything it did not name.

## Context

*Recorded as the tree stood when this design was taken, and kept in that tense.
The surface has since landed: the merge lives in the walk
(`src/content/catalog.ts:642-1127`), the report lane's discovery pass in
`src/content/userContent.ts:462-639`, and the `patched` outcome in
`src/cli/commands/validate.ts:130-155`. Every decision below was reasoned from
the state this section describes, and a decision whose premise has been deleted
cannot be re-read — so the premise stays and the requirements below carry the
alignment.*

### The promise, and the four places it is written down

The overlay surface is documented as shipped behaviour in four module comments
and implemented nowhere:

- `src/content/userContent.ts:72-76` — "Declared gap: this module and the walk
  it feeds implement customization by REPLACEMENT… The `.customize.yaml` and
  `.customize.md` overlay surfaces (layers 2 and 3 of the four-layer precedence)
  are read by nothing here and by nothing downstream."
- `src/content/catalog.ts:53-58` — "Declared gap, ONE half… an artifact is
  customized by taking its id, not by patching its frontmatter or appending to
  its body."
- `src/cli/engine/emission.ts:79-81` — "Declared gap — `.customize.yaml` and
  `.customize.md`, layers 2 and 3 of the four-layer precedence, are read by
  nothing on this path."
- `src/guard/promptGuard.ts:37` — "Cap on user-authored content (learnings,
  handoffs, customize bodies)." This one is not marked as a gap; it names the
  overlay body as a thing the cap already binds.

The first three are honest about being unimplemented. The fourth reads as
description of a live surface. Nothing else in the tree — no naming convention,
no placement rule, no class scope, no merge semantics — exists, and no
`.customize.*` file exists on disk.

*The four addresses above are PRE-REWRITE ones; REQ-OVERLAY-015 rewrote every
one of them in the change that landed the surface, so following a line number
here reaches the replacement rather than the quoted text. The replacements are
at `src/content/userContent.ts:72-95`, `src/content/catalog.ts:58-70`,
`src/cli/engine/emission.ts:79-93` and `src/guard/promptGuard.ts:37-49`, and
none of them describes the surface as read by nothing.*

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
`buildItem` (`src/content/catalog.ts:1424-1476`) through closed-vocabulary checks
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
  (`src/content/catalog.ts:1335-1339`, `src/content/userContent.ts:808-814`).
  It is dropped before any read, and it is not reported: `SkippedUserEntry`
  covers symlinks only (`src/content/userContent.ts:327-350`).
- `.customize.md` is **not** excluded by that filter. It ends in `.md`, so it
  becomes a walk candidate, and it is dropped one step later by the
  no-frontmatter skip (`src/content/catalog.ts:1385`) — also silently. A
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
(`src/cli/commands/validate.ts:890-931`, over `ValidateShadow`,
`src/cli/commands/validate.ts:74-101`). A patched item is neither. `LedgerEntry`
(`src/types/manifest.ts:76-97`) has no field for it and, per REQ-OVERLAY-013,
needs none.

### The dependency, discharged

Skill overlays index under this spec and emit with every other class.
`OVERRIDE_EMITTING_CLASSES` is `agent`, `rule`, `command`, `skill` — a full
enumeration of `ContentClass` rather than a subset
(`src/cli/engine/emission.ts:112-133`). `skill` joined it when the projection
widened: `ProjectSkillsOptions.contentRoot` takes the full `ContentRoots` spec
(`src/emit/skillsProjection.ts:179`, feeding `buildContentIndex` at
`src/emit/skillsProjection.ts:209`), so an override skill's whole directory —
`SKILL.md` and every support file under it — is what projects
(`src/emit/skillsProjection.ts:48-52`). Nothing in this spec waits on a lane
outside it.

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
   (`src/cli/engine/emission.ts:95-101`): never planned, never wrapped in a
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
(`src/content/catalog.ts:1536`), which strips the reserved `stamity-` and `st-`
filename prefixes. For commands this is the bare slug, not the `cmd-`-prefixed
catalog id, exactly as a full override's filename is
(`src/content/catalog.ts:819`). Either file may appear without the other.
Overlays never sit beside a corpus or a pack file.

**Rationale.** The override tree is the one tree the engine writes into and
never emits into, and that ownership split is already stated and already held
(`src/cli/engine/emission.ts:95-101`, `src/content/userContent.ts:61-70`). An
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
the same change, the artifact candidate filters are narrowed so that a name
ending `.customize.md` is never a candidate artifact in any layer.

**Landed as two passes, in two modules, and both halves are in.** The walk's
pass is `discoverOverlays` (`src/content/catalog.ts:935-1031`), and it is the
one that merges. The override-tree module carries a second, report-only pass —
`discoverUserOverlays` (`src/content/userContent.ts:513-519`) — because
`stamity validate` has to name what each pair applies to before any merge
exists to read; it merges nothing, and its header says so
(`src/content/userContent.ts:81-84`). Both candidate filters are narrowed:
`src/content/catalog.ts:1275-1284` and `src/content/userContent.ts:804-814`.
The two suffix constants are spelled in both modules rather than imported
across them, with the reason stated where the second copy lives
(`src/content/userContent.ts:260-277`) and the parity asserted behaviourally
rather than assumed: one override tree driven through both walks, both required
to treat the same file as no artifact and the patch required to have really
applied (`test/content/userContent.test.ts:486-499`).

A skill directory that holds overlay files and no `SKILL.md` is an overlay
carrier, not work in progress. A skill directory holding neither remains work in
progress and is still passed over in silence
(`src/content/userContent.ts:418-420`).

A carrier's own halves are the only bytes the merge ever reads: the skills
projection composes the merged `SKILL.md` from the BASE artifact's directory
(corpus or pack), never from the carrier, so anything else an author drops
beside the two halves — a `references/*.md`, an image — is silently dropped at
every emission. `discoverSkillOverlayCarrierExtras`
(`src/content/userContent.ts`) names each such file and `stamity validate`
reports it as a warning, never an error: nothing is broken, the bytes just do
not ship.

**Rationale.** Without the narrowing, the body patch is simultaneously an
overlay and a phantom artifact at id `<slug>.customize` — the defect evidenced
in the context section. The filter change is not an optimisation; it is what
makes the two files mean one thing each.

**Dropped.** Renaming the halves to something the `.md` filter already excludes
(`<slug>.customize.patch`, `<slug>.overlay.txt`). The `.customize.` infix is
what three module headers already promise, and a doc-visible surface is cheaper
to implement than to rename.

**Known silent no-ops, documented rather than refused.** Two placements the
walk neither discovers nor rejects, left silent by design rather than by
omission: a `.customize.yaml`/`.customize.md` pair filed under a NESTED
directory inside a class (`rules/team/my-rule.customize.yaml`) is not
discovered as an overlay at all — overlay discovery lists each class
directory one level deep, matching every other content walk in this tree — so
the author sees neither a patch nor a refusal, only an artifact that never
changed. A skill overlay half spelled in the wrong CASE
(`skill.customize.md` for `SKILL.customize.md`) is likewise a silent no-op, on
any filesystem: `pathOf` (`src/content/catalog.ts`) matches a listed
directory entry's name by exact string equality, so a case-only misspelling
is not a lookup a case-insensitive filesystem could normalise — it is a
comparison that simply never matches, and the walk reports nothing rather
than a typo it never compared against. Neither shape is refused today; this
line is the fix this round takes — making the silence a documented one
rather than an undocumented one.

### REQ-OVERLAY-003 — An overlay targets the shadow-resolved item

**Decision.** An overlay for `(class, slug)` applies to whichever item the
layered walk RESOLVES for that `(class, id)` — the corpus artifact, or the pack
artifact, whichever holds the key after the resolve loop
(`src/content/catalog.ts:526-560`). Application runs after that loop and before
`items` is assembled (`src/content/catalog.ts:569`, into
`src/content/catalog.ts:571-580`).

**Rationale.** "The artifact currently in force" is the only target that stays
correct when a pack is installed or removed, and it is unambiguous by
construction: a pack that claims an id the corpus already holds is refused at
the walk (`src/content/catalog.ts:536-546`), so the resolved base is never
contested between those two layers.

**Landed, with the consequence every reporting lane inherits.** The merge runs
on the resolved item, after the layer loop and before `items` is assembled
(`src/content/catalog.ts:562-580`). That makes the pack roots part of the
question rather than a detail of the caller: an index built without them would
resolve a pack-supplied id to nothing and call a correct patch an orphan. So
`stamity validate` resolves the installed packs before it walks
(`installedPackRoots`, `src/cli/commands/validate.ts:607-619`, handed in at
`src/cli/commands/validate.ts:413-418`), and it degrades to no pack roots
rather than to a failed section when the pack state is unreadable — the sync
path is where that refusal belongs. Any future lane that builds this index to
report on an overlay carries the same roots, for the same reason.

**Dropped.** Targeting the corpus item specifically. It reads simpler and is
wrong the first time a pack legitimately supplies the id: the author would patch
a body nobody emits, and the report would say the patch applied.

### REQ-OVERLAY-004 — An overlay and a full override of one id are refused together

**Decision.** An overlay whose resolved base came from the override tree is
refused, whatever that override's filename. The refusal is at read time and its
message names both absolute paths and says which one to remove
(`src/content/catalog.ts:900-909`).

Stated by identity rather than by filename because the landed rule has two
reads and the filename one is the weaker. Discovery pairs an overlay with a
full override of the same slug in the same class directory
(`src/content/catalog.ts:967`, joined at `src/content/catalog.ts:980-985`,
refused at `src/content/catalog.ts:1062-1064`); the merge then re-reads
exclusivity off the base it resolved, refusing any base whose `origin` is
`user` (`src/content/catalog.ts:1069-1072`). The second read is what covers an
override whose declared `id` disagrees with its own filename — the walk indexes
it under the DECLARED id (`src/content/catalog.ts:1385-1391`) and reports the
disagreement rather than repairing it
(`src/content/catalog.ts:1416-1419`), so it REPLACED the id the overlay
addresses while sitting under a filename the first read would never have
paired. An id is either replaced or patched, and which file spells it is not
the question.

The save path holds the same rule from the other side, in its own words: a full
override cannot land on an id an overlay already patches
(`src/content/userContent.ts:344-347`, message at
`src/content/userContent.ts:1292-1300`).

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
`parseFrontmatterBlock` (`src/content/frontmatter.ts:102-115`) — exported for
this lane, because an overlay's head IS the block with no document around it to
split, and a second call into the config parser would be a second re-coding of a
YAML failure into a content defect
(`src/content/frontmatter.ts:88-99`, read by the merge at
`src/content/catalog.ts:776`). Merging it over the base frontmatter map:

- a key present in the overlay **replaces** the base value entirely;
- a key whose value is YAML null — written `key:` or `key: null` — is
  **removed** from the merged map;
- a key absent from the overlay is **untouched**;
- list-valued keys (`tags`, `tools`) replace whole. There are no append or
  remove verbs in v1;
- a nested map replaces whole. The merge does not recurse.

Key ORDER of the merged MAP is the base's order for every key the base declared,
with overlay-only keys appended in the order the overlay declared them
(`src/content/catalog.ts:840-867`). The map is what the merged item carries; the
re-emitted head composed on the way through `buildItem` is a separate question,
and v1 does not answer it — see the non-goals.

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
(`src/content/catalog.ts:1456-1469`, `origin` and `provenance` at 1467-1468).

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
a single document with `composeFrontmatter` (`src/content/frontmatter.ts:130-137`)
and that document is handed to `buildItem` (`src/content/catalog.ts:1424-1476`)
as `raw`, alongside the merged map and merged body
(`src/content/catalog.ts:1134-1139`). The resulting item keeps the BASE
artifact's `filePath`, `relativePath`, `origin` and `provenance`. The `source`
label used for refusal messages is a composite: the base file's absolute path,
plus the absolute paths of the overlay files applied.

**How the label is carried.** `source` is an OPTIONAL field on
`BuildItemInput`, defaulting to the artifact's own `filePath`
(`src/content/catalog.ts:1415-1421`, applied at `src/content/catalog.ts:1438`),
so the ordinary scan passes nothing and its messages are unchanged — the
composite exists for the one caller with two candidate files. Its spelling is
`` `${base.filePath} (patched by ${applied.join(", ")})` ``, halves in
frontmatter-then-body order (`src/content/catalog.ts:759-768`). One further
input is not the base's: `slug` is set to the base's own `id` rather than to the
overlay's filename slug (`src/content/catalog.ts:1136-1139`), because the merged
artifact IS that artifact and the rebuild must not re-report a filename
disagreement the scan already reported once.

**Rationale.** This is what makes "re-validates through the exact `buildItem`
checks" implementable rather than aspirational. `buildItem` reads `tools` by
re-parsing the RAW document text, not the frontmatter map
(`src/content/catalog.ts:1454` into `src/content/frontmatter.ts:166-172`),
so a merge that produced a map with no raw twin would either skip the closed
tool-vocabulary check or need a second implementation of it — and a gate that
disagrees with itself is the defect `src/content/userContent.ts:33-39` already
records. `composeFrontmatter` is documented as making parse → compose → parse an
identity on both halves (`src/content/frontmatter.ts:116-128`), which is exactly
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
| `.customize.md` is over the user-content ceiling | absolute path, the body's character count, the limit |
| an overlay coexists with a full override | both absolute paths |
| the overlay is an orphan | absolute path, the id looked for |
| the merged artifact fails any `buildItem` check | composite label, the field |

The ceiling row is the one addition this table took after the design was
settled, and it earned its place at the walk rather than only at `validate`:
the two gates were failing closed in opposite directions, so a repo could sync
a body patch its own validator rejects (`src/content/catalog.ts:794-821`).

**Rationale.** Parity with the settled posture for a malformed override, and
with the reason it was settled: a walk that carries on past a defective artifact
indexes a half-formed entry, which is worse than a run that stops and names the
file (`src/content/catalog.ts:32-44`).

**Dropped.** Warn-and-skip — report the overlay as ignored and emit the base.
Rejected because its observable outcome is exactly today's bug: a tree that
looks customized and a sync that ships the bundled body. The walk already
records that outcome as the reason its symlink skip was made loud
(`src/content/catalog.ts:1243-1251`).

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

**Decision.** The report row type becomes a discriminated union
(`ValidateShadow`, `src/cli/commands/validate.ts:88-97`) over two members. The
discriminator is a new `outcome` field, and the pre-existing row takes
`outcome: "replaced"` (`src/cli/commands/validate.ts:99-128`) — it is spelled on
that row too rather than left implicit, so a consumer branches on a field that
is present in both shapes instead of on the absence of one.

A `patched` row (`src/cli/commands/validate.ts:136-155`) carries exactly seven
keys: `outcome`, `type`, `id`, `base` (the base's content-root-relative path —
the file that still supplies the body), `origin` (`corpus`, or the id of the
pack supplying it), `overlays` (the repo-relative paths of the halves applied,
frontmatter half first) and `emits`. It carries no `replaced`, because nothing
was replaced. The row is assembled at `src/cli/commands/validate.ts:532-543` and
printed by the shadowing block as a third line shape
(`src/cli/commands/validate.ts:890-931`), whose header sentence is composed from
the two counts rather than stated once — a single sentence covering both would
be false of one of them.

`emits` keeps its meaning and its `OVERRIDE_EMITTING_CLASSES` derivation on both
rows (`src/cli/commands/validate.ts:430` and
`src/cli/commands/validate.ts:541`). A `patched` row is information and never
moves the exit code, exactly as a `replaced` row does not
(`src/cli/commands/validate.ts:72-74`, `src/cli/commands/validate.ts:88-90`),
and both travel to the JSON consumer under the same `shadows` key
(`src/cli/commands/validate.ts:1061-1064`).

**Rationale.** Today's two outcomes are both false of a patched item: nothing
was replaced, and nothing left the index. A report that squeezed a patch into
either row would be wrong in both directions.

**Dropped.** Emitting a patch as a finding. A patch is the customization lane
working, which is the same argument that keeps a shadow out of the findings
channel.

### REQ-OVERLAY-012 — One gate judges the merged artifact, at the two lanes that already judge

**Decision.** `stamity validate` runs `checkUserArtifact`
(`src/content/userContent.ts:883-917`) over the merged artifact, whole:
required frontmatter, id/filename agreement, lifecycle declarations, deny-scan
over frontmatter keys, values and comments, and `validateContentBody`'s body
judgment with its lean line cap. It does not re-materialize the merge to do so
— the item it judges is read out of `byKey` at the patched id
(`src/cli/commands/validate.ts:497-521`), which is the artifact the next `sync`
emits, so the command reads what the walk produced rather than re-deriving it.

**Save parity, as recorded.** The save path cannot write an overlay at all.
`saveUserContent` files an artifact under an id (`artifactPath`,
`src/content/userContent.ts:1302-1309`), and `saveIdDefect` refuses any id that
is not a bare slug before a path is composed
(`src/content/userContent.ts:1267-1273`, against
`src/content/userContent.ts:293`) — `<slug>.customize` carries a dot and is not
one. So the parity this requirement asks for is not "the same gate when the save
path writes a half"; it is the EXCLUSIVITY refusal, in the direction the save
path can meet it: writing a full override over an id an overlay already patches
is refused before any filesystem call
(`src/content/userContent.ts:344-347`). A half is authored directly and judged
by `validate`, which is the lane that holds the merged text.

Three clarifications the merge forces:

- The id/filename agreement check reads the BASE's identity. It is not inferred
  — `UserArtifactCheckInput.fileSlug` is the field that says so
  (`src/content/userContent.ts:199-212`, read at
  `src/content/userContent.ts:1163`), and `validate` sets it to the merged
  item's own `id` (`src/cli/commands/validate.ts:510-521`). Without it, a corpus
  base wearing the `stamity-`/`st-` filename prefix its id does not would report
  a mismatch on every patched shipped artifact.
- The 250 000-character user-content ceiling binds the overlay body at BOTH
  lanes, not only at the reporting one. The walk refuses it during
  `buildContentIndex` (`src/content/catalog.ts:811-821`), and `validate` reports
  the same file (`cappedBody`, `src/cli/commands/validate.ts:574-591`). One lane
  alone was the defect: the two were failing closed in opposite directions, so a
  repo could sync a patch its own validator rejects.
- `MAX_USER_CONTENT_LENGTH`'s own comment (`src/guard/promptGuard.ts:37-49`)
  now names its two READERS — `stamity learn capture` and `stamity validate` —
  rather than listing the surfaces the cap covers, which is what the quoted
  "learnings, handoffs, customize bodies" phrasing did. The walk is not on that
  list and is not meant to be: it restates the number rather than importing it,
  and the reason is architectural. See Concerns.

Emission does not deny-scan an overlay, for the reason it does not deny-scan
anything: a scan at emission time reprints the author's own flagged text on every
sync (`src/cli/engine/emission.ts:103-109`).

**Rationale.** One gate, two callers, unchanged. `src/content/userContent.ts:33-39`
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
(`src/cli/engine/emission.ts:95-101`), so a `patched` flag there would be state
nothing reads.

**Dropped.** A `patched: true` ledger field, for the reason above.

### REQ-OVERLAY-014 — All four classes index and emit; no carve-out remains

**Decision.** Overlays apply to all four content classes at both the index and
emission. `OVERRIDE_EMITTING_CLASSES` is `agent`, `rule`, `command`, `skill` — a
full enumeration of `ContentClass` rather than a subset
(`src/cli/engine/emission.ts:112-133`). `skill` joined it when lane D11 widened
`ProjectSkillsOptions.contentRoot` from a bare corpus-root string to the full
`ContentRoots` spec (`src/emit/skillsProjection.ts:179`), so a skill overlay
indexes and emits exactly as an agent, rule or command override already does —
this spec makes no further edit to reach that state. The `patched`-row carve-out
this requirement used to state for `skill` — `emits: false`, the bundled body
still what ships — is gone with the class it described: no content class holds
that shape today.

**Rationale.** The index-level behaviour was already class-uniform, and the
former emission carve-out was a dependency on lane D11 landing, not a
permanent asymmetry. D11 landed first, per the batch order this spec assumed,
so the merge already happens inside the walk the widened projection reads —
see "The dependency, discharged" above — and this requirement records the
same fact rather than a still-open wait on it.

**Superseded text (D11 pending; kept for the record the requirement id
carries forward).** Overlays applied to all four content classes at the index.
`agent`, `rule` and `command` reached emission; `skill` did not, because the
skills projection took a bare corpus-root string, so a skill overlay indexed
and did not emit until lane D11 widened that option to the full `ContentRoots`
spec. While `skill` was outside `OVERRIDE_EMITTING_CLASSES`, a `patched` row
for a skill carried `emits: false` and said the bundled body was still what
shipped — the wording the `replaced` row used for that case.

**Dropped.** Shipping three classes and adding `skill` later. It would create a
second class carve-out, at the index, beside the one at emission — and the two
would then have to be kept in agreement.

### REQ-OVERLAY-015 — The pinned negative test and the four comments migrate with the implementation

**Decision.** `test/corpus/commands/lightTrio.test.ts:765-807` asserts that the
creator agent's body mentions neither `.customize.` nor a four-layer precedence.
It gates the behaviour this spec changes, so it is rewritten in place — not
deleted, not skipped — in the same change, carrying an inline reason naming what
about the contract changed. Its replacement asserts the positive: the creator
body names both overlay files, states the effective precedence chain of
invariant 3, and states the exclusivity refusal of REQ-OVERLAY-004. In the same
change the three declared-gap comments
(`src/content/userContent.ts:72-76`, `src/content/catalog.ts:53-58`,
`src/cli/engine/emission.ts:79-81`) are rewritten to describe what the code now
does, and `src/guard/promptGuard.ts:37` becomes accurate rather than
aspirational.

**Rationale.** Leaving the negative case green would require the creator agent to
go on hiding a shipped surface from the authors it exists to serve. Rewriting
rather than deleting is what the repository's testing rule requires of a gating
test, and it leaves a record that the claim moved.

**Dropped.** Deleting the case. A deleted gating test leaves nobody a way to see
that the contract changed.

## Acceptance criteria

One set per requirement. Thirty-four criteria; each is machine-checkable unless
tagged otherwise. The count moved by two when the ceiling joined the
REQ-OVERLAY-009 table.

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
- GIVEN a `.customize.md` of `MAX_USER_CONTENT_LENGTH + 1` characters WHEN the
  index is built THEN the walk throws `VALIDATION_ERROR` naming that absolute
  path, the body's character count and the limit, and no merged item reaches the
  index.
- GIVEN a `.customize.md` of exactly `MAX_USER_CONTENT_LENGTH` characters WHEN
  the index is built THEN it merges and the patched item is in the index. The
  pair is driven from the guard's own constant rather than from a literal, so
  moving either number alone turns the case red
  (`test/content/catalog.test.ts:1199-1238`). That block is named for
  REQ-OVERLAY-012, which is where the ceiling is stated as a rule; these two
  criteria sit here because the ceiling is a row in the REQ-OVERLAY-009 refusal
  table. One behaviour, two requirements that need it — not a drift.

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
- GIVEN an overlay on a skill WHEN sync runs THEN the merged body reaches every
  selected client that receives the skill class — both the vendor-neutral
  `.agents/skills/` tree and each client-native re-target of those same bytes —
  and the `patched` row carries `emits: true`.

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
- **A guaranteed per-key order in the RE-EMITTED head.** The merged map keeps
  the base's declared order with overlay-only keys appended (REQ-OVERLAY-005),
  and that map is what the merged item carries. The document composed on the way
  through `buildItem` is a different artifact: `composeFrontmatter` hoists
  `LEAD_KEYS` — `id`, `type`, `description`, `tags` — to the front whatever order
  the map declared (`src/content/frontmatter.ts:64`,
  `src/content/frontmatter.ts:138-151`). That text does not survive the builder,
  which reads it only to re-parse `tools` (`src/content/catalog.ts:1454`),
  so nothing on disk carries it today and v1 promises nothing about its order. A
  lane that ever writes a merged head to a file decides this then, deliberately.
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
  the shape already pinned there; plus the four emitting classes carrying merged
  bodies (REQ-OVERLAY-013, 014).
- `test/corpus/commands/lightTrio.test.ts` — the case at lines 756-764 rewritten
  in place, with its inline reason (REQ-OVERLAY-015).

## References

Cited as `path:line` against the tree at the time of writing; line numbers drift
and the surrounding symbol is the durable address.

| Pointer | Target | Why |
|---|---|---|
| `source` | `src/content/catalog.ts:642-1127` | the overlay layer: discovery, merge, and every refusal |
| `source` | `src/content/catalog.ts:526-580` | the layer resolve and `items` assembly the merge slots into |
| `source` | `src/content/catalog.ts:1424-1476` | `buildItem` — the checks the merged artifact re-runs |
| `source` | `src/content/frontmatter.ts:101-114` | `parseFrontmatterBlock` — the one strict read of an unfenced head |
| `source` | `src/content/frontmatter.ts:129-151` | `composeFrontmatter` and its `LEAD_KEYS` hoist |
| `source` | `src/content/frontmatter.ts:167-189` | `extractToolsFrontmatter` — why the raw round trip is required |
| `source` | `src/content/userContent.ts:462-639` | the report lane's discovery pass, which merges nothing |
| `source` | `src/content/userContent.ts:883-917` | `checkUserArtifact` — the one gate REQ-OVERLAY-012 reuses |
| `source` | `src/cli/commands/validate.ts:88-155` | the discriminated report row type, both members |
| `source` | `src/cli/commands/validate.ts:497-546,890-931` | the per-pair judgement, and the block that prints it |
| `source` | `src/cli/engine/emission.ts:95-101,112-133` | ownership of the override tree, and the emitting-class set |
| `source` | `src/emit/skillsProjection.ts:179` | the skills `contentRoot` widening lane D11 discharged |
| `source` | `src/guard/promptGuard.ts:37-49` | the user-content ceiling that binds an overlay body |
| `test` | `test/content/catalog.test.ts:348-731` | the override-layer block the overlay block is written beside |
| `test` | `test/content/catalog.test.ts:733-1434` | the overlay-layer block, REQ-OVERLAY-002 through 013 |
| `test` | `test/corpus/commands/lightTrio.test.ts:765-807` | the case REQ-OVERLAY-015 migrated, with its inline reason |

## Risks

- **An overlay can make a shipped artifact fail a check the shipped artifact
  passes.** That is the design working — merge-then-validate is what
  REQ-OVERLAY-008 asks for — but it means an author can break an artifact they
  did not write. Mitigated by fail-closed with both files named, and by the base
  being unchanged on disk: deleting the overlay restores the shipped artifact
  exactly.
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
- **The user-content ceiling is spelled twice, on purpose, and the arrangement
  has a named exit.** The walk holds the body half to `MAX_OVERLAY_BODY_LENGTH`
  (`src/content/catalog.ts:347-363`), a RESTATEMENT of
  `MAX_USER_CONTENT_LENGTH` (`src/guard/promptGuard.ts:49`) rather than an
  import of it. The reason is architectural, not stylistic: the prompt guard is
  registry-wired by construction and that wiring is gated — it is listed in
  `REGISTRY_ONLY_MODULES` as "cited by two validator headers, imported by
  neither" (`test/architecture/boundaries.test.ts:681`), and that list may only
  shrink (`test/architecture/boundaries.test.ts:893-897`). A direct edge from
  the walk retires the claim, which is a decision for the change that wants to
  make it rather than a side effect of adding a size check.

  The two numbers cannot drift apart unnoticed meanwhile, because both sides are
  driven from the guard's own constant rather than from a literal: the walk's
  refusal at `test/content/catalog.test.ts:1199-1238` (importing it at
  `test/content/catalog.test.ts:27`) and `validate`'s at
  `test/cli/commands/validate.test.ts:1012-1018` (reading it off the engine
  registry). Moving either number alone turns a suite red.

  This is recorded as a concern and not as a defect because the cross-pin holds
  it, but it is a two-place constant and the follow-on is named:
  `2026-08-31_batch-d12-overlays/build/8`, the architecture-ratchet decision,
  deferred rather than dropped. One unit owning both `src/content/catalog.ts`
  and `test/architecture/boundaries.test.ts` either accepts the production edge
  — deleting the row, which is what the ratchet message itself prescribes — or
  moves the constant to a shared leaf both sides may import. Whichever it
  settles, this restatement then collapses to one spelling or earns its second
  one explicitly.
- Line-number citations drift. `SECURITY.md` retired them for exactly that
  reason and moved to `file::symbol`. This spec keeps them because the evidence
  here is often a comment block or a loop rather than a named export, and a
  citation that cannot be spelled is a claim with no evidence at all. A reader
  who finds a citation off by a few lines should trust the named symbol.
