# Run 2026-10-07_security-fixes — plan 016 file 0, the five 1.11.0 security fixes

Status: closed 2026-10-08
Plan: docs/plans/016-fork-distribution-00.md
Invocation: /st-work docs/plans/016-fork-distribution-00.md
Intensity: deep — security-sensitive paths (the ledger, the reclaim sweep, settings and hook files), public CLI contracts (`check --expect-*`, a new error code, `check --json` fields), a persisted manifest field; the full specialist pass and a whole-branch review on the frontier class (Fable 5.1) before the merge
Confidence gate: medium
Isolation: manual worktree lanes outside the checkout (`~/Projects/zomarit/.stamity-worktrees/stamity/<lane>`, branched from the integration branch, `node_modules` symlinked); units that share a file integrate one writer at a time in the plan's integration order
Branch: `fix/plan-016-file-0`, from `main` at `8540fcf2`
Opened: 2026-10-07T13:55Z

## Frame (Phase 0)

**Outcome.** The five security defects measured in 1.11.0 are fixed in one pull request: the ledger and the import
decisions are bounded to what the engine writes, and a delete or an overwrite needs the bytes too; `.claude/settings.json`,
`.cursor/hooks.json`, `.codex/hooks.json` and `.codex/config.toml` keep an owner's entries; `check` takes the expected
release, client set and install mode from its caller; a registry fork's pinned calls name its registry. Merged to `main`,
then shipped as 1.12.0.

In scope:
- the five units of the plan, in its lanes and integration order;
- the plan text the 2026-10-06 merge left inconsistent in `docs/plans/016-fork-distribution-01.md` to `-03.md`, and file
  0's own release lines (the maintainer's answer below);
- the inbox rows the plan folds in, the review bot's row on file 0, and the late review comments on #87 recorded as rows.

Out of scope:
- everything in plan 016 files 1 to 3 beyond their text fixes;
- the release cut itself (its own branch after this merge: version, CHANGELOG section, the full eval run, the generated
  setup text's `clean -y` line and the five 1.11.0 eval misses);
- the live Claude plugin walk on Claude Code 2.1.291 (diagnosed in Package 19; this run's gates run with
  `STAMITY_CLAUDE_BIN` unset and record why).

**Start answers (2026-10-07, the question tool; the maintainer).**
- The declared defaults S1–S19 stand as written.
- The release is **1.12.0**, not a patch: the change adds `check --expect-*`, a new error code and a persisted manifest
  field, and a patch adds no behaviour (the rule chosen at 1.3.0).
- The release also carries the generated setup text's incomplete `clean -y` line and the five 1.11.0 eval misses, in its
  preparation.
- The plan 016 files 1–3 merge damage is fixed now, in this pull request.

**Intake (before building).**
- Every reproduction re-ran at `8540fcf2` (code identical to the plan's stamp `d10db029`): forged ledger rows (`sync -y`
  deleted five owner files and overwrote a sixth with no `.bak`; `check` printed "5 queued for reclaim" and named `sync`),
  both `importChoice` flips, the guard-dropping `skip`, the client drop (78 rows, 76 files; `check` exit 0), and a
  `--registry` fork's 44 bare pinned calls in 23 files (`sync --help` and the update banner bare too). All reproduce.
- One release before the head (1.10.0), a Codex rule anchored to a plain folder writes `packages/app/AGENTS.md` whose first
  non-blank line is ``# Conditional rules (Codex down-conversion) — `packages/app` ``, byte-identical to the head's; the
  plan's risk row ("another first line") does not hold for 1.10.0. A folder that is an npm workspace package gets its own
  charter instead, and the rule moves into that charter's section.
- The review bot's row on file 0 (a forged row with a matching hash can still delete an owner's own `st-`-named file in an
  engine content folder): declined as a change to S3/S4 — a stronger proof cannot re-render what older releases wrote,
  and `check` now names every path a `sync` would reclaim; the residual widens the plan's follow-up row on in-bound byte
  proofs.
- The 13 post-merge #73 comments on plan 016: none bears on file 0's units; the two on what `sync` and `clean` delete
  (folder claims in another tool's lock, pre-existing placeholders) stay file 1's.
- Plan 019's #87 got a second review-bot pass after its merge (8 comments); none bears on this run; recorded as inbox rows
  for plan 019 file 1's opening inbox pass.

**Deferral inbox (step 4).** 114 rows name a path in the five units' `files` cells. The plan settles six (363 split, 486,
487, 384, 386; 324 changed and left open) and the review bot's row on file 0; the rest stay in the inbox by default (the
inbox is cleared once at plan 019 file 1's start).

**Plan gate.** Default applied: plan gate → option 1, execute now (persisted plan docs/plans/016-fork-distribution-00.md;
the start questions were asked and answered).

## Build (Phase 3)

Lanes (2026-10-07T13:57Z): `016-00-a` (`u0-ledger-bound` in two passes — REQ-PLUGIN-045 first, REQ-PLUGIN-046 second,
the split the d0b draft offered — then `u0-settings-ownership`, `u0-hook-files-ownership`), `016-00-b`
(`u0-registry-bound-calls`, then `u0-check-expectations` once `u0-ledger-bound` integrates), `016-00-docs` (the plan text,
one writer). Implementers run only their unit's narrow `verify`; every full suite runs alone in the integration branch.

- Vendor facts re-read for the units (researcher, 2026-10-07): Cursor 3.23.23's hooks page lists the same 21 events as
  microsoft/apm#3129; the whole-file drop on one unknown key is shown only for Cursor 3.13.10; Copilot rejects an inline
  `hooks` field on one bad item (S10 confirmed); Codex runs hooks by default (codex-cli 0.160.1), so S16's warning moves
  to `hooks = false`; Claude Code runs matching hooks in parallel (S14 holds); npm 12.2.0 reads `--@<scope>:registry`
  as before (S8, S9 hold). Folded into the plan text as dated amendments.
- `016-00-docs` → `411c8626` `docs(plans): repair plan 016's merged amendment and record file 0's release`, verified by
  a test-runner (the four plans' coverage checks exit 0; `test/authoring/specPlanCoverage.test.ts`, `test/records`,
  `test/ci/leakGate.test.ts` pass) and fast-forwarded into the integration branch. The spec-author's shell refused
  `git commit` and `node`, so the orchestrator committed after the runner's pass.
- `016-00-b` → `1988e251` `u0-registry-bound-calls` (30 files, +1030/−69): red run 25 failed first; the narrow verify,
  lint, typecheck, knip and the dogfood sync pass; a fork clone binds 44 of 44 calls in 23 files and 53 of 53 in the
  plugin roots. Ledger `build/1`–`build/7` (one Warning: `test/support/identity.ts` `npxCommand`).
- `u0-registry-bound-calls` review round 1 (reviewer, Opus 5.5): request-changes, confidence high — `review/1` Critical
  (the plugin generator's registry wiring has no test), `review/2` Warning decision-needed (`fork-identity.mjs --registry`
  accepts `%` and shell characters the CLI's grammar refuses, so such a fork silently renders `npx --no`), `review/3`
  Minor (no case passes the rendered argument through cmd or PowerShell).
  - Sign-off `review/2` (orchestrator, 2026-10-07): option 1 — `scripts/fork-identity.mjs --registry` refuses any URL
    outside `REGISTRY_URL` with the CLI's own rule (one grammar, refused at fork creation, never a silent `npx --no`);
    `docs/enterprise-forks.md` states what is refused; the CHANGELOG names the refusal. Widening the grammar to `%XX`
    would reverse S9. Listed for the maintainer at the close.
- `016-00-a` pass 1 → `4853b6e1` (REQ-PLUGIN-045 and REQ-PLUGIN-016's bound paragraph; +1,134/−287 over 20 files):
  red run `test/cli/ledgerForgery.test.ts` 6 failed at `8540fcf2`, then the unit's narrow verify green (745 tests).
  Returned BLOCKED_DEPENDENCY: the bound correctly refuses fixtures in eight files outside its `files` cell (39 tests,
  fixture shapes and wiring only), and `src/merge/reclaim.ts`'s 100% floor rests on four of them.
  - Orchestrator, 2026-10-07: `u0-ledger-bound`'s `files` cell is widened to `src/composition/root.ts`,
    `test/composition/root.test.ts`, `test/cli/commands/initApply.test.ts`, `test/cli/engine/emission.test.ts`,
    `test/merge/coverageGaps.test.ts`, `test/merge/reclaim.property.test.ts`, `test/merge/writeEscape.test.ts`,
    `test/merge/writeRace.test.ts`, and the two fixture constants of `test/cli/commands/sync.test.ts` (that file is
    `u0-registry-bound-calls`' too; `u0-ledger-bound` integrates first, so its edit lands first and lane B rebases onto
    it). The plan's cell is amended with the next plan-text pass.
  - Unblock → `9897ab76`: the eight files migrated (each changed test marked `TEST CHANGE, justified: REQ-PLUGIN-045`;
    `reclaim.property.test.ts` stays a seeded property, now over eleven path kinds drawn from the bound, red when a
    name-only delete returns); the 72-file survey green (3,337 passed); `src/merge/reclaim.ts` and
    `src/manifest/ownedPaths.ts` at 100% on all four counters over the 18 suites that cover them. Ledger `build/8`–`build/13`
    (six Minors). Pass 2 (REQ-PLUGIN-046) dispatched on top; pass 1's round-1 review reads `8540fcf2..9897ab76` in
    parallel.
- `u0-registry-bound-calls` round 1 fix → `47e0a870` (`review/1`–`review/3`, `build/1`); round 2 re-review (fresh
  reviewer): approve, confidence medium — all four closed `fixed`. Round 2 fix → `ad0ac0ce` (`review/4`: a registry fork's
  own suite no longer fails on the registry argument, measured in fork copies). The fixer's round-2 findings
  `review/5`, `review/6` (two test files already failing in any renamed fork at `8540fcf2`) and `review/7` (the
  renamed-fork witness list) are fixed now rather than deferred — a few lines in test files, and an enterprise fork runs
  this suite in its own CI.
- `u0-ledger-bound` pass 1 review round 1 (reviewer, Opus 5.5): request-changes, confidence medium. The bound is complete
  for every frozen row and planner scenario, crafted spellings cannot escape it, and the changed tests are stronger,
  not weaker. One Warning, decision-needed: the co-owned reclaim path (`src/merge/reclaim.ts:645-668`) reads a hashless
  row as undrifted, so a forged in-bound `.claude/settings.json` row strips an owner's `permissions` and `hooks`, or
  deletes the file, with no `.bak`. Four Minors (an in-repo symlink under a bound folder; case-folding file systems;
  unsanitised paths in `check`'s text; `strip`/`reduce` lines folded into "… and N more").
  - Sign-off (orchestrator, 2026-10-07): option 1 — fix it in this unit (a missing hash on the co-owned path reads as
    drift and takes a verified `.bak`), so the tree is safe at this unit's own merge point and its CHANGELOG bullet is
    true; `u0-settings-ownership` then replaces the path with per-entry proofs. The four Minors go to the same fix round
    where cheap.
  - Sign-off `review/12` (orchestrator): `check`'s text names every reclaim path, `strip` and `reduce` included, with no
    "… and N more" fold for reclaim lines — REQ-PLUGIN-045 says `check` names every path a `sync` would reclaim.
- `u0-registry-bound-calls` round 3 fix → `dca98246` (`review/5`–`review/7`; the opt-in renamed-fork witness passes for a
  private and a `--registry` fork; the 55 suites touching the npx call form pass in both fork classes). Round 3 re-review
  (fresh reviewer): `review/4`–`review/7` closed `fixed`; its one Warning (`review/14`, a conditional spread that might
  fail `exactOptionalPropertyTypes`) was voided by a test-runner's `npm run typecheck` exit 0 at `dca98246` and closed
  `rejected`. **The unit is approved**; it integrates after lane A's ownership units, as the plan orders.
- `016-00-a` pass 2 → `db468b5e` (REQ-PLUGIN-046; 17 files, +974/−55): red run 8 failed (seven for the expected
  reasons, one fixture corrected); 73 files green (2,854 passed); `reclaim.ts` and `ownedPaths.ts` at 100%. Returned
  BLOCKED_DEPENDENCY on `test/emit/sharedCharterIdentity.test.ts`'s `decideCharter` (six tests: a `skip` decision beside
  `AGENTS.md` rows, now refused). The orchestrator widened the cell to that function (lane B edits the same file's
  `goldenDriftGate`; lane A integrates first) and copied the return into `reports/u0-ledger-bound-implementer-r2.md`.
  Ledger `build/14`–`build/20`. One fixer round takes pass 1's findings and `build/14`/`build/17`/`build/18`; pass 2's
  review reads `9897ab76..db468b5e` in parallel.
- `u0-ledger-bound` pass 2 review round 1 (reviewer, Opus 5.5): request-changes, confidence high. Every route the
  reproductions used is closed (`skip` plus a row refused; a flip or a removed decision is an `import-decision` collision,
  never written under `--force`; forged hashes at `AGENTS.md` and the workflow take a verified `.bak`; byte-proof paths
  root-only; BOM and CRLF handled). `review/15` Warning decision-needed: the engine's own root `AGENTS.override.md` (the
  owner's `AGENTS.md` text under `skip`, or owner text above the block under `supplement`, plus the Codex appendix) fails
  the byte proof, so each sync takes a `.bak` with a "may be yours" warning and a deselected Codex keeps a stale override
  Codex still reads — the plan's own named risk. `review/16` Warning: `sync`'s closing line offers `--force` for an
  `import-decision` refusal and never prints its remedy. `review/17` Minor decision-needed: the structural proofs pass an
  owner file that copies the charter's four headings or the workflow's header line. `review/18` Minor: `init/plan.ts`
  binds its probe set to the order of `OWNED_PATHS.importTargets`.
  - Sign-off `review/15` (orchestrator): the override is proven the engine's by re-rendering — its bytes equal the
    `AGENTS.md` beside it followed by the engine's current Codex appendix rendering — the same "equal to the engine's
    current rendering" proof S11 gives Codex tables; anything else keeps the fail-safe (`.bak` on overwrite, kept and
    named on reclaim). REQ-PLUGIN-046's recogniser text gains the clause in the next plan-text pass. Listed for the
    maintainer at the close.
  - Sign-off `review/17` (orchestrator): kept as REQ-PLUGIN-046 defines the proof (structural, so every release's charter
    passes); the residual joins the in-bound byte-proof follow-up row (re-rendering a charter would fail every charter an
    older release wrote). Decided at the close with the other leftovers.
- `u0-ledger-bound` fix round 1 → `c1065152`, `9791ae81`, `ebb4d34d`, `d881d282`, `cc36fae5`: `review/8` (a hashless row
  on the co-owned path reads as drifted and takes a verified `.bak`; four forged-row cases red first), `review/9` (the real
  parent must sit inside the real path of the bound folder the row claims), `review/10` (the file must be listed under
  exactly the row's spelling), `review/11` and `review/12` (`check`'s text prints every reclaim line, control characters
  shown as escapes), `review/16` with `build/15` (an `import-decision` refusal carries its own remedy and is never offered
  `--force`), `review/18`, `build/14`, `build/17`, `build/18` (`safeWrite.ts` 97.73/95.19/100/99.1 over its floor).
  Coverage over 27 suites: `reclaim.ts` and `ownedPaths.ts` 100%. Returned BLOCKED_AMBIGUITY on `review/15`: the proof
  runs only when the bytes on disk differ from what `sync` is about to write, so "equal to the current rendering" is
  false every time it runs — the orchestrator's sign-off could not pass its own tests.
  - Sign-off `review/15` revised (orchestrator): the fixer's reading 1 — the root `AGENTS.override.md` proves itself when
    the Codex appendix heading `## Conditional rules (Codex down-conversion)` stands on a line of its own; a hand-edited
    override still fails its recorded hash, so it is kept on reclaim and backed up on write. The residual is the same
    kind as `review/17`'s. Reading 2 (re-render from the override's own head) needs a Codex render during `clean` and on
    deselect and still takes a `.bak` whenever a rule changed.
  - New: `review/19` Warning (`workspace sync` offers `--force` for refusals it never clears) and `review/20` Minor (a
    state or pack folder that is itself a committed in-repo link); both go to fix round 2.
- `u0-ledger-bound` fix round 2 → `c751a45e`, `26126e85`, `63d5ba43`: `review/15` (reading 1), `review/19` (a shared
  `refusalRemedyLines` names each refusal class's own remedy in `sync` and `workspace sync`), `review/20` (reclaim refuses
  when `.stamity/`, a state folder or a pack folder is itself a symlink). Narrow suites 652 green; floors hold over 27
  suites. Re-review round 2 and the lane's full gate (lint, typecheck, `npm test -- --coverage`, knip; the four
  `STAMITY_*_BIN` unset — a lane-level suite, not the live client check) dispatched together.
- Plan text pass 2 → `ac659d0a` (verified by a test-runner, fast-forwarded): the two units' files cells as built,
  REQ-PLUGIN-045/046/048 with the rules the review rounds added, and file 2's `ownedPaths` in the bound's built shape.
- `u0-ledger-bound` re-review round 2 (fresh reviewer): approve, confidence medium — 13 ids closed `fixed`; `review/10`
  closed `not-fixed` (the exact-spelling check covers the file name, not a skill folder spelled with other capitals) and
  goes to fix round 3 before `u0-settings-ownership` edits the sweep. Lane full gate at `63d5ba43` (test-runner, the four
  `STAMITY_*_BIN` unset): build, lint, typecheck, `npm test -- --coverage` (270 files, 10,926 passed, 22 skipped, every
  floor held, 222 s), knip — all exit 0.

## Integration

Each lane is rebased onto the integration branch and fast-forwarded into it, so its commits take new shas there; the
lane shas above are the build's record, the shas below are the branch's.

- 2026-10-07T15:56Z `u0-ledger-bound` (both passes and fix rounds 1–2), onto `ac659d0a`: `4853b6e1`→`fc188f34`,
  `9897ab76`→`d6d748e7`, `db468b5e`→`5def6cae`, `c1065152`→`d5982062`, `9791ae81`→`fa390890`, `ebb4d34d`→`6b9362ac`,
  `d881d282`→`046a3c25`, `cc36fae5`→`194f4141`, `c751a45e`→`eeb486ae`, `26126e85`→`4d1caae7`, `63d5ba43`→`f328d473`.
  Lane C (`016-00-c`) opens from `f328d473` for `u0-check-expectations`.
- 2026-10-07T16:02Z the integration branch is pushed at `f328d473` (knip, lint and typecheck green by a test-runner) and
  opened as draft PR #89, so CI's Windows and coverage legs test the bound early. The push named three open Dependabot
  alerts (#23 root and #27 website on `http-cache-semantics` <= 4.2.0, #26 website on `braces`); none has a patched
  version, and the inbox row from the 2026-10-06 security-alerts run already tracks #23 and #27.
- `u0-ledger-bound` fix round 3 → `01b5c6bc` (`review/10`: every segment below the bound folder, folders and the file,
  must be listed under exactly the row's spelling; a real case-insensitive case red first on this Mac). Re-review round 3
  (fresh reviewer): approve, confidence high, `review/10` closed `fixed`. Fast-forwarded into the integration branch
  (`01b5c6bc`). **`u0-ledger-bound` is done.** `u0-settings-ownership` pass 1 (the per-entry core and the manifest
  schema) is dispatched in lane A; pass 2 wires the settings lane.
- `016-00-c` → `de122832` `u0-check-expectations` (from `f328d473`): red run 26 failed first; the unit's suites and the
  11 other suites that run `check` green (958 tests); plain `check` and `check --json` byte-identical to the parent's on
  six outputs; `docs/cli-reference.md` regenerated. Ledger `build/21` (Warning: `check.ts` `pinnedCallAt` passes no
  `registry` — a cross-lane seam, reconciled when lane B and lane C have both integrated; whichever lands second carries
  it) and `build/22`–`build/25` (Minors). Round-1 review dispatched.
- `u0-check-expectations` review round 1 (reviewer, Opus 5.5): request-changes, confidence medium — the flags close the
  holes REQ-PLUGIN-047 names; `review/21` Warning decision-needed (with `--expect-version` also failing, the client-set
  and mode remedies are pinned to the running release, so following the steps breaks `generatedBy` again), `review/22`
  Warning (troubleshooting's list of the codes the page names misses `EXPECTATION_ERROR`), `review/23`–`review/27`
  Minors.
  - Sign-off `review/21` (orchestrator): with `--expect-version` given, every remedy step is pinned to the expected
    release — the step that restores the expectation, as REQ-PLUGIN-047 says — although the plan's interface named
    `packageCommand` for two of them.
  - `review/26` closed `rejected` (the unit's "unchanged without flags" is rightly against its parent build: the ledger
    bound changed `check --json` on purpose; the whole branch's diff is the final review's); `review/27` closed
    `deferred` to the release cut's restamp of every hand page.
- CI on draft PR #89 at `f328d473` (run 37648263478): every leg green but both Windows legs — six tests the ledger bound
  added fail only on win32 (`test/cli/ledgerForgery.test.ts` ×4, `test/cli/commands/syncEngine.test.ts` ×2): the new
  backup warnings render the `.bak` path with backslashes. Ledger `review/28`; a fixer works it in lane `016-00-w` from
  the integration head (lane A is busy with `u0-settings-ownership`, which does not touch those files), with a test that
  fails on POSIX too.
- `u0-check-expectations` fix round 1 → `ae8f2533` (`review/21`–`review/25`; `error.next` steps now separated by `"; "`,
  the separator `error.why` uses; build metadata in `--expect-version` refused; every step at the expected release when
  `--expect-version` is given). Re-review round 2 (fresh reviewer): approve, confidence medium, all five closed `fixed`.
  **The unit is approved**; it integrates after `u0-settings-ownership` (the plan's order on `check.ts`). `build/21` now
  covers every expectation step: the lane that integrates second makes `pinnedCallAt` read the identity record
  `packageCommand` reads, registry included — the registry unit integrates last, so its rebase carries it. The three
  behaviour changes go into REQ-PLUGIN-047 with the next plan-text pass.
- `review/28` → `735ae9ee` (lane `016-00-w`, test-only): the engine has always named a backup by its full native path,
  and main's `c3d98d6f` fixed the same Windows failure in its tests; the six new tests looked for a forward-slash
  fragment of that path. Their four assertion sites now check the whole "Your previous file is at …" sentence with the
  path built by `join` (all six red on darwin when the engine was made to print a relative path). `review/29` (one
  warning names the file repo-relative and its backup natively) closed `rejected` by the orchestrator: the convention
  stays, pinned by `settingsKeyOwnership.test.ts:527,545`. Fast-forwarded into the integration branch and pushed at
  16:30Z (knip, typecheck and the three suites green by a test-runner); `review/28` closes on the Windows legs' result.
- `016-00-a` `u0-settings-ownership` pass 1 → `7c1d87a6` (rebased onto `735ae9ee` as `239eb3a9`; the per-entry core
  `src/manifest/jsonMembers.ts`, `src/manifest/coOwnedJson.ts` and the ledger's `coOwned` record; 15 files,
  +3,284/−109): both new modules at 100% on all four counters; the style round trip byte-identical for four-space without
  a final newline, tab, one line and CRLF, and content-equal for styles `JSON.stringify` cannot write. Ledger `build/26`
  (three files outside the pass's list — the composition wiring a new module needs and the link guard moving into the
  core — accepted by the orchestrator, closed `rejected`) and `build/27`–`build/30` (Minors; `build/28`: `coOwned.lines`
  has a per-line bound but no count bound, for file 1's `u1-gitignore-lines`). Pass 2 (the settings lane) and pass 1's
  review dispatched together.
- `u0-settings-ownership` pass 1 review round 1 (reviewer, Opus 5.5): request-changes, confidence medium. The core holds
  (canonical hashing, RFC 6901, S13, S14, S15, forged allow rows stay foreign, the API serves the hook-file lanes). One
  Critical — `src/pack/install.ts` `cloneEntry` drops `coOwned` on every `add <pack>` (in pass 2's scope; pass 2 carries
  it with `test/pack/install.test.ts`) — and three Warnings: rule 5 lets a forged `members[P]` equal to an owner's value
  replace or remove a `yield` member with no `.bak` (decision-needed); `commandRunsStateScript` matches `.stamity/`
  anywhere in a command, so an owner hook passing `.stamity/g.json` as an argument reads as in bound (decision-needed);
  an owner `{"hooks":{"":[]}}` makes an uncaught `VALIDATION_ERROR` abort `init` instead of a `co-owned-shape` collision.
  - Sign-off (orchestrator): a `yield` member leaves or changes without a backup only when its value equals the engine's
    current rendering; a recorded hash alone takes the backup (S11: "a recorded hash is a claim").
  - Sign-off (orchestrator): "runs a script under `.stamity/`" means the executed script — the program, or the first
    argument after the interpreter — lies under `.stamity/`; an argument elsewhere in the command does not count (S11's
    words). The three Warnings go to the fix round after pass 2 (they sit in pass 1's files; one writer in lane A).
  - Sign-off `review/35` (orchestrator): a `collide` member that differs is a `co-owned-shape` collision naming it (S12),
    so an owner-edited Cursor `version` refuses rather than being replaced behind a `.bak`; the hook-file unit declares
    `version` as `collide`, as its edge cases say.
  - The fix round also takes `review/34` (a document that cannot round-trip — a value shadowed by a duplicate key, a
    number that does not survive re-serialising — takes a verified `.bak` before any write, its warning naming why),
    `review/36` (the writer holds the reader's pointer bound) and `review/37` (a BOM survives; the style rule as built
    goes into the plan text); `review/38` (a contract row's signature) goes to the plan-text pass.
- `review/28` closed `fixed` on CI run 37652601608 (every leg green, both Windows legs included).
- `016-00-a` `u0-settings-ownership` pass 2 → `aa08babb` (the settings lane; 31 files, +1,720/−975): red run first —
  12 of the new owner-entry cases, the headline a deny rule a plain `sync -y` removed; `review/30` closed by
  `src/pack/install.ts:382` with a case in `test/pack/install.test.ts:1494`; 22 suites (1,266 tests) green; `reclaim.ts`,
  `jsonMembers.ts`, `coOwnedJson.ts` and `claudeSettings.ts` at 100%, `safeWrite.ts` 98.49/95.67/100/99.55; the dogfood
  round trip clean (only `.stamity/manifest.json` gained the settings row's `coOwned`, committed). Ledger `build/31`
  Critical (pass 1's `coOwnedJson.ts:519` uses constructor parameter properties, which Node's type stripping refuses, so
  `scripts/generate-docs.mjs --page measurements` crashes and `test/cli/docs/measurements.test.ts` fails), `build/32`
  (four test files outside the cell, accepted, closed `rejected`), `build/33` (lanes B and C edit files pass 2 changed —
  merges at integration), `build/34`–`build/40` (Minors). The fix round (pass 1's review findings and `build/31`) and
  pass 2's review run together.
- `u0-settings-ownership` pass 2 review round 1 (reviewer, Opus 5.5): request-changes, confidence medium. No verb
  (`init`, `init --force`, `sync`, `sync --force`, `clean`, a client's removal, `add <pack>`) removes or rewrites an
  owner's deny rule, allow row or hook entry outside the bound without a verified `.bak`; forged records for
  `/permissions/deny`, `/permissions` or `/model` prove nothing; a 1.11.0 manifest upgrades as legacy with no `.bak`;
  `review/30` confirmed fixed. `review/39` Warning (no test pins that `init --force` judges the file against the previous
  ledger rather than adopting it), `review/40` Warning (a `co-owned-shape` refusal drops the ledgered settings row, so
  `clean` deletes the hook scripts the kept file still wires — fail-closed on every tool call — and re-adoption later makes
  the engine's allow rows foreign), `review/41`–`review/44` Minors.
  - Sign-off `review/41` (orchestrator): `check`'s prediction passes the same ledger hashes the write uses, so the preview
    is exactly the write once member lanes register (REQ-PLUGIN-016's "previews exactly the write").
  - Sign-off `review/44` (orchestrator): the hook bound for a backup-free removal covers the engine's own script folders —
    `.stamity/generated/hooks/` and an installed pack's `.stamity/packs/<id>/` — not the user's `.stamity/hooks/`;
    tighter than S11's "under `.stamity/`" in the safe direction (more backups, never a silent removal of a user's hook).
    Listed for the maintainer at the close.
- `u0-settings-ownership` fix round 1 → `49e19912` … `b66a1658` (15 commits on `lane/016-00-a`): `build/31` (plain
  fields, so strip-only Node loads the core), `review/31`, `review/35` (yield members held to the current rendering; an
  edited collide member collides), `review/32`, `review/44` (a hook entry is bounded by the script it executes, in the
  engine's own script folders), `review/33` (the empty reference token), `review/34` (a document that cannot round-trip is
  backed up first), `review/36`, `review/37` (BOM kept), `review/39`, `review/43` (pins that fail when the regression is
  planted back), `review/40` (a refused co-owned document keeps its rows and record; `clean` keeps an engine hook script a
  kept document still runs), `review/41`, `review/42`. Each fix red first; the five floor files at or above their floors.
  New `review/45`–`review/48` (Minors).
  - Sign-off `review/45` (orchestrator): a `collide` member takes the same rule as a `yield` member — a value that differs
    from the engine's current rendering is a `co-owned-shape` collision whatever the record says, so a forged record
    equal to the owner's value cannot make `sync` replace it silently.
- `review/45` → `2548b3d2`: a member's one proof is the engine's current rendering, for both kinds. Its consequence, for
  the hook-file unit: a release that changes a `collide` value would make `sync` refuse every file still holding the old
  one, so that unit's `collide` members declare every value a release ever rendered as their bound (a known engine value
  updates silently; anything else collides).
- `u0-settings-ownership` re-review round 2 (fresh reviewer): request-changes, confidence medium — fourteen ids closed
  `fixed`; one new Warning, `review/49`: the "keep the scripts a kept file still runs" check reads every co-owned path,
  the three MCP files included, so a ledgered `.mcp.json` that is a link or unreadable makes `clean` keep every generated
  hook script and the whole `.stamity/`, with a remedy that cannot clear it. The reviewer also showed that the engine
  wires the user's own `.stamity/hooks/` scripts into `.claude/settings.json`, so the `review/44` bound as signed off
  would leave a `.bak` and a warning on every user-hook change and every `clean` in a repo with user hooks.
  - Sign-off `review/44` refined (orchestrator): a user-hook entry equal to the engine's current rendering of a
    definition still in `.stamity/hooks/` is proven by re-rendering (S11: "what the engine can prove by path or by
    re-rendering") and leaves or changes silently; an entry whose definition is gone, or that differs, goes behind a
    verified `.bak`. A forged record alone still proves nothing.
- `016-00-d` → `fa9c5a8e`, `u0-hook-files-ownership`'s TOML half (`src/manifest/tomlTables.ts`,
  `src/manifest/codexConfigToml.ts`, the `.codex/config.toml` lane, `codexConfigTableRendering`): red run 12 failed first
  (r1's measurement: `sync -y` removed an owner's `[mcp_servers.team]`); 18 suites (912 tests) green; both new modules at
  100%; the goldens moved only the config's comment lines and the manifest digests. Ledger `build/41` (an engine table's
  leading comments count only from their last blank line, so an owner file ending in a comment does not turn
  `[features]` into the owner's), `build/42` (two files outside the list, accepted, closed `rejected`), `build/43` (the
  plan cell's re-pin note says an edited Codex table leaves a `.bak`, its interface and edge cases say the owner keeps
  it — built per the interface; the plan text follows), `build/44`–`build/52` (Minors). Round-1 review dispatched.
- `u0-settings-ownership` fix round 3 → `b3df5b5d` (`review/49`: only documents that wire hooks — a lane declares
  `wiresHooks`; the settings lane today, the hook-file unit's two documents next — hold scripts back; an unreadable or
  linked hook document names the real remedy; `reclaim.ts` at 100%). Returned BLOCKED_AMBIGUITY on the refined
  `review/44`: the orchestrator's sign-off (proven only by re-rendering a definition still present) and its own test
  list (no `.bak` when a definition is edited or removed) contradict each other — after an edit the old entry differs from
  the rendering, after a removal its definition is gone, and the engine keeps no other trace a forged record lacks.
  - Decision (orchestrator, the declared default — reading 1): never remove what cannot be proven. Adding a user-hook
    definition and `clean` in a repo with user hooks take no `.bak`; editing or removing a definition leaves one verified
    `.bak` and a warning naming the entry; a forged record over a hand-wired entry proves nothing. Listed for the
    maintainer at the close.
- TOML half review round 1 (reviewer, Opus 5.5): request-changes, confidence medium. The segmenter holds on every form
  (both string kinds, single and multi-line, embedded `[`/`#`/`"""`, quote runs of 3–5, multi-line arrays, inline tables,
  array-of-tables, dotted and quoted names, comments, CRLF, a BOM, no final newline; the pieces always rejoin to the
  input); owner tables and top-level keys survive `init`, `sync` and `clean` byte for byte but one case. `review/50`
  Warning decision-needed, security: a forged `coOwned` record, or a forged whole-file hash on a 1.11.0 row, lets `sync`
  and `init --force` replace an owner's `[features]` or selected `[mcp_servers.<id>]` silently on the write path.
  `review/51` Warning decision-needed: an owner's header-less `features`/`mcp_servers` keys (dotted keys, inline tables)
  plus the engine's header make TOML Codex cannot read. `review/52` Warning: an owner comment between two engine tables
  moves to the end, then sits inside the engine's last table and hands that table to the owner. `build/43` is a plan-text
  fix only.
  - Sign-off `review/50` (orchestrator): `[features]` yields (S16), so the engine replaces it silently only when its text
    is one of the `[features]` renderings a release ever wrote (a static list, the current one included); any other
    `[features]` is the owner's and is kept, whatever the record says. A selected `[mcp_servers.<id>]` keeps the record as
    its proof — an engine-specific name the operator asked the engine to manage — and the forged-record residual there
    joins the in-bound byte-proof follow-up row.
  - Sign-off `review/51` (orchestrator): a `co-owned-shape` collision naming the key (S12) — never a second definition.
- `u0-settings-ownership` fix round 3, continued → `5dfba335`, `b229f3ba` (`review/44`, reading 1: the settings reducer
  receives the engine's current rendering of the user hooks still defined in `.stamity/hooks/`, from a new export of the
  adapter's own entry builder; the five cases tested at the commands, each red first). New `review/55` (Minor: the default
  user-hooks folder is now written out in a third place). Re-review round 3 dispatched for `review/44`, `review/45`,
  `review/49`.
- 2026-10-07T17:29Z `u0-hook-files-ownership` splits in two, as its risk row allows: the TOML half (`tomlTables.ts`,
  `codexConfigToml.ts`, the `.codex/config.toml` lane) builds now in lane `016-00-d` from `aa08babb`; the JSON half
  (`.cursor/hooks.json`, `.codex/hooks.json`, S17's script retention, S18's guard rename, S19) follows in lane A once
  the settings fix round lands, since it builds on the JSON core the fixer is changing.
- `u0-settings-ownership` re-review round 3 (fresh reviewer): approve, confidence medium — `review/44` (reading 1),
  `review/45`, `review/49` verified (`review/45` and `review/49` closed `fixed` by hand: `review/44` was already `fixed`
  from round 2, so the report's closure set could not apply whole). **The unit is approved.**
- Integration, 2026-10-07T18:25Z: `u0-settings-ownership` (both passes and fix rounds 1–3; rebased onto `735ae9ee`
  before pass 2) fast-forwarded at `b229f3ba` after its lane's full gate (test-runner: build, lint, typecheck,
  `npm test -- --coverage` 273 files / 11,257 passed / every floor held, knip, the dogfood round trip clean; the
  `updatedAt` move restored). Earlier fast-forwards: `01b5c6bc` (16:20Z) and `735ae9ee` (16:30Z). Lane C rebased onto
  `b229f3ba` with no conflict (`de122832`→`410b2c2c`, `ae8f2533`→`6d231176`); its full gate runs before it integrates.
  Lane A goes on with the JSON half, pass 1 (per-entry hook documents, S17 retention, S19, the release-history bound
  for `collide`/`yield` members).
- Integration, 2026-10-07T18:30Z: `u0-check-expectations` fast-forwarded at `6d231176` after lane C's full gate on the
  rebased commits (test-runner: build, lint, typecheck, `npm test -- --coverage` 274 files / 11,287 passed / every floor
  held, knip, the dogfood round trip clean). Integrated so far: `u0-ledger-bound`, `u0-settings-ownership`,
  `u0-check-expectations`.
- TOML half fix round 1 → `a73bff32` (`review/50`: `[features]` is the engine's only when its text is one of the three
  renderings a release wrote — 1.8.0–1.9.1, 1.10.0–1.11.0 and the current — held as a hash list a test couples to the
  adapter's rendering; `review/51`: header-less `features`/`mcp_servers` keys collide; `review/52`: an owner comment
  stays above the table it sat above; `review/53`, `review/54`); 25 of the new cases red first; both modules at 100%. New
  `review/56` (Minor). Lane D's rebase onto `6d231176` conflicts in `src/cli/engine/emissionWrite.ts` (the settings fix
  rounds made `wiresHooks` required and added the re-render arguments), so a fixer rebases and adapts it; one re-review
  then covers the fix round and the resolution.
- Lane D rebased onto `6d231176` (`fa9c5a8e`→`fa8c6175`, `a73bff32`→`040ee68d`; adaptation `12bfd3bd`: the Codex config
  lane declares `wiresHooks: false` and proves its tables against its own rendering), then `review/57` → `1864fe9a` (the
  TOML planner refuses a record past the reader's bound: 63 servers pass, 64 refused, the remedy naming
  `stamity config mcp remove <id>`). Re-review round 2 (fresh reviewer): approve, confidence medium — `review/50`–`54`
  and `review/57` closed `fixed`; the rebase broke nothing in the settings lane contract. Its residue: `build/48` (an
  owner `[[mcp_servers]]` beside the engine's `[mcp_servers.<id>]` gives Codex a conflicting definition, kept silently) —
  the same harm `review/51` closed, so the orchestrator has it fixed now under `review/51`'s rule.
- `build/48` → `fa8163a3` (an owner `[[mcp_servers]]` under which the engine would write a server table is a
  `co-owned-shape` collision naming the header and its line; 5 cases red first, 2 pins). Re-review round 3 (fresh
  reviewer): approve, `build/48` closed `fixed`. **The TOML half is approved.**
- Integration, 2026-10-07T19:04Z: the TOML half of `u0-hook-files-ownership` fast-forwarded at `fa8163a3`
  (`fa8c6175`, `040ee68d`, `12bfd3bd`, `1864fe9a`, `fa8163a3`) after lane D's full gate (test-runner: build, lint,
  typecheck, `npm test -- --coverage` 276 files / 11,425 passed / every floor held, knip, the dogfood round trip clean;
  the `updatedAt` move restored). Still to integrate: the JSON half (lane A, building) and `u0-registry-bound-calls`
  (lane B, approved, last). Pushed to PR #89 at 19:04Z for CI.
- `016-00-a` JSON half pass 1 → `b74d5767` (from `b229f3ba`; `src/manifest/hookDocuments.ts`, the Cursor and Codex
  hooks lanes with `wiresHooks: true`, S17's retention, S19's rejected-entry check, the release-history bound for
  members; 18 files, +1,724/−79): red run 14 failed first, 33 with the source removed; 38 suites (1,960) green;
  `reclaim.ts`, `coOwnedJson.ts`, `jsonMembers.ts`, `hookDocuments.ts` at 100%. Ledger `build/53` (Warning: the lane
  overlaps lane C's `check.ts` step lists and lane D's lane registry — a careless merge drops a step or a lane silently)
  and `build/54`–`build/60` (Minors).
  - Sign-off `build/54` (orchestrator): a user-hook entry a release up to 1.6.0 wired directly is recognised the way the
    plan's expand/contract rule reads legacy rows — while the ledger's whole-file hash proves the file unedited, every
    element of it is the engine's and is replaced by the current rendering, so an upgrade never runs a hook twice.
  - Lane A is rebased onto `fa8163a3` by a fixer (keeping all four lanes and both step lists) while pass 1's review reads
    `b229f3ba..b74d5767`; pass 2 (S18) follows on the rebased lane.
- JSON half pass 1 review round 1 (reviewer, Opus 5.5): request-changes, confidence medium. As built, no verb removes or
  rewrites an owner's Cursor or Codex entry, Cursor's `version` or Codex's `description` without a verified `.bak`, and a
  forged record cannot either; the bounds and the release-history values match the tags; `clean` keeps the guards and
  `.stamity/` (`stateDirKept`); `check` fails a rejected entry naming it. `review/58` Warning: retention reads only hook
  documents that are reclaim candidates, so a kept `.cursor/hooks.json` that is not one (a link, a `co-owned-shape`
  refusal) loses the scripts it runs — after pass 2's rename, the old `failClosed` guards. `review/59` Warning: releases
  1.0.0–1.6.0 wrote a top-level `stamity` member in `.codex/hooks.json` the Codex spec does not declare. `review/60`
  Warning decision-needed: `build/54`'s sign-off as worded reopens the forged whole-file-hash route `review/50` closed.
  `review/61` Minor: the Codex argv check admits `..`. Unreached: whether `clean` deletes
  `.stamity/generated/agent-tool-policies.json` while a kept pre-tool-use guard reads it; whether Cursor accepts an entry
  with no `command` (a researcher reads cursor.com/docs/hooks again).
  - Sign-off `build/54` revised (orchestrator), closing `review/60`'s decision: an entry a release up to 1.6.0 wired
    directly is the engine's only when it equals the old direct form re-rendered from a definition still in
    `.stamity/hooks/` (proof by re-rendering, as `review/44` reading 1); never by the whole-file hash alone. Legacy
    recognised entries then follow the plan's expand/contract rule.
  - Vendor re-read (researcher, cursor.com/docs/hooks, 2026-10-07): Cursor documents prompt-based hooks —
    `{"type": "prompt", "prompt": "…"}` with no `command` — and the page's 21 events match `CURSOR_HOOK_EVENTS` one for
    one. S19's "an entry with no `command`" would fail Cursor's own example, against S19's purpose (an entry Cursor
    rejects). Amendment (orchestrator, vendor re-read): the check is type-aware — `type` absent or `"command"` needs a
    non-empty `command`, `"prompt"` needs a non-empty `prompt`, any other `type` fails. Listed for the maintainer.
- Lane A rebased onto `fa8163a3` by a fixer (`b74d5767`→`33d046c3`; adaptation `f5d54ab2`: all four lanes with their
  `wiresHooks`, a per-lane pin, both `check` step lists, the goldens' manifest digests re-pinned to the sum of both
  halves; `syncDriftProof.e2e`'s salvage case now pins the four Codex scripts S17 keeps). `build/53` closed `fixed`.
- CI on PR #89 at `fa8163a3` (run 37671784749): every leg green but windows-1 — two `coOwnedJson.test.ts` cases provoke a
  non-ENOENT `lstat` failure a way Windows reads as ENOENT (`review/63`).
- JSON half fix round 1 → `7b2151d0` (`review/63`, test-only: an injected `lstat` failure), `41cb717f` (`review/58`: every
  kept hook document holds its scripts back, candidate or not), `c409b616` (`review/59`: the 1.0.0–1.6.0 `stamity` member
  declared with its release values; `build/54`/`review/60` as revised: ≤1.6.0 direct entries proven only by re-rendering,
  a forged legacy row removes no owner entry — pinned for both clients through `sync` and `clean`; `review/61`; the S19
  amendment; `review/62`). The policy-document question is not a defect: the kept guard returns no verdict for any agent
  without the `stamity-` prefix before it reads the policy (src/hooks/scripts.ts:1712). New `review/64`–`review/67`
  (Minors). Pass 2 (S18) and the fix round's re-review run together.
- JSON half re-review round 2 (fresh reviewer): request-changes, confidence medium — the seven ids and `build/53` verified
  (closed `fixed` by hand: `build/53` was already closed, so the report's closure set could not apply whole); the S19
  amendment built as signed off. Two new Warnings: `review/68` (since `41cb717f` the preview `check` and `sync --dry-run`
  show reads a selected client's hooks document before `sync` rewrites it, so a renamed engine script reads "Kept" in
  the preview and is deleted by the write — handed to pass 2, which the rename makes live) and `review/69` (a pack's hooks
  wired by a release up to 1.6.0 are not re-rendered for the legacy proof, so a direct upgrade runs them twice; next fix
  round).
- Lane B's first rebase (onto `fa8163a3`, with `build/21`'s seam fix) runs in parallel, so only a small second rebase
  onto the JSON half remains.
- Lane B rebased onto `fa8163a3` by a fixer (`1988e251`→`53cf09ae`, `47e0a870`→`693ebc26`, `ad0ac0ce`→`9b1334df`,
  `dca98246`→`92895ea3`; the only textual conflict was `CHANGELOG.md`, every auto-merged file checked by hand), then
  `build/21` → `96748e20` (`pinnedCallAt` reads the identity record `packageCommand` reads through a new
  `packageCommandAt`, so a registry fork's expected-release remedies carry the registry and a refused one renders
  `npx --no`; red first). 29 suites (1,108) green; the opt-in fork witness passes for both fork kinds; the leak gate and
  repo-hygiene PASS. A fresh re-review checks the fix and the merge.
- Lane B re-review round 4 (fresh reviewer): approve, confidence high — `build/21` closed `fixed`; the rebase is faithful
  (the same 40 files and 148 deletions before and after, insertions differing only by CHANGELOG's headings; nothing the
  integrated units added was lost). **The unit stays approved**; a second rebase onto the JSON half remains.
- JSON half pass 2 → `21019339` (S18, REQ-FLOW-038: Cursor's guards renamed `stamity-subagent-guard.mjs` and
  `stamity-mcp-guard.mjs`; the first sync rewires `.cursor/hooks.json` and deletes each old guard only when its bytes match
  the ledger, an edited one kept and named; a kept, refused or linked hooks document keeps the old guards it runs;
  `OWNED_PATHS` version 2 with the legacy names still valid; `test/emit/namePrefix.test.ts`) and `5f3e2bba` (`review/68`:
  the preview reads a rewritten hooks document as the write leaves it). 13 cases red first; 31 suites (1,501) green; the
  four floor modules at 100%. Ledger `build/61`–`build/65` (Minors). Pass 2's review and `review/69`'s fix run together.
- JSON half pass 2 review round 1 (reviewer, Opus 5.5): approve, confidence medium — the rename window holds, `review/68`
  closed `fixed`. Minors `review/70` (decision-needed, security: the old guard names stay recognised with no end, so an
  owner's own `node .cursor/hooks/mcp-guard.mjs` entry reads as the engine's even in a repo that never ran 1.11.0),
  `review/71` (REQ-PLUGIN-045's spec delta still says fourteen files and lists the old guard names — the plan-text pass),
  `review/72` (the guard-dropping forgery test still uses the old paths), `review/73` (two cases pin only `sync -y`, not
  the preview).
  - Sign-off `review/70` (orchestrator): the old guard names count as the engine's only where the manifest's ledger
    records them (a setup that ran a release before the rename); elsewhere they are free names and an entry running them
    is the owner's.
- JSON half fix round 2 → `9da9c668` (`review/69`: pack rows kept in the ≤1.6.0 re-rendering, user rows first; an
  installed pack's own folder in the Cursor and Codex hook bounds, lookalikes outside it; a Codex argv hook carrying
  `commandWindows` now outside the bound), `ee8a2221` (`review/70` as signed off — the ledger the lanes read defaults to
  the manifest's, and `init` passes the previous setup's; `review/73`), `d198b0f2` (`review/72`). Twelve cases red first.
  New `review/74` (Minor: a pack removed before the first sync after a direct upgrade leaves its old entry when its script
  lies outside the pack folder — the same class as `build/54`'s deleted-definition residual). Re-review round 3
  dispatched.
- JSON half re-review round 3 (fresh reviewer): request-changes — `review/69`, `/70`, `/72`, `/73` closed `fixed`; new
  `review/75` Warning: a 1.11.0 setup whose first post-upgrade sync refuses `.cursor/hooks.json` loses the old guard rows,
  so after the owner's fix the old `failClosed` guards stay wired beside the new ones for good. Fix round 3 → `7871634a`
  (the old guard rows a kept hooks document still runs are carried back into the rebuilt ledger from the sweep's own
  `wiringKept`; two-sync cases for an owner `version` and a hard link, red first). Re-review round 4 dispatched.
- Prove, 2026-10-07: plan text pass 3 and the spec delta merge → `00b969cb` (a fresh spec-author: plan file 0's defaults,
  spec delta and cells as built — every sign-off of this record; files 1 and 2's dependent rows; REQ-PLUGIN-045–048 added
  and REQ-PLUGIN-015/016 modified in `docs/specs/plugin-lifecycle.md`, REQ-FLOW-036–038 added in
  `docs/specs/everyday-flows.md`; both `status:` lines unchanged until the cut). Verified by a test-runner (the four plans'
  coverage checks exit 0 — one malformed id reference fixed first — and the spec, records, leak-gate and docs suites plus
  the 24 other suites that read `docs/specs`) and fast-forwarded into the integration branch.
- Re-review round 4 (fresh reviewer): approve, confidence high — `review/75` closed `fixed` (rows carried only from the
  validated ledger, only the fixed legacy names, a hand-edited guard nothing runs not carried). Its suppressed Minor,
  `review/76` (no test pins that last rule), → `2dfbe59b` (one assertion, shown to fail when every kept legacy row is
  carried); the whole-branch review verifies it.
- Lane A rebased onto `00b969cb` with no conflict (`33d046c3 … 2dfbe59b` → `249f3fa7 … 14e18044`). Its full gate at
  `14e18044` was red on one test — `test/composition/root.test.ts:165`: `manifest.hookDocuments` was not wired into the
  composition root (`review/77`, Critical; the unit's narrow lists did not include that suite) — fixed in `8d4b932e`; the
  re-run at `8d4b932e` is green (279 files, 11,537 passed, every floor held, knip, the dogfood round trip clean).
- Integration, 2026-10-07T20:57Z: the JSON half of `u0-hook-files-ownership` fast-forwarded at `8d4b932e`. Integrated:
  `u0-ledger-bound`, `u0-settings-ownership`, `u0-check-expectations`, `u0-hook-files-ownership` (both halves) and the
  Prove merge. Lane B takes its second rebase onto `8d4b932e` (its registry-bound calls in the renamed guards and in
  `.codex/hooks.json` as the JSON half now recognises them).
- Pushed `8d4b932e` to PR #89 at 20:57Z (CI run 37685980044).
- Lane B's second rebase onto `8d4b932e` (no conflict; identical patches: `53cf09ae`→`eca323e8`, `693ebc26`→`52354442`,
  `9b1334df`→`18d0476f`, `92895ea3`→`59f938fa`, `96748e20`→`ca62422b`), plus `6e9c2baa`: a `--registry` fork's Codex
  starter and renamed Cursor guards carry the registry through an upgrade (sync twice: no `.bak`, no duplicate, the second
  sync byte-identical; red when the recogniser's grammar drops `:` and `=`). The recogniser's `STARTER_CALL` admits the
  renderer's `STARTER_SAFE_CALL` characters. Its full gate and a fresh re-review run together.
- Lane B re-review round 5 (fresh reviewer): approve, confidence high (the replay faithful file by file; the registry
  reaches the renamed guards and `.codex/hooks.json`; the new test strict). Its full gate at `6e9c2baa` was red on one
  floor — `src/emit/planner.ts` lines 99.52%: `remedyCall`'s fail-closed fallback (`:927`) no test reached after the
  rebase (`review/78`, Critical) — fixed in `6d2fb2e7` (two rows through behaviour, red without `--no`); the re-run at
  `6d2fb2e7` is green (281 files, 11,581 passed, every floor held).
- Integration, 2026-10-07T21:25Z: `u0-registry-bound-calls` fast-forwarded at `6d2fb2e7` and pushed to PR #89. **All five
  units are integrated.** The final phase starts on `6d2fb2e7`: the final full gate in a clean lane (`STAMITY_CLAUDE_BIN`
  unset — the live Claude plugin walk has failed on `main` since Claude Code 2.1.291, which Package 19 diagnoses; the
  Cursor, Copilot and Codex walks armed), the security and performance lenses, and the whole-branch review on Fable 5.1,
  together.
- Performance lens (Opus 5.5): posted, no declared budget breached (the logic and corpus size budgets, the 15 ms guard
  latency budget; the per-tool-call guard cost unchanged). `review/79` Warning decision-needed: no time budget covers
  `sync`, `check` or `clean`, while the sweep adds per-candidate realpath/lstat calls and one directory read per segment
  (bounded to the engine's own folders; 253 rows in the largest four-client setup). `review/80` Minor: the hook-script
  reader caches only the last document.
  - Decision `review/79` (orchestrator): deferred — a measured time budget for `sync`/`check`/`clean` on a large
    repository is a follow-up; listed for the maintainer with a place.
- Security lens (Opus 5.5): posted — no route by which a forged ledger row, `importChoice`, `coOwned` record or legacy
  hash deletes or rewrites an owner's content without a verified `.bak` beyond the recorded residuals and one below;
  the path checks hold against `..`, links, case-folding and NFC/NFD; the fail-closed paths fail closed; the registry
  grammar admits nothing any of the four dialects reads as syntax. `review/81` Warning decision-needed: a pull request
  can set `hooks = false` in `.codex/config.toml`'s `[features]` (or `"hooks" = false`), which S16 keeps as the owner's
  with a warning `check` never shows — green while Codex runs no hook, guards included; at `8540fcf2` it was drift.
  `review/82` Warning decision-needed: a forged row at a legacy guard name an owner happens to use, plus a forged
  `coOwned` hash, removes the owner's hooks entry and script with no `.bak` — `review/70`'s condition is the record itself.
  - Sign-off `review/81` (orchestrator): `check` fails when the kept `[features]` sets `hooks = false` under any key
    spelling (bare, quoted, dotted), naming the file and the remedy, as S19 fails a Cursor entry Cursor rejects; `sync`
    and `init` keep it and warn; the prediction carries the warning.
  - Decision `review/82` (orchestrator, the declared default): accepted as the in-bound engine-name residual S3/S4 keep
    (an owner rarely holds the old engine names; `check` names the reclaim and its proof before any sync); the in-bound
    follow-up row widens to the hooks entry. Listed for the maintainer with "fix now" as the alternative (a byte proof
    from the released guard renderings).
- Whole-branch review on Fable 5.1 (`claude-fable-5-1`, attested): request-changes, confidence medium — the branch holds
  together as one change (the five seams line up; the spec text matches the built behaviour; tests assert behaviour at
  the verbs); `review/76` closed `fixed`. `review/83` Warning: CHANGELOG has no line for the TOML half. Minors:
  `review/84` (the same legacy-guard residual as `review/82`, decided above), `review/85` (`init --force` on a 1.11.0
  setup leaves the old guard scripts with no row — a pre-existing class; `sync` is the upgrade path), `review/86` (the
  S19 CHANGELOG bullet states an unverified Cursor behaviour as fact), `review/87` (the specs' merge notes cite lane shas
  the branch does not contain), `review/88` (`--expect-tools` help reads as if all four clients were required).
  - Decision `review/85` (orchestrator): deferred — listed for the maintainer (`sync` reclaims the old guards; `init
    --force` is not the upgrade path).
- One final fix batch (fresh fixer, lane `016-00-c` reset to `6d2fb2e7`): `review/81`, `review/80`, `review/83`,
  `review/86`, `review/87`, `review/88`. The final full gate's result on `6d2fb2e7` stands for the tree before the batch;
  the gate re-runs on the batch's head.
- Final full gate on `6d2fb2e7` (test-runner, clean lane, alone but for read-only reviewers): build; lint; typecheck;
  `env -u STAMITY_CLAUDE_BIN npm run test` — 281 files, 11,589 passed, 15 skipped, with `plugin-lifecycle: copilot walk
  PASS`, `codex walk PASS`, `cursor walk PASS` (its marketplace sub-step skipped: it needs a git URL and an account) and
  `claude walk SKIPPED (STAMITY_CLAUDE_BIN unset)` — the Claude walk not run because it has failed on `main` since Claude
  Code 2.1.291, which Package 19 diagnoses; `npm test -- --coverage` with all four unset — 281 files, 11,581 passed, no
  floor broken; knip; the dogfood round trip clean. All exit 0. Both suites took about 580 s with the reviewers reading
  beside them, near the runner's 600 s tool limit; the re-run goes alone.
- Final fix batch → `41b7b670` (`review/80`), `7f933927` (`review/81`: `check` fails when a kept key turns Codex's hooks
  off — `hooks`, `"hooks"`, `'hooks'`, root `features.hooks`, the `codex_hooks` alias the vendor reference named on
  2026-09-15 — through S19's `rejected` route; `sync`/`init` keep and warn with the same sentence), `af1186aa`
  (`review/83`, `review/86`, `review/87`), `8abbe6e3` (`review/88`, `docs/cli-reference.md` regenerated), `fa52b8ca`
  (lint, and an unreachable fallback removed); every code fix red first. New `review/89`, `review/90` (Minors). Re-review
  (fresh reviewer): approve, confidence medium — the six closed `fixed`; open question, not a finding: whether Codex
  reads `hooks` from a `[profiles.<x>.features]` table a root `profile` selects.
- Final gate re-run on `fa52b8ca` (test-runner, lane `016-00-c`): build, lint, typecheck green; `env -u
  STAMITY_CLAUDE_BIN npm run test` green — 281 files, 11,599 passed, 15 skipped, the Copilot, Codex and Cursor walks PASS
  (each step listed; Cursor's marketplace sub-step skipped, it needs a git URL and an account), the Claude walk not run
  for the reason above; knip and the dogfood round trip clean. `npm test -- --coverage` red: six tests that spawn the CLI
  timed out (`test/cli/checkExpectations.test.ts` ×3 at 20 s, `test/cli/ledgerForgery.test.ts` ×2 at 20 s,
  `test/emit/sharedCharterIdentity.test.ts` ×1 at 60 s), the same tests green in the armed run on the same tree minutes
  earlier. Cause: the machine's load average was 170–210 — another project's sessions on this machine were running
  their PHP test suites and a dev server with a headless browser (read with `ps`, not touched); both suites ran three
  times slower than the lane gates (850–895 s against 220–310 s). The final tree is integrated (`fa52b8ca`) and pushed;
  CI's coverage leg on GitHub's runners is the floor's evidence of record, and the local coverage gate re-runs when the
  load falls.
- CI on PR #89 at `fa52b8ca` (runs 37697142531, 37697142673): every leg green — floor and LTS, both Windows legs, Build,
  the three APM routes, the plugin route, the size budget, DCO, the title — and both aggregators `pass`. 2026-10-07T22:45Z:
  the PR description rewritten for the final tree and PR #89 marked ready (the review bot's one pass).
- QA preparation: three scripts (`qa1-deny-rule.sh`, `qa2-forged-row.sh`, `qa3-cursor-rejected.sh`, kept outside both
  checkouts with the reproductions) dry-run against the final build: an owner's deny rule and four-space indent survive
  `init`, `sync` and `sync --force` with no `.bak`; a forged `docs/owner.md` row makes `check`, `sync` and `clean` exit 1
  naming it with nothing changed on disk; a Claude-shaped `PreToolUse` key in `.cursor/hooks.json` fails `check` (exit
  1) while `sync` keeps it and warns, and Cursor's own prompt-hook example passes.
- The review bot's pass on `fa52b8ca` (review 5449405087, 2026-10-07T22:55Z): five inline comments, each read against
  the code and found to hold (screened: no class matched, kept). Graded `review/91` Warning (the bot's P1), `review/92`,
  `review/93`, `review/94` Warnings and `review/95` Minor (fail-closed; fixed in the same batch because it is one rule
  restated twice). No Critical, so no further bot review is asked (the session's review-bot rule); the PR goes back to draft before the batch
  is pushed, so the push does not start one.
  - Decision `review/91` (orchestrator): carry, through a client's removal, the pre-run row of every co-owned document
    the sweep left unreduced (a refusal: malformed, hard-linked, shape collision, unreadable) and of every script
    `wiringKept` lists; a document the sweep reduced carries nothing. The legacy-guard carry becomes a case of it. Once
    the owner repairs the document, the next `sync` reduces it and reclaims the scripts by their recorded hashes.
  - Decision `review/93` (orchestrator): any standard table header defined twice in the kept document (the same
    resolved key path, quoted or bare) is a `co-owned-shape` refusal that leaves the file untouched and names the table;
    an array of tables (`[[x]]`) may repeat and is not counted.
- Open-row census before the close (2026-10-08): 78 rows open. The orchestrator closed four a later commit or decision
  had settled (`review/30` fixed at `src/pack/install.ts:382`; `build/33` integrated; `build/41`, `build/43` written into
  the plan's S16). A researcher (Opus 5.5, effort medium, read-only; `reports/branch-triage-r1.md`) read the other 67 at
  `fa52b8ca`: 12 closed `fixed` and 39 `rejected` (notes, accepted deviations, process remarks, plan-level sizes), each
  with its evidence; 7 to fix now (`build/35`, `build/36`, `build/44`, `review/89`: plan text the code no longer matches;
  `build/50`: comments that still call `.codex/config.toml` owned whole; `build/51`, `build/60`: no troubleshooting
  section for the Codex config's table ownership and its refusals); 8 for the close question with a place
  (`build/28`, `build/46`, `build/56`, `build/62`, `review/17`, `review/55`, `review/67`, `review/85`); `review/90` to
  drop. Unanswered: whether PowerShell's `npx.ps1` passes `--@<scope>:registry=<url>` intact (the grammar says a token
  opening `--@` is no parameter token; nothing proves it) — for the close question.
- Bot fix batch (fixer round 2, Opus 5.5, lane `016-00-w` reset to `fa52b8ca`; `reports/branch-fixer-r2.md`):
  `6606587f` (`review/95`), `8555dccf` (`review/94`), `5011f76e` (`review/92`), `51df5894` (`review/93`), `a12831a0`
  (`review/91`: `rowsCarriedThroughSweep` replaces `legacyGuardRowsStillWired`), each red first. New `review/96` (the
  same code-point gap in `sanitizeLabel`, `src/cli/kit/prompts.ts`) and `review/97` (the carry also keeps a row whose
  document holds none of the engine's entries, so it is re-carried on every sync).
  - Sign-off `review/93` amended (orchestrator): the rule as first signed reversed three tests in which the planner
    repairs a file that defines an engine table twice (an owner `[mcp_servers]` beside the engine's recorded one, or
    the engine's table pasted twice) by dropping the copy it can prove is its own, which leaves valid TOML and loses
    nothing of the owner's. Narrowed: refuse only when two tables the write would keep as the owner's resolve to one
    name (the bot's case: two owner `[features]`); a duplicate whose extra copy is provably the engine's is repaired as
    before, and the three tests go back to their old expectations.
  - Sign-off `review/97` (orchestrator): fix now, in this batch: the carry is the batch's own regression. Only a
    refusal (the document could not be read, parsed, linked safely or reduced to its shape) carries the row; a
    document holding none of the engine's entries is the owner's and carries nothing.
  - Sign-off `review/96` and the seven fix-now rows (orchestrator): fix now; the troubleshooting section names the
    new "defines a table twice" refusal with the others.
- Fixer round 3 (Opus 5.5, lane `016-00-w`; `reports/branch-fixer-r3.md`): `eaf601ba` (`review/93` narrowed: the three
  tests back to their `fa52b8ca` expectations, the engine's own extra copy dropped as before), `856807e6` (`review/97`:
  `CoOwnedReduction`'s `untouched` gains a required `refused`; `ReclaimActionEntry` an optional `refused`, a new field
  in the `sync --json` and `clean --json` reclaim entries; a holding-none document loses its row after one sync),
  `5c711687` (`review/96`), `c8506159` (`build/35`, `build/36`, `build/44`, `review/89`), `4ec06a63` (`build/50`),
  `2df2a01c` (`build/51`, `build/60`: a troubleshooting section on the Codex config's tables and every refusal);
  code fixes red first. New `review/98` Warning (the sync report still says kept files lost their rows and no sync will
  touch them again — false since the carry) and `review/99` Minor (the troubleshooting page's re-attestation stamp
  predates the new section: the release cut restamps every hand page).
- Fixer round 4 (fresh, Opus 5.5; the finding is new, not a stuck loop, so no stronger class): `bdc6b747` (`review/98`:
  the sync report lists kept files in two groups — rows kept (a refused document, a script a kept hooks document still
  runs; the next sync finishes the reclaim once the owner fixes the line named) and rows dropped — computed by the same
  `rowsCarriedThroughSweep` the saved ledger uses; red first, live and dry run; `test/emit/syncDriftProof.e2e.test.ts`
  re-pinned with a `TEST CHANGE, justified: review/98` line). `--json` shapes unchanged by this round.
- Closing delta review over `fa52b8ca..bdc6b747` (12 commits, 29 files): reviewer on Fable 5.1 (the delta of the
  whole-branch review) and the security lens on Opus 5.5, in parallel.
  - Security lens r2 (`reports/branch-security-r2.md`): posted, no Critical or Warning; every surface asked about holds
    (carried rows come only from the validated ledger and the reducers' own `refused`; a forged record can only drop a
    row; the separator fold only keeps more; the port grammar exact in all three copies; `refused` a boolean). Minors
    `review/100` (an owner's TOML table name printed raw after `\u` decoding) and `review/101` (the display strips miss
    default-ignorable code points such as variation selectors).
  - Reviewer r5 on Fable 5.1 (`reports/branch-reviewer-r5.md`): approve, confidence medium (the gate: medium), standing
    on the final gate on the head being green. All fifteen handed ids fixed (closed by hand: the brief named the
    closure keys wrong). New `review/102` Warning (= `review/100`, graded Warning: review/94's class in two new
    refusal texts) and `review/103` Warning (CHANGELOG's Codex bullet omits the new refusal).
- Fixer round 5 (fresh, Opus 5.5) on `bdc6b747`: `d380738b` (`review/101`: `\p{Default_Ignorable_Code_Point}` in the
  two display strips only; `src/runs/layout.ts` untouched, the goldens did not move), `b5944ea7` (`review/102`,
  `review/100`: every message printing an owner's table name goes through `printableName`; lookup keys stay raw),
  `51c6bf2a` (`review/103`: the CHANGELOG names the doubled-table refusal and the rows a refused sweep keeps, the
  report's separate group and `refused: true`); code fixes red first. One test timed out at 60 s under the parallel
  run (`test/cli/kit/packageName.test.ts`, 43/43 alone) with the machine's load average near 200–250 from another
  project's work.
- Re-review round 6 (fresh reviewer, Opus 5.5) over `bdc6b747..51c6bf2a`: approve, confidence medium; `review/100`–
  `review/103` fixed (closures applied), no new finding. The integration branch fast-forwarded to `51c6bf2a`.
- Final gate on `51c6bf2a` (test-runner, lane `016-00-w`; `reports` none — returned in full): build, lint, typecheck,
  knip and the dogfood round trip pass (sync 0 created, 0 updated, 67 unchanged; only `updatedAt` moved, restored).
  `env -u STAMITY_CLAUDE_BIN npm run test` exit 1 (953 s): 11,626 passed, 15 skipped, one failed — the Cursor walk's
  `test/ci/pluginLifecycle.test.ts:1432` (`expected [ 'st-ask', 'st-board', …(17) ] to include 'st-work'`, after
  477 s); the Copilot and Codex walks PASS. The coverage run exit 1 (911 s): ten CLI-spawning tests timed out at their
  20 s/30 s limits (`checkExpectations` ×2, `ledgerForgery` ×6, `hookRuns` ×1, `check` plugin-duplicates ×1), so no
  floor table printed. The machine's load average was 120–250 throughout: another project's PHP suites and a headless
  browser (read with `ps`, not touched).
- 2026-10-08T01:1xZ: `51c6bf2a` pushed to PR #89 (still a draft, so the bot does not re-review); CI on GitHub's runners
  is the evidence for the coverage floors and Windows. The Cursor walk re-runs alone to classify its red. The five bot
  comments answered on the PR, each with its fix commit (replies 4213627243 … 4213627940).
- CI on `51c6bf2a` (run 37711737961, PR checks 37711737935, docs site 37711737871): every job green — `check` on the
  floor (node 22.22.2), LTS and both Windows legs (the per-file coverage floors), the three APM routes, the plugin
  route, supply-chain currency and dependency review, and `all-ci-checks`.
- The Cursor walk's red classified (test-runner, the same file alone at `51c6bf2a`, Cursor armed): exit 0, 18 passed,
  every step PASS including `cursor walk PASS`; load average 114 → 64. The check at `test/ci/pluginLifecycle.test.ts:1432`
  reads a model's free-text list of skill ids (`agent … -p "List every skill this plugin provides…"`), three times per
  walk; `st-work` (the largest touchpoint, 31 KB) was missing once under load. Not a defect of this change; a flake risk
  in the test's design — for the close question.
- QA preparation re-run at `51c6bf2a` (the three scripts against the lane's build): every PASS line holds — the deny
  rule and four-space indent kept with no `.bak`; the forged row refused with nothing changed; the guards named
  `stamity-mcp-guard.mjs` and `stamity-subagent-guard.mjs`, `check` exit 1 with `rejected .cursor/hooks.json` naming
  `/hooks/PreToolUse`, `sync` exit 0 keeping it with the warning, Cursor's prompt-hook example `check` exit 0. Input
  hashes recomputed at `51c6bf2a` (the same file lists as before).

## QA checkpoint (st-qa, 2026-10-07, final tree `fa52b8ca`; rows re-hashed and re-run at `51c6bf2a` on 2026-10-08)

Rows derived: 7 (the kickoff's four, the upgrade row config changes call for, and two failure-path rows). Rows for a
person: 3 — the kickoff's rows 1 to 3, kept on the human path because the session's kickoff asks the maintainer to walk
them, each with a script that runs it in a throwaway repository outside both checkouts (a person runs one command and
reads the PASS/FAIL lines). Sum: 6 minutes, one session.

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| 1 | An owner's deny rule in `.claude/settings.json` survives every verb | From any folder: `CLI=<public checkout>/dist/cli.js bash <scratchpad>/qa/qa1-deny-rule.sh` (it sets up an owner file with `deny: ["Bash(rm -rf:*)"]` in four-space style, runs `init -y --tools claude`, `sync -y`, `sync -y --force`) | `init` prints "kept your 1 entry (permissions.deny ×1)"; every verb exits 0; the three closing lines read PASS (deny rule there, four-space indent kept, no `.bak`) | H | 2 | auto-proven at the maintainer's word (below): `test/merge/settingsOwnerEntries.test.ts:195`, green in CI run 37711737961 at `51c6bf2a`; the row's script PASS at `51c6bf2a` (input hash `af1f009e17483000`) |
| 2 | A forged ledger row is refused | `CLI=… bash <scratchpad>/qa/qa2-forged-row.sh` (it commits an owner `docs/owner.md`, forges an `infra` row with its hash, runs `check`, `sync -y`, `clean -y`) | `check` fails its `manifest` row naming `docs/owner.md`; `sync -y` and `clean -y` exit 1 naming the row; PASS lines: the file is still there, nothing changed on disk | H | 2 | auto-proven at the maintainer's word: `test/cli/ledgerForgery.test.ts:137`, `:149`, green in CI run 37711737961 at `51c6bf2a`; the row's script PASS at `51c6bf2a` (input hash `c7bde811cc7f788b`) |
| 3 | A `.cursor/hooks.json` entry Cursor would reject fails `check` | `CLI=… bash <scratchpad>/qa/qa3-cursor-rejected.sh` (it sets up Cursor, adds a `PreToolUse` key another tool writes, runs `check` and `sync -y`, then swaps in Cursor's own prompt-hook example and runs `check`) | the guards are `stamity-mcp-guard.mjs` and `stamity-subagent-guard.mjs`; `check` exits 1 with a `rejected` row naming `/hooks/PreToolUse` and the remedy; `sync -y` exits 0, keeps the entry and warns; with the prompt hook `check` exits 0 | H | 2 | auto-proven at the maintainer's word: `test/merge/hookFilesOwnership.test.ts:287` (`rejected` names `/hooks/PreToolUse`), green in CI run 37711737961 at `51c6bf2a`; the row's script PASS at `51c6bf2a` (input hash `b954dc71ae33e09d`) |

Appendix — auto-proven (the final gate on `fa52b8ca`: `env -u STAMITY_CLAUDE_BIN npm run test`, exit 0, 281 files, 11,599
passed; CI run 37697142531 green on every leg):

| # | Scenario | Risk | Proof |
|---|---|---|---|
| 4 | A `--registry` fork's generated calls name its registry; a bare call would run a public look-alike | H | auto-proven: `test/corpus/npxScopeRegistry.test.ts:315` (the bound call runs the fork's build from its registry, against npm stub registries) with its control `:340` (the bare call runs the look-alike); `test/ci/pluginPackages.registry.test.ts:149`, `:163` (every plugin root's pinned spec bound, or `npx --no` for a refused URL) |
| 5 | Upgrade over a 1.11.0 setup: the guards are renamed and the old names reclaimed by hash, owner entries kept | H | auto-proven: `test/merge/hookFilesOwnership.test.ts:1008` (new guards written, `.cursor/hooks.json` rewired, old names deleted by hash, no `.bak`, `check` exit 0), `:1043` (the preview equals the write), `:1068` (an owner entry kept) |
| 6 | `check --expect-tools` fails a pull request that dropped a client with its rows and files | M | auto-proven: `test/cli/checkExpectations.test.ts:90` (`EXPECTATION_ERROR` naming cursor while plain `check` passes), `:120` (the row and the remedy first) |
| 7 | `sync --force` and `init --force` no longer replace an owner's settings members | H | auto-proven: `test/merge/settingsOwnerEntries.test.ts:195` (the deny rule and the owner's group byte-identical after `sync -y`, `sync -y --force`, `init -y --force`, no `.bak`) |

**Sign-off** — PR #89, plan 016 file 0, 2026-10-07

- [x] Every H row walked or auto-proven, and passing — an H row accepted unwalked blocks release. No row is recorded
  walked. The maintainer's reply of 2026-10-08, quoted: "im back, you got my approval for everything, whats the last
  question?" — a blanket approval, so rows 1–3 left the human path for the evidence that already proved them: the test
  assertions above, green in CI at `51c6bf2a`, beside each row's own script run at that head.
- [x] Every failing M row has a filed follow-up, linked (no M row failed).
- L failures are recorded, not blocking.
- Rollback: revert the merge on `main` (`git revert` of the pull request's commits) and stay on 1.11.0; a setup synced
  by 1.12.0 rolls back by re-syncing at 1.11.0, which drops the `coOwned` records and the per-entry merges (the plan's
  expand/contract note), and the renamed Cursor guards are rewritten under their old names.
- Shippable: YES — every H row auto-proven and passing; none accepted unwalked.

## Close (2026-10-08)

- **The merge.** The maintainer's approval (quoted above) covered the merge, the release and its publish. `main` was
  fast-forwarded from `8540fcf2` to `51c6bf2a` at 2026-10-08T07:36:56Z under the admin bypass, after CI passed on that
  head (run 37711737961); PR #89 reads MERGED at 07:36:56Z with every recorded commit sha kept. `main`'s push runs (the
  Pack signing rehearsal among them, which only a push to `main` runs) are read below. PR #90, the 1.12.0 release,
  was retargeted from `fix/plan-016-file-0` to `main`.
- **The close question** (one question, the leftovers listed with a recommendation each, real defects first): the
  maintainer's answer of 2026-10-08, "Accept all (Recommended)". Applied:
  - Scheduled, each an inbox row (2026-10-08 block, `.stamity/inbox.md`) naming its place, trigger and files, its
    ledger row closed `deferred` against it: `review/82` and `review/17` (with the in-bound byte-proof row, plan 019
    file 1's `t10-inbox-pass`), `build/46`, `build/62`, `review/67` (the same inbox pass), `review/85`, `build/28`,
    `review/55` (plan 016 file 1), `build/56` (plan 016 file 2); and, without a ledger row, the Cursor walk's
    model-listed check (plan 019 file 1), the PowerShell argv proof (plan 016 file 1 `u1-fork-ci-job`), Dependabot #86
    (after the publish).
  - Dropped, closed `rejected` with the reason: `review/79` (no slowness measured; the new checks touch only the
    engine's own folders), `review/90` (`check` already fails the case and names its line).
  - Accepted risk, tracked: the open alerts #23 and #27 (`http-cache-semantics`, inbox row 511) and #26 (`braces`,
    a new inbox row), none with a patched version.
- **The ledger.** No row is `open`: 168 rows — 112 `fixed`, 47 `rejected` with a reason, 9 `deferred` with an inbox
  `Ref:`.

## Proof block (2026-10-08 — merged to main by fast-forward; released as 1.12.0 through PR #90)

- **Candidate and merge.** `51c6bf2a` on `fix/plan-016-file-0` (PR #89) carries 85 commits and 141 files over `main`
  `8540fcf2` (+23,337 / −2,060).
  - Without `.stamity/`: 138 files, +23,232 / −2,059. The three `.stamity/` files in the range are `inbox.md`,
    `manifest.json` (the dogfood ledger the settings unit moved, record.md:270-271) and this record (+105 / −1
    together).
  - `51c6bf2a` itself is the last code-side commit (the CHANGELOG's `review/103` line, record.md:647-651), so the
    final tree and the gated tree are one.

  `main` was fast-forwarded from `8540fcf2` to `51c6bf2a` at 2026-10-08T07:36:56Z under the admin bypass, after CI
  passed on that head (run 37711737961). PR #89 reads MERGED at 07:36:56Z, with every recorded commit sha kept
  (record.md:719-722). The maintainer's approval of 2026-10-08 covered the merge, the release and its publish
  (record.md:706-709, :719).

  The release is PR #90, retargeted from `fix/plan-016-file-0` to `main` (record.md:722-723). Its preparation, eval
  run, cut and publish are the release run's own record (`.stamity/runs/2026-10-07_release-1-12-0/`), not this one.
- **Build isolation.** Manual worktree lanes outside the checkout, declared at the run's head (record.md:8,
  :68-71):
  - lanes `016-00-a`, `016-00-b`, `016-00-c`, `016-00-d`, `016-00-docs` and `016-00-w`, with `node_modules`
    symlinked; implementers ran only their unit's narrow `verify`, and every full suite ran alone (record.md:71);
  - each lane rebased onto the integration branch and fast-forwarded into it, so lane shas and branch shas differ and
    both are recorded (record.md:188-193);
  - units sharing a file integrated one writer at a time in the plan's order, with a fresh re-review after each
    conflicting rebase (record.md:377-386, :426-428, :447-455, :502-511).
- **Gates.** The gate of record for the code is the final gate on `51c6bf2a` (record.md:656-663), with
  `STAMITY_CLAUDE_BIN` unset — the live Claude plugin walk has been red on `main` since Claude Code 2.1.291, which
  Package 19 diagnoses (record.md:30-31, :512-516); the Cursor, Copilot and Codex walks were armed. That local gate did
  not exit 0 on the suite or the coverage run: both ran while the machine's load average stood at 120–250 from
  another project's work (read with `ps`, not touched). The record takes the solo re-run of the Cursor walk's file and
  CI on GitHub's runners as the evidence of record for those two rows (record.md:664-674); it does not call the local
  gate green.

  Gate results (the final local gate on `51c6bf2a`, test-runner, lane `016-00-w`):

  | Gate | Command | Result |
  |---|---|---|
  | build | `npm run build` | pass |
  | lint | `npm run lint` | pass |
  | typecheck | `npm run typecheck` | pass |
  | unused code | `npx knip` | pass |
  | dogfood round trip | `sync` on this checkout | pass: 0 created, 0 updated, 67 unchanged; only `updatedAt` moved, restored |
  | suite, armed | `env -u STAMITY_CLAUDE_BIN npm run test` | exit 1 (953 s): 11,626 passed, 15 skipped, one assertion red — the Cursor walk's `test/ci/pluginLifecycle.test.ts:1432` (`expected [ 'st-ask', 'st-board', …(17) ] to include 'st-work'`, after 477 s); the Copilot and Codex walks PASS |
  | Cursor walk, alone | the same file alone at `51c6bf2a`, Cursor armed | exit 0: 18 passed, every step PASS including `cursor walk PASS`; load average 114 → 64. The check reads a model's free-text list of skill ids three times per walk, and `st-work` was missing once under load: a flake risk in the test's design, scheduled at the close |
  | coverage | `npm test -- --coverage` | exit 1 (911 s): ten CLI-spawning tests timed out at their 20 s/30 s limits (`checkExpectations` ×2, `ledgerForgery` ×6, `hookRuns` ×1, `check` plugin-duplicates ×1), so no floor table printed; the per-file floors are read from CI below |

  Gate results (the final tree `51c6bf2a` on GitHub's runners, CI run 37711737961; PR checks 37711737935 and the docs
  site 37711737871 the same, record.md:667-669):

  | Gate | Command | Result |
  |---|---|---|
  | check, floor | CI `check` on node 22.22.2 | pass |
  | check, LTS | CI `check` on the LTS node | pass |
  | check, Windows | CI `check` on both Windows legs (the per-file coverage floors) | pass |
  | APM routes | CI `apm route` (the three routes) | pass |
  | plugin route | CI `plugin route` | pass |
  | supply chain | CI supply-chain currency, dependency review | pass |
  | aggregator | CI `all-ci-checks` | pass |

  The earlier runs:
  - Lane full gates, each green: `63d5ba43` (record.md:182-184), `b229f3ba` (record.md:362-366), `6d231176`
    (record.md:369-372), `fa8163a3` (record.md:390-394).
  - The JSON half's lane gate at `14e18044`: red on `review/77`, the composition-root wiring; green at `8d4b932e`
    (record.md:493-496).
  - Lane B's gate at `6e9c2baa`: red on the `src/emit/planner.ts` lines floor, `review/78`; green at `6d2fb2e7`
    (record.md:507-511).
  - The final full gate on `6d2fb2e7`: every gate exit 0, 281 files, 11,589 passed, 15 skipped (record.md:551-557).
  - The gate on `fa52b8ca`: suite green (11,599 passed); the coverage run red on six CLI-spawning timeouts under a load
    average of 170–210, the same tests green in the armed run minutes earlier (record.md:565-575).
  - CI: Windows legs red at `f328d473` on backslash paths, `review/28` (record.md:220-224), green at `735ae9ee`
    (record.md:266); windows-1 red at `fa8163a3`, `review/63` (record.md:429-431); every leg green at `fa52b8ca`
    (record.md:576-577).
- **The proof bar** (the kickoff's):
  - **The reproductions, red at the head.** Every reproduction re-ran at `8540fcf2` and reproduced: forged ledger
    rows deleting five owner files, both `importChoice` flips, the guard-dropping `skip`, the client drop with `check`
    exit 0, and a `--registry` fork's 44 bare pinned calls in 23 files (record.md:42-45). At the candidate the three QA
    scripts PASS at `51c6bf2a` (record.md:675-679).
  - **The failing tests first.** Each unit's red run preceded its code: `u0-registry-bound-calls` (record.md:82),
    `u0-ledger-bound` pass 1 and pass 2 (record.md:94, :132), `u0-check-expectations` (record.md:204),
    `u0-settings-ownership` (record.md:267-268), the TOML half (record.md:317) and the JSON half (record.md:397,
    :456-461); every fix round's code fixes red first (record.md:297, :562, :628, :651).
  - **The full local gate.** Exit 0 on `6d2fb2e7` (record.md:551-557). On the final head `51c6bf2a`, exit 0 for build,
    lint, typecheck, knip and the dogfood round trip; the suite's one load-sensitive Cursor-walk assertion and the
    coverage run's ten load timeouts are answered by the solo re-run and CI, as the Gates bullet states — not by a
    local exit 0 (record.md:656-674).
  - **CI on every leg.** Run 37711737961 on `51c6bf2a`: every job green (record.md:667-669).
  - **The QA walk.** No row was walked by a person. The maintainer's blanket approval of 2026-10-08 moved rows 1–3 off
    the human path onto the evidence that already proved them: their test assertions green in CI at `51c6bf2a`, beside
    each row's own script PASS at that head with its input hash; rows 4–7 auto-proven. Shippable: YES, no H row
    accepted unwalked (record.md:681-715).
  - **The security lens.** Round 1 (Opus 5.5) found no route past a verified `.bak` beyond the recorded residuals;
    `review/81` (a pull request turning Codex's hooks off under a green `check`) fixed as signed off, `review/82`
    accepted as the in-bound residual and scheduled at the close (record.md:524-538, :558-560, :726-728). Round 2 over
    `fa52b8ca..bdc6b747`: no Critical or Warning; its two Minors, `review/100` and `review/101`, fixed in fixer round 5
    (record.md:638-642, :647-650). The performance lens breached no declared budget; `review/79` dropped at the close
    (record.md:517-523, :732).
  - **The whole-branch review on Fable 5.1.** Round 1: request-changes, confidence medium (record.md:539-547). Round 5,
    the closing delta over fixer rounds 2–4: approve, confidence medium (record.md:636-646). Round 6 on Opus 5.5 read
    fixer round 5's delta and approved (record.md:654-655).
- **Review verdicts.** The record declares `Confidence gate: medium` (record.md:7), and every approval below meets it.
  The reviewers state confidence in words, not numbers, so the measurements page counts this run in its denominator
  only. Where a re-review's line in the record names no model, the Model cell reads `not named`; where it states no
  confidence, the Confidence cell reads `not stated`.

  Review verdicts, per round (each round a fresh spawn):

  | Pass | Round | Model | Verdict | Confidence | Where |
  |---|---|---|---|---|---|
  | u0-registry-bound-calls | 1 | Opus 5.5 | request-changes | high | record.md:85-92 |
  | u0-registry-bound-calls | 2 | not named | approve; the fixer's later findings went to round 3 | medium | record.md:109-114 |
  | u0-ledger-bound, pass 1 | 1 | Opus 5.5 | request-changes | medium | record.md:115-126 |
  | u0-registry-bound-calls | 3 | not named | approve | not stated | record.md:127-131 |
  | u0-ledger-bound, pass 2 | 1 | Opus 5.5 | request-changes | high | record.md:139-156 |
  | u0-ledger-bound | 2 | not named | approve; `review/10` not fixed, sent to fix round 3 | medium | record.md:180-182 |
  | u0-ledger-bound | 3 | not named | approve | high | record.md:199-202 |
  | u0-check-expectations | 1 | Opus 5.5 | request-changes | medium | record.md:209-219 |
  | u0-check-expectations | 2 | not named | approve | medium | record.md:225-228 |
  | u0-settings-ownership, pass 1 | 1 | Opus 5.5 | request-changes | medium | record.md:247-265 |
  | u0-settings-ownership, pass 2 | 1 | Opus 5.5 | request-changes | medium | record.md:277-290 |
  | u0-settings-ownership | 2 | not named | request-changes | medium | record.md:306-315 |
  | u0-hook-files-ownership, TOML half | 1 | Opus 5.5 | request-changes | medium | record.md:334-349 |
  | u0-settings-ownership | 3 | not named | approve | medium | record.md:359-361 |
  | TOML half, with lane D's rebase | 2 | not named | approve; `build/48` sent to a fixer | medium | record.md:380-386 |
  | TOML half | 3 | not named | approve | not stated | record.md:387-389 |
  | JSON half, pass 1 | 1 | Opus 5.5 | request-changes | medium | record.md:406-425 |
  | JSON half | 2 | not named | request-changes | medium | record.md:438-444 |
  | u0-registry-bound-calls, after the first rebase | 4 | not named | approve | high | record.md:453-455 |
  | JSON half, pass 2 | 1 | Opus 5.5 | approve, four Minors | medium | record.md:462-470 |
  | JSON half | 3 | not named | request-changes | not stated | record.md:478-482 |
  | JSON half | 4 | not named | approve | high | record.md:489-492 |
  | u0-registry-bound-calls, after the second rebase | 5 | not named | approve | high | record.md:507-511 |
  | whole branch | 1 | Fable 5.1 | request-changes | medium | record.md:539-547 |
  | whole branch, the final fix batch | 2 | not named | approve | medium | record.md:558-564 |
  | PR review bot, review 5449405087 on `fa52b8ca` | 1 | the review bot | five inline comments, graded four Warnings and one Minor; no verdict given | not stated | record.md:584-595 |
  | whole branch, the closing delta over fixer rounds 2–4 | 5 | Fable 5.1 | approve | medium | record.md:636-646 |
  | whole branch, fixer round 5's delta | 6 | Opus 5.5 | approve | medium | record.md:654-655 |
