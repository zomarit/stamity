Status: closed 2026-10-21 — fixed through /st-work as pull request #122 (merged 2026-10-21 at 416e7abe; the merge's rehearsal run 39630903751 passed); zero residue (the marker check on main exits 1)
Plan: none — debug round
Invocation: /st-debug The Pack signing rehearsal (.github/workflows/pack-signing-rehearsal.yml, scripts/pack-signing-rehearsal.mjs) fails intermittently at its sign stage on main (inbox row close/3 of run 2026-10-20_packs-rebuilt): after the Fulcio and Rekor calls and before the bundle check; the script hides the error by design. First step: an observation-only change that prints the failing stage and the error's code, never its text; it merges to main (the maintainer's click) before any run can show it.
Base: 2530b5e77719674a97d1e24076ee039d51786dea (probe branch `debug/signing-rehearsal-probe`)
Target: app code (the rehearsal script on the production signing path, `src/pack/sign.ts` `signPack`)
Route: user — the failure needs the live Sigstore services' timing from a GitHub-hosted runner with an OIDC identity; no local test reaches Fulcio or Rekor, and the rehearsal runs only on `main`

# Run 2026-10-21_debug-signing-rehearsal — the signing rehearsal's sign stage fails intermittently

Attended, run by Package 22's session 2. The session's opening answers are in the maintainer's own records; the ones
this run acts on: the probe prints the stage, the error's code and its cause's code or HTTP status, the elapsed time
and each failed Fulcio or Rekor attempt as host, attempt number and status (or `network`), fixed names and numbers
only; up to five manual runs on `main` after the probe merges, one at a time, stopping at the first captured failure;
the probe is stripped in the fix's pull request.

## Symptom

- **Expected:** `node source/scripts/pack-signing-rehearsal.mjs sign` signs revision 1 and revision 2 with the real
  Fulcio, Rekor and TUF services and prints `pack-signing-rehearsal: sign passed`.
- **Actual:** the step prints `pack-signing-rehearsal: failed; inspect the retained nonsecret inputs and stage
  receipts.` and exits 1 (`scripts/pack-signing-rehearsal.mjs:156-159` keeps no error by design). Run `39580102983`
  on `b772b592`: attempt 1 (sign job `119155825903`), attempt 3 (`119172048598`) and attempt 4 (`119184328818`) failed
  at the sign step; attempt 2 re-ran only the failed job and cannot pass (the prepared input records the attempt).
  Run `39588097104` on `64e74427` passed (sign job `119182338958`, sign step done 10:57:24Z). The earlier failure,
  run `37450946980` on `1fa55344` (2026-10-06), failed at the verify job, not the sign job: another symptom.
- **What the logs show** (the harden-runner egress list in each sign job's post step, which logs the first call to each
  endpoint): attempts 1 and 3 reach the OIDC token service, `fulcio.sigstore.dev` and `rekor.sigstore.dev`, never
  `tuf-repo-cdn.sigstore.dev`, and the step ends 6.8 s (attempt 1) and about 10 s (attempt 3) after the Rekor call;
  attempt 4 and the passing run also reach the TUF mirror 2 s after Rekor (revision 1's bundle check). Attempt 4's
  stop sits in revision 2, whose calls the egress list does not repeat. All four sign jobs ran `ubuntu-24.04` image
  `20261012.601`/`20261015.610`; the passing one ran `20261012.601` too.
- **Frequency:** 3 failures in the last 4 full attempts (2026-10-21 09:52Z–11:02Z); every push run from 2026-09-23 to
  2026-10-20 passed at the sign job.

## Hypotheses (ranked, each with the observation that separates it)

1. **A Rekor upload that times out but lands, then a 409 on the retry.** The client gives each request 5 s and two
   retries (`node_modules/sigstore/dist/config.js:25-26`), retries a network error
   (`node_modules/@sigstore/sign/dist/external/fetch.js:42-45`) but not a 409 (`:85`), and the sign path builds its
   Rekor witness with `fetchOnConflict: false` (`node_modules/sigstore/dist/config.js:104`), so the existing-entry
   409 throws `TLOG_CREATE_ENTRY_ERROR` (`node_modules/@sigstore/sign/dist/witness/tlog/client.js:35-49`).
   Separates: stage `sign-call`, code `TLOG_CREATE_ENTRY_ERROR`, cause status 409, a `rekor` attempt failing
   `network` at about 5,000 ms before it.
2. **Rekor answers 5xx, 408 or 429 on all three tries.** Separates: code `TLOG_CREATE_ENTRY_ERROR`, cause status in
   5xx/408/429, three `rekor` attempts with that status.
3. **Rekor times out on all three tries.** Separates: code `TLOG_CREATE_ENTRY_ERROR`, a cause code with no status,
   three `rekor` attempts `network` near 5,000, 10,000 and 15,000 ms (the observed 6.8 s and 10 s argue against it).
4. **A failure after the signing call returns, before the TUF fetch** (the bundle size cap, or the verifier's local
   parse refusing before its network call). Separates: stage past `sign-call`, a repository error code
   (`INTEGRITY_ERROR`), no provider code.
5. **Fulcio or the identity token fails.** Weak: Rekor is reached only after Fulcio returns a certificate. Separates: a
   `CA_*` or `IDENTITY_*` code, `fulcio` attempts failing.

## Probe sites

All in `scripts/pack-signing-rehearsal.mjs`, commit `4da187ef` on `debug/signing-rehearsal-probe` (14 lines carry the
tag; every probe-only block starts with a tagged comment):

- `:19-45` — probe state, the print filters (`safeCode`, `safeStatus`, the closed host map, the attempt pattern) and
  the `proc-log` listener that keeps only host label, attempt number, status or `network`, and time.
- `:93-97` — stage markers `context`, `import`.
- `:99-124` — `signFn` and `verifyFn`: the real `sigstore` `sign` and `verify`, unchanged arguments, the same error
  rethrown; they record the stage and the filtered codes.
- `:126-127`, `:151-153` — the listener attached and removed (`try`/`finally`; the loop re-indented inside it).
- `:132-133` — per-revision reset (stage `sign-pack`).
- `:136-137` — `signPack(pack, { signFn, verifyFn })`.
- `:139`, `:142`, `:148` — stage markers `bundle-digest`, `signing-record`, `final-compare`.
- `:145` — print site `sign-revision-ok`.
- `:233-237` — print site `rehearsal-failed`, before the unchanged generic line at `:239`.

## Log

- 2026-10-21T12:01Z — the probe built (`stamity-implementer`, Opus 5.5, high, under step 2's exception): `node
  --check`, `npm run lint`, `npm run typecheck`, `npm run knip` and `test/ci/packSigningRehearsal.test.ts` (15/15)
  exit 0. A local `sign` with no identity printed `rehearsal-failed sign failed revision=revision1 stage=sign-call …
  code=IDENTITY_TOKEN_READ_ERROR … repoCode=INTEGRITY_ERROR attempts=none` and then the generic line, with no network
  call; a filter check fed error and log shapes carrying a URL, a token-like string and a line break and printed only
  `unprintable`, `network` or a status. Diff: `reports/probe.diff`.
- 2026-10-21T12:02Z — `debug/signing-rehearsal-probe` pushed; draft pull request #121.
- 2026-10-21T12:06Z — the security review (`stamity-security`, Opus 5.5, high; `reports/probe-security-r1.md`):
  **approve**, confidence high, no finding. Rests on: every value in the two print lines is a literal, a number, a
  closed-list entry or the output of `safeCode`, `safeStatus` or `/^\d{3}$/`, and no provider error, message or URL is
  stored — walked. Two notes, not findings: `attempts=` also lists failed retries to the TUF mirror and, as `other`, to
  any other host; while the probe is in, the rehearsal does not walk `signPack`'s default load of `sign`
  (`src/pack/sign.ts:94`), equivalent today.
- 2026-10-21T13:00Z — #121's CI green on every job (both Windows legs); marked ready 12:58:43Z; the review bot's one
  review completed 12:59:54Z with no findings.
- 2026-10-21T13:10:06Z — #121 merged after the maintainer's click (rebase, admin bypass; one website-only commit
  behind): `main` `68a2baf5`.
- 2026-10-21T13:13Z — the merge's own rehearsal, run `39605614445` on `68a2baf5`: **success**. Sign job
  `119241448460`: `sign revision1 ok elapsedMs=5505 attempts=none`, `sign revision2 ok elapsedMs=2579
  attempts=none`. No failure captured; the manual runs start (up to five, one at a time).
- 2026-10-21T13:17Z — manual run 1, `39606298770` on `68a2baf5` (`workflow_dispatch`): **failure**, the first
  captured. The sign job's probe line: `rehearsal-failed sign failed revision=revision1 stage=sign-call
  elapsedMs=13502 code=TLOG_CREATE_ENTRY_ERROR causeCode=- causeStatus=409 repoCode=INTEGRITY_ERROR
  attempts=rekor:1:network@5432,rekor:2:network@11444,rekor:3:409@13502`. The loop stopped there (one of the five
  allowed runs used).

## Log analysis (step 4)

The tagged lines in order (runs `39605614445`, `39606298770`): revision 1 and 2 signed in 5,505 ms and 2,579 ms with no
failed attempt; then, in the failing run, Rekor attempt 1 failed with no HTTP status at 5,432 ms, attempt 2 the same at
11,444 ms (6,012 ms later), attempt 3 answered 409 at 13,502 ms, and the client threw `TLOG_CREATE_ENTRY_ERROR` with the
409 as its cause, inside the signing call. Silent points: no Fulcio attempt failed (the certificate was issued), the
`verify-call` stage was never reached (no TUF fetch, as the egress lists of attempts 1 and 3 showed), no repository
refusal came before the signing call.

- **H1 (a timed-out upload that lands, then 409 on the retry): confirmed.** Two attempts failed at about the client's
  5,000 ms timeout plus connection time (5.4 s, then 6.0 s later), and the retry was answered 409.
- H2 (5xx, 408 or 429 on all tries): killed — no attempt carried such a status.
- H3 (three timeouts): killed — the third attempt was answered 409.
- H4 (a failure after the signing call): killed — stage `sign-call`, a provider code.
- H5 (Fulcio or the identity token): killed — no Fulcio attempt failed, no `CA_*`/`IDENTITY_*` code.

## Root cause (step 5, gate `root-cause-before-fix`)

`signPack` calls the signing client with no options (`src/pack/sign.ts:94-95`: `bundle = await sign(payload)`), so
every Fulcio and Rekor request gets the client's 5,000 ms timeout and two retries
(`node_modules/sigstore/dist/config.js:25-26`, passed at `:104-108`). When Rekor takes longer than 5 s to accept the
upload, the client aborts the request and sends it again (`node_modules/@sigstore/sign/dist/external/fetch.js:42-45`,
network errors are retried), but Rekor completes the first request anyway. The resent upload is the same entry (the
same ephemeral certificate and signature, made once per `sign` call), so Rekor answers 409 "entry already exists";
a 409 is not retried (`fetch.js:50-56`, retryable is 408, 429 and 5xx only), and the sign path builds its Rekor
witness with `fetchOnConflict: false` (`node_modules/sigstore/dist/config.js:104`), so the conflict becomes
`TLOG_CREATE_ENTRY_ERROR` (`node_modules/@sigstore/sign/dist/witness/tlog/client.js:33-49`). `signPack` maps it to its
generic `INTEGRITY_ERROR` (`src/pack/sign.ts:96-101`) and the rehearsal prints its generic line. It is intermittent
because it needs Rekor slower than 5 s: on 2026-10-21 even a passing revision 1 took 5.5 s end to end, and every push
run from 2026-09-23 to 2026-10-20 passed.

Confidence: high. The chain is wrong only if the 409 came from an entry this signing did not make; the entry carries a
certificate and signature minted for this one call, so only its own earlier upload can be the existing entry. It
explains every observation: the stop after Rekor and before any TUF call (attempts 1 and 3 of run `39580102983`), the
6–13 s step durations, attempt 4's stop in revision 2 (the same race on the second upload), and the passes.

## Failing test (step 6, gate `failing-test-before-fix`)

This gate requires a test that fails on the current tree for the stated cause, with a failure message naming the
defect, before any fix starts. The tree carries none: `test/pack/sign.test.ts` injects `signFn`, so no test reads the
options `signPack` hands the real client. Gate 2's test: `test/pack/signClientOptions.test.ts` mocks the `sigstore`
module, captures the arguments of `sign`, and expects the request timeout `signPack` passes to exceed the client's
5,000 ms default.

- 2026-10-21T13:23Z–13:26Z (stamp corrected 13:38Z: first typed without the clock) — gate 2's test written (`stamity-implementer`, Opus 5.5, high, a test delta only): commit
  `1a815c42` on `fix/signing-rekor-timeout` (lane `p22s2-fix`, from `68a2baf5`). The test-runner ran it twice: exit 1
  both times at `test/pack/signClientOptions.test.ts:59:7`, "signPack leaves the signing client at its 5 s request
  timeout: a Rekor upload slower than 5 s that lands is resent and answered 409 (TLOG_CREATE_ENTRY_ERROR), CI run
  39606298770"; `test/pack/sign.test.ts` exit 0 (24 passed). **Gate `failing-test-before-fix` met.**

## Hand-off (step 7)

To `/st-work`, attended (`run-mode: attended`): the diagnosis above and gate 2's test as the plan; the fix and the
probe's strip land in one pull request from `fix/signing-rekor-timeout`. The fix's run record:
`.stamity/runs/2026-10-21_signing-rekor-timeout/record.md`.

- 2026-10-21T16:00:48Z — #122 merged (GitHub rebase merge, after the maintainer's click): `main` `416e7abe`.
- 2026-10-21T16:04Z — the merge's rehearsal, run `39630903751` on `416e7abe`: **success** (prepare, sign, verify), no
  probe line (the probe is gone). Its egress list shows Rekor reached at 16:02:40 and the TUF mirror at 16:02:46: the
  upload took about 6 s, over the old 5 s timeout, and signing passed under the new 30 s one.

## Instrumentation cleanup (step 8)

The probe left with the fix: `scripts/pack-signing-rehearsal.mjs` restored byte for byte to its content at `2530b5e7`
(blob `7b13e905`, confirmed by the fix's reviewer and its security lens), no helper or import left. The marker check
`git grep -n -E '\[STAMITY-DEBUG [0-9]{4}-[0-9]{2}-[0-9]{2}_debug-[^]]*\]'`: exit 1 on the fix branch (13:36Z) and on
`origin/main` `416e7abe` (16:06Z). **Zero residue.**

## Regression clauses (step 9)

- Pack signing shall continue to hand the signing client a request timeout above its 5,000 ms default, so a Rekor
  upload slower than 5 s that lands is not resent into a 409 — held by `test/pack/signClientOptions.test.ts`.
- The rehearsal and `signPack` shall continue to print no provider text on a failure — held by
  `test/ci/packSigningRehearsal.test.ts` (the generic-line cases) and `test/pack/sign.test.ts` ("withholds provider
  failure text from the returned error").

No clause without a test. No surviving hypothesis. Fix attempts this session: 1 (it held: the merge's run passed with
a 6 s Rekor upload).

The residual, carried to the fix run's close: an upload slower than 30 s that still lands would fail the same way,
because the `sigstore` sign path offers no conflict fetch (`build/1` of the fix run).

</invoke>
