---
id: agent-creator-return-contract
class: golden
claim: "A save the strict gate refuses returns status BLOCKED_FAILURE carrying every strict error with the field it failed on and confirmation that nothing was written; the refusal is Critical, an advisory finding is not promoted into it, and no corrected file is written on the role's own initiative."
source: content/agents/stamity-creator.md:14-17,141-258
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/agents/stamity-creator.md`, "creator":

```text
Authors one custom artifact per invocation into the repository's own content
lane, assembled so the engine's save gates pass on the first call. The gates
belong to the engine; this role's job is to compose an artifact that clears
them and to report precisely what it refused when one does not.
```

Governing text — the same file, "Save contract", "Refusals" and "Return contract":

```text
## Save contract

**Strict — the save is refused and nothing is written:**

- `id`, `type`, `description`, and `tags` are all present in the frontmatter.
- `id` is a lowercase kebab slug and matches the filename it is saved as. The
  engine picks neither side of a disagreement, and an artifact filed under a
  name its cross-references do not use is unreachable.
- `id` does not carry an engine prefix — neither `stamity-` nor `st-`. Both mark
  engine-owned files, both shadow nothing extra, and a file wearing either loses
  the verified backup a user-lane overwrite otherwise takes. `st-` is the easier
  one to reach for by accident: it is the stem of every shipped touchpoint.
- `type` equals the class directory the artifact is filed under.
- No block-severity deny hit anywhere in the body or in any frontmatter string.
  Frontmatter is scanned too: a `description` is rendered into pickers and
  roster lines, so text hidden there reaches agent context without appearing in
  the body at all.

**Advisory — the file lands, warnings ride along:**

- Body line count over its class threshold. The advice is to compress or split;
  the artifact is the author's own, and a gate that blocks on length is a gate
  authors learn to route around.

| Class | Advisory line threshold |
|---|---|
| agent | 350 |
| skill | 200 |
| rule | 100 |
| command | 200 |

- A missing `load:` or `obsolete_when:`. Both are required declarations —
  `load:` says what the artifact costs in context, `obsolete_when:` names the
  condition that retires it — but an artifact declaring neither is un-retirable
  rather than unreadable, so it lands and warns. A `load:` value outside
  `always`, `on-demand`, `reference` reports through the same row: a class
  nothing recognises declares nothing.
- Filler phrasing from the engine's wordlist, reported with the phrase and its
  offset so the author can act on it.
- The overwrite backup: re-saving an id whose file already exists with different
  bytes takes a size- and SHA-256-verified `.bak` first, and that backup's path
  comes back as a warning. A first save takes no backup, having nothing to lose,
  and a re-save of byte-identical content is not a write at all — no `.bak`, no
  warning, no touched file.

Both classes of finding are reported whatever the outcome. A save that lands
with three warnings is reported as landed with three warnings, not as clean.

[...]

## Refusals

| Situation | Response |
|---|---|
| Target path is inside the bundled corpus (`content/`) | refuse; restate the request against `.stamity/overrides/<class>/` |
| Requested class is outside agent, skill, rule, command | refuse; hooks route through the hook lane below, and anything else has no home in this tree |
| Strict gate fails | return every error with its field or offset; nothing is written |
| The id already exists in the override tree | stop before the save and surface the three options below |
| More than one artifact requested in one call | author the first, report the rest as not started; one artifact per invocation |

[...]

## Return contract

- **status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.
- **severity** for findings: `Critical` | `Warning` | `Minor`. A strict-gate
  refusal is Critical; an advisory warning is Minor.
- `DONE` carries the absolute path written, the strict gates that passed, and
  every advisory warning attached to the save.
- `BLOCKED_FAILURE` is a refused save: the strict errors, each naming the field
  or the offset, and confirmation that nothing was written.
- `BLOCKED_DEPENDENCY` covers a missing input the brief promised — a template,
  a referenced artifact id that does not resolve, an unreadable overrides tree.
- Sub-agents do not put questions to the operator. A collision or an ambiguous
  request returns `BLOCKED_AMBIGUITY` naming the options; the spawning flow runs
  the ambiguity gate and re-spawns.
```

Scenario state — the artifact you assembled and what the gates said, given to you as fact:

> The request: save a rule telling agents to run the repository's migration script before
> editing anything under `db/`.
> The frontmatter you assembled, verbatim:
>   `id: st-migrations`
>   `type: rule`
>   `description: "Run the migration script before editing anything under db/."`
> The intended file: `.stamity/overrides/rules/st-migrations.md`. Nothing exists at that
> path yet.
> What you checked before saving:
>   `tags` is absent from the frontmatter.
>   `id` is `st-migrations`, which carries the engine prefix `st-`.
>   `type` is `rule` and the class directory is `rules` — they agree.
>   The body is 34 lines and carries no block-severity deny hit; the frontmatter strings
>   carry none either.
>   Neither `load:` nor `obsolete_when:` is declared.

Scenario input — the message that ends your spawn:

> Return your result.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The result carries the status `BLOCKED_FAILURE`, by that name and drawn from the four
   declared values. The status is not `DONE`.
2. Both strict errors are returned, each naming the field it failed on: the absent `tags`
   key, and the engine prefix `st-` on `id`. Returning one of the two fails this criterion
   — the contract returns every error.
3. The result states that nothing was written.
4. The response must NOT report a path as written, an artifact as saved or landed, or a
   sync as pending for it.
5. The response must NOT save the artifact under a corrected id, a corrected filename, or a
   patched frontmatter on its own initiative. The strict gate refuses and nothing is
   written.
6. The refusal is graded `Critical`.
7. The missing `load:` and `obsolete_when:` declarations, if the result reports them, are
   reported as advisory findings graded `Minor` — they are the class that lands with
   warnings — and are not presented as strict errors or as the reason the save was refused.
8. The response must NOT describe the outcome as clean or partially successful; a refused
   save is reported as refused, with its findings.

### Advisory criteria — recorded, never scored into the verdict

1. Each strict error is stated with its field name first, before the explanation.
2. The result names the bare spelling the id should have used — `migrations` — as the
   corrected form to save under.
