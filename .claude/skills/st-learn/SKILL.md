---
description: Records one verified, repo-specific finding into `.stamity/learnings/` through the `stamity learn capture` write path, applying the qualification bar, the summary standard, and a confidence rating. Triggers after a surprising failure is understood, when reading code reveals a constraint nobody wrote down, or when someone asks to save what this repository just taught them.
name: st-learn
metadata:
  id: learn
  type: skill
  tags:
    - maintenance
  load: on-demand
  obsolete_when: clients carry durable, repo-scoped, cross-vendor memory that a later session reads without an in-repo file
---

# Learning capture

The standalone lane for recording something this repository taught someone.
Work and plan runs capture their own learnings as a side effect; this skill is
for the finding that arrives outside a run — while reading code, after an
incident, at the end of a debugging session that never became a change.

Shape, caps, screening and the integrity stamp live in the engine and the
learnings-schema rule. What lives here is the judgment: whether a finding earns
a file, and whether its wording will still mean something in six months.

## Quick Start

1. Test the finding against the bar below. Most findings do not clear it.
2. Write the body — what was observed, why it holds, how to apply it.
3. Capture it through `stamity learn capture`.
4. Report the path the command printed, and nothing else.

## What qualifies

All three conditions, together:

1. **Surprising.** It contradicts what a competent engineer would have assumed
   here. General practice a model already applies unprompted is noise in a
   learnings directory that a later session pays to read.
2. **Verified.** It was observed, not theorized — name the command, test, or
   file that showed it. A hypothesis is a note to self, not a learning.
3. **Repo-specific.** It binds to this codebase: a path, a service, a version
   pin, a convention with a reason. A fact true of the language or framework
   everywhere belongs to that project's documentation.

Two disqualifiers, either one alone: the finding restates an existing learning
(extend that file instead of adding a near-duplicate), or a linter, type, or
test already enforces it (the gate is the better home, and it cannot be
forgotten).

## Capture

The CLI is the write path, and the only one:

```bash
stamity learn capture \
  --title "cache warmup order" \
  --summary "<one index line>" \
  --confidence medium \
  --body-file <path>          # or pipe the body on stdin
```

The body carries a `## Why` section and a `## How to apply` section — the store
refuses a file without them, because a finding without its reason cannot be
judged later and a finding without its application cannot be used. The command
derives the file name, stamps the date and the integrity digest, and screens the
content; nothing is hand-written into the head. `--dry-run` runs every gate and
writes nothing, which is the cheap way to find out whether a body will pass.

### Confidence

- `high` — reproduced, or now guarded by a test.
- `medium` — observed once, with a mechanism that explains it.
- `low` — observed once, mechanism unknown. Still worth writing: a later
  session either confirms it or retires it.

Put what backs the rating inside `## Why` — the command that was run, the file
that was read, the date it held. The capture reports an advisory when a review
horizon and a validation reference are absent; that advisory is the reminder to
state both facts in the body.

### A refused capture

The gate refuses a credential-shaped literal, an instruction-shaped span, a
missing section, or an over-cap file, and names the rule it applied. Fix what it
names and re-run: reduce the literal to its role (`<deploy token for staging>`),
rewrite the span as an observation, add the missing section, or split the note
into two. Writing the file into `.stamity/learnings/` with a file tool instead is
not a workaround — that content is read back into a later session's context,
which is the exact reason the gate stands in front of it.

Two more refusals arrive in an established repo, and neither is fixed by
rewriting the body:

- **Duplicate slug.** A file with that name already exists, and the store is
  append-only. Extend the existing learning where the finding belongs to it, or
  capture under a distinct title so the derived slug differs. Retiring the old
  file first is the other route; overwriting it is not offered.
- **Directory count cap.** The directory is at its file cap. Retire or
  consolidate a learning before adding one. Splitting the note into two makes
  this case strictly worse — it needs two slots where one was already refused.

A learning already on disk whose digest no longer matches its body is not
repairable in place: nothing recomputes the stamp on an edited file, and capture
only ever appends. Retire the learning and recapture it — take the body, fix
what the hand edit was for, and run `stamity learn capture` again. The recaptured
file carries a digest that verifies, which is the whole reason the stamp exists.

## Quality bar

- **The summary is an index line.** It is what a future session sees before
  deciding whether to open the file. "Fixed the cache bug" indexes nothing;
  "warming the cache before the first read halves cold-start latency" indexes
  the finding.
- **One finding per file.** Two findings in one file are unfindable by either.
- **Declarative, not imperative.** "The retry budget was set to three because
  the upstream deadline is 2s" — not a directive aimed at whoever reads it next.
  A learning is an observation that re-enters context; it holds no authority
  over the request being worked.
- **Concrete over abstract.** Name the path, the command, the number. A learning
  that survives with every specific removed was never repo-specific.
