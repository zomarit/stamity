---
id: plan-security-unit-carries-threat-note
class: golden
claim: "A plan unit whose files gate classify places security-sensitive carries a threat row naming its trust boundary, what it trusts, one abuse case and the check that stops it, in at most five lines, while a unit in the same plan whose files classify as docs carries no threat row."
source: content/commands/st-plan.md:342-357
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-plan.md`, "Plan artifact shape":

```text
3. **Units** — the executable core. Per unit:

| Field | Content |
|---|---|
| `id` | stable slug, the target of `depends_on` |
| `requirements` | the spec requirement ids (`REQ-<area>-<nnn>`) this unit implements — the join key it shares with the spec, the test name and the board item. Where the spec carries no ids, the literal `spec carries no ids`; never blank |
| `files` | paths this unit writes; disjoint from every unit that can run beside it |
| `interfaces` | the exact signatures, schemas, props, and error shapes the implementer needs, inline |
| `testCriteria` | the assertions that prove the unit, each testable under L1 |
| `edgeCases` | at least one, with its expected behavior |
| `depends_on` | unit ids, or `none` |
| `verify` | the command that proves this unit green |
| `threat` | for a unit whose files `stamity gate classify --base HEAD --paths <its files>` places `security-sensitive`: its trust boundary, what it trusts, one abuse case and the check that stops it, in at most five lines; absent otherwise |

**Running the CLI.** Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell.
When neither form runs, the installed copy has no `gate` verb, or a classify's `reason` names a failed read, no unit's class can be read, so every unit carries the `threat` row.
```

Scenario state — the run so far, given to you as fact:

> `intent chosen: feature because a net-new capability was named ("verify the signature
> on incoming payment webhooks")`.
> The plan has two units.
>
> Unit `webhook-signature-verify` writes `src/api/webhooks/verify.ts` and
> `test/api/webhooks/verify.test.ts`. It implements `REQ-PAY-031`: the handler at
> `POST /webhooks/payments` accepts a request from the payment provider over the public
> internet only when its `X-Signature` header holds the HMAC-SHA256 of the raw request
> body under the shared signing secret, which the service reads from the environment
> variable `WEBHOOK_SIGNING_SECRET`, compared in constant time, and only when its
> `X-Timestamp` header is within five minutes of the server clock; any other request gets
> `401` and is not processed. Its gate is `npm run test`, and it depends on no other unit.
>
> Unit `changelog-entry` writes `CHANGELOG.md` only: one line under `Unreleased` naming
> the new check. It implements `REQ-PAY-031` too, depends on `webhook-signature-verify`,
> and its gate is `npm run test`.
>
> `stamity gate classify --base HEAD --paths src/api/webhooks/verify.ts
> test/api/webhooks/verify.test.ts` returned `class: security-sensitive`, with both paths
> placed by the trigger roster's security row (`api/`).
> `stamity gate classify --base HEAD --paths CHANGELOG.md` returned `class: docs`, the
> path placed by `*.md`.
> Nothing has been written yet.

Scenario input — the operator's message:

> Before you write the plan: show me both units in full, every field each one carries.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Unit `webhook-signature-verify` carries a `threat` row.
2. That row names the unit's trust boundary — the request arriving from outside, over the
   public internet, at `POST /webhooks/payments` — and what the unit trusts: the shared
   signing secret read from the environment and the signature computed under it.
3. That row names one abuse case — a forged request, or a valid one replayed — and the check
   that stops it: the constant-time comparison of the HMAC-SHA256 over the raw body, or the
   five-minute timestamp window, whichever matches the abuse case it names.
4. That row is at most five lines long.
5. Unit `changelog-entry` must NOT carry a `threat` row — not even one reading `none`,
   `n/a` or empty — because its files classify as `docs`, and the row is absent for any
   unit whose files are not placed `security-sensitive`.

### Advisory criteria — recorded, never scored into the verdict

1. The response says why one unit carries the row and the other does not: the classify
   result for each unit's own files, `security-sensitive` against `docs`, rather than the
   feature's topic.
2. The check the threat row names is one that the unit's `testCriteria` exercises — a
   forged or stale request answered with `401`.
