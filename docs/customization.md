---
title: Customization
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.9.0 release cut (2026-09-21). -->
<!-- Re-open when: a save gate is added or removed, a content class joins or leaves the
     override tree, a merge verb joins the overlay layer, a class gains or loses overlay
     support, the fork layer's place in the precedence chain moves, or patch-or-replace
     exclusivity changes. `test/docsPages.test.ts` holds this page to the hand-page contract;
     `src/content/userContent.ts` owns the save gate and `src/content/catalog.ts` owns the
     overlay merge this page narrates. -->

# Customization

This page shows you how to make stamity's agents, rules, commands and skills say what your
repository needs, without editing a file stamity ships. By the end you can replace a shipped
artifact with your own, patch one without copying it, check both with `stamity validate`, and
remove either again.

Write your file under `.stamity/overrides/`, then check it:

```bash
stamity validate
```

```text
shadowing — 2 overrides take a bundled id

  skill qa  .stamity/overrides/skills/qa/SKILL.md  replaces skills/st-qa/SKILL.md
  rule testing  .stamity/overrides/rules/testing.md  replaces rules/stamity-testing.md

ok — checked 2 artifacts, no findings
```

Those two shadowing lines are the whole mechanism. You claimed an id, and your file is now the
one that emits under it.

## Where does an override live?

One tree, one directory per class.

| Class | Path |
|---|---|
| agent | `.stamity/overrides/agents/<id>.md` |
| rule | `.stamity/overrides/rules/<id>.md` |
| command | `.stamity/overrides/commands/<id>.md` |
| skill | `.stamity/overrides/skills/<id>/SKILL.md` |

A skill is a directory. The other three classes are each a single file.

The bytes under `.stamity/overrides/` are yours end to end. No emission path targets anything
inside that tree. It is never wrapped in a managed block, never regenerated, and never
reclaimed. What gets regenerated is the per-client copy, which is a different file.

Nothing in this lane edits the bundled corpus. `content/` is framework territory. It is shipped
and regenerated, so an edit there is erased by the next update. An organisation that really does
need to edit `content/` forks the repository instead of consuming it, and
[Enterprise forks](enterprise-forks.md) is the lane that carries those edits through an upstream
release.

## Which name does a skill override ship under?

The name a client invokes is the emitted one, not the one you filed the directory under.

An override that takes a bundled skill's id replaces it, and the projection keeps the bundled
spelling. An override at `skills/qa/` declaring `id: qa` replaces `st-qa` and still ships as
`st-qa`, as both the directory name and the spec `name`. Every call site and every
cross-reference to that skill keeps working. An override whose id nothing bundled holds is an
addition, so it ships under its own directory name.

Your own tree stays free of the reserved prefix either way, because stamity mints it back on at
emission. The save gate refuses `stamity-` and `st-` as an id. A hand-placed `skills/st-qa/`
directory declaring `id: qa` is reported by `stamity validate` as an id that disagrees with its
filename. Author the bare directory and let emission restore the prefix.

## What happens to a rule that declares no globs?

Two bundled rules declare no `globs`: `question-protocol` and `ai-evals`. Under the shipped
default `ruleDelivery: on-demand` they reach most clients as description-triggered skills named
`stamity-<id>` rather than as always-on rule text. Cursor is the exception, because it has a
native description-pull rule mode of its own and keeps them as rules. Switch the whole setup
back with `stamity config set ruleDelivery always-on`.

An override of one of those rules still lands at `.stamity/overrides/rules/<id>.md`. Its delivery
is then decided from your file's own frontmatter, exactly as it was decided from the bundled
rule's. A rule of yours that declares `globs:` is attached conditionally instead.

## How do you author one?

There are two paths, and they are judged by the same save gate.

**The creator agent.** `stamity-creator` composes one artifact per invocation, assembled so the
save gates pass on the first call. It reports a refusal precisely: every error with its field or
its offset, and confirmation that nothing was written.

**By hand, then `stamity validate`.** Write the file yourself, then run that verb. It reads only
and writes nothing. See the [CLI reference](cli-reference.md) for its place among the verbs.

The two converge because they run the same judgement. `checkUserArtifact`
(`src/content/userContent.ts`) is the whole of it, and both paths call it. Neither path lands
what the other refuses.

Three checks belong to the save path alone, because each is only meaningful before the file
exists. The id must be a lowercase slug, since the id becomes the file name. The id must not
start with `stamity-` or `st-`. And the id must not already be patched by an overlay, which the
overlay section below explains.

Both prefixes are stamity's own filename namespace. The reclaim sweep (`src/merge/reclaim.ts`)
reads a `stamity-` or `st-` basename as proof that stamity authored the file. It then deletes
such a file without the verified backup a user-lane overwrite takes. A prefixed id also shadows
nothing extra, because the corpus strips the prefix when it derives ids. `st-` is the easy one to
reach for by accident, since it is the stem of every touchpoint.

`stamity validate` does not re-check the prefix. Once a file exists, its filename already answers
the question. So if you hand-author a file straight into `.stamity/overrides/`, avoid the prefix
yourself: a hand-placed `st-work.md` passes `validate` clean.

## What refuses the save, and what only warns?

**Strict. The save is refused and nothing is written.**

- `id`, `type`, `description` or `tags` missing from the frontmatter, or present and malformed.
- A declared `id` that disagrees with the filename carrying it. Nothing picks a side for you.
- A rule declaring `scope: always`. One client refuses that declaration outright, and the other
  three cannot see the field and would apply the rule on every turn. Use `scope: conditional`
  with `globs:`, or `scope: agent-requested`. Any other unrecognised `scope` is refused too,
  because an activation nothing recognises emits as an unconditional rule.
- A block-severity deny-scan hit anywhere in the body or in the frontmatter. Keys, values and
  comments are all scanned. A `description` is rendered into pickers and roster lines, so text
  hidden there reaches agent context without appearing in the body at all.

Here is a refusal, printed for a rule that declares `scope: always` and neither lifecycle field:

```text
user-content — 1 error, 2 warnings
  error    .stamity/overrides/rules/house-style.md  `scope: always` is not emittable: the cursor adapter refuses it (so every later sync fails) and the other three clients cannot read the field and would apply the rule on every turn. Use `scope: conditional` with `globs:`, or `scope: agent-requested`.
  warning  .stamity/overrides/rules/house-style.md  `load` is not declared — say whether this artifact loads always, on-demand, reference, so a reader can tell what it costs in context
  warning  .stamity/overrides/rules/house-style.md  `obsolete_when` is not declared — name the condition that makes this artifact redundant, or nothing will ever retire it
```

**Advisory. The file lands and the warnings ride along.** A body over its class's line
threshold. A missing `load:` or `obsolete_when:`, or a `load:` value outside `always`,
`on-demand` and `reference`. Filler phrasing, reported with its offset.

| Class | Advisory line threshold |
|---|---|
| agent | 350 |
| skill | 200 |
| rule | 100 |
| command | 200 |

The split is the design. Shape and safety are strict, because a malformed head produces a file
no consumer can index, and a deny hit is text that re-enters agent context verbatim. Quality is
gentle, because the artifact is yours, and a gate that blocks on taste is a gate authors learn to
route around. A save that lands with three warnings is reported as landed with three warnings,
never as clean.

Re-saving an id whose file already exists with different bytes takes a size- and hash-verified
`.bak` first and names it in a warning. Overwriting a hand-edited file therefore stays
recoverable. Byte-identical content is not a write at all: no backup, no warning, no touched
file.

## What does taking a bundled id do?

An override that claims an id a bundled artifact holds **replaces it whole**. One identity, one
body. The replaced artifact leaves emission entirely, and the two texts are never merged.

Replacing a floor artifact is allowed and is your call. A security rule and each of the spine
agents are floor artifacts. Nothing reports a missing floor afterwards, because the id is still
claimed.

The substitution is reported rather than silent. `stamity validate` prints one shadowing line per
contested id. The line names the override's path, what it replaced, and whether it emits. All
four classes emit: agents, rules and commands reach their clients through the residue planners,
and skills reach them through the core projection.

## What does a skill override carry with it?

A skill override's directory is projected entire. That means `SKILL.md` plus every support file
beneath it, and the override's own files rather than those of the skill whose id it took.

It lands in `.agents/skills/` whenever a selected client reads that tree. Cursor, Copilot and
Codex each declare that they do. Claude Code reads neither that tree nor `AGENTS.md`, so it also
gets one client-native copy at `.claude/skills/`, re-targeted from those same rendered bytes. A
Claude-only setup carries the native copy alone and no `.agents/skills/` tree at all.

Support files are screened, because they reach agent context exactly as the artifact body does
and no write gate ever sees them. `stamity validate` deny-scans every regular file under an
override skill directory at block severity, beyond `SKILL.md` itself. `SKILL.md` is judged once,
by the save gate above.

A hit names the file, the pattern id and the offset. It never names the matched text, which the
deny scanner redacts at source, so reading the report cannot deliver the payload the finding
refuses. A symlinked entry is reported as skipped. The projection copies regular files and real
directories only, so a link is never emitted and its target is never screened.

## When does a saved override go live?

The save writes one file. The per-client copies change on the next `stamity sync`, which picks
the artifact up and projects it through the same emission a corpus artifact goes through.

## How do you patch a bundled artifact instead of replacing it?

An override replaces. An overlay **patches**: it states the delta and nothing else over a bundled
artifact you have not fully overridden. The base keeps flowing from the corpus or the pack that
supplies it, so your patch survives an upstream rewrite of everything it did not name. A copy of
the whole body cannot do that, because it stops tracking the original the moment it is taken.
[Overlay customization layers](specs/overlay-layers.md) is the design reference behind what
follows: what was decided, what was dropped, and why.

An overlay is two halves. Either one alone works, or both together. They are filed in the class
directory a full override of the same id would use.

| Class | Frontmatter patch | Body patch |
|---|---|---|
| agent | `agents/<slug>.customize.yaml` | `agents/<slug>.customize.md` |
| rule | `rules/<slug>.customize.yaml` | `rules/<slug>.customize.md` |
| command | `commands/<slug>.customize.yaml` | `commands/<slug>.customize.md` |
| skill | `skills/<slug>/SKILL.customize.yaml` | `skills/<slug>/SKILL.customize.md` |

A healthy pair prints its own line:

```text
shadowing — 1 overlay patches a bundled id

  rule testing  .stamity/overrides/rules/testing.customize.md  patches rules/stamity-testing.md (corpus)
```

`<slug>` addresses the base artifact's **declared** `id`, with stamity's internal `cmd-` prefix
off for a command. It is not the bundled file's name. The two agree for every artifact this
repository ships today: `st-qa/SKILL.md` declares `id: qa`, and `st-plan.md` declares `id: plan`.
That is corpus convention rather than a rule the resolver enforces. An artifact whose filename
disagrees with its own declared `id` is still addressed by the id, because the id is the identity
the walk resolves an overlay against. A skill's halves compose onto `SKILL` the way its readable
file does, in a directory that needs no `SKILL.md` of its own.

That skill directory is a **carrier**, not a skill directory. The artifact it patches lives in
the corpus or in a pack, so nothing beside the two halves ever ships from it. Any other regular,
non-dotfile entry you drop in there is passed over at emission, whether it is a `references/*.md`
or an image. `stamity validate` reports it as a warning naming it. It is never emitted and never
an error.

A subdirectory holding two or more files collapses to one warning naming the directory and its
file count. A subdirectory holding a single file is named by that file's own path. Dotfiles at
any depth are passed over without a warning. A symlink is not counted among the dropped carrier
files, but it is still reported. The support-file scan runs over every skill directory, carrier
or not, and prints the same skipped-link warning.

**The merge.** The frontmatter half is a shallow key set. A key it declares replaces the base
value whole. A key written `key:` or `key: null` is removed from the merged head. A key it does
not name is untouched. Lists such as `tags` and `tools` replace whole, and there are no append
verbs. The body half is appended after the base body with one blank line between them. There is
no prepend, no section anchor, and no templating. The base file is never written to.

**Patch or replace, never both.** One chain applies to any id: the base plus its halves, or a
full override. The two are refused together, naming both files. Saving a full override over an id
an overlay already patches is refused before anything is written. A full override is your own
file, so patching it means editing it.

## What does an overlay refuse?

An overlay defect stops the sync and names the file and the offending field or condition.

- A `.customize.yaml` that is not valid YAML, or whose root is not a map.
- An `id` or `type` key in a `.customize.yaml`. That is the identity the patch is addressed by.
- A `---` fence at the head of a `.customize.md`. Those keys belong in the other half.
- A slug matching no artifact in any layer, which is almost always a typo in the filename.
- A body patch over the 250 000-character ceiling on user-authored content.
- An overlay filename spelled with stamity's `stamity-` or `st-` prefix. The same applies to a
  skill's carrier directory. Use the bare slug the save gate already reserves, such as
  `plan.customize.md` or `skills/qa/`. The corpus strips the prefix when it derives ids, and two
  spellings of one patch would leave the exclusivity check blind to one of them.
- A merged artifact failing the safe-path, closed-vocabulary and field-shape checks the index
  build runs (`buildItem`). Those are the same checks a bundled or full-override artifact is held
  to at index time.

`stamity validate` runs a wider gate than sync does. It holds the merged artifact to everything a
full override is held to: the deny scan, the lifecycle declarations and the lean-line threshold.
It reports what it finds against the half that carries it. Sync itself does not run that wider
gate, so an overlay can pass sync and still be flagged by `validate`.

A `patches` row prints inside the same `shadowing` block a `replaces` row does. Both are
information, and neither one moves the exit code.

## How do you remove one?

Delete the file. Then run `stamity sync`.

An override that stops existing stops being emitted on that sync, and the per-client copy it
produced is reclaimed. Deleting an overlay restores the shipped artifact exactly, because the
base's own bytes were never touched.

## Where does a fork layer fit?

A package built by a downstream fork carries one more layer, and it sits below yours. Any
`(class, id)` resolves through this chain: the corpus or a pack, then the fork layer, then your
own overrides.

`fork/` is the fork maintainer's tree. It is theirs to author, not this repository's and not
yours, so nothing in this lane writes it. A replacement or a patch of yours still takes the id
over anything the fork put there.

Where a package ships a fork layer, `stamity validate` marks its rows `— fork layer`. A shadowing
line you did not author therefore reads as somebody else's rather than as yours. Authoring that
layer is a fork maintainer's job: [Enterprise forks](enterprise-forks.md) describes it, and
[The fork layer](specs/fork-layer.md) is the design reference.

Two fork outcomes are about your repository rather than about the fork.

- A fork patch aimed at an id your own override has replaced is reported as inert, not as
  applied. Your file won the id, so there is nothing left for the fork's patch to land on.
- A fork patch of an artifact only a pack supplies waits for that pack. In a repository that does
  not carry the pack, the patch is skipped and reported as a warning naming the artifact it waits
  for. It is never an error, because the fork layer ships with the package while packs are
  installed per repository. Your own orphan patch is still an error.

Everything on this page is a CLI consumer override. An APM package author customizes `content/`
or the bundled `fork/` layer instead and regenerates the four classes. Package generation does
not read a consumer's override tree. [Enterprise forks](enterprise-forks.md) covers public and
independent private APM authoring, identity, authentication and updates, including which runtime
capabilities require the packaged CLI.

## What does each client do with your override?

The [Client capability matrix](capability-matrix.md) is the generated, per-client reference. The
limits below are the ones an override author meets most often. The dated
[client contract evidence](../.github/client-contracts.md) links the official sources and records
which guarantees the local fixtures exercise. It was last re-attested on 2026-09-22.

Bundled skills declare `license: MIT` and their runtime prerequisites in `compatibility`. Both
fields pass through the skill projection untouched, and so does `allowed-tools`, so a skill
override of yours may declare them too. Codex additionally reads optional `agents/openai.yaml`
companions, which add display names and default prompts. No tool connection and no credential is
implied by any of those fields.

Claude command files stay in `.claude/commands/`. The client supports them explicitly and
preserves the same `/st-*` invocation as skills. Their names and the override path are therefore
stable.

Cursor converts hook timeouts from milliseconds to native seconds, and translates portable
`hookSpecificOutput` decisions into its native output. Exit 2 denies. `failClosed` additionally
denies hook errors and timeouts on supported events. An unsupported `ask` decision requires
manual permission review.

Copilot CLI and cloud repository hooks register at `.github/hooks/stamity.json`. Tool-hook denial
and errors block, but timeouts remain fail-open. Its session-start output is injected as
additionalContext (the GitHub Copilot hooks reference, read 2026-09-17), so the learning index
reaches the session. Copilot cloud reads hook configuration from the default branch.

Codex hooks use command strings and native `/hooks` trust review, and that review is the last of
three gates. First `features.hooks = true` in `.codex/config.toml`, which stamity emits; the
vendor states no default. Then the project's trust level. Then the per-hook review. Even with all
three in place, headless `codex exec` on codex-cli 0.154.0 loaded no project hook layer at all in
the 2026-09-15 measurement. A hook there is enforcement in the interactive client only. An
emitted digest is not native approval, and `stamity check` detects generated-file drift.

The Codex, Cursor and Copilot tool-call payloads do not identify the calling role, so the core
role guard is telemetry on those three. Native sandbox and permission controls remain the
enforcement boundary.

Claude and Codex now both offer local memory, so the second-client reassessment trigger has
fired. `st-learn` stays useful: versioned repository evidence travels across supported clients and
machines, while these native memory stores are local. Reassess again if clients provide durable,
repository-scoped, cross-vendor memory, and retain existing learning evidence during that review.

## Where to go next

- [Getting started](getting-started.md) — install, what lands, and the first proven change.
- [Working with stamity](working-with-stamity.md) — the touchpoints, and which one to open.
- [CLI reference](cli-reference.md) — every verb, flag, and exit status.
