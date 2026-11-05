---
id: factory-bridge-02
intent: roadmap
stamp: 2ce31e5a9fe3e5e302b47cc7f92cd4fed655665a 2026-11-04
reads: [.github/release-controls-checklist.md, content/skills/st-learn/SKILL.md, content/skills/st-qa/SKILL.md, content/skills/st-unattended/SKILL.md, docs/cloud.md, docs/specs/everyday-flows.md, docs/workspaces.md, src/adapters/copilot.ts, src/change/personOnlyPaths.ts, src/cli/commands/config.ts, src/cli/commands/config/mcp.ts, src/cli/commands/learn.ts, src/cli/commands/run.ts, src/content/userContent.ts, src/learnings/store.ts, src/manifest/manifest.ts, src/mcp/catalog.ts, src/mcp/emit.ts, src/pack/manifest.ts, src/pack/projection.ts, src/runs/landEvidence.ts, src/runs/morning.ts, src/types/manifest.ts, src/workspace/manifest.ts, src/workspace/resolve.ts]
depends_on: [docs/plans/023-factory-bridge-01.md]
---

# The factory bridge, the rest and the cut — file 2 of 2

This file is self-contained. It follows `docs/plans/023-factory-bridge-01.md` and runs on `main` as that file left it, so
its stamp will read stale on the paths file 1 moved: re-read those at its start and refresh the stamp.

## Context

File 1 gets an item from ready to merged. This file gives the person what they need around that: their own company
knowledge server, one short page after a run, one list of what is truly theirs, and learning that proposes instead of
editing itself. Copilot's trigger is added where its limits allow, and it never gates the release. It ends with the 1.18.0 cut.
Out of scope: the catalog's reshaping and everything else that waits for 2.0.

## Roadmap lenses

Stage: `solo`. Business lens unavailable for market size and revenue: Stamity is a common good and nothing here is priced.

| Outcome (business lane) | Measured by | Unblocked by (technical lane) |
|---|---|---|
| A company's own knowledge reaches every run | a repository names its server and it emits with the pack bar's checks | `own-server` |
| A person trusts a run without reading it | one short page says what happened, how and why | `run-overview`, `human-only-list` |
| Stamity improves with use, under a person's eye | a run proposes a learning and a person accepts it | `propose-learning` |
| 1.18.0 ships | npm `latest` and the release's advisories | `cut` |

`copilot-trigger` is `enabling`: it widens reach and never gates.

## Decisions

- **Own servers ride the pack bar:** they pass `validatePackMcpServer`, so the pin and secret checks are the packs', and the catalog stays.
- **The overview is a verb, not a file `run end` writes:** the land rows reach `morning.md` after `run end`.
- **The human-only list reuses `## Person's calls held`,** with one row grammar. A new required section would stop older lists parsing.
- **A row keeps its `Not done:` line too:** an unproven row must not read as done because a person now owns it.
- **Propose-only defaults to leaving it out:** no answer never accepts.

## Spec delta

Stated against `docs/specs/everyday-flows.md`. Ids continue from file 1.

### REQ-FLOW-160 — A repository names its own knowledge server (ADDED)

- Given a valid `mcp.ownServers` row, when `sync` runs, then the server emits as a pack's would, with its pin and secret checks.
- Given a row with an unpinned launcher or a literal secret, then the manifest is refused and names the row.
- Given a workspace `mcp` block, then a member's own server survives by the merge rule, not by replacement.

### REQ-FLOW-161 — One short page says what a run did (ADDED)

- Given a run folder, when `stamity run overview --run <id>` runs, then it prints what happened, how, why and the human-only list, and writes nothing.

### REQ-FLOW-162 — What only a person can do lands on one list, with why (ADDED)

- Given an act an agent tried and failed, or truly only a person can do, when a run ends, then one row reads `tried: <act> · failed: <why> · yours because: <reason> · do: <exact step>`.
- Given a refused act, then the row reads `refused, not tried again` and no agent respells it.

### REQ-FLOW-163 — A run proposes a learning; a person accepts it (ADDED)

- Given `learn capture --propose --run <id>`, then the gates run and the proposal lands in the run folder, not in `.stamity/learnings/`.
- Given `learn accept --run <id> --proposal <slug>` from a person, then every gate re-runs and it goes live. Under an unattended mode the verb refuses.

### REQ-FLOW-164 — Copilot's trigger, where its limits allow (ADDED)

- Given a workflow can start Copilot's cloud agent, when the ready label lands, then a run starts by reference. Given it cannot, then the page says so and no release waits on it.

### REQ-FLOW-094 — The morning list (MODIFIED)

The list's held section carries the row grammar of REQ-FLOW-162.

### REQ-FLOW-133 — Land asks (MODIFIED)

`.stamity/learnings/**` and `.stamity/overrides/**` become held paths that still land on evidence.

## Units

The rules of file 1's Units section bind here too, restated in short: whole-tree checks in every `verify`, one writer per file, never a full suite in a lane, regenerate derived files.

### own-server — a repository's own knowledge server

- id: own-server
- requirements: REQ-FLOW-160
- files: `src/types/manifest.ts`, `src/manifest/manifest.ts`, a new `src/mcp/ownServers.ts`, `src/mcp/emit.ts`, `src/cli/commands/config/mcp.ts`, `src/cli/commands/config.ts`, `src/workspace/resolve.ts`, `src/cli/commands/workspace.ts`, `src/workspace/model.ts`, generated `docs/reference/mcp-servers.md`, tests under `test/mcp`, `test/workspace`, `test/cli/commands/configMcp.test.ts`
- interfaces: `mcp.ownServers?: PackMcpServerDefinition[]` (`src/types/manifest.ts:148`). A new seam turns rows into supplied rows through `validatePackMcpServer` (`src/pack/manifest.ts:1475`) and merges them with `packMcpServers` (`src/pack/projection.ts:800`). Reserved `sourcePackId` `:own`, which `PACK_NAME_PATTERN` (`src/pack/manifest.ts:245`) cannot match. A verb `config mcp own <file>`, dispatched at `src/cli/commands/config.ts:1610`, refusing an id that matches a pack's. The validator runs at this seam, not in the manifest reader. Add a text-level scan over `description` and `blastRadius`, since `scanPackBodies` runs only at install. Workspace: the four sites `src/workspace/resolve.ts:216-219`, `src/cli/commands/workspace.ts:950-956`, `:988-993`, `src/workspace/model.ts:39`, plus a merge rule.
- testCriteria: a valid row emits with the pin checks; an unpinned launcher and a literal secret are refused; `clean --pack` leaves own rows; a workspace block keeps a member's own server.
- edgeCases: no direct `url` entry exists, so a remote server goes through a pinned bridge; an id clashing with a curated server is refused; an older CLI refuses a selected own id, so a downgrade fails safe.
- depends_on: none
- verify: `npx vitest run test/mcp test/pack/manifest.test.ts test/workspace test/cli/commands/configMcp.test.ts test/cli/docs/referencePages.test.ts`
- threat: The boundary is a manifest row that runs a program. It trusts only rows that pass the pack bar. Abuse: a row launching an unpinned package. Stopped by `assertPinnedArgs` and the manifest being a person-only path.

### run-overview — one short page

- id: run-overview
- requirements: REQ-FLOW-161
- files: a new `src/runs/overview.ts`, `src/cli/commands/run.ts`, generated `docs/cli-reference.md`, new `test/runs/overview.test.ts`
- interfaces: `export function overviewFrom(input: {record: string; ledger: LedgerRow[]; morning: string | null}): string`, pure. `stamity run overview --run <id> [--json]`, read-only, reading with the caps at `src/cli/commands/run.ts:227-230`, using `parseMorning`, `parseLedgerText`, `blastRadiusSection`. Sections: what happened (status, units, land), how (gates, rounds, usage), why (defaults, choices), then the human-only list. Not in `RUN_VERBS` (`src/hooks/personOnly.ts:4616`): it pushes nothing.
- testCriteria: a sample run prints four sections in order; a missing `morning.md` prints a line saying so; the verb writes no file.
- edgeCases: a ledger that fails to parse prints the record's facts and names the failure; a run with no land yet says so.
- depends_on: none
- verify: `npx vitest run test/runs/overview.test.ts test/runs/morning.test.ts test/cli/docs/cliReference.test.ts`

### human-only-list — one list, with why

- id: human-only-list
- requirements: REQ-FLOW-094, REQ-FLOW-162
- files: `content/skills/st-unattended/SKILL.md`, `content/skills/st-qa/SKILL.md`, `test/corpus/skills/flow.test.ts`, `test/corpus/skills/unattended.test.ts`, the eval cases quoting the changed sentence
- interfaces: Reuse `## Person's calls held` and the question kind `held`, with the row grammar of REQ-FLOW-162. No parser change (`src/runs/morning.ts:193`). `st-qa`: a row outside the five that no route proves goes to this list with its why and stays on `Not done:` as `not proven: <reason>`. List rows sit outside `MORNING_QA_MAX` (`src/runs/morning.ts:63`). `SKILL.md` is at its cap, so text goes after `## Chains` or into a reference.
- testCriteria: the corpus tests find the grammar; `test/corpus/skills/flow.test.ts:695`, `:726` pass on the new sentence; every eval case quoting it is re-read and its range holds.
- edgeCases: a refused act is never respelled; `benign-qa-cli-change-no-person-row` is re-read and its expected answer checked.
- depends_on: run-overview
- verify: `npx vitest run test/corpus/skills test/evals test/emit/crossClientGoldens.test.ts test/corpus/emissionGoldens.test.ts`

### propose-learning — a run proposes, a person accepts

- id: propose-learning
- requirements: REQ-FLOW-133, REQ-FLOW-163
- files: `src/cli/commands/learn.ts`, `src/change/personOnlyPaths.ts`, `src/runs/landEvidence.ts`, `src/cli/commands/run.ts`, `content/skills/st-learn/SKILL.md`, `test/cli/commands/learn.test.ts`, `test/change/personOnlyPaths.test.ts`, `test/runs/landEvidence.test.ts`
- interfaces: `learn capture --propose --run <id>` runs the dry-run gates, then writes `.stamity/runs/<id>/proposals/<slug>.md`. Stage that folder as `held/` is (`src/cli/commands/run.ts:212`, `:1089`). One morning row, kind `decision`, `1 leave it out · 2 accept`, default `1`. `learn accept --run <id> --proposal <slug>` joins the verb choices (`src/cli/commands/learn.ts:604`), re-running every gate through `persistLearning`, or `saveUserContent` for an override, and refusing under an unattended mode. Both globs join `PERSON_ONLY_PATHS` and `LANDS_ON_EVIDENCE`, or every attended run with a learning would ask at land (`src/runs/landEvidence.ts:65`).
- testCriteria: `--propose` writes nothing under `.stamity/learnings/`; `accept` re-runs the gates and refuses unattended; a run that still captures live is held and land asks.
- edgeCases: a proposal naming a slug already live is refused; no answer leaves it out.
- depends_on: human-only-list
- verify: `npx vitest run test/cli/commands/learn.test.ts test/change/personOnlyPaths.test.ts test/runs/landEvidence.test.ts test/cli/commands/runEnd.test.ts`
- threat: The boundary is text a run wrote that later runs would follow. Abuse: a run edits what later runs read. Stopped by the live folders being held paths and accept being a person's verb.

### copilot-trigger — where its limits allow

- id: copilot-trigger
- requirements: REQ-FLOW-164
- files: `docs/cloud.md`, and only if the platform allows it: `src/adapters/copilot.ts`, `src/types/manifest.ts`, `src/manifest/manifest.ts`, `src/manifest/ownedPaths.ts`, `src/detect/repoAnalyzer.ts`
- interfaces: First read GitHub's cloud-agent page: can a workflow start the agent, and with which token? If yes, a second emitted workflow beside `src/adapters/copilot.ts:587`, a mode key beside `setupSteps` defaulting to off, and owned-path entries (`src/manifest/ownedPaths.ts:105`, `:427`, `:527`). If no, a docs row and nothing else.
- testCriteria: Given the read says no, `docs/cloud.md` says so with a dated row and no code changes; given yes, the emitted file's steps pass `test/adapters/copilot.test.ts`.
- edgeCases: community reports say an assigned agent does not always start, so the row reads `not run` until a real run; this unit never holds the cut.
- depends_on: none
- verify: `npx vitest run test/adapters/copilot.test.ts test/docsPages.test.ts`

### cut — 1.18.0

- id: cut
- requirements: spec carries no ids
- files: `.github/release-controls-checklist.md` (read, not changed), `CHANGELOG.md`, `package.json`
- interfaces: The release checklist, the minor lane, with its pre-tag lines walked as the cut's first step. The eval: the full-set run the model-facing inputs force, on the composition rule file 1 set.
- testCriteria: every checklist line carries its evidence; npm serves 1.18.0 as `latest` with provenance.
- edgeCases: a tag, a publish and a release are each a person's act.
- depends_on: own-server, run-overview, human-only-list, propose-learning
- verify: `npm run lint && npm run typecheck && node scripts/ci/test-run.mjs --coverage`

## Risks

- **Warning: `content/skills/st-unattended/SKILL.md` is at its cap,** and file 1 moves it too. Mitigation: new text goes to a reference.
- **Warning: `st-qa`'s reversal touches five eval cases.** Mitigation: re-read each before the sentence changes.
- **Minor: an older CLI refuses a selected own server.** Accepted: it fails safe.

## Open questions

None.

## Follow-ups

- Reshape the MCP catalog · when: the 2.0 planning session starts · files: `src/mcp/catalog.ts`
- Have the route of record's driver write `## 0a. Safety measure`, and check the safety set against the set itself so a partial miss cannot render (file 1's build/5, review/9) · when: before a composed eval run · files: `evals/SET-v7.md`, `src/cli/docs/measurements.ts`
- Let a person's clone land a cloud run's held pull request: the walk and `run land` need the pre-flight and pull-request records only the cloud machine held, a person's yes at the morning walk cannot land for the same reason, and the refusal's fix text points at a verb that cannot help there (file 1's whole-branch review, build/43, build/44) · when: the `run-overview` unit, or a real run that meets it · files: `src/cli/commands/runLand.ts`, `src/runs/resumeCard.ts`
- Say on the pull request when a run-end notice fails on an exit-0 `run end` (file 1's review/73) · when: the `run-overview` unit · files: `src/cli/commands/run.ts`
- Read what `current_user_can_bypass` returns for an administrator, how the webhook sends its key, and which setup line gives Claude's cloud Node and `gh`, then state each in `docs/factory.md` (file 1's build/14, build/41, review/114) · when: the first real runs on the scratch repository · files: `docs/factory.md`, `src/runs/preflight.ts`

## Drop list

| Item | Revisit when |
|---|---|
| A new required section on the morning list | an older list no longer needs to parse |
