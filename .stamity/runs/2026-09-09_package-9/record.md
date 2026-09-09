# Run record — Package 9 "Completeness" (2026-09-09)

The last sequenced package: every deferral the twelve earlier run ledgers carried is collected into the
deferral inbox and retired to zero with one line each, no ledger row anywhere reads `open` or `deferred`
without its retirement, every decision the earlier packages reserved for the maintainer is decided as one
numbered batch, the private register's carried clauses become scheduled ones with a lane, a trigger and an
owner, the eval's red cases are repaired or accepted by name, and the close step is wired and tested so the
residue cannot regrow silently. The findings ledger is `ledger.jsonl` beside this file; the retirement of
every inbox row is `inbox-retirements.md`; the plan is `docs/plans/003-package-9-completeness.md`; the eval
run this package carries is `evals/runs/2026-09-09-run-8/`. Every verifier, skeptic, reviewer, lens and
attestor ran at `claude-fable-5-1`; every implementer, fixer, test-runner and loader at `claude-opus-5`
(attesting `claude-opus-5[1m]`); no agent was dispatched by a tier alias, and the sweep, the builds and the
eval slice ran through the workflow lane because it is the one lane that dispatches by explicit id.

## Outcome

**Closed with nothing deferred, uncollected or undecided.** The inbox was built from 144 ledger rows (83
`deferred`, 61 stale `open`) and 21 Not-done lines of four records — 165 rows, the first time the file the
process names as the deferral home had ever been written — and a read-only sweep of 22 verifiers and 22
skeptics established, row by row against the current tree, what each one's truth is. Every row is retired
with one line: 112 fixed (73 already fixed in history, cited by a commit reachable from `main`; 39 fixed by
this package or closed by a decision the maintainer took), 48 cut with a reason, 5 scheduled to a lane with a
trigger and an owner. The two 2026-09-01 ledgers' 59 stale `open` rows now read the state the tree proves
(48 `fixed`, 10 `closed`, 3 `deferred` with their retirement); the two QA-checkpoint rows closed on the
maintainer's signature. The maintainer answered ten questions, none by default: the QA sign-offs signed;
two instrument defects repaired and five adherence cases accepted by name; the eight advisory two-run repeats
deleted; the residue gate in the suite plus the shipped text; all 27 cheap fixes taken; the sigstore major
reviewed now (approved; every trust property held) and the Node floor raised to 22.22.2 on its finding; the
`--no-color` note fixed (its premise did not reproduce; the real defect beneath it did); SECURITY.md amended
and re-attested; the migration page's title declared. Run 8 re-measured the affected slice: seven cases at three samples, calibration 5/5 — five hold at 3/3 (the board case up from 2/3), the MCP directive case 0/3 → 1/3 and the performance case 0/3 → 2/3, both criteria now decidable and both cases still red under the strict rule, accepted by name; the set's strict reading after the package is the release's, two cases moved upward and none down.
Four product commits (`13c2b49`, `f9825d0`, `b7a816c`, `3f01593`), the run-8 artifact and this record travel
on branch `package-9-completeness`, pull request #21 (`zomarit/stamity`, `package-9-completeness` → `main`), for the maintainer's merge; CI at the product head `17edceb` (before this record landed) red on the records gate alone — the four assertions this commit satisfies — plus the pull-request title check, retitled to the conventional shape; the records head's checks are read at the governance close and recorded in the hand-off.

## Proof block

### Gate results (test-runners `claude-opus-5[1m]`; the orchestrator's own line; exits unmasked)

| Pass | Result |
|---|---|
| Mechanism unit (U1 + U2), test-runner after the second fix round | gate 0 · typecheck 0 · lint 0 · knip 0 · `npm test -- --coverage` **1** — the one sanctioned red, `test/records/ledgers.test.ts` "leaves no row `open`" on 61 committed rows, the retirements being a later unit · build + `check` 0 · APM `--check` 0 |
| U3 + U5, test-runner | gate 0 · typecheck 0 · lint 0 · knip 0 · `npm test -- --coverage` 1 (the same sanctioned red; 7,121 passed, 1 skipped) · build + `check` 0 · APM `--check` 0 · `git status .apm` clean |
| Closing rounds, test-runner (on the machine's default Node 22.22.1) | gate 0 · typecheck 0 · lint 0 · knip 0 · `npm test -- --coverage` **1** — the sanctioned red plus 21 environment reds: the `node-version` doctor row refuses 22.22.1 against the new floor, so the dogfood e2e and `check` suites fail on that Node by design · build 0, `check` **1** (the same row) · APM `--check` 0 · `generate-docs` moved no page |
| The orchestrator's line under Node 24.19.0 (nvm; the CI floor leg runs 22.22.2), before the commits | gate 0 (18 rules, 861 files) · typecheck 0 · lint 0 · knip 0 · build 0 (logic 1.03 of 2.00 MiB, corpus 0.50 of 1.50 MiB) · `check` 0, drift clean, ten doctor probes ok · APM `--check` 0 · `npm test -- --coverage` 1 — the sanctioned red only: 180 files, 7,126 passed, 1 skipped, 1 failed |
| After the retirements landed | `npx vitest run test/records` 18/18 · leak gate 0 hits across 863 files |
| CI at the pushed head | `17edceb`, the head before this record: CI 34348556124 red on all three legs on one file, `test/records/ledgers.test.ts` — 61 committed `open` rows, 83 unaccounted `deferred` rows, the inbox absent, the inbox empty — every one of them the state this record's commit changes; PR checks 34348556185 red on the title shape (retitled `feat: …`); Docs site 34348556260 green (Build pass, deploy skipped as an unarmed run); DCO, the size budget, the dependency review and the supply-chain currency green. The records head's checks: read at the governance close, recorded in the hand-off row |

### Review verdicts, per round (reviewers, lenses, skeptics and attestors `claude-fable-5-1`; fixers `claude-opus-5[1m]`)

| Unit | Rounds | Outcome |
|---|---|---|
| The residue sweep (22 verifiers, then 22 skeptics over the same shards) | 1 | 144 rows verified: 65 landed, 47 not, 16 superseded, 9 partial, 7 not applicable; 14 disagreements, every one adjudicated toward the skeptic's tree evidence — twelve retirement lines had cited pre-rebase commit ids `main` cannot reach, two named a lane the roadmap does not give the item; every cited commit then checked reachable from `main` |
| U1 + U2 — the close step and the ledger gate | 4 | request-changes 0.85 (the `Ref:` anchor never declared in the board's grammar; a golden-ledger row claiming a manifest that did not move; `Info` admitted silently) → request-changes 0.85 (the set's roster row stale under a header claiming derivation — `test/evals/roster.test.ts` now derives it; B8 undecidable on the `rejected` branch) → request-changes 0.86 (the gate's docblocks named the wrong ledgers and counts) → **approve 0.90** (the legacy vocabulary pinned by ledger name; the duplicate-id pin; the `retired` field's shape declared in the shipped text at an unchanged line count) |
| U3 — the eval instrument | 6 | request-changes 0.85 → 0.86 → 0.86 → 0.85 → 0.85 → **approve 0.88**: each round narrowed the same thing — whether the rewritten B3 is decidable against every span of the three run-7 transcripts. The last two rounds found the paraphrase test grading two same-shaped exfil sentences oppositely, then the fragment test catching the scenario's own proper nouns B5 requires; B3 now carves those names out by count and the set's judgement records a full three-word scan of each transcript. The reviewer's final optional tightening (count the span's non-name words over the whole run) applied verbatim under the Tier-1 carve-out |
| U5 — 27 fixes, the help colour decision, SECURITY.md | 3 | request-changes 0.85 (a cursor guard and a listener try/catch without red-first pins; a symbol that did not exist; a sidebar assertion reading the wrong literals) → request-changes 0.85 (the SECURITY.md clause rewrote a sentence instead of adding one) → **approve 0.90** |
| SECURITY.md attestation, read-only | 2 | not clear (the clause omitted the crash journal at the workspace root; the root walk mis-stated) → fixed (the journal named; the ten-ancestor bound stated) → **clear**, 30 claims; then the "exactly three paths" sentence given the cascade, approve 0.92 with the closing items |
| The sigstore #18 review — a security lens and a defensive pack-trust pass | 1 each | lens **approve 0.85**: the client byte-identical to 4.1.1, three verifier hardenings gained, provenance on every changed package, the full CI suite already green on the PR head under sigstore 5; one Warning, the declared Node floor under-stating the graph. Pass: **every property held** — 14 held, 3 held-as-documented, the suite green in a worktree of the PR head with sigstore 5 installed, the opt-in live trust-root refusal included |
| U6 — the Node floor | 2 | request-changes 0.86 (the CHANGELOG bullet claiming a graph floor the committed lockfile does not yet prove; six scripts and the size budget still spelling 22.12; the maintainer's own Node below the floor) → **approve 0.86** |
| The closing items (SECURITY.md's write-path count, the CHANGELOG footer, two counts, one comment) | 1 | **approve 0.92** |

### Decisions trace

- **The batch, answered by the maintainer** (2026-09-09, in the session's question window; no default applied):
  Q1 the QA sign-offs → **signed now** on the captured evidence (over the declared default, unsigned and
  scheduled). Q2 the seven red cases → **repair the two instrument defects and accept the five adherence
  cases by name** (the recommendation, over the declared default of accepting all seven). Q3 the eight
  advisory repeats → **delete all eight** (the default). Q4 the regrowth gate → **the suite plus the shipped
  text**, no engine probe (the default). Q5 the sweep's survivors → **fix all 27 flagged cheap** (over the
  default, cut with reasons). Q6 Dependabot #18 → **review now** (over the default, schedule). Q7a the
  `--no-color` note → **fix** (over the default, cut). Q7b the SECURITY.md wording → **amend now** (over the
  default, cut). Q9, surfaced by the sigstore review → **raise the floor to 22.22.2 now** (the lens's
  recommendation, over the default of merging as reviewed). Q10, surfaced by the sweep → **declare the
  migration page's title now** (over the default, the 2026-08-31 decline standing).
- **Assumption stated, not asked:** the sweep, the builds, the review rounds and the eval slice ran through
  the workflow lane, because the kickoff prompt binds every agent to an explicit model id and the agent tool
  dispatches by tier alias only. Dropped: alias dispatch with post-hoc attestation, which the record calls
  inadmissible.
- **Assumption stated, not asked:** a ledger row's retirement is an optional eighth field on the row,
  `retired`, whose value opens with the date and states the disposition; the recorded `state` moves only
  where it was never true (the two 2026-09-01 ledgers' stale `open` rows). Dropped: a second row per
  retirement, which the ledger's converge-by-id rule forbids.
- **Assumption stated, not asked:** the private register's one HOLD row is scheduled to the non-Claude
  client lane, its recheck being a client event. Dropped: the positioning lane, whose trigger is a usage
  window unrelated to the recheck.
- **Assumption stated, not asked:** the `--no-color` fix the maintainer chose for the Tier-1 lane was applied
  through the build unit with its review round, a stricter lane with the same gates; its premise did not
  reproduce on commander 15 and the fix landed is the real defect beneath it (the help writer's colour was
  decided from the real stdout and undecidable from the suite), stated as such in the retirement line.
- **Deferred with rationale, and retired in the same close:** the maintainer's default Node 22.22.1 sits one
  patch below the new floor (scheduled — the maintainer's own button); `website/package.json` declares its own
  22.12 for the docs-site package (scheduled — the site's next dependency bump). Rejected with reasoning: the
  engines guard's real-graph half cannot go red until the lockfile carries sigstore 5 — its fixture pins the
  incoming range, which is the guard's stated shape.
- The record layer's rows for these decisions are filed in the private layer with this package.

### Artifacts touched, with the owning sub-agent

| Commit | What it carries | Owner |
|---|---|---|
| `13c2b49` feat(process) | the close step in `content/commands/st-work.md` and the board's census; the corpus tests; `test/records/ledgers.test.ts`; `test/evals/roster.test.ts`; B8 and the re-inlined brief on the proof-block case; the truncation case's locator; the dogfood sync, the APM projection, both golden ledgers | implementer, fixers (rounds 1–4), sync through the fixers |
| `f9825d0` test(evals) | B3 and B6 repaired; eight advisory criteria deleted with reasons; the set document's Package 9 section and case-index cells | implementer, fixers (rounds 1–6); the final tightening by the orchestrator under the Tier-1 carve-out |
| `b7a816c` fix | 27 deferred findings closed; the help writer takes the CLI's colour decision; SECURITY.md's cascade clause and write-path count; the migration page's title (orchestrator, Tier-1 carve-out, pinned in `test/ci/docsSite.test.ts`) | implementer, fixers (rounds 1–2), the closing fixer |
| `3f01593` build | the floor to `>=22.22.2` across its carriers; `test/ci/engines.test.ts`; the CHANGELOG's Unreleased section and footer | implementer, fixer (round 2), the closing fixer |
| 17edceb test(evals) | run 8: `RESULTS.md` and `samples.jsonl` | the harness (loaders and scenarios `claude-opus-5[1m]`, calibration and judges `claude-fable-5-1`); rendered by the orchestrator |
| this record's commit | `.stamity/inbox.md` built then emptied; fourteen ledgers retired; three earlier records signed; this run's ledger, record and `inbox-retirements.md`; the plan | orchestrator |

### Per-action attribution

| Role | Count | Attested id |
|---|---|---|
| residue verifiers and skeptics | 44 | `claude-fable-5-1` |
| reviewers (U1+U2 four rounds, U3 six, U5 three, U6 two, the closing items one) | 16 | `claude-fable-5-1` |
| security lens, pack-trust pass, SECURITY.md attestors | 4 | `claude-fable-5-1` |
| implementers and fixers | 17 | `claude-opus-5[1m]` |
| test-runners | 3 | `claude-opus-5[1m]` |
| run 8: loaders and scenarios | 24 (3 loaders, 21 scenarios) | `claude-opus-5[1m]` |
| run 8: calibration and judge calls | 26 (5 calibration, 21 judge calls; 0 redone) | `claude-fable-5-1` |

Evidence classes: the workflow journals are native artifacts (kept in the private layer's run directory with
the harness of record, the shard manifest and the retirement map); the gate outputs are the runners' quoted
command results and the orchestrator's own; the sigstore pass's suite ran in a throwaway worktree of the PR
head that was removed afterwards.

### Recommended next step — derived from this run's own state

Merge pull request #21 (`zomarit/stamity`, `package-9-completeness` → `main`) on green checks; then the Dependabot clicks — #15, #19, #20 on their checks and
#18 as reviewed here, whose EBADENGINE warning on the floor leg the floor raise removes. Install a Node at or
above 22.22.2 locally (`nvm install 22.22.3`, or `nvm use 24`) before the next local gate line. Nothing is
deferred, uncollected or undecided; the next lane is whichever trigger fires first — Package 7 on L1's usage
window or a public challenge of the claim, L1 after two to four weeks of real usage, L2 when a non-Claude
client matters, L3 on the maintainer's own clicks — and this package re-runs after each, in minutes: the
records gate, the inbox triaged, the register's scheduled rows the lane resolved, the eval artifact for each
corpus change, and any reserved decision as one batch.

## QA walk-through (the human checkpoint)

The user-visible changes this package ships: the Node floor, the help output's colour decision, the migration
page's declared title, SECURITY.md's amended wording, and three menu-kit guards no shipped caller reaches.

| # | Scenario | Driven how | Observed | Risk | Proof |
|---|---|---|---|---|---|
| 1 | `stamity check` on a Node below 22.22.2 refuses with the `node-version` doctor row and names the range | the closing rounds' test-runner on the machine's default 22.22.1 | `fail node-version  Node 22.22.1 is below the required >=22.22.2 — install a Node in that range …`; the dogfood e2e suite red on the same row | M | the runner's quoted output (this record, gate table row 3); `test/cli/commands/check.test.ts` fixtures at the moved range |
| 2 | On a Node at or above the floor the same command is drift-clean | the orchestrator under 24.19.0 | `all green — nothing to do`, ten probes ok, 58 managed files | M | this record's gate table row 4 |
| 3 | `stamity --help --no-color` and `--no-color --help` write zero SGR bytes; `NO_COLOR=1 … --help` too | `test/cli/banner.test.ts` "honours --no-color wherever it sits, --help included" (red-checked by reverting the wiring) | zero escapes in every leg | L | the test |
| 4 | `stamity --help` on a real colour terminal still paints the mark | **human** — a real TTY, not the suite's pipe | expected: the accent run on the wordmark rows | L | — |
| 5 | The migration page's tab and unfurl read "Migrating from …" after the next site deploy | **human** — open the deployed page after the merge; or `npm run build` in `website/` and read the built `index.html`'s `<title>` | expected: the declared title, not "migration" | L | `test/ci/docsSite.test.ts` pins the frontmatter; the render is the site's |
| 6 | SECURITY.md's three write paths and the workspace cascade read true against the tree | two read-only attestation passes at `claude-fable-5-1` (30 claims) | clear; banner byte-identical | L | the attestation journal (private layer) |
| 7 | A typed menu with ten or more choices aligns its labels; an empty choice list returns the defaults; a failing terminal write still restores raw mode and the cursor | `test/cli/prompts.test.ts` cases added with the fixes | each pinned red-first | L | the tests; no shipped caller reaches the first two |

**Sign-off** — Package 9 "Completeness", 2026-09-09

- [x] Every H row walked and passing. (No H row on this path.)
- [x] Every failing M row has a filed follow-up, linked. (No row failed; rows 1 and 2 are driven.)
- L failures are recorded, not blocking.
- Rollback: `git revert` of the branch's commits in reverse order, then `npm run build && node dist/cli.js sync`;
  the floor reverts with `3f01593` and its lockfile line.
- Shippable: **YES** — signed by the maintainer on 2026-09-09 on the driven evidence, as the last answer of this package's decision batch; the two human rows (4 and 5) stay recorded as L, not blocking, for the maintainer's own glance after the merge.

## Not done

**None.** Every line an earlier record would have put here became a scheduled item with its trigger and owner, retired in `inbox-retirements.md`: the maintainer's default Node 22.22.1 sits one patch below the floor this package raised (`nvm install 22.22.3`, or `nvm use 24`, before the next local gate line — the maintainer's button); `website/package.json` keeps its own 22.12 for the docs-site package, decided with the site's next dependency bump on the maintainer's click. The pull request's merge is the maintainer's; Package 7 and L1–L3 open on their triggers; this package re-runs after each, in minutes.
