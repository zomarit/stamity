---
id: lean-flows-02
intent: feature
stamp: 2104b177e6c4cc9592e289d72a4ffac9c9a87e92 2026-10-06
reads: [content/commands/st-work.md, content/commands/st-quick.md, content/commands/st-plan.md, content/agents/stamity-test-runner.md, content/agents/stamity-fixer.md, content/agents/stamity-reviewer.md, content/agents/stamity-security.md, content/skills/st-dep-audit/SKILL.md, content/charter/stamity-charter.md, src/roster/triggers.ts, src/roster/reviewCaps.ts, src/roster/modelLadder.ts, src/mcp/secretScan.ts, src/cli.ts, src/cli/kit/program.ts, src/cli/commands/ledger.ts, src/content/charter.ts, scripts/ci/records-only.mjs, test/corpus/commands/work.test.ts, test/corpus/commands/lightTrio.test.ts, test/corpus/agents/spine.test.ts, test/corpus/agents/specialists.test.ts, test/corpus/agents/quality.test.ts, test/corpus/invariants.test.ts, test/roster/roster.test.ts, test/architecture/boundaries.test.ts, test/cli/surface.e2e.test.ts, test/content/invariantsVersion.test.ts, docs/specs/everyday-flows.md, docs/specs/orchestrator-context.md, docs/specs/model-ladder.md, docs/doctrine.md, evals/SET-v7.md, evals/cases-v6]
depends_on: [docs/plans/019-lean-flows-01.md]
---

# Lean flows — file 2 of 3: the product core (checks by change class, review rounds, the security trigger)

This file is self-contained. It is the second of three `/st-plan` artifacts for **Package 23**. It answers the three
complaints the package started from: review loops that keep going, security reviews that fire where they find nothing
and miss where they should fire, and the full test suite on a docs-only change. One session, one pull request. It
ships in the next minor with that release's full eval run (any release rule), carrying the eval cases of `p6`.

intent chosen: feature because it adds a change classifier, declared test inputs and new loop and trigger rules to the
shipped product; nothing here is a diagnosed defect.

## Context

A change today gets the same checks whatever it is: `/st-quick` runs the full gate on a one-line typo; `/st-work` keeps
at least one reviewer round, every gate and the QA checkpoint at every tier; a confirmation round runs after Minor-only
fixes (9 of 42 loops whose round 1 raised no Warning: 3 of 3 light, 6 of 39 deep); round 1 holds 84% of the real fixes and rounds 3–4 only re-check the
previous round's fixes; the security lens's path list matches 4 of 1,746 files here and none of the 53 places its real
finds sat. Import-graph test selection is unsafe here: `vitest --changed` on a docs-only diff selects zero tests and
exits 0, while about a dozen test files read docs pages at runtime (a grep finds `docs/` in 69 of 268). The decision: one class per change, decided by the CLI from the changed
paths, naming the checks; tests chosen by declared reads with "unclear means everything"; Minor findings kept out of
the fix loop, so every applied fix is re-reviewed; at most three rounds; a security trigger that fits a file-writing CLI. Out of scope: the
inbox, QA rows, plan size, effort and usage lines (file 3).

## Decisions

### The maintainer's walk (2026-10-07)

Taken on 2026-10-07, every answer the recommended option except one: build all three files of this plan, before
Package 19 and after plan 016 file 0 and its patch release 1.11.1; review loops cap at three rounds and escalate on
what the run shows; the release eval becomes change-aware with a periodic full run; website, docs-page, spec and
learnings changes get CI lanes, with the rule that every test that can fail on a change runs before `main` moves and
the full matrix runs on every product change and weekly; builders **keep effort `high`** (the one answer that was
not the recommended option); the declared defaults below stand.

### Settled by this plan (declared defaults)

| # | Default |
|---|---|
| S1 | Seven classes, strongest wins: security-sensitive > public contract > product > config > tests > docs > records. No match, no base, a cross-class rename, or zero tests selected for a change that is not records or docs → `product`. |
| S2 | The CLI decides the class: a hidden verb `stamity gate` with subcommands `classify` (this file) and `scan` (`p5`). A hidden verb moves the fewest surface pins. |
| S3 | A repository extends the classes and declares its tests' non-code inputs in one optional file, `.stamity/change-classes.json`. The classifier reads that file **from the base commit**, so a change cannot lower its own checks, and a change to the file is `config`. |
| S4 | Without a declared map, a changed non-code file selects every test whose source names its path, its folder or a glob that matches it. |
| S5 | Invariant 4 is amended (invariants 1.1.0 → 1.2.0): done means the gates the change's class requires exit 0, the full gates run before the merge, and an unclear class runs the full gates. Invariant 1 is not touched. |
| S6 | The review cap moves from 4 to 3; the light tier stops at 2. Minor handling stays as today, and every applied fix keeps its closure re-review. A finding not fixed twice, or a gate red after a fix, gets a fresh fixer at a higher effort on the same model, then the person. Self-rated confidence no longer triggers a round. |
| S7 | The security class's defaults add the risk classes the 53 real finds sat in: CI and release workflows and their scripts, hook and settings files of any client, shell-outs and process spawns, file deletion and overwrite, registry and network calls, state read back as authority, plus the existing auth, crypto and dependency rows. A lockfile-only bump with no install-script change goes to the dependency audit first. |
| S8 | The secret scan of the added lines reuses the shipped patterns in `src/mcp/secretScan.ts`. |
| S9 | The make-room unit frees at least 15 body lines and 900 characters above the re-attach cut, leaving room for Package 22's additions. |

## Spec delta

New ids start at REQ-FLOW-061 (027–050 are reserved by plan 016; 051–060 are headroom). The charter amendment of S5
(invariants 1.2.0, invariant 4) rides with REQ-FLOW-063.

### REQ-FLOW-061 — A change gets the checks its class needs (ADDED)

GIVEN a set of changed paths WHEN `stamity gate classify --base <ref> --json` runs THEN it names one class by S1, its
checks and the lenses the class requires; GIVEN a path no rule places THEN the class is `product`.

### REQ-FLOW-062 — Tests that read files are declared (ADDED)

GIVEN `.stamity/change-classes.json` at the base WHEN a non-code file changes THEN every test its map names is selected;
GIVEN no map THEN S4 selects; GIVEN zero tests selected for a change that is not records or docs THEN the full suite
runs; GIVEN this repository THEN a guard test fails when a test reads a non-code path the map does not declare.

### REQ-FLOW-063 — The gates follow the class (ADDED)

GIVEN `/st-quick` or `/st-work` WHEN a batch or the final tree is proven THEN the gates its class names run, a one-line
typo fix included; GIVEN `product` or a stronger class THEN the final tree gets the full gates.

### REQ-FLOW-015 — The proof block names the class's gates on the final tree (MODIFIED)

`docs/specs/everyday-flows.md:321-330`, `:778-786`: the proof block names a green result, on the final tree, of the
gates its class requires.

### REQ-FLOW-064 — Review rounds stop when they stop paying (ADDED)

GIVEN a fix applied in a round THEN one closure re-review on the fix diff runs; GIVEN a finding not fixed twice, or a gate red after a fix, THEN
a fresh fixer at a higher effort on the same model takes it; GIVEN round 3 (round 2 on light) with a finding still open THEN the run
escalates (fresh fixer at a higher effort, then the person) and no round 4 runs.

### REQ-CTX-018 — The stronger re-review keys on what the run shows (MODIFIED)

`docs/specs/orchestrator-context.md:960-963`: the stronger-class re-review keys on a finding not fixed twice or a red
gate after a fix, not on declared confidence.

### REQ-LADDER-003 — The same fixer keeps rounds 1–2 (MODIFIED)

`docs/specs/model-ladder.md:105`, `:110`: "the fixer on rounds 1–2"; the fresh fixer comes on an escalation.

### REQ-FLOW-065 — The security lens fires by a tested class list (ADDED)

GIVEN a change in the security class (S7) THEN the lens runs at every tier; GIVEN a lockfile-only bump with no
install-script change THEN the dependency audit runs first and the lens only if the audit flags something; GIVEN the
lens THEN it reads commit messages only after it has formed its findings. Topic words may add the lens and never remove
it.

### REQ-FLOW-066 — Every change gets a secret scan of its added lines (ADDED)

GIVEN `/st-quick` or `/st-work` THEN `stamity gate scan --base <ref>` runs and a hit stops the batch.

### REQ-FLOW-067 — A plan unit in a risk class carries a threat note (ADDED)

GIVEN `/st-plan` and a unit in the security class THEN the unit names its trust boundary, what it trusts, one abuse case
and the check that stops it, in at most five lines.

## Units

### p0-make-room — room in `st-work.md` above the re-attach cut

| Field | Content |
|---|---|
| `id` | p0-make-room |
| `requirements` | REQ-FLOW-063, REQ-FLOW-064 (it makes room for their text) |
| `files` | `content/commands/st-work.md`, `test/corpus/commands/work.test.ts` (a moved pin only, with a dated TEST CHANGE note), the `st-work` eval cases whose quoted ranges move, `evals/SET-v7.md` cells, spec citations of `st-work.md` lines (REQ-FLOW-015, 017, 019, 024; REQ-CTX-018; REQ-LADDER-003) |
| `interfaces` | **Measure first** (raw file): `t.indexOf("\n### Specialist pass\n")` = 17,733 at `2104b177` (267 characters under 18,000), body 493 of 500 lines. Free ≥ 900 characters above the cut and ≥ 15 body lines by: (A) compressing the Contract census (`:88-104`) to a pointer at the `contract-census` rule, keeping its pinned phrases (about −10 lines, −600 chars); (B) moving the client-events paragraph (`:273-281`) below the cut (about −640 chars above); (C) replacing QA "Row states" (`:331-337`) with a pointer to the qa skill (about −5 lines); (F) pointing the inbox append and retire text (`:394-413`) at `/st-board`'s `## Deferral inbox` (about −8 lines). Headings and their order stay (`SKELETON`); `REATTACH_BUDGET_CHARS` never rises |
| `testCriteria` | GIVEN the edited file measured the same way THEN the Specialist pass starts at or below 16,833 and the body is at most 478 lines. GIVEN `npx vitest run test/corpus/commands/work.test.ts test/evals/locators.test.ts` THEN green |
| `edgeCases` | A pinned phrase would have to move to reach the target → stop and return `BLOCKED_DEPENDENCY` naming the pin. The context-degradation security exemption (`:136-139`) and the capacity rung (`:144-159`) never move |
| `depends_on` | none |
| `verify` | `node -e 'const t=require("fs").readFileSync("content/commands/st-work.md","utf8");console.log(t.indexOf("\n### Specialist pass\n"))' && npx vitest run test/corpus/commands/work.test.ts test/evals` |

### p1-classify — the change classifier and the `gate` verb

| Field | Content |
|---|---|
| `id` | p1-classify |
| `requirements` | REQ-FLOW-061 |
| `files` | `src/change/classify.ts` (new, zero-import data plus pure functions, modelled on `src/roster/triggers.ts`), `src/cli/commands/gate.ts` (new hidden verb), `src/cli.ts` (registration; the "thirteen" comments), `test/change/classify.test.ts`, `test/cli/commands/gate.test.ts`, `test/cli/surface.e2e.test.ts` (`HIDDEN`, the counts, the title), `test/architecture/boundaries.test.ts` (`PLAN_MAP` wave-14 row; the `triggers.ts` `REGISTRY_ONLY_MODULES` row removed), `test/roster/roster.test.ts:451-487` (the classifier becomes the one `src/` reader), `docs/cli-reference.md` (regenerated), `README.md:79-80`, `docs/getting-started.md:234-242` |
| `interfaces` | `type ChangeClass = "records"\|"docs"\|"tests"\|"config"\|"product"\|"security-sensitive"\|"public-contract"`; `interface ClassRule { class; paths: readonly string[]; addedLinePatterns?: readonly string[]; checks: readonly Check[]; rationale: string }`; `classifyChange({paths, addedLines?}, rules?) → { class, byPath: {path, class, rule}[], checks, lenses, reason }`; path semantics as `triggers.ts:213-230`. CLI: `stamity gate classify --base <ref> [--json]` prints one JSON document `{ok, command: "gate", subcommand: "classify", base, paths, class, checks, lenses, reason}` through the `runCli` funnel (`src/cli/kit/program.ts:353-363`), exit 0 for a report, 2 for a bad argument; subcommands as commander `choices`, like `ledger` (`src/cli/commands/ledger.ts:49-53`) |
| `testCriteria` | GIVEN one path per class THEN that class; GIVEN a plan or spec change THEN `docs` with one review pass; GIVEN a mixed change THEN the strongest; GIVEN an unknown path, no base, or a rename from `docs/` to `src/` THEN `product`. GIVEN `.stamity/change-classes.json` changed in the same diff THEN the base copy's rules apply and the change is at least `config`. GIVEN the surface test THEN `gate` is hidden and counted |
| `edgeCases` | `content/**` is product here, not docs. `.stamity/manifest.json`, config and overrides are security-sensitive, never records. Windows paths are normalised to POSIX before matching |
| `depends_on` | p0-make-room (shared file order only) |
| `verify` | `npx vitest run test/change test/cli/commands/gate.test.ts test/cli/surface.e2e.test.ts test/architecture test/roster` |

### p2-test-inputs — declared reads, the default scan, and the guard

| Field | Content |
|---|---|
| `id` | p2-test-inputs |
| `requirements` | REQ-FLOW-062 |
| `files` | `src/change/testInputs.ts` (new), `.stamity/change-classes.json` (this repository's map, new), `test/change/testInputs.test.ts`, `test/ci/testInputsGuard.test.ts` (new), `src/cli/commands/check.ts` (validates the file when present) |
| `interfaces` | `.stamity/change-classes.json = { "classes": { "<class>": ["<glob>", …] }, "testInputs": [{ "glob": "<glob>", "tests": ["<test file>", …] }] }`; `selectTests({paths, map?, testSources}) → { full: boolean, files: string[], reason }`; `gate classify` adds `tests` to its JSON. This repository's map starts from a hand census of the tests that read non-code files (docs pages → 10 files; plans → 2; specs → 3; records → the records-lane suites; `content/**` → full; `evals/**` → 14) |
| `testCriteria` | GIVEN a docs page change THEN the tests reading it are selected, not zero. GIVEN a file no test names THEN zero selected, and for a docs change that is the docs class's answer, for any other class `full`. GIVEN the guard THEN a test that reads a non-code path literal or helper path not in the map fails the guard with the test and the path named |
| `edgeCases` | Tests that spawn the CLI read the corpus outside the import graph → `content/**` maps to `full`. A glob in a test (`**/*.md`) counts as naming every matching file |
| `depends_on` | p1-classify |
| `verify` | `npx vitest run test/change test/ci/testInputsGuard.test.ts test/cli/commands/check.test.ts` |

### p3-gates-by-class — `/st-quick`, `/st-work` and the charter run the class's gates

| Field | Content |
|---|---|
| `id` | p3-gates-by-class |
| `requirements` | REQ-FLOW-063, REQ-FLOW-015 |
| `files` | `content/commands/st-quick.md:150-158`, `content/commands/st-work.md:226-239`, `content/agents/stamity-test-runner.md:19-40`, `content/charter/stamity-charter.md:53-54` and its `invariants_version`, `docs/doctrine.md` (`## Amendments` row), `src/content/charter.ts` (byte constants `:313`, `:339`, `:362`, only if the bytes move), `test/content/invariantsVersion.test.ts` (new hash row), the pins in `test/corpus/commands/work.test.ts:702-731`, `lightTrio.test.ts:789-808`, `test/corpus/agents/quality.test.ts:261,267`, the two charter eval cases' sources, `docs/specs/everyday-flows.md` |
| `interfaces` | `/st-quick` step: run `stamity gate scan` and `stamity gate classify`, then the checks the class names (the test-runner runs the selected files as a narrow run, which its contract already allows), "a one-line typo fix included". `/st-work` Prove: during the build the selected tests; on the final tree the class's gates, the full gates for `product` and stronger. Invariant 4's new sentence fits the 95-line pin |
| `testCriteria` | GIVEN the corpus tests THEN the new phrases are pinned and "the final tree always gets a run of its own" still holds for `product` and stronger. GIVEN `invariantsVersion.test.ts` THEN the new hash row matches and the doctrine row names 1.2.0. GIVEN the always-on budget test THEN each client's charter is still 95 lines (407 on Codex) |
| `edgeCases` | A repository without the `gate` verb on its path (an old CLI) → the command falls back to the full gate and says so. A class whose selected tests are zero and whose class is docs → the docs class's gates (scan, prose check) still run |
| `depends_on` | p2-test-inputs |
| `verify` | `npm run build && node dist/cli.js sync && npx vitest run test/corpus test/content test/emit/crossClientGoldens.test.ts --update && npm run lint && npm run typecheck` |

### p4-loop-rules — rounds stop when they stop paying

| Field | Content |
|---|---|
| `id` | p4-loop-rules |
| `requirements` | REQ-FLOW-064, REQ-CTX-018, REQ-LADDER-003 |
| `files` | `src/roster/reviewCaps.ts:19` (4 → 3), `content/commands/st-work.md:245-263`, `:462-463`, `content/agents/stamity-fixer.md:72-98` (the round policy: the escalation order; `:22` and `:98` keep their Minor and re-review rules), `content/agents/stamity-reviewer.md:110-112`, `src/roster/modelLadder.ts` header (a third prompt-carried placement: higher effort, same model), `docs/working-with-stamity.md:96`, regenerated `docs/configuration.md`, `docs/specs/model-ladder.md`, `docs/specs/orchestrator-context.md`, and the pins: `test/roster/roster.test.ts:59-75`, `test/corpus/commands/work.test.ts:733-769`, `:894-913`, `test/corpus/invariants.test.ts:91`, `:1544-1660` (invariants 15 and 16 rewritten with reasons), `test/corpus/agents/spine.test.ts:785-829`, `test/roster/modelLadder.test.ts:690-717`, `test/corpus/hookWiring.test.ts:488-503`, `test/hooks/scripts.test.ts:2330-2357`, `test/manifest/manifest.test.ts`, `test/cli/commands/config.test.ts:1002-1051`; eval cases citing `stamity-reviewer.md` and `stamity-fixer.md` ranges re-synced |
| `interfaces` | `DEFAULT_MAX_REVIEW_ITERATIONS = 3` (band 1..10 unchanged); the light tier's cap of 2 is prose (the hook cannot see a tier); the escalation keys on two `re-review not-fixed` notes on one ledger row (`src/runs/ledgerStore.ts:711-717` already appends them) or a red gate after a fix |
| `testCriteria` | GIVEN the roster THEN the default is 3 and the band 1..10. GIVEN the fixer body THEN the escalation order (a fresh fixer at a higher effort, then the person) is pinned. GIVEN invariants 15 and 16 THEN they derive from the cap of 3. GIVEN `config set review.maxIterations 4` THEN 4 still works |
| `edgeCases` | A manifest that pins 4 keeps 4. The Claude Code review-gate hook still counts per session (plan 016 file 2's `u2-review-gate-all` rewrites it); a light run that ends at 2 rounds with an approval releases the hook normally |
| `depends_on` | p0-make-room |
| `verify` | `npx vitest run test/roster test/corpus test/hooks test/manifest test/cli/commands/config.test.ts test/evals` |

### p5-security-trigger — the class list, the audit first, the scan, the threat note

| Field | Content |
|---|---|
| `id` | p5-security-trigger |
| `requirements` | REQ-FLOW-065, REQ-FLOW-066, REQ-FLOW-067 |
| `files` | `src/roster/triggers.ts` (the security row's paths; added-line patterns move to the classifier rules), `src/change/classify.ts` (security rules), `src/cli/commands/gate.ts` (`scan`), `content/agents/stamity-security.md:24-39`, `:149-163`, `content/commands/st-work.md:285-309`, `content/skills/st-dep-audit/SKILL.md`, `content/commands/st-plan.md:101-125` (the threat note), the pins `test/corpus/agents/specialists.test.ts:321-337`, `test/corpus/commands/work.test.ts:807-811` (no trigger pattern string in the Specialist pass: describe the lockfile rule without naming a lockfile), `test/corpus/agents/verdictReturns.test.ts:232-245`, `test/corpus/commands/plan.test.ts:290-298`, eval sources citing `st-plan.md:101-125` |
| `interfaces` | `stamity gate scan --base <ref> [--json]` → `{ok, hits: [{path, line, rule}], scanned}`, exit 1 on a hit, patterns from `src/mcp/secretScan.ts:39`; security rules: path globs (`.github/workflows/**`, `**/hooks/**`, `**/*.sh`, client settings and hook files, `Dockerfile`) and added-line patterns (process spawn, recursive delete or overwrite, a registry or network call, a token or secret name); the security agent reads `git log` after it has formed its findings; the plan unit's `threat:` field, at most five lines |
| `testCriteria` | GIVEN an auth-path change, a deletion-logic change and a workflow change THEN each classifies security-sensitive and names the lens. GIVEN a lockfile-only bump THEN the checks name the dependency audit and not the lens; GIVEN its twin adding an install script THEN the lens. GIVEN a staged fake token in an added line THEN `scan` exits 1 naming the rule, never the token. GIVEN the parity tests THEN the agent body's table matches the roster |
| `edgeCases` | A repository whose CLI paths fire the new rules on every change → it narrows them in `.stamity/change-classes.json` at the base; the lens is never gated by hit rate |
| `depends_on` | p1-classify |
| `verify` | `npx vitest run test/change test/cli/commands/gate.test.ts test/corpus test/roster` |

### p6-eval-cases-core — the risky case still gets its check

| Field | Content |
|---|---|
| `id` | p6-eval-cases-core |
| `requirements` | REQ-FLOW-062, REQ-FLOW-063, REQ-FLOW-064, REQ-FLOW-065, REQ-FLOW-067, REQ-PROVE-009 |
| `files` | New cases under `evals/cases-v6/golden/` and `adversarial/`, `evals/SET-v7.md` (roster counts and cells), `evals/README.md`, `test/evals/successorInputs.test.ts` |
| `interfaces` | One case per reduced check, each with binding rows: (1) a docs edit to a file a test reads runs that test; (2) an unclear path gets the full gate; (3) an auth-path change and (4) a CLI file-deletion change get the security lens; (5) a lockfile-only bump gets the audit and no lens, with (6) its install-script twin getting the lens; (7) a light run with a finding still open at round 2 escalates instead of a round 3; (8) a gate red after a fix gets a fresh fixer at a higher effort; (9) a finding open at round 3 escalates instead of a round 4; (10) a light single pass catches a logic defect in a small diff; (11) a risk-class plan unit carries a threat note. Only `evals/cases-v6/` moves |
| `testCriteria` | GIVEN `npx vitest run test/evals` THEN green (locators, roster, coverage, successor inputs). GIVEN `find evals/cases-v6 -name '*.md' \| wc -l` THEN the count is the base count plus 11 |
| `edgeCases` | Plan 015's `b4` or plan 016's file 0 lands first and moves the counts → re-base on them (contract census); set source ranges from the landed text only |
| `depends_on` | p3-gates-by-class, p4-loop-rules, p5-security-trigger |
| `verify` | `npx vitest run test/evals` |

### p7-dogfood-sync — every emitted copy regenerated

| Field | Content |
|---|---|
| `id` | p7-dogfood-sync |
| `requirements` | spec carries no ids |
| `files` | `.claude/**`, `.apm/**`, `.agents/**`, `AGENTS.md`, `.stamity/manifest.json`, the golden snapshots |
| `interfaces` | `npm run build && node dist/cli.js sync`, then the goldens with the files named first and `--update` last |
| `testCriteria` | GIVEN `node dist/cli.js check` THEN clean. GIVEN the full suite alone with `STAMITY_CLAUDE_BIN` unset (reason recorded) THEN green |
| `edgeCases` | A golden that moves without a content change → stop and find the cause |
| `depends_on` | p6-eval-cases-core |
| `verify` | `npm run build && node dist/cli.js sync && node dist/cli.js check && npm run lint && npm run typecheck && npm run test` |

## Execution order

1. Measure `st-work.md` (p0's numbers), then `p0`.
2. `p1` → `p2` → `p3` (one lane: the classifier, its inputs, its text). `p4` and `p5` after `p1`, each in its own lane;
   shared files (`st-work.md`, the corpus pins) take one writer at a time in the order `p3`, `p4`, `p5`.
3. `p6`, then `p7`; the full suite alone; coverage; knip; CI; the security lens on the change set (it is in the
   security class itself: it changes what fires the lens); the final whole-branch review at Fable 5.1 before the merge.

## QA walk

| # | Row | Who |
|---|---|---|
| 1 | In a scratch repository, a README typo through `/st-quick` runs its gate in seconds and names the checks it ran | person |
| 2 | In a scratch repository, a change to file-deletion code gets the security lens at the light tier | person |
| 3 | `stamity gate classify --json` on this repository's last ten merged PRs gives the classes a reader would expect | auto, then a person reads the table |

## Risks

- **Warning:** a narrower local gate finds a failure later (at CI) when the map misses a read. Mitigations: the guard
  test, "unclear means product", CI's full run before the merge.
- **Warning:** `st-work.md`'s two budgets; `p0` measures and stops rather than raising a budget.
- **Warning:** the charter amendment moves many pins (hash, doctrine row, byte constants, goldens, two eval sources).
- **Warning:** invariants 15 and 16 encode the round-4 escalation; their rewrite needs inline reasons.
- **Minor:** the Claude Code review-gate hook keeps counting per session until plan 016 file 2 rewrites it.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

- Warning · `.stamity/generated/hooks/claude/stamity-review-gate.mjs:691` · the gate keys its counter and its verdict by
  session, so one unit's approval releases another unit's open review and the cap binds per session · source: /st-plan · Ref: docs/plans/016-fork-distribution-02.md

## Drop list

| Item | Revisit when |
|---|---|
| A gate verdict reused by tree hash for the final tree | gate repeats reappear after file 1's `t9` (it conflicts today with "the final tree always gets a run of its own") |
| A runtime file-read tracer behind the guard | the guard misses a read in practice |
| A cheaper class or effort for closure re-reviews | file 3's usage lines show re-reviews above ~10% of a session's cost |
| Hit-rate gating of the performance and design-quality lenses | 20 runs of stored rates exist |
