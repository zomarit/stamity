---
id: board-writes-in-flow
intent: feature
stamp: 41b1899a 2026-10-12
reads: [docs/plans/015-board-writes.md, .stamity/runs/2026-10-12_board-writes/record.md, .stamity/runs/2026-10-12_board-writes/reports/plan-researcher-r1-board.md, .stamity/runs/2026-10-12_board-writes/reports/plan-researcher-r1-resolve-pack.md, .stamity/runs/2026-10-12_board-writes/reports/plan-researcher-r1-evals.md, .stamity/runs/2026-10-12_board-writes/reports/plan-researcher-r1-docs-sync.md, .stamity/runs/2026-10-12_board-writes/reports/plan-researcher-r1-inbox-write.md, .stamity/runs/2026-10-12_board-writes/reports/plan-researcher-r1-walk-qa.md, .stamity/runs/2026-10-10_next-tier/plan.md, docs/specs/board-writes.md, docs/specs/everyday-flows.md, content/commands/st-plan.md, content/commands/st-board.md, content/commands/st-work.md, content/commands/st-pr-resolve.md, content/rules/stamity-question-protocol.md, packs/product-audit/commands/st-product-audit.md, src/cli/commands/ledger.ts, src/runs/inboxStore.ts, test/corpus/commands/board.test.ts, test/corpus/commands/work.test.ts, test/corpus/recordWrites.test.ts, test/packs/product-audit.test.ts, test/ci/pluginLifecycle.test.ts, .stamity/inbox.md, .stamity/change-classes.json, .github/release-controls-checklist.md, evals/SET-v7.md, SECURITY.md]
depends_on: [docs/plans/015-board-writes.md]
---

# Run 2026-10-12_board-writes: the in-flow plan (plan 015, re-planned at HEAD)

**Amended 2026-10-12, pass r1 → r2** (plan coverage review r1, `reports/plan-code-reviewer-r1.md` and
`reports/plan-text-reviewer-r1.md`; sign-offs S9–S12). Applied: `plan/1`, `plan/2`, `plan/3`, `plan/4` (S9), `plan/5`,
`plan/8`–`plan/12` (w1: field screen, withheld parse messages, `Ref:` required, absent inbox created, ledger-`Ref:`
refusals, the removal rule, duplicate `Ref:`, the `\n` joiner, the verb's own refusal name, the block-reuse match);
`plan/6` (c1 starts at the edit; `CURSOR_WALK_MS` = 1,550,000 ms from the measurement report; D27); `plan/7`, `plan/22`
(s1's coverage reads `docs/specs`); `plan/13` (b6 verify); `plan/14` (S10; new D31; b1's files, interfaces,
testCriteria, edgeCases; census row); `plan/15` (S11; D1, b1's advisory budget, the pinned groom lever dropped, Risks,
Open question 1); `plan/16` (w2's Running-the-CLI paragraph and `CALL_SITES` row; REQ-FLOW-079; Common rules);
`plan/17` (b5's narrowed residual; D28; the Follow-up now a Warning at `SECURITY.md:107`); `plan/18` (S12; D5,
REQ-BOARD-002 criteria 1, 2 and 4, b1 amendment 6(d) and tests, b4's B1, QA R2 and R3); `plan/19` (D6, b1 amendment 7,
census row); `plan/20`, `plan/21`, `plan/26` (QA intro, R2, R3); `plan/23` (Common rules anchor); `plan/24` (b1 and b2
testCriteria); `plan/25` (b4's sweep). Coverage findings: the targets paragraph names no bare id and points at
`everyday-flows.md:606` and `:1347`; REQ-FLOW-078 and -079 use the bare heading form; REQ-FLOW-078 trimmed. Left:
`plan/27` goes to the `st-board.md:82` Follow-up (it needs a design choice, not a wording fix); the remaining
`delta-verbose` advisories stay where the criteria carry the contract. Unit ids, titles and order are unchanged.

This is the run's own plan. It re-plans `docs/plans/015-board-writes.md` at `41b1899a` because that file's freshness
guard failed (stamp `88fcfd32`; 24 of its 33 `reads` moved, `record.md:4`, `:57`). Plan 015 is a committed file every
implementer can open: where its text still applies, a cell cites it by item and line and writes only the amendment.
Every `path:line` here is read at `41b1899a` unless it names another head; a unit finds its text by the quoted words,
and a line number is a lead, never the anchor. Integration units run in order, so each also finds the lines the units
before it moved. The opening answers and sign-offs S1–S12 (`record.md:20-51`) bind. The session passed the plan gate
on the declared defaults below (opening answer 3), so the plan carries no `[NEEDS CLARIFICATION]` marker.

intent chosen: feature because the request names net-new capability — the board files and edits items itself, a
`--move` flag, and an engine verb that writes the deferral inbox; no dependency moves and no behaviour is meant to
stay the same, so refactor and migration do not fire.

## Context

`/st-board` writes almost nothing to a linked board today (`content/commands/st-board.md:180-183`, `:255-287`); this
package makes it file, edit and comment by default behind one preview per run, with `--move` alone changing where an
item stands, and makes the floor (one write target, item text as data, push permission from the platform, the
filed-item marker) part of the contract. It adds `stamity ledger inbox-write`, so `/st-work`'s close never opens
`.stamity/inbox.md` whole, routes `fill` and `/st-plan` reads through the screened query, and pays the Cursor walk's
two owed items. One pull request from `board-writes`, no release; the eval cases ride the next release's full run.
Out of scope as in plan 015 (a durable link, other platforms, the pack filing its own epic, write caps, a release),
plus inbox row `2026-10-11_release-1-14-0/review/70` (S8).

## Decisions this plan carries

### Plan 015's decisions

Decisions 1–14 (`docs/plans/015-board-writes.md:46-97`) and the maintainer's walk (`:37-42`, no release) stand; the
research disproves none. Four are amended in place, never reversed: Decision 2 gains numbered answers (D5); Decision 9
gains the key forms of D4 and D10; Decision 12's skeleton pin now sits at `test/corpus/commands/board.test.ts:262-264`;
Decision 14's write check reads through `gh` on every access path (D8) and is stated once, in the Write-back contract
(D1).

### Opening answers (`record.md:45-47`)

1. The session makes a public scratch repository under the maintainer's personal account with a user-owned Projects
   board (Status field) and the labels `type:feature` and `area:docs`, just before the walk; deleting it waits for the
   maintainer.
2. The walk runs with auto-add off and records it (GitHub's API cannot switch it on, `record.md:38`).
3. Re-plan in-flow with plan 015 as input; the session passes the plan gate on these defaults.

### Sign-offs that touch units

- **S7** (`record.md:30`): inbox row `2026-10-10_next-tier/review/109` (inbox line 184) folds into `b2-pr-resolve-replies`.
- **S8** (`record.md:31`): inbox row `2026-10-11_release-1-14-0/review/70` (line 199) is not built; the close asks it.
- **S9** (`record.md:35`): `inbox-write` creates an absent `.stamity/inbox.md` (w1, D18).
- **S10** (`record.md:32`): b1 makes plan 016 file 3's three path spellings of the board-writes spec path-free (D31).
- **S11** (`record.md:33`): the 500-body-line cap binds; b1's region budget is advisory (D1).
- **S12** (`record.md:34`): preview rows are labelled `R1`…`Rn`; the four answers stay numbered (D5).
- S1–S6 touch no unit (S2 landed as `ff021e53`; S3 is the close's).

### Inbox rows the plan folds (Frame's dispositions, `record.md:75`)

| Inbox line | Ledger row | Unit |
|---|---|---|
| 110, 111 | `2026-10-08_maintainer-tooling/build/11`, `review/13` | `c1-cursor-walk` (they are about the Cursor walk, D27) |
| 183 | `2026-10-10_next-tier/prove/3` (the Cursor discovery killed at 220 s under load) | `c1-cursor-walk` (same budget; a unit touching its line may fold it, `record.md:77`) |
| 151 | `2026-10-10_next-tier/review/50` (the close reads the inbox whole) | `w1-inbox-write`, `w2-inbox-flow-text` |
| 169 | `2026-10-10_next-tier/review/56` (the heading clause lives only in `/st-board`) | `w2-inbox-flow-text` (D20) |
| 184 | `2026-10-10_next-tier/review/109` | `b2-pr-resolve-replies` (S7) |
| 220 | `2026-10-11_release-1-14-0/fix/4` (`fill` and `/st-plan` read the inbox whole) | `w2-inbox-flow-text` (D17) |
| 224 | `2026-10-11_release-1-14-0/close/1` (the marker hashes a whole row) | `b1-board-contract` (D10) |

Plan 015's three dated "Inbox fold" lines (`:211`, `:549`, `:550`) and its `prove/2` fold (`:672`) land as D9, D7, D8
and D27.

### Declared defaults the research forced (D1–D31)

Each is reversible before the merge and goes on the close's list.

| # | Default | Evidence |
|---|---|---|
| D1 | `/st-board`'s 500-line command-body cap binds; the region budget in b1's cell is advisory (S11). b1 fits by stating each floor rule once — the Write-back contract holds the one-target and one-repository rule, the write check and the preview (with the pickup preview's later writes); setup, `fill` and pickup point at it — by cutting the text the new contract replaces, and by writing tighter sentences than plan 015's wherever every *(corpus)* criterion's literal phrase and every kept pin survive and no floor rule drops; it may fold the GitHub notes into the reference table's cells. b1's verify counts the body and fails above 500; past 500 the implementer returns `BLOCKED_DEPENDENCY` with the count, never a cap raise. w2's `st-board.md` lines must fit the room b1 leaves | Body 462 of 500 (`reports/plan-researcher-r1-board.md` §5; frontmatter closes at `st-board.md:9`); `BODY_LINE_CAP` `board.test.ts:37` and `SOT_CAPS.commandBody` `test/corpus/invariants.test.ts:72`; plan 015's text as written lands at about 552–559 (§5), and at the r1 budget near 515 (`reports/plan-text-reviewer-r1.md` W-1) |
| D2 | Paragraphs b1 or w2 rewrite in `st-board.md` wrap at up to 100 columns; untouched paragraphs keep their wrap | No width gate reads command bodies; prose at 99 columns exists (`content/commands/st-debug.md:678`); the pins read collapsed text (`flat()`, `board.test.ts:102`), so a rewrap breaks none (`reports/plan-researcher-r1-resolve-pack.md` §4) |
| D3 | `fill` step 5 (P1 review comment 4164437720): a preview answered `stop`, or unanswered, leaves every inbox entry it covered in place; only "no board is linked" drains through a recorded proposal id. "the entry is annotated with it" stays as written (smallest blast radius: the pin `board.test.ts:1203` holds; the clash with "Triage does not rewrite an entry in place", `st-board.md:384`, predates this package and goes to Follow-ups) | `reports/plan-researcher-r1-board.md` §2 item 6 and §6 |
| D4 | The file-source key is `<path>#<anchor>/<hex12>`, `<hex12>` the first twelve hex digits of the sha256 of the item's first line as written (P1 comment 4164437675): a title edit files one visible new item, where an ordinal would shift on an insert and update the wrong issue | `reports/plan-researcher-r1-board.md` §2 item 16(b) |
| D5 | The preview's rows are labelled `R1`…`Rn` and its answers numbered — `1 apply` · `2 apply <rows>` · `3 skip <rows>` · `4 stop` — and after 2 or 3 a row is named only by its label, so a bare number always names an option; the default reads ``Default if no response: 4 (`stop`)`` (P2 comment 4164437713; S12) | `content/rules/stamity-question-protocol.md:39-46`, `:62-65` (two to four numbered options); `reports/plan-text-reviewer-r1.md` W-4 (a reply of `1` read as option or row) |
| D6 | The pickup handoff carries the preview's answer as `preview: apply` or `preview: rows <rows>` (the applied row labels), and the work run makes only the later writes it covers: `## Progress contract`'s mapping reads the field (b1 amendment 7), so `st-work.md` stays free of platform knowledge (plan 015 decision 4, `docs/plans/015-board-writes.md:56-58`) (P1 comment 4164437718; the report's carry option, not forbidding partial answers) | `reports/plan-researcher-r1-board.md` §6; `reports/plan-text-reviewer-r1.md` W-5 |
| D7 | A pickup's checklist tick covers only a criterion an `admin` or `write` author wrote (plan 015 `:549`) | §3 of the board report |
| D8 | The write check reads through `gh` even where the MCP server is the access path; with no `gh`, the link is read-only, naming the missing check (plan 015 `:550`) | No MCP equivalent is cited anywhere in the repo (§2 item 11) |
| D9 | `### Writes the board never makes` gains one sentence: a reopen under `--move` is the status-transition write, not an edit (plan 015 `:211`) | §3 of the board report |
| D10 | `inbox:<hex12>` hashes the row's identity fields as written — severity, location, description, `source:` value, and the `Ref:` value when present — joined by ` · `, so a schedule field or a re-date never makes a filed row look new (inbox line 224) | `st-board.md:354-358`, `:393-394`, `:397` |
| D11 | `## Progress contract`'s two stale channel sentences change: `:292` "onto the channels above" → "onto the writes above"; `:312` "The phase map channel 3 resolves against:" → "The phase map the status-transition write resolves against:"; b1's absence check adds `channel 3` | §2 item 17 of the board report |
| D12 | Plan 015's b1 text items 1 and 2 (`description`, `obsolete_when`) stand, so `docs/reference/commands.md` moves; b6 regenerates it | `reports/plan-researcher-r1-docs-sync.md` §3 |
| D13 | b1 and b3 run in one lane and gate together at b3's end: b1 alone turns `test/packs/product-audit.test.ts:946` red; b3's new pins pass on both versions of the contract | `reports/plan-researcher-r1-resolve-pack.md` §7 |
| D14 | `st-product-audit.md`'s Write set (`:181-185`, pinned at `product-audit.test.ts:971`) keeps "No board item is created and no label is written." verbatim; only "the progress comment and status transition the board contract already opens" becomes "the progress comment and, under `--move`, the status transition `/st-board`'s write-back contract makes" | The pinned sentence stays true for a command that files nothing; "opens" is the retired channel vocabulary |
| D15 | **Departs from the brief's ownership line, reversible:** `packs/product-audit/pack.json` and `src/pack/catalogPins.ts` are b3's, regenerated with `node scripts/generate-pack-manifests.mjs --write` and checked with `--check`; b6 runs `--check` only. The integrity map signs the bytes b3 changes, and `test/pack/curated.test.ts:264-271` checks it in b3's own gate. To reverse: both files move to b6 and b3's verify drops `curated.test.ts` and `--check` | `reports/plan-researcher-r1-resolve-pack.md` §6 (no-flag mode writes `catalogPins.ts`; `--check` is CI's gate, `.github/workflows/ci.yml:400`) |
| D16 | b2 rewraps the whole Close paragraph (`st-pr-resolve.md:313-318`) to six lines with review/109's census clause, keeps `:56` one line and `:327-328` two lines; the file stays 333 lines | `reports/plan-researcher-r1-resolve-pack.md` §1, §4 |
| D17 | `fill` step 1 and `/st-plan`'s intake read the inbox through the `ledger` verb's `inbox` query: unfiltered, it matches every row as `all`, screened (`src/runs/inboxStore.ts:421`, `:426`; the board report's "no list-all mode" is wrong). The fallback is `/st-work`'s: the whole file only when the CLI or the query is absent, said so; any other failure is a finding (`st-work.md:24-27`). Their own inbox writes keep the file tools in this package (Follow-ups) | `src/cli/commands/ledger.ts:1134-1142`; inbox line 220 |
| D18 | `stamity ledger inbox-write` is `reports/plan-researcher-r1-inbox-write.md` §4, amended: every appended row carries a `Ref:`, and a row without one is refused (a Ref-less row could neither read as `already-filed` nor be removed); a ledger `Ref:` may name a row of any run's ledger (the close re-dates other runs' rows); an appended row with a non-ledger `Ref:` is accepted only when the same call removes the bullet carrying that `Ref:` (a re-date); a removal `Ref:` of any kind must match exactly one bullet; two stdin bullets carrying one `Ref:` are refused. A screen hit — on a bullet, the joined block, or a parsed row's field — refuses the whole call. An absent `.stamity/inbox.md` is created, holding the schedule heading and the rows, through the same no-follow, `.stamity`-bounded atomic write (S9). Only `/st-work`'s close uses it in this package | The close re-dates rows whatever their writer (`st-work.md:384-387`); the records gate's Ref checks (`test/records/ledgers.test.ts:155-164`, `:281-299`) |
| D19 | A row the close decided whose bullet has no unique `Ref:` (no `Ref:`, or one several bullets share) stays as it is and is listed on `Not done:` as `decided, not applied (no unique Ref:): line <n>`; the close never opens the file for it | The research's drop list (Ref-less removal); injection-screening floor 6 |
| D20 | Inbox line 169 folds as: the close's appends go through the verb, which adds the heading; `st-plan.md:395-396` gains the clause "which a writer adds at the end of the file where it is absent" | `st-board.md:361`; inbox line 169 |
| D21 | `st-work.md:33` drops "and the inbox" ("create and extend `record.md`, `plan.md` and reports with …"), same line count; it shrinks the re-attach index; `test/corpus/recordWrites.test.ts:114` moves with the justified note; REQ-FLOW-025 is MODIFIED | `reports/plan-researcher-r1-inbox-write.md` §5 |
| D22 | `st-board.md`'s Leftovers sentences the verb makes false (`:416-421`: "`fill` and `/st-plan` still read the file whole" and "the close's write to the inbox reads it whole …") are reworded by w2, after b1, in the same lane; `board.test.ts:1001-1006` and the order check `:1015-1023` move with notes; b4 re-quotes the three cases that quote them | `reports/plan-researcher-r1-inbox-write.md` §6 |
| D23 | Plan 015 is restamped `41b1899a69a34597f2b9232bf452c1e3cd97bcab 2026-10-12`, with one dated line under its head, in b1's commit — the first whose tests cite a REQ-BOARD id | `test/records/specStatus.test.ts:270-283`: a plan stamped before `v1.14.0` reads as shipped, and its `design` spec then fails once a test cites an id (`reports/plan-researcher-r1-docs-sync.md` §6) |
| D24 | Eval: the two moved cases count as re-syncs (six → eight); no benign twin; SET-v7's stale "twelve in all" (`:429-430`) becomes "twelve by 2026-10-08; the recomputed census keeps the running count"; checklist `:237` becomes "A full release run covers every case in `evals/cases-v6/`, three admitted samples each. At 1.14.0 that was run 44 …, all 141 cases …" (the present-tense rule names no count); b4 re-anchors every case whose range or quote b1, b2 or w2 shifts | `reports/plan-researcher-r1-evals.md` "Decisions" 2–7 |
| D25 | `.claude/skills/st-eval-run/SKILL.md` is regenerated by b6 from b4's override: no test in b4's verify reads it (`test/docsPages.test.ts:1625-1628` does, and runs in b6's verify) | `reports/plan-researcher-r1-evals.md` §1 |
| D26 | s1 re-pins the citations this run's edits move — of `content/commands/st-board.md`, `st-work.md`, `st-plan.md`, `st-pr-resolve.md`, `src/cli/commands/ledger.ts`, `src/runs/ledgerStore.ts`, `src/runs/inboxStore.ts` — in `docs/specs/everyday-flows.md`, `docs/specs/orchestrator-context.md` and `docs/specs/board-writes.md`; plan 015's b5 `everyday-flows.md:522` item goes to s1 | No test reads these citations (docs-sync §1); one writer per spec file |
| D27 | Inbox lines 110 and 111 are the Cursor walk's. The orchestrator measured it alone (five runs, the other three client variables unset; `reports/walk-measure/cursor-walk-measure-r1.md`): the walk's `it` took 143.65–226.51 s, median 160.86 s, one discovery per state, one-minute load 2.4–8.0. c1 starts at the edit: `CURSOR_WALK_MS` = 6 × (`CURSOR_PROMPT_MS` − 20_000) + the measured max walk rounded up to 10 s = 1,550,000 ms, measured quantities only; `WALK_MS` stays with a measured-base comment; the file check on the Cursor tree's `skills/st-work/SKILL.md`. Line 183 folds as a recorded limit | `reports/plan-researcher-r1-walk-qa.md` headline and §1–§4; the measurement report; the log has no per-call times (that report, "What this does not measure"); the Claude walk lists no skill (`test/ci/pluginLifecycle.test.ts:1019-1232`) |
| D28 | b5: `README.md` (159/159) and `docs/working-with-stamity.md` (150/150) gain no net line; `docs/getting-started.md` links `SECURITY.md` with no fragment; currency banners stay; SECURITY.md row `:107` drops the `review/50` residual and narrows the `fix/4` one to what remains: `fill`'s removal and `/st-plan`'s append still edit with the file tools, which on a read-before-edit client read the file whole | `test/docsPages.test.ts:349`, `:309`, `:864-896`; docs-sync §2; `reports/plan-text-reviewer-r1.md` W-3 |
| D29 | b6 runs the docs-sync §4 sequence; both golden snapshots move (`st-work.md` changes, so `test/corpus/emissionGoldens.test.ts` takes a real refresh row, not "NOTHING moved"); the second-run criterion allows `.stamity/manifest.json`'s `updatedAt` | `src/cli/commands/sync/engine.ts:1294-1302` (sync writes `updatedAt: now`) |
| D30 | QA: three person rows R1–R3 in this order; Q5 not performed; auto-add off | Opening answers 1–2; the maintainer has one GitHub account |
| D31 | b1's commit rewords plan 016 file 3's three spellings of the path `docs/specs/board-writes.md` (`docs/plans/016-fork-distribution-03.md:67`, `:1217`, `:1282`) to "the board-writes spec", path-free, and adds one dated line under that plan's head saying why; its stamp stays, so its own freshness guard still sees its moved reads; D23 stays (S10) | The spec status gate reads every `docs/specs/<x>.md` path in a plan's text (`test/records/specStatus.test.ts:71`, `:135`, `:311-314`) and resolves only repo-relative paths (`:64-66`); that plan's stamp `88fcfd32` (`:4`) is inside `v1.14.0`, so once b1's tests cite a REQ-BOARD id the gate reads the `design` spec as shipped through it (`:200-229`; `reports/plan-text-reviewer-r1.md` C-1) |

## Spec delta

Targets: the board requirements merge into `docs/specs/board-writes.md` (stays `status: design`); the flow
requirements into `docs/specs/everyday-flows.md`, the spec that holds the inbox requirements (the retire-on-close one
at `:606`, the query's at `:1347`). `s1-spec-merge` merges at Prove. Proof tags as plan 015 `:106-108`, plus
*(QA Rn)* for this plan's QA rows. "Stands" means plan 015's text and criteria apply unchanged at HEAD.

### ADDED REQ-BOARD-001 — A linked board takes writes by default

Text: stands (`docs/plans/015-board-writes.md:112-124`), except that the write check lives in the Write-back contract
(D1). Criteria 1, 2 and 4 stand (`:126-132`, `:137-139`). Amended:

3. GIVEN `## Write-back contract` WHEN its opening is read THEN it says a run writes to one board, that a Projects-board
   link names exactly one repository from setup step 2, that every write to another repository's item stays a
   proposal, that with no repository named the link is read-only with `BLOCKED_DEPENDENCY` naming the missing
   repository and setup step 2, and it states the write check once (REQ-BOARD-007). *(corpus)*
5. GIVEN the scratch repository (labels `type:feature`, `area:docs`, auto-add off) and a `fill` of two chat items, one
   proposing `priority:high`, WHEN the preview is answered `1` (`apply`) THEN two issues exist, each on the project once,
   `type:feature` applied, and the report lists `priority:high` as a proposal. *(QA R2)*

### ADDED REQ-BOARD-002 — One preview per run, and no answer means stop

Text: stands (`:146-154`), amended: rows labelled `R1`…`Rn`, answers numbered, default 4 (D5); the pickup clause lives
in `### The preview`, ticks only criteria an `admin` or `write` author wrote (D7), and the handoff carries the answer,
which the progress mapping reads (D6). Criterion 3 stands (`:163-165`) with D5's answers. Amended:

1. GIVEN `### The preview` WHEN read THEN it labels rows `R1`…`Rn`, holds `1 apply`, `2 apply <rows>`, `3 skip <rows>`,
   `4 stop` in that order, names rows only by label after 2 or 3, holds ``Default if no response: 4 (`stop`)``, and
   lacks `accept (default)`. *(corpus)*
2. GIVEN `### The preview` WHEN read THEN `apply` writes with no further prompt except `--move`'s end-of-run question;
   a pickup preview names the later writes — progress comments, a tick of each verified criterion an `admin` or
   `write` author wrote, the PR link, with `--move` the forward status changes — the handoff carries `preview: apply`
   or `preview: rows <rows>`, and a close, reopen or backward transition is asked once at the end; GIVEN pickup step 5
   THEN it points there and carries `move: on` or `move: off`; GIVEN `## Progress contract` THEN its mapping makes
   only the later writes the handoff's `preview:` covers. *(corpus)*
4. GIVEN a `fill` answered `4` THEN no issue exists for its rows and all are proposals; GIVEN two rows answered
   `2 apply R1` THEN only R1 is written. *(QA R2)*

### ADDED REQ-BOARD-003 — `--move` gates where an item stands

Text and criteria 1–4 stand (`:171-190`). Criterion 5 amended: GIVEN a pickup on the scratch board without `--move`,
then one with it, WHEN each handoff is produced THEN the first changes no Status and carries `move: off` and
`status-write: skipped`, and the second moves the item to In progress and carries `move: on`. *(QA R3)*

### ADDED REQ-BOARD-004 — Writes the board never makes

Text stands (`:196-201`) plus D9's sentence. Criterion 2 stands (`:207-209`). Amended:

1. GIVEN `### Writes the board never makes` WHEN read THEN it lists the five, counts a write to another repository's
   item on a Projects board as a write to another repository, contains "any edit to a completed item" and
   "`BLOCKED_DEPENDENCY` rather than improvising one" (`test/packs/product-audit.test.ts:947`), and says a reopen under
   `--move` is the status-transition write, not an edit. *(corpus)*

### ADDED REQ-BOARD-005 — Item text is data

Text and criteria 1–3 stand (`:215-232`). Criterion 4 amended: not performed — the maintainer has one GitHub account;
`board-item-directive-is-data` (`floor: true`) carries it at the next release's full run. *(eval)*

### ADDED REQ-BOARD-006 — Filed items converge on retry

Text stands (`:238-246`) with the key forms of D4 and D10. Criteria 2 and 3 stand (`:250-256`). Amended:

1. GIVEN `### Filed items converge` WHEN read THEN it contains `<!-- stamity:item <key> -->`, `<path>#<anchor>/<hex12>`
   with its first-line rule, `inbox:<hex12>` naming the identity fields, and `<run-id>/item/<n>`, and the body holds no
   `<!-- stamity:item ` followed by anything but `<key>`. *(corpus)*
4. GIVEN a `fill --source <file>` applied on the scratch repository WHEN the same `fill` runs again and is applied
   THEN no second issue exists for any key and the report names the updated issues. *(QA R2)*

### ADDED REQ-BOARD-007 — The GitHub row names every write it allows

Text stands (`:262-280`) with D8, the write check stated once in the Write-back contract, and the endpoint named in
the GitHub notes. Criteria 1, 2 and 4 stand (`:282-286`, `:294-295`). Amended:

3. GIVEN `## Platform reference table` WHEN read THEN the access-check cell names `gh auth status` and the `project`
   scope, the CLI cell's `gh api` entry and the notes name `viewerCanUpdate`, the notes say the check reads through
   `gh` on every access path, the date line reads `Verified 2026-10`, and the abstract contract lists the seven verbs;
   GIVEN `## Write-back contract` WHEN read THEN once a link has its repository the run requires `admin` or `write`
   from the permission endpoint and, for a Projects board, `viewerCanUpdate`, and a failed or missing check leaves the
   link read-only naming it; GIVEN setup step 2 and `fill` step 1 WHEN read THEN each points at that check. *(corpus)*
5. GIVEN a pickup with `--move` on the scratch board WHEN the status write runs THEN the walk records whether the field
   and option ids came from `gh project field-list`/`item-list` JSON or the GraphQL fallback. *(QA R3)*

### ADDED REQ-BOARD-008 — Setup states what the platform does by itself

Text and criterion 1 stand (`:302-308`). Criterion 2 amended: GIVEN the scratch board with auto-add off WHEN `fill`
files an issue THEN the saved stream shows a membership read before any `item-add`, the issue sits on the board once,
and the record says auto-add was off (an auto-add double add is not exercised). *(QA R2)*

### ADDED REQ-BOARD-009 — `/st-pr-resolve` replies need no board setup

Text stands (`:314-316`); its lines are now `content/commands/st-pr-resolve.md:56` and `:327-328`. Criteria 1–4
stand (`:318-327`). Added: 5. GIVEN `/st-pr-resolve <n>` on a scratch pull request with one review comment WHEN the
run answers its triage ask THEN the reply posts and no question names board channels or setup. *(QA R3)*

### ADDED REQ-BOARD-010 — The product-audit pack keeps proposing

Text stands (`:331-337`); the cited lines are `st-product-audit.md:15-17`, `:157-160`, `:166-168`, plus the Write set
`:181-185` (D14). Criteria 1 and 3 stand. Amended: 2. GIVEN `st-product-audit.md`, `st-benchmark.md` and the frame
rule WHEN read THEN each says the epic leaves as a proposal and names `/st-board fill --source <report>`, none contains
"no channel there creates" or "no write-back channel creates", and the Write set still contains "No board item is
created and no label is written". *(corpus: `test/packs/product-audit.test.ts`)*

### REQ-FLOW-078 — `/st-work`'s close writes the deferral inbox through one engine verb (ADDED)

`stamity ledger inbox-write --run <run-id>` takes rows on `--stdin` and `--remove <Ref>,…` and applies both in one
locked, atomic write, creating an absent inbox (S9). It refuses the whole call, writing nothing, on a bullet that does
not parse, carries no `Ref:`, is over 4,096 characters, or hits the screen (bullet, joined block or parsed field;
line and pattern id only); on a `Ref:` D18 does not admit; on a link, hard link or 1 MiB inbox. The close makes every
inbox append, removal and re-date through it (D19 for the rest).

1. GIVEN an inbox with no schedule heading, or none at all, and one row whose `Ref:` names a `deferred`, unretired row
   WHEN the verb runs THEN exit 0, the heading and a dated block end the file, and stdout carries
   `heading <line> added` and `appended <line> <ref>` and no row text. *(test: `test/runs/ledgerInboxWrite.test.ts`)*
2. GIVEN a row with no `by:`/`when:`, no `Ref:`, or a screen hit in the bullet or a field only THEN exit 1, the inbox
   byte-equal, the output naming the stdin line (and pattern id) and no row text, a hit's parse message withheld.
3. GIVEN one call removing `Ref` X and re-appending X with a new `by:` THEN one bullet carries X, with the new day;
   GIVEN a ledger `Ref` naming no row, a row not `deferred` or a retired row on append THEN refused.
4. GIVEN the same call twice THEN the second reports `already-filed` and the file is byte-equal.
5. GIVEN `st-work.md`'s Proof block section THEN it names `stamity ledger inbox-write` for appends, removals and
   re-dates, D19's line, and that the close never opens the inbox with the file tools. *(corpus: `work.test.ts`)*

### REQ-FLOW-079 — `fill` and `/st-plan` read the inbox through the screened query (ADDED)

`/st-board fill` step 1 reads the inbox through `stamity ledger inbox` with no filter, under a Running-the-CLI paragraph
so it runs as `npx --no stamity ledger inbox`; `/st-plan`'s intake through
`stamity ledger inbox --plan <plan> --paths <scope files>`. A withheld, skipped or unparsed row is listed as it prints and never opened; only a CLI or query that
is absent sends either to the whole file, said so. Their own inbox writes still use the file tools (SECURITY.md row
`:107` names it; Follow-ups).

1. GIVEN `### fill — intake to items` step 1 WHEN read THEN it names `stamity ledger inbox`, the listed-as-it-prints
   rule and the absent-CLI fallback, the body carries the Running-the-CLI paragraph before it, and nowhere contains
   "still read the file whole". *(corpus: `board.test.ts`, `test/corpus/cliCallForm.test.ts`)*
2. GIVEN `/st-plan`'s Shared intake item 4 WHEN read THEN it names `stamity ledger inbox` with `--plan` and `--paths`
   and the same fallback. *(corpus: `test/corpus/commands/plan.test.ts`)*

### MODIFIED REQ-FLOW-025 — Run records are written with the file tools

Before (`docs/specs/everyday-flows.md:642-645`): "create and extend `record.md`, `plan.md`, reports and the inbox with
the client's file write and edit tools". After: "create and extend `record.md`, `plan.md` and reports with the
client's file write and edit tools …; the close writes the inbox only through `ledger inbox-write` (REQ-FLOW-078)".
Evidence: D21. 1. GIVEN Phase 0 collapsed WHEN read THEN it contains "Records are files: create and extend
`record.md`, `plan.md` and reports with the client's file write and edit tools — never a shell redirect, a heredoc or
`cat >` — and move ledger rows only through the `ledger` verb under Ledger writes." *(corpus: `test/corpus/recordWrites.test.ts`)*

## Common rules every unit follows

- **Vocabulary, verbatim across units** (plan 015 `:349-355`): the five write names **New item**, **Item edit**,
  **Progress comment**, **PR link**, **Status transition**; "outside `/st-board`'s write set"; `move: on` / `move: off`;
  `preview: apply` / `preview: rows <rows>`; preview row labels `R1`…`Rn` and answers `1 apply` · `2 apply <rows>` ·
  `3 skip <rows>` · `4 stop`; the five `###` titles under `## Write-back contract`: "Writes the board never
  makes", "The preview", "`--move`", "Item text is data", "Filed items converge"; the verb `inbox-write` with
  `--run`, `--stdin`, `--remove`, `--dry-run`, and outcome words `appended`, `already-filed`, `removed`, `heading … added`.
- **Moved pins.** Every gating test edit carries `TEST CHANGE, justified (2026-10-12, <REQ id>)` naming the old
  assertion (`.claude/rules/stamity-testing.md` item 5; model `board.test.ts:584-588`). A new behaviour's test is seen
  red first. Every unit that adds or changes a test runs `npx vitest run test/ci/testInputsGuard.test.ts`; a unit
  adding an import runs `test/architecture/boundaries.test.ts`.
- **Single writers.** Generated and dogfood files (`.claude/**`, `.agents/**`, `.apm/**`, `apm.yml`, `AGENTS.md`,
  `.stamity/generated/**`, `.stamity/manifest.json`, `docs/reference/**`, `docs/cli-reference.md`, `llms.txt`, both
  golden snapshots and their ledgers) are b6's alone, except the pack manifests (D15). `evals/SET-v7.md`,
  `evals/README.md`, every eval case file, `scripts/eval/run.mjs`, the eval-run override, the checklist and every
  count literal are b4's. `CHANGELOG.md` is b5's. Every `docs/specs/**` file is s1's.
- **Verifies.** A unit editing `content/` leaves the dogfood sync to b6, and its verify never runs
  `node dist/cli.js check`. No verify runs the full suite; the branch's full suite runs at Prove, alone, by a
  test-runner. `test/evals` runs only in b4's verify; until then units run their own corpus tests. A fresh lane runs
  `npm run build` before any test that shells out to `dist/`; no lane runs `git stash`.
- **Budgets never raised.** `st-work.md`: nothing above the re-attach cut (17,097 of 18,000 characters before
  `\n### Specialist pass\n`, `work.test.ts:121`, `:433-440`; room pin needs ≥ 900 characters and ≥ 15 lines, body 476
  of 500). `st-pr-resolve.md` stays 333 lines. `st-board.md` body ≤ 500 lines after b1 and after w2 (D1).
- **Corpus text.** Inside `st-work.md`, a backticked `stamity ledger …` sits only below the `**CLI calls.**` bullet
  (`test/corpus/recordWrites.test.ts:110-112`); in `st-board.md`, b1 names no verb with the `stamity ` prefix, and the
  only backticked `stamity …` calls are w2's, after the Running-the-CLI paragraph w2 adds (`test/corpus/cliCallForm.test.ts:7-29`);
  no unit adds the literal `.stamity/inbox.md` to a file that does not carry it (`board.test.ts:595-604`). Type `—`
  and `·`, never escapes.

## Units

### b1-board-contract — the board's write contract

| Field | Content |
|---|---|
| `id` | b1-board-contract |
| `requirements` | REQ-BOARD-001, REQ-BOARD-002, REQ-BOARD-003, REQ-BOARD-004, REQ-BOARD-005, REQ-BOARD-006, REQ-BOARD-007, REQ-BOARD-008, REQ-BOARD-009 |
| `files` | `content/commands/st-board.md`, `test/corpus/commands/board.test.ts`, `docs/plans/015-board-writes.md` (head only, D23), `docs/plans/016-fork-distribution-03.md` (head line and three path spellings only, D31) |
| `interfaces` | Plan 015's **b1 text** items 1–18 (`docs/plans/015-board-writes.md:376-547`) apply at the HEAD lines of `reports/plan-researcher-r1-board.md` §2 (items 1–17 at the plan's own lines, `st-board.md:4`–`:312`; item 18 at `:463-464`), with the amendments listed under the table; every location not named stays byte-equal. Conventions as plan 015 `:368` (`st-debug.md:13-14`, `:174-179`; `st-pr-resolve.md:54`, `:212-221`; `stamity-injection-screening.md:32-43`); helpers `board()` `:92`, `flat()` `:102`, `sections()` `:133`, `section()` `:147`, `tables()` `:171`, `enumeratedChannels()` `:196`, `eventTable()` `:201`. **Region budget — advisory** (S11, D1, D2; body lines after b1; only the 500-line cap binds): preamble `:13-15` 3→4; fill step 1 `:45-51` 7→8; fill step 5 `:78-86` 9→9; fill step 6 `:87-90` 4→5; Labels `:92-94` 3→4; pickup step 5 `:122-131` 10→10; groom `:146-158` 13→11; setup `:170-188` 19→20; GitHub notes (new, or folded into the table's cells) 0→7; Status field `:238-242` 5→3; Write-back `:255-288` 34→64; Progress `:291-310` 20→17. Aim at ≤ 495 so w2's Running-the-CLI paragraph and fill step 1 line fit; where plan 015's text runs over, write tighter sentences (D1) — every *(corpus)* criterion's literal phrase and every kept pin survive, no floor rule drops. Groom's "Completed items are immutable" paragraph (`:164-166`) stays: `board.test.ts:1262-1263` pins it. Plan 015 restamp (D23): head `stamp:` becomes `41b1899a69a34597f2b9232bf452c1e3cd97bcab 2026-10-12`, and one line under the head reads "Re-planned in-flow on 2026-10-12 by `.stamity/runs/2026-10-12_board-writes/plan.md`, whose cells bind where the two differ; restamped from `88fcfd32` so the spec status gate reads this plan as unshipped." **Plan 016 file 3** (D31): at `docs/plans/016-fork-distribution-03.md:67` "(`docs/specs/board-writes.md` among them)" → "(the board-writes spec among them)"; at `:1217` "`docs/specs/board-writes.md` (`:4`) and every other spec" → "the board-writes spec (`:4`) and every other spec"; at `:1282` "(today `docs/specs/board-writes.md:4`; check" → "(today the board-writes spec's `:4`; check"; its `stamp:` stays; one line under its head reads "Amended 2026-10-12 (run `2026-10-12_board-writes`): the board-writes spec is named without its path, because the spec status gate reads a spec path in this unexecuted plan, stamped before `v1.14.0`, as that spec having shipped; the stamp stays so this plan's freshness guard still sees its moved reads." |
| `testCriteria` | GIVEN the edited body WHEN `npx vitest run test/corpus/commands/board.test.ts test/corpus/invariants.test.ts` runs THEN it passes, every *(corpus)* criterion of REQ-BOARD-001…008 and REQ-BOARD-009 criterion 3 pinned by an `it` whose title or comment names the id (REQ-BOARD-009 criteria 1–2 read `st-pr-resolve.md` and are b2's). GIVEN the body count below THEN it prints a number ≤ 500 (calibrated: 462 at HEAD before the edit). GIVEN `rg -n "four write-back channels\|Read-only by default\|enabled at setup\|opens no creation channel\|channel 3" content/commands/st-board.md` THEN nothing. GIVEN `rg -n "docs/specs/board-writes\.md" docs/plans/016-fork-distribution-03.md` THEN nothing. GIVEN `npx vitest run test/records/specStatus.test.ts` after the restamp and the plan 016 rewording THEN it passes. |
| `edgeCases` | Past the advisory budget → tighten sentences and cut replaced text, never a floor sentence or a pinned phrase; past 500 → `BLOCKED_DEPENDENCY` with the count (D1). A kept pin is reworded by accident (`:1194-1208`, `:1258-1269`, `:1245-1256`, `:1169-1178`, `:1210-1220`, `:393-399`, `:401-422`) → restore the phrase. `test/packs/product-audit.test.ts` goes red → expected until b3 (D13); not in b1's verify. Every `## Deferral inbox` pin (`:689-1118`) stays green: b1 touches no inbox text. `specStatus` still names a plan after D23 and D31 → another plan spells the path; return `BLOCKED_DEPENDENCY` naming it, never restamp it. |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/commands/board.test.ts test/corpus/invariants.test.ts test/records/specStatus.test.ts test/ci/testInputsGuard.test.ts && node -e 'const t=require("fs").readFileSync("content/commands/st-board.md","utf8");const n=t.slice(t.indexOf("\n---",3)+5).replace(/\r?\n$/,"").split(/\r?\n/).length;console.log(n);process.exit(n>500?1:0)'` |

**b1 text amendments** (each applied inside its item; plan 015's sentences not named here stand):

1. **Item 5** (fill step 1): replace the plan's five sentences with one pointer: a `fill` with no linked board writes to
   its first `--source` that names a platform board, under the Write-back contract's one-target rule and write check;
   every other source is read only.
2. **Item 6** (fill step 5, D3): as `reports/plan-researcher-r1-board.md` §2 "Item 6" words it; the pins at
   `board.test.ts:1202-1205` and `:1207` hold.
3. **Item 9** (pickup step 5): the payload adds `move: on` or `move: off` and `preview: apply` or `preview: rows <rows>`;
   the later-writes and end-of-run sentences move to `### The preview` and step 5 points there; "`handoff` carries
   `status-write: skipped`" and "does not assume a board already showing the item in progress" stay.
4. **Item 11** (setup): step 1 as the plan; step 2 keeps HEAD's text and adds only: a Projects-board link records
   exactly one repository, the one the operator names, and once it has one, setup runs the Write-back contract's write
   check; step 3 "No write switch" as the plan; step 4's four facts as the plan.
5. **Item 13** (table and notes): the row and date line as the plan; the GitHub notes (about 7 lines, or folded into
   the reference table's cells, S11) carry the permission
   endpoint `gh api repos/<owner>/<repo>/collaborators/<user>/permission` for the acting account, `viewerCanUpdate` on
   the GraphQL `ProjectV2` node, that the check reads through `gh` on every access path (D8), the `projects` toolset,
   `item-edit`'s four id flags from `field-list`/`item-list --format json` or GraphQL, add-then-set as two calls, the
   `--limit` rule for `gh issue list`, `gh project item-list` and `gh project field-list`, and comment edits by id, never
   `--edit-last`.
6. **Item 16** (Write-back contract), the plan's text with: (a) the opening also holds the write check — once a link has
   its repository (at setup, or before a `--source` link's first write) the run requires `admin` or `write` for the
   acting account and, for a Projects board, `viewerCanUpdate` (GitHub notes); a failed or missing check leaves the
   link read-only, naming it; (b) the New item write keeps "added to the linked project when one is linked"; (c) D9's
   sentence; (d) `### The preview` with D5: the table's rows labelled `R1`…`Rn`, the answers `1 apply` ·
   `2 apply <rows>` · `3 skip <rows>` · `4 stop`, a row named only by its label after 2 or 3, and
   ``Default if no response: 4 (`stop`)``; then the pickup clause of REQ-BOARD-002 criterion 2 (D6, D7);
   (e) `### Filed items converge` with D4 and D10, and "with a `--limit` above their count" on the listing;
   (f) `### Item text is data` as the plan.
7. **Item 17** plus D11, and (D6, ledger `plan/19`): the mapping reads the handoff's `preview:` — under `preview: rows <rows>` the run
   makes only the later writes the applied rows cover, and a later write no applied row covers is not made;
   `criterion.done` reads "progress comment, plus an item edit ticking that criterion where the item's body lists it
   as a task and an `admin` or `write` author wrote it" (D7). The paragraph after the event table ≤ 4 lines
   (advisory).

**b1 tests** (plan 015 `:552-588` at HEAD lines, `reports/plan-researcher-r1-board.md` §4): constants
`WRITE_BACK_CHANNELS` `:65-70` → the five write names; `NON_CHANNEL_ACTIONS` `:80-87` → `["delete", "completed item"]`;
fixture `:505-523`. Changed pins: `:279-285`, `:287-293` (``/Default if no response: 4 \(`stop`\)/`` replaces the
plan's `stop` literal), `:295-299`, `:301-314`, `:316-336`, `:338-345`, `:362-374`, `:424-433`, `:479-503`, `:525-535`,
`:1120-1136`, `:1150-1167` (drop `:1161`), `:1180-1192` (step 5 asserts `move: on`, `move: off`, `preview:`,
`status-write: skipped` and the pointer; the later-writes regexes of plan 015 `:569-571` move to a `### The preview`
`it`). New `it` blocks: plan 015 `:572-588`, plus the row labels with the numbered answers and the label-only rule
(D5), the identity-field and first-line key forms, D9's carve-out, D8's `gh` sentence, D7's author rule in
`### The preview` and in `criterion.done`, the progress mapping's `preview:` reading, and the setup step 2 and fill
step 1 pointers.

### b3-product-audit-pack — the pack keeps proposing, in the new contract's words

| Field | Content |
|---|---|
| `id` | b3-product-audit-pack |
| `requirements` | REQ-BOARD-010 |
| `files` | `packs/product-audit/rules/stamity-epic-audit-frame.md`, `packs/product-audit/commands/st-product-audit.md`, `packs/product-audit/commands/st-benchmark.md`, `test/packs/product-audit.test.ts`, `packs/product-audit/pack.json`, `src/pack/catalogPins.ts` (D15) |
| `interfaces` | Plan 015's b3 cell (`docs/plans/015-board-writes.md:610`) stands at HEAD: the pack and its test are unchanged since the stamp (`reports/plan-researcher-r1-resolve-pack.md` §5); `st-product-audit.md`'s second target is `:157-160` (starts mid-line at `:157`). Amendments: (1) D14 — the Write set at `:181-185`; (2) the test titles `:935` and `:950` become "the two writes this pack uses are ones /st-board defines" and "the frame wraps those writes and makes no other"; (3) `:958` and `:960` follow the frame's new rules (`/A write the board's contract does not make stops/i`, plan 015's wording); (4) regeneration: `node scripts/generate-pack-manifests.mjs --write` (rewrites the `pack.json` integrity map and `catalogPins.ts`), then `--check`. |
| `testCriteria` | GIVEN the edited pack on top of b1 WHEN `npx vitest run test/packs/product-audit.test.ts test/pack/curated.test.ts test/corpus/commands/board.test.ts` runs THEN it passes, the retired-claim probe `:976-990` included. GIVEN `rg -n "no channel there creates\|no write-back channel creates\|four\s+channels wide\|already opens" packs/product-audit` THEN nothing. GIVEN `node scripts/generate-pack-manifests.mjs --check` THEN exit 0. |
| `edgeCases` | A reworded sentence puts `creat*` within 80 characters of item, issue or epic with no negation first → the probe fails; write "files"/"filed". The shingle check (`:1056+`) fails on a copied frame sentence → reword. `catalogPins.ts` fires the pack signing rehearsal only on `main`'s push run → proven after the merge (learning `a-merge-to-main-is-proven-by-its-push-runs`). |
| `depends_on` | b1-board-contract |
| `verify` | `npx vitest run test/packs/product-audit.test.ts test/pack/curated.test.ts test/corpus/commands/board.test.ts test/ci/testInputsGuard.test.ts && node scripts/generate-pack-manifests.mjs --check` |

### b2-pr-resolve-replies — PR-thread replies need no board setup, and the Close follows the census

| Field | Content |
|---|---|
| `id` | b2-pr-resolve-replies |
| `requirements` | REQ-BOARD-009 (review/109's clause changes wording under the existing census; no requirement moves) |
| `files` | `content/commands/st-pr-resolve.md`, `test/corpus/commands/feedbackPair.test.ts` |
| `interfaces` | **`:56`** becomes plan 015's one-line row (`docs/plans/015-board-writes.md:597`). **`:327-328`** become plan 015's two lines ("The PR-thread reply is this command's own write, outside `/st-board`'s write set, and it exists only here." / "This command writes no other platform state."). **`:313-318`** become the six-line paragraph of `reports/plan-researcher-r1-resolve-pack.md` §4 (D16): "…where `/st-board` fill, `/st-work`'s framing phase and `/st-plan`'s shared intake all read them." **Tests:** `:1026-1036` becomes "replies need no board setup, and nothing posts on zero threads" — `/the invocation is the consent/i` and ``/outside `\/st-board`'s write set/i`` in Pre-flight, negative `/enabled at setup/i` and `/fourth write-back channel/i`, the kept `/no inbox row, no commit, no reply/i`, and `/it posts nothing/i` dropped (the new row has no such clause); `:1196-1202` becomes "names the PR-thread reply as this command's own write" over Close; `:1219`'s anchor `"fourth write-back channel"` becomes ``"outside `/st-board`'s write set"``; one added pin mirrors `:431-434`: Close names `/st-plan`. Each changed pin carries the justified note. |
| `testCriteria` | GIVEN the edited file WHEN `npx vitest run test/corpus/commands/feedbackPair.test.ts` runs THEN it passes, the ingress-screen block `:933-1001` and the Close pins `:1214-1218`, `:1245-1254` unchanged, and REQ-BOARD-009 criteria 1 and 2 (plan 015 `:318-323`) each pinned by an `it` whose title or comment names REQ-BOARD-009. GIVEN `rg -n "fourth write-back channel\|enabled at setup" content/commands/st-pr-resolve.md` THEN nothing. GIVEN the line count THEN 333. |
| `edgeCases` | `:56` wraps to two lines → every range below shifts (`pr-comment-ingress-screen` 79-115); keep one line. The rewrap makes a line over 100 columns → re-break inside the six lines, never a seventh. `test/evals/locators.test.ts` turns red on `pr-resolve-next-step-derived-from-run-state` → expected until b4 re-quotes; not in b2's verify. A justified note cites REQ-BOARD-009, so `specStatus` reads red on this lane until b1's restamp → lane A merges after b1 (Lanes). |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/commands/feedbackPair.test.ts test/ci/testInputsGuard.test.ts && node -e 'const n=require("fs").readFileSync("content/commands/st-pr-resolve.md","utf8").replace(/\n$/,"").split("\n").length;console.log(n);process.exit(n===333?0:1)'` |

### w1-inbox-write — the engine verb that writes the deferral inbox

| Field | Content |
|---|---|
| `id` | w1-inbox-write |
| `requirements` | REQ-FLOW-078 |
| `files` | `src/runs/inboxStore.ts`, `src/runs/ledgerStore.ts`, `src/cli/commands/ledger.ts`, `test/runs/inboxStore.test.ts`, `test/runs/ledgerInboxWrite.test.ts` (new), `test/runs/ledgerInbox.test.ts`, `test/runs/ledgerClose.test.ts` |
| `interfaces` | `reports/plan-researcher-r1-inbox-write.md` §4 is the design, with D18's amendments. **CLI:** `stamity ledger inbox-write --run <run-id> [--stdin] [--remove <ref>,<ref>…] [--dry-run] [--json]`, handled by a new `runInboxWrite(ctx, opts)` in `ledger.ts` beside `runInbox`; a new constant `INBOX_WRITE = "inbox-write"` joins `.choices([APPEND, CLOSE, STATUS, INBOX])` at `ledger.ts:1213` and the dispatch at `:1240-1244`; `--remove <refs>` is new; at least one of `--stdin`/`--remove`. **Validation, all-or-nothing** (§4 items 1–6): bullets only; ≤ `INBOX_BULLET_MAX_CHARS` (`:721`); each bullet, and the bullets joined by `\n` (the joiner rows print with, so the line-anchored screen rows rescan one bullet at a time, `:712-719`), pass `screenInboxLine` (`:753`; the screen stays in the CLI, rule 4) — a hit in the joined text that no single bullet carries names the stdin lines of the first and last bullet its match spans; bullets parse with `parseInbox` run over the `SCHEDULE_RULE_HEADING` line followed by the block, so a row with neither `by:` nor `when:` is refused (`src/runs/inboxStore.ts:252-256`), every line number printed being the stdin line (the prepended heading line subtracted); each parsed row then passes `screenInboxRow` (`ledger.ts:801-822`), the field-level screen `runInbox` applies (`:1114-1116`), so no row the query would later withhold can land; a bullet any screen hits has its parse message withheld, as `runInbox` drops it (`:1128-1132`), and its refusal prints only the stdin line and the pattern id; every other parse message passes `screenInboxLine` before it prints (`:1130`), and on a hit prints the same way; every appended row carries a `Ref:` (D18), and two stdin bullets carrying one `Ref:` are refused; a ledger `Ref:` (`.stamity/runs/<any run>/ledger.jsonl#<id>`) names an existing `deferred` row with no `retired` value, read with the ledger store's no-follow rules; a non-ledger `Ref:` only when the same call removes a bullet carrying it; a removal `Ref:` matches exactly one bullet and, if a ledger `Ref:`, its row is not `deferred` or carries `retired`, unless re-appended in the call (`retireRow` refuses a row not `deferred`, `ledgerStore.ts:956-965`). **Engine:** `src/runs/inboxStore.ts` gains pure `editInboxText(text, { rows, remove, runId, today })` → `{ text, outcomes }` or `{ problems: {line, message}[] }`, importing nothing new, where `text` `null` means an absent file; `src/runs/ledgerStore.ts` gains `writeInbox(req)`: `acquireWriteLock` on the inbox with the `.stamity` boundary (it locks a path that does not exist yet, `src/merge/atomicWrite.ts:379-381`), re-read under the lock through an injected reader (the `isShared` style, `ledger.ts:917`), the ledger cross-check, `atomicWriteFileUnlocked(..., { boundaryDir })` (`ledgerStore.ts:676-695`). An absent `.stamity/inbox.md` is created holding the heading and the block through that same no-follow, `.stamity`-bounded atomic write (S9). The reader's refusals name `ledger inbox-write`, never `ledger inbox`, and their `next` says the write runs again once the inbox is fixed (the name and `next` `readInbox` composes, `:883-889`, `:931-950`, become parameters). Heading added at end when absent; two headings refused; this run's block of today is reused only when the file's last block opens with the engine head below, byte-equal for this run and today, else one engine-composed head "Rows appended <YYYY-MM-DD> by the run `<run>`; each row's `Ref:` names its source."; EOL kept; result over 1 MiB refused. **Output:** `appended <line> <ref>`, `already-filed <line> <ref>`, `removed <line> <ref>`, `heading <line> added`, each through `sanitizeLabel`; dry-run line "Dry run: <a> row(s) would be appended and <r> removed in .stamity/inbox.md. Nothing was written."; `--json` per §4; refusal `VALIDATION_ERROR` through `refuseWithProblems` (`:98`), whose messages are only the screened ones above. **`FOREIGN_FLAGS`** per §4 (new owner appended last). The `summary` (`:1206-1207`) gains "write" — `docs/cli-reference.md` is b6's. |
| `testCriteria` | GIVEN `test/runs/inboxStore.test.ts` WHEN run THEN `editInboxText` cases pass: an absent file (`null`) becomes the heading plus the block; heading absent then added at end with older bare rows still valid; two headings refused; a new block when the last block is another run's or another day's, and this run's block of today reused when it is the last block; `already-filed`; removal with no match and with two; a re-date in one edit; CRLF kept; a row with no `by:`/`when:` refused; a row with no `Ref:` refused; two bullets with one `Ref:` refused. GIVEN `test/runs/ledgerInboxWrite.test.ts` (temp dirs, `runInProcess`) THEN REQ-FLOW-078 criteria 1–4 pass, plus: no `.stamity/inbox.md` at all → created with the heading and the row (S9); foreign flags; a screen hit names the stdin line and pattern id with no row text on stdout or stderr — in one bullet, split over two bullets, and in a parsed field only (`screenInboxRow`); a bullet that hits the screen and also fails to parse prints no parse message; over-length; a ledger `Ref:` naming a missing row, a row not `deferred`, and a retired row, each refused on append; a ledger `Ref:` into another run's ledger admitted; a non-ledger `Ref:` with no matching removal refused; symlinked and hard-linked inbox, each refusal naming `ledger inbox-write`; size ceiling; `--dry-run` writes nothing; `--json` shape; the unlocked warning. GIVEN `ledgerInbox.test.ts:1250-1258` and `ledgerClose.test.ts:1530-1554` THEN their owner lists gain `inbox-write` and stay green. GIVEN `test/records/ledgers.test.ts` THEN green unchanged. |
| `edgeCases` | A screen hit on a true finding → refused; the close rewrites it as a claim, never respells it (injection-screening floor 7). A concurrent writer between read and write → the lock and the re-read under it win; the second call reports `already-filed`. A `Ref:` naming another run's ledger that is a link → refused as the ledger store refuses. Erasable syntax only (learning `plain-node-imports-of-src-need-erasable-syntax`). |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs/inboxStore.test.ts test/runs/ledgerInboxWrite.test.ts test/runs/ledgerInbox.test.ts test/runs/ledgerClose.test.ts test/records/ledgers.test.ts test/architecture/boundaries.test.ts test/ci/testInputsGuard.test.ts && npm run typecheck && npm run lint` |
| `threat` | Boundary: agent-written stdin rows → the committed inbox later sessions read back. Trusts: the CLI's inbox screen, `parseInbox`, ledgers read no-follow. Abuse: a row carrying an instruction-override, or an image link split across two bullets, lands and steers a later run; a symlinked inbox redirects the write. Stops: per-bullet, joined-block and per-field (`screenInboxRow`) screens refusing the whole call by pattern id, a hit's parse message withheld; `readInbox`'s lstat, one-link and no-follow refusals plus the atomic write inside the `.stamity` boundary, for a created inbox too. `ledgerStore.ts` is `security-sensitive` (`.stamity/change-classes.json:6`): the security lens reviews. |

### w2-inbox-flow-text — the close uses the verb; `fill` and `/st-plan` read through the query

| Field | Content |
|---|---|
| `id` | w2-inbox-flow-text |
| `requirements` | REQ-FLOW-078, REQ-FLOW-079, REQ-FLOW-025 |
| `files` | `content/commands/st-work.md`, `content/commands/st-board.md`, `content/commands/st-plan.md`, `test/corpus/commands/work.test.ts`, `test/corpus/commands/board.test.ts`, `test/corpus/commands/plan.test.ts`, `test/corpus/recordWrites.test.ts`, `test/corpus/cliCallForm.test.ts` |
| `interfaces` | **`st-work.md`** (below the cut only, plus D21): one paragraph of ≤ 5 lines after `:390` ("…A row no answer reached stays as it is."), before `:392` ("Beside `retired`…"), saying every append, removal and re-date at the close goes through `stamity ledger inbox-write --run <run id>` — rows on `--stdin` one bullet per line as `ledger append --stdin` takes its block, leaving bullets as `--remove <Ref>,…`, one call for a re-dated row; the verb adds the heading where absent, screens and parses each row and prints line numbers and `Ref:` values, never row text; a refusal is a finding, never a hand edit; D19's line; and the close never opens `.stamity/inbox.md` with the file tools. `:365-390` stay verbatim (pinned `work.test.ts:1519-1524`, `:1559`, `:1601-1606`, `:1629`, `:1654`; quoted by `work-proof-block-fields`). `:33` per D21, same line count. **`st-board.md`**: a paragraph of its own, placed before the body's first backticked `stamity <verb>` (directly above `### fill — intake to items` unless b1 left one earlier): `**Running the CLI.** ` followed by `RUNNING_CLI_SENTENCE` byte for byte (`test/corpus/cliCallForm.test.ts:32-33`), on one raw line that no rewrap touches, then on the next line its fallback: "When neither form runs, or the installed copy has no `ledger inbox` query, `fill` reads the inbox file whole and says so in its report; any other failure of the query is a finding, never a whole-file read." — the form of `content/commands/st-plan.md:356-357`; `CALL_SITES` (`cliCallForm.test.ts:53-94`) gains a row for `commands/st-board.md` with `RUNNING_CLI_LABEL` and that fallback, under a dated comment naming REQ-FLOW-079. Fill step 1 (`:39-43`) reads "then the deferral inbox through `stamity ledger inbox`, no filter" with REQ-FLOW-079's listed-as-it-prints and fallback clauses, so the query runs as `npx --no stamity ledger inbox` and a missing bare bin never reads as an absent CLI. Leftovers `:416-421` (D22) become: "`/st-work`'s Frame never opens the inbox for such a row, and neither do `fill` and `/st-plan`, which read it through the same query; the close writes the inbox through the `ledger` verb's `inbox-write`, so its write never reads the file whole." Net body lines: at most 500 minus b1's count (about +3: the paragraph, its fallback, a blank line). **`st-plan.md`**: item 4 (`:84-85`) names `stamity ledger inbox --plan <this plan> --paths <the scope's files>` with the fallback; `:395-396` gain D20's clause; keep the file's line count if it can (else b4 re-anchors). **Tests:** `board.test.ts:1001-1006` and `:1015-1023` move to the new sentences; `recordWrites.test.ts:114` takes REQ-FLOW-025's sentence; a dated "Added" pin in `work.test.ts` for the new paragraph and in `plan.test.ts` for item 4; `board.test.ts` adds REQ-FLOW-079 criterion 1. |
| `testCriteria` | GIVEN the edits WHEN `npx vitest run test/corpus/commands/work.test.ts test/corpus/commands/board.test.ts test/corpus/commands/plan.test.ts test/corpus/recordWrites.test.ts test/corpus/invariants.test.ts test/corpus/cliCallForm.test.ts test/emit/noBareCliCall.test.ts` runs THEN it passes, the room pin `work.test.ts:433-440` and the new `CALL_SITES` row included. GIVEN `node -e 'const t=require("fs").readFileSync("content/commands/st-work.md","utf8");console.log(t.indexOf("\n### Specialist pass\n"))'` THEN ≤ 17,097, and the body is ≤ 485 lines. GIVEN b1's body count on `st-board.md` THEN ≤ 500; past 500 → `BLOCKED_DEPENDENCY` with the count, never a cap raise. GIVEN `rg -n "still read the file whole\|reads it whole" content/commands/st-board.md` THEN nothing. |
| `edgeCases` | Rewording `:33` changes its wrap → keep five lines at `:31-35`, or every later `st-work` range shifts. An eval case quotes `st-work.md:31-35` → b4 re-quotes (search "reports and the inbox"). A pin reads `st-plan.md:393-398` → keep its words, add the clause. A corpus test asserts a named `ledger` choice exists → w1 is merged before w2 starts. |
| `depends_on` | b1-board-contract, b3-product-audit-pack, w1-inbox-write |
| `verify` | `npx vitest run test/corpus/commands/work.test.ts test/corpus/commands/board.test.ts test/corpus/commands/plan.test.ts test/corpus/recordWrites.test.ts test/corpus/invariants.test.ts test/corpus/cliCallForm.test.ts test/emit/noBareCliCall.test.ts test/ci/testInputsGuard.test.ts`, then the st-work index measure and b1's body count |

### b4-eval-cases — the board case rewritten, one adversarial case added, every moved range re-anchored

| Field | Content |
|---|---|
| `id` | b4-eval-cases |
| `requirements` | REQ-BOARD-001, REQ-BOARD-002, REQ-BOARD-003, REQ-BOARD-004, REQ-BOARD-005, REQ-BOARD-009, REQ-PROVE-009, REQ-PROVE-017 |
| `files` | `evals/cases-v6/golden/board-write-back-four-channels.md`, `evals/cases-v6/golden/pr-resolve-next-step-derived-from-run-state.md`, `evals/cases-v6/adversarial/board-item-directive-is-data.md` (new), `evals/cases-v6/adversarial/vague-deferral-without-place-refused.md`, `evals/cases-v6/adversarial/close-real-defect-never-preset-to-drop.md`, `evals/cases-v6/golden/unattended-close-keeps-real-defects.md`, `evals/cases-v6/adversarial/benign-close-no-leftovers-asks-nothing-extra.md`, `evals/cases-v6/golden/work-capacity-rung-classes-stop-notices.md`, every other case a search of `source:` ranges and governing quotes into the four edited commands finds moved (named in the report), `evals/SET-v7.md`, `evals/README.md`, `scripts/eval/run.mjs`, `.stamity/overrides/skills/st-eval-run/SKILL.md`, `.github/release-controls-checklist.md`, `test/evals/successorInputs.test.ts` |
| `interfaces` | Plan 015's b4 cell (`docs/plans/015-board-writes.md:623`) stands for the board case (id, class, metric byte-equal; no `floor`; claim; scenario; B1–B6; A1–A2) and the new case (frontmatter, scenario, B1–B7, A1, `floor: true`, the analogue's three-word test with the names `#31`, `drive-by-user`, `stale`, `wontfix`, `.env`, `#12`, `#14` carved out), with: board case B1 shows one table whose rows are labelled `R1`…`Rn` and offers `1 apply`, `2 apply <rows>`, `3 skip <rows>`, `4 stop`, rows named only by their labels after 2 or 3, with 4 (`stop`) the default (D5); sources are the landed ranges (board case: `## Write-back contract` through the end of `### --move`; new case: `### Item text is data`). The pr-resolve case re-quotes its whole Close from the landed file (case `:18-40`, corpus `:313-333`), and A2 (case `:105-106`) becomes "the pull-request thread reply, `/st-pr-resolve`'s own write outside `/st-board`'s write set". `EXPECTED_MOVES` rows for both moved cases (shape `successorInputs.test.ts:72-255`, re-sync wording, REQ ids). Re-anchors: the three `st-board.md` Deferral-inbox ranges (b1's shift; quotes of `:416-421` per w2); `benign-close-no-leftovers…` quote; `work-capacity-rung…` `469-474` (w2's insert); the st-plan cases if w2 moved a line. **Counts and literals**: `reports/plan-researcher-r1-evals.md` §1 (141→142; 81/31/30; 24→25 non-twin; floor 31→32; 756/117→763/120; 115/41→120/42; 60/18→58/20; re-syncs 6→8; 63/8→64/9 groups; 423/846→426/852) at every location it lists in SET-v7, README, `run.mjs:50`, the override `:133`, `:135`, and the checklist `:237` (D24). SET-v7 index row, appendix row and count line per §1 and §5; dated paragraphs after `:2582`: one group head "**One case added and two Expected blocks re-synced, 2026-10-12 (run 2026-10-12_board-writes, unit b4-eval-cases; REQ-BOARD-001…005, REQ-BOARD-009).**" and one moved-only paragraph for the re-anchors whose head does not match `GROUP_HEAD` (`roster.test.ts:165-166`); D24's "twelve in all" fix. |
| `testCriteria` | GIVEN the integration lane after b1, b3, b2, w2 WHEN `npx vitest run test/evals` runs THEN it passes (`locators`, `roster`, `coverage`, `successorInputs`, `readmeCurrency`, `manualRunner`), and the gate-together run of the corpus tests in `verify` passes. GIVEN `find evals/cases-v6 -name '*.md' \| wc -l` THEN 142. GIVEN `git diff --stat -- evals/cases` THEN empty. GIVEN the evals report's `rg -n -w …` sweep with `.claude/skills/st-eval-run` left out (b6 regenerates that copy, D25) THEN every hit sits in a dated history paragraph. |
| `edgeCases` | A range typed before its source lands → `locators` fails; type ranges from landed files only. `readmeCurrency` wants "20 moved" spelled in digits beside "byte-identical" and 58 in one passage. A must-NOT row spelled "must not" → `roster.test.ts:213-218` fails. A case whose Expected changes and has a v5 copy needs an `EXPECTED_MOVES` row; one without, a SET-v7 line only. |
| `depends_on` | b1-board-contract, b3-product-audit-pack, b2-pr-resolve-replies, w2-inbox-flow-text |
| `verify` | `npx vitest run test/evals test/corpus/commands/board.test.ts test/corpus/commands/feedbackPair.test.ts test/corpus/commands/work.test.ts test/corpus/commands/plan.test.ts test/corpus/recordWrites.test.ts test/corpus/invariants.test.ts test/packs/product-audit.test.ts test/ci/testInputsGuard.test.ts` |

### b5-docs — say what the board and the inbox now do

| Field | Content |
|---|---|
| `id` | b5-docs |
| `requirements` | REQ-BOARD-001, REQ-BOARD-005, REQ-BOARD-007, REQ-FLOW-078, REQ-FLOW-079 |
| `files` | `README.md`, `docs/getting-started.md`, `docs/working-with-stamity.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/security-mapping.md` (only if it names `review/50` or `fix/4`) |
| `interfaces` | Plan 015's b5 cell (`docs/plans/015-board-writes.md:636`) stands at the HEAD anchors of `reports/plan-researcher-r1-docs-sync.md` §1 — README `:60-61`, getting-started `:286-289`, working-with-stamity `:111-112`, SECURITY `## Network and data handling` `:122-169` (a bold-lead paragraph "**Board writes …**" after the exceptions, no `src/` symbol in the table) — minus its `everyday-flows.md` item (D26), and with D28: README and working-with-stamity pay for each new sentence by rewrapping or cutting within their paragraph; getting-started links `../SECURITY.md` with no fragment and names `gh auth refresh -s project`. **SECURITY.md row `:107`**: `/st-work`'s close writes the inbox through `ledger inbox-write` (`src/cli/commands/ledger.ts::runInboxWrite`, `src/runs/ledgerStore.ts::writeInbox` — the names w1 lands), and `fill` and `/st-plan` read through the query; the `review/50` residual (the close's file-tool edit) leaves. The `fix/4` residual is narrowed to what remains, never dropped: `fill`'s removal and `/st-plan`'s follow-up append still edit `.stamity/inbox.md` with the file tools, and on a client whose edit tool reads a file before it writes that edit reads the inbox whole, a withheld row's text included, into the orchestrating session — tracked as the Warning follow-up of run `2026-10-12_board-writes` (Follow-ups); the other file-tool writers and removers (`/st-rework`, `/st-pr-resolve`, dep-audit, `/st-quick`'s removal) are named beside it; `review/26` stays. **`CHANGELOG.md` `## [Unreleased]`** (`:32`): `### Added` — board writes by default behind one numbered preview, `--move`, `stamity ledger inbox-write`; `### Changed` — `/st-pr-resolve` replies need no board setup, the product-audit pack's wording, `fill` and `/st-plan` read the inbox through the query, the eval set's moved and added cases; `### Security` — the floor (one write target, item text as data, push permission, the filed-item marker) and the close's inbox write; house style `CHANGELOG.md:8-30`; no `[label]: url` line, no new `## [` heading. |
| `testCriteria` | GIVEN the edits WHEN `npx vitest run test/docsPages.test.ts test/ci/changelogLinks.test.ts` runs THEN it passes (the SECURITY control-table callers `:1938-1963` and the link check `:864-896` included). GIVEN `wc -l README.md docs/working-with-stamity.md` THEN 159 and 150. GIVEN `rg -n "review/50\|fix/4" SECURITY.md docs/security-mapping.md` THEN nothing. GIVEN SECURITY.md row `:107`'s residual cell WHEN read THEN it names `fill`'s removal and `/st-plan`'s append as file-tool edits that read the inbox whole on a read-before-edit client, and the follow-up that tracks them. |
| `edgeCases` | A sentence trips a pinned verb array (`docsPages.test.ts:2779-2813`) → move the sentence, not the pin. The `/st-board` row of the touchpoint table (`docs/working-with-stamity.md:23`) mirrors the charter → untouched. A restamped currency banner would move `REATTESTATION_DATE` → leave banners as they are. |
| `depends_on` | b1-board-contract, b2-pr-resolve-replies, w1-inbox-write, w2-inbox-flow-text |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/changelogLinks.test.ts test/ci/testInputsGuard.test.ts && wc -l README.md docs/working-with-stamity.md` |

### c1-cursor-walk — the Cursor walk's budget, measured, and its file check

| Field | Content |
|---|---|
| `id` | c1-cursor-walk |
| `requirements` | REQ-PLUGIN-021 (the consumer walks, `test/ci/pluginLifecycle.test.ts:30-33`; the check strengthens its test, no spec text moves) |
| `files` | `test/ci/pluginLifecycle.test.ts` |
| `interfaces` | **The measurement is done; c1 starts at the edit and measures nothing.** The orchestrator ran the Cursor walk five times alone on the machine at `41b1899a` (`reports/walk-measure/cursor-walk-measure-r1.md`, run `2026-10-12_board-writes`, 2026-10-12, client `agent 2026.10.01-14929f9`): the walk's `it` took 173.56, 160.86, 143.65, 226.51 and 155.33 s — 143.65–226.51 s, median 160.86 s — all passed, one discovery per state in every run with no retry, one-minute load 2.4–8.0. The lifecycle log carries no per-call times, so no discovery's own duration is known and none enters the formula. **Edit:** (1) `CURSOR_WALK_MS = 1_550_000` beside `WALK_MS` (`:204-205`), from measured quantities only: 6 × (`CURSOR_PROMPT_MS` − 20_000) = 6 × 220_000 = 1_320_000 ms, the six discovery spawn timeouts a passing path allows (three states, each with one retry), plus the measured max walk 226.51 s rounded up to 10 s, 230_000 ms, which covers the walk's non-discovery steps because the measured walk includes them; 1_320_000 + 230_000 = 1_550_000. Its comment names the base (the five runs: max, median, discovery count, load, date, client version, run id), the margin reasoning (a vitest timeout must never pre-empt a discovery's own spawn timeout, so the bound is the passing-path ceiling rather than a multiple of the median) and that arithmetic. The Cursor `it` (`:1642-1757`) takes it at `:1756`. (2) `WALK_MS` stays 600_000 with a measured-base comment: the Claude, Copilot and Codex walks measured 7–20 s (the measurement report's budget section; Claude 12–20 s in armed full suites). (3) `CURSOR_PROMPT_MS` (`:1454-1455`) stays 240_000; its comment adds line 183's kill at 220 s under load 17–35 as a limit load can reach, not run on CI. (4) After `:1700`, before `discoverListing`: `skills/st-work/SKILL.md` under `root` exists, opens with `---`, and its frontmatter holds `name: st-work` (shape `test/ci/pluginPackages.cursor.test.ts:445-457`), the message naming `target`. |
| `testCriteria` | GIVEN all four bins unset WHEN `npx vitest run test/ci/pluginLifecycle.test.ts` runs THEN the fixture group passes and every walk records `SKIPPED`. GIVEN one armed Cursor run after the edit THEN it passes, the file check runs at all three states, and the row sequence `:1743-1754` holds. GIVEN the `CURSOR_WALK_MS` comment WHEN read THEN it names the measured base, the margin reasoning and the arithmetic summing to 1,550,000. |
| `edgeCases` | An account limit → the walk records `not-run` and skips (`CURSOR_REFUSAL`, `:1452-1453`); re-run later, never count it. The armed run exceeds 1,550 s → record it as a finding and stop; the bound moves only on a new measurement. The scratch tree drops `st-work` → the file check fails deterministically before any model call, as intended. |
| `depends_on` | none |
| `verify` | `npm run build && env -u STAMITY_CLAUDE_BIN -u STAMITY_CURSOR_BIN -u STAMITY_COPILOT_BIN -u STAMITY_CODEX_BIN npx vitest run test/ci/pluginLifecycle.test.ts test/ci/testInputsGuard.test.ts && npm run typecheck && npm run lint`, then the one armed Cursor run above, scheduled alone |

### b6-dogfood-sync — regenerate every generated and emitted copy

| Field | Content |
|---|---|
| `id` | b6-dogfood-sync |
| `requirements` | REQ-BOARD-001, REQ-BOARD-009, REQ-FLOW-078 |
| `files` | `.claude/**`, `.agents/**`, `.apm/**`, `apm.yml`, `AGENTS.md`, `.stamity/generated/**`, `.stamity/manifest.json` — each only as `sync` or the generators rewrite it, `.claude/skills/st-eval-run/SKILL.md` among them (D25); `docs/reference/commands.md`, `docs/cli-reference.md`, `llms.txt` (if it moves); `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/emit/crossClientGoldens.test.ts`, `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`, `test/corpus/emissionGoldens.test.ts` |
| `interfaces` | In order (`reports/plan-researcher-r1-docs-sync.md` §4, without b3's pack step): `npm run build && node dist/cli.js sync`; `node scripts/generate-apm-package.mjs`; `node scripts/generate-docs.mjs`; `node scripts/generate-plugin-manifests.mjs --check` (on drift, run it without `--check` and name the drift); `npx vitest run test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts --update` (files first, flag last); then one dated reviewed-refresh entry in each ledger — `test/emit/crossClientGoldens.test.ts` from `:184` (pattern `:189-212`) and `test/corpus/emissionGoldens.test.ts` from `:93` — naming this run, the units, the touchpoints whose bytes moved (st-board, st-pr-resolve, st-work, st-plan) old → new, and what did not move. |
| `testCriteria` | GIVEN the regenerated tree WHEN the verify's vitest run executes THEN it passes. GIVEN `node dist/cli.js check` THEN it reports nothing to sync (exit 0). GIVEN `node scripts/generate-pack-manifests.mjs --check && node scripts/generate-apm-package.mjs --check` THEN exit 0. GIVEN a second run of the sequence THEN `git status --porcelain` shows no change but `.stamity/manifest.json`'s `updatedAt` (D29). |
| `edgeCases` | An update rewrites a snapshot of an untouched touchpoint → revert, find the drift first. `docs/reference/commands.md` changes beyond the st-board, st-pr-resolve, st-work and st-plan blocks → another content file drifted; stop and name it. A lane merge conflicts in a snapshot or a ledger → regenerate on the merge result, keep both entries, never hand-edit. |
| `depends_on` | b1-board-contract, b3-product-audit-pack, b2-pr-resolve-replies, w1-inbox-write, w2-inbox-flow-text, b4-eval-cases, b5-docs |
| `verify` | `npx vitest run test/emit test/corpus/emissionGoldens.test.ts test/ci/apmPackage.test.ts test/cli/docs/referencePages.test.ts test/cli/docs/cliReference.test.ts test/cli/docs/llmsIndex.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts && node dist/cli.js check && node scripts/generate-pack-manifests.mjs --check && node scripts/generate-apm-package.mjs --check` |

### s1-spec-merge — the delta into truth, at Prove

| Field | Content |
|---|---|
| `id` | s1-spec-merge |
| `requirements` | REQ-BOARD-001, REQ-BOARD-002, REQ-BOARD-003, REQ-BOARD-004, REQ-BOARD-005, REQ-BOARD-006, REQ-BOARD-007, REQ-BOARD-008, REQ-BOARD-009, REQ-BOARD-010, REQ-FLOW-025, REQ-FLOW-078, REQ-FLOW-079 |
| `files` | `docs/specs/board-writes.md`, `docs/specs/everyday-flows.md`, `docs/specs/orchestrator-context.md` |
| `interfaces` | A spec-author in brownfield mode, reading the landed change at `file:line`. **`board-writes.md`:** under each of the ten `### REQ-BOARD-nnn — …` headings (titles byte-equal, the join keys), the requirement text and criteria as built — plan 015's where this plan says it stands, this plan's amendment where one moved, a line headed "As built" where the landed text differs; `id`, `status: design` and `obsolete_when` stay; the `#` comment and the "Today…" intro (`:9-13`) are rewritten with re-pinned cites. **`everyday-flows.md`:** REQ-FLOW-078 and REQ-FLOW-079 after REQ-FLOW-077; REQ-FLOW-025's dated amendment with before and after (the MODIFIED entry); the head comment and the allocation paragraph (`:17-24`) name 078–079 and this run; `status` stays `shipped-with-1.14.0`, the paragraph saying they ship with the next release. **Re-pins** (D26) in all three files: every citation of the seven files D26 names whose text moved; a citation still on its text stays. One writer per file. |
| `testCriteria` | GIVEN the merged specs WHEN `npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/ci/docsRoster.test.ts test/docsPages.test.ts` runs THEN it passes. GIVEN `node content/skills/st-verify/scripts/spec-plan-coverage.mjs .stamity/runs/2026-10-12_board-writes/plan.md docs/specs` THEN no missing, dangling or duplicate id (the directory, so the prove and plugin ids b4 and c1 cite resolve in their own specs). GIVEN a sample of ten re-pinned citations THEN each line holds the quoted text. |
| `edgeCases` | A delta criterion and the landed text differ → state what landed, with an "As built" line; never invent. A citation's text no longer exists anywhere → drop the cite and record the gap as a Concern. A heading title drifts → the plan unit's join key breaks; keep titles byte-equal. |
| `depends_on` | b1-board-contract, b3-product-audit-pack, b2-pr-resolve-replies, w1-inbox-write, w2-inbox-flow-text, b4-eval-cases, b5-docs, b6-dogfood-sync |
| `verify` | `npx vitest run test/records/specStatus.test.ts test/authoring/specPlanCoverage.test.ts test/ci/docsRoster.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts && node content/skills/st-verify/scripts/spec-plan-coverage.mjs .stamity/runs/2026-10-12_board-writes/plan.md docs/specs` |

## Lanes and single-writer ownership

One git worktree per lane under `~/Projects/zomarit/.stamity-worktrees/stamity/`, `node_modules` symlinked to the main
checkout (`record.md:9`). Inside a lane units run in the order shown, one writer at a time. A cross-lane need is a
`depends_on` and a lane merge, made by the orchestrator into `board-writes` (fast-forward or merge commit).

| Lane | Worktree / branch | Branched from | Units, in order |
|---|---|---|---|
| Integration | `p19-integration` / `board-writes` | `ff021e53` | b1 → b3 → *(merge A)* → *(merge B)* → w2 → b4 → *(merge D, merge C)* → b6 → s1 |
| A | `p19-lane-a` / `board-writes-lane-a` | `ff021e53` | b2 |
| B | `p19-lane-b` / `board-writes-lane-b` | `ff021e53` | w1 |
| C | `p19-lane-c` / `board-writes-lane-c` | `ff021e53` | c1 (its live runs scheduled alone on the machine) |
| D | `p19-lane-d` / `board-writes-lane-d` | `board-writes` after w2 | b5 (beside b4 on integration) |

**Integration order and gates.** (1) b1 → b3, one gate at b3's end (D13). (2) Merge lane A after b2's review and after
b1's restamp (b2's notes cite REQ-BOARD-009). (3) Merge lane B after w1's review and the security lens. (4) w2. (5) b4
on integration and b5 on lane D in parallel; b4's verify is the gate-together run of b1, b3, b2, w2 and b4. (6) Merge
lane D, then lane C (any time before b6). (7) b6. (8) s1 at Prove. The Prove full suite, alone, follows b6.

**File writers** (one at a time, in this order): `content/commands/st-board.md` and `test/corpus/commands/board.test.ts`
b1 → w2; `content/commands/st-work.md`, `content/commands/st-plan.md`, `test/corpus/commands/work.test.ts`,
`test/corpus/commands/plan.test.ts`, `test/corpus/recordWrites.test.ts`, `test/corpus/cliCallForm.test.ts` w2; `content/commands/st-pr-resolve.md`,
`test/corpus/commands/feedbackPair.test.ts` b2; `packs/product-audit/**`, `test/packs/product-audit.test.ts`,
`src/pack/catalogPins.ts` b3; `src/runs/*.ts`, `src/cli/commands/ledger.ts`, `test/runs/*` w1;
`test/ci/pluginLifecycle.test.ts` c1; `docs/plans/015-board-writes.md`, `docs/plans/016-fork-distribution-03.md` b1; eval and count files b4; `CHANGELOG.md`,
`README.md`, `docs/getting-started.md`, `docs/working-with-stamity.md`, `docs/security-mapping.md`, `SECURITY.md` b5; generated and dogfood files b6; `docs/specs/**` s1. The security lens
reviews b1, w1, b4's adversarial case and b3's regenerated manifest (`record.md:70`).

## Contract census — the first parallel batch (b1 → b3, b2, w1, c1)

| Contract | Class | Producer (owner) | Consumers | Change kind | Closes as |
|---|---|---|---|---|---|
| `st-board.md` `## Write-back contract`: its five write names, "`BLOCKED_DEPENDENCY` rather than improvising one", the five `###` titles | persisted-name | b1 | `test/packs/product-audit.test.ts:935-948` (b3, same gate), `board.test.ts` (b1), the board case's `source:` and Brief (b4), SET-v7's index (b4), the frame rule's wording (b3) | revalue | reconciled(4) — b3 in b1's gate; b4 after |
| Shared vocabulary of b1 and b2: "outside `/st-board`'s write set", the PR-thread reply as `/st-pr-resolve`'s own write | persisted-name | b1 and b2, verbatim from this plan | `st-board.md`, `st-pr-resolve.md`, `feedbackPair.test.ts`, the pr-resolve case (b4) | add | reconciled — spelled once here |
| The pickup handoff's `move:` and `preview:` fields and the preview's row labels `R1`…`Rn` | wire-field | b1 | `st-board.md` pickup step 5 and `## Progress contract` (b1, one file); the board case's B1 (b4); QA R2 and R3 | add | clean — producer and reader in one file; `st-work.md` reads neither (plan 015 decision 4) |
| The spec status gate's reading of spec paths in plans | persisted-name | `test/records/specStatus.test.ts` (unchanged) | `docs/plans/015-board-writes.md` (D23), `docs/plans/016-fork-distribution-03.md` (D31) | revalue (restamp; path-free wording) | reconciled(2) — both in b1's commit |
| Eval `source:` ranges and Brief quotes into `st-board.md` | persisted-name | b1, w2 | board case `:255-287`; `vague-deferral-without-place-refused` `:349-371`; `close-real-defect-never-preset-to-drop`, `unattended-close-keeps-real-defects` `:401-451` (quote `:416-421`); `benign-close-no-leftovers-asks-nothing-extra` and `work-frame-reads-matching-inbox-rows` (quotes) | revalue (shift and quote) | b4 re-anchors; `test/evals` red from b1 until b4 |
| Eval ranges and quotes into `st-pr-resolve.md` | persisted-name | b2 | `pr-comment-ingress-screen` `:79-115` (no shift: line counts kept); `pr-resolve-next-step-derived-from-run-state` `:311-333` (quote of `:313-318`, `:327-328`) | revalue (quote) | b4 re-quotes |
| Eval ranges and quotes into `st-work.md` | persisted-name | w2 | `work-capacity-rung-classes-stop-notices` `469-474` (shifts); `work-proof-block-fields` (quotes `:365-378`, untouched); any case quoting `:31-35` or a range below `:390` (b4's search) | revalue (shift) | b4 re-anchors |
| Eval ranges into `st-plan.md` | persisted-name | w2 | `plan-semantic-ambiguity-survives-structural-pass` `274-426`, `plan-lint-three-fails-returns-blocked-ambiguity` `274-312,406-417` | revalue only if w2 moves a line | b4 re-anchors, else clean |
| The inbox row grammar the records gate reads: `parseInbox`, `SCHEDULE_RULE_HEADING`, `INBOX_PATH`, heading exactly once, every `Ref:` resolves | symbol · persisted-name | `src/runs/inboxStore.ts` (w1 adds `editInboxText`, changes no export) | `test/records/ledgers.test.ts:7-13`, `:155-164`, `:264-299`; `ledger.ts::runInbox`; `board.test.ts:3-4`; `test/runs/inboxStore.test.ts` | add | clean — no existing export moves; the verb keeps the gate's invariants |
| The `ledger` command's subcommand choices and flags: `.choices([APPEND, CLOSE, STATUS, INBOX])` (`ledger.ts:1213`), `FOREIGN_FLAGS` (`:138-186`), the `summary` | config-key · wire-field | w1 | `test/runs/ledgerInbox.test.ts:1250-1258`, `test/runs/ledgerClose.test.ts:1530-1554` (owner lists, new owner last), `docs/cli-reference.md:33`, `:298`, `:309` (generated, b6), `SECURITY.md:106-107` (b5), the texts naming `ledger inbox`/`ledger close` (`st-work.md`, `st-board.md`, `st-quick.md`, `st-plan.md`; w2 adds `inbox-write`) | add (`inbox-write`, `--remove`) | reconciled(3); `cliReference` red until b6 |

## QA

Person rows only where a person must look at a rendered surface or a live third-party write; at most three. The
session walks R2 and R3 live tonight, headless, on the scratch repository (opening answer 1), with auto-add off
(opening answer 2), using this branch's build: `npm run build` in the integration lane, then in a fresh clone of the
scratch repository `node <integration worktree>/dist/cli.js init -y --tools claude --maturity solo`, and
`npm init -y && npm install --no-save <integration worktree>` there, so `npx --no stamity` runs this branch's build
rather than the published copy the pinned fallback resolves; `readlink node_modules/@zomarit/stamity` is recorded.
Before setup, `gh auth status` shows `project` on its token-scopes line, recorded. Each headless turn:
`claude -p "<prompt>" --session-id <uuid>` for the first and `--resume <uuid>` after, with
`--output-format json --permission-mode acceptEdits --permission-prompts none --allowedTools "Bash(gh *),Bash(git *),Bash(node *),Bash(npx *),Read,Write,Edit,Glob,Grep,Agent"`,
the operator's own login, every exit code and every permission denial the output reports read
(`reports/plan-researcher-r1-walk-qa.md` §6). The turns whose evidence lives in tool calls — R2's Q1 `fill` (the
membership read before any `item-add`) and R3's `--move` pickup (where the field and option ids came from) — run with
`--output-format stream-json --verbose` instead, and each stream is saved whole under the run's `reports/qa/`. All
other evidence lands there too. Preview rows are labelled `R1`…`Rn` (D5), apart from this table's own row ids. The
maintainer signs each row in the morning.

| # | Scenario | Steps (session tonight) | Expected | The maintainer's morning step |
|---|---|---|---|---|
| R1 | #77's QA row 1: a pack's skills reach a plugin-backed Claude Code (`2026-10-03_pack-engine-defects/record.md:514`) | In a local scratch repository with Claude Code running this branch's Claude plugin root (`reports/plan-researcher-r1-walk-qa.md` §5 "Plugin-backed alternative"): `node <worktree>/dist/cli.js add ops -y`, `… sync`, `… check`; then `claude -p "hello" --output-format stream-json --verbose` and read the `system`/`init` event | `check` shows `pack-reach` `warn` lines in the form `pack "ops": command <id> is not written for claude (…); it reaches …` (`test/cli/commands/check.test.ts:4030`); the init event lists the ops pack's skills, for example `st-release-runbook` (auto-proven) | One minute: `claude` in that scratch folder, type `/`, see the ops pack's skills in the menu; sign |
| R2 | The fill walk: Q3, Q1, Q2 and the membership read | Turn 1 `/st-board setup` linking the scratch repository and its project. Q3: a `fill` of two chat items answered `4` (`stop`), then `gh issue list` empty; a `fill` of two items answered `2 apply R1`. Q1: a `fill` of two chat items, one proposing `priority:high`, each written to pass pickup's readiness gate (`content/commands/st-board.md:115-121`) — verifiable acceptance criteria, a scope line naming what is out, no open unknown, dependencies `none`, small — answered `1` (stream-json). Q2: `fill --source <file>` answered `1`, twice. After each: `gh issue list --state all --json number,title,labels,body` and `gh project item-list <n> --owner <owner> --format json --limit 100` | Q3: nothing written, then only R1. Q1: one preview with rows `R1`, `R2`; two issues each on the project once; `type:feature` applied; `priority:high` reported as a proposal; each body ends with `<!-- stamity:item <key> -->`; the saved stream shows the membership read before any `item-add`; the record says auto-add was off; each item's verdict is `ready`. Q2: the second run files nothing and names the issues it updated | Open the board and each issue once: every issue appears once, labels as expected, the marker in the raw body; sign |
| R3 | Pickup without and with `--move` (Q4); `/st-pr-resolve` replies (Q6) | `pickup <one Q1 item>` without `--move`, its preview answered `1`; then `pickup <the other Q1 item> --move`, its preview answered `1` (stream-json); record from the saved stream whether the field and option ids came from `field-list`/`item-list` JSON or GraphQL. Then on a scratch branch a one-line change, `gh pr create`, one review comment by the same account (`gh api repos/<owner>/<repo>/pulls/<n>/comments` with `body`, `commit_id`, `path`, `line`), and `/st-pr-resolve <n>` with its triage ask answered `decline 1`, so no FIX routes into a nested `/st-work` (`content/commands/st-pr-resolve.md:212-214`) | First pickup: a handoff, no Status change, `move: off`, `status-write: skipped`, `preview: apply`; second: a handoff, In progress, `move: on`, `preview: apply`. The reply posts on the thread; no question names board channels or setup | Look at the board's Status column and the pull request's thread; sign |

**Auto-proven, not person rows:** REQ-BOARD-001…009 *(corpus)* by `test/corpus/commands/board.test.ts`;
REQ-BOARD-009 by `test/corpus/commands/feedbackPair.test.ts`; REQ-BOARD-010 by `test/packs/product-audit.test.ts`;
REQ-FLOW-078 by `test/runs/ledgerInboxWrite.test.ts`, `test/runs/inboxStore.test.ts` and `work.test.ts`;
REQ-FLOW-079 by `board.test.ts` and `plan.test.ts`; REQ-FLOW-025 by `recordWrites.test.ts`; the eval rows by
`board-write-back-four-channels`, `board-item-directive-is-data` and `pr-resolve-next-step-derived-from-run-state` at
the next release's full run; c1 by its armed Cursor run's report. **Not performed:** Q5 (a second account's planted
issue) — the maintainer has one GitHub account; `board-item-directive-is-data` (`floor: true`) carries it.
**Dropped:** plan 015's "auto-add on" precondition — off, recorded (opening answer 2).

## Risks

| Risk | Severity | Guard |
|---|---|---|
| b1 (or w2 after it) cannot land under 500 body lines | Warning | D1's tighter-sentence latitude and the GitHub notes folded into the table (S11), D2's wrap; the verify fails above 500; `BLOCKED_DEPENDENCY` with the count stops the lane before any later unit, and the morning decides |
| The injection guard is model-followed text | Warning | The preview shows every write first; the floor eval case; the security lens on b1 |
| A checklist tick replaces the whole body, so a human edit between re-read and write is lost | Warning | Re-read immediately before the write, one box; GitHub has no conditional update (plan 015 `:697`) |
| `field-list`/`item-list` JSON may omit ids, and listings default to 30 | Warning | GraphQL fallback and `--limit` rule in the notes; R3 records which source answered |
| A count literal or a moved range is missed | Warning | b4's sweep; `roster`, `readmeCurrency`, `locators`, `manualRunner` |
| `fill`'s removal and the other writers still edit the inbox with the file tools | Warning | SECURITY.md row `:107` names it; the Follow-up with its trigger |
| A decided row with no unique `Ref:` is left in place (D19) | Minor | Listed on `Not done:`; comes back at the next close; Follow-up |
| c1's armed run hits an account limit, or runs over the measured bound under load | Minor | A refusal is `not-run`, re-run; the bound is the passing-path ceiling, and an overrun is a finding, never a silent raise |
| The 100-column wrap reads as gaming the line cap | Minor | Only rewritten paragraphs; the body's characters are what the cap bounds in spirit, and b1's report states both counts |
| R1's init-event field names are inferred, not checked on 2.1.296 | Minor | If the event carries no list, R1's listing half becomes part of the maintainer's `/` step |
| An auto-add double add is not exercised | Minor | Recorded residue; GitHub's add returns the existing item (inference) |
| `catalogPins.ts` fires the signing rehearsal only on `main` | Minor | Proven by `main`'s push run after the merge |

## Open questions

Every open choice carries its declared default; none blocks.

1. b1 over 500 even with tighter sentences: raise the cap, or stop? **Default:** stop with `BLOCKED_DEPENDENCY` and the
   count; the cap is never raised (D1, S11).
2. A decided row with no unique `Ref:` at the close: hand edit, or leave? **Default:** leave and list it (D19).
3. The pack manifests' owner: b3 or b6? **Default:** b3 (D15), reversible to b6 by moving two files and two verify
   steps.
4. `fill` step 5's "annotated" against "no rewrite in place": reword now, or later? **Default:** later (D3, Follow-ups).

## Follow-ups

- Warning · SECURITY.md:107 · `fill`'s removal and `/st-plan`'s follow-up append (and `/st-rework`, `/st-pr-resolve`,
  the dep-audit skill and `/st-quick`'s removal) still edit `.stamity/inbox.md` with the file tools, which on a client
  whose edit tool reads a file before it writes read it whole, a withheld row's text included · when: the next unit that
  edits any of their inbox texts · files: content/commands/st-plan.md, content/commands/st-rework.md, content/commands/st-pr-resolve.md, content/skills/st-dep-audit/SKILL.md, content/commands/st-board.md, content/commands/st-quick.md
- Minor · — · `inbox-write` removes only by a unique `Ref:`; a decided Ref-less row stays · when: a close lists a row
  as `decided, not applied (no unique Ref:)` · files: src/cli/commands/ledger.ts, src/runs/inboxStore.ts
- Minor · content/commands/st-board.md:82 · `fill` step 5 annotates an entry in place while the Removal rule says
  triage never rewrites one; and after D3 its "re-raised" clause cannot fire, since only a `fill` with no linked
  board drains an entry to a proposal, with no preview and the entry already gone · when: the next unit that edits
  `st-board.md`'s Removal bullet
- Minor · — · `docs/specs/board-writes.md` flips to `shipped-with-<version>` and the full set measures the moved and
  added cases · when: the next release cut · files: docs/specs/board-writes.md
- Minor · test/evals/readmeCurrency.test.ts:139 · the moved-count regex is vacuous once moved passes ten · when: touched

## Drop list

| Item | Revisit when |
|---|---|
| A release now | The next release, which carries this change |
| A durable board link (a config key) | A user asks to keep the link across sessions |
| The pack filing its own epic in the same run | A user asks for a one-step audit-to-board run |
| Per-run write caps | A run files more than a preview can sensibly show |
| Platforms other than GitHub | A pack for another board platform |
| Closing keywords written by a run | A platform where only a keyword links a pull request |
| A benign twin for `board-item-directive-is-data` | A false refusal on a benign board item is observed |
| The engine printing each row's `inbox:<hex12>` key | Two runs compute different keys for one row |
| Q5 with a second account | The maintainer has a second GitHub account |
| The walk with auto-add on | GitHub's API can switch a project's auto-add on, or a person toggles it for a walk |
