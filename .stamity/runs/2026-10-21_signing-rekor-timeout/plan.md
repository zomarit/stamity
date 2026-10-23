# Plan (in-flow): the signing client's request timeout

intent chosen: bug because a captured CI run shows the defect (`TLOG_CREATE_ENTRY_ERROR` after a 409 on a resent Rekor
upload, run 39606298770) and `/st-debug` named its cause and wrote the failing test.

## Spec delta

### REQ-FINISH-005 — pack author signing (MODIFIED)
Given `signPack`'s default signing call (`src/pack/sign.ts`), Then it hands the signing client a request timeout of
30,000 ms (the client's default is 5,000 ms), so a transparency-log upload that takes longer than 5 s and lands is not
resent and answered 409; a test captures the options the client receives. The rest of the requirement is unchanged.

## Units

### u1-request-timeout

| Field | Content |
|---|---|
| `id` | u1-request-timeout |
| `requirements` | REQ-FINISH-005 |
| `files` | `src/pack/sign.ts`, `scripts/pack-signing-rehearsal.mjs`, `CHANGELOG.md` |
| `interfaces` | In `src/pack/sign.ts`: a module constant `const SIGSTORE_REQUEST_TIMEOUT_MS = 30_000;` with a comment giving the reason (the client's 5 s default resends a slow Rekor upload that already landed, and the resend is answered 409, which the sign path does not recover: run 39606298770); the default path becomes `options.signFn ?? ((payload) => sigstore.sign(payload, { timeout: SIGSTORE_REQUEST_TIMEOUT_MS }))` with the import still lazy and inside the existing `try`, so every failure still maps to the same generic `INTEGRITY_ERROR` with no provider text. `SignPackOptions.signFn` (`(payload: Buffer) => Promise<Bundle>`) is unchanged; the retry count stays the client's default. `scripts/pack-signing-rehearsal.mjs`: its exact content at `2530b5e7` (`git show 2530b5e7:scripts/pack-signing-rehearsal.mjs`), which removes every probe line, helper and wrapper. `CHANGELOG.md`: one line under `Unreleased` → `Fixed`, saying pack signing now gives the transparency log 30 s per request, so a slow upload no longer fails signing with a conflict. |
| `testCriteria` | `test/pack/signClientOptions.test.ts` (unchanged from `1a815c42`) passes; `test/pack/sign.test.ts`, `test/ci/packSigningRehearsal.test.ts` and `test/ci/testInputsGuard.test.ts` pass; `git grep -n -E '\[STAMITY-DEBUG [0-9]{4}-[0-9]{2}-[0-9]{2}_debug-[^]]*\]'` exits 1; `git diff 2530b5e7 -- scripts/pack-signing-rehearsal.mjs` is empty |
| `edgeCases` | an injected `signFn` (the tests, the rehearsal before the strip) → called as before, without options; the sigstore import failing → the same generic refusal, no bundle written |
| `depends_on` | none |
| `verify` | `npx vitest run test/pack/signClientOptions.test.ts test/pack/sign.test.ts test/ci/packSigningRehearsal.test.ts test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck && npm run knip` |
