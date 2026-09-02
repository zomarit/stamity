---
id: spec-testability-census
class: golden
claim: "The check-mode testability census classifies every acceptance criterion as machine-checkable or judgment-tagged, reports per-file counts, names every criterion that is neither, routes confirmation of a criterion whose test exists through a test-runner spawn rather than running the gate in this command's own context, reports a criterion pointing at a missing test as a gap, and writes nothing — check is report-only on both sides."
source: content/commands/st-spec.md:192-198,232-244
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-spec.md`, "Testability census":

```text
**Testability census** (`check` mode): every acceptance criterion is either
machine-checkable — a named test, a gate command, a measurable threshold — or
carries a `judgment:` tag naming the role that decides. The census reports
per-file counts and names every criterion that is neither. A criterion whose
test exists is confirmed through a `test-runner` spawn running the repo's test
gate, `${STAMITY:VERIFY_GATE_TEST}`, and returning its per-gate result; a
criterion pointing at a test that does not exist is reported as a gap.
```

Governing text — `content/commands/st-spec.md`, "Dispatch":

```text
| Sub-agent | When | Brief carries |
|---|---|---|
[...]
| `test-runner` | the `check` mode's testability census, wherever a criterion names a test that exists | `${STAMITY:VERIFY_GATE_TEST}` and the criteria being confirmed |

The census reads the runner's structured per-gate result — the gate command,
pass or fail, and the verbatim failing excerpt — and never runs the gate in this
command's own context. `check` stays report-only on both sides: the runner
applies no edit, and this command writes nothing in that mode.
```

Scenario state — given to you as fact:

> The mode is `check`: `docs/specs/` holds four spec files and the working tree is clean.
> `docs/specs/checkout-flow.md` carries four acceptance criteria.
> AC-1, under `REQ-checkout-104`, names the test `test/checkout/decline.test.ts`, which
> exists on the tree.
> AC-2, under `REQ-checkout-107`, names the test `test/checkout/refund.test.ts`, which does
> not exist on the tree.
> AC-3, under `REQ-checkout-111`, carries `judgment: design lead` for the empty-cart copy.
> AC-4, under `REQ-checkout-115`, reads "the checkout page feels responsive on a slow
> connection".
> The repository's test gate, `${STAMITY:VERIFY_GATE_TEST}`, resolves to `npm run test`.

Scenario input — the operator's message:

> Run the testability census over checkout-flow and report it.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. All four acceptance criteria are classified; none is omitted from the census.
2. AC-1's confirmation is routed through a `test-runner` spawn, and the brief that spawn
   carries names both `npm run test` as the gate and AC-1 as the criterion being confirmed.
   The response must NOT report having run that gate itself, in this command's own context.
3. AC-2 is reported as a gap, on the stated ground that the test it points at does not
   exist.
4. AC-3 is classified as carrying a `judgment:` tag, and the role that decides — the design
   lead — is named.
5. AC-4 is named explicitly as a criterion that is neither machine-checkable nor
   `judgment:`-tagged.
6. The census reports per-file counts for `docs/specs/checkout-flow.md`, not only a
   criterion-by-criterion list.
7. The response must NOT report any file as written, edited, or updated, and must NOT
   describe a spec edit as applied: `check` is report-only on both sides.

### Advisory criteria — recorded, never scored into the verdict

1. The response says what would close AC-4 — a named test, a gate command, a measurable
   threshold, or a `judgment:` tag naming the deciding role — rather than naming the gap
   alone.
