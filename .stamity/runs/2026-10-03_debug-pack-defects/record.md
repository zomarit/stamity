# Run 2026-10-03_debug-pack-defects — the 1.11.0 pack-engine defects, widened to four

Status: in progress
Plan: none — debug round
Invocation: /st-debug Fix the four pack-engine defects behind the inbox's ops-pack row (src/emit/skillsProjection.ts, plan 016's block): (1) the command/skill name clash on Cursor and Codex — a check at add and sync naming both owners, with ops's two clashing skill halves renamed so add ops still syncs; (2) the Codex skills list counting only the rows Codex shows its model, still refusing above 8,000 characters with a message naming the pack and the size; (3) pack skills inert in plugin mode — the origin stamp, plus a check row for an installed pack that reaches no client; (4) an overlay on a pack skill refused loudly instead of reported then ignored. Regression tests on a made-up pack on each of the four clients and on all four together. The three init rows (source: /st-ask) ride in the same pull request; merged to main without a release.
Target: app code — wrong user-visible behaviour in the engine: `sync` exits 1, pack files never reach a client, an overlay is dropped. This checkout's generated files are not implicated; the test-runner's baseline includes the install probe.
Route: in-process — the inbox row (`.stamity/inbox.md:359`) states the input (`init -y --tools cursor|codex`, `add ops -y`, `sync`), the expected exit 0 and the actual exit 1 with its message, and the charter's test gate is runnable.
Branch: `fix/pack-engine-defects`, from `main` at `c0eb1100`.
Opened: 2026-10-03T12:02Z

## Marker check at the start

`git grep -n -E '\[STAMITY-DEBUG [0-9]{4}-[0-9]{2}-[0-9]{2}_debug-[^]]*\]'` on `main` at `c0eb1100`, 2026-10-03 just before 11:52Z (the lane was created at 11:51:59Z, right after it): exit 0, two hits, neither a probe. Both are QA-table text in two closed records that quote the stale probe scenario P24 plants on purpose (`.stamity/runs/2026-09-30_optimization-sweep/qa.md:181`, `.stamity/runs/2026-09-30_release-1-11-0/qa.md:296`). They stay in place as history. The close counts only hits that carry this run's own id.

## Reproduction with the published CLI

Fresh `git init` folders under the session's scratch directory, outside both checkouts; `HOME`, `XDG_CACHE_HOME` and the npm cache pointed inside it. Steps per row: `npx -y @zomarit/stamity@<v> init -y --tools <client>`, `add ops -y`, `sync`, `check`. Run 2026-10-03 from 11:52Z to 11:53Z (file times).

| Version | Client | init | add | sync | check | First error line |
|---|---|---|---|---|---|---|
| 1.11.0 | cursor | 0 | 0 | **1** | **1** | `Two planners emitted different content for ".agents/skills/st-incident-response/SKILL.md" (owners: cursor, cursor).` |
| 1.11.0 | codex | 0 | 0 | **1** | **1** | `The "codex" residue planner failed …: codex skills list is 9214 characters; this setup caps it at 8000.` |
| 1.10.0 | cursor | 0 | 0 | 0 | 0 | — |
| 1.10.0 | codex | 0 | 0 | 0 | 0 | — |

## Codex listing re-check (codex-cli 0.160.0)

The newest Codex release on 2026-10-03 is 0.160.0 (published that morning). Installed into a scratch prefix, the machine's own Codex untouched. In a Codex-only repository set up by `npx -y @zomarit/stamity@1.11.0 init -y --tools codex`, `codex debug prompt-input` (2026-10-03T11:53Z) printed a model-visible skills block of 8,489 characters with 21 rows: four Codex built-ins and 17 Stamity rows (the 8 core skills and the 9 rule-skills). The nine touchpoint folders (`st-ask`, `st-board`, `st-debug`, `st-plan`, `st-pr-resolve`, `st-quick`, `st-rework`, `st-spec`, `st-work`) are absent from it. They are exactly the nine folders whose `agents/openai.yaml` carries `allow_implicit_invocation`. No description was shortened. This repeats the 0.155.1 measurement of 2026-10-03 on the current release.

## Hypotheses (step 1)

From the inbox row, a read-only research pass on 2026-10-03 against `c0eb1100`, and step 1's researcher. Ranked by prior probability; each names the observation that separates it.

1. **The Cursor and Codex failure is a cross-class name clash in the shared `.agents/skills/` tree.** A pack command's touchpoint folder (`emittedIdFor`, `src/emit/skillsProjection.ts:571`, `:582`) and a pack skill's folder (`src/pack/projection.ts:593`, `:604`) resolve to the same path. The catalog keys ids by class (`src/content/catalog.ts:531-533`). `add` compares same-class ids and paths only (`src/pack/install.ts:774-795`), and `mergeSkillProjections` compares corpus skills with pack skills only (`src/emit/planner.ts:617-648`). So the composer's single-writer check throws (`src/emit/planner.ts:1135-1142`). Separating observation: a made-up pack with one command and one skill sharing an id fails the same way, and the same pack with distinct ids syncs. Its rival, a fault in ops's own bytes, predicts the made-up pack syncs.
2. **The Codex refusal counts rows Codex never shows its model.** Since 1.11.0 the touchpoint rows, pack commands included, enter the 8,000-character sum (`src/adapters/codex.ts:405-407`, `:623-633`, cap `:172`). Every one of them carries the touchpoint policy (`src/emit/skillsProjection.ts:537`, `:585-589`). Separating observation: a made-up pack of commands alone, whose descriptions exceed the core's headroom, is refused on Codex. Codex 0.160.0 shows none of those rows (above).
3. **Pack skills never reach a plugin-backed client because the pack lane omits `origin: "pack"`.** The rows are built at `src/pack/projection.ts:603-608`, while the exemptions test that field (`src/emit/planner.ts:865`, `src/adapters/claude.ts:560`). Separating observation: after a green `sync` in a plugin-backed repository, the made-up pack's skill file is absent and `check` exits 0. Wider than first reported: every adapter's `withoutPluginOwnedRows` call passes no pack exemption (`src/emit/ownership.ts:139-160`, `src/adapters/cursor.ts:514`, `src/adapters/copilot.ts:327`, `src/adapters/codex.ts:496`), so pack commands, agents and rules are dropped there too.
4. **An overlay on a pack skill is resolved by the core index, then filtered with the pack row, while the pack lane reads the unpatched bytes.** The core index resolves it (`src/emit/planner.ts:335-351`) and the row is dropped as pack-origin (`:456`). The pack lane indexes no override tree (`src/pack/projection.ts:502`) and reads raw bytes (`:600-602`). `validate` lists the overlay as a patch (`src/cli/commands/validate.ts:601-606`). Separating observation: with an overlay on a made-up pack skill, `validate` and `sync` both exit 0 and the emitted `SKILL.md` is byte-identical to the pack's.

## Probes

None. On the in-process route the failing tests alone separate the four hypotheses (step 2 runs only when they cannot).

## Failing tests (gate 2)

`test/pack/packEngineDefects.test.ts` (new, 784 lines, 34 cases), written by an implementer under step 2's exception: a
test delta only. It runs the CLI in-process against the bundled content, with one template repository per mode and
client set, copied per case (about 15 s for the file). It uses a made-up pack (`acme-demo`, plus `acme-one` and `acme-two`
for B4) with a correct integrity map, installed with `add <dir> --allow-untrusted`. The client sets are `cursor`,
`codex`, `claude`, `copilot` and all four together. Every assertion message names its defect.

| Group | Cases | What it asserts | Red today because |
|---|---|---|---|
| A | cursor, codex | `add ops -y`, then `sync` and `check` exit 0 | `sync` exits 1: the two-planner collision on Cursor; 9,214 characters on Codex |
| B1 | all five sets | `add` refuses a pack whose command and skill both emit `st-drill`, names both owners and the pack, and leaves the tree unchanged | `add` exits 0 |
| B2, B3 | cursor | `add` refuses a pack command `verify` (core skill `st-verify`) and a pack skill `work` (core command `st-work`), naming the core | `add` exits 0 |
| B4 | cursor | `add acme-two` (skill `shared`) is refused against `acme-one`'s command `shared` | `add` exits 0 |
| B5 | all five sets | a clash installed without `add` (an earlier engine's install, written from the installer's own record formats; `pack-integrity` passes): `sync` refuses, naming both owners and `clean --pack acme-demo`, not the generic collision | cursor, codex, all four: the generic two-planner message; claude, copilot: exit 0 |
| C1 | codex, all four | a commands-only pack past the core's headroom still syncs | refused at 8,789 characters |
| C2 | codex, all four | shown skill rows past 8,000 are refused, naming the size and the pack | the message names the size but not `acme-demo` |
| D1 | all five sets, plugin-backed (`plugin setup` with one `--plugin-root` per client) | the pack skill's `SKILL.md` lands where the client reads skills | `sync` exits 0 without writing it |
| D2 | all five sets, plugin-backed | `check --json` carries a `pack-reach` row with status `fail` naming a pack that reaches no client (command-only on claude, cursor and copilot; hooks-only on codex and all four, whose plugins carry the command class only on the first three) | `check` exits 0 with no such row |
| E | all five sets | an overlay on pack skill `acme-lint` (`.stamity/overrides/skills/acme-lint/SKILL.customize.md`): `sync` and `validate` exit non-zero, naming the overlay's path and the skill | both exit 0; the emitted skill is the pack's unpatched copy |

**Step 3, the reproduction.** A test-runner ran the file twice in the lane, one run after the other, with vitest's JSON
reporter (`--reporter=json`, reports kept in the session's scratch folder). Both runs exited 1 with 34 of 34 failed. Each
failure's first line is its defect or regression assertion, and none is a `fixture:` setup assertion. No first line
differs between the two runs once temporary paths are ignored. An earlier attempt gave the same 34 of 34 twice, but the
tool truncated its console output, so it was re-run with the JSON reporter. The install probe passed: `npm run build`,
then `node dist/cli.js check` exited 0 with `drift: clean`. So the install is not the target.

## Log analysis (step 4)

On the in-process route the failing tests' output is the evidence; no probe was placed.

- Hypothesis 1 holds. A made-up pack with one command and one skill sharing an id fails exactly as ops does, and gives
  the generic collision on Cursor, Codex and all four (B5). The rival, a fault in ops's own bytes, is killed: made-up
  packs with distinct names (C1, D1, E) sync cleanly. Claude and Copilot do not collide on a path (B5 exits 0 there),
  which matches the separate folders those clients read.
- Hypothesis 2 holds. A pack of commands alone is refused at 8,789 characters (C1), although Codex shows none of those
  rows (the 0.160.0 re-check above). The refusal names no pack (C2).
- Hypothesis 3 holds. In every plugin-backed set the pack skill is absent after a green `sync` (D1), and `check` exits 0
  with no row for a pack that reaches nothing (D2).
- Hypothesis 4 holds. `sync` and `validate` exit 0 with an overlay on a pack skill, and the emitted copy is unpatched (E).

## Root cause (step 5, gate `root-cause-before-fix`)

Confidence high for all four: each chain is read directly from the cited lines and reproduced by the failing tests.

1. **The name clash.** Commit `cf64788f` (1.11.0, "the nine touchpoints ship once as shared skills under
   .agents/skills") gives Cursor and Codex every admitted command, pack commands included, as
   `.agents/skills/<emittedIdFor>/SKILL.md` (`src/emit/skillsProjection.ts:571`, `:582`). A pack skill lands in the
   same folder (`src/pack/projection.ts:593`, `:604`). No step compares the two classes:
   - the catalog keys ids by class (`src/content/catalog.ts:531-533`);
   - `add` compares same-class ids and paths only (`src/pack/install.ts:774-795`);
   - `mergeSkillProjections` compares corpus skills with pack skills only (`src/emit/planner.ts:617-648`).

   The pack skill enters as a shared core row (`src/emit/planner.ts:864-877`), and the touchpoint row for the same
   path arrives later (`:939-941`, merged at `:1157`) with other bytes. The composer's single-writer check then
   throws (`:1135-1142`). `check`'s drift gate plans through the same composer (`src/cli/commands/check.ts:1107`) and
   exits 1 (`:1176-1183`, `:1704-1707`). ops ships two same-id pairs (`packs/ops/commands/st-release.md:2` with
   `packs/ops/skills/st-release/SKILL.md:2`, and `st-incident-response`). The chain would be wrong if a pack with
   distinct names failed too; C1, D1 and E show it does not.
2. **The Codex list.** The 8,000-character cap (`src/adapters/codex.ts:172`) is summed over `core.skills` plus every
   touchpoint row (`:405-407`, `:623-633`). The residue context widens the selection with pack commands
   (`src/emit/planner.ts:1013-1026`).
   - Since 1.11.0 the nine core touchpoints add 1,339 characters, so the core takes 6,909 and leaves 1,091 for every
     pack together. ops needs 2,305 (1,874 of skills, 431 of commands), which makes 9,214.
   - Every touchpoint and pack command carries `allow_implicit_invocation: false` (`src/emit/skillsProjection.ts:537`,
     `:585-589`). Codex 0.160.0 shows none of those rows to its model.
   - So the refusal counts characters that never reach the model's listing. Its text names no contributor
     (`src/adapters/codex.ts:410-415`).

   The chain would be wrong if Codex showed touchpoint rows; the measured prompt input shows it does not.
3. **Plugin mode.** The pack skill lane builds its rows without `origin` (`src/pack/projection.ts:603-608`), though
   catalog items carry `origin: "pack"` (`src/content/catalog.ts:643`). The plugin-owned filters exempt only rows
   whose origin is `pack`: the shared tree (`src/emit/planner.ts:865`) and Claude (`src/adapters/claude.ts:560`).
   So every pack skill row is dropped as plugin-owned. `sync` exits 0, and no `check` row compares what is installed
   with what reached a client: rows are `{id, status, detail}` (`src/cli/commands/check.ts:93-97`), and
   `pack-integrity` re-hashes ledger bytes only (`:816-818`).

   Wider than this run's scope: the other adapters pass no pack exemption at all (`src/emit/ownership.ts:139-160`,
   `src/adapters/cursor.ts:514`, `src/adapters/copilot.ts:327`, `src/adapters/codex.ts:496`). So pack commands,
   agents, rules and hooks are dropped too, wherever the client's plugin owns their class.
4. **The overlay.** Step by step:
   - `validate` indexes overrides together with the pack roots (`src/cli/commands/validate.ts:587-599`). The merge
     keeps `origin: "pack"` (`src/content/catalog.ts:1532`), and the overlay is listed as a patch
     (`src/cli/commands/validate.ts:601-606`).
   - `sync`'s core index resolves it too (`src/emit/planner.ts:335-351`), then drops the patched row as pack-origin
     (`:456`).
   - The pack lane indexes no override tree (`src/pack/projection.ts:502`) and copies the pack's raw bytes (`:600-602`).

   So the client receives the unpatched skill, and nothing refuses. A full override of a pack skill is refused
   (`src/emit/planner.ts:632-636`); an overlay is not.

## The failing-test gate (step 6, gate `failing-test-before-fix`)

This gate requires a test that fails on the current tree for the stated cause, with a failure message that names the
defect. Before this run the tree carried none: no test paired a command and a skill under one name, filled the Codex
list, synced a pack in plugin mode, or overlaid a pack skill. The only pack CLI runs (`test/pack/installSmoke.e2e.test.ts`,
`test/cli/dogfoodDist.e2e.test.ts`) select Claude alone. It carries one now: `test/pack/packEngineDefects.test.ts`, 34
cases, red twice for the stated causes. The fix may start.

## Hand-off (step 7)

Recorded at 2026-10-03T12:19Z: the diagnosis above and the failing tests go to `/st-work` as its plan, together with
the three init rows (`source: /st-ask`) that ride in the same pull request.
