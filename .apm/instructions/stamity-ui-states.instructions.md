---
description: Four-state contract for any interface surface that reads data — loading, empty, error, and success each rendered explicitly, with error copy that names a next step, empty states designed by sub-type, and strings and styling taken from the layers the repo already has.
applyTo: "**/components/**,**/pages/**,**/views/**,**/*.tsx,**/*.vue,**/*.svelte"
---

# UI States

A surface that reads data has four outcomes and owes four renders. The default
failure is a view built for the success case that improvises the other three: a
spinner with no end, a blank page that reads as breakage, a message carrying a
status code. Each outcome has a distinct cause and a distinct next action, so
each is built rather than inherited.

## Floor

1. **Four states, one state value.** Every data-bearing surface renders all four:

| State | Trigger | Renders |
|---|---|---|
| Loading | The read is in flight | A placeholder at the final content's dimensions, so arrival shifts no layout |
| Empty | The read succeeded and returned nothing | The sub-typed empty surface below — never the success layout with zero rows |
| Error | The read failed, or returned data the surface cannot use | What failed, in the reader's vocabulary, plus the action that recovers |
| Success | The read returned usable data | The content |

   The state is one value, not a set of independent booleans: `loading` with
   `error`, or `empty` with `success`, are unrenderable combinations that exist
   only because flags permit them. A partly-failed read renders the error state
   for the failed subset beside the succeeded subset — never a silent drop.

2. **Error copy names the failure and the next step.** One sentence for what
   failed, one action that recovers it: retry when a retry can succeed, an
   alternate path when it cannot. The action sits on the surface, not in a
   console. Implementation vocabulary — status codes, exception class names,
   null, undefined — stays in logs and reports. Copy that says only that
   something went wrong has told the reader nothing actionable.
3. **Empty states are designed by sub-type, not defaulted.** Three sub-types
   with three different actions: nothing exists yet (create the first one), a
   filter or query excluded everything (clear it), or access is missing
   (request it). Resolve the sub-type by predicate in that order — permission,
   then active filter, then total count. Offering "clear filters" on a
   first-run surface is the archetypal defect: the control does nothing.
4. **Strings come from the localisation layer where the repo has one.** No
   user-facing literal inside a component, one message id per sentence, and
   plural and gender variants carried inside the message. Sentences assembled
   by concatenation cannot be translated, because word order is not universal.
5. **Styling comes from the token system where the repo has one.** Colour,
   spacing, and type read from the tokens the design-system inventory reports;
   a literal with a token equivalent is a finding. Where detection reports no
   token source, the surface follows the conventions of the files around it and
   the absence is reported rather than answered with a new parallel system.
6. **The accessibility floor is not deferred to a later pass.** Every control
   resolves to an accessible name, focus remains visible, the error surface
   announces itself to assistive technology, and every state is reachable by
   keyboard alone. Contrast ratios, target sizes, and scanner-decidable rows
   belong to the verify skill's UI axis, which runs them as checks.

## Gates

- A data-bearing surface with fewer than four reachable states is not done. The
  missing state is named in the `Not done:` list rather than discovered by a
  reader who hit it first.
- Each of the four states has a case in the suite that renders it. A state
  reachable only in the code path has never been seen.
- An error string with no recovery action, and an empty state that renders the
  wrong sub-type's action, both fail review as behaviour defects.
- A new user-facing literal in a repo with a localisation layer, and a new
  colour, spacing, or type literal in a repo with tokens, are rejected with the
  existing key or token named in the finding.
- Interface changes carry rendered evidence per state, not a description of
  what the render would show.
