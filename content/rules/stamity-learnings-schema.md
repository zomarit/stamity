---
id: learnings-schema
type: rule
description: Authoring contract for a learning file — the frontmatter fields an author supplies, the body sections, the integrity digest, the summary and directory caps, and the curation posture at the cap.
tags: [maintenance]
load: on-demand
obsolete_when: the engine's write gate reports every schema requirement inline at capture time, leaving nothing for an author to know in advance
scope: conditional
globs: [".stamity/learnings/**"]
---

# Learnings Schema

A learning is a curated, repository-specific finding that re-enters context on a
later session. The engine owns the shapes and enforces them at the write gate;
this rule is the authoring contract that gate expects, so a note is written once
rather than rejected three times.

## Floor

1. **Frontmatter, in three tiers.** Four fields are required and refuse the
   write when absent; two are warned about and still land; one is the engine's
   to stamp. The write gate owns the full shape.

| Field | Tier | Contract |
|---|---|---|
| `id` | required | Kebab-case slug that matches the file name, so a citation resolves to a file. |
| `date` | required | ISO calendar date the finding was captured. A date that parses but is not a real day is refused. |
| `confidence` | required | `low`, `medium`, or `high`, set by the evidence held rather than by conviction. |
| `summary` | required | The one-line index entry printed at session start. Capped at 200 characters — detail belongs in the body. |
| `reviewBy` | warned | ISO calendar date after which the claim counts as unverified. Absent, the note still lands and the gate says so. |
| `validatedAgainst` | warned | The command, test, or path the finding was checked against in this repo. |
| `integrity` | stamped | The sha256 digest over the trimmed body. The engine writes it; an author never types one. |

2. **The body carries the finding, `Why`, and `How to apply`.** The finding
   alone is not reusable: the reason lets a later reader judge whether it still
   holds, and the application step is what makes it actionable at the moment it
   surfaces.
3. **The digest detects tampering; it does not sign.** A digest that disagrees
   with the trimmed body means the body changed after stamping, so the entry is
   skipped on read rather than loaded on trust. Capture through `stamity learn
   capture` stamps it, and nothing re-stamps a note edited by hand: `stamity
   validate` reports the mismatch and the read path keeps skipping the file.
   The route back is to retire the learning and recapture it — captures are
   append-only, so the recapture takes a new slug or the old file goes first.
4. **A passed `reviewBy` is not loaded.** Past its horizon a claim is
   unverified, not wrong — re-verify it and move the date, or retire it.
   Dropping out of the index is the intended outcome for a note nobody renewed,
   and it is why the horizon is set honestly at capture rather than pushed years
   out to avoid the chore.
5. **Caps are a curation signal, not a repair target.** The directory holds 150
   files by default (floor 50) at 64 KiB each. At the cap the move is retiring
   or merging notes, not raising the ceiling: an unpruned directory stops being
   curated residue and becomes a second codebase to read before every task.
6. **One topic per file, merged on overlap.** Two notes covering one topic
   consolidate into the higher-confidence one, which records the ids it
   absorbed; a note spanning two topics splits before it is written.
7. **Promotion follows verified outcomes.** A claim that produced a green
   verification on repeated use moves up a confidence band; one contradicted by
   a later run moves down a band, and a second contradiction retires it. A
   verified learning outranks a plausible hypothesis, and being consulted often
   is popularity, not evidence — it promotes nothing on its own.
8. **What is not a learning.** General programming knowledge, restated
   documentation, and one-off narration of a session. A learning records what
   this repository did that a competent reader would not have predicted.

## Gates

- The file name is a bare kebab-case slug plus `.md`, the file is at most
  64 KiB, the four required fields are present, and `Why` and `How to apply`
  both appear. A missing `reviewBy` or `validatedAgainst` is an advisory on a
  file that still lands. `stamity validate` reports each by file and reason.
- Every capture runs through the write path, so the digest is produced by the
  same code that verifies it later.
- The session-start index lists a learning exactly when it cleared size,
  screening, digest, and review-horizon checks. Absent from the index means one
  of those four failed, and the skip line names which.
- A learning consulted during work is cited by id in the output that used it. An
  uncited learning is indistinguishable from a guess the run made on its own.
- A confidence change names the run that justified it. A band that moves with no
  cited outcome is an opinion edit.
- Consolidation is triggered by what a run can see: the cap refusal on capture,
  and the over-cap lines `stamity validate` prints for files that will not load.
  Nothing reports a percentage of the ceiling, so nothing here instructs one.
