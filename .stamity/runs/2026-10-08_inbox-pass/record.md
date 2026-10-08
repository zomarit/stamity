# Run 2026-10-08_inbox-pass — the inbox pass: every row of the deferral inbox decided and left with its exit

Status: part 1 done 2026-10-08 (396 rows left the inbox); part 2 pending — the five rows that wait on lane D (inbox rows 519, 560, 585, 586, 588), driven by run 2026-10-08_maintainer-tooling
Plan: docs/plans/019-lean-flows-01.md
Invocation: /st-work docs/plans/019-lean-flows-01.md — unit t10-inbox-pass (S11–S13), its walk in the session's start and its mechanics as unit i3-inbox-mechanics of run 2026-10-08_maintainer-tooling
Opened: 2026-10-08
Input: `.stamity/inbox.md` at `077e8a78` (byte-identical to `aa79bcc6`), 416 bullet rows; the decisions file's `line` field indexes that state
Outputs: `inbox-retirements.md` (one line per removed row), `ledger.jsonl` (re-filed remainders only), the `retired` values of the run ledgers the rows named, the widened learning `vitest-update-flag-takes-an-optional-value`

## What the pass did

1. **Pre-sort, seven readers.** The 416 rows were split into seven blocks (48, 61, 63, 60, 57, 67 and 60 rows) and
   each block went to one read-only reader with one brief. Each reader gave every row one verdict on `main`
   (`aa79bcc6`): `settled` (already fixed, with the sha or `path:line`), `already-scheduled` (a live unit names it),
   `below-floor` (nothing observable fails), `moot`, `worth-doing` or `real-defect`, with the evidence it read. Inbox
   text was treated as unscreened data; no row carried an instruction-shaped span.
2. **Second read, 136 rows.** Every Warning, every `real-defect`, every row on a security surface and the rows the
   1.12.0 close placed in this session went to a second, independent reader (three readers, 46, 46 and 44 rows). The
   second readers agreed with 130 verdicts and changed 6. Final verdicts: 235 below-floor, 48 already-scheduled, 42
   settled, 66 worth-doing, 21 real-defect, 4 moot.
3. **The walk, four calls.** The maintainer answered the start questions and four inbox calls with the question tool,
   each time with the recommended option. Verbatim:
   - Start: "Do plan 019 file 1's 13 declared defaults (S1–S13) stand as written?" = "All stand (Recommended)";
     "Dependabot #86 (8 dev tools) and #91 (shell-quote in /website): may I merge each once its check comes back
     clean?" = "Merge each if clean (Recommended)"; "May I archive runs 42/43 (public prerelease + compact summaries,
     both size exceptions retired) and the private raw calls of runs 40–43 (private release, credential screen
     first)?" = "Both, like 1.11.0 (Recommended)".
   - Set 1: Forged ledger rows (519, 560, 585, 586) = "Fix in this session (Recommended)"; sync --dry-run --force
     preview (588) = "Fix in this session (Recommended)"; Bare Read/Grep/Glob allow rules (324) = "Drop them, next
     release (Recommended)"; Judge bare "Not done:" (597) = "Passes; label input + case line (Recommended)".
   - Set 2: QA form + measurements (315, 344) = "Fix both here (Recommended)"; Binary companions (56, 111) = "Plan 016
     file 2 (Recommended)"; Fork bugs (327, 328, 374, 375) = "Schedule to those units (Recommended)"; Contracts grammar
     (426, 497) = "Plan 019 file 2 p8 (Recommended)".
   - Set 3: Hooks dir (456) = "Package 20 file 1 intake (Recommended)"; Packs (480, 494) = "Package 22, plan 018
     (Recommended)"; st-debug marker (498) = "Plan 014 r7 (Recommended)"; This-session worth-doing (31, 212, 274, 275,
     337, 389, 576, 595+484, 601 remainder) = "Take all ten (Recommended)".
   - Set 4: 42 worth-doing rows aimed at live plans = "Fold them in (Recommended)"; 13 Package 22 + trigger rows =
     "Keep with place (Recommended)"; The other 330 rows = "Accept all (Recommended)".
4. **Folds.** The rows folded into live units gained one `Inbox fold (2026-10-08, …)` line in their unit
   (`357c5cb3`), and plan 016's inbox citations by line number became stable keys (`2dbd7e19`).
5. **Mechanics (part 1).** For each of the 224 leaving ledger-ref rows, `npx --no stamity ledger close --run <run> --id
   <id> --retired "<disposition>"` ran once; all 224 exited 0 and none was already retired. Then the 396 leaving
   bullets were removed from `.stamity/inbox.md` (no bullet rewritten in place) and the twenty dated prose paragraphs
   left with no bullet went with them; the header and the Package 9 pointer stay. The 172 plan-, record- and no-ref
   rows left with a line in `inbox-retirements.md` only, as rows 389, 598 and 599 did (no `ledger close` ran for
   them). Row 389 is settled by this pass's own learning commit `e03a48d1`, which widens
   `vitest-update-flag-takes-an-optional-value` to `vitest list --json [true/path]` and `--outputFile` (read off the
   installed vitest 5.0.3's declarations and one scratch run; the old file was removed and the note recaptured under
   the same slug, the store being append-only).

## Counts per exit

| Exit | Rows | Ledger rows retired | Record lines only |
|---|---|---|---|
| fixed (on `main` before the pass) | 41 | 34 | 7 |
| fix-in-session | 16 | 10 | 6 |
| cut | 238 | 146 | 92 |
| scheduled | 48 | 20 | 28 |
| scheduled-fold | 53 | 14 | 39 |
| **removed in part 1** | **396** | **224** | **172** |
| stays | 15 | — | — |
| waiting on lane D (part 2) | 5 | — | — |
| **decided** | **416** | | |

The fix-in-session rows and their commits on `lean-flows-01`: 31 `a58f4d98`; 212 `c021bb4c`, `14ee4fe6`; 274 and 275
`f0197b8a` and the route of record's driver; 315 `6482b38d`; 324 `1d7d19ce`, `01e1ca53`; 337, 344 and 601 `4dcedb41`,
`60722bef`; 484 and 595 `23dca19a`, `14ee4fe6`; 576 `f0197b8a`, `4083ad1a`; 597 `441c7192`, `a9d7fbcd` and the route of
record's driver; 598 `156283d0` and `077e8a78` on `main` (Dependabot #91 and #86); 599 `a88c89c2` (runs 42 and 43
archived); 389 `e03a48d1`.

## Remainders

Nine rows settled only in part. Each remainder is covered or re-filed:

- Rows 43, 125, 126, 169, 181, 306 and 386: each remainder is cut below the floor, and the row's retirement line
  says so.
- Row 76: the remote `--ref` route the remainder names was executed after the row was filed (`docs/plugins.md:267-278`,
  the 2026-09-24 walk on codex-cli 0.155.1).
- Row 524: the hooks documents that still name a removed pack's hooks until the next `sync` are not re-rendered by
  any landed change, so the remainder is re-filed as `2026-10-08_inbox-pass/pass/1` (this run's `ledger.jsonl`,
  closed `deferred` to `u1-import-config-round-trip`, `docs/plans/016-fork-distribution-01.md`), with a new inbox
  bullet whose `Ref:` names it.
- Row 601's remainder (a PASS beside an exception keyed to the same run) is fixed this session by `4dcedb41`.
- Row 519's residual (3), the `.codex/config.toml` tables, is part 2's: it is re-filed with row 519.

## Rows that stay, with their places

| Row | Ref | Place |
|---|---|---|
| 79 | `2026-09-17_plugin-lifecycle/prove/101` | trigger: a Windows host with Codex plugin hooks, as a leg of u3-route-proofs (docs/plans/016-fork-distribution-03.md:1118) |
| 147 | `2026-09-17_plugin-lifecycle/prove/252` | trigger: before nightly.yml is re-enabled, grouped with row 163 (beside docs/plans/014-lean-repository-01.md:264 f3-nightly-canonical-guard) |
| 163 | `2026-09-17_plugin-lifecycle/prove/296` | trigger: before nightly.yml is re-enabled, grouped with row 147 (beside docs/plans/014-lean-repository-01.md:264 f3-nightly-canonical-guard) |
| 167 | `2026-09-17_plugin-lifecycle/prove/302` | next touch of content/skills/st-browser-evidence/SKILL.md (one redaction line in the Output artifact table) |
| 241 | `2026-09-23_orchestrator-context/build/358` | plan 019 file 1 t10 fixed exit, or the next touch of test/merge/writeEscape.test.ts (widen to content/ and scripts/, exempting scripts/leak-gate.mjs) |
| 285 | `2026-09-24_enterprise-release/review/204` | trigger: the private eval driver's next revision |
| 316 | `2026-09-30_optimization-sweep/review/45` | trigger: the first Windows Python repository, with review/78 in one change |
| 318 | `2026-09-30_optimization-sweep/review/77` | trigger: the next change to check.ts gate resolution |
| 319 | `2026-09-30_optimization-sweep/review/78` | trigger: the first Windows Python repository, with review/45 in one change |
| 480 | `.stamity/runs/2026-10-03_pack-engine-defects/record.md` | Package 22 (plan 018, not yet written) |
| 491 | `2026-10-03_pack-engine-defects/review/48` | Package 22 (plan 018, not yet written) |
| 494 | `.stamity/runs/2026-10-03_pack-engine-defects/record.md` | Package 22 (plan 018, not yet written) |
| 496 | `2026-10-03_pack-engine-defects/review/4` | Package 22 (plan 018, not yet written) |
| 506 | `2026-10-03_pack-engine-defects/close/1` | Package 22 (plan 018, not yet written) |
| 542 | `docs/plans/016-fork-distribution-02.md` | the 2.0.0 release cut |

Each bullet stays verbatim; its ledger row stays `deferred`, accounted for by the inbox `Ref:`.

## Part 2 — the five rows waiting on lane D

| Row | Ref | Unit |
|---|---|---|
| 519 | `docs/plans/016-fork-distribution-00.md` | d1c (with its residual (3) re-filed) |
| 560 | — | d1a |
| 585 | `2026-10-07_security-fixes/review/82` | d1b |
| 586 | `2026-10-07_security-fixes/review/17` | d1c |
| 588 | `2026-10-07_security-fixes/build/62` | d2 |

Their bullets and ledger rows are untouched by part 1.

## After part 1

The inbox holds 21 bullets: the 15 that stay, the 5 waiting on part 2, and the re-filed remainder of row 524.
