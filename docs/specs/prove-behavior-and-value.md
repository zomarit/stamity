---
id: prove-behavior-and-value
# A design document, authored outside the spec command, amended from docs/plans/010-enterprise-release-02.md on 2026-09-26 and 2026-09-28 and from docs/plans/013-optimization-sweep-02.md and -03.md on 2026-09-30 and at the 1.11.0 cut on 2026-10-01, amended at the close of run 2026-10-03_pack-engine-defects on 2026-10-06, amended in run 2026-10-07_release-1-12-0 on 2026-10-08, amended in run 2026-10-08_maintainer-tooling on 2026-10-08, amended in run 2026-10-08_product-core on 2026-10-09, and excluded from the site build.
status: shipped-with-1.8.0
obsolete_when: the measurement page, the security mapping and the QA evidence file are all generated from live data by the engine itself, or a decision row cuts the surface
---
# Prove behavior and value

Package 11's tracks D (delivery and governance), A (the eval set) and C (the public evidence
surfaces), as shipped in 1.8.0. Baseline claims carry a `path:line` citation from the tree at
`949bde9` — `main` after 1.7.0; claims amended in the Prove phase (2026-09-15) cite the built tree.
The amendments dated 2026-09-26 to REQ-PROVE-009 and REQ-PROVE-020 come from the spec delta of
`docs/plans/010-enterprise-release-02.md` (the 1.10.0 cut) and the deltas its units' reports
declared; they cite the tree at `e995fe02`, and they shipped with 1.10.0. REQ-PROVE-020's
as-built text, and the criterion added with it, were merged on 2026-09-28 from the unit
`run-of-record-1-10-0`; they cite the tree at `0f018460`, as do the refreshed citations in that
requirement's first paragraph. The amendment dated 2026-09-30 to REQ-PROVE-021 comes from the spec delta of
`docs/plans/013-optimization-sweep-02.md` (D), merged at the Prove phase of its run; it cites the tree at `b855876a`
and shipped with 1.11.0. The amendments dated 2026-09-30 to REQ-PROVE-003, REQ-PROVE-004 and REQ-PROVE-005 come
from the spec delta of `docs/plans/013-optimization-sweep-03.md` (D) and the units `sw18-codex-rules-leave-shared-charter`
and `sw17-touchpoints-as-shared-skills`, merged in the same run's second and third spec-merge passes. The amendment
to REQ-PROVE-003 cites the tree at `cdfaa723`; those to REQ-PROVE-004 and REQ-PROVE-005 cite `a9e94f06`, the package
head once `sw17-touchpoints-as-shared-skills` had integrated. They shipped with 1.11.0. The
amendment dated 2026-10-01 to REQ-PROVE-020 was written at the 1.11.0 cut, on the release branch; it
cites the tree at `108c57e0` and shipped with 1.11.0. The amendment dated 2026-10-06 to REQ-PROVE-004 comes from
the spec delta the unit `u3-codex-shown-rows` declared in run `2026-10-03_pack-engine-defects`, merged at that run's
close; it cites the tree at `eb4f0727` and shipped with 1.12.0. The amendment dated 2026-10-08 to REQ-PROVE-016
comes from the unit `e3-spec-status-written-ahead` in run `2026-10-07_release-1-12-0`; it cites the tree at
`ee2a0e3d` and shipped with 1.12.0. The amendment dated 2026-10-08 to REQ-PROVE-020 was written at the 1.12.0 cut
in run `2026-10-07_release-1-12-0`, unit `c4-run-of-record`; it cites the run files at `67917fec` and the generator
at the commit that adds it, and shipped with 1.12.0. REQ-PROVE-030 to REQ-PROVE-036, and the text dated 2026-10-08
that names run `2026-10-08_maintainer-tooling` under REQ-PROVE-009, REQ-PROVE-017, REQ-PROVE-020 and REQ-PROVE-021,
come from that run's spec deltas (plan 019 file 1), each taken from the latest unit or fixer report that states it
and read against the integration head `47acb16e`; they are unreleased. The ids REQ-PROVE-023 to 025 belong to
`docs/plans/014-lean-repository-02.md`, which has not merged, so the ids here leave a gap; REQ-PROVE-026 to 029 are unallocated.
The amendment dated 2026-10-09 to REQ-PROVE-031 comes from the spec delta of run `2026-10-08_product-core` (plan 019
file 2), unit `p2c-ci-lanes-from-map`, merged by its unit `p9-spec-merge`; it cites the integration head `90710ba5`
and is unreleased.

## Intent

Stop shipping claims this repository cannot show. Three were open at 1.7.0: an always-on context
budget whose ceilings are pinned to a load nobody re-measured, charter invariants that bind every
turn and carry no version anyone can cite, and two promised public surfaces — a measurement report
and a security mapping — the tree names but does not contain. This spec records what closed each.

## Context

The always-on ceilings are today-measurements, not targets, and count every rule a client cannot
attach conditionally (`src/content/charter.ts:110-146`, `:210-217`): codex measures 1,063 lines
against a 150-line cap (`:53`), folding the rule set into one appendix (`src/adapters/codex.ts:117-118`).
The seven invariants (`content/charter/stamity-charter.md:34-60`) carry no version or amendment
record; human QA rows were accepted UNPERFORMED twice running; hand pages attest to pre-1.7.0 commits
(`README.md:1`); the checklist names `SET-v5` (`.github/release-controls-checklist.md:170-171`) and the
default profile `rubric-v4.md` (`evals/model-profiles-v1.json:3-8`); `SECURITY.md:207-220` says no such
mapping exists, and no `docs/measurements.md` exists at `949bde9`.

## Requirements

### REQ-PROVE-001 — Rule delivery option

`SetupManifest` gains `ruleDelivery: "always-on" | "on-demand"` (`src/types/manifest.ts:190-256`),
default `on-demand` (`:216`); `always-on` reproduces today's emission. It reads and writes through
`stamity config` (`src/cli/commands/config.ts:446-455`).

- GIVEN no `ruleDelivery` WHEN sync runs THEN emission is on-demand and config reports it; GIVEN
  `"sometimes"` THEN the write is refused at exit 1 — the CLI's only failure status, no sysexits 64
  (`src/types/errors.ts:6-13`) — with the enum message naming both values and nothing written.

### REQ-PROVE-002 — Description-scoped rules delivered as skills

Under `on-demand` a glob-less rule — today `question-protocol` and `ai-evals`
(`content/rules/stamity-{question-protocol,ai-evals}.md:1-9`) — emits on claude, copilot and codex as
`.agents/skills/stamity-<rule-id>/SKILL.md` (`src/emit/skillsProjection.ts:97`): `name`, `description`
the rule's own, `metadata.stamity` carrying id, `type: rule`, tags, `obsolete_when`, delivery and the
demoting tools (`:334-365`) — never as that client's rule file. That tree holds the union over the
selected clients. Cursor keeps `.mdc` (`…cursor.ts:356`); the `st-` surface gains nothing.

- GIVEN `on-demand` with both rules selected WHEN emission runs THEN two `stamity-<id>` skill
  directories carry their descriptions, neither rule lands under `.claude/rules/`, `.mdc` survives, and
  claude's native copy (`…skillsProjection.ts:115-117`) holds only what claude itself demotes; the APM
  distribution reads that same predicate (`scripts/generate-apm-package.mjs:42-50`) and lands a glob-less
  rule at `.apm/skills/stamity-<id>/SKILL.md`, never as an instruction (`…apmPackage.test.ts:210-228`).

### REQ-PROVE-003 — Codex folds only floors

Under `on-demand`, codex's appendix (`src/adapters/codex.ts:117-118`) carries only rules that are
`precedence: critical` (today `content/rules/stamity-secrets.md:10`), `floor:*`-tagged, or anchored
to a nested `AGENTS.md`; every other rule projects as a skill instead.

- GIVEN `on-demand` with codex selected WHEN emission runs THEN the appendix holds only floor-class
  rules and its omission notice (`:332-336`) names zero rules, or names each beside a skill path.

Amended 2026-09-30 (`docs/plans/013-optimization-sweep-03.md` § Spec delta D, unit
`sw18-codex-rules-leave-shared-charter`, integrated as `666dd70e`, `d0ee2236` and `cdfaa723`; cited at `cdfaa723`).
The appendix no longer goes into the shared root `AGENTS.md`. It goes into a root `AGENTS.override.md`
(`CODEX_AGENTS_OVERRIDE_FILE`, `src/adapters/codex.ts:101-123`), which Codex reads instead of `AGENTS.md` and no other
supported client reads. In a fixture holding both files, codex-cli 0.155.1 quoted a marker placed only in the
override, and a second run with a marker in each file quoted only the override's; Claude Code 2.1.285, cursor-agent
2026.09.28 and Copilot CLI 1.0.89 did not quote it, and all four quoted a control marker in `AGENTS.md`
(`.stamity/runs/2026-09-30_optimization-sweep/record.md:112-116`). The shared `AGENTS.md` is the core charter for
every selection, so its bytes are the same with and without Codex (REQ-PROVE-005).

- **What the override holds.** `AGENTS.md` as this sync writes it, then the appendix (`src/adapters/codex.ts:456-481`,
  `:1185-1199`). With no import decision for `AGENTS.md`, or `replace`, that is the core charter render, and nothing
  is read from disk. Under `supplement` it is the operator's text before and after the managed block, kept around
  this run's charter; under `skip` it is the operator's file as it stands (`:512-568`). It is read at plan time, so
  `check` reports the override as drift when the operator's text in `AGENTS.md` changed after the last sync, and the
  next sync carries the change across. The engine's own old block is never read back, so an appendix an earlier
  version left in `AGENTS.md` is dropped at the first sync.
- **Ownership.** The override is a Codex-owned infra row, written whole with no managed block (`:306-307`,
  `:466-478`). An operator's own root `AGENTS.override.md` is an unmanaged collision: sync refuses it without
  `--force`, and takes a verified `.bak` with it (sign-off at 14:49Z, `record.md:500-504`). Deselecting Codex reclaims
  the override. The Codex plugin does not carry it; `stamity plugin setup` writes it
  (`scripts/plugins/clients/codex.mjs:90-95`).
- **A refused source.** Before the override repeats any operator bytes from `AGENTS.md`, the gates the merge lane
  puts on kept operator bytes apply: a symbolic link or a shared hard link is refused unread, and the repeated text is
  deny-scanned (`readRepublishSource` and `republishDenyRefusal` in `src/merge/safeWrite.ts`, called at
  `src/adapters/codex.ts:549-562`). A refusal leaves the core render in the planned text and rides on the row as
  `sourceRefusal` (`src/types/content.ts:98-116`). The plan states it as a collision on `AGENTS.override.md`, of class
  `linked-source` or `deny-scan`, marked `refusedAtSource` (`src/cli/commands/sync/engine.ts:122-151`, `:313-323`),
  so `check` and `sync` agree. No writer lands the row, forced or not (`engine.ts:770-774`;
  `src/cli/commands/init/apply.ts:325-328`). The remedy named is the source's: repair `AGENTS.md`, so it is a regular,
  unlinked file with no flagged text, then sync. Neither `check` nor a sync tells the operator to move the override
  aside or to re-run with `--force` (`src/cli/commands/check.ts:1444-1471`; `src/cli/commands/sync.ts:100-128`).
  While the file on disk is still the engine's last write (a regular, unshared file whose hash matches the recorded
  row), the refused run keeps the override's ledger row, so the sync after the repair updates the file and a Codex
  deselection reclaims it (`engine.ts:569-598`, `:806-811`; sign-offs at 15:40Z and 16:05Z, `record.md:556-564`,
  `:571-576`).
- **Budget.** The 32 KiB shaper applies to the override. An override still over budget after shaping, because the
  operator text it repeats is long, gets a warning naming its size (`src/adapters/codex.ts:479-480`, `:597-609`). The
  omission notice stays in the file that dropped a rule, and the run's warning names the override as that file
  (`:587-595`, `:1377-1388`).
- **As built, where the delta differed:** the delta left the location to the live check. Candidate (a), the root
  override, passed; candidate (b), `developer_instructions` in `.codex/config.toml`, was not needed. The delta's
  expand/contract landed the Codex file first and removed the shared copy after; the build does both in one sync, and
  rollback is a re-sync at the prior version. The delta said nothing about the operator's text in `AGENTS.md`, the
  collision lane, the refused source or the kept ledger row; each comes from the sign-offs named above.

- GIVEN sync with Claude only, and with Claude plus Codex, WHEN the root `AGENTS.md` files are compared THEN they are
  byte-identical, and with Codex a root `AGENTS.override.md` holds that file's text followed by the appendix.
- GIVEN Codex selected THEN the floor-class rules exist in exactly one Codex-only root file, `AGENTS.override.md`.
- GIVEN a symlinked `AGENTS.md` under `skip`, a hard-linked one under `supplement`, or one under `supplement` whose
  operator text carries a block-severity pattern, WHEN sync plans THEN `AGENTS.override.md` is a collision of class
  `linked-source` or `deny-scan`, the file is byte-unchanged after a sync and after a forced sync, and `check` names
  the repair of `AGENTS.md`, not moving the override aside and not `--force`.
- GIVEN that refused run and then a repaired `AGENTS.md` WHEN sync runs without `--force` THEN it updates the
  override and takes no `.bak`.
- GIVEN an operator's own root `AGENTS.override.md` WHEN sync runs THEN it refuses without `--force`, and takes a
  verified `.bak` with it.
- `judgment: maintainer` · GIVEN a live Codex session on a fixture WHEN asked for the first line of the secrets rule
  THEN it quotes it. (The live check quoted a marker placed in the override, not this line.)
- Tests: `test/emit/sharedCharterIdentity.test.ts`, `test/adapters/codex.test.ts`,
  `test/ci/pluginPackages.codex.test.ts`, `test/emit/syncDriftProof.e2e.test.ts`.

### REQ-PROVE-004 — Codex skills-list budget

Emission sums `name` plus `description` characters over every projected skill when codex is selected
and refuses past 8,000 with a `VALIDATION_ERROR` naming the total and the cap (`…codex.ts:274-285`) —
the client's own published bound, not a house number, read 2026-09-14 from
learn.chatgpt.com/docs/build-skills and recorded with that date at `:121-142`. The adapter's refusal
is a `VALIDATION_ERROR`; the planner never lets that failure surface on its own terms — a residue
planner that rejects is re-wrapped as an `ADAPTER_ERROR` naming the tool and carrying the original
message (`src/emit/planner.ts:869-876`), so `sync` reports this row's refusal as an `ADAPTER_ERROR`
whose text is the codex adapter's `VALIDATION_ERROR` message.

- GIVEN skills summing past the cap WHEN emission runs for codex THEN it fails naming the measured
  total and `8000`; the matrix discloses both under "Always-on cost by client" from
  `codexSkillsListChars`/`codexSkillsListCap` (`src/emit/capabilityMatrix.ts:283-284`), each pinned to
  the full selection's real emission (`test/adapters/codex.test.ts:1710-1747`).

Amended 2026-09-30 (unit `sw17-touchpoints-as-shared-skills`; cited at `a9e94f06`). The text above names no
measured figure, and its citations have moved. The measured figure is the constant `codexSkillsListChars` in
`LIVE_ALWAYS_ON`, beside the cap `CODEX_SKILLS_LIST_BUDGET_CHARS` (`src/emit/capabilityMatrix.ts:379-385`). Before
the unit it read 5,570 characters over 17 skills, the 8 content skills and the 9 projected rules: 70% of the cap. The
nine touchpoints now ship as shared skills under REQ-FLOW-026 and sit in the same list, so the refusal counts them
(`src/adapters/codex.ts:397-418`) and the figure reads 6,909 characters over 26 skills (8 content skills, 9 rules and
9 touchpoints), 86% of the 8,000 cap. The full-selection pin in `test/adapters/codex.test.ts` holds the constant to
the real emission.

Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, unit `u3-codex-shown-rows`, integrated as `0da30714`;
cited at `eb4f0727`). The count covers only the rows Codex shows its model. `shownSkillRows` keeps every row except
those of a skill folder whose `agents/openai.yaml` sets `policy.allow_implicit_invocation: false`
(`src/adapters/codex.ts:653-683`, the policy read at `:685-697`). It reads the policy, never a name, so it drops the
nine touchpoints, every pack command, and any pack skill that ships the same companion. A companion that does not
parse, sets `true`, or carries only display fields hides nothing, so a parse failure never under-counts
(`:690-694`). Emission sums `skillsListCharacters` over the shown rows, `name` plus `description` plus 3 per
`SKILL.md` (`:638-651`), and refuses past the unchanged 8,000 cap (`:422-430`). On codex-cli 0.160.0
(`codex debug prompt-input`, 2026-10-03) the listing held the 8 content skills and the 9 rule-skills and none of the
touchpoints (the dated comment at `:176-184`); 0.160.1 gave the same result on 2026-10-06: seventeen rows shown, the
nine touchpoints hidden, nothing shortened (`.stamity/runs/2026-10-03_pack-engine-defects/record.md:298-299`).

- **The refusal names who spent the list.** It keeps the substring `codex skills list is <total> characters; this
  setup caps it at 8000`, then names the core selection's share, `Of that, the core selection takes N characters
  (k skills)`, and, when an installed pack holds a share, `; installed packs add: <pack> N characters (k skills), …`,
  largest first, ties broken by pack id. The remedies follow: `` `stamity clean --pack <id>` `` first, only when a pack
  holds a share, then narrowing the content selection, then `ruleDelivery: "always-on"` (`skillsListRefusal`,
  `src/adapters/codex.ts:699-747`). A row is a pack's when the catalog item it was rendered from, matched by class and
  artifact id, carries pack provenance (`packOf`, `:845-853`); corpus, fork and override rows are the core's share.
  The planner's `ADAPTER_ERROR` re-wrap above is unchanged.
- **The figure.** `codexSkillsListChars` reads 5,570 characters over the 17 shown skills, the 8 content skills and the
  9 projected rules, about 70% of the cap (`src/emit/capabilityMatrix.ts:379-387`). This supersedes the 6,909 over 26
  skills of the 2026-09-30 amendment: the nine touchpoints still sit in the same tree, and the client does not list
  them. The full-selection pin ("holds the matrix's published skills-list total to the FULL selection",
  `test/adapters/codex.test.ts:2087`) now measures the shown rows, and holds them to 17 with no touchpoint among them.
- **Open.** The policy reader accepts YAML merge keys, so a pack could hide a row from this count through a key a Codex
  parser might not honour. The direction is an under-count against this setup's own cap; the row is deferred
  (`review/2`, `.stamity/runs/2026-10-03_pack-engine-defects/record.md:131-134`).

- GIVEN shown skill rows summing past the cap, with two installed packs holding shares, WHEN emission runs for codex
  THEN the refusal keeps `is <total> characters; this setup caps it at 8000`, names the core share and each pack's
  share with its skill count after `installed packs add:`, largest first, the shares summing to the total, and names
  `` `stamity clean --pack <id>` ``; GIVEN no pack holding a share THEN it names the core share only, and neither
  `installed packs add` nor `clean --pack` (`test/adapters/codex.test.ts`, "names each installed pack's share and the
  core's in the refusal, keeping the pinned total" and "names the core's share only when no pack is installed";
  `test/pack/packEngineDefects.test.ts:604`, C2).
- GIVEN a commands-heavy pack, or pack skills that each ship `policy.allow_implicit_invocation: false`, whose rows
  counted whole would pass the cap WHEN sync runs for codex THEN it succeeds, and the shown total counts neither
  (`packEngineDefects.test.ts:575`, C1; `codex.test.ts`, "leaves the touchpoints out of the skills list: their policy
  hides them from the model" and "does not count a pack skill that ships its own hiding policy, nor a pack's
  commands").
- GIVEN companions that hide, carry display fields only, do not parse, or set `true` WHEN `shownSkillRows` runs THEN
  only the hiding folder's rows drop (`codex.test.ts`, "drops a folder whose agents/openai.yaml hides it, and keeps
  display-only and malformed companions").

### REQ-PROVE-005 — Always-on composite re-measured

`composeAlwaysOnLoad(tool, plan, mode)` counts, per client, the charter plus only the rules it still
loads unconditionally under that mode (`src/content/charter.ts:307-320`); `ALWAYS_ON_BUDGET_LINES`
(`:157-208`) and the two shared-byte constants (`:250`, `:268`) re-pin to the measured load — cursor
95 · claude 95 · copilot 95 · codex 407 lines, 24,904 shared bytes with codex against 5,192 without.

- GIVEN `on-demand` WHEN the corpus suite runs THEN every ceiling EQUALS the computed composite, and
  fails in both directions — over is a slice nobody authorised, under a saving nobody wrote down
  (`test/corpus/invariants.test.ts:588-603`); the matrix names each client's mode.

Amended 2026-09-30 (`docs/plans/013-optimization-sweep-03.md` § Spec delta D, unit
`sw18-codex-rules-leave-shared-charter`, with the charter edit of `sw17-touchpoints-as-shared-skills`; cited at
`a9e94f06`). The shared root `AGENTS.md` is the same file with and without Codex (REQ-PROVE-003, amended
2026-09-30), so the two shared-byte constants hold one figure: `ALWAYS_ON_SHARED_BYTES_WITH_CODEX` and
`ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX` both read 5,304 bytes on the cross-client golden (`src/content/charter.ts:313`,
`:339`). The appendix's bytes are Codex's own, counted in Codex's row as a third constant,
`ALWAYS_ON_CODEX_OVERRIDE_BYTES`, which reads 25,334 (`:341-362`). It began at 25,306, the old with-Codex figure byte
for byte, and took the same +20 and then +8 bytes as the shared pair when the charter's touchpoint paragraph was
reworded twice (`review/157`, `review/162`; the dated comments at `:301-312`, `:335-338` and `:358-361`). The line ceilings hold, cursor 95 ·
claude 95 · copilot 95 · codex 407 (`:157-216`), and `composeAlwaysOnLoad` is at `:401-414`. The corpus suite requires one root `AGENTS.md` figure in the golden, equal to
both shared constants, and every `AGENTS.override.md` figure equal to the third. The capability page's guard refuses
two shared figures that differ, and an override figure not larger than the shared one
(`src/emit/capabilityMatrix.ts:521-553`), and the page carries the override's bytes in Codex's row (the input, `codexOverrideBytes`, at `:363-368`). A
real four-client init at the `sw18-codex-rules-leave-shared-charter` build, before the +20, measured the shared file at 5,379 bytes with Codex and 5,379 without (`cmp`
identical) and the override at 25,409 (`.stamity/runs/2026-09-30_optimization-sweep/record.md:545-546`); a real init
pins a different CLI version into the charter than the golden does, so its bytes differ from the golden's. The
figures in the paragraph above read "24,904 shared bytes with codex against 5,192 without"; the constants named here
are the figures of record, and a charter edit moves them.

- GIVEN the cross-client golden WHEN the corpus suite runs THEN it records one root `AGENTS.md` byte figure, equal to
  both shared constants, every `AGENTS.override.md` figure equals `ALWAYS_ON_CODEX_OVERRIDE_BYTES`, and every ceiling
  equals the computed composite (`test/corpus/invariants.test.ts`).
- GIVEN a disclosure whose two shared figures differ, or whose override figure is not larger than the shared one,
  WHEN the capability page renders THEN it refuses (`test/emit/capabilityMatrix.test.ts`).

### REQ-PROVE-006 — Charter carries the ai-evals floor in one line

The charter template states, in one physical line, that a model-backed feature ships with a versioned
golden-and-adversarial eval set whose thresholds are declared before the run, and stays under
`CHARTER_MAX_LINES` (`src/content/charter.ts:56`; the template is 95 lines). That line carries the
floor alone — 116 characters at `content/charter/stamity-charter.md:92`, no `ai-evals` skill clause.

- GIVEN the charter template WHEN the corpus suite runs THEN one physical line of the conditional
  layer names the floor, the body states it once, and `lineCount` ≤ 150 (`…charter.test.ts:220-236`).

### REQ-PROVE-007 — Charter invariants version

The charter frontmatter (`…stamity-charter.md:1-11`) gains `invariants_version`, `invariants_ratified`
and `invariants_amended`, read typed as `CharterInvariants | null` (`src/content/charter.ts:341`); every
emitted charter renders `Invariants version <semver> · ratified <date> · last amended <date>` under
`## Invariants`, from a `${STAMITY:…}` token (`…charter.md:38`).

- GIVEN a sync per client WHEN the emitted charter is read THEN each carries that line substituted and
  the goldens carry it; GIVEN a template carrying the token or any one of the three keys WHEN it loads
  THEN an absent or malformed key fails `VALIDATION_ERROR` naming it (`:432-482`), while a template
  carrying neither loads unversioned.

### REQ-PROVE-008 — Invariants block gated by hash

A suite test slices the `## Invariants` block (`content/charter/stamity-charter.md:37-64`), hashes it
and fails when the text moves without a version bump and an amendments row in `docs/doctrine.md:151`;
the version→hash pair is the only pinned literal, and `GOVERNANCE.md:71` states the rules and bumper.

- GIVEN an invariant edited with the version unchanged WHEN the suite runs THEN it fails naming both
  hashes and the missing row; `stamity check` prints an `invariants` doctor row (`…check.ts:640-651`).

### REQ-PROVE-009 — Eval set v7 with cases-v6

`evals/cases-v6/**` and `evals/SET-v7.md` are the current set; SET-v6, `cases-v5` and earlier stay
retained and unchanged (`evals/README.md:8`, `:28-30`). The four thresholds and SET-v6's scoring rule
carry over verbatim (`evals/SET-v6.md:82-87`); every gate under `test/evals/` reads the new constants.

- GIVEN the repository WHEN the eval gates run THEN they resolve `SET-v7.md` and `cases-v6/` with
  SET-v6's thresholds, and a successor-inputs test proves `cases-v5`'s Expected blocks survive.

Prove-phase amendment (2026-09-15, after run 27 and a maintainer decision): `evals/SET-v7.md` also
declares how a later candidate is measured within one configuration — a release's first complete run is
its baseline, a later run re-measures only the cases whose file bytes or cited source text moved and
carries every other case's three admitted samples from the prior complete run's public artifact — while
the four thresholds and the SET-v6 scoring rule carry over verbatim. GIVEN a second candidate in the same
configuration WHEN a run is composed THEN every carried case is named with its prior run, its case-file
sha256 and the source ranges found identical, the whole set is scored under the unchanged rule, and the
artifact's per-case table marks each carried case with the run it came from.

Amended 2026-09-26 (plan 010 file 2, decision D4): at 1.10.0 the `claude` profile's scenario model is
`claude-opus-5-5`; the judge is unchanged. The comparator key carries the model pair.

- GIVEN two runs with an equal profile name, rubric-core hash and harness but different scenario models
  WHEN a run is composed or its advisory repeats are compared THEN the earlier run is not its prior run.
- GIVEN the 1.10.0 release run THEN it measures all 102 cases at three samples with calibration first,
  and its advisory-repeat section reads "first run of this configuration".

Declared by the units' reports (`eval-profile-move`, `eval-effort-high`) and merged with it:

- GIVEN `evals/model-profiles-v1.json` WHEN the `claude` profile is resolved THEN its scenario declares
  `reasoningEffort: "high"`, which the run's driver sends as the client's explicit `--effort high`, and
  its judge declares `null`, the harness default with no claimed effort value.
- GIVEN a prior run summary whose advisory failures are objects `{caseId, failed[]}` WHEN advisory
  repeats are computed THEN each `caseId:criterion` in `failed` is compared with the runner's string
  ids.
- GIVEN a committed run that recorded none of the profile, the rubric-core hash, the harness or the
  model pair THEN it is no run's prior run; GIVEN one that recorded no model pair THEN it is compared
  on the fields it did record.
- GIVEN a model id with a trailing `[1m]` THEN the comparator reads it as the same model without the
  suffix, and the recorded id stays verbatim.

As built at `e995fe02`: the profile is `evals/model-profiles-v1.json:9-10`, documented at
`evals/MODEL-PROFILES-v1.md:10`, `:19-21` and `:32-33`. The comparator is `comparatorKey`,
`COMPARATOR_FIELDS`, `comparedField`, `recordedKey` and `sameConfiguration`
(`scripts/eval/run.mjs:93-144`); `advisoryRepeats` reads both failure shapes (`:236-241`), and
`previousRun` keeps only a run of the same key (`:243-257`). `evals/SET-v7.md` carries the dated
paragraph (`:884-893`) and § 8's comparator sentence (`:940-953`). Tests:
`test/evals/modelProfiles.test.ts:29`; `test/evals/manualRunner.test.ts:1332`, `:1537`, `:1562`,
`:1582` and `:1596`. Measured on 2026-09-27: run 34, the 1.10.0 baseline, measured all 102 cases at
three samples with calibration first (`evals/runs/2026-09-27-run-34/RESULTS.md:14`, `:42`,
`:197-201`), and its advisory-repeat section reads "first run of this configuration" (`:191`), so
the second criterion above holds. Run 35 re-measured two cases and composed with run 34 on the same
pair (`evals/runs/2026-09-27-run-35/RESULTS.md:12`, `:297`). Composing runs and the "first run of
this configuration" line belong to the route of record's driver, which lives outside this repository;
SET-v7 says the "never composed" half holds once that driver compares the pair too
(`evals/SET-v7.md:886-890`). The `scripts/eval/run.mjs` and `evals/SET-v7.md` citations in this
paragraph were re-pointed on 2026-10-08 (run `2026-10-08_maintainer-tooling`, ledger `build/12`) to
the integration head `47acb16e`, where both files had moved; the rest of it cites `e995fe02`.

### REQ-PROVE-010 — Trigger probes for rule-projected skills

Every rule delivered as a skill gains a should-trigger and a should-not-trigger probe in `cases-v6`,
each listing the extended skill surface in its `## Brief`. Recall labels derive from the case's
`source:` — rule file → `stamity-<id>`, skill file → its directory — not the id pattern (`…:1021-1023`).

- GIVEN a probe sourced to `content/rules/stamity-ai-evals.md` WHEN `aggregate` runs THEN its recall
  row is labelled `stamity-ai-evals`, and every existing probe keeps its SET-v6 label.

### REQ-PROVE-011 — Charter-floor twins

The four cases sourced to the two glob-less rules (`evals/cases-v6/golden/question-shape-and-default.md:5`,
`…/subagent-returns-blocked-ambiguity.md:5`, `…/unattended-run-applies-declared-default.md:5`,
`evals/cases-v6/adversarial/eval-change-needs-fresh-measurement.md:5`) each gain a twin governed by a
floor line alone: invariant 2 (`…charter.md:48-50`) for three, REQ-PROVE-006's line (`:92`) for the fourth.

- GIVEN `cases-v6` WHEN the set is parsed and scored THEN four twins exist, each quoting only its
  floor line and carrying its original's Expected block, `floor` value and CLASS — three golden with
  `floor: true`, one adversarial; the roster derives 51 golden, 19 adversarial, 30 probes, 24 floor
  cases, 516 binding and 57 advisory criteria (`evals/SET-v7.md:117-118`).

### REQ-PROVE-012 — Persistent rows repaired in the corpus

Three obligations move to the point of production: `content/agents/stamity-performance.md` states that
a Brief fact restated in a finding body still needs its own `path:line`; `…/stamity-security.md` states
that a path without a line is a bare path, the same defect as no citation; `content/commands/st-spec.md`
states that with several next-step conditions live the step names exactly one, never a `then` sequence.
The sealed Briefs and `source:` ranges move in the same diff, under `evals/cases-v6/`:
`golden/agent-{performance,security}-return-contract.md:5`, `golden/spec-next-step-derived-from-run-state.md:5`,
and a fourth quoting the repaired security bullet, `adversarial/security-agent-no-write-under-pressure.md:5`.

- GIVEN the four corpus files WHEN the corpus suite runs THEN each obligation sits in the section
  producing the artifact it governs, and each successor's `source:` range matches the repaired text.

Prove-phase amendment (2026-09-15, after runs 27 and 28): four further point-of-production repairs —
the injection-screening report says in its own words that the run continues on its objective, the
pull-request screen's class description is the class label and the locator and nothing else, the
performance agent's finding rows carry a `method:` slot, and the spec author's ambiguity return names the
smallest unblocking input — each with its case's Brief mirrored in the same diff and no Expected block
moved; and eight advisory criteria that missed in two consecutive runs were disposed under SET-v7's
own rule (two promoted on quoted source text, six deleted with reasons), recorded in the case files, in
`EXPECTED_MOVES` and in SET-v7's roster.

### REQ-PROVE-013 — Ordering criteria surfaced

`parseGrade` (`scripts/eval/instrument.mjs:855`, `:899`) tags a binding row `orderingCriterion: true`
when its criterion matches `ORDERING_VOCABULARY`, the closed regex held in one place (`:852`), and
`aggregate` returns `orderedFalseOnOrdering`: one `{caseId, sample, row}` per admitted tagged row whose
spans located `ordered: false` (`:1063-1080`), serialized into `summary.json` (`…eval/run.mjs:195-203`)
and rendered as RESULTS §6b by the driver of record.

- GIVEN a graded row naming an ordering whose spans located unordered WHEN `aggregate` runs THEN it
  appears in that list and no untagged row does, and a 27-grade replay of run 24's adjudicated judge
  outputs moves no verdict (`test/evals/manualRunner.test.ts:1494-1514`, `:1529-1575`).

### REQ-PROVE-014 — Windows worktree add retried once

`addWorktree` (`src/worktree/git.ts:625-659`) retries `git worktree add` exactly once, after a short
delay, when git exits 128 with stderr matching `failed to read .*commondir`. Named collisions stay
`VALIDATION_ERROR` (`:640-657`), the rest `FS_ERROR` (`:658`); a learning lands via `stamity learn
capture`.

- GIVEN a stubbed runner failing that way once then exiting 0 WHEN `addWorktree` runs THEN it is
  called exactly twice and resolves; failing every time it is still called exactly twice.

### REQ-PROVE-015 — Atomic-write rename budget widened on win32

The win32 branch of `RENAME_RETRY_DELAYS_MS` gains four further `800` ms steps on top of today's eight
(`src/merge/atomicWrite.ts:969-972`), so `RENAME_RETRY_CEILING_MS` — derived, never written down
(`:985-994`) — recomputes to 8,687.5 ms (12 steps × 1.25 jitter), inside the band; POSIX keeps its
four retries and 750 ms. `RENAME_WAITS_MS` (`src/hooks/scripts.ts:1570`) is a second copy that moves
with it, pinned to `RENAME_RETRY_COUNT` (`…hooks/scripts.test.ts:2279`). The real-disk test is untouched.

- GIVEN `process.platform` is win32 WHEN the schedule is summed THEN `RENAME_RETRY_CEILING_MS` is over
  7,000 ms and under 9,000 ms with the inline reason citing CI run 34771471163, POSIX still pinning 4 and
  750 ms (`test/merge/atomicWrite.test.ts:168-196`); GIVEN a stubbed `rename` rejecting `EPERM` fewer
  times than the schedule allows THEN the write lands with no temp file left, and a sharing errno past
  the schedule fails with the path named (`:1229-1266`, `:1268-1321`).

### REQ-PROVE-016 — Spec status gate

A records test requires every `docs/specs/*.md` `status` to read `design`, `shipped` or
`shipped-with-<semver>` and refuses `draft`; a spec named by a plan whose `stamp:` commit precedes the
newest `v*` tag may not read `design` either (`test/records/specStatus.test.ts:47`). At `949bde9`
`implementation-finish.md:3` is `draft`, and `workspace-surface.md:4`, `worktree-lane.md:4` and
`overlay-layers.md:4` are `design` → `shipped-with-1.7.0` and three `shipped-with-1.1.0`.

- GIVEN a spec reading `draft` WHEN the records test runs THEN it fails naming the file and the three
  forms; one reading `design` that a pre-tag plan names fails naming the plan and the tag when it defines
  no requirement id or a file under `test/` cites one of its ids, and passes while no test cites any.

Amended 2026-10-08 (run `2026-10-07_release-1-12-0`, unit `e3-spec-status-written-ahead`; cited at
`ee2a0e3d`). A `design` spec a pre-tag plan names is flagged only when it defines no `REQ-<AREA>-<nnn>` id
or a file under `test/` cites one of the ids it defines, both read from the tree, so a spec a plan wrote
ahead of the release that builds it (`board-writes.md` at the 1.12.0 cut) keeps `design`
(`test/records/specStatus.test.ts:190-232`, the tree's citations at `:288-304`).

### REQ-PROVE-017 — Eval documentation currency

The default `claude` profile selects `evals/rubric-v7.md` (v4 today: `evals/model-profiles-v1.json:3-8`)
and a test derives the README's current-rubric row from the selected profile, not from prose
(`evals/README.md:16`, `:21`). The README path table and the runner skill's dispatch section name
`stamity-claude-cli-v1` as the route of record; the checklist points at SET-v7 in place of SET-v5
(`.github/release-controls-checklist.md:170-171`) and carries the hand-page re-attestation line; both
Codex profiles are marked "documented, unproven, no run of record" with the control gap named.

- GIVEN the profile document WHEN the eval docs test runs THEN the README's current-rubric row equals
  the default profile's `rubric`, editing one alone fails, and no page names a superseded set.

Prove-phase amendment (2026-09-15): the checklist's eval line reads "measured per `evals/SET-v7.md` —
by the release's baseline run, or by an incremental run composed with it" and the release carries the
composed artifact; `evals/README.md` states that composition belongs to the route of record's driver and
that the manual runner documented there runs the full set. Amended 2026-10-08 (run
`2026-10-08_maintainer-tooling`, unit `c3-release-rules`): the checklist's eval line reads the
change-aware rule of REQ-PROVE-033, and each per-release line names the trigger it runs on
(REQ-PROVE-034).

### REQ-PROVE-018 — Hand pages re-attested

Every hand page carries `verified against the tree at the 1.8.0 release cut (<date>)` after a
claim-by-claim check, replacing the pre-1.7.0 attestations (`README.md:1`, `SECURITY.md:1`).
`test/docsPages.test.ts`'s `RELEASE_CUT_DATE` equals it, and its `describe("hand pages")` case
`it("dates the bucket at this cut, and no page later than it")` enforces both halves over the
fourteen-page `HAND_PAGES` bucket — `PAGES`, the three root pages, plus `GUIDES`, the eleven guides —
holding a re-attested page to `REATTESTATION_DATE` and a cut-form page to `RELEASE_CUT_DATE`.
`GOVERNANCE.md:1` is restamped as a fifteenth page, deliberately outside that bucket: its `GOVERNANCE`
constant is kept out of `PAGES`. Those citations name the constants and the test case rather than
line numbers ON PURPOSE (2026-09-22): every release cut moves this suite's lines — `RELEASE_CUT_DATE`
and the gate both moved again in this session — so a line-numbered citation into it stops pointing at
its evidence at the next cut while still reading as though it did, and a name a `grep` resolves does
not.

- GIVEN every hand page WHEN the docs-pages suite runs THEN each attests to the 1.8.0 cut date, at
  least one equals `RELEASE_CUT_DATE`, and none attests later than it.

### REQ-PROVE-019 — Security mapping written

`SECURITY.md`'s two open proof rows (`:260-261`) cite the pack-signing rehearsal run 34758487370 and
the release run 34771477218 as closed evidence. `docs/security-mapping.md` carries the version-pinned
OWASP (agentic 2026, LLM 2025, web 2021), NSA/CISA and NIST AI RMF mappings — publisher, edition and
read date, no URL, the hand-page link policy admitting only this repository's GitHub home (`:41-100`)
— and the actor/vector/control/residual table with mapped ids, every control traced to `path:line`;
`SECURITY.md:214-216` points at it and the guides roster lists it (`…docsPages.test.ts:134-148`).

- GIVEN the new page WHEN the docs suite runs THEN seven `###` surface headings stand (six engine
  surfaces plus the release publish path) over a `## Gaps` section, every control symbol resolves in the
  file it names, and roster, sidebar and `SECURITY.md` reach it (`…docsPages.test.ts:1090-1149`).

### REQ-PROVE-020 — Measurement report

`scripts/merge-ready-rate.mjs` computes the verified merge-ready rate from committed run records —
denominator, numerator, exclusions by run id (a record reading in progress among them), merge evidence
reported per run and never scored (`src/cli/docs/measurements.ts:258`, `:485-607`). `docs/measurements.md`
(absent at `949bde9`) renders from the committed snapshot `evals/measurements/merge-ready-<date>.json` —
5 of 7 at the first — refreshed per release by `node scripts/merge-ready-rate.mjs --write`
(`.github/release-controls-checklist.md:228-233`), beside a committed npm-download snapshot labelled a
reach proxy; it enters roster, sidebar, `llms.txt` and the README map (`src/cli/docs/llmsIndex.ts:263-271`,
`website/sidebars.ts:57`, `llms.txt:40`, `test/docsPages.test.ts:539-542`),
and doctrine and getting-started link the run of record and the first-run proof lanes without touching
README's mission or tagline sentences.

- GIVEN the committed snapshot WHEN the page is regenerated twice THEN it is byte-identical, the proxy
  label and every excluded run id are present, and README's lines are unchanged.

Amended 2026-09-26 (plan 010 file 2): the carried-to criterion added at the 1.9.1 cut is retired
together with the clause: runs 34 and 35 are 1.10.0's own run of record. Run 34 measured every case
in full on the new model pair, and run 35 re-measured the two cases the Invariant 2 tightening moved,
composed with run 34. The stated-confidence reading ignores version numbers. (Runs named 2026-09-27:
run 33 ended terminal, and runs 34 and 35 replace it.)

- GIVEN the tree after the cut THEN `RUN_OF_RECORD_CARRIED_TO`, `RUN_OF_RECORD_CANDIDATE` and
  `carriedToRelease` are absent, and README, the doctrine and the page name run 35 as the 1.10.0
  release run, composed with run 34, and run 34 as the run that measured every case in full.
- GIVEN a composed run of record whose full baseline alone failed a floor case (run 34 is
  `Status: **FAIL**`, `evals/runs/2026-09-27-run-34/RESULTS.md:3`, with
  `question-shape-and-default-charter-only` failing at `:48`) THEN the page, README and the doctrine
  each say that the baseline alone was FAIL and name the failing floor case, the Invariant 2
  tightening (invariants 1.1.0), and the run that re-measured the two moved cases, composed with the
  baseline (`docs/measurements.md:145-148`, `README.md:36-38`, `docs/doctrine.md:101-104`); when the
  baseline passed, no surface calls it FAIL. Added from the `run-of-record-1-10-0` fixer's report,
  `review/200`. Test evidence by describe name, since every cut moves this suite's lines:
  `test/docsPages.test.ts`'s "the eval run of record on the hand pages", its case "%s discloses a
  FAIL baseline behind the composed run of record", which reads the run ids, the status and the
  failing ids off both results files rather than typing them.
- GIVEN a verdict line "medium / 0.60 … 1.10.0" THEN the stated confidence reads 0.60. GIVEN "approve
  for 1.10.0" alone THEN no confidence is read.
- GIVEN a verdict line naming a two-part version ("on 1.9", "the 1.10 line") or a version ending in
  `.x` ("1.0.x", "1.10.x") and no confidence THEN no confidence is read (added from the
  `confidence-version` fixer's report, `review/6` and `review/7`).

As built at `0f018460` (merged here 2026-09-28 from the unit `run-of-record-1-10-0`,
`docs/plans/010-enterprise-release-02.md:231`, commits `2701139a` and `0f018460`). The confidence
half: a stated confidence is a `0.x` number or `1.0`, not part of a version number. `CONFIDENCE`
refuses a match preceded by a word character or a dot, or followed by a word character or by a dot
and a word character (`src/cli/docs/measurements.ts:206-215`), and `statedConfidence` drops any value
above 1 before it takes the last one (`:423-428`). The rows are
`test/cli/docs/measurements.test.ts:682-696`. The retirement half: `RUN_OF_RECORD_CARRIED_TO`,
`RUN_OF_RECORD_CANDIDATE` and `carriedToRelease` are gone; a search over `src` and `test` finds none
of them. `RUN_OF_RECORD_PATH` names run 35's results file (`src/cli/docs/measurements.ts:103`), and
`RUN_OF_RECORD_RELEASE` is `1.10.0` (`:116`); both constants are gone since 2026-10-08, and the path
and release are read from `evals/run-of-record.json` through `readRunOfRecord` (REQ-PROVE-032). The template (`:858-870`) links run 35 as the 1.10.0
release run, names run 34 as the run that measured every case in full, says run 34 alone was FAIL on
one floor case, and names run 35 as the run that re-measured the two cases whose files moved,
composed with run 34. The composition case (`test/cli/docs/measurements.test.ts:435-498`) walks the
chain `2026-09-27-run-35 -> 2026-09-27-run-34`: run 35 names run 34 as its prior complete run
(`evals/runs/2026-09-27-run-35/RESULTS.md:12`), and run 34 has no composition section, so the walk
ends there. Its matcher reads `runs?`, so a one-link chain passes (`:487-492`). The page case
(`:515-525`) and the hand-page case (`test/docsPages.test.ts:1225-1229`) refuse a carried clause.

Amended 2026-10-01 (the 1.11.0 cut; cited at `63306fac`). The 1.11.0 run of record is run 39,
composed with run 38 under SET-v7's incremental rule. Run 38 measured every case in full, carrying
nothing from run 37 (the first complete run on the new client version, 2.1.286) because it was a
full re-measure after the quick lane's refusal fix. Run 38 alone was FAIL on one floor case,
`security-patterns-findings-named-by-category` (`evals/runs/2026-10-01-run-38/RESULTS.md:48`),
because a network outage on the runner blocked that case's third sample: its three attempts each
ended `process-exit` (`evals/runs/2026-10-01-run-38/RESULTS.md` § 10, `:239-241`), and run 39
records the cause (`evals/runs/2026-10-01-run-39/RESULTS.md:161`). Run 39 re-measured that one
case, "prior samples not all admitted", and carried the other 112
(`evals/runs/2026-10-01-run-39/RESULTS.md:12-16`). Run 37, the first complete run on that
configuration, is published as the FAIL run; run 36 ended early on the client's classifier
re-prompt and is not published. For 1.11.0 this supersedes the 2026-09-26 criterion above that
README, the doctrine and the page name run 35 as the 1.10.0 release run: they name run 39 as the
1.11.0 release run, composed with run 38, and run 38 as the run that measured every case in full,
and that criterion's FAIL-baseline disclosure binds through the derived pattern below. 1.10.0's run
of record was composed too, run 35 with run 34. The page admits both kinds, a composed run and a
full one (the TEST CHANGE note above the renamed case named below).
The composed paragraph and the hand pages' FAIL-baseline disclosure are derived from the two runs'
results files rather than typed for one composition — the run of record's `## 0. Composition`
(the prior run, each re-measured case with its stated reason, the carried count) and the prior
run's `Status:` line, its § 5 failing floor or guardrail cases, and each metric its § 5 reads NOT
met for — as held by the describe "the
composed paragraph is derived from the two results files" in `test/cli/docs/measurements.test.ts`
(its cases "renders today's composed paragraph from run 35 and run 34" and "renders a run composed
with a prior FAIL on one floor case, one case re-measured") and by `test/docsPages.test.ts`'s "%s
discloses a FAIL baseline behind the composed run of record". The page words one composition link,
a prior run that measured every case in full: a prior run that is itself composed makes the render
throw with an error naming the chain it found (run 32 -> run 31 -> run 30 is a real two-link
chain) rather than word a longer chain as one link.

- **What the page renders for a full run.** When the run of record's `RESULTS.md` has no
  `## 0. Composition` section, the corpus section renders the full-baseline paragraph in place of
  the composed one: "That run is a full baseline: its results file names no prior complete run, so
  no case is carried from an earlier run. Run N measured every case in full on its own candidate.
  The set is SET-v7." (`src/cli/docs/measurements.ts:1065-1070`). It makes no composed, re-measure or
  carry claim. The scoring-rule sentence after the paragraph is the same for both kinds (`:1250`).
- **The one reading.** `priorCompleteRun` (`src/cli/docs/measurements.ts:166-182`) decides the kind,
  and the page branches on it (the results file read at `:1124`, the branch at `:1064-1065` through
  `compositionOf`, which calls it at `:241-242`). It reads the prior-run line only inside the
  `## 0. Composition` section, down to the next `## ` heading (`:133-136`, `:167`, `:177-181`,
  `:188-195`), and returns `null` for a full run. It throws `VALIDATION_ERROR` on a section-less file that still
  carries a composed marker, the `| Carried case |` table header or the "case(s) carried" count
  (`:144`, `:169-174`), and on a section that names no prior run (`:177-180`). The composition-chain
  walk in `test/cli/docs/measurements.test.ts` and the hand-page case in `test/docsPages.test.ts`
  read the fact through this export rather than through regexes of their own.
- **No disclosure without a composed run.** With a full-baseline run of record, none of README, the
  doctrine page and the measurements page carries an "alone was FAIL" composition disclosure. The
  FAIL-baseline criterion above binds only when the run of record is composed.

- GIVEN a run of record whose results file has no `## 0. Composition` section and no composed
  marker WHEN the page renders THEN it calls that run a full baseline that measured every case in
  full on its own candidate, and contains none of "composed", "incremental rule", "re-measure",
  "carries the rest", "carried the rest" or "alone was FAIL"; GIVEN a composed one THEN the composed
  paragraph renders without the full-baseline sentence, and the page above the corpus section is
  the same for both. Test evidence by name, since every cut moves these suites' lines: in
  `test/cli/docs/measurements.test.ts`, the case "says how the run of record was measured: composed
  from the runs it names, or in full" (renamed from "says the run of record is composed, and names
  the runs it was composed from"), and the describe "a full run of record" with its case "renders a
  full baseline's prose from a full results file, and the composition from a composed one", run on
  run 34's real results file before run 38 exists.
- GIVEN a section-less results file carrying either composed marker, or a composition section that
  names no prior run, WHEN `priorCompleteRun` reads it THEN it throws `EngineError`; GIVEN a full
  run whose prose names a prior run outside that section THEN it still reads as full. Test evidence:
  the same describe's cases "is read off the composition section alone, and a broken section throws"
  and "refuses a section-less results file that still carries a composed marker".
- GIVEN a full-baseline run of record THEN README, the doctrine and the page carry no "alone was
  FAIL" disclosure: `test/docsPages.test.ts`'s "the eval run of record on the hand pages", its case
  "%s discloses a FAIL baseline behind the composed run of record" (name unchanged; the full-run
  branch added), and the added case "tells a full run's results from a composed run's by the
  prior-run line", which holds the reading to run 34 (full, `null`) and run 35 (composed, naming
  run 34).

Amended 2026-10-08 (the 1.12.0 cut; the run files cited at `67917fec`). The 1.12.0 run of record is
run 43, composed with run 42 under SET-v7's incremental rule, and it is FAIL. Run 42 measured every
case in full and was FAIL on one floor case, `charter-floor-relaxation-refused`
(`evals/runs/2026-10-08-run-42/RESULTS.md:3`, `:48`), because one of its samples went ungraded: the
judge emitted no grade in three attempts (`:244-245`). Neither results file states the shape of the
answer that went ungraded; the release run's record does, from the run's private captures: a bare
"Not done:" answer, the exit the charter prescribes, in runs 40, 42 and 43 alike
(`.stamity/runs/2026-10-07_release-1-12-0/record.md`, its section "The release eval run"). Run 43
re-measured that one case, "named by the operator", and carried the other 112
(`evals/runs/2026-10-08-run-43/RESULTS.md:12`); one of its three samples went ungraded the same way
(`:354`) and both graded samples passed, so the composed run reads `Status: **FAIL**` (`:3`),
floors 22/23 (`:171`) and guardrail hold 17/18, NOT met (`:172`), with every other threshold met
and none moved. On 2026-10-08 the maintainer answered "Ship with exception" and 1.12.0 shipped on run 43.
For 1.12.0 this supersedes the 2026-10-01 criterion that README, the doctrine and the page name run
39 as the 1.11.0 release run: they name run 43 as the 1.12.0 release run, composed with run 42, and
state its FAIL, the cause and the exception.

- **The verdict is read, not typed.** The page's status word is the run of record's own `Status:`
  line, through `runOfRecordVerdict` (`src/cli/docs/measurements.ts:164`, called at `:1393`), and
  the golden line's floor clause is `floorClause` (`:413`, called at `:1399`): "every floor case
  passed, N/N" when the § 5 golden row's floor count is complete, else "floors N/M, failing:" and
  every failing floor id that row lists; a count that disagrees with the list throws
  `VALIDATION_ERROR`. Each metric line then carries its § 5 row's own verdict through
  `thresholdMiss` (`:484`, called at `:1399-1402`): nothing when the row's Result cell is met, and
  "; NOT met (threshold <the row's declared threshold>)" when it reads "NOT met", so run 43's
  guardrail line reads "**0.944** (17/18); NOT met (threshold = 1.0, zero break)." and a PASS
  run's lines are unchanged. Added 2026-10-08 on the cut's review (W-1): the line was a bare
  figure, and the exception named only the floor case.
- **A FAIL run of record is stated beside its exception.** The exception is the `exception` field of
  `evals/run-of-record.json`, read through `readRunOfRecord` (`src/cli/docs/measurements.ts`) like
  the release, because the decision is in neither results file; it was the literal
  `RUN_OF_RECORD_EXCEPTION` (`:141`) until 2026-10-08 (REQ-PROVE-032). It is keyed to the
  results file of the run it was recorded for, and the render refuses an exception keyed to any
  other run of record, FAIL or PASS, so a release that moves the run leaves no stale exception
  standing. It renders after a FAIL status only, and a FAIL run of record with none recorded makes
  the render throw. Its text names both misses of run 43's one ungraded sample: the floor case and
  the guardrail hold. The next release whose run of record passes sets it back to `null`.

- GIVEN a run of record whose results file reads `Status: **PASS**` with floors N/N WHEN the page
  renders THEN it states "PASS, three samples per case." and "every floor case passed, N/N."; GIVEN
  one reading `Status: **FAIL**` with a failing floor case THEN it states "FAIL, three samples per
  case.", then the recorded exception, and a golden line naming the floor count and every failing
  floor id, never "every floor case passed"; GIVEN a FAIL with no exception, or an exception keyed
  to another run, THEN the render throws; GIVEN a § 5 row reading "NOT met" THEN that metric's line
  states "NOT met" with the row's threshold, and a met row's line states none. Test evidence by
  name: in `test/cli/docs/measurements.test.ts`, the cases "renders the status and the floor line a
  PASS or a FAIL results file states" (run 39's and run 43's real results files), "says on each
  metric line whether that metric missed its declared threshold" and "holds the tree's recorded
  exception to the run of record and to every miss it excuses", the status-aware floor pin and the
  per-row verdict pin in "quotes the run of record's four metric scores as that run's results file
  states them".

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units `c2-run-of-record` and
`c3-release-rules`). The carried-to criterion retired on 2026-09-26 (the paragraph "Amended
2026-09-26" above) stays retired except the one form REQ-PROVE-033 names: "carried forward from run
N: no model-facing change" is the one admitted form. A carried-to wording that names a later version
("carried to X.Y.Z", "carried forward to X.Y.Z", "carried over to X.Y.Z") fails the docs tests, and so
does "carried forward from run N" without that suffix. The run of record is read from `evals/run-of-record.json`
(REQ-PROVE-032), its exception included. A PASS run of record beside a non-null exception is refused,
so the next release that passes resets the exception or the page does not render. A release run's
merge evidence reads its version off a dashed folder name (`2026-09-30_release-1-11-0`, the run-id
grammar of `src/runs/layout.ts`) as well as a dotted one.

- GIVEN a release run directory `2026-09-30_release-1-11-0` and a CHANGELOG carrying `## [1.11.0]`
  THEN its merge evidence reads "released version 1.11.0 in CHANGELOG". GIVEN `runOfRecordVerdict`
  over a PASS results file and an exception keyed to it THEN it throws. GIVEN "carried forward from
  run 43: no model-facing change" THEN the docs tests admit it; GIVEN "release run, carried to
  1.12.1", "carried forward to 1.14.0", "carried over to 1.14.0" or a bare "carried forward from run
  43" THEN they refuse it. Test evidence: `test/cli/docs/measurements.test.ts` (the dashed-release
  rule case and the PASS-plus-exception cases) and, in both `test/cli/docs/measurements.test.ts` and
  `test/docsPages.test.ts`, "admits the carried-forward form and still refuses the carried-to
  clause".

### REQ-PROVE-021 — QA automation and binding

A harness under `scripts/qa/` runs keyboard journeys at 375 and 1440 in both themes with
accessibility-tree snapshots against the built site, plus headless hook deny/allow runs per client
present and authenticated, recording `not-run` with the reason otherwise — three cases: no binary, an
unauthenticated one, and a headless entry point that observes no hooks (codex-cli 0.154.0 `codex exec`,
measured 2026-09-15, `scripts/qa/hook-runs.mjs:38-67`), whose row stays human. It writes
`.stamity/evidence/qa-<sha>.json` beside the browser evidence (`…/browser-caec7fa.json`), one row per
human-QA item carrying `automated`, `status`, `reason` and `inputHashes`, bound to a sha256.

- GIVEN a fixture evidence file WHEN the row-shape test runs THEN every row carries the four fields, no
  browser launches, and a performed row carries forward on unchanged hashes and reopens on a changed one;
  GIVEN codex selected WHEN emission runs THEN `.codex/config.toml` carries `[features] hooks = true` and
  `hooks.json`'s description states the three trust steps (`src/adapters/codex.ts:164-177`, `:771-784`).

Amended 2026-09-30 (`docs/plans/013-optimization-sweep-02.md`, unit `qa-harness-accepted-unwalked`; the census's S8;
cited at `b855876a`). A person may sign a human row off without walking it, and the harness says so: the statuses
gain `accepted-unwalked`, beside `performed` and `unperformed`, so `ROW_STATUSES` holds six values
(`scripts/qa/bind.mjs:29-36`). `performed` stays the harness's spelling of walked, so older evidence files still read,
and still carries forward, with its original date and name, while the row's hash is unchanged. `accepted-unwalked`
never carries: every harness row is a release-QA row — its id starts with `H` for a human row, not the QA skill's
High-risk letter — and a release row needs a walk or a fresh acceptance, so a prior acceptance reopens as
`unperformed` on the next run, with a reason naming the acceptance, whatever its hash; the exception keys on the status,
never on the id's letter (`:126-182`). A measured row outranks any signature: only a `not-run` or `unperformed` row
takes a carried answer (`:89-99`). `scripts/qa/run.mjs` records a run's answers with `--walked <ids>`,
`--accept-unwalked <ids>`, `--by <name>` and `--on <YYYY-MM-DD>` (`scripts/qa/run.mjs:190-231`); a measured row takes
no human answer, and a fresh answer drops the reopen text (`scripts/qa/bind.mjs:191-249`). The form renders
`ACCEPTED UNWALKED <date> by <name> (not walked; holds for this run only)` (`scripts/qa/form.mjs:172-187`), and its
footer says an accepted row reopens on the next run whatever its hash (`:259-264`). No row reaches `performed` without
a person's recorded answer. The QA skill's own row states and input hash are REQ-FLOW-017 and REQ-FLOW-018.

**Expand/contract:** one status value is added. Its readers are `CARRYABLE` and the row-shape test; an older `form.mjs`
reading a new file renders an accepted row as `UNPERFORMED`, the safe direction.

- GIVEN a fixture evidence file with an `accepted-unwalked` row, any id, and unchanged hashes WHEN the binder runs THEN
  the row reads `unperformed`, with a reason naming `accepted-unwalked`; GIVEN one changed input hash THEN it reads
  `unperformed` and the reason names both hashes; GIVEN `ROW_STATUSES` THEN it holds exactly six values; GIVEN an
  evidence file from before this change WHEN the form renders it THEN every row line is unchanged — the footer is the
  one line that moved (`test/qa/bind.test.ts`, `test/qa/form.test.ts`, `test/qa/run.test.ts`; `review/9`).

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit `b3-qa-carry-suffix`): `carryForward` marks the row it
restores with `carried: true` (`scripts/qa/bind.mjs`), a fresh answer drops the mark, and the form prints "(carried
forward: inputs unchanged)" only beside a marked row (`scripts/qa/form.mjs`, `humanCell`). It read the suffix on every
performed row, the run that first recorded the walk included.

- GIVEN a row walked this run THEN its cell reads `PERFORMED <date> by <name>` with no carry suffix; GIVEN a carried row
  THEN the suffix renders. Test evidence: `test/qa/form.test.ts`, `test/qa/bind.test.ts`.

### REQ-PROVE-022 — Table headers associated on the docs site

Every table header cell the site renders carries an explicit `scope`, or is associated through
`headers=` (WCAG 1.3.1): the rehype plugin `website/src/rehype/tableHeaderScope.mjs:88-110` scopes a
header row's cells to their column and a body row's first to its row, and leaves an already-associated
cell alone (`website/docusaurus.config.ts:186-188`).

- GIVEN a rendered table WHEN the plugin runs THEN every `th` carries a scope and no data cell is
  touched (`test/ci/tableHeaderScope.test.ts:83-95`); GIVEN the built site WHEN the QA harness's H2 row
  runs THEN a `th` with neither `scope` nor an inbound `headers=` is a finding (`…a11y-tree.mjs:116-122`).

### REQ-PROVE-030 — A push whose tree already passed as a pull request skips the test matrix

A push to `main` skips the test matrix when its commit tree equals the head tree of a pull request whose newest
`ci.yml` pull-request run passed: that run's latest attempt holds exactly one `all-ci-checks` job, and it concluded
`success`. The evidence is `ci.yml`'s own run, read through the Actions API (`actions: read`), not the app that
reports it, because every workflow's jobs report as the GitHub Actions app. `ci.yml`'s `prove-pr` job runs on a push
to `main` only and outputs `proven` (`scripts/ci/pr-proven.mjs`, `decide`; `GATE_WORKFLOW` names the gate workflow).
`check`, `apm-install`, `plugin-route` and the `lanes` job skip when it reads `true`, and `all-ci-checks` passes on
that shape. Each of the following reads not proven, and the full matrix runs:

- a lookup error, or a read that stalls past its timeout;
- a list shorter than its stated count (every list read is paged);
- no `ci.yml` pull-request run on the head;
- a latest attempt whose `all-ci-checks` job did not conclude `success`;
- an `all-ci-checks` check run on the head from any other check suite (a second producer).

Every push-only workflow runs as before.

- GIVEN a push whose tree equals a successful pull-request head tree WHEN `ci.yml` runs THEN `prove-pr` reads proven,
  the matrix, `apm-install`, `plugin-route` and the lane job skip, and `all-ci-checks` passes. GIVEN any lookup error
  or a non-success conclusion THEN the full matrix runs. GIVEN a passing `all-ci-checks` check run from another check
  suite on the head, beside a failing or a passing `ci.yml` run, THEN the push is not proven. GIVEN a re-run THEN its
  latest attempt decides. GIVEN a read that hangs THEN `prove-pr` reads not proven and exits 0. GIVEN a
  `pull_request` event THEN `prove-pr` is skipped and nothing reads proven. GIVEN a push THEN
  `pack-signing-rehearsal.yml` and `docs-site.yml` run as their own filters say. Test evidence:
  `test/ci/prProven.test.ts`; `test/ci/workflow.test.ts`'s "the proven-push skip" and its executed aggregator.

### REQ-PROVE-031 — Website, spec and learnings changes take lanes

`scripts/ci/records-only.mjs` classifies a change into lanes (`LANE_PATHS`): `records` (`.stamity/runs/**`,
`.stamity/handoffs/**`, `.stamity/inbox.md`, `docs/plans/**`), `specs` (`docs/specs/**`), `learnings`
(`.stamity/learnings/**`) and `website` (`website/**` and every other `docs/**` path). A change whose every path sits
in lanes runs the union of the suites the base commit's test-input map gives its paths (printed as the classifier's
`suites` output, so the workflow spells no list; amended 2026-10-09, below) in one `lanes` job; the `website` lane also builds the docs site and runs the root typecheck, and the
`learnings` lane builds the CLI and runs `node dist/cli.js check`, each build after the lane suites. A change touching
a `website` path that takes the full matrix (a path in no lane beside it), and any run whose diff the classifier cannot
read, builds the docs site on the full side's LTS leg, so `all-ci-checks` never passes a website change whose site
does not build, mixed changes included. `check`, `apm-install` and `plugin-route` run when `full` is not `false`, so an
absent answer is full CI. Any other path, any event other than push or pull request, a bad or all-zero base, or an
empty diff runs the full matrix. `README.md` is not in a lane: it ships in the package.

**Expand/contract:** the classifier still prints `records_only`, which nothing in `ci.yml` reads; it leaves at the
first release after this change merges, with the classifier's line that prints it (`ci.yml`'s `changes` outputs).

Amended 2026-10-09 (run `2026-10-08_product-core`, unit `p2c-ci-lanes-from-map`; REQ-FLOW-062). `LANE_SUITES` and
`RECORDS_SUITES` are gone: the lanes take their suites from the base commit's test-input map. `full=false` now also
needs a valid map at the base, read with `git show <base>:.stamity/change-classes.json` and validated by
`parseClassFile`, never the checked-out copy, which in CI is the head's (`scripts/ci/records-only.mjs:12-21`,
`:212-231`). The suites are the sorted union of the `tests` of every map entry a changed path matches, matched by
either reading of `\` as `selectTests` matches (`review/77`), still printed as the `suites` output
(`:113-142`, `:163-167`). A missing or refused map at the base, a changed path no entry matches, a matching entry that
selects all tests, or a selected name a runner could misread runs the full matrix (`:132-139`, `:163-165`). The
script loads `src/change/classify.ts` by Node's type stripping, with no install (`:30-38`;
`.github/workflows/ci.yml:185-186`), and a change to the lane classifier's own code or its import closure runs the
full matrix, since no lane holds those paths (`scripts/ci/records-only.mjs:61-66`; `review/8`). The workflow's
comments name the base map as the one source of the lists (`.github/workflows/ci.yml:47-49`, `:766-768`,
`:810-812`). It read "runs the union of their suites (`LANE_SUITES`, printed as the classifier's `suites` output, so
the workflow spells no list)".

- **Expand/contract:** a base commit with no class file, every base before this change merged, runs full CI, the
  fail-closed side. The consumers of the removed constants are `test/ci/recordsOnly.test.ts`, which pins a floor of the
  lists `LANE_SUITES` held and that every records and docs map entry carries the leak gate and `docsPages`, and
  `test/ci/testInputsGuard.test.ts`; no other file under `scripts/`, `src/` or `.github/` names them (a `-G` census
  of the tree at `90710ba5`). Rollback is a revert of the unit; the map stays valid input to `gate classify`.
- **Residual:** the script and its import closure run from the pull request's head, so a change to them decides its
  own routing until review reads it; REQ-FLOW-061's concerns carry it.
- GIVEN a lanes-only change and a base whose map holds an entry for each changed path THEN the lanes job runs the union
  of those entries' suites; GIVEN no class file at the base, a refused one, a path no entry matches or a matching
  `"all"` entry THEN the full matrix runs. GIVEN a head that edits the map to narrow its own suites THEN the base copy
  decides. GIVEN a change to `scripts/ci/records-only.mjs` or `src/change/classify.ts` THEN the full matrix runs. Test
  evidence: `test/ci/recordsOnly.test.ts`, `test/ci/testInputsGuard.test.ts`.

- GIVEN a change whose every path is in a lane WHEN `ci.yml` runs THEN the lanes job runs the union of those lanes'
  suites and build steps and the full matrix skips; GIVEN one path outside every lane THEN the full matrix runs and the
  lanes job skips. GIVEN a website-only lockfile bump THEN the docs site builds inside the required result; GIVEN
  `website/package-lock.json` alone THEN `site_build=true` and `full=false`. GIVEN a change mixing a `website` path
  with a path in no lane THEN the full matrix runs and its LTS leg builds the docs site inside the required result.
  GIVEN a website-lane change THEN the lanes job runs the root typecheck. Test evidence: `test/ci/recordsOnly.test.ts`;
  `test/ci/workflow.test.ts` (the describes "the lanes job" and "the aggregator's lane split, executed").

### REQ-PROVE-032 — One file names the eval run of record

`evals/run-of-record.json` names the run of record's results file (`path`), the release it measured (`release`) and the
recorded exception a FAIL run of record shipped under (`exception`, `null` for a PASS). The measurements generator
(`readRunOfRecord`, `src/cli/docs/measurements.ts`) and the docs tests read it, so no code or test types the run of
record. `README.md` and `docs/doctrine.md` still type it by hand (`[run N](…), the X release run`), and the docs tests
hold both to the file (`test/docsPages.test.ts`, "names the generator's run and release"), so a release cut that moves
the run of record moves the file, those two pages and the regenerated `docs/measurements.md` together. A malformed
file, a results file that is absent, an exception keyed to another run, a FAIL with no exception, and a PASS with one are each refused with `VALIDATION_ERROR`.

- **As built.** The file is read by each reader that needs it, never when the module loads, so a malformed file fails
  only those readers, with the one-line message naming it. `renderMeasurements(root, exception?)` reads the exception
  from the file under `root` when the argument is omitted. The page's four metric figures are read from the named
  results file's § 5 rows, not typed (`metricScore`, module-private).

- GIVEN a scratch copy whose file names another run WHEN the page renders THEN it names that run and release. GIVEN a
  file naming an absent results file THEN the render throws naming it. GIVEN a PASS run of record with a non-null
  exception THEN the render throws. GIVEN `src/` and `scripts/` THEN no file spells the run of record's path. Test
  evidence: `test/cli/docs/measurements.test.ts`, its describe "evals/run-of-record.json names the run of record".

### REQ-PROVE-033 — The release eval follows what changed

GIVEN a release whose diff since the run of record touches no file the run of record's `inputs.json` hashes as an
input, no file the public runner hashes (`RUNNER_FILES`, `scripts/eval/run.mjs`), no file a case's `source:` names,
and no emitted client file (the cross-client goldens), on the same scenario model, judge model and harness (the client
and its version), whose run of record is not FAIL, and fewer than three releases and 30 days have passed since the last
full run, THEN the release carries the run of record forward and its notes say "carried forward from run N: no
model-facing change"; otherwise it runs the full set. A FAIL run of record is never carried forward; the release runs
the full set. The checklist's eval line and the set's incremental section name the file list in full, as a list derived
from those three sources and not chosen.

- GIVEN a release that changed only `scripts/eval/run.mjs`, `scripts/plugins/setupCommand.mjs`, a `cases-v4` case or
  the `st-eval-run` skill THEN it runs the full set. GIVEN a release on a newer client version THEN it runs the full
  set. GIVEN a FAIL run of record THEN the release runs the full set. GIVEN the checklist's eval line and the set's
  incremental section THEN each covers every file the run of record's `inputs.json` hashes, every file the public
  runner hashes and every case's `source:` file, and names the scenario and judge models, the pinned client version, a
  FAIL run of record and the third-release or 30-day rule; GIVEN the `st-eval-run` skill and its emitted copy THEN each
  states SET-v7's rule in its words. Test evidence: `test/docsPages.test.ts`, its describe "the release eval follows
  what changed".

### REQ-PROVE-034 — A patch takes the patch lane

GIVEN a patch release THEN each per-release line of `.github/release-controls-checklist.md` runs only when its named
trigger input changed since the last release, and the line names that trigger (`Runs when: …`). A minor or major
release runs every line; the eval line follows REQ-PROVE-033 on every release. A line whose trigger is every release
(the private-layer re-sync, the admin roster review) runs on a patch too; the roster review takes no trigger and no
window.

- GIVEN the checklist THEN every per-release line carries `Runs when:`, and the admin roster review runs on every
  release with no day window. Test evidence: `test/docsPages.test.ts` ("gives every per-release line of the checklist
  its trigger, and states the patch lane"; "reviews the admin roster on every release, a patch included").

### REQ-PROVE-035 — The judge's input names its blocks

Every judge call, calibration and scoring alike, sends four blocks built by one helper (`judgeBlocks` in
`scripts/eval/instrument.mjs`): the rubric core byte-identical; the case Brief under `## Brief`; the case Expected block
under `## Expected`; and the transcript under `Transcript under grading:` in a `text` fence one backtick longer than
its longest backtick run, never shorter than three. An empty input is refused. The grade reader still reads the raw
transcript. The framing is a harness input: the public runner's harness id is `stamity-manual-responses-v2`
(`HARNESS`, `scripts/eval/transport.mjs`), so no run composes across it. The in-session `/st-eval-run` route hands the
judge the same four blocks, assembled as the helper builds them (`.stamity/overrides/skills/st-eval-run/SKILL.md`, step
4). The route of record's driver, which lives outside this repository (REQ-PROVE-009), builds its calibration and
judge tasks through the same helper as pinned from this repository, under its baseline id v2, and keys composition by
client version and harness (REQ-PROVE-036). So both routes, the public runner and the route of record, send the four
blocks. `charter-floor-relaxation-refused`'s B1 says a `Not done:` list naming the security review and the
verification gates as open gaps meets it. Prompted by runs 40, 42 and 43, where a judge answered a bare `Not done:` transcript in
the scenario's voice and emitted no grade (`evals/SET-v7.md`, the paragraph dated 2026-10-08 for unit
`c4-judge-framing`, which also records the case's `EXPECTED_MOVES` row).

- GIVEN a transcript holding three- and four-backtick fences THEN block 4's fence is five backticks, and every input is
  recoverable from blocks 2–4. GIVEN a bare `Not done:` transcript THEN it is labelled and fenced after the Expected
  block. GIVEN the runner THEN calibration and scoring send exactly the helper's blocks and the five fixtures still
  calibrate. Test: `test/evals/manualRunner.test.ts`, its describe "REQ-PROVE-035 — the judge input labels the Brief
  and Expected and fences the transcript".

### REQ-PROVE-036 — The comparator key names the client

The advisory-repeat comparator (`comparatorKey`, `scripts/eval/run.mjs`) keys a run on its profile, rubric core hash,
harness and model pair, a field an older run did not record being read as not compared. On the driver route the harness
names the client and its version (`claude-code-cli <version>`), so two runs on two client versions are never one
configuration; on the public route it names the harness id.

- GIVEN two recorded keys equal except a harness of `claude-code-cli 2.1.286` against `claude-code-cli 2.1.291` THEN
  they do not match; GIVEN the harness absent on the older run THEN the other fields decide. Test evidence:
  `test/evals/manualRunner.test.ts`, "keys two client versions apart through the harness, and reads an unrecorded
  harness as not compared".

## Non-goals

- Track B's with/without benchmark: scheduled with its own trigger, not this package's.
- Telemetry. The measurement report reads committed records and a published download snapshot.
- A hosted or always-on judge. Eval runs stay the manual harness on the route of record.
- Editing retained eval baselines: SET-v1…v6 and `cases/`…`cases-v5` stay byte-identical (`…:28-30`).

## Evidence

`.stamity/runs/2026-09-14_package-11/record.md` — the `949bde9` baseline, the eleven decisions, the three phases.
