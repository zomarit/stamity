# Run record — Package 8 "Operator experience" (2026-09-04)

Plan: `docs/plans/001-package-8-operator-experience.md` (stamp `4607a76`, fresh on every
`reads:` path). Intensity deep, unattended. The findings ledger is `ledger.jsonl` beside this
file; the browser evidence is `browser-evidence.json`. Every sub-agent was dispatched by its
full model id through the workflow lane and self-reported the id it ran as; the ids of record
are in the attribution table below.

## Outcome

Six items, each shipped:

| Item | What landed |
|---|---|
| Docs landing icons | the copy control visible at rest (computed opacity 1 in both schemes, also under block hover); a trailing arrow on "Start here", the GitHub mark leading "GitHub" (Primer octicons, attributed beside the paths), a clipped "(opens in a new tab)" cue; the site's typecheck repaired under TypeScript 7 so the page is type-checked at all |
| The wordmark's `a` | the grid re-derived from the SVG at 62 columns (per-letter rasters, hand gaps, the derivation stated as it happened); the `a` reads by its own geometry; a width guard keeps the mark out of a pane of 64 columns or fewer, on both call sites |
| The raw-mode controls | question bold, hint dim, the cursor and a checked box in a ground-independent accent (`#8A52FF`, index 99, nothing at 16 colours — the brand violet fails 3:1 as a state indicator on dark grounds), labels never painted, re-ask yellow, disclosures theme ink; every identity-palette frame byte-identical to before; two sanitiser gaps closed with tests |
| `working-with-stamity` | rewritten to exactly 150 lines with every prior claim kept, one spine diagram (accessible title, legible at 1280 and at 375 after two measured rounds) and a first-match table for the nine touchpoints, the worktree section as lists; mermaid via the site's own dependency; second in "Start here" with every pin moved |
| One home for the verb gloss | `docs/cli-reference.md` for the verbs (README 143 lines, getting-started linking); the charter for the touchpoints, mirrored by the page under a drift test (two cells had already drifted) |
| The recommended-next-step line | on `/st-spec`, `/st-ask`, `/st-debug`, `/st-quick`, `/st-rework`, `/st-pr-resolve`, each pinned by a corpus test; sync, APM projection and the golden refresh with a row in both ledgers; run 4 over the affected slice (see the eval artifact) |

## Proof block

### Gate results (final test-runner, `claude-opus-5[1m]`, exits unmasked)

| Gate | Command | Result |
|---|---|---|
| leak gate | `npm run gate` | 0 — PASS, 0 hits, 18 rules, 765 files |
| typecheck | `npm run typecheck` | 0 |
| lint | `npm run lint` | 0 |
| unused code | `npm run knip` | 0 |
| tests + coverage | `npm test -- --coverage` | 0 — 176 files, 6733 passed, 1 skipped; no threshold miss |
| build + size budgets | `npm run build` | 0 — logic 2,081,093 of 2,097,152 bytes (99.2%); corpus 516,053 of 1,572,864 |
| dogfood drift | `node dist/cli.js check` | 0 — "drift: clean", "all green — nothing to do" |
| site | `cd website && npm ci --ignore-scripts && npm run typecheck && npm run build` | 0 / 0 / 0 |
| APM projection | `node scripts/generate-apm-package.mjs --check` | 0 — 50 files |
| docs regeneration | `node scripts/generate-docs.mjs` | idempotent — no new diff |

Earlier passes: the baseline on the untouched head (all green, 6705 tests); the first whole-tree
pass after the build (all green except the pre-existing site typecheck, TS5102, then repaired).

### Review verdicts, per round (reviewer `claude-fable-5-1`)

| Round | Verdict | Confidence | Standing findings |
|---|---|---|---|
| design review, before the build | U1 revise · U2 approve · U3 revise · U4 revise | — | 2 Critical (the brand violet as a state marker; both diagrams illegible and four arrows wrong), 5 Warning, 5 Minor — all folded into the amended designs |
| 1 | revise | 0.86 | R1-1 init welcome mark lacks the width fact; R1-2 site typecheck broken (pre-existing); R1-3 config note; R1-4 a ledger row's wording |
| 2 | approve | 0.88 | R2-1 (Minor) the config note |
| lenses | security approve 0.90 · performance approve 0.86 · design-quality revise 0.80 | — | SEC-M1, SEC-M2; PERF-W1, PERF-W2, PERF-M1..M3; DQ2-W1, DQ2-W2, DQ2-M1..M4 |
| 3 | revise | 0.82 | RR-W1 the diagram fix recorded fixed while its acceptance was unmet |
| 4 | approve | 0.93 | none |

### Decisions trace

- Plan gate: deep tier asks with execute-now as the default; unattended, the default applied.
- Every ambiguity resolved by a declared default with the reading dropped stated in the plan's
  Context: page length held to ≤150 by the plan rather than a new test; mermaid via the site's
  own dependency; sidebar order getting-started → working-with → doctrine; the octicon GitHub
  mark; the accent on non-text UI only; the charter as the touchpoint gloss's home under a
  mirror test; the CLI reference as the verb gloss's home; the eval re-run over the file-level
  affected slice.
- Isolation primitive: the shared checkout, file-disjoint units, one writer per file, every
  dependency edge a sequence (the per-agent worktree lane declined because three units hand
  build outputs to the next unit).
- Deferred with rationale: the six new lines' golden cases (`SET-v4`); the copy control's
  copied-state announcement and mermaid's dark palette (theme behaviours); the diagram's
  first-paint layout shift (no element exists to reserve space before the library loads);
  `renderMenu`'s per-frame re-sanitising (micro-cost); the octicons licence file (two paths
  are not a substantial portion; the attribution comment names source and licence).
- Rejected with reasoning: the orchestrator's own prediction about where the manifest digest
  rows would move (recorded as observed instead).
- Assumptions recorded: the 150-line figure is a source-line proxy — 66 lines exceed 100
  characters and the rendered page is longer than before because it now carries a diagram and
  tables; the roadmap's "Start now" wording differs from the page's long-standing "Start here".

### Artifacts touched, with the owning sub-agent

| Owner (attested id) | Files |
|---|---|
| U1 `wordmark-a` (`claude-opus-5[1m]`) | `src/cli/kit/banner.ts`, `test/cli/banner.test.ts` |
| U3 `menu-design` (`claude-opus-5[1m]`) | `src/cli/kit/terminal.ts`, `banner.ts` (imports), `prompts.ts`, `program.ts`; `src/cli/commands/{init,config,workspace,clean,worktree}.ts`; `test/cli/prompts.test.ts`, `test/cli/kit.test.ts` |
| U2 `landing-icons` (`claude-opus-5[1m]`) | `website/src/pages/index.tsx`, `website/src/css/custom.css` |
| U4 `working-with-page` (`claude-opus-5[1m]`) | `docs/working-with-stamity.md`, `website/docusaurus.config.ts`, `website/sidebars.ts`, `website/package.json`, `website/package-lock.json` |
| U5 `docs-pins-and-one-home` (`claude-opus-5[1m]`) | `src/cli/docs/llmsIndex.ts`, `llms.txt`, `README.md`, `docs/getting-started.md`, `test/docsPages.test.ts` |
| U6a `next-step-light-trio` (`claude-opus-5[1m]`) | `content/commands/{st-ask,st-debug,st-quick}.md`, `test/corpus/commands/lightTrio.test.ts` |
| U6b `next-step-spec-rework-pr` (`claude-opus-5[1m]`) | `content/commands/{st-spec,st-rework,st-pr-resolve}.md`, `test/corpus/commands/{spec,feedbackPair}.test.ts` |
| U6c `corpus-sync-and-goldens` (`claude-opus-5[1m]`) | `.claude/commands/st-*.md` (six), `.apm/prompts/st-*.prompt.md` (six), `.stamity/manifest.json`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/emit/crossClientGoldens.test.ts`, `test/corpus/emissionGoldens.test.ts`, `test/corpus/commands/work.test.ts` |
| fix round 1 (`claude-opus-5[1m]`) | `src/cli/commands/init.ts`, `test/support/inProcess.ts`, `test/cli/commands/init.test.ts`, `website/tsconfig.json` |
| fix round 2, page and site (`claude-opus-5[1m]`) | `docs/working-with-stamity.md`, `website/src/pages/index.tsx`, `website/src/css/custom.css`, `website/docusaurus.config.ts` |
| fix round 2, CLI kit (`claude-opus-5[1m]`) | `src/cli/kit/banner.ts`, `test/cli/banner.test.ts`, `src/cli/kit/prompts.ts`, `test/cli/prompts.test.ts`, `tsdown.config.mjs` |
| fix, init boundary (`claude-opus-5[1m]`) | `test/cli/commands/init.test.ts` |
| fix round 3, diagram layout (`claude-opus-5[1m]`) | `docs/working-with-stamity.md` (the fence) |
| orchestrator (`claude-fable-5-1`, the session model) | `docs/plans/001-package-8-operator-experience.md`, this record, `ledger.jsonl`, `browser-evidence.json`, the eval run artifact |

### Per-action attribution

| Role | Count | Attested id |
|---|---|---|
| researchers | 6 | `claude-opus-5[1m]` |
| builders | 8 | `claude-opus-5[1m]` |
| fixers | 5 | `claude-opus-5[1m]` |
| test-runners | 2 | `claude-opus-5[1m]` |
| reviewers (pre-build design review, rounds 1–4) | 5 | `claude-fable-5-1` |
| specialist lenses | 3 | `claude-fable-5-1` |
| eval run 4 loaders, scenarios and judge | see the eval artifact | scenarios `claude-opus-5[1m]`, judge `claude-fable-5-1` |

Evidence classes: gate rows are runner-captured command output; review and lens claims carry
`path:line` in the ledger; browser readings are DevTools-protocol probe values recorded in
`browser-evidence.json`; the fleets' raw outputs, with every attested id, are saved with the
run's records outside the tree.

### Recommended next step — derived from this run's own state

The findings this run deferred and the criteria it left uncovered are the review package's:
the six new closing lines have no golden case until `SET-v4`; the CLI's logic size budget has
about 16 KB of headroom left and the budget itself is now a decision, not a comment; the
diagram's first-paint layout shift, the copy control's copied-state announcement and mermaid's
dark palette are theme behaviours named as not done; the human rows of the QA walk-through
below are unsigned. No inbox row was appended. Next: the review over the whole accumulated
diff, then merge and release.

## QA walk-through (the human checkpoint)

Rows derived from the diff's triggers, sorted by risk then minutes; the auto-proven rows are
in the appendix with their pointers. Summed minutes on the human path: 14.

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| 1 | The mark reads "stamity" on a real terminal | in a terminal at least 65 columns wide, run `npm run build && node dist/cli.js --help` | seven rows of block art above `Usage:`; the third letter shows a flat right edge, top and bottom bars starting two cells in, and a lozenge counter — an `a`, not an `o` | M | 2 | [ ] |
| 2 | The menus carry the accent without carrying state in colour alone | in a scratch repository on a colour terminal, run `node <repo>/dist/cli.js init`; move the cursor with the arrow keys; then repeat with `NO_COLOR=1` | with colour: question bold, hint dim, the `>` cursor and a checked `[x]` violet-tinted, labels plain; with `NO_COLOR=1`: the identical frame in plain text | M | 3 | [ ] |
| 3 | The mark stays out of a narrow pane | resize the terminal to 60 columns and run `node dist/cli.js --help`, then `node dist/cli.js init --dry-run` in a scratch repository | no block characters above `Usage:` and none before the dry-run report — the mark is absent rather than wrapped | L | 2 | [ ] |
| 4 | Keyboard traversal of the landing page | open the built site's `/`, press Tab through the page | focus lands on the copy control and on both links in order with a visible ring; the GitHub link's accessible name ends "(opens in a new tab)"; the copy control announces nothing when it copies (a theme behaviour, named as not done) | L | 2 | [ ] |
| 5 | The diagram on GitHub | open `docs/working-with-stamity.md` on the repository's GitHub page | the fence under "The spine" renders as a diagram, not a code block | L | 1 | [ ] |
| 6 | The docs-site CI run on the pushed head | open the docs-site workflow run for the push | green; the site artifact builds with the mermaid theme | M | 2 | [ ] |
| 7 | The typed fallback on a dumb terminal | `TERM=dumb node dist/cli.js init` in a scratch repository | the numbered list and `Choose 1-N […]:` prompt exactly as in 1.1.0; the re-ask on a bad answer reads `not a valid choice: …` | L | 2 | [ ] |

**Sign-off** — Package 8 operator experience, 2026-09-04

- [ ] Every H row walked and passing. (No H row: no data, security or blocked core flow is on this path — the security lens approved, and every gate is green.)
- [ ] Every failing M row has a filed follow-up, linked.
- L failures are recorded, not blocking.
- Rollback: `git revert` of the package's commits on `closure-run-execution` in reverse order (the five product commits and the run-4 artifact), then `npm run build && node dist/cli.js sync` to restore the emitted copies; the site reverts with its lockfile.
- Shippable: **open** — the checkpoint is unsigned because the run was unattended; the seven rows above are the maintainer's, and the review package (Package 4) runs before any merge.

### Appendix — auto-proven rows

| Row | Pointer |
|---|---|
| The `a` and the mark's contract | `npx vitest run test/cli/banner.test.ts` exit 0 — the inline snapshot at `test/cli/banner.test.ts` (the 62-column art), the accent-run assertion `["▄███▄▄", "▀███▀▀"]`, the charset and budget tests |
| The width guard, both call sites | `test/cli/banner.test.ts` (64 → nothing, 65 → the mark, absent → the mark; red-checked three ways) and `test/cli/commands/init.test.ts` ("prints no welcome mark at 64 columns and the mark at 65") |
| Byte identity of the menus | the whole `test/cli` suite passing with no assertion edited (1231 tests before the fix rounds, 1254 after), including the exact escape-count assertion; the four new legs in `test/cli/prompts.test.ts` (strip-equality, escape-count delta, no escape on the typed path, paint after measure) |
| The accent token | `test/cli/kit.test.ts` — `#8A52FF` at truecolor, index 99 at 256 colours, identity at 16 colours and when colour is off |
| The sanitiser | `test/cli/prompts.test.ts` — the re-ask token with an ESC byte, one case per bidi and zero-width class |
| Landing copy control at rest and under hover, both schemes | `browser-evidence.json` after: `copyOpacityAtRest` "1" (light, dark), `copyOpacityOnBlockHover` "1" |
| Landing icons and wrapping at 375 | `browser-evidence.json` after: `startIcon`/`repoIcon` true, `buttonsWrap.sameRow` false, icon widths 20.8 / 18.9 |
| The site type-checks and builds | the final test-runner's site gate (0 / 0 / 0); the fixer's red-check (a deliberate type error → exit 1) |
| The diagram renders and is legible | `browser-evidence.json` after: one mermaid svg, zero code blocks, viewBox 443.04, 16px labels at 1280, 12.39px at 375; review round 4's DOM probe (nine labels intact, no edge crossing a node) |
| The sidebar order and the pins | `browser-evidence.json` after: `sidebarStartHere`; `test/ci/docsRoster.test.ts`, `test/ci/docsSite.test.ts`, `test/cli/docs` (llms.txt byte-compared) exit 0 |
| README and getting-started | `test/docsPages.test.ts` (the verb list, `learn`/`handoff`, the link targets, README ≤150 lines at 143) |
| The charter mirror | `test/docsPages.test.ts` "mirrors the charter's touchpoint index" — red-checked on a cell, on the order, and on the roster guard |
| The six next-step lines | the corpus cases in `lightTrio`, `spec` and `feedbackPair` suites, each red-checked; `test/evals/locators.test.ts` green with no case edited |
| The emitted copies and goldens | `node dist/cli.js check` all green; the cross-client golden's diff reviewed row by row with the untouched rows asserted; both ledgers carry the dated row |
| The affected eval slice | `evals/runs/2026-09-04-run-4/RESULTS.md` |

## Not done

- The six new closing lines' golden cases — `SET-v4`.
- The QA sign-off — unsigned; the human rows are the maintainer's.
- The copy control's copied-state announcement, mermaid's dark palette, the diagram's
  first-paint reservation — theme behaviours the site's no-fork rule keeps out of reach.
- The after-Enter answer echo on the menus — a byte-changing improvement recorded as a follow-up.
- The CLI's logic size budget at 99.2% — the comment now says so; the budget is the review
  package's decision.
- The Windows concurrent-writer counter flake fired a THIRD time, on the records commit (no code
  change): the review package's trigger to read the lock, not rerun. The rerun was superseded by the next
  push; the run on that commit passed all three legs, the same fail-then-pass shape as before. The
  lock read is Package 4's.
