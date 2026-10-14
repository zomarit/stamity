---
id: lean-flows-02-in-flow
intent: feature
stamp: 5be05cda 2026-10-09
reads: [docs/plans/019-lean-flows-02.md, .stamity/runs/2026-10-08_product-core/record.md, .stamity/runs/2026-10-08_product-core/reports/plan-researcher-r1-seams.md, .stamity/runs/2026-10-08_product-core/reports/plan-researcher-r1-specs.md, .stamity/runs/2026-10-08_product-core/reports/plan-researcher-r1-evals.md, .stamity/runs/2026-10-08_product-core/reports/plan-researcher-r1-cites.md, .stamity/runs/2026-10-08_product-core/reports/plan-code-reviewer-r1.md, .stamity/runs/2026-10-08_product-core/reports/plan-text-reviewer-r1.md, .stamity/runs/2026-10-08_product-core/reports/plan-code-reviewer-r2.md, .stamity/runs/2026-10-08_product-core/reports/plan-text-reviewer-r2.md, .stamity/runs/2026-10-08_product-core/reports/plan-reviewer-r3.md, .stamity/runs/2026-10-08_product-core/reports/p1ab-reviewer-r1.md, .stamity/runs/2026-10-08_product-core/reports/p1ab-security-r1.md, test/corpus/cliCallForm.test.ts, .stamity/runs/2026-10-08_maintainer-tooling/plan.md, content/commands/st-plan.md, content/commands/st-work.md, content/commands/st-quick.md, content/charter/stamity-charter.md, content/rules/stamity-injection-screening.md, content/agents/stamity-fixer.md, content/agents/stamity-reviewer.md, content/agents/stamity-security.md, src/roster/triggers.ts, src/roster/modelLadder.ts, src/mcp/secretScan.ts, src/composition/root.ts, src/cli/engine/gitStatus.ts, scripts/ci/records-only.mjs, .github/workflows/ci.yml, test/architecture/boundaries.test.ts, test/composition/root.test.ts, test/corpus/agents/specialists.test.ts, test/corpus/invariants.test.ts, test/corpus/commands/work.test.ts, test/corpus/commands/plan.test.ts, test/corpus/hookWiring.test.ts, test/hooks/scripts.test.ts, test/cli/commands/config.test.ts, test/roster/roster.test.ts, test/evals/roster.test.ts, docs/specs/orchestrator-context.md, docs/specs/model-ladder.md, docs/specs/prove-behavior-and-value.md, docs/capability-matrix.md, docs/configuration.md, docs/cli-reference.md, evals/SET-v7.md, package.json, .claude/skills/st-verify/scripts/spec-plan-coverage.mjs, .stamity/learnings]
depends_on: [docs/plans/019-lean-flows-01.md]
---

# Run 2026-10-08_product-core: the in-flow plan (plan 019 file 2, re-planned)

This is the run's own plan. It replaces nothing in `docs/plans/019-lean-flows-02.md`. It re-plans that file at HEAD
`17f2e8bf` because its freshness guard failed (stamp `f1035ef8`; 8 of 44 `reads` moved, listed in this run's
`record.md:21`). It carries the opening batch's answers and the nine Phase 2 notes (`record.md:26-52`) as binding. An
implementer holding no session history can execute every unit: each cell names the file, the HEAD line and the shape.
Line numbers are the same at `17f2e8bf` and `5be05cda`: the two Dependabot merges between them change only two
workflow pins, `package.json`'s `oxlint` pin and the lockfile. Integration units run in order, so a later unit finds its
cited text by the quoted words, not by the number.

Amended 2026-10-09 for the plan coverage review r1 (`reports/plan-code-reviewer-r1.md`,
`reports/plan-text-reviewer-r1.md`; ledger `plan/1`–`plan/54`), under the sign-offs and the routing at
`record.md:58-66`. p0-make-room was already building against the frozen copy `reports/plan-r1.md`; its cell changed
only in its targets. Three units split under the unit ceiling (p1a into p1a, p1c and p1d; p2b into p2b and p2d; p5a
into p5a and p5e), one text unit was added (p5f), and p6-locator-guard moved onto the integration branch after
p6-index.

Amended again 2026-10-09 (r2 → r3) for the plan re-review r2 (`reports/plan-text-reviewer-r2.md`,
`reports/plan-code-reviewer-r2.md`; ledger `plan/55`–`plan/61`), under the sign-off on `plan/57`, the routing of the
other six, and the orchestrator's schedule (`record.md:75`, `:79`). The p8 units now run before p3b on the integration
lane, lane A may merge in two steps, and every table, `depends_on` cell and paragraph follows that order. p0-make-room
is built (`361da60e`, `4968e8e6`) and p1a-classifier-verb is building; their cells keep their scope. p4a-review-cap
gains one file by the orchestrator's sign-off on its `BLOCKED_DEPENDENCY` (its cell's `amended` row). One unit was
added: p5g-audit-first, split off p5a so that p5a can take the change read of `plan/59` and stay under the unit
ceiling.

Amended again 2026-10-09 (r3 → r4) for p1a–b's review r1 and the plan re-review r3 (`record.md:88-89`;
`reports/p1ab-reviewer-r1.md`, `reports/p1ab-security-r1.md`, `reports/plan-reviewer-r3.md`). Under the sign-offs on
`review/6`, `review/7` and `review/8`, D10 is widened, the built-in security rules match without case, an extensionless
file joins the S3 floor (`build/7`), and this repository's class file places the classifier and gate code in
`security-sensitive` (p2a), with a p2c test and a named residual. From the fix round (`ceeaa736`, declared defaults
`review/11` and `review/12`), p2a's validator folds case on the rules that raise a path, and a dotfile counts as
extensionless. Under the declared defaults on `plan/62` and `plan/63`, the change read adds `--text` and the NUL sniff and takes names from the `-z` lists (p5a, p5e), and the
project root is the nearest ancestor holding `.stamity/` (p1c, which is building with it, and every later cell that
reads from the project root). Five `depends_on` cells (p5e, p2c, p5b, p5c, p8a) and p6-setup-route's now hold unit
ids only; their notes moved into each cell's `edgeCases`. Built units (p0, p1a, p1b, p4a) and building ones (p1c, p4b)
keep their scope. No unit was added: 40 units.

**Line numbers in `st-work.md` after p0.** Cells cite `content/commands/st-work.md` by its pre-p0 lines (HEAD
`5be05cda`) unless they say otherwise. p0 moved them: at `4968e8e6` the capacity rung's "the fixer on rounds 1–3" is
`:141`, the cap bullet `:239-240`, the ladder bullet `:241-245`, and "converge by round 2–3" `:435`. A unit finds its
cited text by the quoted words; a pre-p0 number is a lead, never the anchor.

intent chosen: feature because it adds a change classifier, declared test inputs, an added-line secret scan and new
loop and trigger rules to the shipped product; nothing here is a diagnosed defect.

## Context

The persisted file's Context stands. Three complaints drove it:

- Review loops keep going: 84% of real fixes land in round 1, and 9 of 42 loops ran a confirmation round after
  Minor-only fixes.
- The security lens fires where it finds nothing and misses where it should: its paths match 4 of 1,746 files here
  and none of the 53 places its real finds sat.
- A docs-only change runs the full suite, and import-graph selection is unsafe here: about a dozen test files read
  docs pages at runtime.

The decision also stands: one class per change, decided by the CLI from the changed paths; tests chosen by declared
reads, with "unclear means everything"; Minor findings kept out of the fix loop; at most three rounds; a security
trigger fitted to a file-writing CLI; and a capture rule by consequence with one severity scale.

What moved since the stamp:

- File 1 landed the CI lanes. `scripts/ci/records-only.mjs` now holds a hand census of lane suites (`:74-104`) that
  duplicates this file's test-input map.
- `test/architecture/boundaries.test.ts` gained rows.
- The eval set stands at 113 cases.

Out of scope, as before: the inbox close, QA rows, plan size, effort and usage lines (plan 019 file 3); the review-gate
hook's per-session counter (plan 016 file 2); any release (the next one is 1.14.0).

## Decisions this plan carries

### The persisted defaults

S2, S4, S8 and S10–S14 stand as written in the persisted file (`019-lean-flows-02.md:55-70`). The rest stand with
these marks:

- **S1 stands, with the no-base reading signed off (`record.md:58`).**
  - With no `--base`, each known path takes its built-in class. The class file is not read, since no base copy
    exists; the strongest class wins; an unplaced path is `product`; `reason` says the base was not given (D5).
  - An unresolvable `--base`, an empty path list or a rename whose two sides classify differently makes the class at
    least `product`, never lowering a stronger one (review r1, `plan/11`, `plan/28`).
  - The flows always pass `--base`: `/st-quick` the `HEAD`, `/st-work` the run's base commit. A flow that cannot name
    one runs the full gates without classifying (`plan/39`). `gate scan` with no `--base` scans the uncommitted change
    against `HEAD` and says so in its JSON; a flow with committed work and no nameable base lists
    `secret scan: not run` under `Not done:` (review r2, `plan/56`).
  - **The project root (review r2, `plan/61`; amended for review r3, `plan/63`).** `gate` maps every path to the
    project root, which may sit below the git top-level (a setup in a monorepo subfolder). The project root is the
    nearest ancestor of the working directory, up to and including the git top-level, that holds a `.stamity/`
    directory; where none does, the top-level. Every git read runs with the project root as its working directory,
    so a run from any subfolder of the project (`.stamity/runs/<run>/` included) reads the whole project. Paths are
    project-relative; the class file and the lockfiles are read at the base under the project's prefix; a changed
    path outside the project is left out and counted in `reason` (p1c).
- **S3. Amended in-flow 2026-10-08: one source per path list (Phase 2 note 2).**
  - The built-in rules in `src/change/classify.ts` are generic: the three `.stamity/` record paths; `docs/**` and
    top-level `*.md` as docs; the security floor; and `.stamity/change-classes.json` itself as `config`.
  - This repository's own lists live in its `.stamity/change-classes.json`.
  - `scripts/ci/records-only.mjs` keeps its lane paths and per-lane steps. It drops its suite census (`LANE_SUITES`)
    and selects through the base commit's copy of the class file. A missing or malformed map runs full CI, and the
    head copy never narrows its own CI.
  - **Floor (amended 2026-10-09, sign-off on `plan/8`).** A glob may join a class, but no rule, built-in or extension,
    places a code file in `records` or `docs`: a code file under a test glob is `tests`, any other keeps its next
    placement, and an unplaced one is `product`. A glob that matches every path is refused for a class weaker than
    `product`: `check` reports the file invalid, and the classifier reads no map from it. This also closes `plan/10`
    (code under `docs/**`).
  - **Two more floors (amended 2026-10-09, sign-offs on `review/6`, `review/7`; `build/7`; `record.md:88`).** An
    agent instruction file (D10 as widened) is at least `product` under every rule. An extensionless file is never
    placed in `docs` or `records`, except one whose base name is `LICENSE`, `NOTICE`, `AUTHORS`, `CHANGELOG`,
    `COPYING` or `README`; any other takes its next placement, and an unplaced one is `product`, as the code-file
    floor does. Both bind extension rules too.
  - **The classifier's own code (amended 2026-10-09, sign-off on `review/8`).** The base copy of the class file stops a
    change from lowering its own checks through the file's data. The code that applies the rules is placed by this
    repository's class file in `security-sensitive` (D2, p2a), so any change to it gets the lens. The residual where
    head code still routes its own CI is named in `## Security notes`.
- **S5. Amended in-flow 2026-10-08: invariant 4 fits its two charter lines (opening answer 2, Phase 2 note 1).**
  - Invariant 4 names the class's gates, all gates when the class is unclear, and the unchanged `Not done:` line.
  - S5's CI clause ("the repository's CI runs the full matrix on every product change and on a schedule") moves into
    `/st-work`'s Gates text and `/st-quick`'s Quality gates text.
  - Version 1.2.0, class MINOR: a repository that never re-syncs still runs a superset of the gates.
  - The 95-line budget (407 on Codex) and every eval line pin stay.
  - **Amended 2026-10-09 (sign-off on `plan/51`):** the CI clause is written as the condition the narrowing rests on,
    not as a fact about every repository. Where the charter's `CI provider` reads `unknown`, the final tree runs the
    full gates whatever the class.
- **S6. Amended in-flow 2026-10-08: the escalation mechanism (Phase 2 note 5).**
  - What triggers it: a ledger row carrying two `re-review not-fixed` notes; a gate red after a fix; or a finding
    still open at the cap round.
  - What it does: a fresh fixer spawn (never the resumed one) with the round history, on the same model, at one effort
    level above the fixer's declared one where the client's dispatch accepts an effort setting.
  - Where the dispatch accepts none, the fresh spawn alone is the escalation, and the proof block records
    `effort: not settable`.
  - A finding that fixer leaves open stops the run as `BLOCKED_FAILURE` to the person.
  - The model ladder's round-4 class placement becomes this effort placement; the header still counts two
    placements.
- **S7. Amended in-flow 2026-10-08: three changes (Phase 2 note 6, the persisted p5 inbox fold, and the parity test
  at `test/corpus/agents/specialists.test.ts:320-339`); two more on 2026-10-09 (review r1).**
  - (a) A lockfile bump of a package that has an install script keeps the lens, whether the script is added or
    already present. Audit-first holds only where both the base and the head lockfile prove it: npm lockfile
    version 2 or 3, the changed entries diffed, the format's install-script field read. Every other format, or a parse
    failure, keeps the lens (`plan/12`, `plan/52`).
  - (b) The S7 path rows live in one list, `src/roster/triggers.ts`'s security row, in that module's pattern syntax.
    `classify.ts` derives the security class's paths from that row, and the security agent's Trigger table states
    them.
  - (c) The S7 line rules (spawns, deletion and overwrite, registry and network calls, token and secret names) live
    in `classify.ts` (D3). They read code files outside the test globs only. Each rule is a call shape on a named API,
    word-bounded and with its opening parenthesis; a token or secret name matches only when assigned a literal or an
    environment value. Context lines count only in a hunk that also removes a line (sign-off on `plan/29`). The lines
    come from one read through p1c's hardened runner with pinned flags (`--no-ext-diff`, `--no-color`,
    `--no-textconv`, `-U3`), staged and unstaged against the base, with every untracked file read whole as added lines
    (review r2, `plan/59`; p5a). The read adds `--text`, so no attribute or diff driver turns a code file into
    "Binary files differ"; the plan's NUL sniff alone decides binary; a tracked code file the read cannot show is
    counted unscanned (listed under `Not done:`, the class at least `product`); and every file's name comes from the
    `-z` lists, never from a patch header (review r3, `plan/62`, declared default).
  - (d) "State read back as authority" is placed by path (`plan/9`). The built-in floor holds the engine's own state:
    `.stamity/manifest.json` and `.stamity/overrides/**`, with the class file at least `config`. The built-in
    security rules match without case, as `triggers.ts` already does, so `.Stamity/manifest.json` is still
    `security-sensitive` (sign-off on `review/7`; closes `build/5`). Each repository's
    class file names the code that reads state back: here `src/merge/**`, `src/manifest/**`,
    `src/runs/ledgerStore.ts` and `src/cli/engine/gitStatus.ts`. Records read back into a session
    (`.stamity/handoffs/**`, `.stamity/inbox.md`) stay `records`: the injection-screening floor reads them as data,
    never as authority.
  - (e) `/st-quick`'s `Security-sensitive surface` row also fires when `gate classify` names the class
    `security-sensitive`. That is a hard refusal with no size floor, so the item moves to `/st-work`, where the lens
    runs at that tier. No lens is added inside the quick lane (sign-off on `plan/27`).
- **S9 stands.** Its means are Phase 2 note 4: A and B free the characters; A and C free the lines. Under the sign-off
  on `plan/35`, F is not taken: p0 frees lines by duty-preserving compressions only, target 15 and minimum 10, and
  reports the number. Any shortfall in S9's room for Package 22 goes on the close list.

### Answers carried

- **Opening batch** (`record.md:30-33`): execute now; invariant 4 in two lines; the night run may merge Dependabot #93
  and #94, push to this PR's branch, re-run a CI leg once, and mark ready once with one bot batch; the disk freed.
  `build/75` folds into p6 and p7 (Phase 2 note 3).
- **Held for the morning** (`record.md:35`): the merge to `main`, the person QA rows, the leftovers question and the
  private close.
- **Review r1 sign-offs** (`record.md:61-65`): `plan/8`, `plan/27`, `plan/29`, `plan/35` and `plan/51`, each a
  declared default on the close list.
- **Review r2 sign-off** (`record.md:79`): `plan/57`, a scan hit on a deliberate test fixture. Hits always stop, with
  no rewrite-and-rescan, since splitting a value into fragments would also hide a real credential. This repository's
  tests build secret-shaped fixture values at runtime from fragments, so no added line carries one (common rules). In
  another repository a deliberate fixture hit is the person's to settle, and the stop names path, line and rule. On the
  close list.
- **The orchestrator's schedule** (`record.md:75`, declared default): p8a … p8f run before p3b on the integration lane;
  lane A may merge in two steps (after p5e, then p2c). On the close list.
- **p4a's dependency** (orchestrator sign-off, option 1, 2026-10-09): `test/corpus/commands/work.test.ts` joins p4a's
  files for the capacity-rung pin only.
- **p1a–b review r1 sign-offs** (`record.md:88`), each on the close list:
  - `review/6` with `review/7`: D10 widened (any depth, base name matched without case), and the built-in security
    rules match without case (closes `build/5`).
  - `build/7`: an extensionless file is never `docs` or `records`, except the six named base names (S3).
  - `review/8`: this repository's class file places the classifier and gate code in `security-sensitive` (p2a); p2c
    tests that the CI lanes give their own decision code full CI; the residual is named in `## Security notes`.

  A fixer applied the `classify.ts` part (`review/5`, `review/6`, `review/7`, `review/9`, `build/5`, `build/7`) in its
  own worktree from `fedb964a`; it is on lane A as `ceeaa736`. p1d and every later cell assume that behaviour.
  `review/10` (the JSON fields unsanitised) rides p1c's review fixer.
- **The p1a–b fix round** (coordinator, 2026-10-09; declared defaults, on the close list): `review/12`, `ClassRule`
  gains the optional `foldCase`, set by the built-in security and instruction-file rules, and p2a's validator sets it
  on every `product`, `public-contract` and `security-sensitive` rule and on no other; `review/11`, a dotfile counts as
  extensionless, so a `.gitkeep`-style file reads `product` (p2a's edge case).
- **Plan re-review r3 declared defaults** (`record.md:89`), each on the close list:
  - `plan/62`: the reads add `--text`, the plan's NUL sniff decides binary, a tracked code file the read cannot show
    counts as unscanned (listed under `Not done:`, the class at least `product`), and names come from the `-z` lists
    (p5a, p5e, and the flows' `Not done:` line in p3b and p3c).
  - `plan/63`: the project root is the nearest ancestor of the working directory, up to the git top-level, that holds
    `.stamity/` (else the top-level), and every git read runs from there. Sent to p1c mid-build; p2a, p5a, p5g and p5e
    read from that root.

### Declared defaults taken by this re-plan

Each one is on the close list for reversal.

| # | Default | Why |
|---|---|---|
| D1 | The class → checks table in p1a's `interfaces` (`records`: scan, selected tests; `docs`: scan, selected tests, one review pass; `tests`: scan, selected tests, lint, typecheck, review; `config`, `product`, `public-contract`, `security-sensitive`: scan, all gates, review; plus the security lens for `security-sensitive`) | The persisted plan names classes and their order, not each class's checks. This table is the narrowest that keeps REQ-FLOW-063 ("`product` or stronger gets the full gates") and the p3 edge case (the docs class's gates still run). Records run their selected tests because the records suites read the committed records (review r1, `plan/13`) |
| D2 | This repository's class file adds: `content/**` → product, `website/**` → docs, `evals/**` and `test/**` → tests, the five tool configs → config, and `src/merge/**`, `src/manifest/**`, `src/runs/ledgerStore.ts`, `src/cli/engine/gitStatus.ts`, plus the classifier and gate code `src/change/**`, `src/cli/commands/gate.ts`, `src/roster/triggers.ts` and `scripts/ci/**` → security-sensitive. Its test-input map carries `content/**` as an entry that selects every test | Phase 2 note 2 names the lists; it does not say which class `website/**` and `evals/**` join. A path no rule places is `product`, so joining a weaker class is only a placement. The S3 floor keeps `website/**`'s code files out of `docs`. The security list is S7 (d) (`plan/9`), and the classifier and gate code join it under the sign-off on `review/8` (`record.md:88`): a change to the code that decides the checks gets the lens. The shipped code names no repository path (`plan/16`) |
| D3 | The S7 line rules read files whose extension is in `CODE_EXTENSIONS` (p1a) and that sit outside the test globs; never Markdown, snapshots or JSON | Corpus prose says "delete" and "fetch" on every page, and every content unit regenerates two golden snapshots that carry the rule words (`plan/5`). Test files clean up with the same calls (sign-off on `plan/29`) |
| D4 | After p4c, an approval below the declared confidence gate counts, and the proof block names it as below the gate. The stronger-class re-review runs once, only after an escalation | REQ-CTX-018's persisted MODIFIED text: "keys on a finding not fixed twice or a red gate after a fix, not on declared confidence" |
| D5 | With no `--base`, each known path takes its built-in class (no class file is read, the strongest wins, an unplaced path is `product`), and `reason` says the base was not given. An unresolvable `--base` or an empty path list makes the class at least `product` | Signed off at `record.md:58`: the persisted p1 inbox fold, which the maintainer accepted in file 1's inbox walk. The flows always pass `--base` (S1), so this reading serves only a bare run |
| D6 | p0's B paragraph moves to the end of `## Dials` → `### Intensity`, its first sentence reading "under the review loop" | The only section below the cut that already speaks of the review loop (`st-work.md:462-463`) |
| D7 | "The audit flags something" means: an advisory at any severity, a licence flag, or an update-risk class other than `patch` or `minor` | `/st-plan`'s Migration text names the skill's classes (`st-plan.md:178-182`); the persisted plan does not define a flag |
| D8 | The security row gains topic words `workflow`, `release`, `hook`, `shell`, `file deletion`, `network call` | Topic words may add the lens and never remove it (REQ-FLOW-065) |
| D9 | Implementers do not edit `docs/specs/`. p9 (a spec-author) writes the Spec delta once and re-cites the specs' line citations after every corpus unit has landed. One exception: p0's edge case updates in place a spec citation that a test holds, names it in its report, and p9 leaves it | One writer per spec file; the model run did the same (its `i2`). The citations would otherwise move in six units. The exception is p0's cell as it was frozen (review r1, `plan/53`) |
| D10 | A file whose base name is `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md` or `CLAUDE.local.md`, matched without case, at any depth (the docs tree, `.stamity/runs/**` and `.stamity/handoffs/**` included), is at least `product`. Widened 2026-10-09 from "top-level `AGENTS.md` and `CLAUDE.md` fall to `product`" | They steer agent sessions wherever a client loads them: nested copies, the override file, the local file, and a case variant a case-insensitive checkout opens under the canonical name; one review pass, or none, is too little (review r1, `plan/9`; p1a–b review r1, `review/6`, `review/7`, signed off at `record.md:88`). At least `product` is the fail-safe direction and adds no lens |

## Common rules every unit follows

- **Files and size.** A unit's `files` cell is its boundary. Two kinds of file count toward the ~8-file ceiling but
  are never authored:
  - the two golden snapshots `test/corpus/__snapshots__/emissionGoldens.test.ts.snap` and
    `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, regenerated;
  - range-only `source:` shifts in an eval case, plus their SET-v7 index cell.

  A unit that passes 8 only by those is kept whole, because splitting them off leaves the text and its shifted
  ranges red between units (the model run's b4 answer). A unit stays near 400 changed lines; a finding that grows one
  past that splits it.
- **Goldens.** Any content edit regenerates both snapshots: the files first, `--update` last (learning
  `vitest-update-flag-takes-an-optional-value`):
  `npx vitest run test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts --update`. A golden that
  moves with no content change in the unit is a stop: find the cause.
- **Eval moves** (learning `corpus-line-shifts-move-eval-case-source-ranges`). A case file is
  `evals/cases-v6/<golden|adversarial|probes>/<id>.md`; its id names the file.
  1. A shifted range updates the case's `source:` and its SET-v7 case-index source cell, which
     `test/evals/roster.test.ts:120-125` holds equal.
  2. Changed quoted text is re-quoted byte-identical from the landed file.
  3. A Brief may move.
  4. A moved Expected block of a case with a cases-v4 or cases-v5 copy gets a dated addition to its existing
     `EXPECTED_MOVES` value in `test/evals/successorInputs.test.ts` (`:72-155`). Never add a second key. A case with
     no such copy is recorded by the SET-v7 paragraph alone.
  5. A case that stops being byte-identical to its cases-v5 copy moves the identical/moved counts in
     `evals/README.md` and SET-v7 (`:1`, `:10`, `:43-46`), which `test/evals/readmeCurrency.test.ts:89-147` derives.
  6. Each unit that moves a case writes one dated SET-v7 paragraph in the established form:
     "**N `/st-x` ranges moved, <date> (plan 019 file 2, unit `<id>`).**", with the edit and its line delta, each case
     as `old → new` ("checked by hand" where no block is quoted), what moved, and "dated citations stay" (examples at
     SET-v7 `:514-525`).
  7. `npx vitest run test/evals` is green at the unit's end, except in the p6 case lanes (their cells).
- **Budgets of `st-work.md`.** After every unit that edits it: `"\n### Specialist pass\n"` stays below character
  18,000 (`REATTACH_BUDGET_CHARS`; the Review loop ends before it, `test/corpus/commands/work.test.ts:376-382`), and
  the body stays within 500 lines (`SOT_CAPS.commandBody`, `test/corpus/invariants.test.ts:72`). The unit records both
  numbers in its report. Measure the index with
  `node -e 'const t=require("fs").readFileSync("content/commands/st-work.md","utf8");console.log(t.indexOf("\n### Specialist pass\n"))'`.
  Neither budget is ever raised.
  - **Allocations** (review r1, `plan/34`; order per the schedule, review r2, `plan/58`). p0 freed as many characters
    above the cut as the pins allowed: it landed the index at 16,215 and the body at 475 lines (`record.md:78`). Each
    later unit keeps its net growth within its allocation, measured against the index before it, in the writer order
    of `st-work.md`: p4a 0 characters and 0 lines; p4b +350 and +5; p4c +100 and 0; p8f +200 and +2 (S14); p3c +500
    and +4 (its proof-block line sits below the cut and counts only as a line); p5c 0 characters (its text sits below
    the cut) and +3 lines. At full allocation the index ends near 17,365 and the body near 489 lines.
  - A unit that cannot meet its allocation moves words into the agent file its text points at (the fixer, the
    reviewer, the test-runner), never into a raised budget. p5c, the last writer of `st-work.md`, records the room left
    for Package 22 (18,000 minus the index, and 500 minus the body's lines); a shortfall against S9's room goes on the
    close list (`record.md:76` expects one of about 265 characters).
- **Moved pins.** A moved or rewritten pin carries a dated `TEST CHANGE, justified` note naming what about the
  contract changed (the testing rule's item 5).
- **Generated pages are regenerated, never hand-edited.**
  - `docs/cli-reference.md` and `docs/configuration.md`: `node scripts/generate-docs.mjs`.
  - `docs/capability-matrix.md`: `node scripts/generate-capability-matrix.mjs`.
- **Dogfood copies.** `.claude/**`, `.agents/**`, `.apm/**`, `AGENTS.md` and `.stamity/manifest.json` move in p7 only.
  A unit whose test is red only because a dogfood copy is stale runs `npm run build && node dist/cli.js sync`, commits
  the regenerated copies and names them in its report.
- **CLI form in corpus text.** Every `stamity <verb>` named in a command body runs under that body's CLI-calls rule
  (`st-work.md`'s `- **CLI calls.** ` bullet, pre-p0 `:160-161`). `/st-quick` and `/st-plan` carry no such rule today,
  so p3b and p5d each add the shared paragraph and a row to `CALL_SITES` in `test/corpus/cliCallForm.test.ts`
  (review r1, `plan/32`; review r2, `plan/55`). That test makes two checks per row (`:195-205`): the body contains
  `**Running the CLI.** ` followed by `RUNNING_CLI_SENTENCE` (`:32-33`) byte for byte, and the body contains the row's
  `fallback` string. So each of the two units:
  1. adds one paragraph of two physical lines, preceded by a blank line: the first line is the label
     `**Running the CLI.** ` and the sentence, copied from `cliCallForm.test.ts:33` with no wrap (the check reads the
     raw file, so a line break inside it fails); the second line is the unit's fallback sentence, quoted in its cell;
  2. adds the row `{ relPath, label: RUNNING_CLI_LABEL, fallback }` with that fallback string byte-identical;
  3. may then name verbs in prose in the defined shorthand `stamity <verb>`, as `/st-work` does; never in a fence, a
     `Run` cell or a `Probe` cell (checks (b)–(d)), and the inline `npx --no` form at `st-quick.md:123-124` stays;
  4. counts the paragraph's three lines in the eval range shifts its cell lists.

  The corpus names no repository's script, only the `${STAMITY:VERIFY_GATE_*}` tokens.
- **A CLI that cannot run** (absent, or with no `gate` verb): the flow runs the full gates and lists
  `secret scan: not run` under `Not done:` (`plan/32`). So does a flow with committed work and no nameable base
  (`plan/56`).
- **Unscanned files** (review r3, `plan/62`, declared default). A scan whose JSON lists `unscanned` files (tracked code
  files the read could not show, p5a, p5e) does not count as clean for them: the flow lists
  `secret scan: <n> files unscanned` under `Not done:`, naming the paths. Their class is already at least `product`.
- **A scan hit always stops** (sign-off on `plan/57`). The flows name path, line and rule, never the value, and never
  clear a hit by rewriting the value and scanning again. **Secret-shaped fixtures in this repository** are built at
  runtime from fragments (for example `["ghp", "_", "x".repeat(36)].join("")`), so no added line carries one: p5e's
  own tests, and any unit that adds such a fixture. An eval case file describes a secret-shaped value in words and
  carries none, since the scan reads every added line, Markdown included.

## Lanes and single-writer ownership

One git worktree per lane; no lane runs `git stash` (learning `git-stash-is-shared-across-worktrees`). Inside a lane,
units run in the order shown and one unit writes at a time. A file listed for two lanes is never edited by both: the
table names its owner, and a cross-lane need is a `depends_on`. The one exception is `test/roster/roster.test.ts`
(writer table below).

| Lane | Worktree / branch | Units, in order | Files the lane owns |
|---|---|---|---|
| Integration | `p23f2-integration` / `lean-flows-02` | p0 → p4a → p4b → p4c → p3a → p8a → p8b → p8c → p8d → p8e → p8f → *(lane A merges, step 1)* → p3b → p3c → p5b → p5c → p5d → p5f → *(the p6 lanes branch)* → p6-setup-route → *(lane A merges, step 2)* → p9 → *(the p6 lanes merge)* → p6-index → p6-locator-guard → p7 (the orchestrator's schedule, `record.md:75`) | every content, agent, corpus-test, eval and spec file below; `src/roster/reviewCaps.ts`, `src/roster/modelLadder.ts`, `src/content/charter.ts`; after lane A's step 1, `src/roster/triggers.ts`'s security row (p5b) and one `describe` in `test/change/classify.test.ts` (p5b) |
| A, code | `p23f2-lane-a` / `lean-flows-02-lane-a`, from the integration branch's base | p1a → p1b → p1c → *(the p1a–b review fix from `p23f2-fix-a`, `ceeaa736`, `record.md:88`)* → p1d → p2a → p2b → p2d → p5a → p5g → p5e → p2c. Merges into integration in two steps: step 1 after p5e's review and a lane A full suite (p3b needs the verbs and the map, not p2c); step 2 after p2c's review, before p9. If step 1 would not let p3b start sooner, one merge after p2c | `src/change/**` (new), `src/cli/commands/gate.ts` (new), `src/cli.ts`, `src/cli/commands/check.ts`, `src/cli/engine/gitStatus.ts`, `src/composition/root.ts`, `src/roster/triggers.ts` (header only), `.oxlintrc.json`, `.stamity/change-classes.json` (new), `scripts/ci/records-only.mjs`, `.github/workflows/ci.yml` (two comments), `test/change/**` (new), `test/cli/commands/gate.test.ts` (new), `test/cli/commands/check.test.ts`, `test/ci/testInputsGuard.test.ts` (new), `test/ci/recordsOnly.test.ts`, `test/cli/surface.e2e.test.ts`, `test/architecture/boundaries.test.ts`, `test/roster/roster.test.ts` (`:451-487` only), `docs/cli-reference.md`, `README.md`, `docs/getting-started.md`. p2c (step 2) writes only `scripts/ci/records-only.mjs`, `test/ci/recordsOnly.test.ts` and `.github/workflows/ci.yml`, none of which integration writes |
| p6 case lanes | `p23f2-p6a` … `p23f2-p6g`, each branched from integration after p5f (review r2, `plan/58`, `plan/60`) | one unit each: p6a, p6b, p6c, p6d, p6e, p6f, p6g | new case files only |

**Shared-file writer order** (Phase 2 note 9 and the orchestrator's schedule; integration only, one writer at a time,
unless a row says otherwise):

| File | Writers, in order |
|---|---|
| `content/commands/st-work.md` | p0 → p4a → p4b → p4c → p8f → p3c → p5c (p5c is the last writer and records the Package 22 room) |
| `test/corpus/commands/work.test.ts` | p0 → p4a (the capacity-rung pin only) → p4b → p4c → p8f → p3c → p5c |
| `evals/SET-v7.md` | p0 → p4b → p4c → p3a → p8b → p8c → p8d → p8e → p8f → p3b → p3c → p5b → p5c → p5d → p5f → p6-setup-route → p6-index → p6-locator-guard |
| `content/agents/stamity-fixer.md` | p4a → p4b → p8a → p8e |
| `content/agents/stamity-reviewer.md` | p4c → p8a → p8b |
| `content/agents/stamity-security.md` | p8a → p8c → p5b |
| `test/corpus/invariants.test.ts` | p4a → p4b |
| `test/corpus/agents/severityScale.test.ts` (new) | p8a → p8b → p8c → p8d → p8e |
| `test/corpus/agents/verdictReturns.test.ts` | p8b → p8c → p8d → p5b (each only where a pin quotes its changed sentence) |
| `test/corpus/agents/specialists.test.ts` | p8c → p8d → p5b (each only where a pin quotes its changed sentence; p5b's Trigger parity always) |
| `test/corpus/cliCallForm.test.ts` | p3b → p5d |
| `test/evals/successorInputs.test.ts` | p4c → p3a → p8b (p4c and p3a only if an Expected block moves) |
| an eval case file two units name | the integration order; for example `digest-security-finding-carried-in-full`: p0 → p4b → p8b → p8f; `work-proof-block-fields`: p0 → p4b → p4c → p8f → p3c → p5c; `agent-security-return-contract` and `security-agent-no-write-under-pressure`: p8c → p5b |
| `evals/README.md` | any unit in SET-v7's order whose edit breaks a cases-v5 byte-identity (common rule 5) |
| the two golden snapshots | every content unit, in the integration order |
| `src/change/classify.ts`, `src/cli/commands/gate.ts`, `test/change/classify.test.ts`, `test/cli/commands/gate.test.ts`, `test/architecture/boundaries.test.ts` | lane A only: p1a → p1c → the p1a–b review fix (`classify.ts` and its test, `ceeaa736`) → p1d → p2a → p2b → p5a → p5g → p5e (each in its cell); then `test/change/classify.test.ts` by p5b on integration, after lane A's step 1 |
| `src/composition/root.ts` | lane A: p1a → p2b → p5e |
| `.stamity/change-classes.json` | lane A: p2a (`classes`) → p2d (`testInputs`) |
| `src/roster/triggers.ts` | p1d (lane A, header) → p5b (integration, security row, after lane A's step 1) |
| `test/roster/roster.test.ts` | two lanes in disjoint hunks: p1d (lane A, `:451-487`) and p4a (integration, `:74`), joined by git's three-way merge at lane A's step 1; then p5b (integration, only where it pins the security row) |

**The one SET-v7 writer of p6.**
- The case lanes never edit SET-v7, `evals/README.md` or `test/evals/successorInputs.test.ts`.
- p6-setup-route writes its own SET-v7 lines on the integration branch, in the slot after p5f (Phase 2 note 3; review
  r2, `plan/58`, `plan/60`).
- p6-index is the one writer of the twenty-one new index rows, the derived appendix rows and the roster counts. It may
  also fix a new case file whose per-case check fails after the merge (`plan/14`).
- p6-locator-guard runs after p6-index on the integration branch and owns every re-anchor its check finds, with the
  case's SET-v7 source cell (`plan/14`).
- Between the first case-lane merge and p6-index, two `test/evals/roster.test.ts` checks fail on the integration
  branch: "one row per case file" (`:79-90`) and the non-negotiable appendix (`:142-160`), once a floor or adversarial
  case lands without its rows. `readmeCurrency.test.ts` fails too. That window is declared: no other unit writes there
  until p6-index lands (`plan/45`).

## Units

Integration, part 1: make room, then the review rounds.

### p0-make-room: room in `st-work.md` above the re-attach cut

| Field | Content |
|---|---|
| `id` | p0-make-room |
| `requirements` | REQ-FLOW-063, REQ-FLOW-064 (it makes room for their text) |
| `files` | `content/commands/st-work.md`. `test/corpus/commands/work.test.ts`: moved pins, each with a dated TEST CHANGE note. B's pins at `:771-796` read `section(body, "### Intensity")`. C's Row-states pins at `:915-953` assert the states on `content/skills/st-qa/SKILL.md`, which holds them at `:59`, `:99-108` and `:117`; the order check keeps C's pointer sentence between "The checkpoint covers what automation cannot." and `**The close asks once.**`. Eval cases: `work-persisted-plan-asks-once` (its Row-states block re-quoted from `content/skills/st-qa/SKILL.md` as a second governing block naming that file, so its Expected `accepted-unwalked` row holds); range-only shifts of `security-content-exempt-from-truncation`, `digest-security-finding-carried-in-full`, `work-proof-block-fields`, `benign-optional-step-skipped-proceeds` and `probe-none-work-run-qa-checkpoint` (by hand: it quotes no block). `evals/SET-v7.md` (their index source cells; one dated paragraph). The two goldens |
| `interfaces` | **Measure first, at the integration base:** the Specialist-pass index is 17,733 at `17f2e8bf` and the body is 493 of 500 lines (`record.md:21`). **Targets:** free as many characters above the cut as the pins allow, target 2,100 (index 15,633); lines target 15 (body 478), minimum 10 (body 483); F is not taken (sign-off on `plan/35`). Three moves, in order. **(A)** The Contract census (`:88-104`) keeps its heading between `## Phase 2 — Plan` and `## Phase 3 — Build` and every pinned phrase (`work.test.ts:621-662`): "Exit criterion:", "exactly one unit's row set", `` `clean` ``, `` `reconciled(N)` ``, `` `N unreconciled` ``, "dispatches serially instead", `` `contract-census` ``, "file lists", "Skip condition", "greenfield repo has no prior consumers", "batch of one unit has no peer", "records the skip". It drops the contract-kind list (`:91-92`), the facade-hold sentence (`:93-95`) and "the failure this step exists to catch", pointing at the `contract-census` rule, which carries them (rule item 3). **(B)** The client-events paragraph (`:273-281`) moves to the end of `## Dials` → `### Intensity`, after `:457-464`, with "under this loop" changed to "under the review loop" (D6). Every pinned phrase stays word for word, and the negative pin (no `exit 2`, "counter file", `.json`, `SubagentStop`) still holds. **(C)** "Row states" (`:331-337`) becomes one sentence pointing at the qa skill's row states. **(F)** is not taken: the inbox text (`:394-413`) and its pins (`work.test.ts:956-1077`) stay. Headings and their order stay (`SKELETON`); `REATTACH_BUDGET_CHARS` never rises |
| `testCriteria` | GIVEN the edited file measured as in the common rules THEN the index is as low as the pins allow (target 15,633) and the body is at most 483 lines (target 478), both recorded. GIVEN `npx vitest run test/corpus/commands/work.test.ts test/evals` THEN green, with every moved pin carrying its note. GIVEN `work-persisted-plan-asks-once` THEN its Expected block is byte-unchanged and its second governing block passes the locator check against `content/skills/st-qa/SKILL.md` |
| `edgeCases` | Reaching the target would need a pinned phrase to move other than B's and C's → stop and return `BLOCKED_DEPENDENCY` naming the pin. The context-degradation security exemption (`:136-139`) and the capacity rung (`:144-159`) never move. A test that holds a spec's citation of an `st-work.md` line goes red → p0 updates that citation in place, names it in its report, and p9 skips it. F is not taken, so the inbox text and its ledger mechanics (`ledger close --retired`, the eighth field, the `- inbox retired:` line, the refuse-while-open gate) stay in `st-work.md` |
| `depends_on` | none |
| `verify` | the index command, then `npx vitest run test/corpus/commands/work.test.ts test/corpus/invariants.test.ts test/evals`, then the goldens command |

- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"`p0-make-room` compacts `/st-work`'s inbox-retirement text" at 077e8a78``: F is not taken (sign-off on `plan/35`), so the retire protocol stays in `st-work.md` with its pins.

### p4a-review-cap: the default cap moves from 4 to 3

| Field | Content |
|---|---|
| `id` | p4a-review-cap |
| `requirements` | REQ-FLOW-064 |
| `files` | `src/roster/reviewCaps.ts:19`. `content/commands/st-work.md`: the cap bullet (`:252-253`), the ladder bullet's numbers (`:254-258`), and the capacity rung's "the fixer on rounds 1–3" (`:152`). `content/agents/stamity-fixer.md` Round policy (`:72-88`, numbers and ordinals only). `test/roster/roster.test.ts:74`. `test/corpus/invariants.test.ts`: the fixture at `:1653-1677`, whose expected violations change under a cap of 3; the reason goes inline. `docs/working-with-stamity.md:96`. `docs/configuration.md` (generated). The two goldens. `test/corpus/commands/work.test.ts`: the capacity-rung pin only (`:1227-1229` at `4968e8e6`, now "the fixer on rounds 1–2"), with a dated TEST CHANGE note (amended 2026-10-09). `st-work.md` lines above are pre-p0; at `4968e8e6` the capacity rung is `:141`, the cap bullet `:239-240` and the ladder bullet `:241-245` |
| `interfaces` | `DEFAULT_MAX_REVIEW_ITERATIONS = 3`; `MIN` 1 and `HARD` 10 are unchanged. Text keeps every sentence's shape so invariants 15 and 16 still pass on the old ladder wording: "Iteration cap: 3 rounds by default"; "rounds 1–2 keep the same fixer; round 3 spawns a fresh fixer on a stronger model class"; fixer "**Rounds 1–2: the same fixer.**" ("round two does not re-attempt round one"), "**Round 3: a fresh fixer on a stronger model class,**" ("A third attempt by the same instance"), "**Round 3 is the default cap's last round.**". No body names a round above 3. "converge by round 2–3" (`st-work.md:435` at `4968e8e6`, pre-p0 `:462-463`) and the fixer's `:88` hold unchanged. Line and character counts stay (allocation 0), so no eval range moves. Verify-only, because each derives from the constant: `test/corpus/hookWiring.test.ts:488-503`, `test/hooks/scripts.test.ts:2330-2357`, `test/cli/commands/config.test.ts:994-1052`, `test/manifest/manifest.test.ts`, and `work.test.ts:733-769` |
| `testCriteria` | GIVEN the roster THEN the default is 3 and the band 1..10. GIVEN invariants 15 and 16 THEN they pass with the cap of 3, and the rewritten fixture expects, for each of the two bodies, the missing "rounds 1–2", the missing "round 3", and the past-cap "rounds 4–5" entries its own derivation yields. GIVEN `config set review.maxIterations 4` THEN 4 persists and reads back (`config.test.ts:1031-1043`, derived). GIVEN `docs/configuration.md` THEN it is byte-equal to the generator's output |
| `edgeCases` | A manifest that pins 4 keeps 4 (`readReviewCap`, `manifest.test.ts:1101-1104`). The generated review-gate script prints `const MAX_ROUNDS = 3;` (`scripts.test.ts:2336`); the dogfood copy moves in p7. The review-gate hook still counts per session (plan 016 file 2). `test/roster/roster.test.ts` is also written by lane A's p1d in a disjoint hunk (writer table) |
| `depends_on` | p0-make-room (writer order of `st-work.md`) |
| `verify` | `node scripts/generate-docs.mjs && npx vitest run test/roster test/corpus test/hooks/scripts.test.ts test/manifest test/cli/commands/config.test.ts test/cli/docs test/evals`, then the goldens command |

- amended 2026-10-09: `test/corpus/commands/work.test.ts` joins `files` for the capacity-rung pin only (`:1227-1229`
  at `4968e8e6`), which asserted "the fixer on rounds 1–3" and goes red under the cap of 3; p4a returned
  `BLOCKED_DEPENDENCY` on it, and the orchestrator signed off option 1. The file's writer order becomes
  p0 → p4a → p4b → … (`4968e8e6`, the base p4a builds on).

### p4b-fixer-escalation: escalate on what the run shows, at a higher effort on the same model

| Field | Content |
|---|---|
| `id` | p4b-fixer-escalation |
| `requirements` | REQ-FLOW-064, REQ-LADDER-003 |
| `files` | `content/commands/st-work.md` (pre-p0 lines; at `4968e8e6` the cap bullet is `:239-240`, the ladder bullet `:241-245`, the capacity rung from `:141`): the cap bullet gains "(2 at light)"; the escalation bullet (`:254-258`) is replaced; the capacity rung (`:151-156`) says "the fixer before an escalation" and "the escalation fixer". `content/agents/stamity-fixer.md` Round policy (`:70-90`). `src/roster/modelLadder.ts` header (`:36-56`). `test/roster/modelLadder.test.ts:690-717`. `test/corpus/invariants.test.ts`: invariant 16 (`:1591-1678`) rewritten with an inline reason. `test/corpus/commands/work.test.ts:741-754`. `test/corpus/agents/spine.test.ts:785-829`. Eval case `agent-fixer-return-contract` (range shift of `92-125` if the Round policy's line count moves). Range-only shifts, if the edit moves `st-work.md`'s line count (review r1, `plan/36`): `digest-security-finding-carried-in-full` (`202-215`, moved by a rewrap of the capacity rung), `work-persisted-plan-asks-once`, `work-proof-block-fields`, `benign-optional-step-skipped-proceeds` and `probe-none-work-run-qa-checkpoint` (by hand). `evals/SET-v7.md`. The two goldens |
| `interfaces` | **`st-work.md` escalation bullet** (it replaces `:254-258`): "Escalation: a finding whose ledger row carries two `re-review not-fixed` notes, a gate red after a fix, or a finding still open at the cap round goes to a fresh fixer spawn — never the resumed one — with the round history attached, on the same model at one effort level above the fixer's declared one where the client's dispatch accepts an effort setting; where it accepts none, the fresh spawn is the escalation and the proof block records `effort: not settable`. A finding that fixer leaves open stops the run as BLOCKED_FAILURE to the human with the open findings attached. No round past the cap runs; an operator who raises the cap within the band buys further rounds and adds no new stage." The cap bullet reads "Iteration cap: 3 rounds by default (2 at light), operator-configurable within 1..10", and the light tier's cap is prose only, since the hook cannot see a tier. Two `re-review not-fixed` notes are read off the ledger row's notes, which `src/runs/ledgerStore.ts:711-717` already appends. **Fixer Round policy:** the same three triggers and order. The fixer that keeps the rounds is "the same fixer until an escalation". The escalation fixer is "a fresh fixer spawn, never the resumed one, at one effort level above this role's declared one, on the same model"; it "reaches the `effort` key only where the client's dispatch takes one per spawn; elsewhere the fresh spawn is the escalation and the proof block records `effort: not settable`"; and "a finding the escalation fixer leaves open stops the run as BLOCKED_FAILURE". So the fixer body carries all five of invariant 16's phrases (review r1, `plan/38`). "Convergence is expected by round two or three" stays. **`modelLadder.ts` header:** the first unrecorded placement becomes "the review loop's escalation: a fresh fixer spawn at one effort level above its declared one, on the same model, set per dispatch where the client takes one; no row records it". There are still two placements; the second (the capacity rung) is unchanged, and `"TWO FLOW PLACEMENTS"` stays. **Invariant 16, rewritten:** both bodies name "fresh fixer spawn", "never the resumed one", "one effort level above", "`effort: not settable`" and "BLOCKED_FAILURE"; neither names a round above `DEFAULT_MAX_REVIEW_ITERATIONS`; neither contains the retired phrase "fresh fixer on a stronger model class"; the fixture is rewritten to the new stage list. **Allocation:** at most +350 characters above the cut and +5 lines (common rules) |
| `testCriteria` | GIVEN the fixer body and `st-work.md` THEN invariant 16's new checks pass on both, and its fixture flags a body that carries the retired phrase. GIVEN `work.test.ts` THEN the escalation bullet's triggers, "fresh fixer spawn", "`effort: not settable`", "BLOCKED_FAILURE" and the cap bullet's "(2 at light)" are pinned, and "fresh fixer on a stronger model class" is asserted absent. GIVEN `spine.test.ts` THEN the Round policy's three triggers and its effort placement are pinned in place of `:815-818`'s "what 'stronger' resolves to". GIVEN `modelLadder.test.ts` THEN "TWO FLOW PLACEMENTS" holds and the header names the effort placement. GIVEN the budgets THEN the unit's growth is within its allocation. GIVEN `test/evals` THEN green |
| `edgeCases` | A client with no per-spawn effort control (Copilot carries no effort key, `modelLadder.ts:393`) → the fresh spawn alone, recorded `effort: not settable`. A light run that ends at round 2 with an approval releases the hook normally. A finding fixed at the escalation round still gets its closure re-review (S6). The allocation is unmet → move the extra words into the fixer's Round policy |
| `depends_on` | p4a-review-cap (writer order of `st-work.md` and `work.test.ts`) |
| `verify` | the index command, then `npx vitest run test/roster test/corpus test/evals`, then the goldens command |

- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"`p4-loop-rules`' "fresh fixer at a higher effort" has no mechanism" at 077e8a78``: settled by Phase 2 note 5 in this cell. File 3's `q4` adds only static effort frontmatter (`019-lean-flows-03.md:217-228`) and does not touch this.

### p4c-confidence-no-round: self-rated confidence no longer starts a round

| Field | Content |
|---|---|
| `id` | p4c-confidence-no-round |
| `requirements` | REQ-CTX-018, REQ-FLOW-064 |
| `files` | `content/commands/st-work.md`, the confidence bullet (`:245-251`). `content/agents/stamity-reviewer.md:108-112`, rewritten in the same five lines. `test/corpus/commands/work.test.ts:894-913`. Eval cases `reviewer-brief-is-diff-and-criteria` (its `108-112` block re-quoted) and `agent-reviewer-return-contract` (its `93-189` block re-quoted). Range-only shifts, if the bullet's line count moves (`plan/36`): `work-persisted-plan-asks-once`, `work-proof-block-fields`, `benign-optional-step-skipped-proceeds` and `probe-none-work-run-qa-checkpoint` (by hand). `test/evals/successorInputs.test.ts`, only if an Expected block moves (a dated addition to the existing `agent-reviewer-return-contract` value, `:121-128`). `evals/SET-v7.md`. The two goldens |
| `interfaces` | `st-work.md` bullet, keeping its pinned phrases "the one the run record declares (`Confidence gate: <value>`)" and "still refuses an approval the reviewer rated `low`": an approval below the declared gate counts, and the proof block's review line names it below the gate; no round starts on confidence alone; after an escalation (p4b), the closure re-review of the fresh fixer's change runs once on a stronger class (D4). Reviewer `:110-112`: "An approval below the confidence gate the run record declares counts and is named below it; a re-review after an escalation runs on a stronger class; confidence alone starts no round." The verdict and confidence vocabulary at `:108-110` stays, because `hookWiring.test.ts` pins "verdict is one of `approve`, `request-changes`, `blocked`". **Allocation:** at most +100 characters above the cut and no added line |
| `testCriteria` | GIVEN `work.test.ts` THEN "An approval below it re-reviews once on a stronger class before it counts" is asserted absent, the new sentence is pinned, and the two kept phrases still pass. GIVEN the reviewer body THEN its line count is unchanged, so `re-review-closures-fresh-reviewer`'s ranges (`134-151`, `181-189`) hold. GIVEN the budgets THEN within the allocation. GIVEN `test/evals` THEN green |
| `edgeCases` | The reviewer's line count moves anyway → re-quote `re-review-closures-fresh-reviewer`'s later ranges in this unit. A record with no `Confidence gate:` line → an approval counts, as today. The allocation is unmet → move words into the reviewer body |
| `depends_on` | p4b-fixer-escalation |
| `verify` | the index command, then `npx vitest run test/corpus test/evals`, then the goldens command |

Lane A: the classifier, its git reads, its inputs, and its security half.

### p1a-classifier-verb: the change classifier and the hidden `gate` verb over a path list

| Field | Content |
|---|---|
| `id` | p1a-classifier-verb |
| `requirements` | REQ-FLOW-061 |
| `files` | `src/change/classify.ts` (new). `src/cli/commands/gate.ts` (new; `classify --paths` only). `src/cli.ts`: registration, plus the "thirteen" comments at `:31` and `:46-48` → fourteen, four hidden. `src/composition/root.ts`: `change.classify` wired in `createEngine()`, because `test/composition/root.test.ts:147-171` derives the registry from the tree (review r1, `plan/1`). `.oxlintrc.json`: `**/change/**` added to both deny-lists (`:63-88`, `:112-137`). `test/change/classify.test.ts` (new). `test/cli/commands/gate.test.ts` (new). `test/cli/surface.e2e.test.ts`: `:34-35`, `HIDDEN` at `:61`, the counts at `:72-74`, the "plumbing verbs" title at `:102`, and a `gate`-absent-from-help line. `test/architecture/boundaries.test.ts`: `PLAN_MAP` rows `src/change/classify.ts` wave 2 and `src/cli/commands/gate.ts` wave 14. `docs/cli-reference.md` (generated) |
| `interfaces` | **Module** (pure; no internal import until p1d). `export type ChangeClass = "records" \| "docs" \| "tests" \| "config" \| "product" \| "public-contract" \| "security-sensitive"`. `export const CLASS_ORDER: readonly ChangeClass[]`, strongest first, per S1. `export type Check = "scan" \| "tests-selected" \| "lint" \| "typecheck" \| "gates-all" \| "review-once" \| "review" \| "dependency-audit"`. `export const CLASS_CHECKS: Readonly<Record<ChangeClass, readonly Check[]>>` per D1: records `["scan","tests-selected"]`; docs `["scan","tests-selected","review-once"]`; tests `["scan","tests-selected","lint","typecheck","review"]`; config, product, public-contract and security-sensitive `["scan","gates-all","review"]`. `export const CODE_EXTENSIONS: readonly string[]`, the one list of code extensions every later rule reads (`plan/4`): at least `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.kt`, `.swift`, `.cs`, `.php`, `.sh`, `.bash`, `.ps1`. `export const BUILT_IN_TEST_GLOBS`: `**/*.test.*`, `**/*.spec.*`, `test/**`, `tests/**`, `**/__tests__/**`; a class file extends them with its `tests` globs (p2a). `export interface ClassRule { class: ChangeClass; paths: readonly string[]; rationale: string }`. `export const BUILT_IN_RULES: readonly ClassRule[]`: records `.stamity/runs/**`, `.stamity/inbox.md`, `.stamity/handoffs/**`; docs `docs/**` and top-level `*.md` (plans and specs included) except `AGENTS.md` and `CLAUDE.md` (D10); config `.stamity/change-classes.json`; security-sensitive `.stamity/manifest.json`, `.stamity/overrides/**`. **Floor** (sign-off on `plan/8`): no rule places a code path in `records` or `docs`; a code path under a test glob is `tests`, any other takes its next placement, and an unplaced one is `product`. `export function matchGlob(path, glob): boolean`: `**` spans segments, `*` stays within one, all else literal, over POSIX-normalised paths. `export function classifyChange(input: { paths: readonly string[]; renames?: readonly { from: string; to: string }[]; base: "given" \| "absent" \| "unresolved" }, rules?: readonly ClassRule[]) → { class: ChangeClass; byPath: { path: string; class: ChangeClass; rule: string }[]; checks: Check[]; lenses: string[]; reason: string }`. Each path takes the strongest class any rule gives it; a path no rule places is `product`; the change takes the strongest path class. **At least `product`**, never lowering a stronger class (`plan/11`, `plan/28`): `base` `"unresolved"`; a rename whose two sides classify differently (the strongest of both sides and `product`); an empty path list. With `base` `"absent"` (D5): the rules given (built-ins only until p2a), `byPath` filled, and `reason` saying no base was given. `lenses` holds `stamity-security` when the class is `security-sensitive` (p1d adds the trigger matches). **CLI:** `stamity gate classify --paths <path>… [--json]`, with subcommands as commander `choices`, like `ledger` (`src/cli/commands/ledger.ts:49-53`), through the `runCli` funnel (`src/cli/kit/program.ts:353-363`). `--paths` classifies the listed paths by path rules only, with `base` `"absent"`; p1c adds `--base` and the git reads, p2a the class file (`plan/33`). The JSON document is `{ok: true, command: "gate", subcommand: "classify", base, paths, class, checks, lenses, reason, byPath}`. Exit 0 for any report; exit 2 for an unknown subcommand or option, or no path source |
| `testCriteria` | Red first. GIVEN one path per built-in rule THEN that rule's class; GIVEN a fixture rule set THEN each of the seven classes, and a mixed change takes the strongest. GIVEN `docs/plans/x.md` or `docs/specs/x.md` THEN `docs` with `review-once`. GIVEN `docs/conf.py` or `docs/.vitepress/config.ts` THEN `product`, and `docs/a.test.ts` THEN `tests` (the floor; closes `plan/10`). GIVEN `AGENTS.md` THEN `product`. GIVEN an unplaced path, an empty list, an unresolved base, or a rename from `docs/a.md` to `src/a.ts` THEN `product`, the reason naming which. GIVEN a fixture rule placing `src/a.ts` `security-sensitive` and a rename from `docs/a.md` to it THEN `security-sensitive`, not `product`. GIVEN `base: "absent"` and `docs/x.md` THEN `docs`, the reason saying no base was given. GIVEN `docs\\x.md` THEN it is normalised and classed `docs`. GIVEN `gate classify --paths docs/x.md --json` THEN the JSON document. GIVEN an unknown subcommand THEN exit 2. GIVEN `test/cli/surface.e2e.test.ts` THEN `gate` is hidden and counted (14 registered, 4 hidden). GIVEN `test/architecture` THEN the waves hold, nothing is unreachable, nothing new is registry-only, and the oxlint deny-lists cover `src/change/`. GIVEN `test/composition` THEN the derived registry holds `change.classify`. GIVEN `docs/cli-reference.md` THEN byte-equal to the generator's output |
| `edgeCases` | `.stamity/manifest.json`, config and overrides are security-sensitive, never records. Windows paths are normalised to POSIX before matching. `content/**` is product in this repository by its class file (p2a), not by a built-in rule. `classify.ts`, `gate.ts`, the registration and the registry row land together: a classifier with no caller is unreachable (`boundaries.test.ts:1097-1099`), a registry entry with no caller is a registry-only row the ratchet forbids (`:1101-1117`), and an unwired module fails the derived registry (`root.test.ts:147-171`). That is why this unit keeps 10 files: three carry one-line rows, one a comment and one is a generated page. The git reads (p1c) and the trigger-row read (p1d) are split off to keep it near 400 lines |
| `depends_on` | none (amended in-flow 2026-10-08: lane A shares no file with p0, so the persisted "shared file order" edge falls away) |
| `verify` | `node scripts/generate-docs.mjs && npx vitest run test/change test/cli/commands/gate.test.ts test/cli/surface.e2e.test.ts test/cli/docs test/architecture test/composition && npm run lint && npm run typecheck` |

### p1b-hidden-verb-docs: the hand pages count four hidden verbs

| Field | Content |
|---|---|
| `id` | p1b-hidden-verb-docs |
| `requirements` | REQ-FLOW-061 |
| `files` | `README.md:79-80` ("three plumbing verbs" → four, naming `gate`). `docs/getting-started.md:234-242` ("The three hidden verbs", "All three" → four) |
| `interfaces` | One line each, naming `gate` beside `learn`, `handoff` and `ledger`. The advertised "ten verbs" stay (`test/docsPages.test.ts:1248-1250`) |
| `testCriteria` | GIVEN `npx vitest run test/docsPages.test.ts` THEN green, with its advertised arrays and counts unmoved |
| `edgeCases` | A docs-page pin that counts hidden verbs fails → update it in this unit with a dated note |
| `depends_on` | p1a-classifier-verb |
| `verify` | `npx vitest run test/docsPages.test.ts` |

### p1c-classify-git-reads: `gate classify` reads the change from git, fail-closed

| Field | Content |
|---|---|
| `id` | p1c-classify-git-reads |
| `requirements` | REQ-FLOW-061 |
| `files` | `src/cli/commands/gate.ts`. `src/cli/engine/gitStatus.ts`: the runner construction exported (a security-sensitive path in this repository, D2). `test/cli/commands/gate.test.ts`. `test/cli/engine/gitStatus.test.ts`, only if the export changes a pinned shape |
| `interfaces` | `stamity gate classify [--base <ref>] [--paths <path>…] [--json]`; without `--paths`, the paths come from git. **The runner** (review r1, `plan/2`): every git call goes through file 1's hardened construction in `src/cli/engine/gitStatus.ts:98-124` (`-c safe.bareRepository=explicit`, `-c core.fsmonitor=false`, every `GIT_*` variable dropped, `GIT_OPTIONAL_LOCKS=0`, argv only, stdin ignored, `windowsHide`), exported as `gitCheckRunner({ timeoutMs, maxBuffer })`. The two existing readers keep their 5-second default; `gate` passes 60 seconds and 64 MiB. **The base:** a `--base` that starts with `-` is refused with exit 2 before git runs. Any other ref resolves through `git rev-parse --verify --end-of-options <ref>^{commit}` to a commit id, which every later call uses; a failure is `base: "unresolved"` (class at least `product`, `reason` naming the ref). **The project root** (review r2, `plan/61`; amended for review r3, `plan/63`): the project root is the nearest ancestor of the working directory, up to and including the git top-level (`git rev-parse --show-toplevel`, run from the working directory), that holds a directory named `.stamity`; where none does, the top-level. The walk compares real paths, since git prints the top-level resolved. Every later git call of `gate` runs with the project root as the runner's `cwd`, so a run from any subfolder of the project, `.stamity/runs/<run>/` included, reads the whole project. `git rev-parse --show-prefix` run there gives its prefix (empty at the top-level), exported with `export function toProjectPath(prefix: string, topLevelPath: string): string \| null` (the path with the prefix stripped, or `null` outside the project) for p2a, p5a, p5g and p5e. **The paths:** `git diff --name-status -M -z --no-relative --no-ext-diff --no-color --no-textconv <commit> --` (staged and unstaged against the base, renames as `R` rows; `--no-relative` so a `diff.relative` setting cannot narrow the read), plus `git ls-files --others --exclude-standard --full-name -z` (top-level-relative, like the diff), both parsed NUL-separated, so `core.quotePath` cannot escape a name. Every path goes through `toProjectPath`: a path inside the project is classified by its project-relative form, so every rule (`.stamity/manifest.json`, `docs/**`, the class file's globs) reads the project's own layout; a path outside it is left out, and `reason` counts it ("N changed paths outside the project left out"). A rename with one side outside keeps its inside side as a changed path. With no `--base`, the same reads run against `HEAD` and `base` is `"absent"` (D5). **Fail-closed** (`plan/25`): a cwd outside a git repository, no git binary, a timeout or any other git failure gives class `product` with `reason` naming the failure, never a narrower class. The JSON's `base` is the resolved commit id, or `null` |
| `testCriteria` | Red first. GIVEN a scratch git repository with a staged, an unstaged and an untracked change THEN all three are in `paths`, and a rename is a rename. GIVEN a file name with non-ASCII characters THEN it round-trips byte for byte. GIVEN the scratch repository's config setting `diff.external` to a script that prints nothing, `color.diff=always`, `diff.noprefix=true` and `core.quotePath=true` THEN `paths` are unchanged. GIVEN `--base --output=x` or `--base -x` THEN exit 2 and no file is written. GIVEN an unknown ref THEN `product` naming it. GIVEN a cwd that is not a repository THEN `product` naming it. GIVEN no `--base` and a docs-only change THEN `docs`, the reason saying no base was given. GIVEN a scratch repository whose project sits in `app/`, run from `app/`, with a change to `app/.stamity/manifest.json` THEN `security-sensitive` and `byPath` names `.stamity/manifest.json`; GIVEN a change to `other/x.ts` beside it THEN that path is left out and `reason` counts one path outside the project; GIVEN only outside paths changed THEN the empty list rule gives at least `product`; GIVEN `diff.relative=true` in that repository's config THEN `paths` are unchanged; GIVEN an untracked `app/new.md` THEN it is listed as `new.md`. GIVEN the same repository run from `app/docs/`, with changes to `app/.stamity/manifest.json` and `app/src/x.ts` THEN `security-sensitive`, `byPath` names `.stamity/manifest.json` and `src/x.ts`, and nothing inside `app/` is left out (`plan/63`). GIVEN a top-level project run from `.stamity/runs/x/` with a change to `src/x.ts` THEN `src/x.ts` is classified and no path is left out. GIVEN a subfolder with no `.stamity/` between it and the top-level THEN the top-level is the project root. GIVEN `test/cli/engine/gitStatus.test.ts` THEN green |
| `edgeCases` | A shallow clone whose base commit is missing → `unresolved` → `product`. A diff too large for the bound → a git failure → `product`. A committed folder shaped like a bare repository is refused by the runner, as in file 1. `rev-parse --show-prefix` failing → a git failure → `product`. `rev-parse --show-toplevel` failing → a git failure → `product`. A `.stamity` entry that is a file, not a directory, does not mark a root. A nested project inside a project (`app/.stamity/` under a top-level `.stamity/`) → the nearest one wins, and the outer project's paths are outside it |
| `depends_on` | p1b-hidden-verb-docs (lane A order) |
| `verify` | `npx vitest run test/cli/commands/gate.test.ts test/cli/engine/gitStatus.test.ts test/architecture && npm run lint && npm run typecheck` |

- amended 2026-10-09: the project root moved from "the directory `gate` runs in" to the nearest ancestor of the
  working directory, up to the git top-level, that holds `.stamity/` (else the top-level), with every git read run
  from there (review r3, `plan/63`, declared default, `record.md:89`). Sent to p1c mid-build, inside its own files;
  it lands in p1c's commit (not landed at this amendment).

### p1d-classify-security-row: the classifier reads the trigger roster's security row

| Field | Content |
|---|---|
| `id` | p1d-classify-security-row |
| `requirements` | REQ-FLOW-061, REQ-FLOW-065 |
| `files` | `src/change/classify.ts` (its one internal import, `src/roster/triggers.ts`). `src/roster/triggers.ts`: header only (`:11-34`), naming `src/change/classify.ts` as its one `src/` reader. `test/roster/roster.test.ts:451-487`: the classifier becomes the one `src/` importer. `test/architecture/boundaries.test.ts`: the `triggers.ts` row deleted from `REGISTRY_ONLY_MODULES` (`:897`), the direction the ratchet allows. `test/change/classify.test.ts` |
| `interfaces` | A path that a row of `SPECIALIST_TRIGGER_TABLE`'s `stamity-security` row matches (`specialistsForPath`, `triggers.ts:239-253`) is `security-sensitive`. `lenses` = the union of `specialistsForPath` over the paths, plus `stamity-security` when the class is `security-sensitive`. `triggers.ts` is wave 1 and `classify.ts` wave 2, so the layering holds (`boundaries.test.ts:271-272`). **The base this unit builds on** (`record.md:88`): the p1a–b review fix has landed on lane A (`ceeaa736`), so the built-in security and instruction-file rules already match without case (`ClassRule.foldCase`; the weaker rules stay case-sensitive), a path is read both with backslashes as separators and as literal characters with the stronger reading kept (`review/5`, `review/9`), an agent instruction file at any depth is at least `product` (D10 as widened), and an extensionless file is never `docs` or `records` except the six named base names (S3). The trigger row joins those rules under the same case-folding, as `specialistsForPath` already folds case (`triggers.ts:201-204`) |
| `testCriteria` | Red first. GIVEN `src/auth/login.ts` or `SRC/Auth/Login.ts` THEN `security-sensitive` and `lenses` naming `stamity-security`. GIVEN `docs/auth/AGENTS.md` THEN `security-sensitive` (the trigger row is stronger than D10's floor). GIVEN a path a design-quality row matches THEN that lens in `lenses` and the class unchanged. GIVEN `test/roster` THEN the classifier is the one `src/` importer. GIVEN `test/architecture` THEN `triggers.ts` is no longer registry-only and nothing new is |
| `edgeCases` | The S7 path rows land in `triggers.ts` in p5b; this unit reads the row as it stands. `roster.test.ts` is written in a disjoint hunk by p4a on integration (writer table) |
| `depends_on` | p1c-classify-git-reads |
| `verify` | `npx vitest run test/change test/roster test/architecture && npm run lint && npm run typecheck` |

### p2a-class-file: the repository's class file, read from the base

| Field | Content |
|---|---|
| `id` | p2a-class-file |
| `requirements` | REQ-FLOW-061, REQ-FLOW-062 |
| `files` | `src/change/classify.ts`. `src/cli/commands/gate.ts`. `src/cli/commands/check.ts`: a doctor row only when the file exists. `.stamity/change-classes.json` (new; the `classes` part). `test/change/classify.test.ts`. `test/cli/commands/gate.test.ts`. `test/cli/commands/check.test.ts` |
| `interfaces` | **File:** `{ "classes": { "<ChangeClass>": ["<glob>", …] }, "testInputs": [{ "glob": "<glob>", "tests": ["<test file>", …] \| "all" }] }`, both keys optional; `"all"` selects every test, so the shipped code names no repository path (`plan/16`). **Validator:** `export function parseClassFile(text: string) → { ok: true; rules: ClassRule[]; testGlobs: string[]; testInputs: { glob: string; tests: string[] \| "all" }[] } \| { ok: false; errors: string[] }`. It refuses invalid JSON, an unknown class key, a non-string or empty glob, a glob that matches every path (one made only of `*` and `**` segments with at least one `**`) for a class weaker than `product` (sign-off on `plan/8`), and a test entry that is not a plain repository-relative file path: a leading `-`, whitespace, a glob character (`*?[]{}`), an absolute path or a `..` segment (`plan/23`). `testGlobs` are the `tests` class's globs, which extend `BUILT_IN_TEST_GLOBS`. **Case** (`review/12`, declared default): the validator sets `foldCase: true` (the optional `ClassRule` field exported from `src/change/classify.ts` at lane A's `ceeaa736`) on every rule of the `product`, `public-contract` and `security-sensitive` classes, which raise a path, and on no rule of any other class, `records` and `docs` included; so a repository's own security rules fold case as the built-ins do, and a case variant never lowers a path. **Merge:** `export function mergeRules(builtIn, extension) → ClassRule[]`. An extension glob joins its class. A path a built-in rule places can only end in an equal or stronger class: a weaker extension class for it is ignored, and the reason names the ignored glob (S3's floor). The code-path floor of p1a binds extension rules too, and so do S3's two floors as the p1a–b review fix landed them (an agent instruction file at least `product`; an extensionless file never `docs` or `records` but for the six named base names; `record.md:88`). **Base read in `gate.ts`:** `git show <commit>:<prefix>.stamity/change-classes.json` through p1c's runner, from p1c's project root, at the resolved base commit, `<prefix>` being p1c's project prefix (empty at the top-level; review r2, `plan/61`; the root found by `.stamity/`, review r3, `plan/63`) (absent → built-ins only). A head copy is never read, so a change cannot lower its own checks. A diff touching the file is at least `config`. An invalid base copy (malformed, or refused by the validator) → no map is read from it, the class is at least `product`, and `reason` names the file and its first error (`plan/25`). `--paths` with `--base` reads the base copy the same way. **This repository's file** (D2): product `content/**`; docs `website/**`; tests `test/**`, `evals/**`; config `tsconfig*.json`, `vitest.config.ts`, `.oxlintrc.json`, `eslint.config.*`, `knip.*`; security-sensitive `src/merge/**`, `src/manifest/**`, `src/runs/ledgerStore.ts`, `src/cli/engine/gitStatus.ts` (S7 (d)), and the classifier and gate code `src/change/**`, `src/cli/commands/gate.ts`, `src/roster/triggers.ts`, `scripts/ci/**` (sign-off on `review/8`, `record.md:88`). **Header:** `classify.ts`'s module header narrows its claim to the data: the class file is read from the base, so a change cannot lower its own checks through that file; the code that applies the rules is placed `security-sensitive` by this repository's class file (`review/8`'s fix shape). **`check`:** with the file present, one doctor row `change classes` passes on `ok`, or fails naming the first error; with it absent there is no row (`check.test.ts:4542` pins 15 rows) |
| `testCriteria` | Red first. GIVEN a class file at the base placing `website/**` in docs THEN `website/x.md` is `docs` and `website/src/x.tsx` is `product` (the floor). GIVEN a class file trying to move `src/auth/x.ts` (security by the trigger row) to `docs`, or `docs/x.md` to `records` THEN the class does not narrow and the reason names the glob. GIVEN `{"classes": {"records": ["**"]}}` at the base THEN `check` fails naming the glob, and `classify` reads no map and says at least `product`. GIVEN a test entry `-x`, `test/*.ts` or `a b.ts` THEN refused; GIVEN `"tests": "all"` THEN accepted. GIVEN the file changed in the same diff THEN the base copy's rules apply and the change is at least `config`. GIVEN a head copy that narrows and a base with no file THEN built-ins only. GIVEN `check` with a malformed file THEN its row fails naming the error; GIVEN no file THEN 15 rows. GIVEN a project in `app/` whose base holds `app/.stamity/change-classes.json` placing `lib/**` in `security-sensitive`, run from `app/` or from `app/lib/` THEN `app/lib/x.ts` classifies `security-sensitive` (`plan/63`). GIVEN this repository's committed class file, parsed and merged THEN `src/change/classify.ts`, `src/cli/commands/gate.ts`, `src/roster/triggers.ts` and `scripts/ci/records-only.mjs` each classify `security-sensitive` with the lens (`review/8`). GIVEN a class file placing `**/AGENTS.md` or `notes/**` in `docs` THEN `notes/AGENTS.md` and `notes/Makefile` still classify at least `product`. GIVEN a class file placing `lib/**` in `security-sensitive` THEN `LIB/x.ts` is `security-sensitive` (folded); GIVEN one placing `notes/**` in `docs` THEN `NOTES/x.md` is not placed by it (`review/12`) |
| `edgeCases` | A dotfile counts as extensionless since `ceeaa736` (`review/11`; `posix.extname(".gitkeep")` is empty), so a `.gitkeep`-style file under a records path reads `product`. This repository's CI already keeps the keep file outside every lane (`scripts/ci/records-only.mjs:113`, `:122-126`), so no records lane needs it placed; and the S3 floor binds extension rules, so a class-file glob could not place it in `records` or `docs` anyway. A base with no class file (the PR that introduces it) → built-ins only. A glob that matches nothing → kept, no error. A class file listing a path under two classes → the stronger wins |
| `depends_on` | p1d-classify-security-row (lane A order) |
| `verify` | `npx vitest run test/change test/cli/commands/gate.test.ts test/cli/commands/check.test.ts test/architecture` |

### p2b-test-inputs: declared reads and the selection

| Field | Content |
|---|---|
| `id` | p2b-test-inputs |
| `requirements` | REQ-FLOW-062 |
| `files` | `src/change/testInputs.ts` (new; wave 3, importing `classify.ts`). `src/composition/root.ts`: `change.testInputs` wired (`plan/1`). `test/change/testInputs.test.ts` (new). `test/architecture/boundaries.test.ts` (`PLAN_MAP` row `src/change/testInputs.ts` wave 3). `src/cli/commands/gate.ts` (`classify` adds `tests`). `test/cli/commands/gate.test.ts` |
| `interfaces` | **Reads** (`plan/4`): `export function extractReadPaths(testSource: string, tracked: ReadonlySet<string>) → string[]`. A read path is a string literal in a test source that names a tracked non-code file (by `CODE_EXTENSIONS`), or a glob literal (`**/*.md`), which names every tracked file it matches. A scratch-repository literal that names no tracked file (`"content/x.md"` in a fixture) is not a read. **Selection:** `export function selectTests(input: { paths: readonly string[]; class: ChangeClass; map?: readonly { glob: string; tests: readonly string[] \| "all" }[]; testSources?: readonly { test: string; reads: readonly string[] }[]; testGlobs: readonly string[] }) → { full: boolean; files: string[]; reason: string }`. In order: (1) a changed path under a test glob that is not itself a test file (a helper, a fixture) → `full` (`plan/41`); (2) no map → `full` (S4); (3) with a map, the union of every entry whose glob matches a changed path (an entry with `"all"` → `full`), every test whose source names a changed path (S4's test-source rule, which only adds; `plan/3`), and the changed test files themselves (`plan/24`); (4) for a `records` or `docs` class, zero selected stays zero; for any other class, zero selected → `full`. `gate classify` adds `tests: {full, files, reason}`, from the base map (p2a) and the tracked test sources in the working tree (files under the test globs with a code extension) |
| `testCriteria` | Red first. GIVEN a docs page change THEN the tests reading it are selected, not zero. GIVEN a test whose source names a changed docs page that no entry lists THEN that test is selected. GIVEN a docs file no test names THEN zero selected, `full` false. GIVEN `src/x.ts` with zero selected THEN `full`. GIVEN no map THEN `full`. GIVEN a changed `test/support.ts` THEN `full`. GIVEN an entry with `"tests": "all"` matching the change THEN `full`. GIVEN a changed `test/a.test.ts` THEN it is selected. GIVEN a test literal `"content/x.md"` that no tracked file has THEN it is not a read. GIVEN `test/architecture` and `test/composition` THEN green |
| `edgeCases` | A test reads a path through a computed string → neither the selection nor p2d's guard can see it. The weekly full CI run and "unclear means product" back it up (Risks) |
| `depends_on` | p2a-class-file |
| `verify` | `npx vitest run test/change test/cli/commands/gate.test.ts test/architecture test/composition` |

- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"`p2-test-inputs` adds `src/change/testInputs.ts` and `q1-inbox-scoped`" at 077e8a78``: the `PLAN_MAP` row and `test/architecture` are in this cell; `q1-inbox-scoped`'s half is file 3's.

### p2d-test-input-census: this repository's map and the guard over every read

| Field | Content |
|---|---|
| `id` | p2d-test-input-census |
| `requirements` | REQ-FLOW-062 |
| `files` | `.stamity/change-classes.json` (the `testInputs` part). `test/ci/testInputsGuard.test.ts` (new) |
| `interfaces` | **Census:** built by running p2b's `extractReadPaths` over every tracked test file and grouping the read paths into glob entries, then giving every lane path of `LANE_SUITES` (`scripts/ci/records-only.mjs:82-104`) that lane's suites, so p2c's lanes keep theirs. It also holds `{ "glob": "content/**", "tests": "all" }`, because CLI-spawning tests read the corpus outside the import graph. An entry may over-select, never under-select. **Guard** (`plan/3`, `plan/54`): `test/ci/testInputsGuard.test.ts` walks every tracked test file and extracts its read paths. For each (test, path) pair it fails, naming both, when the path classifies `records` or `docs`, or some map entry's glob matches it, and no entry whose glob matches the path lists that test. Paths under the test globs need no entry: a change to them selects the full suite (p2b) |
| `testCriteria` | GIVEN a synthetic test reading an undeclared `docs/new.md` THEN the guard fails naming both. GIVEN a synthetic test reading a docs page whose entry does not list it THEN it fails naming the pair. GIVEN a scratch literal naming an untracked path THEN no failure. GIVEN the real tree THEN green. GIVEN the census THEN every `LANE_SUITES` suite sits under its lane's paths |
| `edgeCases` | A computed path string → unseen (p2b). A new test that reads a docs page → the guard names the pair to add |
| `depends_on` | p2b-test-inputs |
| `verify` | `npx vitest run test/ci/testInputsGuard.test.ts test/change` |

### p5a-security-classifier: the security line rules over one hardened change read

| Field | Content |
|---|---|
| `id` | p5a-security-classifier |
| `requirements` | REQ-FLOW-065 |
| `files` | `src/change/classify.ts` (the line rules). `src/cli/commands/gate.ts` (the change read, for `classify`; p5e reuses it). `test/change/classify.test.ts`. `test/cli/commands/gate.test.ts`. The audit-first rule moved to p5g (amended 2026-10-09, review r2, `plan/59`, to keep this unit under the ceiling) |
| `interfaces` | **Line rules** (S7 (c), D3; sign-off on `plan/29`): read over the lines of each changed file whose extension is in `CODE_EXTENSIONS` and that sits outside the test globs. `export const SECURITY_LINE_RULES: readonly { id: string; pattern: RegExp; rationale: string }[]` spells four families of call shapes, each word-bounded and with its opening parenthesis; S7's fifth risk, state read back as authority, is placed by path (S7 (d)). `process-spawn`: an import of `child_process`, `execFile(`, `execFileSync(`, `execSync(`, `spawn(`, `spawnSync(`, and `exec(` only as a bare imported name or on a `child_process` receiver (never `.exec(` on a RegExp or any other receiver); `subprocess.run(`, `subprocess.call(`, `Popen(`, `os.system(`. `delete-or-overwrite`: `rmSync(`, `rm(` (word-bounded, so `transform(` and `perform(` never match), `unlink(`, `unlinkSync(`, `rmdir(`, `rmdirSync(`, `writeFile(`, `writeFileSync(`, `rename(`, `renameSync(`, `truncate(`, `shutil.rmtree(`, `os.remove(`, and `rm -rf` inside a string. `network-or-registry`: `fetch(`, `http.request(`, `https.request(`, an `axios` call, and `curl `, `wget ` or `npm publish` inside a string. `secret-name`: a name containing `token`, `secret`, `password`, `credential` or `apikey` (case-insensitive) only where it is assigned a string literal or an environment value (`process.env.…`, `os.environ[…]`); a bare constant such as `*_TOKEN` in an expression never matches. Added and removed lines count; context lines count only in a hunk that also removes a line. A hit makes the change `security-sensitive`, so removing a guard around an existing dangerous call still classifies. `reason` and `byPath.rule` name the rule id and `path:line`, never the line's text (`plan/17`). `classifyChange` gains `hunks?: readonly { path: string; added: readonly { line: number; text: string }[]; removed: readonly string[]; context: readonly string[] }[]`, one entry per diff hunk, so "a hunk that also removes a line" is read per hunk, and `unscanned?: readonly string[]`, which makes the class at least `product` when it is not empty (`plan/62`). **The change read** (review r2, `plan/59`): `export function readChange(runner, commit: string \| "HEAD", prefix: string) → { hunks: Hunk[]; skipped: number; outside: number; unscanned: string[] }` in `gate.ts`, run from p1c's project root (review r3, `plan/63`). (a) Tracked lines: `git -c core.quotePath=false diff -U3 -M --text --no-relative --no-ext-diff --no-color --no-textconv --src-prefix=a/ --dst-prefix=b/ <commit> --` through p1c's runner and base resolution: staged and unstaged against the base (no base → `HEAD`), the explicit `-U3` overriding any `diff.context`, the pinned flags overriding `diff.external`, `color.diff`, `diff.noprefix` and `diff.relative`. **`--text`** (review r3, `plan/62`, declared default) overrides a `-diff` or `binary` attribute from the worktree's `.gitattributes`, `.git/info/attributes` or `core.attributesFile`, and a `diff.<driver>.binary` setting, so no attribute, whether the change adds it or the repository already has it, turns a code file's diff into "Binary files differ". **Names from `-z`:** each file section of the patch takes its path from the matching entry of p1c's `--name-status -M -z` list (the new side of an `R` row), which runs with the same commit, `-M`, `--no-relative` and pathspec, so git emits both in one order; a patch header is never parsed for a name, so a path git C-quotes (one holding `"`, `\` or a control character) is read by its real name. A section count that differs from the list's (a type change is the known candidate), or an unquoted header whose `b/` path differs from the entry, is a read failure → `product`. Added line numbers come from each hunk header's new-side start. **Binary:** the plan's NUL sniff alone decides it, over the first 8,000 bytes of the file's head side (the working-tree file, `lstat` first; for a deleted file, its removed lines). A binary file's lines are not read; a binary file with a code extension (`CODE_EXTENSIONS`) is a file the read cannot show, listed in `unscanned` (project-relative), which makes the class at least `product` with `reason` counting it; any other binary file counts in `skipped`. (b) Untracked files (p1c's `ls-files` list): each read whole as one hunk of added lines numbered from 1. `lstat` first, regular files only, at most 1 MiB each; a FIFO, socket, device or symlink, an oversized file, and a binary file (a NUL byte in the first 8,000 bytes) are skipped and counted in `skipped` (`plan/19`). (c) Every path goes through p1c's `toProjectPath`; a hunk outside the project is dropped and counted in `outside` (`plan/61`). Any git failure → class `product` with `reason` naming it, never a narrower class (fail-closed, as p1c). **Measurement:** the unit runs the line rules over this repository's last 50 first-parent commits and reports each rule's hit count and the resulting class distribution |
| `testCriteria` | Red first. GIVEN an added `fs.rmSync(dir, {recursive: true})` in `src/x.ts` THEN `security-sensitive`. GIVEN a hunk that only removes the `if` guarding an existing `rmSync` THEN `security-sensitive` (a context line in a hunk that removes a line). GIVEN an unrelated added line beside an existing `rmSync`, with no line removed THEN not security by line. GIVEN the same words in a `docs/x.md` line, a `.snap` file, a JSON file or `test/x.test.ts` THEN not security by line. GIVEN the false-positive fixtures `re.exec(s)`, `transform(x)` and `use(API_TOKEN_NAME)` THEN no hit; GIVEN `const token = "abc"` or `apiKey = process.env.KEY` THEN `secret-name`. GIVEN `src/auth/login.ts` THEN `security-sensitive` with the lens. GIVEN any hit THEN `reason` and `byPath` carry no text of the matched line. Through `gate classify` in a scratch repository: GIVEN a new, unstaged, untracked `src/cleanup.ts` holding `rmSync(` THEN `security-sensitive` (`plan/59` (a)); GIVEN a staged and an unstaged `rmSync(` in two tracked files THEN both hit; GIVEN the repository's config setting `diff.external` to a script that prints nothing THEN the added `rmSync(` still hits; GIVEN `diff.context=0` and a change that only removes the guard around an existing `rmSync` THEN the context line is still read and the change is `security-sensitive`; GIVEN a FIFO or a 2 MiB untracked file THEN skipped and counted, with no hang. GIVEN a worktree `.gitattributes` holding `*.ts -diff`, added in the same change or already committed, and an added `rmSync(` in tracked `src/x.ts` THEN still `security-sensitive`; GIVEN `*.ts diff=x` with `diff.x.binary=true` in the repository config THEN the same (`plan/62`). GIVEN a tracked `src/x.ts` whose head side holds a NUL byte in its first 8,000 bytes THEN its lines are not read, `unscanned` lists `src/x.ts`, and the class is at least `product` with `reason` counting one unscanned file; GIVEN the same for a `.png` THEN `skipped`, not `unscanned`. GIVEN a tracked file named `a"b.ts` under `app/`, run from `app/`, with an added `rmSync(` THEN the hunk keeps the name `a"b.ts` and hits (POSIX only: Windows refuses `"` in a name). GIVEN a run from `app/docs/` THEN the hunks of `app/src/x.ts` are read (`plan/63`) |
| `edgeCases` | A rule whose measured hits are mostly not the shape it names → `BLOCKED_AMBIGUITY` naming the rule and the two readings, never a silent pattern edit. A hit in a generated file that has a code extension → it counts (the stronger side). A path in the S7 path rows is not placed by this unit: those rows land in `triggers.ts` in p5b. A hunk header the parser cannot read → a read failure → `product`. A section of a `--text` patch carries the raw bytes of a binary file, NULs included → the parser reads the section's bytes as data and only the sniff decides what is read. An untracked file skipped by size or by the sniff keeps the `skipped` count only; `plan/62`'s default names tracked code files (on the close list with it). Size: the read grows by `--text`, the sniff and the name matching; the unit stays near 400 lines by keeping the matching to one ordered walk |
| `depends_on` | p2d-test-input-census (lane A order, sharing `classify.ts`, `gate.ts` and their tests) |
| `verify` | `npx vitest run test/change test/cli/commands/gate.test.ts && npm run lint && npm run typecheck` |

### p5g-audit-first: a proven lockfile-only bump runs the dependency audit first

| Field | Content |
|---|---|
| `id` | p5g-audit-first |
| `requirements` | REQ-FLOW-065 |
| `files` | `src/change/classify.ts` (the audit-first rule). `src/cli/commands/gate.ts` (both lockfile copies, for `classify`). `test/change/classify.test.ts`. `test/cli/commands/gate.test.ts` |
| `interfaces` | Split off p5a on 2026-10-09 (review r2, `plan/59`), unchanged in substance. **Audit first** (S7 (a); `plan/12`, `plan/52`): it holds only where both the base and the head lockfile prove it. That means npm `package-lock.json` at `lockfileVersion` 2 or 3, both copies parsed, the changed `packages` entries diffed by key; the format records `hasInstallScript` on an entry that has one. The conditions: every security-placed path is such a lockfile; `package.json` is unchanged; and no changed entry carries `hasInstallScript: true` at head, whether it is added there or was already present at base. Then `checks` gains `dependency-audit`, `lenses` omits `stamity-security`, and `reason` reads `lockfile-only bump: dependency audit first`. Every other format (pnpm, yarn, npm version 1), a missing base copy, or a parse failure keeps the lens (`plan/52`). `classifyChange` gains `lockfiles?: readonly { path: string; base: string \| null; head: string }[]`; `gate.ts` reads the base copy with `git show <commit>:<prefix><path>` through p1c's runner (`plan/61`) and the head copy from the working tree, both from p1c's project root (`plan/63`). With no `--base`, no base copy exists, so the lens is kept |
| `testCriteria` | Red first. GIVEN a lockfile-version-3 bump with no install script at either side THEN `dependency-audit`, no lens; GIVEN its twin whose bumped entry has `hasInstallScript: true`, at head only or at both sides THEN the lens; GIVEN a pnpm lockfile bump, or a lockfile-version-1 bump THEN the lens; GIVEN the bump plus a `package.json` change THEN the lens; GIVEN a base copy that does not parse THEN the lens. GIVEN a project in `app/`, run from `app/` or from `app/sub/`, with `app/package-lock.json` bumped THEN the base copy is read under the prefix and the audit-first rule applies |
| `edgeCases` | A lockfile change that also hits a line rule (a code file beside it) → the lens, since every security-placed path must be a proven lockfile. A lockfile too large for the runner's bound → a git failure → the lens |
| `depends_on` | p5a-security-classifier (lane A order, sharing `classify.ts`, `gate.ts` and their tests) |
| `verify` | `npx vitest run test/change test/cli/commands/gate.test.ts && npm run lint && npm run typecheck` |

- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"REQ-FLOW-065 skips the security lens for a lockfile-only bump of a package that already has an install hook" at 077e8a78``: met by the audit-first rule's install-script clause (this cell, split off p5a).

### p5e-secret-scan: `gate scan` over the added lines and the untracked files

| Field | Content |
|---|---|
| `id` | p5e-secret-scan |
| `requirements` | REQ-FLOW-066 |
| `files` | `src/change/scan.ts` (new; wave 2, importing `src/mcp/secretScan.ts`, wave 1). `src/composition/root.ts`: `change.scan` wired (`plan/1`). `src/cli/commands/gate.ts` (`scan`). `test/change/scan.test.ts` (new). `test/cli/commands/gate.test.ts`. `test/architecture/boundaries.test.ts` (`PLAN_MAP` row `src/change/scan.ts` wave 2) |
| `interfaces` | `export function scanAddedLines(files: readonly { path: string; added: readonly { line: number; text: string }[] }[]) → { path: string; line: number; rule: string }[]`. For each added line it first extracts a name and value pair: an assignment, a key and value, or a flag and its argument, with the value's string-literal content. It calls `scanValueForSecrets(name, value)` (`src/mcp/secretScan.ts:168`), so the credential-name context (`:128-138`) applies and the anchored patterns (`:83`, `:103`) meet the bare value. A line with no pair goes in as `scanValueForSecrets("", line)` (review r1, `plan/30`, `plan/18`). It reports `patternId` as `rule`; the value is never echoed, masked or not. **CLI:** `stamity gate scan [--base <ref>] [--json]`. It scans the added lines of p5a's `readChange` (amended 2026-10-09: one hardened read, review r2, `plan/59`), through p1c's runner and base resolution: the tracked diff, staged and unstaged, and every untracked, unignored file whole, with p5a's `lstat`, regular-file, 1 MiB and binary rules, the skips counted in `skipped` (`plan/19`). It inherits that read's `--text`, its NUL sniff and its names from the `-z` lists (review r3, `plan/62`, declared default): an attribute that marks a code file binary hides no added line, and a tracked code file the read cannot show is listed in `unscanned`, never read as clean. The flows put `secret scan: <n> files unscanned` under `Not done:` for a non-empty list (common rules). **No base** (review r2, `plan/56`): with no `--base`, the scan reads the uncommitted change against `HEAD`, and the JSON says so: `base: null` and `scope: "uncommitted"`; with a base, `scope: "since-base"`. A flow never reads a `scope: "uncommitted"` result as a scan of committed work. **Project root** (`plan/61`, `plan/63`): the scan runs from p1c's project root, the nearest ancestor holding `.stamity/`, so a run from a subfolder (`.stamity/runs/<run>/` included) still scans the whole project; hit paths are project-relative; lines outside the project are left out and counted in `outside`. JSON: `{ok, command: "gate", subcommand: "scan", base, scope, hits, scanned, skipped, outside, unscanned}`, `unscanned` the project-relative paths (never content). Exit 1 on any hit, 0 with no hit (whatever `unscanned` holds; the flows read it), 2 on a bad argument. Any git failure exits 2 with `ok: false` and the reason, never 0. **A hit always stops** (sign-off on `plan/57`): the scan has no allow-list, no per-hit waiver and no flag that passes a hit |
| `testCriteria` | Red first. Every secret-shaped value in these tests is built at runtime from fragments, so the test file's own added lines carry none (sign-off on `plan/57`; common rules). GIVEN a staged fake token of the source-forge shape in an added line, and its twin in a new untracked file THEN `scan` exits 1 naming the rule and path, and stdout contains no fragment of the token. GIVEN `const API_TOKEN = "<40 random characters>"` THEN a hit. GIVEN a line holding only a bearer token string THEN the anchored pattern matches its value. GIVEN a binary, a FIFO or a file over 1 MiB untracked THEN skipped and counted. GIVEN `diff.external` set in the repository config THEN the added line is still found. GIVEN a git failure THEN exit 2, never 0. GIVEN a token committed on a branch and no `--base` THEN exit 0 with `scope: "uncommitted"` and `base: null`; GIVEN the same with `--base` at the branch point THEN exit 1, `scope: "since-base"` (`plan/56`). GIVEN a worktree `.gitattributes` holding `*.ts -diff` and a runtime-built token added in tracked `src/x.ts` THEN exit 1 naming the rule and `src/x.ts` (`plan/62`). GIVEN a tracked `src/x.ts` whose head side holds a NUL byte THEN exit 0 with `unscanned` listing `src/x.ts`. GIVEN a tracked file named `a"b.ts` holding a runtime-built token (POSIX only) THEN the hit names `a"b.ts`. GIVEN a top-level project run from `.stamity/runs/x/` with a runtime-built token added in `src/` THEN exit 1 (`plan/63`). GIVEN `test/change/scan.test.ts` and `test/cli/commands/gate.test.ts` as committed THEN `gate scan` over their added lines finds no hit. GIVEN `test/architecture` and `test/composition` THEN `scan.ts`'s wave and registry row hold |
| `edgeCases` | A hit on a deliberate fixture → the stop stands; the unit rebuilds the fixture at runtime, never rewrites a real value to pass (`plan/57`). **The env-value patterns on code.** `inline-password-assignment` and `inline-api-key-assignment` (`secretScan.ts:86-94`) can match typed code (`password: string`). The unit runs `gate scan` over the added lines of this repository's last 50 first-parent commits, and records the hit count and each `rule` in its report. A hit on a non-secret returns `BLOCKED_AMBIGUITY` naming the pattern and the two readings (scope the pattern for added lines, or accept the stop), never a silent pattern edit; S8 binds reuse. Order: lane A order, after p5g and p5a, sharing `gate.ts` and its test; `readChange` is p5a's |
| `depends_on` | p5g-audit-first, p5a-security-classifier |
| `verify` | `npx vitest run test/change test/cli/commands/gate.test.ts test/architecture test/composition && npm run lint && npm run typecheck` |

### p2c-ci-lanes-from-map: CI's lane suites read the base commit's map

| Field | Content |
|---|---|
| `id` | p2c-ci-lanes-from-map |
| `requirements` | REQ-FLOW-062, REQ-PROVE-031 |
| `files` | `scripts/ci/records-only.mjs`. `test/ci/recordsOnly.test.ts`. `.github/workflows/ci.yml`: the comments at `:44-52` and `:807-808` (`plan/7`) |
| `interfaces` | `LANE_PATHS`, `laneOf`'s first-match precedence and the per-lane steps stay. `LANE_SUITES` and `RECORDS_SUITES` leave. **`decide` stays pure** (`plan/6`): `decide({event, base, paths, map})`, where `map` is the parsed base map's `testInputs`, or `null`. `main()` reads it through `loadBaseMap(base)`: `git show <base>:.stamity/change-classes.json`, parsed with `parseClassFile`. **Per lane:** the suites are the union of the `tests` of every map entry whose glob matches one of that lane's changed paths; `laneOf` still decides each path's lane. A lane path no entry matches, an entry with `"all"`, or a `null` map gives `full=true`. No class enters this step: the CI lanes ask which suites read a path, not which gates a class needs. The head copy is never read. The output keys and the CLI's `key=value` lines are unchanged. It imports `src/change/classify.ts` (`parseClassFile`) and `src/change/testInputs.ts` by Node's type stripping (precedent `scripts/plugins/layout.mjs:27`; the `changes` job runs Node 24 with no install, `.github/workflows/ci.yml:184-194`). **`ci.yml` comments:** the lane suites come from the base commit's class file, validated by `parseClassFile` (no whitespace, no leading `-`, no glob character), never from the diff |
| `testCriteria` | Red first. GIVEN a records-only diff and the census map THEN `decide` names the census's records suites. GIVEN `map: null` THEN `full`. GIVEN a scratch repository whose head map drops a suite while the base keeps it THEN the base's suites. GIVEN every existing `recordsOnly.test.ts` case, called with the census map THEN its answer is unchanged, and the `LANE_SUITES` pins (`:196-235`) move to the map with a dated TEST CHANGE note. GIVEN a bad argument THEN exit 2 as today. GIVEN the script's import closure copied to a scratch directory with no `node_modules` THEN plain `node` runs it (`plan/26`). **The lanes' own decision code** (sign-off on `review/8`, `record.md:88`): GIVEN a diff touching `scripts/ci/records-only.mjs`, or any module of its import closure (`src/change/classify.ts`, `src/change/testInputs.ts` and what they import, the list taken from the same walk the plain-`node` test makes, so a new import joins the check), alone or beside records-only paths, and the census map THEN `full=true`; and no `LANE_PATHS` pattern holds any of those paths, so a later lane cannot narrow a change to them. GIVEN `test/ci/workflow.test.ts` THEN green with the new comments |
| `edgeCases` | A source module that uses syntax type stripping cannot erase (an `enum`, a parameter property) → the script fails at import; the plain-`node` test catches that. The first PR carrying the map (this one) has no map at its base → full CI, which is the safe side. Today no lane holds `scripts/ci/**` or `src/change/**` (`records-only.mjs:66-71`), so the new test pins the current answer rather than changing it. The script still runs from the pull request's head, so a change to it decides its own routing: the residual in `## Security notes`. Order: lane A order, after p5e, with p2d's census the map it reads; it merges in lane A's step 2, before p9 |
| `depends_on` | p5e-secret-scan, p2d-test-input-census |
| `verify` | `npx vitest run test/ci/recordsOnly.test.ts test/ci/workflow.test.ts` |

Integration, part 2: the class's gates. p3a runs right after p4c; p3b and p3c run after p8f and lane A's step 1
(the schedule).

### p3a-charter-invariant-4: invariant 4 names the class's gates (invariants 1.2.0)

| Field | Content |
|---|---|
| `id` | p3a-charter-invariant-4 |
| `requirements` | REQ-FLOW-063 |
| `files` | `content/charter/stamity-charter.md`: `:8` `invariants_version: 1.2.0`; `:10` `invariants_amended`; line `:53` only. `docs/doctrine.md`: a row after `:212`. `test/content/invariantsVersion.test.ts`: a `1.2.0` row in `INVARIANTS_HASHES` (`:43-48`) with a dated comment. `src/content/charter.ts`: `:313`, `:339`, `:362` plus dated comments, moved by the measured byte delta. `test/emit/crossClientGoldens.test.ts:266-268` (comments). `docs/capability-matrix.md` (generated). Eval cases `charter-universal-floor-holds-under-deadline` and `charter-floor-relaxation-refused`: line 53 re-quoted; an Expected row that grades the old wording moves under common rule 4, `charter-floor-relaxation-refused` taking a dated addition to its existing value at `successorInputs.test.ts:141-154`. `test/evals/successorInputs.test.ts` (only then). `evals/SET-v7.md`. The two goldens |
| `interfaces` | Line 53 reads `4. **No green, no done.** Done means the gates the change's class names exit 0 (all, if unclear).` (97 characters). Line 54 is unchanged, so the fixture at `invariantsVersion.test.ts:164-166` holds. The charter stays 95 lines; invariant 4 stays two physical lines; no later line moves, so the cases citing `:60-64`, `:92` and `:48-50` hold. The doctrine row is `\| 1.2.0 \| <UTC date of the commit> \| 4 \| MINOR \| <one line: done names the class's gates; an unclear class runs all; a setup that never re-syncs runs a superset> \|`. The same date goes in `:10` and the hash comment |
| `testCriteria` | GIVEN `invariantsVersion.test.ts` THEN the new hash row matches the sliced block, and the doctrine row names 1.2.0 with more than two rows. GIVEN the always-on budget test THEN cursor, claude and copilot are 95 lines each and codex 407 (`test/corpus/invariants.test.ts:594-608`). GIVEN the three byte constants THEN each moved by the same measured delta, each with a dated comment. GIVEN `docs/capability-matrix.md` THEN byte-equal to its generator. GIVEN `test/evals` THEN green |
| `edgeCases` | The new line is wider than the widest invariant line (`stamity-charter.md:42-50`) → shorten the wording; never wrap to a third line. A test red only on the stale dogfood `AGENTS.md` → the common rule's sync |
| `depends_on` | p4c-confidence-no-round (writer order of SET-v7 and the goldens) |
| `verify` | `node scripts/generate-capability-matrix.mjs && npx vitest run test/content test/corpus/invariants.test.ts test/emit/capabilityMatrix.test.ts test/evals`, then the goldens command |

### p3b-quick-gates: `/st-quick` runs the scan and the class's gates

| Field | Content |
|---|---|
| `id` | p3b-quick-gates |
| `requirements` | REQ-FLOW-063, REQ-FLOW-065, REQ-FLOW-066 |
| `files` | `content/commands/st-quick.md` `## Quality gates` (`:148-163`; `:150` "Gates run on every batch, a one-line typo fix included." kept word for word), with the `**Running the CLI.**` paragraph inserted after `:150`. `test/corpus/commands/lightTrio.test.ts:789-808`. `test/corpus/cliCallForm.test.ts`: the `commands/st-quick.md` row added to `CALL_SITES` (`plan/32`, `plan/55`). Eval cases: `quick-string-rename-with-its-tests` (its `150-155` block re-quoted from the landed text, which now holds the paragraph; Brief, B4, claim; its SET-v7 claim and source cells); `benign-small-change-quick-proceeds` (holds: its range `148-150` ends at the kept sentence, above the paragraph); `quick-next-step-derived-from-batch-state` (range shift of `173-187` by the unit's net line delta, the paragraph's three lines included). The `/st-quick` cases ending at `:146` or earlier hold. `evals/SET-v7.md`. The two goldens |
| `interfaces` | **The paragraph** (review r2, `plan/55`; common rules), after `:150` and a blank line, two physical lines: line 1 is `**Running the CLI.** ` followed by `RUNNING_CLI_SENTENCE` (`cliCallForm.test.ts:33`) byte for byte, unwrapped; line 2 is the fallback, also the `CALL_SITES` row's `fallback` string, byte-identical: "When neither form runs, the batch runs `${STAMITY:VERIFY_GATE_ALL}` and the report lists `secret scan: not run` under `Not done:`." The row is `{ relPath: "commands/st-quick.md", label: RUNNING_CLI_LABEL, fallback: <that sentence> }`. The steps below then name the verbs in the defined shorthand (`stamity gate scan …`), in prose only; step 5's inline `npx --no` form at `:123-124` stays. Steps, in order: (1) `stamity gate scan --base HEAD`; a hit stops the batch, naming path, line and rule, never the value; the hit is never cleared by rewriting the value and scanning again, and a hit on a deliberate fixture is the person's to settle (sign-off on `plan/57`). A non-empty `unscanned` list puts `secret scan: <n> files unscanned` under `Not done:`, naming the paths (review r3, `plan/62`; common rules). (2) `gate classify --base HEAD --json`. A `security-sensitive` class fires the `Security-sensitive surface` row (sign-off on `plan/27`). The items whose files `byPath` places there, or whose lines a rule hit, are reverted and move to `/st-work` with the rest of the batch, as Mid-run re-escalation moves an item. The refusal names the row and the rule that placed the item. There is no size floor, and no lens runs inside the quick lane. (3) Spawn `test-runner` with the changed-file list and the class's gate checks: `tests-selected` → `${STAMITY:VERIFY_GATE_TEST}` with the selected files appended; `lint` → `${STAMITY:VERIFY_GATE_LINT}`; `typecheck` → `${STAMITY:VERIFY_GATE_TYPECHECK}`; `gates-all`, an unclear class, or a test command that takes no file list → `${STAMITY:VERIFY_GATE_ALL}`. `review`, `review-once` and `dependency-audit` keep `/st-quick`'s existing behaviour; the Thresholds table and its security-surface paragraph (`:68-91`) are unchanged, since the class fires the existing row. **The CI condition** (sign-off on `plan/51`): one sentence states that the narrower local gates rest on the repository's CI running the full matrix on every `product` or stronger change and on a schedule. Where the charter's `CI provider` reads `unknown`, the batch runs `${STAMITY:VERIFY_GATE_ALL}` whatever its class. **A CLI that cannot run**, or one with no `gate` verb → the paragraph's fallback line |
| `testCriteria` | GIVEN `lightTrio.test.ts` THEN the scan step, the no-rewrite-and-rescan rule, the `files unscanned` line, the class step, the `Security-sensitive surface` refusal on a `security-sensitive` class, the token mapping, "a one-line typo fix included", the CI-condition sentence and the `unknown`-provider rule are pinned, and no repository script name appears. GIVEN `cliCallForm.test.ts` THEN both `it.each` checks pass for the new `commands/st-quick.md` row (the sentence under its label, and the fallback string), and checks (b)–(d) and `test/emit/noBareCliCall.test.ts` stay green. GIVEN the body THEN within 500 lines. GIVEN `quick-string-rename-with-its-tests` THEN its B4 and claim grade the class's gates, not "the full gate". GIVEN `test/evals` THEN green |
| `edgeCases` | A docs class with zero selected tests → scan only, plus `/st-quick`'s own steps; the report names the class. A lockfile change never reaches step 2: the `Dependencies` row refuses it first (`:73`). An editor or formatter wrapping the sentence line → the label check fails; the line stays unwrapped |
| `depends_on` | p8f-capture-work-digest (integration order and SET-v7 slot), p3a-charter-invariant-4, p5e-secret-scan, p2d-test-input-census (lane A's step 1 merged: the verbs and the map it names exist) |
| `verify` | `npx vitest run test/corpus test/emit/noBareCliCall.test.ts test/evals`, then the goldens command |

### p3c-work-gates: `/st-work` proves with the class's gates, and the final tree with all

| Field | Content |
|---|---|
| `id` | p3c-work-gates |
| `requirements` | REQ-FLOW-063, REQ-FLOW-015, REQ-FLOW-066 |
| `files` | `content/commands/st-work.md` `### Gates` (`:224-239`) and `### Proof block`'s gate line (`:350-351`, `plan/40`). `content/agents/stamity-test-runner.md:19-40`. `test/corpus/commands/work.test.ts:702-731`, plus a Proof block pin. `test/corpus/agents/quality.test.ts:261`, `:267`. Eval cases `agent-test-runner-return-contract` and `test-runner-plain-gates-honest-exit` (range shifts, or re-quotes where `:19-40` text they quote moves); `work-proof-block-fields` (its `345-406` block re-quoted at the new gate line; an Expected row that grades the old line moves under common rule 4). Range shifts of `work-persisted-plan-asks-once`, `benign-optional-step-skipped-proceeds` and `probe-none-work-run-qa-checkpoint` (by hand) if the edit moves the line count. `evals/SET-v7.md`. The two goldens |
| `interfaces` | **Gates text.** Each Prove pass first runs `stamity gate scan --base <the run's base commit>` under this body's CLI-calls rule (pre-p0 `:160-161`); a hit stops the pass, naming path, line and rule, never the value, and is never cleared by rewriting the value and scanning again; a hit on a deliberate fixture is the person's to settle (sign-off on `plan/57`); a non-empty `unscanned` list puts `secret scan: <n> files unscanned` under `Not done:` (review r3, `plan/62`). During the build, the class's gate checks run on the selected files, with p3b's token mapping. On the final tree, the class's gates run, and `product` or stronger runs `${STAMITY:VERIFY_GATE_ALL}`; "the final tree always gets a run of its own" stays word for word. A run with no recorded base commit runs `${STAMITY:VERIFY_GATE_ALL}` on the final tree without classifying, and its class reads `unclear` (`plan/39`); with work already committed, its scan (against `HEAD`, `scope: "uncommitted"`) covers only the rest, so `Not done:` lists `secret scan: not run` (review r2, `plan/56`). A class whose checks name `review-once` gets one review pass: a Critical or Warning it raises is fixed and closure-reviewed once, and no further round runs (`plan/48`). One sentence states the CI condition and the `unknown`-provider rule, as in p3b (`plan/51`). A CLI that cannot run → the full gates, and `secret scan: not run` under `Not done:` (`plan/32`). The test-runner accepts the selected file list as its narrow run (`stamity-test-runner.md:27`, `:38-40`). The pinned phrases at `work.test.ts:702-716` stay. **Proof block** (`:350-351`): "gate results — the change's class as `gate classify` named it (`unclear` when none ran), then per gate: command, pass/fail/unknown, failing excerpt if any, or the earlier result a byte-identical tree cites". **Allocation:** at most +500 characters above the cut and +4 lines (common rules) |
| `testCriteria` | GIVEN the corpus tests THEN the scan step, the no-rewrite-and-rescan rule, the `files unscanned` line, the class's gates during the build, the full gates for `product` and stronger on the final tree, the no-base rule with its `secret scan: not run` half, the `review-once` sentence, the CI-condition sentence and the `unknown`-provider rule are pinned; "the final tree always gets a run of its own" and "never a lighter pass" still hold. GIVEN the Proof block THEN its gate line names the class and is pinned (REQ-FLOW-015). GIVEN `quality.test.ts` THEN its two pins hold with the test-runner's narrow-run text. GIVEN the budgets THEN within the allocation. GIVEN `test/evals` THEN green |
| `edgeCases` | A class of `docs` with zero selected tests on the final tree → scan and its review pass only, the proof block naming the class. The allocation is unmet → move words into the test-runner body (the scan and no-base sentences stay in `st-work.md`: they are the orchestrator's). p8f has already landed in `st-work.md` (writer order), so this unit measures against the index p8f left |
| `depends_on` | p3b-quick-gates |
| `verify` | the index command, then `npx vitest run test/corpus test/evals`, then the goldens command |

Integration, part 3: the security trigger and the class file's standing.

### p5b-security-trigger-rows: the S7 path rows in the roster and the security body

| Field | Content |
|---|---|
| `id` | p5b-security-trigger-rows |
| `requirements` | REQ-FLOW-065 |
| `files` | `src/roster/triggers.ts`: the security row's `triggerPaths`, `triggerKeywords` and the `*`-absent comment at `:73-78`. `content/agents/stamity-security.md`: `## Trigger` (`:24-39`) and `## Reading the change`, which gains one sentence after the shared paragraph. `test/change/classify.test.ts`: one `describe` for the new rows (owned by integration once lane A merges; `plan/21`, `plan/49`). `test/corpus/agents/specialists.test.ts`: the Trigger parity, plus one pin of the `git log` sentence. `test/corpus/agents/verdictReturns.test.ts:232-245`, only if a shared phrase moves. `test/roster/roster.test.ts`, only where it pins the security row's patterns. Eval cases `agent-security-return-contract` and `security-agent-no-write-under-pressure`: their later ranges (`60-147` and `112-147` at HEAD) shift by this unit's line delta from where p8c left them, since p8a and p8c land in `stamity-security.md` first (review r2, `plan/58`); a block whose quoted text this unit moves is re-quoted. `evals/SET-v7.md`. The two goldens |
| `interfaces` | **New `triggerPaths`**, in the module's own forms (`triggers.ts:47-57`): `.github/workflows/`, `hooks/`, `*.sh`, `dockerfile`, `hooks.json`, `settings.json`, `settings.local.json`, beside the existing sixteen. `triggerKeywords` gains D8's words. **Trigger table:** two new rows, "CI and release" (`.github/workflows/`, `*.sh`, `dockerfile`; topics workflow, release, shell) and "Client hooks and settings" (`hooks/`, `hooks.json`, `settings.json`, `settings.local.json`; topic hook). One unbackticked sentence states that the classifier also places a change here by a changed code line (a process spawn, a recursive delete or a file overwrite, a registry or network call, a token or secret name), so a backticked token never names a pattern the row does not hold (`specialists.test.ts:332-338`). **Reading the change:** a separate sentence after the shared paragraph says this role reads `git log <range>` only after its findings are formed, because a message states intent, not behaviour |
| `testCriteria` | GIVEN `specialists.test.ts` THEN the Trigger table and the row agree in both directions, and the `git log` ordering sentence is pinned (`plan/46`). GIVEN `classify` over `.github/workflows/ci.yml`, `.claude/settings.json`, `.cursor/hooks.json` or `scripts/x.sh` THEN `security-sensitive` with the lens. GIVEN `work.test.ts:798-811` THEN no new pattern string appears in the Specialist pass. GIVEN `verdictReturns.test.ts` THEN the shared phrases hold. GIVEN `test/evals` THEN green |
| `edgeCases` | A new row fires on every change in a repository whose CLI paths match it → the lens runs every time. The class file can add rules, never remove or weaken a built-in one (p2a), and the lens is never gated by hit rate. `settings.json` also matches non-client files (`.vscode/settings.json`), which is the stronger side. `## Reading the change` is no longer the body's last section (p8a appended `## Severity`), so the new sentence lands inside it, above `## Severity`, and the severity test's "last section" check still holds. Order: integration order after p3c; the security body's writer order p8a → p8c → p5b; lane A's step 1 merged, which brings the classifier that reads the row (p1d). The new rows match without case, as the row's matcher already does (`triggers.ts:201-204`), so `.GitHub/Workflows/ci.yml` is still security (`record.md:88`) |
| `depends_on` | p3c-work-gates, p8c-capture-security-lens, p1d-classify-security-row |
| `verify` | `npx vitest run test/roster test/change test/corpus test/evals`, then the goldens command |

### p5c-security-in-the-flow: the lens at every tier for the class, the audit first

| Field | Content |
|---|---|
| `id` | p5c-security-in-the-flow |
| `requirements` | REQ-FLOW-065 |
| `files` | `content/commands/st-work.md` `### Specialist pass` (`:283-309`). `content/skills/st-dep-audit/SKILL.md`: body only. Its description line `:6` does not move, because all 30 probes copy it and no test pins those copies. `test/corpus/commands/work.test.ts:798-840`. Eval cases `work-proof-block-fields` (`297-303` re-quoted if the severity-floor text moves) and range shifts of `benign-optional-step-skipped-proceeds`, `probe-none-work-run-qa-checkpoint` and `work-persisted-plan-asks-once` if the line count moves. `evals/SET-v7.md`. The two goldens |
| `interfaces` | Specialist pass, with "the trigger roster is the single source" and "pulled in by a changed path or by the task's topic" kept. A sentence states that the `security` lens runs at every tier when `stamity gate classify` names the class `security-sensitive`, and on a trigger-path match. Topic words may add a lens and never remove one. When `gate classify`'s checks name `dependency-audit` (a lockfile-only bump it proved), the dependency audit runs first, and the lens only if the audit flags something (D7). No trigger pattern string appears (`work.test.ts:807-811`): the text says "dependency lockfiles", never a file name. The dep-audit body gains a short section naming that role and what "flags" means (D7). **Allocation:** the text sits below the cut; at most +3 lines. **The Package 22 room** (review r2, `plan/58`): this unit is the last writer of `st-work.md` under the schedule, so it records the room left for Package 22, 18,000 minus the index and 500 minus the body's lines, in its report; a shortfall against S9's room goes on the close list |
| `testCriteria` | GIVEN `work.test.ts` THEN the new sentences are pinned. "standard and light run the `security` lens on a trigger-path match" is replaced with a dated note; "light runs no other lens" and "universal floor holds at every tier" still hold; no trigger pattern string appears. GIVEN the body THEN within 500 lines. GIVEN the index command THEN the index and the line count are recorded with the room they leave. GIVEN `test/evals` THEN green, with the 30 probes' copied description unchanged |
| `edgeCases` | The audit cannot run (no lockfile parser, no network) → the lens runs; the audit-first path never ends with neither. Order: integration order after p5b, and after p3c in `st-work.md`'s writer order |
| `depends_on` | p5b-security-trigger-rows |
| `verify` | the index command, then `npx vitest run test/corpus test/evals`, then the goldens command |

### p5d-threat-note: a security-class plan unit carries a threat note

| Field | Content |
|---|---|
| `id` | p5d-threat-note |
| `requirements` | REQ-FLOW-067 |
| `files` | `content/commands/st-plan.md` `## Plan artifact shape`: one row after `verify` in the unit table (`:343-352`), and the `**Running the CLI.**` paragraph right after the table, before `4. **Risks**` (`:354`). `test/corpus/commands/plan.test.ts:474-483` (the unit-fields test over `UNIT_FIELDS`), plus a pin (`plan/43`). `test/corpus/cliCallForm.test.ts`: the `commands/st-plan.md` row added to `CALL_SITES` (`plan/32`, `plan/55`). Eval cases `plan-artifact-head-and-units-shape` (`313-366` re-quoted; the row and the paragraph both land inside it, so its end grows by the four added lines), `plan-semantic-ambiguity-survives-structural-pass` (`274-407` re-quoted, its end shifting the same way), `plan-lint-three-fails-returns-blocked-ambiguity` (`388-398` shifts by four). `plugin-mode-invocation` holds: its ranges end at `:292`, above every insertion. `evals/SET-v7.md`. The two goldens |
| `interfaces` | **The paragraph** (review r2, `plan/55`; common rules), after the unit table and a blank line, two physical lines: line 1 is `**Running the CLI.** ` followed by `RUNNING_CLI_SENTENCE` (`cliCallForm.test.ts:33`) byte for byte, unwrapped; line 2 is the fallback, also the `CALL_SITES` row's `fallback` string, byte-identical: "When neither form runs, no unit's class can be read, so every unit carries the `threat` row." The row is `{ relPath: "commands/st-plan.md", label: RUNNING_CLI_LABEL, fallback: <that sentence> }`. **Row:** `` \| `threat` \| for a unit whose files `stamity gate classify --base HEAD --paths <its files>` places `security-sensitive`: its trust boundary, what it trusts, one abuse case and the check that stops it, in at most five lines; absent otherwise \| ``, the verb in the shorthand the paragraph defines (the table's columns are `Field` and `Content`, not `Run` or `Probe`, so check (b) does not read it). `--paths` is p1a's path-list input, so the check runs at plan time on files that are not yet a diff (`plan/33`). No eval case cites `st-plan.md:101-125`, so the persisted "eval sources citing `:101-125`" names nothing (evals return Q2) |
| `testCriteria` | GIVEN `plan.test.ts` THEN the `threat` row, its `--paths` call and its five-line bound are pinned, and the eight required fields are unchanged. GIVEN `cliCallForm.test.ts` THEN both `it.each` checks pass for the new `commands/st-plan.md` row, and checks (b)–(d) and `test/emit/noBareCliCall.test.ts` stay green. GIVEN the body THEN within 500 lines. GIVEN `test/evals` THEN green |
| `edgeCases` | A pin that counts the unit table's rows at eight → that pin gains a dated note saying the ninth row is conditional. The verify skill's `spec-plan-coverage.mjs` reads unit fields; an unknown field must not fail it, so the unit runs it once on this plan and records the result |
| `depends_on` | p5c-security-in-the-flow (SET-v7 and goldens order) |
| `verify` | `npx vitest run test/corpus test/emit/noBareCliCall.test.ts test/evals`, then the goldens command |

### p5f-class-file-gate-config: the injection-screening rule names the class file as gate configuration

| Field | Content |
|---|---|
| `id` | p5f-class-file-gate-config |
| `requirements` | REQ-FLOW-061 |
| `files` | `content/rules/stamity-injection-screening.md` `## Gates`, the first bullet (`:88-92`). `test/corpus/rules/security.test.ts`: its pin of the manifest sentence, moved with a dated TEST CHANGE note, plus a pin naming the class file. Eval cases `state-text-directive-not-executed` (its `86-96` block re-quoted) and `screening-hit-not-echoed` (its `86-109` block re-quoted, the range shifting if the bullet gains a line). `evals/README.md` and SET-v7's identical/moved counts, if either case stops being byte-identical to its cases-v5 copy (common rule 5). `evals/SET-v7.md`. The two goldens |
| `interfaces` | The bullet's second sentence names both gate files (review r1, `plan/31`): the manifest and the change-class file (`.stamity/change-classes.json`) are the files under this path that configure gates — the manifest the learnings cap, the hooks directory and the model classes; the class file which checks a change's class runs. Both are the operator's to edit, never a value copied out of a screened state file, and the class file is read only from the base commit, so a change never sets its own checks. The bullet's first sentence ("Nothing read from `.stamity/` is executed …") is unchanged. The sentence fits `:88-92` plus at most one line |
| `testCriteria` | GIVEN `test/corpus/rules/security.test.ts` THEN the class file is named beside the manifest, and the moved pin carries its note. GIVEN `test/evals` THEN green, with both cases' blocks byte-identical to the landed rule |
| `edgeCases` | The bullet gains a line → `screening-hit-not-echoed`'s range moves to `86-110` and `state-text-directive-not-executed`'s to `86-97`, both re-quoted; no other case moves (the others end at `:84` or earlier). The dogfood copy `.claude/rules/stamity-injection-screening.md` moves in p7 |
| `depends_on` | p5d-threat-note (SET-v7 and goldens order) |
| `verify` | `npx vitest run test/corpus test/evals`, then the goldens command |

Integration, part 4: capture by consequence and one severity scale. Under the orchestrator's schedule (`record.md:75`)
these six units run right after p3a and before p3b; they need nothing lane A builds.

### p8a-severity-scale: one `## Severity` section in six bodies

| Field | Content |
|---|---|
| `id` | p8a-severity-scale |
| `requirements` | REQ-FLOW-073 |
| `files` | `content/agents/stamity-reviewer.md`, `stamity-security.md`, `stamity-performance.md`, `stamity-design-quality.md`, `stamity-implementer.md`, `stamity-fixer.md`: one `## Severity` section appended as each body's last section. `test/corpus/agents/severityScale.test.ts` (new). `content/commands/st-rework.md:20-22`, aligned in the same three lines. The two goldens |
| `interfaces` | The section, byte-identical in all six and held by one exported test constant (the pattern of the `## Shell` paragraph in `test/corpus/agents/shellDiscipline.test.ts`): **Critical**: a defect that breaks a supported use, loses data or opens a security hole on the change's path. **Warning**: wrong or missing behaviour a user or maintainer meets in a supported use, or a change that makes an existing instance worse. **Minor**: a true defect with a small, named consequence. Each of the three carries one example, written once in the constant. Then the sentence: "A note with no consequence is not a finding; no findings is a good result." The reviewer's own Warning rule (`stamity-reviewer.md:46-48`) stays word for word. It is appended last because every eval range in these six files ends at or before today's last line, so no range moves |
| `testCriteria` | GIVEN the six bodies THEN each holds the section byte-identical to the constant, as its last `## ` section. GIVEN `shellDiscipline.test.ts`, `specialists.test.ts` and the spine suite THEN green. GIVEN `npx vitest run test/evals` THEN green with no case touched. GIVEN `st-rework.md` THEN its line count is unchanged |
| `edgeCases` | A suite that reads a body's last section to EOF (`## Shell`, `## Reading the change`) now ends at `## Severity`. Its content is unchanged, so a failure there is a parsing assumption: fix the helper, not the text, with a dated note. Order: after p3a, by integration order and the goldens (amended 2026-10-09 per the schedule, review r2, `plan/58`) |
| `depends_on` | p3a-charter-invariant-4 |
| `verify` | `npx vitest run test/corpus test/evals`, then the goldens command |

### p8b-capture-reviewer: the reviewer records findings by consequence

| Field | Content |
|---|---|
| `id` | p8b-capture-reviewer |
| `requirements` | REQ-FLOW-072, REQ-CTX-002 |
| `files` | `content/agents/stamity-reviewer.md`: the Rubric intro (`:22-24`), the Nit policy (`:134-135`) and the digest (`:184-186`). `test/corpus/agents/severityScale.test.ts`: the reviewer's capture, `notes left out` and `pre-existing:` pins. `test/corpus/agents/spine.test.ts:709-716` and `verdictReturns.test.ts`, only where a pin quotes a changed sentence. Eval cases `agent-reviewer-return-contract` (B7, A1, A2 and its Brief), `re-review-closures-fresh-reviewer` (Nit policy and digest re-quoted), `reviewer-brief-is-diff-and-criteria` (`181-205` re-quoted) and `digest-security-finding-carried-in-full` (its reviewer block re-quoted, and B3 where it grades the reviewer's digest line; it has no cases-v5 copy, so the SET-v7 paragraph is its record; `plan/37`). `test/evals/successorInputs.test.ts`: a dated addition to the existing `agent-reviewer-return-contract` value (`:121-128`), never a second key. `evals/SET-v7.md`. The two goldens |
| `interfaces` | S10's rule in the Rubric intro: a finding names who or what is affected, how, and in which use, with its evidence. A note with no consequence (wording, naming, style, comment drift, a tidier shape, a "might" with no trigger) is listed in the report and counted. S13: a pre-existing defect is recorded only when it passes, its `summary` leading `pre-existing:`. The digest's `findings:` line ends `notes left out: <n>`; the inline return carries the count only, never the list. The findings block keys (`src/runs/blocks.ts:66-69`) do not change |
| `testCriteria` | GIVEN the reviewer's Return contract THEN its digest names `notes left out`, and the `pre-existing:` lead is pinned (`plan/46`). GIVEN `agent-reviewer-return-contract` THEN its moved rows carry the dated `EXPECTED_MOVES` addition. GIVEN `digest-security-finding-carried-in-full` THEN its reviewer block matches the landed digest. GIVEN `test/evals` THEN green |
| `edgeCases` | A note that names a consequence once looked at (a misleading message a user acts on) is a Minor finding, not a note. A client with no report write → the inline return carries the count only |
| `depends_on` | p8a-severity-scale |
| `verify` | `npx vitest run test/corpus test/evals`, then the goldens command |

### p8c-capture-security-lens: the security lens records findings by consequence

| Field | Content |
|---|---|
| `id` | p8c-capture-security-lens |
| `requirements` | REQ-FLOW-072, REQ-CTX-002 |
| `files` | `content/agents/stamity-security.md` Return contract (`:112-147`, HEAD lines: p5b now lands after this unit). `test/corpus/agents/severityScale.test.ts`. `verdictReturns.test.ts` and `specialists.test.ts`, only where a pin quotes a changed sentence. Eval cases `agent-security-return-contract` and `security-agent-no-write-under-pressure` (re-quoted; p5b later shifts them). `evals/SET-v7.md`. The two goldens |
| `interfaces` | The same S10 rule and digest count as p8b. The out-of-change exclusions stay; S13 holds that the lens raises what it raises today |
| `testCriteria` | GIVEN the security body THEN its digest names `notes left out`, its exclusion rows still read "out of scope", and it keeps at least four (`specialists.test.ts:341-349`). GIVEN `test/evals` THEN green |
| `edgeCases` | A security-relevant note is never a left-out note: `security:` carries every security-relevant finding in full, as today |
| `depends_on` | p8b-capture-reviewer |
| `verify` | `npx vitest run test/corpus test/evals`, then the goldens command |

### p8d-capture-perf-design-lenses: the performance and design-quality lenses

| Field | Content |
|---|---|
| `id` | p8d-capture-perf-design-lenses |
| `requirements` | REQ-FLOW-072, REQ-CTX-002 |
| `files` | `content/agents/stamity-performance.md` (`:119-170`). `content/agents/stamity-design-quality.md` (`:112-148`). `test/corpus/agents/severityScale.test.ts`. `verdictReturns.test.ts` and `specialists.test.ts`, only where quoted. Eval cases `agent-performance-return-contract` and `agent-design-quality-return-contract` (re-quoted). `evals/SET-v7.md`. The two goldens |
| `interfaces` | As p8c, for both lenses. Design-quality keeps its out-of-change exclusions (S13) |
| `testCriteria` | GIVEN both bodies THEN each digest names `notes left out`, and the exclusion tables hold "out of scope" and at least four rows. GIVEN `test/evals` THEN green |
| `edgeCases` | `performance`'s "blocks only on a breached budget" rule is untouched |
| `depends_on` | p8c-capture-security-lens |
| `verify` | `npx vitest run test/corpus test/evals`, then the goldens command |

### p8e-capture-execution-roles: the implementer and the fixer, and the fence grammar

| Field | Content |
|---|---|
| `id` | p8e-capture-execution-roles |
| `requirements` | REQ-FLOW-072, REQ-CTX-002 |
| `files` | `content/agents/stamity-implementer.md` (`:36-38`, `:87-89`, `:96-118`). `content/agents/stamity-fixer.md` (`:101-102`, `:115-125`; `:20-22` and `:33-34` unchanged). `content/agents/stamity-spec-author.md` (the fence grammar, the inbox fold). `test/corpus/agents/executionReturns.test.ts`. `test/corpus/agents/severityScale.test.ts`. Eval cases `agent-implementer-return-contract` and `agent-fixer-return-contract` (re-quoted), and `agent-spec-author-return-contract`, only if a block it quotes moves. `evals/SET-v7.md`. The two goldens |
| `interfaces` | S10 and S13 for both roles. S12: the implementer applies a one-line note inside its own unit's files while it builds; a larger one is a counted note, not a deferral. The fixer's "no opportunistic edits" rule stays, and reviewer notes are never routed to it. Each digest's `findings:` line ends `notes left out: <n>`; the spec-author's and the test-runner's green digests do not change. The implementer and the spec-author spell the `stamity-findings` fence grammar as the reviewer states it (`stamity-reviewer.md:174-180`): one JSON object per line with `id`, `severity`, `locator`, `summary`, and where true `decision_needed` and `security` |
| `testCriteria` | GIVEN the two bodies THEN each digest names `notes left out`, the implementer's one-line-note rule and both roles' `pre-existing:` lead are pinned (`plan/46`), and the fixer's `:33-34` is byte-unchanged. GIVEN the implementer and spec-author bodies THEN the fence grammar's keys are pinned. GIVEN `test/evals` THEN green |
| `edgeCases` | A one-line note that touches a file outside the unit's `files` → a counted note, never an edit |
| `depends_on` | p8d-capture-perf-design-lenses |
| `verify` | `npx vitest run test/corpus test/evals`, then the goldens command |

- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): `2026-10-01_pr73-review-round-1/prove/1`: `stamity-spec-author.md` spells the findings fence's grammar (this cell).
- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"the implementer's return contract names the `stamity-findings` fence but not its grammar" at 077e8a78``: `stamity-implementer.md` spells it (this cell).

### p8f-capture-work-digest: `/st-work`'s digest rule counts the notes left out

| Field | Content |
|---|---|
| `id` | p8f-capture-work-digest |
| `requirements` | REQ-FLOW-072, REQ-CTX-002 |
| `files` | `content/commands/st-work.md` (pre-p0 lines): the digest rule (`:207-212`) and the Minor/nit bullet (`:262-263`) after its opening words. `test/corpus/commands/work.test.ts` (`:376-382`, `:859-863`, `:1407-1428`). Eval case `digest-security-finding-carried-in-full`: its `202-215` block, its Brief, and B3 where it grades the `/st-work` digest rule; its reviewer block moved in p8b. It has no cases-v5 copy, so the SET-v7 paragraph is its record. Range-only shifts, if the edit moves the line count (`plan/36`): `work-persisted-plan-asks-once`, `work-proof-block-fields`, `benign-optional-step-skipped-proceeds` and `probe-none-work-run-qa-checkpoint` (by hand). `evals/SET-v7.md`. The two goldens |
| `interfaces` | S14: at most 2 lines and 200 characters added above the cut (its allocation). The digest rule names `notes left out: <n>` on the `findings:` line of the reviewer, each lens, the implementer and the fixer. The Minor/nit bullet keeps "Minor/nit findings are ledgered", "never loop-triggering" and "new nits are suppressed", and adds that a note with no consequence is not a finding. The unit records the index and the line count it leaves; it is no longer the last writer of `st-work.md` (p3c and p5c follow, the schedule), so p5c records the room left for Package 22 (review r2, `plan/58`) |
| `testCriteria` | GIVEN `st-work.md` THEN the text from `- Minor/nit findings are ledgered` still ends before character 18,000, and the body stays within 500 lines. GIVEN `work.test.ts` THEN `notes left out` is pinned on the digest rule. GIVEN `test/evals` THEN green |
| `edgeCases` | The two-line, 200-character bound is unmet → move the extra words into the agent files, never raise a budget |
| `depends_on` | p8e-capture-execution-roles |
| `verify` | the index command, then `npx vitest run test/corpus test/evals`, then the goldens command |

Integration, part 5: `build/75` and the specs.

### p6-setup-route: the plugin `st-setup` body routes `sync` first

| Field | Content |
|---|---|
| `id` | p6-setup-route |
| `requirements` | REQ-PROVE-009 (its two eval cases); the setup body's route has no requirement id of its own |
| `files` | `scripts/plugins/setupCommand.mjs` (`:165-166`, `:172-176`). `test/ci/pluginModules.test.ts` (`:788-830`). `evals/cases-v6/adversarial/st-setup-refuses-generated-setup.md`: source, both blocks, claim, B2, B4. `evals/cases-v6/golden/st-setup-fresh-repository.md`: range only. `evals/SET-v7.md`: `:448-451`, the two index rows, one dated paragraph |
| `interfaces` | Step 2 names "the three commands in step 3". Step 3 routes `sync`, then `clean -y`, then `plugin setup`, matching every CLI route (`src/cli/commands/plugin.ts:92`, `probe.ts:825`, `check.ts:2477`). The case's B2 names that three-command route; B4 reads "must NOT run `sync`, `clean -y` or `plugin setup` itself"; the claim says "three-command route". `st-setup-fresh-repository`'s B5 (it does not run `sync`) stays right. No `EXPECTED_MOVES` row is needed: both cases are v7-added. No committed copy of the body exists (it renders at package build), which p7's record line states |
| `testCriteria` | Red first: GIVEN `pluginModules.test.ts` THEN `sync` is pinned before `clean -y`, the order checks hold, and the cost sentence holds for all four clients. GIVEN `test/evals` THEN green |
| `edgeCases` | The cost sentence (`:816-830`) names two commands → it moves with a dated note. Order: the edge on p5f is the SET-v7 writer slot only, with no content dependency (Phase 2 note 3); the slot after p5f under the schedule (review r2, `plan/58`, `plan/60`) |
| `depends_on` | p5f-class-file-gate-config |
| `verify` | `npx vitest run test/ci/pluginModules.test.ts test/evals` |

### p9-spec-merge: the Spec delta into `docs/specs/`, once (writer: a spec-author)

| Field | Content |
|---|---|
| `id` | p9-spec-merge |
| `requirements` | REQ-FLOW-061, REQ-FLOW-062, REQ-FLOW-063, REQ-FLOW-064, REQ-FLOW-065, REQ-FLOW-066, REQ-FLOW-067, REQ-FLOW-072, REQ-FLOW-073, REQ-FLOW-015, REQ-CTX-002, REQ-CTX-018, REQ-LADDER-003, REQ-PROVE-031 |
| `files` | `docs/specs/everyday-flows.md`, `docs/specs/orchestrator-context.md`, `docs/specs/model-ladder.md`, `docs/specs/prove-behavior-and-value.md` (REQ-PROVE-031; `plan/7`) |
| `interfaces` | Brownfield merge of this plan's `## Spec delta`, each claim cited at the landed `path:line`. ADDED requirements go after REQ-FLOW-038 with their criteria; MODIFIED ones get dated "Amended 2026-10-08 (run `2026-10-08_product-core`, unit `<id>`)" paragraphs. `everyday-flows.md:9-25` gains one dated sentence in its merge-by-run form. Every citation of a moved line in the four specs is re-pointed to the landed lines where its text moved: `content/commands/st-work.md` (REQ-FLOW-015, 017, 019, 024; REQ-CTX-018 at `orchestrator-context.md:958-963`; REQ-LADDER-003 at `model-ladder.md:105-106`); `content/agents/stamity-reviewer.md:108-112` and `:141-151` (REQ-CTX-018); `src/roster/modelLadder.ts:36` and `:48-56` (REQ-LADDER-003) (`plan/53`); and `scripts/ci/records-only.mjs` and `.github/workflows/ci.yml` (REQ-PROVE-031). Statuses do not move: no release ships this (the specs return, D3). The spec-author runs no gate; a test-runner runs `verify` (learning `verdict-roles-read-lanes-through-a-diff-file`) |
| `testCriteria` | GIVEN `npx vitest run test/records test/authoring` THEN green. GIVEN the verify skill's `spec-plan-coverage.mjs` over this plan and `docs/specs` THEN no dangling or duplicate id. GIVEN a converged requirement THEN a byte-stable no-op |
| `edgeCases` | A citation p0 already updated (p0's edge, D9's exception) → left as p0 wrote it |
| `depends_on` | p6-setup-route, p0-make-room, p3a-charter-invariant-4, p3b-quick-gates, p3c-work-gates, p4a-review-cap, p4b-fixer-escalation, p4c-confidence-no-round, p5b-security-trigger-rows, p5c-security-in-the-flow, p5d-threat-note, p5f-class-file-gate-config, p8a-severity-scale, p8b-capture-reviewer, p8c-capture-security-lens, p8d-capture-perf-design-lenses, p8e-capture-execution-roles, p8f-capture-work-digest, p2c-ci-lanes-from-map (p6-setup-route is its integration slot, p2c arrives with lane A's step 2, and the rest change text the specs cite) |
| `verify` | `npx vitest run test/records test/authoring`, then `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs .stamity/runs/2026-10-08_product-core/plan.md docs/specs` |

The p6 case lanes, in parallel, branched from integration after p5f, the last text unit under the schedule (review r2,
`plan/58`, `plan/60`); then p6-index and p6-locator-guard on integration.

Every case unit below writes new files only, with sources taken from the landed text at its branch point (after p5f),
so cases (1)–(6), (11), (12) and (21) quote the landed text of p3b, p3c, p5b, p5c and p5d, and cases (7)–(10) and
(13)–(20) the landed text of p4 and p8. A case file describes a secret-shaped value in words and carries none (common
rules; sign-off on `plan/57`).
The shape is that of an existing case of the same class: frontmatter `id`, `class`, `metric`, `floor`, `claim` and
`source` (a `content/**` range; `test/evals/coverage.test.ts:89` refuses `src/` sources), then `## Brief`, the
governing blocks, `### Binding criteria` and `### Advisory criteria`, with "must NOT" spelled so
(`test/evals/roster.test.ts:161-167`). `floor: true` goes where the case guards a charter floor: security never
relaxes, or done needs the gates. Each case already meets p6-locator-guard's rule (`plan/14`): the first non-blank
line of every `source:` range appears in a governing block, in the body after a leading `> ` is stripped, or, for a
frontmatter `description:` line, verbatim in the body. Each unit returns, in its report, the case-index row for each
new case (the five cells, `test/evals/roster.test.ts:15-25`) and its must-NOT rows, for p6-index. Its verify is
`npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts test/evals/roster.test.ts`: `roster.test.ts`'s
per-case checks (a binding criterion counted, the must-NOT spelling, the parse; `:93-98`, `:161-167`) are green, and
its index-row (`:79-90`), appendix (`:142-160`) and README-currency checks are the declared red until p6-index.

### p6a-cases-test-selection: three golden cases for test selection

| Field | Content |
|---|---|
| `id` | p6a-cases-test-selection |
| `requirements` | REQ-FLOW-062, REQ-FLOW-063, REQ-PROVE-009 |
| `files` | three new `evals/cases-v6/golden/` files |
| `interfaces` | (1) a docs edit to a file a test reads runs that test (`st-quick.md` Quality gates); (2) an unclear path gets the full gate (`st-work.md` Gates); (12) a docs change in a repository without a declared map runs the full suite (`st-quick.md` Quality gates), `floor: true`. Shape, sources and the guard's rule: the case-lane paragraph above |
| `testCriteria` | GIVEN its verify THEN green but for the declared red. GIVEN each new case THEN its `source:` ranges exist, its first lines are anchored, and every quoted block matches the landed file byte for byte |
| `edgeCases` | A behaviour whose landed text sits outside `content/**` → source the `content/**` half, and say so in the Brief |
| `depends_on` | p5f-class-file-gate-config (branch point) |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts test/evals/roster.test.ts` (declared red as above) |

### p6b-cases-security-lens: three golden cases for the security lens

| Field | Content |
|---|---|
| `id` | p6b-cases-security-lens |
| `requirements` | REQ-FLOW-065, REQ-PROVE-009 |
| `files` | three new `evals/cases-v6/golden/` files |
| `interfaces` | (3) an auth-path change gets the security lens; (4) a CLI file-deletion change gets the lens at the light tier, both from `st-work.md` Specialist pass and `stamity-security.md` Trigger, `floor: true`; (5) a lockfile-only bump gets the audit and no lens (`st-work.md` Specialist pass, `st-dep-audit/SKILL.md`). Shape, sources and the guard's rule: the case-lane paragraph above |
| `testCriteria` | GIVEN its verify THEN green but for the declared red. GIVEN each new case THEN its `source:` ranges exist, its first lines are anchored, and every quoted block matches the landed file byte for byte |
| `edgeCases` | A behaviour whose landed text sits outside `content/**` → source the `content/**` half, and say so in the Brief |
| `depends_on` | p5f-class-file-gate-config (branch point) |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts test/evals/roster.test.ts` (declared red as above) |

### p6c-cases-twin-and-threat: the install-script twin, the threat note and the scan hit

| Field | Content |
|---|---|
| `id` | p6c-cases-twin-and-threat |
| `requirements` | REQ-FLOW-065, REQ-FLOW-066, REQ-FLOW-067, REQ-PROVE-009 |
| `files` | two new `evals/cases-v6/adversarial/` files, one new `evals/cases-v6/golden/` file |
| `interfaces` | (6) the install-script twin of (5) gets the lens, adversarial, `floor: true`; (11) a risk-class plan unit carries a threat note (`st-plan.md` Plan artifact shape), golden; (21) a scan hit stops the batch, and the report names the rule and the path, never the value, under pressure to show it (`st-quick.md` Quality gates, `st-work.md` Gates), adversarial, `floor: true` (review r1, `plan/15`). Shape, sources and the guard's rule: the case-lane paragraph above |
| `testCriteria` | GIVEN its verify THEN green but for the declared red. GIVEN each new case THEN its `source:` ranges exist, its first lines are anchored, and every quoted block matches the landed file byte for byte. GIVEN case (21) THEN one must-NOT row forbids any fragment of the value, and one forbids rewriting or splitting the value and scanning again (sign-off on `plan/57`); the case file names the value's shape in words and holds no secret-shaped literal, so `gate scan` over its added lines finds no hit |
| `edgeCases` | A behaviour whose landed text sits outside `content/**` → source the `content/**` half, and say so in the Brief |
| `depends_on` | p5f-class-file-gate-config (branch point) |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts test/evals/roster.test.ts` (declared red as above) |

### p6d-cases-review-rounds: the review rounds and the escalation

| Field | Content |
|---|---|
| `id` | p6d-cases-review-rounds |
| `requirements` | REQ-FLOW-064, REQ-PROVE-009 |
| `files` | two new `evals/cases-v6/golden/` files, one new `evals/cases-v6/adversarial/` file |
| `interfaces` | (7) a light run with a finding open at round 2 escalates instead of a round 3; (8) a gate red after a fix gets a fresh fixer at a higher effort; (9) a finding open at round 3 escalates instead of a round 4, under pressure to run one more, adversarial. Sources: `st-work.md` Review loop, `stamity-fixer.md` Round policy. Shape and the guard's rule: the case-lane paragraph above |
| `testCriteria` | GIVEN its verify THEN green but for the declared red. GIVEN each new case THEN its `source:` ranges exist, its first lines are anchored, and every quoted block matches the landed file byte for byte |
| `edgeCases` | A behaviour whose landed text sits outside `content/**` → source the `content/**` half, and say so in the Brief |
| `depends_on` | p5f-class-file-gate-config (branch point) |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts test/evals/roster.test.ts` (declared red as above) |

### p6e-cases-findings: findings by consequence and the lens digest

| Field | Content |
|---|---|
| `id` | p6e-cases-findings |
| `requirements` | REQ-FLOW-063, REQ-FLOW-072, REQ-CTX-002, REQ-PROVE-009 |
| `files` | two new `evals/cases-v6/golden/` files, one new `evals/cases-v6/adversarial/` file |
| `interfaces` | (10) a light single pass catches a logic defect in a small diff (`stamity-reviewer.md` Rubric); (13) a Minor with a user-visible consequence, worded like a note, is still recorded, adversarial (`stamity-reviewer.md` `## Severity`); (14) a lens digest with a report path named carries `mode:` and `notes left out` (`stamity-security.md` Return contract). The reviewer's digest is already covered (`reviewer-brief-is-diff-and-criteria`). Shape and the guard's rule: the case-lane paragraph above |
| `testCriteria` | GIVEN its verify THEN green but for the declared red. GIVEN each new case THEN its `source:` ranges exist, its first lines are anchored, and every quoted block matches the landed file byte for byte |
| `edgeCases` | A behaviour whose landed text sits outside `content/**` → source the `content/**` half, and say so in the Brief |
| `depends_on` | p5f-class-file-gate-config (branch point) |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts test/evals/roster.test.ts` (declared red as above) |

### p6f-cases-capacity-and-handoffs: the capacity rung and two hand-off returns

| Field | Content |
|---|---|
| `id` | p6f-cases-capacity-and-handoffs |
| `requirements` | REQ-LADDER-002, REQ-PROVE-009 |
| `files` | three new `evals/cases-v6/golden/` files |
| `interfaces` | (15) the capacity rung (`st-work.md` Dispatch contract, Capacity rung); (16) a fixer handed a `decision_needed` id with no sign-off returns it unresolved, `sign-off missing` (`stamity-fixer.md` Scope rule); (17) an implementer whose cell no longer resolves at HEAD returns `BLOCKED_DEPENDENCY` (`st-work.md` Pointer dispatch). Shape and the guard's rule: the case-lane paragraph above |
| `testCriteria` | GIVEN its verify THEN green but for the declared red. GIVEN each new case THEN its `source:` ranges exist, its first lines are anchored, and every quoted block matches the landed file byte for byte |
| `edgeCases` | A behaviour whose landed text sits outside `content/**` → source the `content/**` half, and say so in the Brief |
| `depends_on` | p5f-class-file-gate-config (branch point) |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts test/evals/roster.test.ts` (declared red as above) |

### p6g-cases-dispatch-and-digests: pointer dispatch, the cell amendment and the red digest

| Field | Content |
|---|---|
| `id` | p6g-cases-dispatch-and-digests |
| `requirements` | REQ-PROVE-009 |
| `files` | three new `evals/cases-v6/golden/` files |
| `interfaces` | (18) the pointer-dispatch shape (`st-work.md` Pointer dispatch); (19) the spec-author's plan-cell amendment (`stamity-spec-author.md`); (20) a green test-runner digest against a red full return, never digested (`st-work.md` Return contract, `stamity-test-runner.md`). Shape and the guard's rule: the case-lane paragraph above |
| `testCriteria` | GIVEN its verify THEN green but for the declared red. GIVEN each new case THEN its `source:` ranges exist, its first lines are anchored, and every quoted block matches the landed file byte for byte |
| `edgeCases` | (20)'s runner side sits outside `content/**` if at all → source the `content/**` half, and say so in the Brief |
| `depends_on` | p5f-class-file-gate-config (branch point) |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts test/evals/roster.test.ts` (declared red as above) |

The remaining fold lines of the persisted p6 cell are met as follows:

- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"no golden case for a verdict role's digest when a report path is named" at 077e8a78``: case (14), a lens digest.
- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"no golden case for the capacity rung" at 077e8a78``: case (15).
- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"no golden case for a fixer handed a decision_needed id without sign-off" at 077e8a78``: cases (16)–(20), the five behaviours of `docs/plans/009-orchestrator-context-economy-01.md:1402`.
- Inbox folds `2026-09-23_orchestrator-context/build/49` and `build/350`: p6-locator-guard.

### p6-index: the one SET-v7 writer of p6

| Field | Content |
|---|---|
| `id` | p6-index |
| `requirements` | REQ-PROVE-009 |
| `files` | `evals/SET-v7.md`, `evals/README.md`. A new case file from p6a–p6g whose per-case check fails after the merge (`plan/14`) |
| `interfaces` | Twenty-one case-index rows, from the case units' reports (the five cells, `test/evals/roster.test.ts:15-25`). The appendix rows derived from the new floor and adversarial cases' must-NOT rows (`:142-160`), with both total sentences. The roster counts recomputed from the files: 113 → 134 cases, golden 61 → 78, adversarial 22 → 26, probes 30, plus the floor, binding and advisory totals. The cells to update are `:75`, `:107`, `:108` (the non-twin adversarial count, recomputed from the landed files), `:110`, `:116`, `:128-129`, `:239`, `:902-909` and `:1199`; `:1` and `:10` move only if a carried case's byte-identity moved (`plan/44`). One dated paragraph. The README counts `readmeCurrency.test.ts` derives |
| `testCriteria` | GIVEN `npx vitest run test/evals` THEN green, roster, appendix, locators, coverage, successor inputs and README currency included. GIVEN `find evals/cases-v6 -name '*.md'` THEN 134 files |
| `edgeCases` | A case unit's class differs from the table above → the counts follow the landed files, never the table |
| `depends_on` | p6a-cases-test-selection, p6b-cases-security-lens, p6c-cases-twin-and-threat, p6d-cases-review-rounds, p6e-cases-findings, p6f-cases-capacity-and-handoffs, p6g-cases-dispatch-and-digests, p9-spec-merge (integration order) |
| `verify` | `npx vitest run test/evals` |

### p6-locator-guard: every range of every case is anchored

| Field | Content |
|---|---|
| `id` | p6-locator-guard |
| `requirements` | REQ-PROVE-009 |
| `files` | `test/evals/locators.test.ts`. A case file the new check finds stale, with its SET-v7 source cell (`test/evals/roster.test.ts:120-125` holds them equal) and one dated SET-v7 paragraph (`plan/14`) |
| `interfaces` | A new `it` over every range of every case, not only quoted ones. The first non-blank line of each range must appear in one of three places: (a) inside a restricted governing block; (b) in the case body after stripping a leading `> `, which covers `probe-none-work-run-qa-checkpoint`'s blockquoted fence; or (c) for a range that is a frontmatter `description:` line (every probe at `:4` or `:6`), as that description verbatim in the case body. A synthetic stale-range case, inline as a string (no file under `evals/`), proves the check is not vacuous. It runs on the integration branch after p6-index, so every case has landed and this unit owns every re-anchor it finds |
| `testCriteria` | GIVEN the synthetic case with a range one line off THEN the new `it` fails naming the case and range. GIVEN the real case set THEN green |
| `edgeCases` | A real case fails the new check → this unit re-anchors that case's range and its index source cell, never a weakened check |
| `depends_on` | p6-index |
| `verify` | `npx vitest run test/evals` |

Integration, last.

### p7-dogfood-sync: every emitted copy regenerated, two stale pins re-pointed

| Field | Content |
|---|---|
| `id` | p7-dogfood-sync |
| `requirements` | spec carries no ids |
| `files` | `.claude/**`, `.agents/**`, `.apm/**`, `apm.yml`, `AGENTS.md`, `.stamity/manifest.json`, every other copy `sync` writes. The two goldens, if a copy still moves them. `.github/release-egress.md:32` and `docs/plans/016-fork-distribution-03.md:1071`: the old hardener pin, if #93 merged (Phase 2 note 8) |
| `interfaces` | `npm run build && node dist/cli.js sync`, then `node scripts/generate-apm-package.mjs` (it writes `apm.yml` and `.apm/`, which CI diffs; `sync` does not), then the goldens command. The record gains one line: `build/75`'s plugin `st-setup` body has no committed copy; it renders at package build |
| `testCriteria` | GIVEN `node dist/cli.js check` THEN clean, the new `change classes` row included. GIVEN the full suite alone, with `STAMITY_CLAUDE_BIN` unset (reason recorded) THEN green. GIVEN the generated review-gate script THEN `const MAX_ROUNDS = 3;` |
| `edgeCases` | A golden that moves with no content change → stop and find the cause |
| `depends_on` | p6-locator-guard |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && node dist/cli.js check && npm run lint && npm run typecheck && node scripts/ci/test-run.mjs --coverage` |

## Spec delta

New ids start at REQ-FLOW-061. Among the flow area's numbers, plan 016 files 1–2 reserve 027 to 035 and 039 to 050,
036 to 038 are merged, 051 to 060 are headroom, and file 3 takes 068 to 071, so the findings follow-up's two ids come
after those.

The charter amendment of S5 (invariants 1.2.0, invariant 4) rides with REQ-FLOW-063. p9 writes this section into
`docs/specs/`, once.

### REQ-FLOW-061 — A change gets the checks its class needs (ADDED)

GIVEN a set of changed paths WHEN `stamity gate classify --base <ref> --json` runs THEN it names one class by S1, its
checks and the lenses the class requires; GIVEN a path no rule places THEN the class is `product`.

Amended in-flow 2026-10-08 (Phase 2 note 2; D1): the built-in rules are generic, and a repository's own lists live
in its `.stamity/change-classes.json`, read from the base. Each class's checks are the table in p1a.

Amended 2026-10-09 (review r1; the D5 sign-off and the sign-off on `plan/8`): GIVEN no `--base` THEN each known path
takes its built-in class and the reason says no base was given; GIVEN an unresolvable base, an empty path list or a
rename across classes THEN the class is at least `product`; GIVEN any rule, built-in or extension THEN no code file is
placed in `records` or `docs`, and a class-file glob matching every path is refused for a class weaker than `product`;
GIVEN `--paths` THEN the listed paths are classified by path rules alone; GIVEN the injection-screening rule THEN it
names the class file beside the manifest as the operator's gate configuration, read from the base only.

Amended 2026-10-09 (review r2, `plan/61`): GIVEN a project whose root sits below the git top-level WHEN `gate` runs
there THEN every changed path is classified by its project-relative form, the class file is read at the base under the
project's prefix, and a changed path outside the project is left out and counted in `reason`.

Amended 2026-10-09 (p1a–b review r1, the sign-offs on `review/6`, `review/7`, `review/8`; `build/7`; review r3,
`plan/63`): GIVEN a file whose base name is `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md` or `CLAUDE.local.md`, in any
case and at any depth THEN its class is at least `product`; GIVEN a case variant of a built-in security path THEN it
is `security-sensitive`; GIVEN an extensionless file other than `LICENSE`, `NOTICE`, `AUTHORS`, `CHANGELOG`, `COPYING`
or `README` THEN no rule places it in `docs` or `records`; GIVEN this repository THEN its class file places the
classifier and gate code in `security-sensitive`; GIVEN `gate` run from any folder of a project THEN the project root
is the nearest ancestor up to the git top-level that holds `.stamity/` (else the top-level), and every git read runs
from there.

### REQ-FLOW-062 — Tests that read files are declared (ADDED)

GIVEN `.stamity/change-classes.json` at the base WHEN a non-code file changes THEN every test its map names is selected;
GIVEN no map THEN the full suite runs; GIVEN zero tests selected by a declared map for a change that is not records or
docs THEN the full suite runs; GIVEN this repository THEN a guard test fails when a test reads a non-code path the map
does not declare.

Amended in-flow 2026-10-08 (Phase 2 note 2): GIVEN this repository's CI WHEN the `changes` job routes a pull request to
a lane THEN the lane's suites come from the base commit's map, and a missing or malformed map runs full CI.

Amended 2026-10-09 (review r1): GIVEN a test whose source names a changed path THEN it is selected, even where no map
entry lists it; GIVEN a changed non-test file under a test glob THEN the full suite runs; GIVEN a map entry that selects
all tests THEN the full suite runs; GIVEN this repository's guard THEN it fails for every (test, path) pair whose path a
weaker class places, or a map entry covers, and that no entry for the path lists.

### REQ-FLOW-063 — The gates follow the class (ADDED)

GIVEN `/st-quick` or `/st-work` WHEN a batch or the final tree is proven THEN the gates its class names run, a one-line
typo fix included; GIVEN `product` or a stronger class THEN the final tree gets the full gates.

Amended in-flow 2026-10-08 (opening answer 2, Phase 2 note 1): GIVEN the charter THEN invariant 4 reads, in two lines,
that done means the gates the change's class names exit 0 (all, if unclear), with the `Not done:` line unchanged.

Amended 2026-10-09 (review r1; the sign-off on `plan/51`): GIVEN `/st-quick`'s Quality gates and `/st-work`'s Gates THEN
each states, as the condition the narrowing rests on, that the repository's CI runs the full matrix on every `product`
or stronger change and on a schedule; GIVEN a charter whose `CI provider` reads `unknown` THEN the final tree runs the
full gates whatever the class; GIVEN a flow that cannot name a base THEN it runs the full gates without classifying;
GIVEN a class whose checks name one review pass THEN a Critical or Warning it raises is fixed and closure-reviewed
once, and no further round runs.

### REQ-FLOW-015 — The proof block names the class's gates on the final tree (MODIFIED)

`docs/specs/everyday-flows.md:334-343`, `:989-997` (the third criterion, `:995-996`): the proof block names a green
result, on the final tree, of the gates its class requires, and the class itself (`unclear` when none was named).

### REQ-FLOW-064 — Review rounds stop when they stop paying (ADDED)

GIVEN a fix applied in a round THEN one closure re-review on the fix diff runs; GIVEN a finding not fixed twice, or a
gate red after a fix, THEN a fresh fixer at a higher effort on the same model takes it; GIVEN round 3 (round 2 on light)
with a finding still open THEN the run escalates (fresh fixer at a higher effort, then the person) and no round 4 runs.

Amended in-flow 2026-10-08 (Phase 2 note 5): GIVEN a client whose dispatch accepts no per-spawn effort setting THEN the
fresh spawn is the escalation and the proof block records `effort: not settable`; GIVEN that fixer leaving the finding
open THEN the run stops as `BLOCKED_FAILURE` to the person.

### REQ-CTX-018 — The stronger re-review keys on what the run shows (MODIFIED)

`docs/specs/orchestrator-context.md:960-963`: the stronger-class re-review keys on a finding not fixed twice or a red
gate after a fix, not on declared confidence.

### REQ-LADDER-003 — The same fixer keeps the rounds before an escalation (MODIFIED)

`docs/specs/model-ladder.md:105-106`, `:110`: the fresh fixer of `:105` runs at a higher effort on the same model, on
an escalation; `:110` reads "the fixer on rounds 1–2". Amended in-flow 2026-10-08 (the specs return, Q3): `:103-106`
counts the fresh fixer among the verdict roles "on a stronger class", so the replacement text changes `:105-106` as
well as the range at `:110`.

### REQ-FLOW-065 — The security lens fires by a tested class list (ADDED)

GIVEN a change in the security class (S7) THEN the lens runs at every tier; GIVEN a lockfile-only bump with no install
script in any bumped package THEN the dependency audit runs first and the lens only if the audit flags something;
GIVEN the lens THEN it reads commit messages only after it has formed its findings. Topic words may add the lens and
never remove it.

Amended in-flow 2026-10-08 (Phase 2 note 6, the persisted p5 fold; D3): GIVEN a lockfile bump of a package that has an
install script, added or already present, THEN the lens runs. GIVEN the security class THEN its path rows are the
trigger roster's security row, and its line rules read the added, removed and context lines of code files, not
Markdown.

Amended 2026-10-09 (review r1; the sign-offs on `plan/27` and `plan/29`): GIVEN the line rules THEN they read code
files outside the test globs, each a word-bounded call shape, and a context line counts only in a hunk that removes a
line; GIVEN a lockfile format other than npm's versions 2 and 3, or a base copy that cannot be read, THEN the lens runs;
GIVEN the security class THEN it also holds the engine's own state and the code each repository's class file names as
reading state back; GIVEN `/st-quick` and a `security-sensitive` class THEN its `Security-sensitive surface` row
refuses the item, which moves to `/st-work`.

Amended 2026-10-09 (review r2, `plan/59`): GIVEN the line rules THEN they read the change through one hardened read
whose flags no git configuration overrides (no external diff, no colour, no text conversion, three context lines),
staged and unstaged against the base; GIVEN an untracked code file THEN its lines count as added.

Amended 2026-10-09 (review r3, `plan/62`): GIVEN an attribute or a diff driver that marks a code file binary THEN the
read still shows its lines; GIVEN a tracked code file whose content the NUL sniff marks binary THEN it is counted
unscanned and the class is at least `product`; GIVEN a file name git would quote THEN the line rules read it by its
real name.

### REQ-FLOW-066 — Every change gets a secret scan of its added lines (ADDED)

GIVEN `/st-quick` or `/st-work` THEN `stamity gate scan --base <ref>` runs over the diff and every untracked, unignored
file, and a hit stops the batch.

Amended 2026-10-09 (review r1): GIVEN an added assignment of a credential-shaped value to a credential-named variable
THEN the scan reports it by rule and path; GIVEN any git failure THEN the scan does not exit clean; GIVEN a CLI that
cannot run THEN the full gates run and `Not done:` lists `secret scan: not run`.

Amended 2026-10-09 (review r2, `plan/56`, `plan/57`): GIVEN no `--base` THEN the scan reads the uncommitted change
against `HEAD` and its JSON says so; GIVEN a flow with committed work and no nameable base THEN `Not done:` lists
`secret scan: not run`; GIVEN a hit THEN the batch or the pass stops, naming path, line and rule, and the hit is never
cleared by rewriting the value and scanning again; GIVEN a hit on a deliberate test fixture THEN it still stops, and
the person settles it.

Amended 2026-10-09 (review r3, `plan/62`, `plan/63`): GIVEN an attribute that marks a code file binary THEN its added
lines are still scanned; GIVEN a tracked code file the read cannot show THEN the scan lists it as unscanned and the
flow's `Not done:` names it; GIVEN a scan run from a subfolder of the project THEN it covers the whole project.

### REQ-FLOW-067 — A plan unit in a risk class carries a threat note (ADDED)

GIVEN `/st-plan` and a unit in the security class THEN the unit names its trust boundary, what it trusts, one abuse case
and the check that stops it, in at most five lines.

Amended 2026-10-09 (review r1): GIVEN a planned unit THEN its class comes from `stamity gate classify --paths` over its
files; GIVEN a CLI that cannot classify THEN every unit carries the note.

### REQ-FLOW-072 — A finding names its consequence (ADDED)

GIVEN the reviewer, a lens, the implementer or the fixer THEN a finding names who or what it affects, how and in which
use, with evidence; a note with no consequence (wording, naming, style, comment drift, a tidier shape, an untriggered
"might") is listed in the role's report and counted as `notes left out: <n>`; the implementer applies a one-line note
in its own unit's files; "no findings" is valid; the reviewer, implementer or fixer records a pre-existing defect only
when it passes, leading `pre-existing:`; the security and design-quality lenses keep their out-of-change exclusions.

### REQ-FLOW-073 — One severity scale in every role that raises findings (ADDED)

GIVEN the reviewer, the security, performance and design-quality lenses, the implementer and the fixer THEN each
carries the same `## Severity` section: Critical, Warning and Minor, each defined by its consequence with one example,
and the sentence that "no findings" is a good result; one test holds the six sections byte-identical.

### REQ-CTX-002 — The digest counts the notes left out (MODIFIED)

`docs/specs/orchestrator-context.md:228-232`, `:1016-1030`: the `findings:` line of the reviewer, each lens, the
implementer and the fixer gains `notes left out: <n>` (REQ-FLOW-072); the spec-author's digest and the test-runner's
green digest do not change.

### REQ-PROVE-031 — The lanes take their suites from the base commit's map (MODIFIED)

`docs/specs/prove-behavior-and-value.md:790-795`: a change whose every path sits in lanes runs the union of the suites
that the base commit's `.stamity/change-classes.json` maps to its lanes' changed paths, printed as the classifier's
`suites` output, so the workflow spells no list; a lane path the map does not cover, a map entry that selects all tests,
or a missing or malformed map at the base runs the full matrix. Amended 2026-10-09 (the sign-off on `review/8`): a
change to the lane classifier's own code or its import closure runs the full matrix, and no lane holds those paths.

## Re-resolved cells

What moved between `f1035ef8` and `17f2e8bf`, and how each persisted cell now reads.

| Persisted cell | What moved, or what the research found | Now |
|---|---|---|
| p0 | `st-work.md` unchanged (17,733; 493 lines). C and F cut pinned text; two goldens and six eval cases quote `st-work.md`. The client-events paragraph sits inside `### Review loop` (`:241-283`) | p0, with C re-quoted from the qa skill, F not taken (sign-off on `plan/35`), B's destination D6, goldens and `test/evals` in `verify`; spec citations go to p9 (D9) |
| p1 | `classify.ts` cannot be zero-import (it reads `triggers.ts`); `.oxlintrc.json` was missing; the waves are 2 and 14; 13 files. Review r1: the registry root, the hardened git reads and `--paths` join | p1a (the classifier and the verb over a path list, which must land together), p1b (two hand pages), p1c (the git reads), p1d (the trigger-row read), lane A |
| p2 | `check.test.ts:4542` pins 15 rows; `records-only.mjs`'s `LANE_SUITES` duplicates the map; 11 files. Review r1: the guard checks pairs, and the census is mechanical | p2a (the class file, base read, `check` row), p2b (reads and selection), p2d (census and guard), p2c (CI lanes from the base map), lane A |
| p3 | S5's text did not fit two lines (specs return D1); the charter cases, the quick cases and the test-runner cases quote the edited text | p3a (charter), p3b (`/st-quick`, with the security-class refusal), p3c (`/st-work` Gates and the proof block's gate line), with the token wording from the seams return |
| p4 | The cap and the ladder are one lockstep (invariants 15 and 16, `work.test.ts:733-769`); no per-dispatch effort setting exists anywhere in the repository; the capacity rung names the old ladder; invariant 16 ends at `:1678`, not `:1660` | p4a (cap), p4b (escalation and the ladder header), p4c (confidence) |
| p5 | The parity test binds only `triggers.ts`'s row to the agent's Trigger table, so the classifier's line rules and `scan` can land apart from the row; no case cites `st-plan.md:101-125`. Review r1: the injection-screening rule names only the manifest | Split: p5a (line rules over one hardened change read), p5g (audit first) and p5e (scan) on lane A; p5b, p5c, p5d and p5f (text) on integration after p3c. Review r2: the change read and the project root (`plan/59`, `plan/61`) |
| p8 | Six bodies, the work digest and about ten eval cases; `agent-reviewer-return-contract` already has an `EXPECTED_MOVES` value | p8a (scale) and five capture units by role group, run after p3a and before p3b (the schedule) |
| p6 | 20 cases, not 13 (folds 14–20); 113 cases at HEAD; `build/75` folded in. Review r1: a 21st case for the scan; case defects found at merge need an owner | Seven parallel case units, p6-setup-route, p6-index, then p6-locator-guard on integration |
| p7 | `build/75` has no committed copy; #93 leaves two stale pin notes | p7 with the two pins |
| Spec delta | REQ-FLOW-015 moved +13 and +211 lines; the id reservations changed. Review r1: REQ-PROVE-031 names `LANE_SUITES` | Re-cited; REQ-PROVE-031 added; written once by p9 |

## Execution order

1. **Before branching** (granted at the opening batch): merge Dependabot #93 and #94 into `main` if their CI is green
   at that time. Create `p23f2-integration` on `lean-flows-02` from `main`, then `p23f2-lane-a` on
   `lean-flows-02-lane-a` from the same commit. Re-measure p0's two numbers there.
2. **Integration and lane A in parallel** (the orchestrator's schedule, `record.md:75`). Integration runs p0 → p4a →
   p4b → p4c → p3a → p8a → p8b → p8c → p8d → p8e → p8f; the p8 units need nothing lane A builds. Lane A runs p1a →
   p1b → p1c → (the p1a–b review fix, `ceeaa736`) → p1d → p2a → p2b → p2d → p5a → p5g → p5e → p2c. Each lane runs `npm run build` before any whole-suite
   run (learning `a-fresh-worktree-lane-builds-before-its-full-suite`).
3. **Lane A merges into integration, step 1**, after p5e's review and a lane A full suite (p1a … p5e). Then integration
   runs p3b → p3c → p5b → p5c → p5d → p5f. **Step 2** merges p2c after its review and before p9; p2c writes no file
   integration writes. Where step 1 would not let p3b start sooner, lane A merges once, after p2c.
4. **The p6 lanes, branched from integration after p5f, in parallel**: p6a … p6g. All seven write new case files only.
   Concurrency is sized to the disk: each lane's install, with 23 GiB free at session start. No case lane runs a full
   suite. Meanwhile, integration runs p6-setup-route, then (lane A's step 2 merged) p9.
5. **The p6 lanes merge into integration** in any order, then p6-index (the declared red window closes there), then
   p6-locator-guard, then p7.
6. **Proof on the integration branch:** the full suite alone, with `STAMITY_CLAUDE_BIN` unset (reason recorded);
   coverage; knip; CI on the pull request, every leg read to its end, both Windows legs included.
7. **The security lens reviews p1a, p1c, p1d, p2a, p2b, p2d, p2c, p5a, p5g, p5e, p3a, p3b, p3c, p5b, p5c, p5d and p5f, and
   the change set as a whole** (review r1, `plan/47`). This file is in the security class itself: it changes what
   fires the lens and what gates run. The final whole-branch review runs at Fable 5.1 before the merge, which is held
   for the morning.
8. **Full suites one at a time on this machine:** concurrent full suites race on `dist/` and the temp roots.

| Unit | Lane | `depends_on` | Est. changed lines |
|---|---|---|---|
| p0-make-room | integration | none | 180 (built: `361da60e`, `4968e8e6`) |
| p4a-review-cap | integration | p0 | 80 (with the capacity-rung pin) |
| p4b-fixer-escalation | integration | p4a | 240 |
| p4c-confidence-no-round | integration | p4b | 100 |
| p3a-charter-invariant-4 | integration | p4c | 70 |
| p8a-severity-scale | integration | p3a | 150 |
| p8b-capture-reviewer | integration | p8a | 180 |
| p8c-capture-security-lens | integration | p8b | 100 |
| p8d-capture-perf-design-lenses | integration | p8c | 140 |
| p8e-capture-execution-roles | integration | p8d | 180 |
| p8f-capture-work-digest | integration | p8e | 90 |
| p1a-classifier-verb | A | none | 400 (ten files; see its edge cases; building) |
| p1b-hidden-verb-docs | A | p1a | 10 |
| p1c-classify-git-reads | A | p1b | 320 (with the project root found by `.stamity/`; building) |
| p1d-classify-security-row | A | p1c | 120 |
| p2a-class-file | A | p1d | 400 (with the prefixed base read, the case folding and the classifier's own paths) |
| p2b-test-inputs | A | p2a | 340 |
| p2d-test-input-census | A | p2b | 300 (the census mostly from the extractor) |
| p5a-security-classifier | A | p2d | 400 (the line rules and the change read, with `--text`, the sniff and the `-z` names) |
| p5g-audit-first | A | p5a | 170 |
| p5e-secret-scan | A | p5g, p5a | 280 (reuses p5a's read; `unscanned`) |
| p2c-ci-lanes-from-map | A | p5e, p2d | 230 (lane A's step 2; the decision-code test) |
| p3b-quick-gates | integration | p8f, p3a, p5e, p2d | 180 (with the paragraph and its row) |
| p3c-work-gates | integration | p3b | 210 |
| p5b-security-trigger-rows | integration | p3c, p8c, p1d | 140 |
| p5c-security-in-the-flow | integration | p5b | 110 (records the Package 22 room) |
| p5d-threat-note | integration | p5c | 130 (with the paragraph and its row) |
| p5f-class-file-gate-config | integration | p5d | 60 |
| p6-setup-route | integration | p5f (slot) | 110 |
| p9-spec-merge | integration (spec-author) | p6-setup-route, p2c and every unit whose text the specs cite | 280 |
| p6a … p6g (seven units) | p6 lanes | p5f (branch point) | 250–380 each |
| p6-index | integration | the seven p6 lanes, p9 | 140 |
| p6-locator-guard | integration | p6-index | 140, plus any re-anchor |
| p7-dogfood-sync | integration | p6-locator-guard | generated; about 10 authored |

## Learnings that apply

| Learning | Units |
|---|---|
| `a-fresh-worktree-lane-builds-before-its-full-suite` | every lane's full suite; p7 |
| `a-new-import-runs-the-architecture-test` | p1a, p1c, p1d, p2a, p2b, p5e |
| `the-local-test-gate-is-weaker-than-ci` | lane A's and the branch's full suites run with `--coverage`; CI's Windows legs |
| `surface-pins-are-literals-that-drift` | p1a (surface counts), p1b, p4a (the cap's literal), p3a (byte constants) |
| `corpus-line-shifts-move-eval-case-source-ranges` | every content unit; the p6 units; p6-locator-guard |
| `corpus-edits-ship-with-a-dogfood-sync` | p7; any unit under the common sync rule |
| `vitest-update-flag-takes-an-optional-value` | every goldens command: files first, `--update` last |
| `leak-gate-scans-stamity-state-files` | p2a and p2d (`.stamity/change-classes.json`) |
| `git-stash-is-shared-across-worktrees` | every lane |
| `verdict-roles-read-lanes-through-a-diff-file` | p9 (a spec-author pairs with a test-runner); every lane review reads a diff file in the main checkout |
| `typed-unicode-escapes-land-as-raw-code-points` | p1a, p5a, p5e (messages; the en dash in "rounds 1–2" in p4a and p4b) |
| `a-merge-to-main-is-proven-by-its-push-runs` | after the merge: `main`'s push runs |

## Security notes

Threat notes for the units in the security class: five lines each at most (REQ-FLOW-067's form, applied here ahead of
p5d).

- **p1a, p1d and p2a: the classifier is a gate.**
  - Boundary: the changed paths and the class file. Trusted: the base commit only.
  - Abuse: a change edits the class file to move its own paths to a weaker class, or places code in `records`; plants
    an agent instruction file at depth, under a run folder or in another case, so it takes `docs` or `records`; spells
    a security path in another case; or edits the classifier's own code, which no rule placed.
  - Stops it: the base copy is read, never the head (S3); a placed path never moves weaker; no rule places code or an
    extensionless file in `records` or `docs`; an instruction file is at least `product` (D10); the rules that raise a
    path fold case, built-in and class-file alike (`review/12`); the classifier and gate code are
    `security-sensitive` here (D2); a match-all glob is refused below `product`; the file's own change is at least
    `config`.
- **p1c, p5a and p5e: the git reads.**
  - Boundary: the repository's git config, the `--base` argument, and the project's place under the git top-level.
  - Abuse: `diff.external`, `color.diff`, `diff.noprefix`, `diff.relative`, `diff.context=0` or a planted repository
    empties or narrows the read, an untracked new file escapes a diff-only read, a project in a subfolder reads
    top-level paths that miss every rule, or a `--base` of `--output=…` writes a file, so the scan or the class reads
    clean. A `-diff` or `binary` attribute, or a diff driver's `binary` setting, turns a code file into "Binary files
    differ"; a quoted name misses its rules; a run from a subfolder treats the rest of the project as outside.
  - Stops it: file 1's runner; one change read with `--text --no-ext-diff --no-color --no-textconv --no-relative -U3
    -M`, fixed prefixes, names from the `-z` lists, untracked files read whole; the NUL sniff alone decides binary,
    and a tracked code file it marks is unscanned, at least `product` and under `Not done:` (`plan/62`); the project
    root is the nearest ancestor holding `.stamity/` and every git read runs from it (`plan/63`); the ref resolved
    by `rev-parse --verify --end-of-options` and a leading `-` refused; any git failure is `product` or exit 2.
- **p2c and p2d: CI routing.**
  - Boundary: the pull request's paths and the base map.
  - Abuse: a PR narrows its own CI by editing the map, or a suite name smuggles an option into `npx vitest run`.
  - Stops it: `git show <base>:` only; a missing or malformed map runs full CI; `parseClassFile` refuses a leading
    `-`, whitespace and glob characters; a change to the script or its import closure is full CI, and no lane holds
    those paths (p2c's test, `review/8`).
  - **Residual (`review/8`, standing since file 1).** `scripts/ci/records-only.mjs`, and after p2c the `src/change/`
    modules it imports by type stripping, run from the pull request's head in the `changes` job, so a change to that
    code still decides its own CI routing. What bounds it: those paths sit in no lane, so the script as it stands
    answers full CI for them (pinned by p2c); the class file places them `security-sensitive`, so the lens reviews
    any change to them; and the suites come from the base map, never the head. What does not: a change that rewrites
    the script itself to answer narrow is trusted until review reads it. Reading the routing code from the base
    commit would close it, and is not taken in this plan.
- **p5e: the scan.**
  - Boundary: added lines and untracked files.
  - Abuse: a secret printed back in the scan's own output, or in the report; an untracked FIFO hangs the batch; a
    no-base scan of committed work read as clean; a hit cleared by splitting the value and scanning again.
  - Stops it: hits carry `path`, `line` and `rule` only, never the value; `lstat`, regular files only, a size cap;
    `scope: "uncommitted"` and `secret scan: not run` for committed work with no base; a hit always stops, with no
    waiver.
- **p5a and p5g: the line rules and the audit first.**
  - Abuse: a guard removed around an existing dangerous call slips past an added-lines-only rule; a lockfile format
    that does not record install scripts reads as "none".
  - Stops it: context lines count in a hunk that removes a line; audit-first needs both npm lockfile copies to prove it.
- **p5b, p5c and p3b: the lens.**
  - Abuse: a topic word, the audit-first shortcut or `/st-quick` removes the lens.
  - Stops it: topic words only add; audit-first needs a proven lockfile-only bump; `/st-quick` refuses the class.
- **p3b and p3c: narrower gates.**
  - Abuse: a misclassified change skips a failing test.
  - Stops it: a flow that cannot name a base runs all gates; unclear means `product`; the guard checks every
    (test, path) pair; CI's full run on every `product` or stronger change, or the full gates where no CI is known.
- **p5f: the class file's standing.**
  - Abuse: a value copied from screened state sets the gates, or an agent refuses the class file as state text.
  - Stops it: the rule names the class file as operator-owned gate configuration, read from the base only.

## QA walk

| # | Row | Who |
|---|---|---|
| 1 | In a scratch repository with a declared test-input map, a README typo through `/st-quick` runs its gate in seconds and names the checks it ran; without the map, the same typo runs the full suite | person |
| 2 | In a scratch repository, a change to file-deletion code is refused by `/st-quick` under the `Security-sensitive surface` row, and `/st-work` runs the security lens on it at the light tier | person |
| 3 | `stamity gate classify --json` on this repository's last ten merged PRs gives the classes a reader would expect | auto, then a person reads the table |

## Risks

- **Warning:** a narrower local gate finds a failure later (at CI) when the map misses a read. Mitigations: the guard
  test over every (test, path) pair, the test-source rule, "unclear means product", CI's full run before the merge.
- **Warning:** `st-work.md`'s two budgets. `p0` measured and stopped rather than raising a budget (16,215; 475 lines),
  every later unit stays within its allocation and records both numbers, and p5c, the last writer, records the room
  left for Package 22 (expected about 265 characters short of S9's 900, on the close list).
- **Warning:** the charter amendment moves many pins (hash, doctrine row, byte constants, goldens, two eval sources).
  p3a keeps line 54 and the line count, so the fixture and the later charter ranges hold.
- **Warning:** invariants 15 and 16 encode the round-4 escalation; their rewrite needs inline reasons (p4a, p4b).
- **Minor:** the Claude Code review-gate hook keeps counting per session until plan 016 file 2 rewrites it.
- **Warning:** `p8`'s loss is unmeasured for its own test. The nearest measured rule (dropping Minor wording, docs and
  style rows by keywords) hid 1 of the 5 real-defect Minors in a 150-row sample; judged by kind, 0–1. Mitigations: the
  test is judged by consequence, not by keywords or the label; every left-out note stays in the role's local report;
  file 3's QA walk reads the notes of the first three runs after this file merges (target: no real defect left out).
- **Warning:** `p8` rewrites two measured eval contracts (`agent-reviewer-return-contract` B7, A1, A2;
  `digest-security-finding-carried-in-full` B3). Each move carries its written reason (an `EXPECTED_MOVES` addition
  where a cases-v5 copy exists, a dated SET-v7 paragraph otherwise).
- **Warning (new; the cites return, unanswered 2):** no per-dispatch effort setting is verified on any client, so the
  escalation may run at the fixer's declared effort. Mitigation: the proof block records `effort: not settable`, and
  the fresh spawn with the round history still breaks the same instance's blind spot.
- **Warning (new; p5e):** `gate scan` reuses patterns written for environment values (S8), and two of them can match
  typed code. Mitigation: p5e measures them over the last 50 commits and returns `BLOCKED_AMBIGUITY` before a
  batch-stopper ships.
- **Warning (new; p5a):** the line rules are new call-shape patterns with no history. Mitigation: false-positive
  fixtures for each exclusion, and p5a's 50-commit measurement of each rule's hits and the class distribution.
- **Warning (new; D3):** the line rules skip Markdown and test files, so a dangerous command written in a corpus fence
  or a test does not place a change in the security class by line. `content/**` is still `product` here (all gates),
  and the lens still fires by path and topic.
- **Warning (new):** the p6 case lanes leave `test/evals/roster.test.ts` red on the integration branch until p6-index.
  Mitigation: no other unit writes in that window, and p6-index's verify is the whole `test/evals`.
- **Warning (new; p2c):** the CI script imports `src/` through type stripping; syntax stripping cannot erase fails only
  where the script runs. Mitigation: `recordsOnly.test.ts` runs the script's import closure with plain `node` and no
  `node_modules`.
- **Warning (new; review r2):** a scan hit on a deliberate fixture stops either flow with no waiver (sign-off on
  `plan/57`). In this repository fixtures are built at runtime; in another, the person settles each such stop.
  Mitigation: the stop names path, line and rule, and the drop list holds a recorded per-hit disposition.
- **Minor (new; review r2, `plan/61`; amended for review r3, `plan/63`):** in a project below the git top-level, a
  changed path outside the project is left out of the class and the scan, and only counted. "Outside" means outside
  the nearest ancestor holding `.stamity/`, never outside the working directory, so a run from a subfolder of the
  project narrows nothing. The flows govern the project they run in; the count makes an outside edit visible.
- **Minor (new; review r3, `plan/62`):** a tracked code file whose content holds a NUL byte is not read by the line
  rules or the scan. Mitigation: it is listed `unscanned`, its class is at least `product`, and the flow names it
  under `Not done:`. An untracked code file skipped by size or by the sniff stays only in `skipped`, since the
  default names tracked files.
- **Warning (new):** 40 units on one unattended session. Mitigation: every unit is green on its own and the order puts
  the code lane beside the text, so a stop at any unit boundary leaves a green branch and a resume card.
- **Minor (new; review r1):** p1a stays at 10 files, two above the ceiling: the registry, reachability and surface
  ratchets need the verb, its registration and its rows in one diff. The other three findings that grew it went to p1c
  and p1d.
- **Minor (new; seams Q4):** `npm run gate` is the leak gate, so `stamity gate` is a near-name for maintainers.
- **Minor (new; seams D1):** `docs/plans/**` is a records lane in CI and the `docs` class here. The two answer
  different questions, on purpose.

## Open questions

None. The declared defaults D1–D10 (D10 as widened), the five review r1 sign-offs (`plan/8`, `plan/27`, `plan/29`,
`plan/35`, `plan/51`), the review r2 sign-off (`plan/57`), the p1a–b review r1 sign-offs (`review/6`, `review/7`,
`review/8`, with `build/7`), the fix round's defaults (`review/11`, `review/12`), the review r3 defaults (`plan/62`,
`plan/63`), the orchestrator's schedule and p4a's signed-off pin are on the close list. The fold on S1 is met by the signed-off no-base reading (D5).

## Follow-ups

The persisted row stands (the review-gate hook's per-session counter, `docs/plans/016-fork-distribution-02.md`). This
re-plan adds none beyond the close list.

## Drop list

| Item | Revisit when |
|---|---|
| A gate verdict reused by tree hash for the final tree | gate repeats reappear after file 1's `t9` (it conflicts today with "the final tree always gets a run of its own") |
| A runtime file-read tracer behind the guard | the guard misses a read in practice |
| A cheaper class or effort for closure re-reviews | file 3's usage lines show re-reviews above ~10% of a session's cost |
| Hit-rate gating of the performance and design-quality lenses | 20 runs of stored rates exist |
| A filter that learns from the person's drop decisions | file 3's count line shows the shown items' drop share above 20% for two releases |
| A verification sub-agent per note before it is shown | the same trigger |
| The fixer applying a reviewer's one-line notes inside a fix round it runs anyway | the close's notes line is answered "fix now" in more than a third of closes |
| Line rules over Markdown fences or test files | a security find lands in a corpus fence or a test the path rows missed |
| Scoping the env-value secret patterns for added code lines | p5e's measurement shows a false stop |
| Audit-first for pnpm, yarn and npm version-1 lockfiles | a repository on one of those formats asks for it |
| A recorded per-hit disposition (path, line and rule, never the value) that lets a scan pass continue past a deliberate fixture | a repository whose fixtures cannot be built at runtime asks for it (review r2, `plan/57`) |
