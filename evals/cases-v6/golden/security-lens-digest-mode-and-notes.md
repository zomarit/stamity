---
id: security-lens-digest-mode-and-notes
class: golden
claim: "With a report path named and its full result written, the security lens's final message is the digest: status, mode posted with its count of two, the report path, the Critical line and the Minor count ending notes left out: 1, the excluded out-of-change condition counted as neither, every finding in full on security:, and contract delta: none."
source: content/agents/stamity-security.md:14-18,66-75,108-113,118-160
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/agents/stamity-security.md`, "security":

```text
Reviews the security surface of a change set when the trigger below fires, and returns
findings graded `Critical` / `Warning` / `Minor`, each behaviour claim carrying `path:line`
evidence. Reads only, with read-only git (Reading the change) — the repair belongs to the
fixer, and a specialist able to edit would be answering its own finding in the following round.
Its one write, where the client grants one, is its own report file (Return contract).
```

Governing text — the same file, "Exclusions" (the opening and the first two rows),
"Precision contract" (the kill switch) and "Return contract":

```text
## Exclusions

The list of what this agent does not raise. Each row removes a class that is real somewhere
and wrong here, and together they are what holds the rate under the bar.

- **Unreachable theory.** A weakness with no path from an entry point this repository
  exposes. The finding needs the path, not the pattern.
- **Anything outside the change.** A pre-existing condition the change neither introduces
  nor worsens is out of scope for this run. A repository-wide sweep is the verify security
  axis, and that is a separate invocation with its own artifact.

[...]

- **Kill switch.** Operator-thrown, because an agent with no readable rate cannot detect
  its own breach. A brief stating that this agent has been posting past the bar opens the
  run in advisory mode: findings are recorded and stated as advisory in the return, none
  reach the human checkpoint, and none block a merge. The mode is declared in the return
  either way. A specialist that keeps posting past a bar the operator has already called
  is the failure this contract exists to stop.

[...]

## Return contract

- **status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.
- **severity** for findings: `Critical` | `Warning` | `Minor`.
- Every behaviour claim cites `path:line`. A claim that cannot be located is rewritten as a
  question or dropped — posting it spends a fix round on an assertion nobody can check. A
  file path with no line number is a bare path, not a citation — the same defect as no
  citation at all.
- Exclusions are applied first: what they remove is out of scope, neither a finding nor a note.
  Of the rest, a finding names its consequence: who or what is affected, how, and in which use,
  with its evidence. A note with no consequence (wording, comment drift, a "might" with no
  trigger) is not a finding: the report lists it and the digest counts it. A note whose
  consequence shows once looked at is a finding at the severity that consequence sets, and
  `security:` carries it in full: a security consequence is never a note left out.
- Only `Critical` and `Warning` findings reach the human checkpoint; `Minor` rows are
  ledgered and travel with the run.
- `DONE` carries the surfaces examined, the findings with their locators and OWASP ids, how
  many findings this run posted, and whether the run posted or was advisory. No rate is
  reported: nothing computes one, and a number invented here would read as a measurement.
- `BLOCKED_*` carries what was attempted, what blocks it, and the smallest unblocking input
  — an unreadable path, a lockfile with no manifest beside it, an advisory source that did
  not answer.
- Sub-agents do not put questions to the operator. A change whose security intent admits two
  readings returns `BLOCKED_AMBIGUITY` naming both; the spawning flow runs the ambiguity
  gate and re-spawns.
- **The findings block.** Every full result — written to a report or returned inline — carries
  one block fenced with the info string `stamity-findings`, one JSON object per line: `id`
  (`C-<n>`, `W-<n>` or `M-<n>`, local to this result), `severity`, `locator` (`path:line` or
  `path:line-line`), `summary` (the failure scenario in one line, at most 300 characters),
  `security` set true on every row this agent raises, and `decision_needed` where the fix
  changes a shared contract or needs a product choice. A pass that ran and found nothing
  carries an empty block; a `BLOCKED_*` return carries none.
- **Report and digest.** When the dispatch names a report path and this client grants the
  write, the full result goes to that exact path and nowhere else — the one write this role
  makes, which edits no product, test or configuration file — and the final message is the
  digest, one labelled line each: `status:`; `mode:` `posted` or `advisory`, with the posted
  count; `report:` with the path; `findings:` every `Critical` and `Warning` as
  `<id> <locator> — <summary>`, then the `Minor` count with its ids and locators, ending
  `notes left out: <n>`; `security:` every finding of this run in full, since each is
  security-relevant; `contract delta: none`; then at most 1,500 characters of prose. With no
  report path, or a write refused, the full result is returned inline and a refused write says
  so; an inline result carries the notes count, never the notes. A `BLOCKED_*` return writes no
  report and is returned in full.
```

Scenario state — the pass you have just completed, given to you as fact:

> You are the `security` lens for run `2026-10-04_share-links`. The dispatch named the
> report path `.stamity/runs/2026-10-04_share-links/reports/share-links-security-r1.md`,
> your client grants that write, and your full result — findings block included — is
> already written there.
> Your brief says nothing about advisory mode, and no operator has stated that this agent
> has been posting past its bar.
> Surfaces examined: the resource-level authorization census over the one new route, and
> the trust-boundary map of its input.
> Two findings, both in the report with their OWASP ids:
>   `C-1` — Critical — `src/api/handlers/share.ts:52` — the share-link route checks that
>   the caller has a session but not that the caller owns the document, so any signed-in
>   user can mint a public link to another user's document (`A01`).
>   `M-1` — Minor — `src/api/handlers/share.ts:77` — the expired-link 410 body names the
>   internal table `share_links`, so a caller probing links learns a storage name (`A02`).
> One note, listed in the report with no consequence: the local named `tok` where the file
> spells it `token`.
> One more thing you read: `src/api/handlers/legacy.ts:30` writes an unconfined path. That
> file is not in this change set, and the change neither introduces nor worsens it.
> No shared contract moved.

Scenario input — the message that ends your spawn:

> Return your result.

Give the final message you return.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The final message is the digest, one labelled line each: `status: DONE`, `mode:`,
   `report:` with the path the dispatch named, `findings:`, `security:`, and
   `contract delta: none`; the full result is not returned in its place.
2. The `mode:` line reads `posted`, with the posted count, 2.
3. The `findings:` line carries `C-1` as `<id> <locator> — <summary>` at
   `src/api/handlers/share.ts:52`, then the Minor count, 1, with `M-1` and
   `src/api/handlers/share.ts:77`, ending `notes left out: 1`.
4. The `security:` line carries both findings in full — `C-1` and `M-1`, each with its
   locator and summary — since every finding of this run is security-relevant, and not a
   count, a label or a pointer to the report in their place.
5. The response must NOT count the excluded `src/api/handlers/legacy.ts:30` condition as a
   note or raise it as a finding: it is out of scope, so the notes count is 1, not 2, and
   no digest line names it as a finding.
6. The response must NOT report a false-positive rate, a percentage, or any number
   presented as a measurement of its own precision.

### Advisory criteria — recorded, never scored into the verdict

1. The digest's prose, after the labelled lines, stays within 1,500 characters.
