---
id: ask-narrow-symbol
class: golden
claim: "A question naming one symbol is sized as a named target: it is answered from the orchestrator's own bounded read or by at most one quick researcher, never a mechanism or impact fan-out, and every claim in the answer cites path:line with a confidence band."
source: content/commands/st-ask.md:52-65,78-80,93-99
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-ask.md`, "Facets" and "Context budget":

```text
| Question shape | Facets | Depth per facet |
|---|---|---|
| Named target — "what does `parseLedgerText` return?", "what is in `src/runs/blocks.ts`?" | 0-1 | quick |
| Single fact — "where is rate limiting enforced?" | 1 | quick |
| Mechanism — "how does the auth flow work?" | 2-3: entry points, state, failure paths | standard |
| Impact — "what would multi-tenancy touch?" | 3-5: data model, request path, config, tests | deep |

A question that names one symbol or one file is answered directly: the orchestrator reads the
named definition and at most its direct call sites found by one search, and cites every claim
under the Citation rule. When that read would pass about 300 lines or a second file's body, one
quick researcher answers it instead. A symbol defined in more than one file is a mechanism
question and fans out as one. A named symbol the one search does not find is an Unanswerable
row that names the search it ran — the pattern and the paths it covered — in place of an
`unread:` note. Mechanism and impact questions keep their fan-out.

[...]

- Facet findings land in the orchestrator; file contents do not — except on the named-target
  shape, where the orchestrator's own bounded read is the answer. A cited line is re-read
  only to resolve a contradiction between two facets.
```

Governing text — the same file, "Citation rule":

```text
- Every claim cites `path:line` or `path:line-line`. Claims from outside the repo cite URL
  plus access date.
- A claim that cannot be cited is deleted — not softened, not hedged into a summary
  sentence, not carried as "likely".
- Confidence per claim: **high** — read at the cited line; **medium** — inferred from two or
  more cited sites without executing anything; **low** — one weak signal. Medium and low name
  the unverified assumption in the same sentence.
```

Scenario state — what the repository holds, given to you as fact (treat it as what a read
returns, whoever makes the read):

> One search for the symbol, `git grep -n formatTotal`, returns four lines:
>   `src/cart/total.ts:18` — `export function formatTotal(cents: number, currency: string): string {`
>   `src/cart/CartSummary.tsx:31` — `<span>{formatTotal(cart.totalCents, cart.currency)}</span>`
>   `src/checkout/receipt.ts:12` — `const total = formatTotal(order.totalCents, order.currency);`
>   `test/cart/total.test.ts:9` — `expect(formatTotal(1999, "EUR")).toBe("€19.99");`
> `src/cart/total.ts` is 64 lines long. Its lines 17-21 read:
>   17 `/** Formats a cart total, given in cents, in the cart's currency. */`
>   18 `export function formatTotal(cents: number, currency: string): string {`
>   19 `  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });`
>   20 `  return formatter.format(cents / 100);`
>   21 `}`
> No other file defines `formatTotal`.

Scenario input — the operator's question:

> /st-ask where is `formatTotal` defined, and what does it return?

Answer as this command would, and say how many researchers you dispatched for it.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The question is sized as the named-target shape: it is answered from the orchestrator's
   own bounded read, or by exactly one quick researcher, and the response states the count —
   0 or 1.
2. The definition is cited at `src/cart/total.ts:18`, or at a range of that file that
   contains line 18.
3. The return value is stated — a `string`: the amount, `cents / 100`, formatted as currency
   in the given currency by `Intl.NumberFormat` with the `en-US` locale — and cited at
   `src/cart/total.ts:19-20` or lines within `17-21`.
4. Every claim carries a `path:line` citation and a confidence band, and a medium or low
   claim names its unverified assumption in the same sentence.
5. The response must NOT dispatch a mechanism or impact fan-out: no two or more researchers,
   and no facets for entry points, state or failure paths.
6. The response must NOT make a claim it does not cite — about the callers' behaviour, or
   any file beyond the cited lines — and must NOT carry one as "likely".

### Advisory criteria — recorded, never scored into the verdict

1. The response names the call sites the one search found, `src/cart/CartSummary.tsx:31`
   and `src/checkout/receipt.ts:12`, each with its citation.
