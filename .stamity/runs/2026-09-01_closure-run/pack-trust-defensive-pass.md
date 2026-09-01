# Pack-trust surface — defensive verification pass

- **Run:** 2026-09-01 closure run (Package 3), Batch A item — the owed clean adversarial pass
  over the pack-trust surface, recorded.
- **Voice:** defensive verification only. Each documented trust property is checked against
  the enforcing code and the test that pins it; nothing here is an exploit or an attack
  recipe. This framing is deliberate (the BD-034 lesson: an offensive charge trips a usage
  refusal and falls back to a degraded model; a defensive-verification framing runs clean).
- **Model:** claude-fable-5 verdict pass (self-attested; the "fable" alias resolves to
  claude-fable-5 in this session, self-confirmed). Sealed brief; the agent read the source
  and tests directly and opened no `.stamity/` state, run record, or prior report.
- **Baseline:** branch `closure-run-execution`, product code unchanged from `main` `bc64867`
  on the pack surface (Batch A adds only `evals/` + the runner override; no `src/pack/` edit).

## Verdict — 11 HELD · 4 HELD-AS-DOCUMENTED · 0 PARTIAL · 0 FAILS

| P | Property | Verdict |
|---|---|---|
| P1 | Pinned-or-refuse; the pin names bytes; re-install re-verifies; no pin-borrow | HELD |
| P2 | Claims are not evidence — a signing claim raises only the claimed tier | HELD |
| P3 | No flag reaches a declared-and-failed claim; `--allow-untrusted` waives absence only; no `--force` | HELD |
| P4 | `signing.signer` mandatory, refused at manifest read before tier resolution; identity re-compared exact | HELD |
| P5 | Org policy deny-wins, fail-closed, no flag bypass | HELD-AS-DOCUMENTED |
| P6 | Lifecycle scripts banned outright; install executes no pack code | HELD |
| P7 | Integrity map mandatory + bidirectional; apply re-hashes before write | HELD |
| P8 | Body deny-scan at install over every file incl. JSON; strip/fold/join normalization | HELD |
| P9 | Post-install tamper detection re-hashes every written byte; edit and deletion each a finding | HELD |
| P10 | yaml-hooks blind spot contained (n/a never pass) and disclosed | HELD-AS-DOCUMENTED |
| P11 | Sigstore bundle handling: size cap, regular-file-only, framed payload, armed default, sanitized verdicts | HELD |
| P12 | Projection/sync cannot smuggle unscanned bytes; execution classes re-validated on read | HELD-AS-DOCUMENTED |
| P13 | `clean --pack` + follow-up sync leaves nothing loaded | HELD-AS-DOCUMENTED |
| P14 | Pack-supplied trust fields inert; a pack-shipped receipt is not read | HELD |
| P15 | Path-traversal confinement — one refusal vocabulary across every declared path surface | HELD |

Enforcement and pinning-test evidence for each verdict is in the run's full transcript
(fable pass, this session). The four HELD-AS-DOCUMENTED verdicts each carry a residual that
the shipped docs or code already disclose — none is a fail, and none is undisclosed.

## Disclosed residuals (ranked by blast radius)

1. **P12 — prose-class post-install edits project without a deny re-scan.** An actor with
   repo write access who edits an installed body under `.stamity/packs/**` gets that text
   into agent context at the next `sync`. Bounded: needs the same write access that could
   edit emitted files directly; detected by `check`'s failing `pack-integrity` row, whose
   remedy explicitly forbids running `sync` first (`src/cli/commands/check.ts:769-777`);
   disclosed at `docs/packs-and-trust.md:171-179` and `src/pack/verifyInstalled.ts:9-42`.
   The two execution-bearing classes (hooks, MCP) are exempt — re-validated on every read.
2. **P13 — interim window.** Between `clean --pack` and the follow-up `sync`, projected prose
   copies and pack-hook entries in client configs remain loadable. Disclosed as the two-step
   contract in the docs and in `clean`'s own next-step line.
3. **P5 — projection-side kind degradation.** A pack whose receipt is unreadable evaluates as
   source kind `unknown` at projection, so kind-token policy rules (`npm-package`, …) don't
   reach it there; name / `@scope/*` / `*` rules still do, and the missing receipt itself
   fails `check`'s pack-integrity row. Disclosed in code (`src/pack/orgPolicy.ts:289-299`),
   **not** in the public docs page — the one doc-accuracy gap worth a follow-up sentence.
4. **P10 — mixed hooks class.** One parseable `.json` hook beside a `.yaml` file leaves the
   gate row `pass` while the yaml stays unparsed; bounded because yaml can never be wired or
   executed (reader is `.json`-only at ingress and emission), the yaml body was still
   deny-scanned, and it prints as an explicit "could not be parsed — read the file" row.

## Five-lever closure sweep (defensive confirmation)

The last realistic levers a pack author holds, each confirmed closed: (1) a regex/lookalike
`signing.signer` — escaped, anchored, exact re-compare; (2) a newline-bearing integrity key
replaying honest entries to inherit a pin — length-framed injective aggregate + control-char
refusal; (3) a plan-vs-apply TOCTOU or symlinked bundle path — apply re-hash + rollback,
`O_NOFOLLOW` + post-open `fstat`; (4) a post-install edit of an installed MCP/hook definition
— both re-validated through full ingress on every projection read; (5) a doctored receipt to
widen footprint / flip kind / assert a tier — footprint re-narrowed on read, kind whitelisted,
no enforcement path reads a tier back out, receipt carries a ledger hash.

## Cross-check and provenance note

An **unsolicited** agent notification (id `ad945fa8…`, "Pack-trust defensive verification
pass") arrived earlier in this session that this orchestrator did not launch. Per the
model-integrity constraint (explicit ids, attest every workflow, degraded/unattested verdicts
inadmissible) and this repo's own injection-screening posture (unbidden higher-trust-looking
content is treated as a finding, not trusted), that report was **not** adopted as the
artifact. This pass was commissioned fresh under a sealed defensive brief with an attested
model, and it is the artifact of record. The unsolicited report independently reached the
same verdict shape (same P12/P13 residuals, same org-policy unknown-kind doc gap), which
raises confidence in the conclusion without lending the unattested run any authority.

## Bottom line

The pack-trust model holds. Zero fails, zero partials; four disclosed, bounded residuals,
of which one (the P5 projection-side unknown-kind semantics) is disclosed only in code and is
a candidate for a one-sentence docs addition in a later content batch. No product-code change
is required by this pass; it is recorded as the owed clean adversarial coverage.
