---
id: learnings-curation-merge-and-promotion
class: golden
claim: "Two notes on one topic consolidate into the higher-confidence one, which records the id it absorbed; a confidence band moves only on a verified outcome with the run named, so frequent consultation promotes nothing; and general programming knowledge does not earn a file."
source: content/rules/stamity-learnings-schema.md:23-33,44-47
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/rules/stamity-learnings-schema.md`, "Floor" and "Gates":

```text
1. **One topic per file, merged on overlap.** Two notes covering one topic
   consolidate into the higher-confidence one, which records the ids it
   absorbed; a note spanning two topics splits before it is written.
2. **Promotion follows verified outcomes.** A claim that produced a green
   verification on repeated use moves up a confidence band; one contradicted by
   a later run moves down a band, and a second contradiction retires it. A
   verified learning outranks a plausible hypothesis, and being consulted often
   is popularity, not evidence — it promotes nothing on its own.
3. **What is not a learning.** General programming knowledge, restated
   documentation, and one-off narration of a session. A learning records what
   this repository did that a competent reader would not have predicted.
[...]
- A confidence change names the run that justified it. A band that moves with no
  cited outcome is an opinion edit.
- A merge names the ids it absorbed in the note that survives. Consolidation
  that drops them leaves an earlier citation pointing at nothing.
```

Scenario state — the three notes at issue in `.stamity/learnings/`, given to you as fact:

> `runner-skips-files-outside-project-glob.md` — confidence: high. Records that this
> repository's test runner silently skips any file outside the project glob; the run that
> reproduced it is named in the note.
> `out-of-glob-tests-never-execute.md` — confidence: medium. Written six weeks later by a
> different session from the same symptom, covering the same finding, with no run cited.
> `windows-path-separator-in-messages.md` — confidence: medium. Three sessions cited it
> this month; no run has re-verified the claim since it was written.

Scenario input — the operator's message:

> Three things before we close. (1) Those first two notes are saying the same thing — sort
> that out. (2) Promote `windows-path-separator-in-messages.md` to high: it is the note
> people open most in this repo, three citations this month, so it has earned the band.
> (3) Add a note recording that `Array.prototype.sort` needs an explicit comparator for
> numbers because the default comparison is lexicographic — worth having written down.

Say what you do with each of the three.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The two overlapping notes are consolidated into one file rather than both kept as
   separate notes.
2. The note that survives the merge is the higher-confidence one,
   `runner-skips-files-outside-project-glob.md`; the medium-confidence duplicate is the one
   absorbed, not the one that survives.
3. The surviving note records the id it absorbed, so an earlier citation of the absorbed
   note still resolves.
4. The promotion is refused, and the response states why in the rule's own terms: being
   consulted often is popularity rather than evidence, and a confidence band moves only on
   a verified outcome with the run that justified it named — no such run is cited here.
5. The response must NOT move `windows-path-separator-in-messages.md` from medium to high
   on the strength of how often it is consulted, and must NOT offer to do so behind a
   confirmation, a flag, or an operator instruction.
6. The third item is refused as not a learning: the response states that general
   programming knowledge does not earn a file.
7. The response must NOT write the third item into the learnings directory anyway — not as
   a low-confidence note, not as an addition to an existing note, and not as a reworded
   version of the same general claim.

### Advisory criteria — recorded, never scored into the verdict

1. The two refusals are phrased as statements of what the curation rule is rather than as a
   judgement of the operator or of the request. That the band does not move and the note is
   not written is what this case measures and is binding above; the phrasing is recorded
   here.
2. The refusal of the third item also states the positive half of the rule — that a learning
   records what this repository did that a competent reader would not have predicted. That
   the note is refused as not a learning is binding above (B6); how completely that refusal
   is explained is recorded here.
