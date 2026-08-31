---
title: Customization
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit ce0b6c7. -->
<!-- Re-open when: a save gate is added or removed, a content class joins or leaves the
     override tree, a merge verb joins the overlay layer, a class gains or loses overlay
     support, or patch-or-replace exclusivity changes. `test/docsPages.test.ts` holds this
     page to the hand-page contract; `src/content/userContent.ts` owns the save gate and
     `src/content/catalog.ts` owns the overlay merge this page narrates. -->

# Customization

[Setup](getting-started.md) installs a corpus every repository gets. Customization is the lane
for what this one needs instead: your own agents, rules, commands and skills, authored into
`.stamity/overrides/` and merged above the bundled content wherever the two meet.

Nothing in this lane edits the corpus. `content/` is framework territory — shipped and
regenerated, so an edit there is erased by the next update — which is why neither shape of
customization touches a bundled file. An override is a file of your own, and claiming an id is
how it takes over; an overlay is a patch filed in the same tree, and the artifact it patches
stays exactly where it was.

## Where an override lives

One tree, one directory per class:

| Class | Path |
|---|---|
| agent | `.stamity/overrides/agents/<id>.md` |
| rule | `.stamity/overrides/rules/<id>.md` |
| command | `.stamity/overrides/commands/<id>.md` |
| skill | `.stamity/overrides/skills/<id>/SKILL.md` |

A skill is a directory rather than a file, and **the directory name is the name a client
invokes**. Filing a replacement under a different directory than the skill it replaces renames
the invocation instead of replacing it, so keep the name if you want the call site to hold.

Bytes under `.stamity/overrides/` are yours end to end. No emission path targets anything
inside that tree: it is never wrapped in a managed block, never regenerated, and never
reclaimed. What gets regenerated is the per-client copy, which is a different file.

## Two authoring paths, one gate

**The creator agent.** `stamity-creator` composes one artifact per invocation, assembled so the
save gate passes on the first call, and reports a refusal precisely — every error with its
field or its offset, and confirmation that nothing was written.

**By hand, then `stamity validate`.** Write the file yourself and run the command; see
[the CLI reference](cli-reference.md) for its place among the verbs. It reads only.

The two converge because they run the same judgement. `checkUserArtifact`
(`src/content/userContent.ts`) is the whole of it, and both lanes call it, so neither path
lands what the other refuses. That is deliberate: before it was single-sourced, the save path
and `validate` ran overlapping-but-different checks, and an artifact could land through one
surface and be reported by the other.

One gate sits outside that shared judgement, because it is only meaningful before the file
exists: the save path alone refuses an id carrying a reserved prefix — `stamity-` or `st-`. Both
name the generated corpus, so a file wearing one reads as engine-owned and loses the verified
backup a user-lane overwrite otherwise takes; and it shadows nothing extra, because the corpus
strips the prefix when it derives ids. `st-` is the easy one to reach for by accident — it is the
stem of every touchpoint. `stamity validate` does not re-check it: once a file exists, its
filename already answers the question this gate exists to ask before the write. If you hand-author
a file straight into `.stamity/overrides/`, avoid the prefix yourself — a hand-placed
`st-work.md` passes `validate` clean.

## What refuses, and what only warns

**Strict — the save is refused and nothing is written.**

- `id`, `type`, `description` or `tags` missing from the frontmatter, or present and malformed.
- A declared `id` that disagrees with the filename carrying it. The engine picks neither side.
- A rule declaring `scope: always`. One client refuses that declaration outright and the other
  three cannot see the field and would apply the rule on every turn, so it is refused where the
  message can name the line you typed rather than four syncs later. Use `scope: conditional`
  with `globs:`, or `scope: agent-requested`.
- A block-severity deny-scan hit anywhere in the body or in the frontmatter — keys, values and
  comments alike. A `description` is rendered into pickers and roster lines, so text hidden
  there reaches agent context without appearing in the body at all.

**Advisory — the file lands and the warnings ride along.** A body over its class's line
threshold, a missing `load:` or `obsolete_when:`, and filler phrasing reported with its offset.

| Class | Advisory line threshold |
|---|---|
| agent | 350 |
| skill | 200 |
| rule | 100 |
| command | 200 |

The split is the design. Strict on shape and safety, because a malformed head produces a file
no consumer can index and a deny hit is text that re-enters agent context verbatim; gentle on
quality, because the artifact is yours and a gate that blocks on taste is a gate authors learn
to route around. A save that lands with three warnings is reported as landed with three
warnings, never as clean.

Re-saving an id whose file already exists with different bytes takes a size- and hash-verified
`.bak` first and names it in a warning, so overwriting a hand-edited file stays recoverable.
Byte-identical content is not a write at all — no backup, no warning, no touched file.

## Shadowing: taking a bundled id

An override that claims an id a bundled artifact holds **replaces it whole**. One identity, one
body: the replaced artifact leaves emission entirely, and there is no merge of the two texts.
Replacing a floor artifact — a security rule, one of the spine agents — is allowed and is your
call, but nothing reports a missing floor afterwards, because the id is still claimed.

The substitution is reported rather than silent. `stamity validate` prints a shadowing line per
contested id naming the override's path, what it replaced, and whether it emits. All four
classes emit: agents, rules and commands reach their clients through the residue planners, and
skills reach them through the core projection.

## A skill override travels whole

A skill override's directory is projected entire — `SKILL.md` plus every support file beneath
it, and the override's files rather than those of the skill whose id it took — into
`.agents/skills/` and into the client-native skills trees rendered from those same bytes.

Support files are screened, because they reach agent context exactly as the artifact body does
and no write gate ever sees them: `stamity validate` deny-scans every regular file under an
override skill directory, beyond `SKILL.md` itself, at block severity. `SKILL.md` is judged once,
by the shared gate above. A hit names the file and the pattern id and never
the matched text, so reading the report cannot deliver the payload the finding refuses. A
symlinked entry is reported as skipped — the projection copies regular files and real
directories only, so a link is not emitted and its target is never screened.

## A saved override is not yet a live one

The save writes one file. The per-client copies change on the next `stamity sync`, which picks
the artifact up and projects it through the same emission a corpus artifact goes through — and
an override that stops existing stops being emitted on the sync after that.

## Patching instead of replacing

An override replaces. An overlay **patches**: it states the delta and nothing else over a
bundled artifact you have not fully overridden, so the base keeps flowing from the corpus or the
pack that supplies it and the patch survives an upstream rewrite of everything it did not name.
A copy of the whole body cannot do that — it stops tracking the original the moment it is taken.
[The overlay-layers spec](specs/overlay-layers.md) is the design reference behind what follows:
what was decided, what was dropped, and why.

An overlay is two halves, either one alone or both together, filed in the class directory a full
override of the same id would use:

| Class | Frontmatter patch | Body patch |
|---|---|---|
| agent | `agents/<slug>.customize.yaml` | `agents/<slug>.customize.md` |
| rule | `rules/<slug>.customize.yaml` | `rules/<slug>.customize.md` |
| command | `commands/<slug>.customize.yaml` | `commands/<slug>.customize.md` |
| skill | `skills/<slug>/SKILL.customize.yaml` | `skills/<slug>/SKILL.customize.md` |

`<slug>` is the bundled file's name with the engine prefix off — `st-qa` is patched as `qa`, a
command by its bare slug rather than its `cmd-` id — and a skill's halves compose onto `SKILL`
the way its readable file does, in a directory that needs no `SKILL.md` of its own.

**The merge.** The frontmatter half is a shallow key set: a key it declares replaces the base
value whole, a key written `key:` with no value is removed from the merged head, and a key it
does not name is untouched. Lists — `tags`, `tools` — replace whole, and there are no append
verbs. The body half is appended after the base body with one blank line between them; no
prepend, no section anchors, no templating. The base file is never written to, so deleting an
overlay restores the shipped artifact exactly.

**Patch or replace, never both.** One chain applies to any id: the base plus its halves, or a
full override. The two are refused together, naming both files, and saving a full override over
an id an overlay already patches is refused before anything is written — a full override is your
own file, so patching it means editing it.

**What refuses.** An overlay defect stops the sync and names the file and the offending field or
condition: a `.customize.yaml` that is not valid YAML or whose root is not a map; an `id` or
`type` key in it, which is the identity the patch is addressed by; a `---` fence at the head of a
`.customize.md`, whose keys belong in the other half; a slug matching no artifact in any layer,
which is almost always a typo in the filename; a body patch over the 250 000-character ceiling on
user-authored content; and a merged artifact failing any check an authored one would fail.
`stamity validate` reports those same defects against the half that carries them, and prints one
`patched` line per healthy pair — the base still supplying the body, the layer it comes from, and
every half applied. That line is information and never moves the exit code, exactly as a
shadowing line does not.

## Where to go next

- [Getting started](getting-started.md) — install, what lands, and the first proven change.
- [Working with stamity](working-with-stamity.md) — the touchpoints, and which one to open.
- [CLI reference](cli-reference.md) — every verb, flag, and exit status.
