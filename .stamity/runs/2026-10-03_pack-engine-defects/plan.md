# In-flow plan — the four 1.11.0 pack-engine defects, the three init rows

Run `2026-10-03_pack-engine-defects`. Base `40371e1b` on branch `fix/pack-engine-defects`: `main` at `c0eb1100`, plus
gate 2's failing tests (`test/pack/packEngineDefects.test.ts`, 34 cases) and the debug record.
- Diagnosis and root cause: `.stamity/runs/2026-10-03_debug-pack-defects/record.md`.
- Research, in this run's `reports/` folder:
  - `plan-researcher-r1.md`, the engine map: causal chains, seams, the ops rename, the plugin and overlay paths, the
    harness, coverage floors;
  - `plan-researcher-r2.md`, the census of docs, specs and literal pins.

Facts the units rest on:
- **Codex.** codex-cli 0.160.0 (2026-10-03, `codex debug prompt-input`) shows its model 17 Stamity rows: the 8 core
  skills and 9 rule-skills. The nine touchpoints, each with `allow_implicit_invocation: false` in its
  `agents/openai.yaml`, are absent. No description was shortened.
- **Plugin-owned classes** (`src/plugins/capabilityFile.ts:392-397`):

  | Client | Owned classes |
  |---|---|
  | claude | agent, skill, command, hooks |
  | cursor | agent, skill, command, rule, hooks |
  | copilot | agent, skill, command, hooks |
  | codex | skill, hooks |

- **A clash already installed.** Re-running `add` never deletes files the new version dropped
  (`src/pack/install.ts:1226-1247`, `:1288-1293`). So the truthful remedy is `stamity clean --pack <id>`, then
  `stamity add <id>`, then `stamity sync`.
- **The core's Codex list.** It is 5,570 characters of shown rows, from the 2026-10-03 measurement on the emitted tree.
  u3 re-measures it.
- **Coverage floors** bind under `npm test -- --coverage` only: `src/emit/planner.ts` 100/90/100/100,
  `src/emit/ownership.ts` 100, `src/emit/capabilityMatrix.ts` 96/93/100/100, `src/emit/skillsProjection.ts`
  98/90/100/100. `src/pack/**`, `src/adapters/**`, `src/content/**` and `src/cli/**` are report-only.
- **Paths in user-facing messages are POSIX** (`p.replaceAll("\\", "/")` at the message seam). The tests assert POSIX
  substrings and CI runs a Windows leg.
- **Specs are not edited by any unit.** Each unit returns its spec delta, and the spec-author merges the deltas at the
  close, confirm-gated.
- **No CHANGELOG edit.** This repository writes a release's section at its cut, and merges without a release add none.
  This run's record carries the change list for the 1.12.0 section.
- **Declared defaults.**
  - An overlay on a pack skill is refused at the user (overrides) stage. At the fork stage it is skipped and reported,
    the way a fork orphan overlay is, so a fork's own content never breaks `sync` in a consumer repo.
  - The cross-class name check refuses on every client set: clients can be added later, and on Claude the skill hides
    the command.

## Execution order and lanes

Manual worktree lanes outside the checkout, each branched from the integration branch's head at its wave, with
`node_modules` symlinked. A lane's unit is reviewed in its lane, then cherry-picked onto `fix/pack-engine-defects`.

| Wave | Integration lane `pack-defects` | Parallel lanes |
|---|---|---|
| 1 | `u1a-name-detector-add` | `pd-ops`: `u2-ops-rename`; `pd-codex`: `u3-codex-shown-rows`; `pd-origin`: `u4a-pack-skill-origin`; `pd-creator`: `u5b-creator-text`; `pd-init`: `u6-init-fixes` |
| 2 | `u1b-sync-refusal` | `pd-overlay`: `u5a-overlay-refusal` (branched after u1a lands; it shares `src/content/catalog.ts`) |
| 3 | `u4a` cherry-picked, then `u4b-pack-reach-row` (after u1b and u4a; it shares `src/emit/planner.ts` and `docs/plugins.md`) | — |
| 4 | the remaining lanes cherry-picked, then `u7-packs-docs` | — |

Single writers, by file:
- `src/content/catalog.ts`: u1a, then u5a.
- `src/emit/planner.ts`: u1b, then u4b.
- `docs/plugins.md`: u4a, then u4b.
- `docs/packs-and-trust.md`: u2 (pin lines), then u7 (prose).
- `.stamity/inbox.md` and the run records: the orchestrator.

Every unit's test-only exception: tests in `test/pack/packEngineDefects.test.ts` are the gate and are not edited. Any
other test a unit changes carries an inline `TEST CHANGE, justified:` comment.

## Units

### u1a-name-detector-add — one cross-class name detector, and `add` refuses a clash before writing

| Field | Content |
|---|---|
| `id` | `u1a-name-detector-add` |
| `requirements` | spec carries no ids (no pack spec exists; the debug run's defect 1) |
| `files` | `src/content/catalog.ts` (new exports beside `emittedIdFor`, `:562`); `src/pack/install.ts` (`planPackInstall`, after `readPackArtifacts` `:1017`; the plan type `:188`); `src/cli/commands/add.ts` (`:474`, `:493-499`, `:649-651`); a new `test/content/invocableNames.test.ts`; additions to `test/cli/commands/add.test.ts` or `test/pack/install.test.ts` only if needed |
| `interfaces` | See below the table. |
| `testCriteria` | `npx vitest run test/pack/packEngineDefects.test.ts -t "B[1-4]"` passes on every client set: `add` exits non-zero, names both owners and the pack on one line, and leaves the tree unchanged. The new unit tests cover: one pack's command and skill; a pack command against a core skill; a pack skill against a core command; pack against pack; a user override command against a pack skill; a same-class duplicate not reported here; and the shipped corpus (with the fork layer, if any) yielding no clash. The existing same-class shadow message (`test/pack/install.test.ts:371-372`) is unchanged. |
| `edgeCases` | **A command id already carrying `st-`:** `emittedIdFor` is idempotent, so no double prefix. **A skill directory that disagrees with its id:** use the directory, which is what ships (the catalog reports `filename-mismatch` separately). **A rule delivered as a skill:** `stamity-<id>` joins the index (`src/content/ruleDelivery.ts:64`); pack rules are never demoted. **Two artifacts of one pack:** one reason line naming both. **Windows:** every path in a reason line is POSIX. **`--json`:** the failure doc carries the same reasons. **No gate key is added** (the clash rides the plan, not the gate chain), so `GATE_OUTCOMES` and the receipt's `checks` do not move. |
| `depends_on` | none |
| `verify` | `npx vitest run test/pack/packEngineDefects.test.ts -t "B[1-4]" && npx vitest run test/content/invocableNames.test.ts test/cli/commands/add.test.ts test/pack && npm run lint && npm run typecheck` |

**Interfaces (u1a):**
1. `src/content/catalog.ts`:
   - `invocableNameOf(item)` returns the name a client invokes an item by, or `undefined`:
     - a command → `emittedIdFor(item)`;
     - a skill → the basename of its `SKILL.md`'s directory, as the corpus and pack skill lanes name the projected
       folder (`src/pack/projection.ts:593`, `src/emit/skillsProjection.ts:422-424`);
     - a rule delivered as a skill → `stamity-<id>`.
   - `findInvocableNameClashes(items)` returns `{ name, owners }` groups. A group is returned only when its owners span
     more than one class. Each owner carries:
     - `kind`: `command`, `skill` or `rule-skill`;
     - `id`;
     - `layer`: `core`, `fork`, `user` or `pack`;
     - `packId` when the layer is `pack`;
     - a POSIX `path`.
2. `planPackInstall` indexes every layer the next `sync` would project, plus the incoming pack: the corpus, the fork
   layer, the user overrides and the installed packs. It runs the detector and returns the clashes involving the
   incoming pack as a new plan field `nameClashes`. It writes nothing.
3. `add` refuses before any write when `nameClashes` is non-empty: exit 1, code `VALIDATION_ERROR`.
   - **Reason lines.** One per clash, e.g. `st-drill — pack "acme-demo" command "drill" and pack "acme-demo" skill
     "drill" both install as st-drill (one folder on Cursor and Codex; on Claude the skill hides the command)`. Another
     pack's owner is `pack "<id>"`; a core owner is written `the core skill "st-verify"` or `the core command "st-work"`.
   - **Message:** `pack "<id>" was not installed: <n> name(s) it would emit are taken`.
   - **`why`:** one sentence on the shared folder.
   - **`next`:** rename the artifact in the pack's source and re-run; when the other owner is an installed pack, first
     remove it with `stamity clean --pack <id>`.
   - The path-collision refusal (`add.ts:493-499`) stays as it is, for paths.

### u1b-sync-refusal — `sync` (and so `check`, `init`, `plugin setup`) names an installed clash

| Field | Content |
|---|---|
| `id` | `u1b-sync-refusal` |
| `requirements` | spec carries no ids (the debug run's defect 1) |
| `files` | `src/emit/planner.ts` (`planWithWarnings` after `resolveInstalledPackContent`, `:803-809`; the comments at `:444-458` and `:553-560`); tests for the new branch (a new `test/emit/plannerNameClash.test.ts`, or additions beside the planner's tests) |
| `interfaces` | See below the table. |
| `testCriteria` | `npx vitest run test/pack/packEngineDefects.test.ts -t "B5"` passes on every client set. The new branch is covered to `planner.ts`'s floor (100% statements, functions and lines, 90% branches) under `npm test -- --coverage`. No existing planner test changes. |
| `edgeCases` | **No pack installed:** zero cost beyond the detector. **A clash inside core and fork only:** a fork defect, so the remedy names the fork artifact's source. **Several clashes:** every one listed in one refusal. **Windows:** POSIX paths. **The drift gate:** `check` reports drift not evaluated with this message and exits 1, which is its existing contract. |
| `depends_on` | `u1a-name-detector-add` |
| `verify` | `npx vitest run test/pack/packEngineDefects.test.ts -t "B5" && npx vitest run test/emit test/cli/commands/check.test.ts test/cli/commands/sync.test.ts && npm run lint && npm run typecheck` |

**Interfaces (u1b):**
1. After installed packs resolve and before any row is built, run `findInvocableNameClashes` over the residue
   context's full item set: the corpus with its fork and user layers applied, and the installed packs.
2. If any clash involves a pack, or a user override, throw an `EngineError` (code `VALIDATION_ERROR`). It lists every
   clash in u1a's reason-line format, then the remedy per owner:
   - a pack: `run \`stamity clean --pack <id>\`, then \`stamity add <id>\` once the pack ships distinct names, then
     \`stamity sync\``;
   - a user override: rename or remove `<its path>`.

   The message never reads "Two planners emitted different content". The composer's single-writer check stays as the
   backstop.
3. Update two comments:
   - the one at `:444-458`, to say that an overlay on a pack skill is refused at `applyOverlays` (unit u5a);
   - the one at `:553-560`, to cite the new refusal.

### u2-ops-rename — ops's two clashing skill halves get distinct names

| Field | Content |
|---|---|
| `id` | `u2-ops-rename` |
| `requirements` | spec carries no ids (the bundled ops pack; it retires later, so this is the minimal change that lets `add ops` sync) |
| `files` | `git mv packs/ops/skills/st-release packs/ops/skills/st-release-runbook` (frontmatter `id: release-runbook`); `git mv packs/ops/skills/st-incident-response packs/ops/skills/st-incident-runbook` (`id: incident-runbook`); `packs/ops/commands/st-release.md` (`:113` names the skill); `packs/ops/agents/stamity-incident-responder.md` (`:16` names a wrong skill, `stamity-incident-response`); `packs/ops/pack.json` (integrity, regenerated); `src/pack/catalogPins.ts` (regenerated); `test/packs/ops.test.ts` (`:70-71`, `:109-114`, `:137`, `:142`, `:809`); `test/pack/installSmoke.e2e.test.ts` (`:966`); `docs/packs-and-trust.md` (`:48` pin prefix, `:55` file row, and nothing else) |
| `interfaces` | Renames only. Each command body and the incident agent name the new skill. Regenerate the pins with `node scripts/generate-pack-manifests.mjs --write`, then `node scripts/generate-pack-manifests.mjs` (read the script header, `:16-20`, for the order). No other prose changes. Over the eight-file ceiling on purpose: the unit is mechanical (two directory moves plus regenerated pins), and splitting it would leave a red pin between halves. |
| `testCriteria` | `npx vitest run test/pack/packEngineDefects.test.ts -t "tools=cursor: sync and check"` passes (the A-cursor case). `test/packs/ops.test.ts`, `test/pack/curated.test.ts`, `test/pack/installSmoke.e2e.test.ts` and `test/docsPages.test.ts` pass. A grep finds no `skills/st-release/`, `skills/st-incident-response/` or `stamity-incident-response` reference left under `packs/`, `src/`, `test/` or `docs/`. |
| `edgeCases` | **The command ids** (`release`, `incident-response`) and their files stay. **The skill bodies' mentions of `/st-release`** name the command and stay. **The ops agent's skill reference** was already wrong: fix it to `st-incident-runbook`. **Codex:** the new names add 16 characters to ops's list; after u3 ops fits beside the core (about 7,460 of 8,000). |
| `depends_on` | none |
| `verify` | `npx vitest run test/packs/ops.test.ts test/pack/curated.test.ts test/pack/installSmoke.e2e.test.ts test/docsPages.test.ts && npx vitest run test/pack/packEngineDefects.test.ts -t "tools=cursor: sync and check" && npm run lint && npm run typecheck` |

### u3-codex-shown-rows — the Codex list counts only the rows Codex shows its model, and names the packs

| Field | Content |
|---|---|
| `id` | `u3-codex-shown-rows` |
| `requirements` | REQ-PROVE-004 (`docs/specs/prove-behavior-and-value.md:143-166`), REQ-FLOW-026 (`docs/specs/everyday-flows.md:559-594`): return both deltas, edit neither |
| `files` | `src/adapters/codex.ts` (`:164-170`, `:403-415`, `:623-634`); `src/emit/capabilityMatrix.ts` (`:379-384`, `:1059-1060`); `docs/capability-matrix.md` (regenerated by `node scripts/generate-capability-matrix.mjs`); `test/adapters/codex.test.ts` (`:995-1016`, `:2097-2122`, `:2188-2190`); `test/emit/capabilityMatrix.test.ts` only if a literal there moves |
| `interfaces` | See below the table. |
| `testCriteria` | `npx vitest run test/pack/packEngineDefects.test.ts -t "C[12]"` passes for codex and all four. `codex.test.ts:995-1016` flips to admit a touchpoint-heavy setup, with a justified test change. The pin test measures shown rows only and equals the new figure. A new case: a skill folder whose `agents/openai.yaml` hides it is not counted. A second: the refusal names each pack's share and keeps the pinned substring. The capability-matrix staleness check passes after regeneration. |
| `edgeCases` | **A pack skill shipping its own hiding policy:** not counted. **A malformed `openai.yaml`:** counted, because a budget never under-counts on a parse failure. **No packs:** the refusal names the core's share only. **`ruleDelivery: always-on`:** the rule-skills leave the list as before. **The note at `codex.ts:363-364`** about a plain ask starting a touchpoint stays "unmeasured": the 0.160.0 measurement covers the listing only. |
| `depends_on` | none |
| `verify` | `npx vitest run test/adapters/codex.test.ts test/emit/capabilityMatrix.test.ts && npx vitest run test/pack/packEngineDefects.test.ts -t "C[12]" && npm run lint && npm run typecheck` |

**Interfaces (u3):**
1. **Count the shown rows only.** `skillsListCharacters` is called on the rows Codex shows its model. These are the
   `SKILL.md` rows of `core.skills` and of the touchpoint projection, minus every folder whose `agents/openai.yaml` row
   sets `policy.allow_implicit_invocation: false`. Write a small predicate over a folder's rows. It drops the nine
   touchpoints and every pack command by their policy, not by name, and drops a pack skill that ships such a policy.
2. **The cap.** It stays at 8,000.
3. **The refusal.** It keeps the substring `is <total> characters; this setup caps it at 8000`, pinned at
   `codex.test.ts:2188-2190`. Then it names the shares: the core's characters, and each installed pack's characters
   with its skill count, e.g. `installed packs add: acme-demo 3,671 characters (4 skills)`. It ends with the remedies:
   remove a pack with `stamity clean --pack <id>`, narrow the content selection, or set `ruleDelivery: "always-on"`.
   Attribute a row to its pack through the residue context's pack items, by artifact id. Do not rely on a row
   `origin` field: u4a adds `origin` but no pack id.
4. **Comments.** Rewrite the comments at `:164-170` and `:403-407` to say the count covers the rows Codex shows its
   model, citing the 0.160.0 measurement.
5. **The capability-matrix pin.** It becomes the measured shown-row figure of the core: expected 5,570 across 17
   skills, about 70% of the cap. Its comment and the renderer prose drop "and the nine touchpoints".

### u4a-pack-skill-origin — pack skills reach plugin-backed clients

| Field | Content |
|---|---|
| `id` | `u4a-pack-skill-origin` |
| `requirements` | REQ-PLUGIN-016's exemption (`docs/specs/plugin-lifecycle.md:636-637`): return the delta (true for skills; the other pack classes are still dropped and reported by u4b's row), edit nothing under `docs/specs/` |
| `files` | `src/pack/projection.ts` (`:603-608`); `src/cli/commands/plugin/probe.ts` (`:742-753`, the `plugin-duplicates` ledger source); `docs/plugins.md` (`:26-37` ownership-table note, `:355-357`); `SECURITY.md` (`:73-74`); tests for both edits |
| `interfaces` | Pack skill rows carry `origin: "pack"`, so the shared-tree exemption (`src/emit/planner.ts:865`) and Claude's (`src/adapters/claude.ts:560`) admit them. `plugin-duplicates` exempts a client row that came from a pack skill, the same way the planner does. Trace how such a row is recorded in the ledger (its owner, class and artifact id) and exempt exactly those rows, never a core row of a plugin-owned class. Docs say pack skills are written in plugin-backed mode, while pack commands, agents, rules and hooks are still dropped and reported (by `pack-reach`, u4b). |
| `testCriteria` | `npx vitest run test/pack/packEngineDefects.test.ts -t "D1"` passes on every client set. A new `check` case: a plugin-backed repo with a synced pack skill reads `plugin-duplicates` `pass`, and a core skill duplicated beside the plugin still fails it. `test/adapters/claude.test.ts:2051-2074` stays green. |
| `edgeCases` | **All four clients plugin-backed together** (repeated `--plugin-root`). **A pack skill and a core skill of one name:** already refused by the catalog. **A stale pack-skill copy left after `clean --pack`:** reclaimed by the existing projection reclaim (`src/pack/projection.ts:74-86`). |
| `depends_on` | none |
| `verify` | `npx vitest run test/pack/packEngineDefects.test.ts -t "D1" && npx vitest run test/adapters test/cli/commands/plugin.test.ts test/cli/commands/check.test.ts test/pack && npm run lint && npm run typecheck` |

### u4b-pack-reach-row — `check` fails an installed pack that reaches no client

| Field | Content |
|---|---|
| `id` | `u4b-pack-reach-row` |
| `requirements` | REQ-PLUGIN-016 (`docs/specs/plugin-lifecycle.md:619-628`, the doctor rows): return the delta, edit nothing under `docs/specs/` |
| `files` | `src/emit/planner.ts` (after the composed rows, around `:949`); `src/cli/commands/check.ts` (the probe, plus every pin of census §1: `:46`, `:1020`, `:1037-1084`, `:1155`, `:1614`, `:1647`); the plan type's file; `test/cli/commands/check.test.ts` (`:474`, `:491-518`); `docs/troubleshooting.md` (`:31-46`, `:82`, `:89-90`, `:93-108`); `docs/getting-started.md` (`:286`); `docs/plugins.md` (`:577`, plus a bullet beside `:580-599`); a new unit test for the reach computation |
| `interfaces` | See below the table. |
| `testCriteria` | `npx vitest run test/pack/packEngineDefects.test.ts -t "D2"` passes on every client set. Healthy fixtures read no `fail` row (`check.test.ts:418`, `:547`, `:1068`). The row-count and row-order pins move together with a justified test change. `test/docsPages.test.ts`'s probe-to-table equality sees `pack-reach`. The new planner code meets `planner.ts`'s floor under `--coverage`. |
| `edgeCases` | **Hooks.** A pack hook that the client's plugin carries ("not wired", `docs/specs/plugin-lifecycle.md:650-651`) counts as not reaching. **Several clients.** An artifact counts as reaching when it reaches any selected client. **No packs:** the row passes. **A pack partly dropped:** the row warns and does not fail. |
| `depends_on` | `u1b-sync-refusal` (single writer of `planner.ts`), `u4a-pack-skill-origin` (skills must reach first) |
| `verify` | `npx vitest run test/pack/packEngineDefects.test.ts -t "D[12]" && npx vitest run test/cli/commands/check.test.ts test/emit test/docsPages.test.ts && npm run lint && npm run typecheck` |

**Interfaces (u4b):**
1. **The reach data.** The emission plan reports, per installed pack, each artifact as reached or dropped. A dropped
   artifact carries its reason: `plugin-owned` (naming the client and class) or `declares no selected client`.
   Expose this as a plan field, e.g. `packReach`.
2. **The probe.** `check` adds the doctor row `pack-reach`, declared with the literal `const id = "pack-reach"`
   (`test/docsPages.test.ts:2761` reads ids only that way). Its statuses:
   - `fail` when an installed pack has no artifact reaching any selected client. The detail names the pack, says why,
     and gives the next step: remove it with `stamity clean --pack <id>`, or use the CLI's generated mode for that
     client.
   - `warn` when some artifacts are dropped because a client's plugin owns their class. The detail names each one.
   - `pass` when every artifact reaches, and also when no pack is installed.
   - `warn` "not evaluated", with the reason, when the plan cannot be built. The drift row already fails then.
3. **Exit code.** It follows the existing mapping: any `fail` exits 1.

### u5a-overlay-refusal — an overlay on a pack skill is refused, not dropped

| Field | Content |
|---|---|
| `id` | `u5a-overlay-refusal` |
| `requirements` | REQ-OVERLAY-003, REQ-OVERLAY-009, REQ-OVERLAY-014 (`docs/specs/overlay-layers.md:277`, `:463`, `:620`) and the stale cite at `docs/specs/fork-layer.md:161-162`: return the deltas, edit nothing under `docs/specs/` |
| `files` | `src/content/catalog.ts` (`applyOverlays`, `:1495-1530`); `src/cli/commands/validate.ts` (only if the refusal does not already surface as an error through `overlayFailure`, `:633-634`, `:669-670`); `test/cli/engine/emission.test.ts` (`:1570`, flipped with a justified test change: the old assertion encoded the defect); `docs/customization.md` (`:207-209`, `:224-230`, `:240-241`, `:263-286`, `:315-318`); a new unit test |
| `interfaces` | See below the table. |
| `testCriteria` | `npx vitest run test/pack/packEngineDefects.test.ts -t "E —"` passes on every client set: `sync` and `validate` exit non-zero and name the overlay's path and the skill. New unit tests: a user overlay on a pack skill refused; a fork overlay on a pack skill skipped with its reason; an overlay on a pack agent still applied. These stay green: `test/emit/plannerOverlay.test.ts:648`, `test/cli/engine/emission.test.ts:1002`, `:1021`. |
| `edgeCases` | **Both carriers:** `.customize.md` and `.customize.yaml`. **An overlay plus a full replacement of one pack skill:** already refused by exclusivity (`catalog.ts:1512-1517`), and the order stays. **Windows:** POSIX paths. **A pack skill whose pack was removed:** the overlay becomes an orphan, which keeps its existing user-stage refusal. |
| `depends_on` | `u1a-name-detector-add` (single writer of `src/content/catalog.ts`) |
| `verify` | `npx vitest run test/pack/packEngineDefects.test.ts -t "E —" && npx vitest run test/cli/engine/emission.test.ts test/emit/plannerOverlay.test.ts test/cli/commands/validate.test.ts test/content && npm run lint && npm run typecheck` |

**Interfaces (u5a):** in `applyOverlays`, once the base resolves to a skill with `originOf(base) === "pack"`:
1. **The user stage refuses.** It throws in the shape of the full-override refusal (`src/emit/planner.ts:632-636`),
   e.g. `Overlays on pack skills are not applied: the overlay at "<POSIX path>" patches pack "<packId>" skill "<id>",
   whose files ship byte-for-byte from the installed pack. Remove or rename <path>, or remove the pack (\`stamity clean
   --pack <packId>\`).`
2. **The fork stage skips and reports.** It uses the `forkOrphanSkipReason` pattern, with a reason naming the overlay
   and the pack skill.
3. **Overlays on other pack classes are unchanged.** They still apply on pack agents, commands and rules.
4. **`validate` reports the refusal as an error** and exits 1. `sync` exits 1 with the same text.
5. **Docs.** `docs/customization.md` says it: a pack skill's base can be neither patched nor replaced (both refused,
   not dropped), while a pack agent, command or rule can be. A fork overlay on an installed pack's skill is skipped and
   reported.

### u5b-creator-text — the creator agent stops promising overlays on pack skills

| Field | Content |
|---|---|
| `id` | `u5b-creator-text` |
| `requirements` | spec carries no ids (corpus text; the behaviour is u5a's) |
| `files` | `content/agents/stamity-creator.md` (`:55`, `:75-76`, `:106-107`, `:127-129`); `.claude/agents/stamity-creator.md` and `.stamity/manifest.json` (dogfood: `npm run build && node dist/cli.js sync`); `.apm/agents/stamity-creator.agent.md` (`node scripts/generate-apm-package.mjs`); `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` only if its own failure names it; `evals/cases-v6/golden/agent-creator-return-contract.md:5` and `evals/SET-v7.md:863` only if a line count before `:141` changes |
| `interfaces` | Each statement that an override or overlay of a pack artifact emits as in a repo without packs gains the exception: a pack skill can be neither replaced nor patched, and both are refused at `sync` and `validate`. A pack agent, command or rule can be patched. Keep every edit within its existing lines, so no line before `:141` moves and the eval case `agent-creator-return-contract` keeps its range (`content/agents/stamity-creator.md:14-17,141-258`). If a line count must change, move the range and the `SET-v7.md` row in the same unit (`.stamity/learnings/corpus-line-shifts-move-eval-case-source-ranges.md`). This is model-facing text, measured by the next release's full eval run (no eval run here). |
| `testCriteria` | `npx vitest run test/evals test/ci/apmPackage.test.ts test/corpus test/emit/crossClientGoldens.test.ts` passes. After the dogfood sync, `git status` shows only the creator's three copies and the manifest, each moved by this edit (`.stamity/learnings/corpus-edits-ship-with-a-dogfood-sync.md`). `node dist/cli.js check` reads drift clean. |
| `edgeCases` | **A sentence that would wrap past its line:** rephrase shorter rather than add a line. **The golden snapshot:** update only with the files named first and `--update` last (`.stamity/learnings/vitest-update-flag-takes-an-optional-value.md`), and read every moved `.snap`. |
| `depends_on` | none (codes against u5a's behaviour as this plan states it) |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/evals test/ci/apmPackage.test.ts test/corpus test/emit/crossClientGoldens.test.ts && node dist/cli.js check && npm run lint` |

### u6-init-fixes — the three init rows

| Field | Content |
|---|---|
| `id` | `u6-init-fixes` |
| `requirements` | REQ-FLOW-022 (`docs/specs/everyday-flows.md:435-456`, `:819-838`): return the delta (the panel shows the detected platform), edit nothing under `docs/specs/` |
| `files` | `src/cli/commands/init/panel.ts` (`:36-42`, `:735-801`); `src/cli/commands/init/plan.ts` (`:44-49`, `:199`, `:223-224`, `:377`); `src/cli/commands/init.ts` (`:52`, `:205-212`); `test/cli/commands/initPlan.test.ts` (`:202-207` removed, justified); `test/cli/commands/initPanel.test.ts` (a platform-line case); `test/cli/commands/init.test.ts` (a new `init --maturity <tier>` case); `docs/migration.md` (`:78-82`, `:162-166`, `:203-206`, `:214`) |
| `interfaces` | See below the table. |
| `testCriteria` | The new panel case shows the platform line for a repo with a GitHub origin, and its fallback without one. The `--maturity` CLI case passes. Every pin of census §7 stays green: `initPanel.test.ts:297-313`, `:860`, `:997`; `init.test.ts:326`, `:403`, `:413`; `test/cli/flows.e2e.test.ts:82`. `test/docsPages.test.ts` passes on the migration page (`:2631-2716`). `rg -n "platform" src/cli/commands/init/plan.ts` shows no override field. |
| `edgeCases` | **A detected platform with no remote:** the fallback line. **`--json`:** already carries the platform (`init.ts:1190`) and stays byte-identical. **The dry-run preview** shows no tier either; it stays out of scope. **`InitDecisions.platform`** (`test/cli/commands/initApply.test.ts:284`) stays. |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/commands/init.test.ts test/cli/commands/initPlan.test.ts test/cli/commands/initPanel.test.ts test/cli/commands/initApply.test.ts test/cli/flows.e2e.test.ts test/docsPages.test.ts && npm run lint && npm run typecheck` |

**Interfaces (u6):**
1. **The panel.** `renderInitPanel` shows the detected hosting platform on a line of its own, e.g.
   `platform: github (from the origin remote)`, or `platform: none detected — set it with stamity config set platform
   <name>`. It sits neither between `-> installed` and `clients:` (`initPanel.test.ts:860`) nor inside the disclosure
   line (whose substrings are pinned).
2. **The override.** `InitOverrides.platform` and its plumbing are removed, along with the comment naming a flag that
   never existed. No `--platform` flag is added.
3. **The `--maturity` test.** A CLI case runs `init -y --maturity <a non-default tier>`. It asserts the manifest's tier
   and the panel's tier line.
4. **`docs/migration.md`** says what a full migration does, per the census table (r2 §7):
   - Target tools, the maturity tier, the communication style and the MCP server ids are carried over from the old
     manifest, and a `--tools` or `--maturity` flag wins.
   - The tools question runs only when nothing is detected, and never offers the old tools.
   - The tools and the tier appear on the end-of-init panel.
   - MCP servers appear where a credential is needed.
   - The communication style is carried without a line of its own.
   - Path B (`:162-166`, `:203-206`) carries nothing over, and there is no maturity question.
   - The `:214` row reads "carried over at init".

### u7-packs-docs — the packs page describes the new refusals and rows

| Field | Content |
|---|---|
| `id` | `u7-packs-docs` |
| `requirements` | spec carries no ids |
| `files` | `docs/packs-and-trust.md` (`:304-306` and a short plugin-mode note; written after u2's pin edit is integrated); `docs/getting-started.md` (`:382`) only if its list of what `add` refuses is a list |
| `interfaces` | **`:304-306`** gains the cross-class name check: `add` refuses a pack whose command or skill would install under a name already taken by the other class, and names both owners. `sync` refuses such a pack installed by an earlier version, with the remedy `stamity clean --pack <id>`, then `stamity add <id>`, then `stamity sync`. **The plugin-mode note:** pack skills reach plugin-backed clients, while pack commands, agents, rules and hooks do not, and `check`'s `pack-reach` row reports what reached nothing. **A pointer** to `docs/customization.md` for overlays on pack skills. |
| `testCriteria` | `npx vitest run test/docsPages.test.ts test/cli/docs` passes; the leak gate exits 0. |
| `edgeCases` | **Keep the page's voice and line width.** No gate list changes (u1a adds no gate key). |
| `depends_on` | `u1b-sync-refusal`, `u2-ops-rename`, `u4b-pack-reach-row`, `u5a-overlay-refusal` |
| `verify` | `npx vitest run test/docsPages.test.ts test/cli/docs && node scripts/leak-gate.mjs && npm run lint` |

## Contract census (Phase 2 → Phase 3)

| Contract | Owner | Consumers | Close |
|---|---|---|---|
| `invocableNameOf`, `findInvocableNameClashes` (new exports, `src/content/catalog.ts`) | u1a | u1b (after u1a) | clean |
| `planPackInstall` result, new field `nameClashes` | u1a | `add.ts` (u1a) | clean |
| the sync name-clash refusal (`EngineError`, `VALIDATION_ERROR`, reason-line format) | u1b | tests; `check`'s drift row (unchanged contract) | clean |
| the Codex list sum and its refusal text (pinned substring kept) | u3 | `codex.test.ts` (u3) | clean |
| the capability-matrix core figure | u3 | `docs/capability-matrix.md` (regenerated by u3) | clean |
| `origin` on pack skill rows | u4a | `planner.ts:865`, `claude.ts:560` (existing readers), `probe.ts` (u4a), u4b's reach data | clean |
| emission plan field `packReach` | u4b | `check.ts` (u4b) | clean |
| `check --json` doctor rows (adds `pack-reach`) | u4b | `check.test.ts`, `docs/troubleshooting.md`, `docsPages.test.ts`, `docs/plugins.md` (all u4b) | clean |
| overlay resolution of a pack skill (refuse or skip) | u5a | `validate` (u5a), the creator agent's text (u5b codes against the held shape) | reconciled(1) |
| the ops skill names | u2 | `packEngineDefects` A cases, `docs/packs-and-trust.md` pins (u2) | clean |
| `InitOverrides` (not exported) | u6 | `src/cli/commands/plugin/setup.ts:151` passes tools only | clean |

Every shared file has one writer per wave (see the lanes). Specs are written only at the close, by the spec-author.
