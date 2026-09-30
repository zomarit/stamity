---
id: optimization-sweep-03
intent: feature
stamp: 67d2b954f6cab0e7601fc9f8df25273b2fcebecc 2026-09-30
reads: [AGENTS.md, .github/workflows/ci.yml, vitest.config.ts, package.json, knip.json, .gitattributes, content/commands/st-work.md, content/commands/st-quick.md, content/commands/st-board.md, content/commands/st-ask.md, content/agents/stamity-reviewer.md, content/skills/st-learn/SKILL.md, src/hooks/scripts.ts, src/learnings/validation.ts, src/learnings/store.ts, src/runs/ledgerStore.ts, src/runs/blocks.ts, src/cli/commands/ledger.ts, src/cli/notice/updateNotice.ts, src/cli/commands/sync.ts, src/cli/commands/check.ts, src/cli/commands/init/panel.ts, src/cli/commands/init.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/emit/capabilityMatrix.ts, src/emit/skillsProjection.ts, scripts/leak-gate.mjs, scripts/repo-hygiene.mjs, scripts/evidence-summary.mjs, docs/capability-matrix.md, docs/plugins.md, docs/troubleshooting.md, docs/specs/orchestrator-context.md, docs/specs/prove-behavior-and-value.md, test/ci/workflow.test.ts, test/records/ledgers.test.ts, test/docsPages.test.ts, test/hooks/scripts.test.ts, test/corpus/commands/board.test.ts, .stamity/learnings, .stamity/inbox.md]
depends_on: [docs/plans/013-optimization-sweep-02.md]
---

# The optimization sweep — file 3 of 3: the next tier, and the drop list

This file is self-contained. It is Package 17 session 1's third `/st-plan` artifact. It holds the next tier: the items
the maintainer kept to build after file 2's core, in session 2. Every shared-file lane here starts after file 2's lane
on the same file. It ends with the drop list the maintainer confirmed, each item with the trigger that would bring it
back.

intent chosen: feature because the kept items name net-new behaviour (a records-only CI lane, a sized `/st-ask`, a
fresh re-reviewer, an honest learning index, runs that retire the inbox rows they fixed, shared skills for Codex) and
the request says build.

## Context

The tier holds the items the evidence supports but that break no flow outright: CI speed and flake handling, the
learning index, first-run output, the inbox, small ledger and eval tooling, fewer permission prompts, and the Codex
charter and command surface. One item runs before everything else in session 2: the live check of whether Copilot's
writing agents load the charter; if they do not, that fix moves into file 2's core. Nothing here changes a public shape
in a breaking way; the additive shapes are listed in the Risks.

**Out of scope:** file 2's core; the drop list below; the private layer's own items, which that layer plans.

## Decisions

### The maintainer's walk (2026-09-30; every answer the recommended option)

| Question | Answer |
|---|---|
| A fresh re-reviewer | Next tier. |
| Fewer permission prompts | Next tier; records through the file tools; setup writes no allowlist. |
| The Codex charter and command surface | Both in the next tier, the command surface last. |
| Client currency and first-run output | Live check first in session 2; the rest in the next tier. |
| CI speed and flakes | Both in the next tier, one writer for `ci.yml`. |
| The learning index | The one-off re-date now (file 2); the product change here. |
| The inbox | Next tier: a one-off clean-up, and runs retire the rows they fix. |
| Tooling | The email rule now, as a closer; eval cost keys and ledger papercuts in the tier. |
| `/st-ask` sizing | Next tier. |
| The drop list | Confirmed as written, each item with its trigger. |

### Settled by this plan (declared defaults; the maintainer may reverse any at session 2's start)

1. **The update notice** names the exact new version (`npx <package>@<version> sync`) and says how to stay; it never
   advises `@latest`.
2. **The Copilot setup-steps workflow** follows the project's own pins: the Node version from `.nvmrc`,
   `.node-version` or `engines.node`, and the action refs from the project's own workflows.
3. **`/st-quick` names each inbox row it retires in its closing report**, since it keeps no run record.
4. **Copilot lists the shared skills beside its prompt files.** The double listing is accepted and declared per client;
   the live check records whether Copilot honours the explicit-invocation key.
5. **The email rule** runs first in the tier, as a closer.
6. **The learnings writer is file 2's**, so every learning count moves once.

### Amended by the run (2026-09-30)

Session 2's contract census (`.stamity/runs/2026-09-30_optimization-sweep/reports/census-settled.md`, its "Later"
line, from `census-researcher-r1.md` and `census-researcher-r3.md` over HEAD `f387c5e7`) and the orchestrator's
sign-offs on two `sw14` reports amend these cells in place. Every `path:line` in an amended cell was re-read at HEAD
`32ceeeec`; each cell carries an `amended` row.

- **`sw13-runs-retire-fixed-inbox-rows`:** `--retired` joins `FOREIGN_FLAGS` for append and status, its branch is taken before the manual close's `--state` check, `retireRow` takes an injected clock, and `docs/cli-reference.md` is regenerated (census C5, C8).
- **`sw21-ledger-cli-papercuts`:** the dedupe breaks the gating test `test/runs/ledgerAppend.test.ts:573-584`, which changes with a TEST CHANGE; the dedupe reads under the ledger lock, `AppendedRow` gains `alreadyFiled`, and the moved message pins are named (census Critical, C5–C7). Repeated findings match existing rows one-to-one in row order (the orchestrator's sign-off), so a re-piped block files zero rows and prints each original id once.
- **`sw11-learning-index-honest`:** the store's order pins move with a TEST CHANGE, the engine reads each date before its budget cut, and past 20 entries each twin's byte figure counts its own printed section (census C9).
- **`sw10-first-run-output`:** the `.gitignore` entries added come from `ensureGitignoreEntry`'s return value, which `sw27` adds with sync's report (file 2's `review/67`), through a new `InitApplyReport` field; `HOOK_TRUST_STEPS` is reshaped without moving the trusted `hooks.json` bytes; the update notice renders through `pinnedCliCall`, so decision 1's form reads `npx -y <package>@<version> sync`; the Copilot workflow scan skips `ENGINE_EMITTED_WORKFLOWS` (census R1).
- **`sw18-codex-rules-leave-shared-charter`:** `test/corpus/invariants.test.ts:766-774` and `src/emit/capabilityMatrix.ts:520-527` require WITH > WITHOUT, so the shared-byte pair collapses to one figure; the Codex plugin packager refuses an unmapped root file, so the chosen location gets a `place` rule (census R1 Critical and Warning).
- **`sw17-touchpoints-as-shared-skills`:** Codex invokes skills as `$st-<id>`, so the panel and the docs say so, and the Cursor packager's `command` class and the measured skills-list figure move with the nine (census R1 Critical). The live-check criterion of REQ-FLOW-026 now reads `$st-work`.
- **`sw14-client-currency-sweep`:** the stale-line wordings, `ACCESS_DATE` re-stamped for Claude only, the Codex learning's claims moved to what codex-cli 0.155.1 measured, and the version targets, from `reports/sw14-client-currency-sweep-researcher-r1.md` and `reports/sw14-codex-learning-implementer-r1.md`; two Follow-ups rows record what it does not build.

## Proof map

| Item | Unit | Must hold (existing) | Census | New case |
|---|---|---|---|---|
| SW-31 `/st-ask` sizing | sw31-ask-sized-to-question | floor `ask-refuses-mid-answer-change`, `ask-citation-discipline` | ranges: `repo-content-directive-is-data`, `ask-next-step-derived-from-run-state` | `ask-narrow-symbol` |
| SW-08 fresh re-reviewer | sw08-fresh-re-reviewer | `agent-fixer-return-contract` | `agent-reviewer-return-contract` (the edits fall in its range); `st-work` ranges | `re-review-closures-fresh-reviewer` (plan 009 gap 3) |
| SW-13 inbox retirement | sw13-runs-retire-fixed-inbox-rows | `work-proof-block-fields`, `quick-next-step-derived-from-batch-state` | ranges: `quick-mid-run-re-escalation`, `benign-small-change-quick-proceeds` | none; tests |
| SW-29 records through file tools | sw29-records-via-file-tools | `work-proof-block-fields`, floor `charter-touchpoints-delegate` | `st-work` ranges | none; a body lint |
| SW-06, SW-12, SW-19, SW-20, SW-21, SW-11, SW-10, SW-14, SW-18, SW-17 | their units | — | — | none; tests, docs and live checks |

Two new case files (the set grows from 111 to 113); lane V of file 2 is their writer. The `st-work.md` budget of file 2
still binds: SW-08's and SW-29's text lands above the re-attach cut and under `BODY_LINE_CAP`; file 2's `work-make-room`
targets include these ~700 characters and ~13 lines, and each unit measures first.

## Spec delta

This delta adds requirements to `docs/specs/everyday-flows.md`, which file 2 creates, and changes two existing specs.
Every `path:line` was read at `67d2b954`.

### A. `docs/specs/everyday-flows.md` (continued; file 2 creates the file)

#### REQ-FLOW-020 — `/st-ask` is sized to the question · SW-31

A question that names one symbol or one file is answered by at most one researcher at quick depth, or directly with citations under a one-symbol exception to the context budget. Mechanism and impact questions keep their fan-out.
- **Evidence:** the facet table is at `content/commands/st-ask.md:52-56`, "dispatch every facet to `researcher`" at `:58`, and the context budget at `:67-70`.
- **Proof:** new case `ask-narrow-symbol`. Must-holds: the floor `ask-refuses-mid-answer-change` and `ask-citation-discipline`. QA.

Criteria:
- GIVEN "where is `formatTotal` defined and what does it return?" WHEN `/st-ask` runs THEN at most one researcher is dispatched, and every claim cites a `path:line`.
- GIVEN an impact question THEN 3–5 facets are dispatched, as the table says.

#### REQ-FLOW-021 — The learning index warns ahead, orders by date and reports real bytes · SW-11

- A learning whose `reviewBy` falls within 14 days produces a warning.
- The index is ordered by the frontmatter `date`, newest first, with ties broken by file name.
- The byte figure the banner prints equals the byte length of the index text it prints.
- **Evidence:** a warning comes only once the date has passed (`src/learnings/validation.ts:341-344`), and `date` is required (`:298`). The index is ordered by mtime (`src/hooks/scripts.ts:931`; `src/learnings/store.ts:346`) and cut at 20 lines (`src/hooks/scripts.ts:186`).
- **Proof:** tests + docs + QA.

Criteria:
- GIVEN a `reviewBy` 13 days ahead THEN a warning names it. GIVEN 15 days ahead THEN none does.
- GIVEN two learnings whose mtime order is the reverse of their `date` order THEN the index lists the newer `date` first.
- GIVEN any banner THEN its printed byte figure equals the byte length of the index lines it printed.


#### REQ-FLOW-022 — First-run output matches what setup did · SW-10

Every file count `init` prints equals the number of files it wrote, and every path it reports writing exists. Its
next steps name a defaulted client set as the default, list the Codex trust steps, and give each `.gitignore` entry
added a neutral reason; the credential wording appears only when an MCP server is configured. The update notice names the exact new version to move to, and how to stay, and never advises `@latest`. The Copilot
setup-steps workflow setup emits follows the project's own pins.
- **Evidence:** the update notice advises `npx <name>@latest sync` (`src/cli/notice/updateNotice.ts:273`). Setup emits
  `.github/workflows/copilot-setup-steps.yml` (`src/adapters/copilot.ts:84`) with hard-coded action refs and
  `node-version: "lts/*"`.
- **Proof:** tests + QA.

Criteria:
- GIVEN init for all four clients WHEN its output is compared with the files written THEN each printed count equals the
  count of written files, and each reported path exists.
- GIVEN an install pinned at 1.9.1 and a registry answering 1.10.0 WHEN the notice prints THEN it names `@1.10.0 sync`
  and a way to stay, and contains no `@latest`.
- GIVEN a repository with `engines.node: "22"` and `actions/checkout@v7` in its own workflow WHEN setup emits the
  Copilot workflow THEN it carries `node-version: "22"` and `actions/checkout@v7`.

#### REQ-FLOW-023 — Copilot's writing agents load the charter · SW-14

Copilot's emitted writing agents (implementer, fixer, spec-author and creator) load the charter. This requirement binds
only if session 2's first check (unit `sw14-copilot-charter-live-check`) records `loaded: no`; if it records `yes`, the
id is retired with the disposition "live check found no gap".
- **Evidence:** no emitted agent key in `src/adapters/copilot.ts` includes custom instructions (search:
  `custom.instructions` matches only documentation URLs, at `:56`, `:106` and `:233`).

Criteria:
- `judgment: maintainer` · GIVEN a live Copilot session on a fixture WHEN the implementer is dispatched THEN it can quote
  the charter's invariant 1.
- GIVEN sync with Copilot selected WHEN the four definitions are read THEN each carries the key the live check named.

#### REQ-FLOW-024 — A run retires the inbox rows it fixed · SW-13

At its close, `/st-work` removes each `.stamity/inbox.md` row its change fixed and records one line per row, `inbox
retired: <location> — fixed in <run id>`, in its run record. `/st-quick`, which keeps no run record, names each row it
retired in its closing report. A row whose `Ref:` names a ledger row is retired through `stamity ledger close --id <row>
--retired "<disposition>"`, which keeps the row's state and adds the dated `retired` field.
- **Evidence:** the removal rule is at `content/commands/st-board.md:354-358`, and `/st-work` is a writer at `:333-336`;
  nothing writes `retired` today (`src/runs/ledgerStore.ts:498`).
- **Proof:** tests. Must-holds: `work-proof-block-fields` and `quick-next-step-derived-from-batch-state`. QA.

Criteria:
- GIVEN an inbox row whose `file:line` the run's change fixes, and which the run names as fixed, WHEN the close runs THEN
  the row is gone from `.stamity/inbox.md` and the record carries its retirement line.
- GIVEN a row the run did not name as fixed THEN it stays, byte-identical.
- GIVEN a `/st-quick` batch that fixed a named row THEN the row is gone and the closing report names it.
- GIVEN a deferred ledger row WHEN `ledger close --id <row> --retired "fixed in <run>"` runs THEN the row keeps
  `deferred`, gains `retired` starting with today's UTC date, and a second run prints `unchanged`.

#### REQ-FLOW-025 — Run records are written with the file tools · SW-29

Bodies tell the agent to write run records, in-flow plans and reports with the client's file-write tool. Ledger rows still go through the CLI (REQ-CTX-005). Setup writes no permission allowlist.
- **Proof:** a body lint + must-holds `work-proof-block-fields` and the floor `charter-touchpoints-delegate` + QA.

Criteria:
- GIVEN the lint over `content/` WHEN it runs THEN it passes.
- GIVEN a body line that writes under `.stamity/runs/` with a heredoc, `cat >`, `echo >`, `printf >` or `tee` THEN the lint fails and names the file and line.


#### REQ-FLOW-026 — The touchpoints ship as shared skills, so Codex gets them · SW-17

Sync emits the nine touchpoint bodies once, as `.agents/skills/st-<id>/SKILL.md`, invoked only by name, and stops
emitting the copies under `.cursor/skills/st-<id>/`. The Codex skills-list sum stays under its 8,000-character cap.
Copilot reads `.agents/skills/` as well as its `.github/prompts/st-<id>` files, so the touchpoints list twice there; the
double listing is accepted and declared in Copilot's capability disclosure.
- **Evidence:** Codex gets no command bodies (`docs/capability-matrix.md:240`). Cursor's are
  `.cursor/skills/<id>/SKILL.md`, marked `disable-model-invocation: true` (`:174`). Cursor, Copilot and Codex read
  `.agents/skills/` (`:163`, `:195`, `:229`); Claude does not (`:131`).
- **Expand/contract:** the shared skills land, and the Cursor copies are removed in the same sync, only after the live
  Cursor check shows the shared copy is listed and invokable. Rollback is a re-sync at the prior version. The Codex cell
  of the parity table in `docs/specs/orchestrator-context.md` ("no `/st-work` body is emitted") changes in the same unit.

Criteria:
- GIVEN sync with Codex selected THEN nine `.agents/skills/st-<id>/SKILL.md` files exist, and Codex's skills-list total
  stays under 8,000.
- GIVEN sync on a tree carrying 1.10.0's `.cursor/skills/st-<id>/` files THEN they are removed, and nothing else under
  `.cursor/` changes.
- GIVEN Copilot selected THEN its capability disclosure declares the double listing, and the live check records whether
  Copilot honours the explicit-invocation key.
- `judgment: maintainer` · GIVEN a live Codex session WHEN the user types `$st-work` (Codex invokes skills with `$`) or names it THEN the body loads.

### B. `docs/specs/orchestrator-context.md`

#### REQ-CTX-018 — A re-review is a fresh dispatch, and an approval counts when no gate is declared · SW-08

ADDED REQ-CTX-018

Each re-review is a new dispatch of the reviewer, never a resumed agent. Its brief is the handed ledger ids, the report path, and each finding's own `path:line` and text. It carries no fixer claim. When the run declares no confidence gate, an approval counts at once and starts no further round.
- **Evidence:** an approval below the declared gate is reviewed again on a stronger class (`content/commands/st-work.md:254-256`). Re-review closures are at `:273-278`.
- **Proof:** new case `re-review-closures-fresh-reviewer`. Must-holds: `agent-reviewer-return-contract` and `agent-fixer-return-contract`. QA.

Criteria:
- GIVEN `content/commands/st-work.md` WHEN the review loop is read THEN it states the fresh dispatch and the brief contents, and says no fixer claim is passed.
- GIVEN a run with no declared confidence gate WHEN the reviewer approves THEN no further review round is dispatched.
- GIVEN a re-review THEN it returns exactly one closure per handed id and only new Critical or Warning findings.


MODIFIED REQ-CTX-005 · SW-21. Two changes:
- A `--stdin` append whose findings already have rows appends none of those. A finding matches a row when phase, source and evidence (`<locator> — <summary>`) are equal. Such an append exits 0 and prints each matching row's line with the suffix `already-filed` on stdout. New findings in the same block are still appended.
- The stdin over-ceiling refusal names the block's measured size as well as the ceiling. Today it names only the ceiling (`src/cli/commands/ledger.ts:182`).

**Expand/contract:** the only change is on a repeated `--stdin` append. Its consumer is the ledger step at `content/commands/st-work.md:172-175`, proven by `test/records/ledgers.test.ts` and this requirement's criteria.

Criteria:
- GIVEN a two-finding `--stdin` block appended once WHEN the same block is appended again with the same run, phase and source THEN it exits 0, appends no row, and stdout prints both existing rows with the suffix `already-filed`.
- GIVEN a block holding those two findings plus a new one THEN exactly one row is appended.
- GIVEN a stdin block over the ceiling THEN the refusal names the block's size and the ceiling, and the ledger is byte-identical.

MODIFIED REQ-CTX-008 · SW-21. `stamity ledger close --id` accepts the short form `<phase>/<n>`, qualified with `--run` as `--ids` already is. Today `qualifyLedgerId` runs only on the `--report` path (`src/runs/ledgerStore.ts:638`, `:665`).

Criteria:
- GIVEN `stamity ledger close --run R --id review/2 --state deferred --rationale "<text>"` THEN row `R/review/2` moves exactly as it does with the full id.
- GIVEN `--id` naming another run's id THEN it exits 1 and the ledger is byte-identical.


### D. `docs/specs/prove-behavior-and-value.md`

MODIFIED REQ-PROVE-003 · SW-18. Under `on-demand`, Codex's floor-class rules are emitted to a location only Codex loads, not into the shared root `AGENTS.md`. The live check picks that location. The omission notice stays.

MODIFIED REQ-PROVE-005 · SW-18. The shared-byte constants are re-pinned so that the shared bytes are equal with and without Codex. The spec currently pins 24,904 with Codex and 5,192 without. The Codex-only file counts in Codex's own row.

**Expand/contract:** on the branch, the Codex file lands first and the shared copy is removed after. Rollback is a re-sync at the prior version. Claude's floor cases are the must-holds.

Criteria:
- GIVEN sync with Claude only, and with Claude plus Codex, WHEN the root `AGENTS.md` files are compared THEN they are byte-identical.
- GIVEN Codex selected THEN the floor-class rules exist in exactly one Codex-only file, and every ceiling in the corpus suite equals the computed composite.
- `judgment: maintainer` · GIVEN a live Codex session on a fixture WHEN asked for the first line of the secrets rule THEN it quotes it.


## Units

**First in session 2**

### sw14-copilot-charter-live-check — session 2 runs this FIRST

> **Runs first in session 2**, before file 2's lanes. If it records `loaded: no`, the fix (emit `include-custom-instructions: true` on the writing agents) joins file 2's lane E.
| Field | Content |
|---|---|
| `id` | sw14-copilot-charter-live-check |
| `requirements` | REQ-FLOW-023 |
| `files` | the session-2 run record (one result line); nothing in the product tree |
| `interfaces` | **Current:** the Copilot agent builder writes `name`, `description`, `target`, `tools` and `model` only (`copilot.ts:440-447`). Copilot CLI 1.0.86+ custom agents skip `AGENTS.md` unless `include-custom-instructions: true` is set (vendor changelog, as reported in session 1, accessed 2026-09-29 — re-read at build).<br>**Check:** in a scratch fixture, `stamity init -y --tools copilot`. Run the Copilot CLI once through the emitted `stamity-implementer` agent, asking it to quote the line under `## Invariants`, or reply `NONE`. Record `loaded: yes\|no` with the CLI version. The exact flag for choosing a custom agent is unverified; confirm it with `copilot help` first. |
| `testCriteria` | **Given** the fixture, **when** the probe runs, **then** the record line reads `copilot <version> writing-agent charter: loaded yes\|no`. **If `no`,** the fix joins file 2's lane E as its own unit: `include-custom-instructions: true` on the four writing agents (implementer, fixer, spec-author, creator) in `buildAgentFile` (`copilot.ts:440-447`); files `src/adapters/copilot.ts`, `test/adapters/copilot.test.ts` and the goldens; criterion: each of the four carries the key and no verdict role does; verify `npx vitest run test/adapters test/emit`. |
| `edgeCases` | The CLI is not installed or not logged in: record `not-run` with the reason; the fix stays in the tier and the release notes carry it as a `Not done:` gap. |
| `depends_on` | none |
| `verify` | `grep -n "writing-agent charter" .stamity/runs/<session-2 run>/record.md` |


**A closer, beside file 2's lanes**

### sw20-email-rule — an email rule in the leak gate, also in the hygiene check
| Field | Content |
|---|---|
| `id` | sw20-email-rule |
| `requirements` | spec carries no ids — maintainer tooling only |
| `files` | `scripts/leak-gate.mjs`, `scripts/repo-hygiene.mjs`, `test/ci/leakGate.test.ts`, `test/ci/repoHygiene.test.ts`, `test/gate/leakGateEvasion.test.ts`, plus any tracked file the census respells |
| `interfaces` | **Current:** `RULES = [...NAME_RULES, ...PRIVATE_RULES, ...SECRET_RULES]` (`leak-gate.mjs:595-605`); the only exemption form is by path (`:456-480`); there is no email pattern. `repo-hygiene.mjs` checks runtime files, raw evidence, size and archive manifests (`:95-148`) and imports nothing.<br>**New `EMAIL_RULES` entry `email-address`** (case-insensitive, folded view): matches `<local>@<domain>.<tld>`, then drops a match that is:<br>• in a reserved domain — `example.com/.org/.net` or any `example.*`, any `*.invalid`, `*.test`, `*.local`, `*.localhost`, and the project's own `zomarit.dev`;<br>• a no-reply local part or `users.noreply.github.com`;<br>• the SSH remote form `git@<host>:`.<br>This narrows the rule's own shape, like the credential shapes do (`:570-573`); it is not an in-file opt-out, so the header's content-exemption ban holds. Path exemptions go in an `EMAIL_FIXTURES` list with a reason each, printed on every run. The rule is exported as `EMAIL_RULE`.<br>**`repo-hygiene.mjs`** imports it and, with `--base`, scans the added lines of changed files (`git diff --cached -U0 <base>`) for both `--kind` values. It reports `email address added` by path and line and never echoes the address. The gate's `FAIL` line and exit 1 are unchanged. |
| `testCriteria` | **Given** a file with an address at a real-looking domain, **when** `node scripts/leak-gate.mjs --root <fixture>` runs, **then** it exits 1 naming `email-address` and the file. **Given** `.invalid`, `example.com`, a no-reply address and `git@github.com:o/r`, **then** it exits 0. **Given** a fullwidth `@` spelling, **then** it is caught through the folded view. **Given** a hygiene run whose added line carries an address, **then** it prints FAIL without the address. |
| `edgeCases` | **Census first:** the tree holds 99 email-shaped matches in 35 files (`direct`, count-only grep), mostly fixtures. The unit's first step runs the rule in report mode; each hit outside the reserved domains is respelled to `.invalid` or path-listed with a reason. Git history is not scanned (the gate's NOT RUN item 1). |
| `depends_on` | none |
| `verify` | `node scripts/leak-gate.mjs && npx vitest run test/ci/leakGate.test.ts test/ci/repoHygiene.test.ts test/gate` |


**After file 2's lanes on the same files**

### sw06-records-only-ci-lane — fast CI lane for records-only pushes
| Field | Content |
|---|---|
| `id` | sw06-records-only-ci-lane |
| `requirements` | spec carries no ids — CI tooling only; no contract moves |
| `files` | `.github/workflows/ci.yml`, `scripts/ci/records-only.mjs` (new), `test/ci/workflow.test.ts`, `test/ci/recordsOnly.test.ts` (new) |
| `interfaces` | **Current:** `ci.yml:111-690` has jobs `check` (3 legs), `apm-install`, `plugin-route`, `supply-chain`, `dependency-review` and `all-ci-checks`. The aggregator (`:681-689`) has `needs: [check, supply-chain, apm-install, plugin-route]` and requires `success` for check, apm-install and plugin-route. `workflow.test.ts:247-254` pins the job list and `:445` pins the needs.<br>**New `scripts/ci/records-only.mjs`:** `node scripts/ci/records-only.mjs --base <sha>` prints `records_only=true` or `records_only=false`. It prints `false` when the base is missing or all zeros, and on schedule or workflow_dispatch. It prints `true` only when every path in `git diff --name-only <base> HEAD` matches `RECORDS_PATHS = [".stamity/runs/**", ".stamity/inbox.md", ".stamity/handoffs/**", "docs/plans/**"]`. It also exports `RECORDS_SUITES = ["test/records", "test/docsPages.test.ts", "test/cli/docs/measurements.test.ts", "test/authoring/specPlanCoverage.test.ts", "test/ci/leakGate.test.ts", "test/gate/leakGateEvasion.test.ts", "test/ci/repoHygiene.test.ts"]`. Confirm the list at build by grepping which tests read the real repo-root copies of those paths.<br>**New job `changes`** (ubuntu, 5 min, `contents: read`): checkout with `fetch-depth: 0`; output `records_only`; base = `github.event.pull_request.base.sha \|\| github.event.before`.<br>**New job `records`:** `needs: changes`; `if: needs.changes.outputs.records_only == 'true'`; Node 24; `npm ci`; `npx vitest run <RECORDS_SUITES>`; the existing generate-and-diff line (`ci.yml:245-251`), which needs no build; `npm run gate`; on pull requests, `node scripts/repo-hygiene.mjs --base "$HYGIENE_BASE_REF"`.<br>**Changed jobs:** `check`, `apm-install` and `plugin-route` gain `needs: changes` and `if: needs.changes.outputs.records_only != 'true'`.<br>**Aggregator:** `needs: [changes, check, records, supply-chain, apm-install, plugin-route]`. When `records_only == 'true'` it asserts `records == success` and the three heavy jobs `== skipped`; otherwise the three `== success` and `records == skipped`.<br>**Lane map:** the header comment (`:12-85`) names the new lane. |
| `testCriteria` | **Given** a diff touching only `.stamity/runs/x/record.md`, **when** `records-only.mjs --base <parent>` runs, **then** it prints `records_only=true`. **Given** a diff that also touches `src/cli.ts`, **then** it prints `records_only=false`. **Given** the workflow, **when** `workflow.test.ts` runs, **then** the job list reads `changes, check, apm-install, plugin-route, records, supply-chain, dependency-review, all-ci-checks`, and the aggregator's report contains both branches of the assertion. |
| `edgeCases` | A new branch's push has an all-zero `before`, so the result is full CI. A `.stamity/learnings/**` change is not a record (it feeds the session hook and the troubleshooting count), so full CI runs. The weekly schedule always runs full CI. A records-only pull request that makes the measurements page drift fails in `records` at generate-and-diff. |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/ci/recordsOnly.test.ts && npm run lint && npm run typecheck` |

### sw12-flake-unit — timeouts, temp sweep, private TMPDIR, one flaky re-run, Windows shards
| Field | Content |
|---|---|
| `id` | sw12-flake-unit |
| `requirements` | spec carries no ids — test and CI tooling only |
| `files` | `vitest.config.ts`, `test/support/globalSetup.ts` (new), `test/support/lazyCleanup.ts` (new), `test/upstream/workflowRecovery.test.ts`, `test/upstream/lane.test.ts`, `test/ci/apmDownstream.test.ts`, `test/ci/pluginLifecycle.test.ts`, `scripts/ci/test-run.mjs` (new), `test/ci/testRun.test.ts` (new), `.github/workflows/ci.yml`, `test/ci/workflow.test.ts`, `test/ci/testScheduling.test.ts`; retires `.stamity/learnings/full-suite-cleanup-hooks-time-out-under-concurrent-load.md` via the learnings writer |
| `interfaces` | **Current:** `vitest.config.ts:59-60` sets `testTimeout` and `hookTimeout` at 20 s. The windows leg (`ci.yml:154-156`) runs the whole suite (`:230-232`, `npm test`). Three `afterAll` removals time out under load (the learning's lines: `workflowRecovery.test.ts:38`, `lane.test.ts:752`, `apmDownstream.test.ts:11`; also inbox row `pluginLifecycle.test.ts:157`).<br>**New `vitest.config.ts`:** `test.env = { TMPDIR, TEMP, TMP }` set to `join(os.tmpdir(), "stamity-vitest-" + process.pid)`, and `globalSetup: ["test/support/globalSetup.ts"]`. Setup creates that folder; removes sibling `stamity-vitest-*` folders older than 24 h; calls `statfsSync(tmpdir())` and prints `warning: temp volume <path> has <free> free (<pct>%)` below 10 % or 2 GiB. Teardown removes the private folder.<br>**New `lazyCleanup(dir)`:** renames the tree into `<private TMPDIR>/.trash/<uuid>` and returns; the four `afterAll`s call it, keeping their assertions.<br>**New `scripts/ci/test-run.mjs [--coverage] [--shard=i/n]`:** runs vitest with a JSON reporter. On failure, if every failure message matches `/(Test\|Hook) timed out/`, it re-runs once: the failed files on a shard leg, or the full suite with `--coverage` on a coverage leg. Green on re-run exits 0 and prints `::warning title=flaky test::<file>: timed out once, passed on re-run` plus a line in `$GITHUB_STEP_SUMMARY`. Anything else exits 1.<br>**Matrix:** windows becomes `{os: windows-latest, node: '24', label: windows-1, shard: '1/2'}` and `{…, label: windows-2, shard: '2/2'}`. Both test steps call `node scripts/ci/test-run.mjs …`. Dogfood check and Leak gate get `if: matrix.shard != '2/2'`. |
| `testCriteria` | **Given** a vitest JSON report whose only failure is `Hook timed out`, **when** `test-run.mjs` decides, **then** it re-runs once and reports flaky on green. **Given** an assertion failure, **then** there is no re-run and the exit is 1. **Given** the workflow, **then** `workflow.test.ts` pins four legs with the windows shards. **Given** globalSetup with a fake `statfs` at 5 % free, **then** the warning prints. |
| `edgeCases` | A timeout plus an assertion failure in one run: no re-run. A second timeout on re-run: red. Coverage legs: a partial re-run cannot meet the floors, hence the full re-run. A killed run leaves its folder behind; the next run's 24 h sweep removes it. Per the testing rule (floor 7), the re-run never hides a case: every flaky file is annotated and an inbox row follows. |
| `depends_on` | sw06-records-only-ci-lane |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/ci/testRun.test.ts test/ci/testScheduling.test.ts && npm run test && npm run lint && npm run typecheck` |

### sw31-ask-sized-to-question — `/st-ask` sized to the question
| Field | Content |
|---|---|
| `id` | sw31-ask-sized-to-question |
| `requirements` | REQ-FLOW-020 |
| `files` | `content/commands/st-ask.md`; `evals/cases-v6/golden/ask-narrow-symbol.md` (new); the eval set index (`evals/SET-v7.md`, via the eval writer lane); moved `source:` ranges in the shifted ask cases; the dogfood output (`.claude/commands/st-ask.md`, `.apm/`, from sync) |
| `interfaces` | **Current `st-ask.md:52-56`:** the facet table rows Single fact (1, quick), Mechanism (2-3, standard), Impact (3-5, deep). **`:58`:** "Dispatch every facet to `researcher`…". **`:69-70`:** "Facet findings land in the orchestrator; file contents do not."<br>**New:** a first table row: `\| Named target — "what does \`parseLedgerText\` return?", "what is in \`src/runs/blocks.ts\`?" \| 0–1 \| quick \|`. After the table, a paragraph: "A question that names one symbol or one file is answered directly: the orchestrator reads the named definition and at most its direct call sites found by one search, and cites every claim under the Citation rule. When that read would pass about 300 lines or a second file's body, one quick researcher answers it instead. Mechanism and impact questions keep their fan-out."<br>**Context-budget bullet `:69`:** append "— except on the named-target shape, where the orchestrator's own bounded read is the answer." The read-only contract (`:18-30`) is unchanged: reading is in contract, and no spawn is added. |
| `testCriteria` | **Given** the rendered command body, **when** `test/corpus/commands` runs, **then** the facet table has the named-target row and the budget exception, and `spawns: [researcher]` is unchanged. **Given** the new golden case, **when** the release eval run grades it, **then** at most one researcher is dispatched and every claim carries `path:line` (graded at the release run; no before/after). |
| `edgeCases` | A question that names a symbol defined in two files is a mechanism question, so it fans out. A named file over 300 lines goes to one quick researcher, not a direct read. A named symbol that does not exist returns Unanswerable with the search it ran. |
| `depends_on` | none |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs --check && npx vitest run test/corpus test/evals && node dist/cli.js check` |

### sw08-fresh-re-reviewer — fresh re-reviewer; an approval counts with no declared gate
| Field | Content |
|---|---|
| `id` | sw08-fresh-re-reviewer |
| `requirements` | REQ-CTX-018 |
| `files` | `content/commands/st-work.md`, `content/agents/stamity-reviewer.md`, `test/corpus/commands/work.test.ts`, `test/corpus/emissionGoldens.test.ts` and `test/emit/crossClientGoldens.test.ts` (their dated notes), `evals/cases-v6/golden/re-review-closures-fresh-reviewer.md` (new, plan 009 gap 3), the eval index, moved `source:` ranges, the dogfood output |
| `interfaces` | **Current `st-work.md:254-256`:** "An approval below the declared confidence gate re-reviews once on a stronger class before it counts." **`:273-278`:** a re-review is handed ledger ids and returns closures.<br>**New, at `:254-256`:** "The confidence gate is the one the run record declares (`Confidence gate: <value>`). An approval below it re-reviews once on a stronger class before it counts. With no gate declared, an approval counts as given and no extra round runs; the review-gate hook still refuses an approval the reviewer rated `low`."<br>**New sentence at `:273`:** "Each re-review is a fresh reviewer spawn, never a resumed one; its brief is the Verdict dispatch's, plus the ledger ids and each finding's locator at HEAD."<br>**Reviewer, `stamity-reviewer.md:108-111`:** "flow's confidence gate" becomes "the confidence gate the run record declares; with none declared, an approval counts". **`:140-149`:** add "A fixer's summary in the brief is not evidence; the re-review reads the findings' lines and the fix delta." |
| `testCriteria` | **Given** `st-work.md`, **when** `test/corpus/commands/work.test.ts` runs, **then** the body names the fresh spawn and the no-gate rule, and the re-attachment-cut test (`work.test.ts:369`) stays green. **Given** the new golden case, **when** graded at the release run, **then** it shows one closure per handed id and only new Critical or Warning findings. |
| `edgeCases` | A record declaring `Confidence gate: 0.8` with a medium approval keeps the stronger-class round. A `low` approval is still refused by the hook (`src/types/core.ts:162-166`). The measurements page still treats an unstated gate as 0.8 (`measurements.ts:146,159`); record this as an intended difference, not a change. |
| `depends_on` | docs/plans/013-optimization-sweep-02.md; after its units work-asks-once and sw05-verdict-roles-read-git |
| `verify` | `npm run build && node dist/cli.js sync && npx vitest run test/corpus test/evals && node dist/cli.js check` |
| `amended` | Amended by the run (2026-09-30): the sign-off of 13:52Z — the unit returned `BLOCKED_DEPENDENCY` because its test criteria need `test/corpus/commands/work.test.ts`, which the files cell did not list; the cell now lists it and the two goldens test files for their dated notes, with `sw13-runs-retire-fixed-inbox-rows` owning the test file after it in lane W (the unit as integrated at `f75de2eb`) |

### sw13-runs-retire-fixed-inbox-rows — `/st-work` and `/st-quick` retire rows they fix
| Field | Content |
|---|---|
| `id` | sw13-runs-retire-fixed-inbox-rows |
| `requirements` | REQ-FLOW-024 |
| `files` | `content/commands/st-work.md`, `content/commands/st-quick.md`, `content/commands/st-board.md`, `src/runs/ledgerStore.ts`, `src/cli/commands/ledger.ts`, `docs/cli-reference.md` (regenerated), `test/runs/ledgerClose.test.ts`, `test/corpus/commands/work.test.ts`, `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/board.test.ts`, moved eval `source:` ranges, the dogfood output |
| `interfaces` | Line numbers read at HEAD `32ceeeec`.<br>**Current:** Frame step 4 (`st-work.md:27-34`) lists inbox rows a persisted plan settles and asks about the rest at the plan gate. The close appends deferred rows and says `retired` is set "only when its inbox row leaves" (`:383-395`). "A record already written is read-only to every later run" (`:405`). Manual close states are `fixed \| rejected \| deferred` (`ledgerStore.ts:498`), and nothing writes `retired`. The board's writer list is at `st-board.md:335-338` and its removal rule at `:356-360`.<br>**New CLI (additive):** `stamity ledger close --run <run> --id <row id> --retired "<disposition>"`. It needs the row to be `deferred`, keeps the state, and sets `retired: "<UTC YYYY-MM-DD> <disposition>"`, which satisfies `RETIRED_DATE` in `ledgers.test.ts:63`. It is idempotent when that exact value is already there. `--retired` excludes `--state` and `--rationale`. New `retireRow(req)` in `ledgerStore.ts` goes through the same `rewriteRows` lock and writer.<br>**Flag wiring (census C5):** the option `--retired <disposition>` joins the close options (`ledger.ts:609-620`). `FOREIGN_FLAGS` (`ledger.ts:116-138`) gains `["retired", "--retired", [CLOSE]]` in both the append and the status rows, so `ledger append --retired` and `ledger status --retired` are refused as usage errors, as `--state` is. In `runClose` the manual path demands `--state` and `--rationale` at `ledger.ts:461-462`; the `--retired` branch is taken before those two checks (after the `--ids` refusal at `:454-460`), refuses `--state` or `--rationale` beside it, and a `--retired` beside `--report` is refused the way `:393-399` refuses `--state` there.<br>**Injected clock (census C5):** `closeRow` and `rewriteRows` take no clock (`ledgerStore.ts:743-750`, `:578-581`), so `retireRow`'s request carries `now: Date`, and the CLI passes `ctx.app.runtime.clock.now()`, the clock `ledger status` already reads (`ledger.ts:569`). Tests inject a fixed date. `rewriteRows` also writes the run's `reports/.gitignore` when it is missing (`ensureReportsIgnore`, `ledgerStore.ts:192`, called at `:584`); a retire on an earlier run does the same, as a manual close does today.<br>**Reference page:** `docs/cli-reference.md` is generated (`src/cli/docs/cliReference.ts:48`) and gated by `test/cli/docs/cliReference.test.ts`; regenerate it with `node scripts/generate-docs.mjs` (`src/cli/docs/referencePages.ts:73`). Its `stamity ledger` section starts at `docs/cli-reference.md:290`.<br>**New `st-work.md` close text (after the close paragraph that ends at `:395`):** "An inbox row this run fixed — folded in at Frame or settled by the persisted plan — leaves the inbox at the close: the bullet is removed, the run record carries `- inbox retired: <location> — fixed in <run id>`, and a row whose `Ref:` names a ledger row is retired through `ledger close --id … --retired "fixed in <run id>"`."<br>**New `st-quick.md` Batch-flow step 6:** "An item that fixes an inbox row the request named, or whose `file:line` matches a row's location, retires it after the gate is green, the same way, and the batch report names it."<br>**`st-board.md:356-360` removal** gains "…or when the `/st-work` or `/st-quick` run that fixed it retires it at its close". A new bullet `Retirers, two: /st-work, /st-quick` sits beside Writers. `board.test.ts:577-586` gets a TEST CHANGE: its writer filter excludes the declared retirers, because otherwise naming `.stamity/inbox.md` in `st-quick.md` makes the count six. |
| `testCriteria` | **Given** a deferred row and a clock fixed at 2026-10-02, **when** `ledger close --id r1/prove/3 --retired "fixed in r2"` runs, **then** the row keeps `deferred` and gains `retired: "2026-10-02 fixed in r2"`, and a second run prints `unchanged`. **Given** an `open` row, **then** the command refuses with exit 1. **Given** `--retired` with no `--state` and no `--rationale`, **then** it is not refused for a missing `--state`. **Given** `--retired` beside `--state`, `--rationale` or `--report`, **then** it is refused as a usage error and the ledger is byte-identical. **Given** `ledger append … --retired x` or `ledger status --run r --retired x`, **then** it exits with the usage error naming `--retired` as a flag of `ledger close`. **Given** the regenerated `docs/cli-reference.md`, **then** `test/cli/docs/cliReference.test.ts` passes and the page names `--retired`. **Given** both command bodies, **then** the corpus tests find the retirement step. **Given** the committed tree, **then** `ledgers.test.ts` stays green. |
| `edgeCases` | A row with no ledger `Ref:` (a `/st-plan` follow-up): only the bullet leaves, plus the record line. An inbox row named but not fixed by the batch: it stays, and the report says so. `--retired` on a row whose run folder is missing: `VALIDATION_ERROR`. A retire on an earlier run whose `reports/.gitignore` is missing writes it, as a manual close does. `st-work.md` additions must stay out of the region before the re-attachment cut (`work.test.ts:369`). |
| `depends_on` | sw08-fresh-re-reviewer, docs/plans/013-optimization-sweep-02.md; after its units sw15-quick-gate-once and sw30-researcher-brief-keys |
| `verify` | `npx vitest run test/runs test/records test/corpus && npm run build && node dist/cli.js sync && node dist/cli.js check && npm run typecheck` |
| `amended` | 2026-09-30: the contract census (census-researcher-r3, C5 and C8) added `FOREIGN_FLAGS`, the `--state` ordering, the injected clock and `docs/cli-reference.md`, and moved the line numbers to HEAD `32ceeeec` |

### sw21-ledger-cli-papercuts — short ids, idempotent `--stdin`, size named
| Field | Content |
|---|---|
| `id` | sw21-ledger-cli-papercuts |
| `requirements` | REQ-CTX-005, REQ-CTX-008 |
| `files` | `src/runs/ledgerStore.ts`, `src/runs/blocks.ts`, `src/cli/commands/ledger.ts`, `test/runs/ledgerClose.test.ts`, `test/runs/ledgerAppend.test.ts` (including the TEST CHANGE at `:573-584`), `test/runs/blocks.test.ts` (new); `docs/cli-reference.md` (regenerated) only if the `--id` option's help text changes |
| `interfaces` | Line numbers read at HEAD `32ceeeec`.<br>**Short ids:** `closeRow` (`ledgerStore.ts:743-788`) matches `req.ledgerId` exactly. New: it resolves the id through `qualifyLedgerId(runId, given)` (`:478-486`), so `build/12` names `<run>/build/12`; an id from another run is refused. The same applies to `sw13`'s `--retired` path, since REQ-CTX-008 covers every `ledger close --id`. The refusal's next-step text at `ledgerStore.ts:770` ("name a ledger id exactly as `ledger append` printed it") changes to admit the short form.<br>**Idempotent `--stdin`:** `appendFindings` (`:391-467`) refuses repeats only when `report !== null`. New: when `report === null`, a finding whose `evidence` string equals an existing row with the same `phase` and `source` is not appended, under the matching rule below. The check reads `held`, the rows parsed under the ledger's write lock (`:406-410`), so two concurrent appends of the same block file it once. `AppendedRow` gains `alreadyFiled: boolean`, so each `--json` `rows` entry gains that key (additive), and the stdout line is `<existing id> <severity> <localId> already-filed` (an additive suffix on the `rowLine` shape at `ledger.ts:237-239`). **Matching is one-to-one in row order** (the orchestrator's sign-off, 2026-09-30): within one phase and source, the k-th incoming finding with a given evidence string names the k-th existing row that carries that string, in row order, and prints one `already-filed` line with that row's id; a finding with no matching row left is appended as a new row. Re-piping the same block therefore files zero rows and prints each original id exactly once.<br>**The gating test this breaks (census Critical):** `test/runs/ledgerAppend.test.ts:573-584` runs two concurrent `--stdin` appends of the same three findings, all with the evidence `src/a.ts:1 — s` (`finding()` at `:99-110`), and expects 6 rows. Under the dedupe the case changes with an inline TEST CHANGE reason, and still proves the lock (one writer at a time): the ledger holds 3 rows in total, and the second of the two appends to take the lock prints three `already-filed` lines naming the first append's three ids, in order.<br>**Size named:** `blocks.ts:143` `` `${key} is over ${FINDING_TEXT_MAX} characters` `` becomes `` `${key} is ${n} characters, over the ${FINDING_TEXT_MAX}-character cap` ``. `ledger.ts:182` becomes `` `the block piped on stdin is ${total} bytes, over the ${maxBytes} byte input ceiling` ``. The `closeRow` rationale message (`ledgerStore.ts:755`) names the rationale's length. The pins that move with them: `ledgerAppend.test.ts:199` and `:850`, `ledgerClose.test.ts:679` and `:711`. The closures-block sibling at `blocks.ts:330` stays as it is, with its pins at `ledgerClose.test.ts:236` and `:1097`. |
| `testCriteria` | **Given** a run with row `r/build/12`, **when** `ledger close --run r --id build/12 --state fixed --rationale x` runs, **then** it moves that row. **Given** the same findings block piped twice, **then** the second run appends 0 rows and prints `already-filed` lines with the first ids. **Given** two concurrent appends of one three-finding block whose findings share one evidence string, **then** the ledger holds 3 rows in total, and the second append prints three `already-filed` lines naming the first append's three ids, in order. **Given** two existing rows with one evidence string and a block of three findings carrying it, **then** the first two name those rows in row order and the third is appended as a new row. **Given** `--json`, **then** each `rows` entry carries `alreadyFiled`. **Given** a 350-character summary, **then** the refusal message contains `350 characters, over the 300-character cap`. |
| `edgeCases` | Two different findings with identical evidence text in one block: both are appended on the first run, since dedupe checks existing rows only; a re-pipe of that block matches them one-to-one to those two rows. A short id matching no row: the existing "is not a row" refusal. |
| `depends_on` | sw13-runs-retire-fixed-inbox-rows |
| `verify` | `npx vitest run test/runs && npm run typecheck && npm run lint` |
| `amended` | 2026-09-30: the contract census (census-researcher-r3, C5–C7 and its Critical) added the `ledgerAppend.test.ts:573-584` TEST CHANGE, the dedupe read under the lock, the `alreadyFiled` key and the moved message pins, read at HEAD `32ceeeec`; the orchestrator's sign-off then settled the matching rule as one-to-one in row order |

### sw29-records-via-file-tools — run records written with the file tools, no allowlist
| Field | Content |
|---|---|
| `id` | sw29-records-via-file-tools |
| `requirements` | REQ-FLOW-025 |
| `files` | `content/commands/st-work.md`, moved eval `source:` ranges, the dogfood output, `test/corpus/recordWrites.test.ts` (new) |
| `interfaces` | **Current:** no content file tells the agent how to write a record; a grep of `content/` for heredoc, `cat >` or `>> .stamity` finds nothing. The run record head is at `st-work.md:38-45`; pointer dispatch at `:181-190`; the report path at `:225-230`.<br>**New, at the end of Frame step 5 (`:45`):** "Records are files: create and extend `record.md`, reports and the inbox with the client's file write and edit tools — never a shell redirect, a heredoc or `cat >` — and move ledger rows only through `stamity ledger`."<br>**Pointer-dispatch line (`:185`):** "the report path, written with the file write tool". No allowlist is emitted (walk decision). `st-rework.md` and `st-pr-resolve.md` records are out of scope, to spare the census cost of `rework-persistence-guard-holds`; file one inbox row for them. |
| `testCriteria` | **Given** `st-work.md`, **when** the corpus test runs, **then** the Frame step names the file tools and forbids shell redirects for records, and `work.test.ts:369` (re-attachment cut) stays green. **Given** the release eval run, **then** the must-hold cases pass. **Given** a fixture body line `cat > .stamity/runs/x/record.md <<EOF`, **then** the lint fails naming the file and line; **given** `content/`, **then** it passes. |
| `edgeCases` | A client whose sub-agents hold no Write tool (a verdict role off Claude): the rule does not grant one; such a role returns inline, as before (`st-work.md:212-214`). |
| `depends_on` | sw13-runs-retire-fixed-inbox-rows |
| `verify` | `npm run build && node dist/cli.js sync && npx vitest run test/corpus test/evals && node dist/cli.js check` |

### sw11-learning-index-honest — warn 14 days ahead, order by `date`, print injected bytes
| Field | Content |
|---|---|
| `id` | sw11-learning-index-honest |
| `requirements` | REQ-FLOW-021 |
| `files` | `src/hooks/scripts.ts`, `src/learnings/store.ts`, `src/learnings/validation.ts`, `test/hooks/scripts.test.ts`, `test/learnings/store.test.ts`, `test/learnings/validation.test.ts`, `.stamity/generated/hooks/*/stamity-session-start.mjs` (via sync), the four session-start copies in `test/corpus/__snapshots__/emissionGoldens.test.ts.snap` (regenerated) |
| `interfaces` | Line numbers read at HEAD `32ceeeec`.<br>**Current:** the hook sorts by mtime (`scripts.ts:930-936`). The header is `"Learnings: " + loaded + " loaded, " + skipped + " skipped, " + bytes + " bytes."`, where bytes is the sum of file sizes (`:980-987`). The hook lists at most `MAX_ITEM_LINES` learnings (`DEFAULT_MAX_INDEX_LINES = 20`, `:186`, rendered at `:711`) and then one line `- … and <n> more learnings not listed.` (`:921-928`). The engine mirrors it in `formatLearningsIndex` (`store.ts:479-499`), which lists every learning and has no cap, and `listCandidates` sorts by mtime (`:334-349`) before any frontmatter is read (`:286-289`), so the budget cut at `:301-314` falls in mtime order. The writer warns only after a date has passed (`validation.ts:341-344`).<br>**New:** `export const REVIEW_WARNING_DAYS = 14` in `validation.ts`, where `checkTrustFields` adds the warning `` `reviewBy` <d> is within 14 days. Re-verify the learning and move the date, or retire it. `` Both sorters order by declared `date`, newest first, name as tiebreak, mtime only when no date (as `orderingDay` does, `validation.ts:594-600`). In the engine this means reading each candidate's declared date before the sort, the way `orderingDay` reads a file's head, so the budget cut falls in date order. An index line whose `reviewBy` is within 14 days gets the suffix ` [review due <reviewBy>]`, the same style as `[duplicate id]`. New header: `Learnings: N loaded, M skipped, <X> bytes in this index (<Y> bytes on disk).` X is the UTF-8 byte length of the learnings-section lines after the header, joined with `\n`: every line that twin prints there, learning lines, skip lines and the `… and <n> more` line included. Y is the old sum.<br>**The two twins past 20 entries (census C9):** up to 20 learnings the hook and the engine print the same lines, so the same X, and the parity test at `scripts.test.ts:370-388` holds unedited. Past 20 the hook prints 20 lines and the `… more` line while the engine prints them all, so each twin's X is the length of its own section and the two differ by design; REQ-FLOW-021 binds the banner's figure to the banner's text. |
| `testCriteria` | **Given** one learning with `reviewBy` = now + 10 days, **when** the hook runs, **then** its line ends ` [review due <date>]` and `validate` prints the within-14-days warning. **Given** two learnings with dates 09-01 and 09-28 where the older file has the newer mtime, **then** the 09-28 learning is listed first, by the hook and by `loadValidatedLearnings`. **Given** 16 learnings, **then** X equals the printed section's byte length and Y the files' byte sum. **Given** 22 learnings, **then** the hook's X equals the byte length of its own printed section (20 lines plus the `… and 2 more learnings not listed.` line), and the engine's X equals the byte length of its own full section. **Given** a byte budget that cuts the corpus, **then** the engine cuts in date order. The header pins at `scripts.test.ts:354` and `:433` and `store.test.ts:424-426` change with an inline TEST CHANGE reason (the header's byte meaning changed); the prefix checks at `scripts.test.ts:597` and `:690` hold. **Order pins (census C9):** the store fixtures share `date: "2026-08-12"` (`store.test.ts:50`) and order by `stampOrder` mtimes, so under date order they fall to the name tiebreak; the cases at `store.test.ts:346-369`, `:371-392` and `:440-456` change with an inline TEST CHANGE reason, each seeding `date` values in the order it stamps today, so each still pins its own ordering claim. |
| `edgeCases` | `reviewBy` exactly today: still loaded and flagged due. A learning with no `date`: falls back to mtime and is still listed. More than 20 learnings: the date order decides which 20 show. A budget-exhausting corpus: the engine now skips the oldest by `date`, not by mtime, so a different file can be cut than before. The session-start script must stay under `HOOK_SCRIPT_BUDGETS` 49,152 B (`scripts.ts:134`), which SW-07 also grows. |
| `depends_on` | docs/plans/013-optimization-sweep-02.md; after its unit sw05-read-only-git-grants, the last on scripts.ts |
| `verify` | `npx vitest run test/hooks test/learnings && npm run typecheck && npm run build && node dist/cli.js sync && node dist/cli.js check` |
| `amended` | 2026-09-30: the contract census (census-researcher-r3, C9 and its surprises) added the order pins, the twins past 20 entries, the engine's sort-before-parse and the golden copies, read at HEAD `32ceeeec` |

### sw10-first-run-output — first-run output fixes
| Field | Content |
|---|---|
| `id` | sw10-first-run-output |
| `requirements` | REQ-FLOW-022 |
| `files` | `src/cli/notice/updateNotice.ts`, `src/cli/commands/sync.ts`, `src/adapters/copilot.ts`, `src/adapters/codex.ts` (`HOOK_TRUST_STEPS` reshaped and exported; rendered bytes unchanged), `src/cli/commands/init/panel.ts`, `src/cli/commands/init/apply.ts` (`InitApplyReport` gains one field), `src/cli/commands/init.ts`, `src/cli/commands/check.ts`, `test/cli/notice/updateNotice.test.ts`, `test/cli/commands/sync.test.ts`, `test/adapters/copilot.test.ts`, `test/adapters/codex.test.ts`, `test/cli/commands/initPanel.test.ts`, `test/cli/commands/init.test.ts`, `test/cli/commands/check.test.ts`, `test/cli/flows.e2e.test.ts`, `test/emit/syncDriftProof.e2e.test.ts`, `test/emit/crossClientGoldens.test.ts` and its `.snap`, `docs/getting-started.md`, `docs/troubleshooting.md` (`:32` only; `:50` is `sw04-check-names-unrun-gates`') |
| `interfaces` | Line numbers read at HEAD `32ceeeec`.<br>**1. One file count.** `emissionSummary` (`panel.ts:286-299`) counts ledger rows, which gave "191" against 194 files in git. `check.ts:227` prints `N ledger row(s)` (269, shared files counted once per client), and the sample at `docs/troubleshooting.md:32` quotes that line. New panel clause: `<paths> file(s) on disk (<generated> generated, the manifest, <k> state-directory keeps; .gitignore changed)`, where paths = distinct written paths + manifest + created `.gitkeep`s. `check.ts:227` becomes `<distinct> managed path(s) (<rows> ledger rows across <n> clients)`, and `docs/troubleshooting.md:32` moves with it.<br>**2. Pin-safe update advice.** `updateNotice.ts:273` `Run: npx ${name}@latest sync` becomes `Update available: <cur> -> <latest>. To move: <pinnedCliCall(name, latest, "sync")>. To stay on <cur>, do nothing.`, the move command rendered by `pinnedCliCall` (`src/shared/cliCall.ts:80-82`), so it reads `npx -y <name>@<latest> sync`, the same form as every other pinned call (census; file 2's `sw26-cli-token`). A package marked `private: true` never reaches the notice (`updateNotice.ts:24-28`, `:121-122`), so the no-channel `npx --no` form of file 2's `review/94` never prints here. The same exact-version form replaces the help text at `sync.ts:30` and `:48`; that text spells the placeholder literally (`npx -y <name>@<version> sync`), since `pinnedCliCall` refuses a version that is not semver-shaped (`src/shared/cliCall.ts:65-71`). The comments at `updateNotice.ts:10` and `:262-264` are reworded to match, and so is `docs/getting-started.md:355-359`.<br>**3. Copilot workflow follows the project's pins.** `buildSetupSteps` (`copilot.ts:523-587`, called at `:305`) currently hard-codes `actions/checkout@v5` (`:564`), `setup-node@v5` (`:573`) and `node-version: "lts/*"` (`:576`) with a "Replace with this project's pin" comment (`:575`). New: node-version from `.nvmrc`, then `.node-version`, then `package.json` `engines.node`, else `lts/*`. Action refs are copied from the first `uses: actions/checkout@<ref>` and `actions/setup-node@<ref>` in the repo's own `.github/workflows/*.yml` (a SHA pin keeps its trailing comment), else `@v5`. The scan skips the workflow this engine emits, the name `ENGINE_EMITTED_WORKFLOWS` holds (`src/detect/repoAnalyzer.ts:305`, applied at `:769`), so the emission never reads its own output. `buildSetupSteps` takes the pre-read facts (or the root) as a new parameter, so its direct callers at `test/adapters/copilot.test.ts:891-932` change with it. The non-Node branch drops "Add the runtime setup … here" (`:538`; it contradicts "Generated — edits are overwritten") and says the agent gets a checkout only. The panel names the added workflow and when it runs.<br>**4. No silent Claude-only default.** When `toolsSource === "default"` (`plan.ts:367`), both the panel's `installedLabel` (`panel.ts:331-333`) and `renderDryRun` (`init.ts:747`) print `clients: claude (the default — no other client's files were found; add more with --tools claude,cursor,copilot,codex)`. The piped-run check at `test/cli/flows.e2e.test.ts:82` pins `-> installed claude`; it stays green, or changes with an inline TEST CHANGE reason.<br>**5. Codex trust steps, the trusted bytes held (census R1, item 5).** `HOOK_TRUST_STEPS` (`codex.ts:168-181`) is a list of wrapped text lines, not one entry per step. Its lines are the `[features]` comment of `.codex/config.toml` (`:857-862`), and joined by `hookTrustSentence` (`:639-641`) they are the `description` of `.codex/hooks.json`, whose hash Codex trusts (`:695-703`). So the reshape exports the steps as data with one entry per step, and all three renderings derive from it: that description and that comment stay byte-identical to what `sw26-engine-cli-call-form` leaves (every byte change in `hooks.json` makes Codex re-ask for hook trust, file 2's G3), and `codexSteps` (`panel.ts:155-165`) adds two panel steps from it: the project-trust entry in `~/.codex/config.toml`, and the per-hook `/hooks` review. The pins at `test/adapters/codex.test.ts:346-361` and the `.codex/hooks.json` golden stay green unedited.<br>**6. The `.gitignore` entries added, from their real source (census R1, item 6; file 2's `review/67`).** `gitignoreLine` (`panel.ts:501-517`) says "the credential file this setup uses" even with no MCP server, and today nothing says which entries a run added: `ensureGitignoreEntry` returns `Promise<void>` (`src/mcp/env.ts:582`), `applyInit` discards the call (`apply.ts:383`) and reports only `gitignoreEnsured: !dryRun` (`:142`, `:394`). `sw27-ignore-review-gate-state` (`review/67`) makes `ensureGitignoreEntry` return the entries it added, and names them in sync's report and JSON as `gitignoreAdded`. This unit keeps that return value in `applyInit` and adds `gitignoreAdded: string[]` to `InitApplyReport` beside `gitignoreEnsured`; it does not change `ensureGitignoreEntry`'s signature, which `sw27` owns. The panel lists exactly those entries, each with a neutral reason, and the credential wording appears only when `mcpServers.length > 0` (as `credentialLine`, `panel.ts:519-526`, already does at `:604`). The pins at `test/cli/commands/init.test.ts:392` and `test/cli/commands/initPanel.test.ts:577` (`.env.mcp — was added to your .gitignore`) change with an inline TEST CHANGE reason. The hint strings (`stamity config`, `apply it: stamity init`) belong to SW-26; do not touch them. |
| `testCriteria` | **Given** a 3-client init with 191 ledger paths, **then** the panel number equals the new `git status` count, and `check`'s manifest row and `docs/troubleshooting.md:32` say the same thing. **Given** a pinned 1.9.1 and a registry at 1.10.0, **then** the banner contains `npx -y <name>@1.10.0 sync` and not `@latest`. **Given** a repo with `engines.node: "22"` and `checkout@v7` in its CI, **then** the emitted workflow has `node-version: "22"` and `actions/checkout@v7`. **Given** a repo whose only workflow is the emitted `copilot-setup-steps.yml`, **then** a second sync emits it byte-identical (the scan skipped it). **Given** `init -y` with no traces, **then** the output names claude as the default. **Given** codex selected, **then** its next steps include both trust steps, and `.codex/hooks.json` and `.codex/config.toml` are byte-identical to the emission before this unit. **Given** a repo whose `.gitignore` already covers `.env.mcp`, **then** the panel names only the entries this run added. **Given** no MCP server, **then** the output has no "credential file this setup uses". |
| `edgeCases` | `engines.node: ">=22.12"`: emit the range's floor, `22.12`. A project workflow that pins by SHA: copy the SHA and its comment. A registry that answers with a lower version: no banner (unchanged, `updateNotice.ts:36-41`). A detected (not default) client set: no default line. `check` re-plans live (`check.ts:1102`), so a user who bumps `actions/checkout` in their own CI sees `check` report drift until the next sync (inferred by the census, not measured). |
| `depends_on` | sw14-client-currency-sweep, docs/plans/013-optimization-sweep-02.md; after its units sw26-engine-cli-call-form, sw04-check-names-unrun-gates and sw27-ignore-review-gate-state |
| `verify` | `npx vitest run test/cli test/adapters test/emit -u=false && npm run typecheck && npm run lint` |
| `amended` | 2026-09-30: the contract census (census-researcher-r1, items 2, 3, 5 and 6) and file 2's `review/67` — the added-entries source, the `HOOK_TRUST_STEPS` reshape with the trusted bytes held, the notice through `pinnedCliCall`, the `ENGINE_EMITTED_WORKFLOWS` skip and the missing consumers, read at HEAD `32ceeeec` |

### sw14-client-currency-sweep — stale lines, the Codex learning, no-op allow rows, versions
| Field | Content |
|---|---|
| `id` | sw14-client-currency-sweep |
| `requirements` | REQ-FLOW-025; the no-op allow rows it drops are that requirement's "setup writes no permission allowlist" sentence, and the rest of the unit carries no ids |
| `files` | `src/emit/capabilityMatrix.ts`, `docs/capability-matrix.md` (regenerated), `src/adapters/claude.ts`, `src/emit/skillsProjection.ts`, `src/adapters/copilot.ts`, `src/adapters/cursor.ts` (`:303` only), `docs/plugins.md`, `src/adapters/codex.ts`, `docs/troubleshooting.md`, `docs/customization.md`, `SECURITY.md`, `.github/client-contracts.md`, `docs/getting-started.md`, `scripts/qa/hook-runs.mjs`, `scripts/plugins/clients/codex.mjs`, `.claude/settings.json` (via sync), `test/emit/capabilityMatrix.test.ts`, `test/adapters/claude.test.ts`, `test/adapters/copilot.test.ts`, `test/merge/settingsKeyOwnership.test.ts`, `test/ci/pluginLifecycle.test.ts`, `test/docsPages.test.ts`. The Codex learning is not this unit's file: the learnings writer recaptures it (file 2's `retire-gate-repeat-learnings` commit) |
| `interfaces` | Line numbers read at HEAD `32ceeeec`; the vendor facts are from `reports/sw14-client-currency-sweep-researcher-r1.md` (every page accessed 2026-09-30) and the measurement from `reports/sw14-codex-learning-implementer-r1.md`.<br>**Stale lines:**<br>• `capabilityMatrix.ts:313-315` (renders `capability-matrix.md:288`) says "Unchanged — `claude` is the one client still declaring an entry file". New: "Fired — Claude Code 2.1.277+ reads `AGENTS.md` only where no `CLAUDE.md` exists; stamity emits a `CLAUDE.md`, so the `@AGENTS.md` bridge import is the vendor's documented shape for that case and stays emitted for the one entry file." The vendor's memory page says both halves: "Claude reads `AGENTS.md` only when you have no `CLAUDE.md` in your working directory or above it", and the import is what to do "when your project also has a `CLAUDE.md`". The tail keeps "entry file", which `capabilityMatrix.test.ts:456-461` pins.<br>• `claude.ts:6-7` "reads neither `AGENTS.md` nor `.agents/skills/`" becomes "reads `AGENTS.md` only through the bridge import, and never reads `.agents/skills/`" (confirmed: "Not read: … anything under a `.agents/` directory"). The same stale claim sits at `skillsProjection.ts:8-9` and `:108-110`, and at `docs/customization.md:183`.<br>• `copilot.ts:170-175` effort-axis "omitted — this surface publishes no effort key …" is refuted as worded: the key dates from 1.0.66, and 1.0.88 applies it when the agent is selected. New: "not emitted — Copilot CLI custom agents accept `reasoning-effort` (1.0.66; applied on agent selection since 1.0.88; release notes, accessed 2026-09-30); this engine does not write it yet". The pins at `test/adapters/copilot.test.ts:881-883` ("documented omission of the reasoning-effort axis") and `:1069` ("omitted") change with an inline TEST CHANGE reason; `:1077` (the matrix carries the cap verbatim) holds.<br>• `docs/plugins.md:430` "is not auto-updated at all" becomes "Copilot CLI 1.0.79 added `autoUpdate` on an `extraKnownMarketplaces` entry; stamity's marketplace entry does not set it, and a repository-level `autoUpdate` is ignored, so opting in is a user-settings step." `docs/plugins.md:431-434` is corrected too: the vendor's CLI plugin reference says first-party plugins, those from the built-in `copilot-plugins` and `awesome-copilot` marketplaces, "automatically update at the start of each session in a trusted working directory", so "the CLI's own help names no effect on plugins" no longer stands alone.<br>• Cursor's rule shape at `cursor.ts:303` says `globs` is "an unquoted comma-separated list with no spaces"; the vendor says "Separate multiple patterns with commas" and its own example has a space after the comma. New: the comma list is the vendor's, and the no-spaces form is this engine's choice. The emission is unchanged (`test/adapters/cursor.test.ts:390` stays green).<br>**`ACCESS_DATE`, all-or-nothing** (the rule at `copilot.ts:129-136`): Claude's `ACCESS_DATE` (`claude.ts:353`) re-stamps to `2026-09-30`, since every claim it covers verified. Copilot's (`copilot.ts:137`, `2026-09-10`), Codex's per-citation dates (`codex.ts:279-288`) and Cursor's (`cursor.ts:357-361`) stay as they are, since each adapter has a changed or an unverified claim; the changed claims' text above is fixed with its own inline date. The Codex effort scale changed on the vendor page, but it lives in `src/roster/modelLadder.ts:423` (a behaviour contract outside this cell), so it is a Follow-ups row, not built here.<br>**Codex learning (measured on codex-cli 0.155.1, 2026-09-30):** `codex-hooks-need-the-features-flag-and-exec-runs-none.md` fails as stated. With the key absent from both layers the feature is on (`codex features list`: `hooks stable true`). A project-file `hooks = false` did not turn hooks off under the learning's per-invocation trust override (`-c projects."<path>".trust_level`), because that override does not load the project `.codex/` layer, so "the written key is measurably read" is not shown. `codex exec` ran no project hook in 3 of 3 feature-on runs; the cause (exec itself, or the unloaded project layer) is not isolated. Still unmeasured: whether the project `.codex/config.toml` and `.codex/hooks.json` load once the path is trusted in `~/.codex/config.toml`, and whether `exec` then runs the hook. The learnings writer recaptures the learning; this unit moves every claim tied to it to say what 0.155.1 measured and what stays unmeasured, keeping the 0.154.0 measurement as history: `codex.ts:256-259` (the hook-enforcement cap), `docs/troubleshooting.md:200`, `docs/customization.md:353`, `SECURITY.md:233`, `scripts/qa/hook-runs.mjs:124-127`, `scripts/plugins/clients/codex.mjs:65-66`, the comment at `test/docsPages.test.ts:2308-2309`; and, found by a grep at HEAD for `codex exec` and `0.154.0`, the same claims at `.github/client-contracts.md:50-61`, `docs/getting-started.md:245-248` and `docs/plugins.md:63-65`. The literal pins on those pages hold: `test/docsPages.test.ts:261-268` and `:1039-1051` require `codex exec`, `0.154.0`, `2026-09-15` and `2026-09-17` in `.github/client-contracts.md`, and `:2306-2317` requires "`codex exec` runs no project hook at all" in `docs/getting-started.md`; a pin whose words no longer hold changes with an inline TEST CHANGE reason. The adapter keeps writing `[features] hooks = true`.<br>**No-op allow rows:** `CLAUDE_PERMISSION_ROWS` (`claude.ts:396-402`) renders `Read`, `Grep`, `Glob` into `.claude/settings.json:2-8`. New: an empty set, so no `permissions.allow` rows are emitted. Sync removes only rows this engine owns. The plugin lifecycle test pins the three rows (`test/ci/pluginLifecycle.test.ts:938-952`) and moves with them.<br>**Tested versions:** move "measured on" claims only where re-measured. This machine runs Claude 2.1.285, Copilot 1.0.89, codex-cli 0.155.1 and Cursor 2026.09.28-64d2043; the latest codex-cli is 0.159.2 (npm `latest`, 2026-09-29), which stays unmeasured and is a Follow-ups row. |
| `testCriteria` | **Given** regenerated docs, **when** `generate-capability-matrix.mjs && git diff --exit-code` runs, **then** it is clean, and row 288 reads "Fired" and still contains "entry file". **Given** the adapters, **then** Claude's `ACCESS_DATE` reads `2026-09-30` and Copilot's, Codex's and Cursor's dates are unchanged. **Given** Copilot's `effort-axis` cap, **then** it names 1.0.66 and 1.0.88 and says this engine does not write the key. **Given** a Claude-only init, **then** `.claude/settings.json` has no `permissions.allow` from this engine. **Given** a repo whose user added `Read` by hand, **then** sync keeps that row. **Given** each claim site listed above, **then** it names what codex-cli 0.155.1 measured and what stays unmeasured, and none says the project-file key is measurably read. **Given** an emitted `.codex/config.toml`, **then** it still carries `[features]` with `hooks = true`. |
| `edgeCases` | The vendor page is unreachable at build: keep the old line, and record the claim as `unverified` with the date tried. A partial re-read: do not re-stamp `ACCESS_DATE`. A claim site whose sentence is also a docs pin: keep the dated literals the pin names and add the 0.155.1 result beside them. |
| `depends_on` | sw14-copilot-charter-live-check, docs/plans/013-optimization-sweep-02.md; after its unit sw05-read-only-git-grants |
| `verify` | `node scripts/generate-capability-matrix.mjs && git diff --exit-code docs/capability-matrix.md && npx vitest run test/emit test/adapters test/merge test/docsPages.test.ts test/ci/pluginLifecycle.test.ts && npm run build && node dist/cli.js sync && node dist/cli.js check` |
| `amended` | 2026-09-30: the orchestrator's four sign-offs on `reports/sw14-client-currency-sweep-researcher-r1.md` and `reports/sw14-codex-learning-implementer-r1.md` — the stale-line wordings, `ACCESS_DATE` for Claude only, the Codex learning's claims moved to the 0.155.1 measurement, and the version targets; line numbers read at HEAD `32ceeeec` |

### sw19-eval-cost-in-summary — token and list-cost keys, additive
| Field | Content |
|---|---|
| `id` | sw19-eval-cost-in-summary |
| `requirements` | spec carries no ids — maintainer tooling only |
| `files` | `scripts/eval/usage.mjs` (new), `scripts/evidence-summary.mjs`, `evals/price-list.json` (new), `evals/EVIDENCE-STORAGE.md`, `test/ci/evidenceSummary.test.ts`, `test/eval/usage.test.ts` (new) |
| `interfaces` | **Current:** `compactSummary` (`evidence-summary.mjs:10-20`) keeps every summary fact and adds `archiveStorage`; the CLI takes `--source/--output/--manifest`. Public summaries carry no usage or cost keys. Per-attempt usage sits in the local, git-ignored `evals/runs/<run>/calls.json` (`.gitignore:48`).<br>**New `usage.mjs`:** `export function usageFromCalls(calls, prices)` returns `{ usage: { source: "calls.json", attempts, byRole: { scenario, judge, calibration, isolation }, total, notReported: <count of attempts with no usage> }, listCostUsd: { total, byRole, prices: "evals/price-list.json", priceAccessDate } }`. Each role is `{ input, output, cacheCreation, cacheRead }` in tokens. The attempt's usage field names are unverified: confirm them at build from one attempt's key list.<br>**`evidence-summary.mjs`** gains an optional `--calls <path>`; when given, it adds `usage` and `listCostUsd` to the compact summary. It never removes or renames a key.<br>**`evals/price-list.json`:** `{ "<model id>": { inputPerMTok, outputPerMTok, cacheWritePerMTok, cacheReadPerMTok }, source, accessDate }`. |
| `testCriteria` | **Given** a fixture `calls.json` with 3 attempts (2 with usage, 1 without), **when** `usageFromCalls` runs, **then** the totals sum the two and `notReported` is 1. **Given** `--calls`, **then** every pre-existing key of the output is byte-equal to the run without `--calls`. |
| `edgeCases` | A model id missing from the price list: its cost is `null`, and the id is listed in `listCostUsd.unpriced`, never estimated. `calls.json` absent: `--calls` fails with exit 1, and the summary is not written. |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/evidenceSummary.test.ts test/eval/usage.test.ts && npm run lint` |

### sw18-codex-rules-leave-shared-charter — Codex rules move to a Codex-only location
| Field | Content |
|---|---|
| `id` | sw18-codex-rules-leave-shared-charter |
| `requirements` | REQ-PROVE-003, REQ-PROVE-005 |
| `files` | `src/adapters/codex.ts`, `src/content/charter.ts` (the two shared-byte constants), `src/emit/capabilityMatrix.ts` (required: the always-on inputs and their guard), `docs/capability-matrix.md` (regenerated), `scripts/plugins/clients/codex.mjs` and `test/ci/pluginPackages.codex.test.ts`, `test/adapters/codex.test.ts`, `test/corpus/invariants.test.ts`, `test/emit/capabilityMatrix.test.ts`, `test/emit/crossClientGoldens.test.ts` and its `.snap`, `test/emit/sharedCharterIdentity.test.ts` (new); the session-2 run record (live-check line) |
| `interfaces` | Line numbers read at HEAD `32ceeeec`.<br>**Current:** `downConvertRules(...)` (`codex.ts:985-1045`) produces `rootReplacement`, emitted to `AGENTS.md` with `replacesSharedPath: true` (`:375-386`). The warning `sharedCharterWarning` (`:433`, called at `:383`) reports e.g. 5,191 → 24,951 B.<br>**Live check first**, decided by what loads. (a) Root `AGENTS.override.md` holding charter + appendix: Codex reads the override before `AGENTS.md` (vendor page, as reported in session 1, accessed 2026-09-29); it is unverified whether Cursor or Copilot read it. (b) Top-level `developer_instructions` in `.codex/config.toml`, the key the agent TOMLs already use (`codex.ts:775`). Probe each client in a fixture with the appendix heading: Codex must quote it; Claude, Cursor and Copilot must not. Pick the first candidate that passes.<br>**The plugin packager (census R1, Warning):** the Codex packager's `place` (`scripts/plugins/clients/codex.mjs:74-100`) returns `undefined`, the layout's refusal, for any path it does not map, so a root `AGENTS.override.md` would refuse the whole plugin build; and it drops `.codex/config.toml` as `null` (`:86`), so candidate (b) would never reach a plugin. Whichever candidate passes, `place` gains a deliberate rule for it, and `test/ci/pluginPackages.codex.test.ts` pins that rule.<br>**New:** `rootReplacement` goes to the chosen location as a codex-owned row; `AGENTS.md` stays the core charter; `sharedCharterWarning` is removed; the 32 KiB budget (`CODEX_AGENTS_MD_BUDGET_BYTES`, `:123`) applies to the new file.<br>**The shared-byte pair collapses (census R1, Critical).** Today the shared root `AGENTS.md` is 25,306 bytes with Codex and 5,276 without (`ALWAYS_ON_SHARED_BYTES_WITH_CODEX` and `_WITHOUT_CODEX`, `src/content/charter.ts:290`, `:312`; the spec text at `docs/specs/prove-behavior-and-value.md:94` still reads 24,904 / 5,192). Once `AGENTS.md` is byte-identical with and without Codex, two checks that require WITH > WITHOUT fail as written: `test/corpus/invariants.test.ts:766-774` expects exactly the two distinct root `AGENTS.md` byte figures in the cross-client golden, and `src/emit/capabilityMatrix.ts:520-527` throws when with ≤ without. So, per REQ-PROVE-005 ("the shared bytes are equal with and without Codex"), this unit re-pins the pair to the one measured figure, changes the invariant test to expect one figure (an inline TEST CHANGE reason), turns the matrix guard into a check that the two are equal, and reshapes the page's "Always-on cost by client" text built at `capabilityMatrix.ts:929-979` (the with/without ratio) along with its pins at `test/emit/capabilityMatrix.test.ts:949-1045` and `:1142`. The Codex-only file's bytes count in Codex's own row. |
| `testCriteria` | **Given** tools `[claude, codex]` and `[claude]`, **when** both are emitted, **then** `AGENTS.md` is byte-identical (the new identity test). **Given** the cross-client golden, **then** it records one root `AGENTS.md` byte figure, equal to the constant in `src/content/charter.ts`, and `renderCapabilityMatrix` does not throw. **Given** a plugin build with Codex selected, **then** it completes, and the appendix's placement in the plugin is the one `place` names. **Given** the live check, **then** the record line reads `codex appendix at <location>: codex yes, claude no, cursor no, copilot no`. |
| `edgeCases` | A Codex-only repo: the appendix sits in the Codex-only location too, one code path. No candidate passes the live check: the unit stops with `BLOCKED_DEPENDENCY` and the shared file is unchanged. An existing install: sync reclaims the old appendix bytes from `AGENTS.md` through the managed block. After the move, `replacesSharedPath` may have no producer left (`codex.ts:380` is its only one; the planner branch reads it); knip decides whether that branch goes (census R1, unknown 3). |
| `depends_on` | sw14-client-currency-sweep |
| `verify` | `npx vitest run test/adapters test/emit test/corpus/invariants.test.ts test/ci/pluginPackages.codex.test.ts && node scripts/generate-capability-matrix.mjs && git diff --exit-code docs/capability-matrix.md && npm run build && node dist/cli.js sync && node dist/cli.js check && npx knip` |
| `amended` | 2026-09-30: the contract census (census-researcher-r1, its Critical on sw18 and the packager Warning) — the WITH > WITHOUT checks, the constants now at 25,306 / 5,276, and the plugin packager's refusal of an unmapped root file, read at HEAD `32ceeeec` |

### sw17-touchpoints-as-shared-skills — nine touchpoints once under `.agents/skills/st-<id>/`
| Field | Content |
|---|---|
| `id` | sw17-touchpoints-as-shared-skills |
| `requirements` | REQ-FLOW-026 |
| `files` | `src/emit/skillsProjection.ts`, `src/adapters/codex.ts`, `src/adapters/cursor.ts`, `src/adapters/claude.ts`, `src/adapters/copilot.ts` (cap text only), `src/cli/commands/init/panel.ts` (the Codex invocation line; census R1, Critical), `src/emit/capabilityMatrix.ts` (the measured Codex skills-list figure), `scripts/plugins/clients/cursor.mjs`, `docs/capability-matrix.md` (regenerated), `README.md`, `docs/working-with-stamity.md`, `docs/troubleshooting.md`, `docs/specs/prove-behavior-and-value.md` (`:84-87`, at the spec merge), `docs/plugins.md` / `docs/getting-started.md` wherever they name `.cursor/skills`, `test/cli/commands/initPanel.test.ts`, `test/docsPages.test.ts`, `test/ci/pluginPackages.cursor.test.ts`, `test/emit/capabilityMatrix.test.ts`, adapter tests, goldens and `.snap`s |
| `interfaces` | Line numbers read at HEAD `32ceeeec`.<br>**Current:** `CODEX_COMMANDS_DIR = null` (`codex.ts:95`) and `commandSurfaceWarning` (`:411-418`, pushed at `:374`). `CURSOR_COMMANDS_DIR = ".cursor/skills"` (`cursor.ts:102`), with its builder `buildCursorCommand` at `cursor.ts:785-793` (`disable-model-invocation: true`). `SKILLS_PROJECTION_DIR = ".agents/skills"` (`skillsProjection.ts:105`); the native re-target covers claude only (`NATIVE_SKILL_DIRS`, `:123`).<br>**New:** the core projection emits `.agents/skills/st-<id>/SKILL.md` for the nine command ids when codex or cursor is selected. Front matter carries `disable-model-invocation: true` plus `agents/openai.yaml` with `policy.allow_implicit_invocation: false`. The rows are co-owned by codex and cursor. `CODEX_COMMANDS_DIR = CURSOR_COMMANDS_DIR = ".agents/skills"`. The `.cursor/skills` touchpoint rows are dropped and reclaimed by sync. The claude re-target excludes touchpoint rows, since Claude keeps `.claude/commands/`. The Codex `command-surface` cap is reworded and `commandSurfaceWarning` removed. The Codex listing check `CODEX_SKILLS_LIST_BUDGET_CHARS` 8,000 (`codex.ts:146`) still refuses past the cap (estimate ≈5.6k → ≈6.9k).<br>**Codex invokes skills as `$st-<id>` (census R1, Critical).** With `CODEX_COMMANDS_DIR` non-null, `codexSteps` takes its second branch (`panel.ts:164`) and prints `then type: /st-onboard — installed in .agents/skills/`, a command Codex does not run; `test/cli/commands/initPanel.test.ts:191-203` accepts it (its non-null branch checks only `/st-onboard`). That branch prints `then type: $st-onboard`, and the test's non-null branch asserts `$st-onboard` and no `/st-onboard`. Every text that tells a Codex user how to start a touchpoint says `$st-<id>`.<br>**The consumers the move touches (census R1):** the "Codex has no repository-level command home" prose at `README.md:73`, `docs/working-with-stamity.md:30-31` and `docs/troubleshooting.md:183`, tied to the Codex cap by `test/docsPages.test.ts:1327-1338`; the Cursor plugin packager, which places `.cursor/skills/` rows as class `command` (`scripts/plugins/clients/cursor.mjs:61-62`) and `.agents/skills/` rows as class `skill` (`:64-65`), so after the move the nine land as `skill` and `command` loses its carrier (the pins at `test/ci/pluginPackages.cursor.test.ts:387-419` and `:493-502` move with it); and the measured `codexSkillsListChars: 5_570` with its "17 skills" comment (`src/emit/capabilityMatrix.ts:362-367`), held to the real emission by `test/adapters/codex.test.ts:1911-1917` and `test/emit/capabilityMatrix.test.ts:1012-1029`, re-measured after the move. The Codex, Copilot and Claude packagers place `.agents/skills/` rows by the same prefix (`codex.mjs:77-78`, `copilot.mjs:99-100`, `claude.mjs:97`), so the nine reach their plugins unchanged in rule. |
| `testCriteria` | **Given** tools `[codex]`, **when** emitted, **then** nine `.agents/skills/st-*/SKILL.md` exist and the panel's codex row names `.agents/skills/` and `$st-onboard`, never `/st-onboard`. **Given** `[claude, cursor]`, **then** no `.cursor/skills/st-*` exists, `.claude/skills/` holds no `st-work`, and a prior install's `.cursor/skills/st-*` files are removed by sync. **Given** `test/docsPages.test.ts`, **then** the README and guides no longer say Codex has no command home. **Given** the Cursor plugin build, **then** the nine touchpoints ship under `skills/` and the capability file states where commands went. **Given** the live check, **then** `$st-work` resolves in Codex and `/st-work` in Cursor. |
| `edgeCases` | Packs push the Codex listing past 8,000 characters: emission refuses with the measured total (fail-closed, unchanged). Copilot also reads `.agents/skills`, and it is undocumented whether it honours the hide key: the listing may double beside `.github/prompts`. Record this as a live-check row, not a blocker. A skill id colliding with a command id: none today (skills are st-browser-evidence … st-verify). Cursor's live check does not list the shared copy: keep `.cursor/skills` and return `BLOCKED_DEPENDENCY`. |
| `depends_on` | sw18-codex-rules-leave-shared-charter, sw10-first-run-output |
| `verify` | `npx vitest run test/emit test/adapters test/cli test/docsPages.test.ts test/ci/pluginPackages.cursor.test.ts && node scripts/generate-capability-matrix.mjs && npm run build && node dist/cli.js sync && node dist/cli.js check` |
| `amended` | 2026-09-30: the contract census (census-researcher-r1, its Critical on sw17 and the consumer rows) — Codex's `$st-<id>` invocation on the panel, the docs, the Cursor packager's `command` class and the measured skills-list figure, read at HEAD `32ceeeec` |


## Execution order

1. **`sw14-copilot-charter-live-check`** runs first in session 2, before file 2's lanes; its result decides whether
   the Copilot fix joins file 2's core.
2. **`sw20-email-rule`** next, as a closer, beside file 2's lanes (its files are disjoint).
3. After file 2's lanes on the same files:
   - **`st-work.md`** (file 2's lane W continues): `sw08-fresh-re-reviewer` → `sw13-runs-retire-fixed-inbox-rows` →
     `sw29-records-via-file-tools`, each measuring the re-attach budget first.
   - **`ci.yml`:** `sw06-records-only-ci-lane` → `sw12-flake-unit`.
   - **Adapters:** `sw14-client-currency-sweep` → `sw10-first-run-output` → `sw18-codex-rules-leave-shared-charter` →
     `sw17-touchpoints-as-shared-skills`.
   - **Ledger code:** `sw13-runs-retire-fixed-inbox-rows` → `sw21-ledger-cli-papercuts`.
   - **`src/hooks/scripts.ts`:** `sw11-learning-index-honest` after file 2's lane E.
   - **Alone:** `sw31-ask-sized-to-question`, `sw19-eval-cost-in-summary`.
4. **The eval cases** (`ask-narrow-symbol`, `re-review-closures-fresh-reviewer`) go through file 2's lane V after the
   corpus units land.
5. **The gates**, as in file 2.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| SW-08's and SW-29's `st-work.md` text lands above the re-attach cut after file 2 spent the budget | Warning | Each unit measures first and trims like `work-make-room`; `REATTACH_BUDGET_CHARS` never rises |
| A records-only lane lets a real code change skip the full CI | Warning | The detector prints `records_only=true` only when every changed path matches the records list; learnings changes run full CI; the aggregator asserts which jobs ran |
| A single timeout re-run hides a real race | Warning | Only a timeout-only failure re-runs, once; a green re-run is annotated as flaky with an inbox row, never read as clean |
| Moving Codex's rules out of `AGENTS.md` loses them for Codex | Warning | The live check picks the location Codex loads and the others do not; no candidate passing stops the unit with the shared file unchanged |
| Shared skills double on Copilot | Minor | Declared per client; the live check records the hide key |
| The email rule flags fixture addresses | Minor | The rule narrows to real-looking domains; a census runs in report mode first and respells or path-lists each hit with a reason |
| Additive public shapes (`ledger close --retired`, the `already-filed` suffix and the `alreadyFiled` key on `ledger append --json` rows, the eval summary's `usage` and `listCostUsd` keys) | Minor | Additive only; no existing field, flag or key changes |

## Open questions

None. The open readings are settled above under "Settled by this plan". The one the run's contract census opened
(2026-09-30) — which existing id `already-filed` prints when several rows share one evidence string — is settled by
the orchestrator's sign-off: one-to-one in row order, as the `sw21-ledger-cli-papercuts` cell states.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- The ledger CLI refuses a whole findings block for one bad line, and runs have re-filed rows by hand; this file's
  `sw21-ledger-cli-papercuts` takes the lean part, and a salvage mode waits for the next hand re-filing.
- Run records written by `/st-rework` and `/st-pr-resolve` stay out of `sw29-records-via-file-tools`'s scope, to spare
  the census cost of their persistence cases.

Added by the run (2026-09-30) from `sw14-client-currency-sweep`'s sign-offs, not built; each becomes an inbox row at
session 2's close:
- The Codex effort scale on the vendor's config reference (accessed 2026-09-30) reads "`low`, `medium`, `high`,
  `xhigh`, `max`, or `ultra`" and names no `minimal`, while `CLIENT_MODEL_PROJECTION.codex.effortScale` holds
  `minimal` through `xhigh` (`src/roster/modelLadder.ts:418-428`), read by `nearestExpressibleEffort` (`:521-532`) and
  `stamity config`, and rendered in the Codex cap text (`src/adapters/codex.ts:234-240`). A behaviour contract,
  outside that unit's cell. The same file's Copilot row still says its configuration publishes no effort key
  (`:388-392`).
- codex-cli 0.159.2 (the npm `latest`, 2026-09-29) is unmeasured: the Codex "measured on" claims name 0.155.1, the
  version this machine runs, and the later hook change in 0.158.0 ("Use native POSIX spawning for command hooks",
  #47610) is untested here.

## Drop list

Each item stays out until its trigger fires. "Conflicts" means the proof would need a before/after or with/without run,
which the maintainer's decision against replay-like tests rules out for this package. Dropped items are not deferred
work, so they are not inbox rows.

| # | Idea | Reason | Revisit when |
|---|---|---|---|
| D-01 | Charter on/off instrument | Conflicts | The decision is lifted, or a study settles it |
| D-02 | Eval increment before the loop edits | Conflicts | Not while the decision stands |
| D-03 | Judge early stop, batching, caching | Conflicts | Eval spend passes a set budget |
| D-04 | Minors as one list, never ledgered | **Breaking** (2.0.0) | A 2.0.0 is planned for another reason |
| D-05 | Hard context ceiling | Sessions already end by choice | A session still rots after SW-07 |
| D-06 | Shell digest subcommands | M; SW-07 and SW-26 cover it | Shell output passes 30% of the payload |
| D-07 | Capacity-aware fan-out | Usage window not visible; 0 limit hits on the day | The client exposes the window |
| D-08 | Refute pass before the fixer | Precision already 1.00 / 0.96 | Declined Warnings pass 10% |
| D-09 | Cross-lens duplicate rule | 14 of 1,019 findings | Duplicates pass 5% |
| D-10 | Performance lens on budget surfaces only | 0.2% of spend | 50 rows, or 20% declined |
| D-11 | Serial Build by default | No seam conflict on the day | A user run hits a seam conflict |
| D-12 | Lane tool guards | M; learnings cover it | The next lane accident |
| D-13 | Two-tier researcher returns | Unmeasured | Returns pass 10% of context |
| D-14 | Read only the overlapping inbox rows | Pays only at scale | Inbox over 50 KB after SW-13 |
| D-15 | Learnings chosen by `paths:` | Pays only past the cap | The 21st learning |
| D-16 | `learn capture --replace` | 2 corrections a month | The next correction |
| D-17 | `omitClaudeMd` on read-only roles | Floors would need restating | SW-18 is dropped |
| D-18 | Guard in frontmatter hooks | <1.1% of wall time | Hooks pass 3% of wall time |
| D-19 | SessionStart matcher and banner cap | Small; printed once | Over 8 KB, or printed twice |
| D-20 | `isolation`, `cacheTtl`, `maxTurns` | Unmeasured | A user asks |
| D-21 | Hide uninvoked descriptions | ≈190 tokens | A listing overflows |
| D-22 | The plugin's figure as the E1 of record | Nice to have | A regression is suspected |
| D-23 | Cold-resume hint | Nice to have | A user asks |
| D-24 | Cost-preview bands | One pass so far | 3 runs per tier |
| D-25 | A commit per unit | A5 lost no work | A resume loses a unit's work |
| D-26 | Records committed at phase ends | SW-06 takes the cost | A user reports noise |
| D-27 | `stamity close --release` | L | More than 3 fixes after SW-23 |
| D-28 | Scripted fast-forward merge | 5 events a month | An ungated sha lands |
| D-29 | Measurement tables at close | Nice to have | The page backs a release decision |
| D-30 | Incremental re-attestation (ME) | 1.9% stale | More than 5% stale |
| D-31 | Lane-brief lint | None since 09-16 | It happens again |
| D-32 | Lighter effort for Q&A | An operator setting | A user asks |
| D-33 | Stalls counted in turns | 0 on the day | Over 10 h a month |
| D-34 | Trim rules at setup | Rules are path-scoped | A user asks |
| D-35 | Inbox rows 194 and 195 | Retired into this report | After 1.11.0 |
| D-36 | (moved to SW-14) | — | — |
| D-37 | SW-16's key store | Its lean line is SW-15 | More than 3 full runs on one tree in a day |
| D-38 | SW-02's residue: both hook sets on Copilot, and SKP's telemetry-guard matcher (spawn and write tools only, on the other clients; CLI:176) | 3.6% of C3b's wall time; hook cost is small everywhere | Hooks pass 5% of wall time on any client, or Copilot changes how it reads Claude's settings |
| D-39 | `check` runs the gates | **Disagreement, bounded:** running tests makes a fast setup check slow and side-effecting; SKP2 accepts that given SW-04's wording criterion. An opt-in `check --gates` stays here (Q27). | A setup gate break the probe misses |
| D-40 | SW-07's handoff part | No adopter until the private store is decided | That question is decided |
| D-41 | SW-08's fresh fixer | Digest risk; the gain's sign is unknown | Gap 3's case exists and a resumed fixer re-argues |
| D-42 | SW-13(c): the inbox rendered from the ledger | M | Over 250 rows, or a hand row breaks the test |
| D-43 | SW-21's `--salvage` | No public instance | The next hand re-filing |
| D-44 | SW-20's per-clone pre-commit hook | Per-clone machinery | A respell lands after the gate line exists |
| D-45 | SW-23's close writer | The script covers the main class | Two closes in a row need a fix |
| D-46 | (moved to SW-31; SKP2) | — | — |
| D-47 | Light-tier trims: small spec merges inline (A5: 981k tokens); red checks without a worktree (A13) | One run each. An inline merge is the orchestrator editing a spec, which invariant 7 forbids; A13's worktree was a test-runner's, so its concern is trust (E6): a worktree created and force-removed in a user's repo (SKP2) | A second worktree in a user's repo |
| D-48 | `/st-plan` length cap (198–224-line plans) | One pass | A single-unit plan passes 300 lines |
| D-49 | Turns return early; Codex's 11 `wait` polls | Client behaviour | A client offers a blocking wait |
| D-50 | Slips: A2's contradiction, D3a's count, a screening false positive in C3b | One each | A second instance |
| D-51 | `/st-rework` defaults (A10) | Worked as designed | A user reports an unwanted default deferral |
| D-52 | P-1: `/st-work` recommends `/st-quick` | Pays only after SW-25 | A `/st-work` run on a change the lane now takes |
| D-53 | P-2: `/st-work` phase files | A6 needed no late phase | A compacted run loses a phase |
| D-54 | P-3: `sync` prints what changed | Adequate on the day | A user asks |
| D-55 | P-4: Copilot and `paths:` in `.claude/rules` | Not checked | A scoped rule loads always-on |
| D-56 | P-5: unattended recipes per client | Folded into SW-29 and SW-14 | — |
| D-57 | Driver fixes | Not reused in Package 17; if reused for SW-14's or SW-18's live check, first fix the redactor (33 broken lines) and the Codex hook heuristic (`adapters/codex.mjs:128`; SKP2) | The driver is reused |
| D-58 | The CLI's own remedy text in the pinned form (about 60 refusal messages that name a bare `stamity <verb>`) | Lean scope: the flows and hooks carry the calls a user follows; a remedy line is read by a person who can type the npx form | A user reports a remedy line that did not run |
