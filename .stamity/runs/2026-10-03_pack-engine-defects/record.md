# Run 2026-10-03_pack-engine-defects — the four 1.11.0 pack-engine defects, the three init rows, the session's records

Status: in progress
Plan: .stamity/runs/2026-10-03_pack-engine-defects/plan.md
Invocation: /st-work Fix the four pack-engine defects the /st-debug run 2026-10-03_debug-pack-defects diagnosed (diagnosis and root cause in .stamity/runs/2026-10-03_debug-pack-defects/record.md; the failing tests in test/pack/packEngineDefects.test.ts, 34 cases, red twice), on branch fix/pack-engine-defects at 40371e1b: (1) a cross-class emitted-name check at add and at sync that names both owners, with ops's two clashing skill halves renamed to st-release-runbook and st-incident-runbook so add ops still syncs; (2) the Codex skills list counting only the rows Codex shows its model, still refusing above 8,000 characters with a message naming the packs and the size; (3) origin "pack" on pack skill rows so they reach plugin-backed clients, plus a check row pack-reach that fails for an installed pack reaching no client; (4) an overlay on a pack skill refused by validate and sync, naming the overlay's path. In the same pull request: the three init rows of .stamity/inbox.md (source: /st-ask) — the detected platform on the end-of-init panel with the unwired InitOverrides.platform removed, docs/migration.md reworded to what init carries and shows, an init --maturity CLI test — and the records: inbox rows retired with their fixes plus the new rows this session found, dated notes on the three PR #73 records, the #73 round-1 brief and triage copied into their run folder. Merged to main without a release.
Intensity: deep — public CLI contracts (the `add` refusal, a new `check` row, `sync` errors), the pack trust boundary, all four clients, seven units; the full specialist pass and a whole-branch review on the frontier class (Fable 5.1) before the merge
Confidence gate: medium
Isolation: manual worktree lanes outside the checkout (one per parallel unit, branched from the integration branch, `node_modules` symlinked); engine units that share a file run serially in the integration lane
Diagnosis: .stamity/runs/2026-10-03_debug-pack-defects/record.md (root cause, gate 2's failing tests)
Branch: `fix/pack-engine-defects`, from `main` at `c0eb1100`; the failing tests at `40371e1b`
Opened: 2026-10-03T12:24Z

## Frame (Phase 0)

**Outcome.** The 34 failing tests pass, `add ops` syncs again on Cursor and on Codex alone, and three related records gaps
close, merged to `main` without a release.

In scope:
- defect 1, a cross-class emitted-name check at `add` and at `sync` naming both owners, with ops's two clashing skill
  halves renamed (`st-release-runbook`, `st-incident-runbook`);
- defect 2, the Codex list counting only the rows Codex shows its model, still refusing above 8,000 characters, with a
  message naming the packs and the size;
- defect 3, `origin: "pack"` on pack skill rows, plus a `pack-reach` check row (fail when an installed pack reaches no
  client);
- defect 4, an overlay on a pack skill refused by `validate` and `sync`;
- the three init rows (`source: /st-ask`);
- the session's records: inbox retirements and new rows, notes on earlier records, preserved evidence.

Out of scope:
- pack commands, agents, rules and hooks in plugin-backed mode (only skills come back here; the new row reports the
  rest);
- packs on the APM route;
- pack rules under `ruleDelivery`;
- a fit check at `add`, a derived pack catalog, pack evals;
- applying overlays to pack skills;
- the Copilot touchpoint gap (recorded as an inbox row only);
- any release.

**Deferral inbox (step 4).** Rows overlapping this change's files:

| Row | Disposition |
|---|---|
| `:359` (the ops-pack regression), `:462` (the overlay probe) | settled by this run; they leave at the close |
| `:419`, `:420`, `:421` (the init rows) | settled by this run; they leave at the close |
| `:56`, `:62`, `:66`–`:71`, `:75`, `:79`, `:100`, `:149`, `:161`, `:186`, `:188`, `:269`, `:316`, `:318`, `:319`, `:325`, `:384`, `:387`, `:389`, `:460`, `:466`, `:467` | not settled here; left in the inbox (the default). `:71` is a watch item on `src/emit/skillsProjection.ts`'s coverage floor, which any unit touching that file reads first |

**Spawn plan and cost (step 3).** Written here at 12:40Z, after the two Phase 1 researchers had already been
dispatched; the plan should have come before any spawn. Every role runs at Opus 5.5 (the `opus` alias) except the
whole-branch review, which runs at Fable 5.1 (the `fable` alias), the class the frontier row names.

| Phase | Role | Count |
|---|---|---|
| Understand | researcher | 2 (r1 carried over from the debug run's step 1; r2, the census) |
| Build | implementer | 9 (u1a, u1b, u2, u3, u4a, u4b, u5a, u5b, u6) |
| Build | spec-author (docs mode) | 1 (u7) |
| Prove | test-runner | about 10 (one gate pass per lane before its merge; the integrated branch's full gate, then its coverage run) |
| Prove | reviewer | about 12 (one per unit, a re-review where a fix lands) |
| Prove | fixer | as findings require |
| Prove | lenses: `security`, `performance`, `design-quality` | 3 (the integrated branch) |
| Prove | whole-branch reviewer (frontier) | 1 |
| Close | spec-author (the spec delta merge) | 1 |

Order of magnitude: 40 spawns and several million sub-agent tokens. Wall clock is dominated by the serial engine chain
and the CI legs.

## Plan (Phase 2)

`plan.md` beside this record, written once at 12:39Z, from `reports/plan-researcher-r1.md` and
`reports/plan-researcher-r2.md`. It has ten units in four waves:

| Wave | Units |
|---|---|
| 1, in parallel | u1a, u2, u3, u4a, u5b, u6 |
| 2 | u1b, with u5a in parallel |
| 3 | u4b |
| 4 | u7 |

- **Plan-artifact intake:** no `docs/plans/` artifact covers this request, so the plan is in-flow.
- **Coverage:** every unit names its requirement ids, or states that the spec carries none. Reading the census in
  both directions found no requirement without a unit and no unit without a reason.
- **Contract census:** every row closes `clean`, except the overlay contract, which closes `reconciled(1)`: u5b codes
  against u5a's held shape.
- **Specs:** no unit edits `docs/specs/`; their deltas merge at the close.
- **CHANGELOG:** no edit; the 1.12.0 cut writes the section.
- **Defaults declared in the plan:**
  - An overlay on a pack skill is refused at the user stage, and skipped and reported at the fork stage.
  - The name check refuses on every client set.

**Plan gate.** Default applied: plan gate → option 1, execute now. The in-flow plan, deep tier; the session's brief asks
nothing beyond its start questions, answered before 11:52Z (the init rows share this pull request).

**Isolation (declared before the first Phase 3 dispatch).** Manual worktree lanes outside the checkout, each with a
`node_modules` symlink. Wave 1 lanes: `pack-defects` (the integration branch), `pd-ops`, `pd-codex`, `pd-origin`,
`pd-creator` and `pd-init`, all at `40371e1b`. Implementers leave their work uncommitted. The orchestrator commits a
reviewed unit in its lane (DCO-signed) and cherry-picks it onto `fix/pack-engine-defects`. Gate runs that take the
whole suite run one at a time on this machine.

## Build (Phase 3)

- 12:41Z: wave 1 dispatched, six implementers at Opus 5.5: u1a, u2, u3, u4a, u5b, u6.
- **u2-ops-rename.** DONE with no Critical or Warning finding and two Minors.
  - `build/1`: a synthetic fixture path in `test/pack/permissions.test.ts:428` still spells the old skill name.
  - `build/2`: the `~13725 tokens` sample line at `docs/packs-and-trust.md:58` is now 2 tokens stale; it goes to u7.

  The report's findings block was written as YAML, so `ledger append --report` refused it (no row appended). The two
  rows were appended through `--stdin` in the JSON-per-line grammar (`src/runs/blocks.ts:36-67`). From here every
  dispatch spells that grammar.
- **The extra evidence.** The #73 round-1 work brief and triage, cited by that run's record at a session scratch path,
  are preserved in this run's `evidence/` folder. The brief's one local checkout path reads `<the public checkout>`;
  the triage is a byte copy.
- **u3-codex-shown-rows.** DONE with no Critical or Warning finding and three Minors (`build/3`–`build/5`, through
  `--stdin`; this report's block was YAML too).
  - Lines: about 458 changed, past the soft ceiling, mostly tests and dated comments.
  - Pack shares print plain digits, to match the pinned total.
  - Two gate runs used a pipe or a redirect; both were re-run plainly.

  The core's figure was re-measured at 5,570 (it was 6,909).
- **The cause of the YAML blocks.** `content/agents/stamity-implementer.md:109-118` names the `stamity-findings`
  fence but not its grammar, while the reviewer's contract spells it (`content/agents/stamity-reviewer.md:175-180`).
  This is the same gap the inbox records for the spec-author (`.stamity/inbox.md:430`), and it becomes an inbox row
  at the close.
- **u2 review, round 1.** Approve, confidence medium (the run's gate), no Critical or Warning.
  - Its M-1 and M-2 restate `build/1` and `build/2`.
  - Its M-3 is new (`review/1`): the ops suite's bare-mention guard accepts an id of any class (`test/packs/ops.test.ts:785-790`).
    That predates this run.

  The reviewer's guard refused its report write outside the main checkout and any `git -C` in a lane, so the result
  came back inline. From here review reports go to the main checkout's run folder (`reports/` there, ignored), with a
  precomputed diff file.
- **u2 committed** in `pd-ops` as `4f6af0e0`: 9 files, +41/−23.
- **u3 review, round 1.** Approve, confidence medium, no Critical or Warning. One Minor, flagged security-relevant
  (`review/2`): the policy reader accepts YAML merge keys, so a pack could hide a row from Stamity's count through a
  `<<:` key a Codex parser might not honour. The direction is an under-count against Stamity's own cap; Codex then
  shortens descriptions itself. Ledgered and deferred, not a loop trigger.
- **u3 committed** in `pd-codex` as `7b7f5791`: 4 files, +408/−50.
- **u5b-creator-text.** DONE: six lines edited in place, nothing before `:141` moved, the dogfood sync moved only the
  creator's copies and the manifest, and drift is clean.
  - `build/6`, a Warning against the plan: the plan said `validate` refuses a full override of a pack skill, but it
    only lists one as a shadow (`src/cli/commands/validate.ts:608-625`). The text follows the code. That
    inconsistency predates this run and goes to the inbox.
  - `build/7` and `build/8` are Minors.
- **u4a-pack-skill-origin.** DONE: D1 passes 5 of 5, and `plugin-duplicates` exempts only rows that come from an
  installed pack's own skill files (matched against that pack's ledger rows).
  - `build/9`: the docs do not name `pack-reach` yet; u4b does.
  - `build/10`: the census report the dispatch named was missing.
- **An orchestrator miss.** `reports/plan-researcher-r2.md`, the census, was named by the plan and by four wave-1
  dispatches but was not written until 12:58Z.
  - Unaffected: u3, u4a and u5b worked from the plan and r1. The plan cells carry the pins each unit needed.
  - Still running when it landed: u1a and u6. Their reviewers check against the census explicitly.
- **u5b review, round 1.** Approve, confidence high, no Critical or Warning. Two Minors: `review/3`, a pinned lead-in
  that now holds for every class but a pack skill; `review/4`, no Refusals-table row for overriding or patching a pack
  skill. A new row would move the eval range. Both are deferred to the packs rework.
- **u5b committed** in `pd-creator` as `a89c98ef`.
- **u4a review, round 1.** Approve, confidence medium, with one Warning.
  - `review/5`: the `plugin-duplicates` exemption matched files by their ledger rows, so a support file left unrowed in
    an installed skill folder would still fail the row.
  - `review/6` and `review/7` are Minors.

  A Warning routes to a fixer whatever the verdict. The fixer matched on the pack skill's folder and added a test that
  fails under the old matching.
- **u4a review, round 2** (a fresh reviewer, given the ledger ids). Approve, confidence medium. Closures: `review/5`
  fixed, `review/6` fixed (the docstring now promises only the selected-core-skill case), `review/7` not fixed. That
  one is a Minor test gap, folded into u4b, which edits the same test file.
- **u4a committed** in `pd-origin` as `d2774aa0`.
- **u6-init-fixes.** DONE, three Minors (`build/11`–`build/13`).
  - The panel gains a `platform:` line after `clients:`, with a fallback when none is detected.
  - `InitOverrides.platform` is removed.
  - Four CLI cases, `--maturity` among them, each red-checked first.
  - The migration guide is reworded, with a code citation for every sentence.

  `build/12` records a case the plan missed: a tools answer at a terminal replaces the carried tool list. The guide
  says so.
- **u6 review, round 1.** Approve, confidence medium. Every guide sentence matches the code and the census table; the
  panel pins hold; `--json` is unchanged; the platform line prints the name only, never the remote URL.
  - Four Minors: `review/8`–`review/10`, in the unit's own files, and `review/11`, outside them (the migrate prompt
    and `carry.ts` still say "defaults").
  - The first three went to a fixer, because the unit's point is an accurate guide and three inbox rows would cost
    more than the fix.
- **u6 review, round 2.** Approve, confidence high. Closures: `review/8`–`review/10` fixed.
- **u6 committed** in `pd-init` as `333e5d55`.
- **Lane gates, pd-ops and pd-codex** (full suite, JSON reporter).
  - Lint and typecheck passed.
  - In `packEngineDefects.test.ts` exactly the expected cases passed: A-cursor in pd-ops, C1 and C2 for both sets in
    pd-codex.
  - Outside it, three `test/qa/hookRuns.test.ts` cases failed in both lanes ("the fixture could not be built…"), and
    pd-ops marked `test/ci/pluginLifecycle.test.ts` failed ("dist/cli.js absent; run npm run build").
  - The cause: those tests shell out to the checkout's own `dist/cli.js` (`test/qa/hookRuns.test.ts:203-205`,
    `scripts/qa/fixtures.mjs:164`). CI builds it before the suite (`.github/workflows/ci.yml:286`); a fresh lane has
    none until some test builds it.
- **Build-first re-run** (`npm run build`, then the two files) in both lanes: 49 passed, 2 skipped by the tests
  themselves. The departure was the missing build, not either unit. Both lanes count as green apart from the expected
  defect cases; the "build before a fresh worktree's suite" fact is a learning for the close.
- **u1a-name-detector-add.** It first returned `BLOCKED_DEPENDENCY`: built, B1–B4 green, but `add ops` was now
  (correctly) refused while ops still shipped its two same-name pairs, turning five install-smoke cases red.
  - The unblock was the plan's own order: u2 was cherry-picked onto the integration branch beside u1a's uncommitted
    work (`bcb41316`), sooner than wave 4.
  - Findings `build/14`–`build/19`. `build/15` was mine: u1a's `verify` ran all of `test/pack`, so it could never pass
    in wave 1. Gate runs now filter other units' cases.
- **u1a gate** after the rename: green.
  - Build, lint and typecheck pass.
  - B1–B4 and A-cursor pass (9 cases).
  - The related run, with the gate file excluded, passes: 683 tests, install smoke included.

  `build/14` and `build/15` closed as fixed.
- **u1a review, round 1.** Request changes, confidence medium. The brief's checks all hold: names derived, refusal
  before any write, both owners named, trust gates untouched, a reusable seam for u1b.
  - `review/12`, Warning: a fork or user skill that replaces a shipped skill lands in the replaced skill's folder
    (`src/emit/skillsProjection.ts:327`), but the detector named it by its own folder. So an override of `st-verify`
    plus a pack command `verify` would pass `add`, and u1b would inherit the gap.
  - `review/13`–`review/17`, Minors.

  The fixer takes `review/12`, plus `review/15`'s three missing tests and the reviewer's open question on
  case-sensitive names.
- **u1a fix, round 1.** A replacing skill is named by the folder it lands in (an optional `replacedOf` hook). Names
  compare ignoring case, because macOS and Windows fold case: an override id refused upper case, but corpus, fork and
  pack ids could carry it. Tests were added for `--dry-run`, for a path collision plus a name clash, for an override
  of `st-verify`, and for case variants.
- **u1a review, round 2.** Approve, confidence medium. Closures: `review/12` fixed, `review/15` fixed. The fold
  (NFC plus lower case) joins only names that differ in case or normalization form.
- **u1a committed** on the integration branch as `23d29eae`.
- **Integration, just before 13:32Z** (the wave-2 lanes were created at 13:32Z, right after). The four reviewed lanes
  were cherry-picked cleanly:
  - u3 → `0da30714`
  - u4a → `efc7b79d`
  - u5b → `77625690`
  - u6 → `68d62843`

  The integration branch now reads `40371e1b` (failing tests), `bcb41316` (u2), `23d29eae` (u1a), then the four above.
- **Wave 2, 13:33Z.**
  - u1b dispatched in the integration lane. Its brief carries u1a's contract note: pass `replacedOf`, or the
    replaced-skill case slips past `sync`.
  - u5a dispatched in the new lane `pd-overlay` at `68d62843`.
  - A full gate of `68d62843` runs in the snapshot lane `pd-gate`. It is expected to fail only B5, D2 and E (15 cases).
- **Integrated gate of `68d62843`.** Exactly as expected: build, lint and typecheck pass; 10,708 tests pass and 15
  fail. All 15 are B5, D2 and E (five each), the cases wave 2 and u4b fix. Nothing outside the defects file fails.
- **u5a-overlay-refusal.** DONE.
  - A user overlay on a pack skill is refused by `sync` and `validate`; a fork overlay on one is skipped with a
    warning.
  - E passes 5 of 5, and the 583 related tests pass.
  - `validate` needed no edit: the refusal already surfaces as an error there.

  `build/20` is a Warning: in the lane's full suite, the live Cursor `--plugin-dir` walk
  (`test/ci/pluginLifecycle.test.ts:1432`) listed no `st-work`. `build/21` is a Minor.
- **A fact about this machine.** All four `STAMITY_*_BIN` variables are set in the environment. So every full-suite
  run here also arms the live client walks, and a full suite is itself a live client check. Under the session's rule
  (one live check at a time, no full suite beside one), full suites from here run alone. The walk re-run (once, alone,
  on the same tree) and u5a's read-only review are dispatched.
- **The Cursor walk re-run** (alone, in `pd-overlay`): green. `st-work` was listed at all three states, and
  `fixture-marker` appeared only at the update state.
  - That makes three intermittent misses of this model-listing assertion: two on 2026-10-02, this one, each passing
    on re-run. No change on this branch touches the core Cursor plugin root.
  - `build/20` closes as deferred, with an inbox row at the close.
- **u5a review, round 1.** Request changes, confidence medium.
  - `review/18`, Warning: the refusal's remedy offered "remove the pack (`clean --pack`)", which leaves the overlay an
    orphan refused again. The plan's sample text, copied from the full-override refusal, was wrong.
  - Minors `review/19`, `/20` and `/22` went to the fixer, being in u5a's files.
  - `review/21`, stale `planner.ts` comments, went to u4b.
- **u5a review, round 2.** Approve, confidence high. Closures: `review/18`, `/19`, `/20` and `/22` all fixed.
- **u5a committed** in `pd-overlay` as `808f486b`.
- **u1b-sync-refusal.**
  - DONE: B5 passes 5 of 5 and goes red with the check disabled.
  - Coverage: `planner.ts` at 100/93.42/100/100 against its 100/90/100/100 floor.
  - The full suite fails only on D2 and E.
  - Minors `build/22`–`build/24`: a core-and-fork-only clash refused too; a third stale comment; one more index walk
    per plan.
- **u1b review, round 1.** Approve, confidence medium.
  - `review/23`, a Minor routed to u4b: the refusal's fixed text misfits some cases, such as "re-run sync" after
    `init`.
  - `review/24`, a Minor deferred to the packs rework: with a hand-edited manifest that has no rule list, a pack rule
    can still be demoted to a skill the detector doesn't name.
  - The reviewer's change-list note: Claude-only or Copilot-only repositories that installed ops with 1.11.0 are
    refused at their first `sync` after upgrading; the remedy works.
- **u1b committed** on the integration branch as `a3a521c7`. u5a was cherry-picked as `8484b70a`.
- **Wave 3, 14:02Z.**
  - u4b dispatched in the integration lane at `8484b70a`. It carries `review/7`, `review/21`, `build/23` and
    `review/23`, all Minors in files it edits.
  - u7 dispatched to a spec-author in the new lane `pd-docs` at `8484b70a`. It carries `build/2`, the sample's token
    count.
- **u7-packs-docs.** The spec-author returned `BLOCKED_DEPENDENCY`: its role's shell guard allows only read-only
  `git`. It wrote the prose, but could neither measure the sample's figure nor run the checks.
  - `build/25`–`build/27`, three Warnings.
  - A fixer measured `~13727` tokens across 9 files from a real `add ops --dry-run` in a scratch repository, and
    changed only that number (`build/2`, `build/25`).
  - It ran the checks: the docs tests (290), the leak gate and lint, all exit 0 (`build/27`). It also fixed a link
    the docs test rejected, an anchor inside the target.
  - Committed in `pd-docs` as `2c7ec38a`. The review waits for u4b, so the `pack-reach` sentences (`build/26`) are
    read against the real row.
- **u4b-pack-reach-row.** DONE: D1 and D2 pass, and `planner.ts` is at 100/92.94/100/100.
  - `build/28`, a Warning: about 1,090 lines in one unit, kept together because the type, producer, probe and pins
    move together.
  - Minors `build/29`–`build/31`: the probe's own planning pass, only with a pack installed; plan 016's future
    doctor-row units still say "fourteen"; a pack with nothing to deliver passes with a note.
- 2026-10-03 (after 14:28Z) capacity: reviewer limit-reset → resumed 2026-10-06T06:57Z on another account. The u4b
  reviewer stopped on the account's weekly limit before returning anything. The maintainer logged in with another
  account. The review was re-dispatched fresh against the unchanged diff. No other agent was running.
- **State after the pause** (2026-10-06T06:55Z, `frozen-state.mjs`): unchanged. Public `main` is `c0eb1100` with no
  open pull request, npm is still 1.11.0, the private layer is at `139258bd`, and every lane is as left.
- **Codex re-check on 0.160.1**, published 2026-10-06T05:55Z: the same result as 0.160.0. Seventeen Stamity rows
  shown, the nine touchpoints hidden, an 8,489-character block, nothing shortened.
- **u4b review, round 1** (the retry). Request changes, confidence medium.
  - Closures on the four routed Minors: `review/7`, `review/21`, `build/23` and `review/23`, all fixed.
  - `review/25`, a Warning marked `decision_needed`: the row counted every pack MCP server as reaching every client,
    though emission writes only the servers `manifest.mcp.servers` selects (`src/mcp/emit.ts:164-167`).
  - Minors `review/26`–`review/30`:
    - an unnamed "declares no selected client" drop;
    - an inert all-hooks-rejected pack that passes;
    - a policy warning printed twice by `check`'s second plan;
    - a stale comment in `src/cli/engine/emission.ts:73-75`;
    - a "on every client" overclaim in the clash text.
- **Sign-off on `review/25`** (orchestrator, 2026-10-06):
  - A pack's MCP server reaches a client only when `manifest.mcp.servers` selects it, and then only the clients
    emission writes it for.
  - A pack whose only remaining delivery is a selectable but unselected server is reported `warn`, naming
    `stamity config mcp add <id>`. The pack is inert until the user opts in: a deliberate state, not a silent drop.
  - `fail` stays for an installed pack none of whose artifacts reaches a selected client and that has no unselected
    server pending.
  - The test pinning the old claim (`test/emit/plannerPackReach.test.ts:195`) changes with a justification.

  The five Minors ride the same fix round. They are small, and they sit in files only this fixer touches now.
- **u4b fix, round 1.** All six rows fixed as signed off.
  - A third drop reason, `not selected`, was added.
  - `check`'s second plan runs under a flag that prints each policy warning once.
  - Two pins changed with justifications, and seven cases were added.
- **u4b review, round 2.** Approve, confidence medium. Closures: `review/25`–`review/30`, all fixed. The digest left
  `review/29` out, but the report's closures block carries it.
- **u4b committed** on the integration branch as `778c9ef0`. u7 was cherry-picked as `8cc796b8`.
- **Prove, 07:18Z.** The complete branch is `c0eb1100..8cc796b8`: 49 files, +5,003/−227. Dispatched in parallel:
  - u7's review, against the real row;
  - the full local gate in `pd-gate`, reset to `8cc796b8`, the only live check on the machine (build, lint,
    typecheck, the suite, the coverage run, `node dist/cli.js check`, `npx knip`);
  - the three specialist lenses: security, performance and design-quality;
  - the whole-branch review at Fable 5.1.
- **u7 review, round 1.** Request changes, confidence medium.
  - Closures: `build/2`, `build/25` and `build/27` fixed; `build/26` not fixed.
  - `review/31`, a Warning: the page says `pack-reach` fails where the row warns (an unselected server; nothing
    deliverable).
  - `review/32`, a Warning marked `decision_needed`: the stale-folder loop (below).
  - `review/33` and `review/34`, Minors.
- **Performance lens.** Posted 1 Warning and 1 Minor, with no declared budget breached.
  - `review/35`: every plan does one more uncached content walk, and `check` plans twice with a pack installed.
  - `review/36`: reuse the drift gate's plan.
- **Design-quality lens.** Posted 2 Warnings and 4 Minors.
  - `review/37`: `add`'s clash refusal offers only "rename in the pack's source", even against an override or the
    core.
  - `review/38`: the `pack-reach` fail row's "generated mode" remedy names no command, and none exists.
  - Minors `review/39`–`review/42`: the error document covers paths only; the platform fallback lists no values; a
    continuation indent; mixed bare and pinned CLI forms.
- **Security lens.** Posted 2 Minors and no Critical or Warning.
  - `review/43`: a pack's `id:` is printed without control-character stripping.
  - `review/44`, `decision_needed`: `add`'s refusal nudges the operator to `clean --pack` an established pack, which a
    hostile pack could provoke on purpose.
  - Open question: NTFS compares names by upper-casing, so `ı` and `i` share a folder; the NFC-plus-lower-case fold
    misses that.
- **Whole-branch review at Fable 5.1.** Request changes, confidence medium. Every cross-unit seam holds, and the gate
  file is unedited since `40371e1b`.
  - `review/45`, `decision_needed`: a re-add over an installed copy whose old files clash passes `add`, leaves the old
    folder unledgered, and the remedy (`clean --pack` sweeps ledger rows only) then loops.
  - Minors `review/46`–`review/51`.
- **Full gate on `8cc796b8`.**
  - Build, lint and typecheck pass. All 34 defect cases pass. `node dist/cli.js check` shows 15 rows ok, drift clean.
  - `prove/1`: `npx knip` fails on the unused exported type `PackArtifactDrop`.
  - `prove/2`: the live Claude walk failed twice. After its update step printed PASS, `claude plugin list` still
    showed fixture.1. The coverage run stopped on the same test, so the per-file floors were not evaluated.
  - Claude Code had updated itself to 2.1.291 at 07:11Z that morning; the walk passed on 2.1.278 on 10-03.
  - The temp volume is down to 4.9% free. The finished scratch reproductions and the two Codex installs were
    deleted, about 1 GB.
- **The maintainer's answer, 2026-10-06** (`review/32` and `review/45`, the same defect): "Refuse that re-add
  (Recommended)". `add` refuses a re-add whose new version would leave any of the installed copy's files behind,
  before writing, and names `stamity clean --pack <id>` first.
- **Sign-off on `review/44`** (orchestrator): when the other owner is an installed pack, `add`'s refusal never advises
  removing it. It names both owners and says to rename the artifact in the incoming pack's source, or to remove the
  installed pack only to replace it on purpose.
- **Sign-off on the fold question** (orchestrator): fold names with NFC, then upper case, then lower case. That also
  joins `ı`/`i`, `ſ`/`s` and the Kelvin sign with `k`, as NTFS and APFS would.
- **Fix-round plan, 07:38Z.** Two fixers in two lanes from `8cc796b8`, with disjoint files.
  - Fixer 1 (add, install, catalog, the packs page): the re-add refusal; per-owner remedies with no removal nudge;
    the error document covering both kinds of collision; control-character stripping in the clash lines; the fold;
    the catalog comments; the cast's reason; and the page's corrections.
  - Fixer 2 (check, planner, panel, types, the init test, the troubleshooting and plugins pages):
    - the `pack-reach` remedy, indent and stripping, and `warn` for a policy-denied pack;
    - the pinned CLI form in the sync remedies;
    - knip;
    - the platform fallback's values;
    - the init test's isolation from a host `insteadOf`.
  - Deferred to the inbox:
    - `review/35`, `review/36`: advisory, no budget;
    - `review/46` (= `review/13`, `build/19`): defence in depth;
    - `review/48`: `validate` runs no cross-class check;
    - `review/49`: an override-shadowed pack artifact counts as reaching.
  - The Claude walk runs on `main` (`c0eb1100`) in `pd-gate` to settle `prove/2`.
- **Baseline Claude walk on `main`** (`c0eb1100`, Claude Code 2.1.291): fails the same way at
  `test/ci/pluginLifecycle.test.ts:1019`; the Copilot, Codex and Cursor walks pass. The cause is the client update, not
  this branch. `prove/2` is closed deferred, and an inbox Warning goes to the plugin route. The walk's own skip line
  still names "claude 2.1.278", a stale literal in the test. The final local gate runs with `STAMITY_CLAUDE_BIN` unset;
  the other three live walks stay armed.
- **Fixer 1** (`pd-fix1`). Fixed `review/45`, `/32`, `/37`, `/14`, `/44`, `/39`, `/43` (its part), `/50`, `/17`,
  `/31`, `/33` and `/34`, plus the fold.
  - The ops case: a 1.11.0-shaped copy plus the renamed ops is refused with the `clean --pack` hint, and then
    `clean --pack ops`, `add ops` succeeds.
  - One new Minor: a dropped file the operator edited survives `clean` as salvage and could resurface. It goes to the
    inbox.
  - Committed `25504b58` and picked.
- **Fixer 2** (`pd-fix2`). Fixed `prove/1` (knip), `review/38`, `/41`, `/42`, `/43` (its part), `/47`, `/40` and
  `/51`.
  - The GitHub-origin case was checked under a rewriting global git config.
  - Committed `f257f756` and picked.
  - Two halves sat in Fixer 1's files: the packs page's "CLI route" sentence and a bare `stamity clean --pack` in
    `add.ts`. A follow-up fixer takes both at 07:55Z.
- **The follow-up fixer.** Fixed `review/38` and `review/42`. At the orchestrator's request it also moved `add`'s
  path-collision and left-behind refusals to the pinned form, so a joined refusal shows one spelling. Committed
  `a983db7d`. Two older bare forms, in `clean.ts` and the Codex refusal, went to the ledger as `review/53` and
  `review/54`.
- **Whole-branch review, round 2, at Fable 5.1** (delta `8cc796b8..a983db7d`). Approve, confidence medium.
  - All 20 handed ids closed fixed: `review/45`, `/32`, `/37`, `/14`, `/44`, `/39`, `/43`, `/50`, `/17`, `/31`,
    `/33`, `/34`, `/38`, `/41`, `/42`, `/47`, `/40` and `/51`; `build/26`; `prove/1`.
  - It confirmed: the fold is implemented and tested; the ops 1.11.0 → renamed-ops path is pinned end to end; the
    gate file is unedited; no test was weakened.
  - One new Warning, `review/52`: the packs page named three of `pack-reach`'s four warn cases.
- **`review/52`.** Fixed (`5df34f7c`, docs only) and re-reviewed at Opus 5.5: approve, confidence high, closed
  fixed.
- **Ledger at the close.** 88 rows, none open: 54 fixed, 16 rejected with reasons, 18 deferred. Every deferred row has
  an inbox row in this run's dated block.
- **Final full gate on `a983db7d`, 08:17Z** (`pd-gate`, alone; `STAMITY_CLAUDE_BIN` unset as recorded, with the
  Cursor, Copilot and Codex walks armed):

  | Gate | Result |
  |---|---|
  | `npm run build` | pass |
  | `npm run lint` | pass (the one warning in `spec-plan-coverage.mjs` predates this branch) |
  | `npm run typecheck` | pass |
  | The suite (`npx vitest run`, JSON) | pass: 10,781 passed, 0 failed, 14 skipped; all 34 defect cases pass; the Cursor, Copilot and Codex walks pass |
  | `npm test -- --coverage` | pass: no "does not meet" line; `planner.ts` 100/95.45/100/100, `skillsProjection.ts` 99.03/94.18/100/100, `capabilityMatrix.ts` 98.34/94.33/100/100 |
  | `node dist/cli.js check` | pass: every doctor row ok, drift clean |
  | `npx knip` | pass |
  | `node scripts/leak-gate.mjs` | pass: 0 hits across 1,728 files |

  The final tree, `5df34f7c` plus this run's records, adds one docs paragraph and the records to that tree. It gets
  its own runs: the records, docs and leak checks below, and CI's full run on every leg.
- **Records committed** as `75b17919`. The narrow gate on it passed: the records, learnings, QA and docs suites (558
  passed), the leak gate, knip and lint.
- **PR #77 opened as a draft** at `75b17919`. CI was green on every leg: `check` on Node 22.22.2 and 24 and on both
  Windows shards, the coverage legs, the plugin and APM routes and the size budget. Both aggregators, `all-ci-checks`
  and `all-pr-checks`, read `pass`. The review bot posted nothing on the draft.
- **The candidate reproduction** (the proof bar's scratch run, `node <lane>/dist/cli.js` at `75b17919`), in fresh
  repositories outside both checkouts:
  - A fresh install: `init`, `add ops`, `sync` and `check` all exit 0 on Cursor and on Codex alone. The reported
    regression is gone.
  - The real upgrade on Cursor: ops installed by the published 1.11.0, whose `sync` fails. The candidate's `sync`
    refuses, naming both clashes and the remedy. A plain re-add is refused, naming the two files it would leave
    behind. Then `clean --pack ops`, `add ops`, `sync` and `check` all exit 0.
  - The real upgrade on Claude, where 1.11.0's `sync` passed silently: the candidate's `sync` refuses as it should,
    but the printed remedy failed at `add` (exit 1, "7 path(s) it would write are not free"). `clean --pack` removes
    only the pack's own files, and the copies a `sync` projected into `.claude/` stay until the next `sync`. That is
    `prove/3`.
  - The remedies printed `@1.11.0`. That is `prove/4`, closed as not a defect: every remedy pins the running engine
    (`ctx.app.version`), and the unreleased candidate still reads 1.11.0 in `package.json`.
- **`prove/3`, `prove/5` and `prove/6` fixed** (`ff854b2a`). Every remedy that replaces a pack prints the order that
  works: `clean --pack`, then `sync`, then `add`, then `sync`. That covers:
  - the sync clash refusal;
  - `add`'s left-behind, replace-on-purpose and path-collision refusals;
  - `check`'s `pack-integrity` row, which still says not to sync before clean;
  - both pages.

  `test/pack/upgradeRemedy.test.ts` walks a synced 1.11.0-shaped ops on Claude through the printed steps to a clean
  `check`, and fails under the old order. Pushed to PR #77.
- **Whole-branch review, round 4, at Fable 5.1** (`75b17919..ff854b2a`). `prove/3`, `/5` and `/6` closed fixed. Three
  new Warnings, `review/56`–`review/58`, are remedies that still did not run as printed in their own state:
  - an edited pack file survives `clean` as salvage, then `add` refuses it;
  - after a clean, the collision remedy's first step is `clean --pack`, which says "no pack is installed";
  - one `check` run prints two orders.
- **Full gate on `ff854b2a`.** Green as written: 10,783 passed, no floor miss, `check`, knip and the leak gate pass.
  One variant coverage run, with a reporter flag the brief did not ask for, exited 1 with its output cut. The run as
  written exited 0. CI on `ff854b2a` was green on every leg.
- **Round-4 fix.** A fresh fixer fixed `review/56`–`review/58` and found `review/59`: the re-install step's `add <id>`
  only works for a catalog pack.
- **The review cap.** The loop sat at its 4-round cap. The maintainer's answer (2026-10-06): "One more round
  (Recommended)".
- **Round-5 fix.** The re-install step names the source the receipt records. The receipt is trusted only when its
  bytes match its ledger row, and the spec is printed as one quoted word. Committed `94f348e5`.
- **Whole-branch review, round 5, at Fable 5.1.** Approve, confidence medium. `review/56`–`review/59` closed fixed,
  with no new finding. The loop converged.
- **Full gate on `94f348e5`.** Red on one test: `test/architecture/boundaries.test.ts:1040`. Round 5 added the imports
  `src/pack/verifyInstalled.ts → src/pack/curated.ts` and `→ src/pack/receipt.ts`, which the wave layering forbids
  (`prove/7`, Critical). The fixer's narrower runs did not include `test/architecture`. Everything else passed:
  10,789 tests, the 34 defect cases, the 9 upgrade-remedy cases, `check`, knip and the leak gate. A fixer is moving
  the receipt read without a waiver.
- **Candidate reproduction on `94f348e5`'s build** (the four-step remedy, from real 1.11.0 installs):
  - Fresh: `add ops`, `sync` and `check` exit 0 on Cursor and on Codex alone.
  - Upgrade on Cursor and on Claude: the candidate's `sync` refuses, and a plain re-add refuses. Then
    `clean --pack ops`, `sync`, `add ops`, `sync` and `check` all exit 0.
  - The refusal printed exactly those four steps.

- **The layering fix** (`prove/7`): the receipt read moved verbatim into `src/cli/commands/check.ts`, at wave 15, which
  may import both modules. `verifyInstalled.ts` is back to its plain re-hash. No waiver. Committed `eb4f0727`. The
  Fable closure check approved at confidence high: `prove/7` fixed, and the printed remedy is byte-identical.
- **Final full gate on `eb4f0727`** (`pd-gate`, alone, each gate once as written; `STAMITY_CLAUDE_BIN` unset as
  recorded): every gate passes.
  - Build, lint and typecheck.
  - The suite: 10,790 passed, 0 failed. `test/architecture/boundaries.test.ts` 32/32, the defect file 34/34,
    `upgradeRemedy` 9/9. The Cursor, Copilot and Codex walks pass.
  - The coverage run: no "does not meet" line; statements 96.77%, branches 90.31%.
  - `check`: 15 rows ok, drift clean.
  - knip, and the leak gate (0 hits across 1,734 files).
- **CI on `eb4f0727`:** green on every leg (Node 22.22.2, Node 24, both Windows shards); `all-ci-checks` and
  `all-pr-checks` pass.

## QA checkpoint (2026-10-06)

The walk-through, built by the qa skill. The change has no graphical surface, so browser evidence does not apply.
Seventeen rows were derived. Fifteen are auto-proven by existing evidence (the appendix below); two needed a person.

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| 1 | A plugin-backed Claude Code session lists a pack's skill | In a repository where Claude Code runs Stamity as a plugin: `node <candidate>/dist/cli.js add ops -y`, `… sync`, then type `/` in Claude Code | ops's skills (e.g. `st-release-runbook`) are listed; `… check` shows `pack-reach` warn, naming ops's commands and agents the plugin carries | M | 6 | accepted-unwalked · `356288c64581913def8e16d9f5a840a38df13c5c5d9302ec5364fd2bc295ac98` |
| 2 | The changed docs pages render | Open PR #77 → Files changed → view `docs/packs-and-trust.md`, `plugins.md`, `troubleshooting.md`, `migration.md` and `customization.md` rendered | tables, lists and code render intact | L | 3 | accepted-unwalked · `d04ef1d467698dcef2089b2b5109131daf9cc36d1ccf2ce04bc1a6f146665818` |

Input hashes are the sha256 of the sorted `<path> <git hash-object>` lines at `eb4f0727`:
- row 1 over `src/pack/projection.ts`, `src/cli/commands/plugin/probe.ts`, `src/cli/commands/check.ts` and
  `src/emit/planner.ts`;
- row 2 over the five pages.

**Appendix: auto-proven rows.** Each rests on the final gate on `eb4f0727`
(`env -u STAMITY_CLAUDE_BIN npx vitest run`, pass, 10,790 passed) and on CI on every leg. Line numbers are at
`eb4f0727`.

| # | Scenario | Risk | Evidence |
|---|---|---|---|
| H1 | Upgrading a repository that installed ops with 1.11.0 reaches a clean `check` through the printed remedy | H | `test/pack/upgradeRemedy.test.ts:304`, `:357`, `:391`; the candidate reproduction from real 1.11.0 installs on Cursor and Claude (session scratch, `repro-candidate-94f348e5.out`) |
| H2 | A pack cannot shadow a core touchpoint or core skill | H | `test/pack/packEngineDefects.test.ts:516` (B3, skill `work`), `:494` (B2, command `verify`) |
| 3 | Control characters in a pack's id never reach the terminal | M | `test/cli/commands/add.test.ts:1696`; the ESC cases in `test/content/invocableNames.test.ts` and `test/cli/commands/check.test.ts` |
| 4 | `add ops`, then `sync` and `check`, work on Cursor and on Codex in a fresh repository | M | `test/pack/packEngineDefects.test.ts:401` (A); the candidate reproduction's fresh runs |
| 5 | `add` refuses a clashing pack, names both owners, writes nothing | M | `packEngineDefects.test.ts:429` (B1, five client sets), `:538` (B4) |
| 6 | `sync` refuses an installed clash with a remedy that works | M | `packEngineDefects.test.ts:458` (B5); `upgradeRemedy.test.ts:304` |
| 7 | Codex: a commands-heavy pack syncs; an oversized skills pack is refused, naming its share | M | `packEngineDefects.test.ts:575` (C1), `:604` (C2) |
| 8 | A pack skill's file lands where each plugin-backed client reads skills | M | `packEngineDefects.test.ts:680` (D1, five client sets) |
| 9 | `check` fails a pack that reaches nothing, and warns for partial, inert, denied or awaiting | M | `packEngineDefects.test.ts:705` (D2); the `pack-reach` cases in `test/cli/commands/check.test.ts` |
| 10 | An overlay on a pack skill is refused (user stage) or skipped and reported (fork stage) | M | `packEngineDefects.test.ts:745` (E); `test/content/overlayPackSkill.test.ts:143`, `:185`, `:273` |
| 11 | A re-add that would leave files behind is refused, and its printed remedy runs | M | `upgradeRemedy.test.ts:357`, `:391`; the re-add cases in `add.test.ts` |
| 12 | An edited pack file's integrity remedy runs as printed, catalog and local path | M | `upgradeRemedy.test.ts:480`, `:488` |
| 13 | The init panel shows the detected platform | L | `test/cli/commands/initPanel.test.ts:887`, `:904`; `test/cli/commands/init.test.ts:655` |
| 14 | `init --maturity <tier>` writes and shows the tier | L | the `--maturity` cases in `test/cli/commands/init.test.ts`; `initPanel.test.ts:307` |
| 15 | The changed pages' links resolve | L | `test/docsPages.test.ts` (in the gate) |

**Sign-off** — the four 1.11.0 pack-engine defects and the three init rows, 2026-10-06:

- [x] Every H row walked or auto-proven, and passing: H1 and H2 are auto-proven.
- [x] Every failing M row has a filed follow-up, linked: none fails.
- L failures are recorded, not blocking: none.
- Rollback: a revert pull request of this branch's commits on `main`. They land by fast-forward, so
  `git revert --no-edit c0eb1100..<merged head>`.
- Shippable: YES. No H row is accepted-unwalked.

The maintainer's answer (2026-10-06): "Accept both unwalked (Recommended)". Rows 1 and 2 are recorded
`accepted-unwalked` with their input hashes. The same answer round: the spec amendments, "Merge them
(Recommended)"; the merge, "Yes, fast-forward (Recommended)".

## Inbox

The settled rows left the inbox, the reworded row was updated, and the run's dated block was appended (2026-10-06):
- inbox retired: `.stamity/inbox.md:359` (the 1.11.0 ops-pack regression) — fixed in 2026-10-03_pack-engine-defects
- inbox retired: `.stamity/inbox.md:419` (the end-of-init panel's platform) — fixed in 2026-10-03_pack-engine-defects
- inbox retired: `.stamity/inbox.md:420` (the migration guide's wording) — fixed in 2026-10-03_pack-engine-defects
- inbox retired: `.stamity/inbox.md:421` (an `init --maturity` CLI test) — fixed in 2026-10-03_pack-engine-defects
- inbox retired: `.stamity/inbox.md:462` (the overlay-on-a-pack-skill probe) — fixed in 2026-10-03_pack-engine-defects
- `:407` reworded: "a PowerShell twin of the reset block" is now "of the two reset blocks", matching plan 016 file 3.
- appended: 27 rows. 18 of them are this ledger's deferred rows, each with its `Ref:`. The other 9 are the Copilot
  touchpoint gap, the plugin-mode pack classes, and the audit's carry-overs:
  - the `gh` 2.102.0 fact;
  - two plan-017 observations;
  - S9 against REQ-PLUGIN-044's title;
  - the marker check's false hits;
  - the implementer's missing findings grammar;
  - `validate` against `sync` on a pack-skill override.

## Notes on earlier records

Dated 2026-10-06, on the maintainer's answer of 2026-10-03 ("add the dated notes"). A record already written is
read-only to later runs, so the notes live here and name the lines they answer.

- `.stamity/runs/2026-10-01_pr73-review-round-1/record.md:117-118` and
  `.stamity/runs/2026-10-01_pr73-pr-resolve-r1/record.md:84-85` still ask the maintainer to confirm or reverse three
  defaults: plan 015's Decision 14, plan 016 file 2's S14 and file 3's S9. The maintainer confirmed all three on
  2026-10-02. The first record's QA line stays unsigned: that run changed documentation only and derived no QA rows.
- `.stamity/runs/2026-10-02_pr73-pr-resolve-r2/record.md:3` says every thread was resolved and #73 merged. That held
  when it was committed, at 09:05Z.
  - #73 merged at 09:14:46Z.
  - At 09:23:21Z the review bot posted a third review on `81b71b09` (review 5390195210): 17 comments, 4 on plan 015
    and 13 on plan 016, 9 of them P1.
  - Their threads stay open on #73 by the maintainer's choice. Package 19's intake reads the 4 on plan 015;
    Package 20's reads the 13 on plan 016.
- The #73 round-1 record and plan cite their work brief and triage at a session scratch path. Both are preserved in
  this run's `evidence/` folder: the brief with its one local path replaced by a placeholder, the triage as a byte copy.

## Change list for the next release's CHANGELOG section

This repository writes a release's section at its cut. This run merges without one, so the list is kept here.

- **Fixed**
  - `add ops`, then `sync`, works again on Cursor and on Codex: the 1.11.0 regression.
  - `add` refuses a pack whose command or skill would install under a name another artifact of the other class
    already takes, naming both owners, with a remedy for each. `sync`, `check`, `init` and `plugin setup` refuse such a
    pack an earlier version installed, with a remedy that works, instead of the generic two-planner collision.
  - The Codex skills list counts only the rows Codex shows its model, so the touchpoints and pack commands no longer
    count. The refusal names each installed pack's share.
  - Pack skills reach plugin-backed clients.
  - An overlay on a pack skill is refused by `sync` and `validate`, where it was silently dropped. A fork overlay on
    one is skipped and reported.
- **Added**
  - The `check` row `pack-reach`.
  - The end-of-init panel shows the detected hosting platform.
- **Changed**
  - ops's skills are renamed: `st-release` → `st-release-runbook`, `st-incident-response` → `st-incident-runbook`.
    A repository that installed ops with 1.11.0 runs `stamity clean --pack ops`, then `stamity sync` (which reclaims
    the old copies), then `stamity add ops`, then `stamity sync`. That includes Claude-only and Copilot-only
    repositories, where the first `sync` after the upgrade refuses until then.
  - `add` refuses a re-add whose new version would leave files of the installed copy behind. The remedy is the same
    four steps.
  - The `pack-integrity` remedy is now `clean --pack`, then `sync`, then `add`, then `sync`, still never a `sync`
    before the clean.
  - Name clashes are found ignoring case, as macOS and Windows compare names.
  - `docs/migration.md` says what a full migration carries and shows.
  - The capability matrix's Codex core figure is 5,570 of 8,000 characters.
- **Removed**
  - The unwired `InitOverrides.platform`.
