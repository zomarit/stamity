---
id: last-before-2-0-01
intent: feature
stamp: 4f945a3a9c758e0fd4c719a1de569ccf2272158f 2026-11-09
reads: [content/agents/stamity-fixer.md, content/agents/stamity-implementer.md, content/agents/stamity-researcher.md, content/agents/stamity-reviewer.md, content/agents/stamity-test-runner.md, content/charter/stamity-charter.md, content/commands/st-board.md, content/commands/st-debug.md, content/commands/st-pr-resolve.md, content/commands/st-quick.md, content/commands/st-work.md, content/rules/stamity-ai-evals.md, content/rules/stamity-api-versioning.md, content/rules/stamity-question-protocol.md, content/rules/stamity-security-patterns.md, content/skills/st-unattended/references/cloud.md, content/skills/st-verify/references/maintainability.md, content/skills/st-verify/references/scalability.md, docs/capability-matrix.md, docs/cloud.md, docs/doctrine.md, docs/factory.md, src/change/classify.ts, src/cli/commands/gate.ts, src/cli/commands/run.ts, src/cli/commands/runContract.ts, src/cli/commands/runLand.ts, src/cli/docs/configReference.ts, src/content/charter.ts, src/emit/substitution.ts, src/hooks/model.ts, src/hooks/personOnly.ts, src/hooks/portableRunner.ts, src/hooks/scripts.ts, src/manifest/manifest.ts, src/roster/agentPolicies.ts, src/runs/landEvidence.ts, src/runs/morning.ts, src/runs/overview.ts, src/runs/preflight.ts, src/runs/pullRequest.ts, src/types/core.ts, test/content/invariantsVersion.test.ts, test/corpus/agents/shellDiscipline.test.ts, test/corpus/agents/spine.test.ts, test/corpus/commands/lightTrio.test.ts, test/corpus/commands/work.test.ts, test/corpus/rules/protocol.test.ts, test/docsPages.test.ts, test/hooks/unattendedAskGate.test.ts, test/roster/agentPolicies.test.ts]
---

# 1.19.0, the last release before 2.0 — file 1 of 3: the switch, the cloud route, fair proof, calmer runs

This file is self-contained. Files 2 (`docs/plans/024-last-before-2-0-02.md`) and 3 (`-03.md`, the stretch) follow it on
the same branch and the same pull request. Every `file:line` below resolves at `4f945a3a` (`v1.18.0`).

## Context

1.19.0 is the tool 2.0 gets built with and what users run meanwhile: calmer, clearer, more trustworthy. This file
builds, first, a "nobody watching" switch that turns every ask into a refusal held for the morning, then the cloud
route's follow-ups from 1.18.0's real runs, tests written from the plan before the build, and the playbook causes of
over-caution and file-heavy closes. Out of scope: everything the 2.0 list holds (goal-based pull requests, slimming
this repository's wording checks, `run land` on a normal pull request, one-account repositories),
packs (frozen), and `clone-land` (held until a real run needs it).

## Decisions

- **The switch is not unattended mode.** Unattended mode also changes push rules, the held patch and the pre-flight's
  admin refusal (`src/hooks/scripts.ts:5489-5520`, `src/runs/preflight.ts:496-507`). The switch changes one thing:
  where a hook would answer "ask", it refuses, and the act is logged for the morning. It reads an environment
  variable `STAMITY_NOBODY_WATCHING` (set at launch) or a git-ignored marker `.stamity/away.json` (set by
  `stamity away on`). Both directions are safe: off turns refusals back into asks, which still wait for a person.
- **The question gate fails closed under the switch;** without it, it keeps failing open as today.
- **No environment tiers.** "Cannot be undone, or reaches people outside the repository" covers releases without a new
  config surface; `maturityTier` already scales the plan (`content/commands/st-plan.md:258`).
- **Fair proof is a mode, not a role:** a tests-only dispatch of the implementer, plus `stamity gate held`, a stateless
  digest check. A new role costs about 15 count pins and gains nothing the fresh spawn does not already give.
- **The reviewer reads the criteria before the diff;** no change of model class per round.
- **Cursor:** no code loosens `direct-push`; the pages say plainly why it refuses.
- **The test-runner gets one report path,** like the verdict roles, scoped to its own pattern.
- **The run marker is the last marker with only a short, plain tail after it;** a marker followed by prose reads as no
  run.
- **This build runs on 1.18's flow.** The new proof flow binds after release; this repository's `content/**` stays
  `product` (`.stamity/change-classes.json:21`), and slimming its wording checks is 2.0's.

## Spec delta

Stated against `docs/specs/everyday-flows.md`. New ids start at 166, after the last flow id in use; none collides.

### REQ-FLOW-166 — With nobody watching, every ask is refused and held for the morning (ADDED)

- Given `STAMITY_NOBODY_WATCHING` set (not `""`, `0` or `false`) or `.stamity/away.json` present, when a guard would
  answer ask, then it refuses with the act's sentence plus "nobody is watching", and appends one line to
  `.stamity/away-held.jsonl` naming the rule, the act and the time, never the command text.
- Given the switch, when the question tool is called, then it is refused, and a fault while reading refuses.
- Given the switch, then every act that runs unasked today still runs, and every refusal stays a refusal.
- Given `stamity away on|off|status`, then it writes, removes or reports the marker; `run overview` lists the held lines.

### REQ-FLOW-167 — A test-runner's result reaches the run when its hand-back is empty (ADDED)

- Given a test-runner brief naming a report path, then every verdict writes its rows there, its first line (`spawn: <token>`) echoing the
  brief's spawn token; given an empty hand-back, the orchestrator reads that report, and with none each gate reads
  `unknown` and the failure ladder runs.

### REQ-FLOW-168 — The run marker is found before a client's footer (ADDED)

- Given a pull-request body whose last run marker is followed by at most three short plain lines, then every reader
  finds the run; given prose, a heading, a comment or a second marker after it, then it reads as no run.

### REQ-FLOW-094 — The morning list (MODIFIED)

A list may carry a short summary between its title and its first section (at most 10 lines, 1,000 characters); the
pull-request body prints it after the title. An older list without one still parses.

### REQ-FLOW-169 — A 403 on the permission read falls back to the acting account's own right (ADDED)

- Given an HTTP 403 on the permission read in `/st-pr-resolve` or `/st-board`, then the right is read from the
  repository's `permissions` only for the account `gh` names; any other author stays `unknown`.
- Given a `run contract` pass that came from that fallback, then it prints a `rights:` line and JSON `rightsFallback`.

### REQ-FLOW-170 — The cloud pages state what the real runs showed (ADDED)

- The capability matrix names the proxy's refused permission reads; the factory and cloud pages say why Cursor's cloud
  refuses at `direct-push`, how a GitHub webhook signs (never sends) its secret, and what Claude's cloud provides.

### REQ-FLOW-171 — Tests are written from the criteria before the build, and held (ADDED)

- Given a unit whose files classify `product`, `public-contract` or `security-sensitive`, when it builds, then a
  tests-only dispatch writes its tests from the criteria and interfaces alone, the run records `held: <digest>`, and
  every Prove pass runs `stamity gate held --expect <digest>`; a mismatch is a red gate.
- Given a builder that judges a held test wrong, then it returns `BLOCKED_DEPENDENCY`, and a fresh tests-only spawn
  decides; neither builder nor fixer edits a held test.

### REQ-FLOW-172 — No new test for text, docs or config (ADDED)

- Given a unit classed `docs`, `config` or `records`, then it adds no test and its result says `no new test: <class>`.

### REQ-FLOW-065 — The small-change lane refuses the security surface (MODIFIED, amended 2026-11-09, ledger review/27)

The amended bullet no longer says a small security-sensitive refusal states that the row has no size floor; the
security-sensitive row still has no size floor, and the general multi-part line (REQ-FLOW-173) carries the rest.

### REQ-FLOW-128 — The irreversible trigger (MODIFIED)

Trigger 3 reads: an act that cannot be undone, or that reaches people outside the repository (a release users
receive, a message sent outside it); "a deploy" no longer stands alone.

### REQ-FLOW-173 — Caution matches the real risk (ADDED)

- The charter says, beside invariant 1, that where no floor applies caution matches the real risk and a step that does
  not apply is skipped in one line (invariants 1.4.0). A rule with several parts holds when every part that applies
  holds. Thresholds come from the repository's own norms; a debug run reproduces first; nothing hides a gate's exit
  code; a commit follows the repository's style; the production-only allowlist gate fires only where the code has
  such a capability.

### REQ-FLOW-174 — The close speaks in chat (ADDED)

- Given an attended close, then the final message is a plain summary (what changed, what to check, `Not done:`, one
  gates line, the pull request), built from `run overview`; `morning.md` goes to the record and the
  pull request; the proof block goes to the run record only, the body staying as `run checkpoint` wrote it (amended 2026-11-09, S38; REQ-FLOW-143). `communicationStyle` reaches every generated always-on file.

### REQ-FLOW-175 — The close walk lists every leftover with a plain reason (ADDED)

- Given unfixed review-tool comments on the run's pull request, then they join the close walk's leftovers, each with
  fix now, schedule (with a place) or drop, and a one-line plain reason.

## Units

Rules for every unit in files 1 to 3:

- **Whole-tree checks bind over every `verify`:** also `test/ci/testInputsGuard.test.ts`, `test/architecture`, `npm run
  lint`, `npm run typecheck`, `npm run knip`; a unit touching `src/hooks/` or `src/adapters/` also runs `test/cloud`; a
  unit adding path strings to `src/` also runs `test/roster`; a `content/` edit also runs `test/evals` and `test/corpus`.
- **Lanes:** a worktree under `.stamity-worktrees/stamity/<unit>` with `node_modules` linked to the main checkout:
  never `npm ci` or `npm install` there. `npm run build` once before a test that shells out to `dist/cli.js`. Never a
  full suite in a lane. Stage by explicit path; never `git add -A`, never `git stash`.
- **Content edits rewrite in place where they can,** keeping line counts so eval `source:` ranges hold; a unit whose
  edit moves lines re-points the ranges it moved (`test/evals/locators.test.ts`), changing a Brief only where a quoted
  sentence changed and never an Expected block.
- **Derived files:** a lane regenerates what its verify reads: `npx vitest run test/emit/crossClientGoldens.test.ts
  test/corpus/emissionGoldens.test.ts --update` (files first, the flag last), `node scripts/generate-docs.mjs`,
  `node scripts/generate-capability-matrix.mjs`. On a snapshot conflict the integration regenerates. The dogfood sync
  (`npm run build && node dist/cli.js sync`) is the integration's.
- A test outside a unit's files that pins exactly the old behaviour may be re-pinned, with a `TEST CHANGE, justified:`
  line. A content unit whose text moves Codex's always-on pins (`ALWAYS_ON_BUDGET_LINES.codex`,
  `ALWAYS_ON_CODEX_OVERRIDE_BYTES` in `src/content/charter.ts`) updates those two values in its lane with a dated reason
  and regenerates `docs/capability-matrix.md`; the integration recomputes them on a conflict (amended 2026-11-09, S13). A new `src/` module names its `PLAN_MAP` row (`test/architecture/boundaries.test.ts:260`); the integration adds it.
- **One writer per file — the chains:** `src/hooks/scripts.ts`: n-switch-guard → (file 2) d-npm-ci-guard → l-banner →
  p-private-repos → s-skill-guard. `content/commands/st-work.md`: c-testrunner-report → k-work-close → t-work-proof →
  (file 2) s-skills-content → (file 3) x-recipe → x-metrics-content. `content/rules/stamity-question-protocol.md`:
  k-protocol only. `content/charter/stamity-charter.md`: k-charter only. `content/agents/stamity-test-runner.md`:
  c-testrunner-report → k-shell-rule. `stamity-implementer.md` and `stamity-fixer.md`: k-shell-rule → t-tests-only →
  t-fixer-reviewer. `stamity-reviewer.md`: k-security-gate → t-fixer-reviewer. `test/docsPages.test.ts`:
  c-marker-finder → c-cloud-docs → (file 2) z-docs. `test/corpus/commands/lightTrio.test.ts`: k-debug-verify →
  k-multipart-quick. `docs/capability-matrix.md`: c-matrix-row → k-charter. `src/cli.ts`: n-away-verb → (file 2)
  d-gc → s-skill-verb → (file 3) x-ready-verb.
- **Threat rows:** every unit carries one, read by hand against `.stamity/change-classes.json`.
- **Run order:** n-switch-guard first. In parallel from the start: c-marker-finder, c-morning-lead,
  c-testrunner-report, c-contract-rights, c-permission-403, c-matrix-row, t-gate-held, k-protocol, k-security-gate,
  k-debug-verify. Then the chains above as each predecessor integrates.

### n-switch-guard — every ask becomes a refusal held for the morning

- id: n-switch-guard
- requirements: REQ-FLOW-166
- files: `src/hooks/scripts.ts`, `src/hooks/portableRunner.ts`, `.gitignore`, `test/hooks/nobodyWatching.test.ts` (new), `test/hooks/unattendedAskGate.test.ts`, `test/hooks/scriptBudget.test.ts`
- interfaces: in the person-only guard's `decide()` (`scripts.ts:5583`), read the switch before `unattendedBy`
  (`:5489-5520`): on when `STAMITY_NOBODY_WATCHING` is set and not `""`/`0`/`false` (as `readsUnattended`,
  `src/runs/resumeCard.ts:271-274`), or when `<root>/.stamity/away.json` exists. Where `decide()` would return
  `attendedAsk(...)` (`:5635`, `:5579`), return `{ ask: false, reason: unattendedSentence(act, rule) + " Nobody is
  watching, so it waits for the morning list." }` and append `{"at":"<ISO>","rule":"<id>","act":"<verdict.act>",
  "client":"<tool>"}` to `.stamity/away-held.jsonl` with the canary's no-follow write (`:5541-5554`); a failed append
  never changes the decision. In `buildUnattendedAskGate`'s `decide()` (`:6016-6021`) check the switch first and refuse,
  and under the switch a read fault refuses (`:6023-6034` stay fail-open without it). `portableRunner.ts:517-519`: under
  the switch a hook's `ask` maps to `deny` for Copilot. Update the "Reads outside repo state" header lines
  (`:4630-4631`, `:5931-5932`) and the byte budgets (`:254`, `:302-308`). `.gitignore`: `/.stamity/away.json`,
  `/.stamity/away-held.jsonl`.
- testCriteria: with the variable set, each ask-class act in the guard's tests returns a refusal naming the act and the
  held file gains one line without the command text; with the marker file, the same; every act that runs unasked
  without the switch still runs, and every refusal stays one; the question gate refuses under the switch and refuses on
  a malformed record; with neither, every existing case passes unchanged.
- edgeCases: `STAMITY_NOBODY_WATCHING=0` is off; a marker that is a symlink is read as present (it only tightens); an
  unwritable `.stamity/` still refuses; a sub-agent's ask (already refused) is unchanged.
- depends_on: none
- verify: `npx vitest run test/hooks/nobodyWatching.test.ts test/hooks/unattendedAskGate.test.ts test/hooks/personOnlyGuard.test.ts test/hooks/portableRunner.test.ts test/hooks/scriptBudget.test.ts test/cloud test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is the guard every shell call passes. It trusts the launch environment and a local file. Abuse:
  the switch loosening an act. Stopped by the switch only replacing an `attendedAsk` return; a review checks no allow
  path moved, and the security lens reviews the unit.

### n-away-verb — `stamity away` and the held list in the overview

- id: n-away-verb
- requirements: REQ-FLOW-166
- files: `src/cli/commands/away.ts` (new), `src/cli.ts`, `src/cli/commands/run.ts` (overview), `src/runs/overview.ts`, `test/cli/commands/away.test.ts` (new), `test/runs/overview.test.ts`, `docs/cli-reference.md` (regenerated), `test/cli/docs/cliReference.test.ts`, `src/cli/commands/clean.ts` and its test (amended 2026-11-09, ledger fix/1: `clean` removes the two away files), `test/cli/surface.e2e.test.ts`, `README.md` and `docs/getting-started.md` verb counts (S31: the advertised list and count for `gc`, `skill` and `away` together)
- interfaces: `stamity away <on|off|status> [--json]`, `mutating: true` for on/off. `on` writes
  `.stamity/away.json` `{"since":"<ISO>","by":"stamity away"}`; `off` removes it; `status` prints `away: on|off`,
  the source (`env`, `marker`, both) and the count of `.stamity/away-held.jsonl` lines. Register after `cleanCommand`
  in `COMMANDS` (`src/cli.ts:66-83`), following `src/cli/commands/worktree.ts`'s shape. `overviewFrom`
  (`src/runs/overview.ts`) gains `held: {rule, act, at}[]` read from the held file, printed under "Only you can do" as
  `held while nobody watched: <act> (<rule>, <at>)`.
- testCriteria: on then status reads on with source `marker`; off removes it; status with the variable set reads
  `env`; the overview lists three held lines from a fixture; a missing or malformed held file lists none and does not
  fail; the CLI reference counts 17 commands.
- edgeCases: `off` with the variable set says the variable still holds it on; `on` twice keeps the first `since`.
- depends_on: n-switch-guard
- verify: `npx vitest run test/cli/commands/away.test.ts test/runs/overview.test.ts test/cli/docs/cliReference.test.ts test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a local marker. It trusts the person's shell. Abuse: an agent turning the switch off. Harmless
  by design: off restores asks that still wait for a person.

### c-marker-finder — the marker before a client's footer (prove/3)

- id: c-marker-finder
- requirements: REQ-FLOW-168
- files: `src/runs/pullRequest.ts`, `src/cli/commands/runLand.ts`, `src/runs/landEvidence.ts`, `test/runs/pullRequest.test.ts`, `test/cli/commands/runLand.test.ts`, `test/runs/landEvidence.test.ts`, `test/docsPages.test.ts`
- interfaces: add to `pullRequest.ts` `bodyRun(body: string): { run: string; markerAt: number; tail: string } | null`:
  the last `<!-- stamity:run <id> -->` whose id passes `isRunId`, with a tail of at most 3 non-blank lines and 300
  characters holding no `<!--`, no `stamity:`, no line starting `#` or a fence, and no status-line opening
  (`EVIDENCE_OPENING`, `WAITS_OPENING`). Add `endsWithRunMarker(body, marker)`. Use them at all six readers:
  `BODY_MARKER` (`runLand.ts:270`, `:293`), `recordedNumber` (`:450-452`), `ownPr` (`landEvidence.ts:544`),
  `withStatusLine` (`:770`, which now writes before + line + marker and drops the tail), `ensureDraftPr.update`
  (`pullRequest.ts:254`). The writer (`:83-85`, `:108-111`) is unchanged.
- testCriteria: a body ending in the marker plus "Generated by …" finds the run; a marker followed by a paragraph, a
  heading, a comment or a second marker reads as none; of two markers the last counts; the job on a footer body passes
  `not-a-run`; `withStatusLine` over a footer body leaves one marker, last; the draft refresh updates the body.
- edgeCases: CRLF line ends; a footer of exactly 3 lines passes and 4 fails; a marker with an invalid id is skipped.
- depends_on: none
- verify: `npx vitest run test/runs/pullRequest.test.ts test/cli/commands/runLand.test.ts test/runs/landEvidence.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a pull-request body anyone with write can edit. It trusts the run's own marker. Abuse: prose
  after a planted marker. Stopped by the tail's shape and by the land's author, head and branch checks
  (`landEvidence.ts:544-551`), unchanged.

### c-morning-lead — a summary before the first section (prove/2)

- id: c-morning-lead
- requirements: REQ-FLOW-094
- files: `src/runs/morning.ts`, `test/runs/morning.test.ts`
- interfaces: `parseMorning` (`morning.ts:123`): lines before the first section and outside a fence become `lead`
  (`:182-186` stop refusing them); add `readonly lead?: string` to the ok result (`:82-91`); refuse a lead over 10
  non-blank lines or 1,000 characters, naming both limits. `prBodyFrom`/`fitBody` print the lead after the title
  through `bodyText`, counted in the fixed budget (`:481`). The skill sentence is k-unattended-text's (file 2).
- testCriteria: a list with a one-line summary parses and its body carries the line after the title; a lead past the
  cap is refused naming the limit; a list with no lead parses as before; `overview` and `learn` tests pass unchanged.
- edgeCases: a lead that opens a `stamity-morning` fence is still refused (`:160`); blank lines alone are no lead.
- depends_on: none
- verify: `npx vitest run test/runs/morning.test.ts test/runs/overview.test.ts test/cli/commands/learn.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a list a run writes into a public body. It trusts `screenOutbound` on the whole body. Abuse: a
  lead carrying a secret. Stopped by the same outbound screen, unchanged.

### c-testrunner-report — the test-runner's result through a report (prove/1)

- id: c-testrunner-report
- requirements: REQ-FLOW-167
- files: `src/roster/agentPolicies.ts`, `content/agents/stamity-test-runner.md`, `content/commands/st-work.md`, `test/roster/agentPolicies.test.ts`, `test/corpus/agents/executionReturns.test.ts`, `test/corpus/agents/quality.test.ts`, `test/hooks/scripts.test.ts`
- interfaces: widen `verdictReportWritePaths`'s role type (`agentPolicies.ts:135-139`) to `"test-runner"`; the
  test-runner row (`:220-225`) keeps `allow: ["read","execute"]` and gains `writePaths:
  verdictReportWritePaths("test-runner")` (`.stamity/runs/*/reports/*-test-runner-r*.md`); update the comments at `:98`
  and `:122-133`. Rewrite `stamity-test-runner.md:139-146` in place, same line count: with a report path named, every
  verdict writes its rows and excerpts there through `Write`, its first line `spawn: <the brief's spawn token>` (amended 2026-11-09, S20: a `token:` line trips the deny-scan); green
  returns the digest, red returns in full. Rewrite `st-work.md:175-177` in place: an empty or unreadable test-runner
  return is read from its report when its first line carries this spawn's token; with none, each gate reads `unknown`
  and the failure ladder runs.
- testCriteria: the roster test's carriers equal the verdict roles plus the test-runner, whose pattern reaches no other
  role's reports; the guard admits the test-runner's `Write` to its own pattern and refuses `*-reviewer-r1.md` as
  `WRITE_PATH_DENIED`; the corpus pins read the new sentences.
- edgeCases: a report without the token is never read as this spawn's; `allow` stays without `edit`.
- depends_on: none
- verify: `npx vitest run test/roster/agentPolicies.test.ts test/corpus/agents test/hooks/scripts.test.ts test/corpus test/evals test/cloud test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a role's tool grant. It trusts the policy file. Abuse: the test-runner writing another role's
  verdict. Stopped by the path pattern's suffix rule and the guard's `WRITE_PATH_DENIED`; the security lens reviews it.

### c-contract-rights — `run contract` says when the 403 fallback passed (build/28)

- id: c-contract-rights
- requirements: REQ-FLOW-169
- files: `src/cli/commands/runContract.ts`, `test/cli/commands/runContract.test.ts`
- interfaces: `rightGap` (`runContract.ts:96-102`) returns `{ gap: string | null; note: string | null }`;
  `proofGaps` collects notes; `finish` (`:206-212`) prints one `rights: <who> <login> has <word> on <repo>, the
  account's own rights, read from the repository because the permission read answered HTTP 403` per note; JSON gains
  `rightsFallback: string[]`, present only when not empty, as `stripped` is.
- testCriteria: the three passing cases (`runContract.test.ts:766-779`) print the line and carry the field; a 200
  permission read carries neither; the refusal text at `:783` is unchanged.
- edgeCases: two fallback notes print two lines in order.
- depends_on: none
- verify: `npx vitest run test/cli/commands/runContract.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is who a contract treats as allowed. It trusts `personRight`. Abuse: none new; this only reports.

### c-permission-403 — the 403 fallback in `/st-pr-resolve` and `/st-board` (build/25, build/26)

- id: c-permission-403
- requirements: REQ-FLOW-169
- files: `content/commands/st-pr-resolve.md`, `content/commands/st-board.md`, `test/corpus/commands/feedbackPair.test.ts`, `test/corpus/commands/board.test.ts`
- interfaces: rewrap in place, keeping each passage's line count. `st-pr-resolve.md:154-157`: on an HTTP 403 the
  author's right is read only when `gh api user --jq .login` names that author (ignoring case), from `gh api
  repos/{owner}/{repo} --jq .permissions` (admin → `admin`, push → `write`, else `read`); any other author stays
  `unknown`. `st-board.md:225`: on a 403 the acting account's write check reads `permissions.push`; only `push` false
  fails it. `st-board.md:314-318`: the same fallback, the acting account alone.
- testCriteria: the pins at `feedbackPair.test.ts:1748` and `board.test.ts:448,614,798,830,1805` read the new
  sentences; `test/evals/locators.test.ts` passes with no range moved.
- edgeCases: a comment author who is not `gh`'s login stays `unknown` on a 403; a 404 is not the fallback.
- depends_on: none
- verify: `npx vitest run test/corpus/commands/feedbackPair.test.ts test/corpus/commands/board.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is who may drive a write. It trusts `gh`'s own login. Abuse: the fallback covering another
  author. Stopped by the login match; the security lens reviews it.

### c-matrix-row — the proxy's refused reads in the capability matrix (build/27)

- id: c-matrix-row
- requirements: REQ-FLOW-170
- files: `src/hooks/model.ts`, `docs/capability-matrix.md` (regenerated), `test/emit/capabilityMatrix.test.ts`
- interfaces: a `CLIENT_CLOUD_FACTS` row after `model.ts:224-233`: `tool: "claude"`, `subject: "Permission reads"`,
  `status: "not documented"`, the cloud-environments page cited, accessed 2026-11-09, `run: { record: <the real-run
  record's public path>, date: "2026-11-06" }`, fact: "In a real session on 2026-11-06 the GitHub proxy answered 403 on
  `collaborators/<login>/permission`, `collaborators` and `user/memberships/orgs/<org>`, and 404 on
  `branches/<default>/protection`; the page says nothing on these reads, so stamity reads the account's own rights
  instead." No `sessionStart`. Regenerate with `node scripts/generate-capability-matrix.mjs`.
- testCriteria: `capabilityMatrix.test.ts:665-687` passes on the regenerated page; the run-row set (`:761-776`) gains
  `claude:Permission reads`.
- edgeCases: the record path names no private path or local folder.
- depends_on: none
- verify: `npx vitest run test/emit/capabilityMatrix.test.ts test/cloud test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Docs data only. It trusts the real-run record. Abuse: none reachable.

### c-cloud-docs — Cursor's refusal, the webhook, Claude's cloud, the threads reason

- id: c-cloud-docs
- requirements: REQ-FLOW-170
- files: `docs/factory.md`, `docs/cloud.md`, `content/skills/st-unattended/references/cloud.md`, `test/docsPages.test.ts`, `test/runs/preflight.test.ts`, `src/hooks/model.ts`, `docs/capability-matrix.md` (regenerated), `test/emit/capabilityMatrix.test.ts`
- interfaces: replace "No setup is known that passes." (`docs/factory.md:65-66`, `:353-354`, `:375-385`;
  `docs/cloud.md:236-249`) with: "Cursor's cloud pushes with its own login, written into origin's URL and
  `~/.gitconfig`, and the pre-flight never ties a login carried in a URL to `gh`'s account, by design, so on Cursor's
  cloud it refuses `direct-push`." Webhook (`factory.md:391-413`): GitHub signs a delivery with `X-Hub-Signature-256`
  and never sends the secret, so a repository webhook cannot carry Cursor's key; the workflow route stays. Claude's
  cloud (`:294-309`): "`gh` needs no setup line. For Node, no line is documented; if `node-engine` refuses, put a newer
  Node first on PATH in the setup script." Administrators and `current_user_can_bypass` (`:111-114`): what GitHub
  documents and that the pre-flight counts only `never` and `pull_requests_only` as binding (`preflight.ts:439-444`).
  `docs/cloud.md:133-135` drops "It refuses first with `no pull request…`", which c-marker-finder makes untrue.
  Amended 2026-11-09 (ledger build/1, review/4): also `docs/cloud.md:136-139` and `:557`, `docs/factory.md:59-60` and
  `:423-425`, which still say the land job answers `not-a-run` on Claude's cloud because the marker must end the body;
  and the `claude:Permission reads` row's last clause in `src/hooks/model.ts` (`:238-241`): the own-rights fallback
  covers the permission read only, and the other refused reads may stop a first run at `direct-push`
  (`docs/factory.md:310-313`); regenerate `docs/capability-matrix.md`.
- testCriteria: pins at `docsPages.test.ts:6376`, `:6469` read the new sentence; a new `preflight.test.ts` case: an
  `https://x-access-token:…@github.com/o/r` push URL settles `unknown` with the "carries its own credentials" evidence.
- edgeCases: `references/cloud.md:110-114` holds as written once the marker fix lands; it changes only if not.
- depends_on: c-marker-finder, c-matrix-row
- verify: `npx vitest run test/docsPages.test.ts test/runs/preflight.test.ts test/corpus/skills/unattended.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Docs and one regression test. It trusts the real runs' records. Abuse: none reachable.

### t-gate-held — `stamity gate held`, the held-tests digest

- id: t-gate-held
- requirements: REQ-FLOW-171
- files: `src/cli/commands/gate.ts`, `test/cli/commands/gateHeld.test.ts` (new)
- interfaces: a fourth `gate` subcommand beside `classify`, `scan`, `preflight` (`gate.ts:1830-1833`, `:1853`):
  `stamity gate held --paths <files...> [--expect <digest>] [--json]`. Digest: `sha256:` over the sorted
  `(path, bytes)` pairs, each framed with its length. JSON (amended 2026-11-09: the project root's repository-relative prefix is hashed first and shown as `root`) `{"subcommand":"held","root":"<prefix>","digest":"sha256:<hex>","paths":
  [{"path":"…","sha256":"…"|null}],"expect":"…"|null,"ok":true|false}`. Exit 0 with no `--expect` or a match; 1 on a
  mismatch or a missing file; 2 on a usage error, following `:1867-1889`.
- testCriteria: the same files give the same digest in any order; one changed byte or a missing file exits 1 with
  `ok:false` naming the path; no `--paths` exits 2; a path that is absolute or climbs out with `..` exits 2 (paths
  read relative to the repository root, as `classify --paths`).
- edgeCases: a symlinked test file is never followed: it reads `sha256: null` with a message naming it a link, `ok:
  false`, exit 1 (amended 2026-11-09: a command's `run()` returns 0 or 1, `src/cli/kit/program.ts:107-110`); an empty
  file hashes.
- depends_on: none
- verify: `npx vitest run test/cli/commands/gateHeld.test.ts test/cli/commands/gate.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is the proof that tests were not weakened. It trusts the digest the orchestrator keeps. Abuse:
  a builder editing a held test. Stopped by the mismatch exit; the digest lives in the orchestrator's record, which the
  builder does not write. Security-sensitive path (`.stamity/change-classes.json:9`): the security lens reviews it.

### t-tests-only — the implementer's tests-only mode, and no test for text

- id: t-tests-only
- requirements: REQ-FLOW-171, REQ-FLOW-172
- files: `content/agents/stamity-implementer.md`, `test/corpus/agents/spine.test.ts`
- interfaces: in the Testing rules (`stamity-implementer.md:47-51`), keep the lead phrase "Tests ship with the change
  that motivates them" (`spine.test.ts:532`) and state: a unit whose files `stamity gate classify --paths` places
  `product`, `public-contract` or `security-sensitive` builds against the held tests a tests-only dispatch wrote, and
  never edits, deletes or skips one; with no held tests, no test delta and no stated reason it is incomplete; a `docs`,
  `config` or `records` unit adds no test and says `no new test: <class>`. Add a short "Tests-only dispatch" section:
  given the unit's criteria and interfaces (never another builder's code), write the tests, run them and show each
  fails for the expected reason (a typecheck failure on a missing interface is expected), return the paths; a dispute
  is answered by a fresh tests-only spawn. Report name `<unit>-tests-implementer-r<N>.md` (`src/runs/layout.ts:59-61`).
- testCriteria: `spine.test.ts:526-539` pins the lead phrase and the new mode's heading; the two implementer eval cases'
  ranges re-pointed where lines moved.
- edgeCases: a unit mixing a code file and a doc is a code unit (the strongest class wins).
- depends_on: k-shell-rule
- verify: `npx vitest run test/corpus/agents/spine.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Agent text. It trusts the classifier's class. Abuse: a builder calling its unit `docs`. Stopped by the class
  being read from `gate classify`, not stated.

### t-fixer-reviewer — held tests are off-limits; the reviewer reads criteria first

- id: t-fixer-reviewer
- requirements: REQ-FLOW-171
- files: `content/agents/stamity-fixer.md`, `content/agents/stamity-reviewer.md`, `test/corpus/agents/spine.test.ts`, `test/corpus/agents/quality.test.ts`
- interfaces: fixer scope (`stamity-fixer.md:20-41`): a held test is never edited, deleted or skipped; a finding that
  needs one changed returns `BLOCKED_DEPENDENCY` naming it. Reviewer "Reading the change" (`stamity-reviewer.md:201-215`):
  from the unit's criteria alone, write what would prove each one, then read the diff. Critical row (`:78-79`): each
  criterion maps to a held test, and every held test is unchanged per `gate held --expect`.
- testCriteria: the fixer and reviewer pins (`spine.test.ts:866`, `quality.test.ts:436`) hold; the new sentences are
  pinned; moved eval ranges re-pointed.
- edgeCases: a unit with no held tests (a docs unit) skips the mapping row with one line.
- depends_on: t-tests-only, k-security-gate
- verify: `npx vitest run test/corpus/agents test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Agent text. It trusts the held digest. Abuse: a fix round weakening a test. Stopped by the fixer's ban and the
  digest check.

### t-work-proof — the Build and Prove steps in `/st-work`

- id: t-work-proof
- requirements: REQ-FLOW-171, REQ-FLOW-172
- files: `content/commands/st-work.md`, `test/corpus/commands/work.test.ts`
- interfaces: Build (`st-work.md:81-97`): for a unit `gate classify --base HEAD --paths <files>` places `product`,
  `public-contract` or `security-sensitive`, first a tests-only implementer spawn (criteria and interfaces only), then
  `stamity gate held --paths <its test files> --json`, the record line `- <UTC> held: <unit> <digest> <path>=<sha256> …` (each path with its own hash, so a mismatch names the changed file; a null digest outside a work tree is a red gate; amended 2026-11-09, S15, S21), then
  the builder spawn naming the held paths. Prove: every pass and every pass after a fix runs `gate held --expect`; a
  mismatch is a red gate; the Verdict dispatch names the path of that `--expect` result for the reviewer to read, and a `held-test result not handed in` finding goes to the orchestrator, which runs the check and hands it in, never to a fixer (S56, amended 2026-11-09). A builder's or a fixer's `BLOCKED_DEPENDENCY` on a held test goes to a fresh tests-only spawn with the
  dispute text, never the code; its new digest is recorded. A `docs`/`config`/`records` unit skips the spawn in one
  line. The test-runner's result names the held files as run. (S69, amended 2026-11-09, review/109 from s-skills-content) Intake, before any lane is cut, attended or unattended: for each skill a unit names, the per-client copies are current (`stamity check` reads clean for them); else `BLOCKED_DEPENDENCY` naming `stamity sync` and committing what it wrote; pinned in `work.test.ts`.
- testCriteria: `work.test.ts` pins the record line grammar, the `--expect` step and the skip line; the philosophy
  anchors (`:86,97,400,2190-2193,2481-2484`) hold or are re-pinned with a reason; moved eval ranges re-pointed.
- edgeCases: no `gate` verb (an older CLI): `git hash-object <paths>` before and after, recorded `held: by hand`.
- depends_on: t-gate-held, t-tests-only, k-work-close
- verify: `npx vitest run test/corpus/commands/work.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Flow text. It trusts the orchestrator's record. Abuse: config excluding a held test. Stopped by the
  test-runner naming the held files as run.

### k-protocol — the irreversible trigger, the close in chat, the leftover sources

- id: k-protocol
- requirements: REQ-FLOW-128, REQ-FLOW-174, REQ-FLOW-175
- files: `content/rules/stamity-question-protocol.md`, `test/corpus/rules/protocol.test.ts`, `test/corpus/commands/lightTrio.test.ts`
- interfaces: `:26-27`, same two lines: "**Irreversible or outward action** — an act that cannot be undone (deleting
  data, dropping a column, renaming a public identifier, rewriting shared history) or that reaches people outside the
  repository (a release users receive, a message sent outside it, the run's own pull request aside). A force push
  stays the person's, even on a yes." `:87-88`: "summary or proof block" becomes "summary". Close walk (`:77-98`): the
  leftover sources include the review tool's unfixed comments on the run's pull request; each leftover's reason is one
  plain line; open with a two-line plain summary of the walk. Hold the walk's line count where its cases cite it.
- testCriteria: `protocol.test.ts:324-334`, `:515` and `lightTrio.test.ts:479` read the new text; the five cases citing
  lines 38-98 keep their ranges or are re-pointed.
- edgeCases: a deploy to the repository's own throwaway environment is not this trigger; a release to users is.
- depends_on: none
- verify: `npx vitest run test/corpus/rules/protocol.test.ts test/corpus/commands/lightTrio.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: A rule every agent reads. It trusts the agent's reading of "outside". Abuse: calling a production release
  "inside". Stopped by "a release users receive" being named, and invariant 1 unchanged.

### k-security-gate — the production-only gate fires where the capability exists

- id: k-security-gate
- requirements: REQ-FLOW-173
- files: `content/rules/stamity-security-patterns.md`, `content/agents/stamity-reviewer.md`, `test/corpus/rules/security.test.ts`
- interfaces: `stamity-security-patterns.md:94-95` (floor item 5, `:44-51`, unchanged): the allowlist gate applies
  where the code has a capability that must stay out of production (a debug route, a seed endpoint, a destructive
  admin verb); a repository with none says so in one line. `stamity-reviewer.md:68-70`: the Critical row fires on such
  a capability the change adds or exposes, not on a one-off script an operator runs on purpose against a named environment that does not ship with the code; a seed or reset command shipped with the code is such a capability (amended 2026-11-09, S16).
- testCriteria: the security rule's pins hold or are re-pinned with a reason; the floor item's text is byte-identical.
- edgeCases: a change adding a seed endpoint still meets the full gate.
- depends_on: none
- verify: `npx vitest run test/corpus/rules test/corpus/agents test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: A security floor's gate. It trusts the reviewer's reading of "capability". Abuse: a dangerous route waved
  through as "a script". Stopped by the floor text staying and the named examples; the security lens reviews it.

### k-debug-verify — reproduce first; thresholds from the repository

- id: k-debug-verify
- requirements: REQ-FLOW-173
- files: `content/commands/st-debug.md`, `content/skills/st-verify/references/maintainability.md`, `content/skills/st-verify/references/scalability.md`, `test/corpus/commands/lightTrio.test.ts`
- interfaces: `st-debug.md:97-107`: the in-process route comes first whenever the repository can drive the defect (the
  report or the code gives an input that should show it; the run states input, expected and actual output; the test
  gate runs); the user route is for a defect needing the user's environment, data, device, account, network, traffic
  or timing, or an in-process test that did not fail for the stated reason on both runs. Keep `:104` and `:116-117`.
  Verify rows (`maintainability.md:21`, `:46`; `scalability.md:35`, `:45-46`): the repository's own declared limit;
  with none, report the measured value as evidence and mark the row `not-applicable` citing the absent source, as
  `testability.md:16-19`.
- testCriteria: `lightTrio.test.ts:878,884,887` read the new route sentences; the debug eval case's range re-pointed if
  lines moved.
- edgeCases: a report with no input and no code path that reaches the defect takes the user route.
- depends_on: none
- verify: `npx vitest run test/corpus/commands/lightTrio.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Flow text. It trusts the run's own reproduction. Abuse: none reachable.

### k-multipart-quick — one rule for multi-part rules; eval repairs; the commit style

- id: k-multipart-quick
- requirements: REQ-FLOW-173, REQ-FLOW-065
- files: `content/rules/stamity-ai-evals.md`, `content/rules/stamity-api-versioning.md`, `content/commands/st-quick.md`, `test/corpus/commands/lightTrio.test.ts`
- interfaces: delete the case-shaped sentences `stamity-ai-evals.md:41-44`, `:53-54`; `stamity-api-versioning.md:61-63`;
  `st-quick.md:88`, keeping the floor text around them (`st-quick.md:86-87` stays). Add to `stamity-ai-evals.md` a
  floor item after item 2 (`:25-28`) and a Gates bullet: "A failing case is repaired at the rule it tests: the fix
  restates the general behaviour the case measures, never only the sentence, value or example the case quotes; a
  repair whose new words appear in the case's Brief or transcript is fitted to the case, so rewrite it as the rule and
  check it against a sibling case; the Expected block does not move to meet the fix." `st-quick.md:206-207`: the
  message follows the repository's commit style, read from its contributing guide or recent history (a conventional
  subject where none is found); a batch carries one body line per item. The general multi-part line itself is
  k-charter's.
- testCriteria: `lightTrio.test.ts:1117-1120` and `:1310-1311` re-pinned with a reason; the five cases quoting the
  deleted sentences keep their Expected blocks, with ranges and Brief quotes re-pointed.
- edgeCases: a quick commit in a repository with no history uses a conventional subject.
- depends_on: k-debug-verify
- verify: `npx vitest run test/corpus/commands/lightTrio.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Rule text. It trusts the general line to carry what the sentences did. Abuse: none reachable; the risk of a
  returning eval failure is measured by the cut's eval run.

### k-shell-rule — nothing may hide a gate's exit code

- id: k-shell-rule
- requirements: REQ-FLOW-173
- files: `content/agents/stamity-test-runner.md`, `content/agents/stamity-implementer.md`, `content/agents/stamity-fixer.md`, `content/agents/stamity-researcher.md`, `test/corpus/agents/shellDiscipline.test.ts`
- interfaces: the shell paragraph (`stamity-test-runner.md:150-157`, `stamity-implementer.md:138-145`,
  `stamity-fixer.md:149-156`, `stamity-researcher.md:126-133`), same in all four, same line count: "…writes portable
  POSIX `sh` that runs the same under `sh`, `bash`, `dash` or `zsh`. Nothing may hide or replace a gate's own exit
  code: each command runs once, as written, and its exit code is read from the tool result — never from a wrapper, a
  pipe, a second run or a printed status (for instance `pipefail`, `echo $?`, a pipe into `tail`)." Keep the
  calibration and `sleep` sentences. `SHELL_PARAGRAPH` (`shellDiscipline.test.ts:38-46`) moves to the new text; the
  fence lint (`:63-64`) stays.
- testCriteria: every execute-capable agent and the researcher carry the paragraph word for word; the test-runner
  eval case's range re-pointed if lines moved.
- edgeCases: a `| head` on a plain file read (no gate) is not a gate and is allowed.
- depends_on: c-testrunner-report
- verify: `npx vitest run test/corpus/agents/shellDiscipline.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Agent text. It trusts the agent to read the tool's exit code. Abuse: a piped gate reading green. Stopped by
  the general rule, which covers every form the closed list missed.

### k-charter — the charter line, the multi-part line, the communication style

- id: k-charter
- requirements: REQ-FLOW-173, REQ-FLOW-174
- files: `content/charter/stamity-charter.md`, `src/content/charter.ts`, `src/emit/substitution.ts`, `src/types/core.ts`, `src/manifest/manifest.ts` (only moving the two style symbols to `core.ts`, re-exported; S22), `docs/configuration.md` (regenerated; S22), `src/cli/docs/configReference.ts`, `docs/doctrine.md`, `docs/capability-matrix.md` (regenerated), `test/content/invariantsVersion.test.ts`, `test/content/charter.test.ts`, `test/emit/substitution.test.ts`
- interfaces: invariant 1 (`stamity-charter.md:39-67`) gains, as its last sentence: "Where no floor applies, caution
  matches the real risk: a step that does not apply is skipped in one line, and only what cannot be undone or reaches
  people outside the repository, or is an act this setup keeps for a person waits for a person" (amended 2026-11-09, S28). Invariants 1.4.0 (frontmatter `:8-10`, `invariants_amended`), a
  `"1.4.0"` row in `INVARIANTS_HASHES` (`invariantsVersion.test.ts:43-79`), a `| 1.4.0 |` row in `docs/doctrine.md`
  (`:153-175`). The Conditional layer (outside the hash) gains: "A rule with several parts holds only when every part
  that applies to the work holds; naming some of them is not applying it." Pay the lines back by rewrapping where the
  earlier practice did (`charter.ts:181-197`), else raise `ALWAYS_ON_BUDGET_LINES` (`:207-238`) with a dated reason;
  move the byte constants (`:371`, `:409`, `:452`, `:484`). Communication style: add `communicationStyle` to
  `DetectedRepoContext` and `detectionContextFromManifest` (`substitution.ts:116-127`, `:227-239`, as `maturityTier`
  at `:233-237`); a `${STAMITY:COMMUNICATION_STYLE}` token (`:102-113`, `:245-255`) rendering
  `communicationStyleDirective` (`src/manifest/manifest.ts:1648-1650`) at the charter's plain-words line (`:17-18`);
  drop the "not consumed" disclaimers (`core.ts:43-53`, `configReference.ts:227-237`).
- testCriteria: the invariants hash test passes with 1.4.0; `communicationStyle: technical` renders its directive in
  AGENTS.md and `plain` renders today's sentence; budgets and goldens move with a dated reason; the charter-quoting
  cases' ranges re-pointed.
- edgeCases: no `communicationStyle` set renders the plain sentence; Codex's override budget holds.
- depends_on: c-matrix-row
- verify: `npx vitest run test/content test/emit test/corpus test/evals test/cloud test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: The always-on text every agent reads. It trusts the manifest's style value. Abuse: a style value carrying an
  instruction. Stopped by the value being an enum read by `readCommunicationStyle` (`manifest.ts:1614-1621`).

### k-work-close — the close in chat, the skip line, the leftover sources

- id: k-work-close
- requirements: REQ-FLOW-143, REQ-FLOW-173, REQ-FLOW-174, REQ-FLOW-175
- files: `content/commands/st-work.md`, `test/corpus/commands/work.test.ts`
- interfaces: `st-work.md:288-291`: a step that does not apply to this change is marked not applicable in one line and
  the checkpoint continues; skipping it carries no refusal or warning (keep the first sentence pinned at
  `work.test.ts:1733-1736` or re-pin with a reason). `:309`: `morning.md` is still written as the record and the
  pull-request source; the final message is a plain chat summary — what changed, what to check, `Not done:`, one line
  on the gates, the pull request — built from `stamity run overview --run <id> --json`, never naming the file as
  something to read. `:313-314`: the proof block goes to the record and the pull-request body; chat prints the summary.
  `:299-301`: the review tool's unfixed comments join the leftover sources. Close: one line naming what `run land`
  cleaned (file 2's d-run-cleanup) and what `stamity gc` would free.
- testCriteria: `work.test.ts:1596,1606,1622` read the new sentences; the cases citing `:274-314` re-pointed and their
  Briefs updated where a quoted sentence changed.
- edgeCases: a run with no pull request ends the summary without the link; `Not done:` stays in chat (invariant 4).
- depends_on: c-testrunner-report, k-protocol
- verify: `npx vitest run test/corpus/commands/work.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Flow text. It trusts `run overview`'s output. Abuse: a summary hiding a gap. Stopped by `Not done:` staying
  in chat by invariant 4.

## Risks

- **Warning: the switch touches the guard every call passes.** Mitigation: it only replaces an `attendedAsk` return;
  the security lens reviews it; the session syncs it into its own checkout only after the guard's tests and a dry probe
  over every command form pass on a lane.
- **Warning: removing case-shaped sentences can bring their eval failures back.** Mitigation: Expected blocks stay; the
  cut's eval run measures it.
- **Warning: `st-work.md` has six writers across the files.** Mitigation: the chain above; each edit in place where it
  can.
- **Warning: the test-runner's report could be stale.** Mitigation: the spawn token on its first line.
- **Minor: Claude Code's own permission prompts are outside every hook.** Accepted: the docs name a launch mode that
  never prompts (file 2's z-docs).

## Open questions

None.

## Follow-ups

- Measure what `current_user_can_bypass` returns for an administrator and state it in `docs/factory.md` · when: the
  1.19.0 cut session's real runs · files: `docs/factory.md`
- Verify that a merge by the land job's token closes the item's issue through the body's closing keyword · when: the
  1.19.0 cut session's real runs · files: `docs/factory.md`, `src/runs/morning.ts`
