# Pack-trust surface — defensive verification pass

- **Run:** 2026-09-01 closure run (Package 3), Batch A item — the owed clean adversarial pass
  over the pack-trust surface, recorded.
- **Voice:** defensive verification only. Each documented trust property is checked against
  the enforcing code and the test that pins it; nothing here is an exploit or an attack
  recipe. This framing is deliberate — it follows the house build record's lesson that an
  offensive charge trips a usage-policy refusal and falls back to a degraded model, where a
  defensive-verification framing runs clean.
  *(Corrected in place 2026-09-07: that lesson was cited here by a private-layer ledger row
  identifier — the class the leak gate exists to keep out of this tree — which resolved to nothing
  a reader of this repository could open. It is replaced by the lesson it named and is not
  re-quoted.)*
- **Model:** claude-fable-5 verdict pass (self-attested; the "fable" alias resolves to
  claude-fable-5 in this session, self-confirmed). Sealed brief; the agent read the source
  and tests directly and opened no `.stamity/` state, run record, or prior report.
- **Baseline:** branch `closure-run-execution`, product code unchanged from `main` `bc64867`
  on the pack surface (Batch A adds only `evals/` + the runner override; no `src/pack/` edit).

## Note added 2026-09-07 — what these citations read against, and what they do not cover

Appended in place at the review of this branch; nothing above is rewritten, and the one
correction made to the text above is marked where it was made.

- **The baseline for every `file:line` citation below is `bc64867`**, the commit the
  **Baseline** bullet names — not this branch's head. The lines have since moved: the
  pack-integrity remedy cited as `src/cli/commands/check.ts:769-777` is at those lines at
  `bc64867`, while at head those lines are `driftReportOf`. Read a citation with
  `git show bc64867:<file>`, not by opening the file at head.
- **The org-policy WRITER post-dates this pass and is covered by no P row.** `writeOrgPolicy`
  (`src/pack/orgPolicy.ts`) and the `config policy` command (`src/cli/commands/config/policy.ts`)
  arrived on this branch in `6477e37`, after the commit that recorded this pass; at the baseline
  above there was no write path on the policy artifact to examine, so P5's verdict is a
  read-side verdict only.
- **This package's security lens read that writer**, so the gap is stated rather than left open.
  Three properties confirmed at head: `writeOrgPolicy` re-parses the serialized document through
  `parseOrgPolicy` before the temp file is opened, so a refused document leaves the previous
  policy byte-for-byte intact; the command takes no path input, composing its target from
  `orgPolicyPath(rootDir)`; and the loader stays fail-closed, so a defective policy refuses every
  pack install rather than degrading to a permissive read.
- **The eleven HELD rows still carry no in-tree locator.** Their enforcement and pinning-test
  evidence is the run transcript, which is not in this tree; only the four residuals below carry
  `file:line`. A reader who needs a HELD row's locator re-derives it from the property text.

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
