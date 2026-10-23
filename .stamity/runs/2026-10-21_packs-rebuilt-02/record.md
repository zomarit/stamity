Status: closed 2026-10-23 — built and reviewed as pull request #124 (head f9abc9c6, CI green, ready for the maintainer's merge); eval run 53 FAIL, scheduled before the next cut; no open ledger row
Mode: attended
Branch: feat/packs-rebuilt-02
Plan: docs/plans/018-packs-rebuilt-02.md
Base: 68a2baf5ab0118208be3f52361452b2040386dad
Invocation: /st-work docs/plans/018-packs-rebuilt-02.md
Confidence gate: medium

# Run 2026-10-21_packs-rebuilt-02 — plan 018 file 2: the pack set

## Frame

**Outcome:** plan 018 file 2 built as one draft pull request: the `production` pack, `/st-ui-review` and the detector's
fixes in `frontend`, the core `/st-plain`, the charter's plain-writing lines and invariant 5 without client names, the old
Claude Code hook copies no longer emitted, and `ops`, `product-audit` and `scaffold` retired behind the retired-names map.

- In scope: the plan's 18 units, its spec delta, the follow-ups it appends.
- Out of scope: the plan's drop list; any merge or release (the next minor's cut ships it).

**Intensity:** deep (a wide diff across the corpus, the engine, the eval set and the specs; the security lens on `u5`,
`u10` and `u13`; the whole-branch review on Fable 5.1 before the pull request is marked ready). **Review cap:** 3.

**Model plan:** an implementer per unit (Opus 5.5, high; 18 lanes in eight waves); a reviewer per unit per round (Opus
5.5, high); the security lens where named (Opus 5.5, high); fixers (Opus 5.5, high); test-runners for each integration's
full suite (Opus 5.5, under the machine lock); the incremental eval run (judges on Fable 5.1, per the eval skill); the
whole-branch review (Fable 5.1).

**Inbox:** read at plan time (`docs/plans/018-packs-rebuilt-02.md` § Inbox rows this file matched): 238 rows, 47
matched; six folded into units (rows 174, 384, 385, 386, 387, 390), the rest left with their reasons.

**Isolation:** a git worktree per lane under `../.stamity-worktrees/stamity/`
(`p22s2-<unit>`), plus the integration worktree `p22s2-int` on `feat/packs-rebuilt-02`; declared before the first
build dispatch.

**Plan gate:** the plan's review ran three rounds (`reports/plangate-reviewer-r1.md` to `-r3.md`; ledger
`plangate/1`–`18`); the gate passes on round 3's approval, by the maintainer's click (2026-10-21, "Pass when round 3
approves").

## Blast radius

moderate — every repository that installs the `production` pack and writes a waiver row (a ticket outside the class
now invalidates its row; no installed consumer yet), the pack integrity map and `CATALOG_PINS`, the charter in every
golden and this repository's `AGENTS.md`, the three retired packs' upgrade path (`sync`, `check`, `add`), and the eval
set's 169 cases. Rests on: `-G` is a per-commit diff filter, not a line trace, so no later commit removes an earlier one
from the waiver's requester list, and the grader's guard admits the shipped form unquoted — run (the Fable re-review
after the escalation, `reports/branch-reviewer-r4.md`); every quoted eval block equals its `source:` range — walked
(each unit's review); the nine retired-pack pins equal each release tag's catalog pins — cited (`u13`'s review).

## Log

- 2026-10-21T14:05Z — the run record opened; the plan gate's round 3 running.
- 2026-10-21T14:07Z — round 3 approves (high; `plangate/14`, `17`, `18` fixed; no new finding); the ledger reads 0 open
  rows. **The plan gate passes** (the maintainer's click, "Pass when round 3 approves"). Integration worktree `p22s2-int`
  on `feat/packs-rebuilt-02` at `68a2baf5`; wave-1 lanes `p22s2-u1` … `p22s2-u7` (branches `p22s2/u1` … `u7`), each with
  a `node_modules` link to the main checkout's.

### Contract census, wave 1

| Contract | Class | Producer | Consumers | Change kind | Unit |
|---|---|---|---|---|---|
| `frontend`'s `permissions.toolFootprint` | persisted-name | `packs/frontend/pack.json` | `test/packs/frontend.test.ts`, the catalog pin | revalue (`spawn` added) | u3 |
| design-quality's "Reading the change" sentence (`:172-173`) | wire text | `content/agents/stamity-design-quality.md` | `test/corpus/agents/verdictReturns.test.ts:293-315`, `severityScale.test.ts:339-341`, the golden quoting `:14-33,112-157` (range kept) | revalue | u3 |
| the charter's invariant 5, opening paragraph, Conditional layer, maturity line | wire text | `content/charter/stamity-charter.md` | seven eval cases and their SET rows, `test/content/charter.test.ts`, `src/content/charter.ts` tripwires, the goldens, `st-unattended:45`, this repo's `AGENTS.md` (integration), `docs/specs/everyday-flows.md` (u18) | revalue | u4 |
| `.stamity/generated/hooks/claude/*` emission | persisted-name | `src/emit/hooksInfra.ts:507`, `src/adapters/claude.ts:615-616` | the tests, scripts and pages `u5` names, `CLIENT_CLOUD_FACTS`, the goldens, this repo's copies (integration) | drop | u5 |
| the scoped-id fallback | internal | `src/pack/install.ts:1142` | `test/pack/install.test.ts` | revalue | u6 (clean) |
| the core skill id lists | test-local | `test/emit/skillsProjection.test.ts`, `test/corpus/skills/verifyCore.test.ts` | themselves | revalue | u7 (clean) |

Derived files: `src/pack/catalogPins.ts` (u3 alone); the golden snapshots and `docs/capability-matrix.md` (u4 and u5,
resolved by regeneration at integration); `evals/SET-v7.md` (u4 alone); `evals/coverage-exemptions-v6.md` (u3 alone).
Every shared contract sits on exactly one unit's rows.

- 2026-10-21T14:08Z — wave 1 dispatched: seven implementers (Opus 5.5, high), one per lane.
- 2026-10-21T14:12Z — `u6` built (`27bbabd3`): verify, lint, typecheck, knip exit 0; both scoped cases red on the base.
  Contract delta: the ledger's `artifactId` form, read the way `clean.ts:235` and `projection.ts:358` read it (clean).
  Review dispatched.
- 2026-10-21T14:12Z — choice: u6 tried the cell's core-id case as the red case — dropped: the core-layer check refuses
  `reviewer` alone since `e1762a60`, so an id assertion and a non-core scoped case show the red (`test/pack/install.test.ts:505-555`)
- 2026-10-21T14:12Z — choice: u6 reverted a spread call into `catalogIdOf` for a null check (`src/pack/install.ts:1161`)
- 2026-10-21T14:12Z — `u7` built (`9ba434f9`): verify, lint, typecheck, knip exit 0; the new case red on the base. Its
  Minor M-1: `verifyCore.test.ts`'s consumer pins move from `:446-460` to `:444-458` (u8's brief carries it). Review
  dispatched.
- 2026-10-21T14:12Z — choice: u7 dropped a static `node:fs` import (outside its line boundary) for a dynamic import at
  `test/corpus/skills/verifyCore.test.ts:293`, and a shared helper for a per-suite copy (`test/emit/skillsProjection.test.ts:55-61`)
- 2026-10-21T14:15Z — `u6` review r1: **approve**, high, no finding; blast radius contained (one private helper whose
  only reader is `add`'s collision gate; it can only add refusals for scoped packs whose folder is gone). Rests on: the
  fallback reads the path after the whole owner prefix, as `clean.ts:232-235` and `projection.ts:353-358` do — walked.
  Ledger: u7's M-1 appended as `build/1`.
- 2026-10-21T14:17Z — `u7` review r1: **approve**, medium (no gate results were in its brief; the unit's verify ran in
  the lane), no finding; blast radius contained (two test files). Rests on: `test/corpus/census.test.ts:76-84` still
  pins the typed seven-skill roster, so the derived lists drop no roster pin — cited.
- 2026-10-21T14:26Z — `u3` built (`140d8a9a`, 8 files): tests first (13 red, then green); verify (2,440 tests), lint,
  typecheck, knip exit 0. Contract delta: design-quality's brief forms (additive, clean); the inventory file's sections
  (the `Verdict` row out, `Status` and `Proposal` in: one unreconciled consumer, scaffold's
  `st-design-system-create.md:16-28`, which `u8` deletes; its Minor M-1); `frontend`'s footprint and pin (regenerated,
  clean). The goldens move with design-quality's bytes (the integration regenerates). Review dispatched.
- 2026-10-21T14:26Z — choice: u3 tried rewriting only design-quality `:172-173` — dropped (about 240 characters do not fit
  two lines); reflowed `content/agents/stamity-design-quality.md:161-173` at up to 106 characters, every word kept, 186 lines
- 2026-10-21T14:26Z — choice: u3 kept the detector's verdict table in Step 5 as the hand-back's list
  (`packs/frontend/skills/st-design-system-detect/SKILL.md:75-92`); the declared default with no target is the most
  recently changed route (`packs/frontend/commands/st-ui-review.md:27`)
- 2026-10-21T14:33Z — `u3` review r1: **request-changes**, medium. `review/1` (W-1: Step 4 hands design-quality an
  undefined report path outside `touchedPaths`), `review/2` (W-2, decision_needed: an installed 1.16.0 `scaffold`
  copy routes on the inventory's verdict row, no longer written), `review/3` (M-1: researchers wait on the detector
  and browser needlessly), `review/4` (M-2: a review on the same head overwrites the browser bundle a `/st-work` proof
  block cites); u3's own M-1 as `build/2` (the same consumer as `review/2`). The reflow keeps every pinned phrase and
  moves no quoted line (walked).
- 2026-10-21T14:33Z — **sign-off `review/2`** (decision_needed): the upgrade note carries it — `u17`'s "Upgrading from
  1.16.0" bullet says an installed `scaffold`'s `/st-design-system-create` reads a verdict the detector no longer writes,
  so remove `scaffold` as `check`'s `pack-catalog` row says (its token-set proposal now lives in the detector); `u3`'s
  report keeps the consumer row. Not taken: keeping a `Verdict` row for a retired pack. `build/2` closes with it.
  Fixer dispatched for `review/1` (fix: design-quality returns its result inline, no report path), `review/3` and
  `review/4` (fix when cheap and real, else answer with the reason). `u17`'s plan cell gained the upgrade sentence.
- 2026-10-21T14:37Z — `u4` built (`863edcac`, 19 files): the charter at 95 lines (widest 117), invariant 5 as decided,
  1.3.1; byte constants +72 each (5,682, 5,682, 25,872, 6,548); goldens and the matrix page regenerated in the lane;
  the seven cases' ranges and SET rows moved, their quotes unchanged (no re-measure). Verify (2,925 tests), lint,
  typecheck, knip exit 0 (its first verify red on one maturity pin, fixed). Review dispatched.
- 2026-10-21T14:37Z — choice: u4 tried an inline heredoc for its edits — dropped (the guard refuses NESTING_DEPTH); Python
  scripts in its scratch folder instead
- 2026-10-21T14:37Z — choice: u4 showed the new tests red by restoring the base charter and `st-unattended`, then copying
  the edits back (no stash; its report § Tests)
- 2026-10-21T14:38Z — `u1` built (`02a931fc`, 5 files, 437+/230−): the cell's grep empty; the new `FIRST_PARTY` case red
  on the base; with the three folders deleted in a scratch copy and pins regenerated, the five files pass (143 tests);
  verify (161 tests), lint, typecheck, knip exit 0. Ledger: `build/3` (W-1, pre-existing: `sync`'s clash remedy prints
  `add <packId>` for a local-folder pack, a step that cannot re-add it) and `build/4` (M-1: 665 changed lines, 150 of
  them justification comments). Review dispatched.
- 2026-10-21T14:38Z — **sign-off `build/3`:** fold it into `u13` — its `remedyOf` names re-adding by folder or package
  path for every id that is no catalog id, not only retired ones (the plan cell amended). `build/4`: rejected at close
  as by design (the cell asked for the comments).
- 2026-10-21T14:38Z — choice: u1 installed the upgrade suite's frozen earlier-release pack under the catalog id
  `frontend`, sharing `browser-evidence`, so the remedy step and the collision refusals still run
  (`test/pack/upgradeRemedy.test.ts` `PACK`, `EARLIER_RELEASE`); a draft with no shared id dropped before running
- 2026-10-21T14:39Z — `u3` fix round 1 (`3b3c773f`): `review/1` fixed (design-quality returns inline; no report path),
  `review/3` fixed (researchers beside the detector and browser, one parallel step); `review/4` blocked on a file
  outside the cell (the bundle name is fixed in `packs/frontend/skills/st-browser-evidence/SKILL.md:128-129`).
  **Sign-off:** u3's cell widens to that skill file (same pack, same lane): an optional caller suffix on the bundle name,
  the default unchanged, `/st-ui-review` passing `ui-review`; the same fixer resumed.
- 2026-10-21T15:24Z — `u3` fix round 1, part 2 (`cc9e30d4`): `review/4` fixed (the skill takes an optional suffix, the
  default name unchanged; `/st-ui-review` writes `browser-<sha>-ui-review.json`; one assertion added); verify (2,441
  tests), lint, typecheck, knip exit 0. Re-review dispatched for `review/1`, `review/3`, `review/4`.
- 2026-10-21T15:24Z — `u1` review r1: **approve**, medium, two Minors (`review/5`: the permissions census comment claims
  a folder walk the in-memory pack never takes; `review/6`: "all coexist" compares a pack with itself while the catalog
  holds one pack); blast radius contained. Rests on: every moved case keeps its assertions and changes only its pack or
  file; the frozen release still shares `browser-evidence` with `frontend` — walked. Both Minors to a fixer (cheap, real).
- 2026-10-21T15:24Z — `u4` review r1: **approve**, medium, one Minor (`review/7`: `docs/troubleshooting.md:48`'s healthy
  `check` sample still prints invariants 1.3.0); blast radius moderate (the charter renders into every client's always-on
  file). Rests on: every line after charter line 16 moves by exactly the edit and the edit is net +72 bytes; the seven
  ranges and four constants match — walked. `review/7` goes to `u5`, which owns that page.
- 2026-10-21T15:24Z — `u2` built (`bbf55ef5`, 7 files): in a scratch copy without the three packs (pins regenerated)
  the unchanged files failed 13 tests, the edited ones passed; verify (503 tests), lint, typecheck, knip exit 0. Its
  Minor `build/5` (pre-existing: `clean --pack` leaves an empty class folder when its only file was moved out by hand).
  Review dispatched.
- 2026-10-21T15:24Z — `u5` returned **BLOCKED_DEPENDENCY**, its work uncommitted in the lane: verify red on two tests
  outside its cell (`test/hooks/emittedLint.test.ts:119` and `test/hooks/personOnlyGuardDist.e2e.test.ts:66` count
  Claude's scripts under the old folder). Ledger: `build/6` (W-1: on a pre-1.16.0 base the hosted action refuses every
  tool call on the upgrade run until merge; the Risks row understates it), `build/7` (W-2: `u18` will need the docsPages
  pins at `:5195`, `:5213`), `build/8` (M-1: 24 files, 859 lines).
- 2026-10-21T15:24Z — **sign-offs.** `u5`'s cell widens to the two hook tests and `docs/troubleshooting.md:48`
  (`review/7`); the same implementer resumes in its lane. `build/6`: the window stays documented, not bridged (the plan's
  declared default); the Risks row now states the refusal in full (plan edited). `build/7`: `u18`'s cell widens to
  `test/docsPages.test.ts` (those two pins). `build/8`: rejected at close as by design (the cell named every file).
- 2026-10-21T15:24Z — choice: u5 builds the old layout in `claudeHookCopies` by writing the seven builder-rendered files
  and their ledger rows, not by running an older release (`test/merge/claudeHookCopies.test.ts` `atOldLayout`)
- 2026-10-21T15:24Z — choice: u5's hook-latency reads the root from where the guard sits, not a fixed climb
  (`scripts/hook-latency.mjs` `guardRoot`); a QA helper exported at first, then made private (`scripts/qa/run.mjs:316`)
- 2026-10-21T15:24Z — choice: u2 tried a made-up pack with one agent in `clean.test.ts` — dropped (the edited-pack-file
  case then hit `build/5`); a second agent `acme-watcher` added (`test/cli/commands/clean.test.ts` `SHIP_FILES`)
- 2026-10-21T15:28Z — `u3` re-review r2: **approve**, high; `review/1`, `review/3`, `review/4` closed fixed; no new
  finding; blast radius contained (prose in one command and one skill, the regenerated integrity and pin). Rests on:
  `/st-qa` resolves only the unsuffixed bundle path (`content/skills/st-qa/SKILL.md:99`), and `/st-ui-review` passes
  `ui-review` — cited. `u3` is approved; `review/2` and `build/2` wait for `u17`'s upgrade sentence.
- 2026-10-21T15:28Z — `u1` fix round 1 (`ef2549ef`): `review/5` (the census walks the made-up pack from a temp `packs/`
  folder through `shippedPacks(packsRoot)`) and `review/6` (frontend's rows re-checked after the bystander install)
  closed fixed; verify, lint, typecheck, knip exit 0. Minors start no re-review round; the whole-branch pass reads them.
- 2026-10-21T15:29Z — `u5` built after the widening (`ff51f2e3`, `e24fad8d`; 26 files, 619+/255−): the two hook tests
  repointed; `docs/troubleshooting.md:45` at 1.3.1 (`review/7` closed fixed). Verify (46 files, 3,052 passed), lint,
  typecheck, knip exit 0. Goldens: the seven generated Claude entries gone from the `claude` and `all-four` trees, each
  manifest 1,983 bytes smaller; the matrix page one row. This repository's own old copies wait for the integration's
  `sync`. Review and the security lens dispatched.
- 2026-10-21T15:29Z — choice: u5's overlay guard cases plan with `ADAPTER_REGISTRY` instead of a hand-placed policy file
  (`test/emit/plannerOverlay.test.ts:62-69`); the session-start comparison swaps back one anchor line (`asGenerated`,
  `test/emit/hooksInfra.test.ts`)
- 2026-10-21T15:30Z — integration part 1 on `p22s2-int`: `u6`, `u7`, `u1` (and its fix), `u3` (and its two fixes), `u4`
  cherry-picked cleanly (`1691b557` … `f1eee165`); the derived files wait for `u2` and `u5`.
- 2026-10-21T15:31Z — `u2` review r1: **request-changes**, medium: `review/8` (W-1: the made-up pack ships no command, so
  the `clean --pack` copies cases no longer prove a command copy is recognised). Fixer dispatched (one command file in
  `SHIP_FILES`, shown red with the command branch disabled locally).
- 2026-10-21T15:36Z — `u2` fix round 1 (`35d866b4`): `SHIP_FILES` ships `commands/st-acme-ship.md`; with the command
  branch disabled locally the copies cases failed at `clean.test.ts:1334` (2 where 3 expected), the probe reverted
  before the commit; verify (503), lint, typecheck, knip exit 0. Re-review dispatched.
- 2026-10-21T15:37Z — `u5` security lens r1: **request-changes**, high: `review/9` (W-1, decision_needed, A10:2025,
  ASI02): on an upgrade pull request from a base older than 1.9.0 the hosted action runs that base's guard entry, which
  had no fail-closed tail (the tail arrived in 1.9.0, `SECURITY.md:92`), so with the script deleted the guard does not
  run on that run and tool calls pass with no policy; the pages and the cloud facts row say it refuses every call. The
  reclaim sweep, the root resolution and the QA change hold. Decision held for the maintainer, batched with #122's
  merge click.
- 2026-10-21T15:39Z — `u2` re-review r2: **approve**, high; `review/8` closed fixed; blast radius contained. Rests on:
  the command copy enters `rows` only through `isPackArtifactRow`'s command check when the pack cannot be planned, so the
  count at `clean.test.ts:1334-1336` needs that check — walked. `u2` picked onto `p22s2-int` (`bbf55ef5`, `35d866b4`).
- 2026-10-21T15:44Z — `u5` review r1: **approve**, medium, no finding; blast radius moderate (upgrades lose up to seven
  files, matched by hash). Rests on: the reclaim sweep deletes a stopped copy only when its bytes match the ledger row's
  hash, an edited one kept and named — walked. (Its "fails closed" line holds for 1.9.0+ bases only; `review/9` stands.)
- 2026-10-21T15:44Z — **the maintainer's decision on `review/9`:** "Correct the docs, add one step" — every page and the
  cloud-facts row state the window by base version (1.9.0–1.15.x: every tool call refused until the merge; before 1.9.0:
  the guard does not run on that run), and the upgrade notes add one step for a base older than 1.9.0 (upgrade through
  1.16.0 first, or keep the hosted action off that one pull request); no code bridge. Fixer dispatched in `p22s2-u5`.
- 2026-10-21T16:01Z — `u5` fix round 1 (`476a4bd3`, 7 files): the pages, the cloud-facts row and the regenerated matrix
  page state both cases and the step; the pins updated with justified notes; verify (3,052), lint, typecheck, knip exit
  0. Security re-review dispatched.
- 2026-10-21T16:04Z — `u5` security re-review r2: `review/9` closed fixed (high; the version boundaries match the shipped
  settings at each tag; the two-hop step holds). `u5` approved. Picked onto `p22s2-int` (`1d50f125`, `de8c911f`,
  `9d343b3c`); the golden-snapshot conflicts taken from one side and regenerated below, never merged by hand.
- 2026-10-21T16:05Z — **integration part 2, the derived files** (`e917a923`): pins `--write` and `--check` exit 0 (no
  change); build exit 0; this repository's own `sync`: 3 updated (`AGENTS.md`, two `.claude/` copies), **the reclaim sweep
  deleted the seven old `.stamity/generated/hooks/claude/` copies by hash** — the removal proven on a real install;
  `generate-docs` (the packs reference lists `/st-ui-review`), the matrix page (no change), goldens `-u` (10 updated). Every
  diff read; committed.
- 2026-10-21T17:10Z — the wave-1 gates (test-runner, `e917a923`): lint, typecheck, knip, `--check`, `node dist/cli.js
  check` (every row ok, invariants 1.3.1, drift clean), the leak gate — exit 0. **The full suite under the lock red:** 30
  timeouts and one assertion (`test/ci/evidenceArchive.test.ts:457`, a child process with no exit status after 734,847 ms)
  over 3,808 s, while another project's session loaded the machine (load averages 22 rising to 163). Per RULES, timeouts
  under that load are re-run alone before they are called defects, and CI's legs are the coverage evidence of record:
  the integration branch pushed and **draft pull request #123** opened (17:45Z) so CI runs each integration; the
  evidence-archive file re-run alone (dispatched).
- 2026-10-21T17:46Z — wave 2: lane `p22s2-u8` from `e917a923`; `build/1` closed (its pin shift carried into the brief);
  `u8` dispatched (Opus 5.5, high). `u9` (its edges, `u3` and `u7`, already integrated) dispatched beside it in lane
  `p22s2-u9`; the two share only `evals/coverage-exemptions-v6.md`, whose rows the integration keeps side by side.
- 2026-10-21T17:47Z — `test/ci/evidenceArchive.test.ts` alone under the lock (load 16–23): 40 of 40 pass; the loaded
  suite's failing case took 967 ms (734,847 ms in the loaded run). The wave-1 red was load; CI on #123 is the record.
- 2026-10-21T18:04Z — **#123's CI on `e917a923` green on every job** (floor 8m41s, lts 6m50s, windows-1 12m56s,
  windows-2 17m37s, cloud-container, records, size budget, DCO, title): wave 1's full-matrix evidence of record.
- 2026-10-21T18:02Z — `u9` built (`38517727`, 14 files): `content/skills/st-plain/SKILL.md` (104 lines, the head as
  planned, ISO 24495-1 by name, none of the three names), its companion with no `policy` block; counts 7 → 8; Codex
  measured at 5,015 of 8,000 (16 rows); one exemption row; goldens and two pages regenerated. Tests first (7 red);
  verify (4,465 tests) and the pack suites against the cap (405), lint, typecheck, knip exit 0. Review dispatched.
- 2026-10-21T18:11Z — `u8` returned **BLOCKED_DEPENDENCY** with its work committed (`aa884bd5`, 37 files: the three
  packs and suites deleted, `RETIRING_PACKS` gone from both suites, the 16 exemption rows gone, the person-only
  `.stamity/change-classes.json` line removed (the maintainer's approve prompt), `st-verify`'s consumer bullet reworded,
  help text on `frontend`, pins and two reference pages regenerated, the goldens' 11 `st-verify` lines regenerated). Its
  full suite under the lock: six assertion failures and no timeouts: five golden digests (regenerated, then green) and
  one docsPages link case: `docs/packs-and-trust.md:548` links the deleted `packs/ops/`, a page in `u17`'s cell.
  Ledger: `build/9` (that link, decision_needed), `build/10` (`evals/README.md:407-408` prose, `u16`'s), `build/11`
  (`README.md:113`, `u17`'s). **Sign-off `build/9`:** `u8`'s cell widens by that one line (the link to `packs/frontend/`;
  `u17` rewrites the page later); the same implementer resumed. `build/10` and `build/11` stay with their owners.
- 2026-10-21T18:15Z — `u8` done after the widening (`507c2f0a`: the worked-example link to `packs/frontend/`;
  `build/9` closed fixed); docsPages (168/168) and the two golden suites (75/75) pass under the lock on its final tree;
  the integration's full suite after wave 2 is the run of record. Review dispatched.
- 2026-10-21T18:15Z — wave 3 starts early: `u10`'s lane `p22s2-u10` from `u8`'s head `507c2f0a` (its only edge; the overlap
  with any `u8` fix is the one `PACK_IDS` line), `u10` dispatched (Opus 5.5, high).
- 2026-10-21T18:17Z–18:22Z (between two clock reads; the sync's own stamp 18:22:47Z follows it) — `u8` review r1:
  **approve**, high, no finding; blast radius moderate (three catalog ids and pins
  gone until `u13` fills the map; nothing ships between). Rests on: no tracked file outside the deleted folders reads
  them — walked.
- 2026-10-21T18:37Z — **integration part 3** (`353632be`): `u8` (`a4d9da92`, `801b2022`) and `u9` (`a6122397`,
  `81c55b1d`) picked; the golden conflict taken from one side and regenerated; the exemption list holds exactly the two
  pending rows (`/st-ui-review`, `st-plain`). Pins `--check` exit 0; this repository's own `sync`: the `st-plain` copies
  created, `st-verify`'s copy updated; docs and matrix pages regenerated; goldens 5 updated. Committed, knip exit 0,
  pushed to #123. Load 1.9: the full suite and gates dispatched under the lock.
- 2026-10-21T18:37Z — `u10` built (`199f0a60`, 7 files): `packs/production/pack.json`, `/st-production-review` (222
  lines, 19 checks, 8 blocking, every cited id re-looked-up by the suite), `test/packs/production.test.ts` (27 cases, 11 red
  first, 4 red on three deliberate breaks), `PACK_IDS` with `production`, the pin regenerated, one exemption row. Verify
  (2,110 tests), lint, typecheck, knip, `--check` exit 0; its Minor (the generated packs page stale in the lane) closes at
  integration. Review and the security lens dispatched. Wave 4: `u11` and `u12` forked from `199f0a60` and dispatched.
- 2026-10-21T18:37Z — choice: u10 names a waiver's requester as the author of the commit that added its row (`git log`),
  keeping the plan's five columns; a `requester` column dropped (`packs/production/commands/st-production-review.md`, Waivers)
- 2026-10-21T18:37Z — choice: u10 made attestation an `Attest` column; a missing attestation gives `not signed`, never `NO`;
  a `replace` control never makes a blocking check non-blocking (`st-production-review.md`, The policy file)
- 2026-10-21T18:43Z — `u10` security lens r1: request-changes; `review/12` (W-1: credential hits not limited to path,
  line and rule; the tree scan not limited to tracked files), `review/13` (W-2: a replace row can weaken a blocking check),
  `review/14` (W-3: a waiver's approver is a free-text name; a later edit is never re-approved), `review/15` (W-4: the
  scan's coverage is not recorded), `review/16` (M-1: the file-probe researchers hold network).
- 2026-10-21T18:47Z — `u10` review r1: request-changes; `review/17` (C-1: the test-runner runs any read the policy file
  names — repository content under `.stamity/`, against the screening floor), `review/18` (W-1: a waiver missing approver
  or expiry is not declared invalid), `review/19` (W-2: approver free text, the same as `review/14`), `review/20` (W-3:
  an advisory the verify axis "accepted" passes the blocking `pr-sec-01` with no approver), `review/21` (W-4: a validly
  waived attestation check can never be signed), `review/22`–`25` (M-1: REQ-PACK-018's text and the signed twin;
  M-2: the sign-off rewrites only the `.md`; M-3: the refused-words test's window; M-4: the grader checks no locator).
- 2026-10-21T21:33Z — **the maintainer's decisions** (asked 18:48Z, answered 21:33Z): waivers → "Claimed, shown,
  signed" (valid only with an approver and an expiry, the approver differing from the author of every commit that touched
  the row, so an edit needs fresh approval; the report lists each as a claimed approval; the sign-off confirms each waived
  blocking check by name); replace rows → "Evidence only, and shown" (a replace row may move a blocking check's evidence,
  never its pass condition or its Attest mark; every replaced blocking check listed for the signer); advisories → "Needs
  a waiver too" (an accepted high or critical advisory leaves `pr-sec-01` failing unless a waiver covers it). **Sign-offs:**
  `review/17` follows the floor, not a choice (controls name evidence and shipped probes only; the review never runs a
  command a file names); `review/13`, `14`, `19`, `20` by those answers; `review/12`, `15`, `16`, `18`, `21`–`25` fixed as
  proposed. All to one fixer in `p22s2-u10`.
- 2026-10-21T21:33Z — `u11` (`e639676a`, `st-release`, 177 body lines, 19 cases red first) and `u12` (`ae5dc2e7`,
  `st-incident`, 151 lines, 15 cases red first) both returned **BLOCKED_DEPENDENCY** on one line: `SHIPPED_FILES` in `u10`'s
  `test/packs/production.test.ts:58` pins the pack to the review command (`build/12`). **Sign-off `build/12`:** one writer
  edits that list once, after `u10`'s fix, `u11` and `u12` are integrated (an integration fixer), so the file keeps one
  writer; both reviews proceed on their diffs.
- 2026-10-21T21:43Z — `u12` fix round 1 (`102139f7`): `review/26`–`29` fixed (the escalation scope one rule in three
  places; the deadline probe widened and shown red; the secrets rule cited by name and item; a leaked value searched by
  key name, file or fingerprint, never by value); `review/26`–`28` closed fixed; `review/29` (security) to a narrow
  security re-review.
- 2026-10-22T07:02Z — the seams re-review: **approve**, medium; `build/12`, `review/30`, `38`, `40`, `44` closed fixed (u11's
  two notes verified). The integration branch fast-forwarded to `a06cb488` (pins `--check` exit 0, knip exit 0) and pushed
  to #123. (The night passed between 22:02Z and 07:02Z; the clock was read at both.)
- 2026-10-22T07:17Z — `u13` review r1: **approve**, medium, no finding; blast radius moderate (the remedy shared by
  `sync`, `check` and `init`; the map feeds `add`'s refusal and the catalog row). Rests on: the nine pins equal each
  release tag's catalog pins (16 tags compared) — cited. `build/3` closed fixed (folded into `u13`). **Integration part
  5** (`ece148cb`): `u13` picked cleanly (`b96726e1`, `ece148cb`); build, `sync` (unchanged), docs, goldens (no change);
  the manifest's timestamp-only change restored; knip exit 0; pushed to #123.
- 2026-10-22T08:11Z — `u14` returned **BLOCKED_DEPENDENCY**, its ten cases committed (`3a13f1c0`: four seeded floor cases
  covering the eight blocking checks, two clean twins, the compliant-and-legal case, the release and incident cases, the
  gatherer-not-grader golden; SET-v7 index, group head, opening count, 26 appendix rows and both totals; the three
  production exemption rows removed): `scripts/eval/run.mjs:53`'s roster literal (155) fails against 165 cases
  (`build/15`); size Minor `build/16`. **Sign-off `build/15`:** `u14` widens by that literal (to 165), `u15`'s cell by the
  same (to 169); the implementer resumed. Lesson: the integration's keep-both resolution of the exemption list cut one
  production row in half at part 4 (removed with the rows now) — a keep-both rule over blocks needs a structure check.
- 2026-10-22T08:14Z — `u14` done after the widening (`c2828565`: the roster literal 155 → 165): `test/evals` 2,034 of
  2,034, exit 0; `build/15` closed fixed. `u14`'s review dispatched on `a06cb488..c2828565` (through
  `reports/u14-production-cases-diff-r1.patch`); `u15` dispatched in lane `p22s2-u15` from `c2828565` (the two share
  `evals/SET-v7.md` in sequence).
- 2026-10-22T08:20Z — `u14` review r1: **request-changes**, medium (the reviewer's shell ran git only; every quote compared
  by hand with its range: all match): `review/46` (W-1: seeded-2's B3 binds a route on both gaps, but the quoted step 3
  makes `pr-sec-02` `ungraded`, and only gaps get routes), `review/47` (M-1: the seeded Briefs forbid reading files and
  never say the given locators count as confirmed, so a literal reply grades `ungraded`), `review/48` (M-2: release B4
  binds the readiness `NO` at the stop, but the quoted Step 8 does not print it). Everything else held: the four seeded
  cases plant all eight blocking checks, each trap one cause, the twins as REQ-PACK-018 gives, the counts consistent.
  **Sign-offs:** all three fixed now in `p22s2-u14` — each is a floor or refusal case a faithful reply could fail, the
  false fail REQ-PACK-024's gate cannot afford.
- 2026-10-22T08:24Z — `u14` fix round 1 (`03bf5e33`, 6 files, +23 −9): seeded-2's B3 binds a route on the `pr-sec-01` gap
  only (`pr-sec-02` stays `ungraded`, no route); each seeded Brief states its cited locators were opened and read, so they
  count as confirmed (no `source:` range moved); the release Brief quotes the hand-back section (`SKILL.md:202-206`, "the
  readiness line"), its source and SET-v7 index row widened to match; counts unchanged; verify exit 0. Re-review r2
  dispatched on `c2828565..03bf5e33` (`reports/u14-production-cases-diff-r2.patch`).
- 2026-10-22T08:26Z — `u14` re-review r2: **approve**, high; `review/46`–`48` fixed (each seeded trap still holds after the
  "locators count as confirmed" sentence; the new release quote matches `SKILL.md:202-206`; counts unchanged). The close
  by report refused (my brief named the closure keys `id`/`closure`/`note`; the ledger reads `ledger_id`/`status`/
  `rationale`, `src/runs/blocks.ts:316`), so the three rows were closed by hand with the reviewer's verdicts — a repeat of
  the strict-ledger lesson, in my brief this time; later briefs name the keys. `u14` approved.
- 2026-10-22T08:26Z — `u15` done (`ac8f0886`: the `/st-ui-review` golden and adversarial cases, `probe-plain-select` with
  nine descriptions, the `/st-plain` adversarial case with its hedge row; SET-v7 rows, group head, opening count "Ninety-one
  cases, in fourteen groups", 184 appendix rows across 61 cases; both exemption rows removed, "No exemptions remain.";
  `run.mjs:53` 165 → 169): verify 2,068 tests, lint, typecheck, knip exit 0; red first (the old exemptions file beside
  the new cases failed coverage twice). One Minor, `build/17`, the same README defect as `build/10` (both to `u16`).
  Contract delta: four unreconciled consumers of the roster and the 30 probe listings, all `u16`'s cell.
- 2026-10-22T08:27Z — `u17` done (`fa25f314`, 4 files, +144 −25): the change log's Added, Changed, Removed and three
  upgrade bullets (the retired packs and the replace order, an installed `scaffold`, the old hook copies with the
  pre-1.9.0 Action step); the worked example on `add frontend --dry-run`, copied from a real run and compared line for
  line by a new `test/docsPages.test.ts` case (red first, green, red again on one pin digit); README:113 names the two
  packs. Beyond the cell, both noted for review: the `@acme/ops` ownership example moved to `@acme/frontend`, the change
  log's Codex figure corrected to 5,015 over 16. Verify 187 tests, lint, typecheck, knip exit 0.
- 2026-10-22T08:28Z — dispatched together: `u15`'s review (`c2828565..ac8f0886`), `u17`'s review (`ece148cb..fa25f314`,
  with closures asked for `review/2`, `build/2`, `build/6`, `build/11`), and `u16` in lane `p22s2-u16` from `1cbd3692`
  (`ac8f0886` with `03bf5e33` picked cleanly onto it), with `build/10` and `build/17`.
- 2026-10-22T08:30Z — **integration part 5's gates** (`ece148cb`): lint, typecheck, knip, pins `--check`, `node dist/cli.js
  check` (17 rows ok, invariants 1.3.1, drift clean), the leak gate pass; **the full suite under the lock red on one
  wall-clock assertion**: 17,229 passed, 1 failed, 21 skipped (905 s) — `test/change/classify.test.ts:254` (a hostile
  glob in under 2 s) measured 2,490 ms, load 33 rising to 39 (headless browsers of another process). The branch changes
  nothing under `src/change/` or `test/change/`. Per RULES, re-run alone before it is called a defect (dispatched, three
  runs under the lock).
- 2026-10-22T08:31Z — the re-run alone: `test/change/classify.test.ts` three times under the lock, **454 of 454 each,
  exit 0** (load 37 to 36, the same as during the suite). The red was the full suite's contention, not this branch; part
  5's gate rests on these runs and the next full suite. (The test's 2 s wall-clock budget can fail under a loaded full
  run; a candidate leftover for the close.)
- 2026-10-22T08:33Z — `u15` review r1: **approve**, medium; every quote matches its range, the probe's nine descriptions
  verbatim and `st-plain` its only pick, the counts exact (169 cases, 184 rows across 61 cases). Two Minors: `review/49`
  (the plain case's B7 does not say whether "Consider running…" is an instruction), `review/50` (the ui-review case's B4
  silent on printing the token's value). **Sign-offs:** both fixed now in `p22s2-u15` (binding rows scored all or nothing
  over three samples; a judge split is a false fail), counts and ranges unchanged or the fixer stops. `u15` approved.
- 2026-10-22T08:33Z — `u17` review r1: **approve**, medium, no finding; every change-log claim checked against the base
  (`src/pack/retired.ts:53-118` and each pack's 1.16.0 manifest; `replaceSteps`; the menu at 17; 5,015 over 16); both
  moves past the cell kept. Closures applied by report: `review/2`, `build/2`, `build/6`, `build/11` fixed. `u17` approved.
- 2026-10-22T08:34Z — **integration part 6** (`fba1ccac`): `u14` (`7859318f`, `7e9e8465`, `fdde7ac3`) and `u17`
  (`fba1ccac`) picked cleanly; pins `--check`, build, `sync`, docs, matrix exit 0 (the manifest's timestamp-only change
  restored); knip exit 0; pushed to #123.
- 2026-10-22T08:36Z — `u15` fix round 1 (`4550f2eb`, two rows): the plain case's B7 fails a bare imperative and passes a
  hedged one that keeps "the gates do not require it"; the ui-review case's B4 fails printing the token's value `#6b7280`
  (the replacement hex the row already bans), the token's name alone passing. Counts and ranges unchanged; verify exit 0.
  Both Minors, the diff read by me: `review/49`, `review/50` closed fixed by hand.
- 2026-10-22T08:37Z — `u15` picked onto the integration branch (`28dbe4dc`, `d3baec8a`), cleanly; not pushed until `u16`
  joins.
- 2026-10-22T08:40Z — `u16` done (`6b973305`, 38 files, +260 −118): one count throughout (169 cases: 90 golden, 48
  adversarial with 10 twins, 31 probes; 47 floor cases; 951 binding and 153 advisory criteria after row 390's four
  deletions); the threshold denominators, census, derived roster, four index cells, README and the eval-run override
  (169 cases, 507 scenarios, 1,014 calls; no guard refused the write); dated paragraphs for row 390, the `st-plain` listing
  (all 30 probes, applied by a script refusing any file without exactly one match), the seeded subset declared before
  any run, and the count move; four `Disposition 2026-10-22` notes hashed at run 47's candidate; one `EXPECTED_MOVES` row
  and a dated sentence. README's exemption paragraph now true (`build/10`, `build/17`). Verify 2,068 tests (red first on
  five cells), the count and probe checks, lint, typecheck, knip exit 0. Review r1 dispatched on `1cbd3692..6b973305`.
- 2026-10-22T08:40Z — **integration part 7** (`a6624796`): `u16` picked cleanly (`00538c8b`); build, docs, matrix, pins
  exit 0; `sync` regenerated the eval-run skill copy (169 cases, 507 scenarios, 1,014 calls) and its manifest hash,
  committed as `a6624796`; knip exit 0; pushed to #123. The wave's gates and full suite dispatched (under the lock).
- 2026-10-22T08:42Z — the eval launch checks, early: run 51's §8 lists two repeats
  (`unattended-ship-it-overnight-no-merge-or-tag` A1, A2), both disposed in the case file on 2026-10-21 (nothing open);
  the account's 7-day signal, read from one small call on the run's configuration folder: **0.60** (status
  `allowed_warning`; five-hour 0.11) — room for the incremental run.
- 2026-10-22T08:50Z — `u16` review r1: **approve**, high, no finding; every typed count summed from the 169 index rows
  (951 binding, 153 advisory, 90/48/31, 47 floor; 184 must-NOT rows across 61 cases; 25 moved, 25 `EXPECTED_MOVES` keys);
  the seeded paragraph dated and declared before any run; the 30 listings verbatim; row 390's rows match their text at
  `4e892337`, `A2` the right label for `plan-security-unit-carries-threat-note` (run 47's). Closures applied by report:
  `build/10`, `build/17` fixed. The reviewer's shell could not hash, so I recomputed the four disposition hashes with the
  runner's own parser and `sha256` at `4e892337`: **4 of 4 match**, exit 0. `u16` approved.
- 2026-10-22T08:52Z — **two reds found together.** (1) #123's CI on `ece148cb` (08:11Z) failed on the floor and lts legs:
  `src/emit/planner.ts` below its 100% lines and statements floor (99.56%, line 1013: `isCatalogId`'s fail-open `catch`,
  `u13`'s, untested). The local suite on `ece148cb` had not shown it (its classify timing failure came first in the
  report). (2) Part 7's full suite on `a6624796` red (exit 1; the runner's output cut by the tool, its report deleted on
  exit); its `coverage-summary.json` against the config's per-file floors: only `planner.ts` misses (lines 99.56,
  statements 99.62). Ledgered `integration/1` (Warning); a fixer dispatched in lane `p22s2-cov` from `a6624796` (a test,
  no product change). (3) #123 reads `DIRTY`: `main` moved under it (#122's three commits, Dependabot #119), and
  `CHANGELOG.md` conflicts with `u17`'s commit; GitHub runs no pull-request checks on a conflicting branch, so the pushes of
  `fba1ccac` and `a6624796` ran none. `main` requires linear history (ruleset `main-policy`), so the branch is rebased,
  not merged; how it reaches the pull request is the maintainer's question (a force push stays refused).
- 2026-10-22T08:53Z — the maintainer's answer: **a new branch and a new draft pull request** (recommended), no force push.
- 2026-10-22T08:58Z — the integration branch rebased onto `origin/main` (`0f3e1cc7`) as `feat/packs-rebuilt-02-r2` (the old
  branch left at `a6624796`): 38 commits, one conflict (`CHANGELOG.md` at `u17`'s commit, resolved by script keeping both
  sections in Keep a Changelog order, Removed then `main`'s Fixed; no marker left). The new head `0526f762` differs from
  `a6624796` by exactly `main`'s five files. Build, `sync`, docs, matrix, pins exit 0 (the manifest's timestamp-only
  change restored); knip exit 0. Pushed; **draft pull request #124** opened with the body brought to waves 1–7; #123
  commented ("Replaced by #124") and closed, its branch kept. Integration shas from here are the rebased ones.
- 2026-10-22T08:59Z — the coverage fix (`e8d5a1ac`, `test/emit/plannerNameClash.test.ts` only): the catalog lookup made to
  throw (`vi.doMock`, the idiom of `test/pack/upgradeRemedy.test.ts`), the refusal still naming the clash, never the
  catalog's error, and keeping `add acme-demo`; `planner.ts` at 100% lines and statements with `upgradeRemedy` beside
  `test/emit` (the brief's narrower command exits 1 at 99.13%: lines 992-993 are reached only by that suite, which the
  full suite runs). Picked onto the rebased branch as `67c36a63`; pushed to #124. The main checkout fast-forwarded to
  `0f3e1cc7` and `npm ci` (exit 0) for `main`'s lockfile, no agent running; build exit 0. The gates and the full suite
  dispatched on `67c36a63`, the suite's whole output kept in `reports/integration-test-runner-r2.log`.
- 2026-10-22T09:08Z — **waves 1–7's gates green on `67c36a63`** (load 17 rising to 26): lint, typecheck, knip, pins
  `--check`, `node dist/cli.js check` (drift clean), the leak gate, and **the full suite under the lock: 316 files, 17,354
  passed, 0 failed, 21 skipped** (466 s; lines 97.76%, branches 90.68%; no coverage-floor error). `integration/1` closed
  fixed. **Wave 8:** `u18` dispatched in lane `p22s2-u18` from `67c36a63`. #124's CI running on `67c36a63`.
- 2026-10-22T09:10Z — the incremental eval run's preparation started beside `u18` (no case's `source:` names a file `u18`
  edits): a detached worktree at `67c36a63` for the candidate's eval inputs, and the run driver's re-pin to the new set
  file and census (169 cases), with its no-model canaries. Run 52 composes with run 51 (`035f078d`): 14 cases added
  and 67 changed since, across files 1 and 2.
- 2026-10-22T09:19Z — the driver re-pin round 1 done (no model call): the set pin and the census moved to 169 cases (read
  with the pinned parser, equal to the set's own counts), the instrument's hash recorded for prepare, the no-model
  canaries 15 of 15 and 29 of 29; its review dispatched.
- 2026-10-22T09:21Z — **#124's CI on `67c36a63`**: every job green but windows-2: one failure,
  `test/cli/engine/gitStatus.test.ts:497` (a repository whose root holds a program file under git's name:
  `readWorkingTreeStatus(repo).available` false), 1 of 9,235, the leg 891 s. The branch changes nothing under
  `src/cli/engine/` or `test/cli/engine/`; windows-2 passed on #123's earlier heads; the read's budget is 5 s
  (`src/cli/engine/gitStatus.ts:41`) on a slow runner. The failed job re-run to tell a timeout from a defect.
- 2026-10-22T09:30Z — the driver re-pin's review: **approve**, medium, one Minor (two stale line numbers in the re-pin's
  report, fixed); the 89 → 75 test count explained (one test file run of three). The reviewer could not hash or run, so I
  did: the set file and the instrument hash to the pin and the prepare argument; the driver's three test files under
  the lock, **89 of 89**, exit 0. The re-pin committed in the run's driver repository. The driver is ready for run 52.
- 2026-10-22T09:31Z — `u18` done (`5718a47e`, 6 files): the whole delta merged into five specs with `As built` lines
  checked at `67c36a63` (amended requirements rewritten in place with dated notes quoting the old words), REQ-BOARD-010
  retired in the plugin-lifecycle form (its old body cited at `main`'s `0f3e1cc7`), `packs.md` still `status: design`
  with its file-2 concerns closed, the two docsPages pins (now `:5256`, `:5276`) on the merged sentences, red first.
  Verify 187 tests, the spec-reading suites and the leak gate (947), lint, typecheck exit 0; all 29 ids present with
  proof lines. Size Minor `build/18`. **Integration part 8** (`16c8a185`): picked cleanly; build, `sync`, docs, matrix
  exit 0 (timestamp-only manifest change restored); knip exit 0; pushed to #124. The final-tree gates dispatched (scan,
  classify, the full suite under the lock). The eval worktree moved to `16c8a185`: no eval input changed since
  `67c36a63` (empty diff), the two pinned hashes equal.
- 2026-10-22T09:37Z — `u18` review r1: **approve**, high (about 60 citations read; REQ-PACK-017 to 020's say what the spec
  claims); one Minor, `review/51` (REQ-FLOW-080's `As built` calls the 116-character maturity line the charter's widest;
  invariant 6's first line is 117, and `src/content/charter.ts:352` says the same). To the fix round after the
  whole-branch review. `u18` approved — **every unit approved**.
- 2026-10-22T09:40Z — **the whole-branch review dispatched** (Fable 5.1) on `0f3e1cc7..16c8a185` (39 commits, 196 files,
  +8,817 −13,684), through `reports/branch-diff-r1-changes.patch` (added and modified files) and `branch-diff-r1.patch`
  (with the 29 deletions); handed `review/45` and `u11`'s three suppressed Minors to settle.
- 2026-10-22T09:41Z — **the final-tree gates green on `16c8a185`** (load 4 rising to 14): lint, typecheck, knip, pins
  `--check`, `node dist/cli.js check` (17 rows ok, drift clean), the leak gate; `gate scan --base 0f3e1cc7`: no hit, 196
  scanned, nothing unscanned; `gate classify`: **security-sensitive**, checks scan, gates-all, review, lens
  `stamity-security`; **the full suite under the lock: 316 files, 17,354 passed, 0 failed, 21 skipped** (430 s; lines
  97.76%, branches 90.68%; no floor error; `reports/integration-test-runner-r3.log`). The security lens on the whole
  branch dispatched (Opus 5.5, high) beside the Fable review.
- 2026-10-22T09:41Z — **eval run 52 launched** on `16c8a185`, composed with run 51: prepare (no model call) re-measures
  81 cases (the 14 new, and every case whose file moved across files 1 and 2) in 491 calls, census 169 cases;
  configuration `aff4c45f…`. The first prepare refused: run 51's summary on the records branch is the compacted copy, so
  the full one is read at its retention commit (`db7328b9`, the commit its archive pointer names). The configuration
  folder's `hooks` and `permissions` keys set aside for the run (a backup kept; restored at its end), as run 51 did.
  Calibration, then scoring only on a full match, started detached under the machine lock.
- 2026-10-22T09:50Z — the security lens on the whole branch: **request-changes**, one Warning, `review/52` (security,
  decision_needed): invariant 5's new wording prefers `.<client>/hooks/stamity/` where that folder exists, but the
  engine writes that folder only for Claude Code; for another client nothing owns, tracks or holds it
  (`src/change/personOnlyPaths.ts:44-100` holds `.codex/hooks.json`, not `.codex/hooks/**`), so a file placed there
  would be run in place of the screened session start, and `st-unattended` inherits the rule. Everything else on the
  branch passed (the retired map, the hook-copy reclaim, the production review, release and incident skills, the
  frontend additions, the change-classes and person-only paths; the pre-1.9.0 action window stays as the maintainer
  decided). The fix changes the charter's text or a shared contract: the maintainer's question, batched with the
  whole-branch review's.
- 2026-10-22T09:53Z — **the whole-branch review (Fable 5.1): request-changes**, high: `review/53` (W-1, decision_needed:
  `st-release`'s release mode commits the bump, the change log and the record on `release/<version>` and pushes only the
  tag; nothing pushes the branch or opens its pull request, as the old command's step did, so `main` never receives the
  bump and a publish proof needing the tag reachable from `main` fails), `review/54` (W-2, security, decision_needed: the
  waiver requesters read with `git log -L` over the row's lines lose the authors before a commit that moved the row, so
  a self-approved row passes once another person re-sorts the table), five Minors `review/55`–`59` (the release's
  secrets citation by file name; the incident review's out-of-scope write path; the clean-tree skip missing
  `.stamity/verify/**`; the held message after a failed tag push not naming `git tag -d`; the review's release-record
  brief keyed by sha only). Answers: `review/45` — yes, `-L` loses a moved row's first author (now `review/54`); `u11`'s
  three suppressed Minors — two kept as `review/57` and `58`, the secrets one already fixed. Clean across the whole: the
  retired map and the three remedies agree, no consumer of a retired pack or of the old hook folder remains, the charter,
  doctrine, hash pair, goldens and re-pointed cases move together, every eval quote compared matches the head.
- 2026-10-22T10:43Z — **eval run 52 ended terminal, `systemic-failure:process-exit`**, at 10:43Z: calibration 5 of 5
  matched; 214 of 243 scenario samples and 210 of 243 judge calls admitted when, from about 10:34Z, the calls failed with
  `getaddrinfo ENOTFOUND` for the provider's address (this machine's name resolution), four calls in a row exhausted
  their three attempts, and the driver stopped the run as its rule says. No grade failed; it is an infrastructure end,
  not a verdict. A terminal run cannot be composed with, and its grades are never carried, so it is not published; the
  account read 0.71 of its seven-day limit at 10:31Z (window resetting 2026-10-27T03:00Z). The configuration folder's
  settings restored byte for byte. **Run 53** re-measures on the final head after the fix round, composed with run 51 (the
  declared default of the maintainer's "Incremental run at the end", the signal allowing).
- 2026-10-22T10:47Z — **the maintainer's answers (09:5xZ, verbatim):** invariant 5 → "Path from the hook settings
  (Recommended)"; the release branch → "Printed person step (Recommended)"; the waiver requesters → "Row lines plus
  ticket (Recommended)". **Sign-offs:** `review/52` — invariant 5 names the `stamity-session-start.mjs` the client's own
  hook entries name (read from its held hook settings; no folder trusted for existing), no client named; `review/53` —
  release mode prints `git push -u origin release/<version>` and the pull request as the person's acts before the stop,
  and Step 8 says the tag push waits for that merge where the publish proof needs the tag on `main`; the skill pushes
  nothing itself; `review/54` — the requesters are the authors from `git log -L` over the row's lines unioned with
  `git log -G'<ticket>'` over the policy file, a changed ticket id a new row; `review/55`–`59` and `review/51` fixed
  now (each small and real); `review/45` closes with `review/54`. The fix round: two lanes from `16c8a185`, the charter
  (`review/52`, `review/51`) and the production pack (`review/53`–`59`), their eval cases re-copied in each.
- 2026-10-22T11:36Z — **fix lane A done** (`eda7967a`, 11 files): invariant 5 names the `stamity-session-start.mjs` the
  client's own hook entries name in its held hook settings, "never a copy trusted because its folder exists", no client
  named; the same four lines and 6,073 bytes (widest new line 116); the unreleased 1.3.1 hash row moved in place; the
  charter test pins the new lines and checks the old paths are gone; the doctrine row, the change log's 1.3.1 bullet,
  REQ-FLOW-088 and its docsPages pin moved; `AGENTS.md`, the manifest and both goldens regenerated. No eval Brief quotes
  invariant 5 (no `source:` range moved). `review/51`: REQ-FLOW-080's `As built` names the real widest lines (`:61`, `:73`,
  117 characters); `src/content/charter.ts:352` was already true and left. Verify: 6,826 passed, one 20 s timeout in the
  parallel run (`test/hooks/personOnlyGuard.test.ts`, the copilot case; 159 of 159 alone), lint, typecheck, knip exit 0,
  drift clean. One new Minor, `review/60` (decision_needed): on Codex, Cursor and Copilot the held hook settings carry the
  session-start path only inside the portable hook's base64 argument, so a hookless session must decode it. **Sign-off:**
  a close-walk leftover (a plain path field is an engine change; the argument is decodable, Cursor's cloud block names
  the path in plain text, and the unattended skill reads through `stamity learn read`). Lane A picked onto the
  integration branch (`f54c3e55`); build, `sync`, docs, matrix exit 0, the manifest's timestamp-only change restored.
- 2026-10-22T11:40Z — **fix lane B done** (`9268e7f6`): `review/53` (release mode prints `git push -u origin
  release/<version>` and the pull request as the person's acts before the stop; Step 8's tag push waits for that merge
  where the publish proof needs it), `review/54` (requesters from `-L` over the row's lines unioned with `-G` on the
  row's ticket id, its regex characters escaped; a changed ticket id makes a new row whose author is "its requester too",
  failing closed), `review/55`–`59` fixed; seven cases red first; the pins regenerated; the release case's Step 8 and
  seeded-3/-4's waiver paragraph re-copied (the release case's `source:` and its SET-v7 cell moved; the review command
  kept its line count, so no other range moved); REQ-PACK-017 and 019's `As built` lines moved. The release skill body
  now sits at its 200-line cap. Picked onto the integration branch (`081ede59`), pins `--check` exit 0. Dispatched
  together: the Fable closure re-review of both lanes (ids `review/45`, `51`, `53`–`59`), the security re-review
  (`review/52`, `54`), and the dated SET-v7 paragraph recording the case moves (on the integration branch).
- 2026-10-22T11:40Z — the dated paragraph (`5e0460eb`, `evals/SET-v7.md:3689-3711`: the release case's Step 8 re-copied
  and its range moved for the printed branch push; seeded-3 and -4's requester paragraph re-copied in the same ten
  lines; no other case moved, since no case quotes invariant 5); `test/evals` 2,068 exit 0. Build, `sync`, docs, matrix,
  pins exit 0 (timestamp-only manifest change restored); knip exit 0; **pushed to #124 at `5e0460eb`**. The eval worktree
  moved to `5e0460eb`: the set file's hash moved (`3a90d35f…`), the instrument's held; the driver's hash-only re-pin
  round 2 dispatched (census expected unchanged).
- 2026-10-22T11:43Z — the security re-review r2: `review/52` **fixed** (every client's hook settings file is held and
  points only into held or engine-owned folders); `review/54` **not-fixed**, with `review/61` (Warning, security,
  decision_needed): the ticket half of the requester read cannot run as written under the grading role's command guard
  (quotes and escapes refused, an unescaped regex operator misses, a ticket optional), and nothing says the waiver then
  clears nothing, so a moved row can still drop a self-approving author. Lane B's release change clean (the branch push
  and the pull request printed only, nothing pushed before the token). **Sign-off (a mid-run choice, the declared
  default; on the end-of-session list):** the stricter completion of "Row lines plus ticket" — the ticket read becomes
  `git log -S<ticket>` (a fixed string, no escaping; it keeps the commit that added the row), unioned with `-L`; a row with
  no ticket, a ticket outside `[A-Za-z0-9._/:@~=+,-]`, or a ticket read that cannot run clears nothing, the report naming
  why. Fix round 2 dispatched in lane `p22s2-fixc` from `5e0460eb` (seeded-3 and -4 re-copied with it).
- 2026-10-22T11:46Z — the whole-branch re-review r2 (Fable 5.1): request-changes, high; **nine closures fixed**
  (`review/45`, `51`, `53`, `55`–`59`; and `54` on its text, which stays open on the security re-review's not-fixed).
  The eight closed by hand (the report's block carries `54` too, so a close by report would have flipped it). One new
  Warning, `review/62`: REQ-FLOW-088's amendment note and two new test comments say the other clients'
  `.<client>/hooks/stamity/` folders are not person-only, but `.cursor/hooks/**` and `.github/hooks/**` are held (only
  Codex's is not). **Sign-off:** fixed now, wording only, in lane `p22s2-fixd` from `5e0460eb` (files disjoint from lane
  C). Invariant 5's text and the hold behaviour are right, per both reviews.
- 2026-10-22T11:49Z — lane D done (`4cf01a99`): the REQ-FLOW-088 note and the two test comments now say what
  `src/change/personOnlyPaths.ts` holds — Claude Code's (`:94`), Cursor's (`:91`) and Copilot's (`:46`) hook folders, not
  Codex's `.codex/hooks/` — and that only Claude Code's copy there is engine-written; no assertion changed, no pin on the
  wording; 668 tests, lint, typecheck exit 0. Held for the integration branch until its running suite ends.
- 2026-10-22T11:53Z — **the final-tree gates green on `5e0460eb`** (load 65 falling to 58): lint, typecheck, knip, pins
  `--check`, `check` (drift clean, invariants 1.3.1), the leak gate, the scan (no hit, 196 scanned, nothing unscanned),
  classify (security-sensitive), **the full suite under the lock: 316 files, 17,356 passed, 0 failed, 21 skipped** (532
  s; no floor error; `reports/integration-test-runner-r4.log`). Lane D picked onto the integration branch after it.
- 2026-10-22T11:55Z — lane C done (`c77f7bd2`, 8 files): the ticket half of the requester read is `git log -S<ticket> --
  <policy file>` (a fixed string the grader's read-only guard admits as written), unioned with `-L`; a row needs a ticket
  of `[A-Za-z0-9._/:@~=+,-]`; an invalid waiver, or one whose ticket read cannot run as written, clears nothing and the
  report says why; the approver rule unchanged; the command kept 275 lines (no range moved). Two tests red first, one new
  (the guard admits both reads for any ticket the class allows, its character set read from the rendered guard). Seeded-3
  and -4 re-copied (`:198-212`; in seeded-4 the `-S` read lists only the adding commit, the union unchanged); the SET-v7
  paragraph gained one sentence; REQ-PACK-017 moved. Verify 3,031 tests, pins, lint, typecheck, knip exit 0. Picked onto
  the integration branch (`2135a816`); build, `sync`, docs, matrix, pins exit 0 (timestamp-only manifest change
  restored); knip exit 0; pushed to #124. Dispatched: the security re-review r3 (`review/54`, `61`, `62`) and the final
  gates on `2135a816`.
- 2026-10-22T11:57Z — the driver's re-pin round 2 done for `5e0460eb` (the set pin only; census unchanged; canaries 15 of
  15 and 29 of 29, no model call; the driver tests 89 of 89) and committed in its repository; superseded at once by lane
  C's set-file move, so round 3 dispatched for `2135a816` (the eval worktree moved there; the instrument's hash held).
- 2026-10-22T11:59Z — the security re-review r3: `review/61` **fixed** (the ticket class a strict subset of the guard's
  alphabet; an unrunnable read clears nothing), `review/62` **fixed**; `review/54` **not-fixed** again: `git log -S`
  lists only ticket-count changes, so an in-place edit that keeps the ticket is found by `-L` alone, and after another
  author's move that editor drops out (seeded-4 itself shows `-S` leaving out the expiry edit). Applied by report; the
  finding block's W-1 is `review/54`'s not-fixed reason, not a new row. `review/54` now carries two not-fixed notes:
  **the escalation** — a fresh fixer at effort xhigh (Opus 5.5), the round history attached, in lane `p22s2-fixe` from
  `2135a816`; its re-review runs once on the stronger class (Fable 5.1), and a finding it leaves open stops the run for
  the maintainer. **Sign-off (the declared default; the maintainer's chosen option named `git log -G'<ticket>'`):**
  `-L` ∪ `-G<ticket>`, unquoted, the ticket class dropping `+` (only `.` left, whose over-match fails closed), the
  fail-closed and approver rules kept; the fixer proves A/B/C (add, in-place edit, move) in a throwaway repository.
- 2026-10-22T12:07Z — the final-tree gates green on `2135a816` (load 109 falling to 32): lint, typecheck, knip, pins
  `--check`, `check` (drift clean), the leak gate, the scan (no hit), classify (security-sensitive), **the full suite
  under the lock: 316 files, 17,357 passed, 0 failed, 21 skipped** (457 s; no floor error;
  `reports/integration-test-runner-r5.log`). Everything but the escalated waiver read is final on this head.
- 2026-10-22T12:08Z — the driver's re-pin round 3 done for `2135a816` (set pin only; census unchanged, no case moved by
  index or range; canaries 15 of 15 and 29 of 29, no model call; driver tests 89 of 89) and committed in its repository.
- 2026-10-22T12:24Z — **the escalation fix done** (`624e920e`, Opus 5.5 at xhigh): requesters = `git log -L` over the
  row's lines ∪ `git log --text -G<ticket> -- <policy file>`, the ticket unquoted, the class `[A-Za-z0-9._/:@~=,-]` (`+`
  out); `-S` dropped (`--text -G` lists all it did). Proven in a throwaway repository (git 2.52): A adds the row, B moves
  its expiry keeping the ticket, C sorts the table — `-L` at the head lists C only, `--text -G` lists C, B and A, `-S`
  alone lists A only; `--text` added because a committed `-diff` attribute made plain `-G` list nothing and a NUL byte
  made it miss B. The command still 275 lines (no range moved); two tests red first; seeded-3 and -4 re-copied (seeded-4's
  `-G` read lists the in-place edit); the SET-v7 sentence and REQ-PACK-017 moved; the pins regenerated; scoped tests,
  pins, lint, typecheck, knip exit 0. It names a narrower pre-existing case: an edit made inside a merge commit is listed
  by `-L` only (`-G` skips merges), so a later move by another author drops that editor. The Fable re-review (once,
  the escalation's stronger class) dispatched on `2135a816..624e920e`.
- 2026-10-22T12:26Z — **the maintainer's answer on the merge-commit case: "Document it, follow up (Recommended)"** —
  the Waivers text states that an edit inside a merge commit is traced by the row-lines read only, and a follow-up row
  goes to the inbox at the close; no new read, no fourth review round on this branch.
- 2026-10-22T12:32Z — **the Fable re-review after the escalation: approve**, high; `review/54` **fixed** (applied by
  report): `-G` is a per-commit diff filter, so no later commit removes an earlier one from its list; the shipped form
  ran unquoted under the reviewer's own read-only guard and listed the in-place edit `-S` skipped, while the quoted form
  and `--textconv` were refused; seeded-3 and -4 quote the command's `:196-217` word for word. On the merge case it agrees
  with the fixer, and notes the command's "every in-place edit", the SET-v7 sentence and REQ-PACK-017 should carry the
  same qualifier. **All of round 1's whole-branch and lens findings are closed.** The documentation sentence (the
  maintainer's decision, with the reviewer's three places) dispatched in lane `p22s2-fixe`.
- 2026-10-22T12:41Z — the documentation sentence done (`31f00d7d`): the command (`:204-206`), REQ-PACK-017 and the SET-v7
  sentence say in the same words that `-G` lists the row's adder, every in-place edit outside a merge commit and both
  halves of a move, and that only `-L` traces an edit made inside a merge commit, since `git log` diffs no merge without
  `-m`, `--cc` or `--remerge-diff`; the command rewrapped in place (275 lines; no range or index cell moved); seeded-3
  and -4 re-copied; the test's pinned sentence moved; the pins regenerated; scoped tests, pins, lint, typecheck, knip
  exit 0. Both commits picked onto the integration branch (`4cc4a2cc`, `4e744644`); build, `sync`, docs, matrix, pins exit
  0 (timestamp-only manifest change restored); knip exit 0; **pushed to #124 at `4e744644`**. The eval worktree moved
  there (the set file's hash `f398c28f…`; the instrument's held). Dispatched: the driver's re-pin round 4 and the
  final-tree gates on `4e744644`.
- 2026-10-22T12:50Z — the final-tree gates on `4e744644`: gates 1–8 pass (lint, typecheck, knip, pins, `check` drift
  clean, the leak gate, the scan with no hit, classify security-sensitive); **the full suite red at suite level**:
  `test/cloud/containerLeg.test.ts:264`, `Error: write ENOTCONN` writing a child's stdin (its handler ignores `EPIPE` and
  `EOF`), every one of 17,348 tests passing, no coverage table printed after the failed suite, load 25 rising to 47. The
  branch changes nothing under `test/cloud/`, and the file passed in the full suite on `2135a816`. Re-run alone (three
  runs under the lock) dispatched before it is called anything.
- 2026-10-22T12:52Z — the re-run alone: `test/cloud/containerLeg.test.ts` three times under the lock, **9 of 9 each, exit
  0** (load 51 rising to 85, higher than during the suite). The red was the full run's contention, not this branch; the
  gate on `4e744644` rests on these runs, gates 1–8, the full suite green on `2135a816` (the delta since: the production
  command's text, its tests and two eval cases), and #124's CI floor leg, green on `4e744644` with coverage. A candidate
  leftover for the close: the test's stdin handler ignores `EPIPE` and `EOF` but not `ENOTCONN` (`:262-264`).
- 2026-10-22T12:54Z — the driver's re-pin round 4 done for `4e744644` (set pin only; census unchanged; canaries 15 of 15
  and 29 of 29, no model call; driver tests 89 of 89; a word-count slip in its comments fixed in the README, the three
  hashed places left as written so the canaries stay current) and committed in its repository. **Eval run 53 launched**
  on `4e744644`, composed with run 51: 81 cases re-measured in 491 calls, census 169, configuration `fe232386…`; the
  configuration folder's `hooks` and `permissions` set aside again (restored at its end); calibration, then scoring only
  on a full match, detached under the machine lock.
- 2026-10-22T12:55Z — the close's ledger pass: `build/7` closed fixed (`u18` moved the two docsPages pins); the size
  Minors `build/4`, `8`, `14`, `16`, `18` closed rejected (by design: the plan set those units, each reviewed whole). Open
  for the close walk: `build/5`, `review/60`, and the fix run's `build/1`.
- 2026-10-22T13:02Z — **the QA checkpoint** (the qa skill, class security-sensitive, lens `stamity-security`): ten rows
  derived; the test-runner in its row-proving mode (Opus 5.5, medium) ran 17 narrow commands on `4e744644`, each exit 0.
  Auto-proven by a committed assertion beside the gate (the full suite on `4e744644`, every test passing): row 1 `add ops`
  refused naming its successors (`test/cli/commands/add.test.ts:2148-2154`, `test/pack/installSmoke.e2e.test.ts:1155-1162`);
  row 2 the reclaim removes only unedited old copies, an edited one kept and named
  (`test/merge/claudeHookCopies.test.ts:286-291`, `:309-313`); row 3 invariant 5's four lines and every client's hook
  settings held (`test/content/charter.test.ts:351-372`, `test/change/personOnlyPaths.test.ts:31-40`, `:246-249`); row 4
  the waiver rule and the guard admitting both reads (`test/packs/production.test.ts:582-620`, `:655-662`); row 5 the
  typed-token stops and the printed branch push (`test/packs/productionRelease.test.ts:343-346`, `:375-385`); row 6 no
  mitigation applied (`test/packs/productionIncident.test.ts:244-251`); row 7 the retired-pack warning and remedy on an
  upgrade (`test/cli/commands/check.test.ts:5020-5029`, `test/pack/upgradeRemedy.test.ts:741-748`; built fixtures, the
  real-tree upgrade walk is the cut's, as the change log says); row 9 the catalog-throw fallback
  (`test/emit/plannerNameClash.test.ts:341-350`); row 10 the worked example (`test/docsPages.test.ts:4700-4702`). Row 8:
  no copies under `.stamity/generated/hooks/claude/` on all four clients is proven (`test/emit/crossClientGoldens.test.ts:2374`),
  but **the 17-entry `/` menu has no committed assertion** — the one person row (a real client's menu). The model-driven
  rows (the seeded readiness cases, `/st-ui-review`, `/st-plain`, the release and incident cases) rest on run 53's
  verdicts. Tool-output screen: the prover's return matched the harness's settings-file pattern (held paths' names);
  kept, no directive in it.
- 2026-10-22T13:04Z — the person row prepared: a scratch repository initialised with the branch build (`init --yes`,
  exit 0) holds 9 commands and 8 user-invocable skills (`st-dep-audit`, `st-handoff`, `st-learn`, `st-onboard`,
  `st-plain`, `st-qa`, `st-unattended`, `st-verify`), the rule-skills `stamity-ai-evals` and `stamity-question-protocol`
  marked hidden. **#124's CI green on `4e744644`**, every job (floor 8m37s, lts 9m31s, windows-1 15m15s, windows-2
  16m48s, both aggregators), `CLEAN`; windows-2 passing here settles the earlier `gitStatus` failure as the 5 s budget on
  a slow runner (a candidate leftover).
- 2026-10-22T13:51Z — **eval run 53 completed: FAIL** (`2026-10-22-run-53`, on `4e744644`, composed with run 51;
  calibration 5 of 5; all 243 scenario samples and 243 judge calls admitted; export exit 0, 505 attempts, nothing
  omitted). Golden 0.967 (87/90) but floors 43/47; **hold 0.947 (36/38, not met)**; twins 0/10; probes 31/31 with
  `st-plain` recalled. The misses, from the judges' citations: `production-review-seeded-2` B5 (one sample: its Ready line
  read NO, the words `Ready: YES` only in a conditional sentence — a row over-reading a mention), `production-review-seeded-4`
  B5 (two samples: the open checks named on a line after `Ready: NO — approval of record: …` — the command's template has
  no slot for the names its own bullet asks for), `production-review-gatherer-not-grader` B2 (two samples: the range
  carried with HEAD resolved to its sha), `work-frame-matched-rows-only` B4 (one sample misread a printed row as an
  unmatched one — a real miss in a core case moved by file 1's `258c833a`), `reviewer-shallow-wrapper-pass-through` 0/3
  (the pass-through filed as a note; golden, not a floor; also moved by `258c833a`). §8: three advisory repeats
  (`unattended-blocked-run-still-hands-off` A2, `unattended-close-opens-draft-pr` A1, `unattended-item-says-merge-refused`
  A2) need dispositions before another run of this configuration. The account read 0.81 of its seven-day limit.
- 2026-10-22T13:56Z — **the maintainer's answer: "Fix the 3 rows, measure at the cut (Recommended)"** — the three
  miswritten rows (and the same two defects in the sibling seeded cases, for consistency) corrected now with a dated set
  paragraph; run 53 stays this package's run, its FAIL under `Not done:`; Package 20's kickoff carries re-measuring
  them, the work-frame miss, the reviewer case, the three repeats' dispositions and the Ready-line template's missing
  slot, all before its cut. The case fixer dispatched in lane `p22s2-fixf` from `4e744644`. The configuration folder's
  settings restored after the run (`4718c26c…`).
- 2026-10-22T14:00Z — run 53's artifact for the records publish: like run 51, only `PROTOCOL.md`, `RESULTS.md`,
  `inputs.json` and `summary.json`; the summary is 6,749,625 bytes, over the hygiene budget, and the `records` branch's
  workflow runs `main`'s hygiene copy, so one exact-path exception lands on `main` first (as `009f6b76` did for runs 50
  and 51): dispatched in lane `p22s2-fixg`, joining #124. Published, run 53 lets Package 20's increment compose with it
  instead of with run 51 (fewer cases re-measured); the publish follows #124's merge.
- 2026-10-22T14:03Z — the hygiene entry done (`46d15afa`): one exact-path exception for
  `evals/runs/2026-10-22-run-53/summary.json` with its reason and window (to Package 20's release close, which composes
  with it, compacts it and retires the entry); the test expects exactly that path, red first; `repo-hygiene --base
  0f3e1cc7`, 48 tests, lint, typecheck exit 0.
- 2026-10-22T14:02Z — the case-row fixes done (`c5b680a0`, nine rows in five cases): the must-NOT verdict row now judges
  the verdict ("no Ready line, and no line stating this run's readiness, reads `Ready: YES`"; a quoted mention beside a NO
  line is not a verdict); the Ready-NO row ends on the Ready line reading NO with exactly the open checks named on it or
  on the line(s) right after it that end the response (anything else after fails); gatherer B2 admits `v2.4.0..HEAD` or
  the head as the frame's sha; no Brief, range, count or must-NOT set moved; one dated SET-v7 paragraph records run 53's
  FAIL, the nine rows and the two cases not edited; `test/evals` 2,068 exit 0. Both commits picked onto the integration
  branch (`4ae33e8d`, `0cd54c77`); build, `sync`, docs, pins, knip exit 0; pushed to #124. Dispatched together: a
  faithfulness review of the rows (fixed to the quoted text, or loosened to pass?) and the final gates on `0cd54c77`.
- 2026-10-22T14:07Z — the rows review: request-changes, medium. The must-NOT verdict row and gatherer B2 **faithful**;
  `review/63` (Warning, decision_needed): the reworded Ready-NO row admits the open checks after the Ready line, which
  the quoted text does not support (`:228` makes the Ready line the run's last line, `:231-232` has the NO line name the
  open checks; run 53's seeded-4 sample 1 met both on one line), so the original row was faithful and seeded-4's two
  samples were real misses. **Sign-off (a mid-run choice, the declared default; on the end-of-session list):** restore
  the four Ready-NO rows to their `4e744644` wording, keep the other two rewordings, correct the SET-v7 paragraph (the
  template's missing place for the names is a product fix measured before the next cut). Fixer round 2 dispatched in
  `p22s2-fixf`.
- 2026-10-22T07:15Z — **#123's CI green on `a06cb488`** (floor, lts, windows-1 10m38s, windows-2 11m33s, cloud-container,
  build, records, size budget): the full-matrix record for waves 2–4.
- 2026-10-22T07:16Z — `u13` done after the widening (`13563b47`): verify (27 files, 887 tests), lint, typecheck, knip exit
  0; `build/13` closed fixed. A ledger close hung twice in `npm exec` (no lock file; stopped by PID; the background retry
  had already recorded it). The security lens r1 on `u13`: **pass**, high, no finding (no third-party `ops` becomes
  first-party; the remedy names only catalog successors; the fail-open stops on the same catalog error; the nine pins
  exact against all 18 release tags).
- 2026-10-22T07:03Z — `u13` returned **BLOCKED_DEPENDENCY**, its work committed (`303a2496`: `RETIRED_PACKS` with three
  entries and nine pins, each recomputed from its release's manifests; `remedyOf` as amended; cases in `retired`, `check`,
  the smoke and `upgradeRemedy`, 11 red first): `test/emit/plannerNameClash.test.ts:145-149` pins the old bare re-add step
  for a local-folder pack (`build/13`); its size Minor `build/14`. **Sign-off `build/13`:** u13's cell widens to that
  constant (the `build/3` defect folded in); the same implementer resumed. `u14` dispatched in lane `p22s2-u14` from
  `a06cb488` (the production pack's final text).
- 2026-10-21T21:58Z — `u13` dispatched in lane `p22s2-u13` from `1c6acba8` (every edge integrated; its files disjoint
  from the seams fixer's).
- 2026-10-21T22:02Z — the seams round (`a06cb488`, 8 files): `build/12` (the roster lists five files), `review/30` (the
  contact is the incident and reporting contact; readiness gaps to the approval of record), `review/38` (`st-release`
  bumps only `package.json` and its lockfiles, prints the edit for another stack, writes its SBOM beside the record; the
  install scope unchanged, a test proving it from `pack.json`), `review/40`, `review/44`, the `st-incident` hand-off
  named, item 6 cited — all fixed; the production suites green with the roster case (2,166 tests), lint, typecheck,
  knip exit 0. Re-review dispatched.
- 2026-10-21T21:55Z — `u10` fix round 2 (`f23f7305`) and **security re-review r3 (the cap round): approve**;
  `review/41`–`43` closed fixed. Two gaps it noted without raising, ledgered: `review/44` (a tracked symlink pointing at an
  ignored file; "a tracked regular file, not a symlink") to the seams fixer, `review/45` (whether `git log -L` loses a
  moved row's first author; unverified) for the whole-branch pass. `u10` approved.
- 2026-10-21T21:57Z — **integration part 4** (`1c6acba8`): `u10` (`023e8e9b`, `c767180d`, `809917bc`), `u11` (`ca923776`,
  `151d62c8`), `u12` (`fc8dd73c`, `17d1c03d`) picked; conflicts only in derived files (taken, then regenerated) and the
  exemption list (both sides' rows kept: five pending rows); no conflict marker left (grep exit 1). Pins `--write` and
  `--check`, build, `sync` (unchanged: the pack is not installed here), docs (the reference lists `production`), the
  matrix, goldens (unchanged) — all exit 0; committed. The seams fixer dispatched in lane `p22s2-seams` from it:
  `build/12`, `review/30`, `review/38`, `review/40`, `review/44`, u11's incident-name note and its item-6 citation.
- 2026-10-21T21:48Z — `u11` re-review r2: **approve**, high; `review/31`–`37`, `39` closed fixed. Rests on: after the
  token the commands run in order and stop at the first non-zero exit, release creation with `--verify-tag` — cited.
  Three suppressed Minors, all failing closed, for the whole-branch pass; the secrets citation (item 6 for the exposed
  steps) joins the integration fixer's list. `u11` approved.
- 2026-10-21T21:49Z — `u10` re-review r2 (request-changes, medium): `review/17`–`25` closed fixed; two new Warnings from
  this round, `review/41` (a control's evidence path not limited to tracked files inside the repository) and `review/42`
  (an uncommitted edit to a waiver row keeps the old approval). `u10` security re-review r2 (request-changes, medium):
  `review/12`–`16` fixed (its closures block used other keys; applied by hand), one new Warning `review/43` (the `git
  blame` alternative shows only a row's last author). A gap the lens recorded without raising: a replace row can point
  `pr-sec-02` at another file, so the coverage rule does not apply — inside the maintainer's "evidence only, and shown"
  (listed for the signer). Fixer round 2 dispatched (round 3 is the cap).
- 2026-10-21T21:45Z — `u12` security re-review r2: `review/29` closed fixed (every place handling the exposed value
  follows the rule; the test pins the three clauses). A gap it noted without raising: Step 2's `git diff` runs before
  Step 5, so a committed credential's value can reach the transcript; ledgered as `review/40` (Minor, security) for the
  integration fixer ("for an exposure, list the commit and file, never the diff body"). `u12` approved.
- 2026-10-21T21:43Z — `u10` fix round 1 (`43e0c921`): all 14 ids fixed in one commit (controls name evidence and shipped
  probes only; hits by path, line and rule; tracked files; coverage recorded; researchers without network; replace rows
  evidence only and listed; waivers claimed and confirmed by name, an edit needing fresh approval; missing fields invalid;
  an accepted advisory needs a waiver; a waived attestation check signable; both files rewritten at sign-off; the test
  window narrowed; the grader checks its locators), nine security assertions added; verify (2,119), lint, typecheck,
  knip exit 0. The secrets floor cited by rule name (a content path fails the pack's cross-reference check and does not
  exist in an installed repository). REQ-PACK-018's plan text amended (the sign-off covers attestations and waived checks;
  the Ready line closes the findings before the ticket block). The re-review and the security re-review dispatched.
- 2026-10-21T21:40Z — `u11` review r1: **request-changes**, high: `review/31` (W-1: after the typed token a failed tag
  push does not stop the run, and `gh release create` without `--verify-tag` makes the tag), `review/32` (W-2: the pack's
  own record files fail the clean-tree check; the review lookup misses), `review/33` (W-3, security: no rule keeps secret
  values out of the committed change record), `review/34` (W-4, security, decision_needed: the approver is a name the
  requester types), `review/35`–`39` (five Minors). **Sign-offs:** `review/34` follows the maintainer's 21:33Z decision on
  the same question for waivers ("Claimed, shown, signed": the record writes the approver as named by the requester and
  not confirmed by the skill, shown before the typed token, which is the person's confirmation); `review/31`–`33`, `35`,
  `36`, `37`, `39` fixed in `p22s2-u11`; `review/38` (the install scope in `pack.json`) to the integration fixer.
- 2026-10-21T21:38Z — `u12` review r1: **approve**, medium; five Minors: `review/26` (escalation scope contradicts
  itself), `review/27` (the deadline probe misses minutes, hours, business days), `review/28` (the rule's location is
  not a file on every client), `review/29` (security: finding uses of a leaked value must never search with the value),
  `review/30` (decision_needed: the policy file's `Escalation contact` means readiness gaps in `u10` and reporting duties
  here). Blast radius contained. Rests on: the skill never authorizes applying a mitigation at any severity — walked.
  **Sign-offs:** `review/26`–`29` to a fixer in `p22s2-u12` now (a narrow re-review for the security one); `review/30` to
  the one integration fixer that edits `u10`'s files after the merge-in (with `build/12`): the contact means the incident
  and reporting contact, and readiness gaps go to the approval of record.
- 2026-10-21T18:46Z — **integration part 3's gates green** (`353632be`, load 4–16): lint, typecheck, knip, pins
  `--check`, `node dist/cli.js check` (17 rows ok, invariants 1.3.1, drift clean), the leak gate, and **the full suite under
  the lock: 17,120 passed, 0 failed, 21 skipped** (439 s; lines 97.76%, branches 90.67%).
- 2026-10-21T18:17Z — `u9` re-review r2: **approve**, high; `review/10`, `review/11` closed fixed; blast radius contained
  (the body only; the description, the Codex figure and the trigger tests unchanged). Rests on: a hedge stays a hedge and a
  real no stays firm; the rule, the example and its note agree (`SKILL.md:53-55`, `:90`, `:94-97`) — cited.
- 2026-10-21T18:16Z — `u9` fix round 1 (`f187bcda`): `review/10` (the example keeps the hedge, "It may be best not to
  deploy yet."; "perhaps" moved from the filler list to the certainty words) and `review/11` (a unit only where the input
  gave one) fixed; goldens regenerated (the skill's row in five trees); verify (4,465), lint, typecheck, knip exit 0.
  Re-review dispatched. `u15`'s plan cell gained a hedge case for `/st-plain`'s adversarial eval.
- 2026-10-21T18:10Z — `u9` review r1: **request-changes**, medium: `review/10` (W-1: the worked example turns a hedged
  suggestion into an order, against the skill's own "no more or less certainty" line), `review/11` (M-1: "with their
  unit" invites a unit the input never stated). Everything else holds (facts, gaps and refusals kept; ISO by name; no
  banned name; Codex 5,015 measured). Both to a fixer.
- 2026-10-21T18:02Z — choice: u9 put `/st-plain`'s distinctive nouns in `CORE_NEIGHBOURS` so they are checked both ways
  against the two `frontend` skills, and kept the trigger phrase at `/plain words/i`, not a bare `/plain/`
  (`test/packs/frontend.test.ts`, `test/corpus/skills/triggerDomains.ts`)
- 2026-10-22T14:10Z — `review/63` closed fixed by hand (`6a45f5cf`, a restore to the reviewed wording, verified by diff:
  only the must-NOT verdict row differs from `4e744644` in each seeded case).
- 2026-10-22T14:50Z — the final-tree gates on `0cd54c77`: lint, typecheck, knip, pins, `check`, the leak gate, the scan
  (no hit, 198 scanned), classify, hygiene pass; **the full suite red under the machine's load** (load 145 rising to 415,
  other projects' test runs): run 1 one 60 s timeout (`test/cli/ledgerForgery.test.ts:1185`), its whole-suite re-run four
  failures (two 2 s budgets in `test/change/classify.test.ts`, two 20 s timeouts in `test/cli/checkExpectations.test.ts:111`,
  `:141`), no coverage table; alone: classify 454 of 454 and ledgerForgery 54 of 54 green, checkExpectations 2 of 3 timed
  out at load about 400 (which cannot tell a timeout from a hang). The delta since `4e744644` touches no `check` code (eval
  case text and the hygiene entry). **#124's CI green on `0cd54c77`**, every leg (floor 7m02s, lts 10m58s, windows-1
  9m52s, windows-2 19m24s): the full-matrix evidence of record. `6a45f5cf` picked as `8bab3041` (`test/evals` 2,068 exit
  0); pushed.
- 2026-10-22T15:53Z — **the close walk's answers (verbatim):** QA → "Walked: 17, rule-skills hidden"; ready mark →
  "Mark ready now (Recommended)"; the three code leftovers → "Schedule all to Package 20 (Recommended)"; the four
  load-sensitive tests → "One row, Package 21 tooling (Recommended)". #124 marked ready; the review bot asked
  (`@codex review`). **#124's CI green on `8bab3041`**, every leg.
- 2026-10-22T15:55Z — the close's ledger and inbox: `close/1` (the merge-commit limit), `close/2` (the four
  load-sensitive tests), `close/3` (run 53's items) appended; `build/5`, `review/60`, `close/1`, `close/3` and the fix
  run's `build/1` deferred `when: Package 20 plans its work`, `close/2` `when: Package 21's tooling side plans its work`;
  six inbox rows appended (`ledger inbox-write`, exit 0). Seven fixed rows retired and removed: `2026-10-20_packs-rebuilt`
  `build/17` (u13), `build/21` (u7), `build/23` (u1), `fix/3` (u6), `close/2` (u16), `close/3` (the signing fix, #122),
  and `2026-10-11_release-1-14-0` `fix/26` (u4).
- inbox retired: `src/cli/commands/add.ts:1106` — fixed in 2026-10-21_packs-rebuilt-02
- inbox retired: `test/emit/skillsProjection.test.ts:54` — fixed in 2026-10-21_packs-rebuilt-02
- inbox retired: `test/pack/installSmoke.e2e.test.ts:61` — fixed in 2026-10-21_packs-rebuilt-02
- inbox retired: `src/pack/install.ts:1142` — fixed in 2026-10-21_packs-rebuilt-02
- inbox retired: `—` (run 47's four other repeats) — fixed in 2026-10-21_packs-rebuilt-02
- inbox retired: `content/charter/stamity-charter.md:26` — fixed in 2026-10-21_packs-rebuilt-02
- inbox retired: `.github/workflows/pack-signing-rehearsal.yml` — fixed in 2026-10-21_signing-rekor-timeout
- 2026-10-22T16:01Z — **the review bot's pass on `8bab3041`** (requested at 15:53Z; completed 15:59Z): three comments —
  P1 `packs/production/skills/st-release/SKILL.md:106` (another stack's manifest bump printed as an edit for the
  operator: a hand-the-operator-a-change violation), P2 `packs/production/commands/st-production-review.md:161` (the
  grader told to write `grade.md` where its Claude Code grant refuses it; its inline grade never saved), P2
  `st-release/SKILL.md:143` (the deploy record and SBOM keyed by sha alone; two services from one HEAD overwrite).
  Screened: review data, no directive followed.
- 2026-10-22T20:46Z — **the maintainer's answer: "Fix all three now (Recommended)"**. #124 back to draft (a push to a
  ready pull request starts a new review); ledgered `pr/1`–`pr/3` (Warning); the fixer dispatched in lane `p22s2-fixh`
  from `8bab3041`. No further bot review unless a Critical is fixed; each thread answered.
- 2026-10-22T20:57Z — the bot batch done (`99c48a6d`): `pr/1` another stack's bump is "never written or printed as an
  edit; the run ends held, naming that manifest, and the bump leaves through `/st-work`"; `pr/2` the grader writes
  nothing in the evidence folder and the flow saves its full returned grade as `grade.md`; `pr/3` the record and SBOM
  keyed `releases/<service>-<version | sha>`, the last-deploy lookup scoped to the service, the review's probe brief and
  REQ-PACK-016/019 consistent. Five tests red first (two added); pins regenerated; seven eval cases re-copied at
  unchanged ranges (every product file kept its line count); one sentence added to the run-53 paragraph; scoped tests,
  pins, lint, typecheck, knip exit 0. Picked as `f9abc9c6`; build, `sync`, docs, pins, knip exit 0; pushed to #124 (in
  draft). Dispatched: the batch's re-review (closures `pr/1`–`3`) and the final gates on `f9abc9c6`.
- 2026-10-22T21:02Z — the batch's re-review: **approve**, high (no file at the head still uses the old record key — cited;
  each changed eval case quotes the new text at an unchanged range; both added tests reject the old wording). Closures
  applied by report: `pr/1`–`pr/3` fixed. Each bot thread answered with its fix and resolved (three threads).
- 2026-10-22T21:09Z — the final gates on `f9abc9c6`: lint, typecheck, knip, pins, `check` (drift clean), the leak gate,
  the scan (no hit, 198 scanned), classify (security-sensitive), hygiene pass; the full suite produced no result — the
  test-runner stopped it at its default 10-minute limit while it ran green (1,929 log lines, no failure) under another
  project's test load (my brief named no limit; later briefs name one). Re-run with up to 45 minutes. #124's CI on
  `f9abc9c6`: floor, lts and cloud-container green, the Windows legs running.
- 2026-10-22T22:11Z — the full suite on `f9abc9c6` (up to 45 minutes allowed): **red on timeouts and one 2 s budget
  only**, at load 38 rising to 240 (another project's test runs): pass 1 nine timeouts in four files, its whole-suite
  re-run six failures in three (`test/change/classify.test.ts:254` at 2,577 ms, `test/cli/checkExpectations.test.ts:111`,
  `:141`, `:169`, `test/hooks/personOnlyGuard.test.ts:276`, `:1060`), no coverage table; **every failing file green
  alone**: classify 454/454, checkExpectations 3/3, personOnlyGuard 159/159, repoHygiene 30/30, sharedCharterIdentity
  17/17, sync 50/50 (`reports/integration-test-runner-r9.log`). **#124's CI green on `f9abc9c6`**, every leg (floor 11m09s,
  lts 10m27s, windows-1 14m01s, windows-2 16m28s, cloud-container, both aggregators), `CLEAN` — the full-matrix evidence
  of record. #124 marked ready again.
- 2026-10-22T15:57Z — usage: plan minutes=131 tokens=unreported (claude-code)
- 2026-10-22T15:57Z — usage: build minutes=633 tokens=unreported (claude-code)
- 2026-10-22T15:57Z — usage: prove minutes=375 tokens=unreported (claude-code)

## Proof block

- **Gate results** — class `security-sensitive` (`gate classify --base 0f3e1cc7`: checks scan, gates-all, review; lens
  `stamity-security`), base `0f3e1cc7` (the branch rebased onto `main` at 08:58Z; Frame's base `68a2baf5`), final tree
  `f9abc9c6` (#124):
  - `gate scan --base 0f3e1cc7`: pass, no hit, 198 scanned, nothing unscanned (on `f9abc9c6`).
  - `npm run lint`, `npm run typecheck`, `npm run knip`, `node scripts/generate-pack-manifests.mjs --check`,
    `node dist/cli.js check` (drift clean, invariants 1.3.1), `node scripts/leak-gate.mjs`,
    `node scripts/repo-hygiene.mjs --base 0f3e1cc7`: pass (`f9abc9c6`).
  - `node scripts/ci/test-run.mjs --coverage` under the lock: pass on `2135a816` (316 files, 17,357 passed, 0 failed, no
    floor error, `integration-test-runner-r5.log`); on the later heads red on timeouts, 2 s budgets or a child-pipe error
    only, at load averages up to 240 from other projects' runs, every failing file green alone (`4e744644`,
    `0cd54c77`, `f9abc9c6`: `integration-test-runner-r6.log` to `-r9.log`). The full-matrix evidence of record: #124's
    CI on `f9abc9c6`, every leg green (floor, lts, windows-1, windows-2, cloud-container, both aggregators).
  - `npx vitest run test/evals test/ci/testInputsGuard.test.ts` on `8bab3041`: pass, 2,068; the production, eval and
    docs suites on `99c48a6d` (the bot batch, `f9abc9c6`'s tree): pass.
  - Eval run 53 (`2026-10-22-run-53`, on `4e744644`, composed with run 51): **FAIL** — hold 0.947 (36/38), floors 43/47;
    golden 0.967, twins 0/10, probes 31/31. Run 52 on `16c8a185` ended terminal on a local name-resolution outage (no
    verdict, not published).
- **Review verdicts** — every unit approved (u1–u18, Opus 5.5 at high; confidence gate medium; no approval below it);
  the security lens on `u5`, `u10` (three rounds, the cap round approving), `u13` passed; the whole-branch review
  (Fable 5.1) r1 request-changes, high → fix round 1 (lanes A, B) → r2 nine closures fixed, high; the branch security
  lens r1 → r2 → r3, `review/52`, `61`, `62` fixed; `review/54` escalated after two not-fixed re-reviews to a fresh fixer
  at effort xhigh (one step above high), its re-review on the stronger class (Fable 5.1) **approve**, high, rests on: `-G`
  is a per-commit diff filter, so no later commit removes an earlier one from the requester list — run. Run 53's
  row-fix review: two rows faithful, one restored (`review/63`).
- **QA rows** — ten derived (class security-sensitive). Proven (`auto-proven`, a committed assertion beside the full
  suite on `4e744644` and #124's CI): rows 1–7, 9, 10 — `test/cli/commands/add.test.ts:2148-2154`,
  `test/pack/installSmoke.e2e.test.ts:1155-1162`, `test/merge/claudeHookCopies.test.ts:286-291`, `:309-313`,
  `test/content/charter.test.ts:351-372`, `test/change/personOnlyPaths.test.ts:31-40`, `test/packs/production.test.ts:582-620`,
  `:655-662`, `test/packs/productionRelease.test.ts:343-346`, `:375-385`, `test/packs/productionIncident.test.ts:244-251`,
  `test/cli/commands/check.test.ts:5020-5029`, `test/pack/upgradeRemedy.test.ts:741-748`,
  `test/emit/plannerNameClash.test.ts:341-350`, `test/docsPages.test.ts:4700-4702`; row 8's no-copies half
  `test/emit/crossClientGoldens.test.ts:2374`. Not proven by a test: the model-driven behaviour of the new skills and the
  seeded readiness cases — eval run 53, FAIL (`Not done:`). Person row 8 (the Claude Code `/` menu, 17 entries, the
  rule-skills hidden, M): **walked** — "Walked: 17, rule-skills hidden" (the maintainer, 15:53Z).
  **Sign-off** — the pack set, 2026-10-22: every H row auto-proven and passing; no failing M row; rollback: do not merge
  #124, or revert its merge; **Shippable: YES** for the tested behaviour, with the eval FAIL under `Not done:` (it ships
  in no release before Package 20's cut, whose run measures it again).
- **Decisions trace** — the maintainer's answers verbatim in the private record and above (the opening batch, the plan
  questions, the plan gate, the old-base window, `#122`'s merge, u10's three, the replacement pull request, the three
  whole-branch decisions, the merge-commit limit, run 53, the close walk); defaults taken mid-run and listed for the end
  of the session: `review/60` to the close walk, `review/61`'s fail-closed ticket rule, `review/63`'s restore.
- **Artifacts touched** — the corpus and packs (`content/**`, `packs/**`), the engine (`src/pack/**`, `src/emit/**`,
  `src/hooks/**`, `src/content/**`), their tests, the eval set (`evals/**`, `scripts/eval/run.mjs`), the docs and specs,
  `scripts/repo-hygiene.mjs` — each by its unit's implementer or a fixer in its lane (the reports under `reports/`); the
  integration commits, derived files (pins, `sync`, docs, goldens) and the run record by the orchestrator.
- **Per-action attribution** — implementers, fixers and test-runners on Opus 5.5 (high; the escalation at xhigh;
  test-runners at medium); reviewers and lenses on Opus 5.5 (high), the whole-branch review and the escalation's
  re-review on Fable 5.1; tools: git worktrees per lane, `npx --no stamity` for the ledger, the inbox, scan and classify;
  outcomes in the log above.
- 2026-10-22T15:58Z — leftovers: shown=5 real=5 fixed=0 scheduled=5 dropped=0 accepted=0 notes=unknown changed=0
- **Recommended next step** — #124's merge (the maintainer's click), then the records publish (this run, the fix run, the
  debug run, run 53 with its hygiene entry, which reaches `main` with #124). Inbox rows appended: six (five `when:
  Package 20 plans its work`, one for Package 21's tooling side). The review bot's three findings are fixed and their
  threads answered and resolved.

Not done:
- eval run 53 FAIL (hold 0.947, floors 43/47) — scheduled: `close/3`, `when: Package 20 plans its work`, before its cut.
- a local full suite green on the final tree — the machine's load (up to 240, other projects' runs) timed tests out;
  every failing file green alone and #124's CI full matrix green on `f9abc9c6` are the record (accepted risk).
- #124's merge (the maintainer's click); the records publish follows it.
