---
license: MIT
compatibility: Requires a supported coding client and repository access.
id: plain
type: skill
description: "Rewrites a given text in plain words, or restates the last reply plainly when no text is given, keeping every fact, number, path, command and caveat. Triggers when someone asks for plain words, a simpler version, or the last answer said plainly."
tags: [maintenance]
load: on-demand
obsolete_when: every target client restates a text plainly on request while keeping each fact, locator, command, open gap and refusal as it stood
---

# Plain words

Rewrites a text so its reader understands it on the first read. The meaning does not move:
the same facts, the same numbers, the same open gaps, the same answer. Only the wording changes.

## Quick Start

1. Find the input (below).
2. Mark what stays word for word.
3. Rewrite the rest against the four aims.
4. Check the rewrite against the hard lines.
5. Return the rewritten text, and nothing else.

## Input

- **A given text.** When the request carries a text, pasted, quoted or named as a file to read,
  that text is the input. A file named as input is read, never edited.
- **No text given.** The input is the agent's own last reply in this conversation.
- **Nothing to restate.** On a first turn, or when there is no earlier reply, say that there is
  nothing to restate yet and stop. Never invent a text to rewrite.

## What plain means

The plain-language standard ISO 24495-1 sets four aims. Each one is a check on the rewrite:

1. **Relevant.** The reader gets what the decision in front of them needs. Background the
   reader does not need for it moves to the end, or goes when it carries no fact.
2. **Findable.** The main point comes first: the answer, the verdict, the no. The support
   follows it, in the order the reader will need it.
3. **Understandable.** Each sentence can be read once and understood.
4. **Usable.** The reader can act on it: the next step, who takes it, and what blocks it are
   named where the input named them.

At the sentence level:

- One idea per sentence.
- Common words over rare ones. A term of art stays when it is the exact name of the thing; on
  its first use it gets a few plain words of explanation.
- Active voice, with the actor named: "the test failed", not "a failure was observed".
- Short sentences. Three or more items side by side become a list.
- Numbers as digits, with their unit.
- Filler hedges go ("it would appear that", "perhaps"). A word that states how sure the text is
  stays, because it is a confidence label, not filler.

## What stays word for word

Rewording any of these would change what the text says, so each is copied exactly:

- every fact and every number, with its unit and its precision;
- every path, `path:line` locator, command, flag, identifier, version and commit;
- every confidence label, and what the text said it rests on;
- every `Not done:` item, item for item, in its order;
- every security finding, with its severity;
- every quoted error message, test name and code block.

## Hard lines

- **A no stays a no.** A refusal, a red gate, a "not done" or a "this is not safe" stays as firm
  as it was, and moves to the front. It never becomes a maybe, a "mostly" or a suggestion.
- **No open gap is dropped.** Every caveat, risk, open question and unverified claim in the
  input is in the output. Being shorter is never a reason to lose one.
- **No claim is added.** The rewrite says nothing the input did not: no new fact, no new
  reassurance, no guessed cause, and no more or less certainty than the input stated.
- **When in doubt, keep the words.** A sentence that cannot get plainer without changing what
  it claims stays as it was.

## Example

Before:

> It would appear that, upon further investigation, the migration may not have completed
> successfully in all environments, and it is perhaps advisable to refrain from deploying at
> this juncture. Confidence: medium, based on the staging logs.
> Not done: the smoke check in `scripts/smoke.sh` was not run.

After:

> Do not deploy yet. The migration may have failed in some environments.
> Confidence: medium, based on the staging logs.
> Not done: the smoke check in `scripts/smoke.sh` was not run.

The no comes first and stays a no. "May" stays "may", the confidence label and what it rests on
are kept, and the `Not done:` line is copied as it stood.

## Output

The rewritten text, and nothing else: no preface, no list of what changed, no closing offer. It
is in the language of the input. Its length follows the content: usually shorter, sometimes
longer when a term needs its few words of explanation.

This skill writes no file. A request to change the wording of a file in the repository, a page,
a comment or a message, is an edit: route it to `/st-quick` when it is small, or to `/st-work`
when it is larger, with the rewritten text as its input.
