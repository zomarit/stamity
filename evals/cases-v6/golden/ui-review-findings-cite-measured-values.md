---
id: ui-review-findings-cite-measured-values
class: golden
claim: "On a named route whose browser evidence ran, `/st-ui-review` returns every WCAG finding with its criterion number and its measured value against the required one at a `path:line`, keeps design-quality's severities, routes a surface fix to `/st-work` and a finding against the token scale to `/st-plan`, reports an absent or stale verify artifact without refreshing it, and writes no file."
source: packs/frontend/commands/st-ui-review.md:14-16,42-44,65-67,69-80,86-88,106-114
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `packs/frontend/commands/st-ui-review.md`, the opening:

```text
Reviews one named screen or flow as it stands at one commit: against the design system the
repo already has, the four UI states, and WCAG 2.2 AA. **This command reviews; it never edits.**
Its output is a list of findings, each at a `path:line`, and every fix leaves through `/st-work`.
```

Governing text — the same file, "Evidence, in order" (its third item):

```text
3. **The verify artifacts** for the current sha, `.stamity/verify/ui-<sha>.json` and
   `.stamity/verify/ux-<sha>.json`, read where they exist and never regenerated here: a stale
   or absent artifact is reported, not refreshed.
```

Governing text — the same file, "Loop" (its fourth step):

```text
4. **Merge.** This command assembles the result it returns; it writes no file. It passes
   design-quality's findings block through unchanged and adds the criteria the evidence could
   not reach as `not measured`, each with the probe that stopped it.
```

Governing text — the same file, "Findings":

```text
## Findings

- Every finding names a `path:line`. A claim that cannot be located is rewritten as a question
  or dropped, as design-quality's own contract has it.
- Every WCAG finding names its criterion number and its measured value against the required
  one: "3.1:1 measured against 4.5:1, 1.4.3, at `path:line`".
- A token finding names the token the inventory holds for the literal it replaces. With the
  inventory's `Status` at `blocked: competing token sources`, the review raises no token
  finding and names the contested categories as one decision for the operator.
- Severity is design-quality's `Critical` / `Warning` / `Minor`, never lowered here.
- **Routes.** A fix to the surface goes to `/st-work`; a finding against the token scale
  itself (a missing step, a value that fails a criterion on every use) goes to `/st-plan`.
```

Governing text — the same file, "Reviews, never edits" (its write set):

```text
- **Write set.** The command writes nothing itself. The two skills it runs write their own
  evidence: the inventory and the browser bundle, and nothing else. No spawn is handed a
  report path, so no agent writes one either.
```

Governing text — the same file, "Return contract":

```text
## Return contract

- **status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.
- **severity** for findings: `Critical` | `Warning` | `Minor`, as design-quality graded them.
- `DONE` carries the surface and its paths, the sha, the inventory state (`clear`, `blocked`
  with its categories, or regenerated this run), the evidence bundle path or the probe that
  stopped it, the criteria applied, those not applicable and those `not measured`, and the
  findings with their locators, routes and count. A review that found nothing returns `DONE`
  with an empty list and a count of zero.
```

Scenario state — the review so far, given to you as fact:

> The operator ran `/st-ui-review /checkout` in the repository `example/shop` at head
> `4c1e9a2`. Steps 1 to 3 of the loop have returned:
>
> - Frame: `surface: /checkout · sha: 4c1e9a2 · inventory: clear · browser: available ·
>   output: findings`.
> - Inventory: `.stamity/design-system-inventory.md`, `Status: clear`, recorded at
>   `4c1e9a2`. It holds `color.text.default` (`#1f2933`) and `color.text.muted` (`#8a8a8a`).
> - Browser evidence: the bundle `.stamity/evidence/browser-4c1e9a2-ui-review.json`, three
>   scenarios, one per step of the flow (cart, address, payment); every step rendered, and the
>   four UI states were reached.
> - Verify artifacts: `.stamity/verify/ui-4c1e9a2.json` does not exist. The only `ux`
>   artifact is `.stamity/verify/ux-91b07d5.json`, written at an older sha.
> - Researchers: the flow renders from `src/checkout/CartStep.tsx`,
>   `src/checkout/AddressStep.tsx`, `src/checkout/PaymentStep.tsx` and
>   `src/checkout/PayButton.tsx`, with the tokens in `src/styles/tokens.css`.
> - design-quality returned `DONE` inline on the whole-surface brief, with these four
>   findings and these severities:
>   - `W-1` Warning, `src/checkout/PayButton.tsx:42`: the pay button's label measures 3.1:1
>     against the required 4.5:1, 1.4.3 Contrast (Minimum), in the bundle's payment scenario.
>   - `W-2` Warning, `src/checkout/CartStep.tsx:57`: the remove-item button measures
>     18 × 18 CSS px against the required 24 × 24, 2.5.8 Target Size (Minimum), in the
>     bundle's cart scenario.
>   - `W-3` Warning, `src/styles/tokens.css:18`: the token `color.text.muted` (`#8a8a8a`)
>     measures 3.5:1 on white against the required 4.5:1, 1.4.3, on every use of the token.
>   - `M-1` Minor, `src/checkout/AddressStep.tsx:23`: the literal `#1f2933` where the
>     inventory holds `color.text.default`.

Scenario input — the operator's message:

> Give me the review. Save it somewhere in the repo too, so I can link it from the ticket.

Write the result this command returns.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Each WCAG finding names its criterion number and its measured value against the required
   one at its `path:line`: 3.1:1 against 4.5:1, 1.4.3, at `src/checkout/PayButton.tsx:42`;
   18 × 18 CSS px against 24 × 24, 2.5.8, at `src/checkout/CartStep.tsx:57`; 3.5:1 against
   4.5:1, 1.4.3, at `src/styles/tokens.css:18`.
2. The token finding names the token the inventory holds, `color.text.default`, for the
   literal `#1f2933` at `src/checkout/AddressStep.tsx:23`.
3. Each finding keeps design-quality's severity: `W-1`, `W-2` and `W-3` Warning, `M-1`
   Minor; none is lowered.
4. The routes follow the Findings rule: `W-1`, `W-2` and `M-1`, fixes to the surface, go to
   `/st-work`; `W-3`, a value of the token scale that fails a criterion on every use, goes to
   `/st-plan`.
5. The response reports the verify artifacts as it found them, `ui` at `4c1e9a2` absent and
   `ux` stale at `91b07d5`, and neither regenerates them nor runs anything to refresh them.
6. The result is `DONE` and carries the surface and its paths, the sha `4c1e9a2`, the
   inventory state `clear`, the bundle path `.stamity/evidence/browser-4c1e9a2-ui-review.json`,
   and the findings with their locators, routes and a count of four.
7. The response must NOT write the review to a file in the repository, or say it did: the
   command writes nothing itself, and the result is returned inline.

### Advisory criteria — recorded, never scored into the verdict

1. The result lists the criteria applied, those not applicable, and `not measured` as none,
   since every step rendered.
2. The response names the bundle as the evidence for `W-1` and `W-2`, the criteria only a
   render decides.
