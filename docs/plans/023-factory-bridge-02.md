---
id: factory-bridge-02
intent: roadmap
stamp: 04966e3aa3142418248a693bb8d16bd074f0d5ab 2026-11-05
reads: [.claude/skills/st-eval-run/SKILL.md, .github/release-controls-checklist.md, .stamity/change-classes.json, .stamity/overrides/skills/st-eval-run/SKILL.md, content/skills/st-learn/SKILL.md, content/skills/st-qa/SKILL.md, content/skills/st-unattended/SKILL.md, content/skills/st-unattended/references/cloud.md, docs/cloud.md, docs/configuration.md, docs/factory.md, docs/specs/everyday-flows.md, docs/troubleshooting.md, docs/workspaces.md, evals/SET-v7.md, src/adapters/copilot.ts, src/change/personOnlyPaths.ts, src/cli/commands/config.ts, src/cli/commands/config/mcp.ts, src/cli/commands/gate.ts, src/cli/commands/learn.ts, src/cli/commands/run.ts, src/cli/commands/runLand.ts, src/cli/commands/workspace.ts, src/cli/docs/measurements.ts, src/content/userContent.ts, src/hooks/personOnly.ts, src/learnings/store.ts, src/manifest/manifest.ts, src/manifest/ownedPaths.ts, src/mcp/catalog.ts, src/mcp/emit.ts, src/pack/manifest.ts, src/pack/projection.ts, src/runs/gitSurface.ts, src/runs/landEvidence.ts, src/runs/morning.ts, src/runs/pullRequest.ts, src/runs/resumeCard.ts, src/runs/reviewTool.ts, src/types/manifest.ts, src/workspace/manifest.ts, src/workspace/model.ts, src/workspace/resolve.ts, test/cli/commands/runLand.test.ts, test/corpus/skills/flow.test.ts, test/corpus/skills/unattended.test.ts, test/docsPages.test.ts, test/hooks/portableRunner.test.ts]
depends_on: [docs/plans/023-factory-bridge-01.md]
---

# The factory bridge, the rest and the cut — file 2 of 2

This file is self-contained. It follows `docs/plans/023-factory-bridge-01.md` and runs on `main` as that file left it. Its stamp
was refreshed at `04966e3a`, after file 1 merged, and every `file:line` below resolves at that commit.

## Context

File 1 gets an item from ready to merged. This file gives the person what they need around that: their own company
knowledge server, one short page after a run, one list of what is truly theirs, and learning that proposes instead of
editing itself. It also closes what file 1 left: a safety list the page can trust, a test that cannot hang, wording that
promises only what the land does, and a person's clone that can land a cloud run. Copilot's trigger is added where its
limits allow, and it never gates the release. It ends with the 1.18.0 cut.
Out of scope: the catalog's reshaping and everything else that waits for 2.0.

## Roadmap lenses

Stage: `solo`. Business lens unavailable for market size and revenue: Stamity is a common good and nothing here is priced.

| Outcome (business lane) | Measured by | Unblocked by (technical lane) |
|---|---|---|
| A company's own knowledge reaches every run | a repository names its server and it emits with the pack bar's checks | `own-server-core`, `own-server-verb`, `own-server-workspace` |
| A person trusts a run without reading it | one short page says what happened, how and why | `run-overview`, `human-only-list`, `land-wording` |
| A person can finish what a cloud run held | a yes at the morning walk lands the pull request from their own clone | `clone-land` |
| Stamity improves with use, under a person's eye | a run proposes a learning and a person accepts it | `propose-learning` |
| 1.18.0 ships | npm `latest` and the release's advisories | `cut` |

`copilot-trigger` is `enabling`: it widens reach and never gates. `test-time-limit` and `safety-measure` are `enabling`: the
first keeps a hung child from stalling a gate, the second keeps the measurements page from rendering a partial safety list.

## Decisions

- **Own servers ride the pack bar:** they pass `validatePackMcpServer`, so the pin and secret checks are the packs', and the catalog stays.
- **The overview is a verb, not a file `run end` writes:** the land rows reach `morning.md` after `run end`.
- **The human-only list reuses `## Person's calls held`,** with one row grammar. A new required section would stop older lists parsing.
- **A row keeps its `Not done:` line too:** an unproven row must not read as done because a person now owns it.
- **Propose-only defaults to leaving it out:** no answer never accepts.
- **A round is a marker, not an ask:** the pages say what the code counts, a head carrying the run's review marker, and promise no more than that.
- **A person's clone lands through the walk's own run id,** never by reading an unattended record as attended. `Resumes:` is honoured only on an attended record with `STAMITY_UNATTENDED` unset, naming a closed run.
- **The author check stays on that route:** the pull request's author must be `gh`'s login or the `Login:` line at the head, the rule the land job already reads. Where neither matches, the land refuses and a person merges on GitHub. Reversible: dropping the check under `--approved` would land more, and it would trust a person's yes for who opened the pull request.
- **`clone-land` waits for a real run that meets it:** today a person's clone refuses and the person merges on GitHub, which fails safe, while the unit widens who may land on a record a run can write. Its cell stands, and it runs only if a real run shows the hand merge is not enough. The cut does not wait for it.
- **The safety check fails closed only on a page that names the list:** a one-link run of its own release shows no safety count, so it needs none.

## Spec delta

Stated against `docs/specs/everyday-flows.md` unless a line says otherwise. Ids continue from file 1, whose last number is
159, and no id below collides with one in `docs/specs/`.

### REQ-FLOW-160 — A repository names its own knowledge server (ADDED)

- Given a valid `mcp.ownServers` row, when `sync` runs, then the server emits as a pack's would, with its pin and secret checks.
- Given a row whose fetch launcher carries no exact pin, or a row with a literal secret, then the manifest is refused and names the row. A launcher that fetches nothing is a program you installed, and its version is yours to keep.
- Given a workspace `mcp` block, then a member's own server survives by the merge rule, not by replacement.

### REQ-FLOW-161 — One short page says what a run did (ADDED)

- Given a run folder, when `stamity run overview --run <id>` runs, then it prints what happened, how, why and the human-only list, and writes nothing.

### REQ-FLOW-162 — What only a person can do lands on one list, with why (ADDED)

- Given an act an agent tried and failed, or truly only a person can do, when a run ends, then one row reads `tried: <act> · failed: <why> · yours because: <reason> · do: <exact step>`.
- Given a refused act, then the row reads `refused, not tried again` and no agent respells it.

### REQ-FLOW-163 — A run proposes a learning; a person accepts it (ADDED)

- Given `learn capture --propose --run <id>`, then the gates run and the proposal lands in the run folder, not in `.stamity/learnings/`.
- Given `learn accept --run <id> --proposal <slug> --digest <digest>` from a person, then every gate re-runs and the learning goes live. Under an unattended mode the verb refuses, the guard asks on it, and a digest that does not match the file refuses. A proposal of any class but a learning is refused: an override is not proposed in this release.
- Given a live `learn capture` under an unattended mode, then it refuses and names `--propose`.

### REQ-FLOW-164 — Copilot's trigger, where its limits allow (ADDED)

- Given a workflow can start Copilot's cloud agent, when the ready label lands, then a run starts by reference. Given it cannot, then the page says so and no release waits on it.

### REQ-FLOW-165 — A person's clone lands a cloud run's held pull request (ADDED)

- Given a morning walk's record reading `Mode: attended` and `Resumes: <run-id>` of a closed run, with `STAMITY_UNATTENDED` unset, when `run land --run <walk-id>` runs on a person's clone, then the land holds that run's pull request to the same evidence and, on `--approved <sha>`, lands over an `asks` hold.
- Given a pull request whose author is neither `gh`'s login nor the `Login:` line at the head, then the land refuses and names the author.
- Given `STAMITY_UNATTENDED` set, or a resumed run whose record is not closed, then `Resumes:` counts for nothing and the marker refusal stands.

### REQ-FLOW-069 — A person QA row has a reason a machine cannot meet (MODIFIED)

A row outside the five that no route proves goes on the run's `## Person's calls held` with its why, and stays on `Not done:` as `not proven: <reason>`. It no longer goes on `Not done:` alone.

### REQ-FLOW-081 — The run proves a row before it asks the person (MODIFIED)

The same rule, in the "Who is asked" bullet: the row reaches the person on the list as well as on `Not done:`.

### REQ-WS-011 — The bridge: the cascade writes workspace-resolved values into the member's own manifest (MODIFIED, `docs/specs/workspace-surface.md`)

Step 2: `mcp` is `resolved.mcp` merged with a member's own rows and their selected ids, not `resolved.mcp` alone. A second refusal before the cascade, beside the realpath alias refusal: two members naming one own id with different rows. A check before the write and before the dry-run branch: a patched block naming an id the member cannot resolve fails that row, so a real run and a preview give one answer and the member's bytes do not move. Steps 3 and 4, and the sentence crediting `writeManifest`, change to match.

### REQ-FLOW-092 — `run end` (MODIFIED)

`run end`'s `--paths` no longer names a learning file the close captured, since an unattended close proposes and captures nothing live. The spec's ask list gains `learn-accept`.

### REQ-FLOW-094 — The morning list (MODIFIED)

The list's held section carries the row grammar of REQ-FLOW-162.

### REQ-FLOW-132 — `run land` (MODIFIED)

On a walk the land reads the resumed run's marker, pull-request record and ledger, as REQ-FLOW-165 states.

### REQ-FLOW-133 — Land asks (MODIFIED)

`.stamity/learnings/**` and `.stamity/overrides/**` become held paths that still land on evidence.

### REQ-FLOW-154 — A named review tool is asked, waited for, and never passed by silence (MODIFIED)

`rounds` counts the heads that carry the run's review marker, the first among them. A head the tool already finished with findings takes a round with no ask.

### REQ-FLOW-156 — The people a run contract names hear when the run ends (MODIFIED)

Given a notice that fails on an exit-0 `run end`, then one comment on the pull request says so, naming the class of failure and no text from GitHub.

### REQ-PROVE-033 — The composed run (MODIFIED, `docs/specs/prove-behavior-and-value.md`)

Given a chained run of record whose § 6 safety rows disagree with the counts its § 5 states, then the measurements page refuses it, naming both counts.

## Units

The rules of file 1's Units section bind here too, restated in short:

- **Whole-tree checks bind over every `verify`:** every unit also runs `test/ci/testInputsGuard.test.ts`, `test/architecture`, `npm run lint`, `npm run typecheck` and `npm run knip`; a unit touching `src/hooks/` or `src/adapters/` also runs `test/cloud`; a unit adding path strings to a `src/` file also runs `test/roster`; a `content/` edit also runs `test/evals` and `test/corpus`.
- A unit's `verify` names only tracked paths and files the unit writes, never a records path: a lane worktree does not hold them. `test/records/` reads the records, so the integration lane runs it.
- **Derived files:** a lane regenerates what its own verify reads: `npx vitest run test/emit/crossClientGoldens.test.ts test/corpus/emissionGoldens.test.ts --update` (files first, the flag last) and `node scripts/generate-docs.mjs`. This repository's emitted copies stay the integration lane's: `npm run build && node dist/cli.js sync`, which a corpus edit needs in the same change.
- **One writer each:** an edge below names the file that forces it. `docs/specs/everyday-flows.md` is `land-wording`'s until Prove merges this delta; `test/architecture/boundaries.test.ts` is the integration lane's, and every new `src/` module needs a `PLAN_MAP` row there (`:260`), importing only lower waves.
- Never a full suite in a lane. A test outside a unit's files that pins exactly the old behaviour may be re-pinned, with a `TEST CHANGE, justified:` line.
- **`threat` rows:** this plan's run could not call `gate classify`, so every unit carries one, read by hand against `.stamity/change-classes.json`.
- Run order: `test-time-limit`, `safety-measure`, `own-server-core` and `human-only-list` in parallel; then `own-server-verb` and `own-server-workspace` in parallel; then `run-overview`; `propose-learning`; `land-wording`; `guide-truth`; then `cut`. `deps-website` runs at any time. `copilot-trigger` runs after `guide-truth` and holds nothing. `clone-land` waits for a real run that meets it.

### test-time-limit — a hung child fails fast

- id: test-time-limit
- requirements: spec carries no ids
- scope note: the file list below was widened at build: the line search found 24 more unlimited calls past the eighth file, and the card says to look for twins, so all of them are in. The limit is one shared helper, `test/support/childTimeout.ts`, 15 seconds on POSIX and 60 on win32, not one constant per file, and its `verify` runs every test file the branch changed.
- files: `test/hooks/portableRunner.test.ts`, and its twins `test/hooks/sessionStartCard.test.ts`, `test/hooks/unattendedAskGate.test.ts`, `test/hooks/readOnlyGitGuard.test.ts`, `test/hooks/personOnlyCopilotAsk.test.ts`, `test/adapters/cursorModelHook.test.ts`, `test/runs/resumeCardParity.test.ts`, `test/merge/claudeHookCopies.test.ts`
- interfaces: `execute` (`test/hooks/portableRunner.test.ts:48-50`) calls `spawnSync` with no `timeout`; on 2026-11-05 it hung for 31 minutes with the child waiting on stdin. A sync call blocks the worker, so vitest's own 20-second limit cannot fire: only the call's own `timeout` ends it. Add one named constant per file, `const CHILD_TIMEOUT_MS = 15_000;`, under that 20 seconds, following `KILLED_CASE_TIMEOUT_MS` (`test/hooks/cloudReadiness.test.ts:47`), and pass it as `timeout` on each call. A twin is a `spawnSync` or `execFileSync` with no `timeout` on a child that reads stdin: a hook, a guard or a runner. Read at this plan: `test/hooks/sessionStartCard.test.ts:53`, `test/hooks/unattendedAskGate.test.ts:60`. The other six file names above come from a file-level search, a hit on `spawnSync` and `input:` and none on `timeout`, and each header names a child run on a payload. First step: a line-level search of `test/` for both calls, since this plan could only search by file. Files holding the word `timeout` still need that search, as `portableRunner.test.ts` itself does. Also to clear call by call: `test/qa/hookRuns.test.ts`, `test/qa/hookRunsCli.test.ts`, `test/cli/commands/run.test.ts`, `test/cli/commands/runEnd.test.ts`, `test/ci/recordsOnly.test.ts`, `test/evals/manualRunner.test.ts`, `test/emit/plannerOverlay.test.ts`, each a hit on the same words. A `git` child reads no stdin, so it is out.
- testCriteria: a new case in `test/hooks/portableRunner.test.ts`, a hook whose body never exits, returns within the limit with `result.error` reading `ETIMEDOUT` rather than hanging; every existing case in the eight files still passes. Consumer tests: the eight files themselves.
- edgeCases: a child that outlives the kill still ends the call, and the case asserts the call returned; a twin past the eighth file goes on the run's `Not done:` with its path, not into a wider diff; a case that truly needs longer names its own limit and why.
- depends_on: none
- verify: `npx vitest run test/hooks/portableRunner.test.ts test/hooks/sessionStartCard.test.ts test/hooks/unattendedAskGate.test.ts test/hooks/readOnlyGitGuard.test.ts test/hooks/personOnlyCopilotAsk.test.ts test/adapters/cursorModelHook.test.ts test/runs/resumeCardParity.test.ts test/merge/claudeHookCopies.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Test code only, no product boundary. It trusts the fixture child. Abuse: none reachable. The check is the time limit itself.

### safety-measure — the page cannot render a partial safety list

- id: safety-measure
- requirements: REQ-PROVE-033
- files: `src/cli/docs/measurements.ts`, `test/cli/docs/measurements.test.ts`, `.stamity/overrides/skills/st-eval-run/SKILL.md`, and through the integration lane's sync `.claude/skills/st-eval-run/SKILL.md`
- interfaces: `evals/SET-v7.md:4190-4199` declares `## 0a. Safety measure` as item 12, and neither eval skill copy names it. Add one bullet after `.stamity/overrides/skills/st-eval-run/SKILL.md:262`, in the run artifact's list: a composed run whose prior complete run is itself composed carries that section, written by the route of record's driver, and a section typed by hand does not count. The partial-miss check: `safetyCases` (`src/cli/docs/measurements.ts:1350-1353`) reads § 6 alone through `SAFETY_CLASS` (`:1339`), and `:1585` guards only zero. Add `safetyCounts(results: string): { floors: number; guardrails: number; twins: number } | null` beside it, reading § 5's table: `floors 48/48`, `(39/39)` and `(0/10)` in run 57's form, the denominator of each. At `:1583-1587`, where `named` is true, count § 6's rows: `**floor**` marks against `floors`, class `adversarial` with no `twin` against `guardrails`, class `twin` against `twins`. A difference, or a § 5 that does not read, is `fail()`, naming both numbers. Rows `build/5`, `review/9` of file 1. The driver itself stays out of this file: see Follow-ups.
- testCriteria: a chained fixture whose § 6 drops one floor mark is refused naming both counts; one whose counts agree renders; one with no readable § 5 is refused when `named` and renders when not. Consumer tests: `test/cli/docs/measurements.test.ts`; `test/records/measurements.test.ts` (`safetyCases`, 76 for run 57) in the integration lane; `test/evals/manualRunner.test.ts`, `test/docsPages.test.ts` and `test/upstream/lane.test.ts` read the skill copies.
- edgeCases: a chained fixture written with no § 5 re-pins with a `TEST CHANGE, justified:` line, since the check is new; a case in both the floor and adversarial counts counts once in the set and once in each count, as run 57's 48 + 49 − 21 = 76; a one-link run of its own release is not `named`, so it is not checked.
- depends_on: none
- verify: `npx vitest run test/cli/docs/measurements.test.ts test/evals/manualRunner.test.ts test/docsPages.test.ts test/upstream/lane.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a results file a person trusts through the public page. It trusts the file's § 5 and § 6 as written. Abuse: a dropped floor mark hides a missed case and the page reads whole. Stopped by the two sections having to agree; a file forged in both, or a § 6 fault that keeps the three tallies equal, stays out of reach of this check.

### own-server-core — own rows reach every emission

- id: own-server-core
- requirements: REQ-FLOW-160
- files: `src/types/manifest.ts`, `src/manifest/manifest.ts`, a new `src/mcp/ownServers.ts`, `src/mcp/emit.ts`, `src/pack/projection.ts`, `src/cli/engine/emissionWrite.ts`, `src/cli/commands/clean.ts`, `test/architecture/boundaries.test.ts` (its own `PLAN_MAP` row, as a separate commit, at wave 6 or 7), tests under `test/mcp`
- interfaces: `mcp.ownServers?: PackMcpServerDefinition[]` (`src/types/manifest.ts:148`). A new seam turns rows into supplied rows through `validatePackMcpServer` (`src/pack/manifest.ts:1475`) and merges them with pack rows at every reader of pack server supply: `resolveInstalledPackContent` (`src/pack/projection.ts:533-536`), `installedPackServers` (`src/cli/engine/emissionWrite.ts:392-397`) and `installedPackMcpSupply` (`src/cli/commands/clean.ts:1040-1050`). Reserved `sourcePackId` `:own`, which `PACK_NAME_PATTERN` (`src/pack/manifest.ts:245`) cannot match. The validator runs at this seam, not in the manifest reader. Add a text-level scan over `description` and `blastRadius`, since `scanPackBodies` runs only at install. This is a seam into pack supply, not new pack work.
- testCriteria: a valid row emits through `sync` with the pin checks; a fetch launcher with no exact pin and a literal secret are refused, naming the row; a full `clean` removes own rows from client documents; `clean --pack` leaves own rows; a deselected own row stops launching. Consumer tests: `test/mcp`, `test/pack/manifest.test.ts`, `test/mcp/emit.test.ts`, `test/manifest/mcpFilter.test.ts`, `test/cli/commands/syncMcpOwnership.test.ts`.
- edgeCases: no direct `url` entry exists, so a remote server goes through a pinned bridge; an id clashing with a curated server is refused; an older CLI refuses a selected own id, so a downgrade fails safe.
- depends_on: none
- verify: `npx vitest run test/mcp test/pack/manifest.test.ts test/manifest/mcpFilter.test.ts test/cli/commands/syncMcpOwnership.test.ts test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a manifest row that runs a program. It trusts only rows that pass the pack bar. Abuse: a row fetching an unpinned package. Stopped, for the fetch launchers, by `assertPinnedArgs`, and for every row by the manifest being a person-only path.

### own-server-verb — a person adds a row, and a re-init keeps it

- id: own-server-verb
- requirements: REQ-FLOW-160
- files: `src/cli/commands/config/mcp.ts`, `src/cli/commands/config.ts`, `src/migration/carry.ts`, `src/cli/commands/init/apply.ts`, `SECURITY.md`, generated `docs/cli-reference.md`, `test/cli/commands/configMcp.test.ts`, `test/cli/docs/cliReference.test.ts`
- interfaces: A verb `config mcp own <file>`, dispatched at `src/cli/commands/config.ts:1691-1692`, refusing an id that matches a pack's. A re-init carries `ownServers` (`src/migration/carry.ts:121-123`, `src/cli/commands/init/apply.ts:918-921`), so a selected own id keeps its row. From `own-server-core`: `config mcp add` and `config set mcp.servers` accept an own id (`src/cli/commands/config/mcp.ts:115`, `src/cli/commands/config.ts:1396`), `config mcp list` shows its launcher, and `config mcp add` writes `.env.mcp` for an own row as it does for a curated one. A person removes a row by `config mcp own --remove <id>`, which deselects it, removes the client entries while the row can still prove them, then deletes the row, since a row deleted in the same edit as its deselection leaves the server launching. The row type is `McpOwnServer`. `docs/reference/mcp-servers.md` does not move: its rows come from the curated catalog. Literal pins a new verb moves: the `config mcp` usage text at `src/cli/commands/config.ts:1589-1595`, `:1627`, `test/cli/commands/configMcp.test.ts`, and `docs/cli-reference.md` by regeneration.
- testCriteria: the verb adds a valid row and refuses an invalid one, naming it; an id matching a pack's is refused; a re-init keeps both the id and the row; `--remove` leaves no client entry launching; `config mcp add` accepts an own id and writes its `.env.mcp` row. Consumer tests: `test/cli/commands/configMcp.test.ts`, `test/cli/docs/cliReference.test.ts`, the re-init tests beside `src/migration/carry.ts`.
- edgeCases: a file that does not parse is refused and writes nothing.
- depends_on: own-server-core (the seam and the row type)
- verify: `npx vitest run test/cli/commands/configMcp.test.ts test/cli/docs/cliReference.test.ts test/migration test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is the same manifest row. The verb adds no trust: every row goes through the seam's validator. A limit stated in `SECURITY.md`: an organization's `.stamity/policy.json` gates pack sources, not rows a person adds to the manifest, which is a person-only path.

### own-server-workspace — a member's own server survives the merge

- id: own-server-workspace
- requirements: REQ-FLOW-160, REQ-WS-011
- files: `src/workspace/resolve.ts`, `src/cli/commands/workspace.ts`, `src/workspace/model.ts`, tests under `test/workspace`
- interfaces: The four sites `src/workspace/resolve.ts:216-219`, `src/cli/commands/workspace.ts:950-956`, `:988-993`, `src/workspace/model.ts:39`. The merge rule: a member keeps its selected own ids in `servers`, along with the row itself.
- testCriteria: a workspace `mcp` block keeps a member's own server by the merge rule, not by replacement; a member's selected own id always has its row. Consumer tests: `test/workspace`.
- edgeCases: two members naming one own id with different rows are refused, naming both.
- depends_on: own-server-core (the row type)
- verify: `npx vitest run test/workspace test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: No new boundary: rows still pass the seam's validator.

### human-only-list — one list, with why

- id: human-only-list
- requirements: REQ-FLOW-069, REQ-FLOW-081, REQ-FLOW-094, REQ-FLOW-162
- files: `content/skills/st-unattended/SKILL.md`, `content/skills/st-qa/SKILL.md`, `test/corpus/skills/flow.test.ts`, `test/corpus/skills/unattended.test.ts`, the eval cases quoting the changed sentence, generated `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`
- interfaces: Reuse `## Person's calls held` and the question kind `held`, with the row grammar of REQ-FLOW-162. No parser change (`src/runs/morning.ts:193`). `st-qa`: a row outside the five that no route proves goes to this list with its why and stays on `Not done:` as `not proven: <reason>`. List rows sit outside `MORNING_QA_MAX` (`src/runs/morning.ts:63`). The cap on `content/skills/st-unattended/SKILL.md` is `BODY_CAP = 163` body lines (`test/corpus/skills/unattended.test.ts:47`, enforced at `:217-221`), counted after the head, and the body is exactly 163: file lines 11 to 173. It is a line cap, not a size cap, so no new line fits, and no sentence needs one. The row grammar joins the end of the existing line `:137`, the last of `## Person's calls held`; a pointer to anything longer joins `:173`, the last of `## Chains`. Neither line moves a range: the 19 eval cases that name this file cite only `:15-17`, `:37-40`, `:47-63`, `:65-72`, `:76-84`, `:86-107`, `:109-132`, `:163-166` and `:171`, so `:133-162`, `:167-170`, `:172` and `:173` are free. A sentence on a cited line, or a new line, re-pins those cases' ranges and Briefs in the same change, and a new line also raises `BODY_CAP` with a `TEST CHANGE, justified:` line.
- testCriteria: the corpus tests find the grammar; `test/corpus/skills/flow.test.ts:698`, `:725-727` pass on the new sentence, re-pinned with a `TEST CHANGE, justified:` line; every eval case quoting it is re-read and its range holds. Eight cases name `content/skills/st-qa/SKILL.md`: `benign-qa-cli-change-no-person-row`, `benign-qa-second-account-stays-person-row`, `qa-bare-signoff-records-unwalked`, `qa-contradicted-row-fails-security-row-first`, `qa-prove-before-asking`, `qa-ui-change-keeps-person-row`, `work-persisted-plan-asks-once`, `probe-qa-select`. Consumer tests: `test/corpus/skills`, `test/evals`, `test/emit/crossClientGoldens.test.ts`, `test/corpus/emissionGoldens.test.ts`.
- edgeCases: a refused act is never respelled; `benign-qa-cli-change-no-person-row` is re-read and its expected answer checked; a row longer than `question`'s 500-character cap fails `parseMorning`, so the run shortens `failed:` and keeps `do:` whole; the new sentence passes `actsTold` (`test/corpus/skills/unattended.test.ts:556-560`) and spells no person-only command (`:562-567`).
- depends_on: none
- verify: `npx vitest run test/corpus test/evals test/emit/crossClientGoldens.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is text a model follows with nobody watching. It trusts the corpus. Abuse: a row that reads as permission to do a person's act. Stopped by the row naming a refused act as `refused, not tried again` and the corpus pins on the acts told.

### run-overview — one short page, and a failed notice said aloud

- id: run-overview
- requirements: REQ-FLOW-156, REQ-FLOW-161
- files: a new `src/runs/overview.ts`, `src/cli/commands/run.ts`, generated `docs/cli-reference.md`, new `test/runs/overview.test.ts`, `test/cli/commands/runEnd.test.ts`
- interfaces: `export function overviewFrom(input: {record: string; ledger: LedgerRow[]; morning: string | null}): string`, pure. `stamity run overview --run <id> [--json]`, read-only, reading with the caps at `src/cli/commands/run.ts:256-259`, using `parseMorning`, `parseLedgerText`, `blastRadiusSection`. Sections: what happened (status, units, land), how (gates, rounds, usage), why (defaults, choices), then the human-only list, its rows printed as written, so the verb parses no row grammar and `human-only-list` owes it nothing. Literal pins a new verb moves: `OVERVIEW` beside `CONTRACT` (`src/cli/commands/run.ts:181`), the `SUBCOMMAND_OPTIONS` row (`:202-210`), the `.choices` list (`:305`), the dispatch beside `:355-358`, and the subcommand row in `docs/cli-reference.md` by regeneration. Not in `RUN_VERBS` (`src/hooks/personOnly.ts:4616`): it pushes nothing. review/73: a notice failure on an exit-0 `run end` stays in that call's JSON, since `draftPr` writes the body (`src/cli/commands/run.ts:1535`) before `runEndNotice` runs (`:1543-1546`), and a status line would be replaced at land. So where `noticed` is `null` and a line starting `notice not sent:` was added (`:1635`), post it as one comment on the pull request, by the same `ghApi` POST shape as `src/cli/commands/runLand.ts:781`, its text the `notDone` line alone, which already names a class and never GitHub's words. A comment that fails adds one `notDone` line and moves no exit code.
- testCriteria: a sample run prints four sections in order; a missing `morning.md` prints a line saying so; the verb writes no file; a failed notice leaves one comment and exit 0; a sent notice, or no contract, leaves none. Consumer tests: `test/runs/overview.test.ts`, `test/runs/morning.test.ts`, `test/cli/docs/cliReference.test.ts`, `test/cli/commands/runEnd.test.ts`.
- edgeCases: a ledger that fails to parse prints the record's facts and names the failure; a run with no land yet says so; a second `run end` that fails again posts a second comment, the record holding no `notice:` line, and that is accepted; a `--refused` end sends no notice, so it posts none.
- depends_on: own-server-verb (one writer of `docs/cli-reference.md`), test-time-limit (one writer of `test/cli/commands/runEnd.test.ts`)
- verify: `npx vitest run test/runs/overview.test.ts test/runs/morning.test.ts test/cli/docs/cliReference.test.ts test/cli/commands/runEnd.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a run folder's text, which a run wrote, shown to a person, and a comment posted outward. It trusts neither for instructions. Abuse: a terminal or pull request reading forged text as fact. Stopped by `sanitizeLabel` on what prints and a comment holding only the fixed `notDone` line.

### propose-learning — a run proposes, a person accepts

- id: propose-learning
- scope note: review narrowed this cell. `accept` takes learnings only, so the override route through `saveUserContent` is gone; the guard asks on `learn accept` (`src/hooks/personOnly.ts` and the emitted copies join the files); the yes binds to a digest; a live capture is refused under an unattended mode; `content/skills/st-unattended/SKILL.md` and `docs/cli-reference.md` join the files.
- requirements: REQ-FLOW-133, REQ-FLOW-163, REQ-FLOW-092
- files: `src/cli/commands/learn.ts`, `src/change/personOnlyPaths.ts`, `src/runs/landEvidence.ts`, `src/cli/commands/run.ts`, `content/skills/st-learn/SKILL.md`, `test/cli/commands/learn.test.ts`, `test/change/personOnlyPaths.test.ts`, `test/runs/landEvidence.test.ts`, `test/corpus/skills/flow.test.ts`, generated `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`, and `SECURITY.md` where `test/docsPages.test.ts`'s held-path case asks for the two globs
- interfaces: `learn capture --propose --run <id>` runs the dry-run gates, then writes `.stamity/runs/<id>/proposals/<slug>.md`. Stage that folder as `held/` is: `RUN_FILES` and `runOwned` (`src/cli/commands/run.ts:241`, `:1136`) stage named files, and `held/` is staged by its folder (`HELD_DIR`, `:250`, `:1143`, `:1154`). One morning row, kind `decision`, `1 leave it out · 2 accept`, default `1`. `learn accept --run <id> --proposal <slug>` joins the verb choices (`src/cli/commands/learn.ts:604`), re-running every gate through `persistLearning`, or `saveUserContent` for an override, and refusing under an unattended mode. Both globs join `PERSON_ONLY_PATHS` and `LANDS_ON_EVIDENCE`, or every attended run with a learning would ask at land (`LAND_ASK_PATHS`, `src/runs/landEvidence.ts:70-72`). An unattended close that still captures live lands in a held patch, and a held patch asks at land, while `content/skills/st-unattended/SKILL.md:93` and `:99` tell that close to capture. So `content/skills/st-learn/SKILL.md` says an unattended run captures with `--propose`, and those two cited lines stay as they are. Literal pins a new verb moves: the `.choices` list at `src/cli/commands/learn.ts:604`, the skill's verb line and its pin in `test/corpus/skills/flow.test.ts`.
- testCriteria: `--propose` writes nothing under `.stamity/learnings/`; `accept` re-runs the gates and refuses unattended; a run that still captures live is held and land asks; `content/skills/st-learn/SKILL.md` says an unattended run proposes. Consumer tests: `test/cli/commands/learn.test.ts`, `test/change/personOnlyPaths.test.ts`, `test/runs/landEvidence.test.ts`, `test/cli/commands/runEnd.test.ts`, `test/docsPages.test.ts`, `test/corpus/skills/flow.test.ts`; the cases `probe-learn-select` and `probe-none-readme-note-request` name the skill file, and each is re-read.
- edgeCases: a proposal naming a slug already live is refused; no answer leaves it out; `test/corpus/skills/unattended.test.ts:404-405` and `:417-418` pin the close's capture sentences and stay untouched.
- depends_on: run-overview (one writer of `src/cli/commands/run.ts`), human-only-list (one writer of `test/corpus/skills/flow.test.ts` and the golden snapshots)
- verify: `npx vitest run test/cli/commands/learn.test.ts test/change/personOnlyPaths.test.ts test/runs/landEvidence.test.ts test/cli/commands/runEnd.test.ts test/docsPages.test.ts test/corpus test/evals test/emit/crossClientGoldens.test.ts test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is text a run wrote that later runs would follow. Abuse: a run edits what later runs read. Stopped by the live folders being held paths and accept being a person's verb.

### land-wording — promise only what the land does, and pin what it does

- id: land-wording
- requirements: REQ-FLOW-154
- files: `src/cli/commands/config.ts`, `src/cli/commands/runLand.ts` (its header comment only), `docs/cloud.md`, `docs/troubleshooting.md`, `docs/factory.md`, generated `docs/configuration.md`, `content/skills/st-unattended/references/cloud.md`, `docs/specs/everyday-flows.md`, `test/docsPages.test.ts`, `test/corpus/skills/unattended.test.ts`, `test/cli/commands/runLand.test.ts`, `test/cli/commands/gatePreflight.test.ts`, generated `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`
- interfaces: What the code does: a round is a distinct head carrying a request marker from the run (`requestTimes`, `src/runs/reviewTool.ts:234-244`; `requests.size >= rounds`, `:274`). `askTool` (`src/cli/commands/runLand.ts:773-786`) posts `request` and the marker only while `waiting` and only waits stop the head, and posts the marker alone on an own open head the tool already finished with `findings`, whatever else stops it (`:776-777`, `:780`). So a findings head spends a round with no ask, and "the heads the tool was asked on" is wrong. One sentence replaces it everywhere: `` `rounds` counts the heads that carry the run's review marker, the first among them, so at most one fewer get a fix, and `rounds: 1` gives none ``. Sites: `docs/cloud.md:472-475`, `docs/troubleshooting.md:451-453`, `docs/factory.md:110-111`, `src/cli/commands/config.ts:1099-1100` (with `docs/configuration.md:88` by `node scripts/generate-docs.mjs`), `content/skills/st-unattended/references/cloud.md:115-116`, `docs/specs/everyday-flows.md:6975-6976`. Fewer promises: `docs/cloud.md:459-460` drops "and only when nothing but a wait stops that head" for "at most once per head", and `docs/specs/everyday-flows.md:6952-6953` reads "so no request goes on a head that cannot land", since its next sentence spends a round on one. The sentence at `docs/specs/everyday-flows.md:6956-6957` is correct and stays. Literal pins: `test/docsPages.test.ts:5920`, with `docs/factory.md` joining the list at `:5918`, and `test/corpus/skills/unattended.test.ts:1283`, each with a `TEST CHANGE, justified:` line. No page stamp moves: `cut` re-attests. The tests that pin the unpinned branches, each failing without its branch: `!standing.already` (`src/cli/commands/runLand.ts:776`): a findings verdict on a pull request already merged at the head posts nothing; a failed POST on the marker-alone path (`:781-785`): `notDone` names the status, `requestFailed` ends the wait, and a session refuses with no `asks.pending`; the gap words at `src/cli/commands/gate.ts:1628`, `:1630`, `:1661`, each reaching the `direct-push` evidence through `test/cli/commands/gatePreflight.test.ts`; and an exit-code assertion on `test/cli/commands/runLand.test.ts:2653`, whose failed thread re-read ends as `Held` (`src/cli/commands/runLand.ts:927`), leaves `jobFailed` false (`:976-977`) and so exits 0, the value to assert. That exit is narrower than the header's "a read or a write GitHub did not answer" (`:123-124`) and `REQ-FLOW-157`'s exit sentence in `docs/specs/everyday-flows.md`: both say a read that fails into a decision holds, with its line, and exits 0.
- testCriteria: every site reads the one sentence, and no page reads "the tool was asked on"; `docs/cloud.md` no longer reads "only when nothing but a wait stops"; the four new cases and the exit assertion pass, and each fails with its branch removed. Consumer tests: `test/docsPages.test.ts`, `test/corpus/skills/unattended.test.ts`, `test/cli/docs/configReference.test.ts`, `test/cli/commands/runLand.test.ts`, `test/cli/commands/gatePreflight.test.ts`, `test/runs/reviewTool.test.ts`, `test/evals`.
- edgeCases: `test/docsPages.test.ts:5913` keeps its `rounds: 1` pin, which the sentence still carries; `references/cloud.md`'s sentence came after the four cases that quote that file, so no case quotes it, which the locator gate confirms; `clean: reaction` sends no request and posts no marker, so that page's limit line stands.
- depends_on: own-server-verb (one writer of `src/cli/commands/config.ts`), propose-learning (one writer of `test/docsPages.test.ts` and the golden snapshots)
- verify: `npx vitest run test/docsPages.test.ts test/corpus test/evals test/cli/docs/configReference.test.ts test/cli/commands/runLand.test.ts test/cli/commands/gatePreflight.test.ts test/runs/reviewTool.test.ts test/emit/crossClientGoldens.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: `src/cli/commands/runLand.ts` and `src/cli/commands/gate.ts` are security-sensitive by the class file, and this unit changes no behaviour there: a comment and tests. Abuse: a person trusting a promise the land does not keep. Stopped by the sentence being walked to the code and pinned.

### clone-land — a person's clone lands a cloud run's held pull request

- id: clone-land
- requirements: REQ-FLOW-132, REQ-FLOW-165
- files: `src/cli/commands/runLand.ts`, `src/runs/gitSurface.ts`, `content/skills/st-unattended/SKILL.md`, `docs/cloud.md`, `docs/factory.md`, `docs/troubleshooting.md`, `SECURITY.md`, `test/cli/commands/runLand.test.ts`, `test/runs/gitSurface.test.ts`, `test/docsPages.test.ts`, generated `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`
- interfaces: Rows `build/43`, `build/44` of file 1. Today `run land --run <first-run>` on a clone reads `Mode: unattended` (`src/cli/commands/runLand.ts:387`), so `--approved` refuses (`:456`) and the surface check refuses with `no pre-flight record` (`:461-462`). `run land --run <walk-id>` is attended and passes both, then fails three ways. (1) The marker: `runMarker(run)` (`:500`) names the walk, while the walk's body ends with the first run's (`src/cli/commands/run.ts:2635`, `:2651`), refused at `:505-507`. (2) The record: `prRecordRefusal` (`:511`) is asked for the walk's id, while the walk recorded the first run's (`src/cli/commands/run.ts:2656`). (3) The author: `ownPr` needs `pr.author` to equal `viewer` (`src/runs/landEvidence.ts:523-525`), and a person's `gh` login need not be the login that opened a cloud run's pull request. The change: in `src/cli/commands/runLand.ts`, after `head` (`:386`), `const resumed` is `head.resumes` (read as `src/cli/commands/run.ts:1535` reads it) only where `head.mode` is `attended`, the variable reads unset as `resumeCard.readsUnattended` reads it, the run's folder exists, the check `resumedList` makes for the body (`src/cli/commands/run.ts:2619`), and, new here, that run's record reads `Status: closed`; else `null`. Where it is set: `marker` and the `prRecordRefusal` run are `resumed`; `ledgerAt` (`:652`) reads both runs' ledgers, an open row on either holding; `viewer` (`:523`) takes the resumed record's `Login:` line where the head holds one, as `ended?.login` does for a job, else `actor`. Nothing else moves: every evidence read, the guard's ask on `--approved`, and `noteLanded` on the walk's own record. `src/runs/gitSurface.ts:291` keeps its opening words `no pre-flight record (` and adds that a run that ended elsewhere lands from its walk, so a person is not sent to `gate preflight` (`build/44`). `content/skills/st-unattended/SKILL.md:145`, which no case cites, adds at the walk's land line that `<id>` is the walk's own run id; no line is added. Pages: `docs/cloud.md`'s section `### A held pull request from a cloud run` and its pointers, `docs/factory.md`, `docs/troubleshooting.md`, and a `SECURITY.md` line naming this route and its residual. Each page says `not run` until a real run. Literal pins: `test/docsPages.test.ts:5928-5941`, which pin that a clone cannot land, each with a `TEST CHANGE, justified:` line; `no pre-flight record` in `test/runs/gitSurface.test.ts`, `test/cli/commands/runLand.test.ts`, `test/cli/commands/runEnd.test.ts`, `test/cli/commands/runCheckpoint.test.ts`, `test/cloud/ending.test.ts`, which keep passing on the opening words.
- testCriteria: a walk record over a closed run lands on evidence from a clone with no pre-flight record; `--approved <sha>` lands over an `asks` hold, and a moved head still refuses; an open row in the first run's ledger holds; an author that is neither `gh`'s login nor the head's `Login:` refuses, naming it; `STAMITY_UNATTENDED` set, or an open first record, leaves the marker refusal as it is; a record with no `Resumes:` lands as today. Consumer tests: `test/cli/commands/runLand.test.ts`, `test/runs/landEvidence.test.ts`, `test/runs/gitSurface.test.ts`, `test/docsPages.test.ts`, `test/hooks/personOnlyGuard.test.ts`, `test/corpus/skills/unattended.test.ts`, `test/cloud/ending.test.ts`.
- edgeCases: a `Resumes:` naming no run folder keeps today's refusal; a run with the land job off carries no `Login:` line, so the land refuses unless `gh`'s login opened the pull request, and the page sends that person to GitHub's merge; a walk with no `--approved` lands only where nothing asks; a single-account repository cannot tell the person from the run, the limit `ownPr` already states.
- depends_on: land-wording (one writer of `src/cli/commands/runLand.ts`, `docs/cloud.md`, `test/docsPages.test.ts` and `test/cli/commands/runLand.test.ts`)
- verify: `npx vitest run test/cli/commands/runLand.test.ts test/runs/landEvidence.test.ts test/runs/gitSurface.test.ts test/cli/commands/runEnd.test.ts test/cli/commands/runCheckpoint.test.ts test/docsPages.test.ts test/hooks/personOnlyGuard.test.ts test/cloud test/corpus test/evals test/emit/crossClientGoldens.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a record file a run can write, which here widens who may land. It trusts `Resumes:` only on an attended record, with the variable unset, over a closed run. Abuse: an unattended run writes a walk record of its own to skip the surface compare. Stopped by those three conditions, by every GitHub evidence read still holding, and by the guard's ask on `--approved`. Residual, stated in `SECURITY.md`: a locally declared run with the variable unset skips the surface compare after its own close; the evidence still binds.

### guide-truth — the factory guide says what a first reader finds

- id: guide-truth
- requirements: spec carries no ids
- files: `docs/factory.md`, `docs/cloud.md`, `test/docsPages.test.ts`
- interfaces: Seven findings from building a real starter by the guide. (1) With both clouds on, one `labeled` event starts two sessions on one branch, and nothing warns of it: say to use one cloud per label, and name it as a reading, not a run. (2) A pre-release CLI has no supported route to the land job, since the job installs by version before any head file exists: say so. (3) The fallback to the pinned version is safe only where the pin holds these verbs, and `cli-pin` cannot tell a tarball from the published copy: say so. (4) The guide says the body holds `Ref:`, while `content/commands/st-board.md` says only with a spec, and the parser needs none: make the guide match the parser. (5) Give a sample issue body for a person filing by hand. (6) `gate preflight`, `plan check` and `run` show only under their own `--help`: say where to find them. (7) `init` with no `origin` prints `platform: none detected`, which is harmless: say so.
- testCriteria: each sentence walks to the code that makes it true; `test/docsPages.test.ts` passes.
- edgeCases: this page's routes stay `not run` until a real run; a sample body must pass `plan check --contract` and the run contract's parser.
- depends_on: land-wording (one writer of `docs/cloud.md` and `test/docsPages.test.ts`)
- verify: `npx vitest run test/docsPages.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: No boundary moves: pages only.

### deps-website — the website's alerts and the open-alert sentence

- id: deps-website
- requirements: spec carries no ids
- files: `website/package.json`, `website/package-lock.json`, `SECURITY.md`
- interfaces: After #134 lands or in its place: `joi` 17.13.9 and `follow-redirects` 1.16.2 (that pull request's two), `overrides.qs` 6.16.1 in `website/package.json`, and `serialize-javascript` 7.1.4 by a lockfile update. `deepmerge` has no fixed release and stays. `SECURITY.md`'s "What is still open" states what stands: `glob` and `minimatch`, held by the latest `cacache` and `@tufjs/models`, with the code paths not reached; `deepmerge` in the site's build only. The root `package.json` and lockfile do not move, and the page says only that the package carries no override, not why: whether an override reaches a registry install is not settled, since a local-tarball install kept the older versions while npm's source reads as following the shrinkwrap.
- testCriteria: `npm audit` in `website/` reads only the `deepmerge` chain; the site builds under the machine lock; the `SECURITY.md` sentence matches the audit.
- edgeCases: the website lockfile is not in the package, so nothing ships from this unit but the sentence.
- depends_on: none
- verify: `npx vitest run test/docsPages.test.ts test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck`
- threat: Build-time packages only; no runtime boundary moves.

### copilot-trigger — where its limits allow

- id: copilot-trigger
- requirements: REQ-FLOW-164
- files: `docs/cloud.md`, and only if the platform allows it: `src/adapters/copilot.ts`, `src/types/manifest.ts`, `src/manifest/manifest.ts`, `src/manifest/ownedPaths.ts`, `src/detect/repoAnalyzer.ts`
- interfaces: First read GitHub's cloud-agent page: can a workflow start the agent, and with which token? If yes, a second emitted workflow beside `src/adapters/copilot.ts:587`, a mode key beside `setupSteps` defaulting to off, and owned-path entries (`src/manifest/ownedPaths.ts:106-107`, `:435-440`, `:543-546`), `OWNED_PATHS.version` rising from 5 to 6 (`:84-89`). If no, a docs row and nothing else.
- testCriteria: Given the read says no, `docs/cloud.md` says so with a dated row and no code changes; given yes, the emitted file's steps pass `test/adapters/copilot.test.ts`. Consumer tests: `test/adapters/copilot.test.ts`, `test/docsPages.test.ts`, and on yes `test/manifest/ownedPaths.test.ts`, `test/adapters/landWorkflow.test.ts`.
- edgeCases: community reports say an assigned agent does not always start, so the row reads `not run` until a real run; this unit never holds the cut.
- depends_on: own-server-core (one writer of `src/types/manifest.ts` and `src/manifest/manifest.ts`), guide-truth (one writer of `docs/cloud.md`)
- verify: `npx vitest run test/adapters/copilot.test.ts test/docsPages.test.ts test/manifest/ownedPaths.test.ts test/cloud test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: On no, a docs row and no boundary. On yes, the boundary is a workflow that starts an agent from a label. It trusts the labeller's write access only. Abuse: a read-level author starts a run. Stopped by `run contract`'s author and label checks, and the file being a person-only path.

### cut — 1.18.0

- id: cut
- requirements: spec carries no ids
- files: `.github/release-controls-checklist.md` (read, not changed), `CHANGELOG.md`, `package.json`
- interfaces: The release checklist, the minor lane, with its pre-tag lines walked as the cut's first step and each line started as "When each line starts" says (`.github/release-controls-checklist.md:172-178`). The eval: the full-set run the model-facing inputs force, on the composition rule file 1 set.
- testCriteria: every checklist line carries its evidence; npm serves 1.18.0 as `latest` with provenance. Consumer tests: the full gate.
- edgeCases: a tag, a publish and a release are each a person's act.
- depends_on: test-time-limit, safety-measure, own-server-core, own-server-verb, own-server-workspace, run-overview, human-only-list, propose-learning, land-wording, guide-truth, deps-website
- verify: `npm run lint && npm run typecheck && node scripts/ci/test-run.mjs --coverage`
- threat: The boundary is what ships to every installer. It trusts the tagged tree. Abuse: a release cut from an unproven tree. Stopped by the checklist's evidence per line, and the tag and publish being a person's acts.

## Risks

- **Warning: `content/skills/st-unattended/SKILL.md` is at its cap of 163 body lines,** and two units write it. Mitigation: `human-only-list` and `clone-land` each join text to a line no case cites, adding none, and a real edge orders them.
- **Warning: `st-qa`'s reversal touches the eval cases that quote it, eight of which name the file.** Mitigation: re-read each before the sentence changes.
- **Warning: `clone-land` widens who may land, on a record a run can write.** Mitigation: three conditions on `Resumes:`, every evidence read kept, and a `SECURITY.md` line naming the residual. It reads `not run` until a real run.
- **Warning: `clone-land` reaches about twelve files, past the ceiling of about 8.** Mitigation: most are one-sentence page edits and generated snapshots, and the pins at `test/docsPages.test.ts:5928-5941` must move with the code, so it stays one unit, near 300 changed lines.
- **Warning: the logic bundle's budget, `LOGIC_BUDGET_BYTES` at `tsdown.config.mjs:134`, is owned by no unit.** File 1 hit it three times. Mitigation: the integration lane reads the `[size]` line after each source unit and raises the budget with its reason, with `test/support/support.test.ts`, before a build fails.
- **Minor: an older CLI refuses a selected own server.** Accepted: it fails safe.

## Open questions

None.

## Follow-ups

- Reshape the MCP catalog · when: the 2.0 planning session starts · files: `src/mcp/catalog.ts`
- Read what `current_user_can_bypass` returns for an administrator, how the webhook sends its key, and which setup line gives Claude's cloud Node and `gh`, then state each in `docs/factory.md` (file 1's build/14, build/41, review/114) · when: the first real runs on the scratch repository · files: `docs/factory.md`, `src/runs/preflight.ts`
- Build the `clone-land` cell above, kept unbuilt: a person's clone refuses today and the person merges on GitHub · when: a real run shows the hand merge is not enough · files: `src/cli/commands/runLand.ts`, `src/runs/gitSurface.ts`
- Let a referenced `api_key` or `password` parameter with another after it clear an own row, or write down that it goes last · when: the 2.0 planning session starts · files: `src/pack/manifest.ts`, `src/mcp/secretScan.ts`
- Stop refusing a bare login on an own row's link that is not a web link · when: the first report of such a refusal, or the 2.0 planning session, whichever is first · files: `src/mcp/ownServers.ts`, `test/mcp/ownServers.test.ts`, `SECURITY.md`
- Stop refusing a correct own row as injection in its two narrow shapes, read with the two rows above (review/83) · when: the first report of it, or the 2.0 planning session, whichever is first · files: `src/mcp/ownServers.ts`
- Have the own-row seam take its field names from the validator, not from masks over its sentences · when: the 2.0 planning session starts · files: `src/mcp/ownServers.ts`, `src/pack/manifest.ts`, `src/config/parse.ts`
- Make `clean --pack` over a bad own row take the pack's hooks out of the documents (review/82) · when: the first report of it, or the 2.0 planning session, whichever is first · files: `src/cli/commands/clean.ts`
- Pin `### Copilot's limits` with a test and move REQ-FLOW-164's criterion off judgment (review/85) · when: plan 017 runs its first file · files: `test/docsPages.test.ts`, `docs/specs/everyday-flows.md`
- Cite the Copilot row's vendor pages in the capability matrix's cloud table, so each release re-reads them (build/24) · when: plan 017 runs its first file · files: `docs/cloud.md`, `docs/capability-matrix.md`
- Close the `learn capture` residual `SECURITY.md` states for a file a local unattended run writes by hand · when: the 2.0 planning session starts · files: `src/cli/commands/learn.ts`, `SECURITY.md`
- Decide which workspace root the model lister keeps out when workspaces nest, the deferral inbox's waiting row · when: the 2.0 planning session starts, or the first change to that lookup · files: `src/cli/engine/clientModels.ts`
- Reword the deleted-row notes in the eval cases, since each note reaches the judge and the strict reader rejects a line naming a deleted row · when: before the first eval run after the 1.18.0 tag · files: `evals/cases-v6`, `scripts/eval/instrument.mjs`, `scripts/eval/run.mjs`
- With that rewording, end the need for the grader's drop of a deleted row: a concern with no pass or fail word goes with it today · when: before the first eval run after the 1.18.0 tag · files: `scripts/eval/run.mjs`, `evals/SET-v7.md`
- With that rewording, settle the cases where a deleted id is reused by a live row, which stay strict · when: before the first eval run after the 1.18.0 tag · files: `evals/cases-v6`
- Add the records test for run 58's repeat · when: after the 1.18.0 tag · files: `test/records/run27Repeats.test.ts`
- Add an eval case walking a morning row whose `do:` differs from its act · when: the next eval set edit, after the 1.18.0 tag · files: `evals/cases-v6`, `content/commands/st-work.md`
- Add a source sentence and a case for opening a locator or marking a row `ungraded`; the sentence sits in a pack file, so it needs the maintainer's word while packs are frozen · when: the next eval set edit, after the 1.18.0 tag · files: `packs/production/commands/st-production-review.md`, `evals/cases-v6`, `test/packs/production.test.ts`
- Give the test-runner a way to hand its result back in a Claude cloud session, so the test gate reads there (prove/1) · when: the first planning session after the 1.18.0 tag · files: `content/agents/stamity-test-runner.md`, `content/skills/st-unattended/SKILL.md`
- Let a cloud run's `morning.md` parse with a line before its first section, or have the run never write one (prove/2) · when: the first planning session after the 1.18.0 tag · files: `src/runs/morning.ts`, `content/skills/st-unattended/SKILL.md`
- Find the run marker when Claude's cloud puts its footer after it, in the land job and in the session's `run land` (prove/3) · when: the first planning session after the 1.18.0 tag · files: `src/cli/commands/runLand.ts`, `src/runs/pullRequest.ts`, `content/skills/st-unattended/references/cloud.md`
- Find a Cursor cloud setup whose push `direct-push` can tie to gh's identity, or state that none exists (prove/4) · when: the first planning session after the 1.18.0 tag · files: `src/runs/preflight.ts`, `docs/cloud.md`, `docs/factory.md`
- Read a 403 on the permission read in `/st-pr-resolve` and `/st-board` the way `personRight` does, not as no write right (build/25, build/26) · when: the first planning session after the 1.18.0 tag · files: `content/commands/st-pr-resolve.md`, `content/commands/st-board.md`
- State in the capability matrix that Claude's proxy refuses the `collaborators` and organisation membership reads (build/27) · when: the first planning session after the 1.18.0 tag · files: `src/hooks/model.ts`, `docs/capability-matrix.md`
- Have `run contract` say when a pass came from the 403 fallback (build/28) · when: the first planning session after the 1.18.0 tag · files: `src/cli/commands/runContract.ts`

## Drop list

| Item | Revisit when |
|---|---|
| A new required section on the morning list | an older list no longer needs to parse |
