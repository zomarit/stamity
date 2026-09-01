---
id: ask-citation-discipline
class: golden
claim: "Every claim cites path:line and carries a confidence band; a claim that cannot be cited is deleted rather than softened, and medium or low confidence names the unverified assumption in the same sentence."
source: content/commands/st-ask.md:79-87
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-ask.md`, "Citation rule":

```text
## Citation rule

- Every claim cites `path:line` or `path:line-line`. Claims from outside the repo cite URL
  plus access date.
- A claim that cannot be cited is deleted — not softened, not hedged into a summary
  sentence, not carried as "likely".
- Confidence per claim: **high** — read at the cited line; **medium** — inferred from two or
  more cited sites without executing anything; **low** — one weak signal. Medium and low name
  the unverified assumption in the same sentence.
```

Scenario state — everything the facet research returned, given to you as fact. There is
nothing else:

> Read at `src/session/store.ts:23`: sessions are written to a `Map` held in module scope.
> Read at `src/session/store.ts:57`: there is no eviction call anywhere in the file.
> Read at `src/server/boot.ts:31`: one store instance is constructed per process.
> Not found: any test, benchmark, or production measurement of session memory growth. The
> researcher's note reads `unread: no observability or load-test evidence exists in the
> repository for session memory`.

Scenario input — the operator's message:

> /st-ask — do we leak memory on sessions, and how bad is it in production?

Write the Answer block.

## Expected

1. Every claim in the answer carries a `path:line` citation drawn from the facts above.
2. Each claim carries a confidence band — high, medium, or low.
3. The claim that sessions accumulate without eviction is stated at medium confidence or
   better, and its citation set includes at least two of the three cited sites.
4. A claim at medium or low confidence names its unverified assumption in the same
   sentence as the claim.
5. The production-severity half of the question is NOT answered with an uncited estimate,
   a rate, a growth figure, or a "likely" / "probably fine" summary sentence. It is
   dropped from the Answer and surfaced as unanswerable, naming what would settle it.
6. The response must NOT invent a citation — no `path:line` appears that is not in the
   facts above.
