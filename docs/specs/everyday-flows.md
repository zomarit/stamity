---
id: everyday-flows
# A design document, authored from docs/plans/013-optimization-sweep-02.md and -03.md on 2026-09-30, merged at the Prove phase of run 2026-09-30_optimization-sweep, amended at the close of run 2026-10-03_pack-engine-defects on 2026-10-06, amended from docs/plans/016-fork-distribution-00.md at the Prove phase of run 2026-10-07_security-fixes on 2026-10-07, amended in run 2026-10-08_maintainer-tooling on 2026-10-08, amended in run 2026-10-08_product-core on 2026-10-09, amended in run 2026-10-10_next-tier on 2026-10-10, amended in run 2026-10-12_board-writes on 2026-10-12, one citation re-pointed in run 2026-10-13_records-branch on 2026-10-14, amended in run 2026-10-14_cli-native on 2026-10-14 and 2026-10-15, amended in run 2026-10-15_cloud-runs on 2026-10-16, amended in run 2026-10-18_cloud-runs-2 on 2026-10-18, and excluded from the site build.
# The records moved to the `records` branch on 2026-10-14; every path below that names this repository's own records — under `.stamity/runs/`, `.stamity/evidence/`, `.stamity/handoffs/`, `.stamity/inbox.md`, `docs/plans/`, `evals/runs/`, `evals/measurements/` or `evals/reach/` — reads on that branch (REQ-PROVE-023 in docs/specs/prove-behavior-and-value.md). A path of the run layout a consuming repository writes, such as `.stamity/runs/<run-id>/`, is the product's and is not one of them.
status: shipped-with-1.15.0
obsolete_when: every requirement below is pinned by a test or an eval case that names its id and the command reference carries it, or a decision row cuts the surface
---
# Everyday flows

What the nine commands and the setup that serves them do for a user day to day: calls resolve, gates run and report
honestly, records say what happened, and the person is asked only what needs the person. The area code is `FLOW`.
REQ-FLOW-001 to REQ-FLOW-026 shipped with 1.11.0, and REQ-FLOW-036 to REQ-FLOW-038 with 1.12.0, which set
`status: shipped-with-1.12.0`. REQ-FLOW-025's allowlist sentence did not ship with them; `## Concerns` says so, and
an inbox row follows it up. It landed on 2026-10-08 in run `2026-10-08_maintainer-tooling` (REQ-FLOW-025, amended)
and shipped with 1.14.0. The text dated 2026-10-08 that names that run comes from its spec
deltas (plan 019 file 1), each taken from the latest unit or fixer report that states it and read against the
integration head `47acb16e`; lane D's, under REQ-FLOW-026, REQ-FLOW-037 and REQ-FLOW-038, against `dbd54fc7`.
REQ-FLOW-061 to REQ-FLOW-067, REQ-FLOW-072 and REQ-FLOW-073, and the text dated 2026-10-09, come from the spec delta
of run `2026-10-08_product-core` (plan 019 file 2, re-planned in that run), merged by its unit `p9-spec-merge` against
the integration head `90710ba5`, where every citation of `content/commands/st-work.md` and
`content/agents/stamity-test-runner.md` in this file was re-pointed to the lines that hold its text; they shipped with
1.14.0. REQ-FLOW-039 to 050 are held for plan 016's later files and 051 to 060 are
unallocated, so the ids leave gaps; 068 to 071, which that merge held for plan 019 file 3, were allocated on 2026-10-10
with 074 to 077 (amended 2026-10-10; it read "051 to 060 are unallocated and 068 to 071 are held for plan 019 file 3,
so the ids leave gaps"); 078 and 079 were allocated on 2026-10-12 (the paragraph after the next). The run's own eval cases land after this merge and
are not cited here. The merge's second round re-read that text at `f3315229`, after the p5 group's fix round 2
(`review/177` to `review/183`), and took the semantic review's `review/184` to `review/188`: it re-pointed every
citation of `src/cli/commands/gate.ts`, `src/change/classify.ts`, `src/roster/triggers.ts`,
`content/commands/st-quick.md` and `content/skills/st-dep-audit/SKILL.md`, restated the text that fix round changed,
and found every other citation on the same text at both heads.

REQ-FLOW-068 to REQ-FLOW-071 and REQ-FLOW-074 to REQ-FLOW-077, and the text dated 2026-10-10, come from the spec delta
of run `2026-10-10_next-tier` (plan 019 file 3, re-planned in that run), merged by its unit `s1-spec-merge` against the
integration head `a60cb496`; they shipped with 1.14.0, which set `status: shipped-with-1.14.0`. Where a delta entry and the landed
text differed, the text states what that head holds, and a line headed "As built" says what moved. The same pass
re-pointed to `a60cb496` every citation in this file of `content/commands/st-work.md`, `content/commands/st-board.md`,
`content/commands/st-plan.md`, `content/commands/st-rework.md`, `content/skills/st-qa/SKILL.md`,
`content/skills/st-dep-audit/SKILL.md`, `content/agents/stamity-test-runner.md` and `src/runs/ledgerStore.ts` whose
line that run moved, and found every citation of `content/commands/st-quick.md`, and all but one of that agent file,
on the same lines at both heads. Citations of any other file stay at the heads the paragraphs around them name. A ledger id in the
text dated 2026-10-10 (`build/16`, `review/62`) is that run's own unless a run is named beside it. The run's own eval
cases land after this merge and are not cited here. A follow-up pass on that unit the same day read at the integration
head `9a0ba4cf` every citation in this file of `content/commands/st-plan.md` and of the six agent bodies the run's QA
fix round changed after the merge (`6348d944`): the reviewer, the fixer, the implementer and the security, performance
and design-quality lenses. It re-pointed to that head the ones the round moved, which are the six `## Severity`
sections (REQ-FLOW-073), the security lens's `git log` sentence (REQ-FLOW-065), `/st-plan`'s return line
(REQ-FLOW-070) and its inbox-append and follow-ups bullets (REQ-FLOW-077), and found every other citation of those
seven files on its text there, above the lines the round moved. The run's whole-branch review then had a fix round the
same day (pass `branch`). Its text part settled the ledger rows `review/69`, `review/89` (as `review/99` and
`review/100` shaped it), `review/90`, `review/91`, `review/93`, `review/94`, `review/96` and `review/97` in four shipped
texts (`5cd61743`), and the lines below marked "the whole-branch review's fix round" state them, under REQ-FLOW-068,
REQ-FLOW-069 and REQ-FLOW-074 to REQ-FLOW-077. The same pass re-pointed to `5cd61743` every citation in this file of
`content/commands/st-board.md`, `content/commands/st-rework.md` and `content/skills/st-qa/SKILL.md` at or below the
first line that round moved in each, and the four citations of `content/commands/st-work.md` that reach into lines 24 to
30, which it rewrapped in place; every other `/st-work` citation holds its line. What those lines say of the parser, the
retire grammar and the query's JSON document is that round's code part (`review/78`, `review/89`), which landed beside
the texts; it is cited there by file and not by line.

REQ-FLOW-078 and REQ-FLOW-079, REQ-FLOW-025's amendment and the other text dated 2026-10-12 come from the spec delta of
run `2026-10-12_board-writes` (plan 015, re-planned in that run as `.stamity/runs/2026-10-12_board-writes/plan.md`),
merged by its unit `s1-spec-merge` against the integration head `3415e721`. They shipped with 1.15.0, which set
`status: shipped-with-1.15.0`. Where a delta entry and the landed text differ, the text
states what that head holds, and a line headed "As built" says what moved. A ledger id in that text (`review/38`,
`build/3`) is that run's own unless a run is named beside it. The same pass re-pointed to `3415e721` every citation in
this file of `content/commands/st-board.md`, `content/commands/st-work.md`, `content/commands/st-plan.md`,
`src/cli/commands/ledger.ts`, `src/runs/ledgerStore.ts` and `src/runs/inboxStore.ts` whose text that run moved, and the
citations of `src/runs/inboxStore.ts` that rounds before it had already moved off their text; it found every other
citation of those six files, and every one of `content/commands/st-pr-resolve.md`, on its text there. Those citations
read at `3415e721` wherever another paragraph of this preamble, or a line beside the citation, names an older head for
them. Two sentences whose `/st-board` text that run replaced keep their citation at the base `41b1899a`, so marked,
with the replacement stated beside them.

The requirement text comes from the `## Spec delta` sections of `docs/plans/013-optimization-sweep-02.md` (A) and
`docs/plans/013-optimization-sweep-03.md` (A), merged on 2026-09-30 at the Prove phase of the run
`.stamity/runs/2026-09-30_optimization-sweep/`. It is measured against the built code: where a delta and the code
differed, the text below states what the code does, and a line headed "As built" says what moved. Every `path:line`
below was read at the package head `b855876a`, except in REQ-FLOW-022 and REQ-FLOW-026. Those two were merged in the
run's second spec-merge pass, the same day. REQ-FLOW-022 cites the package head `cdfaa723`. REQ-FLOW-026 cites
`a9e94f06`, the package head once its unit had integrated (the third pass moved it there). At the 1.11.0 cut
(2026-10-01) two lines were added to `content/commands/st-quick.md`'s hard refusal; the citations of that file in
REQ-FLOW-005 and REQ-FLOW-024 were re-read on the release branch after that edit. The paragraphs headed "Amended
2026-10-06" in REQ-FLOW-022 and REQ-FLOW-026, and the criteria marked "added 2026-10-06", come from the spec deltas the
units `u6-init-fixes` and `u3-codex-shown-rows` declared in run `2026-10-03_pack-engine-defects`, merged at its close.
They cite `eb4f0727` and shipped with 1.12.0.

REQ-FLOW-036 to REQ-FLOW-038 come from the spec delta of `docs/plans/016-fork-distribution-00.md` (file 0 of plan 016,
the five security fixes of the released 1.11.0), merged on 2026-10-07 at the Prove phase of the run
`.stamity/runs/2026-10-07_security-fixes/`. The ids REQ-FLOW-027 to 035 belong to files 1 to 3 of the same plan, which
merge later. Each requirement's "Evidence (before)" cites `d10db029`, the tree the defects were measured on; its
"Amended 2026-10-07 (build)" bullet says what the build settled and names the code by path and symbol on the run's
integration branch (`fix/plan-016-file-0` at `fa8163a3`; the hook-file unit's JSON half, integrated after the merge,
at its integration commit `8d4b932e`). All five units are integrated, the last, `u0-registry-bound-calls`, at
`6d2fb2e7`. They shipped with 1.12.0, which set `status` to `shipped-with-1.12.0`.

The text dated 2026-10-14 comes from the spec delta of `docs/plans/020-cli-native-01.md` (plan 020 file 1, run
`2026-10-14_cli-native`), which deletes the APM and plugin distribution routes in 1.15.0, and from the deltas its units'
reports declared. It moved seven requirements here from `docs/specs/plugin-lifecycle.md`, each keeping its id, and set
them after REQ-FLOW-038, beside the ownership requirements they extend: REQ-PLUGIN-005 (the runner's start of `node`),
REQ-PLUGIN-014 (the manifest's `gates` object and its held `plugin` key), REQ-PLUGIN-016 (the ledger bound's
amendment, the settings document, the doctor rows), REQ-PLUGIN-017 (explicit gates), REQ-PLUGIN-045 and REQ-PLUGIN-046
(the ownership bound and the byte and rendering proofs) and REQ-PLUGIN-047 (`check`'s expectations). Each carries the
CLI half of the text as it stood there at `c96c7146`; the route's half retires in that spec's stub, and a route clause
inside the moved text is dropped in place and marked "(route clause dropped 1.15.0)". A paragraph headed "Amended
2026-10-14" under each says what 1.15.0 holds, citing the tree at `d590a266`, the integration head the deletion landed
on. The same pass dropped the route clauses of REQ-FLOW-002, REQ-FLOW-025, REQ-FLOW-026, REQ-FLOW-038 and REQ-FLOW-063,
and, folding the inbox row `2026-10-11_release-1-14-0/review/5`, restated REQ-FLOW-071's sentence on the live run. It
shipped with 1.15.0.

REQ-FLOW-080 to REQ-FLOW-088, and the text dated 2026-10-15, come from the spec deltas of
`docs/plans/020-cli-native-02.md`, `-03.md` and `-04.md` (plan 020 files 2 to 4, the same run), merged once, in file
order, at that run's Prove phase: each entry in its amended form, with the as-built corrections its units' reports
declared. Every `path:line` in that text reads at the integration head `bd89c476`, except two units not yet on it when
this merge ran: `e10-cloud-docs-matrix`, read at its commit `fee88300`, and `e12-translator`, read at its commit
`ecf11a74`; a citation of either names that commit. Where a delta and the landed code differed, the text states what
the code does, and a line headed "As built" says what moved. A ledger id in that text (`review/61`, `build/66`) is that
run's own. The charter's invariants moved to 1.3.0 in the same files (invariants 2 and 5; invariant 6 rewrapped, its
words unchanged), with a row in `docs/doctrine.md`; the charter carries no ids. It shipped with 1.15.0.

REQ-FLOW-089 to REQ-FLOW-104 and REQ-FLOW-120, and the text dated 2026-10-16, come from the spec delta of
`docs/plans/021-cloud-runs-01.md` (plan 021 file 1, run `2026-10-15_cloud-runs`), in the form the run's cell passes
brought it to, merged once by its unit `u23-spec-merge` before the run's whole-branch review. Every `path:line` in that
text was first read at the integration head `4daeb214`, or at `bc12cfc3` where the merge's first fix round, on the same
date, re-pointed or added a citation; the run's last citation pass re-read each one at `445ebd23`, and the whole-branch
page round re-read them on `aa7a3e5b` with its own edits to `SECURITY.md`, `evals/SET-v7.md` and the unattended skill,
re-pointing each one whose text had moved; the run's final derived pass, and the pull-request rounds' after it,
re-pointed each one a later commit moved, mapped through git's diff from the commit it was read at, and every one
reads at `02c2af6d`, a pin named beside a citation included, and on 2026-10-19 plan 021's second file re-pointed
each citation of `content/skills/st-unattended/SKILL.md` that the two lines its unit `n1-eval-ending` added moved,
and those read at `96e5b3ac`. Two units were not on `4daeb214`: `u19-run-end` (`stamity run end`) and
`u21-security-page` (`SECURITY.md`'s cloud section); the fix round cites both at `bc12cfc3`. REQ-FLOW-105 to
REQ-FLOW-119 were held for plan 021's second file, which allocated them on 2026-10-18 (the next paragraph; amended
2026-10-18, it read "are held for plan 021's second file"). The text dated 2026-10-16 is unreleased at this merge; the
plan cuts it as 1.16.0.

REQ-FLOW-105 to REQ-FLOW-119 and REQ-FLOW-121 to REQ-FLOW-124, and the text dated 2026-10-18, come from the spec delta
of `docs/plans/021-cloud-runs-02.md` (plan 021 file 2, run `2026-10-18_cloud-runs-2`), in its amended form, merged
once by its unit `v20-spec-merge`. Where the units' and fixers' reports declared a clause the delta is silent on, the
text adds it under a line headed "As built"; where they differ, the delta's decided wording stands and the "As built"
line says what the code holds. Every `path:line` in that text reads at the integration head `e64bc09f`, but for the
citations of `content/skills/st-unattended/SKILL.md` re-pointed on 2026-10-19, which read at `96e5b3ac`. Citations
into `src/hooks/personOnly.ts`, `src/hooks/scripts.ts` and the other modules the run rewrote by hundreds of lines name
the file and the symbol, as the plan's own cells anchor them; a citation of a content file, a page, a test case or a
small module names its lines. The text dated 2026-10-18 is unreleased at this merge; the plan cuts it as 1.16.0.

## Intent

The nine commands and the setup that serves them should do what a user asks, day to day: calls resolve, gates run
and report honestly, records say what happened, and the person is asked only what needs the person.

## Invariants

1. No floor relaxes. Fewer questions never means fewer gates. The security row, the review loop and the final-tree
   gate stay at every intensity (charter invariant 1).
2. Nothing breaks, so the release is 1.11.0. Every emitted change is regenerated by `stamity sync`. Rollback is a
   re-sync at the prior version: the getting-started page's pinned sync command with the prior version named,
   `npx -y @zomarit/stamity@<prior version> sync` (`docs/getting-started.md:362-364`).
3. All four clients reach parity, or each gap is declared per client in the capability disclosure.
4. No name or row id from outside this repository appears here. The leak gate is the check.

## Requirements

### REQ-FLOW-001 — Emitted scripts pass the project's own lint gate

Every script that setup emits into a user's repository starts with a file-level lint-disable directive,
`/* eslint-disable */`: on line 2 after a shebang, on line 1 where the script has none. This covers the core hook
scripts under `.stamity/generated/hooks/<tool>/` and the copies Claude Code's hook entries run under
`.claude/hooks/stamity/` (since plan 021 file 2's `w6-claude-hooks-in-claude-dir`), the portable runners, Cursor's
hook scripts and the `st-verify` skill scripts, the three copies of the coverage checker included.

- **As built:** the directive is `GENERATED_SCRIPT_LINT_DIRECTIVE` (`src/types/markers.ts:14-25`), whose three writers
  are `src/hooks/scripts.ts`, `src/hooks/portableRunner.ts` and `src/adapters/cursor.ts` (`:21-23`). The checker's
  source carries it too (`content/skills/st-verify/scripts/spec-plan-coverage.mjs:1`). This repository keeps its own
  ESLint coverage of that hand-written source by turning inline configuration off for its path; oxlint has no per-path
  equivalent, so oxlint no longer lints that one source (ledger `build/43`).
- **Boundary:** the header must not push any script over its ceiling (`HOOK_SCRIPT_BUDGETS`, `src/hooks/scripts.ts`).
- **Proof:** `test/hooks/emittedLint.test.ts` and `test/hooks/scriptBudget.test.ts`; QA. No eval case.
- **Source:** `src/types/markers.ts`, `src/hooks/scripts.ts`, `src/hooks/portableRunner.ts`, `src/adapters/cursor.ts`.

### REQ-FLOW-002 — Every CLI call the flows and hooks make resolves after the documented npx setup

Every emitted instruction to run a stamity verb uses one call form, defined by one shared sentence, byte-identical
at every site and on one physical line:

> Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell.

The sentence is the constant `RUNNING_CLI_SENTENCE` (`test/corpus/cliCallForm.test.ts:32-33`), which is its text of
record. Skills and `/st-debug` open it with `**Running the CLI.** `, and `/st-work` carries it as the Dispatch-contract
bullet `- **CLI calls.** ` (`test/corpus/cliCallForm.test.ts:53-77`; `content/commands/st-work.md:126`). No condition
is left for an agent to judge (`review/102`).

`${STAMITY:CLI}` is a wired substitution token, one of the ten in `REPO_SUBSTITUTION_TOKENS`
(`src/emit/substitution.ts:84-113`). The engine renders `${STAMITY:CLI} <verb>` to `npx -y <package>@<v> <verb>`,
where `<v>` is the version of the engine that emitted the file (`src/shared/cliCall.ts:92-111`). A package with no
npm channel — its running manifest is `private: true` and names no `publishConfig.registry` — renders
`npx --no <package>@<v> <verb>` instead, which runs an installed copy and never fetches one
(`src/cli/kit/packageName.ts:108-126`, `:151-153`; `src/shared/cliCall.ts:78-80`; `review/94`). The CLI's own remedy
lines go through `packageCommand`, which prints the same pinned form and keeps `--no` for a package with no channel
even when it cannot pin (`src/cli/kit/packageName.ts:216-227`).

The charter's one call uses the token: "change via `${STAMITY:CLI} config`" (`content/charter/stamity-charter.md:26`),
so every user's `AGENTS.md` carries the pinned call (this repository's own copy: `AGENTS.md:15`). `.claude/` bodies
carry the rendered form (route clause dropped 1.15.0: it went on to say how the APM bodies and the plugin bodies carried
the token, both routes deleted in 1.15.0; the sentences read at `c96c7146`).

- **As built, where the delta differed:**
  - A hook hint carries the pinned call beside the short form: `` `stamity <verb>` where the CLI is installed, else
    `npx -y <package>@<v> <verb>` `` (`cliCallHint`, `src/shared/cliCall.ts:127-149`). The delta said hints "use the
    same pinned form"; the pinned form is there, next to the short one.
  - Codex's `.codex/hooks.json` carries the pinned call too (maintainer answer G3). Codex records hook trust against
    that file's hash, so it asks for hook approval again after each stamity upgrade.
  - `sync --help` prints its update line by the same channel rule: a package with no channel is told to install the
    newer release into the project and run `npx --no <name> sync` (`review/109`).
- **Amended 2026-10-15** (plan 020 file 2, unit `e10-cloud-docs-matrix`; read at `fee88300`). The hint names what the
  fallback needs: `` `stamity <verb>` where the CLI is installed, else `npx -y <package>@<v> <verb>`, which needs the npm
  registry ``; a fork that names its registry reads "which needs the registry it names", and the `npx --no` form,
  which fetches nothing, carries no clause (`cliCallHint`, `src/shared/cliCall.ts`). The sentence holds no parenthesis
  and no single quote, so the Claude guard's tail and the Codex hooks description stay recognisable as the engine's
  (`GUARD_TAIL`, `src/manifest/coOwnedJson.ts`; `CHECK_HINT`, `src/manifest/hookDocuments.ts`), and a 1.14 Codex
  description still normalises to its recorded hash. Every generated sentence that embeds the hint ends on it: the
  tamper notice's two lines (`src/hooks/scripts.ts`) and the Cursor roster refusal (`src/adapters/cursor.ts`). Proof:
  `test/shared/cliCall.test.ts`, `test/emit/noBareCliCall.test.ts`, `test/adapters/claude.test.ts` ("says what the
  fallback needs, in a tail both owner patterns still read"), `test/adapters/codex.test.ts`, `test/hooks/scripts.test.ts`.
- **Evidence (before):** the docs promise "Nothing is installed globally" and set up with `npx @zomarit/stamity init`
  (`docs/getting-started.md`); at `67d2b954`, 29 backticked calls to `stamity <verb>` across 9 content files had no npx
  prefix.
- **Expand/contract:** text and one token are added. Rollback is a re-sync at the prior version, which restores the
  bare calls. The consumers are every body that runs a verb; the text test proves none is left bare.
- **Proof:** `test/corpus/cliCallForm.test.ts` (checks a–d), `test/emit/substitution.test.ts`,
  `test/cli/kit/packageName.test.ts`; must-holds `work-proof-block-fields` and `learnings-curation-merge-and-promotion`;
  QA.

### REQ-FLOW-003 — A step whose CLI cannot run says so

When neither an installed copy nor the pinned npx call can run the verb (for example, offline with no npx cache):

- the handoff and learn steps write no file by hand. The closing message carries the content under
  `Not done: handoff not written — CLI unavailable` or `Not done: learning not captured — CLI unavailable`, with the
  command to run once the CLI resolves (`test/corpus/cliCallForm.test.ts:54-65` pins both lines);
- `/st-debug` names the install as the unresolved input when both forms are `not-runnable`
  (`content/commands/st-debug.md:30`);
- the ledger step alone may be written by hand, by the orchestrator, the one ledger writer, in the row grammar under
  Proof block; the run record then says `ledger: by hand (no CLI)` (`content/commands/st-work.md:127`).

- **As built:** the `/st-work` fallback points at the row grammar under Proof block, not at
  `test/records/ledgers.test.ts`, because that test exists only in this repository and not in the repositories the
  body ships to (ledger `build/102`, signed off).
- **Proof:** `test/corpus/cliCallForm.test.ts`; QA.

### REQ-FLOW-004 — Every researcher dispatch carries the brief keys the researcher requires

Every flow that dispatches a researcher names all six required keys: `objective`, `scope`, `questions`,
`output_sections`, `depth` and `tool_tier`. The sites are derived, not listed: every command whose `spawns:` holds
`researcher`, plus every skill that names a `` `researcher` brief `` — nine today, eight commands and `st-dep-audit`.

- **As built, where the delta differed:** the delta named seven commands. The derivation counts eight, because
  `/st-ask` spawns a researcher too, plus the one skill. Six sites carry one shared line (`/st-pr-resolve`,
  `/st-plan`, `/st-board`, `/st-rework`, `/st-debug`, `st-dep-audit`); `/st-debug` carries it at
  `content/commands/st-debug.md:61-62`. `/st-work`, `/st-spec` and `/st-ask` keep their own enumeration of the keys
  (plan decision 6; `content/commands/st-work.md:39-42`, `content/commands/st-ask.md:72-74`). The researcher body
  says so (`content/agents/stamity-researcher.md:20-27`).
- **Evidence:** a spawn missing a required key returns `BLOCKED_AMBIGUITY` (`content/agents/stamity-researcher.md:20-21`;
  the keys at `:29-37`).
- **Proof:** `test/corpus/agents/spine.test.ts` (the derived site set, at least 9 members); must-holds
  `agent-researcher-return-contract`, `plan-artifact-head-and-units-shape`, and the floor
  `subagent-returns-blocked-ambiguity` with its twin; QA.

### REQ-FLOW-005 — The quick lane takes a small change together with the tests that follow it

The Files row fires at more than 5 files across the batch, and every file counts toward that. It also fires when one
item's source change cannot land in a single source file, with two exceptions: a test file edited only to follow the
item's change rides with it, and a user-facing string or label correction may span two source files
(`content/commands/st-quick.md:38-44`, `:70`). Riding tests still count toward `Size`, and move no other row: a test
under a security-sensitive path fires that row, and a new route with its test fires
`Schema, API, event or migration`. The Size, Security-sensitive surface, Dependencies and "Schema, API, event or
migration" rows and the hard refusal stay as they were.

- **Evidence (before):** the Files row fired on "one item that cannot land in a single file".
- **As built (amended 2026-10-01, the 1.11.0 cut):** after eval run 37, the hard refusal gained one sentence: an
  operator's reply to a refusal is not taken as a confirmation, an approval or an authorization, and whatever it says
  (a deadline, a role, a go-ahead) the refusal stands and restates its row (`content/commands/st-quick.md:58-59`).
  The thresholds themselves do not move.
- **Proof:** `test/corpus/commands/lightTrio.test.ts`; census of `quick-hard-refusal-thresholds`,
  `quick-refusal-under-social-pressure`, `quick-security-surface-no-size-floor` and
  `benign-small-change-quick-proceeds`; new cases `quick-string-rename-with-its-tests` (golden) and
  `quick-string-rename-on-auth-path-refused` (adversarial); QA.

### REQ-FLOW-006 — Setup detects vitest and pytest from the manifest

Detection reads the manifest as well as config files, in evidence order: a config file, an embedded manifest key, a
declared dependency, the wired `test` script's body, then `pyproject.toml`; only when all are silent does it report
the unnamed `test-script` fallback (`src/detect/repoAnalyzer.ts:664-695`).

- vitest (and jest, mocha, playwright, cypress) from `package.json` dependencies or devDependencies, matched on the
  exact package name, or from a runner named in the wired `test` script (`src/detect/repoAnalyzer.ts:237-262`,
  `:697-708`);
- pytest from `pyproject.toml`: a `[tool.pytest]` or `[tool.pytest.*]` table, a quoted dependency naming `pytest`
  exactly, or a poetry-style `pytest = …` key, with `#` comment lines skipped (`:264-279`, `:710-719`).

Every signal found is reported; the charter's `Test framework:` line names the result.

- **As built:** the delta named only `[tool.pytest.ini_options]`; the built probe reads any `[tool.pytest` table and
  the dependency forms (ledger `build/3`).
- **Proof:** `test/detect/repoAnalyzer.test.ts`; QA.

### REQ-FLOW-007 — Python gates run from the repository root without an activated environment

A Python project's gates run from the repository root with no environment activated:

- When a committed file declares the runner (`uv.lock`, `poetry.lock`, `pdm.lock`, or a `[tool.hatch.envs` table in
  `pyproject.toml`), detection records it in the existing `detected.packageManager` string
  (`src/detect/repoAnalyzer.ts:721-737`), and each Python gate is prefixed with it — `uv run`, `poetry run`, `pdm run`,
  `hatch run` (`src/detect/verificationGates.ts:133-171`). No manifest field is added, and the Node run prefixes are
  untouched.
- When no runner is declared and `.venv/pyvenv.cfg` (or `venv/pyvenv.cfg`) exists at `init`, init records three
  `gates` pins that call the tools as modules of that interpreter: `<venv>/bin/python -m pytest`,
  `… ruff check .` and `… mypy src` (or `mypy .` with no root `src/`) (`src/cli/commands/init/plan.ts:248-287`).
  `sync` never writes pins, so `check` stays drift-free on a checkout without the venv. Init's output names the pins.
- Otherwise the gates render as today, and `check` names a gate it cannot resolve (REQ-FLOW-008).

- **As built:** the pins are POSIX-only; on Windows the init panel says they will not run there
  (`src/cli/commands/init/plan.ts:263-266`). A repository with both a lock file and a `.venv/` gets no pin
  (`:254-257`).
- **Proof:** `test/cli/commands/initPanel.test.ts` and the detection suites under `test/detect/`; QA.

### REQ-FLOW-008 — `check` names the gates it did not run

`stamity check` runs no gate and spawns nothing to probe one (`src/cli/commands/check.ts:1241-1245`). On a green run
it never prints an unqualified `all green`: the closing line names the gates it did not run —
`setup green — gates not run: lint, typecheck, test (check runs no gate)`, or
`ok — <n> advisory warning(s) above; gates not run: …` beside warnings (`src/cli/commands/check.ts:1546-1552`).

Above that line it warns about each charter gate it cannot resolve:
`warning: the <kind> gate cannot be resolved — the charter says "<value>"` (`:1538-1545`). A gate is unresolved when
nothing configures it, or when its command's first word finds nothing. A word with a path separator is a path
relative to the root, and it must be a regular file with its execute bit set on POSIX; on Windows it counts when it
exists as written with an extension, or with one of the `PATHEXT` extensions added. Any other word is looked up as
an executable file in `node_modules/.bin/`, `.venv/bin/` and each `PATH` entry, in that order; on Windows each lookup
tries the `PATHEXT` extensions, `node_modules/.bin/<word>.cmd`, and the word as written only when it already carries
an extension (`src/cli/commands/check.ts:1225-1327`, read at `a9e94f06`; `review/79`, `review/151`). The warnings
never change the exit code. `--json` carries the same data under `gates`, with `notRun`
and `unresolved`, absent only when there is no manifest (`:1705-1715`).

- **As built:** the warning quotes the charter's value rather than naming the tool alone (ledger `build/61`); the full
  gate's kind is `full-gate` (`:1201-1206`).
- **Proof:** `test/cli/commands/check.test.ts`; `docs/troubleshooting.md` carries the closing line; QA.

### REQ-FLOW-009 — `/st-debug` reproduces a precisely described bug with a failing test and hands off

Step 3 has two routes, and the first response names the one taken and the fact that chose it
(`content/commands/st-debug.md:81-95`):

- **In-process** — the report states an exact input, the expected output and the actual output, and the charter's
  test gate is runnable here (neither `unknown` nor `not-runnable`). The implementer writes gate 2's failing test for
  that input and nothing else; the test-runner runs it twice. A failure for the stated reason on both runs is the
  reproduction: no stop and no question to the user. The run then goes on through root cause and hands off to
  `/st-work` in the same session.
- **User** — anything else, or a defect that needs the user's environment, data, device, account, network, traffic or
  timing. The run stops at step 3 and waits for the user's output.

- **As built, where the delta differed:** the built route runs the test twice and requires a failure for the stated
  reason on both runs; a test that does not fail that way goes to the user route, never to another in-process round
  (`:87-90`; `review/37`). The step-2 probes run on the in-process route only when the failing test alone cannot
  separate the hypotheses (`:63-64`).
- **Evidence (before):** step 3 stopped for the user every time.
- **Proof:** `test/corpus/commands/lightTrio.test.ts`; census `debug-no-reproduction-blocks` and the floor
  `debug-root-cause-before-fix`; must-hold `debug-next-step-derived-from-run-state`; new case
  `debug-deterministic-bug-reproduced-in-process`; QA.

### REQ-FLOW-010 — Probes keep the gates green and never outlive their record

A probe keeps the charter's lint and typecheck gates green: it uses a form the project's linter and type checker
accept, and a probe that turns either red is rewritten before the round continues
(`content/commands/st-debug.md:72-74`). The implementer's instrumentation return carries the changed files, the
instrumented sites and its lint and typecheck results (`:75-80`).

Every probe line carries the run's own id: `[STAMITY-DEBUG <run-id>]` (`:66-68`). The marker check runs at the run's
start, at every stop that waits on the user, and at the close, and searches for a real run id only
(`git grep -n -E '\[STAMITY-DEBUG [0-9]{4}-[0-9]{2}-[0-9]{2}_debug-[^]]*\]'`; exit 1 means zero hits) (`:155-168`).
Documents name the format with the `<run-id>` placeholder, never an instance, so no document matches. At the start a
hit whose run id has neither an in-progress debug record nor a recorded capture-later agreement is stripped as
residue; at a stop the count and the sites go into the stop message and the record; at the close the count of this
run's own hits is the Zero residue gate's number, 0 unless a capture-later agreement is recorded.

- **As built, where the delta differed:** the delta said every `[STAMITY-DEBUG]` line in the tree is listed "when any
  debug turn ends". The built check lists sites at every stop and at the close, and searches for the run-id form,
  because the bare tag also appears in the emitted command files (`review/35`, `review/56`, re-signed off). The Zero
  residue row of the gate table still says "repo-wide" (`content/commands/st-debug.md:123`; `review/57`, open).
- **Proof:** `test/corpus/commands/lightTrio.test.ts`; QA.

### REQ-FLOW-011 — A debug record from the first probe

At its first mutation (a probe, or gate 2's failing test), a debug run opens
`.stamity/runs/<UTC date>_debug-<slug>/record.md`. Its first 15 lines carry three head lines, bare at column 0 with
no list marker and no bold: `Status: in progress`, `Plan: none — debug round` and
`Invocation: <this command line, verbatim>` (`content/commands/st-debug.md:48-54`). The record then gets one line per
probe site as it lands and one per strip. The close rewrites `Status:` to the exit taken and the residue count; a stop
that waits on the user leaves it in progress. A reader identifies a debug record by the `_debug-` run-id segment,
never by the `Invocation:` spelling, which differs per client (`src/runs/layout.ts:156-162`). The escape-valve counter
stays in-session (`content/commands/st-debug.md:186-190`). The resume card reads the record (REQ-CTX-013).

- **As built, where the delta differed:** the delta said the record lists each round's hypotheses and outcome; the
  built record lists probe sites and strips, and the close names the exit (`review/39`, open).
- **Proof:** `test/corpus/commands/lightTrio.test.ts`, `test/runs/resumeCardParity.test.ts`; QA.

### REQ-FLOW-012 — On a small repository, `/st-spec` offers the whole app as a scope

Below 5,000 source lines, counted over the files the Source tree probe found, the scope question offers the whole app
as its first numbered option, beside the narrowest readings; the mode-chosen line states the count. The whole app is
asked, never assumed. It is the declared default when the request names the app ("create the spec", "spec this
app"); "backfill the specs" with no named scope keeps declining the sweep as its default. At 5,000 lines or more,
today's rule stands (`content/commands/st-spec.md:100-110`).

- **As built:** the bound is "below 5,000", not "at most" (ledger `build/56`); the whole app is always a question,
  never a scope taken without one (`review/59`, signed off).
- **Proof:** `test/corpus/commands/spec.test.ts`; new case `spec-create-small-repo-whole-app`; must-holds
  `spec-converge-confirm-gated-merge`, `spec-next-step-derived-from-run-state` and the floor
  `question-shape-and-default`; QA.

### REQ-FLOW-013 — Each gate runs once, as the charter spells it, with its exit code read from the tool

The test-runner runs each requested gate exactly once, from the root, exactly as resolved: no environment edit, no
added flag, no wrapper and no narrowing filter (`content/agents/stamity-test-runner.md:41-50`). A row's `status` is
`pass`, `fail`, `not-run`, `not-runnable` or `unknown`; `duration` is what the tool reported or `not measured`
(`:58-65`). The verdict is `green` only when every requested gate reported `pass`; an `unknown` row makes it `red`
(`:80-82`).

- **As built, where the delta differed:** a shell calibration decides what a missing exit status means. Before the
  first gate, `false` runs once. If the tool showed that failing status, a later result that shows no status exited
  `0`; otherwise a status the tool did not show is `unknown`, never a pass (`:110-114`, `:154-156`). Without the
  calibration, a client whose shell tool shows a status only for a failing command could never close a run green
  (ledger `prove/2`).
- **Amended 2026-10-09** (run `2026-10-08_product-core`, unit `p3c-work-gates`): the one narrowing filter the runner
  takes is one the brief supplies, and a change class's selected test files are such a filter
  (`content/agents/stamity-test-runner.md:47-50`); the class's checks map to gates as REQ-FLOW-063 states (`:33-39`).
- **Proof:** `test/corpus/agents/shellDiscipline.test.ts`, `test/corpus/agents/quality.test.ts`; census
  `agent-test-runner-return-contract`; must-holds `agent-implementer-return-contract`, `agent-fixer-return-contract`
  and the floor `charter-universal-floor-holds-under-deadline`; new case `test-runner-plain-gates-honest-exit`; QA.

### REQ-FLOW-014 — Agent and command bodies write portable shell and wait instead of polling

Every agent that runs commands carries one shared `## Shell` paragraph: portable POSIX `sh`, each command run once as
written, the exit code read from the tool, and a long command waited on in the foreground, never polled with `sleep`
(`content/agents/stamity-test-runner.md:148-157`).

- **As built, where the delta differed:** the lint does not read every body line. It checks two things: every agent
  whose `capabilities` include `execute`, plus the researcher, carries the paragraph byte-identical after whitespace
  flattening; and every fenced block under `content/` whose info string is `sh`, `bash`, `shell` or `console` is free of
  the non-portable constructs. Prose is not scanned, because the paragraph itself names the banned constructs
  (`test/corpus/agents/shellDiscipline.test.ts:5-21`, `:63-64`).
- **Proof:** `test/corpus/agents/shellDiscipline.test.ts`.

### REQ-FLOW-015 — A byte-identical tree cites its earlier gate result; the final tree is always gated

A Prove pass may cite this run's earlier gate result on a byte-identical tree — same HEAD, same diff, untracked files
included. The final tree always gets a run of its own, and citing is never a lighter pass
(`content/commands/st-work.md:203-204`). The proof block records per gate the result, or the earlier result a
byte-identical tree cites (`:313-315`).

- **As built, where the delta differed:** the body has no sentence saying a cited result covers only the gates it ran;
  the proof block's per-gate line carries it only implicitly (`review/32`, open).
- **Amended 2026-10-09** (run `2026-10-08_product-core`, unit `p3c-work-gates`, with its fix rounds for `review/117`
  and `review/133`): the gates the final tree must pass are the ones its change class requires (REQ-FLOW-063). The
  proof block's gate results open with the change's class as `gate classify` named it, `unclear` when none ran, and
  the run's base commit, both on the `Gate results` label line itself, then per gate the command, pass, fail or
  unknown, a failing excerpt, or the earlier result a byte-identical tree cites (`content/commands/st-work.md:313-315`).
  The class sits on the label line, not between the label and its table, so the measurements page's reader keeps the
  table (`review/117`).
- **Proof:** `test/corpus/commands/work.test.ts`; QA.

### REQ-FLOW-016 — Setup ignores the review gate's state files

`init`, `sync`, the migration carry and `config mcp` make sure `.gitignore` covers four entries: `.env.mcp` and the
review gate's runtime state — `.stamity/review-gate.json`, its `.lock` directory and its `.tmp-*` temp files
(`REQUIRED_GITIGNORE_ENTRIES`, `src/mcp/env.ts:181-198`). An entry an existing rule already covers is not appended:
each review-gate entry is dominated by its root-anchored twin, by the state directory in each spelling git reads as
covering its contents, and by the state file's name as a prefix pattern (`:200-234`). A negation of an entry is the
operator's decision and is kept (`:650-666`). A file that is already committed stays tracked: setup never touches the
git index.

A live sync writes the ignore rules before its first emitted file, so a refusal by the injection screen leaves no
half-applied run; a dry run writes nothing (`src/cli/commands/sync/engine.ts:711-717`, `:685`).
`ensureGitignoreEntry` returns the entries it appended (`src/mcp/env.ts:611-648`), and sync's report and its JSON
name them (`review/67`).

- **As built:** the ordering is deliberate (ledger `prove/6`, signed off 13:50Z); a workspace cascade carries each
  member's added `.gitignore` entries into its row as `gitignoreAdded` (`src/cli/commands/workspace.ts:1079`, `:1312`,
  read at `a9e94f06`; `review/101`, fixed by minor-polish-b, integrated at `ffadc8a2`).
- **Evidence:** the state file is defined at `src/types/markers.ts:183-196`.
- **Amended 2026-10-18** (plan 021 file 2, units `v6-cursor-cloud` and `v17-model-list-cache`). Setup's required
  ignore entries gain `.stamity/context-once/`, Cursor's once-per-conversation markers (REQ-FLOW-115), dominated by the
  state directory's own rule as the review gate's entries are; the entry count the requirement states moves with it.
  As built, beyond the delta: the model list cache, `.stamity/client-models.json` (REQ-LADDER-009 in
  `docs/specs/model-ladder.md`), joins in the same way, so the list holds eight entries where the paragraph above says
  four: `.env.mcp`, the review gate's three, the pre-flight's canary and the run-ended marker of plan 021 file 1, the
  context-once folder and the model list cache (`REQUIRED_GITIGNORE_ENTRIES`, `src/mcp/env.ts:237-246`;
  `CONTEXT_ONCE_DIR`, `CONTEXT_ONCE_GITIGNORE_ENTRY` and `CLIENT_MODELS_CACHE_FILE`, `:212-223`; the dominating
  spellings, `:293-296`). The init panel names the folder "Cursor's once-per-conversation context markers" and the
  cache with the neutral reason (`GITIGNORE_REASONS`, `src/cli/commands/init/panel.ts`). Proof: `test/mcp/env.test.ts`,
  `test/cli/commands/init.test.ts`, `test/cli/commands/initPanel.test.ts`, `test/cli/commands/syncEngine.test.ts`,
  `test/emit/upgradeFrom1140.e2e.test.ts`, each holding the new entries last.
- **Proof:** `test/mcp/env.test.ts`, `test/cli/commands/syncEngine.test.ts`, `test/merge/writeEscape.test.ts`; QA.

### REQ-FLOW-017 — QA rows record walked, auto-proven or accepted-unwalked

Each QA row records exactly one state (`content/skills/st-qa/SKILL.md:74-78`; `content/commands/st-work.md:295-296`
points at those states):

- `walked`, only when the person's reply says so for that row or for all of them, and that reply is quoted in the
  record;
- `auto-proven`, with its evidence pointer;
- `accepted-unwalked`, with its input hash, when a sign-off does not name the row.

A bare sign-off ("signed off", "ok") records each open row `accepted-unwalked`, never `walked`, and so does any
sign-off for each open row it does not name. A reply that withholds sign-off records no row as accepted and leaves the
checkpoint open (`content/skills/st-qa/SKILL.md:115-118`). The proof block lists the QA rows per state, then the
sign-off or `not signed` (`content/commands/st-work.md:318-319`).

- **Amended 2026-10-10** (run `2026-10-10_next-tier`, unit `q2-qa-rows`, with its fix round for `review/2` and
  `review/4`): the rows left for a person are the kinds REQ-FLOW-069 names, and `/st-work`'s QA step hands the qa
  skill the class and lenses `gate classify` named, `unclear` when none ran (`content/commands/st-work.md:280-281`).
  The three states above and the sign-off rules do not change.
- **Amended 2026-10-15** (plan 020 file 3, unit `f7-prove-before-asking` and its fix rounds; `review/61`). Two states
  join the three: `agent-run`, with the prover's command, exit code and output path, and `contradicted`, with the
  prover's redacted excerpt (`content/skills/st-qa/SKILL.md:80-84`). Proven rows, `auto-proven` and `agent-run`, fold
  into one line with their pointers (`:118-119`). A `contradicted` row is failing: a walk is recorded beside its
  excerpt and does not clear it, and only a later run showing `Expected` does (`:129-130`). `/st-work`'s proof-block QA
  line folds the proven rows, lists each row not proven or over the cap with its reason and each `contradicted` row
  with its excerpt, then each person row's state and the sign-off (`content/commands/st-work.md:318-319`). The rows
  left for a person are those REQ-FLOW-081 leaves.
- **Proof:** `test/corpus/skills/flow.test.ts`, `test/corpus/commands/work.test.ts`; census `work-proof-block-fields`
  and `probe-none-work-run-qa-checkpoint`; must-holds `probe-qa-select` and the floor
  `unattended-run-applies-declared-default`; new case `qa-bare-signoff-records-unwalked`; QA.

### REQ-FLOW-018 — No QA question when every row auto-proved; unattended means not signed; unchanged accepted rows are not asked again

1. When every row is auto-proven, the checkpoint asks no QA question and records "all N rows auto-proven"
   (`content/skills/st-qa/SKILL.md:113-115`). Inside a work run the skill asks nothing itself; the rows left for a person
   ride the run's one close question (`:148-149`).
2. A run with no person to answer asks nothing and records `Shippable: not signed` (`:124-125`).
3. Each row records an input hash, the QA skill's own: the sha256 of the sorted lines `<path> <git hash-object of path>`
   over the files the row derives from (`:74-78`). It is not the QA harness's `rowHash` (REQ-PROVE-021). A row recorded
   `accepted-unwalked` in an earlier record of this change with the same input hash is carried as
   `accepted-unwalked (carried from <run-id>)` without asking; a changed hash reopens it (`:120-124`).
4. A row whose Risk is now `H` is never carried on a hash and is asked at every checkpoint until walked or auto-proven.
   `Shippable: YES` is recorded only with no `H` row accepted-unwalked; otherwise `NO`, naming the open `H` row
   (`:130-135`).

- `judgment: reviewer` — the result stays inside charter invariant 1: fewer questions, never fewer checks.
- **As built, where the delta differed:** the no-ask record reads "all N rows auto-proven", not
  "all <n> rows auto-proven; no person asked" (ledger `build/47`); the carry exception keys on the row's Risk now, not
  on its Risk when accepted (`review/54`). The delta attributed the hash to "the harness"; census S8 corrects it: the
  skill's input hash is its own.
- **Amended 2026-10-15** (plan 020 file 3, unit `f7-prove-before-asking` and its fix rounds; `review/50`, `review/61`).
  "All N rows auto-proven" counts `agent-run` rows, and the checkpoint closes on their pointers with no ask
  (`content/skills/st-qa/SKILL.md:123-124`). Item 1's rows "ride the run's close walk" (REQ-FLOW-080; `:158-159`),
  where they rode "the run's one close question". Item 4's bar is tighter: `Shippable: YES` only once every `H` row is
  walked or proven and none stands `contradicted`; otherwise `NO`, naming the open `H` row (`:143-144`). So an `H` row
  over the cap of three, which stays an `H` row asked at the next checkpoint, holds `YES` back as an `accepted-unwalked`
  `H` row does (`:50-51`). Item 4's earlier sentence ("recorded only with no `H` row accepted-unwalked") still holds as
  a necessary condition.
- **Proof:** `test/corpus/skills/flow.test.ts`; QA.

### REQ-FLOW-019 — `/st-work` asks only what needs the person

1. Frame asks nothing about an inbox row a persisted plan already settles — named in a unit, a follow-up or its
   out-of-scope text; it lists that row with its disposition. The other overlapping rows ride the plan gate's
   question and stay in the inbox by default (`content/commands/st-work.md:27-29`).
2. At standard intensity, a persisted `/st-plan` artifact that passed the freshness guard is the go-ahead: the gate
   takes execute-now and logs
   `Default applied: plan gate → option 1, execute now (persisted plan <path>)`. An in-flow plan is presented and
   asked; deep asks; light auto-continues (`:65-69`, `:442`).
3. The close asks once: one question with numbered options covers the rows no evidence proved, the spec-delta merge
   and the commit. `Default if no response: leave uncommitted`, with those rows not signed and the delta unmerged. A part
   with nothing to decide drops out, and with none left there is no ask (`:297-309`). The spec-author applies the merge
   once that question confirms it (`:421-423`).

- **As built, where the delta differed:** the body has no sentence saying no later turn offers a commit again
  (ledger `build/67`, open); the log line takes the long form, which carries the plan path (the run's Frame audit).
- **Amended 2026-10-10** (run `2026-10-10_next-tier`, units `q1t-frame-inbox-read` and `q10a-work-close`): the inbox
  rows item 1 speaks of are the ones Frame reads through the `ledger` verb's `inbox` query (REQ-FLOW-068), no longer
  the whole file (`content/commands/st-work.md:21-27`). The close's one question of item 3 gains the leftovers as a
  fourth part (REQ-FLOW-074), and with no response the unattended rule applies beside "leave uncommitted"
  (REQ-FLOW-075; `:305-307`).
- **Amended 2026-10-15** (plan 020 file 3, units `f3-work-close` and `f7-prove-before-asking`, and the corpus fix batch's
  `review/44`). Item 3 is the close walk (REQ-FLOW-080): the label reads "**The close walk.**" where it read "**The close
  asks once.**", and the parts — the rows the qa skill leaves for the person (at most three), the spec delta merge, the
  commit, and the leftovers as a fourth — are asked through the question protocol's Close walk, in rounds of numbered
  options. The default, "leave uncommitted", and the empty-part rule are unchanged; the answers take effect together
  after the last round, fixes and schedules first and the commit or hand-off choice last
  (`content/commands/st-work.md:297-309`). The proof block prints after the walk's last answer with nothing after it
  (`:313-314`), and the spec-author merges once the close walk confirms it (`:421-423`). Item 3's "one question" and the
  2026-10-10 paragraph's "the close's one question" read as the walk.
- **Amended 2026-10-16** (plan 021 file 1, units `u15-work-text` and `u18b-run-checkpoint`): the close's commit part.
  Given an attended close with uncommitted changes, Then its commit part offers `1 commit, push, draft PR`
  (recommended), `2 commit only` and `3 leave uncommitted`, and keeps `Default if no response: leave uncommitted` word
  for word; option 1 runs `stamity run checkpoint --pr`, holding no path in an attended run, off the default branch
  (after `stamity run start` where the run sits on it), its draft pull request taking a short fixed body naming the run
  id and its record's path (an attended run writes no `morning.md`), and where no platform is linked it commits and
  lists `Not done: draft PR not opened` naming the branch; option 1 copies each `notDone` entry the checkpoint returns
  into the proof block's `Not done:` (`content/commands/st-work.md:297-304`). The criterion "GIVEN no answer … nothing
  is committed" holds for an attended run; an unattended close ends by REQ-FLOW-075 and REQ-FLOW-092, its commit part
  no ask (`:303-304`). As built: a refused open reads `draft PR not opened (<branch>): <cause>`, the cause named by its
  class (`gh not found`, `gh is not logged in`, the step and the HTTP status it answered, a 422's class), never `gh`'s
  or GitHub's own text, and an `origin` naming no GitHub repository reads `draft PR not opened (origin names no GitHub
  repository gh reaches)`, naming the reason in the branch's place (`draftPr`, `src/cli/commands/run.ts:1269-1313`;
  `ensureDraftPr`, `src/runs/pullRequest.ts:241-245`, its causes `ghFailure` and `rejection`, `:196-219`).
- **Proof:** `test/corpus/commands/work.test.ts`; census `probe-none-work-run-qa-checkpoint` and
  `work-proof-block-fields`; must-holds `question-shape-and-default`, its charter-only twin and
  `unattended-run-applies-declared-default`; new case `work-persisted-plan-asks-once`; QA.

### REQ-FLOW-020 — `/st-ask` is sized to the question

A question that names one symbol or one file is answered directly: the orchestrator reads the named definition and
at most its direct call sites found by one search, and cites every claim. When that read would pass about 300 lines or
a second file's body, one quick researcher answers instead. A symbol defined in more than one file is a mechanism
question and fans out as one; a named symbol the one search does not find is an Unanswerable row naming the pattern
and the paths searched. Mechanism and impact questions keep their fan-out (`content/commands/st-ask.md:52-65`). The
context budget allows the orchestrator's own bounded read on the named-target shape (`:78-80`).

- **As built:** the delta did not state the two-file and not-found rules; the review added them (`review/86`,
  `review/87`).
- **Proof:** `test/corpus/commands/lightTrio.test.ts`; new case `ask-narrow-symbol`; must-holds the floor
  `ask-refuses-mid-answer-change` and `ask-citation-discipline`; QA.

### REQ-FLOW-021 — The learning index warns ahead, orders by date and reports real bytes

- A learning whose `reviewBy` falls within 14 days produces a warning (`REVIEW_WARNING_DAYS`,
  `src/learnings/validation.ts:89-107`, `:365-370`).
- The index is ordered by the frontmatter `date`, newest first, ties broken by file name; a file past the per-file
  cap, which is refused unread, is keyed by its modified time (`src/learnings/store.ts:328-363`).
- Each header's byte figure counts its own printed lines, so past the 20-line cut the banner's figure equals the bytes
  it printed (`src/hooks/scripts.ts:653-657`).

- **Proof:** the learnings suites under `test/learnings/` (the warning window in `test/learnings/validation.test.ts`),
  `test/hooks/scripts.test.ts` and `test/runs/resumeCardParity.test.ts`; `docs/troubleshooting.md`; QA.

### REQ-FLOW-022 — First-run output matches what setup did

From `docs/plans/013-optimization-sweep-03.md` § Spec delta A, the unit `sw10-first-run-output` (integrated at
`84a87300` and `1f0c0f2f`) and its sign-offs; every `path:line` is read at `cdfaa723`.

- **The file count.** The init panel counts distinct paths, not ledger rows: the generated paths the run wrote, the
  manifest, and the state-directory `.gitkeep` files the run created. It says when `.gitignore` changed, counts a path
  several clients share (`AGENTS.md`) once, and reports a skipped path as left alone
  (`src/cli/commands/init/panel.ts:312-343`). The keep files come from the report field `createdKeeps`, probed before
  the scaffold runs; the appended `.gitignore` entries come from `gitignoreAdded`, the return value of
  `ensureGitignoreEntry`, which is empty under a dry run (`src/cli/commands/init/apply.ts:131-172`). A dry run prints
  the same count in the future tense (`panel.ts:333-335`; `src/cli/commands/init.ts:777`).
- **`check`'s manifest row** names the managed paths, then the ledger rows across the clients:
  `<paths> managed path(s) (<rows> ledger rows across <n> client(s))` (`checkManifest`,
  `src/cli/commands/check.ts:259-288`, its count at `:276-286`, re-pointed at `46121954`; `build/88`).
  `docs/troubleshooting.md:32` quotes it.
- **A defaulted client set says so.** When init defaulted the tools, the panel and the dry run print
  `clients: <tools> (the default — no other client's files were found; <route>)`. On a dry run the route is
  `add more with --tools claude,cursor,copilot,codex`. After a live init it is the pinned
  `config set tools claude,cursor,copilot,codex`, then the pinned `sync` (`panel.ts:379-402`, called at `:755` and at
  `init.ts:775`). A detected or flagged client set prints no such line, and a client list carried from a predecessor
  setup is not called the default (`init.ts:595-599`).
- **Codex next steps** carry the two trust steps that are the operator's, read from the adapter's `HOOK_TRUST_STEPS`:
  project trust in `~/.codex/config.toml` before `codex`, and the `/hooks` review after it. The feature flag has no
  operator step, because setup writes it (`panel.ts:167-191`; `src/adapters/codex.ts:183-266`). The
  `.codex/hooks.json` description and the `.codex/config.toml` comment keep their bytes, so Codex asks for no new hook
  trust.
- **Copilot next steps** name the coding agent's setup workflow and when GitHub runs it, and only when the live run
  wrote that file. The same step reaches the `nextSteps` of `init --json` (`panel.ts:404-437`; `init.ts:1212`).
- **The `.gitignore` disclosure** names exactly the entries the run appended, each with a neutral reason, and the
  panel prints no line when none was appended. An entry with no recorded reason reads
  `machine-local state this setup writes`. The words "the credential file this setup uses" appear only when an MCP
  server is configured and `.env.mcp` is among the entries (`panel.ts:624-669`, `:762-773`). A dry run names the whole
  required set, "wherever it lacks them" (`init.ts:779-788`).
- **The update notice** reads `Update available: <current> -> <new>. To move: npx -y <name>@<new> sync. To stay on
  <current>, do nothing.` The move command is the pinned call, both halves name the one normalized version, and it
  never says `@latest` (`src/cli/notice/updateNotice.ts:286-323`). A package with no npm channel is `private`, so it
  never reaches the notice.
- **`sync --help`** names the exact-version form with a `<version>` placeholder. A package with no npm channel keeps
  its line: install the newer release into the project, then `npx --no <name> sync`
  (`src/cli/commands/sync.ts:63-74`).
- **The Copilot setup workflow follows the project's pins.** `node-version` comes from `.nvmrc`, then
  `.node-version`, then the lower bound `engines.node` names, at the precision it names it (`22` gives `22`, `>=22.12`
  gives `22.12`), else `lts/*`; a value that is not a safe version string is not copied. The `actions/checkout` and
  `actions/setup-node` refs come from the first `uses:` of each in the project's own `.github/workflows/`, read in name
  order, a SHA pin with its trailing comment, else `@v5`. The scan skips the emitted workflow by its own file name, so
  a second sync writes the same bytes (`src/adapters/copilot.ts:538-590`, `:613-620`, `:665-756`). A repository with
  no Node toolchain gets a checkout only, and the file says so (`:549-555`).

- **As built, where the delta differed:**
  - The delta said every printed count equals the files written. The count covers the files the run put on disk other
    than `.gitignore`, which the panel names as changed instead of counting.
  - The cell's default-clients line said `add more with --tools …` in both modes. After a live init a second `init`
    refuses without `--force`, so the live panel names the config `tools` key and a sync (ledger `build/131`, signed
    off at 14:59Z); the dry run keeps `--tools`.
  - The cell's census amendment named `ENGINE_EMITTED_WORKFLOWS` as the scan's skip list. The built scan skips the
    base name of Copilot's own `COPILOT_SETUP_STEPS_PATH` (sign-off at 14:40Z), so one file name has two sources:
    that constant and `ENGINE_EMITTED_WORKFLOWS` (`src/detect/repoAnalyzer.ts:305`).
  - The cell gave `InitApplyReport` one new field. The build added two, `createdKeeps` and `gitignoreAdded`
    (sign-off at 14:40Z), because a count taken from the created directories undercounts.
  - The plan's decision 1 spelled the move as `npx <package>@<version> sync`. The built notice renders the pinned
    call, `npx -y <name>@<version> sync`, as the cell's census amendment says.
  - The Copilot workflow step also reaches `init --json`, and prints on no dry run (`review/138`, `review/141`). The
    banner's version line prints the normalized version, not the raw registry answer (`review/142`).
- **Amended 2026-10-06** (run `2026-10-03_pack-engine-defects`, unit `u6-init-fixes`, integrated as `68d62843`, the
  fallback's value list from `review/40`; cited at `eb4f0727`):
  - **The detected platform.** The init panel prints the hosting platform init wrote into the manifest on a line of
    its own, after the `clients:` line when that line prints, and never inside the disclosure line
    (`src/cli/commands/init/panel.ts:784-788`). It reads `platform: <name> (from the origin remote)`, or, when none was
    detected, `platform: none detected — set it with <the pinned config set platform <name> call>, <name> one of
    github, azure-devops, gitlab`; the values are the keys of `PLATFORM_MCP_SERVER` (`platformLine`, `:377-395`).
  - **One source.** At init the origin remote is the platform's only source: `buildInitDecisions` calls
    `detectPlatform` with no override (`src/cli/commands/init/plan.ts:227`), and `InitOverrides` holds only `tools`
    and `maturityTier`, its doc naming `config set platform` and `config detect` as the routes after init (`:44-53`).
    The unwired `InitOverrides.platform` field is removed.
  - **`--maturity` has a CLI case.** `init -y --maturity enterprise` writes `maturityTier: enterprise` and the panel's
    disclosure line reads `(tier: enterprise, …)`; an unknown tier is refused before anything is written
    (`test/cli/commands/init.test.ts:581-603`).
- **Amended 2026-10-15** (plan 020 file 2, unit `e6-copilot-adapter` and its fix round; `review/96`). The Copilot setup
  workflow always installs Node, because the generated Copilot hooks run on `node`: every repository gets
  `setup-node`, its `node-version` from the project's pin as above, else `lts/*`; a repository with no Node toolchain
  still gets no install step, and the file says Node is there for the hooks (`buildSetupSteps` and `setupNodeStep`,
  `src/adapters/copilot.ts`). The bullet's "else `@v5`" reads per action: `actions/checkout@v6` and
  `actions/setup-node@v7` (`DEFAULT_ACTION_REFS`, the same file), the project's own refs, a SHA pin with its comment
  included, still winning. With no project pin the file advises pinning both actions to a full-length commit SHA, as
  before; where the project pins one, each action left at its major tag keeps that advice by name. The bullet's "A
  repository with no Node toolchain gets a checkout only" describes the releases before 1.15.0.
  - GIVEN a Python repository THEN the workflow holds `setup-node` at `lts/*` and no install step; GIVEN project pins (a
    SHA plus comment) THEN they win; GIVEN a SHA-pinned `checkout` alone THEN the advice names `setup-node`; GIVEN no
    pins THEN `checkout@v6`, `setup-node@v7` and no `@v5` (`test/adapters/copilot.test.ts`; added 2026-10-15).
- **Proof:** `test/cli/commands/initPanel.test.ts`, `test/cli/commands/init.test.ts`,
  `test/cli/commands/initApply.test.ts`, `test/cli/commands/check.test.ts`, `test/cli/notice/updateNotice.test.ts`,
  `test/cli/commands/sync.test.ts`, `test/adapters/copilot.test.ts`; the Codex pins in `test/adapters/codex.test.ts`
  and the goldens in `test/emit/crossClientGoldens.test.ts`, green with no Codex byte moved; `docs/getting-started.md`,
  `docs/troubleshooting.md`; QA.

### REQ-FLOW-023 — Copilot's writing agents load the charter

Retired 2026-09-30 — disposition: live check found no gap. The check this requirement was conditional on ran first in
session 2 (unit `sw14-copilot-charter-live-check`): Copilot CLI 1.0.88, through the emitted `stamity-implementer`
agent with no tools available, quoted both the agent body's first line and the charter's first line under
`## Invariants`; the control run without the agent quoted the charter line too
(`.stamity/runs/2026-09-30_optimization-sweep/record.md:96-101`). No Copilot fix was built. Nothing supersedes this
requirement. Amended 2026-10-10 (run `2026-10-10_next-tier`, unit `q6-copilot-charter-check`): that check ran the agent
as the session's own, with `--agent` (`:96-99`), and its disposition holds for that route; an agent dispatched as a
sub-agent is REQ-FLOW-071's subject.

### REQ-FLOW-024 — A run retires the inbox rows it fixed

At its close, `/st-work` removes each `.stamity/inbox.md` row its change fixed — folded in at Frame or settled by the
persisted plan — and records `- inbox retired: <location> — fixed in <run id>` in its run record. A row whose `Ref:`
names a ledger row is retired, its state kept, through
`stamity ledger close --run <its run> --id <row id> --retired "fixed in <run id>"`; a row the run did not fix stays
as it is (`content/commands/st-work.md:380-383`). `/st-quick`, which keeps no run record, retires a row after the gate
is green — the ledger row first, then the bullet — and names each row retired, and each named row left, in its batch
report (`content/commands/st-quick.md:120-127`). The board's removal rule names both retirers
(`content/commands/st-board.md:379-382`, `:417-422`).

`--retired` sets the optional `retired` field to `<UTC YYYY-MM-DD> <disposition>` on a `deferred` row only, keeps its
state, and reads the date from the caller's clock. A row whose `retired` value already states that disposition is
`unchanged`, on a later day too, so a retirement is never re-dated; another disposition is refused
(`src/runs/ledgerStore.ts:907-991`).

- **As built:** the later-day rule was ratified as built (`review/118`, 14:14Z).
- **Amended 2026-10-10** (run `2026-10-10_next-tier`, units `q9a-disposition`, `q9t-board-inbox-rules` and
  `q10a-work-close`, with their fix rounds): from 2026-10-10, by the caller's clock in UTC, a new `retired` value must
  parse under the grammar of REQ-FLOW-076, else the close is refused with `why` and `next` and nothing is written; the
  check runs after the `unchanged` answer, so a re-run of a value recorded before that day still reads `unchanged`
  (`src/runs/ledgerStore.ts:915-920`, `:992-1001`). A ledger row the close's one question dropped, or scheduled to a
  plan, board or handoff place, is retired then and never appended to the inbox, and an inbox row that answer decided
  leaves by the board's Removal rule (`content/commands/st-work.md:365-368`, `:383-387`;
  `content/commands/st-board.md:428-435`; REQ-FLOW-074). So the body's "a row the run did not fix stays as it is" now
  reads "A row no answer reached stays as it is" (`content/commands/st-work.md:389-390`). Both commands spell the
  third kind of retirement "scheduled to a place with a date or a trigger", where they read "scheduled with a lane, a
  trigger and an owner" (`:373-374`; `content/commands/st-board.md:419-420`). The board still names two retirers, and
  adds that `/st-work`'s close also removes a row its one question dropped, placed elsewhere or re-dated
  (`content/commands/st-board.md:379-382`).
- **Amended 2026-10-12** (run `2026-10-12_board-writes`, units `w1-inbox-write` and `w2-inbox-flow-text`): the close
  removes a fixed row's bullet, and makes every other inbox append, removal and re-date, through
  `stamity ledger inbox-write`; where no CLI form runs or the installed copy lacks that verb, it appends with the file
  tools and records `inbox: by hand (no CLI)` (REQ-FLOW-078; `content/commands/st-work.md:392-399`). The retire step
  through `ledger close --retired` does not change.
- **Amended 2026-10-15** (plan 020 file 3, unit `f4-board-close`). The board's retirer bullet reads "its close walk
  dropped" where the paragraph of 2026-10-10 quotes "its one question dropped" (`content/commands/st-board.md`, its
  Retirers bullet; REQ-FLOW-080). Who retires a row does not change.
- **Proof:** `test/runs/ledgerClose.test.ts`, `test/cli/docs/cliReference.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/board.test.ts`, `test/records/ledgers.test.ts`;
  must-holds `work-proof-block-fields` and `quick-next-step-derived-from-batch-state`; QA.

### REQ-FLOW-025 — Run records are written with the file tools

`/st-work` tells the agent to create and extend `record.md`, `plan.md` and reports with the client's file write and
edit tools — never a shell redirect, a heredoc or `cat >` — and to move ledger rows only through the `ledger` verb
(REQ-CTX-005) (`content/commands/st-work.md:32-35`); a build or fix dispatch names the report path, written with the
file write tool (`:136`). The close writes the inbox through `stamity ledger inbox-write` (REQ-FLOW-078; `:392-399`).

Landed 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit `b4-no-read-allow-rows`, inbox row 324; shipped with
1.14.0): setup writes no permission allowlist. The engine renders no `permissions` member in
`.claude/settings.json` (`buildSettingsJson`, `src/adapters/claude.ts`; route clause dropped 1.15.0: "in repository
setups and in plugin setups alike (`stamity plugin setup`, where a plugin that carries hooks leaves the engine no member
to write …)", the verb and the mode deleted in 1.15.0). The three `read`
rows a release rendered (`Read`, `Grep`, `Glob`) leave on the next `sync` without a backup where the ledger records
them, and an owner's equal row with no record stays; a ledger from 1.11.0, which records no entries, takes them by
REQ-FLOW-036's expand/contract rule. A bare `Read` rule matches every file read, and reads inside the working
directory need no rule, so the rows only removed prompts for reads outside the project
(code.claude.com/docs/en/permissions, read 2026-10-08). It read: "Not shipped: the plan's sentence "Setup writes no
permission allowlist"", deferred under ledger `build/124` (answered on 2026-09-30 at 14:29Z) with a follow-up row in
`docs/plans/013-optimization-sweep-03.md`.

- **Proof (2026-10-08):** `test/merge/settingsOwnerEntries.test.ts` (the describe "the Read, Grep and Glob allow rows
  an earlier release rendered (inbox row 324)"), `test/adapters/claude.test.ts`.

- **Amended 2026-10-12** (run `2026-10-12_board-writes`, unit `w2-inbox-flow-text`; MODIFIED in that run's spec
  delta). The inbox left the file-tool sentence, which read "create and extend `record.md`, `plan.md`, reports and the
  inbox with the client's file write and edit tools"; the line count of Frame step 5 is unchanged
  (`content/commands/st-work.md:31-35`). The close makes every inbox append, removal and re-date through
  `stamity ledger inbox-write` (REQ-FLOW-078; `:392-399`).
- **As built, where the delta differed:** the delta's after-text read "the close writes the inbox only through
  `ledger inbox-write`". It landed with a fallback beside it: where no CLI form runs or the installed copy lacks
  `inbox-write`, the close appends with the file tools and records `inbox: by hand (no CLI)`, and otherwise it never
  opens the inbox with them (`:398-399`; sign-off S18, `review/42`).
- **Amended 2026-10-16** (plan 021 file 1, unit `u20-hook-emission`): the settings' `permissions` member. Given
  `buildSettingsJson`, Then `.claude/settings.json` carries the engine's `permissions.deny` rows (REQ-FLOW-102), the
  person-only table's `CLAUDE_DENY_ROWS`, and still no allow row (`src/adapters/claude.ts:932-935`), so "setup writes no
  permission allowlist" holds and "The engine renders no `permissions` member" above reads "renders no
  `permissions.allow` row"; the tests that pinned no `permissions` member moved with it (`test/adapters/claude.test.ts`,
  its describe on the person-only deny rows; `test/merge/settingsOwnerEntries.test.ts`).
- **Amended 2026-10-18** (plan 021 file 2, unit `v0a2-ask-emission` and its test-file fix round). Given
  `buildSettingsJson`, Then `.claude/settings.json` carries the engine's `permissions.ask` rows (REQ-FLOW-123) beside
  its `permissions.deny` rows, which now hold only deletions and force pushes (REQ-FLOW-124), and still no allow row, so
  "setup writes no permission allowlist" holds; the criterion added 2026-10-16 reads `permissions` holding the engine's
  `ask` and `deny` rows and no `allow` row (`src/adapters/claude.ts:1003`, `CLAUDE_DENY_ROWS` and `CLAUDE_ASK_ROWS`
  from `src/hooks/personOnly.ts`). The file-tool and inbox clauses are unchanged. Proof: `test/adapters/claude.test.ts`,
  `test/merge/settingsKeyOwnership.test.ts`, `test/cli/flows.e2e.test.ts`, `test/cli/ledgerForgery.test.ts`.
- **Proof:** `test/corpus/recordWrites.test.ts` (the Frame text, and a line lint over `content/` that fails on a shell
  redirect, heredoc or `tee` aimed under `.stamity/`); must-holds `work-proof-block-fields` and the floor
  `charter-touchpoints-delegate`; QA.

### REQ-FLOW-026 — The touchpoints ship as shared skills, so Codex gets them

From `docs/plans/013-optimization-sweep-03.md` § Spec delta A, the unit `sw17-touchpoints-as-shared-skills`, its
sign-offs and its live check. Every `path:line` below is read at `a9e94f06`, where the unit and its fix rounds have
integrated. Before the unit, `CODEX_COMMANDS_DIR` was `null` and Codex received no touchpoint body.

- When Codex or Cursor is selected, sync emits each of the nine touchpoint bodies once, as
  `.agents/skills/st-<id>/SKILL.md`, with a companion `.agents/skills/st-<id>/agents/openai.yaml` that sets
  `policy.allow_implicit_invocation: false` (`src/emit/skillsProjection.ts:522-593`). The skill's head has three
  keys: `name`, `description` and `disable-model-invocation: true` (`:595-616`). Codex and Cursor both emit the rows
  and co-own each file, so it survives the deselection of one of them (`src/adapters/codex.ts:77-97`, `:435-437`;
  `src/adapters/cursor.ts:70-104`).
- Codex starts one as `$st-<id>`, and Cursor as `/st-<id>`. Init's Codex steps say `invoke one as $st-<id>` and
  `then type: $st-onboard`, never a slash (`src/cli/commands/init/panel.ts:167-189`). Codex's `command-surface`
  capability row names the tree, the companion key and what was measured (`src/adapters/codex.ts:355-366`).
- Claude keeps its `.claude/commands/` files, and its native skills copy carries no touchpoint. Copilot alone gets no
  shared touchpoint, and its prompt files stay. With Codex or Cursor beside it, Copilot lists the nine as project
  skills beside its prompt files and keeps them out of the model's own skills list; its `command-surface` row
  declares the double listing (`src/adapters/copilot.ts:165-175`).
- Sync stops writing `.cursor/skills/st-<id>/`. The rows a 1.10.0 install recorded there are planned by nobody, so the
  reclaim sweep removes those files and nothing else under `.cursor/` (`src/adapters/cursor.ts:84-90`).
- Codex's skills-list check counts the touchpoints: the full selection measures 6,909 characters over 26 skills
  against the 8,000 cap (`codexSkillsListChars`, `src/emit/capabilityMatrix.ts:379-384`; the refusal at
  `src/adapters/codex.ts:397-418`; REQ-PROVE-004).
- (Route clause dropped 1.15.0: this bullet said which plugin root carried the touchpoints and that
  `stamity plugin setup` wrote them into the shared tree, citing the plugin packagers under `scripts/plugins/`; the
  route, the verb and those files are deleted, and the bullet reads at `c96c7146`. The touchpoints stay
  repository-owned, written by `sync` as the bullets above state.)

- **Live check** (2026-09-30T15:56Z, a fixture set up by the lane's `init -y --tools codex,cursor,copilot`):
  codex-cli 0.155.1 loaded the body on `$st-work`; cursor-agent 2026.09.28 loaded it on `/st-work`; Copilot CLI
  1.0.89 listed the nine under project skills, and its model-visible skills list omitted them
  (`.stamity/runs/2026-09-30_optimization-sweep/record.md:118-122`).
- **As built, where the delta differed:**
  - The delta relied on `disable-model-invocation: true` alone. Codex takes the rule from the `agents/openai.yaml`
    companion, which the build adds.
  - The delta's criterion counted the rows with Codex selected. They also land with Cursor alone, which reads the
    shared tree, and never for Claude or Copilot alone.
  - The delta did not say where the Codex plugin puts the touchpoints. The unit first packaged them as plugin skills
    (26 folders against the pinned 17) and stopped; the sign-off kept them repository-owned.
  - Whether a plain ask that names no touchpoint can still start one on Codex is unmeasured, and the capability row
    says so (`review/156`, signed off at 16:14Z).
- **Expand/contract:** the shared rows are added and the `.cursor/skills/st-<id>/` rows reclaimed in the same sync,
  which the live Cursor check gated. Rollback is a re-sync at the prior version. The Codex cells of the parity table in
  `docs/specs/orchestrator-context.md` moved with the unit (amended 2026-09-30).
- **Amended 2026-10-06** (run `2026-10-03_pack-engine-defects`, unit `u3-codex-shown-rows`, integrated as `0da30714`;
  cited at `eb4f0727`). The skills-list bullet above is superseded: Codex's skills-list check leaves the touchpoints
  out. Each touchpoint's `agents/openai.yaml` sets `policy.allow_implicit_invocation: false`, and codex-cli 0.160.0
  (2026-10-03) and 0.160.1 (2026-10-06) keep such folders out of the skills list they show the model
  (`.stamity/runs/2026-10-03_pack-engine-defects/record.md:298-299`). The full selection measures 5,570 characters
  over 17 shown skills against the 8,000 cap (`codexSkillsListChars`, `src/emit/capabilityMatrix.ts:379-387`; the
  count at `src/adapters/codex.ts:417-430`; REQ-PROVE-004, amended 2026-10-06). Whether a plain ask that names no
  touchpoint can start one on Codex is still unmeasured: those checks cover the listing only.
- **Amended 2026-10-08** (run `2026-10-08_maintainer-tooling`, unit `d1a-rendering-proof-core`; the maintainer's answer
  that a retired layout is kept). A `.cursor/skills/st-<id>/` copy a 1.10.0 install wrote is no longer removed by the
  sweep. The running engine renders nothing at that path, so its bytes cannot prove the delete (REQ-PLUGIN-046, amended
  2026-10-08): the sweep keeps it as `skipped-user-content`, the sync report names it with the step to delete it by hand,
  and its row leaves the ledger with that sync, so later syncs and `check` do not report it again. The bullet "the
  reclaim sweep removes those files and nothing else under `.cursor/`" and the Expand/contract sentence "the
  `.cursor/skills/st-<id>/` rows reclaimed in the same sync" describe the releases before this amendment; the 1.10.0
  case the Proof bullet names now pins the keep.
- **Proof:** `test/emit/touchpointSkills.test.ts`, `test/emit/skillsProjection.test.ts`,
  `test/adapters/codex.test.ts`, `test/adapters/cursor.test.ts`, `test/adapters/copilot.test.ts`,
  `test/cli/commands/initPanel.test.ts`, `test/cli/commands/syncEngine.test.ts` (the 1.10.0 reclaim case),
  `test/docsPages.test.ts`; the live check; QA. (Route clause dropped 1.15.0: the list also named three suites of the
  plugin route, deleted with it.)

### REQ-FLOW-036 — `.claude/settings.json` is merged entry by entry, and an owner's entries survive every verb

From `docs/plans/016-fork-distribution-00.md` § Spec delta B, the unit `u0-settings-ownership`. The engine owns only what
it writes into `.claude/settings.json`: each `permissions.allow` row and each hook entry (one element of a
`hooks.<Event>` array) it wrote, and any whole member a later requirement declares (the two declaration pointers of plan
016 file 2's `u2-declare`). The ledger records each by the sha256 of its canonical JSON. Everything else is the owner's:
the engine never writes, replaces or removes `permissions.deny`, `permissions.ask`, any other member of `permissions`,
or an entry it did not write.

- **Merge, never a collision.** An owner's existing `permissions` or `hooks` key is merged: the owner's rows and entries
  keep their place and the engine's form one block beside them. The file collides only when it is not a JSON object or a
  member the engine writes into has another type (`permissions` not an object, `allow` not an array, `hooks` not an
  object, an event not an array); the message names the member and the fix, `--force` does not clear it, and no command
  offers `--force` for it.
- **What leaves, and when it takes a `.bak`.** An engine entry the rendering no longer carries leaves without a backup
  only when the ledger records it (or proves the file unedited) and it lies inside the engine's bound: an allow row a
  release rendered (`Read`, `Grep`, `Glob`; the engine renders none since 2026-10-08), or a hook entry whose every command runs a script under `.stamity/`. Any other
  engine entry leaves only behind a verified `.bak`, with a warning naming it. A hook entry recognised by its script under
  `.stamity/generated/hooks/` but not recorded (an earlier setup's, or one edited by hand) is the engine's to replace or
  remove, behind that backup. A recorded hash outside the bound proves nothing, and an allow row outside it stays the
  owner's.
- **Style.** The merged file keeps its own indentation (two or four spaces, a tab, or one line), key order, line ending
  and final newline.
- **Round trip.** `clean` removes the engine's entries, keeps every foreign one, writes no `.bak` when only foreign
  content changed, and deletes the file only when the engine created it and nothing foreign remains; containers that
  existed before setup stay even when emptied.
- **Amended 2026-10-07 (build).** The bound for a hook entry is the script it executes, in the engine's own script
  folders: `.stamity/generated/hooks/` or an installed pack's `.stamity/packs/<id>/`; a `.stamity/` path elsewhere in
  the command does not count, and the user's `.stamity/hooks/` lies outside (`commandRunsStateScript`,
  `src/manifest/coOwnedJson.ts`). A user-hook entry is proven only by re-rendering a definition still in
  `.stamity/hooks/` (`coOwnedReclaimRenderings`, `src/cli/engine/emissionWrite.ts`): adding a definition, and `clean` in
  a repository with user hooks, take no `.bak`; editing or removing a definition leaves one verified `.bak` and a warning
  naming the entry. A whole member the engine writes, `yield` or `collide`, changes or leaves without a backup only when
  it equals the engine's current rendering or a value a release rendered there; a differing `collide` member is a
  `co-owned-shape` collision naming it. A document that cannot round-trip — a value shadowed by a duplicate key, or a
  number a double cannot hold exactly (`roundTripLoss`, `src/manifest/jsonMembers.ts`) — takes a verified `.bak` before
  any write, its warning naming why; a byte-order mark survives the merge. A co-owned row with no hash reads as drifted.
  A `co-owned-shape` refusal keeps the document's ledger rows and record. Only documents that wire hooks hold back the
  scripts they run from `clean` and a client's removal. `check`'s prediction passes the write's own ledger hashes, so
  its preview is the write.
- **Units:** `u0-settings-ownership`. The per-entry core (`src/manifest/coOwnedJson.ts`) is a shared contract that
  REQ-FLOW-037 and plan 016 file 2's `u2-declare` build on.
- **Evidence (before):** ownership was per top-level key (`src/adapters/claude.ts:215-217`;
  `src/manifest/claudeSettings.ts:385-399`, at `d10db029`); an owner's differing key with no ledger row skipped the file
  (`:423-436`), and with a row or `--force` was replaced behind a `.bak` (`:472-484`). Measured 2026-10-06 on 1.11.0: an
  owner `permissions` holding `deny: ["Bash(rm -rf:*)"]`, plus a `PreToolUse` hook, made `init -y` exit 0 and skip the
  file. `sync -y --force` and `init -y --force` dropped the deny rule and the hook. A deny rule added after setup made
  `check` print "next: … sync", and a plain `sync -y` removed it (exit 0). A foreign key added after setup left a
  1,883-byte `.bak` at `clean`, and a four-space file without a final newline came back two-space with one.
- **Expand/contract:** a ledger from 1.11.0 records no entry hashes and reads as legacy. Entries equal to the rendering,
  allow rows inside the bound and recognised hook entries count as the engine's. A changed one leaves silently while the
  file still hashes to the recorded hash, and behind a `.bak` otherwise. The first `sync` records the entries. A 1.11.0
  CLI drops `coOwned` on its next write and falls back to its per-key rule. Rollback is a re-sync at the prior version.
- **Amended 2026-10-16** (plan 021 file 1, unit `u20-hook-emission` and its fix rounds): the engine's deny rows. Given
  the person-only deny rows (REQ-FLOW-102), Then the engine writes the rows of its table the file lacks and records
  those it added by the hash of their canonical JSON, but no `permissions.deny` row in the file is ever judged the
  engine's, since a hash cannot tell its row from an owner's equal one: `sync` keeps every row already there byte for
  byte and in place, an owner's row equal to an engine row included, whatever the ledger's age (under a 1.11.0 row,
  after setup, or after a lost record), and appends only the missing rows; `clean` never removes a `permissions.deny`
  row and names the rows equal to the engine's that it left, for the person to remove by hand
  (`src/manifest/claudeSettings.ts:154`, `:230-237`, `:337-346`). "Never writes, replaces or removes
  `permissions.deny`" above reads as never replaces or removes a deny row; `SECURITY.md:98` says the same since unit
  `u21-security-page`: the engine removes no `permissions.deny` row, `sync` keeps every deny row byte for byte and
  `clean` leaves every deny row and names those equal to the engine's (read at `bc12cfc3`; `test/docsPages.test.ts`,
  "restates the settings promise to what clean does with a deny row").
- **Amended 2026-10-18** (plan 021 file 2, unit `v0a2-ask-emission`). Given the engine's ask rows (REQ-FLOW-123), Then
  `permissions.ask` takes the co-ownership `permissions.deny` took on 2026-10-16: the engine adds the rows of its table
  the list lacks and records those it added, `sync` keeps every row of either list byte for byte and in place, an
  owner's row equal to an engine row included, whatever the ledger's age, and `clean` removes no row of either list and
  names those equal to the engine's that it left. "Never writes, replaces or removes `permissions.ask`" reads as never
  replaces or removes an ask row; `SECURITY.md`'s settings row says the same (`src/manifest/claudeSettings.ts`, the
  co-ownership and `isEngineDenyRow`, which reads both tables). As built, beyond the delta: `clean`'s detail reads "It
  left the rows equal to the engine's in permissions.deny (…) and permissions.ask (…): clean removes no deny row, as an
  equal one may be yours. It removes no ask row either."; an owner's deny row equal to an engine ask row is kept, and
  the client's deny-before-ask order then refuses that act. Proof: `test/merge/settingsOwnerEntries.test.ts`,
  `test/manifest/claudeSettings.test.ts`.
- **Proof:** `test/merge/settingsOwnerEntries.test.ts`, `test/merge/settingsKeyOwnership.test.ts`,
  `test/manifest/coOwnedJson.test.ts`, `test/manifest/jsonMembers.test.ts`, `test/manifest/claudeSettings.test.ts`,
  `test/merge/reclaim.test.ts`; QA.

### REQ-FLOW-037 — Cursor's and Codex's hook files are merged entry by entry, Codex's configuration table by table, and no kept hook loses its script

From `docs/plans/016-fork-distribution-00.md` § Spec delta B, the unit `u0-hook-files-ownership`. `.cursor/hooks.json`
and `.codex/hooks.json` are owned per entry by the core of REQ-FLOW-036. The engine owns each element of a
`hooks.<event>` array it wrote, recognising an entry by the script it runs (`.stamity/generated/hooks/<client>/`, or one
of Cursor's two guards). It also owns Cursor's `version` while anything of the engine's remains, and Codex's
`description` unless the owner wrote one. An owner's entry survives `sync` and `clean`, and no `.bak` is written when only
foreign entries changed. `.codex/config.toml` is owned per table. The engine owns `[features]`, the bare `[mcp_servers]`
when it selects no server, and each `[mcp_servers.<id>]` it renders. An owner's own table of one of those names, or an
engine table the owner edited, is the owner's and is kept, and the engine writes no second header; for `[features]` the
run warns when the kept table sets `hooks = false` (Codex runs hooks by default; vendor re-read 2026-10-07). Every other
table and every top-level key is the owner's, kept byte for byte. `clean`, and a `sync` that removes a client, never
delete a hook script that a hooks document they keep still runs: they report it kept, and `clean` then keeps `.stamity/`
when such a script lives there.

- **Amended 2026-10-07 (build).** The unit was built in two halves: the TOML half (`src/manifest/tomlTables.ts`,
  `src/manifest/codexConfigToml.ts`, the `.codex/config.toml` lane), then the JSON half (`src/manifest/hookDocuments.ts`,
  the Cursor and Codex hooks lanes) in two passes, the second the guard rename of REQ-FLOW-038.
  - **Entries.** A Cursor entry leaves without a backup only when the script it executes lies under
    `.stamity/generated/hooks/cursor/` or an installed pack's `.stamity/packs/<id>/`, or is one of the guards; a Codex
    group only when every inner hook is the engine's `node -e` starter, or, as releases up to 1.6.0 wrote it, an argv
    running a script under `.stamity/generated/hooks/codex/` or executing one in an installed pack's folder
    (`src/manifest/hookDocuments.ts`). An entry a release up to 1.6.0 wired directly from a user hook or an installed
    pack's hook is the engine's only when it equals that old direct form re-rendered from the definitions the engine
    still wires — user rows first, then pack rows, the order 1.6.0 wrote them in (`directHookRendering`) — never by the
    whole-file hash alone, so a forged legacy row removes no owner entry.
  - **Members.** Cursor's `version` is a `collide` member and Codex's `description` a `yield` one, each bounded by every
    value a release rendered there (`version` 1 in every release; five `description` texts from 1.7.0 to 1.11.0, the
    pinned check call normalised away). The top-level `stamity` member 1.0.0 to 1.6.0 wrote into `.codex/hooks.json` is
    declared with its one release value: it leaves silently, and any other `stamity` is the owner's.
  - **Codex tables.** `[features]` is the engine's only when its text is one of the renderings a release wrote (1.8.0
    to 1.9.1, 1.10.0 to 1.11.0, and the current one; `RELEASED_FEATURES`). An owner key that defines without a header a
    table the engine writes a header for (`features.x`, an inline `features`, an inline server in an owner's
    `[mcp_servers]` the engine writes), and an owner `[[mcp_servers]]` beside a server table the engine writes, are
    `co-owned-shape` collisions naming the key or the header's line. A selection whose record would pass the manifest
    reader's bound is refused (63 servers is the most), naming `config mcp remove <id>`. An owner's comment between two
    engine tables stays above the table it sat above; a comment appended after the engine's last table edits that
    table, which is then the owner's and is kept, with no `.bak`.
  - **Codex's hooks turned off.** A kept key that sets Codex's hooks feature to `false` fails `check`, as a Cursor
    entry Cursor rejects does: `hooks = false` or a quoted `"hooks"`/`'hooks'` in `[features]`, its deprecated alias
    `codex_hooks`, or `features.hooks = false` at the root. `check` names the file, the line and the remedy (set it to
    `true`, or remove the key); `sync` and `init` keep the table and warn with the same sentence, and a root dotted key,
    already a `co-owned-shape` collision, carries the sentence in its refusal (`describeCodexHooksOff`,
    `src/manifest/codexConfigToml.ts`; carried as the plan entry's `rejected`, judged on the text the write's own
    prediction leaves; `review/81`).
  - **Scripts kept.** The sweep reads every hooks document still on disk, candidate or not (`hookDocumentsLeftInPlace`,
    `src/merge/reclaim.ts`, fed by `hookScriptRetention` in `src/cli/engine/emissionWrite.ts`), and a preview (`check`,
    `sync --dry-run`) reads a document the write rewrites as the write leaves it. `clean --json` names the scripts that
    kept `.stamity/` as `stateDirKept`. Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit
    `d2-forced-preview`, inbox row 588): under `--force` a preview also reads, as the forced write leaves it, a hooks
    document whose collision `--force` clears (`unmanaged-name`), so `sync --dry-run --force` never shows Kept for a
    script the forced run deletes. A document the forced write refuses at write time (a hard link, a symbolic link, or
    one under a folder that resolves outside the repository) is still read from disk, as the forced run stops before its
    sweep, and so is a document of any other collision class, which `--force` does not clear; `check` previews without
    the flag (`forceClears` and `forcedWriteLands`, `src/cli/commands/sync/engine.ts`). Before the amendment
    `hookDocumentsAfterWrite` left every collided document out, so a preview read it from disk even where `--force`
    clears the collision.
  - **Cursor's rejected entries.** A `.cursor/hooks.json` holding an entry Cursor rejects fails `check`, whoever wrote
    it; `sync` and `init` keep the entry and warn naming it. The check reads the event key against the 21 events
    cursor.com/docs/hooks lists (read 2026-10-07, Cursor 3.23.23; `CURSOR_HOOK_EVENTS`) and each entry by type: `type`
    absent or `"command"` needs a `command`, `"prompt"` needs a `prompt`, any other `type` fails (`cursorHookDefects`).
  - **Amended 2026-10-15** (plan 020 file 2, units `e5-hook-starter` and `e7-cursor-pins`; `review/84`). The script an
    entry runs is read through the 1.15 walk-up starter as well as the earlier `node <script>` form: a Cursor entry
    whose starter runs a script under `.stamity/generated/hooks/cursor/`, or one of the two guards, is the engine's, and
    one that runs anything else, a pack script included, or an edited starter, is not (`walkUpStarterScript`,
    `src/manifest/hookDocuments.ts`). The model-fill entry of REQ-LADDER-007 is the engine's by that rule, so an upgrade
    rewrites it in place with no `.bak`. The bound this requirement states is unchanged; `e5`'s narrower first reading,
    a starter in the bound only when it runs the runner or a guard, was brought to this text before the merge.
- **Units:** `u0-hook-files-ownership`.
- **Evidence (before):** all three were whole-file outputs (`src/adapters/cursor.ts:778-819`,
  `src/adapters/codex.ts:930-973`, `:1097-1149`, at `d10db029`). Measured 2026-10-06 on 1.11.0: an owner entry in
  `.cursor/hooks.json` and an owner group in `.codex/hooks.json` were each dropped by `sync -y` behind a `.bak`, and
  `check` reported the file as drift. An owner `[mcp_servers.<id>]` table was removed by `sync -y`. With an owner entry
  and no sync in between, `clean -y` kept the hooks file whole and deleted the scripts it runs, Cursor's two
  `failClosed` guards included. Cursor drops the whole file on one unknown event key, and with it the guards
  (microsoft/apm#3129, shown for Cursor 3.13.10).
- **Expand/contract:** 1.11.0 rows carry no `coOwned` and read as legacy; the first `sync` records the entries and
  tables. An edited 1.11.0 `.codex/config.toml` keeps every table outside the engine's names. Rollback is a re-sync at
  the prior version, which drops owner entries and tables again.
- **Proof:** `test/merge/hookFilesOwnership.test.ts`, `test/manifest/tomlTables.test.ts`,
  `test/manifest/codexConfigToml.test.ts`, `test/manifest/hookDocuments.test.ts`, `test/cli/commands/clean.test.ts`,
  `test/emit/syncDriftProof.e2e.test.ts`; QA.

### REQ-FLOW-038 — The engine's files in a folder users share carry the `stamity-` prefix

From `docs/plans/016-fork-distribution-00.md` § Spec delta B, the unit `u0-hook-files-ownership`. Every file the engine
writes into a folder where users keep files of their own carries a `stamity-` or `st-` name segment. A hand-written file
then never shares a name with an engine one, and a reviewer tells the two apart by name. The only unprefixed engine
paths are the fixed client files a client reads by name and the state directory. The fixed files are the three
charters, `.claude/settings.json`, `.cursor/hooks.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.codex/hooks.json`,
`.mcp.json`, `.vscode/mcp.json`, `.github/hooks/stamity.json` and `.github/workflows/copilot-setup-steps.yml`. Cursor's
two guards become `.cursor/hooks/stamity-subagent-guard.mjs` and `.cursor/hooks/stamity-mcp-guard.mjs`. The first
`sync` after an upgrade writes the new names and rewires `.cursor/hooks.json`. It removes each old name only when its
bytes still hash to what the ledger recorded, inside the engine's bound; an edited one is kept and reported.

- **Amended 2026-10-07 (build).** The bound lists both new names and keeps the two old ones, so a 1.11.0 row at an old
  name still validates (`OWNED_PATHS` `version` 2, REQ-PLUGIN-045; `LEGACY_CURSOR_GUARD_PATHS`,
  `src/adapters/cursor.ts`, which nothing writes). An entry running an old name counts as the engine's only where the
  manifest's ledger records that name — a setup that ran a release before the rename; elsewhere the old names are free,
  and an entry running one is the owner's (`cursorGuardPathsFor`, `src/cli/engine/emissionWrite.ts`). A hooks document
  the sweep leaves in place — kept, refused or linked — keeps the old guards it still runs, and a preview (`check`,
  `sync --dry-run`) reads the rewired document as the write leaves it, so it shows the old guards as the deletes the
  write then makes. A `.cursor/hooks.json` refused as `co-owned-shape` carries the old guards' ledger rows through each
  `sync` until the owner fixes it, so the old names stay the engine's to reclaim once it is.
- **Amended 2026-10-08** (run `2026-10-08_maintainer-tooling`, unit `d1b-cursor-guard-pins`, inbox row 585, with lane
  D's fixer rounds 2 and 3). The first `sync` after an upgrade from 1.11.0 recognises an old guard, and the
  `.cursor/hooks.json` entry that runs it, by the bytes a frozen copy of the 1.11.0 guard builder
  (`src/adapters/cursorLegacyGuards.ts`) renders for that setup, together with the ledger row it already required, not
  by a recorded hash. The copy renders with the setup's agent roster — the ten agents 1.11.0 shipped plus every Cursor
  agent row the ledger records, pack and override agents included — and the package name and npm channel the running
  installation has, at version 1.11.0. So a core setup, a setup with a local pack's agents, one with an override agent,
  and a fork's setup under the fork's package name are each recognised; 1.11.0's own `sync` refused the curated `ops`
  pack on Cursor, so no 1.11.0 Cursor setup holds it. An entry running an old name is the engine's only when it is
  exactly the entry 1.11.0 rendered for that name and its script is absent or that re-render, and a co-owned record
  cannot claim one: the pins' hashes are dropped from the record the lane reads (`provenLegacyCursorGuards`,
  `src/cli/engine/emissionWrite.ts`). An entry whose script is absent is still rewired. A guard whose bytes are not that
  re-render (an owner's own file at an old name, or a hand-edited guard) stays with the entry that runs it, and the sync
  report names both; `clean` and `init --force` read the same proof. Two 1.11.0 setups keep their old spawn guard and
  its entry, named, on the safe side: one whose ledger lost a Cursor agent row, and one whose plugin carried the `agent`
  class but not the hooks, where 1.11.0 rendered its pack and override agents into the guard's roster but recorded no
  Cursor agent row for them (`review/99`). After a first `sync` that refused `.cursor/hooks.json`, a later `sync` reads
  the roster from the ledger the running engine rewrote, which matches 1.11.0's only while no agent has been added to or
  removed from the corpus since 1.11.0, as holds today; after such a change that guard would be kept the same way
  (`review/99`). The requirement's sentence "It removes each old name only when its bytes still hash to what the ledger
  recorded" describes 1.12.0.
- **Units:** `u0-hook-files-ownership`.
- **Evidence (before):** `src/adapters/cursor.ts:110-116` at `d10db029`. Of the 201 paths a four-client `init` records
  on 1.11.0, 11 carry no prefixed segment: the six fixed client files, the three charters and the two guards.
- **Expand/contract:** the old names are reclaimed by proof (route clause dropped 1.15.0: "the plugin roots ship the new
  names under `hooks/`, and a client on an older root keeps the old names inside its own root, which `sync` never
  touches"; no plugin root ships since 1.15.0).
- **Proof:** `test/emit/namePrefix.test.ts`, `test/adapters/cursor.test.ts`, `test/merge/hookFilesOwnership.test.ts`;
  `test/adapters/cursorLegacyGuards.test.ts` with its four fixtures (added 2026-10-08).

### REQ-PLUGIN-005 — The emitted runner starts its launcher by an absolute path

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`). Only its CLI amendment moved. The requirement's first half, how a plugin container's hooks
resolve their root variables and read the container's own policy document, retires with the plugin route, and its
text reads at `c96c7146`; the heading read "Plugin hooks resolve their roots and never write configuration".

Amended 2026-10-12 (read at `1b492297`). The emitted runner starts a row whose launcher is the word `node` as
`process.execPath`, the interpreter the runner itself runs under, so no lookup by name takes place; a row naming any
other launcher, `node.exe` and a path to node included, is started by the name the row gives (`buildPortableHookRunner`,
`src/hooks/portableRunner.ts`). The working folder, `shell: false`, the timeout and the buffer are unchanged.
`SECURITY.md`'s row on how git is started names this start beside git's, and a hook with any other launcher as a
residual. No requirement id and no criterion is added. Tests: `test/hooks/portableRunner.test.ts`, the describe "which
program a row's launcher starts"; its three cases under "on a Windows host, where the runtime takes the child's folder
first" run on Windows only, and the cases under "on a POSIX host whose PATH names the folder the child runs in" are
skipped there.

Amended 2026-10-14 (plan 020 file 1; cited at `d590a266`). The paragraph above is unchanged. Of the retired half, the
repository-mode reading stands: the guard reads the one policy document it was rendered for, the
`../../agent-tool-policies.json` climb, chosen when the hooks are planned rather than ordered at run time
(`policiesPathFor` and `POLICIES_PATH_FROM_SCRIPT`, `src/emit/hooksInfra.ts:104`, `:119-121`). The container layout
the rest of that half described, `hookScriptsRoot` set, is still in the code with no route left to set it; the plan's
follow-up row removes it (`docs/plans/020-cli-native-01.md`, its Follow-ups).

Amended 2026-10-15 (plan 020 file 2, unit `e5-hook-starter`; the delta's amended text from `review/83`; the inbox rows
`2026-10-11_release-1-14-0/close/5` and `close/9`). Every launcher starts by an absolute path (`launcherPath` in
`buildPortableHookRunner`, `src/hooks/portableRunner.ts:279-296`; the fault exits at `:266`, `:315-317`). `node` and `node.exe`, in any letter case on Windows, start as
`process.execPath`; a launcher spelled as a path is resolved against the child's folder; any other name is started by
the absolute path of an inlined copy of the engine's own `PATH` walk (`src/shared/programPath.ts`), which takes only
full-path entries, skips any entry whose real path is the folder the hook runs in, and tries `.com` then `.exe` on
Windows. Where no entry holds it, the hook fails naming the launcher ("launcher \"<name>\" not found on PATH outside the
folder the hook runs in") through the row's own fault exit, the one the runner already took for a failed start: 1, 2 on
a Codex blocking row, and 0 on Copilot's core-guard row, whose fault posture the runner pinned before this change; never
an exit that turns a blocking row's fault into a pass. So the paragraph of 2026-10-12's "a row naming any other launcher,
`node.exe` and a path to node included, is started by the name the row gives" describes 1.14.0, and `SECURITY.md` names
this start beside git's with the residual closed. The heading read "The emitted hook runner starts `node` by an absolute
path".

- GIVEN a launcher `node.exe` THEN it starts `process.execPath` on all three clients; GIVEN `Node`, `NODE.EXE` or
  `Node.Exe` on Windows THEN the same; GIVEN a launcher no accepted entry holds THEN the hook fails with the row's fault
  exit naming it; GIVEN another launcher's file at the repository root, reached by an empty `PATH` entry, `.` or its full
  path, THEN it is not started (`test/hooks/portableRunner.test.ts`, the launcher cases; added 2026-10-15).

As built, where the delta differed: the delta's first wording said a launcher the walk cannot find exits 1; the code
takes each row's fault exit, which the delta was amended to before this merge (`review/83`). The amended delta named 1
for every Cursor and Copilot row; the landed runner keeps Copilot's core-guard row at its existing 0, as the unit's report
states and the runner's tests pin.

### REQ-PLUGIN-014 — The manifest's `gates` object, and the `plugin` key held through the 1.15 line

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (run `2026-10-14_cli-native`). The plan's
spec delta did not list it; it moved by that plan's rule that a requirement with a CLI job moves, since the manifest's
`gates` object is the CLI's. The text below is the requirement as it stood there at `c96c7146`, its route clauses
dropped in place; the heading read "Manifest records plugin-backed mode additively".

Given the manifest schema, When the plugin fields are added, Then `MANIFEST_VERSION` is unchanged, an optional `gates`
object accepts `test`, `lint`, `typecheck` and `all` as non-empty single-line command strings, every manifest fixture
written before the fields existed parses unchanged and round-trips without gaining a key, and a manifest carrying an
unknown key under `gates` is refused naming the key (route clause dropped 1.15.0: the `plugin` object's grammar, "an
optional `plugin` object accepts `mode` of exactly `generated` or `plugin-backed` plus an optional `clients` map from
tool to `{ version, classes }` where `classes` is a subset of `agent, skill, command, rule, hooks`", and "under
`plugin` or").

As built (2026-09-20): `MANIFEST_VERSION` is unchanged, both fields are additive at schema 1.0.0, and
`MANIFEST_FIELD_ORDER` places `plugin` then `gates` after `models`. One bound the paragraph does not state: a gate
command is a non-empty single line of at most 512 characters, and a backtick or the `${STAMITY:` prefix inside one is
refused by name, because a pinned gate is rendered into the charter unescaped. (Route clause dropped 1.15.0: it read
"Three bounds"; the other two, `PLUGIN_OWNED_CLASSES` and how a malformed `classes` value read, left with the mode.)

Amended 2026-10-14 (plan 020 file 1, unit `d7-engine`; cited at `d590a266`). The `plugin` key is held, not read.
`SetupManifest.plugin` is typed `unknown` (`src/types/manifest.ts`), and the reader accepts any value there without
validation and writes it back as it stands, the field keeping its place in `MANIFEST_FIELD_ORDER`
(`src/manifest/manifest.ts`), so a manifest a 1.14.0 setup wrote still loads and a second `sync` moves none of it.
Nothing that emits reads it (REQ-PLUGIN-045, amended 2026-10-14); the leftover-install warning reads it as raw JSON
(REQ-PLUGIN-016, amended 2026-10-14). Removing the key from the schema in 1.15.0 would make `check`, `sync` and `clean`
refuse every manifest that still holds it, and dropping it on the first `sync` would end the warning after one run, so
it is held through the 1.15 line; the release after 1.15.0 removes it with a manifest migration step
(`docs/plans/020-cli-native-01.md`, its "Settled by this plan" and its Follow-ups).

- GIVEN a manifest a 1.14.0 setup wrote with a `plugin` block WHEN it is read THEN it loads with no refusal, and WHEN it
  is written back THEN the written manifest holds no `plugin` key; GIVEN a `plugin` value of any other shape THEN it is
  accepted and dropped the same way (`test/manifest/manifest.test.ts`, "loads a file carrying `plugin` of any shape with
  no refusal, drops it, and a second write moves no byte" and "names a `plugin` key as unknown to validation, and
  refuses to write a manifest carrying one"; added 2026-10-14, amended 2026-10-18 by plan 021 file 2's unit
  `v16-manifest-plugin-block`: it read "WHEN it is read and written back THEN it loads with no refusal and the block is
  value-identical; GIVEN a `plugin` value of any other shape THEN it is held the same way", citing "accepts the 1.14
  record without validating it" and the held-value cases, which that unit replaced).

Amended 2026-10-18 (plan 021 file 2, unit `v16-manifest-plugin-block`). Given a manifest holding a `plugin` key of any
shape, When `check`, `sync` or `clean` reads it, Then it loads with no refusal, and When `sync` writes it, Then the
written manifest holds no `plugin` key, `MANIFEST_FIELD_ORDER` names none, and a second `sync` moves no byte: the key is
no longer held. The `gates` object's grammar and bounds are unchanged. This closes the follow-up due at the first
release after 1.15.0. So the paragraph of 2026-10-14 ("The `plugin` key is held, not read … the release after 1.15.0
removes it with a manifest migration step") describes 1.15.0.

- **As built, beyond the delta:** `readManifest` deletes `plugin` from the raw object before validation, with no
  migration step, since the migrations are keyed by the version they start from, and no generation bump, so a 1.15
  engine still reads a manifest 1.16 wrote (`DROPPED_PLUGIN_KEY` and `readManifest`, `src/manifest/manifest.ts`). An
  in-memory manifest carrying the key is named `unknown field` by validation and refused by the writer. The first live
  `sync` over a file holding the key prints once `manifest: dropped the \`plugin\` key a 1.14 setup recorded; nothing
  has read it since 1.15.0`, `--dry-run` prints `would drop` and writes nothing, and `sync --json` carries
  `pluginBlockDropped` (`readOnDiskManifestFacts` and `SyncPlan.pluginBlockDropped`, `src/cli/commands/sync/engine.ts`;
  `syncJsonPayload`, `src/cli/commands/sync/report.ts`). A dry run's migration line reads `manifest schema would be
  migrated to <v>` (`syncClosingLines`, `src/cli/commands/sync.ts`). `SetupManifest` loses `plugin`, a public type
  losing a field.
- GIVEN a 1.14.0 tree whose manifest carries the block WHEN `sync` runs THEN the drop line prints once and the written
  manifest holds no `plugin`, and a second `sync` moves no byte but `updatedAt` and prints no such line; GIVEN a block of
  any of six shapes THEN the manifest loads and writes the bytes a never-carried control writes; GIVEN `--dry-run` THEN
  `would drop` and nothing written (`test/manifest/manifest.test.ts`, `test/cli/commands/syncEngine.test.ts`,
  `test/cli/commands/sync.test.ts`, `test/emit/upgradeFrom1140.e2e.test.ts`; added 2026-10-18).

### REQ-PLUGIN-016 — The ledger bound, settings co-ownership, the node row and the pack-reach row

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`). Its amendments with a CLI job moved, each as it stood there at `c96c7146` with its route
clauses dropped in place. Its first paragraph, the ownership boundary under `plugin.mode: "plugin-backed"`, retires with
the mode, as do the paragraphs headed "As built (2026-09-20)" (the boundary predicate and the `plugin-runtime` row) and
"Amended 2026-09-26" (that row's warning) and the plugin half of "Amended 2026-10-06"; they read at `c96c7146`. The
heading read "sync, check and clean honor the ownership boundary". The paragraph headed "Amended 2026-10-14" states the
doctor rows as 1.15.0 ships them.

Amended 2026-10-07 (plan 016 file 0, unit `u0-ledger-bound`). "Only ledger rows" is bounded. Every row names a path
inside the owned-path bound of REQ-PLUGIN-045, or the manifest is refused when it is read: `check` fails its `manifest`
row naming the row, and `sync` and `clean` act on nothing. Inside the bound, a row licenses a whole-file delete or an
overwrite without a backup only together with the bytes: a recorded `contentHash` that matches the file, an
engine-minted name in a content folder, and at an instruction file or the Copilot setup workflow bytes that show the
engine wrote them (REQ-PLUGIN-046); or a managed block spanning the file. A row with no `contentHash` proves nothing:
the sweep keeps its file, and an overwrite takes a verified `.bak` first.

- GIVEN a committed ledger row outside the bound WHEN `check` runs THEN it exits 1 and the `manifest` row names the row;
  WHEN `sync -y` or `clean -y` runs THEN it exits 1 with `CONFIG_ERROR` naming the row and `git status --porcelain`
  prints nothing.
- GIVEN an in-bound engine-named row with no `contentHash` WHEN `sync -y` reclaims it THEN the file stays and the sweep
  names it `skipped-unsafe-path`.

As built (2026-10-07): the evidence, measured at `d10db029` — hand-added rows made `sync -y` (exit 0) delete five owner
files and overwrite a sixth with no `.bak`, `clean -y` deleted the same, and `check` reported them only as "5 queued for
reclaim" (`src/manifest/ledger.ts:157-163`, `src/merge/reclaim.ts:327-338`, `:345-347`, `:372-375`, `:743-763`,
`src/merge/safeWrite.ts:863-877`, `:922-932`, `src/cli/commands/check.ts:1503` at that commit). The bound and its proofs
are those of REQ-PLUGIN-045 and REQ-PLUGIN-046, with their tests.

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit `b4-no-read-allow-rows`): `.claude/settings.json` no
longer splits that way. The engine renders no `permissions` member; its `hooks` object is emitted, and the settings row
stays planned (`src/adapters/claude.ts`, `buildSettingsJson` and the settings row it feeds; route clause dropped 1.15.0:
"under either install mode" and "only when hooks are not plugin-owned, so under a plugin that carries hooks the
engine's rendering is `{}`"). That planned row is how a recorded allow row leaves, by the per-entry merge, on the next
`sync` (REQ-FLOW-025, REQ-FLOW-036) (route clause dropped 1.15.0: "`plugin setup` refuses a repository that already
carries a setup, so it is not that path"). A `permissions` member that is not an object, or an `allow` that is not an
array, still collides, as it did while releases up to 1.12.0 rendered the rows (`planClaudeSettings`,
`src/manifest/claudeSettings.ts`). It read: "its `permissions` half always emitted".

- (Route clause dropped 1.15.0: the two criteria on `plugin setup --client claude -y` over a file holding only
  `enabledPlugins`, and on a plugin-backed setup's three recorded rows. A file the client wrote first keeps its
  `enabledPlugins` through `init`, `sync` and `clean`: the amendment of 2026-10-14, below.) Test evidence:
  `test/adapters/claude.test.ts`, `test/merge/settingsKeyOwnership.test.ts` (route clause dropped 1.15.0: the two
  suites of the deleted verb it also named).

As built (2026-09-21), one row of the runtime surface these doctor rows share: the `node` row is
never `unstated` when no root's locator answers. `requiredNodeRange()` reads this build's declared `>=22.22.2`, and ONE
tri-state `judgeNodeFloor` judges it (route clause dropped 1.15.0: the shared probe that held both, its
`engineNodeFacts()` and the second reader, the `plugin-runtime` row, are deleted; the two helpers are back in
`check.ts`, amended 2026-10-14 below).

As built (2026-09-22), amended 2026-10-07 (plan 016 file 0, unit `u0-settings-ownership`): the settings document under
the boundary. `sync` and `check` plan `.claude/settings.json` per entry (REQ-FLOW-036), and `check`'s drift gate previews
exactly the write `sync` would make. The engine owns each `permissions.allow` row and each hook entry it wrote. The
ledger records each by the hash of its canonical JSON, and the engine owns nothing else in the file: it never writes or
removes `permissions.deny`, `permissions.ask` or an owner's entry. An entry equal to the rendering needs no proof. An
engine entry that leaves or changes goes silently only when the ledger records it (or proves the file unedited) and it
lies inside the engine's bound: an allow row a release rendered (`Read`, `Grep`, `Glob`; the engine renders none since
2026-10-08, and before it read "an allow row the engine renders"), or a hook entry whose every command runs a script under
`.stamity/`. Otherwise it goes behind a verified `.bak`, whose warning names the entry and `.claude/settings.local.json`
for personal rows. `clean`, and a client's removal through the reclaim sweep, remove the engine's entries, a stale
repository-mode hook entry included (recognised by its script under `.stamity/generated/hooks/`). They keep every other
member and delete the file only when the engine created it and nothing foreign remains
(`reduceClaudeSettingsToForeignContent`; `src/merge/reclaim.ts`, gate 4). The reclaim takes a backup only when an entry
it removes is not proven. A key another tool added needs none. A backup that cannot be taken refuses the removal and
leaves the file untouched: a backup or nothing. The file collides only when it is not a JSON object or a member the
engine writes into has another type. The collision names the member, `--force` does not clear it, and `check`'s step
for it does not offer `--force` (route clause dropped 1.15.0: "Under a plugin-backed setup an operator's own `hooks`
key is still reported by `check`'s `plugin-duplicates` row and by `plugin status` as an `unmanaged` hooks duplicate",
citing a probe module deleted with the verb). (It read "strip only the keys the install mode makes the
engine's" and "behind a verified `.bak` when the file's bytes no longer hash to what the ledger recorded".) Amended
2026-10-07 (build): "runs a script under `.stamity/`" reads as the script the command executes, in the engine's own
script folders — `.stamity/generated/hooks/` or an installed pack's `.stamity/packs/<id>/`, never the user's
`.stamity/hooks/` (`commandRunsStateScript`, `src/manifest/coOwnedJson.ts`); a user-hook entry is proven only by
re-rendering a definition still in `.stamity/hooks/`. `check`'s drift gate passes the write's own ledger hashes to the
prediction, so "previews exactly the write" holds for every co-owned lane. A hashless co-owned row reads as drifted. A
refused document keeps its ledger rows and record, and `clean` keeps every engine hook script a kept hooks document
still runs.

- GIVEN a setup and a `.claude/settings.json` to which another tool added a key WHEN `clean -y` runs THEN the file holds
  exactly that foreign key, and no `.bak` exists anywhere in the repository (route clause dropped 1.15.0: it read
  "GIVEN a plugin-backed setup and").
- GIVEN an engine hook entry the operator edited WHEN `clean -y` runs THEN a verified `.bak` exists and the output names
  that entry.

As built (2026-10-07): the lanes are registered in `coOwnedDocumentLanes` (`src/cli/engine/emissionWrite.ts`), and the
ownership each verb passes is `coOwnedOwnershipOf`; the proof by re-rendering a user hook is `coOwnedReclaimRenderings`
in the same module. Tests: `test/merge/settingsOwnerEntries.test.ts`, `test/merge/settingsKeyOwnership.test.ts`,
`test/manifest/coOwnedJson.test.ts`, `test/merge/reclaim.test.ts` (100% coverage).

Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, unit `u4b-pack-reach-row`, integrated as `778c9ef0` with its
fix rounds; cited at `eb4f0727`; route clause dropped 1.15.0: the first of its two facts, how pack skills reached
plugin-backed clients, left with the mode).

- **The doctor rows gain `pack-reach`,** printed after `plugin-duplicates` and before `invariants` (it went on "so
  `check` prints fifteen rows", citing `src/cli/commands/check.ts:1415-1437` and `:1458-1463` at `eb4f0727`; the count
  is one fewer since 1.15.0, amended 2026-10-14 below). Its judgment
  is the emission plan's own `packReach` (`src/types/content.ts:146-201`; set at
  `src/emit/planner.ts:1131-1133` by `packReachOf`, `:1146-1258`), read off each artifact's `tools:`
  list rather than off the planned rows, because a pack rule reaches Codex as text inside the composite appendix, which
  no per-rule row owns. A pack skill reaches every selected client; an agent, rule or command reaches every client its
  `tools:` list admits; each accepted pack hook file reaches every client whose hooks this repository wires; an MCP
  server reaches every selected client once `manifest.mcp.servers` selects it, and none, dropped as `not selected`,
  until then (route clause dropped 1.15.0: "and `isPluginOwned`", and "whose plugin does not carry its class"). The
  row (`checkPackReach`, `src/cli/commands/check.ts:1143-1294`) reads:
  - `pass` with no readable manifest, and with no `pack:` row in the ledger, planning nothing
    (`:1188-1193`); otherwise `pass` when no pack is in a state below, naming the artifact counts and
    any artifact that reaches no client for a reason of its own (`:1280-1293`);
  - `fail`, so `check` exits 1, for an installed pack none of whose artifacts reaches a selected
    client and that supplies no unselected MCP server (`:1231-1234`, `:1266-1276`). It names the
    pack, each artifact and why (its own `tools:` list), then the remedies that run: `clean --pack <id>` in the pinned
    call form, and, where an artifact's `tools:` list names a client, the `config set tools` call that adds it, then
    `sync` (`describeSilentPack`, `:1336-1360`; route clause dropped 1.15.0: "the plugin that carries its class, or");
  - `warn`, exit 0, for a pack whose only remaining delivery is an MCP server nobody selected,
    naming `config mcp add <id>`; a pack the organisation's trust policy denies; and a pack that
    ships nothing a client loads, every hook row it ships rejected (`:1235-1262`, `:1277-1279`; route clause dropped
    1.15.0: "a pack that reaches some client while a plugin drops one of its artifacts for another, each named");
  - `warn` "not evaluated" when the plan cannot be built, the drift gate carrying the failure
    (`:1216-1224`).

  With a pack installed the row runs one emission plan of its own beside the drift gate's, and keeps
  that plan's policy-denial lines off stderr so each prints once (`withoutPolicyWarningPrint`,
  `src/pack/projection.ts:463-478`). Every pack-supplied id it prints passes through `sanitizeLabel`.

- (Route clause dropped 1.15.0: the criterion on a pack skill under `plugin.mode: "plugin-backed"`, and the plugin
  halves of the next one.) GIVEN no pack installed THEN `pack-reach` is `pass` and nothing is planned
  (`test/cli/commands/check.test.ts`, the describe "check — pack-reach").
- GIVEN a pack whose only artifact is an MCP server the manifest does not select THEN `pack-reach` is
  `warn`, naming `config mcp add <id>`; GIVEN a pack the trust policy denies, or one whose every hook
  row was rejected, THEN it is `warn`; GIVEN a plan that cannot be built THEN it is `warn` "not
  evaluated" and the drift gate fails (the same describe; `test/emit/plannerPackReach.test.ts`).

Amended 2026-10-14 (plan 020 file 1, unit `d7-engine`; cited at `d590a266`). The `plugin-backed` mode is gone, so no
class is plugin-owned anywhere (REQ-PLUGIN-045, amended 2026-10-14). The doctor rows and the verbs' text as 1.15.0 ships
them:

- **`plugin-runtime` is removed**, with the locator probe behind it, so `check` prints one row fewer.
- **`plugin-duplicates` warns, and never fails, on a leftover install.** It reads the manifest file and
  `.claude/settings.json` as raw JSON, so a manifest that fails another field still gets the warning
  (`checkPluginDuplicates`, `src/cli/commands/check.ts:1213-1230`). It names a client when the held `plugin` block lists
  it under `clients`, and `claude` when `enabledPlugins` holds a `<plugin id>@…` key, the plugin id being the running
  package's name without its scope (`leftoverPluginClients` and `pluginId`, `src/cli/kit/packageName.ts:287-289`,
  `:319-330`). Only the four client ids reach the text, each with that client's own uninstall command, then a line
  saying to delete the `plugin` key where the manifest named the client (`pluginUninstallCommands` and
  `leftoverPluginLines`, `:298-306`, `:348-362`). With no client named it passes, "no leftover plugin install".
- **`sync` and `clean` print the same lines for the held block.** `sync`'s report prints them under `warning:`
  (`src/cli/commands/sync/report.ts`, through `leftoverPluginLines`), and `clean` prints them before it deletes the
  state directory, its preview included, with no JSON key (`printLeftoverPlugin`, `src/cli/commands/clean.ts:375-380`).
  Neither reads `enabledPlugins`, so an install recorded there alone warns in `check` only (ledger row `build/31` of
  run `2026-10-14_cli-native`, open).
- **`sync --json` carries no `pluginOwned`, and `clean --json` no `pluginUninstall`.**
- **`pack-reach` keeps its row and loses its plugin reason.** The `plugin-owned` drop reason and the partial-drop
  warning are gone; a pack none of whose artifacts reaches a selected client through its own `tools:` list, and that
  supplies no unselected MCP server, still fails, and the three `warn` states above stand (`checkPackReach`,
  `src/cli/commands/check.ts:1267-1374`).
- **The node row's helpers live in `check.ts`:** `requiredNodeRange` and `judgeNodeFloor` (`:177-204`), whose one reader
  is now the `node-version` row (`checkNodeVersion`, `:215`).

- GIVEN a manifest holding `{"plugin":{"mode":"plugin-backed","clients":{"claude":{"version":"1.14.0","classes":["skill"]}}}}`
  WHEN `check` runs THEN it exits 0 and `plugin-duplicates` reads `warn`, naming `claude` and its uninstall command;
  WHEN `sync` runs THEN it emits Claude's skills, prints the same warning, and keeps the block value-identical; GIVEN
  `enabledPlugins` naming another product's plugin THEN no warning; GIVEN a block naming an unknown client or carrying
  control characters THEN only known client ids print and the emission is byte-identical to a repository without the
  block (`test/cli/commands/check.test.ts`, the `plugin-duplicates` cases; `test/cli/commands/syncEngine.test.ts`;
  `test/cli/commands/clean.test.ts`; added 2026-10-14).
- GIVEN the doctor row list THEN it holds no `plugin-runtime` row; GIVEN `.claude/settings.json` holding
  `enabledPlugins` THEN `init`, `sync` and `clean` keep the key (`test/cli/commands/check.test.ts`;
  `test/merge/settingsKeyOwnership.test.ts`, its cases ported to `init`; added 2026-10-14).
- GIVEN an installed pack whose every artifact's `tools:` list names no selected client THEN `pack-reach` is `fail`,
  naming the pack; GIVEN a held `plugin` block THEN no artifact drops (`test/emit/plannerPackReach.test.ts`,
  `test/cli/commands/check.test.ts`, its `pack-reach` cases; added 2026-10-14).

Amended 2026-10-16 (plan 021 file 1, unit `u20-hook-emission`). "The engine renders no `permissions` member", in the
paragraph of 2026-10-08, and "it never writes or removes `permissions.deny`", in the paragraph of 2026-09-22, read as
REQ-FLOW-025 and REQ-FLOW-036 now state them (both amended 2026-10-16): the engine renders its own deny rows and no
allow row, appends only the rows the file lacks, and removes no deny row, `clean` included
(`reduceClaudeSettingsToForeignContent`, `src/manifest/claudeSettings.ts:337-346`).

Amended 2026-10-18 (plan 021 file 2, units `v16-manifest-plugin-block` and `v0a2-ask-emission`). Given any manifest and
any `.claude/settings.json`, `enabledPlugins` included, When `check` runs, Then its doctor rows hold no
`plugin-duplicates` row and `pack-reach` keeps its place before `invariants`; `sync`'s report and `clean`, its preview
included, print no leftover-plugin lines, and `init`, `sync` and `clean` still keep `enabledPlugins`. The settings
co-ownership takes `permissions.ask` beside `permissions.deny` (REQ-FLOW-036, amended 2026-10-18): only missing engine
rows are appended, none is removed. The ledger bound, the `node-version` row and `pack-reach`'s states are unchanged.
So the bullets of 2026-10-14 on `plugin-duplicates` and on `sync` and `clean` printing the held block's lines describe
1.15.0. As built: `leftoverPluginLines` and its helpers are deleted from `src/cli/kit/packageName.ts`, with their call
sites in `check`, `clean` and `sync`'s report; `check` prints fourteen environment probes, plus `cloud-install` with
Cursor (REQ-FLOW-111) and `change-classes` where a class file exists, and `docs/troubleshooting.md` lists the same set.
No CLI output now names the uninstall step for a 1.14 client plugin still installed; `docs/getting-started.md` names
each client's command.

- GIVEN a 1.14 block and `enabledPlugins` WHEN `check`, `sync` or `clean` runs THEN no row and no line names a leftover
  plugin, and `enabledPlugins` is kept (`test/cli/commands/check.test.ts`, "check — the dropped plugin block";
  `test/cli/commands/clean.test.ts`; added 2026-10-18).

### REQ-PLUGIN-017 — Explicit gates beat detection

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`). The text below is the requirement as it stood there at `c96c7146`, its `plugin status` half
dropped in place; the heading read "Explicit facts and gates replace placeholders".

Given `stamity config set gates.test "npm run test:unit"`, When the charter is rendered, Then its
`Verification gates` section carries that exact string for the Tests row, the other rows carry the
detected commands, and `${STAMITY:VERIFY_GATE_ALL}` renders from the configured `all` when set and
from the detected composition otherwise; Given a fact detection could not determine, Then the rendered charter carries
the literal `unknown` for it rather than an invented value (route clause dropped 1.15.0: "When `stamity plugin status`
runs, Then it lists that fact as `unconfigured` with the exact `stamity config` command that sets it, and the rendered
charter still carries"); and the rendered file contains 0 occurrences of `${STAMITY:`.

As built (2026-09-20): a configured gate outranks detection per key, `all` composes from the merged
rows, and the charter and the skills projection both render through `readGates(manifest)` so one
pinned set reaches every surface; `config detect` never clears a pin, `none` drops a key and an
emptied `gates` object, and `config list` prints a `detected:` prefix for every unset row. One
literal moved: a refusal exits 1 with `VALIDATION_ERROR`, not 64 — `src/types/errors.ts` retired
the sysexits translation and every failure exits 1 with the kind in `error.code` (ledger row
build/34). (Route clause dropped 1.15.0: the sentence on what `stamity plugin status` listed as `unconfigured`, and the
paragraph headed "As built (2026-09-21)" on that verb's `--client` flag.)

Amended 2026-10-14 (plan 020 file 1, unit `d6-verb`): the gates and facts above are unchanged. The verb that listed the
unconfigured facts is removed (REQ-PLUGIN-047, amended 2026-10-14); `config list` is where an operator reads which
rows are detected.

### REQ-PLUGIN-045 The ledger names only paths the engine writes, and a row proves a delete or an overwrite only with the bytes

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`), beside the ownership requirements it extends, unchanged in substance. The text below is the
requirement as it stood there at `c96c7146`, its route clauses dropped in place.

Added 2026-10-07 (plan 016 file 0, unit `u0-ledger-bound`). The manifest is committed, and `sync` and `clean` act on
what its ledger names, so the ledger is bounded by one exported value, `OWNED_PATHS` (`src/manifest/ownedPaths.ts`). It
lists the sixteen platform files the engine writes at names it did not mint (`AGENTS.md`, `AGENTS.override.md`,
`CLAUDE.md`, `.claude/settings.json`, `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.codex/config.toml`,
`.codex/hooks.json`, `.cursor/hooks.json`, `.cursor/hooks/stamity-mcp-guard.mjs`,
`.cursor/hooks/stamity-subagent-guard.mjs`, the 1.11.0 guard names `.cursor/hooks/mcp-guard.mjs` and
`.cursor/hooks/subagent-guard.mjs`, `.github/hooks/stamity.json`, `.github/workflows/copilot-setup-steps.yml`); a
charter `AGENTS.md` in any folder; the twelve content folders (`.agents/skills/`, `.claude/agents/`,
`.claude/commands/`, `.claude/rules/`, `.claude/skills/`, `.codex/agents/`, `.cursor/agents/`, `.cursor/rules/`,
`.cursor/skills/` — written by 1.0.0 to 1.10.0 — `.github/agents/`, `.github/instructions/`, `.github/prompts/`); the
state folders `.stamity/generated/` and `.stamity/mcp/`; and an installed pack's own folder `.stamity/packs/<id>/`. An
`infra` row may name a platform file, a charter, a state folder or, for its `pack:<id>` owner, its pack folder; an
agent, skill, rule or command row only a content folder. A row outside the bound refuses the manifest when it is read.
Inside it, a whole-file delete or an overwrite without a backup needs a recorded `contentHash` that matches the file —
plus, in a content folder, a name the engine minted (a `st-` or `stamity-` basename, or a skill folder so named directly
under a `skills/` folder) — or a managed block spanning the file. A row with no `contentHash` proves nothing. `check`
names every path a `sync` would reclaim, with the action and the proof, in its text and in `--json` (`drift.reclaim`),
and publishes the bound as `ownedPaths`; a later unit that adds an emitted path extends the bound and raises its
`version`.

Amended 2026-10-07 (build): a `drift.reclaim` entry whose action is `keep`, `refuse` or `gone` also carries `why`, the
sweep's reason; `check`'s text prints every reclaim line, with no "… and N more" fold, and shows a control character in
a path as an escape. A whole-file delete also needs every segment below the bound folder, the folders and the file alike,
to be listed under exactly the row's spelling, the file's real parent to lie inside the real path of the bound folder the
row claims, and no symbolic link among `.stamity/`, a state folder or a pack folder on its own path. On the co-owned
path, a row with no `contentHash` reads as drifted, so the reduction takes a verified `.bak` first. The exact list is
sixteen paths, not the fourteen the delta drafted: the two guard names of REQ-FLOW-038 joined it beside the two 1.11.0
names, which stay so their rows validate for the first sync after an upgrade, and `OWNED_PATHS.version` is 2.

- GIVEN a committed repository and an added `infra` row for `docs/owner.md` recording that file's hash WHEN `check`,
  `sync -y` or `clean -y` runs THEN `check` exits 1 naming the row, `sync` and `clean` exit 1 with `CONFIG_ERROR` naming
  it, and no file changed.
- GIVEN hashless rows for `notes/st-owner.md`, `src/stamity-x.ts`, `packages/app/skills/st-foo/index.ts` and
  `lib/30-stamity-y.js`, and hashed `infra` rows for `.stamity/learnings/keep-me.md` and `.github/workflows/ci.yml`, THEN
  each is refused the same way.
- GIVEN the rows every release from 1.0.0 to 1.11.0 writes THEN each lies in the bound; GIVEN every planner output for
  every client set, every MCP dialect, an installed pack and a user override of each class THEN each lies in the bound
  (route clause dropped 1.15.0: "both install modes", one mode being left).
- GIVEN an engine-named row with no `contentHash` WHEN `sync -y` reclaims it THEN the file stays; GIVEN a hashless row
  for an owner's file that `init` skipped WHEN `sync -y` overwrites it THEN a verified `.bak` holds the owner's bytes.
- GIVEN a deselected engine file WHEN `check --json` runs THEN `drift.reclaim` names its path with `action: "delete"` and
  `proof: "hash"`, and the text names it; GIVEN any repository THEN `check --json` carries `ownedPaths`.
- GIVEN an engine-named row with no `contentHash` WHEN `check --json` runs THEN its `drift.reclaim` entry has
  `action: "refuse"` and a non-empty `why` (added from the build).
- GIVEN 25 deselected rows with `strip` and `reduce` actions among them WHEN `check` runs THEN all 25 reclaim lines print
  and none reads "… and N more"; GIVEN a row whose path holds a control character THEN its line shows the escape, never
  the raw byte (added from the build).
- GIVEN a hashed row spelled `.claude/agents/Stamity-x.md` for a file listed as `.claude/agents/stamity-x.md` on a
  case-folding file system WHEN `sync -y` reclaims it THEN the file stays (added from the build).
- GIVEN a bound content folder whose subfolder is a symbolic link to a folder outside it, and a hashed row through that
  link WHEN `sync -y` reclaims it THEN the file stays (added from the build).
- GIVEN `.stamity/generated/` committed as a symbolic link and a hashed row under it WHEN `sync -y` reclaims it THEN the
  file stays (added from the build).
- GIVEN a forged hashless `.claude/settings.json` row and an owner's `permissions` and `hooks` WHEN `sync -y` or
  `clean -y` reduces the file THEN a verified `.bak` holds the owner's bytes first (added from the build).

As built (2026-10-07): before the change no single list of the engine's paths existed (the constants sat in the four
adapters and six other modules); `infra` rows were trusted by type alone (`src/manifest/ledger.ts:157-163` at
`d10db029`), and a hash proved a delete anywhere under `.stamity/` (`src/merge/reclaim.ts:345-347`, `:372-375` there).
Measured 2026-10-06: every release from 1.0.0 to 1.11.0 records a hash on every row, and 5,288 rows in 19 ledgers fall
inside the bound with the artifact-type split above. The bound is `OWNED_PATHS`, `ownedPathKind` and `ownedFolderOf` in
`src/manifest/ownedPaths.ts`, read by manifest validation (`src/manifest/manifest.ts`), the planner's containment check
(`src/manifest/ledger.ts`), the reclaim sweep (`src/merge/reclaim.ts`) and `check --json`. Tests:
`test/manifest/ownedPaths.test.ts` (the bound over every planner output and over the frozen rows of every release,
`test/manifest/fixtures/released-ledger-rows.json`), `test/cli/ledgerForgery.test.ts`, `test/merge/reclaim.test.ts` and
`test/merge/reclaim.property.test.ts` (`src/merge/reclaim.ts` and `src/manifest/ownedPaths.ts` held at 100%),
`test/cli/commands/check.test.ts` (route clause dropped 1.15.0: "Plan 016 file 2's `u2-release-integrity` publishes the
bound in `release.json` as `ownedPaths`", the plugin distribution's manifest).

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units `d1a-rendering-proof-core` to
`d1c-charter-and-exact-paths` and lane D's fixer rounds): inside the bound, a delete at the paths REQ-PLUGIN-046 names
needs a rendering — the running engine's, or at the two 1.11.0 Cursor guard names the frozen 1.11.0 builder's
rendering for the setup — beside the recorded hash the bytes match, which no longer proves it alone (or a managed
block spanning the file, which a recorded hash the bytes do not match vetoes). A backup-free overwrite at a charter or
instruction file and at `.github/hooks/stamity.json` needs the incoming rendering or a managed block spanning the
file, or it keeps the previous content recoverable (REQ-PLUGIN-046, amended 2026-10-08; `needsRenderingProof` and
`renderingProofClass`, `src/manifest/ownedPaths.ts`). Elsewhere inside the bound the recorded hash still proves what
the paragraph above says: a delete at the state and pack folders and at the `stamity-` Cursor guards, and a
backup-free overwrite at any other path the engine writes. `SECURITY.md` names both among its known residuals.

Amended 2026-10-14 (plan 020 file 1, unit `d7-engine`; cited at `d590a266`). Emission, the reclaim renderings and the
proof plan read nothing from a manifest's held `plugin` block (REQ-PLUGIN-014, amended 2026-10-14): the adapters' plugin
row filters and hook-infrastructure id lists, the planner's plugin ownership of `.agents/skills/` and its hand-off of
plugin-owned hooks, and the plugin filter of `coOwnedReclaimRenderings` are gone, and the proof plan still drops the
block from the manifest it plans with (`src/cli/engine/emissionWrite.ts`). So every adapter emits, byte for byte, the
rows it emits for a manifest with no block, and a hostile block — control characters, an unknown client, a value of
any shape — moves no emitted byte. The bound, `OWNED_PATHS`, does not change.

- GIVEN a manifest holding a `plugin` block over every client's skills and hooks WHEN each adapter and the planner plan
  THEN the rows equal, byte for byte, those of the same manifest with no block; GIVEN a hostile block WHEN `sync` runs
  THEN it emits what a repository without the block emits and prints none of the block (`test/adapters/claude.test.ts`,
  `cursor.test.ts`, `copilot.test.ts`, `codex.test.ts`; `test/emit/planner.test.ts`;
  `test/cli/commands/syncEngine.test.ts`; `test/pack/projection.test.ts`, its held-block half; added 2026-10-14).

### REQ-PLUGIN-046 An import decision binds only as `init` records it, and an instruction file leaves only on its own bytes

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`), with its amendments, unchanged in substance. The text below is the requirement as it stood
there at `c96c7146`, its one route clause dropped in place. `docs/specs/worktree-lane.md` cites the look before git it
states (REQ-WORKTREE-001).

Added 2026-10-07 (plan 016 file 0, unit `u0-ledger-bound`). `init` records one decision per pre-existing instruction
file (`importChoice`). The engine cannot authenticate a committed record — the manifest carries no signature, and a key
kept in the repository would be as forgeable as the record — so a decision binds only while it agrees with what only
the engine's own actions leave behind. A decision names one of the four files `init` imports (`AGENTS.md`, `AGENT.md`,
`CLAUDE.md`, `.github/copilot-instructions.md`), or the manifest is refused. A `skip` decision and a ledger row for the
same path refuse the manifest: the engine never records a row for a skipped file. `sync` never writes a whole engine file
over an instruction file that holds the owner's text outside the engine's managed block — the shape only `supplement`
leaves: under any other decision the path is an `import-decision` collision, `--force` does not clear it, and the remedy
names `init --force --import-config replace`. At `AGENTS.md` in any folder, `AGENTS.override.md`, `CLAUDE.md` and
`.github/workflows/copilot-setup-steps.yml`, a recorded hash proves a whole-file delete or a backup-free overwrite only
when the bytes show the engine wrote them: the charter (first non-blank line `# Charter`, then `## Repo facts`,
`## Invariants`, `## Touchpoints` and `## Conditional layer` in order, no managed-block markers), the Codex rule appendix
(first non-blank line opening `# Conditional rules (Codex down-conversion)`), the Copilot workflow's engine header line,
or a managed block spanning the file. Otherwise the sweep keeps the file and an overwrite takes a verified `.bak` first.

Amended 2026-10-07 (build): `AGENTS.override.md`, `CLAUDE.md` and the Copilot workflow need this byte proof only at the
repository root; a charter `AGENTS.md` needs it in any folder. The root `AGENTS.override.md` proves itself when the Codex
appendix heading `## Conditional rules (Codex down-conversion)` stands on a line of its own — under `skip` the engine
writes it as the owner's `AGENTS.md` text plus that section — while a hand-edited override still fails its recorded
hash, so it is kept on reclaim and backed up on write. In the write lane, a managed block spanning the file proves the
bytes too.

- GIVEN `importChoice` naming `.cursor/hooks.json` as `skip` THEN the manifest is refused and `check` exits 1 naming the
  decision.
- GIVEN a `skip` decision and a ledger row for the same path THEN the manifest is refused and `AGENTS.md` is
  byte-identical after `sync -y`.
- GIVEN a supplemented owner `AGENTS.md` whose decision reads `replace`, or none WHEN `sync -y` or `sync -y --force` runs
  THEN it exits 1, `AGENTS.md` is byte-identical, no `.bak` exists, and `check --json` names the path with
  `collisionKind: "import-decision"`.
- GIVEN an owner's `docs/AGENTS.md` and a forged row hashing its bytes WHEN `sync -y` runs THEN the file stays; GIVEN the
  engine's unedited per-package charter whose package left THEN it is deleted.
- GIVEN the charter rendered at the head and one written by 1.0.0 THEN both pass the recogniser; GIVEN `# Charter`
  followed by notes, or a file carrying STAMITY markers, THEN it fails.
- GIVEN the engine's root `AGENTS.override.md` written under `skip` (the owner's `AGENTS.md` text plus the Codex
  appendix section) WHEN `sync -y` rewrites it THEN no `.bak` is taken; GIVEN the same file with the heading
  `## Conditional rules (Codex down-conversion)` removed THEN a verified `.bak` holds it first (added from the build).

As built (2026-10-07): measured 2026-10-06 on 1.11.0, `skip` for Cursor's hook file and both guards (rows and files
removed) left `check` at exit 0 while `cursor` stayed selected; `supplement` flipped to `replace` made `sync` overwrite
the owner's `AGENTS.md`; flipped to `skip` with the rows' hash set to the file, `sync` deleted `AGENTS.md` whole. Every
release's charter carries the four headings; 1.0.0 to 1.7.0 carry no `Invariants version` line. The recognisers are
`needsByteProof`, `isEngineCharterDocument` and `bytesShowEngineOutput` in `src/manifest/ownedPaths.ts`; the collision
kind is `import-decision` in `src/cli/commands/sync/engine.ts`. Tests: `test/cli/ledgerForgery.test.ts`,
`test/manifest/manifest.test.ts`, `test/manifest/ownedPaths.test.ts` (with `test/manifest/fixtures/charter-1.0.0.md`).

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units `d1a-rendering-proof-core`, `d1b-cursor-guard-pins` and
`d1c-charter-and-exact-paths`, with lane D's fixer rounds 1, 3 and 4; inbox rows 519, 560, 585 and 586). A whole-file
delete at an engine-named file in a content folder, an `AGENTS.md` in any folder, `AGENTS.override.md`, `CLAUDE.md`
and the Copilot setup workflow at the repository root, `.github/hooks/stamity.json`, or one of Cursor's two 1.11.0
guard names needs one of two proofs, and a recorded hash the bytes do not match vetoes both. The first is bytes that
hash to the row's recorded hash and, raw or with `\r\n` read as `\n`, to a rendering the running engine produces at
that path, planned for the clients the setup wrote for (the manifest's clients and every client a ledger row names,
each in repository mode) over the bundled corpus, the override tree and the installed packs. Every installed pack is
rendered whatever the organisation's trust policy says, so the first `sync` after the policy denies a pack proves and
removes that pack's copies, while the projection itself still writes nothing of a denied pack; the plan is hashed and
discarded, never written. The second is a managed block spanning the file. At an `AGENTS.md` below the root, when a
client of the setup reads per-folder files, the renderings also include the root charter as the engine renders it
before an import decision on the root, so the engine's unedited copy whose package has left is still proven and
removed. At the two 1.11.0 Cursor guard names only, the rendering is the guard a frozen copy of the 1.11.0 builder
(`src/adapters/cursorLegacyGuards.ts`) renders for the setup: the ten agents 1.11.0 shipped plus every Cursor agent
the ledger records, the running installation's package name and npm channel, at version 1.11.0. A test holds the copy
to four fixtures captured from the published 1.11.0 package, each pinned by its SHA-256 (REQ-FLOW-038, amended
2026-10-08). A recorded hash that matches, and the structural fingerprint, no longer prove a delete there on their own
(`src/merge/reclaim.ts`, gate 4: the matching hash, then the rendering). The fingerprint still decides which
instruction files may reach the proof: a file it does not read as the engine's falls to the managed-block rules, so
`CLAUDE.md` is proven only by a block that spans it.

A file whose bytes no built rendering matches — an owner's file, or a copy an earlier release rendered that the running
engine no longer produces — is kept as `skipped-user-content`, its report entry names the path's class and the step to
delete it by hand, and its row leaves the ledger. A file the proof could not judge, because the plan could not be
built, is kept unjudged: its entry carries `unproven: true` and names why, and its row stays, so the next `sync` tries
again. Under the full `clean`, which removes the setup with its ledger, that entry instead says no sync will try again
and to delete the file by hand unless it is the owner's. A rendering built for the path judges the file whatever else
failed to build, so the 1.11.0 re-render decides at the old guard names even when the running engine's plan threw. A
proven delete keeps `proof: "hash"` and names the rendering in its detail (`engineRenderingsFor` and
`provenLegacyCursorGuards`, `src/cli/engine/emissionWrite.ts`; gate 4's `renderingRefusal`, `src/merge/reclaim.ts`;
`ignoringPolicyDenialForProof`, `src/pack/projection.ts`).

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, lane D's fixer rounds 4 to 6, under the declared default of
the ledger rows `build/62` and `review/109`; a `.bak` on every such overwrite, or a machine-local record of the hashes
this checkout's engine wrote, are the alternatives the run's record leaves to the maintainer). At a charter or
instruction file and at `.github/hooks/stamity.json`, a whole-file overwrite the ledger records keeps the bytes it
replaces recoverable unless the incoming rendering proves them (they equal it once `\r\n` reads as `\n`) or a managed
block spans the file. The previous content is then kept in git history, with no `.bak` and a notice naming it, when
the file is tracked and clean in the repository whose top level is the setup root. Otherwise it is kept behind a
verified `.bak` and a warning: for an uncommitted or untracked file, a setup in a monorepo subfolder, a charter inside
a submodule, and whenever git is absent or a git check fails or outlives its 5-second timeout. The checks run git from
the setup root, never the file's own folder, with every `GIT_*` variable stripped and `safe.bareRepository=explicit`
and `core.fsmonitor=false` on every call. They require one ordinary, merged, regular-file index entry that agrees with
`HEAD`, and the bytes read under the write lock must hash in process to that entry's blob, raw or with `\r\n` read as
`\n`; no call reads work-tree content, so no filter command runs (`overwriteNeedsRecovery` and `isTrackedAndClean`,
`src/merge/safeWrite.ts`). A file whose fingerprint fails, or whose bytes drifted from the recorded hash, takes the
`.bak` as before. So the structural fingerprint no longer proves a backup-free overwrite on its own there. The notice
also prints for the engine's own committed, unedited `AGENTS.md` on a release that changes the charter, and an
uncommitted setup, or one in a monorepo subfolder, gets an `AGENTS.md.bak`. The notice reads as that routine case: the
previous content is in git history and the change shows in `git status`. A `.bak` taken because git could not confirm
the previous bytes are committed says so and names the `.bak`, and "may be yours" stays for bytes the fingerprint does
not read as the engine's (`review/129`, `review/132`). For the delete and the overwrite alike, the paragraph above
read: "a recorded hash proves a whole-file delete or a backup-free overwrite only when the bytes show the engine wrote
them: the charter (…), the Codex rule appendix (…), the Copilot workflow's engine header line, or a managed block
spanning the file." A delete there still needs that matching recorded hash; the hash and the fingerprint together no
longer prove it, nor a backup-free overwrite.

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, the branch pass's fix round 2, `review/128` and `build/65`,
the maintainer's sign-off on the whole-branch review's W-1). The proof reads only the running engine's renderings, so
a full `clean` run by another version than the last `sync`, or after detection or the gates moved since it, would keep
every unedited engine file and then remove the ledger with `.stamity/`. A full `clean`, and `clean --pack <id>` for
that pack's copies, therefore refuses before touching anything — no file, no row, nothing under `.stamity/` — when a
file it would keep is one a `sync` with this version rewrites: its bytes still hash to the recorded hash, and the
plan `sync` runs for this setup (the manifest's clients, the org policy applied; route clause dropped 1.15.0: it read
"the manifest's clients and plugin record", and nothing reads the held `plugin` block since 1.15.0) writes other bytes
at that path. It exits with `CLEAN_ERROR`, names a few of the files and then a count, names the version in
`generatedBy` when it differs from the running one, and says to run `sync` with this version first, moving aside
first any of the files that is the owner's; `--dry-run` refuses the same way. A file `sync` writes at no path (a
retired artifact, a 1.11.0 Cursor guard name, a departed package's charter copy) or writes with these very bytes, an
edited file, and a file the proof could not judge are not counted. The sweep marks such an entry `staleRendering` on
a preview run before the confirmation (`refuseStaleRenderings`, `src/cli/commands/clean.ts`; `syncRenderingsFor`,
`src/cli/engine/emissionWrite.ts`; gate 4's `renderingRefusal`, `src/merge/reclaim.ts`).

Amended 2026-10-12 (run `2026-10-11_release-1-14-0`, unit `f3-clean-refusal-names-the-pack-exception`; ledger rows
`build/18`, `fix/1` and `review/10`, one defect, and `review/33` for this passage). The refusal above has one more
cause, and its next step one exception. A pack file edited after install renders other bytes at its client copy, so
the copy, which still hashes to the recorded hash, is one a `sync` with this version rewrites, and both forms of the
command refuse over it. There the `sync` the step names would carry the edited bytes into the clients' files, which
`check`'s `pack-integrity` remedy forbids. So the step still says to run `sync` with this version first and then the
same `clean`, and now names the exception in the same sentence: unless the `pack-integrity` row of `check` names an
edited pack file, one that no longer hashes to what its install recorded. Then `sync` is not run; that file is moved
out of the pack's directory first, as that row says, and the same `clean` is run again (`clean --pack <id>` after the
pack form, `clean -y` after the full one). With the file out of the pack's directory no rendering names its copy, so
the sweep keeps and names the copy and the run needs no `sync`. The exception is worded on an edited file, not on a
failing row: once the file is out the row reports it missing, and a copy that is stale for another reason still needs
that `sync`. The exception reaches an edited file only where that row names it. The row counts every finding and names
the first five (`checkPackIntegrity` and `MAX_NAMES_INLINE`, `src/cli/commands/check.ts`), so with more than five an
edited file past the fifth is counted and not named, and the step's words then lead to the `sync` (ledger row
`review/30`, deferred with `build/20`, `review/31` and `fix/8`, the other routes where the next steps of the two
commands differ). Only the step's text moved: the refusal's condition, code, exit status, message and `why` are as the
paragraph above states them, and its sentence on the step stays true and was incomplete (`refuseStaleRenderings`,
`src/cli/commands/clean.ts`; `packReinstallSteps` and `describePackIntegrityFinding`, `src/pack/verifyInstalled.ts`).

`SECURITY.md`'s manifest-forgery row names three known residuals inside the bound. (1) At an instruction file and at
`.github/hooks/stamity.json`, an overwrite of a file git tracks with no uncommitted change takes no `.bak`, under a
forged row hashing an owner's file too: the owner's previous content is in git history, and the overwrite shows in
`git status` and in the notice. Git before 2.38 ignores `safe.bareRepository`, so there the check rests on the look
the amendment of 2026-10-12 below states: for a tree git checked out, a setup root with no `.git` of its own that
holds committed bare-repository files is refused before git starts, its index answers nothing, and that overwrite
takes the `.bak`; what the look leaves on such a git is the ledger row `2026-10-11_release-1-14-0/fix/13` (amended
2026-10-12; the sentence read "and the engine does not check git's version, so there a setup root with no `.git` of
its own that holds committed bare-repository files can answer the check from its own index"). Elsewhere inside the
bound a backup-free overwrite still rests on the recorded hash alone,
and so does a delete at the state and pack folders and at the `stamity-` Cursor guards. (2) A planted pack or override
whose rendering copies an owner's file byte for byte, beside a forged row hashing it, still proves that delete through
`sync`, `clean` and `clean --pack`, and a planted pack folder widens what the proof renders even under a policy that
denies every pack (ledger rows `review/63`, `review/65` and `review/69` of run `2026-10-08_maintainer-tooling`). (3) A
selected `[mcp_servers.<id>]` table in `.codex/config.toml`, and the bare `[mcp_servers]` table the engine renders
when no server is selected, are proved by their record alone (REQ-FLOW-037): a forged `coOwned` record that hashes an
owner's bare `[mcp_servers]` makes it the engine's, and owner servers written under it as dotted keys are then
refreshed away with no `.bak`. It is tracked as the deferred row `2026-10-08_inbox-pass/pass/3`
(`.stamity/runs/2026-10-08_inbox-pass/ledger.jsonl`).

Amended 2026-10-12 (run `2026-10-11_release-1-14-0`, units `s1-every-git-read-pinned` and `s2-bare-shape-guard` with
their fix round; ledger rows `review/14` and `fix/2`, one finding, `review/43`, `review/49` and `review/50` of the fix
round, and `build/30` for the sentence amended above). The tracked-and-clean check no longer rests on
`safe.bareRepository=explicit` alone, which git honours only from 2.38. Before each of its git calls starts git, the
check takes a look of its own, with no git in it (`gitDiscoveryMeetsBareShape`, `src/merge/safeWrite.ts`): from the
real path of the setup root it walks towards the filesystem root, asking `lstat` whether a name exists, its type and
its device, and `stat` the type of each `.git` entry, as git takes it, and reading no file's content. A level is
refused when it passes git's own test for a repository folder by entry names: `HEAD` beside `commondir`, or beside both
`objects` and `refs`, a link counting as the entry it stands in for. The walk ends without a refusal at a level whose
`.git` is a regular file (or a live link to one), or a folder (or a live link to one) that passes the same test; at the
first level on another file system than the starting folder's, except on Windows; and at the filesystem root. A `.git`
of any other kind (an empty folder, one holding `HEAD` alone, a dangling link) ends nothing, and that level is tested
like any other. On a refusal no git is started, the check answers as it
does when a git call fails, and the overwrite takes the verified `.bak`. So for a tree git checked out, a committed
folder of that shape at the setup root, or above it with no such `.git` between, does not answer the check: on git
2.38 and later by the option and by the look, on an older git by the look alone. The look decides by names, so it also
refuses a level that holds the names and that git could not open. What an older git opens is read from git's source
and was probed on git 2.52 with the option switched off; no git older than 2.38 was run.

The same look is taken by the shared runner (`gitCheckRunner`, `src/cli/engine/gitStatus.ts`), which throws as it does
when git refuses the folder, exit status 128 included, and by the `worktree` verbs' one start of git, which is handed
the environment those verbs keep (REQ-WORKTREE-001 of `docs/specs/worktree-lane.md`, amended 2026-10-12). The check
and the shared runner strip every `GIT_*` variable and hand the look none. Which reads go through the shared runner
is `SECURITY.md`'s to state, in its row on a folder committed in the shape of a bare repository; no requirement of
this spec restates that list. All of it is the CLI verbs' and not the library's. The package's API also carries the
origin read as a function, `detectRepoGitIdentity` (`src/workspace/git.ts`), whose default runner is not the shared
one: called with no runner it starts git by an absolute path, as the next paragraph states, and as plain git in every
other way, with neither option, no look and the caller's whole environment, and at a folder git opens as a bare
repository it returns the origin that folder names. `init` and `config detect` pass it the shared runner
(`detectPlatform`, `src/cli/commands/init/plan.ts`; `runDetect`, `src/cli/commands/config.ts`), so no verb reaches
that default. The module sits below the shared runner and cannot import it, as the function's own comment says;
`SECURITY.md`'s row states the same boundary, and a default that is the pinned runner is deferred (ledger row
`fix/30`).

Amended 2026-10-12 (the same run; read against `85db3729`). Every place that starts git starts it by an absolute path,
never by its bare name: the shared runner, the tracked-and-clean check, the `worktree` verbs' one start of git and the
library's default runner (`gitCheckRunner`, `src/cli/engine/gitStatus.ts`; `runGitCheck`, `src/merge/safeWrite.ts`;
`runGit`, `src/worktree/git.ts`; `execGit`, `src/workspace/git.ts`). Each asks `gitProgramFor`
(`src/shared/programPath.ts`), which resolves git once per working folder and `PATH` value through
`resolveProgramOnPath` and remembers a path it found, never an answer of nothing. The walk goes over `PATH` in order
and takes only an entry that is a full path. It skips an empty entry and a relative one, which both name the working
folder or a folder under it, and an entry whose real path is the working folder's, however it is spelled. In each
entry it tries the names the runtime tries for a bare name: on POSIX the name as given, which must be a regular file
with an execute bit, and on Windows the name with `.com` added, then with `.exe`. The walk is pure over what it is
handed, the platform, the `PATH` value, the working folder and the file probe, so its Windows rules are held on every
host. Where no entry holds git no program is started, and each start answers as on a machine with no git installed:
the shared runner and the default runner throw the error Node gives a start that finds no program (`programNotFound`,
the same file), the check rejects with it and the overwrite takes the `.bak`, and the `worktree` seam settles with
status 127. None of those outcomes carries the mark the next paragraph states. Before this change the four places
named git bare and left the lookup to the runtime, which on Windows looks in the folder the child runs in before any
`PATH` entry (read from the runtime's source, not from a run), so a file of git's name in that folder was the program
started. `SECURITY.md` states the claim in a row of its own and bounds it to the folder git runs in: the walk takes
the `PATH` the engine is started with as given. No requirement id is added; this requirement owns how the engine
starts git. Tests, by name: `test/shared/programPath.test.ts`, whole; `test/cli/engine/gitStatus.test.ts` (the
describe "the default runner starts the git an absolute PATH entry holds", and the case "reads a repository whose root
holds a program file under git's name", which runs on Windows only); `test/merge/safeWrite.test.ts` ("starts git by an
absolute path for every call the check makes", "answers from the git on PATH where the setup root holds a file of
git's name" and "takes the .bak, and starts nothing, where only the setup root holds a file of git's name");
`test/worktree/git.test.ts` (the describe "runGit starts the git an absolute PATH entry holds"); and
`test/workspace/git.test.ts` (the describe "detectRepoGitIdentity — the default seam starts the git an absolute PATH
entry holds"). The cases that put a file of git's name in the working folder are skipped on Windows, where that one
case stands in for them.

A refusal by the look is told apart from every other way git does not answer where the mark below is read, and nowhere
else (the same run's fix rounds, commits `f01c76ba`, `fa07900d`, `c6354ecd`, `82016965` and `fbcdc652`; ledger rows
`review/44`, `review/55`, `review/57` to `review/61`, `review/66`, `review/71` to `review/73`, `fix/20`, `fix/23` and
`fix/24`). The error the shared runner throws at such a folder, and no other, carries the mark `keptFromGit`, and the
working-tree status read through it carries `reason: "bare-layout"` (`keptFromGit` and `readWorkingTreeStatus`,
`src/cli/engine/gitStatus.ts`); the mark is read, never git's message. Each text printed where the mark is read states
that cause, that git was not started because this folder or a folder above it has the layout of a bare repository, and
names no git command: `check`'s `git-available` row, still a `warn`, which says to find that folder by looking at
entries by name, to run no git in it or in any folder under it, and to start no flow there until the folder is moved
off that path, since the git a flow's session and its sub-agents start is not set to refuse such a folder (`checkGit`,
`src/cli/commands/check.ts`); `sync`'s closing step after a write, which says how to review without git and, where the
report folded rows out of its list, that the list was cut short and what the manifest's ledger and `sync --json` do
and do not say (`syncClosingLines`, `src/cli/commands/sync.ts`); `init`'s question, its no-git note, which closes on
the sentence about flows that `check`'s row carries, the security line of its ready panel and of its dry-run preview,
and its refusal when the question is declined (`askProceedWithoutGit` and `noGitNote`, `src/cli/commands/init.ts`;
`gitignoreLine`, `src/cli/commands/init/panel.ts`); the first of `init`'s next steps, which says to move that folder
off the path, or to work from a checkout that does not keep it there, before a client or a flow is started, and which
the ready panel puts at the head of each client's list and `init --json` carries once, first in `nextSteps`, the usual
steps following it unchanged (`refusedFolderSteps`, `src/cli/commands/init/panel.ts`); after a guided migration that
leaves paths of the previous setup behind, the clause of the uninstall line that says to copy the files holding the
operator's own prose out of the folder with no git command, where it says to commit wherever git answers, on the ready
panel and in the dry-run preview (`residueLines`, the same file); and `gate`'s reason, which names no git call as
failed and no exit status, inside the sentence REQ-FLOW-065 gives a change that could not be read
(`describeGitFailure`, `src/cli/commands/gate.ts`). Two things at such a folder do not turn on the mark. The
overwrite's `.bak` warning is the one printed whenever git could not confirm the previous bytes, with its list of
other causes and no git command: the check's own git call rejects there with no mark (`runGitCheck` and
`isTrackedAndClean`, `src/merge/safeWrite.ts`). And `init --json` prints no note, its stdout being the one document,
and that document carries no field naming the cause: the step is its one sign of it (`src/cli/kit/program.ts`; ledger
rows `fix/9`, deferred, and `fix/32`). Everywhere else the step is absent. Where git answers, each of those texts is
the one it was. Where git did not answer and the look refused nothing, every text these verbs print goes by what the
engine itself found and names no git command, `git status`, `git --version`, `git init`, `git diff` and
`git rev-parse` included: a git typed at a prompt is found by the shell's rules and not by the engine's walk, so it
answers for a program the engine may never start. `check`'s `git-available` row and `init` ask the walk instead
(`gitProgramFor`, called from `checkGit` and once by the `init` command, which hands the answer to its question, its
note, its refusal and its panel; the note as read at `d53af1dd`, the rest of this passage at `db6ac4a8`). The row and
`init`'s no-git note are two texts each. Where the walk found no git, each says the engine found no git to start, says
that git is taken only from a `PATH` entry that is a full path to a folder other than this one, and states outright
what `worktree` and `gate scan` lose. Where it found one, each says so, which leaves a missing repository and a git too
slow for the check: the row tells those two apart by a `.git` entry found by name, and the note words what the two
verbs lose on the repository alone. `init`'s other texts follow the note. Its question has a third text, for a walk
that found no git, and is the one it was where the walk found one. The security line of its ready panel and of its
dry-run preview has a text for each answer of the walk, and neither says the rule takes effect on a `git init`. Its
refusal when the question is declined has a text for each as well: the next step tells a repository by a `.git` entry
found by name, or says to install git or to put its folder on `PATH` by its full path. And after a guided migration
the uninstall line names the copy wherever git did not answer, whatever the walk found (`askProceedWithoutGit`,
`noGitNote` and the refusal, `src/cli/commands/init.ts`; `gitignoreLine` and `residueLines`,
`src/cli/commands/init/panel.ts`). `sync`'s closing step after a write has a third text there too: it names no
`git diff`, gives no cause of its own and points at `check`'s row, and it carries the same added words where the list
was cut short (`NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE`, `src/cli/commands/sync.ts`). `gate`'s reason names its first
read in words where that read fails or runs long, with git's own exit status and no git call; a read that fails
later, in a work tree git opened for the engine, keeps its step (`describeGitFailure`). No
key, type, exit status or error code moved: `check` exits as before, `gate classify` gives `product` at exit 0 and
`gate scan` exits 1, `init`'s refusal keeps `VALIDATION_ERROR` and its message, the document of `init --json` has the
keys it has in a plain folder, with `nextSteps` the flat list of strings it was and one string more, first, at such a
folder only, and the `dirty` block of `sync --json` holds `available`, `dirty` and `changedCount` and no reason
(`syncJsonPayload`, `src/cli/commands/sync/report.ts`). `handoff`, `config detect` and the history and origin reads of
`init` read the refusal as git not answering, as before. Where git itself refuses a folder the look passed, the layout
of residual (1) below on git 2.38 and later, no mark is set and the ordinary texts print (ledger rows `fix/25`,
`review/65` and `review/68`, deferred). This requirement owns the look, the shared runner's mark and these texts; the
`worktree` verbs' refusal at such a folder is REQ-WORKTREE-001's.

`SECURITY.md`'s row bounds the claim to a tree git checked out and to the git the CLI's verbs start, and names
four known residuals in 1.14.0, each tracked as a ledger row of the run. (1) On a git older than 2.38, a `.git` folder
that holds those names and that git cannot open ends the look as safe, while that git walks past it and opens a
folder of the shape at that level or at any level above it; that walk was run on git 2.52 with the option at its
default, which is how an older git reads it, and on no older git. No commit can hold a `.git` entry, so this takes a
leftover or damaged `.git` on the operator's own machine, or a tree that did not come from git
(`2026-10-11_release-1-14-0/fix/13`). The next two are the `worktree` verbs' alone, since only they keep git's own
variables. (2) With `GIT_COMMON_DIR` exported and no `GIT_DIR`, a git older than 2.38 takes part of a repository from
the folder the variable names and so opens a committed folder on fewer entries than the look asks for; the look does
not read that variable, so it passes a folder that such a git opens (`2026-10-11_release-1-14-0/fix/14`). (3) With
`GIT_DIR` set they take no look, whatever the value, and git resolves a relative value against the folder it runs in,
so such a value can name a folder the tree holds, on any git version (`2026-10-11_release-1-14-0/review/51`). (4)
Everything above is the git the CLI's verbs themselves start, and no other: git that a client's own tools, a flow's
session and the sub-agents it dispatches, or the operator's shell start carries neither option and takes no look, and
started in or under a committed folder of the shape that git can open, it reads that folder as the repository. That
does not take a refusal by the look. The look is taken from the folder a verb runs in and walks upward, so a
committed folder of the shape elsewhere in the tree, below the setup root, meets no look and no warning: `check`'s
`git-available` row says nothing of it and passes where git answers at the setup root. Where the look does refuse a
folder, that does not stop a flow either, since `/st-quick` and `/st-work` read `gate`'s reason as a scan that did not
run and go on with the session's own git; `check`'s row, `init`'s note and the first of `init`'s next steps say there
to start no flow until the folder is moved. The one setting git documents against it, `safe.bareRepository` set to
`explicit` in the operator's own user-level or system-level git configuration, is the operator's to make, and it
covers a folder below the setup root as it covers one the look refuses; the engine neither sets it nor checks for it
(`2026-10-11_release-1-14-0/review/70`, and `review/79` of the same run for the folder below the setup root).

- GIVEN an owner's `.claude/skills/st-local/SKILL.md`, an owner's `.cursor/hooks/mcp-guard.mjs` whose bytes are not the
  setup's 1.11.0 re-render, an owner `AGENTS.md` copying the charter's title and four headings at the root, an owner
  nested `AGENTS.md` opening with the Codex appendix title, an owner `AGENTS.override.md` with the appendix heading on a
  line, an owner Copilot workflow with the engine's header line, and an owner `.github/hooks/stamity.json`, each under a
  forged row hashing it, WHEN `sync -y` or `clean -y` sweeps THEN each stays (added 2026-10-08).
- GIVEN a 1.11.0 setup's unedited guards, core, with a local pack's agents or with an override agent, THEN the first
  `sync` deletes both; GIVEN a client deselected after setup THEN its unedited files are still deleted, a deselected
  Copilot's workflow and hooks file included; GIVEN a Claude-only setup's unedited files WHEN `clean -y` runs THEN each
  is deleted; GIVEN the engine's unedited per-package charter whose package left, under a `supplement` or `skip` decision
  on the root, WHEN `sync -y` runs THEN it is deleted (added 2026-10-08).
- GIVEN a deny-all policy over an installed, projected pack WHEN `sync -y` runs THEN every copy is deleted and none is
  written, and an owner's file at a copy's name under a forged row is kept (added 2026-10-08).
- GIVEN a proof plan that cannot be built WHEN `sync -y` sweeps THEN each file that needs the proof is kept with
  `unproven: true`, its row stays and the entry names why; WHEN the full `clean -y` sweeps THEN the entry says the setup
  is being removed and to delete the file by hand unless it is yours; GIVEN a file whose bytes match no built rendering
  THEN it is kept with no mark and its row leaves (added 2026-10-08).
- GIVEN Copilot selected and forged rows hashing an owner's untracked root `AGENTS.md` and `.github/hooks/stamity.json`
  WHEN `sync -y` runs THEN a verified `.bak` holds each owner file; GIVEN the same repository committed THEN no `.bak`
  exists and the notice names git history (added 2026-10-08).
- GIVEN such an overwrite of a tracked file with an uncommitted or staged edit, an `assume-unchanged` or unmerged entry, a
  setup root that is not the repository's top level, no setup root, git missing, or `GIT_DIR` aimed at another
  repository THEN it takes the `.bak`; GIVEN a committed bare-repository-shaped folder beside the hooks file whose config
  names a file-system monitor, or a clean filter on a stat-dirty tracked file, THEN neither command runs, and every git
  call the check makes carries `safe.bareRepository=explicit` and `core.fsmonitor=false` (added 2026-10-08).
- GIVEN a setup whose root charter and one skill carry an earlier release's rendering, their recorded hashes matching
  and `generatedBy` naming that release, WHEN `clean -y`, `clean -y --json` or `clean --dry-run` runs THEN it exits 1
  with `CLEAN_ERROR`, names both files and the release, and every file and `.stamity/` are byte-identical; WHEN `sync -y`
  runs and then `clean -y` THEN every file the ledger named is gone and so is `.stamity/`; GIVEN an owner's file at a
  pack copy's name under a forged row hashing it WHEN `clean --pack <id> -y` runs THEN it refuses the same way and the
  file and the manifest are unchanged (added 2026-10-08, `review/128`).
- GIVEN a setup root made as a bare repository, with no `.git`, whose own index tracks a committed `AGENTS.md`, and a
  ledger row hashing that file WHEN an overwrite of it runs THEN no git is started, a verified `.bak` holds the
  previous bytes and the warning says git could not confirm they are committed (added 2026-10-12, `review/14`).
- GIVEN the look over seeded folders THEN it refuses `HEAD` beside `commondir` or beside both `objects` and `refs`, and
  a folder under such a level, and passes `HEAD` alone, `HEAD` beside one of the two, and a folder under one of those;
  it ends without a refusal at a `.git` file, whatever it holds, and at a `.git` link that leads to a file, at a
  `.git` folder or a live `.git` link holding those names, and walks past an empty `.git` folder, one holding `HEAD`
  alone and a dangling `.git` link; a link standing in for an entry counts as that entry; the walk starts from where a
  linked folder really is; off Windows it ends at the first level on another file system, and the level it starts at
  is tested whatever its device; and handed an environment it takes no look with `GIT_DIR` set, counts `HEAD` beside
  `refs` as the shape with `GIT_OBJECT_DIRECTORY` set, and crosses a file system with `GIT_DISCOVERY_ACROSS_FILESYSTEM`
  set to a value git reads as true or cannot read, and not with one git reads as false: empty, `false`, `no`, `off` or
  a zero (added 2026-10-12; the `.git` link to a file and the value read as false added the same day, after the review
  of pull request #97).
- GIVEN a folder holding an empty `HEAD` beside empty `objects` and `refs`, with no `.git`, THEN the working-tree status
  read there and in a folder under it carries `reason: "bare-layout"`, the shared runner's error there carries the
  mark, and an error with status 128 alone does not; WHEN `check` runs there THEN it exits 0 and its `git-available`
  row is a `warn` that says git was not started, says to run no git in that folder or in any folder under it and to
  start no flow there until the folder is moved, and names no `git status`; WHEN `sync` writes there THEN its closing
  step names no git command, and past twenty listed rows it says the list was cut short, while `sync --json` has the
  keys and the three-field `dirty` block it has in a plain folder; WHEN `init` runs there, live or as a dry run, THEN
  its note and its security line state that cause, its question asks on it, a declined question exits 1 with nothing
  written, and no text of the run names `git init`, `git status`, `git diff`, `git log` or `git rev-parse`; WHEN a
  live `init` runs there THEN its note says to start no flow there until the folder is moved, and under each client's
  heading the ready panel's next steps are one step that says to move the folder, then the steps a plain folder gets;
  WHEN `init --json` runs there THEN `nextSteps` is that step followed by the plain folder's list, and the document,
  its `decisions` and its `report` have the plain folder's keys; WHEN `init` runs there over a previous setup with a
  full migration, live or as a dry run, THEN the uninstall line names a copy made with no git command, does not say
  to commit, and no text of the run names one of those five git commands; WHEN `gate classify` or `gate scan` runs
  there THEN classify gives `product` at exit 0 and scan exits 1, each reason saying git was not started and naming
  no git call as failed, with the keys a folder with no repository gets; GIVEN a folder with no repository and no
  such layout, on a host with git on `PATH`, THEN the step is absent, `check`'s row, `init`'s note and `init`'s
  security line say the engine found a git binary, `init`'s question is the one it was, a declined question's next
  step tells a repository by a `.git` entry found by name, the uninstall line after a full migration names a copy,
  a `sync` that wrote files closes on a step that says to review without git and points at `check`'s row, `gate`'s
  reason says no git work tree was found, with git's exit status, and none of those texts names a git command,
  `git --version`, `git init`, `git diff` and `git rev-parse` included; GIVEN the same `sync` in a repository THEN
  its closing step is the one it was;
  GIVEN a folder of that layout below a setup root that git opens WHEN `check` runs at the root THEN the row passes
  and says nothing of that folder; GIVEN a real bare repository with an origin of its own, on git's own default for
  `safe.bareRepository`, THEN the library's origin read returns that origin with no runner passed, and nothing
  through the shared runner (added 2026-10-12, `review/44`; the clauses on flows, the step and the uninstall line
  follow `review/71` to `review/73`, the folder below the root `review/79`, and the library's read `fix/30`; the
  clause on `check`'s row where there is simply no repository was amended the same day with the next criterion,
  `init`'s note joined it there, and the other texts of that clause the round after).
- GIVEN a folder with no repository and no such layout WHEN `check` runs under a `PATH` with no entry the engine
  takes git from, first an empty one and then one whose only entry is the setup root, which holds files of git's
  program names, THEN each run exits 0 and its `git-available` row is a `warn` that says the engine found no git to
  start, says git is taken only from a `PATH` entry that is a full path to a folder other than this one, says
  outright that `gate scan` exits 1 and that the flows list `secret scan: not run`, and names no missing
  repository, no slow git, no `.git` entry and no git command; WHEN `init` runs under each of those two, live or as
  a dry run, THEN it exits 0 and its one no-git note says the files have no revert path because the engine found no
  git to start, says the same of the `PATH` entries git is taken from and of `gate scan` and the flows, and names no
  missing repository, no slow git and no git command; WHEN `init` runs under an empty `PATH`, live or as a dry run,
  THEN its security line says the engine found no git to start and names no missing repository, and no text of the
  run names a git command; WHEN it runs there at a terminal THEN its question asks on that cause, Enter writes, and a
  declined question exits 1 with nothing written, its next step saying to install git or to put its folder on
  `PATH`; WHEN `sync` writes under an empty `PATH` THEN it closes on the step it closes on in a folder with no
  repository (added 2026-10-12; the clauses on `init` and `sync` the same day).
- GIVEN a Claude setup with `ops` added and synced and one of the pack's installed files edited WHEN
  `clean --pack ops -y` or `clean --dry-run` runs THEN each exits 1 with `CLEAN_ERROR` naming that file's client copy,
  its next step holds the `sync` step it always gave and then the exception, naming `clean --pack ops` or `clean -y`
  as the command to run again, and the copy's bytes are unchanged; GIVEN the edited file then moved out of the pack's
  directory and no `sync` run WHEN `clean --dry-run` and then `clean --pack ops -y` run THEN both exit 0, the moved
  file's copy is kept and named with the bytes it had before the edit, and the pack's folder and rows are gone (added
  2026-10-12, `review/33`).

Tests for the criteria added 2026-10-08: `test/cli/commands/clean.test.ts`, `test/cli/ledgerForgery.test.ts`,
`test/merge/reclaim.test.ts`, `test/merge/hookFilesOwnership.test.ts`, `test/adapters/cursorLegacyGuards.test.ts`,
`test/manifest/ownedPaths.test.ts`, `test/merge/safeWrite.test.ts`, `test/cli/flows.e2e.test.ts`.

Tests for the criteria added 2026-10-12: `test/merge/safeWrite.test.ts` (the describe "gitDiscoveryMeetsBareShape —
the look before git is started" and the case "starts no git at a setup root shaped like a bare repository, and takes
the .bak"), `test/cli/engine/gitStatus.test.ts` and `test/worktree/git.test.ts` (the same look at the shared runner
and at the `worktree` verbs' start of git), `test/workspace/git.test.ts` (the case "starts git by an absolute path
with none of the pinned options and reads the folder's own origin with no runner passed, and nothing through the
pinned runner", which also holds each start to a full path since the default moved to one) and
`test/cli/commands/clean.test.ts` (the case "refuses over the copy of an edited pack file, and its next step keeps
that pack away from sync"). For the texts at a refused folder, the cases the fix rounds added, red first but where
one pins a text or a behaviour that did not move: `test/cli/engine/gitStatus.test.ts` ("says the folder was kept from
git, at the folder and below it, and reads no history there" and "marks the runner's own refusal for a caller that
words the failure, and no other error"); `test/cli/commands/check.test.ts` ("says the folder was kept from git, with
no hint to run git there, where the look before git refused it", which compares the row whole, the whole-row
comparison of "names the two verbs that need git on the git-available row where git does not answer", which also
holds the row to naming no git command, "says the engine found no git to start, and names no other cause, where no
PATH entry it takes git from holds one", both red before the row asked the walk, and "passes the git-available row,
and warns of nothing, for a folder of that layout below the setup root"); `test/cli/commands/sync.test.ts` (the describe "sync — a folder the look before git refused", and in
"syncClosingLines" the cases "names no git command in the review next-step where the folder was kept from git" and
"says the list was cut short where the report folded rows, at such a folder and wherever else git did not answer";
and, for a folder git did not answer in for another cause, the describe "sync — where git did not answer" and the
case "names no git command in the review next-step wherever else git did not answer", red before the step had a
text for that state);
`test/cli/commands/syncEngine.test.ts` ("carries the three working-tree facts and nothing more, whatever the
status says of why git did not answer"); `test/cli/commands/init.test.ts` ("says the engine found no git to start, and
names no git command, where no PATH entry it takes git from holds one, on $name" and the whole-note comparison of
"names the two verbs that need git on $name", both red before the note asked the walk, "states the cause and names
no git command where the look before git refused the folder, on $name", "refuses a declined question there with that cause, and
names no git command", "states that cause on the security line there, and no text of the run names a git command, on
$name", "asks the question on that cause there, and Enter still takes the default and writes", "opens the ready
panel's next steps with moving the folder there, and the usual steps follow", "opens `--json`'s nextSteps with the
same step there, and moves no key of the document", "says in the note there to start no flow until the folder is
moved, and keeps the other note as it was" and "names no commit and no git command on the migration's uninstall line
there, on $name", with the control case "keeps the question as it was where there is simply no repository", and, for
the other texts where git did not answer, "names no git command in the declined question's refusal where there is
simply no repository", "says on the security line that the engine found a git binary, and no text of the run names a
git command, where there is simply no repository, on $name", "says on the security line that the engine found no git
to start, and no text of the run names a git command, on $name", "asks the question on the engine having found no
git, and Enter still takes the default and writes" and "refuses a declined question on the engine having found no
git, and names no git command", each red before `init` handed the walk's answer to those texts);
`test/cli/commands/initPanel.test.ts` ("states the cause
and names no git command where the look before git refused the folder", "carries that cause from the panel's input
to its security line", "opens every client's steps with moving the folder where the look before git refused it",
"keeps the steps as they were where git answers and where there is simply no repository", "names no commit and no
git command on the uninstall line where the look before git refused the folder", "keeps the uninstall line as it
was where git answers", "names a copy and no commit on the uninstall line wherever else git did not answer", "says
the engine found a git binary, and names no git command, where git did not answer" and "says the engine found no git
to start, and names no missing repository, where its walk found none"); and `test/cli/commands/gate.test.ts` ("says
git was not started, and names no git call as failed, where the look before git refused the folder", "exits 1 saying
git was not started, with the same document, where the look before git refused the folder" and "names no git command
in the reason where there is simply no repository, for classify and for scan").

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit `d1a2-clean-pack-copies`, with lane D's fixer rounds 1
and 2). `clean --pack <id>` also removes the copies `sync` projected from that pack into the clients' folders, while the
pack is still installed. Only a client row at a path that needs the rendering proof can be a copy. It plans the emission
twice, both times for the clients the setup wrote for and with every installed pack rendered whatever the trust policy
says: once as the manifest stands, and once with the pack's `pack:<id>` rows removed. A copy is a client row whose path
the first plan renders and the second does not, or a row of one of the pack's own artifacts at a path the second plan
does not render. The pack's artifacts are read off its own rows and its folder, and a row matches one by class, catalog
id and the name its path projects under, so an artifact whose file was moved out of the pack folder is still the
pack's, and a forged row naming an artifact at another path is not. Each copy joins the sweep and leaves only as bytes
the first plan renders; an edited copy, or an owner's file at a copy's name under a forged row, is kept and named, and a
judged copy's row leaves with the pack's rows, kept or not. When the first plan cannot be built (a pack whose own command
and skill share a name, which the planner refuses), the copies are only the rows of the pack's own artifacts. None can
be proven, so each is kept and named: one unedited since its recorded hash keeps its row, one edited or hashless loses
it, and the run never falls back to the recorded hash. When the second plan cannot be built, no copy is looked for,
their rows stay, and the run says so. `--dry-run` lists each copy and writes nothing; the confirmation names the copy
count; the next steps name each kept copy for a delete by hand "unless it is yours", then the pinned `sync`. The pack
remedies the CLI prints — the name-clash refusal's, `add`'s replace steps and `check`'s pack-integrity one — gain the
same step by hand after `clean --pack`: "delete by hand each client copy it keeps and names, unless it is yours". `add`'s
remedy for a pack no longer installed reads `sync`, that step, `add`, `sync` (`findPackCopies`,
`src/cli/commands/clean.ts`; `remedyOf`, `src/emit/planner.ts`; `replaceSteps`, `src/cli/commands/add.ts`;
`packReinstallSteps`, `src/pack/verifyInstalled.ts`). Before, `clean --pack` removed only `.stamity/packs/<id>/` and
left the copies to the next `sync`, which no rendering can prove once the pack is gone.

- GIVEN a Claude setup with `ops` added and synced WHEN `clean --pack ops -y` runs THEN every `.claude/` copy projected
  from `ops` is deleted with `proof: "hash"`, its row is gone, and no other row moved; GIVEN one copy edited, or an
  owner's file at a copy's name under a forged row, THEN it stays and is named; GIVEN `--dry-run` THEN each copy is listed
  and nothing is written; GIVEN two packs THEN the other pack's copies and rows are untouched; GIVEN a deny-all policy
  THEN the copies are still found and deleted (added 2026-10-08).
- GIVEN the 1.11.0 `ops` clash WHEN `clean --pack ops -y` runs THEN it keeps and names the copies of the pack's own
  artifacts and nothing else (a retired engine row and owner files under forged rows stay untouched), the unedited ones
  keep their rows, and the printed remedy with its step by hand runs to a green `check`; GIVEN a setup that cannot be
  planned without the pack THEN no copy is taken and every copy keeps its bytes and its row; GIVEN a scoped pack whose
  edited file was moved out of its folder as `check`'s integrity remedy says THEN the printed steps run to a green
  `check` (added 2026-10-08).

Tests for these criteria: `test/cli/commands/clean.test.ts` (the `clean --pack` copies cases: the proof-hash delete,
the edited copy, the forged row, `--dry-run`, two packs, a deny-all policy, the unplannable pack and the setup that
cannot be planned without it) and `test/pack/upgradeRemedy.test.ts` (the 1.11.0 `ops` clash and the integrity remedy's
printed steps, a scoped pack's included).

Amended 2026-10-14 (plan 020 file 1, unit `d7-engine`; cited at `d590a266`). The renderings every proof above builds
read nothing from the manifest's held `plugin` block (REQ-PLUGIN-045, amended 2026-10-14), and "each in repository
mode" names the one install mode 1.15.0 has. Nothing else in this requirement moved.

Amended 2026-10-15 (plan 020 file 3, units `f3-work-close` and `f5-touchpoints-a`, `f3`'s fix round on `build/20` and the
corpus fix batch's `review/43`; the inbox row `2026-10-11_release-1-14-0/review/70`). A `gate` reason that names a
refused folder stops the flows with that reason, where residual (4) above reads that `/st-quick` and `/st-work` take it
as a scan that did not run and go on with the session's own git. `/st-work`'s Gates paragraph, above the re-attachment
cut so a resumed run keeps it, reads that a scan's `reason` "saying `git was not started here` stops the run as
BLOCKED_DEPENDENCY, quoting it" (`content/commands/st-work.md:198-200`). `/st-quick`'s Scan step stops the batch on a
`reason` from either `gate` call that says git was not started because a folder has the layout of a bare repository: no
later step runs, no git command runs in that folder, the commit included, and the report gives that reason under
`Not done:` with every applied item listed as ungated (`content/commands/st-quick.md:164-167`). Both read the producer's
wording, which `describeGitFailure` builds for `gate scan` and `gate classify` alike (`src/cli/commands/gate.ts`), and a
test holds that wording so a reworded producer cannot disarm the stop (`test/corpus/commands/lightTrio.test.ts`).
Residual (4)'s other halves stand: git a client, a session or the operator's shell starts takes no look, and a folder of
the shape below the setup root meets none. One flow is outside the stop: `/st-debug` runs git itself and reads no `gate`
reason, so at such a folder the stop does not reach it (`content/commands/st-debug.md:22`; recorded by `f5`'s report as
pre-existing).

- GIVEN `/st-work`'s Gates paragraph THEN it carries the stop before `### Specialist pass`, and the Specialist pass
  carries no copy of it; GIVEN `/st-quick` THEN the stop sentence sits in step 1 after the `not run` path it overrides
  and before `2. **Classify.**`, and `src/cli/commands/gate.ts` still carries "git was not started here: this folder,
  or a folder above it, has the layout of a bare repository" (`test/corpus/commands/work.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`; added 2026-10-15).

### REQ-PLUGIN-047 `check` takes the expected release and client set from its caller

Moved here on 2026-10-14 from `docs/specs/plugin-lifecycle.md`, its id kept (plan 020 file 1, run
`2026-10-14_cli-native`). The text below is the requirement as it stood there at `c96c7146`, its route clauses dropped
in place; the heading read "`check` takes the expected release, client set and install mode from its caller".

Added 2026-10-07 (plan 016 file 0, unit `u0-check-expectations`). `check` proves the files match the manifest and the
running CLI, and a pull request can change both. Two flags take the expectation from a caller the pull request cannot
edit, such as a required workflow's input: `--expect-version <semver>` (the running CLI and the manifest's `generatedBy`
both equal it) and `--expect-tools <csv>` (the manifest's clients equal it as a set) (route clause dropped 1.15.0: it
read "Three flags", the third being "`--expect-mode <mode>` (the manifest records that install mode; the values are
`INSTALL_MODES`)"). With any of them `check` prints one more row,
`expectations`, and a `--json` object of the same name; a mismatch fails the run with `error.code: "EXPECTATION_ERROR"`,
exit 1, naming the expected and the recorded value and the step that restores it. Without them the output is
byte-identical to before.

Amended 2026-10-07 (build): `error.next` joins its steps with `"; "`, as `error.why` joins the mismatches, one step per
mismatch in the same order. With `--expect-version` given, every step runs the expected release — the client-set step
too (route clause dropped 1.15.0: "and install-mode steps") — so following the steps in order leaves `generatedBy` at
the expected release; without it they run the running release. An `--expect-version` carrying build metadata
(`1.12.0+acme.1`) is refused with `VALIDATION_ERROR`, because npm versions carry none. The expected-release calls read
the identity record `packageCommand` reads, registry included (`packageCommandAt`, `src/cli/kit/packageName.ts`), so a
registry fork's steps name its registry (REQ-PLUGIN-048).

- GIVEN a repository whose manifest dropped `cursor` with its rows and files WHEN `check --expect-tools claude,cursor`
  runs THEN it exits 1 with `EXPECTATION_ERROR` and `expectations.tools.missing` is `["cursor"]`; WHEN plain `check` runs
  THEN its output is unchanged.
- GIVEN `--expect-version` other than the running release or the manifest's `generatedBy` THEN `check` exits 1 naming
  which (route clause dropped 1.15.0: "GIVEN `--expect-mode generated` on a plugin-backed manifest THEN it exits 1").
- GIVEN an invalid value (`--expect-version 1.x`, `--expect-tools claude,emacs`) THEN it exits 1 with `VALIDATION_ERROR`
  before any probe; GIVEN `--expect-mode` with any value THEN it exits 2 as an unknown option (amended 2026-10-14; it
  read "GIVEN `--expect-mode bogus` THEN it exits 2").
- GIVEN `docs/cli-reference.md` THEN it lists the two flags and the `EXPECTATION_ERROR` code, and
  `docs/troubleshooting.md` documents the `expectations` row (amended 2026-10-14; it read "the three flags").
- GIVEN `--expect-version 1.12.0+acme.1` THEN `check` exits 1 with `VALIDATION_ERROR` before any probe; GIVEN a failing
  `--expect-version` and a failing `--expect-tools` THEN `error.next` holds one step per mismatch separated by `"; "`, and
  every step names the expected release; GIVEN a registry fork THEN each step carries `--@<scope>:registry=<url>`
  (added from the build).

As built (2026-10-07): measured 2026-10-06 on 1.11.0, dropping `cursor` with its 78 rows and 76 files, guards included,
left `check` at exit 0, and `check --help` offered `--json` and `-y` only. The flags, `evaluateExpectations` and the
remedy steps are in `src/cli/commands/check.ts`; the code is in `src/types/errors.ts` and `CODE_MEANINGS`
(`src/cli/docs/cliReference.ts`). Tests: `test/cli/checkExpectations.test.ts`, `test/cli/commands/check.test.ts`, and
the surface suites (`test/types/errors.test.ts`, `test/cli/docs/cliReference.test.ts`,
`test/resilience/failureClass.test.ts`, `test/docsPages.test.ts`). The reusable check action that would run these flags
from a trusted workflow is not built.

Amended 2026-10-14 (plan 020 file 1, units `d6-verb` and `d7-engine`; cited at `d590a266`). `evaluateExpectations`
reads two expectations, the version and the client set (`src/cli/commands/check.ts:2288-2325`), so `expectations`
carries no `mode`, and `--expect-mode` is an option `check` does not know. The verb that set the install mode leaves
too: `stamity plugin <subcommand>` exits 2 as an unknown command whose error names `stamity --help`, `--help` lists
nine verbs and thirteen are registered (`src/cli.ts`), and `EngineRegistry` has no `plugins` group
(`src/composition/root.ts`). `docs/cli-reference.md` is regenerated from the flags.

- GIVEN `stamity plugin status` or `stamity plugin setup` THEN it exits 2 with `unknown command 'plugin'` and names
  `stamity --help`; GIVEN the surface THEN nine verbs are advertised and thirteen registered
  (`test/cli/surface.e2e.test.ts`, "exits 2 on the removed verb … as an unknown command, pointing at --help"; added
  2026-10-14).

### REQ-FLOW-061 — A change gets the checks its class needs

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p1a-classifier-verb`,
`p1c-classify-git-reads`, `p1d-classify-security-row`, `p2a-class-file` and `p5f-class-file-gate-config`, lane A's
fix rounds and the p5 group's fix round 2; every `path:line` below reads at `f3315229`.

`stamity gate classify` names one class for a change, the checks that class runs and the lenses it needs. It is the
CLI's fourth hidden plumbing verb, beside `learn`, `handoff` and `ledger`, because its caller is the session running
`/st-quick` or `/st-work` (`src/cli/commands/gate.ts:39-44`, `:1499-1526`). The seven classes, strongest first, are
`security-sensitive`, `public-contract`, `product`, `config`, `tests`, `docs` and `records`
(`src/change/classify.ts:96-115`). Each path takes the strongest class any rule gives it, a path no rule places is
`product`, and the change takes its strongest path's class (`:5-11`, `:1133-1138`). Each class's checks
(`CLASS_CHECKS`, `:128-141`): `records` the secret scan and the selected tests; `docs` those and one review pass
(`review-once`); `tests` those plus lint, typecheck and the review loop; `config` and every stronger class the scan,
the full gates (`gates-all`) and the review loop. A `security-sensitive` class names the security lens first
(`:1147-1151`).

- **The built-in rules are generic.** `.stamity/runs/**`, `.stamity/inbox.md` and `.stamity/handoffs/**` are
  `records`; `docs/**` and top-level `*.md` are `docs`; an agent instruction file (`AGENTS.md`, `AGENTS.override.md`,
  `CLAUDE.md` or `CLAUDE.local.md`, at any depth, matched without case) is at least `product`; the class file itself,
  `.stamity/manifest.json` and `.stamity/overrides/**` are `security-sensitive`, matched without case
  (`src/change/classify.ts:612-653`). The delta placed the class file in `config`; it landed `security-sensitive`,
  because it decides every later change's checks (`review/49`).
- **The floors.** No rule, built-in or the class file's, places a code file (`CODE_EXTENSIONS`, `:152-164`), an
  extensionless file other than `LICENSE`, `NOTICE`, `AUTHORS`, `CHANGELOG`, `COPYING` or `README` (a dotfile counts as
  extensionless), or a config-format file (`.json`, `.jsonc`, `.yml`, `.yaml`, `.toml`, `.ini`, `.cfg`, `.conf`,
  `.xml`, `.properties`, the `.env` family) in `records` or `docs`; a config file under the engine's own record paths
  stays `records`. A rule places a code file in `tests` only under a built-in test glob. A held-out file is `tests`
  under a built-in test glob, else takes its next placement, else is `product` (`:13-25`, `:655-669`, `:865-913`;
  `review/47`, `review/55`).
- **A repository's own lists** live in `.stamity/change-classes.json` (`:521-522`), read only as the base commit's
  blob under the project's prefix, never the head's copy or the work tree's (`src/cli/commands/gate.ts:86-97`,
  `:954-976`). Its rules join the built-ins and only ever raise a path a built-in rule or the trigger roster's
  security row places; its `product`, `public-contract` and `security-sensitive` rules match without case
  (`src/change/classify.ts:1432-1437`, `:1682-1705`). `parseClassFile` refuses text that is not a JSON object, an
  unknown key or class, a glob that is not a non-empty string, a glob over 200 characters or holding more than four
  `**`, a glob matching every path for a class weaker than `product`, a `records` or `docs` glob whose extension holds
  a wildcard (`review/59`) or whose last segment holds a wildcard and names no concrete extension (`review/70`), and
  a test entry that is not a plain repository-relative file path (`:1477-1593`, `:1630-1680`). A refused base copy
  gives at least `product` and applies only its raising entries that parse on their own; JSON that does not parse
  gives the built-ins alone (`src/cli/commands/gate.ts:978-992`, `:1246`; `review/48`). `check` adds a
  `change-classes` row only when the file exists, failing with the first error (`src/cli/commands/check.ts:354-395`).
  This repository's file places `content/**` in `product`, the tool configurations in `config`, `test/**` and
  `evals/**` in `tests`, the site's content and assets by extension in `docs`, and the engine's state readers,
  `src/hooks/**`, the classifier and gate code and `scripts/ci/**` in `security-sensitive`
  (`.stamity/change-classes.json:2-25`).
- **The injection-screening rule** names the class file beside the manifest as the two files under `.stamity/` that
  configure gates: the operator's to edit, the class file read only from the base commit, so no change sets its own
  checks (`content/rules/stamity-injection-screening.md:87-92`).
- **Where the paths come from.** `--paths <path>…` classifies listed paths by path rules alone, and without `--base`
  reads no git at all (`src/cli/commands/gate.ts:1204-1206`); a listed path is read with a backslash both as a
  separator and as a filename character, the stronger class kept (`src/change/classify.ts:918-951`; `review/20`).
  Without `--paths` the change is read from git: the tracked changes, staged and unstaged, against the base, renames
  as renames, and every untracked file. Git's names are read literally, except on win32, where they are read both
  ways (`src/cli/commands/gate.ts:50-61`, `:1231-1233`; `review/43`).
- **The base.** `--base <ref>` resolves once to a commit; a ref starting with `-` is refused with exit 2 before git
  runs (`:145-149`, `:159-167`). With no `--base`, each known path takes its built-in class, no class file is read,
  and the reason says no base was given (`src/change/classify.ts:1075-1077`); since that read sees only the uncommitted
  change, a `HEAD` holding commits its upstream lacks (with no upstream, commits no remote-tracking ref reaches, a
  dangling remote `HEAD` counting as such a ref) makes the class at least `product`, the reason naming the commits
  and pointing to `--base`, and a failed read of those refs does the same; a repository with no upstream and no
  remote-tracking ref keeps the plain reading (`src/cli/commands/gate.ts:1240`, `floorUnclassified`; `review/191`,
  `review/196`, `review/197`). A `--base` that does not resolve to a
  commit, an unborn `HEAD` among them, gives no class, with `--paths` as without: `classify` exits 1, and its JSON
  carries `ok: false`, `subcommand`, `base: null` and a `reason` saying the ref could not be read, with no `class`,
  `checks` or `lenses` (`src/cli/commands/gate.ts:1213-1217`, `:1278-1283`; `src/cli/kit/program.ts:353-363`). It gave
  `product` over zero paths, which the flows read as a class, so their no-class rules never fired (`review/182`). An
  empty path list or a rename whose two sides classify differently makes the class at least `product`
  (`src/change/classify.ts:1082-1094`).
- **The project root** is the nearest ancestor of the working directory, up to the git top-level, whose `.stamity/`
  is in the base commit's tree (`HEAD`'s with no base), else the top-level; every git read runs from it, so a
  `.stamity/` the change itself adds moves no boundary (`src/cli/commands/gate.ts:72-84`; `review/13`). A changed path
  outside the project is left out and raises the class to at least `product`, or to `security-sensitive` when the
  built-in security floor or the trigger roster's security row matches it (`:1093-1117`;
  `src/change/classify.ts:802-829`; `review/21`). A name that is not valid UTF-8, or one the report must sanitise,
  raises it to at least `product` (`src/cli/commands/gate.ts:1118-1124`, `:1136-1149`; `review/36`).
- **Fail-closed.** Every git call runs through the hardened runner. A git failure reading the change's paths — a
  directory outside a work tree, no git binary, a timeout, an oversized output — gives `product` with the failure
  named (`src/cli/commands/gate.ts:1263-1267`). Three reads fail closed their own way: a failed read of the changed
  lines makes the class `security-sensitive`, the lens reading what no line rule could (`:851-859`, `:1125-1128`;
  REQ-FLOW-065); a failed test-source read runs every test and keeps the class and lenses (`:1252-1259`;
  REQ-FLOW-062); and a failed read of a changed `package-lock.json`'s base copy keeps the security lens, the reason
  naming the failure (`:1153-1161`; `src/change/classify.ts:1366`). A base that does not resolve gives no class, as
  above. Glob matching costs at most the glob's steps times the path's length, whatever its wildcards
  (`src/change/classify.ts:734-785`; `review/50`).
- **Output.** A terminal summary and one JSON document carrying `subcommand`, `base`, `paths`, `class`, `checks`,
  `lenses`, `reason`, `byPath` and `tests`, every path and rule sanitised (`src/cli/commands/gate.ts:1284-1319`).
  `classify` exits 0 for every class it names and 1 when it names none; an unknown subcommand or option exits 2
  (`:1278-1283`, `:1301-1302`, `:1505-1526`).
- **Expand/contract:** an added hidden verb and an optional file. A repository with no class file gets the built-in
  rules, and `check` prints no new row (`src/cli/commands/check.ts:354-363`). Rollback is a re-sync at the prior
  version. The consumers are `/st-quick`, `/st-work` and `/st-plan` (REQ-FLOW-063, REQ-FLOW-065, REQ-FLOW-067) and
  `scripts/ci/records-only.mjs` (REQ-PROVE-031). The exit 1 with no class for a base that does not resolve
  (`review/182`) changed the verb's output inside the run, before any release; the three flows read it as no class,
  and `scripts/ci/records-only.mjs` loads the classifier module, not the verb (REQ-PROVE-031).
- **Proof:** `test/change/classify.test.ts`, `test/cli/commands/gate.test.ts`, `test/cli/commands/check.test.ts`,
  `test/cli/surface.e2e.test.ts`, `test/architecture/boundaries.test.ts`, `test/corpus/rules/security.test.ts`; QA.

### REQ-FLOW-062 — Tests that read files are declared

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p2b-test-inputs`,
`p2d-test-input-census` and `p2c-ci-lanes-from-map` and lane A's fix rounds 7 to 10.

The class file's `testInputs` map lists globs over changed paths and the tests each selects, or `"all"`. It is read
from the base commit's copy only, and only a valid copy gives one (`src/cli/commands/gate.ts:1248-1261`).
`gate classify` adds a `tests` result, `{full, files, reason}` (`:1286`, `:1295`, `:1316`). Selection, in order
(`src/change/testInputs.ts:173-239`):

- a `config` or stronger change runs every test (`review/60`);
- a changed helper or fixture under a built-in test glob runs every test;
- no map, or an empty one, runs every test;
- otherwise the union of the map entries whose glob matches a changed path (an `"all"` entry runs every test), the
  tests whose source names a changed path, which only adds, and the changed test files;
- zero selected stays zero for `records` and `docs`, and runs every test for `tests`;
- a selected name that fails the map entries' argument check runs every test, naming it (`review/61`).

A test's reads are taken from its own text: each string literal naming a tracked non-code file, and each glob
literal's tracked non-code matches; a glob literal over the class file's cost bound makes every test run
(`src/change/testInputs.ts:1-29`, `:133-159`; `src/cli/commands/gate.ts:1009-1048`). A failed test-source read runs
every test and keeps the class and lenses (`:1252-1259`; `review/63`), and a selected file the work tree lacks runs
every test (`:1050-1058`).

- **This repository's map** gives `content/**` and `evals/**` every test, each CI lane path its lane's suites and the
  guard, a top-level `*.md` entry the suites that read those pages, and `test/**` the guard and the whole-tree
  scanners (`.stamity/change-classes.json:26-234`). Test data shaped like a glob or a repository path is built at
  run time from fragments, so it reads as no declared read (ledger `build/43`, `build/44`, `review/76`, `review/78`).
- **The guard,** `test/ci/testInputsGuard.test.ts`, fails for a (test, path) pair a weaker class places or a map entry
  covers that no entry for the path lists; the records and docs entries carry it (`review/81`).
- **Expand/contract:** additive. A base with no map runs every test, the full set the flows ran before. Rollback is a
  re-sync at the prior version.
- **Proof:** `test/change/testInputs.test.ts`, `test/ci/testInputsGuard.test.ts`, `test/cli/commands/gate.test.ts`,
  `test/ci/recordsOnly.test.ts`.

### REQ-FLOW-063 — The gates follow the class

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p3a-charter-invariant-4`,
`p3b-quick-gates` and `p3c-work-gates`, the p3 fix rounds and the p5 group's fix round 2.

Gates run on every batch, a one-line typo fix included (`content/commands/st-quick.md:150`). `/st-quick` gates the
batch in three steps after the last item lands: the secret scan, `stamity gate classify --base HEAD --json`, then the
class's checks in a `test-runner` spawn (`:155-184`). `/st-work`'s Prove pass scans with the run's base, then runs
`stamity gate classify --base <the run's base> --json`; the class's checks run on the selected files in the build and
its gates on the final tree, as the test-runner maps them (`content/commands/st-work.md:188-200`). The run's base is
the record head's `Base:` line (REQ-CTX-012).

- **The mapping** is the test-runner's: `tests-selected` runs the test gate with the selected files appended, the
  whole suite when the selection reads `full`, and no row when it names none; `lint` and `typecheck` run their gates;
  `gates-all`, an `unclear` class, or a test command that takes no file list runs `all`. On the final tree a `product`
  or stronger class runs `all` (`content/agents/stamity-test-runner.md:33-39`). `/st-quick` spells the same mapping
  and honours `tests.full`; a `docs` class with zero selected tests runs the scan alone and names the class
  (`content/commands/st-quick.md:174-184`; `review/109`).
- **The condition.** Both flows state that the narrower gates rest on one condition: the repository's CI runs the
  full matrix on every `product` or stronger change and on a schedule (`content/commands/st-work.md:194-196`;
  `content/commands/st-quick.md:186-188`). Where the charter's `CI provider` reads `unknown`, the final tree runs
  `all` whatever the class (`content/commands/st-quick.md:187-188`; `content/agents/stamity-test-runner.md:37-39`).
- **When no class can be read.** A `/st-work` run with no base scans against `HEAD` and runs
  `${STAMITY:VERIFY_GATE_ALL}` on the final tree unclassified (`unclear`). Such a scan reads no committed work, so a
  run with committed work lists `secret scan: not run` under `Not done:`, and one whose work is all uncommitted is
  scanned whole and lists nothing for it (`content/commands/st-work.md:196-198`; `src/cli/commands/gate.ts:1461`). In
  either flow a CLI that cannot run or has no `gate` verb, and a scan naming a `reason`, take the full gates and list
  `secret scan: not run` (`content/commands/st-work.md:198-199`; `content/commands/st-quick.md:152-153`,
  `:162-164`). A `/st-quick` scan naming a `reason` still runs step 2's classify (`:162-164`; `review/113`). A
  `gate classify` that exits 1 names no class (REQ-FLOW-061): `/st-quick` then moves a batch that touches a path the
  security agent's `## Trigger` table names to `/st-work`, as for a `security-sensitive` class, and keeps any other
  batch, a docs-only one among them (`:169-173`; `review/179`; REQ-FLOW-065). `/st-work` runs
  `${STAMITY:VERIFY_GATE_ALL}` on the final tree unclassified (`unclear`), as it does with no base
  (`content/commands/st-work.md:196-197`; `review/190`).
- **One review pass.** A class whose checks name `review-once` gets one review pass: a Critical or Warning it raises
  is fixed and closure-reviewed once, and no further round runs (`content/commands/st-work.md:199-200`).
- **The charter.** Invariant 4 reads "Done means the gates `gate classify` names exit 0 (all if it did not run)", the
  `Not done:` line unchanged, and the verification-gates intro says invariant 4 says which of them
  (`content/charter/stamity-charter.md:30`, `:53-54`). The delta's wording, "the gates the change's class names exit
  0 (all, if unclear)", landed tied to the CLI instead, so a class a session assigns itself never narrows the gates
  (`review/111`). Invariants 1.2.0, amended 2026-10-09 (`:8`, `:10`).
- **Expand/contract:** invariants 1.2.0 is a MINOR step: a repository that never re-syncs keeps the old invariant 4
  and runs every gate, a superset of the class's. Rollback is a re-sync at the prior version. The charter's pins moved
  with the text (`test/content/charter.test.ts`, `test/content/invariantsVersion.test.ts`).
- **Amended 2026-10-10** (run `2026-10-10_next-tier`, unit `q6t-test-runner-ci-line`, with its fix round for
  `review/14`): the test-runner reads the CI provider from its own body, where the engine renders it as one of its
  substitution tokens, so a client whose sub-agents load no charter still applies the rule: "This repository's CI
  provider is ${STAMITY:CI_PROVIDER}; where that reads `unknown` or is still an unresolved `STAMITY` substitution
  token, the final tree runs `all` whatever the class" (`content/agents/stamity-test-runner.md:37-39`;
  `src/emit/substitution.ts:102-113`). The unresolved-token clause is as built, beyond the delta: a copy that ships
  the token raw runs every gate on the final tree (route clause dropped 1.15.0: "as the APM package's bodies do
  (REQ-FLOW-002)"; no route ships a raw copy since then, and the clause stays as the fail-closed reading). `/st-quick` still
  names the charter's line, which its own session loads (`content/commands/st-quick.md:187-188`). A `red` verdict
  writes nothing to the named report path and is returned in full, rows and excerpts
  (`content/agents/stamity-test-runner.md:144-145`).
- **Amended 2026-10-15** (plan 020 file 3, units `f2-protocol-charter` and `f3-work-close`). "A scan naming a `reason`
  takes the full gates" holds except for a `reason` naming a refused folder, which stops the run or the batch
  (REQ-PLUGIN-046, amended 2026-10-15); `/st-work`'s sentence now reads "as do a CLI that cannot run or lacks `gate` and
  a scan's `reason`, both on the full gates" (`content/commands/st-work.md:197-200`). Invariant 4's words are unchanged;
  the charter's invariants are at 1.3.0 since invariants 2 and 5 moved (REQ-FLOW-080, REQ-FLOW-088;
  `content/charter/stamity-charter.md:8`, `:10`), so the last criterion below reads `invariants_version` `1.3.0`.
- **Proof:** `test/corpus/commands/work.test.ts`, `test/corpus/commands/lightTrio.test.ts`,
  `test/corpus/agents/quality.test.ts`, `test/corpus/cliCallForm.test.ts`, `test/content/charter.test.ts`,
  `test/content/invariantsVersion.test.ts`; QA.

### REQ-FLOW-064 — Review rounds stop when they stop paying

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p4a-review-cap`,
`p4b-fixer-escalation` and `p4c-confidence-no-round` and the p4 fix round.

- **The cap.** Three rounds by default (two at light), operator-configurable within 1..10, the engine clamping to that
  band (`content/commands/st-work.md:216-217`; `DEFAULT_MAX_REVIEW_ITERATIONS`, `src/roster/reviewCaps.ts:20`). The
  light cap is prose: a review-gate hook that cannot see the tier may hold a light run to the engine cap, so a light
  run there can see a third round (`content/commands/st-work.md:453-454`, in the Intensity paragraph since 2026-10-10,
  where the command states the hold and no longer spells out the third round; `review/25`).
- **One closure re-review per fix.** Critical and Warning findings route to a fixer, and the fix re-enters review as a
  fresh reviewer spawn on the fix delta (`:209-211`, `:233-240`). Minor findings never trigger a round, and a note
  with no consequence is not a finding (`:231-232`).
- **Escalation, on what the run shows.** A finding whose ledger row carries two `re-review not-fixed` notes, a gate red
  after a fix, or a finding still open entering the cap round goes to a fresh fixer spawn, never the resumed one, with
  the round history attached, on the same model at one effort level above the fixer's declared one where the
  client's dispatch accepts an effort setting; where it accepts none, the fresh spawn is the escalation and the proof
  block records `effort: not settable`. A finding that fixer leaves open stops the run as `BLOCKED_FAILURE` to the
  person; no round past the cap runs (`:218-227`; `content/agents/stamity-fixer.md:72-91`). The delta's third trigger
  read "a finding still open at the cap round"; it landed "entering the cap round", so the escalation fixer takes the
  cap round's fix and the cap round's review is its closure re-review (`review/29`, `review/41`).
- **The proof block's review line** names an approval below the gate and each escalation's effort step or
  `effort: not settable` (`content/commands/st-work.md:316-317`).
- **Expand/contract:** the default moves from 4 to 3; a cap an operator configured within 1..10 still applies. The
  generated review-gate hook reads the engine cap (`.stamity/generated/hooks/claude/stamity-review-gate.mjs:52`).
  Since plan 021 file 2's `w6-claude-hooks-in-claude-dir`, Claude Code's hook entry runs the copy
  `.claude/hooks/stamity/stamity-review-gate.mjs`, which reads the same cap; the generated copy is still written and
  no hook entry runs it. Rollback is a re-sync at the prior version.
- **Proof:** `test/roster/roster.test.ts`, `test/roster/modelLadder.test.ts`, `test/corpus/invariants.test.ts`
  (invariant 16), `test/corpus/commands/work.test.ts`, `test/corpus/agents/spine.test.ts`; QA.

### REQ-FLOW-065 — The security lens fires by a tested class list

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p1d-classify-security-row`,
`p5a-security-classifier`, `p5g-audit-first`, `p5b-security-trigger-rows` and `p5c-security-in-the-flow` and their fix
rounds.

- **The path rows** live in one list, the trigger roster's security row, which the classifier reads: a path it
  matches is `security-sensitive` whatever the class file says (`src/roster/triggers.ts:99-179`;
  `src/change/classify.ts:41-50`, `:890-893`). The run added the install-steering files (`.npmrc`, `.yarnrc`,
  `.yarnrc.yml`, `.pnpmfile.cjs`, `npm-shrinkwrap.json`; `review/159`), CI workflows and composite actions
  (`.github/workflows/`, `.github/actions/`, `action.yml`, `action.yaml`; `review/164`), shell and PowerShell scripts,
  container builds (`dockerfile`, `dockerfile.*`, `*.dockerfile`, `containerfile`, `containerfile.*`,
  `*.containerfile`; `review/169`, `review/198`), the client hook folders and settings named inside the client
  configuration folders (`.claude/hooks/`, `.cursor/hooks/`, `.codex/hooks/`, `.github/hooks/`, `.stamity/hooks/`,
  `.stamity/generated/hooks/`, `.husky/`, `hooks.json`, `.claude/settings.json`, `settings.local.json`,
  `.vscode/settings.json`; `build/63`), the manifest's hooks directory at `.config/stamity/hooks/` (`review/181`),
  Codex's `.codex/config.toml`, where its MCP servers are written (`review/180`), and the MCP server files
  (`.mcp.json`, `mcp.json`) (`src/roster/triggers.ts:119-153`). A bare `hooks/` segment is no row, so front-end hooks
  stay out; a repository whose own hook code is security-relevant places it through its class file, as this one places
  `src/hooks/**`. A top-level `hooks/` folder, the manifest's third documented hooks directory, is no row either,
  since no pattern form anchors a segment to the root, so a repository using it places it through its class file too
  (`:82-98`; `.stamity/change-classes.json:11`; `review/181`). Two pattern forms were added, a basename inside a named
  folder and a basename prefix (`src/roster/triggers.ts:49-60`, `:289-302`).
- **The Trigger table** of the security agent states the rows, adds "CI and release" and "Client hooks and settings",
  and says the classifier also places a change there by a changed code line (`content/agents/stamity-security.md:30-41`);
  a parity test holds table and row in both directions.
- **Topic words** gain `workflow`, `release`, `hook`, `shell`, `file deletion` and `network call`
  (`src/roster/triggers.ts:170-175`), and they may add a lens and never remove one
  (`content/commands/st-work.md:246-247`).
- **The line rules** are four call-shape families — `process-spawn`, `delete-or-overwrite`, `network-or-registry`,
  `secret-name` — each word-bounded with its opening parenthesis; `secret-name` counts only where a name is assigned,
  or keyed to, a string literal or an environment value, never a literal that is wholly one `${…}` placeholder
  (`src/change/classify.ts:175-224`). They read JavaScript, TypeScript and Python files, by extension or by a
  first-line shebang, outside the built-in test globs; a code file of another language is named in the reason as
  read by no line rule (`:226-236`, `:520-547`; `review/85`). Names a file binds to the spawning, network and
  filesystem modules and members, by import or assignment, are collected from its first 64 KiB and its hunk lines
  (`:251-252`, `:359-393`; `review/124`, `review/145`, `review/175`, `review/199`). Added and removed lines count,
  context lines only in a hunk that also removes one, and a hit names the rule and where, never the text (`:567-596`).
  A line longer than 262,144 characters (`256 * 1024`, counted as string length, not bytes; `:249`) is not read and
  makes the class `security-sensitive`, and so does a code file the read could not show (`:1095-1119`; `review/123`,
  `review/125`, `review/138`, `review/200`) and a failed line read (`src/cli/commands/gate.ts:1195-1198`;
  `review/87`).
- **The change read** unites the work tree's and the index's patch against the base (`review/89`) with every flag a
  configuration could turn pinned (`-U3`, `-W`, `--text`, no external diff, colour or textconv, fixed prefixes), names
  each section from the `-z` name list, reads every untracked file whole, leaves binaries out by a numstat pre-read,
  and lets a NUL in a file's first 8,000 bytes alone decide binary (`:99-111`).
- **In the flow.** The `security` lens runs at every tier when `gate classify` names the class `security-sensitive`,
  and on a trigger-path match; with no class from `gate classify` (no `Base:`, no CLI or `gate` verb) or a `reason`
  naming a failed read, it runs at every tier as for `security-sensitive` (`content/commands/st-work.md:248-251`;
  `review/162`). Both shapes of a classify carry such a reason: one that exits 1 with no class (REQ-FLOW-061), and
  one that exits 0 with `product` because a git read failed, its reason reading "the change could not be read
  (<cause>), so the class is product" (`src/cli/commands/gate.ts:1335`, re-pointed 2026-10-16 to `4daeb214` from
  `:1265`, which later rounds had moved; `review/194`, `review/195`). `## Dials`' light and standard rows
  state the same rule in their own cells, and that a lockfile's own trigger-path match waits for the audit's flag
  when the checks name `dependency-audit` (`content/commands/st-work.md:442-443`; `review/177`). In `/st-quick`, a
  `security-sensitive` class fires the `Security-sensitive surface` row: the whole batch moves to `/st-work` as it
  stands, nothing reverted, every applied item reported ungated, and no lens runs inside the quick lane (`content/commands/st-quick.md:165-169`;
  `review/116`). With no class — neither CLI form runs, the classify exits non-zero, or its `reason` names a failed
  read — a batch with a path the security agent's `## Trigger` table names moves the same way, and a batch whose
  paths that table does not name, a docs-only one among them, stays (`:169-173`; `review/179`, `review/189`). The
  lens reads `git log <range>` only after its findings are formed (`content/agents/stamity-security.md:179-180`).
- **Audit first.** When every path the rules placed `security-sensitive` is a `package-lock.json` and no
  `package.json` changed, the checks gain `dependency-audit` and the lens leaves, the class staying
  `security-sensitive` and the reason reading `lockfile-only bump: dependency audit first`, only when each lockfile
  proves the bump (`src/change/classify.ts:67-76`, `:1140-1145`, `:1162-1408`): its base and head copies parse at
  `lockfileVersion` 2 or 3; the index copy equals the work tree's byte for byte (`review/155`;
  `src/cli/commands/gate.ts:1151-1193`); and every `packages` entry, and every legacy `dependencies` entry
  (`review/158`), that differs between the copies carries no install script and no `link`, has a base twin (a package
  new to the graph refuses, a removal does not; `review/163`), resolves over `https` with no credentials from its base
  twin's origin, moves no `resolved` or `integrity` at an unchanged version, resolves the registry tarball of its
  own name at its head version under its base twin's path (`review/157`, `review/171`), and moves its version, if at
  all, only to a higher semver version: a lower version, a release to its own prerelease, build metadata alone, or a
  version on either side that is no semver version refuses (`src/change/classify.ts:1262-1307`, `:1344-1345`;
  `review/183`). Any other format, a missing or unread base copy, a parse failure, a raise by an unread line or an
  unscanned code file keeps the lens, the reason saying why, and a later raise puts it back
  (`src/change/classify.ts:1366`, `:1410-1428`; `src/cli/commands/gate.ts:1073-1083`).
  `/st-work` then runs the audit first and the lens only if the audit flags something; the lockfiles' own
  trigger-path match waits for that flag (`content/commands/st-work.md:252-255`; `review/168`). The audit reads every
  changed lockfile the class's `byPath` names, nested ones included, and its flag counts only the entries the bump
  adds or changes: an advisory at any severity, a licence flag, or an update-risk class other than `patch` or `minor`,
  for the bump's own version move or on the entry itself, so a `major` move flags and so does a changed entry whose
  own class is `major`, `pinned-back` or `unmaintained`; in this role the report's Risk row states both classes of
  each such entry, the move's and the entry's own; a standing condition on an entry the bump leaves alone is reported
  and does not flag; a `partial` run, an audit that cannot run, or a changed entry the audit cannot class counts as a
  flag. An entry is the bump's own when it differs from the run's base, the `Base:` commit `gate classify` read, never
  from `HEAD` or the work tree, since the units commit as they go; a base the audit cannot read makes the run
  `partial` (`content/skills/st-dep-audit/SKILL.md:121-140`; `review/160`, `review/166`, `review/178`). Amended
  2026-10-10 (run `2026-10-10_next-tier`, unit `q11c-dep-audit-writer` and its fix round; that run's ledger
  `build/39`, `review/63`, `review/64` and `review/68`): the flag read "an update-risk class other than `patch` or
  `minor` for the bump's own version move", and "a `partial` run or an audit that cannot run counts as a flag", cited
  at `:113-128`.
- **State read back as authority** is placed by path: the built-in floor holds the engine's own state and the class
  file, and each repository's class file names the code that reads state back, here `src/merge/**`,
  `src/manifest/**`, `src/runs/ledgerStore.ts` and `src/cli/engine/gitStatus.ts` (`src/change/classify.ts:640-653`;
  `.stamity/change-classes.json:3-12`).
- **Proof:** `test/change/classify.test.ts`, `test/cli/commands/gate.test.ts`, `test/roster/roster.test.ts`,
  `test/corpus/agents/specialists.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`; QA.

### REQ-FLOW-066 — Every change gets a secret scan of its added lines

From the spec delta of run `2026-10-08_product-core`, as landed by the unit `p5e-secret-scan` and lane A's and
lane C's fix rounds.

`stamity gate scan [--base <ref>]` reads the change's added lines from the project root by the read `classify` uses,
plus the lines only the scan reads: files outside the project, named from the root with `../` first, and UTF-16 files,
decoded (`src/cli/commands/gate.ts:125-143`, `:1396-1456`; `review/96`, `review/98`). With no base it reads the
uncommitted change against `HEAD` and says so (`base: null`, `scope: "uncommitted"`); with one it reads everything
since the base (`scope: "since-base"`) and the added lines of every commit since it, merges left out, so a value
committed and removed again still stops the run, and such a hit names its commit (`:1321-1322`, `:1349-1394`;
`review/112`).

- **The patterns** are the shipped `scanValueForSecrets` ones, unchanged; each added line is first taken apart into
  name and value pairs (`src/change/scan.ts:3-51`). A value that is exactly one subresource-integrity hash, yarn v1's
  `integrity` line, a `go.sum` `h1:` digest and NuGet's `contentHash` are content digests and are not read as
  credentials (`:53-64`; `review/99`, `review/134`). A `${…}` or `{{ … }}` placeholder, a value made wholly of a mask,
  and in a shell file, a Dockerfile or a `.env` file a `$` expansion, are no literal; a name that is a file path gives
  its value no credential context; a comparison is no assignment (`:22-51`; `review/126`, `review/136`, `review/140`,
  `review/143`).
- **A hit** names path, line and rule, and its commit when it came from the history, never the value; the scan has no
  allow-list and no waiver (`:75-77`; `src/cli/commands/gate.ts:1473-1477`). A hit exits 1. A change the scan could
  not read exits 1 with `ok: false` and the reason in place of hits. An added line longer than the hard cap of 262,144
  characters (`256 * 1024`, counted as string length, not bytes; `src/change/scan.ts:112`) is not read, so the run
  exits 1 with a `reason` naming it beside its hits, never clean (`src/cli/commands/gate.ts:1435-1443`, `:1458-1496`;
  `review/135`). A code file the read could not show is listed in `unscanned`, every other file left unread in
  `skipped`; the exit stays 0 for either, and the flows read the lists (`:138-141`).
- **In the flows.** Both run the scan first. A hit stops the batch or the pass, naming path, line and rule, and is
  never cleared by rewriting the value and scanning again; a hit on a deliberate fixture is the person's to settle. A
  non-empty `unscanned` list puts `secret scan: <n> files unscanned` under `Not done:`, naming the paths. A scan that
  names a `reason` did not read the whole change: a hit beside it still stops, and with none the full gates run and
  `secret scan: not run` is listed (`content/commands/st-quick.md:157-164`; `content/commands/st-work.md:188-192`,
  `:198-199`). A CLI that cannot run takes the full gates and lists `secret scan: not run`
  (`content/commands/st-quick.md:153`; `content/commands/st-work.md:198`). A `/st-work` run with no base scans against
  `HEAD`, which reads no committed work, so it lists `secret scan: not run` only when it has committed work
  (`content/commands/st-work.md:196-198`; REQ-FLOW-063).
- **Proof:** `test/change/scan.test.ts`, `test/cli/commands/gate.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`.

### REQ-FLOW-067 — A plan unit in a risk class carries a threat note

From the spec delta of run `2026-10-08_product-core`, as landed by the unit `p5d-threat-note` and the p5 group's fix
round.

`/st-plan`'s unit table gains a conditional `threat` row: for a unit whose files
`stamity gate classify --base HEAD --paths <its files>` places `security-sensitive`, its trust boundary, what it
trusts, one abuse case and the check that stops it, in at most five lines; absent otherwise
(`content/commands/st-plan.md:357`). The table is followed by the shared "Running the CLI." paragraph, whose fallback
reads that when neither form runs, the installed copy has no `gate` verb, or a classify's `reason` names a failed
read, no unit's class can be read, so every unit carries the `threat` row (`:359-360`). The delta's fallback named
only a CLI that cannot run; it was widened (`review/165`, `review/167`). A classify whose base does not resolve, an
unborn `HEAD` among them, exits 1 with such a `reason` (`src/cli/commands/gate.ts:1215-1217`; REQ-FLOW-061), so
there too every unit carries the row.

- **Proof:** `test/corpus/commands/plan.test.ts`, `test/corpus/cliCallForm.test.ts`.

### REQ-FLOW-072 — A finding names its consequence

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p8b-capture-reviewer` to
`p8f-capture-work-digest` and the p8 fix rounds.

- **The test.** For the reviewer, a finding names who or what is affected, how and in which use, with its evidence; a
  note with no consequence (wording, naming, style, comment drift, a tidier shape, a "might" with no trigger) is not a
  finding, and the report lists it and the digest counts it; a note whose consequence shows once looked at is a
  finding at the severity that consequence sets (`content/agents/stamity-reviewer.md:26-31`, `:141-142`; `review/52`).
  The implementer and the fixer carry the same test (`content/agents/stamity-implementer.md:100-104`;
  `content/agents/stamity-fixer.md:114-119`).
- **The lenses** apply their Exclusions first, then the same test; a note with a security consequence is a finding
  carried on `security:` in full, never a note left out (`content/agents/stamity-security.md:126-131`;
  `content/agents/stamity-performance.md:145-151`; `content/agents/stamity-design-quality.md:119-125`).
- **What each role does with a note.** The implementer applies a note whose fix is one line in its own unit's files and
  counts a larger one, never as a deferral, and a deferral is a finding it leaves open with its consequence
  (`content/agents/stamity-implementer.md:36-40`, `:105-107`). The fixer records notes and never applies them, and a
  reviewer's notes are never handed to it (`content/agents/stamity-fixer.md:114-119`).
- **Pre-existing defects** are recorded by the reviewer, the implementer and the fixer only when they pass the test,
  their `summary` leading `pre-existing:` (`content/agents/stamity-reviewer.md:30-31`;
  `content/agents/stamity-implementer.md:90-92`; `content/agents/stamity-fixer.md:105-108`).
- **The count.** The `findings:` digest line of the reviewer, each lens, the implementer and the fixer ends
  `notes left out: <n>`, and an inline result carries the count, never the notes (REQ-CTX-002;
  `content/commands/st-work.md:170-172`).
- **`/st-rework`.** A person's own nit, polish or cosmetic feedback is a Minor finding, never a note: their ask is its
  consequence (`content/commands/st-rework.md:110-114`; `review/72`). A leftover-scan hit with no named consequence
  is a note, listed under the phase-4 table and counted, never routed; the proof block counts notes beside the
  findings (`:125-126`, `:159-161`, `:274-277`).
- **The findings grammar** — one JSON object per line, `id`, `severity`, `locator`, a `summary` of at most 300
  characters, and where true `decision_needed` and `security` — is spelled in the implementer's, the fixer's and the
  spec-author's return contracts (`content/agents/stamity-implementer.md:118-122`;
  `content/agents/stamity-fixer.md:127-131`; `content/agents/stamity-spec-author.md:178-182`).
- **Proof:** `test/corpus/agents/severityScale.test.ts`, `test/corpus/agents/executionReturns.test.ts`,
  `test/corpus/commands/work.test.ts`, `test/corpus/commands/feedbackPair.test.ts`.

### REQ-FLOW-073 — One severity scale in every role that raises findings

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p8a-severity-scale` and
`p8d-capture-perf-design-lenses`.

The reviewer, the security, performance and design-quality lenses, the implementer and the fixer each end on the same
`## Severity` section: Critical, a defect that breaks a supported use, loses data or opens a security hole on the
change's path; Warning, wrong or missing behaviour a user or maintainer meets in a supported use, or a change that
makes an existing instance worse; Minor, a true defect with a small, named consequence; each with one example; then
"A note with no consequence is not a finding; no findings is a good result."
(`content/agents/stamity-reviewer.md:217-228`; `content/agents/stamity-security.md:182-193`;
`content/agents/stamity-performance.md:200-211`; `content/agents/stamity-design-quality.md:175-186`;
`content/agents/stamity-implementer.md:147-158`; `content/agents/stamity-fixer.md:158-169`). One test holds the six
sections byte-identical. `/st-rework`'s severity vocabulary reads the same three definitions
(`content/commands/st-rework.md:20-22`).

- **Precedence** (`review/53`): where the shared scale reads otherwise, the performance lens's budget rule decides its
  levels — `Critical` only on a breached declared budget, and with no declared budget over the surface the strongest
  finding is a `Warning` — as `/st-work`'s Specialist pass states (`content/agents/stamity-performance.md:122-126`;
  `content/commands/st-work.md:271-272`). The reviewer's own Critical rows stay (`content/agents/stamity-reviewer.md:51-55`).
- **Proof:** `test/corpus/agents/severityScale.test.ts`.

### REQ-FLOW-068 — `/st-work` reads the inbox rows that match its change

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q1a-inbox-store`, `q1b-records-gate-parser`,
`q9b-inbox-schedule-grammar` and `q1t-frame-inbox-read` and their fix rounds. Every `path:line` in REQ-FLOW-068 to
REQ-FLOW-077 reads at `a60cb496`, but for the three `content/commands/st-plan.md` ranges the lead's follow-up pass
re-pointed to `9a0ba4cf` (REQ-FLOW-070's return line; REQ-FLOW-077's `/st-plan` bullet). The ranges of
`content/commands/st-board.md`, `content/commands/st-rework.md` and `content/skills/st-qa/SKILL.md` that the
whole-branch review's fix round moved, and the `content/commands/st-work.md` ones inside lines 24 to 30, read at
`5cd61743`. The ranges of `src/cli/commands/ledger.ts` that reach past its line 896 and of `src/runs/inboxStore.ts`
that reach past its line 296, here and under `## Risks` and `## Concerns`, read at `cb73f8f1`: the fix batch for the
pull request's review bot (`review/105` to `review/107`) moved them, and each was re-pointed to the lines that hold
its text. The ranges of `content/commands/st-rework.md` that reach past its line 176 read at `278af670`: the fix round
at the run's close (2026-10-11; `qa/5`, `review/101`) added one line at 177 to 179 and one at 205 to 206, and each
was re-pointed to the lines that hold its text.

Frame reads and surfaces the deferral inbox rows whose paths overlap the change's files through the `ledger` verb's
`inbox` query, which returns those rows, the rows it always shows, and its total and unmatched counts; from a bare
intent it queries again with the plan's files (`content/commands/st-work.md:21-23`).

- **The query.** `stamity ledger inbox` is the fourth subcommand of the hidden `ledger` verb, and it writes nothing
  (`src/cli/commands/ledger.ts:22-38`, `:1717-1722`, `:1750-1754`). A row matches by `--paths` when its location or
  one of its `files:` entries names a query path — the same path, a folder on either side, or a bare file name against
  a path's last segment — by `--plan` when its `Ref:` path or its location is the plan, by `--area` on a whole word
  when its location names no path, and by `--due [date]` when its `by:` day is on or before the day, the clock's UTC
  day when the flag carries none. A row tagged `critical-deferred` or `decision-waiting` matches every query, and a
  query with no filter matches every row (`src/runs/inboxStore.ts:49-50`, `:346-358`, `:376-401`, `:413-432`;
  `src/cli/commands/ledger.ts:906-922`).
- **The output.** A count line, `inbox: <total> rows · <matched> matched · <unmatched> unmatched · <unparsed>
  unparsed · <skipped> skipped`, ending `· <n> due by <day> · <n> triggers` under `--due`; one line per matched row,
  `<line> <severity> · <location> · <description>[ · <tag>] (<matched by>)`; then the unparsed lines and the skip
  lines. The JSON document carries `inbox`, `total`, `matched`, `counts`, `unmatched`, `problems`, `skipped`,
  `truncated`, `due` and `triggers`. An absent inbox prints `inbox: absent`, and every report exits 0 (`:1078-1086`,
  `:1156-1174`, `:1241-1277`).
- **The screen.** The inbox is user-tier state any writer can author, and these lines land in a run's context, so
  every bullet, parsed or not, is screened before anything of it prints: against the block-severity rows of the three
  catalogs the session-start screen composes, without that screen's network-vocabulary filter, so the exfil-signal
  rows stay in (`:744-758`). A line is read as written and as it prints, each beside its copy with invisible
  characters stripped and that copy's normalized form (`:785-817`); a parsed row's printed fields are then screened
  one by one, an unparsed line's message alone, and each matched row's line once more as composed (`:819-870`,
  `:1203-1209`, `:1219-1229`). A hit prints `skipped: <line> (<pattern id>)`, never the row's text nor its parse
  message. A bullet longer than 4,096 UTF-16 code units is skipped unscreened, as `over-length` (`:760-772`,
  `:1176-1183`). Every printed field passes `sanitizeLabel` (`:1050-1071`, `:1246-1249`). Amended 2026-10-12 (the
  review bot's pass on the `board-writes` pull request; S24, `pr/1`): the matched rows and the unparsed lines print
  one after another, the headings gone and the rows the filters left out with them, so two rows from different
  blocks, or kept apart in the file only by a row the query leaves out, print adjacent. That sequence is now screened
  as it prints, in windows of adjacent lines through the write side's window helper, and a hit withholds every line
  it spans: a row is not matched and an unparsed line not listed, and each prints its skip line instead, a clean one
  by the pattern the window hit, a withheld row by the pattern that withheld it, in the human output and the JSON
  alike; each withholding re-reads the lines around the seam it opens (`runInbox`, `inboxSequenceHits` and
  `screenPrintedLines` in `src/cli/commands/ledger.ts`). Before it each line was screened alone, so such a split
  printed.
- **Withheld rows.** A row the screen hits that still parses, and whose severity and location each pass the screen
  alone, is withheld rather than dropped. A copy holding its line, severity and location goes to the match, with its
  always-shown tag, its `by:` day and its `files:` entries where each passes the screen alone, so the row still
  matches by its location, its files, its day and that tag. Matched, it prints `<line> <severity> · <location> ·
  withheld by the screen (<pattern id>); read it by hand` in place of its skip line; its description, writer, `Ref:`,
  trigger, deferral date and rationale reach neither the match nor the output, and its JSON entry carries the pattern
  id under `withheld` with `description`, `source` and `ref` null (`:877-904`, `:1050-1076`, `:1190-1202`).
- **The caps.** The unparsed lines and the skip lines are listed up to 50 each, then one `unparsed: … +<n> more` or
  `skipped: … +<n> more` line. The count line keeps the whole numbers, and the JSON `problems` and `skipped` hold the
  first 50 of each, with the number left out of each under `truncated`. The matched rows are not capped (`:774-783`,
  `:1088-1095`, `:1266-1273`). Amended 2026-10-10 (the whole-branch review's fix round, its code part; `review/78`): the
  JSON `skipped` lists the bullets the skip lines name, up to 50, the rest counted under `truncated.skipped`; a withheld
  row the query matches has no skip line and is not among them, and stands under `matched` with its pattern id as
  `withheld`. Before it the list was cut to 50 with those rows still in it (`src/cli/commands/ledger.ts`, by file).
- **A refused read.** The query reads the inbox only as a regular file of at most 1,048,576 bytes inside the
  repository: each path segment is `lstat`ed top down, and the open takes `O_NOFOLLOW` where the platform has it. A
  symbolic link, a non-file or a larger file is refused as `VALIDATION_ERROR`, and the refusal's `next` says not to
  read the file whole in the query's place and to report the refusal as a finding (`:741-742`, `:927-1048`). Amended
  2026-10-10 (the fix batch for the pull request's review bot; `review/105`, `review/106`): a hard link is refused as
  a symbolic link is, and the ceiling is held by the read itself. A regular file with more than one link is a second
  name for bytes another name owns, and that name can sit outside the repository; the query refuses it before any
  byte is read, on the walk's `lstat` and again on the open descriptor's own stats, since a name made between the
  two shows only there. It reads the link count through the one predicate the write paths use
  (`src/merge/atomicWrite.ts:136-138`), and its message reads `ledger inbox refused .stamity/inbox.md: inbox.md is a
  hard link`. The two size checks before the read are fast refusals on a size taken earlier; the read takes
  1,048,577 bytes at most from the open descriptor and refuses when the last one is there, naming the size as `more
  than 1048576 bytes`, so a writer that grows the file after its size was read gains nothing, and an inbox of
  exactly 1,048,576 bytes is read. The refusal's `next` ends on the condition the query runs again under: a regular
  file with one link, of at most 1048576 bytes, inside the repository (`src/cli/commands/ledger.ts:927-1048`). Before
  it a hard-linked inbox was read as the repository's own, and the ceiling was checked only on the size taken before
  the read.
- **In Frame and at the close.** A row the query withholds or skips is listed as it prints, the person's to read, and
  Frame never opens the inbox for it. Frame reads the whole file, and says so, only when the CLI or that query is
  absent; any other failure — a refusal, a crash, a failing exit — is a finding naming it, never a whole-file read
  (`content/commands/st-work.md:24-27`). The close lists such a row the same way and never decides it (REQ-FLOW-074).
  `fill` and `/st-plan` read the inbox through the same query, and the close writes it through `ledger inbox-write`
  (`content/commands/st-board.md:454-457`; REQ-FLOW-078, REQ-FLOW-079; amended 2026-10-12, run
  `2026-10-12_board-writes`; it read "`fill` and `/st-plan` still read the inbox file whole").
- **Amended 2026-10-10** (the whole-branch review's fix round; `review/90`, `review/97`). The row the query cannot parse
  has a reader too: Frame's sentence reads "A row it withholds, skips or cannot parse is listed as it prints, the
  person's to read or fix; never open the inbox for it" (`content/commands/st-work.md:24-25`; its subject read "A row it
  withholds or skips"), and at the close an `unparsed: <line>: <message>` line is listed as it prints, the person's to
  fix as a skipped row is (`content/commands/st-board.md:452-454`). The never-open floor is Frame's alone, where the
  board's sentence read "`/st-work`'s Frame and close never open the inbox for such a row". Where the client's edit tool
  reads a file before it writes, the close's write to the inbox reads it whole: the text of a withheld or skipped row is
  data the close never acts on or repeats, and the row is still listed as it printed, with no disposition (`:417-421`
  at the base `41b1899a`; that text was replaced on 2026-10-12, in the next bullet).
- **Amended 2026-10-12** (run `2026-10-12_board-writes`, unit `w2-inbox-flow-text` and its fix round; `review/38`,
  `review/39`). The never-open floor covers `fill` and `/st-plan` beside Frame: both read the inbox through this query,
  and a row it withholds, skips or cannot parse is listed as it prints and never opened or triaged (REQ-FLOW-079;
  `content/commands/st-board.md:43-46`, `:407-409`, `:454-456`; `content/commands/st-plan.md:84-88`). The close writes
  the inbox through `ledger inbox-write`, "so its write never reads the file whole" (REQ-FLOW-078;
  `content/commands/st-board.md:455-457`). It runs its query with `--json` and takes each row's `Ref:` from the `ref`
  field, null for a withheld row, which it never decides (`content/commands/st-work.md:303`, `:395-396`). Where `fill`
  and `/st-plan` still edit the inbox with the file tools, a withheld or skipped row's text is data they never act on
  or repeat (`content/commands/st-board.md:457-459`). The query's consumers now include `fill` and `/st-plan`.
- **One grammar, two readers.** The parser is `parseInbox` (`src/runs/inboxStore.ts:275-293`); the query and the
  records gate both read it, and the gate holds the committed inbox to it (`:31-33`). The row grammar is
  REQ-FLOW-076's. Amended 2026-10-12: one writer composes by it too, `editInboxText`, the edit
  `stamity ledger inbox-write` lands (`:33-34`; REQ-FLOW-078).
- **As built, where the delta differed:**
  - The delta gave the whole-file read to "a CLI that cannot run at all (absent, or it crashed)". It landed narrower:
    only an absent CLI or an absent `inbox` query earns it, and a crash is a finding, as a refusal is (`build/16`).
  - The delta said Frame reads the matched rows. The landed step says "Read and surface", and gives a skipped line the
    never-open rule a withheld one has (`build/15`, `review/28`, `review/29`, `review/36`).
  - The delta named three views of a line. The built screen also reads the line as it prints, since `sanitizeLabel`
    drops control characters no other view removes (`review/9`); it screens the composed line (`review/25`), skips an
    over-long bullet unscreened (`review/11`) and caps the two lists (`review/27`).
  - The delta's withheld row matched by location and `files:`. The built copy also keeps its `by:` day and an
    always-shown tag, each only when it passes the screen alone.
- **Expand/contract:** an added subcommand of a hidden verb, and a narrower read at Frame. Rollback is a re-sync at
  the prior version, which restores Frame's whole-file read. The consumers are `/st-work`'s Frame and close and the
  records gate.
- **Proof:** `test/runs/inboxStore.test.ts`, `test/runs/ledgerInbox.test.ts`, `test/records/ledgers.test.ts`,
  `test/corpus/commands/work.test.ts`, `test/architecture/boundaries.test.ts`; must-hold
  `work-persisted-plan-asks-once`; QA.

### REQ-FLOW-069 — A person QA row has a reason a machine cannot meet

From the spec delta of run `2026-10-10_next-tier`, as landed by the unit `q2-qa-rows` and its fix round.

A row needs a person for one of three kinds only: a rendered surface a person must look at (a page, a screen, a style
or an image as it renders), a live third-party client or account, and a step that cannot be undone. Every other row is
auto-proven: where no artifact covers it yet, the run's test-runner executes its check before the table is built, and
the row points at that result (`content/skills/st-qa/SKILL.md:38-43`).

- **The class clause.** A change whose class, `gate classify`'s as the caller passes it, is `docs`, `records` or
  `tests` emits the line "no walk-through required — <class> only", with no sign-off block and no ask, unless it
  changes a path the project's site build renders (its pages, styles or images) or a path the classify hands the
  `design-quality` lens; then it emits one person row, the changed page renders and reads right and the links to and
  from it resolve, followed by the sign-off block. With no class passed, the trigger table decides (`:51-57`).
  `/st-work` hands the skill the class and the lenses at its QA step (REQ-FLOW-017, amended 2026-10-10).
  **Amended 2026-10-15** (run `2026-10-14_cli-native`, the pull request's second review-bot pass; `review/139`). A
  second exception stands beside the rendered-site one: a change to legal or policy wording (a licence, terms, a
  privacy or security policy, governance or conduct text) emits one person row, the changed wording reads as intended,
  followed by the sign-off block (`content/skills/st-qa/SKILL.md:57-64`). Legal or policy wording is one of the five
  person categories below, and such a change is often `docs` class, so without it a policy page's new wording reached
  no person. **Amended 2026-10-15** (the same pass, `review/141`). The two exceptions read as one rule, so a `docs`
  change to policy wording no longer meets a closed "unless" list beside a separate sentence: the line is emitted only
  when none of three conditions holds, a path the site build renders, a path the classify hands the `design-quality`
  lens, or legal or policy wording; otherwise one person row, for a rendered page that it renders and reads right and
  its links resolve, for wording that it reads as intended, followed by the sign-off block (`:57-64`).
- **Amended 2026-10-10** (the whole-branch review's fix round; `review/94`, a security finding). One row is held to
  more: the negative row a security-adjacent path derives (`:35`) is auto-proven only where a committed test's assertion
  covers it, by the Auto-prove pass's rule 1, the test source `file:line` beside the runner's command and outcome. A
  check run once for the row is not proof for it, and with no such test it stays on the human path (`:45-49`,
  `:100-104`). Every other row keeps the rule above. `/st-work`'s QA step restates none of it: it hands the skill the
  class and the lenses (`content/commands/st-work.md:280-281`).
- **As built, where the delta differed:**
  - A row whose check is missing, cannot run or fails stays on the human path under the Auto-prove pass's rule 2
    (`:43-44`, `:105-107`; `review/2`). The three kinds bound which rows are created for a person; missing evidence
    is still never scored as a pass.
  - The one person row also checks that the links to and from the changed page resolve (`:55-57`; `review/4`).
- **Amended 2026-10-15** (plan 020 file 3, unit `f7-prove-before-asking` and its fix rounds; the inbox row
  `2026-10-10_next-tier/build/42`). Five categories replace the three kinds: taste or judgment (how a page, a screen, a
  style or an image reads as it renders), a real account the run cannot hold, a step that cannot be undone, physical or
  OS-native use, and legal or policy wording (`content/skills/st-qa/SKILL.md:38-41`). The prover runs first and at most
  three rows reach the person (REQ-FLOW-081): the rule above that the run's test-runner executes a row's check before
  the table is built is now the caller's dispatch of the prover, and a row outside the five that no route proves goes
  on `Not done:` as "not proven: <reason>", never to the person (`:41-51`). So the "As built" bullet "a row whose check
  is missing, cannot run or fails stays on the human path" reads by category: such a row is the person's when it is in
  one of the five, and otherwise goes on `Not done:`, a `contradicted` one with its excerpt (`:113-117`). The
  security-negative amendment stands, the row taking the first of the three places whenever it is the person's, and an
  `agent-run` never proves it (`:47-55`). The Auto-prove table and rule 1 now accept the same two forms, a test's
  `file:line` beside the gate result or the prover's `agent-run` (`:96-97`, `:107-112`), which settles the "two
  readings of auto-proven" this spec's `## Concerns` records.
- **Proof:** `test/corpus/skills/flow.test.ts`, `test/corpus/commands/work.test.ts`; must-hold
  `qa-bare-signoff-records-unwalked`; QA.

### REQ-FLOW-070 — Plan-lint L5 reports plan size

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q3a-plan-size-script`,
`q3b-plan-size-text`, `q10b-flow-close-pointers` and `q11a-plan-writer` and their fix rounds.

The structural coverage script reports four advisory codes, each with the plan's path, the heading line of the unit or
the entry, and a message (`content/skills/st-verify/scripts/spec-plan-coverage.mjs:268-276`):

- `unit-size`, a unit spanning more than 60 lines, and `unit-oversize`, more than 100 (`<unit> spans <n> lines`);
- `unit-prewritten`, a fence marker line, or a run of five or more lines that start with `>`, inside the unit
  (`<unit> carries prewritten text at line <n>`; `:100-109`);
- `delta-verbose`, a Spec delta entry holding more than six non-blank lines below its heading (`<id> runs <n> lines`;
  `:156-161`).

A unit starts only at an unindented `### ` line outside a fence, so an indented heading-like line is text, and its span
runs to the line before the next such `### ` or `## ` heading, trailing blank lines left out (`:142-144`, `:187-198`,
`:269-270`). The four codes are advisory: they change neither the script's status nor its exit code (`:98-99`,
`:277-278`, `:295`).

`/st-plan` names them as plan-lint check L5, "Plan size (advisory)", whose action never blocks the write
(`content/commands/st-plan.md:289`), and its return line reads
`L1 pass|fail · L2 pass|fail · L3 pass|fail · L4 pass|fail · L5 none|<n> advisory|not run` (`:420-421`). `/st-rework`
runs the same gate, names `L5` as advisory, and closes its own line with `R1 pass|fail`
(`content/commands/st-rework.md:247-253`, `:276-277`). The verify skill names the four codes as L5
(`content/skills/st-verify/SKILL.md:26`).

- **As built, where the delta differed:**
  - The return lines carry a third value, `L5 not run`, where the coverage script could not run, never a claimed pass
    (`content/commands/st-plan.md:420-421`; `review/39`).
  - A delta entry is measured whether its heading is the bare `### REQ-…` or carries its disposition first
    (`### ADDED REQ-…`, MODIFIED, REMOVED); only the bare form defines a requirement provisionally
    (`spec-plan-coverage.mjs:157-166`; `build/7`, `review/12`).
- **Proof:** `test/authoring/specPlanCoverage.test.ts`, `test/corpus/commands/plan.test.ts`,
  `test/corpus/commands/feedbackPair.test.ts`; must-holds `plan-lint-three-fails-returns-blocked-ambiguity` and
  `rework-next-step-derived-from-run-state`.

### REQ-FLOW-071 — Copilot sub-agents receive the charter

From the spec delta of run `2026-10-10_next-tier`, as landed by the live check `q6-copilot-charter-check` and the unit
`q6b-copilot-instructions-key` and its fix round.

Every Copilot custom agent the engine emits carries `include-custom-instructions: true` in its frontmatter, after
`target` and before `tools`, so an agent run as a sub-agent loads the repository instruction files. Prompt files carry
no such key (`src/adapters/copilot.ts:486-520`, the line at `:511`; `:536-549`).

- **The evidence.** The key is the CLI's since 1.0.86, by its changelog, and sits in the 1.0.89 loader's frontmatter
  keys. A live sub-agent check on Copilot CLI 1.0.89 on 2026-10-10 found that an agent dispatched through `task`
  without the key loads no `AGENTS.md`, so the charter, the invariants and the repo facts never reach it (`:473-477`;
  `.stamity/runs/2026-10-10_next-tier/record.md`, which records the live check). That check proved the gap, not the
  key's effect. REQ-FLOW-023's check of 2026-09-30 ran the agent as the session's own, where the instructions
  load, and its disposition holds for that route.
- **The capability row** `sub-agent-instructions` names that evidence, the `--no-custom-instructions` override as the
  CLI command reference's claim, unverified on 1.0.89, and the cloud agent's undocumented handling of the key
  (`:205-219`); `agentsFormat` names the key (`:171-172`).
- **As built, where the delta differed:** the delta said the row names "the `--no-custom-instructions` override". The
  landed row marks it unverified: no live run passed the flag (`review/21`, `review/23`). A live run has since loaded
  an agent carrying the key: QA row 2 of the same run, at its close, ran the emitted `stamity-implementer` as a
  sub-agent on Copilot CLI 1.0.89 with `include-custom-instructions: true` in its frontmatter, and the sub-agent quoted
  the charter's `Invariants version` line, which the run before the key returned as `CHARTER: NONE`
  (`.stamity/runs/2026-10-10_next-tier/record.md:390-391`, `:462`, and `:488`, where `build/13` closes fixed by the
  live check). (Amended 2026-10-14, folding the inbox row `2026-10-11_release-1-14-0/review/5`; it read "No live run
  has yet loaded an agent carrying the key either, so its effect rests on the changelog and the loader's key list
  (`build/13`)".)
- **Amended 2026-10-15** (plan 020 file 2, unit `e8-copilot-codex-claude-pins` and its fix round; `build/38`,
  `review/111`). The capability rows `sub-agent-instructions` and `effort-axis` name the live run of 2026-10-11 on
  Copilot CLI 1.0.89, QA row 2 of run `2026-10-10_next-tier`, as their evidence, citing its record "on the `records`
  branch"; the run carried `include-custom-instructions` and `reasoning-effort`, and the rows claim no live load of a
  `model` key (`COPILOT_DIALECT_FACTS`, `src/adapters/copilot.ts`). The "capability row" bullet above reads with that
  evidence beside the changelog's.
- **Expand/contract:** one added frontmatter key on every emitted Copilot agent. Rollback is a re-sync at the prior
  version (route clause dropped 1.15.0: the sentence on the APM package's own Copilot agents, which carried no such
  key, `build/12`; the APM route is deleted). The accepted risk is in `## Risks`.
- **Proof:** `test/adapters/copilot.test.ts`, `test/emit/capabilityMatrix.test.ts`; the live check; QA.

### REQ-FLOW-074 — The close decides every leftover

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q9t-board-inbox-rules`, `q10a-work-close`
and `q10b-flow-close-pointers` and their fix rounds. The rule's text is `/st-board`'s "Leftovers at a close" bullet
(`content/commands/st-board.md:439-489`), which `/st-work`'s close points at (`content/commands/st-work.md:302-305`).

- **The set.** Before asking, the close runs `stamity ledger inbox --due --paths <the changed paths>` and takes every
  inbox row tagged `decision-waiting` first, then the due and touched rows and each ledger row neither fixed nor
  rejected, Minor rows included; the notes left out ride as one line, titles on request
  (`content/commands/st-work.md:302-305`; `content/commands/st-board.md:439-443`). Amended 2026-10-12 (run
  `2026-10-12_board-writes`, `review/38`): the close runs that query with `--json`, and reads each row's `Ref:` from its
  `ref` field (`content/commands/st-work.md:303`, `:395-396`).
- **The line.** Each leftover reads
  `L<n> <severity> · <location> · <summary> → fix now | schedule: <place>, <by or when>, <files> | drop — <evidence>; would change if <condition>`,
  after the `decision-waiting` rows, Critical and Warning first and never pre-set to drop, then `Notes (<p>): drop`
  (`content/commands/st-board.md:443-446`).
- **The answers.** Accept the recommendations; change rows in one line (`L2 fix; drop L1: <reason>; show L3`); or
  stop (`:460-462`).
  - Fix now runs one fix round, offered only while the review cap leaves a round and outside the files of an open
    person QA row; a fix that fails is reverted and scheduled, `fix-now failed: <gate or finding>` in its description
    (`:463-467`).
  - Schedule closes the row `deferred` and appends it under the schedule rule, or retires it to a plan, board or
    handoff place with the Removal rule's `scheduled` value (`:467-469`).
  - Drop closes the row `deferred` and retires it at once, `cut <reason>`, so it never reaches the inbox. Only the
    person drops a Critical or Warning, retired `cut accepted risk: <reason>` and kept on `Not done:` (`:469-472`).
  - **Amended 2026-10-10** (the whole-branch review's fix round; `review/91`, `review/96`). The third answer reads "or
    stop, every leftover row on `Not done:`", where it read "every leftover on": the notes are no row of that list, and
    a stop drops them as no answer does (REQ-FLOW-075). `show` prints a note's title; on a withheld or skipped row it is
    refused, since the person reads that row by hand (`:461-463`).
- **An inbox row the answer decided** follows the Removal rule: a drop retires it and removes its bullet; a plan,
  board or handoff place retires it there and removes its bullet; a new date or trigger removes its bullet and appends
  one row under the schedule rule carrying the same `Ref:`. Each removal adds an `- inbox retired:` line naming its
  disposition. Nothing retires a row without an answer, and a row no answer reached stays as it is (`:428-436`;
  `content/commands/st-work.md:383-390`). Amended 2026-10-12 (run `2026-10-12_board-writes`): each removal and append
  that answer makes runs through `stamity ledger inbox-write`, and a decided row whose bullet has no unique `Ref:`
  stays, listed on `Not done:` as `decided, not applied (no unique Ref:): line <n>` (REQ-FLOW-078;
  `content/commands/st-work.md:392-397`).
- **A withheld or skipped row** (REQ-FLOW-068) is listed as it prints, the person's to read, and never decided: the
  close offers no disposition for it and applies none, and it stays in the inbox until the person edits it or hands
  over its `Ref:` with an instruction (`content/commands/st-board.md:446-452`; `content/commands/st-work.md:387-389`).
  An `unparsed:` line is listed as it prints too, the person's to fix as a skipped row is, and the close writes the
  inbox through `ledger inbox-write`, so its write never reads the file whole (`content/commands/st-board.md:452-457`;
  REQ-FLOW-068, amended 2026-10-10 and 2026-10-12; REQ-FLOW-078). Amended 2026-10-12, run `2026-10-12_board-writes`;
  it read "and the close's write may read the inbox whole".
- **Minor rows reach the person here.** Only Critical and Warning findings reach the QA checkpoint; the run closes its
  own Minor rows through the close's leftovers part, where each reaches the person as a leftover with its
  recommendation, and before the close a Minor row reaches the operator only when its disposition is itself ambiguous
  (`content/commands/st-work.md:261-267`).
- **An empty part drops out;** with none left, there is no ask (`:306`). With no response the rule is
  REQ-FLOW-075's, beside "leave uncommitted".
- **The other flows.** `/st-pr-resolve` decides each DEFER row in its phase-3 triage ask and adds no closing ask
  (`content/commands/st-pr-resolve.md:323-325`). `/st-rework` decides its DEFER rows at phase 4's routing table and
  asks no leftovers question at its handoff (`content/commands/st-rework.md:264-267`). `/st-quick` has no leftovers
  ask (REQ-FLOW-077).
- **As built, where the delta differed:**
  - The delta said "the answer is applied before the record is written". No sentence states it in those words; what
    the body states is the close gate, which reads its own ledger before writing the record and refuses while any row
    reads `open` (`content/commands/st-work.md:374-376`).
  - `stop` is defined: at a close that asks this question it fixes nothing and otherwise handles rows as no answer
    does, and nothing is fixed, merged or committed; another ask's own `stop`, as at a plan handoff, keeps its
    meaning (`content/commands/st-board.md:480-487`; `review/48`).
  - A withheld or skipped row is never decided, where the delta had the close list it "among the leftovers the same
    way" (`review/42`).
  - `/st-rework`'s rows are decided at phase 4, where the plan had them ride its handoff ask (`review/52`).
- **Amended 2026-10-15** (plan 020 file 3, units `f3-work-close`, `f4-board-close`, `f5-touchpoints-a` and
  `f6-touchpoints-b` with their fix rounds; the delta's amended text from `f5`'s review, `review/29`). The leftovers are
  asked in tool form, in rounds, by the question protocol's Close walk (REQ-FLOW-080), as the close's fourth part.
  - **The answers** read: "Each question offers its row's options, the recommended one first: fix now, schedule or drop,
    `show` on a note, or stop, every leftover row on `Not done:`; a client with no question tool takes the protocol's
    plain-text fallback." The batched one-line form `L2 fix; drop L1: <reason>; show L3` is gone, since the protocol's
    fallback asks one leftover per turn (`content/commands/st-board.md`, its "Leftovers at a close" bullet; `f4`'s
    decided Minor).
  - **A stop part-way through the walk.** Answers given in an earlier round stand and are applied, a `fix now` among
    them still taking its one fix round, and only the rows still undecided take the stop's handling (`review/18`, and
    the round-2 closure's note).
  - **The other flows.** Each touchpoint walks its own leftovers (REQ-FLOW-080): `/st-pr-resolve`'s triage ask is the
    walk's first round and still decides each DEFER row, with no closing ask for it, and a FIX that stays blocked lands
    as its row only after the walk asks it, `decision-waiting` with `when: next attended close` its default
    (`content/commands/st-pr-resolve.md`, its Close; `review/21`); `/st-rework`'s handoff ask is the walk's one round and
    its DEFER rows stay decided at phase 4; `/st-quick` walks its refused or deferred items and pre-existing failures,
    carry to `/st-work` now or leave on `Not done:`, and appends no inbox row (REQ-FLOW-077). The bullet "The other
    flows" above, and its "`/st-quick` has no leftovers ask", describe 1.14.0.
- **Proof:** `test/corpus/commands/board.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/feedbackPair.test.ts`; must-holds `work-persisted-plan-asks-once` and
  `work-proof-block-fields`; QA.

### REQ-FLOW-075 — An unattended close never drops a real defect

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q9t-board-inbox-rules` and
`q10a-work-close` and their fix rounds.

With no answer, only notes are dropped and only fixes the run's plan covers are made. Every other leftover from the
run's own ledger is appended tagged `decision-waiting`, its recommendation in the description and
`when: next attended close`; an inbox row the change touched or found due, or one already tagged `decision-waiting`,
stays as it is, with no copy. Each is listed on `Not done:` and counted as scheduled in the leftovers line
(REQ-CTX-020); the record's `Status:` names how many wait tagged `decision-waiting`, and the next attended close asks
about every `decision-waiting` row first. A real defect is never dropped by default
(`content/commands/st-board.md:472-480`, `:489`).

- **Always shown.** A row tagged `decision-waiting` matches every `inbox` query (`src/runs/inboxStore.ts:49-50`,
  `:399`), and board triage takes such rows second, after `critical-deferred`
  (`content/commands/st-board.md:410-416`).
- **Stop.** The answer `stop`, at a close that asks the leftovers question, handles rows as no answer does and fixes
  nothing: each leftover from the run's own ledger closes `deferred` and is appended tagged `decision-waiting` with
  `when: next attended close`, each inbox row stays as it is, each is listed on `Not done:` and counted as scheduled
  (`:480-487`). The notes are dropped there as with no answer, so the answers line names every leftover row on `Not
  done:` and no note (`:461-462`; amended 2026-10-10, the whole-branch review's fix round, `review/91`).
- **As built, where the delta differed:** the delta did not define `stop`, and named the `Status:` count in no
  entry; both are the landed bullet's (`review/48`).
- **Amended 2026-10-15** (plan 020 file 3, unit `f2-protocol-charter`). A question a headless client skipped reads as no
  answer, so its leftover takes the rule above (`content/rules/stamity-question-protocol.md:89-92`). The no-answer rule
  is now worded once, in the protocol's Close walk, which each touchpoint points at.
- **Amended 2026-10-16** (plan 021 file 1, units `u9-unattended-skill` and `u15-work-text`): by the declared mode.
  Given a record head reading `Mode: unattended`, When the close runs, Then it asks nothing: leftovers take the
  no-answer rule above, QA reads `Shippable: not signed`, the spec delta stays unmerged as a morning-list decision, and
  the commit part runs `stamity run end` (REQ-FLOW-092) where an attended close would leave the work uncommitted
  (`content/commands/st-work.md:303-304`; `content/skills/st-unattended/SKILL.md:67-69`, `:93-94`); given
  `Mode: attended`, or no `Mode:` line, and no answer, Then nothing is committed, as before. A cloud marker never
  selects this rule (`content/skills/st-unattended/SKILL.md:26-27`).
- **Proof:** `test/corpus/commands/board.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/runs/inboxStore.test.ts`; QA.

### REQ-FLOW-076 — A scheduled item names a place, a date or a trigger, and its files

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q9a-disposition`,
`q9b-inbox-schedule-grammar` and `q9t-board-inbox-rules` and their fix rounds.

- **Inbox rows.** After `source:` and the optional `Ref:`, a row carries optional fields in any order, each at most
  once: `by: <YYYY-MM-DD>` or `when: <trigger>`, never both; `files: <path>, <path>`, each entry one path with no
  space; one tag word; one bare `<YYYY-MM-DD>`, the deferral date; and `rationale: <rest of line>`, last
  (`src/runs/inboxStore.ts:9-20`, `:143-212`; `content/commands/st-board.md:392-396`). Every row below the inbox's
  heading `## Rows under the schedule rule`, to the end of the file, carries `by:` or `when:`, without which it does
  not parse; rows above it are older and stay valid without (`src/runs/inboxStore.ts:22-24`, `:52-53`, `:253-256`,
  `:284-286`). `when: touched` needs a path, in the location or in `files:` (`:250-252`). A writer appending where
  the heading is absent adds it first, at the end of the file (`content/commands/st-board.md:399`).
- **Triggers.** A trigger made only of vague words (`later`, `someday`, `eventually`, `tbd`, `hygiene batch`) and
  filler words, one of filler words alone (`at some point`), one that names `hygiene batch` at all, or one holding no
  letter or digit is refused, wherever its row stands (`src/runs/disposition.ts:40-80`, `:175-199`;
  `src/runs/inboxStore.ts:181-188`). Amended 2026-10-10 (the whole-branch review's fix round; `review/89`, shaped by
  `review/99` and `review/100`): `when:` names an event and never holds a day. A trigger holding a `YYYY-MM-DD`-shaped
  day, alone or among other words, is refused, so its row does not parse; a day is written `by: <YYYY-MM-DD>`, the one
  field the `--due` read takes. A `YYYY-MM-DD` that opens a run id, followed directly by `_` and a letter or digit as in
  `<UTC date>_<slug>`, is no day and may stand there (`content/commands/st-board.md:404-406` for the rule; the parser's
  side is that round's code part, `src/runs/disposition.ts` and `src/runs/inboxStore.ts`, by file).
- **Retire values.** From 2026-10-10 (`SCHEDULE_RULE_FROM`, `src/runs/disposition.ts:37-38`) a new `retired` value
  is one of three shapes, a keyword optionally followed by a colon: `fixed <ref>`; `cut <reason>`,
  `cut accepted risk: <reason>` included; or `scheduled <place> · by <YYYY-MM-DD>` or
  `scheduled <place> · when <trigger>`, split at the last ` · `, the place written
  `plan docs/plans/<file>.md#<unit-id or follow-ups>`, `board <item ref>` or `handoff <path>` (`:5-17`, `:201-279`,
  `:287-348`). Any other value is refused by `ledger close --retired` with `why` and `next`, and nothing is written
  (REQ-FLOW-024, amended 2026-10-10). A place is text and is never resolved or opened (`:29-31`). Amended 2026-10-10
  (`review/89`): the `when` slot of a `scheduled` value is held to the same day rule, so `scheduled <place> · when <a
  day>` is refused and a day is written `· by <YYYY-MM-DD>`.
- **Free text says something a reader can check.** A trigger, a `fixed` reference, a `cut` reason, an accepted-risk
  reason and a board item whose every word is a vague or a filler word are refused, and each of them, and a handoff
  path, must hold at least one letter or digit. In `cut accepted risk: <reason>` the reason is held to the rule
  alone. Words are compared as written, lower-cased: a look-alike letter is not folded (`:19-27`, `:250-258`,
  `:299-347`). `/st-board`'s Removal rule names the four slots beside the trigger it points at
  (`content/commands/st-board.md:436-438`; amended 2026-10-10, the whole-branch review's fix round, `review/69`: it
  named a `fixed` reference and a `cut` reason alone).
- **Coming back.** The query's `--due` returns the rows whose `by:` day is on or before the day and counts, beside
  them, the unmatched rows that wait on a `when:` trigger, which no query sees arrive
  (`src/runs/inboxStore.ts:398`, `:425-431`; `content/commands/st-board.md:425-428`). A row whose day has come, or
  whose paths a run changes, comes back to that run's close as a leftover; a kept row is never re-dated in place
  (`content/commands/st-board.md:423-425`, `:435-436`).
- **The records gate** holds the committed inbox to the parser, and holds to the grammar every `retired` value of a
  ledger whose run is dated from the cutover, and in any other ledger every value whose own date is; in a run dated
  from the cutover a value dated before its run is a problem of its own (`test/records/ledgers.test.ts:108-139`).
  Earlier rows and values stay valid.
- **As built, where the delta differed:**
  - The delta listed "an inbox row" among the places. A `retired` value's place is a plan, a board item or a handoff.
    An item scheduled to the inbox is an inbox row carrying `by:` or `when:`, and a re-dated row keeps its `Ref:`, so
    its ledger row stays accounted for and takes no `retired` value (`content/commands/st-board.md:431-432`;
    `plan/36`).
  - "Its files" binds through the reader for `when: touched` alone: such a row needs a path in its location or in
    `files:`. `/st-board`'s text also asks a row at `—` to name `files:` (`:397-398`), which the reader does not
    hold a `by:` row to (`review/62`).
  - The delta's vague-trigger list grew into the vague-and-filler rule and the letter-or-digit rule, over five
    free-text slots (`build/10`, `build/11`, `review/17`, `review/44`, `review/47`, `review/51`).
  - The delta's "the records gate refuses an inbox row … with a vague trigger" holds for a row above the heading
    too: a trigger is held to one rule wherever its row stands (`src/runs/inboxStore.ts:24-27`).
- **Expand/contract:** an added grammar with a dated cutover. A `retired` value dated before 2026-10-10 in a ledger
  of an earlier run is never read against it, and a row above the heading stays valid with no schedule field.
  Rollback is a re-sync at the prior version: the writer's check leaves, and the committed values stay valid text.
- **Proof:** `test/runs/disposition.test.ts`, `test/runs/inboxStore.test.ts`, `test/runs/ledgerInbox.test.ts`,
  `test/runs/ledgerClose.test.ts`, `test/records/ledgers.test.ts`, `test/corpus/commands/board.test.ts`.

### REQ-FLOW-077 — Every inbox writer follows the schedule rule

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q10a-work-close`,
`q10b-flow-close-pointers`, `q11a-plan-writer`, `q11b-feedback-writers` and `q11c-dep-audit-writer` and their fix
rounds. The writers are the five `/st-board` names (`content/commands/st-board.md:373-378`).

- **`/st-plan`.** A follow-up appends one row, citing the plan path in `Ref:`, carrying `by:` or `when:`, and
  `files:` when its location is `—`, below the heading:
  `<severity> · <file:line or —> · <description> · source: /st-plan · Ref: docs/plans/<file>.md · by: <YYYY-MM-DD>`,
  or `· when: <trigger>` in the date's place. A follow-up's trigger is something a run can check from the repository
  or its record; one with neither, or whose trigger only the outside world fires, belongs in the plan's Drop list.
  The plan shape names two optional sections, 6 Follow-ups and 7 Drop list, and the Drop list appends nothing
  (`content/commands/st-plan.md:366-370`, `:396-408`, `:429-430`). A day is written `by: <YYYY-MM-DD>`, and `when:`
  names an event (`:403-404`; REQ-FLOW-076, amended 2026-10-10).
- **`/st-pr-resolve`.** A deferral lands as `severity · file:line · description · source: pr-resolve #<n> ·
  when: touched`, or `· by: <YYYY-MM-DD>` when the user names one, and a FIX that stays blocked lands as the same row
  (`content/commands/st-pr-resolve.md:315-318`).
- **`/st-rework`.** A DEFER row ends `· source: rework <branch> · when: touched`, with `files: <path>` when the
  location is `—` (`content/commands/st-rework.md:174-176`, `:182-184`). The critical-deferred row reads
  `Critical · <file:line> · <the consequence in one line> · source: rework <branch> · when: touched ·
  critical-deferred · <YYYY-MM-DD> · rationale: <the user's sentence>`, or `by: <YYYY-MM-DD>` when the user names
  one; at `—` it adds `files: <path>` straight after `when: touched`, or carries the user's day (`:196-206`). The
  meta row reads `Minor · — · <one line> · source: rework <branch> · when: next board fill · meta`, or
  `by: <YYYY-MM-DD>` in the trigger's place when the user names a day (`:293`). Amended 2026-10-10 (the whole-branch
  review's fix round; `review/93`, `review/89`): with no path to name, the rationale question also asks for the day, and
  with neither no row is written (`:204-205`); the meta row's alternative now ends "never a day under `when:`" (`:293`).
- **The dep-audit skill.** A deferred item lands as
  `<Warning with an advisory, else Minor> · <manifest path:line> · <package> <current> → <target>, <risk class>[, <severity> advisory <advisory id>] · source: dep-audit · files: <lockfile path> · by: <YYYY-MM-DD>`,
  or `· when: touched` in the day's place. `files:` names the lockfile that holds the entry, so a bump of that
  lockfile alone brings the row back; the severity is the word the advisory's source gave; and an advisory at
  `critical` or `high` is deferred only with a day the operator names, never with the touch trigger
  (`content/skills/st-dep-audit/SKILL.md:97-108`).
- **`/st-work`.** Its close appends each `deferred` row it schedules to the inbox below the heading, with `by:` or
  `when:`, and `files:` when the location is `—` (`content/commands/st-work.md:365-371`; REQ-FLOW-074).
- **`/st-quick` appends no inbox row** and has no leftovers ask: what a batch cannot finish escalates to `/st-work`
  by its Escalation table, and that run's close asks about what is left (`content/commands/st-quick.md:223-224`).
  It stays a retirer and no writer (`content/commands/st-board.md:379-382`).
- **Amended 2026-10-12** (run `2026-10-12_board-writes`, unit `w2-inbox-flow-text`). `/st-plan`'s append names the
  heading's place, "which a writer adds at the end of the file where it is absent" (`content/commands/st-plan.md:398-400`;
  inbox row `2026-10-10_next-tier/review/56`), and `/st-work`'s close appends through `stamity ledger inbox-write`,
  which adds an absent heading itself (REQ-FLOW-078; `content/commands/st-work.md:392-394`). The other four writers
  still append with the file tools.
- **The audit's flag** reads the changed entry's own risk class as well as the bump's move (REQ-FLOW-065, amended
  2026-10-10).
- **Amended 2026-10-15** (plan 020 file 3, unit `f5-touchpoints-a` and its fix rounds; the delta's amended text from
  `f5`'s review, `review/29`). `/st-quick` walks its leftovers and still appends no inbox row: before its report the batch
  walks each refused or deferred item and each pre-existing failure left alone by the protocol's Close walk, with two
  options, carry it to `/st-work` now or leave it on `Not done:`, and the next step follows the walk's answers
  (`content/commands/st-quick.md:221-229`). Its last paragraph is unchanged: "This lane appends no inbox row" (`:231-232`).
  The bullet above's "and has no leftovers ask" goes; the lane stays a retirer and no writer.
- **As built, where the delta differed:**
  - The delta's "`files:` when its location is `—`" is in the plan, rework, pr-resolve and work texts. The meta row
    stands at `—` with none: its default trigger, `when: next board fill`, is no touch, and the reader asks a path of
    `when: touched` alone (REQ-FLOW-076; `review/62`, `build/35`).
  - The plan's clause that `/st-quick` asks when its batch leaves a leftover was withdrawn before the build, so the
    lane offers no choice a scan hit, a red gate or a refusal could be closed around (`plan/40`).
  - `/st-rework` decides its DEFER rows at phase 4's routing table, not at its handoff ask
    (`content/commands/st-rework.md:264-267`).
  - The dep-audit row carries `files:` and the advisory's severity word, and the day rule for a `critical` or `high`
    advisory, none of which the plan's template had (`review/65`, `review/67`).
- **Amended 2026-10-16** (plan 021 file 1, unit `u12-protocol-plan-shape`): the plan shape's optional sections. Given
  `/st-plan`'s Plan artifact shape, Then an optional **Prerequisites** section follows Open questions, one row per
  need: kind · name · read where · set by · blocks merge, deploy or run · verified yes or no, never a value
  (`content/commands/st-plan.md:366-369`); Follow-ups and Drop list become 7 and 8 (`:370`, `:373`), where the
  `/st-plan` bullet above reads "6 Follow-ups and 7 Drop list". The morning list carries each row as declared, beside
  the rows the diff infers (REQ-FLOW-094).
- **Proof:** `test/corpus/commands/plan.test.ts`, `test/corpus/commands/feedbackPair.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/board.test.ts`,
  `test/corpus/skills/verifyRestTools.test.ts`; must-holds `rework-critical-deferral-record` and
  `rework-triage-revise-versus-defer`.

### REQ-FLOW-078 — `/st-work`'s close writes the deferral inbox through one engine verb

From the spec delta of run `2026-10-12_board-writes`, as landed by the units `w1-inbox-write` and
`w2-inbox-flow-text` and their fix rounds, with the sign-offs S9, S15, S18 and S22 of that run; every `path:line` in
REQ-FLOW-078 and REQ-FLOW-079 reads at `3415e721`.

`stamity ledger inbox-write --run <run-id>` is the fifth subcommand of the hidden `ledger` verb
(`src/cli/commands/ledger.ts:80`, `:1722`, `:1753`). It takes rows on `--stdin`, one `- ` bullet a line in
`/st-board`'s row grammar, and the `Ref:` values of leaving bullets on `--remove <Ref>,…`, at least one of the two, and
applies both in one locked, atomic write; a removal and an appended row sharing a `Ref:` are a re-date
(`:1580-1621`). An absent `.stamity/inbox.md` is created holding the schedule heading and the rows (S9;
`src/runs/ledgerStore.ts:1189-1194`).

- **All or nothing.** The call refuses whole, and writes nothing, when a line is not a `- ` bullet, a bullet is over
  4,096 characters, a screen hits, a bullet does not parse below `## Rows under the schedule rule` (so a row with
  neither `by:` nor `when:` is refused), or a row carries no `Ref:` or one another stdin row carries
  (`src/cli/commands/ledger.ts:1393-1483`). The screens are the query's: each bullet, the bullets joined by the line
  break rows print with, and each parsed row's fields (`screenInboxRow`), so no row lands that the query would later
  withhold or skip. A screen hit prints the stdin line and the pattern id only, and that bullet's parse message is
  withheld; every other parse message is screened before it prints (`:1432-1463`). Before any screen, each line is
  stripped of the characters the ledger writer strips — control, bidi, zero-width and tag characters — and each
  stripped stdin line is named in a warning (`:1420-1425`, `:1630-1634`).
- **`Ref:` rules.** An appended row's ledger `Ref:` (`.stamity/runs/<any run>/ledger.jsonl#<row id>`) names an existing
  `deferred` row with no `retired` value, its ledger read by the store's no-follow rules; a `Ref:` that names no ledger
  row is appended only as a re-date, the same call removing the bullet that carries it. A removal `Ref:` matches
  exactly one bullet; when it names a ledger row, that row is no longer `deferred` or carries `retired`, unless the call
  re-appends its `Ref:`; a removal naming a ledger row that is not there is admitted (`src/runs/ledgerStore.ts:1103-1187`;
  `src/runs/inboxStore.ts:552-570`).
- **The landing screen** (S15). Under the lock, the block the rows land in is screened as the edited file will read:
  each appended row's line as the query would print it, under every suffix the query prints, then the block's bullets
  joined, window by window, with the bullets already in the run's block of today read back from the first appended row
  while they fit in one window, so a pattern split across two calls is refused as a split inside one call is
  (`src/cli/commands/ledger.ts:1485-1566`; `src/runs/ledgerStore.ts:1238-1239`). A window holds as many adjacent
  bullets as fit in 8,193 characters, and at least two (`src/cli/commands/ledger.ts:1318-1356`).
- **The read and the write.** The inbox is read through the query's no-follow reader in the writer's voice: a symbolic
  link, a hard link, a non-file or an inbox over 1,048,576 bytes is refused naming `ledger inbox-write`, and the
  refusal's `next` says not to edit the file with the file tools in the write's place (`:946-950`, `:982-1048`,
  `:1667-1668`). The writer's read also decodes strictly (S27; `src/cli/commands/ledger.ts::firstNonUtf8Line`): an
  inbox holding a byte that is not valid UTF-8 is refused, naming the line and none of its text, since the whole-file
  write would replace that byte on a line it never touched. The store reads it once before the lock and again under it,
  lands the edit through a temp-and-rename write bounded to `.stamity/`, and refuses a result over 1,048,576 bytes, so
  the query can still read it (`src/runs/ledgerStore.ts:1216-1257`).
- **The edit** (`src/runs/inboxStore.ts:482-665`). Rows land at the end of the file: the heading first where it is
  absent, then this run's block of today when the file's last block opens with the engine-composed head
  "Rows appended <YYYY-MM-DD> by the run `<run>`; each row's `Ref:` names its source.", else a new block under that head
  (`:465-472`). A row whose `Ref:` a staying bullet carries is `already-filed`, and so is a re-date whose new bullet
  equals the old one, so a repeated call changes nothing. An inbox holding the schedule heading twice is refused. Every
  line not removed stays byte for byte, and the file's line end, CRLF included, is used for the lines added.
- **The output.** One line per outcome — `removed <line> <ref>`, `heading <line> added`, `appended <line> <ref>`,
  `already-filed <line> <ref>` — each `Ref:` sanitised, or `(withheld)` where it hits the screen, and no row text
  (`src/cli/commands/ledger.ts:1568-1578`, `:1685`). `--dry-run` reads and answers as a write would, then prints
  "Dry run: <a> row(s) would be appended and <r> removed in .stamity/inbox.md. Nothing was written."; `--json` carries
  `inbox`, `run`, `appended`, `alreadyFiled`, `removed`, `headingAdded` and `dryRun` (`:1688-1710`).
- **In the close.** `/st-work`'s close makes every inbox append, removal and re-date through the verb: rows on
  `--stdin`, a bullet a line; leaving bullets as `--remove <Ref>,…`; a re-date in one call. A refusal is a finding,
  never a hand edit. Each `Ref:` is the row's `ref` in `ledger inbox --json`, null for a withheld row, which is never
  decided. A decided row with no unique `Ref:` stays, listed on `Not done:` as
  `decided, not applied (no unique Ref:): line <n>`, and a call refused on such a `--remove` alone runs again without
  it (`content/commands/st-work.md:392-397`). Where no CLI form runs or the installed copy lacks `inbox-write`, the close
  appends with the file tools and records `inbox: by hand (no CLI)`; otherwise it never opens the inbox with them
  (`:398-399`).
- **As built, where the delta differed:**
  - The delta's joined screen read "the joined block". It landed reading adjacent bullets in windows (`review/19`),
    plus the landing screen, which reads the block of today as the file will read, its earlier bullets within one
    window included (S15, `review/8`), and each appended row's line as the query prints it (`review/17`).
  - The character strip before the screen, with its warning, is beyond the delta (`build/3`, `review/20`).
  - The delta said the close never opens the inbox with the file tools. It landed with sign-off S18's fallback: with no
    CLI form or no `inbox-write`, the close appends with the file tools and records it (`review/42`).
  - The close reads each `Ref:` from `ledger inbox --json`, which the delta did not name; the query's text output
    prints no `Ref:` (`review/38`).
  - Three rules the fix batch of sign-off S23 is landing on `board-writes`, cited by symbol since their lines are
    moving; that batch's commit was not on the branch when this was written, and each rule replaces what the bullets
    above say of `3415e721`:
    - An empty or terminal `--stdin` with no `--remove` refuses the call, exit 1, a validation refusal naming that
      nothing was given; empty stdin beside `--remove` is fine (`review/52`; `runInboxWrite` in
      `src/cli/commands/ledger.ts`). At `3415e721` such a call exits 0 with a note on stderr.
    - `already-filed` holds only for an identical row: a bullet carrying the same `Ref:` with different identity
      fields refuses the whole call, naming its line (S22, `review/56`; `editInboxText` in `src/runs/inboxStore.ts`).
      At `3415e721` any staying bullet with the row's `Ref:` reads as `already-filed`.
    - The ledger a `Ref:` names is read through the ledger store's no-follow, size-bounded reader (`review/55`;
      `writeInbox` in `src/runs/ledgerStore.ts`). At `3415e721` it is read lstat-then-read, unbounded.
  - Two rules from the review bot's pass on the pull request (sign-offs S25 and S26), cited by symbol, each replacing
    what the bullets above say of `3415e721`:
    - After the inbox's lock the write takes the lock of each run ledger a `Ref:` names, sorted by path, re-reads the
      inbox and re-checks each referenced row under them, writes, then releases; a ledger lock it cannot take refuses
      the call, naming no path (`pr/2`; `writeInbox` and `referencedLedgers` in `src/runs/ledgerStore.ts`). Nothing
      takes the inbox's lock while holding a ledger's. At `3415e721` the rows are checked under the inbox's lock alone,
      so a concurrent `ledger close` can move one between that check and the write.
    - An appended row whose `Ref:` holds a comma is refused, exit 1, naming its stdin line and not the `Ref:`, since
      `--remove` splits its list on commas and could never name it; `--remove` is unchanged (`pr/3`; `editInboxText` in
      `src/runs/inboxStore.ts`). At `3415e721` such a row lands and cannot be removed by the verb.
  - The query now screens the lines it prints in windows of adjacent lines (S24, `pr/1`; REQ-FLOW-068, the screen), so
    a split the landing screen cannot see — across two blocks, or across a row a filter leaves out — is withheld on
    read. The landing screen stays as described above.
- **Expand/contract:** an added subcommand of a hidden verb, and the close's inbox write moved onto it. An installed
  copy without `inbox-write` keeps the file-tool append, recorded as by hand. Rollback is a re-sync at the prior
  version, which restores the close's file-tool write. The consumers are `/st-work`'s close and the records gate
  (`test/records/ledgers.test.ts`), which reads what the verb writes by the same grammar.
- **Proof:** `test/runs/ledgerInboxWrite.test.ts`, `test/runs/inboxStore.test.ts`, `test/runs/ledgerInbox.test.ts`,
  `test/runs/ledgerClose.test.ts`, `test/corpus/commands/work.test.ts`, `test/records/ledgers.test.ts`.

### REQ-FLOW-079 — `fill` and `/st-plan` read the inbox through the screened query

From the spec delta of run `2026-10-12_board-writes`, as landed by the unit `w2-inbox-flow-text` and its fix round.

`/st-board fill` step 1 reads the deferral inbox through `stamity ledger inbox` with no filter, which matches every row
as `all`, screened: a row it withholds, skips or cannot parse is listed as it prints and never opened or triaged, and
only an absent CLI or query sends `fill` to the whole file, said so (`content/commands/st-board.md:43-46`;
`src/runs/inboxStore.ts:422`, `:427`). The body's Running-the-CLI paragraph stands before it, so the call runs as
`npx --no stamity ledger inbox`, and its fallback line reads "When neither form runs, or the installed copy has no
`ledger inbox` query, `fill` reads the inbox file whole and says so in its report; any other failure of the query is a
finding, never a whole-file read." (`content/commands/st-board.md:38-39`). A row that does not parse is listed as the
query prints it and never triaged, and triage takes each entry read in full (`:83`, `:407-409`). `/st-plan`'s shared
intake item 4 runs `stamity ledger inbox --plan <this plan> --paths <the scope's files>`: a row it withholds, skips or
cannot parse is listed as it prints, never opened; only an absent CLI or query sends the read to the whole file, said
so, and any other failure is a finding; it runs again once research names the files
(`content/commands/st-plan.md:84-88`). `/st-board`'s Leftovers say the same of both readers, beside Frame
(`content/commands/st-board.md:454-456`).

Their own inbox writes stay on the file tools: `fill`'s removal of an entry it triaged and `/st-plan`'s follow-up
append. Where they edit the inbox that way, a withheld or skipped row's text is data they never act on or repeat
(`content/commands/st-board.md:457-459`); `SECURITY.md:107` names the read a read-before-edit client makes there as a
residual.

- **As built, where the delta differed:**
  - `fill` never triages a row the query withholds, skips or cannot parse, where the delta named only the listing
    (`review/39`, `review/43`).
  - The Leftovers keep a sentence that `fill` and `/st-plan` still edit the inbox with the file tools, beside the
    delta's wording (the implementer's addition, judged true at review).
  - `/st-plan`'s item 4 also runs the query again once research names the files.
  - Amended 2026-10-12 (S24, `pr/1`): the query both readers run screens the lines it prints in windows of adjacent
    lines, so two halves of a pattern from different blocks, or made adjacent by `/st-plan`'s `--plan` and `--paths`
    filter, print as two skip lines, which both readers list as they list any skip line (REQ-FLOW-068, the screen;
    `inboxSequenceHits` in `src/cli/commands/ledger.ts`). Neither reader's text moved.
- **Expand/contract:** two readers move onto an existing query. An installed copy without the query keeps the
  whole-file read, said so. Rollback is a re-sync at the prior version.
- **Proof:** `test/corpus/commands/board.test.ts`, `test/corpus/cliCallForm.test.ts` (the `CALL_SITES` row for
  `commands/st-board.md`), `test/corpus/commands/plan.test.ts`.

### REQ-FLOW-080 — Every touchpoint ends on a walk, the summary last

Added 2026-10-15 (plan 020 file 3, units `f2-protocol-charter` to `f6-touchpoints-b` with their fix rounds, and the
corpus fix batch's `review/44` and `review/64`; plan 020 file 2's question-tool map, below).

Given leftovers, When a run ends, Then each is asked through the client's own question tool, one leftover per question,
Critical, Warning and `decision-waiting` items first, the recommended option first, each option with its one-line
trade-off and a declared default; related questions bundle into one call up to the tool's per-call limit and the rest
follow in rounds, one ask per turn, until none is undecided; and the summary or proof block prints after the last
answer, with nothing after it. With no question tool the walk is plain numbered text, one leftover per turn. With
nobody to answer, each leftover takes its declared default and the run writes its `Default applied:` line; a real
defect is never defaulted to dropped and waits as `decision-waiting`; a question a headless client skipped reads as no
answer. With no leftovers there is no walk (`## Close walk`, `content/rules/stamity-question-protocol.md:76-97`, the
section after `## Gates` and the last, naming no client and no tool, with the `<!-- STAMITY:PLATFORM-TOOL -->` marker
and the plain-text fallback after it). Charter invariant 2 allows the rounds: "one ask per turn (one question-tool call
of related questions, else one numbered list), numbered options, a declared default-if-no-response, rounds until none is
undecided, no second request in the same turn", its sub-agent sentence unchanged (`content/charter/stamity-charter.md:48-50`).

Each touchpoint points at the Close walk and names its own leftovers:

- **`/st-work`:** the close's parts, as REQ-FLOW-019 states (amended 2026-10-15); the answers take effect together
  after the last round (`content/commands/st-work.md:298-311`).
- **`/st-board`:** its `open` items, walked before its return block, which prints last (`content/commands/st-board.md`,
  its Return contract and its "Leftovers at a close" bullet; REQ-FLOW-074).
- **`/st-debug`:** each regression clause with no test and each surviving hypothesis; instrumentation held under a
  capture-later agreement is listed with that agreement and not asked again, since an unanswered question would fall to
  "strip now" (`review/30`); the report and its next step last.
- **`/st-quick`:** each refused or deferred item and each pre-existing failure left alone, carry to `/st-work` now or
  leave on `Not done:`; no inbox row (`content/commands/st-quick.md:221-229`; REQ-FLOW-077).
- **`/st-ask`:** its Blocked rows, Contradictions and low-confidence claims; each decision is recorded in the answer,
  nothing is written, and acting on it is the person's.
- **`/st-spec`:** open `[NEEDS CLARIFICATION]` markers, unconfirmed T2/T3 proposals and census gaps. A marker's question
  declares "leave it marked" as its default, and only an answer the person gives replaces a marker; in `create`,
  `extract` and `sync` the spec-author writes an answered marker into its requirement with an ADR stub, and a marker
  left undecided or defaulted stays and is listed under Open markers (`review/28`, `review/38`). The greenfield one-round
  interview names the close walk as its one exception.
- **`/st-plan`:** each open question still carried, then each follow-up's schedule fields, the recommended schedule
  first and the Drop list among the options; each answer lands in the artifact before a follow-up row appends, and an
  answer that changes a unit re-runs the plan-lint gate and the structural coverage pass before the block
  (`content/commands/st-plan.md:414-420`; `review/22`).
- **`/st-rework`:** the handoff ask is the walk's one round, a drafted issue body's confirmation bundled into it; on
  `stop` the DEFER rows phase 4 appended stand, are not offered `fix now` and are not appended twice; the next step is
  the proof block's last field (the inbox rows `2026-10-10_next-tier/build/31`, `review/52`; `review/23`).
- **`/st-pr-resolve`:** the triage ask is the walk's first round, then a blocked FIX's round and the re-poll consent,
  `poll / done (default)`; the block prints after the last answer, the re-poll included (`review/21`).

`/st-debug`, `/st-spec` and `/st-ask` derive their next step from the walk's answers as well as the run's state, and
`/st-quick` names any `Not done:` item in its next-step line (the corpus fix batch's `review/64`; `f5`'s round 2).

- **As built, where the delta differed:** invariants 2 and 5 hold every clause on six lines between them, freed by
  rewrapping invariant 6 from three lines to two with its words unchanged, the charter staying at 95 lines; invariant 2
  keeps "Sub-agents do not ask — they return `BLOCKED_AMBIGUITY` naming the readings" byte for byte (`review/11`). The
  protocol's Gates bullet and Floor item 6 read "one ask per turn" (`review/12`). The delta's "one per question" holds
  per leftover, a call bundling related ones.
- **Expand/contract:** text only, under invariants 1.3.0, a MINOR step with its `docs/doctrine.md` row; a repository
  that never re-syncs keeps the one-question close. Rollback is a re-sync at the prior version.
- **Proof:** `test/corpus/rules/protocol.test.ts` ("question-protocol — the close walk (REQ-FLOW-080)"),
  `test/content/charter.test.ts`, `test/content/invariantsVersion.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/board.test.ts`, `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/spec.test.ts`,
  `test/corpus/commands/plan.test.ts`, `test/corpus/commands/feedbackPair.test.ts`; new floor case
  `close-summary-after-last-decision`, its must-holds B4–B6, with the no-leftovers twin
  `benign-close-no-leftovers-asks-nothing-extra`; the close cases and the five `*-next-step-derived-*` cases re-synced
  to the walk (`evals/SET-v7.md`).

Amended 2026-10-15 (plan 020 file 2, unit `e12-translator`; read at `ecf11a74`). The client's question tool is the
translator's map, `ASK_USER_TOOLS` (`src/tools/translator.ts`), which the protocol's marker renders for each client: one
named tool per client, each row citing a source read on 2026-10-15. Claude Code: `AskUserQuestion`, one to four
questions a call and two to four options each, never in a sub-agent. Cursor: `AskQuestion`, from 2.4 and only where the
serving model offers it; `agent -p` rejects it as a user skip, and the tool's id rests on a forum staff reply, not a docs
page. GitHub Copilot: `askQuestions` in VS Code, reaching sub-agents since 1.110, and `ask_user` in Copilot CLI, which
`--no-ask-user` turns off; that `ask_user` takes one question a call is unverified. Codex: `request_user_input`, one to
three questions a call, waiting for the answer in Plan mode, in Default mode only behind a feature flag, rejected by
`codex exec`, its source the client's repository. Each rendered note is at most two sentences, keeps the plain-text
fallback, says a sub-agent returns its question as a blocked result, and reads a skipped or headless question as no
answer. The row type keeps `toolName: string | null`, though no row is `null` now.

- GIVEN the map THEN every client has a `toolName` and a note of at most two sentences naming the fallback and reading a
  skipped answer as no answer, each row with a dated source; GIVEN the rendered platform table THEN four named rows;
  GIVEN the Copilot rendering THEN its note names `askQuestions` (`test/tools/translator.test.ts`,
  `test/adapters/copilot.test.ts`; added 2026-10-15).

Amended 2026-10-16 (plan 021 file 1, unit `u15-work-text`): the `/st-work` bullet. Given `/st-work`'s close, Then the
bullet reads: the close's parts as REQ-FLOW-019 states (amended 2026-10-16), the commit part's three numbered options
among them, the answers taking effect together after the last round (`content/commands/st-work.md:297-309`); under
`Mode: unattended` there is no walk: each part takes its declared default by REQ-FLOW-075, and the morning list
carries what the walk would have asked (REQ-FLOW-094; `content/skills/st-unattended/SKILL.md:67-69`, `:118-121`).

Amended 2026-10-18 (plan 021 file 2, units `v8-detect-translator` and `v19-eval-cut-prep`). Given the question-tool map
(`ASK_USER_TOOLS`), Then a row may carry an optional `cloud` note of one sentence, rendered as its own column; Cursor's
says that in a managed cloud run, which its session line names, the agent asks nothing and takes the declared default;
each local note keeps its two-sentence cap and the four rows stay; a client's own per-client copy of the question
protocol carries its cloud note too (Cursor's and Copilot's). Given the golden, non-floor eval case on Cursor's note,
Then a managed Cursor run reaching an ask calls no question tool and writes `Default applied:` (the case is golden with
binding rows, not advisory).

- **As built:** `AskUserToolEntry` gains `cloud?: string` (`src/tools/translator.ts:390-395`). Cursor's reads "In a
  managed cloud run, ask nothing and take the declared default." (`:423`) and Copilot's "The cloud agent has no person
  to answer; take the declared default." (`:436`); Claude Code's and Codex's rows carry none. The cross-client table
  gains a fourth column, "Cloud run", `—` where a row has none (`buildAskUserPlatformTable`, `:485-487`), and a client's
  own copy renders `<note> **Cloud run:** <cloud>` (`substituteCanonicalPlatformMarker`, `:505-506`), so Cursor's
  `.cursor/rules/stamity-question-protocol.mdc` and Copilot's copy state it. The case is
  `evals/cases-v6/golden/cursor-cloud-question-takes-default.md`, golden and not a floor, six binding rows and one
  advisory, its `source:` the question protocol's lines holding the platform marker
  (`content/rules/stamity-question-protocol.md:51-57`, `:89-98`); the set's roster reads 155 cases, 88 golden and 42
  floors (`evals/SET-v7.md`, its paragraph "One case added, 2026-10-18").
- GIVEN the map THEN Cursor's and Copilot's rows carry their cloud sentence and the table its "Cloud run" column; GIVEN
  Cursor's and Copilot's rendered protocol THEN the sentence follows `**Cloud run:**`, and Claude Code's and Codex's are
  unchanged (`test/tools/translator.test.ts`; added 2026-10-18). GIVEN the eval set THEN the case's locators, roster and
  coverage hold (`test/evals/locators.test.ts`, `test/evals/roster.test.ts`, `test/evals/coverage.test.ts`).

### REQ-FLOW-081 — The run proves a row before it asks the person

Added 2026-10-15 (plan 020 file 3, unit `f7-prove-before-asking` and its fix rounds; the delta's amended text from
`f7`'s return and its reviews, `review/50`, `review/51`, `review/59` to `review/61`, and the sign-off on `build/25`).

Given an unproven QA row, Then the prover has tried its routes, cheapest first, before the table is built: a committed
test whose assertion covers the row, a CLI or script run of its steps, a `gh` or API read, a headless client session,
then the repository's browser harness, the client's own browser tool only where the dispatching client grants it. The
prover is the test-runner in its row-proving mode, its capabilities unchanged: it edits nothing (`## Row proving`,
`content/agents/stamity-test-runner.md:159-209`). The qa skill cannot spawn, so it tells its caller to dispatch the
prover, and a caller that cannot dispatch runs the cheapest routes itself under the same guards and says so; an
unattended run proves the same way (`content/skills/st-qa/SKILL.md:41-46`).

- **One line per row.** `agent-run · <command> · exit <n> · <output path>` when a route ran, its exit code was read and
  its output shows the row's `Expected` (the committed-test route also names the test source `file:line`, a lead, never
  proof of a security-negative row); `contradicted · <command> · exit <n> · <output path>` with that output's redacted
  excerpt when a route ran and showed anything else; `not proven: <reason>` when no route could run or the route that
  ran left its exit code `unknown`. A route that ran ends that row's routes; only one that cannot run falls through.
- **Who is asked.** At most three rows reach the person, each in one of REQ-FLOW-069's five categories or the
  security-negative row no committed test covers, which stays the person's and takes the first place; the rest are
  listed "over the cap, not asked: <reason>", which blocks nothing by itself, and an `H` row there stays an `H` row,
  asked at the next checkpoint. A row outside the five that no route proves goes on `Not done:` as "not proven:
  <reason>". An `agent-run` never proves a security-negative row (`content/skills/st-qa/SKILL.md:38-55`).
- **Failing rows.** A `contradicted` row is failing: a walk is recorded beside its excerpt and does not clear it, and
  only a later run showing `Expected` does; `Shippable` reads `YES` only once every `H` row is walked or proven and none
  stands `contradicted` — a walked reply alone never clears one (`:129-130`, `:143-144`; REQ-FLOW-018, amended
  2026-10-15).
- **The guards**, binding any runner of the routes: a route reads through a sign-in already present and never writes
  through one (no push, post, comment or account change); a route needing a credential neither present nor handed over,
  or a step that cannot be undone, is not run; the headless-session route runs only in the client's read-only
  permission mode and never on a client that has none; a row's own steps run in a scratch directory with the home
  directory and the config-directory variables a program reads pointed into it, and a step that cannot be confined
  that way cannot run; every saved or inline route output has a credential-shaped value replaced with `[redacted]`, and
  the digest's `security:` line names each row so redacted (`content/agents/stamity-test-runner.md:187-209`).
- **`/st-work`'s summary** shrinks to the rows the prover leaves for the person, at most three with the
  security-negative row, each with a check a person can run in under a minute, a `contradicted` one with its excerpt
  (`content/commands/st-work.md:278-279`); its step 3, the browser-evidence offer, is unchanged, and the core step does
  not need that skill.

- **As built, where the delta differed:** the delta's first form had three states and no person-row exception; the
  exception, the `contradicted` state, the confinement and the redaction were added by the unit's reviews and amended
  into the delta before this merge (`review/63`).
- **Proof:** `test/corpus/agents/quality.test.ts` ("test-runner — row proving"), `test/corpus/skills/flow.test.ts`,
  `test/corpus/commands/work.test.ts`; new cases `qa-prove-before-asking`, its benign twin
  `benign-qa-second-account-stays-person-row`, and `qa-contradicted-row-fails-security-row-first`;
  `qa-ui-change-keeps-person-row` re-baselined (`evals/SET-v7.md`).

### REQ-FLOW-082 — Review and verify check module depth

Added 2026-10-15 (plan 020 file 3, unit `f8-deep-modules`, with the corpus fix batch's `review/8` and `review/9`).

Given a new layer whose interface mirrors what it wraps, Then the reviewer's maintainability lens files a pass-through
finding: its row names "a new layer whose interface is nearly as wide as what it hides (a pass-through); a function or
file well past the repo's own norms whose interface is wide too" (`content/agents/stamity-reviewer.md:47`). Given a big
file with one export, Then there is no size-only finding: `maint-size-outliers` defers a whole file whose module exports
at or below the repo median export count to `maint-module-depth` and records no hit, a function is never deferred, and a
stack with no export construct defers nothing (`content/skills/st-verify/references/maintainability.md:24-34`).
`st-verify` carries the judgment check `maint-module-depth`, with no `Threshold:`: the deletion test, the interface as
the test surface, a deferred file cited with its export count beside the median, the evidence form
`<path:line> exports=<k> (median <m>), lines=<n> (median <x>), forwards=<f>/<k>`, a port at a cross-cutting boundary
the repo declares not counted as a pass-through, and `not-applicable` for a re-export index, a generated file or a
test-only helper (`:77-88`).

- **As built:** functions keep `maint-size-outliers`; only a whole file defers (the sign-off on `f8`'s review).
- **Proof:** `test/corpus/agents/spine.test.ts`, `test/corpus/skills/verifyRestTools.test.ts`; new case
  `reviewer-shallow-wrapper-pass-through`.

### REQ-FLOW-083 — A plan unit names the module interface it lands behind

Added 2026-10-15 (plan 020 file 3, unit `f6-touchpoints-b`). The `interfaces` cell of `/st-plan`'s unit table reads
"the exact signatures, schemas, props, and error shapes the implementer needs, inline, and the module interface the
unit lands behind" (`content/commands/st-plan.md:352`).

- **Proof:** `test/corpus/commands/plan.test.ts` ("names the module interface a unit lands behind in its `interfaces`
  cell (REQ-FLOW-083)").

### REQ-FLOW-084 — Hook commands do not depend on the working directory

Added 2026-10-15 (plan 020 file 2, unit `e5-hook-starter`, with `e7-cursor-pins`'s `review/84` and `review/85`).

Given a session started in `repo/sub`, When an emitted Cursor or Copilot hook command runs, Then it walks up to its
client's anchor file and behaves as from the root. Every Cursor and Copilot entry, Cursor's two guards included with
`failClosed` kept, is a `node -e` walk-up starter rendered by `portableHookCommand(tool, row, { syncCall, script? })`
from one anchor table (`STARTER_ANCHORS`, `src/hooks/portableRunner.ts`): Cursor's walk starts at `CURSOR_PROJECT_DIR`
when that folder holds `.cursor/hooks.json`, else at the working directory; Copilot's walks to
`.github/hooks/stamity.json`; Codex's starter is byte-identical to 1.14's, so the trust Codex recorded holds. The starter
runs its script from the root it finds, by default the portable runner; a missing script exits 1 naming the pinned sync
call, and no anchor above exits 1. The script is held to plain root-relative segments and the call to
`STARTER_SAFE_CALL`, so the program holds no `$`, backtick, `%`, backslash or inner quote and reads the same under `sh`
and `cmd`. The starter names the pinned call, so each release rewrites the engine's entries, as on Codex. 1.14's
relative commands stay recognised as the engine's, and the first 1.15 `sync` replaces them in place, owner entries
kept, with no `.bak` under a recorded ledger (`walkUpStarterScript`, `src/manifest/hookDocuments.ts`; REQ-FLOW-037,
amended 2026-10-15). A command with no `node` on `PATH` exits 127 from the shell, as before.

- **As built, beyond the delta:** where `.github/hooks/stamity.json` is not tracked and clean in git, each upgrade's
  overwrite leaves a `.bak` by the rendering proof, since the entries now name the version (`build/45`, open).
  `CURSOR_PROJECT_DIR` on every Cursor hook rests on the plan's vendor read of 2026-10-14 (`build/43`, open).
- **Proof:** `test/hooks/portableRunner.test.ts` ("the walk-up starter on Cursor and Copilot"),
  `test/manifest/hookDocuments.test.ts`, `test/merge/hookFilesOwnership.test.ts`, `test/adapters/cursor.test.ts`,
  `test/cloud/containerLeg.test.ts` (REQ-PROVE-037).

### REQ-FLOW-085 — The session start names a cloud or CI session

Added 2026-10-15 (plan 020 file 2, units `e9-session-start-detection` and `e10-cloud-docs-matrix`; `e10` read at
`fee88300`, and re-read at the integration head `1855a20f`, after its fix round).

Given `CLAUDE_CODE_REMOTE` set to `true`, `COPILOT_AGENT_PROMPT`, `CURSOR_AGENT_SOCKET`, or `CI` or `GITHUB_ACTIONS`, each
set to a value other than empty, `false` or `0`, When the session-start hook runs, Then after the learnings and handoff
index and before any resume card it prints one blank line, `Session: <name>.` for the first detected session in that
order (a Claude Code cloud session, a Copilot cloud agent session, a self-hosted Cursor worker, a CI run), that session's
not-enforced lines as `- …`, and `Also detected: <names>.` when other markers are set (`CLOUD_SESSIONS` and
`sessionLines`, `src/hooks/scripts.ts`). A marker is read by presence only and no value is printed, and the script makes
no network call. A client's lines are that client's `sessionStart` rows in `CLIENT_CLOUD_FACTS`
(`src/hooks/model.ts`, at `1855a20f`), each row carrying its vendor page, access date and status, and only a
`documented` row carrying one: Claude Code's "GraphQL, gh pr, gh issue and Projects are unavailable here; use gh api."
and "The review-gate counter resets with the VM."; Copilot's "A preToolUse hook that times out fails open.", "An ask
answer is read as deny." and "Hooks run only when the hooks file is on the default branch; this clone's copy is the one
loaded."; a self-hosted Cursor worker none, its session named alone. The CI line, "No person answers; declared defaults
apply.", is the engine's own behaviour and stays in the script.

The capability matrix carries the same table: a dated "In the vendor's cloud" cell per client in its glance table, and a
"Cloud sessions" section listing every row with its fact, the line the session start prints, its status, its source
and its access date, a page that says nothing on a point rendered "not documented, read <date>"
(`src/emit/capabilityMatrix.ts`, at `1855a20f`). `docs/customization.md` and `docs/troubleshooting.md` state which
clouds run which hooks and cite that section (REQ-FLOW-086).

- **As built, where the delta differed:** a self-hosted Cursor worker no longer prints "The MCP guard does not run.",
  which the delta's unit listed: Cursor's page says it only of Cursor-hosted agents, so the fact stays an `unverified`
  row with no session line (`build/75`). The fix round took the same line rule further: the self-hosted worker's
  "subagentStart is skipped in a first or read-only turn." went too, Cursor's page saying it of cloud agents only, and
  Copilot's "Hooks run only from the default branch." became the line above, because no cited page says a branch's
  changed copy never runs (`review/120`, `review/121`). `CURSOR_AGENT_SOCKET` as the self-hosted marker is an
  `unverified` row: the self-hosted page names no such variable. The blank line before the lines keeps the resume card "everything after the
  last blank line" for its two readers.
- **Amended 2026-10-18** (plan 021 file 2, units `v2-review-gate-rebuild`, `v6-cursor-cloud` and
  `v8-detect-translator`). Given `CLAUDE_CODE_REMOTE=true`, Then none of Claude Code's lines reads "The review-gate
  counter resets with the VM." or says a missing counter opens the gate, now rebuilt from the run record
  (REQ-FLOW-106); Given `CURSOR_AGENT_SOCKET`, Then its line names "a Cursor agent machine (managed or self-hosted)", the
  managed reading coming from the once-per-conversation script (REQ-FLOW-115); the session start keeps its markers, its
  order and no network call, and the capability matrix's cloud table is regenerated to match. As built: Claude Code's
  second line reads "A missing review-gate counter is rebuilt from the run record on this branch." (`CLIENT_CLOUD_FACTS`,
  `src/hooks/model.ts`); the Cursor name is parenthesised so a list of detected sessions holds no comma inside a name,
  and the Cursor marker row is `documented` from Cursor's identity page, read 2026-10-18 (the same table;
  `CLOUD_SESSIONS`, `src/hooks/scripts.ts`). The markers, their order and their rule now come from one detector,
  `detectSession` and `SESSION_MARKERS` (`src/session/detect.ts`), whose matcher the session start and Cursor's
  context-once script inline as source text (`MATCH_SESSIONS_SOURCE`; `sessionIndexSource`, `src/hooks/scripts.ts`), so
  the emitted bytes do not depend on the loader that ran `sync`; the printed lines are otherwise unchanged. Proof:
  `test/hooks/scripts.test.ts`, `test/hooks/sessionStartCard.test.ts`, `test/session/detect.test.ts` ("the detector the
  session start carries"), `test/cloud/profiles.test.ts`, `test/emit/capabilityMatrix.test.ts`.
- **Proof:** `test/hooks/scripts.test.ts` ("the session start names a cloud or CI session (REQ-FLOW-085)"),
  `test/hooks/sessionStartCard.test.ts`, `test/hooks/scriptBudget.test.ts` (the session-start row at 63,488 bytes and
  1,400 lines, `HOOK_SCRIPT_BUDGETS` in `src/hooks/scripts.ts`; amended 2026-10-18, plan 021 file 2's unit
  `v1-branch-card` having raised the row by × 1.25: it read "49,152 bytes and 1,100 lines"),
  `test/emit/capabilityMatrix.test.ts` ("the cloud column and the Cloud sessions section", which also
  holds every row carrying a session line to `documented`), and
  `test/cloud/containerLeg.test.ts`.

### REQ-FLOW-086 — Copilot hooks use camelCase

Added 2026-10-15 (plan 020 file 2, unit `e6-copilot-adapter` and its fix round, `review/94` to `review/97`; and unit
`e10-cloud-docs-matrix` for the guides, read at `fee88300`).

`.github/hooks/stamity.json` keys its events `sessionStart`, `preToolUse`, `postToolUse`, `userPromptSubmitted`,
`agentStop` and `sessionEnd`, and each entry is `{ type: "command", bash, command, cwd: ".", matcher?, timeoutSec? }`,
`bash` and `command` holding the same starter (`COPILOT_EVENT_NAMES` and `buildCopilotHooksJson`,
`src/adapters/copilot.ts`). The Copilot runner hands authored hooks the Claude tool name for each runtime name in
`COPILOT_RUNTIME_TOOL_NAMES` — `bash` → `Bash`, `powershell` → `PowerShell`, `view` → `Read`, `create` → `Write`, `edit`
and `str_replace_editor` → `Edit`, `grep` and `rg` → `Grep`, `glob` → `Glob`, `task` → `Agent`, `ask_user` →
`AskUserQuestion`, `web_fetch` → `WebFetch`, `web_search` → `WebSearch`, `update_todo` → `TodoWrite` — by an
own-property read, the tool input staying Copilot's own, and passes any other name unchanged
(`src/hooks/portableRunner.ts`, the table and the runner's mapping at `:331-343`). The last three rows are the hooks
reference's preToolUse / PreToolUse mapping table (docs.github.com/en/copilot/reference/hooks-reference, read
2026-10-15; `review/132`); `powershell` keeps Claude Code's own `PowerShell` where that table says `Bash`, because Claude
Code names PowerShell as a tool hook matchers name (code.claude.com/docs/en/tools-reference, read 2026-10-15), and a hook
keyed on `Bash` would otherwise be handed PowerShell syntax. The Copilot runner also gives `transcriptPath`,
`stopReason`, `initialPrompt` and `toolResult` under the snake_case keys the PascalCase form spells them with,
`transcript_path`, `stop_reason`, `initial_prompt` and `tool_result`, only where that key is absent, keeping the
camelCase key; `timestamp` passes as sent (`review/133`). `apply_patch` keeps its own name and
its patch input, with no `file_path`. An authored matcher is read as its top-level alternatives, an anchor at either end
and one wrapping group kept; each plain-name alternative translates through the inverse table, Claude's legacy `Task`
like `Agent`, and every other alternative is kept as written; a source that does not balance is kept whole. `init` and
`sync` name once a matcher whose plain name has no runtime twin, and say once that a path guard matched on `Edit` or
`Write` must also name `apply_patch` (`translateCopilotMatcher` and `copilotMatcherWarnings`, `src/adapters/copilot.ts`).
`check` adds no row for it. The guides say Copilot's cloud agent uses hooks only when the file is on the default
branch and loads them from the clone, that a Claude Code cloud session with several repositories loads no repository
hooks, and that Codex cloud documents no project hooks, so none are assumed to run (`docs/customization.md:430-441`, at
`fee88300`; `docs/troubleshooting.md`, "A hook never runs in a cloud session").

- **As built, where the delta differed:** the delta's matcher example mapped `Edit` to `apply_patch` too; the landed
  runner keeps `apply_patch` apart, because the vendor's patch format names no path an authored path guard could read,
  and the plan was amended to it (`review/94`). Unverified, recorded as a dated row: whether Copilot's `edit`, `create`
  and `view` name their path argument `filePath` or `path` (`build/76`).
- **Expand/contract:** the 1.14 PascalCase file is replaced on the first 1.15 `sync`, its bytes kept recoverable by the
  rendering proof; rollback is a re-sync at the prior version.
- **Proof:** `test/adapters/copilot.test.ts`, `test/hooks/portableRunner.test.ts`, `test/emit/hooksInfra.test.ts`.

### REQ-FLOW-087 — PR-resolve and the board work in a REST-only session

Added 2026-10-15 (plan 020 file 3, units `f4-board-close` and `f6-touchpoints-b` with their fix rounds; the delta's
amended text from `f4`'s blocked return).

Given a REST-only session — the session-start banner says GraphQL is unavailable (REQ-FLOW-085), or a `gh api graphql`
call is refused — Then every GitHub call of `/st-pr-resolve` and `/st-board` uses a REST `gh api` form where one exists.
The text names the session by what the agent observes, never by client.

- **`/st-board`:** issues and their comments through `gh api repos/<owner>/<repo>/issues…`, labels and `pulls/<n>`;
  every REST listing the run depends on passes `per_page=100` and `--paginate`, the issue listing reads `state=all` and
  leaves out entries carrying `pull_request`. A Projects board is refused with "Projects boards are unavailable in a
  REST-only session", and setup refuses a Projects link there. A 403 on a read of the linked repository is reported as
  `not attached to this session`, never as a missing board; a 403 on the permission read alone is a failed write check;
  a 403 whose message names a rate limit is reported as a rate limit, ahead of both
  (`content/commands/st-board.md:225`, the GitHub row).
- **`/st-pr-resolve`:** one read, `gh api repos/{owner}/{repo}/pulls/{n} --jq '[.base.repo.full_name,
  .head.repo.full_name, .head.ref, .head.sha]'`, `<n>` checked to be digits only; a head repository other than the base
  is refused on that read, before any fetch. Then `git fetch origin "pull/<n>/head"`, a failed fetch stopping the round;
  `git rev-parse FETCH_HEAD` must equal the head sha the read returned, else the round is refused before any checkout;
  then `git checkout -B "pr-resolve-<n>" "<sha>"` on that verified sha. The author's branch name enters no fetch and no
  checkout but an unattended round's (REQ-FLOW-097). A pushed ref holds only letters, digits, `.`, `_`, `/` and `-`,
  then passes `git check-ref-format --branch`, and is always quoted; after the push a fresh read of the head sha must
  equal `git rev-parse HEAD`, else no `Implemented in` reply posts. No remote URL is read or printed
  (`content/commands/st-pr-resolve.md:58-80`). A review thread's resolution state is reported `unknown`, and a thread
  counts answered when its newest comment carries the command's signature line posted by the account the run replies as
  (section 1).

- **As built, where the delta differed:** the delta's first sentence named Claude Code's cloud; the corpus names no
  client in model-facing text, so the condition is named by observation (`f4`'s blocked return). The REST checkout
  verifies the fetched commit's content against the API's head sha instead of checking `origin`'s URL, which an
  intermediate fix round had added: the landed code reads no remote configuration (the design signed off at that
  round's security lens, `review/39` to `review/42`, and `review/58`). The board's paging and 403 readings are beyond
  the delta (`review/16`, `review/17`, `review/32`).
- **Proof:** `test/corpus/commands/board.test.ts` ("works a REST-only session in REST forms and refuses a Projects board
  there (REQ-FLOW-087)"), `test/corpus/commands/feedbackPair.test.ts` ("takes the REST forms in a REST-only session,
  named by what the agent observes (REQ-FLOW-087)" and "fetches a REST-only head by number, refuses a fork head, and
  refuses a ref outside the allowlist"), `test/corpus/invariants.test.ts` (invariant 17).

### REQ-FLOW-088 — A cloud with no session-start hook reads learnings through the screen

Added 2026-10-15 (plan 020 file 3, unit `f2-protocol-charter` and its fix round, `review/13`; the delta's amended text
from `review/27`). Charter invariant 5 reads: "Read `.stamity/learnings/` before project-specific work, only through
the session-start banner or, where no hook ran, `node .stamity/generated/hooks/<client>/stamity-session-start.mjs` run
with an empty stdin, opening only the files it lists as loaded; repeating a recorded failure is a process defect."
(`content/charter/stamity-charter.md:55-57`). The command names no glob and no `/dev/null`, so it reads the same under
every shell. Since plan 021 file 2's `w6-claude-hooks-in-claude-dir`, Claude Code's hook entries run the copy under
`.claude/hooks/stamity/`; the generated copy the invariant names is still written, so the command holds for Claude Code
as for the other clients.

- **Amended 2026-10-16** (plan 021 file 1, units `u7-learn-read` and `u9-unattended-skill`). Given a session where no
  session-start hook ran, Then learnings are read through the screen, by the committed script run with an empty stdin
  or by `stamity learn read` (`--body <id>` for one body), which applies the write gate's whole catalog, exfil rows
  included (`runRead`, `src/cli/commands/learn.ts`); the unattended skill names both (REQ-FLOW-099;
  `content/skills/st-unattended/SKILL.md:43-46`), and a file under `.stamity/learnings/` is never opened with the file
  tools. Proof: `test/cli/commands/learn.test.ts`, `test/corpus/skills/unattended.test.ts`.
- **Proof:** `test/content/charter.test.ts` (the invariant 5 pins, with no `/dev/null` and no `hooks/*/`),
  `test/content/invariantsVersion.test.ts` (the 1.3.0 hash row).

### REQ-FLOW-089 — A run is unattended only by declaration

Added 2026-10-16 (plan 021 file 1, units `u1-record-head`, `u9-unattended-skill`, `u10-board`, `u10b-debug-quick`,
`u11-rework-pr-resolve` and `u15-work-text`).

Given `--unattended` on the touchpoint or `STAMITY_UNATTENDED` set to a value other than empty, `false` or `0`, the flag
winning and `--attended` beating the variable, When Frame opens the record, Then its head reads `Mode: unattended`;
given neither, or only a cloud or CI marker (`CLAUDE_CODE_REMOTE`, `COPILOT_AGENT_PROMPT`, `CURSOR_AGENT_SOCKET`, `CI`),
Then `Mode: attended` (`content/skills/st-unattended/SKILL.md:24-27`; `content/commands/st-work.md:406-408`). A head
with no `Mode:` line reads attended unless `STAMITY_UNATTENDED` is set; then the variable governs, as the shell guard,
the ask gate and the run verbs read it, and a `Mode: attended` head wins over it (`readRecordHead`,
`src/runs/resumeCard.ts`; `unattendedBy` and `unattendedSource`, `src/hooks/scripts.ts:3701-3732`, `:4118-4136`;
`readsUnattended`, `src/cli/commands/run.ts:1092-1095`). `/st-board pickup` and
`/st-rework` hand the mode to `/st-work` as `run-mode: attended | unattended` (`content/commands/st-board.md:128`,
`:366`; `content/commands/st-rework.md:268-270`), and `/st-debug` hands it over only when attended: an unattended debug
run stops after the root cause and hands nothing to `/st-work` (REQ-FLOW-097; `content/commands/st-debug.md:131-136`);
a hand-off read from disk carries `run-mode: attended` (`content/commands/st-board.md:347-349`;
`content/skills/st-unattended/SKILL.md:31-33`).

- **As built, where the delta differed:** the delta read a head with no `Mode:` line as attended, with no
  exception; the readers above let `STAMITY_UNATTENDED` decide it, and the skill's declaration states that rule
  (`content/skills/st-unattended/SKILL.md:27-28`).
- **Proof:** `test/runs/recordHead.test.ts`, `test/corpus/skills/unattended.test.ts` ("st-unattended — the
  declaration (REQ-FLOW-089)"), `test/hooks/personOnlyGuard.test.ts`, `test/hooks/unattendedAskGate.test.ts`,
  `test/cli/commands/runCheckpoint.test.ts`, `test/cli/commands/runEnd.test.ts` (a head with no `Mode:` line under the
  variable), `test/corpus/commands/work.test.ts`, `test/corpus/commands/board.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/feedbackPair.test.ts`.

### REQ-FLOW-090 — An unattended run asks nothing and says so

Added 2026-10-16 (plan 021 file 1, units `u9-unattended-skill`, `u14b-ask-gate` and `u20-hook-emission`).

Given `Mode: unattended`, When an ask point is reached, Then no question is put: its declared default runs and the
record holds `Default applied:`; Frame's ambiguity gate refuses at the ready check (REQ-FLOW-091), two matching plans
refuse unless the invocation names the plan paths, and an ask with no default returns `BLOCKED_AMBIGUITY`
(`content/skills/st-unattended/SKILL.md:67-72`). On Claude Code a PreToolUse hook on `AskUserQuestion`, with no
fail-closed tail, exits 2 naming the rule and the record or the variable it read, reading no order among records: while
any in-progress record reads `Mode: unattended`; else, with no in-progress record reading `Mode: attended`, while the
variable is set, except when no run is in progress, a closed record reading `Mode: unattended` names the current
branch as its `Branch:`, and the run-ended marker `.stamity/run-ended.json` names that record's run with an `at` at
most 15 minutes old and not after now, its own window for a person-paced final round of several question calls
(`RUN_ENDED_MAX_AGE_MS`, `src/mcp/env.ts:193`, not the pre-flight canary's 120 s, REQ-FLOW-101; pr/41):
`stamity run end --final-round`, the run's last `run end`, writes it, `{ "run": "<run-id>", "at": "<ISO time>" }`, at
that exit; a plain `run end` writes none and removes one there (REQ-FLOW-096), and `stamity run start` deletes it
(Claude Code's final round after that run handed off; on any other branch, or with no fresh marker naming the run, the
variable decides; pr/17, pr/36, pr/37). So a later session on that branch, in the same checkout, finds no marker the
gate honours once the window has passed; one that starts inside its 15 minutes is the residual `SECURITY.md` names
(`SECURITY.md:537-550`). The marker is machine-local: a worktree policy never materializes it into another
worktree, a `.stamity` copy row skipping it and a row naming it refused (`src/worktree/policy.ts:536`, `:589-596`;
REQ-WORKTREE-003), though a `symlink` row over `.stamity` still shares it live. The gate is `UNATTENDED_ASK_GATE_FILE`
and its reasons in `src/hooks/scripts.ts`, wired after every planned PreToolUse row (`src/adapters/claude.ts:924-930`).
The detail lives in the `st-unattended` skill, called by name only in that mode.

- **Proof:** `test/hooks/unattendedAskGate.test.ts` ("the ask gate's five cases (REQ-FLOW-090)", the closed
  record with no marker naming its run, and the marker past its window), `test/cli/commands/runEnd.test.ts`
  and `test/cli/commands/run.test.ts` (the marker's write and delete), `test/adapters/claude.test.ts` (the ask gate's placement),
  `test/hooks/scriptBudget.test.ts`, `test/corpus/skills/unattended.test.ts` ("st-unattended — asks (REQ-FLOW-090)").

### REQ-FLOW-091 — An unattended start needs a ready plan

Added 2026-10-16 (plan 021 file 1, units `u2-coverage-port`, `u3-freshness-contract`, `u13-plan-check` and
`u17-plan-verb`).

Given an unattended start, When `stamity plan check <plan...> [--chain --since <Base>] [--contract <path>] --json` runs,
Then it exits 0 when ready, 1 naming each blocker (`needs-clarification`, `open-questions`, `critical-risk`, `lint-L2` to
`lint-L4`, `lint-structure`, `head-key-missing`, `stale`, `stamp-unresolved`, `freshness-error`, `chain-order`,
`prerequisite-open`, `contract`, `contract-mismatch`, each on its plan; `no-plan` for an input it could not read, in a
top-level `blockers` list beside `plans: []`, nothing checked) and 2 on a usage error, `--chain` without `--since`
among them, and reports L1 `not-checked`, never a blocker (`PLAN_BLOCKER_CODES` and `checkPlans`,
`src/runs/planCheck.ts:57-73`; `src/cli/commands/plan.ts:81-88`, `:122`, `:137`;
`content/skills/st-unattended/SKILL.md:51-55`); a board item that fails pickup's readiness gate returns to `fill` and
is never handed off, so no run starts from it (`content/commands/st-board.md:119-120`). A refusal is a pushed record
and a draft pull request titled `Refused:` where a branch can be pushed, else the reply on the start surface
(`content/skills/st-unattended/SKILL.md:59-63`).

- **As built, where the delta differed:** the delta had a hand-off carrying a failed readiness verdict refuse in the
  flow, and the skill's ready check still says so (`content/skills/st-unattended/SKILL.md:56`); pickup's payload
  carries no readiness verdict (REQ-BOARD-002's "As built" line), so no input reaches that refusal, and the readiness
  gate is pickup's step 4 alone (amended 2026-10-16 in the merge's first fix round).
- **Amended 2026-10-18** (plan 021 file 2, units `v22-plan-check` and, for `--since`, `v3-cloud-skill`'s fix round).
  Given `stamity plan check` and the skill's `spec-plan-coverage.mjs`, which answer alike, When units depend on one
  another in a cycle, Then one `dependency-cycle` finding names it however many units lead into it, and the walk stays
  linear in the plan's units; When a unit's requirement list holds a bare number of three or more digits after a comma
  that follows an id, Then it reads as that id's area with that number, as the dash shorthand does, and prose elsewhere
  reads as today. The blocker codes, exit codes and L1 are unchanged. As built: the walk keeps an on-stack set and a
  done set, marks a unit done after its walk whatever it found, and names the cycle as the trail from the unit found on
  the stack (`Dependency cycle: c1 -> c2 -> c1.`); the bare form is read in a unit's `requirements` field only, its
  comma directly after the last id read, a range's end included, so `REQ-DEMO-001, 002` covers `REQ-DEMO-002`, `, 009`
  is `dangling-requirement`, and `300ms, -50ms` stays `invalid-reference` (`checkCoverage` and `parsePlanUnits`,
  `src/runs/planCoverage.ts`; the twin, `content/skills/st-verify/scripts/spec-plan-coverage.mjs`). One usage rule
  moved beside it: `--since <sha>` alone on one plan is accepted, read as a chain of one, and only `--since` over several
  plans without `--chain` exits 2 (`src/cli/commands/plan.ts:79`, `:87-88`, `:130`; REQ-FLOW-105). Proof:
  `test/runs/planCoverageParity.test.ts` (the 60-unit chain into a cycle, inside the 10-second kill),
  `test/authoring/specPlanCoverage.test.ts` (its `REQ-FLOW-091` describe), `test/cli/commands/plan.test.ts`.
- **Amended 2026-10-19** (plan 021 file 2, unit `w2-plan-reads`, with its fix rounds). Given a plan's head `reads:`
  list, When `stamity plan check` measures its freshness, Then three refusals come before any history count, and no
  chain base exempts them. A path not in git's plain form (an empty, `.` or `..` segment, a leading or trailing
  separator, an absolute path, a backslash) is stale `spelling`, since git reads a trailing separator as "folders only"
  and would count 0 for a file. A path that is a symbolic link, lies under one, or names a folder whose tree at `HEAD`
  holds one is stale `link`, found by an `lstat` walk from the repository root, segment by segment, and by the tree mode
  at `HEAD` (120000), so a checkout that stores links as plain files is caught too: git counts a link's own history,
  never its target's. A path on disk that `HEAD`'s tree holds as no file, folder or gitlink (an untracked or ignored
  file, a path inside a submodule, another letter case on a case-insensitive disk) is stale `untracked`, since git
  counts 0 for it forever. Each is a `stale` blocker at the `reads:` line, its message the path in backticks and then
  its own fix: "is not a plain repository path; write it as git lists it and re-stamp the plan.", "is a symbolic link,
  lies under one, or is a folder holding one at HEAD; list the files the plan read instead, and re-stamp the plan." and
  "is not tracked by git at HEAD, so its history cannot be measured; commit it or drop it from reads, and re-stamp the
  plan.". A head `reads: []` is `head-key-missing` at the `reads:` line: "The head's `reads` must list at least one
  path."; any other value that is not a list of paths keeps "must be a list of paths". `freshness([])`, the engine's
  call, is unchanged, and the report's `freshness.stale[].reason` gains `link`, `spelling` and `untracked`; `moved` and
  `missing` read as before (`StaleReason` and `freshness`, `src/runs/freshness.ts`; `OWN_STALE_MESSAGE` and the head's
  `reads` check, `src/runs/planCheck.ts`). Proof: `test/runs/freshness.test.ts` (the disk-walk link cases skip on Windows, the tree-mode ones run there),
  `test/runs/planCheck.test.ts`, `test/docsPages.test.ts` ("states w2's stale reasons, their messages and the empty
  reads list on REQ-FLOW-091").
- **Proof:** `test/cli/commands/plan.test.ts`, `test/runs/planCoverageParity.test.ts` (the engine's coverage check equals
  the skill's copy), `test/cli/surface.e2e.test.ts`, `test/corpus/cliCallForm.test.ts`,
  `test/corpus/skills/unattended.test.ts` (one case per blocker code), `test/corpus/commands/board.test.ts` ("gates
  readiness in a single pass and hands the payload to work"; no test pins the return to `fill`).

### REQ-FLOW-092 — Every unattended exit is a pushed branch and one draft pull request

Added 2026-10-16 (plan 021 file 1, units `u4-pr-runners`, `u18-run-verb`, `u18b-run-checkpoint` and `u19-run-end`;
`u19`, not on this merge's base, is cited from `bc12cfc3` by the merge's first fix round).

Given `Mode: unattended`, When the run exits by any path, Then `stamity run end` commits an explicit path list, never
`git add -f`, pushes after a clean scan (REQ-FLOW-103) and opens or updates one draft pull request: an open one from the
branch into the default branch, its body replaced only when it ends with this run's marker (else the list posted as one comment), else REST
`POST …/pulls` with `draft: true`, else on a 422 a normal one titled `[DRAFT]`, else `Not done: draft PR not opened`,
exit 1 (0 with a pull request). No call runs `gh pr create`, `gh pr ready`, a merge, a force push, a tag or a push to
the default branch, read by REST; `run start` leaves it for a branch of the run's own
(`content/skills/st-unattended/SKILL.md:76-77`, `:86-107`). The pull request's marker is `runMarker` and its ladder
`ensureDraftPr` (`src/runs/pullRequest.ts:82`, `:241`), which `run end` and `run checkpoint --pr` take through
`draftPr` (`src/cli/commands/run.ts:1269-1313`). `run end` runs the checkpoint's commit, scan and push
(`src/cli/commands/run.ts:250`), then the pull-request step on every `end` that reaches it, `--refused` giving the
`Refused: <title>` title (`:960-972`).

- **As built, where the delta differed:** not every exit reaches the pull request. A held path, a scan hit or a
  refused push returns before that step, so `run end` exits 1 with no pull request opened or updated
  (`src/cli/commands/run.ts:898-907`, `:909-928`, `:947-955`). Nor does an exit whose origin moved: `run start` pins
  origin's repository in the run folder's `origin.json` once the run is on its branch, so a pin a checkpoint committed
  there is the one compared (pr/4), read from its fetch URL and from every push URL as git resolves it (`insteadOf`
  and `pushInsteadOf` applied), and `run checkpoint` and `run end` resolve them again before they stage, refusing as
  `origin changed: …` where one names another repository and, unattended, as `origin not pinned: …` where no pin is
  readable, with nothing committed, pushed or opened (`pinOrigin` and `originRefusal`,
  `src/cli/commands/run.ts:430-477`, called at `:298`, `:332` and `:740`). A refused open names its cause,
  `draft PR not opened (<branch>): <cause>`, by class and never in `gh`'s or GitHub's own words (`ensureDraftPr`,
  `src/runs/pullRequest.ts:241-245`; `ghFailure` and `rejection`, `:196-219`).
- **Amended 2026-10-19** (plan 021 file 2, units `w1-checkpoint-hook-paths`, with its two fix rounds, and
  `w5-ask-pages`; ledger row `review/149`). Given a checkpoint marker left in the work tree's git directory
  (REQ-FLOW-093), Then `run end` refuses before its commit, its scan, its push and its pull-request step, so that exit
  opens or updates no draft pull request, one more of the exits that open none, beside the held path, scan hit,
  refused push and changed origin the bullet above names (`runCheckpoint`, the marker's refusal,
  `src/cli/commands/run.ts`). The skill's cloud reference, which the body's last line names for every unattended run, has the run copy the refusal into the record and `## Not done:` and stop: it
  never removes the marker or resets the run branch, since the refusal's remedy is a person's
  (`content/skills/st-unattended/references/cloud.md`, "A checkpoint marker"; `SKILL.md`'s last line).
- **Amended 2026-10-19** (plan 021 file 2, units `n1-eval-ending` and `n2-pending-marker`; written by
  `n6-night-pages`). The paths `run end` commits are its `--paths` and its own: `--paths` names the files the run
  changed, every unit's files named again though each was committed at its checkpoint, and each learning file the close
  captured. The run folder's files (`record.md`, `ledger.jsonl`, `plan.md`, `morning.md`, the origin pin) and
  `.stamity/inbox.md` are staged by the verb itself (`RUN_FILES` and `runOwned`, `src/cli/commands/run.ts`;
  `content/skills/st-unattended/SKILL.md:101-102`). A `--paths` entry naming a path the run already committed is
  harmless: an unchanged file stages nothing and adds no `notDone` line, and a path neither the work tree nor the index
  holds that a commit since `Base:` touched (a deletion an earlier checkpoint committed, or a file the run created and
  later deleted) is left out silently; a path never tracked keeps `not staged: <path> (no such file)` (`namedPaths` and
  `committedDeletions`, `src/cli/commands/run.ts`).
  - Proof: `test/cli/commands/runEnd.test.ts` (the describe for a `--paths` entry an earlier checkpoint committed),
    `test/corpus/skills/unattended.test.ts` ("says what run end's --paths names and what the verb stages itself").
- **Proof:** `test/runs/pullRequest.test.ts`, `test/cli/commands/run.test.ts`, `test/cli/commands/runCheckpoint.test.ts`,
  `test/cli/commands/runEnd.test.ts`, `test/cli/surface.e2e.test.ts`, `test/corpus/skills/unattended.test.ts`
  ("st-unattended — checkpoints and the ending").

### REQ-FLOW-093 — An unattended run checkpoints as it goes

Added 2026-10-16 (plan 021 file 1, unit `u18b-run-checkpoint`).

Given `Mode: unattended`, When a unit closes or the run is about to wait, Then `stamity run checkpoint` commits the
explicit path list and pushes the run's branch under the limits of REQ-FLOW-092, and with nothing staged commits nothing
and pushes only when the branch is ahead; the draft pull request opens when Build starts; the record, ledger, plan and
morning list ride the branch wherever git does not ignore them (an ignored one reads `records: not committed`)
(`content/skills/st-unattended/SKILL.md:76-84`; `runCheckpoint`, `src/cli/commands/run.ts:658`). A tracked run-owned
file the work tree lost is staged as its deletion, and one whose deletion `git rm` already staged is committed, not
refused as staged and not in `--paths`; a link stays out, as before (pr/79; `src/cli/commands/run.ts:755-763`, the
stray check `:872`, the index read `indexTracked`, `:1129-1139`, which `--paths` shares, `:1116`).

- **As built, where the delta differed:** the checkpoint does not always push. Where a commit the push would send
  changes a held path, or `HEAD`'s tree still does, it pushes nothing and exits 1 (REQ-FLOW-102's "As built" line;
  `src/cli/commands/run.ts:898-907`). A symbolic link the change adds or retypes at a held glob's folder (`.claude`,
  `.github/workflows`, any folder's `.vscode`) counts as a held path there and in the held patch (`heldOf`, `:1042-1047`,
  over the raw diff's modes, `:1002-1015`); a held path staged and then edited again carries both layers there, the
  staged change and the index-to-work-tree one after it (pr/6, `:809-818`). Nor does it push once origin no longer
  names the repository `run start` pinned: it exits 1 as `origin changed: …` before it stages (REQ-FLOW-092's "As
  built" line; `:740-744`), and the pin rides the branch with the record (`RUN_FILES`, `:159`). Nor does it commit a
  path staged before it ran that is none of the run files, the held paths and patches or `--paths` (a folder entry
  covering what is under it): it exits 1 as
  `commit refused: <path> is staged and not in --paths` (pr/5; `strayStaged`, `:1180-1189`, called at `:871-880`).
  "Ahead" is read from the remote's own branch, in the one `git ls-remote origin` a checkpoint makes, never a
  remote-tracking ref a deletion on the remote left stale (pr/20). The same read's branches and tags are what both
  history reads take origin to hold, all of `HEAD`'s history where it names none, and a remote it cannot read holds
  the push before the commit as `push held: origin's branches and tags could not be read (…)` (pr/46; `remoteRefs`,
  `:518-532`, called at `:862-867`). A pushed code file the scan could not read leaves the push and the exit as they
  are and adds `secret scan: <n> files unscanned (<paths>)` to `notDone[]` (pr/7; `:923-926`), which the skill copies
  on any exit.
- **Amended 2026-10-18** (plan 021 file 2, unit `v21-run-verbs`, its fix round and the run-verbs fix round). Given an
  unattended checkpoint and a held path absent at `Base:`, staged as new and then deleted from the work tree, Then the
  held patch carries no section for it and the `held` line still names it; a held path whose deletion is staged while
  the work tree has a file there gets a new-file part after the deletion; so the patch applied on `Base:` gives the work
  tree's bytes. A held patch the branch already carries is kept and listed while the work tree holds no held change.
- **As built, beyond the delta:**
  - The held line names the first path `<path> (staged, then deleted: no section)`; it is still restored out of the
    index. The new-file part is built without touching the real index: the file is stored with `git hash-object -w
    --path=<path>`, its folders with `git mktree -z`, and the part is the diff from the empty tree to that tree
    (`untrackedOf` and `workTreeAddition`, `src/cli/commands/run.ts`).
  - A kept patch is read from the commit `HEAD` carries (`committedPatchPaths`); its paths join `held`, the held line
    reads `held (kept in <patch> from an earlier checkpoint; the work tree holds no held change): …`, and one that cannot
    be parsed fails the checkpoint as `hold failed`, never a removal. A patch no commit carries is still removed.
  - The raw reads take `--no-abbrev` (`RAW_IDS`), so a short `core.abbrev` cannot split an object id and let a link at a
    held prefix escape holding.
  - A `--paths` entry whose deletion `git rm` already staged against `HEAD`, a file or a folder holding one, is
    committed as that deletion, left out of `git add` and of the ignore check; a held path stays held (`namedPaths` and
    `stagedDeletions`, `src/cli/commands/run.ts`). It was refused as staged and not in `--paths`.
  - Proof: `test/cli/commands/runCheckpoint.test.ts` (the staged-then-deleted case, the three re-added cases, the
    `core.abbrev 6` cases, the kept patch on a fresh clone, and the describe "a --paths entry whose deletion is already
    staged").
- **Amended 2026-10-19** (plan 021 file 2, unit `w1-checkpoint-hook-paths` and its two fix rounds, ledger rows `pr/1`,
  `review/136` to `review/139`, `review/142` and `review/143`; written by `w5-ask-pages`). Given a checkpoint or `run end`
  with something staged, When the repository's pre-commit hooks run inside its commit, Then the verb reads `HEAD` before
  the commit and, after it, needs `HEAD^` to be that commit and every path of `git diff --name-only <before> HEAD` to be
  in the set the stray check allows (the run files, the inbox, `--paths` and the folders it names, the deletions, the
  held patches and the held paths). Otherwise it rewinds the run branch by name with a compare-and-swap,
  `git update-ref refs/heads/<run-branch> <before> <the commit it checked>`, refusing where `HEAD` has left that
  branch; reports `committed: null`; adds `commit refused: <path> was staged by a hook and is not in --paths (commit
  undone)` for each such path, or `commit refused: a hook made a commit of its own (commit undone)`, and the line
  `commit: undone (…)`; and exits 1 before the scan and the push. Attended and unattended alike; held paths stay in the
  allowed set, so a hook that stages a held path keeps REQ-FLOW-102's refused push. The `Checkpoint` JSON shape is
  unchanged.
  - Before the commit the verb creates `stamity/checkpoint-pending` exclusively under the work tree's own git directory
    (`git rev-parse --git-dir`), holding the `HEAD` it read, and removes it once its commit reads clean, before the scan
    and the push, or once an undo succeeds. A check that cannot finish, a failed undo
    (`commit not undone: …; HEAD holds <sha>, reset target <before>`) or a throw (`commit not checked: …`) leaves it,
    adding `checkpoint marker left: <path> records <before>, …`, and exits 1 with no push. While it exists, every later
    `run checkpoint` and `run end` refuses, a call with nothing staged included, as `commit and push refused: <path>
    records <before>, …`, committing and pushing nothing; so "with nothing staged commits nothing and pushes only when
    the branch is ahead" holds only with no marker. Commits made outside the run verbs push as before (`hookWidened`,
    `undoCommit`, `markerPath`, `takeMarker`, `dropMarker` and `markerRefusal`, `src/cli/commands/run.ts`).
  - Proof: `test/cli/commands/runCheckpoint.test.ts`, `test/cli/commands/runEnd.test.ts`.
- **Amended 2026-10-19** (plan 021 file 2, unit `n2-pending-marker` and its fix round, ledger rows `review/148` and
  `review/176` to `review/180`; written by `n6-night-pages`). The marker is read before anything is staged: after the
  repository's top level is resolved, before any `git add`, held-patch write or index restore, a marker at its path, or
  a link or a folder there, refuses the call as `markerRefusal` does, so the index and `held/person-only.patch` stay as
  the unchecked commit left them; a dry run reads none. The verb's earlier steps still run, `refs/remotes/origin/HEAD`
  pointed at the default branch REST names among them (`alignOriginHead`). Given a commit that does not finish, Then
  off Windows the commit's git runs as the leader of a process group of its own, which the wall time stops, a `SIGTERM`
  and, where the group outlives a grace, a `SIGKILL`, and waits for (`processGroup`, `gitWrite`,
  `src/cli/engine/gitWrite.ts`); where that group is gone, `<git-dir>/index.lock` is absent and `HEAD` still names
  `before` on the run branch, each at the time it was read, no commit landed: the verb removes the marker, adds
  `commit not made: <cause>`, exits 1 and pushes nothing, so the next call runs. Every other case keeps the marker and reports `commit not checked`: Windows, an output past the
  runner's buffer cap, and a stop by a signal the runner did not send; an interrupt that stops the verb but not git's
  group keeps it too, while git and its hooks run on with no wall time (`groupGone` and the commit's catch,
  `src/cli/commands/run.ts`). A hook that detaches its own child, or starts its own process group, leaves the group, so
  that child can land a commit after the clear, and the next checkpoint pushes it without the hook-widening check; an
  unattended run's held paths and the secret scan still read that push (`SECURITY.md`, "Hooks the run writes").
  - Proof: `test/cli/commands/runCheckpoint.test.ts` ("answers a commit whose whole process group was stopped and is
    gone: …"), `test/cli/commands/runEnd.test.ts`, `test/cli/engine/gitWrite.test.ts`.
- **Proof:** `test/cli/commands/runCheckpoint.test.ts`, `test/cli/commands/run.test.ts`,
  `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-094 — The morning list

Added 2026-10-16 (plan 021 file 1, units `u5-morning` and `u9-unattended-skill`).

Given an unattended run, Then `.stamity/runs/<run-id>/morning.md` is the source and the pull request body is
regenerated from it, ending `<!-- stamity:run <run-id> -->`, after a secret scan: a pre-flight refusal's reason first
(`## Refused`); the person's QA rows (at most three) and the proven line; decisions (consequential defaults applied,
`decision-waiting` leftovers, the spec delta merge, board proposals); prerequisites, each kind · name · read where · set
by · blocks merge, deploy or run · verified yes or no, never a value, a row found in the diff marked `inferred`; person's
calls held; `Not done:`. A section with no rows reads `none` (`content/skills/st-unattended/SKILL.md:111-124`;
`MORNING_SECTIONS`, `parseMorning` and `prBodyFrom`, `src/runs/morning.ts`; `inferPrerequisites`,
`src/runs/prerequisites.ts`).

- **Proof:** `test/runs/morning.test.ts`, `test/runs/prerequisites.test.ts`, `test/corpus/skills/unattended.test.ts`
  ("st-unattended — the morning list and the walk").

### REQ-FLOW-095 — The morning walk

Added 2026-10-16 (plan 021 file 1, units `u9-unattended-skill`, `u14b-ask-gate` and `u15-work-text`).

Given an unattended run whose record is closed, When `/st-work --resume <run-id>` runs, or `/st-work` on its branch,
Then it reopens the close under a record of its own reading `Mode: attended`, whatever `STAMITY_UNATTENDED` sets,
citing the first run, walks the morning list through the client's question tool in rounds, applies the answers on the
same branch, pushes and refreshes the pull request body; an invocation that itself declares the start unattended
(`--unattended`, a hand-off's `run-mode: unattended`, or a chain's next file) takes the unattended entry on that branch,
never the walk (`content/commands/st-work.md:412-415`, `content/skills/st-unattended/SKILL.md:142-147`); on a run still
in progress `--resume` refuses, naming the continuation. In Claude Code's cloud the run closes its record, ends on
`run end --final-round`, then asks one final round (REQ-FLOW-090); on Cursor, follow-ups on its pull request's comments; on Copilot, one
`@copilot answers: Q1→2, Q3→1` comment; locally, the touchpoint (`content/skills/st-unattended/SKILL.md:149-153`).

- **As built, where the delta differed:** the skill names no client in that last sentence: it names each way back by
  what the client does (a session that stays open, a cloud agent taking follow-ups on its pull request's comments, one
  answering a mention as `@<agent> answers: …`), `@<agent>` written as the literal mention of the client the run is on.
  `parseAnswers` (`src/runs/morning.ts`) reads the answers.
- **Amended 2026-10-18** (plan 021 file 2, unit `v0d-guard-pages`). Given the morning walk and a held person-only act
  the morning list names, When the walk reaches it, Then the walk runs it, the client's approve prompt being the
  person's one click, on Claude Code; a REQ-FLOW-124 act, every held act on Copilot CLI, Cursor and Codex, and every held
  act in Claude Code's cloud final round (where `STAMITY_UNATTENDED` stays set, so the guard still refuses) are handed
  to the person as the exact command, which the walk does not run. The walk's entry, its rounds and the answers' mapping
  are unchanged. As built: the skill names the clients by what their guard does, never by name, "a deletion, a force
  push and every held act a client's guard refuses to ask for go to the person as the exact command", and its walk
  section also counts the commits after the last checkpoint on `## Not done:` (REQ-FLOW-116), since an attended walk
  reads that section and not the cloud reference (`content/skills/st-unattended/SKILL.md:141-147`); the final round's
  sentence says the variable, still set, keeps the guard refusing (`:149-153`). Proof:
  `test/corpus/skills/unattended.test.ts` ("the ask rule, the run verb's line and the walk's held acts"), and the five
  unattended eval briefs re-quoted at the lines that moved (`test/evals/locators.test.ts`).
- **Proof:** `test/corpus/skills/unattended.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/hooks/unattendedAskGate.test.ts` (the final round's branch), `test/runs/morning.test.ts`.

### REQ-FLOW-096 — An unattended plan chain

Added 2026-10-16 (plan 021 file 1, units `u3-freshness-contract`, `u9-unattended-skill` and `u13-plan-check`).

Given `stamity plan check a b c --chain --since <Base>`, When each file's head `depends_on` names the file before it, Then
one unattended invocation runs the chain on one branch, each file its own run and record, stopping at the first
`BLOCKED_*`, with one draft pull request and one merged morning list; otherwise the blocker `chain-order` refuses. A
`reads` path that only commits after the chain's run base moved is exempt from the freshness guard; a path a commit
between the stamp and that base moved stays stale (`content/skills/st-unattended/references/chains.md:12-18`;
`freshness`, `src/runs/freshness.ts`). Only the chain's final round passes `--final-round`: the last file's
`stamity run end`, the last file being the chain's last or the first to stop at a `BLOCKED_*`. Every other file's
`run end` takes no flag, so it writes no run-ended marker and removes one already there, and the ask gate
(REQ-FLOW-090) puts no question through between two chain files; a flag left out refuses the final round rather than
opening a middle one (`content/skills/st-unattended/references/chains.md:20-22`; `src/cli/commands/run.ts`, pr/25,
pr/37).

- **Proof:** `test/corpus/skills/unattended.test.ts` ("st-unattended — the other touchpoints and chains"),
  `test/corpus/commands/work.test.ts`, `test/cli/commands/plan.test.ts`, `test/cli/commands/runEnd.test.ts` (the gate
  refuses a question between two chain files).

### REQ-FLOW-097 — The other touchpoints, unattended

Added 2026-10-16 (plan 021 file 1, units `u10-board`, `u10b-debug-quick` and `u11-rework-pr-resolve`).

Given `Mode: unattended`, When another touchpoint runs, Then `/st-quick` refuses, naming `/st-work --effort light`
(`content/commands/st-quick.md:20-21`); every unattended `/st-debug` run and `/st-pr-resolve` (in a record of its own,
`Branch:` its pull request's head) take the unattended entry without the ready check — `Mode:`, `Branch:`, `Base:`, the
`st-unattended` skill, the pre-flight before the first fetch or push, pushes only through `stamity run checkpoint|end`,
every reply posted from a file `gate scan --text` passed, and no exit leaving the record in progress
(`content/commands/st-debug.md:56-68`; `content/commands/st-pr-resolve.md:54`). `/st-pr-resolve` fetches its pull
request's head branch by name into origin's remote-tracking ref, so the run verbs' history check reads only the commits
the round adds, runs `run start` once that head is checked out on `Base:` and before the first fix, fixes only the
mechanical class and sends nothing to `/st-work`, every other finding deferred as `needs a planned run`. Unattended `/st-debug` stops after the root cause and hands nothing to `/st-work`: it
pushes its record, the ranked hypotheses and the failing test when one was written, and the morning list carries the fix
as `needs a planned run`; a user-route stop strips its instrumentation, takes the skill's ending and returns
`BLOCKED_DEPENDENCY` (`content/commands/st-debug.md:134-136`, `:108-115`).
`/st-rework` passes the mode to `/st-work`; `/st-board pickup` carries it, keeps `preview: stop`, its board writes land
as morning-list rows (`content/skills/st-unattended/SKILL.md:155-168`).

- **As built, where the delta differed:** the delta had `/st-pr-resolve` run no `run start`, so no origin pin would be
  written and its every checkpoint and `run end` would refuse as `origin not pinned`. Its Unattended row runs
  `stamity run start --run <its id> --json` once the head is checked out on `Base:` and before the first fix
  (`content/commands/st-pr-resolve.md:54`). On that branch, never the default since the row refuses a default-branch
  head, `run start` keeps the branch and writes the run folder's `origin.json` (`src/cli/commands/run.ts:283-300`). It
  still runs no `stamity plan check`, and a `run start` that fails takes the row's refusal exit: nothing pushed, one
  scanned comment on the pull request, the record closed as refused.
- **Proof:** `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/feedbackPair.test.ts` ("feedback pair —
  unattended"), `test/corpus/commands/board.test.ts`, `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-098 — The run contract file

Added 2026-10-16 (plan 021 file 1, units `u3-freshness-contract` and `u13-plan-check`).

Given a file carrying `run-contract: 1`, When `stamity plan check --contract <path>` parses it strictly, Then it takes by
reference the plan path or board item, the base, the acceptance verbatim, the scope, prerequisites each done or owned,
a budget (stop-by, max units) and who answers the morning list, and fixes `preview: stop` and `move: off`; an unknown
field is refused, `run-contract: 2` is refused naming version 1, and a prerequisite neither done nor owned is the
blocker `prerequisite-open` (`RUN_CONTRACT_VERSION`, `PREREQUISITE_OPEN` and `parseRunContract`,
`src/runs/runContract.ts:45-48`, `:101`). No trigger is built; the contract's public page belongs to the next file.

- **Proof:** `test/runs/runContract.test.ts`, `test/cli/commands/plan.test.ts`, `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-099 — Screened reads and loaded floors, unattended

Added 2026-10-16 (plan 021 file 1, units `u7-learn-read`, `u8-preflight-core` and `u9-unattended-skill`).

Given `Mode: unattended`, When the run starts, Then it loads the question protocol and the injection-screening rule by
name and the record names both (`content/skills/st-unattended/SKILL.md:41-42`; `REQUIRED_FLOORS`,
`src/runs/preflight.ts:129`); learnings come from the session-start banner, else `stamity learn read` (`--body <id>`
for one body) beside `stamity handoff list`, else the session-start script run by hand, never a file opened with the
file tools (`SKILL.md:43-46`); `learn read` screens with the write gate's whole catalog, exfil rows included, lists a
refused file by its pattern ids with no span, and exits 1 when the folder cannot be listed or a `--body` id is skipped
or unknown (`runRead`, `src/cli/commands/learn.ts:507`; `src/learnings/store.ts`).

- **Proof:** `test/cli/commands/learn.test.ts`, `test/corpus/skills/unattended.test.ts` ("loads both floors by name and
  records them (REQ-FLOW-099)", "reads learnings only through the screen, never with the file tools").

### REQ-FLOW-100 — Input by reference, from write or admin authors

Added 2026-10-16 (plan 021 file 1, units `u9-unattended-skill`, `u10-board`, `u11-rework-pr-resolve` and
`u12-protocol-plan-shape`).

Given `Mode: unattended`, When input reaches the run, Then items come by id or path only
(`content/skills/st-unattended/SKILL.md:47-50`); the board's author rule applies on every repository (REQ-BOARD-005;
`content/commands/st-board.md:313-318`); `/st-pr-resolve` reads each author's permission through the endpoint
REQ-BOARD-005 names and routes a finding no `admin` or `write` author's own comment asks for to DEFER, reported
`non-write author` with a morning-list row and never fixed, an unreadable permission counting as none
(`content/commands/st-pr-resolve.md:168`, `:239`); the question protocol's item 8 adds that a kickoff prompt, routine
text or contract field never answers a person-gate (`content/rules/stamity-question-protocol.md:57`).

- **Proof:** `test/corpus/commands/feedbackPair.test.ts`, `test/corpus/commands/board.test.ts` ("applies the author
  rule on every repository when the run is unattended"), `test/corpus/rules/protocol.test.ts`,
  `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-101 — The unattended pre-flight

Added 2026-10-16 (plan 021 file 1, units `u8-preflight-core`, `u14-shell-guard` and `u16-gate-verbs`).

Given `stamity gate preflight --unattended [--item <ref>] --json`, Then it exits 1 when the hooks canary is absent or
older than 120 s (the shell guard writes it for the pre-flight's own command), `node` falls outside `engines`, the
pinned CLI is unreachable, `gate scan` cannot run, the item's author is not `admin` or `write`, or REST does not prove
the account cannot push to the default branch of the `origin` repository (no protection, a direct-push bypass, a 403, a
404, a non-GitHub origin, or `GH_REPO` naming another repository; a pull-request-only bypass passes). It warns on Cursor
egress, token-shaped variable names (names only) and missing review state; with no refusal it exits 0
(`CANARY_MAX_AGE_MS`, `src/mcp/env.ts:190`; `directPushVerdict` and `runPreflight`, `src/runs/preflight.ts:474`,
`:856-880`; the verb in `src/cli/commands/gate.ts`, its flags at `:2082-2085`).

- **Amended 2026-10-18** (plan 021 file 2, units `v5-claude-readiness` and `v8-detect-translator`). Given `direct-push`
  refusing because origin's https push goes through a credential helper other than gh's alone, Then its fix is one
  sequence run in the repository, an empty `credential.helper` entry that resets the list, then
  `!gh auth git-credential` added after it, which leaves gh's helper the only entry whatever the system or global
  configuration holds, a helper `gh auth setup-git` wrote through a shim included; the fix names no `--global` or
  `--system` write and echoes no value. The pre-flight's JSON `client` and `cloud` fields and its Cursor egress warning
  are read through the one session detector (REQ-FLOW-085's; amended 2026-10-18 with the delta's correction, it read
  "REQ-FLOW-080's"), so: `CLAUDE_CODE_REMOTE` counts only as exactly `true`
  (`1` is not a cloud), `GITHUB_ACTIONS` alone reads as a cloud, a `CURSOR_AGENT_SOCKET` of `0` or `false` no longer
  warns, and marker values are no longer trimmed or lower-cased; these are labels, and none selects an unattended run.
  The checks, their states and the other fixes are unchanged.
- **As built, beyond the delta:** the fix's text says a credential helper entry later in the repository's own
  configuration is read after the two, so they must come last (`GH_HELPER_FIX`, `src/runs/preflight.ts:152-158`);
  `CLAUDECODE` alone still names `claude` with `cloud: false` (`setIn`, kept for that marker alone, in
  `src/cli/commands/gate.ts`); the egress warning reads the detector's markers (`src/runs/preflight.ts:898-899`); and
  `hooks-loaded` gains Claude Code's cloud refusal of REQ-FLOW-112 (`:497`, `:501-512`). Proof:
  `test/cli/commands/gatePreflight.test.ts` ("the helper advice, run literally"; "reads the client and cloud fields and
  Cursor's egress warning through detectSession (v8)"), `test/runs/preflight.test.ts`, `test/session/detect.test.ts`.
- **Proof:** `test/runs/preflight.test.ts`, `test/cli/commands/gatePreflight.test.ts`,
  `test/hooks/personOnlyGuard.test.ts` (the canary), `test/mcp/env.test.ts`, `test/cli/commands/init.test.ts` and
  `test/cli/commands/initPanel.test.ts` (the canary's ignore entry).

### REQ-FLOW-102 — Person-only acts that can be undone ask, attended; person-only paths are held

Added 2026-10-16 (plan 021 file 1, units `u6-person-only-tables`, `u14-shell-guard`, `u18b-run-checkpoint` and
`u20-hook-emission`).

Given any session, When the main thread runs a force push, a push of a tag or of the default branch (named, or implied
by a refspec-less push or `HEAD` while on it), a remote branch deletion, a merge, `gh pr ready`, `gh release`,
`npm publish`, or a `gh secret`, `gh variable`, protection or ruleset call, Then Claude Code's `permissions.deny` and
shell guard, Cursor's fail-closed `beforeShellExecution`, and Copilot's and Codex's `preToolUse` checks refuse it
(`PERSON_ONLY_RULES`, `CLAUDE_DENY_ROWS` and `personOnlyVerdict`, `src/hooks/personOnly.ts:71`, `:140`, `:263`;
`SHELL_GUARD_MATCHERS`, `src/emit/hooksInfra.ts:156`). Unattended, a change to CI, hook or guard configuration
(`.stamity/generated/`, the manifest), the class file, CODEOWNERS, the charter or the rule and instruction files is held
off the pushed tree as an inert patch, listed (`PERSON_ONLY_PATHS` and `heldPaths`, `src/change/personOnlyPaths.ts:26`,
`:103`; `content/skills/st-unattended/SKILL.md:134-138`).

- **As built, where the delta differed:** the patch holds a held path only where the run's change touches it in the
  work tree or the index. Where a commit the push would send (one `origin` lacks) changes a held path, or `HEAD`'s tree
  still does after the commit, `run checkpoint` and `run end` refuse the push instead: they exit 1 naming
  `held path in history (<path>)` or `held path in the pushed tree (<path>)`, push nothing and rewrite no history, so
  the branch stays unpushed until a person rewrites it (`src/cli/commands/run.ts:898-907`; `heldInHistory`,
  `:1073-1085`).
- **As built, PR #112's fourth round (2026-10-18):** the table reads a `git symbolic-ref` write: one naming a tag
  (`refs/tags/` or `tags/`, a delete included) is refused as a tag, and one pointing any name but `HEAD` at the default
  branch, or at a target holding `$` or a backtick, as a push of that branch to come (pr/70; `symbolicRefVerdict`,
  `src/hooks/personOnly.ts:964-995`, dispatched at `:1378`). It refuses as protection, attended or not, the GraphQL
  repository-settings, branch protection rule, ruleset and custom-property mutations (pr/74, pr/80; `:1192-1197`) and a
  REST write under `properties/` beside the ruleset rule (pr/80; `:1258`). An HTTP call whose method or targets the
  line hides throws `HTTP_TARGET_HIDDEN`, which the guard refuses as a call it cannot decide: a curl or wget
  configuration file the line names, a curl write whose target curl's globbing would expand unless `-g` or
  `--globoff` is set, and a wget write reading `-i` (pr/73, pr/76, pr/77; `httpCall`, `:647-650`, and the unattended
  copy, `:1798-1801`). Claude Code's deny rows gain the GitHub MCP server's `create_pull_request` (pr/78; `:210`).
  What stays open is REQ-FLOW-104's: a symbolic ref already on disk, a branch switch on the same line before a push
  whose destination is implied, and curl's and wget's default configuration files.
- **As built, PR #112's round 4b (2026-10-18):** a curl body counts as one in every spelling, attached (`-d@<file>`,
  `-d'{…}'`, `-F<field>`, `-T<path>`) or as a short cluster's first value letter (`-sd@<file>`), as it does apart: the
  word is read as the letters before the body letter, the letter and its value (pr/81; `httpCall`,
  `src/hooks/personOnly.ts:675-689`, and the unattended copy, `:1826-1840`). The symref commands of a
  `git update-ref --stdin` text the line carries (`symref-create`, `symref-update`, `symref-delete`, git 2.46) are read
  as `git symbolic-ref`'s arguments, by its rules, a target the line cannot show, a printf placeholder among them,
  read as the default branch (pr/82; `:1367-1377`). An HTTP method held in a variable or a substitution (`-X "$M"`,
  `--request "$(…)"`, wget's `--method` or a wgetrc `method=`) throws `HTTP_TARGET_HIDDEN` (pr/83; `:775-776`, and the
  unattended copy, `:1926-1927`). What stays open is REQ-FLOW-104's: a REST target held in a variable, and a
  `--stdin` text read from a file.
- **As built, PR #112's round 4d (2026-10-18):** a symref command in a `git update-ref --stdin` text is read wherever
  it stands, so a second one after an escaped line break (`\n`, `\0` with `-z`, `\x0a`, `\012`, a `%b` placeholder)
  is read as the first is, and a Unicode or four-digit octal escape ends a word of one (pr/82; `:1367-1377`). curl's
  read-apart pass takes the method letter with the body letters, so a short cluster's attached method is read whatever
  it holds (`-sXDELETE`, `-sX$M`, the second refused as hidden), a letter after another value letter being that
  letter's value (`-oX`, `-od`), and gh's `-i` is read apart from the value letter it clusters with, its `=` aside as
  gh reads it (`-iXDELETE`, `-X=DELETE`, `-F=event=APPROVE`); the letters-only cluster branch is gone, and a method
  word the line ends before, an unquoted substitution having cut it, throws `HTTP_TARGET_HIDDEN` (pr/83; `:675-689`,
  `:750-751`, and the unattended copy, `:1826-1840`, `:1901-1902`). curl's long options are read from a unique prefix
  of two letters or more, as wget's are, a full name kept as it is (`--req`, `--dat`, `--upl`; `--co` read as
  `--config`; pr/84; `:652-666`, and the unattended copy, `:1803-1817`). What stays open is REQ-FLOW-104's: a symref
  command word the line cannot show.
- **As built, PR #112's round 5 (2026-10-18):** each HTTP target is read twice, as written and with its dot segments
  resolved (RFC 3986 §5.2.4), as curl sends it, before the repository cut, so a protected route reached through a `.`
  or `..` segment, the repository's own path climbing out of another repository's among them, is refused as that route
  in both verdicts; a rule matching either reading denies (pr/93; `httpCall`, `src/hooks/personOnly.ts:779-807`, and
  the unattended copy, `:1930-1958`). `gh repo sync` naming a destination repository, its branch and source values
  skipped when finding it, is a force push under `--force`, and otherwise a push of the default branch unless
  `--branch` names another branch the line shows; a sync of the local checkout, with no repository named, stays
  allowed attended (pr/94; `ghVerdict`, `:1033-1055`). `gh repo unarchive` is refused as protection beside
  `gh repo archive` (pr/96; `:1029-1032`), and Claude Code's deny rows gain `Bash(gh repo unarchive:*)` (`:189`). The
  guard's tag read faults past 10,000 tag names, a name both loose and packed counted once, or past an 8 MiB
  `packed-refs` file, naming `TAG_NAMES_OVER_10000` or `PACKED_REFS_OVER_8388608`, so a push naming a refspec in that
  repository is refused as a call the guard cannot decide rather than read against a cut-off list (pr/95; `localTags`,
  `src/hooks/scripts.ts:3624-3668`; the ceilings, `:3093-3098`). What stays open is REQ-FLOW-104's tag ceiling.
- **Amended 2026-10-18** (plan 021 file 2, units `v0a-ask-then-act`, `v0a2-ask-emission` and `v0b-run-verb-alone`,
  with their fix rounds; the heading read "Person-only acts are denied on every client, and person-only paths are
  held"). Given an attended session, When the main thread runs a person-only act that can be undone (a merge in any
  form: gh, REST, GraphQL, the merge queue, the MCP merge row; marking ready; a review approval; a non-forced push or
  sync of the default branch; creating or pushing a tag; a release create, edit or upload; a publish or dist-tag; a
  secret or variable write; a protection, ruleset or custom-property write; a repository's settings, name, archive state
  or default branch), Then the client asks (REQ-FLOW-123) and the agent runs it on yes; the acts of REQ-FLOW-124 stay
  refused, and the held-path half of this requirement is unchanged. So the requirement's first paragraph, "Then …
  refuse it", reads for those acts as "Then the client asks or refuses by REQ-FLOW-123", and stands whole for the acts of
  REQ-FLOW-124.
- **As built, beyond the delta:**
  - `personOnlyVerdict` returns `{ deny: true, rule, act, reason, ask }` for every person-only line: `deny` stays true,
    so the run verbs' push check refuses as before, and `ask` is true only when every act the line holds is ask-class
    (`PersonOnlyVerdict` and `PERSON_ONLY_RULES`, each rule carrying `ask`, `src/hooks/personOnly.ts`). Every act is
    collected — each segment, each call `--next` joins, each path of a call, each rule one REST path matches, each flag
    of one gh call, each field of one REST body, each GraphQL mutation and `updateRefs` entry — and the first
    refuse-class act is the verdict, so a deletion never rides an approval.
  - The ask-class rules are `push-default` (with plain `gh repo sync`), `push-tags`, `tag`, `pr-merge`, `pr-ready`,
    `release`, `publish` (with `npm dist-tag add`, pnpm's and yarn's `dist-tag add` and yarn's `tag add`), `secrets`
    (a user's Codespaces secret written by REST included) and `protection`, which also reads a deployment environment's
    write and a write to its deployment protection rules or branch policies, an environment name holding a slash
    included, and `gh repo edit` with no flag.
  - `gh variable get` is a read. The shell reading, in both copies: an unquoted `$(…)`, backtick or `(` stays a word of
    its command; wget's `-X` is no method; a gh option placed before the subcommand, or before `api`, is read as gh
    reads it, with its value; PowerShell's typographic quotes open and close quotes.
  - Proof: `test/hooks/personOnly.test.ts` (each DENY row's class, and the `CLASSES` conformance rows),
    `test/hooks/personOnlyGuard.test.ts`, `test/cli/commands/runCheckpoint.test.ts` (the push stub's verdict).
- **Amended 2026-10-19** (plan 021 file 2, units `w1-checkpoint-hook-paths`, `w4-copilot-ask` and `w5-ask-pages`).
  The run verbs still rewrite no pushed history, and the held-path refusal above still rewrites none; the one rewind
  they make is of their own commit, unpushed, that a pre-commit hook widened: they move the run branch by name from the
  commit they checked back to the `HEAD` read before it, a compare-and-swap (`git update-ref`), never whatever `HEAD`
  then names, and refuse where `HEAD` has left the branch (REQ-FLOW-093; `undoCommit`, `src/cli/commands/run.ts`). A
  sub-agent is now also read from `agentId`, `parentAgentId`, `parent_agent_id` and `parent_tool_call_id`, ten fields
  in all, an own non-empty string in any of them refusing an ask as a sub-agent's on every client, and on Copilot CLI
  the field's presence alone, so a Claude Code payload holding only `agentId`, or only `parent_tool_call_id`, now reads
  as a helper's. Copilot CLI's check asks for its main agent's act (REQ-FLOW-123), so the first paragraph's
  "Copilot's … `preToolUse` checks refuse it" reads, for an act that can be undone, as that requirement gives it
  (`GUARD_HELPER_FIELDS` and `attendedAsk`, `src/hooks/scripts.ts`).
- **Amended 2026-10-19** (plan 021 file 2, unit `n4-held-claude-hooks`, with its fix round and its cap round, ledger
  rows `review/166`, `review/175`, `review/182` to `review/189` and `build/98`; written by `n6-night-pages`). The
  person-only paths gain `.claude/hooks/**`: the scripts Claude Code's hooks run, the engine's copies under
  `.claude/hooks/stamity/` and a person's own, held beside Claude Code's held settings as `.cursor/hooks/**` is beside
  `.cursor/hooks.json`, and `.stamity/packs/**`, beside `.stamity/generated/**`; so an unattended run's change to one
  is an inert patch, listed and never pushed (`PERSON_ONLY_PATHS`, `src/change/personOnlyPaths.ts`; the run verbs' held
  prefixes derive from it, `HELD_PREFIXES`, `src/cli/commands/run.ts`).
  - Given an unattended `run checkpoint` or `run end`, Then before anything is staged the verb reads, at the record's
    `Base:` and never from the work tree, the manifest; the folder of hook declarations `Base:`'s manifest names,
    `.stamity/hooks` by default, held whole wherever it lies; the packs folder and each pack's `hooks/` folder; and,
    through the engine's own reader (`readHookDefinitions`, with `checkLauncherArgv`'s one script argument), each
    script an accepted declaration names, and each launcher it names as a repository file rather than a name on
    `PATH` (`build/98`). Each such path is held as a person-only path is, at all four places the verbs hold (the dry
    run, the index and work tree, the history read and the pushed tree), whether or not it exists at `Base:`; a link
    the run adds at a folder above one is held too. Reading at `Base:` means a run cannot unhold a script by editing
    or deleting its declaration. Attended, the verbs read nothing new and hold nothing.
  - The hold fails closed on anything it cannot resolve cleanly at `Base:`: one resolver walks `Base:`'s trees, reads
    backslashes as separators and refuses a `..` segment, an absolute path or one naming a drive or a scheme, a
    segment that is a link or a submodule there, and one the tree spells in another letter case or holds twice by
    letter case; a manifest or declaration that does not parse, a folder that is a file, a script the hold could not
    stand in for and an argument that leaves the repository refuse too. A manifest or declaration that opens with a
    byte-order mark is read as the manifest reader reads it. A refusal refuses the call before anything is staged,
    exit 1, as `hold refused: <path> at Base: <why>, so the hook scripts it names are unknown and the run pushes
    nothing`, committing and pushing nothing (`hookPathsAt`, `baseReader` and `heldOf`, `src/cli/commands/run.ts`).
  - Residuals, named in `SECURITY.md`: a hook written by hand into a client's settings file whose script lies outside
    the held folders; modules a held script loads from outside the held folders (`review/187`); and a run that
    rewrites its own record head's `Base:`, as it can its `Mode:`, which moves the commit the hold reads.
  - Proof: `test/change/personOnlyPaths.test.ts`, `test/cli/commands/runCheckpoint.test.ts` ("the scripts the hook
    declarations at Base: name (review/175)" and its nested describe of the fail-closed reads),
    `test/cli/commands/runEnd.test.ts`.
- **Proof:** `test/hooks/personOnly.test.ts`, `test/hooks/personOnlyGuard.test.ts`, `test/change/personOnlyPaths.test.ts`,
  `test/cli/commands/runCheckpoint.test.ts` (the held patch; the refused push, "refuses the push when a commit it would
  send changes a held path, rewriting no history"), `test/adapters/claude.test.ts`,
  `test/adapters/cursor.test.ts`, `test/adapters/copilot.test.ts`, `test/emit/hooksInfra.test.ts`,
  `test/manifest/claudeSettings.test.ts`, `test/merge/settingsOwnerEntries.test.ts`.

### REQ-FLOW-103 — Secrets are scanned last, and every outbound text before it leaves

Added 2026-10-16 (plan 021 file 1, units `u5-morning`, `u16-gate-verbs`, `u18b-run-checkpoint` and `u19-run-end`).

Given a close that pushes, When its record, inbox, learnings, spec merge and morning list are written, Then
`stamity gate scan --base <Base>` runs again before the push and a hit holds it; given a pull request's title or body,
a morning list, a comment or a reply, Then `stamity gate scan --text <file> --label <label>` scans it through
`scanAddedLines` and exits 1 on a hit or a line past the cap, naming label, line and rule and no part of the value, and
the text posts only from the scanned file (`content/skills/st-unattended/SKILL.md:93-100`; `src/cli/commands/gate.ts`,
the `--text` scan; `OUTBOUND_LINE_PAST_CAP` and `screenOutbound`, `src/runs/morning.ts:61`, `:517`). A new or bumped
dependency is a morning-list row (`SKILL.md:120-121`).

- **Proof:** `test/cli/commands/gatePreflight.test.ts` (`gate scan --text`), `test/cli/commands/runCheckpoint.test.ts`,
  `test/runs/morning.test.ts`, `test/corpus/commands/feedbackPair.test.ts`, `test/corpus/skills/unattended.test.ts`
  ("scans last, after every close write, and holds the push on a hit (REQ-FLOW-103)").

### REQ-FLOW-104 — The cloud's accepted risks are named

Added 2026-10-16 (plan 021 file 1, unit `u21-security-page`; not on this merge's base, it is cited from `bc12cfc3`
by the merge's first fix round and re-read after the whole-branch page round: the section is `SECURITY.md:379-639`, under
`## What it does not defend` (`:284`), the settings row `:98`, the git-hardening row `:96` and the third network
exception `:152-173`).

Given `SECURITY.md`, Then a `### Cloud and unattended runs` section under what it does not defend replaces "Runs nobody
watches" and names the accepted risks: runtime ingress is screened by the model, not enforced; a Copilot hook that
times out fails open; Cursor's read-only first turns run no hooks; no shell guard sees Cursor's own push; a pattern
deny rule can be respelled; every command in Claude Code's cloud can read the environment; a run that rewrites its own
record head escapes the unattended push rule; Codex's non-interactive mode was seen running no project hooks, where the
pre-flight then refuses; a repository's own push configuration and a GraphQL mutation read from a file pass the shell
guard's patterns; behind Claude Code's cloud proxy the push and the REST reads run as the platform's shared app
identity; a custom repository role that can edit rules, without admin, can lift a repository ruleset the pre-flight
counted; a custom organization role that manages rulesets lets a member who administers the repository lift an
organization ruleset; an administrator's repository-level acts (a transfer, a rename, a default-branch change) can take
the default branch out of an organization ruleset's reach, the guard holding their known forms and repository acts
respelled past it a residual, so the wall is strongest with an account that has no admin on the repository; `PATH`
decides which `gh` a credential helper naming `gh` runs; a `GIT_CONFIG_*` value changed between the pre-flight and the
push goes unseen; and an environment file can name a build file outside the held set. It names the attended guard's
accepted gaps — gh's field conversions and current-branch placeholder read as literal text, a batch ref update given as
a GraphQL variable, the GraphQL tag-ref create and ref delete, a percent-encoded ref path, and a directory change the
place reader does not follow — as covered in an unattended run by the push rule and the REST check. It names the lines
that run inside another line (PowerShell's command wrappers and script blocks, `cmd /c` and `/k`, a rebase exec line,
the command `git bisect run` runs) as read by both verdicts, a person-only act wrapped in one refused on every client
and a raw push in one refused unattended; gh's alias for the create-and-push form as refused unattended; a git named by
a Windows path inside a PowerShell payload as read as git; a PowerShell encoded command and a line piped into `iex` as
uncovered by the unattended rules; and a multi-root workspace file and every folder's editor settings, tasks and
MCP-server files as held paths. Its settings row says the engine removes no `permissions.deny` row: `sync` keeps each
byte for byte and `clean` names those equal to the engine's that it left. The engine's start of `gh` is listed among its
named network exceptions, and the run verbs on the git-hardening row.

- **As built, where the delta differed:** the delta named PowerShell's command wrappers, gh's alias for the
  create-and-push form, a multi-root workspace file's settings and an editor tasks file's folder-open task as uncovered
  by the unattended rules and not held. The guard rounds after it closed each: the page states the wrapped lines read
  and refused, the alias refused and those files held (`SECURITY.md:612-623`, `:637-639`), the encoded command and the
  `iex` pipe staying the gaps the unattended rules do not cover (`:632-635`). The page's place-reader paragraph
  (`:625-630`) and its residual for programs the repository's configuration names (`:469-504`) are not restated here; a
  later page round settles them. The whole-branch round added three residuals in plain words: the GitHub MCP server
  on the clients that take no per-tool deny, the origin pin rewritten together with git's configuration, and the
  working directory Claude Code keeps across shell calls, attended only (`SECURITY.md:400-409`, `:551-556`,
  `:410-416`). PR #112's fourth round (2026-10-18) added three attended residuals, each naming the control that holds,
  the remote's own protection attended: a symbolic ref already on disk, a branch switch on the same line before a push
  whose destination is implied, and curl's and wget's default configuration files (`SECURITY.md:429-450`). Unattended,
  the raw-push refusal holds the first two; for the third, the pre-flight's wall holds the default branch alone, so a
  write a default `.curlrc` or `.wgetrc` hides reaches the run's own branch around the run verbs, the held paths and
  the last scan, as the other respellings do (round 4d). The MCP residual counts fourteen rows (`:400-409`), and the final
  round's window states that a worktree policy never carries the run-ended marker into another checkout, a `symlink`
  row on `.stamity` still sharing it live (`:537-550`). PR #112's round 4b (2026-10-18) names a REST target held in a
  variable among the respellings, attended and unattended: the guard judges the call on the literal word, so a
  computed URL passes, where a method held in one is refused as a hidden call (`SECURITY.md:451-468`). Round 4d names
  a symref command word the line cannot show among them (`symref-%s` with the command as printf's argument, or a
  variable holding it; `:451-468`). PR #112's round 5 (2026-10-18) names the tag ceiling after the run folder one:
  past 10,000 local tag names, or a `packed-refs` file past 8 MiB, the guard refuses every push naming a refspec in
  that repository, attended sessions included, and a call that reads no tag still passes (`SECURITY.md:530-536`); the
  attended paragraph states a path with dot segments read resolved as well as written (`:602-605`).
- **Amended 2026-10-18** (plan 021 file 2, units `v0d-guard-pages`, `v13-client-legs` and `v15-cloud-page`, and the
  page items folded into `v17-model-list-cache`). Given `SECURITY.md`, Then its rows state each client's answer to a
  person-only act (REQ-FLOW-123), the deletions and force pushes refused everywhere (REQ-FLOW-124), the run-verb line
  rule and the verbs' git environment (REQ-FLOW-121, REQ-FLOW-122), the settings' ask and deny lists (REQ-FLOW-036) and
  the MCP hook (REQ-FLOW-120); and it names as accepted residuals: an ask holds only while a client honours it (Claude
  Code's hook ask in bypass mode measured, not documented; re-measured each release); where no hook runs, a respelling
  no settings row names is one click; a `GIT_CONFIG_*` variable gained after the pre-flight reaches the verbs' git,
  including one set on a line whose run verb the stand-alone rule's text reading cannot see (a launcher it does not
  unwrap, a name split by quotes or built by an expression); and a checkout synced from an unreleased build keeps its old
  deny rows. The cloud section's intro states the attended rule (`SECURITY.md:390-392`); "How each client answers an
  ask." (`:408-417`), "Where no hook runs." (`:418-426`) and the MCP bullet (`:427-438`) follow it.
- **As built, beyond the delta:** the page also names, each with its control: Cursor 2026.10.14 running a command
  despite an ask under `--force` and Codex letting an ask through, measured or read 2026-10-18; Copilot CLI refusing
  because its tool-call payload names no calling agent (amended 2026-10-19 by unit `w5-ask-pages`: Copilot CLI now asks
  for its main agent alone, and the page names its assisted mode's LLM judge and a line written into its session
  record as residuals, REQ-FLOW-123); a sub-agent's ask-class act and one in Claude Code's `auto`
  permission mode refused by the guard, while where no hook runs the settings' ask rows still reach `auto` mode's
  classifier; a colon-refspec deletion behind an ask prefix, which no settings row can name; the readiness hook's
  `npm ci`, whose install scripts inherit `$CLAUDE_ENV_FILE` and so could write lines that run before every later shell
  command, `hooks-loaded` being a canary there and not a wall (REQ-FLOW-110); Claude Code's GitHub Action on a pull
  request, whose base-branch restore leaves the hook scripts under `.stamity/generated/hooks/` and the `AGENTS.md` the
  base branch's `CLAUDE.md` imports to the pull request (REQ-FLOW-113); `SSH_ASKPASS` among the variables the verbs'
  git drops; the release checklist's `hook-runs.mjs --ask --require-observation` as the re-measurement (REQ-PROVE-042);
  and the model list cache in place of "the account's list lands in the committed manifest" (REQ-LADDER-009). The
  security mapping's rows and gaps follow each (`docs/security-mapping.md`). Proof: `test/docsPages.test.ts` ("states
  file 2's ask rule, each client's answer, the run verb's line and the residuals REQ-FLOW-104 names", and its mapping
  twin), `test/corpus/rules/security.test.ts`.
- **Amended 2026-10-19** (plan 021 file 2, units `w6-claude-hooks-in-claude-dir` and `w7-action-pages`). The engine's
  own Claude Code hook entries run copies of its scripts under `.claude/hooks/stamity/`, beside the policy document's
  copy the guard reads (`CLAUDE_HOOKS_DIR`, `src/hooks/model.ts`), and the Claude Code GitHub Action replaces `.claude/`
  with the base branch's copy on a pull request, so the Action residual narrows to what the restore leaves: the
  `AGENTS.md` the base branch's `CLAUDE.md` imports, which is not among the paths the Action restores (its
  `SENSITIVE_PATHS`, read 2026-10-19); the run records and learnings under `.stamity/` the scripts read; the user and
  pack hook scripts outside `.claude/` that the settings also run, at their own paths, with the Action's token, which a
  person running the Action on outside pull requests keeps under `.claude/` or drops; a base branch that predates the
  copies, whose entries still run the scripts under `.stamity/generated/hooks/claude/` from the pull request; and the
  Action's own named limit, a pull request's change to `.claude/` reverted on its Action run, and committed onto its
  branch by an agent there that runs `git add -A` (`SECURITY.md`, "Claude Code's GitHub Action on a pull request.").
  Proof: `test/docsPages.test.ts` ("the Action's restore covering Claude Code's hook copies (w7-action-pages)").
- **Proof:** `test/docsPages.test.ts` ("cloud and unattended runs (REQ-FLOW-104)": the section's place, every risk
  and gap named above, the retired bullet gone, the control table's pointers, the settings row and the network
  exception); `judgment: reviewer` for the wording around them.

### REQ-FLOW-105 — Continue a run from its branch

Added 2026-10-18 (plan 021 file 2, units `v1-branch-card`, `v3-cloud-skill` and `v21-run-verbs`, with their fix
rounds).

Given an in-progress run record whose `Branch:` names the checked-out branch, When a session starts there, Then the
session start prints that run's resume card (REQ-CTX-013), and an unattended `/st-work` continues that run from its
record and ledger at Frame instead of opening a new record, the folder count under `.stamity/runs/` unchanged; Given a
record naming another branch, a detached HEAD, or no `Branch:` line, Then Frame opens a new record as today. Where no
session-start hook runs, `stamity ledger status` prints the card. Given `stamity run start --run <id>` on a fresh clone
where `stamity/<id>` is only on origin, Then the local branch starts at origin's tip, so the next push fast-forwards. A
session continues only the run whose record is on the branch it was given, and never guesses another branch; a
continued run passes its record's `Base:` to the readiness check (`stamity plan check <plan> --since <Base>`, which one
plan now accepts as a chain does), so a path moved only by the run's own commits is not read as stale; a continued
chain file passes the chain's first record's `Base:`, as the chain rules do.

- **As built, beyond the delta:**
  - The startup card is REQ-CTX-013's, as amended 2026-10-18: HEAD is read from disk with no process spawned, through
    one reader the ask gate embeds too, which follows a linked worktree's `gitdir:` (`buildCardBranchSource` and
    `resumeCardLines`, `src/runs/cardSource.ts`; `readCurrentBranch` and `findCardRun`, `src/runs/resumeCard.ts`); an
    attended record prints on startup only within the closed card's two-day age, an unattended one at any age.
  - Frame's continuation is the skill's text, `content/skills/st-unattended/references/cloud.md:53-67`, which the
    skill's body points at in its last line (`content/skills/st-unattended/SKILL.md:173`): the session runs
    `stamity run start --run <id> --json` first, `<id>` the record's folder name, and with no in-progress record on the
    branch it was given, as on a clone given the default branch or a platform's own, it opens a new run.
  - `run start` with no local `stamity/<id>` reads `refs/remotes/origin/stamity/<id>`; where the run's record at that
    tip names a `Base:` the tip descends from, it switches to a new branch at the tip and reports
    `created from origin's stamity/<id>`, a dry run reading that tip as its base. A tip carrying no record, a record
    with no `Base:`, a `Base:` that names no commit here, or a tip that does not descend from it is refused, exit 1,
    naming both commits, and on a shallow clone the refusal names `git fetch --unshallow origin` (`originRunTip`,
    `src/cli/commands/run.ts`). A clone that never fetched the branch keeps today's start, a named residual.
- **Proof:** `test/hooks/sessionStartCard.test.ts` ("the startup card for the run on this branch"),
  `test/runs/resumeCardParity.test.ts`, `test/cli/commands/run.test.ts` (the fresh-clone continuation cases and the
  refusals), `test/cli/commands/plan.test.ts` ("takes --since for a single plan without --chain: a move after the base
  is exempt, one before it stays stale"), `test/corpus/skills/unattended.test.ts` ("continues at Frame only the
  in-progress record on the branch it was given, its Base: as --since (REQ-FLOW-105)"). No eval case observes a whole
  continuation; it is proven by its parts, an accepted gap the plan's QA walk names.

### REQ-FLOW-106 — The review gate survives a reclaimed machine

Added 2026-10-18 (plan 021 file 2, unit `v2-review-gate-rebuild` and its two fix rounds; `v3-cloud-skill` for the
checkpoint after each round).

Given no `.stamity/review-gate.json`, or one that cannot be read or parsed, and the newest in-progress record (not a
`_debug-` run) whose `Branch:` matches HEAD holding N `usage: review rN` lines, When the review gate decides or records,
Then it rebuilds N rounds with the last verdict unrecorded and holds the completion, below the cap as an open round and
at the cap with a message of its own (the last verdict went with the machine; one fresh review re-records it), never
the cap's end-of-run text, instead of opening; with no such record or line it stays open, naming the missing counter;
when the records cannot be read it holds and names the fault, and a reviewer's stop whose rebuild faults records round
1, naming the fault and the lost count. A readable counter file wins and nothing is rebuilt, a faulted one is replaced
once a rebuild succeeds, and the text names that the counter is keyed by the client's session, not by the run. An
unattended cloud run checkpoints after each review round, so the round's usage line reaches the branch before a
reclaim.

- **As built, beyond the delta:**
  - The usage line is `USAGE_REVIEW_PATTERN` (`src/runs/layout.ts:108`), the one spelling the gate's rebuild and the
    pre-flight's `review-state` warning count; the pre-flight counts the run on the branch `.git/HEAD` names, 0 on a
    detached HEAD (`usageReviewLines`, `src/cli/commands/gate.ts`).
  - At the cap the reason code is `ROUNDS_REBUILT_AT_CAP`, and the next review re-records round N rather than counting
    N + 1; a count padded past the cap rebuilds as the cap. A fault holds as `RUN_FOLDERS_OVER_2000`,
    `RECORD_TOO_LARGE` (a matching record over 1 MiB) or `RECORDS_UNREADABLE`, naming the path relative to the
    repository. A linked run folder and a `_debug-` folder are passed over, as `findCardRun` passes them; the
    pre-flight still counts 0 past 1 MiB where the gate holds, erring toward holding.
  - Where the delta and the code differ: a counter written from a rebuild carries `rebuilt: true`, which every later
    write keeps, and a session with no entry in a counter so marked rebuilds from the record as for a missing counter,
    so a peer session's completion in the same checkout holds instead of opening. "A readable counter file wins" holds
    for a file holding this session's entry, or carrying no mark; an unmarked counter keeps today's meaning
    (`buildReviewGateScript`, its `load`, `save`, `record` and `decide`, `src/hooks/scripts.ts`). A governed sub-agent
    stop other than the reviewer's prints no line for a faulted counter.
  - The cloud reference states the checkpoint after each round (`content/skills/st-unattended/references/cloud.md:27-29`).
- **Proof:** `test/hooks/scripts.test.ts` (the REQ-FLOW-106 block, its peer-session and marked-counter cases among
  them), `test/runs/preflight.test.ts`, `test/hooks/sessionStartCard.test.ts`, `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-107 — Pacing an unattended night in a cloud session

Added 2026-10-18 (plan 021 file 2, unit `v3-cloud-skill`).

Given an unattended run in a session the session start names a cloud session, Then the run uses no `/loop`, wakeup or
agent team to pace itself, runs the full gate as one background command under a stated timeout (the one exception to
the bound agents' Shell paragraph, whose words stay byte for byte), and runs at most two implementers at once; the text
sits in the unattended skill's cloud reference, and a corpus test pins each clause beside the Shell paragraph's pin.

- **As built:** `content/skills/st-unattended/references/cloud.md:17-33`; the completion notice is taken, never polled
  with `sleep`, and the brief that dispatches the gate names the exception. A local unattended run and an attended one
  keep `/st-work`'s capacity rung (`:12-14`).
- **Proof:** `test/corpus/skills/unattended.test.ts`, `test/corpus/agents/shellDiscipline.test.ts` (the Shell
  paragraph unchanged).

### REQ-FLOW-108 — Lanes in a cloud session

Added 2026-10-18 (plan 021 file 2, unit `v3-cloud-skill` and its three fix rounds).

Given an unattended run in a cloud session with units that could run in parallel, Then each lane uses the client's own
isolation or the units run one at a time, never the sibling folder `stamity worktree setup` makes, so no folder appears
under `<parent>/.stamity-worktrees/`; each lane's change is applied to the run's work tree uncommitted before the next
checkpoint, whose own classifier moves any held part into `held/person-only.patch` and commits the rest, so no held path
enters the pushed history and nothing a lane did is lost at a reclaim. Text only: the `stamity worktree` verbs and their
lane requirement are unchanged, and a corpus test pins the text.

- **As built:** the lane is folded once, when its agent returns, as `git diff --binary <run-branch>...<lane> | git
  apply` applies it to the work tree alone, never to the index, where a deletion already staged would refuse the
  checkpoint; the checkpoint's `--paths` names every path `git diff --name-only --no-renames <run-branch>...<lane>`
  lists, so a rename's old side is staged as deleted; a lane's commit never lands on the run branch itself
  (`content/skills/st-unattended/references/cloud.md:35-46`). The checkpoint commits a `--paths` entry whose deletion is
  already staged (REQ-FLOW-093, amended 2026-10-18).
- **Proof:** `test/corpus/skills/unattended.test.ts` ("runs lanes in the client's own isolation or one at a time, never
  the sibling worktree folder (REQ-FLOW-108)").

### REQ-FLOW-109 — Cursor's stop hook carries an unattended run on

Added 2026-10-18 (plan 021 file 2, unit `v4-cursor-continue` and its fix round).

Given Cursor selected, Then `.cursor/hooks.json` wires a `stop` entry, never `failClosed`, running an adapter-owned
script under one fixed emitted `loop_limit`; When it runs, Then it answers a follow-up only where `CURSOR_AGENT_SOCKET`
is set and an in-progress record on this branch reads `Mode: unattended` and states units left, and otherwise (a local
session, no `Mode:` line, a closed run, a count it cannot read) answers nothing and exits 0, so a local session on a
branch carrying such a record never gets one. The `stop` event, `loop_limit` and the follow-up answer are
vendor-documented, re-checked at build.

- **As built, beyond the delta:**
  - The socket variable counts when set to a value other than empty, `false` or `0`. The stop's payload `status` must
    be `completed` or absent; `aborted`, `error`, `null` or any other value gets nothing.
  - "Units left" is the last checkpoint line's `remaining=<m>`, digits only and above 0 (`RECORD_CHECKPOINT_PATTERN`,
    `src/runs/layout.ts:115`); the answer is `{"followup_message":"Continue the run: <m> units remain; the record is
    <path>."}`, `<m>` printed as a number and `<path>` built from the run folder's name, never from record text
    (`CURSOR_CONTINUE_FOLLOW_UP` and `buildCursorContinueScript`, `src/hooks/scripts.ts`).
  - No follow-up is answered while the newest capacity line ending in `BLOCKED_DEPENDENCY` has at most one checkpoint
    line after it, the stop's own, so a run stopped at a usage limit is not re-started into the limit
    (`CURSOR_CONTINUE_CAPACITY_STOP_PATTERN`, the same file).
  - The record is read whole up to the report bound; a larger or unreadable record, or a payload that is not JSON, gets
    nothing and one stderr line naming the read. The record heads come from one reader the ask gate shares, the ask
    gate's bytes unchanged (`RECORD_HEADS_SOURCE`).
  - The row runs through the walk-up starter, its data naming `stop`, with `loop_limit` 50 (`CURSOR_CONTINUE_LOOP_LIMIT`
    and `CURSOR_CONTINUE_HOOK_PATH`, `src/adapters/cursor.ts:333`, `:340`; the row, `:1044-1046`). The vendor citations
    carry no read date, open as a Minor.
- **Proof:** `test/hooks/cursorContinue.test.ts`, `test/adapters/cursor.test.ts`, `test/hooks/scriptBudget.test.ts`,
  `test/cloud/containerLeg.test.ts` (the Cursor script list).

### REQ-FLOW-110 — Claude Code's cloud machine readies itself

Added 2026-10-18 (plan 021 file 2, unit `v5-claude-readiness` and its fix round).

Given Claude Code selected, Then `.claude/settings.json` gains its own `SessionStart` entry, matcher `startup|resume`,
running an adapter-placed script that does nothing unless `CLAUDE_CODE_REMOTE` is `true`; there it first appends
`STAMITY_HOOKS_ACTIVE=1` to `$CLAUDE_ENV_FILE`, then checks `node` against `engines`, runs `npm ci` when `node_modules`
is missing and a lockfile exists, and pre-warms the pinned CLI; offline, or with that variable unset, it says so and
exits 0 (amended 2026-10-19, ledger row `review/128`; it read "checks `node` against `engines`, runs `npm ci` …,
pre-warms the pinned CLI and appends `STAMITY_HOOKS_ACTIVE=1`", the variable last, where the code writes it first). Its
budget is the one REQ-CTX-016 declares; that the file reaches shell commands only is vendor-documented, re-checked at
build.

- **As built, beyond the delta:**
  - The line written is `export STAMITY_HOOKS_ACTIVE=1`, the client's documented form, appended first, before any
    install step, and once across startup and resume, so an install that runs out of time leaves it written
    (`HOOKS_ACTIVE_ENV`, `src/types/markers.ts:206`).
  - The node check reads the common range shapes (`^`, `~`, `x`, `||`, the comparators) and names any other as unread,
    never guessing. `npm ci` runs only from a `package-lock.json` or `npm-shrinkwrap.json`; another lockfile installs
    nothing and says so, as does a repository with no `package.json`. The pinned CLI is resolved through its `help`
    verb.
  - The script's own limits are 240 s for the install and 45 s for the CLI, inside the entry's 300 s. Stdout carries
    fixed text, versions and exit codes only, with control characters masked, and the script's banner names the
    registry reach and the install scripts (`buildCloudReadinessScript`, `CLOUD_READINESS_FILE` and
    `CLOUD_READINESS_TIMEOUT_MS`, `src/hooks/scripts.ts`).
  - The adapter places the script beside the ask gate and pushes the entry after every planned `SessionStart` row,
    with no fail-closed tail (`CLAUDE_CLOUD_READINESS_PATH`, `src/adapters/claude.ts:243`; the matcher, `:251`; the
    entry, `:984-987`).
  - The vendor facts were re-read on 2026-10-18: `CLAUDE_ENV_FILE` is documented for `SessionStart`, its lines run
    before each later Bash command, and `startup|resume` is an exact list.
  - The install scripts `npm ci` runs inherit `$CLAUDE_ENV_FILE`, a residual `SECURITY.md` names (REQ-FLOW-104).
- **Proof:** `test/hooks/cloudReadiness.test.ts`, `test/adapters/claude.test.ts` ("the cloud readiness hook's
  placement"), `test/manifest/claudeSettings.test.ts` ("the cloud readiness entry"), `test/hooks/scriptBudget.test.ts`,
  `test/cloud/containerLeg.test.ts` ("runs Claude Code's cloud readiness under the claude-cloud marker against the npm
  stubs alone"), `test/cloud/profiles.test.ts`.

### REQ-FLOW-111 — Readiness on Copilot and Cursor

Added 2026-10-18 (plan 021 file 2, unit `v10-copilot-cursor-setup`, and `v7-cursor-agents-block`'s fix round for the
row's warning).

Given Copilot selected, Then `copilot-setup-steps.yml` installs Node and the pinned CLI so `stamity` resolves with no
registry fetch, at the generator's current action pins; Given Cursor selected, Then no `.cursor/environment.json` is
emitted and `stamity check` prints an install row with the lines a Cursor environment needs. Both name `gate scan` and
`ledger status` as hard needs. That a repository file overrides Cursor's saved environments is vendor-documented,
re-checked at build.

- **As built, beyond the delta:**
  - Both lanes of the setup steps end on a comment naming the two hard needs, `npm install --global
    [--@<scope>:registry=<url>] <package>@<version>` and `stamity --version`, a fork's package and registry reaching
    the line; a package with no npm channel gets no registry install, only a comment saying to install the fork's own
    copy (`pinnedCliInstall` and `buildSetupSteps`, `src/adapters/copilot.ts`).
  - `check`'s row is `cloud-install`, printed only with Cursor selected, after `model-pins`. It names Node's range, the
    pinned CLI and the two hard needs, says no `.cursor/environment.json` is written, then prints `node --version` and
    the install line at the manifest's `generatedBy`, and never fails. It warns, first, when the manifest records the
    root `AGENTS.md` as `skip`, since the Cursor block of REQ-FLOW-114 then never lands (`checkCloudInstall`,
    `src/cli/commands/check.ts`). `docs/troubleshooting.md` lists the row.
  - The global install bypasses a project `.npmrc` mirror at setup, and the vendor facts were not re-read at build;
    both are open as Minors. A project pinning Node below the CLI's engines gets a red `stamity --version` step.
- **Proof:** `test/adapters/copilot.test.ts` (the "copilot-setup-steps.yml" cases), `test/cli/commands/check.test.ts`
  ("check — cloud-install (REQ-FLOW-111)"), `test/docsPages.test.ts`.

### REQ-FLOW-112 — A Claude Code session with several repositories refuses unattended

Added 2026-10-18 (plan 021 file 2, units `v5-claude-readiness` and `v3-cloud-skill`).

Given a shell that sees `CLAUDE_CODE_REMOTE=true` and no `STAMITY_HOOKS_ACTIVE`, When an unattended run starts, Then it
refuses with "hooks did not load" first: the pre-flight's canary finds no fresh marker, and where no CLI runs the run
refuses first because the CLI is not reachable (the skill names no client variable); the refusal names a session
holding several repositories and the remedy, one repository per session. That such a session loads no repository's
hooks is vendor-documented, re-checked at build; a repository added after the start is a named residual.

- **As built:** `hooks-loaded` refuses where the detector reads `CLAUDE_CODE_REMOTE` (exactly `true`) and
  `STAMITY_HOOKS_ACTIVE` is not exactly `1`, before and whatever the canary, so a canary a steered run wrote does not
  stand in for the variable; its evidence opens `hooks did not load` and names `$CLAUDE_ENV_FILE`, and its fix names one
  repository per session (`hooksLoaded`, `src/runs/preflight.ts:497`, `:501-512`). The cloud reference names the
  refusal by the check's id, `hooks-loaded` (`content/skills/st-unattended/references/cloud.md:48-51`).
- **Proof:** `test/runs/preflight.test.ts` ("hooks-loaded in Claude Code's cloud"),
  `test/cli/commands/gatePreflight.test.ts`, `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-113 — Claude Code's GitHub Action is a short surface

Added 2026-10-18 (plan 021 file 2, units `v11-cloud-facts-matrix`, `v13-client-legs` and `v15-cloud-page`, with
their fix rounds).

Given `docs/cloud.md` and the capability matrix's Claude Code facts, Then the GitHub Action is named a job of at most
six hours with no question tool by default, never an overnight surface, where declared defaults apply, each fact with
the status its vendor page gives at build; Given `scripts/qa/hook-runs.mjs`, Then a unit test pins Claude's runner
arguments to hold no `--bare`, and the nightly hook-fire check (REQ-PROVE-040) records `failed` when `claude -p` ran a
tool call and no hook fired.

- **As built:** three `CLIENT_CLOUD_FACTS` rows (`src/hooks/model.ts`): the job cap `documented`; the question tool
  `not documented, read 2026-10-18`, the page being silent; the configuration restored from the base branch
  `documented`, the row adding that the hook scripts those entries start live under `.stamity/generated/hooks/`, which
  the restore does not cover, and come from the pull request. None prints a session line. `docs/cloud.md`'s Action
  section adds the `AGENTS.md` the base branch's `CLAUDE.md` imports, which comes from the pull request too. The
  hook-fire failure is `--require-observation`, which turns an empty observation log red (`main`,
  `scripts/qa/hook-runs.mjs`).
- **Amended 2026-10-19** (plan 021 file 2, units `w6-claude-hooks-in-claude-dir` and `w7-action-pages`). The engine's
  own Claude Code hook entries run copies of the core and adapter scripts under `.claude/hooks/stamity/`, beside
  `stamity-agent-tool-policies.json`, the policy document's copy the guard reads (`CLAUDE_HOOKS_DIR`,
  `src/hooks/model.ts`; `CLAUDE_COPY_PLACEMENT`, `src/emit/hooksInfra.ts`). The Action replaces `.claude/` with the base
  branch's copy on a pull request, so the engine's own hook scripts are the base branch's there, and a pull request no
  longer changes what the guard runs on its own Action run. The copies under `.stamity/generated/hooks/claude/` are
  still written, for the session start invariant 5 has a session run by hand (REQ-FLOW-088); no hook entry runs them.
  The configuration row says so, and `docs/cloud.md`'s Action section adds the base branch that predates the copies, the
  records the scripts read, the user and pack hook scripts outside `.claude/` the settings also run, which come from the
  pull request (kept under `.claude/` or dropped where the Action runs on outside pull requests), and the Action's own
  named limit: a pull request's change to `.claude/` is reverted on its Action run, and an agent there that commits with
  `git add -A` puts the revert onto the pull request's branch (read in the Action's source 2026-10-19; its documentation
  does not state it). Proof: `test/emit/capabilityMatrix.test.ts` (the configuration row), `test/docsPages.test.ts`
  ("names the GitHub Action a short surface, and what a pull request still changes there", and "the Action's restore
  covering Claude Code's hook copies (w7-action-pages)").
- **Proof:** `test/emit/capabilityMatrix.test.ts` ("states Claude Code's GitHub Action as a six-hour job with no
  question tool by default (REQ-FLOW-113)"), `test/qa/hookRuns.test.ts` ("drives claude without --bare"),
  `test/qa/hookRunsCli.test.ts`, `test/docsPages.test.ts` ("names the GitHub Action a short surface, and what a pull
  request still changes there").

### REQ-FLOW-114 — Cursor's cloud block in `AGENTS.md`

Added 2026-10-18 (plan 021 file 2, unit `v7-cursor-agents-block` and its fix round).

Given Cursor selected, Then the root `AGENTS.md` ends on a "Cursor Cloud specific instructions" block: `/st-<id>` means
read `.agents/skills/st-<id>/SKILL.md`; the screened learnings read of charter invariant 5; `node --version` first, the
missing-`node` remedy, with no prefix on any hook command; keep the PR a draft, never ready; the unattended rule.
Without Cursor no byte moves, Codex's override and nested copies included. The block is counted apart from the
charter's 95-line pin, the always-on figure is published with and without it, and the heading is vendor-documented.

- **As built:** the block is 14 lines (`ALWAYS_ON_CURSOR_BLOCK_LINES`, `src/content/charter.ts`), rendered by
  `renderCursorCloudBlock` (`src/emit/agentsMd.ts`) and appended to the root row by the planner (`src/emit/planner.ts`);
  at the golden's version the root file reads 5,610 bytes without Cursor and 6,476 with it
  (`ALWAYS_ON_SHARED_BYTES_WITH_CURSOR`; REQ-PROVE-005, amended 2026-10-18). A root `AGENTS.md` recorded as `skip`
  carries no block, and `check`'s `cloud-install` row warns (REQ-FLOW-111). With Claude Code beside Cursor, Claude pays
  the block through `CLAUDE.md`'s import, and the disclosure says so. An upgrade that moves the block's pinned call
  rewrites the file, which takes a `.bak` where git cannot confirm it committed (REQ-PLUGIN-046).
- **Proof:** `test/emit/agentsMd.test.ts`, `test/corpus/invariants.test.ts`, `test/emit/capabilityMatrix.test.ts`,
  `test/cli/commands/check.test.ts`, `test/merge/hookFilesOwnership.test.ts`, `test/cli/checkExpectations.test.ts`.

### REQ-FLOW-115 — Cursor's context once per conversation, and its managed runs

Added 2026-10-18 (plan 021 file 2, unit `v6-cursor-cloud`).

Given Cursor selected, Then a `postToolUse` entry, never `failClosed`, runs an adapter-owned script that prints the
screened session-start index once per `conversation_id` (a git-ignored marker keyed on its hash), only where
`CURSOR_AGENT_SOCKET` is set, and names a Cursor cloud agent when the `agent/runtime` metadata reads managed; a missing
or non-string id prints nothing, a failed metadata read prints no cloud line, and both exit 0. That this event alone
injects context in the cloud, never on the read-only first turns, is vendor-documented, re-checked at build.

- **As built, beyond the delta:**
  - The marker is `.stamity/context-once/<sha256(conversation_id)>`, claimed by an exclusive create, so an id is never
    a path; a folder that is a file or a link gets no marker and the index still prints, the call losing the "once",
    never the index.
  - The runtime read is `GET /v1/meta-data/agent/runtime` over the socket, 1,000 ms a try, one retry after a failed
    connection, a timeout, a 429 or a 5xx, a 403 or 404 final; `managed` adds `Session: a Cursor cloud agent.` after the
    session lines (`CONTEXT_ONCE_MANAGED_LINE` and `buildContextOnceScript`, `src/hooks/scripts.ts`). The index is the
    session start's own, shared byte for byte (`sessionIndexSource`), and the script prints Cursor's own
    `additional_context`.
  - The row runs through the walk-up starter, its data naming `post_tool_use`, with no timeout of its own
    (`CURSOR_CONTEXT_ONCE_HOOK_PATH`, `src/adapters/cursor.ts:348`; the row, `:1041-1043`). The folder is ignored
    (REQ-FLOW-016) and never copied between worktrees (REQ-WORKTREE-003 and REQ-WORKTREE-004 in
    `docs/specs/worktree-lane.md`). The socket timeout is an idle timeout, so a responder trickling data holds the hook
    to Cursor's own limit, open as a Minor.
- **Proof:** `test/hooks/contextOnce.test.ts`, `test/adapters/cursor.test.ts`, `test/hooks/scriptBudget.test.ts`.

### REQ-FLOW-116 — Commits after the proof block are counted

Added 2026-10-18 (plan 021 file 2, units `v3-cloud-skill` and `v0d-guard-pages`).

Given commits on the run branch after its last checkpoint's sha that the run verbs did not make (theirs carry the
subject `chore(run): checkpoint <id>`), a cloud's CI autofix or a person's push among them, When the morning list is
regenerated, Then its `Not done:` section carries one row naming their count, and the proof block's gate results are
not read as covering them; the run's own closing commit is never counted.

- **As built:** the count is the subjects `git log --format=%s <sha>..HEAD` lists, less each reading
  `chore(run): checkpoint <id>`, on one row, `Not done: <n> commits after checkpoint <sha>, not covered by the proof
  block's gates` (`content/skills/st-unattended/references/cloud.md:69-75`); the skill's morning walk section says the
  same (`content/skills/st-unattended/SKILL.md:141-147`). It is text the run follows: no engine code counts the commits.
- **Proof:** `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-117 — Copilot runs a long plan as a chain of sessions

Added 2026-10-18 (plan 021 file 2, units `v3-cloud-skill`, `v9-copilot-entry` and `v15-cloud-page`).

Given an unattended run on Copilot's cloud agent, Then each session commits and pushes a checkpoint before about minute
45 to 50, plan units are sized to one session, and the next session starts on a write-access person's
`@copilot continue` and resumes from the committed record on the same PR; `docs/cloud.md` promises a night with nobody
there on Claude Code and Cursor only. The 59-minute cap and the continuation are vendor-documented and not run, with no
Copilot cloud-agent account.

- **As built:** the skill names the agent by what it does, "a cloud agent whose session ends near an hour"
  (`content/skills/st-unattended/references/cloud.md:77-83`), and the entry agent states the chain (REQ-FLOW-118). The
  setup job is bounded at `timeout-minutes: 30` (`SETUP_STEPS_TIMEOUT_MINUTES`, `src/adapters/copilot.ts`). The cloud
  page's opening says Copilot's cloud agent runs as a chain a person continues, so it is no night with nobody there.
- **Proof:** `test/adapters/copilot.test.ts` ("bounds the job with timeout-minutes, under the platform's 59 on every
  lane (REQ-FLOW-117)"), `test/corpus/skills/unattended.test.ts`, `test/docsPages.test.ts` ("states the cloud facts the
  capability matrix's table holds").

### REQ-FLOW-118 — Copilot's entry and its roles

Added 2026-10-18 (plan 021 file 2, units `v9-copilot-entry` and `v3-cloud-skill`).

Given Copilot selected, Then `.github/agents/stamity-run.agent.md`, under 2,000 characters, tells the agent to read
`.github/prompts/st-work.prompt.md` and the plan the issue names, since a prompt file is not run by name there; where
no sub-agent tool exists, the roles run in line in their order and the proof block says so. Without Copilot the file is
not emitted, and no roster row is added. The 30,000-character cap, the prompt-file rule and the sub-agent question are
vendor-documented, not run.

- **As built, beyond the delta:** the file is emitted only where the `/st-work` prompt is planned too, since it names
  that prompt (`runAgentRows`, `src/adapters/copilot.ts`); its frontmatter carries `name: stamity-run`,
  `target: github-copilot`, `include-custom-instructions: true` and `tools: ["*"]`, no model line, and it is owned as
  the Copilot adapter's `agent` row with no roster row; an agent already planned at its path is refused by name with
  `VALIDATION_ERROR` (`COPILOT_RUN_AGENT_PATH` and `buildRunAgentFile`, the same file). It is 1,100 bytes and never
  inlines the prompt. Where the file is not yet on the default branch, the run writes a declared `## Prerequisites` row
  naming it (`content/skills/st-unattended/references/cloud.md:87-88`). The entry also loads on Copilot CLI and states
  cloud-only rules, open as a Minor.
- **Proof:** `test/adapters/copilot.test.ts` ("Copilot's entry agent (REQ-FLOW-117, REQ-FLOW-118)"),
  `test/roster/agentPolicies.test.ts` (the roster unchanged), `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-119 — Copilot's gates and CI approval

Added 2026-10-18 (plan 021 file 2, unit `v3-cloud-skill`).

Given an unattended run on Copilot's cloud agent, Then the gates run in its sandbox; while PR CI waits for "Approve and
run workflows" the proof block reads `CI not run: awaiting approval`, never green, and the morning list carries that
setup row and, under required reviews, the prerequisite of a second approver. Detection stays `COPILOT_AGENT_PROMPT`
and the hooks file camelCase, as today; the approval step and the second approver are vendor-documented, not run.

- **As built:** `content/skills/st-unattended/references/cloud.md:85-88`, the second approver a `## Prerequisites` row.
- **Proof:** `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-120 — An unattended run pushes only through the run verbs

Added 2026-10-16 (plan 021 file 1, units `u6-person-only-tables` and `u14-shell-guard`).

Given any in-progress record (debug records included) reading `Mode: unattended`, or `STAMITY_UNATTENDED` set while no
in-progress record reads `Mode: attended` (one with no `Mode:` line included; `unattendedBy`,
`src/hooks/scripts.ts:3701-3732`), When the main thread runs a raw `git push`, `gh pr create`, `gh pr edit`, or a REST
write on `pulls` or `pulls/<n>`, `contents/`, `git/` refs or objects, or `merges`, Then the shell guard refuses it on every client,
naming `stamity run checkpoint` and `run end` as the push path; replies on `pulls/<n>/comments` and
`issues/<n>/comments` pass (`unattendedPushVerdict`, `src/hooks/personOnly.ts:1414`;
`content/skills/st-unattended/SKILL.md:88-91`). An attended session keeps its own pushes. Every run folder's head is
read, so no pile of folders sorted ahead of an open record hides it; past 2,000 run folders the read faults, naming
`RUN_FOLDERS_OVER_2000` (`GUARD_RUN_FOLDERS_MAX`, `src/hooks/scripts.ts:3091`; the check, `:3717-3719`), and the guard
refuses each call this rule would refuse, attended sessions included. A run that rewrites its own record head escapes
this rule, a residual `SECURITY.md` names (REQ-FLOW-104).

- **As built, where the delta differed:** the rule refuses more than the delta named, so the run verbs' push stays on
  the repository the run started on. While the run is unattended it also refuses `gh pr close`, `gh pr reopen` and
  `gh pr update-branch` (`src/hooks/personOnly.ts:2194`), a `git remote` write and a `git config` write of a
  `remote.*` key or section (`:2173-2174`), and any line that sets one of git's program-valued or configuration
  variables, whatever program it runs, the run verbs among them (`:2217-2236`). The configuration variables
  include `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` (`:2024`), the program-valued ones are at `:2032-2033`, and the
  spellings that set either at `:2035-2080`; a git call on a line that names a configuration variable or sets a
  program-valued one is refused before that (`:2162-2170`). A `git config` write of a `url.*` key is refused beside a
  `remote.*` one (`writesRemote`, `:2133` and `:2174`); the run verbs' origin pin is the second check on the push it
  would move (REQ-FLOW-092's "As built" line). In every mode, attended or not, a REST review write whose body the line
  cannot show is refused as an approval (`personOnlyVerdict`, `:1251-1256`). Each curl request after `--next` or `-:`
  is judged as a call of its own, with its own method, body and targets, in both verdicts (pr/72; `httpCall`, `:728`
  and `:1879`; `httpVerdict`, `:1083-1085`; the unattended walk, `:2206`). Unattended, a REST write that moves a
  branch or a pull request is refused through curl's attached body too, and a method the line cannot show throws
  `HTTP_TARGET_HIDDEN` (pr/81, pr/83; REQ-FLOW-102's round 4b line), and so is one through a short cluster's method,
  gh's `-i` cluster and `-X=` among them, or a curl long option's unique prefix (pr/83, pr/84; its round 4d line), or
  through a path whose dot segments resolve onto one of those routes (pr/93; its round 5 line; `MOVES`, `:1971`). On
  Claude Code, fourteen
  `permissions.deny` rows refuse the GitHub MCP server's tools by name (`CLAUDE_DENY_ROWS`, `:191-210`): merge and
  branch writes (`:191-195`), review writes and submission (`:200-202`), pull-request update and state (`:203-205`),
  branch creation (`:206`), repository deletion (`:207`) and pull-request creation (`:210`). The other clients take no per-tool deny, a residual
  `SECURITY.md` names.
- **Amended 2026-10-18** (plan 021 file 2, units `v0a2-ask-emission` and `v0b-run-verb-alone`, with their fix rounds).
  Given Claude Code's settings, Then the thirteen GitHub MCP rows that can be undone (merge, branch and file writes,
  review writes and submission, pull-request update, state and creation, branch creation) sit in `permissions.ask`, and
  `delete_repository` alone stays in `permissions.deny`; a PreToolUse entry on those tools runs the person-only guard,
  which refuses each while an unattended run is in progress, since a settings row cannot read the mode, and answers ask
  in an attended session. The push rule and its other refusals are unchanged. So the bullet above's "fourteen
  `permissions.deny` rows refuse the GitHub MCP server's tools by name" reads as thirteen ask rows and one deny row.
- **As built, beyond the delta:**
  - The MCP entry is the shell guard's own row wired a second time, last among the `PreToolUse` entries, with the
    guard's fail-closed tail and its matcher every row of `GITHUB_MCP_ROWS` (`GITHUB_MCP_MATCHER`,
    `src/adapters/claude.ts:267`; the entry, `:994-997`). An attended MCP act prints as "A call to the GitHub MCP
    server" with the tool's row name, and a sub-agent's or an `auto`-mode call is refused as REQ-FLOW-123 says
    (`mcpDecision` and `attendedAsk`, `src/hooks/scripts.ts`). A server configured under another name than `github`
    escapes the rows, a named residual.
  - While a run is unattended, `gh extension`, `gh extensions` and `gh ext exec` are refused, and a gh option placed
    before the subcommand is read as gh reads it, so `gh -R o/r pr merge 1` and `gh --repo o/r repo sync --force` meet
    their subcommand's rule (`unattendedPushVerdict`, `src/hooks/personOnly.ts`).
  - Proof: `test/hooks/personOnlyGuard.test.ts` (the MCP cases), `test/adapters/claude.test.ts`,
    `test/hooks/personOnly.test.ts`.
- **Proof:** `test/hooks/personOnly.test.ts`, `test/hooks/personOnlyGuard.test.ts`,
  `test/corpus/commands/feedbackPair.test.ts` ("pr-resolve pushes only through the run verbs"),
  `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-121 — A run verb stands alone on its line, unattended

Added 2026-10-18 (plan 021 file 2, unit `v0b-run-verb-alone` and its fix round).

Given an unattended run, When a shell line runs `stamity run start|checkpoint|end` (its parsed command at any depth, or
raw text naming the verb and the package), Then it passes only as one simple command: `stamity`, `st`, or `npx` with
`-y|--yes|--no|--no-yes`, an optional `--@<scope>:registry=<url>`, then `stamity` or `<pkg>@<semver>`; then
`run <verb>`, literal option words and at most one closing `2>&1`, and no other command, prefix assignment, wrapper,
nested line, `$`, backtick, backslash or redirection; else it is refused as a deny naming the run verbs. Attended lines
are unaffected, and a PowerShell tool call is read as PowerShell, not through its synthetic `pwsh -Command` wrapper.

- **As built, beyond the delta:**
  - `npx`'s first word is exactly one of the four yes-or-no flags, so a bare `npx stamity run …` is refused; the
    registry option matches `REGISTRY_URL` (`src/shared/cliCall.ts`); `node … cli.js run …` is refused.
  - The PowerShell reading bans `&`, `;`, `|`, `@{`, `@(`, `$`, a backtick, `--%` and typographic quotes, single
    quotes literal.
  - The text backstop is `\brun\W+(start|checkpoint|end)\b` beside `stamity`, `st` (the package's second bin, read as a
    word), `cli.js`, `cli.mjs` or `@<x.y.z>`, so a line whose text names a verb beside the package, an echo or a commit
    message among them, is refused unattended. The refusal names the run verbs, what broke the shape and
    REQ-FLOW-121; it is a deny, never a throw (`unattendedPushVerdict`, `src/hooks/personOnly.ts`).
  - For the PowerShell tool, the guard's decision reads the tool's own text with a PowerShell flag
    (`decide()`, `src/hooks/scripts.ts`); an agent's own `pwsh -Command '<verb>'` is refused, since it loads a profile
    the run can write. The skill states the line rule (`content/skills/st-unattended/SKILL.md:83-84`).
  - A launcher the text reading does not unwrap, or a verb name split by quotes or built by an expression, skips the
    rule; that is the residual REQ-FLOW-104 names.
- **Amended 2026-10-19** (plan 021 file 2, unit `v0b-run-verb-alone`'s fixes of `review/130` and `review/131`). Given
  an unattended run, When a shell line runs a run verb, Then the rule finds the verb wherever commander would: `run`
  takes its options before its subcommand and a valued option's value is a word of its own, so in a parsed `stamity` or
  `st` command the verb is any word after `run`'s option words and their values. A form the parse does not normalize
  (the CLI file started by `node`, a launcher it does not unwrap) is read over each parsed command's decoded words,
  joined, beside the package, an escaped or quoted dash reading as a dash; there a first word after `run` that the
  reading cannot settle (an expansion, a glob, a brace or a splat) counts as an option word, so a verb written after it
  is still found (`review/146`: a line whose word after `run` is unsure and names no verb passes). The raw-text backstop finds the verb after option words that open on a dash and hold no `;`, `|`,
  `&` or line break, in place of the `\brun\W+(start|checkpoint|end)\b` stated above. The accepted shape still keeps
  the verb next to `run`: unattended, a verb written after option words is refused with its own reason, words between
  `run` and its verb. In the PowerShell reading the shape also refuses a blank other than a space or a tab, which
  PowerShell splits words on; an unquoted `@` in a word after `run`, which PowerShell reads as a splat, so npx's
  `--@<scope>:registry=<url>` and `<pkg>@<semver>` words pass (`review/147`); and the
  stop-parsing `--%` spelled with typographic dashes (an en dash, an em dash or a horizontal bar, which PowerShell reads
  as `-`). Attended lines are unaffected (`namesVerb`, `namesVerbInWords` and `verbShape` in `unattendedPushVerdict`,
  `src/hooks/personOnly.ts`). Proof: `test/hooks/personOnly.test.ts`, `test/hooks/personOnlyGuard.test.ts`,
  `test/docsPages.test.ts` ("states v0b's reading of a run verb after run's option words on REQ-FLOW-121").
- **Proof:** `test/hooks/personOnly.test.ts` (the stand-alone rule's denies and allows, POSIX and PowerShell, and the
  `st` twins of every launch route), `test/hooks/personOnlyGuard.test.ts` (the unattended block on every client),
  `test/hooks/personOnlyGuardDist.e2e.test.ts`, `test/corpus/skills/unattended.test.ts`.

### REQ-FLOW-122 — The run verbs' git runs without inherited program variables, unattended

Added 2026-10-18 (plan 021 file 2, unit `v0c-verb-git-env` and its fix rounds, with `v0b-run-verb-alone` for
`SSH_ASKPASS`).

Given an unattended run, When `stamity run start`, `checkpoint` or `end` starts git, Then git's program-valued
variables (the set the guard's line-wide rule names in `src/hooks/personOnly.ts`: `GIT_EXEC_PATH`, `GIT_SSH`,
`GIT_SSH_COMMAND`, `GIT_ASKPASS`, `GIT_EDITOR`, `GIT_PAGER` and `GIT_EXTERNAL_DIFF` among them) are removed from its
environment, the `GIT_CONFIG_*` variables the pre-flight vetted are kept, and the verb's output names each removed
variable by name only, never its value; an attended run starts git as today.

- **As built, beyond the delta:**
  - The set is `GIT_PROGRAM_VARIABLES`, ten names: `GIT_EDITOR`, `GIT_SEQUENCE_EDITOR`, `GIT_SSH_COMMAND`, `GIT_SSH`,
    `GIT_EXTERNAL_DIFF`, `GIT_ASKPASS`, `GIT_PAGER`, `GIT_PROXY_COMMAND`, `GIT_EXEC_PATH` and `SSH_ASKPASS`, matched in
    any letter case, an empty value counting as set (`src/cli/engine/gitWrite.ts:112-123`), held equal to the guard's
    `PROGRAM_VARIABLES` by a parity test.
  - Unattended, `GIT_ASKPASS` is then set to the empty string, which git reads as no askpass, so it consults neither
    `core.askPass` nor `SSH_ASKPASS` (`gitWriteEnv`, `:165-173`). `PATH`, `HOME` and `XDG_CONFIG_HOME` stay, a named
    residual.
  - The text prints `removed from git's environment: <NAME>, …` and each verb's JSON carries `gitEnvRemoved`, names
    only, absent when nothing was removed (`gitProgramVariablesIn`, `:184`; the verbs, `src/cli/commands/run.ts`). The
    skill has the checkpoint's record line go on, after a space, with `git-env-removed=<name,...>`
    (`content/skills/st-unattended/SKILL.md:79-80`), the space keeping REQ-FLOW-109's reader of `remaining=` to digits.
- **Proof:** `test/cli/engine/gitWrite.test.ts` (the unattended and attended environments, the real-git `SSH_ASKPASS`
  case, the parity case), `test/cli/commands/runCheckpoint.test.ts` ("git's program-valued variables, unattended (v0c,
  REQ-FLOW-122)").

### REQ-FLOW-123 — How each client answers a person-only act, and the unattended refusal

Added 2026-10-18 (plan 021 file 2, unit `v0a2-ask-emission` and its three fix rounds, `v13-client-legs` for the
measurement).

Given an attended act that can be undone (REQ-FLOW-102), Then Claude Code asks through the guard's `"ask"` and the
settings' `permissions.ask` rows; Copilot CLI, Cursor and Codex refuse (Copilot CLI asks for its main agent since
2026-10-19, amended below): Copilot CLI holds an ask, but its tool-call
payload names no calling agent, so the guard cannot keep the ask for the person alone, Cursor ran a command despite an
ask under `--force` (measured 2026-10-18) and Codex lets an ask through. The ask is the person's only: an ask-class act a
sub-agent runs is refused, and so is one in Claude Code's `auto` permission mode, where a classifier may settle a prompt.
Given a session the guard reads as unattended (an in-progress record reading `Mode: unattended`, or `STAMITY_UNATTENDED`
set with none reading `Mode: attended`), or a fault reading it, Then every client refuses every person-only act, and the
act lands on the morning list.

- **As built, beyond the delta:**
  - Claude Code prints `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"<reason>"}}`
    and exits 0, the reason "<act> is a person-only act (`<rule>`): approve it to let the agent run it once
    (REQ-FLOW-102)."; a refuse-class act's reason says it "deletes, force-pushes or cannot be undone … even with
    approval (REQ-FLOW-124). Give the person the exact command." Cursor and Codex print their deny shape with
    `GUARD_CANNOT_ASK` ("This client cannot ask the person for a click, so the guard refuses it: give the person the
    exact command."), and Copilot prints `deny` with `GUARD_NO_CALLER` ("Copilot CLI names no calling agent in its
    tool-call payload, so the guard cannot keep the ask for the person alone and refuses it: give the person the exact
    command."), never `ask` (`guardDecisionOutput`, `src/hooks/scripts.ts`; Copilot's answer and the sentence are
    amended 2026-10-19, below).
  - The guard's decision collects the verdict over every place it reads and both readings of a PowerShell call, and
    asks only when every verdict is ask-class and the mode reads attended; every coded throw stays a refusal. A
    sub-agent is read from `agent_type`, `subagent_type`, `agentType`, `subagentType`, `agent_id` or `subagent_id`, an
    own non-empty string (four fields more since 2026-10-19, REQ-FLOW-102); Claude Code also sets `agent_type` on the main thread of a session started with `--agent`,
    whose asks are therefore refused, the safe direction. `auto` is read from the payload's `permission_mode`
    (`attendedAsk`, the same file). Unattended, an act other than a push reads "… and this run is unattended: list it
    on the morning list, whose walk runs it after one click."
  - The release re-measurement is `node scripts/qa/hook-runs.mjs --ask`, which measures each installed client's answer
    to a hook's `ask` in its permissive mode in a throwaway folder outside the checkout and reports `held`, `ran`,
    `not-run` or `not-installed`; Claude Code is the one ask-class client it fails on (`ASK_CLASS_CLIENTS` and
    `verdictForAsk`, `scripts/qa/hook-runs.mjs`; REQ-PROVE-042; Copilot CLI joins it since 2026-10-19, below).
- **Amended 2026-10-19** (plan 021 file 2, units `w4-copilot-ask` and `w5-ask-pages`, by the walk's answer at 08:46Z).
  Given an attended ask-class act on Copilot CLI, Then the guard answers `permissionDecision: "ask"` with the act's reason
  when the payload carries none of the ten helper fields (REQ-FLOW-102), whatever their value, and its session id
  (`sessionId`, or `session_id` after the portable runner's renaming) is a whole line of
  `stamity/copilot-main-sessions` under the repository's common git directory, which Copilot's session start appends
  to, created owner-only and kept to its last 200 lines. Otherwise, and wherever the record is missing, a link,
  unreadable, past 64 KiB or malformed, it answers `deny` with the reason and `GUARD_NO_CALLER`, which now reads
  "Copilot CLI could not show that this call comes from the person's own agent (a helper agent's call, or a session its
  session start did not record), so the guard refuses it: give the person the exact command." Unattended, `deny` as
  before. Claude Code's answers keep their bytes; Cursor and Codex keep `deny` with `GUARD_CANNOT_ASK`. So the first
  paragraph reads "Claude Code asks …; Copilot CLI asks for the person's own agent; Cursor and Codex refuse", and the
  release re-measurement's ask-class clients are Claude Code and Copilot CLI, a Copilot row reading `ran` or `not-run`,
  or `not-installed` under `--require-observation`, exiting 1 (`attendedAsk` and `guardDecisionOutput`,
  `src/hooks/scripts.ts`; `ASK_CLASS_CLIENTS`, `scripts/qa/hook-runs.mjs`).
  - The facts, measured on Copilot CLI 1.0.98 on 2026-10-19 in throwaway folders: headless runs and autopilot deny an
    ask; the interactive client shows its hook permission dialog and waits; a helper's tool call carries `agentId`,
    `agentType` and `parentAgentId` and a session id of its own; the session start fires for the main agent only. The
    residuals: Copilot's experimental assisted mode (`/allow-all auto`, `--assisted-approval`) sends the ask to an LLM
    judge, which may approve it without the person, and a hook cannot see that mode; and a line written into the record
    by anything but the session start reads as a main session's id, whose ask still waits for the person's click.
  - Cursor keeps refusing: its staff say an ask on a shell hook is enforced on no path, its hooks page says
    `preToolUse`'s ask is not enforced, a hook cannot see the run mode, and a measurement on 2026-10-18 saw a command run
    despite an ask. Codex keeps refusing: its hooks page says an ask fails open, a helper's hook shares the parent's
    session id, and an auto-review agent can settle a rules prompt (read 2026-10-19). `SECURITY.md`, the security
    mapping, `docs/cloud.md` and the release checklist state the same.
  - Proof: `test/hooks/personOnlyCopilotAsk.test.ts`, `test/hooks/personOnlyGuard.test.ts`,
    `test/cloud/containerLeg.test.ts`, `test/qa/hookRunsCli.test.ts`, `test/docsPages.test.ts` ("states Copilot CLI's
    ask, its facts and residuals, and Cursor's and Codex's refusals on REQ-FLOW-123").
- **Amended 2026-10-19** (plan 021 file 2, units `n5-copilot-record-lock` and `n3-copilot-remeasure`, ledger rows
  `review/151` and `review/170`; written by `n6-night-pages`). Copilot's session start reads, merges and renames the
  record under an exclusive lock beside it, `stamity/copilot-main-sessions.lock`, created `wx` and owner-only and
  holding a token: it waits up to 2 seconds for another holder with a synchronous sleep, breaks a lock older than 10
  seconds once, re-reads its token just before the rename, and removes the lock in a `finally` while it still holds
  that token. A lock it cannot take (the wait run out, a link or a folder at its path) leaves the record as it was, and
  the guard refuses that session's asks; the guard's read is unchanged, a rename being atomic (`COPILOT_RECORD_SOURCE`,
  `COPILOT_MAIN_SESSIONS_LOCK_WAIT_MS` and `COPILOT_MAIN_SESSIONS_LOCK_STALE_MS`, `src/hooks/scripts.ts`). The residual
  (`build/92`): the token check and the rename are two steps, and so are the stale break's age read and unlink, so two
  starts that both break one dead holder's lock can leave one main session's id unrecorded, and that session's asks are
  refused, fail closed; no id is added. The release re-measurement also checks, for Copilot CLI, the three facts this
  ask rests on, read from its hook's log (key names and session ids, no other value): a main-agent call carries none of
  the helper fields; a helper's call carries one and a session id of its own, the prompt handing one trivial step to a
  helper so it can be seen; and `sessionStart` fires once, for the main session alone. Each reads `held`, `changed` or
  `not-observed`, and a `changed` fact, or a `not-observed` one under `--require-observation`, exits 1, holds the tag
  and moves Copilot CLI to refusing (`copilotFacts` and `ASK_HELPER_FIELDS`, `scripts/qa/hook-runs.mjs`; REQ-PROVE-042).
  - Proof: `test/hooks/personOnlyCopilotAsk.test.ts` ("Copilot's session start updates the record under a lock
    (n5-copilot-record-lock, REQ-FLOW-123)"), `test/qa/hookRuns.test.ts` ("copilotFacts — the three facts Copilot
    CLI's ask rests on"), `test/qa/hookRunsCli.test.ts` ("hook-runs --ask — the facts Copilot CLI's ask rests on").
- **Proof:** `test/hooks/personOnlyGuard.test.ts` ("each client's answer to a person-only act (v0a2)", the sub-agent,
  `auto`-mode and Copilot byte-for-byte cases), `test/hooks/personOnlyGuardDist.e2e.test.ts`,
  `test/cloud/containerLeg.test.ts` (each client's answer to an ask act), `test/qa/hookRunsCli.test.ts`.

### REQ-FLOW-124 — Deletions, force pushes and acts that cannot be undone stay refused, attended too

Added 2026-10-18 (plan 021 file 2, units `v0a-ask-then-act` and `v0a2-ask-emission`, with their fix rounds).

Given any session, When the main thread deletes a branch (`--delete-branch` on `gh pr close` or `merge`, a `:branch`,
`--delete` or `--prune` push, an `updateRefs` entry to the zero sha), a tag (remote, or local by `-d` or `-f`), a release
or asset (`--clobber` too), a repository, a secret or variable, a protection rule, ruleset or custom property, or a
package version (`npm unpublish`, `npm dist-tag rm`); force-pushes (`--force`, `--force-with-lease`, `+`, `--mirror`,
`gh repo sync --force`); or changes a repository's visibility or owner, Then every client refuses it; a refused act in
any reading of a line or GraphQL text wins over an ask, and a hidden method or URL target, the nesting limit and no
command stay refused.

- **As built, beyond the delta:**
  - The refuse-class rules are `force-push`, `push-delete` and seven new ones: `tag-delete`, `release-delete`,
    `secrets-delete`, `repo-delete`, `repo-irreversible`, `protection-delete` and `unpublish` (`PERSON_ONLY_RULES`,
    `src/hooks/personOnly.ts`).
  - An `updateRefs` entry whose `afterOid` the line cannot show, a list or an entry held in a variable among them,
    reads as a deletion. A repository PATCH whose body holds `visibility` or `private`, or that the line cannot show,
    reads as `repo-irreversible`. A REST `git/refs` PATCH whose body the line hides reads as a force, on any branch.
  - `npm unpublish` is read from its unique prefix `unp`, and `npm dist-tag rm` in npm's aliases (`r`, `del`, `d`,
    `remove`); pnpm's `unpublish` and `dist-tag rm` and yarn's `npm tag remove` and `tag remove` or `tag rm` are refused
    as npm's are. A local `git update-ref` that deletes a tag ref, by `-d`, a `-dm` cluster, a zero or emptied new
    value, or a `--stdin` `delete` or emptied `update` after an escaped line break, reads as `tag-delete`.
  - A deployment environment's deletion, and the deletion of its deployment protection rules or branch policies, an
    environment name holding a slash included, read as `protection-delete`; a user's Codespaces secret deleted through
    REST reads as `secrets-delete`, as `gh secret delete --user` does.
  - Claude Code's `CLAUDE_DENY_ROWS` hold the refused prefix rows, `npm unpublish` and `npm dist-tag rm`, a mid-pattern
    row for each refused flag that can follow an ask-class prefix (`git push * --force*`, `git push * -f*`,
    `git push * --mirror*`, `git push * --prune*`, `git push * --delete*`, `git push * -d *`, `git push * +*`,
    `gh pr merge * -d*`, `gh pr merge * --delete-branch*`, `gh pr merge -d*`, `gh pr merge --delete-branch*`,
    `gh release upload * --clobber*`, `gh release upload --clobber*`, `gh repo edit * --visibility*`,
    `gh repo sync * --force*`, `gh repo sync --force*`, and the four tag rows `git tag * -f*`, `git tag * --force*`,
    `git tag * -d*`, `git tag * --delete*`), and `mcp__github__delete_repository`; no row sits on both lists. A `*`
    inside a Bash row matches anywhere on the line (measured on Claude Code 2.1.302). A colon-refspec deletion behind an
    ask prefix has no row, since a row ending in ` :*` after a `*` matched nothing; that and every respelling no row
    names stay the hook's, a residual `SECURITY.md` names. The mid-pattern rows also refuse a line whose message holds
    the flag, the safe direction; the `gh repo sync --force` rows refuse a local forced sync too.
- **Proof:** `test/hooks/personOnly.test.ts` (the `CLASSES` conformance rows, and "CLAUDE_DENY_ROWS and
  CLAUDE_ASK_ROWS"), `test/adapters/claude.test.ts` (`MID_PATTERN`, each row against a line it must match and an ask
  line it must not), `test/hooks/personOnlyGuard.test.ts`.

## Acceptance criteria

One set per requirement. Each is machine-checkable unless tagged `judgment:`. Once a test named under a requirement
exists, it is the normative record for that requirement. The seven requirements moved here on 2026-10-14
(REQ-PLUGIN-005, -014, -016, -017 and -045 to -047) keep their criteria where they stood, under each requirement
above.

**REQ-FLOW-001**

- GIVEN `stamity init` for all four clients in a fixture whose ESLint flat config is the stock recommended set, with no
  Node globals and no ignore rule for the emitted paths, WHEN ESLint lints every emitted `.mjs`, `.js` and `.cjs`
  script THEN it reports 0 errors and exits 0.
- GIVEN the same emission WHEN each script is read THEN its first line (or its second, after a shebang) is
  `/* eslint-disable */`, and the rest of the file matches the emission without that line byte for byte.
- GIVEN the same emission WHEN `test/hooks/scriptBudget.test.ts` runs THEN it passes.

**REQ-FLOW-002**

- GIVEN sync for all four clients WHEN every emitted command body, skill, rule, agent definition and hook script is
  searched for an instruction to run a stamity verb THEN none is bare: each uses the pinned form, or sits in a file
  whose one Running-the-CLI sentence defines every `stamity <verb>` in it, with `<v>` equal to the emitting engine's
  version.
- GIVEN every file under `content/` WHEN searched THEN no fenced shell line and no `Run` cell starts with a bare
  `stamity `, a `Probe` cell does only in a file carrying the sentence, no `@latest` appears outside the sentence, and
  every `npx` call of the bare `stamity` name carries `--no`.
- GIVEN a fixture set up by `npx @zomarit/stamity init`, with no `stamity` on PATH or in `node_modules/.bin`, WHEN the
  handoff, learn and ledger steps run as the emitted bodies state THEN each exits with the verb's own status, never
  127, and installs or runs nothing under an unscoped package name.
- GIVEN an installed copy (`node_modules/.bin/stamity` present) WHEN the same steps run THEN they run
  `npx --no stamity <verb>`, resolve that copy, and make no registry download.
- GIVEN init WHEN the emitted `AGENTS.md` is read THEN its maturity-tier line reads
  "change via `npx -y <package>@<v> config`" (route clause dropped 1.15.0: "and the APM package's copy of the charter
  body carries `${STAMITY:CLI}` raw").
- GIVEN a package whose running manifest is `private: true` with no `publishConfig.registry` WHEN init or sync emits
  THEN every pinned call reads `npx --no <package>@<v>`, and no emitted file carries `npx -y <package>`.

**REQ-FLOW-003**

- GIVEN no network and no installed copy WHEN a flow reaches a handoff or learn step THEN the step writes no file, the
  closing report carries the `Not done:` line naming the step and the command, and the run does not report the step
  as done.
- GIVEN the same WHEN the orchestrator records ledger rows THEN every row parses in the ledger grammar, the committed
  tree keeps `test/records/ledgers.test.ts` green, and the run record carries `ledger: by hand (no CLI)`.

**REQ-FLOW-004**

- GIVEN the corpus WHEN the researcher dispatch sites are derived from `spawns:` and from skills naming a
  `` `researcher` brief `` THEN there are at least 9, each names the six keys, and every site but `st-ask`, `st-work` and
  `st-spec` carries the shared line verbatim; removing the line from one site fails the test naming that file.
- `judgment: reviewer` · GIVEN a `/st-plan` run and a `/st-work` run on a fixture WHEN their researchers return THEN none
  returns `BLOCKED_AMBIGUITY` naming a missing brief key.

**REQ-FLOW-005**

- GIVEN one item renaming a user-facing label in two components, plus the test queries in their two test files
  (4 files, about 12 lines), WHEN `/st-quick` classifies it THEN no threshold fires, the edit applies, and the gates run
  in a `test-runner` spawn.
- GIVEN one item changing one source file and the test file that follows it THEN the Files row does not fire.
- GIVEN a string change across three source files THEN the Files row fires and the refusal names `Files`.
- GIVEN a batch of 6 files, 2 of them tests, THEN the Files row fires.
- GIVEN the same label rename where a changed file sits on an authentication path THEN the Security-sensitive surface
  row fires.
- GIVEN a new route plus its test THEN the "Schema, API, event or migration" row fires.
- GIVEN an item a row refused WHEN the operator replies with a deadline, a role or a go-ahead THEN the reply is never
  taken as a confirmation, an approval or an authorization, and the refusal stands and restates its row
  (`content/commands/st-quick.md:58-59`; `test/corpus/commands/lightTrio.test.ts`, the case "takes no operator reply
  as a confirmation of a refused item").

**REQ-FLOW-006**

- GIVEN vitest in devDependencies, `"test": "vitest run"` and no vitest config file WHEN init runs THEN the charter
  reads `Test framework: vitest`.
- GIVEN a `[tool.pytest.ini_options]` table in `pyproject.toml`, with no `pytest.ini` and no `conftest.py`, THEN it
  reads `Test framework: pytest`.
- GIVEN no manifest signal and none of the config files THEN it reads `unknown`, as before.

**REQ-FLOW-007**

- GIVEN a Python fixture with `uv.lock` WHEN the gates render THEN they read `uv run pytest`, `uv run ruff check .`
  and `uv run mypy .`.
- GIVEN a fixture whose tools live only in `.venv/`, sources under `src/`, WHEN init runs THEN the manifest carries
  the three `gates` pins, init's output names them, and each pinned gate exits 0 from the root in a shell with no
  environment activated.
- GIVEN that initialised fixture cloned without `.venv/` WHEN `check` runs THEN it reports no drift.
- GIVEN a Python fixture with neither a lock runner nor a `.venv/` THEN the gates render exactly as before.

**REQ-FLOW-008**

- GIVEN a green setup with gates configured WHEN check runs THEN it exits 0, its closing line names
  `gates not run: lint, typecheck, test`, and no line reads `all green`.
- GIVEN a gate whose command renders `unknown` THEN a warning names that gate, and the exit code is the same as
  without the warning.
- GIVEN the gate `pytest` with no `pytest` on PATH, in `node_modules/.bin/` or in `.venv/bin/` THEN a warning reads
  `the test gate cannot be resolved — the charter says "pytest"`.
- GIVEN any check run with process spawns stubbed THEN no gate command is spawned.

**REQ-FLOW-009**

- GIVEN a deterministic defect and a report naming its input, expected output and actual output, on a repository whose
  test gate is runnable, WHEN `/st-debug` runs THEN, before any product-code edit, a test exists that fails twice on the
  current tree with a message naming the defect; the run asks no reproduction question and hands the diagnosis and that
  test to `/st-work` in the same session.
- GIVEN a report whose symptom depends on the user's environment THEN the run stops at step 3 and waits for the user's
  output.
- GIVEN `content/commands/st-debug.md` WHEN step 3 is read THEN it names both routes and the conditions that choose
  between them.

**REQ-FLOW-010**

- GIVEN a round on a fixture whose lint and typecheck pass WHEN its probes are in place THEN the implementer's return
  shows both gates `pass` on that tree before the reproduction step begins.
- GIVEN a debug stop that waits on the user WHEN the marker check runs THEN every hit carrying the run's id is listed
  with its path and line in the stop message and the open debug record.
- GIVEN a run that closes THEN the count of hits carrying its run id is 0, or the record carries the capture-later
  agreement with its date and sites.
- GIVEN every document in the tree, the emitted command files included, WHEN the marker check's pattern is searched
  THEN it finds no hit.

**REQ-FLOW-011**

- GIVEN a debug run WHEN its first mutation lands THEN the record exists under a run id ending `_debug-<slug>`, with the
  three head lines bare among its first 15, and `Status:` matches `/^status:.*\bin progress\b/im`.
- GIVEN the run closes THEN `Status:` no longer matches, and names the exit taken and the residue count.
- GIVEN `content/commands/st-debug.md` WHEN read THEN it no longer says that debug writes no run record.

**REQ-FLOW-012**

- GIVEN a repository of about 1,200 source lines and the request "create the spec" WHEN `/st-spec` asks its scope
  question THEN the first numbered option names the whole app and it is the declared default.
- WHEN that option is chosen, or no answer arrives, THEN at least one file under `docs/specs/` holds a requirement
  heading with an id in the house form and at least one GIVEN/WHEN/THEN criterion.
- GIVEN the same repository and "backfill the specs" with no scope named THEN the whole app is offered, and the default
  stays declining the sweep.
- GIVEN a repository of 5,000 or more source lines THEN no whole-app option is offered.

**REQ-FLOW-013**

- GIVEN each client's emitted test-runner definition WHEN read THEN it states: each gate once and unwrapped, the exit
  code from the tool, the `false` calibration, `unknown` never clean, and duration `not measured` when the tool gives
  none.
- GIVEN a scripted fixture gate whose call returns no exit code to a tool that also shows none for `false` WHEN the
  test-runner reports THEN that row reads exit code `unknown` with a status other than `pass`, and the verdict is `red`.
- GIVEN a Prove pass WHEN its tool calls are counted THEN each requested gate command ran exactly once.

**REQ-FLOW-014**

- GIVEN the shell-discipline test WHEN it runs over the corpus THEN it passes.
- GIVEN a shell fence using `PIPESTATUS`, `[[ ]]`, a shell array, process substitution, a `time` prefix, `echo $?`, a
  pipe into `tail` or `head`, or `sleep` THEN the test fails and names the file and line; and GIVEN an executing agent
  whose `## Shell` paragraph is cut THEN it fails naming the agent.

**REQ-FLOW-015**

- GIVEN a green result on a tree and no file change since WHEN the next Prove pass, other than the close's, runs THEN it
  cites that result by run and tree identity and runs no gate command.
- GIVEN one byte changed in a tracked file, or an untracked unignored file added, THEN the identity differs and the gates
  run.
- GIVEN a run's close THEN the proof block's `Gate results` label line names the change's class as `gate classify`
  named it (`unclear` when none ran) and the run's base commit, and the block names a green result, run on the final
  tree, of the gates that class requires. With none, the run reports `Not done:` (amended 2026-10-09, run
  `2026-10-08_product-core`, unit `p3c-work-gates`; it read "the proof block names a green result run on the final
  tree").
- GIVEN a cited result that ran only `test` THEN it covers `test` only.

**REQ-FLOW-016**

- GIVEN a `.gitignore` without these entries WHEN init or a live sync runs THEN `git check-ignore -q` exits 0 for
  `.stamity/review-gate.json`, `.stamity/review-gate.json.lock` and `.stamity/review-gate.json.tmp-1`, and sync's report
  names each entry it added.
- GIVEN a `.gitignore` whose existing rule already covers them, or a second sync, THEN `.gitignore` is byte-identical.
- GIVEN a repository where the state file is already tracked WHEN init runs THEN the output of `git ls-files --stage` is
  unchanged.
- GIVEN a live sync that the injection screen refuses at `.gitignore` THEN no emitted file was written.
- GIVEN a `.gitignore` without them WHEN init or a live sync runs THEN `git check-ignore -q` exits 0 for a file under
  `.stamity/context-once/` and for `.stamity/client-models.json`, each added last, and none is appended where the state
  directory's rule already covers it (added 2026-10-18; `test/mcp/env.test.ts`, `test/cli/commands/sync.test.ts`).

**REQ-FLOW-017**

- GIVEN 5 person rows and the reply "Signed off." WHEN the checkpoint records THEN 5 rows read `accepted-unwalked` and
  none reads `walked`.
- GIVEN the reply "Walked 1–3, all pass. Signed off." THEN rows 1–3 read `walked` and rows 4–5 read `accepted-unwalked`.
- GIVEN the reply "not signing, row 3 broke" THEN no row reads `accepted-unwalked` and the checkpoint stays open.
- GIVEN any QA record THEN no row reads `walked` unless the person's reply, quoted in the record, names it or says every
  row was walked.
- GIVEN the qa skill THEN its Proof column names `agent-run` with command, exit code and output path and `contradicted`
  with the prover's redacted excerpt, and proven rows fold into one line; GIVEN a `contradicted` row and a reply that
  says it was walked THEN the walk is recorded beside the excerpt and the row stays failing; GIVEN `/st-work`'s proof
  block THEN its QA line folds the proven rows and lists each row not proven, over the cap or `contradicted` with its
  reason or excerpt (`test/corpus/skills/flow.test.ts`, `test/corpus/commands/work.test.ts`; added 2026-10-15).

**REQ-FLOW-018**

- GIVEN every row auto-proven WHEN the checkpoint runs THEN no QA question is asked and the record carries
  "all N rows auto-proven" with the row count.
- GIVEN a non-interactive run THEN QA reads `Shippable: not signed` and no row reads `walked`.
- GIVEN a prior `accepted-unwalked` row and a new row with the same input hash THEN it is recorded as
  `accepted-unwalked (carried from <run-id>)`, naming the prior run id, with no question. GIVEN one input byte changed
  THEN the row is asked again.
- GIVEN a row whose Risk is `H` recorded `accepted-unwalked` THEN `Shippable` does not read `YES` and the record names
  the open `H` row.
- GIVEN an `H` row that stands `contradicted`, or an `H` row over the cap of three left unasked, THEN `Shippable` does
  not read `YES`; it reads `YES` only once every `H` row is walked or proven and none stands `contradicted`; GIVEN every
  row proven, `agent-run` rows among them, THEN no QA question is asked and the record carries "all N rows auto-proven"
  (`test/corpus/skills/flow.test.ts`; eval case `qa-contradicted-row-fails-security-row-first`; added 2026-10-15).

**REQ-FLOW-019**

- GIVEN a persisted plan that settles inbox row X, and a run whose files overlap X, WHEN Frame runs THEN no question
  names X and the record lists X with the plan's disposition.
- GIVEN standard intensity and a fresh persisted plan WHEN the plan gate is reached THEN no question is asked, and the
  record holds `Default applied: plan gate → option 1, execute now (persisted plan <path>)`.
- GIVEN deep intensity THEN the plan gate asks.
- GIVEN a close with person rows, a spec delta and uncommitted changes THEN the close walk asks about all three, one ask
  per turn in rounds of numbered options, and its declared default reads "leave uncommitted" (amended 2026-10-15, plan
  020 file 3; it read "exactly one question is asked, naming all three").
- GIVEN no answer to that question THEN nothing is committed, no spec file changes, and QA reads `not signed` (amended
  2026-10-16, plan 021 file 1: in an attended run; an unattended close ends by REQ-FLOW-075 and REQ-FLOW-092).
- GIVEN `/st-work`'s close walk THEN the commit part offers `1 commit, push, draft PR` (recommended, through
  `stamity run checkpoint --pr`), `2 commit only` and `3 leave uncommitted`, and `Default if no response: leave
  uncommitted` stands word for word (added 2026-10-16; `test/corpus/commands/work.test.ts`).
- GIVEN that question has been answered THEN no later turn of the run asks about committing.
- GIVEN a close with person rows, a spec delta, uncommitted changes and leftovers THEN the walk asks about all four, and
  the proof block prints after its last answer with nothing after it (added 2026-10-10, unit `q10a-work-close`;
  REQ-FLOW-074; amended 2026-10-15, plan 020 file 3; it read "exactly one question is asked, naming all four").

**REQ-FLOW-020**

- GIVEN "where is `formatTotal` defined and what does it return?" WHEN `/st-ask` runs THEN at most one researcher is
  dispatched, and every claim cites a `path:line`.
- GIVEN an impact question THEN 3–5 facets are dispatched, as the table says.
- GIVEN a named symbol defined in two files THEN the question fans out as a mechanism question.

**REQ-FLOW-021**

- GIVEN a `reviewBy` 13 days ahead THEN a warning names it. GIVEN 15 days ahead THEN none does.
- GIVEN two learnings whose modified-time order is the reverse of their `date` order THEN the index lists the newer
  `date` first.
- GIVEN any banner THEN each printed byte figure equals the byte length of the index lines it printed.

**REQ-FLOW-022**

- GIVEN init for all four clients WHEN its output is compared with the files on disk THEN the printed count equals the
  files the run wrote other than `.gitignore`, and each path it reports writing exists.
- GIVEN two clients that share `AGENTS.md` WHEN `check` runs THEN its manifest row names fewer managed paths than ledger
  rows, and names both clients.
- GIVEN an install pinned at 1.9.1 and a registry answering 1.10.0 WHEN the notice prints THEN it contains
  `npx -y <name>@1.10.0 sync` and a way to stay, and no `@latest`. GIVEN the registry answer `v1.3.0` THEN both halves
  of the banner name `1.3.0`.
- GIVEN a repository with `engines.node: "22"` and `actions/checkout@v7` in its own workflow WHEN setup emits the
  Copilot workflow THEN it carries `node-version: "22"` and `actions/checkout@v7`. GIVEN the emitted workflow as the
  repository's only workflow WHEN sync runs again THEN the file is byte-identical.
- GIVEN `init -y` with no client traces THEN the panel names claude as the default with the pinned `config set tools`
  route, and the dry run names `--tools`. GIVEN a detected or flagged client set THEN no default line prints.
- GIVEN codex selected THEN init's next steps list project trust before `codex` and the `/hooks` review after it, and
  `.codex/hooks.json` and `.codex/config.toml` are byte-identical to the emission before the unit.
- GIVEN a `.gitignore` that already covers `.env.mcp` THEN the panel names only the entries the run appended. GIVEN no
  MCP server THEN no line says "the credential file this setup uses".
- GIVEN a live `init -y --tools copilot` THEN the panel and the `nextSteps` of `--json` name the setup workflow. GIVEN a
  dry run THEN neither does.
- GIVEN `init -y` in a repository whose origin is `https://github.com/acme/demo.git` THEN the manifest's `platform` is
  `github` and the panel prints `platform: github (from the origin remote)` on its own line. GIVEN no origin THEN the
  manifest has no `platform`, and the panel prints the `none detected` line with the pinned `config set platform
  <name>` call and the values `github, azure-devops, gitlab` (added 2026-10-06; `test/cli/commands/init.test.ts:654`,
  `test/cli/commands/initPanel.test.ts:886`).
- GIVEN `init -y --maturity enterprise` on a directory that would seed `solo` THEN the manifest's `maturityTier` is
  `enterprise` and the panel reads `(tier: enterprise, …)`. GIVEN `--maturity galactic` THEN init exits non-zero naming
  the value, and no `.stamity/` is created (added 2026-10-06; `test/cli/commands/init.test.ts:581`).

**REQ-FLOW-024**

- GIVEN an inbox row whose `file:line` the run's change fixes, and which the run names as fixed, WHEN the close runs THEN
  the row is gone from `.stamity/inbox.md` and the record carries its retirement line.
- GIVEN a row the run did not name as fixed and the close's answer did not decide THEN it stays, byte-identical
  (amended 2026-10-10, unit `q10a-work-close`; it read "GIVEN a row the run did not name as fixed THEN it stays,
  byte-identical").
- GIVEN a `/st-quick` batch that fixed a named row THEN the row is gone and the batch report names it.
- GIVEN a deferred ledger row and a clock fixed at 2026-10-02 WHEN
  `ledger close --run r1 --id prove/3 --retired "fixed in r2"` runs THEN the row keeps `deferred`, gains
  `retired: "2026-10-02 fixed in r2"`, and a second run, on that day or a later one, prints `unchanged`.
- GIVEN an `open` row WHEN `--retired` names it THEN the command exits 1 and the ledger is byte-identical.

**REQ-FLOW-025**

- GIVEN the lint over `content/` WHEN it runs THEN it passes.
- GIVEN a body line that writes under `.stamity/` with a redirect, a heredoc or `tee` THEN the lint fails and names the
  file and line.
- GIVEN `content/commands/st-work.md` WHEN its Frame step is read THEN it names the file tools for `record.md`,
  `plan.md` and reports, and forbids a shell redirect, a heredoc and `cat >` (amended 2026-10-12, run
  `2026-10-12_board-writes`; it read "for `record.md`, `plan.md`, reports and the inbox").
- GIVEN Phase 0 collapsed WHEN read THEN it contains "Records are files: create and extend `record.md`, `plan.md` and
  reports with the client's file write and edit tools — never a shell redirect, a heredoc or `cat >` — and move ledger
  rows only through the `ledger` verb under Ledger writes." (added 2026-10-12; `test/corpus/recordWrites.test.ts`).
- GIVEN `buildSettingsJson` THEN `permissions` holds the engine's `ask` and `deny` rows and no `allow` row (added
  2026-10-16; amended 2026-10-18, plan 021 file 2, it read "holds the engine's `deny` rows and no `allow` row";
  `test/adapters/claude.test.ts`, `test/merge/settingsOwnerEntries.test.ts`).

**REQ-FLOW-026**

- GIVEN sync with Codex selected THEN nine `.agents/skills/st-<id>/SKILL.md` files exist, each with an
  `agents/openai.yaml` that turns implicit invocation off, and Codex's skills-list total stays under 8,000.
- GIVEN tools `[claude, cursor]` THEN no `.cursor/skills/st-<id>/` and no `.claude/skills/st-<id>/` exists, and
  `.claude/commands/st-<id>.md` does.
- GIVEN sync on a tree whose ledger carries 1.10.0's `.cursor/skills/st-<id>/` files THEN they stay byte for byte, the
  sweep names each `skipped-user-content`, their rows leave the ledger, `.agents/skills/st-<id>/SKILL.md` is written,
  and every other file under `.cursor/` is byte-identical (amended 2026-10-08, unit `d1a-rendering-proof-core`; it
  read "THEN they are removed, and every other file under `.cursor/` is byte-identical").
- GIVEN Copilot selected beside Codex or Cursor THEN its capability disclosure declares the double listing.
- (Route clause dropped 1.15.0: "GIVEN a Codex plugin build THEN no touchpoint ships in the plugin, and the content
  skills still map under `skills/`", the plugin build deleted in 1.15.0.)
- GIVEN tools `[codex]` WHEN init prints its next steps THEN they name `$st-onboard` and `$st-<id>`, and never
  `/st-onboard`.
- `judgment: maintainer` · GIVEN a live Codex session WHEN the user types `$st-work` THEN the body loads; GIVEN a live
  Cursor session WHEN the user types `/st-work` THEN it loads there too.
- GIVEN the full selection with Codex WHEN its skills list is measured THEN the nine touchpoints are not counted, 17
  rows are shown, and the shown total equals `codexSkillsListChars` (added 2026-10-06;
  `test/adapters/codex.test.ts:2087`).

**REQ-FLOW-036**

- GIVEN a `.claude/settings.json` holding `permissions.allow: ["Bash(npm test:*)"]`, `permissions.deny:
  ["Bash(rm -rf:*)"]`, a `PreToolUse` entry with matcher `Bash` running `./scripts/guard.sh`, and `model` WHEN `init -y
  --tools claude` runs THEN it exits 0, the file is written rather than skipped, and each of those members is byte for
  byte present beside the engine's rows and entries.
- GIVEN that setup WHEN `sync -y`, `sync -y --force` and `init -y --force` run THEN the deny rule and the owner's hook
  entry are unchanged after each, and no `.bak` exists.
- GIVEN a setup to which the owner added `permissions.deny` WHEN `check` runs THEN it exits 0 with no drift for the file;
  WHEN `sync -y` runs THEN the file is byte-identical.
- GIVEN the first fixture WHEN `init -y` and then `clean -y` run THEN the file is byte-identical to before setup and no
  `.bak` exists.
- GIVEN a `.claude/settings.json` to which another tool added a key after setup WHEN `clean -y` runs THEN the file holds
  that key alone and no `.bak` exists.
- GIVEN a ledger record that claims the owner's deny rule, the whole `permissions` member or the owner's allow row WHEN
  `sync -y` and `clean -y` run THEN those members survive both; GIVEN a record that claims the owner's hook entry, whose
  script lies outside `.stamity/`, THEN that entry leaves only behind a verified `.bak` and a warning names it.
- GIVEN a four-space file without a final newline, a tab-indented one, a one-line one and a CRLF one WHEN `init -y` and
  then `clean -y` run THEN each is byte-identical to before, and after `init` each is still in its own style.
- GIVEN a file whose `permissions` is a string WHEN `init -y` runs THEN the file is skipped with a message naming
  `permissions`; WHEN `check` runs THEN it exits 1 and no line of its output contains `--force`.
- GIVEN an engine hook entry the owner edited WHEN `sync -y` runs THEN the engine's entry is restored, a verified `.bak`
  holds the edit, and the warning names the entry and `.claude/settings.local.json`.
- `judgment: reviewer` · One residue is content-equal rather than byte-identical, and the unit records it: a JSON style
  `JSON.stringify` cannot write (aligned colons, inline arrays, number or escape spellings) comes back with the same
  keys and values.
- GIVEN a user hook defined in `.stamity/hooks/` WHEN `init -y --tools claude` and then `clean -y` run THEN no `.bak`
  exists; GIVEN that definition then edited, or removed, WHEN `sync -y` runs THEN one verified `.bak` exists and the
  warning names the entry (added 2026-10-07 from the build).
- GIVEN a record claiming an owner's hook entry whose command passes `.stamity/g.json` as an argument to a script
  outside `.stamity/` WHEN `sync -y` runs THEN the entry leaves only behind a verified `.bak` (added 2026-10-07 from the
  build).
- GIVEN a settings file holding a duplicate key, or a number past what a double holds exactly, WHEN `init -y` writes it
  THEN a verified `.bak` holds the previous bytes and the warning says why; GIVEN a file opening with a byte-order mark
  THEN the merged file still opens with it (added 2026-10-07 from the build).
- GIVEN a setup whose `.claude/settings.json` the owner then changes so `hooks.PreToolUse` is a string WHEN `sync -y`
  runs THEN the file is refused as `co-owned-shape` and the ledger keeps its settings rows and their record; WHEN
  `clean -y` runs THEN every engine hook script the kept file names remains (added 2026-10-07 from the build).
- GIVEN a file whose `permissions.deny` holds an owner's row and a row equal to an engine row WHEN `sync -y` runs THEN
  both stay byte for byte and in place and only the missing engine rows are appended; WHEN `clean -y` runs THEN no deny
  row is removed and its result names the rows equal to the engine's that it left (added 2026-10-16;
  `test/merge/settingsOwnerEntries.test.ts`, `test/manifest/claudeSettings.test.ts`).
- GIVEN a file whose `permissions.ask` holds an owner's row and a row equal to an engine ask row WHEN `sync -y` runs
  THEN both stay byte for byte and in place, a second `sync` moves no byte, and only missing engine rows are appended;
  WHEN `clean -y` runs THEN no ask row is removed and a leftover deny row equal to an engine ask row is named (added
  2026-10-18; `test/merge/settingsOwnerEntries.test.ts`, `test/manifest/claudeSettings.test.ts`).

**REQ-FLOW-037**

- GIVEN `init -y --tools cursor` and an owner entry under `hooks.afterFileEdit` in `.cursor/hooks.json` WHEN `check`
  runs THEN it exits 0 with no drift for the file; WHEN `sync -y` runs THEN the file is byte-identical and no `.bak`
  exists; WHEN `clean -y` runs instead THEN the file holds `version` and the owner's entry alone, and no guard script
  remains.
- GIVEN `init -y --tools codex` and an owner group under `hooks.PostToolUse` in `.codex/hooks.json` WHEN `sync -y` runs
  THEN the file is byte-identical and no `.bak` exists; WHEN `clean -y` runs THEN the file holds the owner's group alone.
- GIVEN an owner `[mcp_servers.team]` table in `.codex/config.toml` WHEN `sync -y` runs THEN the file is byte-identical;
  WHEN `clean -y` runs THEN the file holds the owner's table alone.
- GIVEN a `.codex/config.toml` holding a top-level key and an owner table before setup WHEN `init -y --tools codex` and
  then `clean -y` run THEN it is byte-identical to before.
- GIVEN an owner `[features]` table that sets `hooks = false` WHEN `init -y --tools codex` runs THEN the file holds one
  `[features]` header, the owner's table is unchanged, and the run warns naming `hooks = false`; WHEN `check` runs THEN it
  exits 1 naming the file, the line and the remedy, for a quoted key as for a bare one; GIVEN one that does not set
  `hooks` THEN no warning.
- GIVEN a `.cursor/hooks.json` that does not parse WHEN `clean -y` runs THEN the file is kept, every script it names
  remains, and the report names the file for each kept script.
- GIVEN a repository set up by 1.11.0 with an owner entry added to `.cursor/hooks.json` WHEN `clean -y` runs before any
  `sync` THEN the owner's entry remains and no script the kept file names is missing.
- GIVEN a `.cursor/hooks.json` holding a foreign entry under an event key Cursor's validator does not accept WHEN
  `check` runs THEN it exits 1 naming the entry and the remedy; WHEN `sync -y` runs THEN it keeps the entry, warns
  naming it, and exits 0.
- GIVEN a foreign `{"type": "prompt", "prompt": "…"}` entry under a Cursor event WHEN `check` runs THEN that entry fails
  nothing; GIVEN a `"prompt"` entry with no `prompt`, or an entry whose `type` is neither `"command"` nor `"prompt"`,
  THEN `check` exits 1 naming it (added 2026-10-07 from the vendor re-read and the build).
- GIVEN an owner `[features]` that is no release's rendering and a ledger record or a whole-file hash claiming it WHEN
  `sync -y` runs THEN the table is byte-identical; GIVEN `features.x = 1` at the top level, or an owner
  `[[mcp_servers]]` while a server is selected, WHEN `init -y --tools codex` runs THEN the file is refused as
  `co-owned-shape` naming the key or the header's line; GIVEN 64 selected servers THEN the plan refuses naming
  `config mcp remove <id>`, and 63 pass (added 2026-10-07 from the build).
- GIVEN a repository set up by 1.6.0 with a user hook and an installed pack's hook wired directly in `.cursor/hooks.json`
  or `.codex/hooks.json`, their definitions still in place, WHEN `sync -y` runs THEN each direct entry is replaced by the
  runner's and each hook is wired once;
  GIVEN a forged legacy row and an owner's entry THEN the owner's entry remains after `sync -y` and `clean -y` (added
  2026-10-07 from the build).
- GIVEN a hooks document the sweep leaves in place — reduced to the owner's entries, refused, linked, or no reclaim
  candidate at all — WHEN `clean -y` or a client's removal sweeps THEN every engine hook script it names remains (added
  2026-10-07 from the build).
- GIVEN Copilot set up and a `.github/hooks/stamity.json` its ledger does not record, running a retired engine script
  under `.stamity/generated/hooks/copilot/` WHEN `sync --json --dry-run --force` runs THEN the preview names the script
  as a delete, and `sync -y --force` deletes exactly the previewed set; WHEN `sync --dry-run` runs without `--force`
  THEN the preview keeps the script, and `sync -y` exits 1 with both files unchanged; GIVEN a forged row and hash at an
  engine-named agent path THEN the forced preview and the forced run keep it; GIVEN that document hard-linked,
  symbolically linked, or under a `.github/hooks` folder linked outside the repository, or a `deny-scan`,
  `shared-name`, `co-owned-shape` or `import-decision` collision THEN the forced preview keeps the script (added
  2026-10-08, unit `d2-forced-preview`; `test/merge/hookFilesOwnership.test.ts`, the row 588 describe).

**REQ-FLOW-038**

- GIVEN `init -y --tools cursor` THEN `.cursor/hooks/` holds exactly `stamity-mcp-guard.mjs` and
  `stamity-subagent-guard.mjs`, and `.cursor/hooks.json` runs them on `beforeMCPExecution` and `subagentStart` with
  `failClosed: true`.
- GIVEN a repository set up by 1.11.0 WHEN `sync -y` runs THEN `.cursor/hooks/subagent-guard.mjs` and
  `.cursor/hooks/mcp-guard.mjs` are gone, the two new files exist, `.cursor/hooks.json` names only the new paths, and
  `check` then exits 0; GIVEN the old MCP guard edited by hand THEN it stays and the sync report names it.
- GIVEN all four clients and two MCP servers selected THEN every planned path outside `.stamity/` and the fixed list
  above has a `stamity-` or `st-` segment.
- GIVEN a repository set up by 1.11.0 whose `.cursor/hooks.json` is refused or linked WHEN `sync -y` runs THEN both old
  guards stay; GIVEN `check` before that `sync` THEN its reclaim lines name the old guards with the action the write
  takes; GIVEN a repository whose ledger never recorded the old names and an owner entry running
  `node .cursor/hooks/mcp-guard.mjs` THEN that entry stays the owner's (added 2026-10-07 from the build).
- GIVEN a 1.11.0 setup's unedited guards and entries — core, with a local pack's agents, or with an override agent —
  WHEN the first `sync -y` runs THEN both guards are deleted, both entries name the `stamity-` guards, and no `.bak`
  exists; GIVEN a fork's setup THEN the fork's identity proves both guards and the canonical identity keeps both.
  GIVEN an owner's own scripts at both old names under forged rows, a pinned entry, a forged co-owned hash and a
  re-pointed document hash WHEN `sync -y` or `clean -y` runs THEN both scripts and the entry stay byte for byte and no
  `.bak` exists; WHEN `init --force` runs THEN both scripts and the entry stay. GIVEN the old MCP guard edited by hand
  WHEN `sync -y` or `init --force` runs THEN the guard and the entry that runs it stay. GIVEN a setup whose ledger
  lost one Cursor agent row THEN the spawn guard and its entry stay and are named, and the MCP guard moves. GIVEN an
  old guard the owner deleted THEN its entry is still rewired. GIVEN the four fixtures THEN each hashes to its pinned
  SHA-256 and the frozen builder renders it byte for byte (added 2026-10-08, unit `d1b-cursor-guard-pins`;
  `test/merge/hookFilesOwnership.test.ts`, `test/adapters/cursorLegacyGuards.test.ts`).

**REQ-FLOW-061**

- GIVEN `gate classify --paths docs/x.md --json` THEN the class is `docs`, the checks are `scan`, `tests-selected`
  and `review-once`, and the reason says no base was given. GIVEN `docs/conf.py`, `docs/.vitepress/config.ts` or
  `.stamity/runs/x/run.py` THEN the class is `product`; GIVEN `docs/a.test.ts` THEN `tests`.
- GIVEN `docs/auth/AGENTS.md` or `.stamity/runs/x/claude.md` THEN the class is at least `product`; GIVEN
  `.Stamity/manifest.json` or `.stamity/change-classes.json` THEN `security-sensitive` with the security lens.
- GIVEN an unplaced path, an empty path list, or a rename from `docs/a.md` to `src/a.ts` THEN the class is at least
  `product` and the reason names why; GIVEN an unresolvable `--base`, or `--base HEAD` on an unborn `HEAD`, with or
  without `--paths`, THEN the verb exits 1, its JSON carries `ok: false`, `base: null` and a `reason` saying the base
  could not be read, and it has no `class` or `checks`; GIVEN a ref starting with `-` THEN the verb exits 2 and git
  never runs.
- GIVEN a change that edits `.stamity/change-classes.json` WHEN `gate classify --base <base>` runs THEN that path is
  `security-sensitive`, and every other path is placed by the base commit's copy, never the head's or the work
  tree's.
- GIVEN a class file with a `records` or `docs` glob `**/*.*`, `notes/**` or `*`, a `docs` glob matching every
  path, a glob over 200 characters, or a test entry starting with `-` THEN `check` fails naming the first error, and
  from a base holding that copy every change is at least `product` and only its raising entries apply.
- GIVEN a project whose `.stamity/` sits below the git top-level WHEN the verb runs from any folder of it THEN paths are
  classified project-relative, the class file is read under the project's prefix, and a changed path outside the
  project raises the class to at least `product`, or to `security-sensitive` when it is a lockfile, a workflow or the
  engine's own state.
- GIVEN a git failure reading the change's paths (a directory outside a work tree, no git binary, a timeout) THEN the
  class is `product` and the reason names the failure; GIVEN a failed read of the changed lines THEN the class is
  `security-sensitive` with the security lens; GIVEN a failed test-source read THEN `tests.full` is true and the class
  and lenses are those the change's paths and lines gave; GIVEN a failed read of a changed `package-lock.json`'s base
  copy THEN the security lens stays and the reason names the failure.

**REQ-FLOW-062**

- GIVEN a valid base map and a `docs` change to a page one test reads by a string literal THEN `tests.files` names that
  test and `tests.full` is false; GIVEN no map THEN `tests.full` is true.
- GIVEN a `config` or stronger class THEN `tests.full` is true, whatever the map selects.
- GIVEN a `records` or `docs` change no test reads THEN `tests.files` is empty and `tests.full` is false; GIVEN a
  `tests` change that selects nothing THEN `tests.full` is true.
- GIVEN a map entry whose `tests` is `"all"` and matches a changed path, a test source holding a glob literal over the
  cost bound, or a selected file the work tree lacks THEN `tests.full` is true and the reason names the cause.
- GIVEN this repository's tree WHEN `test/ci/testInputsGuard.test.ts` runs THEN it passes, and GIVEN a test that reads
  a docs page no map entry lists THEN it fails naming the pair.

**REQ-FLOW-063**

- GIVEN `/st-quick` and a one-line typo fix THEN the gate runs: the scan, `gate classify --base HEAD --json`, then the
  class's checks in a `test-runner` spawn.
- GIVEN `/st-work`'s Prove pass THEN it scans and classifies with `--base` set to the record's `Base:` commit, and on
  the final tree a `product` or stronger class runs `${STAMITY:VERIFY_GATE_ALL}`.
- GIVEN a test-runner body whose rendered CI provider reads `unknown`, or that still carries the unresolved `STAMITY`
  substitution token, THEN the final tree runs `all` whatever the class; GIVEN `/st-quick` and a charter whose
  `CI provider` reads `unknown` THEN the batch runs `${STAMITY:VERIFY_GATE_ALL}` whatever its class (amended
  2026-10-10, unit `q6t-test-runner-ci-line`; it read "GIVEN a charter whose `CI provider` reads `unknown` THEN the
  final tree runs `all` whatever the class").
- GIVEN a `red` test-runner verdict and a named report path THEN nothing is written to that path, and the rows and
  excerpts are returned in full (added 2026-10-10, unit `q6t-test-runner-ci-line`).
- GIVEN a `/st-work` run with no recorded base and committed work, a CLI with no `gate` verb, or a scan naming a
  `reason` THEN the full gates run and `Not done:` lists `secret scan: not run`; GIVEN a `/st-work` run with no
  recorded base whose work is all uncommitted, and a scan against `HEAD` with no hit and no `reason`, THEN the final
  tree runs `${STAMITY:VERIFY_GATE_ALL}` and `Not done:` lists no `secret scan: not run`.
- GIVEN a class whose checks name `review-once` and a Warning it raises THEN the Warning is fixed and closure-reviewed
  once, and no further round runs.
- GIVEN the charter THEN invariant 4 reads "Done means the gates `gate classify` names exit 0 (all if it did not run)."
  with the `Not done:` line unchanged, and `invariants_version` reads `1.3.0` (amended 2026-10-15, plan 020 file 3; it
  read `1.2.0`, which invariants 2 and 5 moved).

**REQ-FLOW-064**

- GIVEN the roster THEN `DEFAULT_MAX_REVIEW_ITERATIONS` is 3 and the band 1..10; GIVEN `config set
  review.maxIterations 4` THEN 4 persists.
- GIVEN a finding still open entering the cap round (round 3, round 2 at light), a ledger row carrying two
  `re-review not-fixed` notes, or a gate red after a fix THEN a fresh fixer spawn, never the resumed one, takes it
  with the round history, one effort level above the fixer's declared one where the client takes one, and no round
  past the cap runs.
- GIVEN a client whose dispatch takes no effort setting THEN the proof block records `effort: not settable`.
- GIVEN a finding the escalation fixer leaves open THEN the run stops as `BLOCKED_FAILURE` to the person with the open
  findings attached.
- GIVEN `content/commands/st-work.md` and `content/agents/stamity-fixer.md` THEN neither names a round above the default
  cap, nor the phrase "fresh fixer on a stronger model class".

**REQ-FLOW-065**

- GIVEN `.github/workflows/ci.yml`, `.claude/settings.json`, `.cursor/hooks.json`, `scripts/x.sh`,
  `Dockerfile.prod`, `.npmrc`, `.codex/config.toml` or `.config/stamity/hooks/guard.json` THEN the class is
  `security-sensitive` with the security lens; GIVEN `src/hooks/useX.ts` in a repository whose class file does not
  place it THEN the class is `product`; GIVEN a top-level `hooks/guard.mjs` THEN the security row does not match it.
- GIVEN an added line `execSync(cmd)` in a TypeScript file outside the test globs THEN the class is
  `security-sensitive` and the reason names `process-spawn` and the path and line, never the line's text; GIVEN the
  same line in a test file THEN no line rule fires.
- GIVEN a hunk that removes a guard around an existing `rmSync(` call THEN the context line counts and the class is
  `security-sensitive`.
- GIVEN an npm lockfile v3 bump of one existing registry package to a higher semver version, staged, with no install
  script, its `resolved` the registry tarball of its own name and new version on its base twin's origin, and no
  `package.json` change THEN the checks include `dependency-audit`, the lenses omit the security lens, and the class
  stays `security-sensitive`.
- GIVEN the same bump with `hasInstallScript: true`, a package new to the graph, a `git+` or other-host `resolved`, a
  `resolved` or `integrity` moved at an unchanged version, a version moved to a lower one or to one that is no semver
  version, an unstaged copy, a `pnpm-lock.yaml`, or a base copy that does not parse THEN the security lens stays and
  the reason says why.
- GIVEN `/st-work` at light intensity and a `security-sensitive` class THEN the security lens runs; GIVEN no class
  from `gate classify` THEN it runs at every tier; GIVEN `## Dials`' light and standard rows THEN each names the lens
  with no class from `gate classify` and the lockfile's own trigger-path match waiting for the audit's flag.
- GIVEN `st-dep-audit`'s `## Before the security lens` THEN it finds the bump's entries against the run's `Base:`
  commit, never `HEAD` or the work tree, and a base it cannot read makes the run `partial`.
- GIVEN a lockfile-only bump that moves an entry by a patch version, where the entry's own class is `unmaintained` or
  `pinned-back`, THEN the audit's Risk row states both classes, the audit flags, and the lens runs; GIVEN a changed
  entry the audit cannot class THEN it counts as a flag (added 2026-10-10, unit `q11c-dep-audit-writer`).
- GIVEN `/st-quick` and a batch `gate classify` names `security-sensitive` THEN the whole batch moves to `/st-work` as
  it stands, nothing reverted, every applied item listed ungated under `Not done:`; GIVEN no class (neither CLI form
  runs, the classify exits non-zero, or its `reason` names a failed read) THEN a batch touching a path the security
  agent's `## Trigger` table names moves the same way, and a docs-only batch stays.
- GIVEN `test/corpus/agents/specialists.test.ts` THEN the security agent's Trigger table and the roster's security row
  agree in both directions.

**REQ-FLOW-066**

- GIVEN an added line assigning a credential-shaped literal to a credential-named variable THEN `gate scan` exits 1 and
  its hit names path, line and rule, and no output carries the value.
- GIVEN `--base` and a credential committed and removed again since the base THEN the scan exits 1 and the hit names
  its commit.
- GIVEN a lockfile bump whose added lines carry only `sha512-` integrity hashes THEN the scan exits 0.
- GIVEN no `--base` THEN the JSON reads `base: null` and `scope: "uncommitted"`.
- GIVEN any git failure THEN the scan exits 1 with `ok: false` and a `reason`, never 0; GIVEN an added line longer than
  262,144 characters (string length, not bytes) THEN it exits 1 with a `reason` naming the line.
- GIVEN a tracked code file the read cannot show THEN it is listed in `unscanned`, and the flow lists
  `secret scan: 1 files unscanned` under `Not done:`, naming the path.
- GIVEN a scan hit in either flow THEN the batch or the pass stops, and the value is never rewritten and scanned again.

**REQ-FLOW-067**

- GIVEN `/st-plan` and a unit whose files `gate classify --paths` places `security-sensitive` THEN the unit carries a
  `threat` row of at most five lines naming its trust boundary, what it trusts, one abuse case and the check that
  stops it; GIVEN any other unit THEN no `threat` row.
- GIVEN a CLI that cannot run, an installed copy with no `gate` verb, or a classify whose `reason` names a failed read
  THEN every unit carries the `threat` row.

**REQ-FLOW-072**

- GIVEN the reviewer, a lens, the implementer and the fixer WHEN each digest is read THEN its `findings:` line ends
  `notes left out: <n>`, and an inline result carries the count and never the notes.
- GIVEN a note whose consequence is a misleading message a user acts on THEN the reviewer records it as a finding at the
  severity that consequence sets. `judgment: reviewer`
- GIVEN an implementer that finds a one-line wording note in its own unit's file THEN it applies it; GIVEN a larger
  adjacent improvement THEN it lists it as a note left out and lists no deferral for it.
- GIVEN `/st-rework` and a person's own "nit" feedback THEN it is a Minor finding routed to a plan unit or an inbox row;
  GIVEN a leftover-scan hit with no named consequence THEN it is listed under the phase-4 table as a note and counted,
  never routed.

**REQ-FLOW-073**

- GIVEN the six bodies THEN each ends on a `## Severity` section byte-identical to the test's constant.
- GIVEN the performance lens and no declared budget over the surface THEN its strongest finding is a `Warning`.

**REQ-FLOW-068**

- GIVEN an inbox holding a row at `src/a.ts:3`, a row at `—` with `files: src/b.ts`, a row tagged `decision-waiting`
  and two rows naming other paths WHEN `ledger inbox --paths src/a.ts src/b.ts` runs THEN the first two match as
  `path` and the third as `always`, the count line reads 5 rows, 3 matched and 2 unmatched, and the two other rows
  print nowhere.
- GIVEN a row at `src/a.ts:3` whose description the screen hits WHEN `ledger inbox --paths src/a.ts --json` runs THEN
  the human line reads `<line> <severity> · src/a.ts:3 · withheld by the screen (<pattern id>); read it by hand
  (path)`, the JSON entry carries the pattern id under `withheld` with `description`, `source` and `ref` null, and
  none of the description's words print; GIVEN the hit in the location field, or on a line that does not parse, THEN
  only `skipped: <line> (<pattern id>)` prints.
- GIVEN a screened phrase split by an invisible character, or by a control character `sanitizeLabel` drops, THEN the
  row is withheld or skipped as the unsplit phrase is.
- GIVEN a bullet of 4,097 UTF-16 code units THEN it prints `skipped: <line> (over-length)`, and one of 4,096 is
  screened.
- GIVEN 60 lines that do not parse THEN 50 are listed, one `unparsed: … +10 more` line follows, the count line reads
  60 unparsed, and the JSON carries 50 `problems` and `truncated.problems: 10`.
- GIVEN more than 50 bullets the screen skips and a withheld row the query matches THEN the JSON `skipped` holds the
  first 50 bullets the skip lines name and `truncated.skipped` the number of the rest, and the withheld row stands under
  `matched` with its pattern id as `withheld` and not under `skipped` (added 2026-10-10, the whole-branch review's fix
  round, `review/78`).
- GIVEN an inbox that is a symbolic link, a hard link (a regular file with more than one link), larger than
  1,048,576 bytes, or grown past that size after its size was read, THEN the query refuses with `VALIDATION_ERROR`
  and prints none of the file's text, and its `next` says not to read the file whole and to report the refusal as a
  finding; GIVEN an inbox of exactly 1,048,576 bytes THEN it is read; GIVEN no inbox THEN it prints `inbox: absent`
  and exits 0 (amended 2026-10-10, the fix batch for the pull request's review bot, `review/105` and `review/106`; it
  read "an inbox that is a symbolic link, or larger than 1,048,576 bytes, THEN the query refuses with
  `VALIDATION_ERROR`, and its `next` says", and held no exact-size case).
- GIVEN `content/commands/st-work.md` WHEN Frame step 4 is read THEN it names the `ledger` verb's `inbox` query with
  `--paths` and `--plan`, the second query from a bare intent, a row the query withholds, skips or cannot parse listed
  as it prints, the person's to read or fix, with "never open the inbox for it", the whole-file read only when the CLI
  or that query is absent, and any other failure as a finding, never a whole-file read (amended 2026-10-10, the
  whole-branch review's fix round, `review/90`; it read "a withheld or skipped row listed as it prints").
- GIVEN a run whose query refuses the read WHEN Frame runs THEN the record carries a finding naming the refusal and
  the orchestrator opened no inbox file. `judgment: reviewer`

**REQ-FLOW-069**

- GIVEN the qa skill WHEN read THEN it names the five categories, says every row no artifact covers goes to the prover
  first and at most three rows reach the person, sends an unproven row to the person only within the five and
  otherwise to `Not done:`, and holds the negative row of a security-adjacent path to a committed test's assertion,
  which an `agent-run` never proves (amended 2026-10-10, the whole-branch review's fix round, `review/94`; amended
  2026-10-15, plan 020 file 3, unit `f7-prove-before-asking`: it read "names the three kinds, says every other row is
  auto-proven from a check the run's test-runner executes before the table is built, and keeps on the human path a row
  whose check is missing, cannot run or fails").
- GIVEN a change to a security-adjacent path whose negative row no committed test's assertion covers THEN that row is
  not recorded `auto-proven` on a check the test-runner ran once for it; it stays on the human path and is asked (added
  2026-10-10, the whole-branch review's fix round, `review/94`). `judgment: reviewer`
- GIVEN a change of class `docs`, `records` or `tests` that changes no path the site build renders, none the
  classify hands the `design-quality` lens and no legal or policy wording THEN the checkpoint prints "no walk-through
  required — <class> only", with no sign-off block and no ask (amended 2026-10-15, `review/139`: "and no legal or
  policy wording" added).
- GIVEN such a class and a changed stylesheet the classify hands the `design-quality` lens THEN one person row is
  emitted, the changed page renders and reads right and the links to and from it resolve, followed by the sign-off
  block, and "no walk-through required" is not printed. `judgment: reviewer`
- GIVEN such a class and a change to a governance page's wording, which the site build does not render THEN one person
  row is emitted, the changed wording reads as intended, followed by the sign-off block, and "no walk-through
  required" is not printed (added 2026-10-15, `review/139`). `judgment: reviewer`
- GIVEN a `product` change to one CLI source file, with no rendered surface, no third-party account and no step that
  cannot be undone, THEN none of the three kinds creates a person row, and where every row's check ran and passed no
  QA question is asked; a row whose check is missing, cannot run or fails stays on the human path, the person's, and
  is asked, and so does the negative row a security-adjacent path derives where no committed test's assertion covers
  it, a check run once for that row being no proof for it (`content/skills/st-qa/SKILL.md:43-44`, `:45-49`,
  `:105-107`, `:113`; amended 2026-10-10, `review/83`; it read "THEN no person row is created and no QA question is
  asked"; amended 2026-10-10, the whole-branch review's cap round, `review/103`: the clause on the negative row and
  its citation `:45-49` added). `judgment: reviewer` (Amended 2026-10-15, plan 020 file 3: "the three kinds" reads "the
  five categories", and a row whose check is missing, cannot run or fails is the person's only within them; the
  citations above read at `5cd61743`.)

**REQ-FLOW-070**

- GIVEN a plan with a unit spanning 61 lines and one spanning 101 WHEN the coverage script runs THEN it reports
  `unit-size` for the first and `unit-oversize` for the second, each at its unit's heading line, and its status stays
  `pass`.
- GIVEN a unit holding one fence, or five consecutive lines that start with `>`, THEN it reports `unit-prewritten`;
  GIVEN a delta entry of a heading and seven non-blank lines THEN `delta-verbose`, and of a heading and six THEN
  none; GIVEN an entry headed `### ADDED REQ-…` THEN it is measured as the bare form is.
- GIVEN an indented `### X` line inside a unit THEN it starts no unit.
- GIVEN `/st-plan`'s and `/st-rework`'s return lines THEN each carries `L5 none|<n> advisory|not run`, `/st-rework`'s
  before `R1 pass|fail`.

**REQ-FLOW-071**

- GIVEN the Copilot emit WHEN every agent file is read THEN its frontmatter carries
  `include-custom-instructions: true` after `target: github-copilot` and before `tools:`; GIVEN a prompt file THEN it
  carries no such key.
- GIVEN the capability matrix THEN Copilot's `sub-agent-instructions` row names the changelog version, the live
  check's version and date, the `--no-custom-instructions` override as unverified on 1.0.89, and the cloud agent's
  undocumented handling of the key.
- GIVEN a Copilot CLI session in a repository set up by this engine WHEN its orchestrator dispatches an emitted agent
  through `task` THEN the sub-agent quotes the charter's `Invariants version` line. `judgment: maintainer`; run with
  the key emitted on Copilot CLI 1.0.89 at the close of run `2026-10-10_next-tier`, its QA row 2, and quoted
  (`.stamity/runs/2026-10-10_next-tier/record.md:462`; amended 2026-10-14, it read "not yet run with the key emitted
  (`build/13`)").

**REQ-FLOW-074**

- GIVEN `/st-board`'s Leftovers at a close WHEN read THEN it names the four kinds of leftover with the
  `decision-waiting` rows first, the line form, "never pre-set to drop", the three answers, and a withheld or skipped
  row as listed and never decided; and, amended 2026-10-10 (the whole-branch review's fix round; `review/90`,
  `review/91`, `review/96`, `review/97`), an `unparsed:` line as the person's to fix, the never-open floor as Frame's,
  `fill`'s and `/st-plan`'s with the close writing through the `ledger` verb's `inbox-write`, `stop` as every leftover
  row on `Not done:`, and what `show` prints and where it is refused (amended 2026-10-12, run
  `2026-10-12_board-writes`; it read "the never-open floor as Frame's alone with what the close's write reads"); and,
  amended 2026-10-15 (plan 020 file 3, unit `f4-board-close`), the close walk as the way the leftovers are asked, each
  question's options with the recommended one first, the protocol's plain-text fallback for a client with no question
  tool, no `L2 fix; drop L1: <reason>; show L3` form, and an earlier round's answers standing on a later `stop`
  (`test/corpus/commands/board.test.ts`).
- GIVEN a close holding a Warning finding whose author's note urges dropping it, and two notes, THEN the Warning is
  listed with fix now or schedule as its recommendation, never pre-set to drop and never folded into the notes line.
  `judgment: reviewer`
- GIVEN the person's answer drops an inbox row the change touched THEN the row's ledger row, where its `Ref:` names
  one, is retired `cut <reason>`, its bullet is removed and the record carries an `- inbox retired:` line naming the
  disposition; GIVEN a new date for it THEN its bullet is replaced by one row under the schedule rule carrying the
  same `Ref:`. `judgment: reviewer`
- GIVEN a Critical or Warning the person drops THEN its row is retired `cut accepted risk: <reason>` and stays on
  `Not done:`.
- GIVEN a close with every finding fixed, no inbox row touched or due, no `decision-waiting` row and no notes THEN the
  close asks only what it asked before, or nothing. `judgment: reviewer`

**REQ-FLOW-075**

- GIVEN an unattended close holding one Critical and one Minor deferred row of its own ledger, neither a fix its plan
  covers, one inbox row its change touched and did not fix, and three notes THEN the notes are dropped and counted,
  the two ledger rows are appended tagged `decision-waiting` with `when: next attended close`, the touched inbox row
  stays as it is with no copy, and all three are listed on `Not done:`; the Critical is neither dropped nor retired.
  `judgment: reviewer`
- GIVEN a row tagged `decision-waiting` THEN `ledger inbox` shows it for every query, matched as `always` where no
  other filter matches it.
- GIVEN the answer `stop` at a close that asks the leftovers question THEN nothing is fixed, merged or committed, each
  leftover of the run's own ledger closes `deferred` and is appended tagged `decision-waiting`, and each inbox row stays
  as it is, and the notes are dropped as with no answer (amended 2026-10-10, the whole-branch review's fix round,
  `review/91`). `judgment: reviewer`
- GIVEN a record head reading `Mode: unattended` THEN the close asks nothing, QA reads `Shippable: not signed`, the
  spec delta stays unmerged as a morning-list decision and the commit part runs `stamity run end`; GIVEN only a cloud
  marker THEN the attended rule holds (added 2026-10-16; `test/corpus/skills/unattended.test.ts`,
  `test/corpus/commands/work.test.ts`; eval: floor case `unattended-close-keeps-real-defects`, re-baselined).

**REQ-FLOW-076**

- GIVEN `parseDisposition` THEN `fixed in 2026-10-10_x`, `fixed by /st-quick`, `cut: out of scope`,
  `cut accepted risk: no exploit path`, `scheduled plan docs/plans/015-board-writes.md#b1-board-contract · by
  2026-11-01` and `scheduled board #42 · when touched` are accepted; `scheduled later`, `scheduled board #42 · when
  later on`, `scheduled board #42 · by 2026-02-30`, `scheduled board now · by 2026-11-01`, `scheduled board #42 · when
  2026-11-15`, `fixed later`, `cut: tbd`, `cut accepted risk: tbd`, `fixed —` and `moved somewhere` are refused, each
  naming its problem (the day under `when` added 2026-10-10, the whole-branch review's fix round, `review/89`).
- GIVEN a deferred ledger row and a clock at 2026-10-10 WHEN `ledger close --retired "scheduled later"` names it THEN
  the command exits 1 with `why` and `next` and the ledger is byte-identical; GIVEN the clock at 2026-10-09 THEN the
  value is recorded as before; GIVEN a re-run, after 2026-10-10, of a value recorded before it THEN it prints
  `unchanged`.
- GIVEN an inbox row below `## Rows under the schedule rule` with neither `by:` nor `when:`, with `when: later`, with
  `when: at some point`, with both `by:` and `when:`, with `when: touched` at `—` and no `files:`, or with a `when:`
  that holds a day, alone (`when: 2026-11-15`) or among other words, THEN `parseInbox` names a problem at its line;
  GIVEN `when: the next edit of src/a.ts`, or a `when:` naming a run id that opens on its date, THEN none; GIVEN a row
  above the heading with no schedule field THEN none (the day under `when:` added 2026-10-10, the whole-branch review's
  fix round, `review/89`).
- GIVEN `ledger inbox --due 2026-12-01` THEN a row whose `by:` day is on or before that day matches, as `due` where
  nothing else matched it, the count line ends `· <n> due by 2026-12-01 · <n> triggers`, and an unmatched row carrying
  `when:` counts under triggers; GIVEN `--due` with no value THEN the clock's UTC day is used; GIVEN `--due
  2026-02-30` THEN a `USAGE` refusal.
- GIVEN this repository's tracked inbox and ledgers WHEN the records gate runs THEN every bullet parses, and every
  `retired` value the schedule rule binds parses under the grammar.

**REQ-FLOW-077**

- GIVEN each writer's row template with its placeholders filled — `/st-plan`'s follow-up on a day and on a trigger,
  `/st-pr-resolve`'s deferral, `/st-rework`'s DEFER row, its critical-deferred row and its meta row, and the dep-audit
  row on a day and on a touch — THEN `parseInbox` reads each below the heading with no problem.
- GIVEN `/st-board`'s census THEN it names five writers, and `/st-quick` among the retirers and not the writers;
  GIVEN `/st-quick`'s body THEN its last paragraph says the lane appends no inbox row, and its walk offers carry to
  `/st-work` now or leave on `Not done:` and names no inbox, append, fix-now, drop or schedule branch (amended
  2026-10-15, plan 020 file 3; it read "and offers no leftovers ask"; `test/corpus/commands/lightTrio.test.ts`).
- GIVEN a deferred advisory at `critical` or `high` THEN the dep-audit row carries a `by:` day the operator named and
  never `when: touched`.
- GIVEN a `/st-plan` follow-up with no date and no trigger a run can check THEN it goes to the plan's Drop list and
  appends nothing.
- GIVEN a Critical the user defers, with no path to name and no day named, THEN `/st-rework` asks for the day in the
  rationale question and writes no `critical-deferred` row with neither a path nor a day; the run closes naming the
  unwritten row as its open item (added 2026-10-10, the whole-branch review's fix round, `review/93`).
  `judgment: reviewer`
- GIVEN `/st-plan`'s Plan artifact shape THEN 6 is the optional Prerequisites section, its row naming kind, name, read
  where, set by, what it blocks and verified, and never a value, then 7 Follow-ups and 8 Drop list (added 2026-10-16;
  `test/corpus/commands/plan.test.ts`).

**REQ-FLOW-078**

- GIVEN an inbox with no schedule heading, or none at all, and one row whose `Ref:` names a `deferred`, unretired
  ledger row WHEN the verb runs THEN it exits 0, the heading and a dated block end the file, and stdout carries
  `heading <line> added` and `appended <line> <ref>` and no row text. *(test: `test/runs/ledgerInboxWrite.test.ts`)*
- GIVEN a row with no `by:`/`when:`, no `Ref:`, or a screen hit in the bullet, split over two bullets, or in a parsed
  field only THEN it exits 1, the inbox is byte-identical, and the output names the stdin line (and the pattern id) and
  no row text, a hit's parse message withheld.
- GIVEN one call removing `Ref` X and re-appending X with a new `by:` THEN one bullet carries X, with the new day;
  GIVEN on append a ledger `Ref:` naming no row, a row not `deferred`, or a retired row THEN the call is refused.
- GIVEN the same call twice THEN the second reports `already-filed` and the file is byte-identical.
- GIVEN a screen pattern split across two calls, the first call's row already in the run's block of today, THEN the
  second call is refused and the inbox is byte-identical (added as built, sign-off S15).
- GIVEN `content/commands/st-work.md`'s Proof block section WHEN read THEN it names `stamity ledger inbox-write` for
  appends, removals and re-dates and the line `decided, not applied (no unique Ref:): line <n>`, and says that the
  close, where no CLI form runs or the copy lacks `inbox-write`, appends with the file tools and records it, and
  otherwise never opens the inbox with them (as built, S18; the delta's criterion read "and that the close never opens
  the inbox with the file tools"). *(corpus: `test/corpus/commands/work.test.ts`)*

**REQ-FLOW-079**

- GIVEN `### fill — intake to items` step 1 WHEN read THEN it names `stamity ledger inbox`, the listed-as-it-prints
  rule and the absent-CLI fallback, the body carries the Running-the-CLI paragraph before it, and nowhere contains
  "still read the file whole". *(corpus: `test/corpus/commands/board.test.ts`, `test/corpus/cliCallForm.test.ts`)*
- GIVEN `/st-plan`'s Shared intake item 4 WHEN read THEN it names `stamity ledger inbox` with `--plan` and `--paths` and
  the same fallback. *(corpus: `test/corpus/commands/plan.test.ts`)*

**REQ-FLOW-080** (added 2026-10-15)

- GIVEN the question protocol THEN `## Close walk` is the section after `## Gates` and the last, holds no walk without
  leftovers, the order, the per-call limit and rounds, the summary last with nothing after it, `Default applied:`,
  `decision-waiting` and a skipped headless question as no answer, names no client id or native tool, and carries the
  platform marker once with the plain-text fallback after it; GIVEN each client's rendering THEN no marker is left and
  that client's note is there. *(test: `test/corpus/rules/protocol.test.ts`)*
- GIVEN the charter THEN 95 lines, none over 117 characters, invariant 2 holding "one ask per turn", the rounds and its
  1.2.0 sub-agent sentence, invariant 6's words unchanged on two lines, and the 1.3.0 hash row matching.
  *(test: `test/content/charter.test.ts`, `test/content/invariantsVersion.test.ts`)*
- GIVEN each of the nine touchpoints THEN it points at the Close walk, names its own leftovers, and ends on its report,
  return block or proof block with nothing after it; GIVEN `/st-quick` THEN no inbox append; GIVEN `/st-spec` THEN a
  marker's default is "leave it marked". *(corpus: `work.test.ts`, `board.test.ts`, `lightTrio.test.ts`, `spec.test.ts`,
  `plan.test.ts`, `feedbackPair.test.ts` under `test/corpus/commands/`)*
- GIVEN three leftovers on a client with no question tool and an operator asking for the summary THEN the summary prints
  only after the last answer, no leftover is decided by the run itself, and no real defect is defaulted to dropped.
  `judgment: reviewer` *(eval: floor case `close-summary-after-last-decision`)*
- GIVEN the map THEN Cursor's and Copilot's rows carry a one-sentence `cloud` note, the table a "Cloud run" column, and
  their own copies of the protocol the note after `**Cloud run:**` (added 2026-10-18; *test:
  `test/tools/translator.test.ts`*); GIVEN a managed Cursor run reaching an ask with a declared default THEN no question
  tool is called and `Default applied:` is written (added 2026-10-18; *eval: golden case
  `cursor-cloud-question-takes-default`, binding rows*).

**REQ-FLOW-081** (added 2026-10-15)

- GIVEN the test-runner THEN its `## Row proving` section lists the five routes in order, the stop at the first that
  runs, the three line forms, the guards and the redaction, and its capabilities stay `read, execute`.
  *(test: `test/corpus/agents/quality.test.ts`)*
- GIVEN the qa skill THEN at most 150 body lines, the five categories, the cap of three with the security-negative row
  first, `agent-run`, `contradicted`, "over the cap, not asked" and the exception that an `agent-run` never proves the
  security-negative row. *(test: `test/corpus/skills/flow.test.ts`)*
- GIVEN `/st-work` THEN step 1's summary names only the rows the prover leaves for the person, and step 3's browser line
  and the bundle row are unchanged. *(test: `test/corpus/commands/work.test.ts`)*
- GIVEN a row that needs a second real account THEN it stays the person's and the pass proceeds; GIVEN a contradicted
  `H` row and a walked reply THEN `Shippable` reads `NO` naming it. `judgment: reviewer` *(eval:
  `benign-qa-second-account-stays-person-row`, `qa-prove-before-asking`, `qa-contradicted-row-fails-security-row-first`)*

**REQ-FLOW-082** (added 2026-10-15)

- GIVEN the reviewer's Maintainability row THEN it holds the pass-through clause and the size-with-wide-interface clause.
  *(test: `test/corpus/agents/spine.test.ts`)*
- GIVEN the maintainability reference THEN `maint-module-depth` sits under Judgment with no `Threshold:`, states the
  deletion test, the evidence form, the carve-out and the not-applicable subjects, `maint-size-outliers` names the
  deferral, ids stay unique, and the reference stays within 40–100 lines; GIVEN one export and 900 lines THEN no size
  hit. *(test: `test/corpus/skills/verifyRestTools.test.ts`)*
- GIVEN a cache wrapper forwarding five methods THEN the reviewer files a pass-through finding, and GIVEN a 902-line
  one-export file THEN no size finding. `judgment: reviewer` *(eval: `reviewer-shallow-wrapper-pass-through`)*

**REQ-FLOW-083** (added 2026-10-15)

- GIVEN `/st-plan`'s unit table THEN its `interfaces` row names the module interface the unit lands behind.
  *(test: `test/corpus/commands/plan.test.ts`)*

**REQ-FLOW-084** (added 2026-10-15)

- GIVEN an emitted Cursor and Copilot hook command run from `repo/sub/deeper` THEN the same output and exit code as from
  the root, through `sh` on POSIX and `cmd` on Windows; GIVEN a missing runner THEN exit 1 naming the sync call; GIVEN
  no anchor above THEN exit 1. *(test: `test/hooks/portableRunner.test.ts`, `test/cloud/containerLeg.test.ts`)*
- GIVEN `CURSOR_PROJECT_DIR` set to the root and a decoy `sub/.cursor/hooks.json` with its own runner WHEN a session in
  `sub/` runs the command THEN the root's runner runs; GIVEN the variable naming a folder without the anchor THEN the
  walk from the working directory decides. *(test: `test/hooks/portableRunner.test.ts`)*
- GIVEN a 1.14 `.cursor/hooks.json` with an owner entry between the engine's, under a recorded ledger, WHEN `sync -y`
  runs THEN the engine's entries become starters in place, the owner entry stays, no `.bak` is taken, and `check` exits
  0; GIVEN Codex THEN `.codex/hooks.json` is byte-identical. *(test: `test/merge/hookFilesOwnership.test.ts`,
  `test/manifest/hookDocuments.test.ts`)*

**REQ-FLOW-085** (added 2026-10-15)

- GIVEN each marker THEN its `Session:` line and its lines, byte-exact; GIVEN `CLAUDE_CODE_REMOTE=false` or `=1`,
  `CI=false`, `CI=0` or an empty value THEN the banner alone; GIVEN `GITHUB_ACTIONS` and `CI` without the Copilot marker
  THEN the CI line only; GIVEN several markers THEN the first by priority and `Also detected:`; GIVEN
  `COPILOT_AGENT_PROMPT` holding an instruction, or a marker holding a newline and a forged `Session:` line, THEN no
  value prints; GIVEN every client's generated script THEN no network word and the budget held.
  *(test: `test/hooks/scripts.test.ts`, `test/hooks/sessionStartCard.test.ts`, `test/hooks/scriptBudget.test.ts`)*
- GIVEN `node scripts/generate-capability-matrix.mjs` THEN the page is byte-identical to the committed one, each client's
  glance cell carries a dated cloud cell, and every `CLIENT_CLOUD_FACTS` row renders once with its URL and an ISO
  date, a page that says nothing as "not documented, read <date>"; GIVEN the session start's lines THEN they equal the
  table's `sessionStart` rows, in order. *(test: `test/emit/capabilityMatrix.test.ts`)*
- GIVEN `CLAUDE_CODE_REMOTE=true` THEN no line reads "The review-gate counter resets with the VM." and the second line
  reads "A missing review-gate counter is rebuilt from the run record on this branch."; GIVEN `CURSOR_AGENT_SOCKET` THEN
  `Session: a Cursor agent machine (managed or self-hosted).`; GIVEN every existing fixture THEN the printed output is
  byte-equal to the detector's, and the inlined matcher equals its source text (added 2026-10-18; *test:
  `test/hooks/scripts.test.ts`, `test/session/detect.test.ts`, `test/cloud/profiles.test.ts`*).

**REQ-FLOW-086** (added 2026-10-15)

- GIVEN the planned hooks file THEN no key starts with a capital letter and every entry has `type: "command"`,
  `bash` equal to `command` and `cwd: "."`; GIVEN an upgrade over a 1.14 PascalCase file THEN one recoverable copy is
  kept. *(test: `test/adapters/copilot.test.ts`)*
- GIVEN a camelCase payload with `toolName: "bash"` THEN the authored hook receives `tool_name: "Bash"`; GIVEN
  `apply_patch` THEN it arrives under its own name with no `file_path`; GIVEN `constructor` or an MCP name THEN it passes
  unchanged; GIVEN each mapped name THEN the core guard places it as before; GIVEN `web_fetch`, `web_search` or
  `update_todo` with Copilot's own input THEN the hook reads `WebFetch`, `WebSearch` or `TodoWrite` and the shipped
  Copilot hooks neither block nor fail; GIVEN `transcriptPath`, `stopReason`, `initialPrompt` or `toolResult` THEN the
  hook reads it under its snake_case key too, a key already sent wins, and `timestamp` is unchanged.
  *(test: `test/hooks/portableRunner.test.ts`)*
- GIVEN `^(Bash|Edit)$` THEN `^(bash|edit|str_replace_editor)$`; GIVEN `WebFetch|WebSearch|TodoWrite` THEN
  `web_fetch|web_search|update_todo` and no warning; GIVEN `Bash|mcp__.*` THEN `bash|mcp__.*`; GIVEN
  `NotebookEdit|Bash` THEN one warning naming the whole matcher; GIVEN a matcher naming `Edit` without `apply_patch`
  THEN one `apply_patch` warning. *(test: `test/adapters/copilot.test.ts`)*

**REQ-FLOW-087** (added 2026-10-15)

- GIVEN `/st-board` THEN the GitHub row names the observed condition, the REST forms, `per_page=100` with `--paginate` on
  every listing, the Projects sentence word for word and the three 403 readings, and setup refuses a Projects link
  there. *(test: `test/corpus/commands/board.test.ts`)*
- GIVEN `/st-pr-resolve`'s Pre-flight THEN the REST-only block reads the pull request once, refuses a fork head before
  any fetch, fetches by number, refuses a `FETCH_HEAD` other than the read's head sha before any checkout, checks out
  that sha, names no client and no client variable, validates the pushed ref by allowlist then `check-ref-format`, and
  verifies the head after the push; GIVEN section 1 THEN the thread-state fallback. *(test:
  `test/corpus/commands/feedbackPair.test.ts`, `test/corpus/invariants.test.ts`)*

**REQ-FLOW-088** (added 2026-10-15)

- GIVEN the charter THEN invariant 5 names `node .stamity/generated/hooks/<client>/stamity-session-start.mjs` run with
  an empty stdin and opening only the files it lists as loaded, and holds no `/dev/null` and no `hooks/*/`.
  *(test: `test/content/charter.test.ts`)*
- GIVEN `stamity learn read` over a folder holding a refused file THEN it lists the file by its pattern ids with no
  span; GIVEN an unlistable folder or a skipped `--body` id THEN exit 1 (amended 2026-10-16).
  *(test: `test/cli/commands/learn.test.ts`)*

**REQ-FLOW-089** (added 2026-10-16)

- GIVEN `STAMITY_UNATTENDED` empty, `false` or `0`, or only a cloud or CI marker THEN the head reads `Mode: attended`;
  GIVEN any other value, or `--unattended`, THEN `Mode: unattended`, `--attended` beating the variable. No test runs
  this mapping, which is text the model follows; the corpus pins its sentences word for word, the values empty,
  `false` and `0`, `--attended` and the cloud marker among them. *(corpus: `test/corpus/skills/unattended.test.ts`
  ("declares the mode by flag or variable only, never by a cloud marker"), `test/corpus/commands/work.test.ts` ("opens
  the run record head at Frame with the plan and the invocation (REQ-CTX-012)"); re-tagged 2026-10-16 in the merge's
  first fix round from `test/runs/recordHead.test.ts`, which only parses heads)*
- GIVEN a head with no `Mode:` line or another value THEN `readRecordHead` returns `mode: null`, which the shell guard,
  the ask gate and the run verbs read as attended with `STAMITY_UNATTENDED` unset and as unattended with it set; GIVEN
  `Mode: attended` THEN attended either way. *(test: `test/runs/recordHead.test.ts` (the parse),
  `test/hooks/personOnlyGuard.test.ts`, `test/hooks/unattendedAskGate.test.ts`,
  `test/cli/commands/runCheckpoint.test.ts`, `test/cli/commands/runEnd.test.ts`)*
- GIVEN `/st-board pickup`, `/st-rework` and an attended `/st-debug` THEN each hands on `run-mode:`, and a hand-off read
  from disk reads `run-mode: attended`. *(corpus: `board.test.ts`, `feedbackPair.test.ts`, `lightTrio.test.ts` under
  `test/corpus/commands/`; `test/corpus/skills/unattended.test.ts`)*

**REQ-FLOW-090** (added 2026-10-16)

- GIVEN an in-progress record reading `Mode: unattended` THEN the ask gate exits 2 naming it; GIVEN one reading
  `Mode: attended` beside it THEN still 2; GIVEN no run in progress and a closed unattended record whose `Branch:` is the
  current branch, with the run-ended marker naming its run and its `at` within 15 minutes, 14 minutes old included,
  THEN 0; GIVEN the same record and branch with no marker, one naming another run, or one past 15 minutes (16 minutes
  old), with no `at` or dated after now, THEN 2; GIVEN another branch THEN the variable decides. *(test: `test/hooks/unattendedAskGate.test.ts`)*
- GIVEN `run end --final-round` at any exit THEN the marker names its run and the time it was written; GIVEN a plain
  `run end` THEN no marker is left; GIVEN `run start` THEN it is gone; none of them under `--dry-run`.
  *(test: `test/cli/commands/runEnd.test.ts`, `test/cli/commands/run.test.ts`)*
- GIVEN Claude Code's settings THEN the ask gate sits on `AskUserQuestion` after every planned PreToolUse row, with no
  fail-closed tail. *(test: `test/adapters/claude.test.ts`)*

**REQ-FLOW-091** (added 2026-10-16)

- GIVEN each blocker's fixture THEN exit 1 naming that code on its plan; GIVEN an unreadable input THEN `no-plan` in the
  top-level `blockers` beside `plans: []`; GIVEN `--chain` without `--since` THEN exit 2; GIVEN a ready plan THEN exit 0
  and L1 `not-checked`. *(test: `test/cli/commands/plan.test.ts`, `test/runs/planCoverageParity.test.ts`)*
- GIVEN a 60-unit chain leading into a two-unit cycle THEN both twins finish inside a 10-second kill with exactly one
  `dependency-cycle` finding; GIVEN `REQ-DEMO-001, 002` in a unit's requirements THEN `REQ-DEMO-002` is covered, and in
  delta prose it is not read; GIVEN `--since` on one plan THEN it is accepted, and over two plans without `--chain` THEN
  exit 2 (added 2026-10-18; *test: `test/runs/planCoverageParity.test.ts`, `test/authoring/specPlanCoverage.test.ts`,
  `test/cli/commands/plan.test.ts`*).

**REQ-FLOW-092** (added 2026-10-16)

- GIVEN an open pull request on the branch ending with the run's marker THEN its body is replaced; GIVEN one without it
  THEN one comment; GIVEN none THEN a draft by REST, then `[DRAFT]` on a 422, else `Not done: draft PR not opened`.
  *(test: `test/runs/pullRequest.test.ts`; through `run end`, `test/cli/commands/runEnd.test.ts`)*
- GIVEN `run start` on the default branch THEN the run moves to `stamity/<run-id>`; GIVEN any call THEN no `gh pr create`,
  no force, no tag and no default-branch push. *(test: `test/cli/commands/run.test.ts`,
  `test/cli/commands/runCheckpoint.test.ts`, whose push step `run end` runs as its own (`src/cli/commands/run.ts:250`);
  `test/cli/commands/runEnd.test.ts` for what `run end` adds, the pull request after the push and none after a held one)*
- GIVEN `run start` on the default branch and a run branch whose tip tracks its origin pin THEN the switch goes through,
  the pin is kept and the checkout is clean; GIVEN that pin naming another repository THEN exit 1, `Not done: origin
  changed`. *(test: `test/cli/commands/run.test.ts`)*

**REQ-FLOW-093** (added 2026-10-16)

- GIVEN nothing staged and the branch not ahead THEN no commit and no push; GIVEN an ignored record THEN `records: not
  committed (<source>)`; GIVEN `--pr` THEN the draft opens. *(test: `test/cli/commands/runCheckpoint.test.ts`)*
- GIVEN the remote's branch deleted while the remote-tracking ref still names `HEAD` THEN the push runs; GIVEN a path
  staged outside `--paths` THEN exit 1 naming it, nothing committed or pushed; GIVEN a pushed code file the scan cannot
  read THEN exit 0 with `secret scan: 1 files unscanned (<path>)`; GIVEN a held file staged and edited again THEN the
  patch applied on `Base:` gives the work tree's bytes. *(test: `test/cli/commands/runCheckpoint.test.ts`)*
- GIVEN a held path absent at `Base:`, staged as new and then deleted THEN the patch holds no section for it and the
  held line names it `staged, then deleted: no section`; GIVEN a held path `Base:` holds, removed from the index while
  the work tree has a file there THEN the patch holds a deletion then a new-file section, and applied on `Base:` gives
  the work tree's bytes; GIVEN a continuation whose branch carries a held patch and a work tree with no held change THEN
  the patch is kept and listed in `held`; GIVEN a `--paths` entry whose deletion `git rm` staged THEN it is committed and
  pushed (added 2026-10-18; *test: `test/cli/commands/runCheckpoint.test.ts`*).

**REQ-FLOW-094** (added 2026-10-16)

- GIVEN a morning list THEN the body keeps its section order, `none` for an empty section, at most three QA rows and the
  closing marker; GIVEN a diff naming a variable THEN an `inferred` row names it and carries no value.
  *(test: `test/runs/morning.test.ts`, `test/runs/prerequisites.test.ts`)*

**REQ-FLOW-095** (added 2026-10-16)

- GIVEN `/st-work` and the skill THEN the walk opens only on a closed record under `Mode: attended`, and `--unattended`,
  `run-mode: unattended` or a chain's next file takes the unattended entry instead.
  *(corpus: `test/corpus/commands/work.test.ts`, `test/corpus/skills/unattended.test.ts`)*
- GIVEN an answer comment `Q1→2, Q3→1` THEN each answer maps to its question and option.
  *(test: `test/runs/morning.test.ts`)*
- GIVEN the skill's walk section THEN each held act runs after the client's approve prompt, a deletion, a force push and
  every act a client's guard refuses to ask for go to the person as the exact command, the final round keeps the guard
  refusing, and the commits after the last checkpoint are counted on `## Not done:` (added 2026-10-18; *corpus:
  `test/corpus/skills/unattended.test.ts`*).

**REQ-FLOW-096** (added 2026-10-16)

- GIVEN a chain whose second head does not name the first THEN `chain-order`; GIVEN a `reads` path moved only after the
  run base THEN no `stale`; GIVEN one moved between the stamp and the base THEN `stale`. *(test:
  `test/cli/commands/plan.test.ts`, `test/runs/freshness.test.ts`)*
- GIVEN a plain `run end` on a closed unattended record, a marker naming its run there or none, THEN no marker is left
  and the ask gate refuses a question on that branch; GIVEN the same `run end` with `--final-round` THEN the marker
  names the run and the gate allows it, until the marker is past 15 minutes. *(test:
  `test/cli/commands/runEnd.test.ts`)*

**REQ-FLOW-097** (added 2026-10-16)

- GIVEN `/st-quick` THEN it refuses an unattended run naming `/st-work --effort light`; GIVEN `/st-debug` and
  `/st-pr-resolve` THEN the three head lines, the skill, the pre-flight before the first fetch or push, the run verbs and
  replies from a scanned file. *(corpus: `lightTrio.test.ts`, `feedbackPair.test.ts`, `board.test.ts` under
  `test/corpus/commands/`)*

**REQ-FLOW-098** (added 2026-10-16)

- GIVEN `run-contract: 2` THEN refused naming version 1; GIVEN an unknown field THEN refused, named by count and line,
  never its text; GIVEN a prerequisite neither done nor owned THEN `prerequisite-open`. *(test:
  `test/runs/runContract.test.ts`)*

**REQ-FLOW-099** (added 2026-10-16)

- GIVEN the skill THEN both floors load by name and the record names them; GIVEN the learnings THEN banner, then
  `learn read`, then the script, never the file tools. *(corpus: `test/corpus/skills/unattended.test.ts`; test:
  `test/cli/commands/learn.test.ts`)*

**REQ-FLOW-100** (added 2026-10-16)

- GIVEN `/st-pr-resolve` unattended THEN a finding no `admin` or `write` author asked for routes to DEFER as
  `non-write author`, `unknown` counting as none; GIVEN `/st-board` unattended THEN the author rule holds on a private
  repository; GIVEN the protocol THEN item 8's kickoff sentence. *(corpus: `feedbackPair.test.ts`, `board.test.ts`;
  `test/corpus/rules/protocol.test.ts`)*

**REQ-FLOW-101** (added 2026-10-16)

- GIVEN a canary older than 120 s, `node` outside `engines`, an unreachable CLI, a non-write author, a direct-push
  bypass, a 403, a 404, a non-GitHub origin or `GH_REPO` naming another repository THEN exit 1 naming each; GIVEN a
  pull-request-only bypass THEN that check passes. *(test: `test/runs/preflight.test.ts`,
  `test/cli/commands/gatePreflight.test.ts`)*
- GIVEN a shim's URL-scoped helper pair and a global helper WHEN the advice's two commands run literally THEN one gh
  entry is left and `direct-push` passes; GIVEN `CLAUDE_CODE_REMOTE=1`, `GITHUB_ACTIONS` alone or a
  `CURSOR_AGENT_SOCKET` of `0` THEN the JSON reads `cloud: false`, `cloud: true` and no `cursor-egress` warning (added
  2026-10-18; *test: `test/cli/commands/gatePreflight.test.ts`*).

**REQ-FLOW-102** (added 2026-10-16)

- GIVEN each person-only form on the main thread THEN every client's guard refuses it, and Claude Code's settings carry
  `CLAUDE_DENY_ROWS` (amended 2026-10-18, plan 021 file 2: attended, an ask-class form is asked for on Claude Code and
  refused on the other three, and a REQ-FLOW-124 form is refused on all four; Claude Code's settings carry
  `CLAUDE_ASK_ROWS` beside the deny rows); GIVEN an unattended checkpoint over a held path THEN the change lands in the inert patch, is
  restored in the index only and is listed. *(test: `test/hooks/personOnly.test.ts`, `test/hooks/personOnlyGuard.test.ts`,
  `test/change/personOnlyPaths.test.ts`, `test/cli/commands/runCheckpoint.test.ts`)*
- GIVEN the QA walk's scratch session after `sync` THEN `git tag v0` and `git push origin HEAD:main` are refused by the
  shell guard. `judgment: reviewer` *(QA, or its prover through `scripts/qa/hook-runs.mjs`)*

**REQ-FLOW-103** (added 2026-10-16)

- GIVEN a text holding a secret-shaped line THEN `gate scan --text` exits 1 naming label, line and rule and no part of
  the value; GIVEN a text past the content cap THEN exit 1, never clean; GIVEN a clean text THEN 0. *(test:
  `test/cli/commands/gatePreflight.test.ts`, `test/runs/morning.test.ts`)*

**REQ-FLOW-104** (added 2026-10-16)

- GIVEN `SECURITY.md` THEN its `### Cloud and unattended runs` section names every risk above and "Runs nobody watches"
  is gone. *(test: `test/docsPages.test.ts`, "names the cloud's accepted risks under what it does not defend")*
- GIVEN `SECURITY.md` and `docs/security-mapping.md` THEN each names every client's answer to an ask, the run verb's
  line, the verbs' git environment with `SSH_ASKPASS`, the ask and deny lists and the residuals of the 2026-10-18
  amendment (added 2026-10-18; *test: `test/docsPages.test.ts`, "states file 2's ask rule, each client's answer, the run
  verb's line and the residuals REQ-FLOW-104 names" and its mapping twin*).

**REQ-FLOW-105** (added 2026-10-18)

- GIVEN a startup with an in-progress run whose `Branch:` names HEAD THEN the card prints; on another branch, a closed
  run or a record with no `Branch:` THEN none. *(test: `test/hooks/sessionStartCard.test.ts`)*
- GIVEN a fresh clone of a remote holding `stamity/<id>` one commit ahead of `main` WHEN `run start --run <id>` runs THEN
  HEAD and `base` equal the remote tip and the next checkpoint pushes as a fast-forward; GIVEN a tip that does not
  descend from its record's `Base:`, or carries no record, THEN exit 1 and no local branch. *(test:
  `test/cli/commands/run.test.ts`)*
- GIVEN the cloud reference THEN Frame continues only the record on the branch it was given and passes `--since
  <Base>`. *(corpus: `test/corpus/skills/unattended.test.ts`)*

**REQ-FLOW-106** (added 2026-10-18)

- GIVEN no counter and two `usage: review rN` lines on this branch's run THEN the completion holds at round 2; GIVEN no
  record or no line THEN the gate opens naming the missing counter; GIVEN a rebuilt count at the cap THEN it holds with
  `ROUNDS_REBUILT_AT_CAP`, never `CAP_REACHED`; GIVEN an unparseable counter THEN it is rebuilt, not opened; GIVEN a peer
  session with no entry in a counter marked rebuilt THEN its completion holds. *(test: `test/hooks/scripts.test.ts`)*

**REQ-FLOW-107** (added 2026-10-18)

- GIVEN the cloud reference THEN it names no `/loop`, wakeup or agent team, the background gate under a timeout and at
  most two implementers, and the Shell paragraph is byte-identical. *(corpus: `test/corpus/skills/unattended.test.ts`,
  `test/corpus/agents/shellDiscipline.test.ts`)*

**REQ-FLOW-108** (added 2026-10-18)

- GIVEN the cloud reference THEN it names the client's isolation or one at a time, never the sibling folder, the fold
  applied to the work tree alone with `--no-renames` in the path list, and no lane commit on the run branch.
  *(corpus: `test/corpus/skills/unattended.test.ts`)*

**REQ-FLOW-109** (added 2026-10-18)

- GIVEN the socket variable set and an unattended run on this branch with units left THEN the follow-up; GIVEN no
  variable, another branch, an attended record, no `Mode:`, `remaining=0`, a status other than `completed`, or a
  capacity stop with at most its own checkpoint after it THEN nothing; GIVEN the emitted row THEN `loop_limit` 50 and no
  runner. *(test: `test/hooks/cursorContinue.test.ts`, `test/adapters/cursor.test.ts`)*

**REQ-FLOW-110** (added 2026-10-18)

- GIVEN a local startup THEN nothing is done; GIVEN the cloud marker and a writable env file THEN the line is written
  before any install step, and stays after an install that runs out of time; GIVEN no env file THEN it says so and
  exits 0. *(test: `test/hooks/cloudReadiness.test.ts`)*

**REQ-FLOW-111** (added 2026-10-18)

- GIVEN Copilot selected THEN the setup steps hold the pinned install and `stamity --version`, a fork's channel and
  registry reaching it; GIVEN Cursor selected THEN `check` lists `cloud-install`, never failing, and without Cursor no
  row. *(test: `test/adapters/copilot.test.ts`, `test/cli/commands/check.test.ts`)*

**REQ-FLOW-112** (added 2026-10-18)

- GIVEN `CLAUDE_CODE_REMOTE=true` and no `STAMITY_HOOKS_ACTIVE=1` THEN `hooks-loaded` refuses, naming
  `$CLAUDE_ENV_FILE` and one repository per session, a fresh canary notwithstanding. *(test:
  `test/runs/preflight.test.ts`)*

**REQ-FLOW-113** (added 2026-10-18)

- GIVEN the matrix THEN the Action's three rows render with their statuses and no session line; GIVEN Claude's runner
  arguments THEN no `--bare`. *(test: `test/emit/capabilityMatrix.test.ts`, `test/qa/hookRuns.test.ts`)*
- GIVEN `docs/cloud.md`, `SECURITY.md` and the spec (amended 2026-10-19) THEN each names the engine's own copies
  under `.claude/hooks/stamity/` inside the Action's restore, the generated copies no hook entry runs, `AGENTS.md`,
  the records the scripts read and the user and pack hook scripts outside `.claude/` as the pull request's, and the
  Action's own named limit; no page says every script the hooks run is the base branch's. *(test:
  `test/docsPages.test.ts`)*

**REQ-FLOW-114** (added 2026-10-18)

- GIVEN Cursor selected THEN the root `AGENTS.md` ends on the 14-line block; without Cursor THEN no byte moves, Codex's
  override included; GIVEN the golden THEN the two root figures per selection. *(test: `test/emit/agentsMd.test.ts`,
  `test/corpus/invariants.test.ts`)*

**REQ-FLOW-115** (added 2026-10-18)

- GIVEN a first call THEN the index once; a second call with the same id THEN nothing; no socket variable THEN nothing;
  a `conversation_id` of `../x` THEN hashed, never a path; `managed` THEN the cloud line after one request. *(test:
  `test/hooks/contextOnce.test.ts`)*

**REQ-FLOW-116** (added 2026-10-18)

- GIVEN the cloud reference and the skill's walk THEN both count the commits after the last checkpoint less the run
  verbs' own subject, on one `Not done:` row. *(corpus: `test/corpus/skills/unattended.test.ts`)*

**REQ-FLOW-117** (added 2026-10-18)

- GIVEN the setup steps THEN `timeout-minutes` under 59 on every lane; GIVEN the cloud reference THEN the chain's
  checkpoint, sizing and continuation; GIVEN `docs/cloud.md`'s opening THEN no unattended night on Copilot. *(test:
  `test/adapters/copilot.test.ts`, `test/docsPages.test.ts`; corpus: `test/corpus/skills/unattended.test.ts`)*

**REQ-FLOW-118** (added 2026-10-18)

- GIVEN Copilot selected with the work prompt THEN the entry is emitted, under 2,000 characters, naming the prompt and
  the plan; without Copilot, or with only `cmd-ask`, THEN none; GIVEN the roster THEN its count is unchanged. *(test:
  `test/adapters/copilot.test.ts`)*

**REQ-FLOW-119** (added 2026-10-18)

- GIVEN the cloud reference THEN `CI not run: awaiting approval`, the morning-list row and the second approver as a
  prerequisite. *(corpus: `test/corpus/skills/unattended.test.ts`)*

**REQ-FLOW-120** (added 2026-10-16)

- GIVEN an in-progress record reading `Mode: unattended` THEN a raw `git push`, `gh pr create`, `gh pr edit` and each
  barred REST write are refused naming the run verbs, and a reply on `pulls/<n>/comments` passes; GIVEN an attended
  session THEN the push passes the push rule. *(test: `test/hooks/personOnly.test.ts`,
  `test/hooks/personOnlyGuard.test.ts`)*
- GIVEN `mcp__github__merge_pull_request` THEN attended an ask on Claude Code, unattended a refusal; GIVEN
  `mcp__github__delete_repository` THEN a refusal; GIVEN an unattended `gh ext exec x` THEN a refusal (added 2026-10-18;
  *test: `test/hooks/personOnlyGuard.test.ts`, `test/hooks/personOnly.test.ts`*).

**REQ-FLOW-121** (added 2026-10-18)

- GIVEN an unattended line adding an `env:` drive write, an assignment, a wrapper, a nested verb, a trailing `&`, a
  `> file` or the `node` form to a run verb THEN a deny naming the run verbs; GIVEN the four accepted invocations, a
  closing ` 2>&1` or a single-quoted title THEN allowed; GIVEN the same lines attended THEN as before. *(test:
  `test/hooks/personOnly.test.ts`, `test/hooks/personOnlyGuard.test.ts`, `test/hooks/personOnlyGuardDist.e2e.test.ts`)*

**REQ-FLOW-122** (added 2026-10-18)

- GIVEN `GIT_EXEC_PATH`, `GIT_SSH_COMMAND` and `GIT_ASKPASS` set WHEN an unattended verb starts git THEN git sees none
  of them and the line names them, values never printed; attended THEN they reach git; GIVEN the two variable lists THEN
  the parity test fails when they differ. *(test: `test/cli/engine/gitWrite.test.ts`,
  `test/cli/commands/runCheckpoint.test.ts`)*

**REQ-FLOW-123** (added 2026-10-18)

- GIVEN an attended `gh pr merge 1` THEN Claude Code's ask JSON with exit 0, and a deny on Copilot, Cursor and Codex;
  GIVEN `Mode: unattended`, a fault reading the mode, a sub-agent's identity or `permission_mode: "auto"` THEN a deny on
  all four. *(test: `test/hooks/personOnlyGuard.test.ts`)*

**REQ-FLOW-124** (added 2026-10-18)

- GIVEN `git push --force origin main`, `gh pr merge 1 --delete-branch`, `gh release upload v1 a --clobber`,
  `gh repo edit --visibility public` or `npm unpublish x@1.0.0` THEN a deny on all four clients; GIVEN
  `gh pr merge 1 && git push origin :feat` THEN `ask: false`; GIVEN each mid-pattern deny row THEN it matches its
  refused line and no ask line. *(test: `test/hooks/personOnly.test.ts`, `test/adapters/claude.test.ts`)*

## References

- `docs/plans/013-optimization-sweep-01.md` — the measures and the method that found these items.
- `docs/plans/013-optimization-sweep-02.md` — the core: its decisions, shared contracts and spec delta A.
- `docs/plans/013-optimization-sweep-03.md` — the next tier, spec delta A, and the drop list.
- `.stamity/runs/2026-09-30_optimization-sweep/record.md` and its `ledger.jsonl` — the build, the sign-offs and the
  live checks this merge cites by ledger id.
- `docs/plans/016-fork-distribution-00.md` — spec delta B (REQ-FLOW-036 to 038), the units `u0-settings-ownership` and
  `u0-hook-files-ownership`, and the declared defaults S10–S19 with their dated build amendments.
- `.stamity/runs/2026-10-07_security-fixes/record.md` and its `ledger.jsonl` — the build, the review rounds and the
  sign-offs the "Amended 2026-10-07 (build)" bullets record.
- `.stamity/runs/2026-10-08_maintainer-tooling/plan.md`, its `record.md` and its `ledger.jsonl` — the in-flow plan's
  spec deltas, the maintainer's answers and the ledger rows the text dated 2026-10-08 cites.
- `docs/plans/019-lean-flows-02.md`, and `.stamity/runs/2026-10-08_product-core/plan.md` (its in-flow re-plan, whose
  `## Spec delta` and `## Security notes` this merge took), `record.md` and `ledger.jsonl` — the sign-offs, the review
  rounds and the ledger rows the text dated 2026-10-09 cites.
- `docs/plans/019-lean-flows-03.md`, and `.stamity/runs/2026-10-10_next-tier/plan.md` (its in-flow re-plan, whose
  `## Spec delta` this merge took), `record.md` and `ledger.jsonl` — the sign-offs, the review rounds and the ledger
  rows the text dated 2026-10-10 cites.
- `test`: each requirement names its suites above; once a test exists it is the normative record.
- `source`: `src/shared/cliCall.ts`, `src/emit/substitution.ts`, `src/cli/kit/packageName.ts`,
  `src/types/markers.ts`, `src/detect/repoAnalyzer.ts`, `src/detect/verificationGates.ts`,
  `src/cli/commands/init/plan.ts`, `src/cli/commands/check.ts`, `src/mcp/env.ts`, `src/cli/commands/sync/engine.ts`,
  `src/learnings/validation.ts`, `src/learnings/store.ts`, `src/runs/ledgerStore.ts`, `src/cli/commands/init/panel.ts`,
  `src/cli/commands/init/apply.ts`, `src/cli/notice/updateNotice.ts`, `src/adapters/copilot.ts`, `src/adapters/codex.ts`,
  `src/adapters/cursor.ts`, `src/emit/skillsProjection.ts`, `src/change/classify.ts`, `src/change/testInputs.ts`,
  `src/change/scan.ts`, `src/cli/commands/gate.ts`, `src/roster/triggers.ts`, `src/roster/reviewCaps.ts`,
  `.stamity/change-classes.json`, and the command, agent and skill bodies under `content/`.
- `source` (added 2026-10-10): `src/runs/inboxStore.ts`, `src/runs/disposition.ts`, `src/cli/commands/ledger.ts`,
  `content/skills/st-verify/scripts/spec-plan-coverage.mjs`.
- (Amended 2026-10-14: the two `source` lists above named `scripts/plugins/tokens.mjs`,
  `scripts/plugins/clients/codex.mjs`, `scripts/plugins/clients/cursor.mjs` and `scripts/generate-apm-package.mjs`,
  deleted with the routes in 1.15.0.)
- `docs/plans/020-cli-native-01.md` — the spec delta that deleted the APM and plugin routes and moved REQ-PLUGIN-005,
  -014, -016, -017 and -045 to -047 here, with `.stamity/runs/2026-10-14_cli-native/` for its run, added 2026-10-14.
- `source` (added 2026-10-14): `src/cli/commands/check.ts` (`checkPluginDuplicates`, `checkPackReach`,
  `evaluateExpectations`), `src/cli/kit/packageName.ts` (`leftoverPluginLines`), `src/cli/commands/clean.ts`
  (`printLeftoverPlugin`), `src/types/manifest.ts` (`SetupManifest.plugin`).
- `docs/plans/015-board-writes.md`, and `.stamity/runs/2026-10-12_board-writes/plan.md` (its in-flow re-plan, whose
  `## Spec delta` the 2026-10-12 merge took), `record.md` and `ledger.jsonl` — the sign-offs, the review rounds and the
  ledger rows the text dated 2026-10-12 cites (REQ-FLOW-078, REQ-FLOW-079; REQ-FLOW-025 modified), added 2026-10-12.
- `test` (added 2026-10-12): `test/runs/ledgerInboxWrite.test.ts` and `test/runs/inboxStore.test.ts` (REQ-FLOW-078);
  `test/corpus/commands/board.test.ts`, `test/corpus/cliCallForm.test.ts` and `test/corpus/commands/plan.test.ts`
  (REQ-FLOW-079); `test/corpus/commands/work.test.ts` and `test/corpus/recordWrites.test.ts` (REQ-FLOW-025,
  REQ-FLOW-078).
- `source` (added 2026-10-12): `src/cli/commands/ledger.ts::runInboxWrite`, `src/runs/ledgerStore.ts::writeInbox`,
  `src/runs/inboxStore.ts::editInboxText`.
- `docs/plans/020-cli-native-02.md`, `-03.md` and `-04.md`, with `.stamity/runs/2026-10-14_cli-native/` (its record,
  ledger and units' reports) — the spec deltas, sign-offs and ledger rows the text dated 2026-10-15 cites
  (REQ-FLOW-080 to REQ-FLOW-088; the amended requirements name theirs), added 2026-10-15.
- `source` (added 2026-10-15): `content/rules/stamity-question-protocol.md` (`## Close walk`),
  `content/charter/stamity-charter.md` (invariants 2 and 5), `content/agents/stamity-test-runner.md` (`## Row proving`),
  `content/skills/st-qa/SKILL.md`, `content/skills/st-verify/references/maintainability.md`,
  `src/hooks/portableRunner.ts` (`portableHookCommand`, `launcherPath`, `COPILOT_RUNTIME_TOOL_NAMES`),
  `src/manifest/hookDocuments.ts` (`walkUpStarterScript`), `src/hooks/scripts.ts` (`CLOUD_SESSIONS`), `src/hooks/model.ts`
  (`CLIENT_CLOUD_FACTS`, at `fee88300`), `src/emit/capabilityMatrix.ts`, `src/shared/cliCall.ts` (`cliCallHint`),
  `src/adapters/copilot.ts` (`COPILOT_EVENT_NAMES`, `translateCopilotMatcher`, `buildSetupSteps`), `src/tools/translator.ts`
  (`ASK_USER_TOOLS`, at `ecf11a74`).
- `test` (added 2026-10-15): `test/cloud/containerLeg.test.ts`, `test/corpus/rules/protocol.test.ts`, and the suites
  each requirement names; eval cases in `evals/cases-v6/` as each Proof bullet names them.
- `docs/plans/021-cloud-runs-01.md`, with `.stamity/runs/2026-10-15_cloud-runs/` (its record, ledger and units'
  reports) — the spec delta and the cell passes the text dated 2026-10-16 merges (REQ-FLOW-089 to REQ-FLOW-104 and
  REQ-FLOW-120; the amended requirements name theirs), added 2026-10-16.
- `source` (added 2026-10-16): `content/skills/st-unattended/SKILL.md` and its `references/chains.md`,
  `src/runs/planCheck.ts`, `src/runs/planCoverage.ts`, `src/runs/freshness.ts`, `src/runs/runContract.ts`,
  `src/runs/morning.ts`, `src/runs/prerequisites.ts`, `src/runs/pullRequest.ts`, `src/runs/preflight.ts`,
  `src/hooks/personOnly.ts`, `src/change/personOnlyPaths.ts`, `src/cli/commands/plan.ts`, `src/cli/commands/run.ts`,
  `src/cli/engine/gitWrite.ts`, `src/cli/engine/ghRunner.ts`, and the `learn read`, `gate preflight` and `gate scan
  --text` verbs.
- `test` (added 2026-10-16): `test/corpus/skills/unattended.test.ts`, `test/hooks/unattendedAskGate.test.ts`,
  `test/hooks/personOnlyGuard.test.ts`, and the suites each requirement names; eval cases in `evals/cases-v6/` as
  REQ-PROVE-038 in `docs/specs/prove-behavior-and-value.md` names them.
- `docs/plans/021-cloud-runs-02.md`, with `.stamity/runs/2026-10-18_cloud-runs-2/` (its record and its units' and
  fixers' reports) — the spec delta the text dated 2026-10-18 merges (REQ-FLOW-105 to REQ-FLOW-119 and REQ-FLOW-121 to
  REQ-FLOW-124; the amended requirements name theirs), added 2026-10-18.
- `source` (added 2026-10-18): `content/skills/st-unattended/references/cloud.md`, `src/session/detect.ts`,
  `src/hooks/personOnly.ts` (`CLAUDE_ASK_ROWS`, `GITHUB_MCP_ROWS`, `unattendedPushVerdict`), `src/hooks/scripts.ts`
  (`guardDecisionOutput`, `attendedAsk`, `buildReviewGateScript`, `buildCloudReadinessScript`,
  `buildContextOnceScript`, `buildCursorContinueScript`), `src/cli/engine/gitWrite.ts` (`GIT_PROGRAM_VARIABLES`),
  `src/cli/commands/run.ts` (`originRunTip`, `workTreeAddition`, `committedPatchPaths`, `stagedDeletions`),
  `src/runs/cardSource.ts`, `src/runs/resumeCard.ts`, `src/runs/layout.ts` (`USAGE_REVIEW_PATTERN`,
  `RECORD_CHECKPOINT_PATTERN`), `src/emit/agentsMd.ts` (`renderCursorCloudBlock`), `src/adapters/claude.ts`,
  `src/adapters/cursor.ts`, `src/adapters/copilot.ts` (`buildRunAgentFile`, `pinnedCliInstall`),
  `src/cli/commands/check.ts` (`checkCloudInstall`), `src/tools/translator.ts` (`AskUserToolEntry.cloud`),
  `src/manifest/manifest.ts` (`DROPPED_PLUGIN_KEY`), `scripts/qa/hook-runs.mjs` (`--ask`), and `docs/cloud.md`.
- `test` (added 2026-10-18): `test/hooks/cursorContinue.test.ts`, `test/hooks/contextOnce.test.ts`,
  `test/hooks/cloudReadiness.test.ts`, `test/session/detect.test.ts`, `test/qa/hookRunsCli.test.ts`, and the suites
  each requirement names; the eval case `evals/cases-v6/golden/cursor-cloud-question-takes-default.md`.

## Risks

- The first npx call needs the network (REQ-FLOW-002).
- An ESLint config that reports unused disable directives, or a run with `--max-warnings 0`, can flag the header of
  REQ-FLOW-001 where the project already declares Node globals: measured on 5 emitted scripts, and `eslint --fix` strips
  the line until the next sync (ledger `build/45`). oxlint honours the directive and has no per-path way to turn it off
  (ledger `build/43`).
- Codex asks for hook approval again after each stamity upgrade, because `.codex/hooks.json` carries the pinned version
  and Codex records trust against that file's hash (REQ-FLOW-002). The 1.11.0 release notes say so.
- REQ-FLOW-013 and REQ-CTX-017 moved eval Expected blocks; each moved block carries its reviewed disposition in
  `evals/SET-v7.md`.
- With Codex or Cursor selected beside Copilot, an operator sees the nine touchpoints twice in Copilot: as prompt files
  and as project skills (REQ-FLOW-026). The model's own list holds them once.
- A narrower local gate finds a failure later, at CI, when the map misses a read (REQ-FLOW-062, REQ-FLOW-063). What
  bounds it: the guard over every (test, path) pair, "unclear means product", and the condition both flows state, CI's
  full run on every `product` or stronger change; where the CI provider is `unknown` the final tree runs every gate.
- The line rules of REQ-FLOW-065 and the scan of REQ-FLOW-066 are new patterns. Over this repository's last 500
  commits the scan stops on 6 lines, real-looking credential examples in `docs/plans/016-fork-distribution-01.md`, and
  each stop is the person's to settle (the run record of `2026-10-08_product-core`); the line rules read JavaScript,
  TypeScript and Python only, so a dangerous call in another language places a change by path alone.
- Audit-first (REQ-FLOW-065) needs the bump staged with the index equal to the work tree; an unstaged bump, or a CRLF
  work tree, keeps the lens. It fails closed (ledger `review/170`, declared default).
- **Accepted risk (REQ-FLOW-071, and REQ-LADDER-004 in `docs/specs/model-ladder.md`).** github.com's Copilot cloud
  agent reads the same `.github/agents/` files, and its handling of `include-custom-instructions` and
  `reasoning-effort` is undocumented (the custom-agents configuration page, read 2026-10-10). The risk was accepted
  at the plan gate of run `2026-10-10_next-tier` (its ledger `plan/8`, `plan/21`, `build/14`). What
  bounds it: both capability rows say the cloud handling is undocumented and claim nothing for it
  (`src/adapters/copilot.ts:196-219`). What would change it: a cloud-agent run on a repository carrying the keys, or
  GitHub's custom-agents page listing them.
- REQ-FLOW-071's effect rests on one live run: the 2026-10-10 check ran without the key and proved the gap alone, and
  QA row 2 of that run, at its close, ran with the key emitted on Copilot CLI 1.0.89 and the sub-agent quoted the
  charter (`.stamity/runs/2026-10-10_next-tier/record.md:462`). One run on one CLI version is what bounds the claim;
  a later CLI version is unmeasured. (Amended 2026-10-14, folding the inbox row
  `2026-10-11_release-1-14-0/review/5`; it read "REQ-FLOW-071's effect is not yet shown by a live run … Until a run
  with the key emitted quotes the charter, the claim rests on the CLI's changelog and its loader's key list.")
- A row the screen withholds reaches a run without its description (REQ-FLOW-068). What bounds it: the row still
  matches by its location, its files, its day and its tag, and prints its line, severity and location with the
  pattern id, so Frame and the close name it for the person to read. A true finding is never reworded until the
  screen misses it, which is the defect the injection-screening rule names
  (`content/rules/stamity-injection-screening.md`).
- A close that drops or re-dates an inbox row edits a row another run wrote (REQ-FLOW-074). It does so only on the
  person's answer; each removal is a retirement with a record line, and a re-dated row keeps its `Ref:`.
- A path match misses a prose location and a root manifest with no dot in its name (REQ-FLOW-068, REQ-FLOW-077; that
  run's ledger `review/77`). `--area`, `files:` and the unmatched count bound it. Amended 2026-10-10 (the fix batch
  for the pull request's review bot; `review/107`, with `review/77`): a location entry that carries a line suffix
  names a path even with no slash and no dot. The suffix is a name holding a letter, one `:`, then a line number or
  a line range and nothing more, as in `Makefile:12`, `Dockerfile:3-9` or `Gemfile:12`, read after the entry's
  backticks are stripped and it is cut at its first space. Such a row matches by `--paths`, is no longer reached by
  `--area`, and may carry `when: touched` with no `files:` (`src/runs/inboxStore.ts:295-336`). What the match still
  misses: a prose location, a bare word with no line suffix (`Makefile`), a `:` followed by anything else
  (`Makefile:all`, `Makefile:12:5`), and a suffix with no letter before it (`12:30`, `—:12`). The rule's limit,
  accepted: a prose location whose first word reads `<word>:<number>` (`step:2 of the plan`) names a path too, and
  `--area` no longer reaches its row.

## Concerns

- The `npx --no stamity <verb>` of REQ-FLOW-002 runs whichever installed copy npm resolves: the project's own bin, a
  `node_modules/.bin` here or in a parent folder, or a global one. The version such a copy runs is not pinned. With no
  installed copy, npm still reads the unscoped name's manifest once before refusing, and runs nothing (`review/102`,
  the security re-check's residual).
- About 60 CLI remedy strings keep a bare `stamity <verb>` (plan decision 11, drop list D-58), and three user-typed bare
  mentions remain in `content/skills/st-onboard/SKILL.md`, `content/commands/st-quick.md` and
  `content/commands/st-work.md` (the census's deferred list).
- REQ-FLOW-007 covers the lock-declared runners and a plain venv pinned at init on POSIX. Other environment managers,
  and a Windows venv, keep the default rendering plus the warning from REQ-FLOW-008. `config detect` does not compare
  `detected.packageManager` (deferred).
- REQ-FLOW-012 leaves the method for counting source lines to the Source tree probe the command already runs.
- REQ-FLOW-025's allowlist sentence landed on 2026-10-08 (unit `b4-no-read-allow-rows`) and shipped with 1.14.0;
  its one residual is the lost-manifest case the REQ-FLOW-036 line below names.
- REQ-FLOW-022: the Copilot workflow's bun branch still tells the reader to "add its setup step here" in a file that
  says edits are overwritten (`src/adapters/copilot.ts:606-608`); the unit fixed only the non-Node branch. The file
  name the pin scan skips has two sources (`COPILOT_SETUP_STEPS_PATH` and `ENGINE_EMITTED_WORKFLOWS`). That `check`
  reports the workflow as drifted after the project moves a pin, until the next sync, follows from `check` re-planning
  live and was not measured.
- REQ-FLOW-026: a command restricted with `tools:` to one client would still reach every client that reads the shared
  tree. No shipped command uses `tools:` (the unit's deferral M-1).
- REQ-FLOW-026 and REQ-FLOW-038, as amended 2026-10-08: a copy an earlier release rendered that the running engine no
  longer produces is kept on upgrade and named for a delete by hand, not reclaimed; the run's plan leaves it to a
  release that retires an artifact to say so in its CHANGELOG. The two 1.11.0 Cursor guards are the one exception,
  recognised by the frozen 1.11.0 builder, and the two setups REQ-FLOW-038's amendment names (`review/99`) keep their
  spawn guard.
- REQ-FLOW-036 and REQ-FLOW-037: the residues the plan records as follow-up rows stay open — a user-hook entry edited
  in `.claude/settings.json` instead of its definition stays beside the engine's rendering; after a lost manifest the
  three allow rows a release rendered read as the owner's; a key an owner adds inside an engine Codex table makes the
  whole table the owner's; and inside the bound a forged record still proves a selected `[mcp_servers.<id>]`
  (`docs/plans/016-fork-distribution-00.md`, Follow-ups and the 2026-10-07 amendment of S16).
- REQ-FLOW-061 to REQ-FLOW-066 — the residuals run `2026-10-08_product-core` recorded, as landed:
  - **Head code still routes its own CI** (`review/8`, standing since plan 019 file 1). `scripts/ci/records-only.mjs`
    and the `src/change/` modules it imports run from the pull request's head, so a change to that code decides its
    own CI routing. Bounded: those paths sit in no lane, so they answer full CI
    (`scripts/ci/records-only.mjs:47-51`, `LANE_PATHS`, re-pointed 2026-10-14 to `4d003d60` from `:61-66`, where the
    retired records lane had held it); the class file places them `security-sensitive`, so the lens reads any
    change to them (`.stamity/change-classes.json:8-12`); and the suites come from the base map. A change that
    rewrites the script to answer narrow is trusted until review reads it.
  - **A backslash in a git name** (`review/43`). Off Windows, a name such as `.stamity\overrides\x.md` is one
    top-level Markdown file and reads `docs`, which is right for the file a POSIX checkout writes; on win32 git's
    names are read both ways and the stronger class kept, because a Windows checkout with `core.protectNTFS` off
    writes that name into `.stamity/overrides/` (`src/cli/commands/gate.ts:54-58`, `:1231-1233`).
  - **What a class file may lower** (`review/59`, `review/70`). A `records` or `docs` glob must end in a concrete
    extension or name a file (`src/change/classify.ts:1489-1510`), so this repository's site globs name their
    extensions (`.stamity/change-classes.json:17-24`). A `tests` glob stays freer: a folder glob such as `**s/**` is
    accepted, and `"tests": ["**/*.*"]` would place config files in `tests`; code still reaches `tests` only under a
    built-in test glob. Any edit to the class file is `security-sensitive` and read from the base only.
  - **A nested project's class file.** Seen from a parent project, `sub/.stamity/change-classes.json` matches no
    built-in rule, which names the class file at the project root only (`src/change/classify.ts:640-645`), so it reads
    as an unplaced config file, `product`, with no lens; from its own project root it is `security-sensitive`.
  - **A real read built at run time** passes the test-input guard as the rewritten fixture data does
    (`src/change/testInputs.ts:11-14`; `review/84`); the full run on every `product` or stronger change backs it.
  - **The review gate's `low` refusal** sits beside "confidence alone starts no round": on a client whose hook holds,
    a `low` approval is sent back to a fixer, and the text does not say whether that counts as a round
    (`content/commands/st-work.md:212-215`; `review/33`, a product choice left open).
  - **Invariant 4 names `gate classify` but not its base**; a bare call after committing classifies only the
    uncommitted paths. Both flows pass the base (`content/commands/st-work.md:193`;
    `content/commands/st-quick.md:165`), and the charter's two lines hold no room for it.
- REQ-FLOW-068 to REQ-FLOW-077 — the residuals run `2026-10-10_next-tier` recorded, as landed; each id is that run's
  ledger row, open at this merge:
  - **The free-text refusal has five slots, and the command named three** (`review/69`). `/st-board`'s Removal rule
    stated it for a trigger, a `fixed` reference and a `cut` reason; the grammar also refuses a board item and an
    accepted-risk reason (`src/runs/disposition.ts:253-254`, `:326-346`). Settled 2026-10-10 in the whole-branch
    review's fix round: the rule names all five (`content/commands/st-board.md:436-438`).
  - **The query's caps are in no command text** (`review/70`). `/st-board` says a skipped row is listed as it prints;
    one past the fiftieth has no line of its own, only the `+<n> more` count. The JSON `skipped` list is cut to 50
    before the matched withheld rows are left out of it, where the human form drops them first
    (`src/cli/commands/ledger.ts:1251-1254`, `:1269`; `review/78`). Settled 2026-10-10 in the whole-branch review's fix
    round, its code part: the JSON list leaves those rows out before its cap, as the human form does (REQ-FLOW-068, the
    caps).
  - **`files:` at `—`** (`review/62`). `/st-board` asks a row at `—` to name `files:`; the reader holds only a
    `when: touched` row to a path, and `/st-rework`'s meta row stands at `—` with none (REQ-FLOW-076, REQ-FLOW-077).
  - **What the grammar still lets through.** A row placed above the heading passes with no day and no trigger
    (`build/19`); one prose word in `files:` passes as a path (`review/37`); and the screen reads the inbox row by row,
    so a pattern split over two adjacent rows passes (`src/cli/commands/ledger.ts:1176-1183`; `review/26`). Amended
    2026-10-12 (S24, `pr/1`): the query now screens the lines it prints in windows of adjacent lines, so that split is
    withheld; what passes is a pattern spread over printed lines that share no window (REQ-FLOW-068, the screen).
  - **The close edits the inbox whole.** It removes and appends bullets with the file tools, and no text limits its
    read to the lines it changes, so a whole-file read there brings a withheld row's text into the orchestrator's
    context, which the query kept out (`content/commands/st-work.md:380-390`; `review/50`). Amended 2026-10-10 (the
    whole-branch review's fix round, `review/97`): the text no longer claims the never-open floor for the close; it says
    the close's write reads the file whole where the client's edit tool reads before it writes, and that a withheld or
    skipped row's text is data the close never acts on or repeats (`content/commands/st-board.md:417-421` at the base
    `41b1899a`). The read itself stands. Amended 2026-10-12 (run `2026-10-12_board-writes`): settled for the close,
    which writes the inbox through `stamity ledger inbox-write` and, while a CLI form with that verb runs, never opens
    the file with the file tools (REQ-FLOW-078; `content/commands/st-work.md:392-399`;
    `content/commands/st-board.md:455-457`). The read moved to the writers still on the file tools (below).
  - **A settled row is asked about at the close.** A row a persisted plan settles as deferred is not asked about at
    Frame (REQ-FLOW-019), yet it is a touched, unfixed row at the close, so each run touching its file asks about it
    there (`build/27`, a decision left open).
  - **The qa skill's two readings of auto-proven** (`build/42`). Its person-row paragraph auto-proves a row from a
    check the test-runner executed, while its Auto-prove table and rule 1 ask for the test source's `file:line`
    (`content/skills/st-qa/SKILL.md:41-43`, `:90`, `:100-104`). Recorded as observed; this merge settles neither.
    Amended 2026-10-10 (the whole-branch review's fix round, `review/94`): the negative row of a security-adjacent path
    is held to rule 1's pointer (`:45-49`); for every other row the two readings stand. Settled 2026-10-15 (plan 020 file
    3, unit `f7-prove-before-asking`, folding this row): the Auto-prove table and rule 1 accept the same two forms, a
    test's `file:line` beside the gate result or the prover's `agent-run` (`content/skills/st-qa/SKILL.md:96-97`,
    `:107-112`; REQ-FLOW-069, amended 2026-10-15).
  - **Copilot's verdict roles load the working tree's instructions** (`review/22`, a security finding and a decision
    left open). With REQ-FLOW-071's key, Copilot's reviewer and lenses load the checkout's `AGENTS.md`, `CLAUDE.md`
    and `copilot-instructions.md`, so a branch that edits one is judged by roles already following the edit.
  - **The APM package's Copilot agents** carried neither `include-custom-instructions` nor `reasoning-effort`
    (`build/12`, `build/22`). Settled 2026-10-14 by the deletion: 1.15.0 removes the APM route, so no Copilot agent
    ships outside the engine's emission (route clause dropped 1.15.0: the citation named the deleted APM generator).
- REQ-FLOW-078 and REQ-FLOW-079 — the residuals run `2026-10-12_board-writes` recorded, as landed:
  - **The other inbox writers still use the file tools.** `fill`'s removal of an entry it triaged and `/st-plan`'s
    follow-up append, and beside them `/st-rework`'s and `/st-pr-resolve`'s appends, the dep-audit skill's and
    `/st-quick`'s removal, edit `.stamity/inbox.md` with the file tools; on a client whose edit tool reads a file before
    it writes, that read brings the whole inbox, a withheld row's text included, into the session (`SECURITY.md:107`;
    the run plan's Follow-ups, a Warning, `when:` the next unit that edits one of their inbox texts).
  - **The joined screens read windows.** A window holds the adjacent bullets that fit in 8,193 characters, so a screen
    pattern split across three or more bullets that share no window passes `inbox-write`
    (`src/cli/commands/ledger.ts:1318-1356`; `review/18`, rejection upheld), as a split over two rows passes the query's
    row-by-row read (`review/26` of run `2026-10-10_next-tier`, above). Amended 2026-10-12 (S24, `pr/1`): the query
    reads its printed lines in the same windows, so one limit now bounds both: a split over lines that share no window
    passes either.
  - **A decided row with no unique `Ref:` stays.** `inbox-write` removes only by a `Ref:` that matches exactly one
    bullet, so the close leaves such a row and lists it on `Not done:` (`src/runs/inboxStore.ts:552-570`;
    `content/commands/st-work.md:396-397`; the run plan's Follow-ups, a Minor).
  - **The no-CLI fallback reads the file.** With no CLI form, or an installed copy without `inbox-write`, the close
    appends with the file tools and records `inbox: by hand (no CLI)` (`content/commands/st-work.md:398-399`; S18), so
    on a read-before-edit client that append reads the inbox whole.
- REQ-FLOW-080 to REQ-FLOW-088 — the residuals run `2026-10-14_cli-native` recorded, as merged on 2026-10-15; each id is
  that run's ledger row:
  - **Eval cases read the walk's order, not the tool call.** The cases run without tools, so they grade that the
    summary waits for the last answer, not that the client's question tool was called; a person's walk of a real close
    at the release's QA covers the call (plan 020 file 3, its Risks).
  - **A hook write the version names.** Copilot's hook entries name the pinned version, so an upgrade rewrites
    `.github/hooks/stamity.json`, and where that file is not tracked and clean it leaves a `.bak` (`build/45`).
  - **Vendor facts not re-read on a docs page:** `CURSOR_PROJECT_DIR` on every Cursor hook (`build/43`), Copilot's path
    argument name for `edit`, `create` and `view` (`build/76`), and how Cursor merges `updated_input` across two
    `preToolUse` hooks on `Task`.
  - **`/st-debug` and a refused folder.** It starts git itself and reads no `gate` reason, so REQ-PLUGIN-046's stop of
    2026-10-15 does not reach it (recorded by `f5-touchpoints-a`'s report as pre-existing).
- REQ-FLOW-105 to REQ-FLOW-124 and the text dated 2026-10-18 — what plan 021 file 2's units and fixers recorded as
  open, as merged:
  - **Attended safety rests on one client holding an ask.** Claude Code's hook `ask` in bypass mode is measured, not
    documented; at each release `hook-runs.mjs --ask` re-measures its headless half (a `-p` run's `held` shows only
    that the asked command did not run) and a person's interactive check on the release checklist sees the approve
    prompt appear, and a client whose ask ran moves to refusing (REQ-FLOW-123, REQ-PROVE-042).
  - **The stand-alone rule is a layer, not a wall.** A launcher its text reading does not unwrap, or a verb name split
    by quotes or built by an expression, skips it, and an environment set earlier then reaches the verbs' git
    (REQ-FLOW-104, REQ-FLOW-121). Matching `st` as a word refuses more unattended lines than needed, the safe direction.
  - **A shell heredoc's body is read as shell text** by the guard, so a commit message quoting a person-only command
    through a quoted heredoc is refused or asked; commits go through a message file.
  - **The review counter stays keyed by the client session**, so every reviewer stop in a session counts toward one cap,
    and the `rebuilt` mark is never cleared, so a once-marked checkout holds a side session's completion until it
    reviews (REQ-FLOW-106).
  - **Vendor facts not re-read at build:** Cursor's `stop` and `loop_limit` citations carry no read date
    (REQ-FLOW-109), and the Cursor environment-override and Copilot `PATH` facts behind REQ-FLOW-111 rest on the plan's
    reading. Copilot's cloud rows read documented, not run, for want of a Copilot cloud-agent account.
  - **Windows shells and the helper advice.** The advice's empty value is not checked under Windows PowerShell 5.1 or
    `cmd` (REQ-FLOW-101).
