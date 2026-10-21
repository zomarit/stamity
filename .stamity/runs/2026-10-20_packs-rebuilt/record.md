# Run 2026-10-20_packs-rebuilt — the packs rebuilt, file 1: the engine and the core line (Package 22)

Status: closed 2026-10-21
Mode: attended
Branch: feat/packs-rebuilt-01
Plan: docs/plans/018-packs-rebuilt-01.md
Base: b4c8235464e863b7222dd48adfd288289e49cffe
Invocation: /st-work docs/plans/018-packs-rebuilt-01.md — Package 22 file 1, one run on its own branch feat/packs-rebuilt-01 cut from main, one draft pull request into main. Unattended in practice (the maintainer is away and answered every opening question in advance with "defaults"; recommended options are taken and recorded), not Stamity's own unattended mode: the record reads Mode: attended. The plan gate passes once a plan review approves. Every full suite and any eval run under the machine lock. Every merge, tag, publish and repository-setting change is held for the maintainer.
Intensity: deep
Confidence gate: medium
Review cap: 3

## Frame

**Outcome.** One draft pull request into `main` that carries plan 018's first file: a pack catalog read from the packs
folder, a retired-names map, a fit check and a same-class name check at `add`, two `check` rows, the frontmatter
pass-through, the `frontend` pack holding the two UI skills with a pruning proof for their old copies, the eval surface
over `packs/**`, a generic per-pack suite and lint, the three habits and the blast-radius section, the 14 advisory
dispositions, the five inbox rows routed here, and the merged spec delta with the new packs spec at `status: design`.

- In scope: the 19 units of `docs/plans/018-packs-rebuilt-01.md`, its spec delta, and the inbox rows its table settles.
- Out of scope: plan 018 file 2 (`production`, `/st-ui-review`, `/st-plain`, the charter edit, the old packs'
  retirement); any eval run; the merge into `main`; any release, tag, publish or repository setting.

**Intensity: deep** — public contracts (the pack catalog, `add`'s refusals, `check`'s rows, the emitted skill heads,
the pull-request body), one security-sensitive unit (`u12`, `sync`'s whole-file deletes), a diff far past one unit.

**Model plan and cost preview.** Every builder and check on Opus 5.5 (`opus`, effort `high`; research at `medium`), the
whole-branch review on Fable 5.1, per the maintainer's standing model rule, which overrides the client map's lighter
classes for the researcher, fixer and test-runner roles.

| Phase | Role | Class | Count (about) |
|---|---|---|---|
| Plan | researcher ×6, spec-author ×1, plan reviewer | advanced | 9 |
| Build | implementer | advanced | 19 |
| Prove | reviewer per unit and re-reviews, security lens (`u12`), fixer | advanced | 40–55 |
| Prove | test-runner (each wave's integration suite, under the machine lock) | advanced | 6–8 |
| Prove | whole-branch review | frontier (Fable 5.1) | 1–2 |

Rough cost: about $400–650 at list price.

**Deferral inbox.** `stamity ledger inbox --plan docs/plans/018-packs-rebuilt-01.md --paths <the plan's files>` at
23:30Z: 237 rows, 70 matched by path, 167 unmatched, 0 unparsed, 0 skipped. Every match is settled by the plan's table
(folded into a unit, or left with its reason); none is asked about.

**Freshness guard.** The plan is stamped at `b4c82354`, the run's base; fresh.

**Build isolation.** Operator-prepared worktree lanes under the sibling folder `.stamity-worktrees/stamity/`, one per
unit (`p22-<unit>`), each on its own branch from the integration head with `node_modules` linked; lanes run their own
`verify` only and regenerate no derived file; integration, every derived file and each wave's full suite happen in the
integration worktree `p22-int` on `feat/packs-rebuilt-01`, never in the main checkout, which stays on `main`.

## Blast radius

From the whole-branch review's approval, round 2 (`reports/branch-reviewer-r2.md`, 2026-10-21T04:43Z):

- **blast radius:** moderate. A regression reaches every setup upgrading from 1.16.0 or earlier at its first `sync`
  (whole-file deletes under `.claude/skills/` and `.agents/skills/`), every `add` of a third-party pack shipping a
  skill, and every command deriving the bundled catalog when the packs root holds a link. A repository with no
  installed pack and no moved-skill copy plans byte-identically to before. Contained to the pack, catalog and
  moved-skill paths.
- **rests on:** the first `sync` after an upgrade deletes a client copy of a moved skill only when its bytes hash to
  both the ledger row's hash and a frozen 1.16.0 digest at exactly `<folder>/st-<id>/<file>` (proven by
  `movedPrune.test.ts`'s forged-row and symlinked-folder cases); `add` refuses the pack-skill head `sync` would refuse
  (`packEngineDefects.test.ts` group F, through the command); the documented upgrade order is walked through `add`,
  `sync`, `add`, `sync`, `sync` in one case. Proven by reading in the review, and by those tests in the final-tree suite.

## Plan

`docs/plans/018-packs-rebuilt-01.md` was written under `/st-plan`'s discipline, this session its one writer.

- 2026-10-20T23:00Z–23:27Z Six read-only researchers (Opus 5.5, effort medium) against `main` at `b4c82354`: the pack
  engine; skill frontmatter and menu visibility per client (`+web`); the two UI skills' move; `/st-work`'s room and the
  three habits with the blast-radius section; the 14 advisory dispositions; the pack test infrastructure; the five
  inbox rows that come back for this package.
- 2026-10-20T23:27Z–23:40Z The plan, 19 units (`u0`–`u18`) in six waves, written from the returns; a spec-author's
  drafted delta merged (REQ-PACK-001 to REQ-PACK-014 for the new packs spec; REQ-FLOW-125 to REQ-FLOW-128 added;
  REQ-FLOW-019, REQ-FLOW-081, REQ-FLOW-094, REQ-PLUGIN-016, REQ-CTX-017, REQ-OVERLAY-009, REQ-BOARD-004, REQ-PROVE-002,
  REQ-PROVE-004 and REQ-PROVE-033 modified). The deferral inbox: 237 rows, 70 matched by path, each folded or left with
  its reason in the plan's table.
- 2026-10-20T23:40Z `stamity plan check`: ready, exit 0, after one pass of fixes (the open-questions line, possessive
  requirement ids, `u18`'s dependency list, a delta paragraph moved out of the delta, a directory in `reads:`); the
  structural coverage pass: exit 0, 18 provisional definitions (the ADDED ids). Semantic review: the plan gate's review.
- 2026-10-20T23:44Z–2026-10-21T00:11Z (stamp corrected: not read from the clock) The plan gate, round 1 (`reports/plan-reviewer-r1.md`, Opus 5.5, high): request-changes, confidence
  medium (direct evidence); 2 Critical, 4 Warning, 10 Minor, ledger rows `plan/1`–`plan/16`. Every finding takes the
  reviewer's fix, written into the plan: **C-1** every `u8` edit extends a line in place (no line added or removed in any
  file it edits, so no `source:` range or index cell moves) and `digest-security-finding-carried-in-full` joins its
  re-quotes; **C-2** `u13` regenerates `src/pack/catalogPins.ts` itself, the one lane exception to the derived-file
  rule; **W-1** `u4` rewrites `packEngineDefects` C2 to install through `installBypassingAdd` and adds an `add`
  refusal case, `u17` gaining an edge on `u4`; **W-2** `u3`, `u4` and `u12` each add their new file's `PLAN_MAP` row;
  **W-3** `ui-error-state-announces-recovery` joins `u14` and `u18`; **W-4** every approval writes `blast radius:` and
  the run rewrites the record's section from each, so it holds the last one; the ten Minors as the report proposes
  (30 probe listings, run 47's renumbered id, defaulted map parameters, `packFit.ts` kept out of the composition root,
  the morning walk reading `Resumes:`'s record, a `threat` row on `u2`, five verify additions, `u0`'s criterion, `u13`
  after `u4`, the `./node_modules/<id>` route in `u3`'s refusal). `plan check` ready and the coverage pass exit 0
  again.
- 2026-10-21T00:11Z (stamp corrected: at or before) The plan gate, round 2 (a fresh reviewer, closures for `plan/1`–`plan/16`) dispatched; `u0`
  (the budget raise, on the integration branch) dispatched beside it, no finding touching its cell but its criterion's
  wording.
- 2026-10-21T00:11Z usage: plan minutes=71 tokens=unreported (claude)
- 2026-10-21T00:17Z The plan gate, round 2 (`reports/plan-reviewer-r2.md`, a fresh reviewer, confidence high): 15 of
  the 16 ids `fixed`, no new Critical or Warning; `plan/1` `not-fixed` on one wrong path (the digest-security case sits
  under `adversarial/`, not `golden/`), corrected and closed by hand with that rationale, the in-place rule it judged
  holding; its two notes (the Decisions bullet's "final approving reviewer", `checkPackCatalog`'s third parameter)
  folded. `plan check` ready, coverage exit 0. **The plan gate passes** on the recommended option, the maintainer's
  "defaults" (the gate passes once the plan's review approves): no third round, the per-unit reviews judging each unit
  against its final cell, as the two previous packages did. Ledger: 17 rows, all `fixed`.

### Contract census

Shared contracts the batch touches, each on one writer at a time (by a `depends_on` edge or the integration lane's
derived-file rule):

| Contract | Kind | Writers, in order | Consumers | Closure |
|---|---|---|---|---|
| the bundled catalog API (`curatedPacks`, `lookupCatalogEntry`, `resolveBundledPackRoot`, `CatalogEntry`) | module interface | `u2` | `add`, `check`, the reference page, `tarballStaging`, `u3`, `u16`, `u17` | clean (the two lookups keep their signatures; `add.test.ts`'s mock unchanged) |
| `src/pack/retired.ts` | module interface | `u3` | `add`, `check`, `u17` | clean (new) |
| `src/pack/moved.ts` | module interface | `u12` | `emissionWrite`, the sync report, `u15` | clean (new) |
| `check`'s row list and its order pin | output contract | `u3` → `u15` | `check --json` readers, `docs/troubleshooting.md` (`u18`) | reconciled(1): the troubleshooting page lists both rows in `u18` |
| `add`'s refusal parts and `AddPayload` | output contract | `u3` → `u4` | `add --json` readers | clean (additive fields) |
| the emitted skill head (frontmatter keys) | emitted file shape | `u6` | every client, the goldens, the ledger hashes | reconciled(1): the goldens regenerate in the integration lane |
| the pull-request body | output contract | `u9` (engine), `u8` (the record section's text) | `/st-pr-resolve` (skips marker comments), the morning list's parser (reads `morning.md` only) | clean |
| Codex's shown-list count (`measureCodexSkillsList`, `codexSkillsListChars`) | module interface, published figure | `u4` → `u13` | `sync`'s refusal, `capabilityMatrix`, `docs/capability-matrix.md` | reconciled(1): the matrix page regenerates in the integration lane |
| `evals/SET-v7.md` and `evals/README.md` | document | `u1` → `u10` → `u13` → `u18` | `roster`, `readmeCurrency`, `successorInputs` tests | clean |
| case files several units re-quote | eval inputs | `u1` → `u7`, `u8`; `u14` → `u13` | the locator gate | clean |
| `content/commands/st-work.md` and `work.test.ts` | corpus text and its pins | `u8` → `u14` | the eval cases quoting it | clean |
| `test/pack/packEngineDefects.test.ts` | test fixture | `u5` → `u4` → `u17` | itself | clean |
| `test/emit/skillsProjection.test.ts`, `test/adapters/codex.test.ts`, `test/corpus/skills/flow.test.ts` | pins | `u6` → `u13`; `u4` → `u13`; `u14` → `u13` | — | clean |
| `test/architecture/boundaries.test.ts` (`PLAN_MAP`) | test map | `u12` → `u3` → `u4` | itself | clean |
| `src/composition/root.ts` | registry | `u12` → `u3` | `test/composition` | clean |
| the golden snapshots, the emitted copies, `catalogPins.ts`, `docs/reference/*.md`, `docs/capability-matrix.md` | derived files | the integration lane (and `u13` for `catalogPins.ts`) | CI's dogfood check, the docs tests | clean |

## Build

- 2026-10-21T00:13Z `u0` returned BLOCKED_DEPENDENCY before any edit: `test/support/support.test.ts:746` pins
  `LOGIC_BUDGET_BYTES` at 2.375 MiB, outside its cell (ledger `build/1`, decision needed). Signed off: the cell widens
  to that assertion and its justification line, `u2` writing the file after `u0` as before; re-dispatched. Baseline
  build at `b4c82354`: logic 2,486,055 of 2,490,368 bytes, corpus 701,218 of 1,572,864.
- 2026-10-21T00:13Z–00:17Z (stamp corrected) `u0` DONE, `62b9c758` (logic 2,486,055 of 2,621,440); review r1 approve, confidence high, one
  Minor (`review/1`, `CONTRIBUTING.md:157-159` states the old cap) scheduled into `u18`'s files.
- 2026-10-21T00:17Z–00:31Z (stamps corrected for this line and the next three: each between those clock reads, in
  this order) Wave 1 dispatched: `u1`, `u2`, `u5`, `u6`, `u9`, `u11`, `u12`, one lane each (`p22-<unit>`) from
  `62b9c758`.
- 2026-10-21T00:17Z–00:31Z `u6` DONE, `83c14cb7`; one Minor (`build/2`: an override writing a pass-through key as a string
  now stops `sync`; the change log says so, in `u18`). Review r1 approve, confidence medium; `rests on:` a skill
  declaring neither key keeps its bytes (walked); `blast radius: moderate`. Its question for the whole-branch pass:
  whether `add` checks a third-party pack skill's values for the two keys.
- 2026-10-21T00:17Z–00:31Z `u11` DONE, `23b45cb9` (the banner: 18 loaded, none hidden); review dispatched.
- 2026-10-21T00:17Z–00:31Z `u1` DONE, `bdf9ffc7` (857 binding, 133 advisory; 54 byte-identical, 24 moved); review
  dispatched.
- 2026-10-21T00:31Z `u5` DONE, `de59489e` (red first: seven cases failing on the old code); review dispatched. Its
  `build/3` (decision needed): an id a ledger does not yet record still passes `add`. Signed off: fix now, in `u5`'s
  fix round, so `add`'s id check reads the content index (the core whether selected or not, the fork, the overrides),
  not only the ledger, which is what the same-class sign-off asks; `build/4` (a Minor: the refusal's `why` assumes a
  command and a skill) in the same round.
- 2026-10-21T00:31Z–00:58Z (stamps corrected for this line and every line below it to the clock read of 00:58Z: each
  happened between those two reads, in this order; the times first written here were not read from the clock) `u11`
  review r1 approve (confidence medium; `rests on:` the four summary edits leave each body and
  digest unchanged, cited; `blast radius: contained`), four Minors: `review/2`–`review/4` fixed in `e66179ed` (the
  merged learning recaptured with every measured fact; the Codex hook method in the troubleshooting page; the measured
  client versions in `src/runs/layout.ts`); `review/5` (records-branch plans naming retired learnings) is a records
  edit for the close. Three Codex measurement details stay in git history only (the retired file at `62b9c758`), a
  note for the close.
- 2026-10-21T00:31Z–00:58Z `u12` blocked on `test/composition/root.test.ts:233-247` (the pinned pack-lane keys; `build/5`).
  Signed off: that file joins `u12`'s cell and `u3`'s (after `u12`); resumed; DONE `62a42ea0` (the four digests read
  at `v1.16.0` and equal at `v1.9.0`; a forged row recording an owner's own bytes keeps the file). Review and the
  security lens dispatched.
- 2026-10-21T00:31Z–00:58Z `u9` DONE, `0f5b1b60` (21 new cases; no existing pin edited); review dispatched.
- 2026-10-21T00:31Z–00:58Z `u5` review r1 request-changes (confidence high): `review/6` (the same gap as `build/3`) and
  `review/7` (the refusal's `why` for two commands, untested); one fixer round on all four rows; `add.ts` and its test
  join `u5`'s cell.
- 2026-10-21T00:31Z–00:58Z `u2` blocked on `test/packs/ops.test.ts:260` (the version pin; `build/7`), work committed as
  `f6e88255`. Signed off: that line joins `u2`'s cell; resumed. Its notes' pages (`CONTRIBUTING.md:239`, `:249`,
  `docs/packs-and-trust.md:548-554`, the generator's `--write` now setting `version`) join `u18`.
- 2026-10-21T00:31Z–00:58Z `u9` review r1 approve (confidence high; `rests on:` the outbound screen reads each line alone, so
  screening the section by itself equals screening it in the body, walked; `blast radius: moderate`); one Minor
  (`review/8`, an untested refusal path) to a fixer. Its question, the record being an append log: `u8`'s cell now keeps
  `## Blast radius` directly after `## Frame`, rewritten in place, so the next heading bounds it.
- 2026-10-21T00:31Z–00:58Z `u1` review r1 approve (confidence medium; `rests on:` the runner's hash check fails closed, cited;
  `blast radius: moderate`), no finding. Wave 2's `u7`, `u8`, `u10` dispatched in lanes from `u1`'s head `bdf9ffc7`.
- 2026-10-21T00:31Z–00:58Z `u12` review r1 approve (confidence medium; `rests on:` a delete at a moved skill's path needs the
  recorded hash and a frozen digest at exactly that engine path, walked; `blast radius: moderate`); one Minor
  (`review/9`, the notice calls every kept copy edited). The security lens is pending.
- 2026-10-21T00:31Z–00:58Z `u2` DONE, `f6e88255` and `2dddcaea`; `build/7` fixed. Review and the security lens dispatched.
- 2026-10-21T00:31Z–00:58Z `u12`'s security lens: `sync` cannot be made to delete a person's file through the change; one
  Minor (`review/10`, the same notice as `review/9`, read as a security defect: it told the operator to delete by hand a
  copy the sweep refused as unsafe). Both fixed in `743a53f0`; a fresh security lens verifies the closures.
- 2026-10-21T00:31Z–00:58Z `u9`'s `review/8` fixed in `481b4e82` (red with the guarded line removed). `u7` DONE `294bc0a4`;
  review r1 approve (confidence medium; `rests on:` the skill's sentences and `run.ts` agree field for field, cited;
  `blast radius: contained`), one Minor (`review/11`, the final-round clause read by an earlier chain file) to a fixer.
- 2026-10-21T00:31Z–00:58Z `u2`'s security lens: one Warning (`review/12`, security): with the catalog read lazily, a catalog
  that cannot derive throws inside `check`'s pack-integrity row after tampering is found, `guarded()` turns it into a
  warn and `check` exits 0. `u2`'s review r1 request-changes: one Warning (`review/13`, decision needed):
  `CURATED_PACKS` leaves a module `createEngine().pack.curated` exposes. Signed off: fix `review/12` as the lens
  proposes; for `review/13` keep compatibility, a lazy deprecated `CURATED_PACKS` getter on the registry (no
  import-time read) and a deprecation line in `u18`'s change log, the recommended reading for a minor release. One
  fixer on both; its `src/composition/root.ts` edit sits beside `u12`'s in the same file, so the integration lane
  cherry-picks `u12` before `u2` and a fixer replays any conflict.
- 2026-10-21T01:00Z `u12` complete: the security lens's round 3 closed `review/9` and `review/10` `fixed` (after a
  round-2 `not-fixed` on a forged row at the table's own path, `18c7c390`); `build/6` (the diff's size) rejected: 209
  product lines, the rest one test file the cell asks for.
- 2026-10-21T01:00Z The integration lane, wave 1 part 1, dispatched: `u1`, `u6`, `u7`, `u9`, `u11`, `u12` cherry-picked
  onto `feat/packs-rebuilt-01`, the derived files regenerated and read; the full suite after part 2.
- 2026-10-21T01:02Z `u8` DONE `c6825ccf` (in place everywhere; eight cases re-quoted); review dispatched. `u10` review
  r1 request-changes (`review/14`: fixtures quoting the packs spec's literal path, which `u18` creates; `review/15` and
  `build/11`: the clean-tree pathspec unpinned), to a fixer. `u2`'s fix round (`8c014ec4`, `5be480dd`) in re-review.
  `u5`'s fixer: `review/7` fixed in `50f220dc`; `review/6` blocked — the catalog-id check turns 53 tests red because
  their shared fixture pack ships `agents/reviewer.md` with a core id, the defect itself. Signed off: `u5`'s cell gains
  `test/pack/install.test.ts`, both fixtures move to a non-core id with justified notes; `fix/1` (the pre-existing
  refusal-loop wording for an id collision) fixed in the same round; `fix/2` (pre-existing, decision needed: re-adding a
  pack after a synced override of its agent refuses) scheduled to Package 20's upgrade work, which re-adds installed
  packs (an inbox row at the close).
- 2026-10-21T01:07Z Integration part 1 landed at `0160c3cf` (13 picks, no conflict; derived: the two rule-skill copies
  gain one line from `u6`, `st-unattended`'s copy from `u7`, the manifest's hashes, the cross-client goldens; every
  other generated page byte-identical); `check`, typecheck, lint and the targeted set green. `u2` re-review r2 approve
  (confidence high): `review/12` and `review/13` `fixed`; `build/8` and `build/9` rejected (the generator names its own
  restore; a sizing note). `u10` re-review r2 approve (confidence high): `review/14`, `review/15`, `build/11` `fixed`.
  `u8` review r1 approve (confidence high; `rests on:` every edited line swapped one for one, walked; `blast radius:
  moderate`), one Minor (`review/16`, the placement words) with `build/12` (signed off, the lean reading: the
  implementer's digest only) and `build/13` (a pin) to a fixer; `build/14` rejected (a load-only timeout, green alone).
  Integration part 2 (`u2`, `u10`, then the first full suite under the machine lock) dispatched.
- 2026-10-21T01:22Z Integration part 2 landed at `c54f842f` (six picks, no conflict: `src/composition/root.ts` merged
  `u12`'s `moved` and `u2`'s getter on its own; derived: only `docs/reference/packs.md`, from `u2`; the manifest's
  timestamp-only re-stamp restored, not committed). **Full suite, alone under the machine lock:** exit 0, 310 files,
  17,065 passed and 21 skipped, 594 s; coverage 96.71 / 90.66 / 99.01 / 97.74, no floor missed. `check` (15 rows, drift
  clean), typecheck, lint, knip and the leak gate exit 0. `u8`'s fix round `ecf376a7` (three Minors) closed; `u14`
  DONE `401339ff`, review dispatched; `build/15` rejected (the lane rule already leaves the golden suites out). `u5`'s
  fix round (`50f220dc`, `8c5ee05f`, `ab5c1bdf`) in re-review.
- 2026-10-21T01:24Z Re-sequenced (the critical path): `u13` no longer waits on `u4`; `u4` writes
  `test/adapters/codex.test.ts` after `u13`, so the file keeps one writer. `u5` re-review r2 approve (confidence high):
  all five closures `fixed`; the fixer's departure (a client copy of the same pack keeps the `sync`-first remedy) judged
  right; one pre-existing Warning, `review/17` (another installed pack's id read from its file name, not its declared
  id: a false refusal that loops), fixed now in a side lane after this integration. `u14` review r1 request-changes:
  `review/18` (W, decision needed: the UI-states rule's fallback disagreed with the two readers that judge a change)
  and `review/19` (M, decision needed: a UI change with the skill absent left no record line); signed off, the
  recommended reading for both: the rule follows the stylesheet layer's token source like the judges, and `/st-work`
  marks browser evidence not installed; to a fixer. Integration part 3 (`u5`, `u8`) dispatched.
- 2026-10-21T01:24Z–01:32Z Integration part 3 landed at `d7e50706` (six picks, no conflict; derived: `u8`'s four
  `.claude/` copies, the manifest, both goldens). `u3` and the `review/17` side fix (`p22/u5b`) forked from it. `u14`'s
  fix round 1 (`13dcd9ba`): `review/18`, `review/19` `fixed` at re-review r2, which found `review/20` (the rule's
  no-inventory sentence stopped saying the inventory is absent); fixed in `5305f88d`.
- 2026-10-21T01:38Z `u14` re-review r3, the cap round: approve (confidence high), `review/20` `fixed`. Integration
  part 4 landed at `68095454` (`u14`'s three picks; derived: its five `.claude/` copies, the manifest, both goldens;
  `check`, typecheck, lint and the targeted set green). `u13` forked from it and dispatched. `review/17` fixed in
  `979c0ada` (re-review r3 approve, confidence high); its fixer's pre-existing Minor `fix/3` (a scoped pack id whose
  folder is gone is missed by the file-name fallback) waits for the close, beside `fix/2`.
- 2026-10-21T02:00Z `u3` blocked twice on `docs/troubleshooting.md` (its doctor sample, pinned by `check.test.ts:2806`,
  then its doctor table, pinned by `docsPages.test.ts:4733`; `build/16`); signed off: both places join `u3`'s cell, and
  `u15`'s for its own row; DONE `b74ea749`, `63607851`, `80d0ab60`; review dispatched. `u13` blocked on two old floors
  counting eight core skills (`build/19`, `build/20`); signed off: both join its cell; DONE in five commits (the pure
  rename `4eed192f`, then descriptions of 246 and 249 characters, `packs/frontend/pack.json`, the pins, the tests and
  evals, the floors `e40cf6ac`); review dispatched. Its Minors: `build/22` (`docs/packs-and-trust.md:97`) to `u18`,
  `build/23` (the install smoke lists three packs) to file 2, `build/21` (`st-unattended` missing from two id lists)
  for the close.
- 2026-10-21T02:07Z `u3` review r1 request-changes (confidence medium): `review/21` (W: the command's retired-id branch
  untested), `review/22` (M, decision: the remedy skipped the repo's replace order), `review/23` (M, decision: the page
  said path and npm packs are never judged, the code judges a vendored copy by its pins), `review/24` (M: `clean --pack`
  first for any same-named pack). Signed off, the recommended reading for each: the map is read through the engine
  registry with a command-level test; the remedy reuses `replaceSteps`; the code stands and the page and REQ-PACK-003's
  delta text say so (amended in the plan); `clean --pack` first only for a first-party copy; to a fixer. `u13` review r1
  request-changes (confidence medium): `review/25` (W: the moved roster rows lost their two guards) and `review/27` (M:
  notes cite REQ-PACK-008 for the move) to a fixer; `review/26` (M, decision: the pack's touched paths) rejected, the
  pack declaring what its skills write. `u16` forked from `u13`'s head `e40cf6ac` and dispatched.
- 2026-10-21T02:35Z `u13` re-review r2 approve: `review/25`, `review/27` `fixed` (`5b811db2`). `u3` re-review r2
  approve: `review/21`–`review/24` `fixed` (`a7aaeecc`, `09616cba`). `u16` blocked on `init.test.ts:547-555`
  (`build/24`; signed off, the cell widens), DONE `76279df8`, `d641e453`; review r1 request-changes (`review/28`, the
  fail-soft catch untested; `review/29`, the ledger mapping) to a fixer with the reviewer's notes. **Integration part 5
  at `936350cb`** (`u5b`, `u3`, `u13`; 12 picks, no conflict; `7acf3098` a pure rename): this repository's own `sync`
  printed the moved-skill notice for both skills and removed their four tracked copies — the prune proven on a real
  install; derived: `docs/reference/skills.md` 7 skills, `docs/reference/packs.md` 4 packs, the capability matrix
  4,759, both goldens. **Full suite, alone under the machine lock: exit 0**, 312 files, 17,126 passed and 21 skipped,
  656 s, coverage 96.70 / 90.67 / 99.02 / 97.76; `check`, typecheck, lint and the leak gate exit 0; **knip exit 1**
  (`integrate/1`: an export `u3` left unused) — signed off: `u4`, the next writer of `add.ts`, drops it as its first
  commit; `integrate/2` (the reference page counts a skill's support file as a skill) to a side lane. `u4`, `u15` and
  that lane dispatched from `936350cb`.
- 2026-10-21T03:02Z `u16` fix round `017834e1` (the fail-soft catch and the ledger mapping tested; the open question
  was real — three config-file frameworks could push the `frontend` row past the panel's cap of three, so a pack-offering
  row now sits first) and re-review r2 approve (confidence medium): `review/28`, `review/29` `fixed`. The reference-page
  count fixed in `c87ad244` (`integrate/2`). `u4` DONE (`110979e9` the knip fix, `8cf0bb65`, `cb4eb741`); review
  dispatched; its `build/25` and `build/26` (decision needed: both refusals suggest narrowing the selection, which `sync`
  does not honour) wait for the review. `u15` DONE (`60927454`, `6c6a1a17`); review dispatched. `u18` dispatched to the
  spec-author from `936350cb` beside them, its files disjoint.
- 2026-10-21T03:07Z `u15` review r1 approve (confidence high; `rests on:` each of the four cases, `validate` and the
  row's three states has a test asserting the cell's exact text, cited; `blast radius:` `check --json`'s rows shift by
  one); `review/30` with `build/27`, `build/28` (Minors) to a fixer. `u4` review r1 request-changes (`review/31`, W: the
  fit check restates `sync`'s inputs with no equality test; `review/32`, `review/33`, Minors); signed off with
  `build/26` (the "narrow the selection" advice leaves both refusals, `sync` planning the full corpus) to a fixer;
  `build/25` rejected (failing at `add`, one verb earlier and before any write, is the safer side). Re-sequenced: `u17`
  forked from `u4`'s head `cb4eb741` (its one shared file, `packEngineDefects.test.ts`, is not in `u4`'s fix round) and
  dispatched.
- 2026-10-21T03:21Z `u15` fix round `3bd36771` (`review/30`, `build/27`, `build/28` fixed). **Integration part 6 at
  `dcbf987e`** (`u16`, the reference count, `u15`; seven picks, no conflict, no derived move); `check`, typecheck, lint
  and the targeted set (3,943 tests) green; knip exit 1 on two exports used only in their own file: `integrate/4`
  (`add.ts`, already fixed in `u4`'s lane) and `integrate/3` (`check.ts`, `u15`'s) to a one-word fix lane. `u4` fix
  round `164b31d1` (one shared measuring helper and an equality test; the false "narrow the selection" advice out of
  both refusals; `clean --pack` named for another pack) in re-review; the plan's `u4` cell amended to match, and `u18`'s
  spec-author told. `fix/4` (pre-existing, decision needed: the same false advice in Codex's dropped-rules warning) for
  the next `u4` round or the close.
- 2026-10-21T03:29Z `u4` re-review r2: `review/31`–`review/33` and `build/26` `fixed` (the shared helper judged enough,
  the equality test failing on a one-sided change); its new `review/34` (the shipped REQ-PROVE-004 still named the
  removed advice) is `u18`'s spec text; the plan's delta amended. `fix/4` signed off, fix now, to a `u4` round 2.
  `integrate/3` fixed in `b1a1c2b6` (a side lane). `u17` DONE `ba5d4034` (79 + 20 cases; 46.7 s alone). `u18`: the
  spec-author wrote every file, its role could run no command (`build/29`); an implementer finished it — the gates exit 0
  (3,640 tests; the leak gate) and three commits `5ec5b54b`, `e152b0a5`, `f79edc83`; `build/30` rejected (the count
  already right), `build/33` fixed (pstack credited by name), `build/31` rejected (`u4`, `u15`, `u16` integrate first).
  Reviews of `u17` and `u18` dispatched.
- 2026-10-21T03:38Z `fix/4` fixed in `975ff4ed` (Codex's dropped-rules warning and its emitted note name only working
  remedies). `u17` review r1 approve (confidence medium; `rests on:` each probe runs over the real packs and a breaking
  made-up pack, walked; `blast radius:` test-only, about 29 install cases on the Windows legs); `review/35`, `review/36`
  (Minors) to a fixer. `u18` review r1 request-changes (confidence high): `review/37`–`review/40` (W: REQ-PACK-004 still
  said `sync`'s refusal was unchanged; REQ-PACK-011's exemptions and reverse rule; REQ-PACK-012 missing
  `frontend.test.ts`; citations naming lane-head shas that cherry-picking replaces) and `review/41`–`review/43` (M) to a
  fixer, with `review/34`.
- 2026-10-21T03:50Z `u17` fix round `5afee6be` (`review/35`, `review/36` fixed). **Integration part 7a at `41caf554`**
  (`u4` five picks, the knip fix, `u17` two; no conflict, no derived move); `check`, typecheck, lint, **knip exit 0** and
  the targeted set (3,910) green. `u18` fix round `e2404e1a`; re-review r2: all eight ids `fixed`; one new Warning,
  `review/44` (a stale Concerns sentence in the packs spec), to a fresh fixer with one change-log line; its re-review is
  `u18`'s cap round.
- 2026-10-21T03:54Z `u18` fix round 2 `9050183d`; re-review r3 (the cap round) approve, confidence high: `review/44`
  `fixed`. **Integration part 7b at `cef090e4`, the final tree** (`u18`'s five picks, no conflict, no derived move;
  `check`, typecheck, lint, knip exit 0). Every unit reviewed and approved. The final-tree gates (a test-runner) and the
  whole-branch review (Fable 5.1) dispatched in parallel.
- 2026-10-21T03:54Z usage: build minutes=217 tokens=unreported (claude)

## Prove

- 2026-10-21T04:06Z The whole-branch review, round 1 (`reports/branch-reviewer-r1.md`, Fable 5.1): request-changes,
  confidence medium. The cross-unit contracts hold; security holds (the moved-skill delete proof, the build stamp, the
  catalog root, the outbound section). `review/45` (W, decision needed: the upgrade note's order — `add frontend` refuses
  on a 1.16.0 ledger until `sync` runs); `review/46` (W: `add` admits a pack skill with a string-valued pass-through key
  that `sync` then refuses); `review/47`, `review/48` (M). Signed off, the recommended reading: `review/45` the lean way
  (the note and REQ-PACK-008 state `sync`, then `add frontend`, then `sync`, with one upgrade-fixture test walking it);
  the rest as proposed; one fixer in `p22/branchfix` from `cef090e4`. Its process notes: the record carries no
  `## Blast radius` yet (written from the approving round); the cut's version bump needs
  `generate-pack-manifests.mjs --write` (a Package 20 cut item).
- 2026-10-21T04:19Z The final-tree gates on `cef090e4` (a test-runner, no report file since red): 11 of 13 rows exit 0 —
  scan (0 hits, 202 scanned, none unscanned), classify (`security-sensitive`), build (logic 2.41 of 2.50 MiB), the full
  suite under the lock (315 files, 17,280 passed, 21 skipped; coverage 96.72/90.67/99.01/97.76), `npm run check` under
  the lock, dogfood `check` (drift clean), the leak gate, hygiene, records restore and `test:records` (59 passed). Red:
  `plan check` (exit 1: my brief ran it from the integration lane, where the git-excluded plan is outside the
  repository, so nothing was read) and the coverage pass (exit 1: `dangling-dependency` at the plan's `u4` `depends_on`,
  whose parenthetical, amended at the build's re-sequencing, carried a comma-split figure the checker read as part of the id). Fixed in the
  plan cell (the reason kept, the figure dropped); re-run from the main checkout at 04:18Z: `plan check` ready, exit 0;
  coverage `pass`, exit 0. No product file moved, so the other eleven rows stand for `cef090e4`; the post-fix head gets
  its own final-tree run.
- 2026-10-21T04:34Z Branch fix round 1 `1bdb141b` (`reports/branch-fixer-r1.md`): `review/45`–`review/48` fixed. On
  `review/45` the documented order gained the hand delete the `moved:` line already names (with an edited copy, the
  last `sync` refuses that one file and exits 1 until it is gone); one upgrade-fixture test walks all five steps. New:
  `fix/5` (M: `validate` still prints the bare `stamity add <pack>`). Signed off: fixed now in the same lane,
  a one-option change; the re-review takes both commits.
- 2026-10-21T04:37Z `fix/5` fixed in `b772b592`. The integration branch fast-forwarded `cef090e4..b772b592` (16 files,
  +409/−90); build exit 0, dogfood `check` exit 0 (drift clean, no derived move). Dispatched in parallel: the
  whole-branch re-review, round 2 (Fable 5.1, ids `review/45`–`review/48`, `fix/5`) and the final-tree gates on
  `b772b592` (the plan rows from the main checkout).
- 2026-10-21T04:38Z All 66 commits carry the DCO trailer and a conventional subject. `feat/packs-rebuilt-01` pushed
  (a new branch, not `main`); **draft PR #118** opened into `main` at `b772b592`, its `## Blast radius` and proof lines
  to be filled from round 2 and the gates; CI watched to the end.
- 2026-10-21T04:43Z The whole-branch re-review, round 2 (`reports/branch-reviewer-r2.md`, Fable 5.1): **approve**,
  confidence medium (by reading; the gates are the test-runner's). Closures applied (`ledger close`, exit 0):
  `review/45`–`review/48` and `fix/5` `fixed`; no new Critical or Warning; the three cross-unit contracts round 1 named
  still hold. `## Blast radius` written above from its two lines (moderate). The branch's review loop exits on
  approval, round 2 of 3.
- 2026-10-21T04:54Z **The final-tree gates on `b772b592`: green** (`reports/branch-test-runner-r2.md`), every row exit
  0: scan (0 hits, 203 scanned, none unscanned), classify (`security-sensitive`; checks scan, gates-all, review; lens
  `stamity-security`), build (logic 2.41 of 2.50 MiB, corpus 0.67 of 1.50 MiB), the full suite alone under the lock
  (315 files, 17,286 passed, 21 skipped; coverage 96.72 / 90.68 / 99.01 / 97.76, floors held), `npm run check` under
  the lock, dogfood `check` (drift clean), the leak gate (0 hits, 1,457 files), hygiene, records restore and
  `test:records`, `plan check` ready and the coverage pass `pass` (from the main checkout). PR #118's CI so far: every
  job green but `check (windows-2, node 24)`, still running. The QA checkpoint's prover dispatched for two rows (a clean
  first run, and an upgrade over a real 1.16.0 install) in scratch folders.
- 2026-10-21T04:56Z **The QA checkpoint** (the qa skill, class `security-sensitive`, lens `stamity-security`). Seven
  rows derived; no row needs a person; the checkpoint closes on its pointers with no ask.

  | # | Scenario | Risk | Proof |
  |---|---|---|---|
  | 1 | A copy of a moved skill edited since `sync` wrote it, a forged ledger row, a path outside the two engine folders and a symlinked folder all survive the upgrade `sync` (the security-negative row) | H | auto-proven: `test/cli/engine/movedPrune.test.ts:267`, `:302`, `:352`, `:371`, under `node scripts/ci/test-run.mjs --coverage` exit 0 on `b772b592` (`reports/branch-test-runner-r2.md`) |
  | 2 | An upgrade over a published 1.16.0 install: `add frontend` refused naming `sync` first; `sync` removes the unedited copies, keeps and names the edited one, prints one line per skill once with the pinned `add frontend` call; `add`; `sync` refuses the kept file; after the hand delete `sync` and `check` exit 0 | H | auto-proven: `movedPrune.test.ts:474`, same gate run; and agent-run: `npx -y @zomarit/stamity@1.16.0 init --yes --tools claude,codex`, then the branch CLI's six steps, each exit code as expected (`reports/qa-row-b-outputs.txt`) |
  | 3 | A clean first run in a Next.js repository: `init` suggests the frontend pack and installs nothing; `add frontend`, `sync`, `check` exit 0 | M | agent-run: the four commands, exit 0 each, the suggestion line and both skills created (`reports/qa-row-a-outputs.txt`); `test/cli/commands/init.test.ts:579` |
  | 4 | `add` refuses before any write a pack past Codex's list, a same-class name clash, and a non-boolean menu key | M | auto-proven: `test/cli/commands/add.test.ts:2245` (the fit refusal before any write; `test/cli/engine/packFit.test.ts:165` measures it), `test/cli/commands/add.test.ts:1550`, `test/pack/packEngineDefects.test.ts:818` |
  | 5 | `check` reports `pack-catalog` and `moved-skills` | M | auto-proven: `test/cli/commands/check.test.ts:535` (the row order), `:4891` (`pack-catalog`), `:5088` (`moved-skills`); row 3's `check` printed both `ok` |
  | 6 | A symbolic link in `packs/` is refused by name | M | auto-proven: `test/pack/curated.test.ts:346` |
  | 7 | Claude Code's live `/` menu hides the rule-skills | L | not proven: the emitted heads are pinned by the goldens, but no live client menu was opened; offered at the package's close in file 2, where the menu takes its final shape |

  Row 2's prover first read step 2 as contradicted: my brief's Expected said "one notice naming both skills", while
  the as-built REQ-PACK-008 says the notice is one line per skill, printed once, which is what it printed; the
  Expected was mine, not the code's. Its other observation, the pinned call naming `1.16.0`, is the running CLI's
  own version (`src/cli/kit/packageName.ts:246`), which the cut's version bump moves. Rollback: revert the merge
  commit range on `main`. Shippable: YES on the evidence (every H row proven, none contradicted); row 7 is on `Not
  done:`; the merge is the maintainer's.
- 2026-10-21T04:58Z PR #118's CI on `b772b592`: every job green, both Windows legs among them (`check (windows-1,
  node 24)` 12m01s, `check (windows-2, node 24)` done at 04:57:45Z), the floor, the LTS leg, the cloud container, the
  records job, the size budget, DCO and the title; the watch exited 0. The leftovers decided (signed off): the
  fixed rows `review/1`, `build/10`, `build/22`, `integrate/4`, `build/32` and the rejected `build/2`, `build/18`,
  `build/34`, `build/35` closed with their reasons (`ledger close`, exit 0 each); the deferred rows (`build/17`,
  `build/21`, `build/23`, `fix/3` to file 2, `fix/2` to Package 20), their inbox rows, the inbox retirements and
  `review/5` wait for this file's close after the merge.
- 2026-10-21T07:00Z The PR body updated with the final proof, then marked ready once (the PR's event: 06:59:55Z). The
  ready event fired at 06:59:55Z, about two hours after the body edit (about 04:58:15Z); what that time went to is not
  measured. The review bot started its one review on `b772b592` at 07:00:05Z; its
  summary comment, screened as ingress: `kept`, no class matched.
- 2026-10-21T07:08Z The review bot's review of `b772b592` completed with no findings (its thumbs-up reaction on the PR;
  no review and no thread). PR #118: ready, merge state CLEAN, not merged; the merge is the maintainer's. Left for this
  file's close after the merge: the deferred rows `build/17`, `build/21`, `build/23`, `fix/3`, `fix/2` and their inbox
  rows, the inbox retirements of the rows the plan folded, `review/5`, the plan's two follow-ups, `main`'s push runs
  read to the end, the records publish, and this record's proof block. Status stays `in progress` until then.

## Close (2026-10-21, the maintainer present)

- 08:02Z The maintainer asked for a walk through everything left, by the question tool. The answers: merge PR #118
  after a read-only audit of the late work; Dependabot's #115, #116 and #117 merged after it, each lockfile diff read in
  full; charter invariant 5's proposed four-line wording lands in file 2's charter edit; this close runs now; the
  leftovers stand as recommended; the next session starts attended; this run's worktree lanes are removed by a script
  the maintainer runs, prepared after each lane is checked; the pack-signing rehearsal is debugged first in the next
  session; inbox row 271 is removed; the records publish now, with the rehearsal named below.
- 08:44Z The audit of the late work (from 03:00Z; Opus 5.5, read-only): holds with corrections, seven, all wording and
  citations: two QA citations made exact (rows 4 and 5), the QA rows' outputs copied into `reports/`, one wording, and
  two claims about the night's last two hours reduced to their timestamps. Each applied; no fact about the code
  changed. The branch, the integration (every commit after 03:00Z matched to its lane by patch id), the fix range, the
  PR and its checks, and the ledger held.
- 09:50Z **PR #118 merged** by fast-forward after the maintainer's click: `main` `b4c82354..b772b592` (`git push origin
  b772b592:main`, the hashes kept; GitHub marked the PR merged at 09:50:47Z).
- 10:24Z `main`'s push runs on `b772b592`: CI `39580103197` and the docs site `39580102986` success. The Pack signing
  rehearsal `39580102983` **failed** at its sign stage. Nothing that stage loads changed in this run: `src/pack/sign.ts`
  and its 17-file import graph, the rehearsal script, the workflow and both lockfiles are byte-identical to
  `b4c82354`, whose run passed. Its first attempt called GitHub's token service, Fulcio and Rekor, then stopped within
  six seconds, before any receipt; the stage reports a fixed line by design, never the provider's text. A re-run of the
  failed job alone (attempt 2) could not pass by construction, since the prepared context records the run attempt; a
  full re-run (attempt 3, 10:29Z) failed the same way. A web check found no Sigstore incident, freeze or cutover in the
  window and no change to how sigstore 5.0.0 picks its endpoints. Filed as `close/3` (Warning), deferred to a `/st-debug`
  run that opens the next session, whose first step is an observation-only change printing the failing stage and the
  error's code.
- 11:03Z The failure is intermittent: the rehearsal on `64e74427` (Dependabot's #116 merge, the same signing code;
  #116 moved only development dependencies, which the rehearsal does not install) passed at 10:57Z, calling Fulcio,
  Rekor, then the TUF mirror for the bundle check. A fourth full attempt on `b772b592` (11:00Z) failed again, but
  further on: its receipt shows revision 1 signed, verified and written, and revision 2 stopped. Attempts 1 and 3
  stopped in revision 1's signing call (after the Fulcio and Rekor calls, before any TUF call or receipt); attempt 2
  could not pass by construction. The bundles produced are about 9 KB against a 1 MiB limit. So the stop moves between
  calls and between revisions: an intermittent failure inside the signing call. `close/3` and its inbox row say so; the
  scheduled `/st-debug` run stands.
- 10:56Z Dependabot's #116, #115 and #117 merged by rebase after the maintainer's clicks (`main` at `2530b5e7`), each
  diff read in full before (version bumps only, every package from the npm registry with an integrity hash, no install
  script), each rebased onto `b772b592` with its checks green, #116's both Windows legs among them. Their push runs,
  read to the end: CI on `64e74427` and on `2530b5e7` success (CI on `53442fc8` cancelled by the next push), the docs
  site on `2530b5e7` success, the Pack signing rehearsal on `64e74427` success.
- 10:58Z The leftovers, as recommended: `review/1`, `build/10`, `build/22`, `integrate/4`, `build/32` closed fixed and
  `build/2`, `build/18`, `build/34`, `build/35` rejected with their reasons (04:58Z); `review/5` fixed now (plans
  016-01, -02 and -03 point at the merged learning and at `docs/troubleshooting.md`'s Codex hook section; one dead
  `reads:` path dropped); `build/17`, `build/21`, `build/23`, `fix/3` deferred to plan 018 file 2 and `fix/2` to Package
  20's upgrade work, each with its inbox row; the plan's two follow-ups filed as `close/1` and `close/2`, deferred with
  their inbox rows; `close/3` as above. No row of this run's ledger is open.
- 11:15Z The close review of these records before their publish (`reports/close-reviewer-r1.md`, Opus 5.5): approve,
  confidence medium; the records gate holds (no open row, every deferred row with its inbox row, no repeated `Ref:`,
  the retirements in grammar, the leftovers arithmetic), no leak. Six Minors, filed as `close/4`–`close/9`: five fixed
  before the publish (the `real` count, the rehearsal row's per-attempt facts, the Dependabot push runs, the answers
  listed in full, the two-hour gap stated as its timestamps) and one rejected with its reason (a closed plan's
  `reads:`).
- inbox retired: test/evals/readmeCurrency.test.ts:139 — fixed in 2026-10-20_packs-rebuilt
- inbox retired: content/skills/st-unattended/SKILL.md:113-114 — fixed in 2026-10-20_packs-rebuilt
- inbox retired: content/skills/st-unattended/SKILL.md:98 — fixed in 2026-10-20_packs-rebuilt
- inbox retired: docs/plans/021-cloud-runs-02.md:1007 — scheduled to plan 018's follow-ups (when Package 21 plans its work)
- inbox retired: evals/cases-v6/golden/cursor-cloud-question-takes-default.md:40-44 — fixed in 2026-10-20_packs-rebuilt
- inbox retired: .stamity/learnings/ — fixed in 2026-10-20_packs-rebuilt (18 learnings, the banner lists all)
- inbox retired: content/skills/st-qa/SKILL.md — fixed in 2026-10-20_packs-rebuilt (re-measured at 159 lines; removed by
  hand on the maintainer's answer, its `Ref:` being a shared plan path)

## Proof block

**Gate results** — class `security-sensitive` (`gate classify` over the run's paths: scan, all gates, review; the
`stamity-security` lens), base `b4c82354`. Each gate by its exit code, the full suite alone under the machine lock:
- `b772b592`, the merged tree (`reports/branch-test-runner-r2.md`): `gate scan` 0 hits over 203 files, `unscanned`
  empty; the build (logic 2.41 of 2.50 MiB); the full suite with coverage (315 files, 17,286 passed, 21 skipped;
  96.72 / 90.68 / 99.01 / 97.76, every floor met); `npm run check`; the dogfood `check` (drift clean); the leak gate;
  hygiene; the records restore and `test:records`; `plan check` and the coverage pass. All exit 0.
- CI on #118 at `b772b592`, read to the end: success on every job, both Windows legs among them; `main`'s push runs on
  the merge, CI and the docs site: success.
- The Pack signing rehearsal on the merge (`39580102983`): red on all four attempts, at its sign stage; on
  `64e74427`, the next push holding the same signing code, success (the 10:24Z and 11:03Z entries; `Not done` below).

**Review verdicts** — per unit in the Build log, on Opus 5.5 at effort high, the security lens on `u2` and `u12`; every
unit approved at or above the gate (medium). The whole-branch review on Fable 5.1: round 1 request-changes (medium;
`review/45`–`review/48`), round 2 approve (medium; all five handed ids `fixed`). The review bot's review of #118: no
findings. The audit of the late work at the close: holds with corrections, each applied. No escalation ran.

**QA rows** — the 04:56Z table: rows 1, 4, 5 and 6 auto-proven (each by the test it names, under the final-tree suite's
exit 0); rows 2 and 3 agent-run in scratch repositories (`reports/qa-row-b-outputs.txt`, `reports/qa-row-a-outputs.txt`)
and row 2 also auto-proven (`test/cli/engine/movedPrune.test.ts:474`); row 7 not proven (a live client menu), on `Not
done`. No person row. Browser evidence not applicable (no rendered surface).

**Decisions trace** — the Frame's `Default applied` lines; every `Signed off` line in the Build and Prove logs; the
maintainer's answers at the close (the 08:02Z entry); every deferral on its ledger row, with its rationale and its inbox
row.

**Artifacts touched** — #118's 66 commits on `main` (`b4c82354..b772b592`), each made by the sub-agent of the unit its
entry names (implementers, fixers and one spec-author on Opus 5.5); the integration lane's cherry-picks and derived
regenerations; the three Dependabot merges (`b772b592..2530b5e7`). The orchestrator edited no product file. It wrote
this record, the plan, the ledger through its verb, the inbox through `ledger inbox-write` (one row removed by hand on
the maintainer's answer), and plans 016-01, -02 and -03 for `review/5`.

**Per-action attribution** — each outcome is its entry: researchers at medium, implementers, fixers, reviewers, the
security lens and test-runners on Opus 5.5 at high; the whole-branch reviews on Fable 5.1. The usage lines are written
at the close, their minutes read from this record's timestamps.

- 2026-10-21T10:58Z usage: plan minutes=77 tokens=unreported (Claude Code)
- 2026-10-21T10:58Z usage: prove minutes=194 tokens=unreported (Claude Code)
- 2026-10-21T10:58Z usage: the close minutes=176 tokens=unreported (Claude Code)

- 2026-10-21T11:15Z leftovers: shown=31 real=3 fixed=17 scheduled=9 dropped=5 accepted=0 notes=unknown changed=0

**Not done:**
- `close/3`: the Pack signing rehearsal on `main` fails at its sign stage intermittently (four attempts red on
  `b772b592`, one green on `64e74427`); scheduled to a `/st-debug` run that opens the next session (inbox row, when
  Package 22 session 2 starts).
- QA row 7: a live look at Claude Code's `/` menu with the rule-skills hidden; offered at file 2's close.
- Scheduled, each with its inbox row: `build/17`, `build/21`, `build/23`, `fix/3` (plan 018 file 2), `fix/2` (Package
  20), `close/1` (Package 21), `close/2` (the next eval run's § 8, or file 2).

**Recommended next step:** the `/st-debug` run on `close/3`, then plan 018 file 2, which takes the four rows scheduled to
it and the charter edit with invariant 5's new wording.
