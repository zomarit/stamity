---
id: cli-native-02
intent: feature
stamp: c96c714683de0c70a89db703900fa16cae47b43c 2026-10-14
reads: [src/types/manifest.ts, src/manifest/manifest.ts, src/roster/modelLadder.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/cli/commands/config.ts, src/cli/docs/configReference.ts, src/cli/commands/sync.ts, src/cli/commands/sync/engine.ts, src/cli/commands/init/apply.ts, src/cli/commands/check.ts, src/shared/programPath.ts, src/hooks/portableRunner.ts, src/hooks/scripts.ts, src/hooks/model.ts, src/manifest/hookDocuments.ts, src/manifest/coOwnedJson.ts, src/emit/capabilityMatrix.ts, src/shared/cliCall.ts, src/index.ts, docs/specs/model-ladder.md, docs/specs/everyday-flows.md, docs/specs/prove-behavior-and-value.md, docs/customization.md, docs/troubleshooting.md, .github/workflows/ci.yml, test/manifest/manifest.test.ts, test/roster/modelLadder.test.ts, test/adapters/copilot.test.ts, test/adapters/cursor.test.ts, test/hooks/portableRunner.test.ts, test/ci/workflow.test.ts]
depends_on: [docs/plans/020-cli-native-01.md]
---

# CLI-native — file 2 of 4: a working model pin on every client, and the cloud gaps in the engine

This file is self-contained. It is the second of four `/st-plan` artifacts for **Package 24** (cut as **1.15.0**). It
gives every client a working model pin out of the box, read from the account's own model list, and fixes the cloud
gaps that live in the engine: hook commands that depend on the working directory, Copilot's setup workflow and hook
format, a session start that cannot tell a cloud session, the docs and the capability matrix, and a CI leg that
imitates a cloud machine. It runs after file 1 (the routes deleted) and beside file 3 (the corpus); the two meet only
at the map file path below, stated in both files.

intent chosen: feature because every unit adds a capability (per-client pins, a pick from the account's list, a
model-fill hook, cloud detection, a container leg); the manifest change is a migration inside it.

## Context

On 1.14.0 only Claude Code gets a model out of the box. Cursor's agent files get no model and lose the effort; Copilot's
and Codex's get only an effort; a pin is one value for every client although no single value is valid on both Claude
Code and Cursor; pins are checked for shape only; Cursor appends `[effort=…]` even to slugs that carry the effort; no
touchpoint passes a model on a sub-agent call (`src/roster/modelLadder.ts:61-109`, `:352-471`, `:596-605`). An
enterprise fork measured on Cursor 3.13.25 that the agent file's `model:` does not bind, the model passed on the Task
call does, and an unlisted slug fails the spawn. In the clouds, every hook is a local `node` script with no network
call; what breaks is a missing `node`, a working directory below the root, Copilot's hook format and setup workflow,
and a session start that cannot say which guards a cloud does not run. Out of scope: any run in a vendor's cloud, an
unattended mode (a later package), the touchpoints' text (file 3).

## Decisions

The maintainer's walks of 2026-10-13 and 2026-10-14 are summarised in file 1 (every client a working pin from the
account's own list; cloud fixes from research and docs only, no vendor-cloud run). The declared defaults this file
builds, as confirmed with their corrections:

- **D6.** Per-client pins `model.<class>.<client>` fall back to `model.<class>`; the manifest's new shape carries a
  migration.
- **D7.** `init` and `sync` read the installed client's own model list (Cursor `agent models`, Codex `codex debug
  models`, Copilot CLI's allowed values) and pick per class from a shipped priority list. With no client CLI, Copilot
  and Codex take the list's first entry, Cursor passes no model (the sub-agent inherits) and `check` says the pin is
  unverified. Claude Code keeps its family aliases.
- **D8.** Cursor: the touchpoints pass `model` on every sub-agent call from a generated class-to-model map (file 3); a
  `preToolUse` hook fills `updated_input.model` when a call has none (it cannot cover Cursor's automatic turns); the
  agent file carries `model:` too; a refused model is replaced by the class's best match from the list the refusal
  returns, said once; `[effort=…]` is not appended to a model that carries the effort.
- **D9.** Copilot: the agent file carries `model` and the CLI's `models` priority list; `modelPolicy: "required"` is
  not set.
- **D10.** Codex: `.codex/agents/*.toml` carries `model` and `model_reasoning_effort`; `check` warns on a pinned model
  the client no longer lists.
- **D11.** `check` warns on a pin outside the account's list wherever the client's CLI can list; the unread
  `acceptsConcreteIds` field goes; the capability matrix's Cursor row says the agent-file `model` is a default, not a
  hard limit, and its Copilot cloud row says the picker decides; the "never invent a value" rule is superseded and
  `docs/specs/model-ladder.md` amended. **D12.** An enterprise's offered hook and rule are a reference only.
- **D16.** Copilot: the setup workflow always installs Node, with GitHub's current action majors (`checkout@v6`,
  `setup-node@v7`); hooks carry `bash` beside `command`; `.github/hooks/*.json` uses camelCase event names (every
  cloud example in GitHub's docs does; Copilot's cloud agent reads no `.claude/settings.json` hooks).
- **D17.** Cursor's and Copilot's hook commands stop depending on the working directory (the Codex walk-up starter).
- **D18.** The session-start hook names a detected cloud or CI session and the guards not enforced there; where a
  client's cloud runs no session-start hook, the agent reads `.stamity/learnings/` through the same screen (a floor:
  file 3 words it in the charter).
- **D20, D21.** The docs say plainly which clouds run which hooks (`docs/customization.md:433` is the line to
  correct); the capability matrix gains a dated cloud column; the `npx` fix-it text says the fix needs the registry.
- **D22.** Proof by local and CI tests that imitate a cloud machine (a Linux container, no user folders, a working
  directory below the root, `node` present and absent): ordinary testing, not a vendor-cloud run.

### Settled by this plan

- **One manifest generation bump**, `1.0.0` → `2.0.0`, in one unit and one step: `pins.<class>: "id"` becomes
  `{ all: "id" }`; file 1's held `plugin` block passes through untouched (it keeps its warning through the 1.15 line).
  Older engines refuse a 2.x manifest with their clean upgrade message (`src/manifest/manifest.ts:1113-1125`).
- **Emission never reads a client live.** The lists are read by `init` and `sync` before planning and persisted under
  `models.listed`; `planSync` and `check`'s drift gate never spawn a client (`src/cli/commands/sync/engine.ts:505-508`).
  `sync` re-picks a client's model only when the current pick is not on that account's list; a client that does not
  answer keeps its persisted list. `STAMITY_NO_CLIENT_PROBE=1` skips every probe, and the test setup sets it.
- **Claude Code's `frontier` class maps to the documented `fable` alias.** `none` clears a per-client pin (the gates'
  precedent).
- **A map for every client** at `.stamity/generated/models/<client>.json`:
  `{ "classes": { "<class>": { "model": "<id>", "fallbacks": ["<id>", …] } }, "roles": { "stamity-<id>": "<class>" } }`.
  File 3's touchpoint sentence reads it ("pass `model` for the role's class from your client's map").
- **Cursor detection is by `CURSOR_AGENT_SOCKET` alone**, labelled a self-hosted worker: managed Cursor VMs run no
  session-start hook, self-hosted workers do not serve the `agent/runtime` metadata, and the script stays network-free.
- **The hook runner maps Copilot's camelCase runtime tool names back to the Claude names** (`bash` → `Bash`, `view` →
  `Read`, `create` → `Write`, `edit`/`str_replace_editor`/`apply_patch` → `Edit`, `grep`/`rg` → `Grep`, `glob` →
  `Glob`, `task` → `Agent`, `ask_user` → `AskUserQuestion`), so authored hooks keep the one interchange shape;
  matchers are translated through the same table. A Node-less repository's setup takes `lts/*`.
- **The hook runner starts its launcher by an absolute path:** `node` and `node.exe` (any letter case on Windows) are
  `process.execPath`; any other launcher is resolved through a PATH walk that never searches the working folder.

## Spec delta

The model-ladder spec's Invariants lose the "never invent a value" rule (superseded by the pick below), and the
capability matrix gains a dated cloud column per client; neither carries an id.

### REQ-LADDER-005 — Pins per client (ADDED)
Given `model.standard.cursor = X` and `model.standard = Y`, When Cursor is emitted, Then its standard agents carry `X`
and every other client's carry `Y`. Given a 1.0.0 manifest with `pins.standard = "Y"`, When it is read, Then it
migrates to `{ all: "Y" }`, and `sync` persists version 2.0.0.

### REQ-LADDER-006 — A working pick out of the box (ADDED)
Given a Cursor, Codex or Copilot CLI on PATH, When `init` or `sync` runs, Then its list is read once within 10 s,
persisted under `models.listed.<client>`, and each class takes the first shipped candidate on it; given a saved list
holding none of a class's candidates, Then that class writes no model key (amended 2026-10-15 from `build/66`). Given
no CLI, Then Copilot and Codex take the shipped list's first entry and Cursor writes no model. Emission and the drift
gate never spawn a client.

### REQ-LADDER-007 — Each client carries the pick (ADDED)
Claude Code: family aliases, `frontier` → `fable`. Cursor: the agent file's `model:` with no doubled effort, the map,
and a `preToolUse` hook on `Task` that fills a missing `model` and always answers valid JSON. Copilot: a `models` list of
CLI ids and, where the shipped list gives one, a display-name `model` line (its reader unverified), no `modelPolicy`; a
display-form pin is written nowhere and `sync` warns once. Codex: `model_reasoning_effort`, and `model` whenever the
class resolves to one — a saved list holding none of a class's candidates writes no `model`. Every client gets
`.stamity/generated/models/<client>.json` (amended 2026-10-15 from `build/65`, `build/66`, `review/113`).

### REQ-LADDER-008 — `check` verifies pins (ADDED)
Given a pinned or emitted model not on the client's list, Then the `model-pins` row warns naming the client, the class
and the model. Given no CLI and no persisted list, Then it passes with "unverified" in its detail.

### REQ-LADDER-004 — Each client gets the effort levels it accepts (MODIFIED)
Cursor's `[effort=…]` suffix is not appended to a model on the account's list or ending with an effort word.

### REQ-FLOW-022 — First-run output matches what setup did (MODIFIED)
The Copilot setup workflow always installs Node (`lts/*` with no project pin); its action defaults are `checkout@v6`
and `setup-node@v7`; the project's own pins still win.

### REQ-PLUGIN-005 — The emitted runner starts its launcher by an absolute path (MODIFIED)
`node` and `node.exe` (any letter case on Windows) start as `process.execPath`; any other launcher by an absolute path
from a PATH walk that skips the working folder, else the runner's fault exit for that row naming it — 1 on Cursor and
Copilot authored rows, 2 on a Codex blocking row, 0 on Copilot's logging-only core-guard row (whose launcher is always
`node`) — never an exit that lets a blocked call through (amended 2026-10-15 from the spec merge's M-2; first from
`e5`'s review, `review/83`).

### REQ-FLOW-084 — Hook commands do not depend on the working directory (ADDED)
Given a session started in `repo/sub`, When an emitted Cursor or Copilot hook command runs, Then it walks up to its
client's anchor file and behaves as from the root; a missing runner exits 1 naming the sync call.

### REQ-FLOW-085 — The session start names a cloud or CI session (ADDED)
Given `CLAUDE_CODE_REMOTE=true`, `COPILOT_AGENT_PROMPT`, `CURSOR_AGENT_SOCKET` or `CI`, When the session-start hook
runs, Then it prints one line naming the first detected session by that priority and the guards not enforced there;
the script stays free of network calls.

### REQ-FLOW-086 — Copilot hooks use camelCase (ADDED)
`.github/hooks/stamity.json` keys events in camelCase with `bash` beside `command`; the runner restores the Claude tool
names for authored hooks; authored matchers are translated.

### REQ-FLOW-080 — Every touchpoint ends on a walk, the summary last (MODIFIED here: the question-tool map)
File 3 adds the requirement; this file's `e12` brings the translator's question-tool map current, which the question
protocol renders for every client.

### REQ-PROVE-037 — A CI leg imitates a cloud machine (ADDED)
A Linux container job with an empty `HOME`, run on every full CI run and required by `all-ci-checks`, runs every emitted
hook command from the root and from below it, with `node` present and absent, under each cloud marker.

## Units

### e1-pins-contract — per-client pins and the one manifest migration

| Field | Content |
|---|---|
| `id` | e1-pins-contract |
| `requirements` | REQ-LADDER-005 |
| `files` | `src/types/manifest.ts` (`:24` `MANIFEST_VERSION`, `:187` `ModelConfig.pins`), `src/manifest/manifest.ts` (`:112` `MANIFEST_MIGRATIONS`, `collectModelsErrors` `:560-616`), `src/roster/modelLadder.ts` (`pinsFor`; `acceptsConcreteIds` removed), the one-line `pinsFor` swaps in `src/adapters/claude.ts:629`, `src/adapters/cursor.ts:447`, `src/adapters/copilot.ts:338`, `src/adapters/codex.ts:440`, `src/cli/commands/config.ts` (`:306-308`, `:321`, `:412`), `src/index.ts` (export `ClassPins`, `ListedModels`), `test/manifest/manifest.test.ts` (`:788-803`, `:1143-1207`, `:1495-1505`), `test/roster/modelLadder.test.ts` (`:646-652`), the string pins in `test/adapters/{claude,cursor,copilot,codex}.test.ts` contexts (e.g. `copilot.test.ts:140`, `:169`), `test/composition/root.test.ts:226`. Added 2026-10-14 from the unit's blocked return (`build/34`): the string pins and generation-1 expectations in `test/cli/commands/config.test.ts` and `test/cli/commands/configMcpEffort.test.ts` (shape only; `e3` builds on them later), `test/upstream/workflowRecovery.test.ts:274`, `test/types/domain.test.ts:210-212`, and `docs/troubleshooting.md` (`:35`, `:50`, the sample `check` output's schema line) |
| `interfaces` | `MANIFEST_VERSION = "2.0.0"`; `interface ClassPins extends Partial<Record<Tool,string>> { all?: string }`; `interface ListedModels { ids: string[]; source: "cursor-agent-models" \| "codex-debug-models" \| "copilot-help-config" }`; `ModelConfig { pins?: Partial<Record<ModelClass, ClassPins>>; effort?; reviewCap?; listed?: Partial<Record<Tool, ListedModels>> }`; `PER_CLIENT_PINS_STEP: ManifestMigration { fromVersion: "1.0.0", migrate(raw) }` (pure, idempotent: string pins → `{all}`, sets `"2.0.0"`, leaves the held `plugin` block of file 1 value-identical; the serializer sorts nested keys); `pinsFor(models, tool): ModelPinMap` (the client key, else `all`); `resolveModelValue` keeps its signature |
| `testCriteria` | GIVEN a 1.0.0 manifest with `pins.standard = "Y"` and a `plugin` block THEN `readManifest` yields `pins.standard = { all: "Y" }`, the `plugin` block unchanged, version 2.0.0, and migrating twice equals migrating once. GIVEN `pins.standard = { cursor: "X", all: "Y" }` THEN `pinsFor(_, "cursor").standard = "X"` and `pinsFor(_, "claude").standard = "Y"`. GIVEN `pins.standard = { vim: "Z" }` THEN validation refuses the unknown key. GIVEN a 3.0.0 manifest THEN the clean upgrade refusal. GIVEN `npm run typecheck` THEN exit 0 |
| `edgeCases` | A 1.0.0 pin that is not a string → left for validation to name, never silently dropped |
| `depends_on` | none |
| `verify` | `npx vitest run test/manifest/manifest.test.ts test/roster/modelLadder.test.ts test/adapters test/composition test/cli/commands/config.test.ts && npm run typecheck` |
| `threat` | Trust boundary: the manifest file in the working tree. Trusts: its JSON after validation. Abuse case: a crafted pin smuggles a line break or a key into an emitted agent file. Check: `modelPinDefect` (`manifest.ts:528-533`) refuses a line break; the adapters quote every value (`cursor.ts:757`, `claude.ts:639`); a test asserts a pin with a line break is refused and one with a colon is emitted quoted |

### e2-model-defaults-lister — the shipped priority list and the client lister

| Field | Content |
|---|---|
| `id` | e2-model-defaults-lister |
| `requirements` | REQ-LADDER-004, REQ-LADDER-006, REQ-LADDER-007 |
| `files` | `src/roster/modelDefaults.ts` (new, a zero-import kernel module like `modelLadder.ts`), `src/roster/modelLadder.ts` (resolver order; the effort-suffix rule; Claude `frontier` → `fable`; the code comment `:61-72` superseded), `src/cli/engine/clientModels.ts` (new), `src/composition/root.ts` (the new module's registry entry), `test/composition/root.test.ts`, `test/roster/modelDefaults.test.ts`, `test/roster/modelLadder.test.ts` (`:683-711`; the wording assertion `:270-302` stays for file 4's `r3`), `test/cli/engine/clientModels.test.ts`, `test/fixtures/client-models/` (one captured output per client, dated), `test/architecture/boundaries.test.ts` (`PLAN_MAP` rows for both new files), `.stamity/change-classes.json` (`testInputs` for the new tests) |
| `interfaces` | `MODEL_PRIORITY: Record<"cursor"\|"copilot"\|"codex", Record<ModelClass, readonly { id: string; display?: string }[]>>` (Cursor ids may carry `{effort}`) with `MODEL_PRIORITY_CITATION: Record<"cursor"\|"copilot"\|"codex", {url, accessDate}>`; `pickModel(tool, cls, effort, listed?) → { id, display?, fallbacks } \| undefined` (pure; no list: Copilot and Codex take entry 0, Cursor `undefined`; Cursor tries the exact effort variant, then the nearest); `modelMapPath(tool) = ".stamity/generated/models/<tool>.json"`; `type ModelListOutcome = {kind:"listed"; ids; source} \| {kind:"absent"} \| {kind:"timeout"} \| {kind:"unreadable"; message}`; `listClientModels(tool, env, treeRoot, { home? })` (PATH lookup through `resolveProgramOnPath` over absolute entries outside `treeRoot` and outside every `node_modules/.bin`; the child gets that same PATH and starts in the user's home folder, never inside `treeRoot`; bounded `execFile` with `timeout`, `killSignal: "SIGKILL"`, `windowsHide`, stdin closed, 10 s; amended 2026-10-14 from `review/76`, `review/81`, `review/82`, `review/93`); `parseCursorModels(text)`, `parseCodexModels(json)`, `parseCopilotHelpConfig(text)`. Resolver order: `pins[cls][tool]` → `pins[cls].all` → `pickModel` over `listed[tool]` → shipped fallback → `undefined` |
| `testCriteria` | GIVEN each fixture THEN its parser returns the ids in order. GIVEN Cursor's list holding `claude-opus-5-5-high` and class `advanced` at effort high THEN `pickModel` returns it with no `[effort=…]` appended. GIVEN no list THEN Copilot and Codex take entry 0 and Cursor `undefined`. GIVEN a fake binary that sleeps 20 s THEN the outcome is `timeout` within 11 s. GIVEN an `agent` binary whose output does not start with `Available models` THEN `unreadable`. GIVEN `boundaries.test.ts` and `root.test.ts` THEN green |
| `edgeCases` | Windows: an npm shim (`codex.cmd`) is not run without a shell → the outcome is `absent` and the shipped fallback applies; the parsers run on every OS from the fixtures |
| `depends_on` | e1-pins-contract |
| `verify` | `npx vitest run test/roster test/cli/engine/clientModels.test.ts test/architecture/boundaries.test.ts test/composition test/ci/testInputsGuard.test.ts && npm run typecheck` |
| `threat` | Trust boundary: an external program found on PATH. Trusts: nothing it prints until parsed. Abuse case: a binary named `agent` early on PATH prints ids that inject text into agent files; a repository-held program in `node_modules/.bin`, which npm puts first on PATH under `npx`, runs with the operator's environment. Check: the PATH walk keeps only absolute entries, drops every entry inside the tree and every `node_modules/.bin`, and refuses a resolved program whose real path lies in the tree; the child gets that same PATH (so no interpreter it resolves through `env` comes from the tree) and starts in the user's home folder, never inside the tree, and nothing starts when home is inside the tree or unreadable (amended 2026-10-14 from `review/76`, `review/81`, `review/82`, `review/93`); every parsed id passes `modelPinDefect`; output must match the client's header or it is `unreadable` |

### e3-config-wiring — the config keys, and the lists read at `init` and `sync`

| Field | Content |
|---|---|
| `id` | e3-config-wiring |
| `requirements` | REQ-LADDER-005, REQ-LADDER-006 |
| `files` | `src/cli/commands/config.ts` (`:721-753` the literal keys; a `modelClientSpec(cls, tool)` builder like `gateSpec` `:802-811`; `none` clears), `src/cli/docs/configReference.ts` (`:249-269`), `docs/configuration.md` (regenerated in this lane), `src/cli/commands/sync.ts` (`:215-231`: probe, then `planSync`), `src/cli/commands/sync/engine.ts` (`:514-518`: an optional `listedOverlay` for `--dry-run`), `src/cli/commands/init/apply.ts` (`:678-738`), `vitest.config.ts` (its `test.env` gains `STAMITY_NO_CLIENT_PROBE: "1"`, which reaches the workers), `test/cli/commands/config.test.ts`, `test/cli/commands/configMcpEffort.test.ts` (`:290-291`), `test/cli/docs/configReference.test.ts` (`:171-183`, `:355-370`), `test/cli/commands/sync.test.ts`, `test/cli/commands/initApply.test.ts`. Added 2026-10-14 from the unit's return (`build/48`, `build/51`): `src/cli/commands/workspace.ts` (`:1074`, `workspace sync` reads each member's lists as `sync` does) and its test, `src/cli/commands/init.ts` (`:1182`, passes the runtime env to `applyInit`). Added 2026-10-14 from the unit's review (`review/90`): `test/support/cliHarness.ts` (`:88-120`, the child-process harness's fixed env carries `STAMITY_NO_CLIENT_PROBE` beside `STAMITY_NO_UPDATE_CHECK`) |
| `interfaces` | Sixteen keys `model.<class>.<client>` writing `pins[cls][tool]`; `model.<class>` writes `pins[cls].all`; `config set model.standard.cursor none` deletes the key; `sync` probes the selected non-Claude clients in parallel unless `STAMITY_NO_CLIENT_PROBE=1`, then calls `planSync` with the updated `models.listed`; under `--dry-run` the result is an overlay, nothing written; the tests that exercise the probe unset the variable and inject a lister |
| `testCriteria` | GIVEN `config set model.standard.cursor claude-sonnet-5-5-high` THEN the manifest holds `pins.standard.cursor` and `config get` prints it. GIVEN `none` THEN the key is gone. GIVEN a fake lister answering for Cursor THEN `sync` persists `models.listed.cursor` and a second `sync` moves no byte. GIVEN the lister timing out THEN the persisted list is kept. GIVEN `STAMITY_NO_CLIENT_PROBE=1` THEN no probe runs. GIVEN `node scripts/generate-docs.mjs` THEN `git diff --exit-code docs/configuration.md` exits 0 |
| `edgeCases` | A pin for a client that is not selected → accepted and without effect, said once by `config set`; two accounts on one repository → an unpinned class takes the first priority entry the new account lists, and a pin is re-picked only when the new list lacks it (amended 2026-10-14 from `e2`'s return, `build/41`: the pick is a pure function of the pins, the persisted list and the priority order; no pick is persisted) |
| `depends_on` | e1-pins-contract, e2-model-defaults-lister |
| `verify` | `npx vitest run test/cli/commands/config.test.ts test/cli/commands/configMcpEffort.test.ts test/cli/docs/configReference.test.ts test/cli/commands/sync.test.ts test/cli/commands/initApply.test.ts test/architecture/boundaries.test.ts` (the architecture test added 2026-10-14, `build/40`: this unit gives `src/cli/engine/clientModels.ts` its first caller, and `e2` lands with it) |
| `threat` | Trust boundary: an external program's output is written into the manifest. Trusts: only ids that pass the parser and `modelPinDefect`. Abuse case: a hostile client binary floods `models.listed` or plants text that a later emission copies. Check: the whole list is kept, capped at 200 ids, each matching `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$` and passing `modelPinDefect`, so `e4` compares a pin with everything the account lists; a test feeds an oversized and a hostile listing and asserts the cap and the refusal |

### e4-check-model-row — `check` verifies the pins

| Field | Content |
|---|---|
| `id` | e4-check-model-row |
| `requirements` | REQ-LADDER-008 |
| `files` | `src/cli/commands/check.ts` (`runDoctor` `:1563-1630`: a `model-pins` row after `pack-reach`), `test/cli/commands/check.test.ts` (`:520-561` the ordered ids, `:4819`), `test/cli/checkExpectations.test.ts:136` |
| `interfaces` | `checkModelPins(manifest, env, lister) → DoctorRow`: compares each selected client's emitted and pinned models with a live list where the CLI answers (Codex with `--bundled`), else the persisted list; `warn` per unlisted model; `pass` with "unverified — no <client> CLI on PATH and no saved list" when there is nothing to compare; never `fail` |
| `testCriteria` | GIVEN a persisted Codex list without `gpt-5.5` and a pin `gpt-5.5` THEN `warn` naming codex, the class and the model. GIVEN no CLI and no list THEN `pass` with "unverified". GIVEN `check --json` THEN the row id is `model-pins` in the pinned order |
| `edgeCases` | `STAMITY_NO_CLIENT_PROBE=1` → the persisted list only |
| `depends_on` | e2-model-defaults-lister |
| `verify` | `npx vitest run test/cli/commands/check.test.ts test/cli/checkExpectations.test.ts` |

### e5-hook-starter — hook commands that do not depend on the working directory

| Field | Content |
|---|---|
| `id` | e5-hook-starter |
| `requirements` | REQ-FLOW-084, REQ-PLUGIN-005 |
| `files` | `src/hooks/portableRunner.ts` (`portableHookCommand` `:51-101`: the walk-up starter for Cursor and Copilot; `:201` the launcher), `src/adapters/cursor.ts` (`:834-839`, the two guard commands only), `src/adapters/copilot.ts:1001` (the call site only), `src/manifest/hookDocuments.ts` (`:246-251`, `:266-300`, `:512`, `:555`: a Cursor and Copilot starter recogniser; the 1.14 relative command kept as a known earlier rendering), `test/hooks/portableRunner.test.ts`, `test/adapters/cursor.test.ts`, `test/manifest/hookDocuments.test.ts`, `test/manifest/coOwnedJson.test.ts`, `test/merge/hookFilesOwnership.test.ts` |
| `interfaces` | `portableHookCommand(tool, row, { syncCall, script? })` (today's signature, `:51-55`, plus an optional `script`, the root-relative path the starter runs, default the portable runner); `syncCall` comes from `pinnedCliCall` as the Codex starter's does (`:99`). The starter's root: on Cursor `CURSOR_PROJECT_DIR` when set (the root Cursor reports to every hook), else a walk up from the working directory to the first folder holding `.cursor/hooks.json`; on Copilot a walk up from the entry's `cwd: "."` to the first folder holding `.github/hooks/stamity.json`; Codex unchanged. The starter text keeps `STARTER_SAFE_CALL` (no `$`, backtick or `%`), so it reads the same under `sh` and `cmd`. The launcher: `node`/`node.exe` (case-folded on win32) → `process.execPath`, else an absolute path from a PATH walk that skips the working folder, else the runner's fault exit for that row naming the launcher (1 on Cursor and Copilot rows, 2 on a Codex blocking row; amended 2026-10-14, `review/83`) |
| `testCriteria` | GIVEN an emitted Cursor and Copilot hook command run from `repo/sub/deeper` THEN the same output and exit code as from the root (POSIX; and through `cmd /c` on Windows). GIVEN a missing runner THEN exit 1 naming the sync call (on Cursor's fail-closed guards, a deny that says so). GIVEN a 1.14 `.cursor/hooks.json` THEN `sync` replaces the engine's entries in place and backs up no foreign row. GIVEN a launcher `node.exe` THEN `process.execPath` |
| `edgeCases` | No `node` on PATH → 127 from the shell, unchanged and documented; `CURSOR_PROJECT_DIR` pointing at a folder without `.cursor/hooks.json` → the walk-up from the working directory |
| `depends_on` | e1-pins-contract |
| `verify` | `npx vitest run test/hooks/portableRunner.test.ts test/adapters/cursor.test.ts test/adapters/copilot.test.ts test/manifest/hookDocuments.test.ts test/manifest/coOwnedJson.test.ts test/merge/hookFilesOwnership.test.ts test/emit/syncDriftProof.e2e.test.ts` |
| `threat` | Trust boundary: the hook command runs with the client's rights on every tool call. Trusts: the root the client reports, else the first anchor above the start. Abuse case: a planted `sub/.cursor/hooks.json` with a decoy runner hijacks the walk from a session started in `sub/`. Check: Cursor's walk is skipped when `CURSOR_PROJECT_DIR` is set (the documented case); a test plants the decoy, runs from `sub/` with the variable set to the root, and asserts the root runner runs |

### e6-copilot-adapter — the setup workflow and the hook format

| Field | Content |
|---|---|
| `id` | e6-copilot-adapter |
| `requirements` | REQ-FLOW-022, REQ-FLOW-086 |
| `files` | `src/adapters/copilot.ts` (`buildSetupSteps` `:614-666`, `nodeSteps` `:669-687`, per-action defaults instead of `DEFAULT_ACTION_REF` `:690`, `buildCopilotHooksJson` `:997-1007`), `src/hooks/portableRunner.ts` (`:170-179`: runtime tool names restored), `test/adapters/copilot.test.ts` (`:1066-1077`, `:1094`, `:1163`, `:1198`, `:1222-1230` with an inline reason, `:1521-1523`), `test/hooks/portableRunner.test.ts`. Added 2026-10-14 from the unit's blocked return (`build/56`): `test/emit/hooksInfra.test.ts` (`:1243-1245`, the two Copilot keys read in camelCase) |
| `interfaces` | The workflow always writes `setup-node` (`node-version` from the project's pins, else `lts/*`) and an install step only with Node evidence; defaults `actions/checkout@v6`, `actions/setup-node@v7`; the hooks file keys `sessionStart`, `preToolUse`, `postToolUse`, `userPromptSubmitted`, `agentStop`, … with `{ type: "command", bash, command, cwd: ".", timeoutSec }`; matchers translated (`Bash\|Edit` → `bash\|edit\|str_replace_editor`; `apply_patch` keeps its own name and a Copilot path guard must name it, amended 2026-10-15 from `review/94`) |
| `testCriteria` | GIVEN a Python repository THEN the workflow holds `setup-node` and no install step. GIVEN project pins (a SHA plus comment) THEN they still win. GIVEN the hooks file THEN no PascalCase key and every entry has `bash`. GIVEN a camelCase payload with `toolName: "bash"` THEN the authored hook receives `tool_name: "Bash"`. GIVEN an upgrade over a 1.14 PascalCase file THEN a recoverable copy is kept |
| `edgeCases` | An authored matcher naming a tool with no runtime twin → kept as written, and `init` and `sync` name it once in their warnings (amended 2026-10-14 from the unit's blocked return, `build/57`: `check` shows no planner warnings, and a new `check` surface is not added); Claude's legacy spawn name `Task` translates like `Agent` (`build/58`) |
| `depends_on` | e1-pins-contract, e5-hook-starter |
| `verify` | `npx vitest run test/adapters/copilot.test.ts test/hooks/portableRunner.test.ts test/merge/safeWrite.test.ts test/merge/reclaim.test.ts` |
| `threat` | Trust boundary: Copilot's payload reaches the runner and the guards. Trusts: the vendor's tool-name table. Abuse case: an unmapped runtime name slips past a guard keyed on `Bash`. Check: an unmapped name is passed through unchanged and the core guard treats an unknown tool as it does today; a test asserts the guard still sees every mapped shell name |

### e7-cursor-pins — Cursor's agent files, map and model-fill hook

| Field | Content |
|---|---|
| `id` | e7-cursor-pins |
| `requirements` | REQ-LADDER-007 |
| `files` | `src/adapters/cursor.ts` (`buildCursorAgent` `:737-765`, the map row beside `:433`, the hook script builder and its `preToolUse` row, the capability facts `:310-326`), `test/adapters/cursor.test.ts` (`:560-577`), `test/adapters/cursorModelHook.test.ts` (new: runs the generated script with `node` on sample payloads), `.stamity/change-classes.json` (`testInputs` for the new test). Added 2026-10-14 from `e5`'s review (`review/84`, `review/85`): `src/manifest/hookDocuments.ts` (the starter recogniser counts the model-pins hook entry as the engine's, so an upgrade rewrites it in place with no `.bak`) and `test/merge/hookFilesOwnership.test.ts` (`:313`, the 1.14 fixture spreads `node:path`'s `relative` function instead of the version) |
| `interfaces` | Map: `.stamity/generated/models/cursor.json` as settled above; hook script `.stamity/generated/hooks/cursor/stamity-model-pins.mjs` with the map built in, wired as `preToolUse` with `matcher: "Task"`, no `failClosed`, launched through `e5`'s starter with `script` set to it (not through the runner, which drops `updatedInput` on Cursor, `portableRunner.ts:299-309`): if `tool_input.model` is absent and `tool_input.subagent_type` is a mapped `stamity-*` id, it writes `{"permission":"allow","updated_input":{...tool_input,"model":<id>}}`, otherwise `{"permission":"allow"}`; facts: the agent-file `model` "is a default, not a hard limit; Stamity carries it on the dispatch and by a hook", re-dated |
| `testCriteria` | GIVEN a Task payload without `model` for `stamity-reviewer` THEN the script answers the map's class model. GIVEN a payload with `model` THEN `{"permission":"allow"}` unchanged. GIVEN a malformed payload THEN valid JSON `allow` and exit 0. GIVEN the hook command run from `repo/sub/deeper` THEN the same answer. GIVEN the agent files THEN `model:` present for every class the map resolves, with no doubled effort |
| `edgeCases` | No Cursor list and no pin → no `model:` line and an empty map class; the hook passes through, and `check` says unverified |
| `depends_on` | e2-model-defaults-lister, e5-hook-starter |
| `verify` | `npx vitest run test/adapters/cursor.test.ts test/adapters/cursorModelHook.test.ts test/manifest/hookDocuments.test.ts test/ci/testInputsGuard.test.ts` |
| `threat` | Trust boundary: a hook that rewrites a sub-agent call's input. Trusts: the payload's `subagent_type` only to look up the map. Abuse case: a crafted payload makes the hook change fields other than `model`, or spawn a non-Stamity agent on a chosen model. Check: the hook copies `tool_input` and sets `model` only, only for mapped `stamity-*` ids; it always answers `allow`, so it never widens or narrows a permission; a test sends extra fields and an unmapped id |

### e8-copilot-codex-claude-pins — the other three clients carry the pick

| Field | Content |
|---|---|
| `id` | e8-copilot-codex-claude-pins |
| `requirements` | REQ-LADDER-007 |
| `files` | `src/adapters/copilot.ts` (`:504-588`: `model` and `models`; the facts `:171-204` with a cloud row), `src/adapters/codex.ts` (`:1013-1039`; facts `:353`), `src/adapters/claude.ts` (`:623-642`; the map row), `test/adapters/copilot.test.ts` (`:925`), `test/adapters/codex.test.ts`, `test/adapters/claude.test.ts` |
| `interfaces` | Copilot agent files: `models: [<CLI ids in priority order>]` and, where the shipped list gives one, `model: "<Display Name> (copilot)"`, no `modelPolicy`, a display-form pin written nowhere with one `sync` warning; Codex: `model = "<id>"` whenever the class resolves (pin → alias → pick over the saved list → the shipped first entry only when no list was read) and `model_reasoning_effort`; Claude: aliases with `frontier = "fable"`; each adapter writes its map (amended 2026-10-15 from `build/65`, `build/66`, `review/113`) |
| `testCriteria` | GIVEN no pin and no list THEN Copilot's agent files carry `model` and `models` from the shipped list and Codex's carry `model`. GIVEN a Codex pin THEN it wins over the pick. GIVEN Copilot's facts THEN the cloud row says the picker decides. GIVEN each client's map THEN it parses and lists every role |
| `edgeCases` | A Copilot model with no display name in the shipped list → `models` only, no `model` line |
| `depends_on` | e2-model-defaults-lister, e6-copilot-adapter |
| `verify` | `npx vitest run test/adapters/copilot.test.ts test/adapters/codex.test.ts test/adapters/claude.test.ts` |

### e9-session-start-detection — the session start names a cloud or CI session

| Field | Content |
|---|---|
| `id` | e9-session-start-detection |
| `requirements` | REQ-FLOW-085 |
| `files` | `src/hooks/scripts.ts` (`buildSessionStartScript` `:683-1099`: one detection function, a line after `render()` `:1092`), `test/hooks/scripts.test.ts`, `test/hooks/sessionStartCard.test.ts`, `test/hooks/scriptBudget.test.ts` (the session-start budget, 49,152 bytes and 1,100 lines; the new size recorded) |
| `interfaces` | Detection by environment only, in order: `CLAUDE_CODE_REMOTE=true`, `COPILOT_AGENT_PROMPT` set, `CURSOR_AGENT_SOCKET` set ("a self-hosted Cursor worker"), `CI` or `GITHUB_ACTIONS`; one line `Session: <name>.` then the not-enforced lines per session (Claude Code cloud: GraphQL, `gh pr`, `gh issue` and Projects unavailable, use `gh api`; the review-gate counter resets with the VM. Copilot cloud: a `preToolUse` timeout fails open, `ask` becomes `deny`, hooks run only from the default branch. Cursor self-hosted: the MCP guard does not run, `subagentStart` is skipped in a first or read-only turn. CI: no person answers, declared defaults apply); other markers set at once are listed after the first |
| `testCriteria` | GIVEN each marker THEN its line and lines. GIVEN `CLAUDE_CODE_REMOTE=false` THEN nothing. GIVEN a GitHub Actions runner without `COPILOT_AGENT_PROMPT` THEN the CI line only. GIVEN the generated script THEN it holds none of the network words the screen drops, and stays inside its budget |
| `edgeCases` | stdin a TTY or `/dev/null` → no wait (unchanged) |
| `depends_on` | none |
| `verify` | `npx vitest run test/hooks/scripts.test.ts test/hooks/sessionStartCard.test.ts test/hooks/scriptBudget.test.ts` |
| `threat` | Trust boundary: environment variables in the session. Trusts: their presence only, never their values in output. Abuse case: a marker value printed into the model's context carries an instruction. Check: the lines are fixed strings; a test sets `COPILOT_AGENT_PROMPT` to an instruction and asserts it is not printed |

### e10-cloud-docs-matrix — the docs, the dated cloud column, the registry wording

| Field | Content |
|---|---|
| `id` | e10-cloud-docs-matrix |
| `requirements` | REQ-FLOW-085, REQ-FLOW-086 |
| `files` | `docs/customization.md` (`:430-437`), `docs/troubleshooting.md` (the Codex and Claude cloud lines beside `:380-387`), `src/hooks/model.ts` (a `CLIENT_CLOUD_FACTS` table beside `CLIENT_HOOK_GUARANTEES` `:92-121`, each row with its fact, URL and access date), `src/emit/capabilityMatrix.ts` (a cloud column rendered from it), `docs/capability-matrix.md` (regenerated in the lane for its own verify, never committed there: the integrator commits it), `test/emit/capabilityMatrix.test.ts`, `src/shared/cliCall.ts` (`cliCallHint` `:208-215`), `test/adapters/claude.test.ts` (`:107-114`, `:145-155`). Added 2026-10-15 from the unit's blocked return (`build/73`–`build/75`, `build/77`): the hint's other pins `test/shared/cliCall.test.ts` (`:165-168`), `test/emit/noBareCliCall.test.ts` (`:51-61`), `test/adapters/codex.test.ts` (`:395-402`), `test/hooks/scripts.test.ts` (`:1959-1962`); `src/hooks/scripts.ts` (`:2006`, `:2010` reworded so the hint ends its clause; `CLOUD_SESSIONS` read from `CLIENT_CLOUD_FACTS`, and the self-hosted Cursor line no longer says the MCP guard is off); `src/adapters/cursor.ts` (`:1186`, the same rewording); `test/emit/hooksInfra.test.ts` (`:1241`, Cursor's `preToolUse` holds two leaves since `e7`) |
| `interfaces` | The three docs sentences: Codex cloud documents no project hooks, so assume none run (its sandbox is the enforcement); a Claude Code cloud session with several repositories loads no repository hooks; Copilot's cloud agent uses hooks only when the file is on the default branch, and loads them from the clone. The hint: "`stamity sync` where the CLI is installed, else `npx -y …@<v> sync`, which needs the npm registry" — no parentheses and no single quote (`hookDocuments.ts:347`, `coOwnedJson.ts:301`) |
| `testCriteria` | GIVEN `node scripts/generate-capability-matrix.mjs` THEN `git diff --exit-code docs/capability-matrix.md` exits 0 and every cloud row carries a URL and a date. GIVEN the Claude settings guard tail THEN the new hint and the `GUARD_TAIL` pattern still match. GIVEN a 1.14 Codex hook description THEN its hash still normalises |
| `edgeCases` | A vendor page with no cloud statement → the row says "not documented, read <date>", never a guess |
| `depends_on` | e8-copilot-codex-claude-pins |
| `verify` | `npx vitest run test/emit/capabilityMatrix.test.ts test/adapters/claude.test.ts test/manifest/coOwnedJson.test.ts test/manifest/hookDocuments.test.ts` |
| `threat` | Trust boundary: the fail-closed guard tail's text, which `GUARD_TAIL` (`coOwnedJson.ts:301`) and `CHECK_HINT` (`hookDocuments.ts:347`) recognise to own and replace entries. Trusts: those two patterns. Abuse case: a hint that no longer matches makes `sync` treat the engine's own guard as foreign and keep a stale copy beside the new one. Check: tests assert the new tail matches both patterns and that a 1.14 tail still normalises to its recorded hash |

### e11-ci-container-leg — CI imitates a cloud machine

| Field | Content |
|---|---|
| `id` | e11-ci-container-leg |
| `requirements` | REQ-PROVE-037 |
| `files` | `.github/workflows/ci.yml` (a `cloud-container` job; `all-ci-checks` `needs` and its per-shape assertions), `test/ci/workflow.test.ts`, `test/cloud/containerLeg.test.ts` (new), `.stamity/change-classes.json` (`testInputs`), `vitest.config.ts` (only if the new folder needs a project entry). Added 2026-10-15 from its review (`build/68`): `CONTRIBUTING.md` (`:85-86`, `:135-137` and its re-attest stamp) and `GOVERNANCE.md` (`:54` and its stamp), which describe a full run and a proven push without the new job |
| `interfaces` | Job: the same `if:` as `check`; `runs-on: ubuntu-latest`; `container: node:24-bookworm` (not the slim image, which ships no `git`) pinned by digest; `permissions: contents: read`; steps: checkout with `persist-credentials: false`, `npm ci`, `npm run build`, `npx vitest run test/cloud` with `HOME` an empty folder and `STAMITY_NO_CLIENT_PROBE=1`. The test: in a `mkdtemp` git repository, `node dist/cli.js init --tools claude,cursor,copilot,codex -y`, commit, then every emitted hook command through `sh -c` with a payload from the root, `sub/` and `sub/deeper/`, with `node` present and absent (`PATH=/usr/bin:/bin`), under each marker; Windows legs run the `cmd /c` variants through the `check` matrix |
| `testCriteria` | GIVEN `workflow.test.ts` THEN the job exists, is pinned by digest, has read-only permissions, and `all-ci-checks` requires it on a full run and asserts `skipped` on a proven push. GIVEN the leg THEN with no `node` Claude's `PreToolUse` exits 2 with its message, Copilot's `preToolUse` and Cursor's `subagentStart` exit 127 (fail closed, as documented), and from `sub/deeper/` every command matches the root's exit code |
| `edgeCases` | An empty `HOME` → the MCP guard denies with `NO_MCP_SERVERS_CONFIGURED`, asserted as expected |
| `depends_on` | e5-hook-starter, e6-copilot-adapter, e7-cursor-pins, e9-session-start-detection |
| `verify` | `npm run build && npx vitest run test/ci/workflow.test.ts test/cloud test/ci/testInputsGuard.test.ts` |
| `threat` | Trust boundary: a new CI job. Trusts: a pinned container image. Abuse case: an unpinned image or a write token in a job that runs repository code. Check: `workflow.test.ts` asserts the digest pin, `contents: read` only and `persist-credentials: false` |

### e12-translator — the question-tool map brought current

| Field | Content |
|---|---|
| `id` | e12-translator |
| `requirements` | REQ-FLOW-080 |
| `files` | `src/tools/translator.ts` (`ASK_USER_TOOLS` `:390-417`), `test/tools/translator.test.ts` (`:220-225`, `:235-236`), `test/adapters/copilot.test.ts:871` (the rendered Copilot note). Added 2026-10-14 from `d7`'s ledger row `build/32`: `src/tools/translator.ts:333` (the capability text still names the deleted plugin-owned hooks mode; it renders into `docs/capability-matrix.md`) and its pin `test/tools/translator.test.ts:320` |
| `interfaces` | `AskUserToolEntry { tool, toolName: string \| null, note }` kept (not exported). Rows: claude `AskUserQuestion` (one to four questions a call, two to four options; not in sub-agents); cursor `AskQuestion` (since 2.4; `agent -p` skips it: no answer); copilot `askQuestions` (VS Code, sub-agents too since 1.110; the note names Copilot CLI's `ask_user`, one question at a time, off under `--no-ask-user`); codex `request_user_input` (blocking in Plan mode; behind a flag in Default mode). Each note, at most two sentences, keeps "the plain-text fallback below" and maps a skipped or headless answer to no answer. Sources dated |
| `testCriteria` | GIVEN the map THEN every client has a `toolName` and a note with a dated source. GIVEN the rendered platform table THEN four rows. GIVEN `copilot.test.ts` THEN its note assertion reads the new note |
| `edgeCases` | A client whose tool exists only in some models (Cursor) → the note says so and the fallback stands |
| `depends_on` | e8-copilot-codex-claude-pins, e10-cloud-docs-matrix |
| `verify` | `npx vitest run test/tools/translator.test.ts test/emit/skillsProjection.test.ts test/adapters test/corpus/skills/flow.test.ts` |

## Inbox rows this file matched

Six rows not already listed in file 1's table:

| Ref | Disposition |
|---|---|
| `2026-10-11_release-1-14-0/close/5`, `close/9` | placed: fixed in `e5` |
| `2026-10-11_release-1-14-0/review/68` | placed: re-dated `when: touched` with its cluster |
| `2026-10-08_maintainer-tooling/build/61` | left: its trigger is a change to `hookDocumentsAfterWrite`'s unforced branch, which `e3` does not touch |
| `2026-10-10_next-tier/review/40` | left: needs a sixth placement in the ladder table and `st-work.md`, whose edits here are line-neutral |
| `2026-10-11_release-1-14-0/fix/15` | left: an isolation fix in `config.test.ts`'s `config detect` case, outside `e3`'s model keys |

## Execution order

Waves; inside a wave the units run in their own worktree lanes, files disjoint; across waves the arrows above hold:

1. `e1`, `e9`
2. `e2`, `e5`
3. `e3`, `e4`, `e6`
4. `e7`, `e8`
5. `e10`, `e11`
6. `e12`

Each lane runs its own `verify` and the census guard. A derived file that only one lane's sources feed is regenerated
in that lane (`docs/configuration.md` in `e3`); the capability matrix (fed by `e7`, `e8`, `e10` and file 3's charter
edits), the two golden snapshots and the dogfood copies are regenerated and committed by the integration step after
each wave, never by a lane, each diff read before commit.
Every `sync` of this repository's own tree runs with `STAMITY_NO_CLIENT_PROBE=1`, so no committed file carries the
integrating machine's account model lists.

**Integration with file 3.** Files 2 and 3 build at the same time on lanes cut from file 1's integrated tree, and land
on the one branch `feat/cli-native` wave by wave, by one integrator, in finishing order; after each landing the
integrator rebuilds, regenerates the derived files, and runs typecheck, lint, knip, the leak gate and the dogfood
check. The full suite runs alone under the machine lock once both files have landed, then again after file 4. The
spec deltas of files 2, 3 and 4 merge once, at the package's Prove phase, by one writer, in file order (2, then 3,
then 4), so file 3's and file 4's changes to this file's new requirements land after them. The vendor facts these
units lean on are dated 2026-10-14; re-read Cursor's hook payload fields, Copilot CLI's `models` key and Codex's model
ids when the unit is built, and record the dates.

## QA walk

No person row: the pins, hooks and the container leg are proven by committed tests and CI; vendor-cloud behaviour is
out of scope by the maintainer's answer.

## Risks

- **Warning** — Copilot's payload changes for authored hooks; mitigated by restoring the Claude names in the runner
  and translating matchers (e6), named under `Changed`.
- **Warning** — a 2.0.0 manifest blocks a downgrade to 1.14; named under `Changed`, with the clean refusal.
- **Warning** — Codex: the agent file's `model` wins over the call, so a per-call escalation does not reach a pinned
  Codex role; `/st-work`'s ladder sentence (file 4's `r3`) says so for Codex.
- **Warning** — VS Code refuses a sub-agent whose model is above the main model's cost tier; the shipped Copilot list
  puts the cheaper model first for `standard` and `economy`.
- **Minor** — how Cursor merges `updated_input` across two `preToolUse` hooks on `Task` is undocumented; the core
  guard on Cursor is telemetry only and writes no `updated_input`.
- **Minor** — between this file's merge and the release, this repository's own manifest is at 2.0.0 while the
  emitted fallback calls still name `@1.14.0`, which refuses it; the version bump at the cut ends the gap.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

- Minor · src/cli/engine/clientModels.ts · Windows npm shims (`codex.cmd`, `copilot.cmd`) are not run without a shell,
  so Windows falls back to the shipped list; run them through a fixed-argv shell call · source: /st-plan · Ref:
  docs/plans/020-cli-native-02.md · when: touched
- Minor · src/hooks/portableRunner.ts · on Cursor and Copilot the walk-up starter adds a `node` start to every hook
  call; measure the added latency as `scripts/hook-latency.mjs` does for Claude Code · source: /st-plan · Ref:
  docs/plans/020-cli-native-02.md · when: touched

## Drop list

| Item | Revisit when |
|---|---|
| Reading Cursor's `agent/runtime` metadata from the session start | Cursor serves the metadata API on self-hosted workers |
| A generated dispatch footer driven by `spawns:` | a fourth sentence must reach every touchpoint |
