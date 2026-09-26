---
id: replay-v2
intent: test
stamp: d072a347ec44abd365850f44692be6ce1a4225d7 2026-09-24
reads: [AGENTS.md, evals/replay/REPLAY-v1.md, evals/replay/v1/seeds.json, evals/replay/v1/plan/001-replay.md, evals/replay/v1/patches/base.patch, evals/replay/v1/oracle/oracles.patch, evals/replay/v1/oracle/reference-fixes.patch, evals/replay/runs/2026-09-24-replay-1/RESULTS.md, evals/replay/runs/2026-09-24-replay-2/RESULTS.md, evals/replay/runs/2026-09-24-replay-1/summary.json, scripts/replay/findings.mjs, scripts/replay/measure.mjs, scripts/replay/score.mjs, scripts/replay/compare.mjs, scripts/replay/fixture.mjs, scripts/replay/oracle.mjs, test/replay/findings.test.ts, test/replay/measure.test.ts, test/replay/score.test.ts, test/replay/compare.test.ts, test/replay/fixture.test.ts, test/replay/seeds.test.ts, test/replay/oracle.test.ts, test/replay/synth.ts, content/commands/st-work.md, docs/specs/orchestrator-context.md, docs/plans/009-orchestrator-context-economy-03.md, .stamity/runs/2026-09-23_orchestrator-context/record.md, .stamity/runs/2026-09-23_orchestrator-context/ledger.jsonl, .stamity/learnings, .stamity/inbox.md]
depends_on: [docs/plans/010-enterprise-release-01.md]
---

# REPLAY-v2 — the old-vs-new replay with seeds that reach review, and the 1.10.0 replay gate

This file is self-contained. It is Package 16 session 2's second `/st-plan` artifact. Its committed comparison
gates the 1.10.0 tag (`docs/plans/010-enterprise-release-02.md`, the release gate's line 4).

## Context

REPLAY-v1 compared the 1.9.1 `/st-work` with the context economy (#54) in two pilots:
- loop characters per pass fell 24,703 → 13,341 (−46%);
- sub-agent tokens per pass fell 1,267,526 → 915,725 (−28%).

It could not score review. Every seed sat in a readable contrib patch the plan told units to apply, so the
orchestrator's pre-read flagged all 12 and the implementers fixed them before any review (`build/362`). No snapshot
was taken, because the baseline reviews all six passes in one round and the snapshot fired only per single pass.
Every verdict row read "none", and all five compaction samples had nothing at risk, so none was valid (evals/replay/runs/2026-09-24-replay-2/RESULTS.md).

REPLAY-v2 keeps v1's thresholds and changes how the seeds arrive. The units start clean, and the driver injects each
pass's seeds as a commit at the first review dispatch that covers the pass. It also fixes the five instrument defects
the pilots found (`build/353`, `build/355`, `build/363` to `build/366`) and scopes REQ-CTX-015's criteria per
protocol (`build/367`).

REPLAY-v1 stays frozen: `REPLAY-v1.md` keeps sha256 `fdee42b1…`, and its pilots stay unscored evidence.

## Decisions (the maintainer, 2026-09-24, through the question tool, one per turn)

| # | Decision |
|---|---|
| R1 | **Inject at review start.** v2's units are clean. When the first review dispatch that covers a pass starts, whether it covers one pass or several, the driver's hook commits that pass's seeds and snapshots the tree in the same hook call. No pre-read and no implementer sees a seed first, in either shape. A new canary proves the mechanics before any pilot. The prepared change set is the fallback if the canary fails. |
| R2 | **Build first, runs unattended.** While the maintainer is present, the session builds and gates everything, freezes the instrument and passes its canary. Then the pilots and scored runs run back to back, followed by the eval run (plan 010 file 2), unattended — overnight is fine — on `~/.claude-alt`. The maintainer signs QA, and the 1.10.0 cut follows once the replay gate and the eval floors pass. |

Assumed defaults (the research's recommendations, recorded for the maintainer's review):
- **Injection form.** A commit, under the fixed replay author. Reviewers read the branch diff, and an uncommitted
  edit may never be seen.
- **Verdict mapping.** One review round's verdict counts for every pass the round covers, so the "5 of 6 passes"
  wording stays literally true.
- **Compaction.** The canary re-tests the interrupt mechanism with placement per review round. With seeds reaching
  review, findings sit at risk at the boundary, which is what makes a sample valid. `auto-window` stays the fallback.
- **Where v2 lives.** Runs in `evals/replay/v2/runs/`, the comparison in `evals/replay/COMPARISON-v2.md`. v1's
  frozen one-commit check (`scripts/replay/score.mjs:752`) stays true as it is.
- **Seeds.** Twelve, so "36 opportunities per shape" in the spec stays literally true.
- **The changed shape's CLI.** The package branch's head at the instrument freeze, after plan 010's
  `hook-row-timeout` and `card-read-caps` land (the resume card is part of what is measured). The baseline stays
  `fed39ac` (1.9.1).
- **The replay home.** The v1 shapes move aside to `~/.stamity-replay/superseded-9de31649/`, never deleted. The
  pinned client `bin/claude-2.1.280` stays, and the model stays pinned at `claude-opus-5-5`.

## Research (2026-09-24; two researchers at Opus 5.5)

**Why v1's seeds never reached review**
- Every seed sat in `vendor/contrib/<pass>.patch`, which the plan tells each unit to apply
  (`evals/replay/v1/plan/001-replay.md:12`, `:26`, `:41`, `:56`, `:71`, `:86`, `:101`).
- The plan's `reads:` names every seeded file (`:5`).
- The plan restates the correct behaviour the seeds break (`:33`, `:48`, with `docs/api.md` as the contract of
  record).

**Why snapshots and verdicts were missing**
- The private driver's hook snapshots only on a verdict dispatch for one pass (`marker-hook.mjs:72`).
  `attributePass` collapses several passes to `multi` (`scripts/replay/measure.mjs:276-282`), and `foundRound1`
  requires `f.pass === seed.pass` (`:936`).

**The instrument is hard-wired to v1**
- `score.mjs` requires the protocol path `evals/replay/REPLAY-v1.md` and one instrument commit across the runs folder
  (`:29`, `:743-752`, `:810-811`, `:824`, `:861`).
- `compare.mjs` fixes `COMPARISON-v1.md` (`:25`, `:363-367`).
- The private driver fixes v1's paths, messages, passes and placements (`replay.mjs:32-41`, `:56-67`), the canary
  path (`:1187`) and the export check (`:1244`).
- `fixture.mjs` already accepts a data-directory override (`:435`, `:450`).

**The five defects**
- `build/363`: a negated severity word is read as a severity (`findings.mjs:38-39`, `:212-217`, `:247`,
  `:256-257`).
- `build/364`: seed terms match inside the finding's own locator (`findings.mjs:551-555`; the terms `"20"` and
  `"guard"` in `evals/replay/v1/seeds.json:224` and `:161`). This produced all three of the baseline pilot's recall
  credits.
- `build/365`: sec-sql-sort's presence rule reads the fixed code as present (`seeds.json:22-24` against
  `oracle/reference-fixes.patch:145-146`).
- `build/366`: `foundRound1` is never true under a `multi` round.
- `build/353`: the driver's `markers.mjs:92-104` pairs a compaction's typeless SubagentStop with the oldest open start
  of any type.
- `build/355`: v1's §8 sentence names only `seeds.json` and `__oracle__`, while `ALWAYS_FORBIDDEN` (`measure.mjs:60`)
  also holds `reference-fixes`.

**Cost**
- v1 pilots ran 53.2 and 39.3 active minutes. With fixer rounds that seeds now trigger, a v2 run is estimated at
  45–70 minutes.
- The count is 2 canary runs, 2 pilots, and 6–10 scored runs: about 8–15 hours in total, one at a time.

## Strategy matrix

| Layer | Scope | What it proves | Gate placement | Planned count |
|---|---|---|---|---|
| Unit | `scripts/replay/{findings,measure,score,compare,fixture}.mjs` | the scoring rules, including `build/363`–`366`; v1 behaviour byte-unchanged under `--protocol v1` | per-PR (`npm run test`) | about 16 new cases |
| Integration | `evals/replay/v2/` chain, injections and oracles | the clean chain is green; the injected tree fails all 12 oracles; the reference-fixed tree is green; each anchor is unique | per-PR (the opt-in replay suite, `STAMITY_REPLAY_SUITE=1`, as v1's) | 4 |
| Driver | the private driver's `replay.test.mjs` | injection per covered pass, snapshot per covered pass, the typeless-stop rule, the protocol constants | private, before the canary | about 6 |
| Canary | K1–K14, one run per shape | the mechanics live on the pinned client | before the pilots | 2 runs |
| Pilot | 1 per shape | the fixture's calibration: baseline recall in [0.5, 0.95] | before any scored run | 2 runs |
| Scored | 3 per shape; 5 on variance (max − min found > 2) | the release gate: REQ-CTX-015's floor rows | before the 1.10.0 tag | 6–10 runs |

## Priority outlines

- **P0.**
  - Security seeds: every one is found in every changed scored run, except one a baseline scored run missed.
  - Compaction loss: 0 findings lost in every valid changed sample, with at least 1 valid sample.
  - The `Merge gate:` line equals `compare()` re-derived by `test/replay/compare.test.ts`.
- **P1.**
  - Pooled recall: changed ≥ baseline − 1 over 36 opportunities per shape.
  - Verdicts: class agrees on at least 5 of 6 passes, and median rounds are within ±1 on every pass.
  - Approved-unfixed and decoy rates: changed at most the baseline's.
  - Loop characters: each changed scored run ≤ 0.5 × the baseline median.
  - Sub-agent tokens: changed mean ≤ 1.2 × the baseline mean.
- **P2.**
  - The matcher's refusals: a negated severity is no severity, and a term inside the locator credits nothing.
  - The per-pass snapshot at a multi-pass dispatch.
  - The typeless-stop pairing.
- **P3.**
  - The not-run rows for Cursor, Copilot CLI and Codex, each with its reason (Claude Code only, as the spec says).

## CI gates

| Gate | Trigger | Threshold | On failure |
|---|---|---|---|
| `npm run test` (`test/replay/**`) | per-PR | every case passes; v1's cases unchanged | block merge |
| `STAMITY_REPLAY_SUITE=1 npx vitest run test/replay` | before the instrument freeze, and per-PR in the lane | the chain, the injections and the oracles as stated | block the freeze |
| `node scripts/replay/score.mjs check --protocol v2 …` | after each exported run | exit 0 | the run is replaced (at most 2 per shape) or the comparison reads NOT-EVALUATED |
| `evals/replay/COMPARISON-v2.md` `Merge gate:` | before the 1.10.0 tag | `PASS` | the tag waits; the maintainer decides with the comparison in hand |

**Uncovered, and why:**
- Cursor, Copilot CLI and Codex are not replayed. The replay drives Claude Code only, and the spec's not-run rows say
  so.
- A run's wall time is recorded but gates nothing.
- The eval-set floors are not the replay's to measure; plan 010 file 2 measures them.

## Spec delta

`/st-work` merges this into `docs/specs/orchestrator-context.md` at its Prove phase.

### REQ-CTX-015 — The replay, its floor, and the release gate

MODIFIED (`build/367`, the maintainer's design decision R1). The statement keeps its scope, scoring, samples, floor
readings, merge and release-gate bullets, with these changes:

- **Protocol first**: each protocol, `evals/replay/REPLAY-v1.md` and `evals/replay/REPLAY-v2.md`, is committed before
  its own first result. Each criterion that counts or reads results reads only the results scored under the
  protocol it names, keyed by the protocol path and sha256 each `run.json` records.
- **Seeds reach review (v2)**: the units start clean. At the first review dispatch covering a pass, the driver
  commits that pass's seeds and snapshots the tree in the same hook call. A seed whose anchor is missing is recorded
  as not injected, and it leaves the recall denominator.
- **Scoring (v2)**:
  - A severity word governed by a negation ("no", "zero", "0", "none of the", "without") is no severity.
  - A seed term found only inside the finding's own locator credits nothing.
  - One review round's verdict counts for every pass the round covers.

- GIVEN each protocol WHEN `git log` is read THEN the commit adding it is an ancestor of the commit adding its first
  result, and no later commit changes a threshold value.
- GIVEN the results scored under `REPLAY-v2.md` WHEN counted THEN each shape has 1 pilot and 3 scored runs on Claude
  Code, or 5 scored runs where its three scored runs differ by more than 2 seeds found. v1's two pilots are not
  counted.
- GIVEN a v2 run WHEN the first review dispatch covering a pass starts THEN that pass's injected seeds are committed
  and its snapshot exists before the reviewer's first tool call. The run records each seed as injected or not.
- GIVEN the finding line `src/config/load.ts:15 — fix held. No Critical findings.` WHEN the matcher reads it THEN it
  yields no finding.
- GIVEN a Warning whose only matching term sits inside its own locator WHEN it is scored THEN it credits no seed and
  goes to adjudication.
- GIVEN every committed v2 result WHEN read THEN it records the Claude Code version and the init event's lists, as
  the v1 criteria require. The committed v2 results carry the three not-run rows.
- GIVEN the 1.10.0 tag THEN the tagged commit descends from a committed `evals/replay/COMPARISON-v2.md` whose
  `Merge gate:` line reads PASS: the floor criteria (the fourth to the tenth) holding for every proposal kept, as the
  release-gate criterion states.

## Shared contracts (census before parallel edits)

| # | Contract | Writers, in order | Readers |
|---|---|---|---|
| S1 | The v2 seeds schema: `seeds[].injection = { file, find, replace }`, and `present.notMatch` (a list of regex source strings) beside `present.contains` | `v2-multipass` (the schema check and `presentIn` in `scripts/replay/measure.mjs`), then `v2-fixture` (the data) | the driver's hook, which reads `injection` |
| S2 | The protocol table `PROTOCOLS` (paths per version), in the leaf module `scripts/replay/protocols.mjs` | `v2-protocol-paths` | `score.mjs`, `compare.mjs`, and the driver's `replay.mjs`, which mirrors it with a comment naming `scripts/replay/protocols.mjs` |
| S3 | `test/replay/score.test.ts` | `v2-protocol-paths`, then `v2-protocol` (the §8 pin) | — |
| S4 | `test/replay/oracle.test.ts` | plan 010's `win-timeouts` only; v2 writes `test/replay/oracle-v2.test.ts` | — |
| S5 | The instrument commit | frozen at the first pilot. After it, nothing under `scripts/replay/` or `evals/replay/` changes except exported runs and the comparison, or the pilots restart | every run |

## Units

### v2-matcher — a negated severity is no severity; a locator's text credits no seed (build/363, build/364)

| Field | Content |
|---|---|
| `id` | v2-matcher |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/findings.mjs`, `test/replay/findings.test.ts` |
| `interfaces` | **`maskNegated(text)`**, new. It returns `text` with spaces in place of: (a) a severity word, or a run of severity words joined by `or`/`and`/`nor`, that follows `no`, `zero`, `0`, `none of the` or `without`, optionally with `new`, `remaining`, `open` or `further` in between; and (b) the count forms `Critical: 0` and `0 Critical` (and the same for Warning). **Where it applies.** Before every `FINDING_WORD`/`SEVERITY_WORD` test (`findings.mjs:38-39`, `:247`, `:256-257`) and before `words` is collected at `:213`. `finding.text` keeps the original. **In `matchItems`** (`:551-555`): every `LOCATOR` match (`:34`) is removed from the text before the term test. An all-digit term matches only as `(?<![\w.:])<term>(?![\w])`. `matchItems` is exported, so the seeds test uses it rather than its local copy (`test/replay/seeds.test.ts:442-444`) |
| `testCriteria` | (a) `- src/config/load.ts:15 — fix held. No Critical findings.` yields `[]`. (b) `no new Critical or Warning at src/a.ts:3` yields `[]`. (c) `Warning: no tests at src/a.ts:3` still yields one Warning. (d) `Critical: 0` yields no finding. (e) A Warning with the text `src/config/load.ts:20 — exportBatchSize unvalidated` credits no seed whose term is `"20"`, and goes to adjudication. (f) The term `20` still matches "the default is 20 vs 50". Cases (a), (b) and (e) are seen red on the unchanged code first |
| `edgeCases` | "no Critical, but a Warning at x:3" still yields the Warning. A locator on its own line, followed by a sentence carrying the term, still credits |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay/findings.test.ts && npm run lint` |

### v2-multipass — multi-pass rounds, the v2 seeds schema and the verdict mapping (build/366, build/365 schema)

| Field | Content |
|---|---|
| `id` | v2-multipass |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/measure.mjs`, `test/replay/measure.test.ts`, `test/replay/synth.ts` (only if a helper is needed) |
| `interfaces` | **`passesOf(description, prompt)`**, exported: the passes a dispatch covers. When the description names a pass, that is `[attributePass(...)]`, the one pass the pinned attribution rule takes (first-wins). Otherwise it is the distinct pass ids its prompt names (amended 2026-09-26 on `review/38`: one rule for the loop measures and the verdict mapping, mirrored by the driver's hook). `attributePass` (`:276-282`) still returns `multi` for several passes, and each agent also carries `passes`. **Where `passes` is read.** `foundRound1` (`:936`) and `stageOf` (`:914`) accept `f.pass === seed.pass \|\| f.passes?.includes(seed.pass)`. The fixer round count (`:627`) joins on either. The capture-defect check (`:1025`) covers each pass of a multi agent. **Verdict mapping.** One review round's final verdict and round count are recorded for every pass in its `passes`. **Seeds schema** (S1): the check accepts `injection: { file: string, find: string, replace: string }`, with a non-empty `find` and `replace` that differ, and `present.notMatch: string[]`, each compiling as a regex. `presentIn` (`:235-240`) reads a seed as present only when every `contains` holds and no `notMatch` pattern matches. v1's seeds, which have neither field, read exactly as before |
| `testCriteria` | (a) A synth capture (`test/replay/synth.ts`) with one reviewer whose prompt names `u1-p1 u1-p2`, and a finding matching sec-sql-sort, gives `foundRound1: true` and `stage: "pass"`. (b) That round's verdict class and rounds are recorded for both `u1-p1` and `u1-p2`. (c) A seed with `present.notMatch: ["\\.(has\|includes)\\(\\s*sort\\s*\\)"]` reads absent on a tree holding the allowlist guard, and present on the seeded tree. (d) v1's `seeds.json` passes the schema check unchanged, and every v1 case in `test/replay/measure.test.ts` stays green unedited |
| `edgeCases` | A multi dispatch naming a pass with no snapshot is a capture defect for that pass. A branch-stage finding stays `branch`. An `injection` whose `find` equals its `replace` is refused by the schema check. **Folded in at Frame (inbox rows 228, 230, 231; the maintainer, 2026-09-24).** (i) One term window in both shapes (rows 228, 231): a finding's accepted terms are matched over its own entry. For a structured row that is its summary plus the matching entry of its report's findings block; for a free-text finding it is its own block. Neither shape reads more, so the changed shape's narrower window at `measure.mjs:581-586` and `:606` goes. A case pins one fixture finding scored identically as a structured row and as free text. (ii) The compaction window (row 230): under `auto-window`, a boundary is a sample only when it falls inside §7's window, from a lens delivery to the next ledger write (`measure.mjs:703`). A case pins a boundary outside the window as no sample |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay/measure.test.ts test/replay/seeds.test.ts && npm run lint` |

### v2-protocol-paths — the instrument reads its protocol version

| Field | Content |
|---|---|
| `id` | v2-protocol-paths |
| `requirements` | REQ-CTX-015 |
| `files` | `scripts/replay/protocols.mjs` (new), `scripts/replay/summary.mjs` (new), `scripts/replay/score.mjs`, `scripts/replay/compare.mjs`, `scripts/replay/fixture.mjs`, `test/replay/score.test.ts`, `test/replay/compare.test.ts`, `test/replay/fixture.test.ts` |
| `interfaces` | **Breaking the import cycle** (folded in at Frame, inbox row 235; amended 2026-09-24 on the implementer's `BLOCKED_AMBIGUITY`, reading 1). The cycle breaks in one direction: `compare.mjs` imports nothing from `score.mjs`, while `score.mjs` keeps importing `compare.mjs` for its `compare` subcommand, which is v1's recorded command and spawned by six unedited cases (`test/replay/compare.test.ts:508-567`). `MAX_REPLACEMENTS_PER_SHAPE`, `ROW_IDS`, `median` and `securityHeld` move to the leaf `scripts/replay/protocols.mjs`, which imports nothing from `scripts/replay/`. `validateSummary` and its schema constants move to `scripts/replay/summary.mjs`; it imports only `measure.mjs` (for `AMBIENT_LISTS`) and `fixture.mjs` (for `PASS_IDS`), and names neither script. `score.mjs` re-exports every moved name, so importers and existing tests do not change. The import test asserts three things: `compare.mjs` does not name `score.mjs`; `protocols.mjs` imports nothing from `scripts/replay/`; `summary.mjs` names neither script. **The table** (S2), exported from `scripts/replay/protocols.mjs`: `PROTOCOLS = { v1: { path: "evals/replay/REPLAY-v1.md", data: "evals/replay/v1", runs: "evals/replay/runs", comparison: "evals/replay/COMPARISON-v1.md" }, v2: { path: "evals/replay/REPLAY-v2.md", data: "evals/replay/v2", runs: "evals/replay/v2/runs", comparison: "evals/replay/COMPARISON-v2.md" } }`. **Commands.** Every command that reads or writes results takes `--protocol v1\|v2`, defaulting to `v1` so v1's recorded commands keep working. The protocol-path refusals (`score.mjs:29`, `:824`, `:861`), the one-commit and one-sha checks (`:743-752`, `:810-811`), and the comparison name and header (`compare.mjs:25`, `:363-367`) read the chosen entry. `fixture.mjs` passes `data` as its existing override (`:435`, `:450`). The comparison header names its protocol. The `Merge gate:` line keeps its name. **Tests.** A test that read a v1 literal keeps it for `--protocol v1`, and each edit carries an inline reason |
| `testCriteria` | (a) Under `--protocol v1`, every existing case passes unedited, or with an inline reason where a literal became a table read. (b) `check --protocol v2` over `evals/replay/v2/runs/` passes while v1's pilots exist in `evals/replay/runs/`. (c) A v2 run whose `run.json` protocol sha256 differs from `REPLAY-v2.md`'s is refused. (d) `compare --protocol v2` writes `evals/replay/COMPARISON-v2.md` and refuses a folder holding runs of both protocols |
| `edgeCases` | An unknown `--protocol` exits 1 with the usage, refused and nothing written, so `compare`'s exit 2 keeps its one meaning: the merge gate FAIL with the file written (amended 2026-09-26 on `review/48`). A v2 folder with no runs reads NOT-EVALUATED on every row, and the gate reads FAIL |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay && npm run lint && npm run typecheck` |

### v2-fixture — the clean chain, the injections and the oracles

| Field | Content |
|---|---|
| `id` | v2-fixture |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v2/patches/{base,u1-p1,u1-p2,u2-p1,u2-p2,u3-p1,u3-p2}.patch`, `evals/replay/v2/seeds.json`, `evals/replay/v2/plan/001-replay.md`, `evals/replay/v2/oracle/{oracles,reference-fixes}.patch`, `test/replay/seeds-v2.test.ts` (new), `test/replay/oracle-v2.test.ts` (new) |
| `interfaces` | **Clean patches.** Built from v1's (`evals/replay/v1/**`): each v1 pass patch minus its seeded hunks, so a unit that applies it adds correct code. **Seeds.** Each v1 seed becomes a v2 seed whose `injection` turns the clean text (`find`, unique in the clean chain's file) into the seeded text (`replace`). `locate`, `span`, `class`, `severity`, `terms` and `oracle` are carried over. Changes from v1: sec-sql-sort's `present` gains `notMatch: ["\\.(has\|includes)\\(\\s*sort\\s*\\)"]` (`build/365`). Every presence rule reads false on the reference-fixed tree. No bare generic term remains: `guard` becomes `unguarded`, `missing guard` or `requireAuth`. The decoys are carried over. **The plan.** v1's `001-replay.md` with the same units, reads and contract of record; it holds no seeded text, because the seeds do not exist until review. **Oracles.** `oracles.patch` holds tests that fail on the injected tree and pass on the clean one. `reference-fixes.patch` is the inverse of the injections. **`test/replay/seeds-v2.test.ts`.** The chain applies; every `injection.find` occurs exactly once in its file after the chain; applying every injection yields the seeded tree; every seed reads present there and absent after the reference fixes (via `presentIn`); `matchItems` is imported from `findings.mjs`; the unrelated-phrase table includes `["src/http/routes.ts", "The bearer guard logs the token."]`. **`test/replay/oracle-v2.test.ts`.** A new file, so plan 010's `win-timeouts` owns `oracle.test.ts` alone. Behind `STAMITY_REPLAY_SUITE=1`, as v1's: the clean chain's gates pass; the injected tree fails all 12 oracles; the reference-fixed tree passes them |
| `testCriteria` | The four `seeds-v2` properties above hold. `STAMITY_REPLAY_SUITE=1 npx vitest run test/replay/oracle-v2.test.ts` exits 0 with 12 oracle failures on the injected tree and 0 elsewhere. The file carries an explicit `60_000` timeout on the compile case, as plan 010's `win-timeouts` gives v1's |
| `edgeCases` | A `find` that occurs twice fails the uniqueness case with the seed's id. A seed whose injection would span two files is refused by the schema check |
| `depends_on` | v2-multipass, v2-matcher |
| `verify` | `npx vitest run test/replay/seeds-v2.test.ts && STAMITY_REPLAY_SUITE=1 npx vitest run test/replay/oracle-v2.test.ts && npm run lint` |

### v2-protocol — REPLAY-v2.md, the protocol committed before any v2 result

| Field | Content |
|---|---|
| `id` | v2-protocol |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/REPLAY-v2.md` (new), `test/replay/score.test.ts` (one pin, and the review/43 case), `scripts/replay/score.mjs` (one `NOTE_ROWS` entry: `{ includes: " falls outside §7's window ", rows: ['compaction-loss'] }`, routed 2026-09-26 as review/43, because the note is written by v2-multipass's `measure.mjs` and the table lives here; a new case gives the scorer a summary carrying the note and checks it renders beside `compaction-loss` and not under `other`) |
| `interfaces` | **Structure.** v1's (`evals/replay/REPLAY-v1.md`), with these sections changed. **Fixture.** `evals/replay/v2/`, and the injection rule: at the first review dispatch covering a pass, commit that pass's seeds under the fixed replay author and snapshot the tree; a missing anchor means not injected, outside the recall denominator. **Scoring.** The negation and locator rules; one round's verdict counts for every pass it covers; a dispatch covers the one pass its description names, else the distinct passes its prompt names. **Compaction.** Placement per review round; `auto-window` is the fallback the canary may choose. **§8.** The invalid-run sentence names all three `ALWAYS_FORBIDDEN` terms: `seeds.json`, `__oracle__` and `reference-fixes` (`build/355`). **Runs and comparison.** Runs in `evals/replay/v2/runs/`; the comparison is `evals/replay/COMPARISON-v2.md`. **§13 refusals.** A dirty instrument, or a commit other than the pinned one; the instrument commit is named in the first pilot's `run.json`, not in this file. **Thresholds.** Exactly one `replay-thresholds` block, with values identical to v1's (the floor declared before any run does not move). **Samples.** 1 pilot plus 3 scored runs per shape, 5 on variance (max − min found > 2); at most 2 invalid runs replaced per shape. **Message digests.** The v2 start and nudge messages' sha256s. **Pin.** `score.test.ts` gains "REPLAY-v2 §8 names every ALWAYS_FORBIDDEN term": it parses the array at `measure.mjs:60` and expects each term in the §8 sentence |
| `testCriteria` | (a) The thresholds block parses, and its values deep-equal v1's. (b) The §8 pin passes. (c) `shasum -a 256 evals/replay/REPLAY-v1.md` still prints `fdee42b1…`. (d) The commit adding `REPLAY-v2.md` is an ancestor of the commit adding the first v2 result (checked at the export) |
| `edgeCases` | A gap found by a pilot is never fixed by editing this file after the first v2 result. It is recorded, or it restarts the pilots under a REPLAY-v3 |
| `depends_on` | v2-protocol-paths, v2-fixture |
| `verify` | `npx vitest run test/replay/score.test.ts && npm run lint` |

### v2-driver — the private driver injects, snapshots per pass and reads the protocol (private layer; build/353, build/366)

| Field | Content |
|---|---|
| `id` | v2-driver |
| `requirements` | REQ-CTX-015 |
| `files` | The private layer's replay driver (`runs/package-16/replay/driver/`): `markers.mjs`, `marker-hook.mjs`, `replay.mjs`, `replay.test.mjs`, `README.md` |
| `interfaces` | **`replay.mjs`.** A `--protocol v1\|v2` flag selects the protocol path, data dir, runs dir, pass list, placements, messages, canary path and export check. These replace the fixed constants at `:32-41` and `:56-67`, the canary path at `:1187` and the export check at `:1244`, and they mirror `PROTOCOLS` with a comment naming `scripts/replay/protocols.mjs` as the source. **`marker-hook.mjs`.** On a verdict-role PreToolUse whose dispatch covers one or more passes (the single case and `multi` alike), for each covered pass not yet injected (the covered passes by `passesOf`'s rule: the description's one pass, else the prompt's distinct passes): apply each of that pass's seeds' `injection` (`find` → `replace`, once) to every worktree of the run; commit with the fixed replay author and the message `replay: <pass> review fixture`; record `injected` or `not injected (anchor missing)` per seed in the run journal; then snapshot that pass (`snapshotWorktrees`). All of this happens in the same hook call, within the hook's 120 s budget (`replay.mjs:53`). **`markers.mjs`.** A SubagentStop with an agent id but no agent type, whose timestamp is within 1 ms of a PostCompact marker and whose id was never seen in a start, pairs with nothing and changes no count (`build/353`). **Placement.** Per review round: the interrupt fires after the first review round's verdict return. **`README.md`.** Its Commands block gains `--protocol v2`. **The protocol mirror.** It names `scripts/replay/protocols.mjs` as its source |
| `testCriteria` | (a) The markers sequence `PreToolUse(reviewer, u2-p1)`, then `PostCompact`, then `SubagentStop{ agent_id: "x", agent_type: null }` at the same millisecond gives `inFlight` 1 and no placement fired. (b) A multi dispatch naming `u1-p1 u1-p2` injects both passes' seeds once, commits once per pass, and snapshots each pass once. (c) A missing anchor records `not injected` and still commits the other seeds. (d) `--protocol v1` behaves byte-identically on v1's canary fixtures. (e) The private hygiene gate prints PASS with exit 0 |
| `edgeCases` | A real typeless stop outside the 1 ms window still pairs, as the old rule did. A hook that would exceed its budget records a partial injection and marks the run invalid |
| `depends_on` | v2-fixture, v2-protocol-paths |
| `verify` | In the private layer: `STAMITY_REPO=<public checkout> node --test runs/package-16/replay/driver/replay.test.mjs`, then its hygiene gate by exit code |

### v2-canary — the shapes prepared under the candidate instrument; K1–K14 decide the mechanics

| Field | Content |
|---|---|
| `id` | v2-canary |
| `requirements` | REQ-CTX-015 |
| `files` | The private layer's `runs/package-16/replay/canaries/K-inject-baseline/` and `K-inject-changed/` (`record.md`, `record.json`, `run.json`, `marker-settings.json`); the replay home's shapes (outside any tree) |
| `interfaces` | **Instrument candidate.** The package branch commit where every public v2 unit has landed, together with plan 010's `hook-row-timeout` and `card-read-caps`, is checked out detached as the instrument checkout (`--repo`). The main checkout on the package branch is `--public`. **Shapes.** The v1 shapes move to `~/.stamity-replay/superseded-9de31649/`. Then `prepare` runs for baseline `fed39ac` and for changed = that commit. **Canary.** One run per shape: K5 and K7–K10 re-run unchanged; K1–K4 and K6 with placement per review round; new K11 (seeds injected per covered pass: at least 10 of 12 in both shapes), K12 (each covered pass's snapshot exists and each injected seed reads present in it), K13 (at least one verdict-role finding cites an injected file), K14 (the orchestrator did not end BLOCKED over the injected commit). **Mechanism.** The record decides it: interrupt per round when K1–K4 pass, else `auto-window` |
| `testCriteria` | `node replay.mjs status --canary K-inject-baseline` and `… K-inject-changed` exit 0, with K5–K14 passing. The record names the mechanism chosen and the instrument commit |
| `edgeCases` | K11 below 10 of 12 in either shape: the prepared-change-set fallback is written as a revised protocol before any pilot, and the maintainer is told. A canary finding a driver or instrument defect fixes it, and the canary re-runs at the new commit. The instrument freezes only at the first pilot |
| `depends_on` | v2-driver, v2-protocol, external hook-row-timeout with card-read-caps on the package branch owner: plan 010 file 1's lanes |
| `verify` | `node replay.mjs status --canary K-inject-baseline && node replay.mjs status --canary K-inject-changed`, in the private layer's driver folder |

### v2-pilots — one pilot per shape at the frozen instrument (unattended per R2)

| Field | Content |
|---|---|
| `id` | v2-pilots |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v2/runs/<date>-replay-1/` and `-2/` (the `<date>-replay-<n>` id form; the folder names the version; amended 2026-09-26 on `review/46`) (exported, committed from `--public`); the private layer's run folders (`run.json`, `measurement.json`, `marker-settings.json`, `export.json`, `staging/`; never `captures/`) |
| `interfaces` | The instrument freezes at the first pilot's start. One run at a time (the driver holds `~/.stamity-replay/run.lock`), each with `--protocol v2 --mechanism <the canary's>` and `--model claude-opus-5-5`. No full test suite and no docs-site build runs on the machine while a run is live; lanes run targeted tests only, and their full gates run between runs. Each run is exported and committed by path |
| `testCriteria` | `node scripts/replay/score.mjs check --protocol v2 --runs <both pilots>` exits 0. The baseline pilot's recall is in [0.5, 0.95] (`docs/plans/009-orchestrator-context-economy-03.md:430`). Each pilot records every seed as injected or not |
| `edgeCases` | Recall out of band: the seeds are re-cut before any scored run, which means a new instrument commit and restarted pilots. An invalid run (a capacity stop, a crash) is replaced, at most twice per shape |
| `depends_on` | v2-canary |
| `verify` | `node scripts/replay/score.mjs check --protocol v2 --runs <paths>; echo exit=$?` and `node scripts/leak-gate.mjs; echo exit=$?` |

### v2-scored — three scored runs per shape and the comparison (unattended per R2)

| Field | Content |
|---|---|
| `id` | v2-scored |
| `requirements` | REQ-CTX-015 |
| `files` | `evals/replay/v2/runs/<date>-replay-3/` onwards, `evals/replay/COMPARISON-v2.md` |
| `interfaces` | **Runs.** 3 scored runs per shape, alternating shapes, one at a time, under the same frozen instrument and the same mechanism. A shape whose three runs differ by more than 2 seeds found gets 2 more. Each run is exported and committed by path. **Comparison.** `node scripts/replay/score.mjs compare --protocol v2 --out evals/replay/COMPARISON-v2.md` writes the comparison (amended 2026-09-24: `compare.mjs` has no command-line entry; `score.mjs compare` is the command), whose `Merge gate:` line reads PASS only when every row except the carried eval-floors row is PASS; NOT-EVALUATED counts as FAIL |
| `testCriteria` | `test/replay/compare.test.ts` re-derives `compare()` over the committed v2 runs and equals the committed file's rows and its `Merge gate:` line. The leak gate prints PASS. The comparison names the instrument commit and the protocol sha256 |
| `edgeCases` | More than 2 invalid runs in a shape: that row reads NOT-EVALUATED and the gate reads FAIL, and the maintainer is told. A FAIL is reported with each failing row's evidence, and the tag waits |
| `depends_on` | v2-pilots |
| `verify` | `node scripts/replay/score.mjs check --protocol v2 --runs <all v2 runs> && npx vitest run test/replay/compare.test.ts && node scripts/leak-gate.mjs; echo exit=$?` |

## Execution order

1. `v2-matcher`, `v2-multipass` and `v2-protocol-paths` run in parallel lanes, beside plan 010's wave A.
2. `v2-fixture`, then `v2-protocol`.
3. `v2-driver` (private).
4. `v2-canary`, once plan 010's `hook-row-timeout` and `card-read-caps` are on the package branch.
5. Then, unattended per R2: the pilots, then the scored runs, then plan 010 file 2's eval run.

The replay's runs and the eval run never overlap, and no full suite or site build runs while a replay run is live.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| An implementer rewrites an anchor, so injections fail and recall's denominator shrinks | Warning | K11's ≥ 10 of 12 in the canary; not-injected seeds are recorded and excluded, never scored as found or missed |
| The orchestrator notices a commit it did not make and derails | Warning | K14. The same effect in both shapes; runs voided this way count against the two replacements |
| The hook's 120 s budget cuts an injection short | Minor | A partial injection marks the run invalid |
| The negation mask hides a real finding | Warning | The "but a Warning" edge case; unread free-text counts stay visible in RESULTS |
| Tests that read v1 literals are edited | Warning | Every edit carries an inline reason; `--protocol v1` stays the default and byte-identical |
| The account's usage window runs out during unattended runs | Warning | Runs are resumable, and an invalid run is replaced within the cap. The driver's capacity hold waits for a reset; a run that cannot finish is reported, never scored |
| A pilot finds a protocol gap | Minor | Recorded, or the pilots restart under REPLAY-v3; the protocol is never edited after its first result |
| The replay FAILs | Warning | The 1.10.0 tag waits; the maintainer decides with the comparison in hand |

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- The replay drives Claude Code only; Cursor, Copilot CLI and Codex stay not-run rows (the spec's scope).
- A single-pass review design (one `/st-work` per pass) would remove the round-to-pass verdict mapping, at about six
  times the start-up cost. It is not built.
