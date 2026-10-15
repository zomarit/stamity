---
id: model-ladder
# A design document, authored from docs/plans/008-plugin-lifecycle-02.md on 2026-09-17, extended from docs/plans/009-orchestrator-context-economy-01.md on 2026-09-23, amended in run 2026-10-08_product-core on 2026-10-09, amended in run 2026-10-10_next-tier on 2026-10-10, amended in run 2026-10-14_cli-native on 2026-10-14 and 2026-10-15, and excluded from the site build.
# The records moved to the `records` branch on 2026-10-14; every path below that names this repository's own records — under `.stamity/runs/`, `.stamity/evidence/`, `.stamity/handoffs/`, `.stamity/inbox.md`, `docs/plans/`, `evals/runs/`, `evals/measurements/` or `evals/reach/` — reads on that branch (REQ-PROVE-023 in docs/specs/prove-behavior-and-value.md). A path of the run layout a consuming repository writes, such as `.stamity/runs/<run-id>/`, is the product's and is not one of them.
status: shipped-with-1.15.0
obsolete_when: every supported client publishes one effort scale the ladder can name without a per-client table and resumes, waits out and reports a sub-agent's capacity stop on its own, or a decision row cuts the surface
---
# Model ladder

Two axes of the model ladder. The first is effort (`src/roster/modelLadder.ts`). The three-level band
(`low, medium, high`) was chosen in 1.7.0 as the scale every supported client shared; by
2026-09-17 Claude Code documents `xhigh` and `max`, Codex documents `minimal` and `xhigh`, and
Cursor passes the value through to the model, so the band capped the deep-review class below what
three of four clients accept. `/st-work` moved `status` to `shipped-with-1.9.0` at that close.

The second axis is capacity, added on 2026-09-23 from `docs/plans/009-orchestrator-context-economy-01.md`
(REQ-LADDER-002, REQ-LADDER-003). It covers what the flow does when a sub-agent stops
because a model is out of capacity, not because its work failed. The failure ladder
(`content/commands/st-work.md:98-102`) reads any stop as a failed sub-agent: its first rung
re-briefs the agent, and its second reassigns the work to a stronger class. Under a limit on
one model, that stronger class is the one already out of capacity. REQ-LADDER-001 shipped with
1.9.0. REQ-LADDER-002 and REQ-LADDER-003 shipped with 1.10.0. `status` stayed
`shipped-with-1.9.0`, the release that first shipped this spec, and the 1.10.0 release did not
move it (the `spec-citations` unit of `docs/plans/010-enterprise-release-02.md`, 2026-09-27).

REQ-LADDER-004 and the paragraphs dated 2026-10-10 come from the spec delta of run
`2026-10-10_next-tier` (plan 019 file 3, re-planned in that run), merged by its unit
`s1-spec-merge` against the integration head `a60cb496`. They shipped with 1.14.0, which set
`status` to `shipped-with-1.14.0`. A ledger id in that text (`review/5`, `build/21`) is that run's own
unless a run is named beside it. `## References` says which citations the merge re-pointed.

REQ-LADDER-005 to REQ-LADDER-008, and the paragraphs dated 2026-10-15 under REQ-LADDER-004, REQ-LADDER-006 and
REQ-LADDER-007, come from the spec deltas of `docs/plans/020-cli-native-02.md`, `-03.md` and `-04.md` (plan 020 files 2
to 4, run `2026-10-14_cli-native`), merged in file order at that run's Prove phase, each entry in its amended form, and
from the deltas its units' reports declared. Every `path:line` in that text reads at the integration head `bd89c476`.
Where a delta and the landed code differed, the text states what the code does, and a line headed "As built" says what
moved. A ledger id in that text (`build/66`, `review/86`) is that run's own. They shipped with 1.15.0, which set
`status` to `shipped-with-1.15.0`. File 2's delta also removed the "never invent a value" rule from
this spec's Invariants; no bullet here states it (the rule stood in the code comment of `src/roster/modelLadder.ts`
and in `docs/configuration.md`, both superseded by the pick of REQ-LADDER-006), so the Invariants are unchanged.

## Intent

Let an operator ask for any effort level a selected client documents, refuse at configuration
time what a selected client cannot express, and never downgrade silently — neither an effort
level nor, when a model runs out of capacity, a verdict role's class.

## Invariants

- Class defaults do not move with this spec (`frontier` stays `high`); a default change is a
  separate, measured decision.
- A level a selected client cannot express is refused when set, naming the client and its top or
  bottom level; a level a later-selected client cannot express is emitted as that client's nearest
  expressible level with a disclosure line, never dropped. Amended 2026-10-10 (`review/84`; read
  at `9a0ba4cf`): one exception, a legacy level. A client whose row lists a level in
  `effortLegacy`, today `minimal` on Codex and Copilot, raises no refusal for it: `config set`
  accepts it, and that client's emission writes its nearest documented level, `low`, with a
  disclosure line (`src/cli/commands/config.ts:459-463`, `:472`; the effort hint, `:298-302`;
  `src/roster/modelLadder.ts:305-318`, `:429`, `:460`; REQ-LADDER-004). A selected client that
  does not list the level still refuses it, as Claude refuses `minimal`.
- Every per-client scale carries a vendor citation with an access date.

## Requirements

### REQ-LADDER-001 Effort levels widen to the clients' documented scales

Given `EFFORT_LEVELS` of `minimal, low, medium, high, xhigh, max` in that order and a per-client
scale on every projection row (Claude `low … max`, Codex `minimal … xhigh`, Cursor the whole list
as a pass-through, Copilot none), When `stamity config set effort.frontier xhigh` runs on a
manifest selecting `claude` and `codex`, Then the key is written and the emitted Claude agents of
that class carry `effort: xhigh` and `.codex/config.toml` carries `model_reasoning_effort = "xhigh"`;
When `stamity config set effort.frontier max` runs on a manifest selecting `codex`, Then it exits
1 with `VALIDATION_ERROR` naming `codex`, its top level `xhigh` and the two remedies (pick `xhigh`
or lower, or deselect the client) and writes nothing; When a manifest already carrying `effort.frontier: max` gains
`codex` through `config set tools`, Then the next `sync` emits `xhigh` for that class on Codex and
prints one disclosure line naming the class, the requested level and the emitted level; and When
no `effort.*` key is set, Then every emitted file is byte-identical to the 1.8.0 emission
(the cross-client golden snapshot is unchanged without `-u`).

As built (2026-09-20): `EFFORT_LEVELS` is six wide with `effortRank`;
`nearestExpressibleEffort` clamps down to a client's ceiling and up to its floor, and the
disclosure line names the class, the requested level and the emitted one, reading `ends at` for the
downward clamp and `starts at` for the upward one, spliced beside the hooks warnings; `config list`
appends `(clamped from <requested>)`. Two of the paragraph's literals moved. The refusal exits 1
with `VALIDATION_ERROR`, not 64 — the CLI retired the sysexits translation and every failure exits
1 with the kind in `error.code` (ledger row build/34) — and the sentence above is amended to say
so; it names the client and its bound in both directions and the manifest is unchanged. And the
scale carries a citation FIELD OF ITS OWN, `effortScaleCitation` beside `effortScale` on each
projection row, rather than re-dating the row's existing citation: the scale pages are not the
pages the row's model keys were read from, and the claude suite pins every row citation to
2026-09-10, so moving that date would have claimed a re-reading nobody performed. Copilot declares
an empty scale and a `null` citation, having no documented effort axis to cite. The three carrier
adapters publish an `effort-scale` capability row, and the configuration page and the capability
matrix are regenerated from them.

Amended 2026-10-10 (run `2026-10-10_next-tier`, units `q4a-effort-union`, `q4b-codex-scale` and
`q6c-copilot-effort-key`, with lane D's fix rounds; every `path:line` in this paragraph reads at
`a60cb496`, but for its two `src/cli/commands/config.ts` ranges, re-pointed to `9a0ba4cf` the same
day). `EFFORT_LEVELS` is seven wide: `ultra` joins at the top, the level one client
documents (`src/types/core.ts:116-123`). The per-client scales now read: Claude `low … max`,
unchanged; Codex `low … ultra`, re-read on 2026-10-10, with `minimal` a legacy level; Cursor the
whole list as a pass-through; Copilot `low … max` on a key of its own, with `minimal` legacy
(`src/roster/modelLadder.ts:371`, `:398`, `:428-429`, `:459-460`; REQ-LADDER-004). A projection
row gains `effortLegacy`, the levels a client's documented scale dropped that its own parser
still accepts: `stamity config set` accepts such a level on a selection whose client lists it,
and the emission writes the nearest documented level with a disclosure line (`:305-318`;
`src/cli/commands/config.ts:465-482`). So the examples of the Given paragraph above move with
the scales. `stamity config set effort.frontier max` on a manifest selecting `codex` is now
written, and Codex emits `max` as `max`. The refusal it describes is now `ultra` on a manifest
selecting `claude` or `copilot`: exit 1 with `VALIDATION_ERROR`, naming the client and "its scale
ends at max", with the remedies "set max or lower, or deselect the client"
(`src/cli/commands/config.ts:494-505`). The disclosure it describes is now a manifest carrying
`effort.frontier: ultra` that selects `claude` and `codex`: the next `sync` emits `max` on Claude
with the line `effort [claude]: frontier asks for ultra; this client's scale ends at max, emitted
max`, and `ultra` on Codex (`src/roster/modelLadder.ts:558-571`, `:693-711`). Copilot no longer
declares an empty scale and a `null` citation: its scale is cited to the CLI command reference,
read 2026-10-10, and its `effort-axis` capability row reads emitted (`:428-434`;
`src/adapters/copilot.ts:196-204`). The byte-identity clause holds where it can still be read:
with no `effort.*` key set, no class default moved (`src/roster/modelLadder.ts:185`, `:192`,
`:199`, `:206`), so Claude and Codex emit the levels they emitted before this run, and each
Copilot agent file gains one `reasoning-effort` line at its class's level (REQ-LADDER-004).

### REQ-LADDER-002 — A capacity stop resumes or waits; it is not a failed sub-agent

Given the `/st-work` Dispatch contract carrying, directly after its "Findings ledger" bullet
(cited by name in `content/commands/st-work.md`), a capacity bullet that sorts a stopped sub-agent by its
stop notice into `stall` (a watchdog, no progress), `connection` (a dropped transport),
`limit-reset` (a limit naming its reset time) and `limit-no-reset` (credits, or a model limit
naming no reset), When a sub-agent stops as `stall` or `connection`, Then the orchestrator
resumes that same agent, a second such stop waits five minutes before resuming it (amendment
A9), and a third returns `BLOCKED_DEPENDENCY` naming the smallest unblocking input; When it
stops as `limit-reset` with the stated reset within 12 hours, Then the orchestrator waits until
that reset and resumes one agent as a probe before resuming the rest, and When the stated reset
is more than 12 hours away, Then it returns `BLOCKED_DEPENDENCY` naming the reset time
(amendment A9); When it stops as `limit-no-reset`, Then the orchestrator returns
`BLOCKED_DEPENDENCY` at once, save the one-class drop REQ-LADDER-003 allows a build role; and
When any of these events occurs, Then the run record gains exactly one line
`- <UTC> capacity: <role> <stop class> → <resumed | waited until <UTC> | BLOCKED_DEPENDENCY>`, the
event counts as neither a failure-ladder rung nor a review round, and the failure-ladder bullet
(`content/commands/st-work.md:98-102`) and its pinned phrases
(`test/corpus/commands/work.test.ts:1000-1003`) are unchanged.

The capacity rule is carried in the bullet's prose, with no table. A second pipe table under
`### Model ladder` would be read as ladder rows, because `shippedLadderRows` takes every pipe
row up to the next heading (`test/roster/modelLadder.test.ts:130-142`). A
`test/corpus/commands/work.test.ts` case under "dispatch contract" pins the bullet's text and
its position. The orchestrator's conduct during a live stop is `judgment: reviewer`, read from
the run record's capacity lines. No engine surface changes. Codex carries the bullet too: the
`/st-work` body ships to it as the shared skill `.agents/skills/st-work/SKILL.md`, started as `$st-work`
(`docs/capability-matrix.md:232`, read at `c7158dbf`; REQ-FLOW-026 in `docs/specs/everyday-flows.md`). (Amended
2026-10-15, ledger row `review/142` of run `2026-10-14_cli-native`; it read "Codex receives no touchpoint bodies
(`docs/capability-matrix.md:240`), so the bullet has no carrier there", untrue since the touchpoints shipped as shared
skills in 1.11.0.)

### REQ-LADDER-003 — Verdict roles never fall back; a build role drops one class only under `limit-no-reset`

Given the capacity bullet of REQ-LADDER-002, When a verdict role stops for capacity — the
reviewer on any round or on the whole-branch pass, the `security`, `design-quality` or
`performance` lens, or the fresh fixer spawned on a stronger class — or the
spec-author does, Then it is resumed, waited
for, or returned as `BLOCKED_DEPENDENCY` at the class the ladder assigns it, and it is never
re-dispatched on a weaker class: the spec-author holds its class like the verdict roles, because
later units are planned against its text (amendment A9); When a build role — the implementer,
the fixer on rounds 1–3, the researcher, the creator or the test-runner (amendment A9) — stops
as `limit-no-reset`, Then it may be re-dispatched one class below its assigned class and no
further, and the proof block's per-action attribution (`content/commands/st-work.md:323`) names
that role, the class it was assigned and the class it ran at; When a build role stops as
`stall`, `connection` or `limit-reset`, Then it keeps its assigned class; and When
`test/roster/modelLadder.test.ts` runs after the change, Then it passes with no change to the
four class rows of the `### Model ladder` table, and with no change to
`src/roster/modelLadder.ts` beyond its header comment, which names the capacity rung's
one-class drop as a second flow placement no row records (`src/roster/modelLadder.ts:36`,
`:48-56`).

Work run at a lower class is still reviewed at the verdict roles' declared classes, and the
effective-identity check (`content/commands/st-work.md:458-460`) still applies. The same
`work.test.ts` case pins the no-fallback sentence. The class a build role actually ran at is
checked against the proof block: `judgment: reviewer`.

Amended 2026-10-09 (run `2026-10-08_product-core`, units `p4a-review-cap` and
`p4b-fixer-escalation`, and the p4 fix round; every `path:line` in this paragraph was read at
`90710ba5`, and its `content/commands/st-work.md` and `src/roster/modelLadder.ts` lines were
re-pointed to `a60cb496` on 2026-10-10). The review loop no longer escalates to a fresh fixer on
a stronger class at round 4.
Its escalation is a fresh fixer spawn on the same model at one effort level above the fixer's
declared one, where the client's dispatch takes an effort setting; where it takes none, the fresh
spawn is the escalation and the proof block records `effort: not settable`
(`content/commands/st-work.md:218-227`; `content/agents/stamity-fixer.md:74-85`). So, in the
paragraph above, "the fresh fixer spawned on a stronger class" now reads "the escalation fixer",
which still never falls back to a weaker class, and the build role "the fixer on rounds 1–3"
now reads "the fixer before an escalation" (`content/commands/st-work.md:117-123`). The
per-action attribution sits at `:323`, and the effective-identity check at `:458-460`. The header
of `src/roster/modelLadder.ts` still counts two flow placements no row records: the first is now
the escalation's effort step (`:37-49`), the second the capacity rung's one-class drop
(`:51-58`); the class rows and the `TWO FLOW PLACEMENTS` pin are unchanged
(`test/roster/modelLadder.test.ts`).

Amended 2026-10-10 (run `2026-10-10_next-tier`, units `q4b-codex-scale` and
`q4t-ladder-placement-text`; every `path:line` in this paragraph reads at `a60cb496`). The ladder
now records three placements no agent file can declare: the reviewer's escalation to the top
class for the whole-branch pass, the one closure re-review after a fixer escalation, which the
review loop runs a class above the reviewer's own, and the fixer's drop to the cheapest class
once a round is mechanical. The module header names the three
(`src/roster/modelLadder.ts:31-35`), the frontier row's `rationale` carries the re-review
(`:183-188`), and `/st-work`'s frontier cell names it beside the whole-branch review
(`content/commands/st-work.md:471`). The header still counts two flow placements no row records,
the escalation's effort step and the capacity rung's one-class drop
(`src/roster/modelLadder.ts:37-59`), and `/st-work`'s Model ladder paragraph now names both: "the
capacity rung's one-class drop for a build role (Dispatch contract) and the escalation fixer's
effort step (Review loop) are two more, which no row records"
(`content/commands/st-work.md:464-467`). No row's role list moves: the frontier row's roles are
still `reviewer` alone (`src/roster/modelLadder.ts:184`). The Then-clause above that reads "with
no change to `src/roster/modelLadder.ts` beyond its header comment" describes the capacity
change of 1.10.0; this change moved the header and the frontier row's `rationale`.

### REQ-LADDER-004 — Each client gets the effort levels it accepts

Added 2026-10-10 (run `2026-10-10_next-tier`, units `q4a-effort-union`, `q4b-codex-scale` and
`q6c-copilot-effort-key`, with lane D's fix rounds; every `path:line` below reads at `a60cb496`,
but for the one `src/cli/commands/config.ts` range under "As built", re-pointed to `9a0ba4cf` the
same day).

Given the per-client scales of REQ-LADDER-001 as amended 2026-10-10, When Codex is emitted, Then
each agent's `model_reasoning_effort` is a level of Codex's documented scale, `low` to `ultra`:
an operator `max` is written as `max`, an operator `ultra` as `ultra`, and a stored `minimal` as
`low` with one disclosure line; When Claude is emitted, Then the economy class keeps
`effort: low`, and an operator `ultra` is written as `max` with one disclosure line; When Copilot
is emitted, Then each custom agent's frontmatter closes on `reasoning-effort: <level>` at its
declared class's level (`high` for the advanced class, `medium` for standard, `low` for
economy), on the scale `low` to `max`, an operator `ultra` written as `max` and a stored
`minimal` as `low`, each with one disclosure line, and a prompt file carries no effort line; When
`stamity config set effort.<class> minimal` runs on a manifest selecting `codex` or `copilot` and
no `claude`, Then the level is written, and When the manifest selects `claude`, Then it is
refused naming `claude` and "starts at low", as before; When `stamity config set effort.<class>
ultra` runs on a manifest selecting `claude` or `copilot`, Then it exits 1 with
`VALIDATION_ERROR` naming the client and "ends at max", and writes nothing; and When any of this
is emitted, Then no class default has moved (the Invariants' first bullet stands).

As built. The union and the clamp: `EFFORT_LEVELS` holds `ultra` at its top
(`src/types/core.ts:123`), and `nearestExpressibleEffort` is unchanged, the highest level below
the request, else the lowest above it (`src/roster/modelLadder.ts:558-571`). Codex: the scale is
cited to its config reference, read 2026-10-10 (`:453-465`), and its capability row says only
that the available levels depend on the model and client, with no promise of a fallback
(`src/adapters/codex.ts:337-343`; `review/5`). Copilot: the key is `reasoning-effort`, the
spelling its CLI's custom-agent loader (1.0.89) and changelog (1.0.66, 1.0.88) carry; a level the
agent's model does not offer is reported by the CLI and falls back to the session's, never
stopping the agent (`src/roster/modelLadder.ts:410-418`). The emitted line comes from
`effortLine`, after the model line (`src/adapters/copilot.ts:507-515`, `:572-588`), and the
`effort-axis` capability row says emitted, on the scale's two ends, with the cloud agent's
handling of the key undocumented (`:196-204`). The legacy level: `minimal` sits in `effortLegacy`
on the Codex and Copilot rows, which `config set` reads before its clamp test
(`src/roster/modelLadder.ts:305-318`, `:429`, `:460`; `src/cli/commands/config.ts:470-472`).

Where the delta differed, and what is not verified. The delta named no legacy field; it said a
stored `minimal` is "still accepted by `config set`", which the field carries. Whether Copilot's
loader also takes the `reasoningEffort` spelling of the online reference's table is unverified. A
live run has since loaded an agent carrying the `reasoning-effort` key: QA row 2 of the same run, at
its close, ran the emitted `stamity-implementer` on Copilot CLI 1.0.89 with `reasoning-effort: high`
in its frontmatter, and `build/21` closed fixed by that live check
(`.stamity/runs/2026-10-10_next-tier/record.md:462`, `:488`). (Amended 2026-10-14, folding the inbox
row `2026-10-11_release-1-14-0/review/5`; it read "and no live run has loaded an agent carrying the
key, so a wrong spelling would leave agents at the session's effort while the capability row reads
emitted (`src/roster/modelLadder.ts:410-416`; `build/21`)".) The cloud agent's handling of the key
is the accepted risk `docs/specs/everyday-flows.md` records in its `## Risks`. (Route clause dropped
1.15.0: "The APM package's Copilot agents carry no effort line", `build/22`, citing the APM generator
deleted with that route.)

Expand/contract: the union widens by one level, Codex's row gains two levels and drops one to
legacy, and Copilot's row gains a key and a scale. A manifest that stores `ultra` is refused, by
name, by an engine that does not know the level, so a downgrade after setting it needs the key
removed first (`src/roster/modelLadder.ts:529-535`). A copilot-only repository's `config set`
now refuses `ultra`, which it accepted, with no effect, while the row carried no scale; a value
stored before still loads and is emitted as `max` with a disclosure line. Rollback is a re-sync
at the prior version.

Proof: `test/types/domain.test.ts`, `test/roster/modelLadder.test.ts`,
`test/adapters/codex.test.ts`, `test/adapters/copilot.test.ts`,
`test/cli/commands/config.test.ts`, `test/emit/capabilityMatrix.test.ts`; `docs/configuration.md`
and `docs/capability-matrix.md`, regenerated.

Amended 2026-10-15 (plan 020 file 2, units `e2-model-defaults-lister` and `e7-cursor-pins`, with `e2`'s fix round on
`review/80`). Cursor's `[effort=…]` suffix is not appended to a model the account's saved list holds, nor to one ending
on an effort word, that word optionally followed by Cursor's `-fast` modifier (`grok-4.7-low-fast`); `model-fast` still
takes the suffix, since `fast` is no effort word (`EFFORT_VARIANT` and `EFFORT_SUFFIX`, `src/roster/modelLadder.ts:507-510`).
Cursor reaches the rule through its adapter, which passes the saved list to the resolver (REQ-LADDER-007).

- GIVEN a Cursor pin `claude-opus-5-5-high` that the saved list holds, and the class `advanced` at effort `high`, THEN
  the agent file names `claude-opus-5-5-high` with no `[effort=…]`; GIVEN a pin `grok-4.7-low-fast` and no list THEN no
  bracket follows it, and GIVEN `model-fast` THEN `[effort=<level>]` does (`test/roster/modelLadder.test.ts`, the
  effort-suffix case; `test/adapters/cursor.test.ts`; added 2026-10-15). (Amended 2026-10-15, ledger row `qa/1` of run
  `2026-10-14_cli-native` and its fix `f575afb1`: Cursor writes no model but a pin (REQ-LADDER-006), so the listed
  variant reaches an agent file only as a pin; it read "GIVEN Cursor's saved list holding `claude-opus-5-5-high` and the
  class `advanced` at effort `high`".)

### REQ-LADDER-005 — Pins per client

Added 2026-10-15 (plan 020 file 2, units `e1-pins-contract` and `e3-config-wiring` with their fix rounds).

A class pin is per client: `models.pins.<class>` is a map, `{ all?, claude?, cursor?, copilot?, codex? }`, and a client
reads its own key, else `all` (`ClassPins`, `src/types/manifest.ts`; `pinsFor`, `src/roster/modelLadder.ts`). The
manifest's generation moves `1.0.0` → `2.0.0` in one migration step, `PER_CLIENT_PINS_STEP`
(`src/manifest/manifest.ts`): each string pin becomes `{ all: "<id>" }`, the held `plugin` block and every other field
keep their value and key order, the step is idempotent, and a 1.0.0 pin that is not a string is carried through for
validation to name. An engine that reads only 1.x refuses a 2.x manifest with its upgrade message, as one that reads
2.x refuses 3.x. Validation refuses a class pin that is not a map, a key other than `all` or a client, by name, a
class key spelled `__proto__`, and a value `modelPinDefect` refuses (a line break), and an adapter quotes every value it
writes. `stamity config` addresses sixteen keys `model.<class>.<client>`, each writing `pins.<class>.<client>`, beside
the four `model.<class>` keys, which write `pins.<class>.all` and keep the per-client keys beside it; `none` on either
key deletes it and drops each map it empties, so no key stores the word `none` as a model; a pin for a client the setup
does not select is kept, and `config set` says so once while a pin is left (`modelClientSpec` and `applyClassPin`,
`src/cli/commands/config.ts`).

- GIVEN `model.standard.cursor = X` and `model.standard = Y` WHEN Cursor is emitted THEN its standard agents carry `X`
  and every other client's carry `Y`.
- GIVEN a 1.0.0 manifest with `pins.standard = "Y"` and a `plugin` block WHEN it is read THEN `pins.standard` is
  `{ all: "Y" }`, the block is value-identical, the version is 2.0.0, `sync` persists 2.0.0, and migrating twice
  equals migrating once; GIVEN a 3.0.0 manifest THEN the clean upgrade refusal.
- GIVEN `pins.standard = { vim: "Z" }`, or a `__proto__` class key in a 1.0.0 file, THEN the manifest is refused naming
  the key.
- GIVEN `config set model.standard.cursor claude-sonnet-5-5-high` THEN the manifest holds `pins.standard.cursor` and
  `config get` prints it; GIVEN `none` THEN the key is gone; GIVEN `config set model.advanced none` on a manifest that
  pinned nothing THEN no key holds `none`; GIVEN a client key seeded before `config set model.standard Z` THEN it stays
  beside `all: Z`.

As built, beyond the delta: the per-client keys, the `none` rule on the class key (ledger `build/49`, a defect the class
key carried before) and the not-selected notice are `e3`'s; the `__proto__` refusal is `review/70`.

Proof: `test/manifest/manifest.test.ts`, `test/roster/modelLadder.test.ts`, `test/adapters/claude.test.ts`,
`test/adapters/cursor.test.ts`, `test/adapters/copilot.test.ts`, `test/adapters/codex.test.ts`,
`test/cli/commands/config.test.ts`, `test/types/domain.test.ts`.

Expand/contract: one manifest generation bump with its migration. An older engine refuses the 2.0.0 file cleanly, so a
downgrade to 1.14 needs the per-client keys removed and the version written back by hand; rollback is otherwise a
re-sync at the prior version on a manifest restored from history. The consumers are the four adapters, `config`, the
`model-pins` row (REQ-LADDER-008) and `src/index.ts`'s exported types `ClassPins` and `ListedModels`.

### REQ-LADDER-006 — A working pick out of the box

Added 2026-10-15 (plan 020 file 2, units `e2-model-defaults-lister`, `e3-config-wiring` and `e8-copilot-codex-claude-pins`
with their fix rounds; the delta's amended text of 2026-10-15 from `build/66`).

Given a Cursor, Codex or Copilot CLI on `PATH`, When `init`, `sync` or `workspace sync` runs, Then the client's model list
is read once, within 10 s, persisted under `models.listed.<client>` as `{ ids, source }`, and on Codex and Copilot each
class takes the first candidate of the shipped priority list (`MODEL_PRIORITY`, `src/roster/modelDefaults.ts`, its
citations dated) the saved list holds; Given a saved list holding none of a class's candidates, Then that class writes no
model key. Given no CLI and no saved list, Then Copilot and Codex take the shipped list's first entry. On Cursor no class
takes a pick, list or no list: an unpinned class writes no model, so its sub-agent runs on the parent agent's model,
and Cursor's saved list serves only the `[effort=…]` rule of REQ-LADDER-004 and the `model-pins` row. Claude Code
keeps its family aliases. Emission and `check`'s drift gate never start a client. (Amended 2026-10-15, ledger row `qa/1`
of run `2026-10-14_cli-native` and its fix `f575afb1`: Cursor checks a sub-agent call's model against a list of its
own, which follows the parent agent's model and which no command prints, so it refused the class model picked from the
account's list and no sub-agent ran on the default dispatch path. It read "and each class takes the first candidate of
the shipped priority list (…) the saved list holds" and "Given no CLI and no saved list, Then Copilot and Codex take the
shipped list's first entry and Cursor writes no model".)

- **The resolver's order** (`baseModelValue`, `src/roster/modelLadder.ts:555-578`): the pin, kept while the saved list
  holds it and re-picked from that list when it does not, keeping the operator's value where the re-pick finds
  nothing; the client's alias; the pick over the saved list; the shipped list's entry 0 only when no list was read.
  On Cursor the pick gives nothing, list or no list (`pickModel`, `src/roster/modelDefaults.ts`), so a Cursor pin is
  kept as typed, also when the saved list lacks it, and an unpinned Cursor class resolves to no model. (Amended
  2026-10-15, ledger row `qa/1` and `f575afb1`; the order is unchanged in code, and without that sentence it read, for
  Cursor too, "re-picked from that list when it does not" and "the pick over the saved list".)
  A list holds a pin when it holds it exactly or holds `<pin>-<effort word>`, optionally `-fast`, never a longer id
  that merely starts with it, and a bracketed pin is judged by its base id before `[` (`listHoldsPin`, `:541-544`;
  `review/78`, `review/79`). The pick is a pure function of the pins, the saved list and the priority order; no pick is
  persisted, so a second account's list re-picks an unpinned class (`build/41`).
- **The read** (`listClientModels`, `src/cli/engine/clientModels.ts`): Cursor's `agent models`, Codex's
  `codex debug models` and Copilot CLI's help-config listing, each parsed (`parseCursorModels`, `parseCodexModels`,
  `parseCopilotHelpConfig`) and refused as `unreadable` when the output does not open with the client's header. The
  program is found by a walk over absolute `PATH` entries only, dropping every entry inside the working tree and every
  `node_modules/.bin`, and a program whose real path lies in the tree is refused; the child gets that same trimmed
  `PATH`, starts in the user's home folder and never inside the tree, with stdin closed, `windowsHide` and a 10 s kill,
  and nothing starts when home is inside the tree or cannot be resolved (`review/76`, `review/81`, `review/82`,
  `review/93`). On Windows an npm shim (`codex.cmd`) is not run without a shell, so the outcome is `absent` and the
  shipped list applies.
- **What is kept** (`readClientModelLists` and `MAX_LISTED_MODELS`, `src/cli/commands/init/apply.ts`): only `listed`
  outcomes, deduplicated in printed order, each id matching `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$`, at most 200; a
  listing with no such id is no answer, and a client that is absent, times out or is unreadable keeps its saved list.
  `sync` lays the answers over the saved lists through `planSync`'s `listedOverlay`, `--dry-run` reads and writes
  nothing, `workspace sync` reads each member's lists under the workspace root as `sync` does, and `init` reads them
  under the run's own environment. `STAMITY_NO_CLIENT_PROBE=1` starts no client anywhere; the test configuration and
  the child-process harness set it (`vitest.config.ts`; `test/support/cliHarness.ts`).

- GIVEN each captured client output under `test/fixtures/client-models/` THEN its parser returns the ids in order; GIVEN
  an `agent` whose output does not open with `Available models` THEN `unreadable`; GIVEN a binary that sleeps 20 s THEN
  `timeout` within 11 s (`test/cli/engine/clientModels.test.ts`).
- GIVEN no list THEN Copilot and Codex take entry 0 and Cursor nothing; GIVEN a saved Cursor list holding every
  candidate's exact effort variant and no pin THEN Cursor nothing too, and GIVEN a Cursor pin the list lacks THEN the pin
  as typed; GIVEN a saved Codex list holding no candidate of a class THEN that class's agent file carries no `model` and
  keeps `model_reasoning_effort` (`test/roster/modelDefaults.test.ts`, `test/roster/modelLadder.test.ts`,
  `test/adapters/codex.test.ts`). (The two Cursor GIVENs after the first added 2026-10-15, ledger row `qa/1` and
  `f575afb1`; the line read "GIVEN no list THEN Copilot and Codex take entry 0 and Cursor nothing; GIVEN a saved Codex
  list", with no case for a saved Cursor list.)
- GIVEN a fake lister answering for Cursor WHEN `sync` runs THEN `models.listed.cursor` is persisted and a second `sync`
  moves no byte but the `updatedAt` stamp; GIVEN the lister timing out THEN the saved list is kept; GIVEN
  `STAMITY_NO_CLIENT_PROBE=1` THEN no probe runs; GIVEN 500 ids and hostile entries THEN 200 are kept and every bad id
  dropped (`test/cli/commands/sync.test.ts`, `test/cli/commands/initApply.test.ts`, `test/cli/commands/workspace.test.ts`).
- GIVEN a `codex` planted in `<repo>/node_modules/.bin`, under the tree, or behind a link into it, or an interpreter
  planted for a launcher's `#!/usr/bin/env` line, THEN nothing in the tree runs (`test/cli/engine/clientModels.test.ts`).

As built, where the delta differed: the delta's "Given no CLI, Then Copilot and Codex take the shipped list's first
entry" holds only when no list was read; a saved list that holds no candidate writes no key (`build/66`, the landed
resolver above). The child's working folder and `PATH`, and the 200-id cap, are beyond the delta. `SECURITY.md` names the
program start and that the account's list lands in the committed manifest (`review/116`, `review/119`).

Expand/contract: the list is additive under `models.listed`; a repository whose clients are not on `PATH` emits as
before but for Copilot's and Codex's shipped entry. Rollback is a re-sync at the prior version on a restored manifest.

Amended 2026-10-15 (plan 020 file 4, unit `r3-ladder-sentence` and its fix round; the delta's amended text from
`review/102`, `build/62` and `build/66`). `/st-work`'s Model ladder section states the order above: "A class resolves
through its pin (re-picked when the account's saved list lacks it), then the client's alias, then the account's own
model list, then, only when no list was read, the shipped list; with none of these the key is left out. Where an agent
file's model takes precedence over the call's, a per-call escalation leaves it unchanged." It replaced "A class without a
supported model name or operator pin leaves selection to the client's own default." The client whose file model takes
precedence, Codex, is named only in that client's capability facts (`model-escalation`, `src/adapters/codex.ts`), since
the corpus names no client in model-facing text (`content/commands/st-work.md:462-469`).

- GIVEN `test/roster/modelLadder.test.ts`'s wording case THEN it reads both sentences and the refusal fallback whole,
  no `outranks` in the paragraph, and checks each rung of the order on the resolver; GIVEN `work.test.ts` THEN the
  body and its reserve are unchanged (added 2026-10-15).

Amended 2026-10-15 (ledger row `qa/1` of run `2026-10-14_cli-native`, its fix `f575afb1`). The two sentences quoted
above no longer stand next to each other: the shipped paragraph carries one more sentence between them, "A client that
checks a sub-agent's model against a list it never prints gets a pin alone, as typed, so an unpinned class's sub-agent
there runs on the parent agent's model." (`content/commands/st-work.md:466-467`, read at `6bc07bb8`). It names no client,
as the paragraph does not; Cursor is that client (REQ-LADDER-006). The paragraph kept its line count, so the citation
`content/commands/st-work.md:462-469` stands. The quote above is the paragraph as it read before, with "Where an agent
file's model" following "the key is left out." directly.

- GIVEN the wording case THEN it reads the new sentence too, and checks it on the resolver: a Cursor list gives an
  unpinned class no model, and a pin the list lacks resolves to `<pin>[effort=<level>]`
  (`test/roster/modelLadder.test.ts`; added 2026-10-15).

### REQ-LADDER-007 — Each client carries the pick

Added 2026-10-15 (plan 020 file 2, units `e7-cursor-pins` and `e8-copilot-codex-claude-pins` with their fix rounds; the
delta's amended text from `build/65`, `build/66` and `review/113`).

- **Claude Code** keeps its family aliases, `frontier` mapped to the documented `fable`.
- **Cursor.** The agent file's `model:` is the operator's pin for the class, as typed, also when the saved list lacks
  it, with no doubled effort (REQ-LADDER-004); with no pin, list or no list, the key is absent. A
  `preToolUse` hook on `Task`, `.stamity/generated/hooks/cursor/stamity-model-pins.mjs` with the map built in, is wired
  through the walk-up starter (REQ-FLOW-084) and never `failClosed`; it copies `tool_input` and sets `model` only when
  `tool_name` is `Task`, `model` is absent and `subagent_type` is an emitted `stamity-*` id whose class has a model, and
  every other payload, a malformed one included, answers `{"permission":"allow"}` with exit 0. The map's `model` is
  the operator's pin as typed, never an engine-added `[effort=…]` group, which stays in the agent file, and is absent
  with no pin (`buildCursorModelMap` and `callableModel`, `src/adapters/cursor.ts`; `review/100`). Cursor accepts a
  sub-agent call's model only from the models it offers sub-agents, a list that follows the parent agent's model and that
  no command prints, so a pin outside that list is refused and the touchpoint retries on the closest allowed model, as
  the touchpoint amendment below says. (Amended 2026-10-15, ledger row `qa/1` of run `2026-10-14_cli-native` and its
  fix `f575afb1`, with `cut/10` of the same run for the refused pin; it read "The agent file's `model:` is the class's
  resolved value" and "The map's `model` is what a `Task` call can pass: a listed id or the operator's pin as typed".)
- **Copilot.** Agent files carry `models: [<CLI ids>]`, the class's model first, then its other shipped candidates the
  saved list holds, and, where the shipped list gives the model a display name, a `model: "<Display Name> (copilot)"`
  line whose reader on these agents is unverified, since every agent sets `target: github-copilot`. No `modelPolicy`. A
  pin typed in the display form is written nowhere, in neither an agent file, the map nor a prompt file's `model:`: its
  class takes the pick and `init`/`sync` warn once per class, printing the pin sanitised (`agentModelLines`,
  `modelLine`, `idPins` and `displayNamePinWarnings`, `src/adapters/copilot.ts`; `review/110`, `review/114`,
  `review/138`). A prompt file whose command declares a class carries `model:` only under a pin, and then the model the
  agent files and the map carry for that class: a pin the saved list lacks gives way to the class's pick, kept only
  when the list holds none of the class's candidates, and with no saved list the pin is written as typed (`modelLine`
  through `classModels`; `review/140`).
- **Codex.** `.codex/agents/*.toml` carries `model_reasoning_effort`, and `model` whenever the class resolves; a saved
  list holding none of a class's candidates writes no `model` (`buildAgentToml`, `src/adapters/codex.ts`).
- **The map.** Every client gets `.stamity/generated/models/<client>.json`,
  `{ "classes": { "<class>": { "model"?, "fallbacks": [...] } }, "roles": { "stamity-<id>": "<class>" } }`, every ladder
  class in ladder order and every emitted role; `fallbacks` lists the class's other shipped candidates on the list,
  Claude's and Cursor's are empty. Each is an `infra` row of its client. (Amended 2026-10-15, ledger row `qa/1` and
  `f575afb1`; it read "Claude's is empty".)
- **The capability facts** say the agent-file `model` on Cursor is a default, not a hard limit, and that Stamity carries
  it on the dispatch and by a hook; Copilot's `model-pick` row marks its `models` claim as the CLI reference's alone and
  its `cloud-model` row says the cloud agent's picker decides; Codex's `model-escalation` row says a file's `model` takes
  precedence over a per-call escalation where one is written (`build/38`, `build/62`, `review/109`, `review/113`).

- GIVEN a Task payload without `model` for `stamity-reviewer`, its class pinned, THEN the hook answers the map's class
  model; GIVEN a saved list and no pin THEN it fills nothing; GIVEN one with
  `model`, an unmapped id, `__proto__` or extra fields THEN `{"permission":"allow"}` and no other field moves; GIVEN a
  malformed payload THEN valid JSON `allow` and exit 0; GIVEN the command run from `repo/sub/deeper` THEN the same
  answer (`test/adapters/cursorModelHook.test.ts`). (Amended 2026-10-15, ledger row `qa/1` and `f575afb1`; it read
  "GIVEN a Task payload without `model` for `stamity-reviewer` THEN the hook answers the map's class model", with no
  case for a saved list and no pin.)
- GIVEN a Cursor pin and no list THEN the agent file carries `<pin>[effort=<level>]` and the map `<pin>`; GIVEN a Cursor
  pin the saved list lacks THEN it is written as typed; GIVEN no pin, list or no list, THEN no `model:` line and an empty
  map class, its `fallbacks` `[]` (`test/adapters/cursor.test.ts`). (Amended 2026-10-15, ledger row `qa/1` and
  `f575afb1`; it read "GIVEN no list and no pin THEN no `model:` line and an empty map class".)
- GIVEN no pin and no list THEN Copilot's agent files carry `models` and Codex's `model` from the shipped list; GIVEN a
  Codex pin THEN it wins; GIVEN a display-form Copilot pin THEN it is in neither `models`, `model:`, the map nor a
  prompt file that declares its class, and one sanitised warning names the class; GIVEN a Copilot id pin the saved list
  lacks THEN a prompt file that declares its class carries the same re-pick as the agent files and the map, and GIVEN no
  pin THEN it carries no `model:`; GIVEN each client's map THEN it parses and lists every role
  (`test/adapters/copilot.test.ts`, `test/adapters/codex.test.ts`, `test/adapters/claude.test.ts`).

As built, where the delta differed: the delta's first form wrote a display-form Copilot pin to the `model:` line; it
landed written nowhere, with the warning (`build/65`, revised at `e8`'s review). The Cursor map's bracket-free value is
`review/100`'s. Unverified and recorded so: how Cursor merges `updated_input` across two `preToolUse` hooks on `Task`,
and the `Task` tool's input fields, which no Cursor page documents (the plan's measurement on Cursor 3.13.25).

Amended 2026-10-15 (plan 020 file 3, units `f3-work-close`, `f4-board-close`, `f5-touchpoints-a` and
`f6-touchpoints-b`; plan 020 file 4, unit `r3-ladder-sentence`). Every touchpoint whose `spawns:` is not empty passes
the role's class model from the client's map on each sub-agent call, and on a refusal with a list takes the class's
first listed fallback, else the closest, and says so in one line: `/st-work`'s Frame ("pass each role's class model
from the client's map at `.stamity/generated/models/`", `content/commands/st-work.md:19-20`) with the fallback in its
Model ladder section (`:468-469`, read at `41aab6cf`; amended 2026-10-15, ledger row `cut/18` of run
`2026-10-14_cli-native`: it read "`:467-468`", the lines before `f575afb1` added a sentence above them), and one
sentence each in `/st-board`, `/st-plan`, `/st-rework`, `/st-pr-resolve`, `/st-debug`, `/st-quick`, `/st-ask` and
`/st-spec`.

- GIVEN each of those bodies THEN it carries the model sentence (`test/corpus/commands/work.test.ts`, `board.test.ts`,
  `plan.test.ts`, `feedbackPair.test.ts`, `lightTrio.test.ts`, `spec.test.ts`; added 2026-10-15).

### REQ-LADDER-008 — `check` verifies pins

Added 2026-10-15 (plan 020 file 2, unit `e4-check-model-row`, with the integration fix of `review/86`).

`stamity check` prints a `model-pins` doctor row after `pack-reach` (`checkModelPins`, `src/cli/commands/check.ts`). For
each selected client that lists models (Cursor, Copilot, Codex) it compares every class's pinned model and emitted
model, both without bracket options, with the list the client's CLI prints now, else the list the last `sync` saved.
For Codex the saved list is the reference whenever one exists, since `sync` read it from the catalogue Codex resolves
normally, and `check` starts `codex` only when no list was saved, then with `--bundled`, so the read stays offline; the
row's note says which list it compared with (`review/136`). It judges a model by the resolver's own predicate, `listHoldsPin`, so the report and the
emission agree (`review/86`). A pinned model the list lacks warns naming the client, the class and the model, with
`config set model.<class>.<client> <id>`; an emitted model the list lacks warns naming `sync`. Where the live list is
the catalogue `sync` picks from (Copilot) and the live read answers, a class whose model `sync` would resolve from
the live list differently from the one the files carry, resolved from the saved list or, where none was saved, with no
list, warns naming the client, the class, both models and `sync`, unless the row already warns for that class
(`review/135`). On Cursor only a pin is written, as typed, so the row compares pins alone there and `sync` never
resolves a different model from a list. (Amended 2026-10-15, ledger row `qa/1` of run `2026-10-14_cli-native` and its
fix `f575afb1`; it read "Where the live list is the catalogue `sync` reads (Cursor, Copilot)".) With nothing to compare
the row passes with `unverified` and its reason in the detail; under `STAMITY_NO_CLIENT_PROBE=1` it starts no client and
reads the saved list only. Every printed value passes `sanitizeLabel`, and the row never fails.

- GIVEN a saved Codex list without `gpt-5.5` and a pin `gpt-5.5` THEN `warn` naming codex, the class and the model;
  GIVEN no CLI and no list THEN `pass` with "unverified"; GIVEN `check --json` THEN the row id is `model-pins` at
  `pack-reach`'s index plus one; GIVEN a fake `codex` on `PATH` and the switch set THEN it is not started; GIVEN a saved
  Codex list THEN no `codex` is started; GIVEN a saved Copilot list lacking the pin and a live one holding the pin and the
  re-pick THEN `warn` naming both models and `sync`; GIVEN no saved Cursor list and a live one holding an unpinned
  class's variant THEN `pass` with "cursor: no model pinned or emitted to compare (read live)", GIVEN that list saved
  and the probe off THEN `pass` with "… (saved by the last sync)", and GIVEN a Cursor pin the list lacks THEN one `warn`
  naming the pin (`test/cli/commands/check.test.ts`, the describe "check — model-pins"). (Amended 2026-10-15, ledger
  row `qa/1` and `f575afb1`; the Cursor case read "THEN `warn` naming `none`, that model and `sync`".)

As built, where the delta differed: `checkModelPins` takes the working folder as a fourth parameter, which the lister
needs. Open, as Minors of the run: a pin live-listed but missing from the saved list passed with no nudge to `sync`
(`review/88`), which `review/135`'s warning now gives on Copilot, with or without a saved list, and no test reached the
`unreadable` reason (`review/89`), which `856c71a5` now tests. (Amended 2026-10-15, the first clause for ledger row
`qa/1` and `f575afb1`, the second for `856c71a5`; it read "now gives on Cursor and Copilot" and "no test reaches the
`unreadable` reason".)

## References

- `docs/plans/008-plugin-lifecycle-02.md` — unit C9.
- `docs/configuration.md` — the `effort.*` keys as rendered.
- `docs/plans/009-orchestrator-context-economy-01.md` — the capacity rung and the no-downgrade rule (REQ-LADDER-002, REQ-LADDER-003). The line citations in those two requirements and in the capacity paragraph above are to the tree at `d227ca57`, the 1.10.0 release candidate. On 2026-09-27 each was read at the tree it was first written against (`fed39ac` for the `content/commands/st-work.md` and `test/corpus/commands/work.test.ts` ones, before the body reorder and its tests moved them; the spec merge `12d8f20e` for the rest) and found again, with the same text, at `d227ca57`. The "Findings ledger" bullet is cited by name, because its text changed after `fed39ac`: it now says each event is appended as a one-row findings block on `--stdin`.
- `content/commands/st-work.md` — the Dispatch contract's capacity bullet, after "Findings ledger".
- `.stamity/runs/2026-10-08_product-core/plan.md` and its `record.md` — the escalation's sign-offs
  and the p4 review rounds the paragraph dated 2026-10-09 cites.
- `docs/plans/019-lean-flows-03.md`, and `.stamity/runs/2026-10-10_next-tier/plan.md` (its in-flow
  re-plan, whose `## Spec delta` the 2026-10-10 merge took), `record.md` and `ledger.jsonl` — the
  sign-offs and the ledger rows the text dated 2026-10-10 cites. That merge re-pointed the
  citations of `content/commands/st-work.md` in this file to the lines that hold their text at
  `a60cb496`, the ones in REQ-LADDER-002, REQ-LADDER-003 and the capacity paragraph included,
  which the bullet above dates to `d227ca57`, and the 2026-10-09 paragraph's
  `src/roster/modelLadder.ts` lines with them; the closed Concerns bullet says which of its own
  it left. It removed one citation, REQ-LADDER-003's
  `content/commands/st-work.md:260-262` for "the fresh fixer spawned on a stronger class": that
  text is gone, and the 2026-10-09 paragraph cites what replaced it. Every other citation in
  those two requirements stays at `d227ca57`: `test/corpus/commands/work.test.ts:1000-1003`,
  `test/roster/modelLadder.test.ts:130-142` and
  `src/roster/modelLadder.ts:36`, `:48-56`, which the run also moved. (Amended 2026-10-15, ledger row `cut/5` of run
  `2026-10-14_cli-native`: REQ-LADDER-002's amendment of that day, `review/142`, cites `docs/capability-matrix.md:232`
  read at `c7158dbf`, and `:240` now stands only in the text that amendment quotes; this list read
  "`test/roster/modelLadder.test.ts:130-142`, `docs/capability-matrix.md:240` and".) A follow-up pass on that
  unit the same day re-pointed this file's three citations of `src/cli/commands/config.ts` to
  `9a0ba4cf`, after the run's QA fix round put the effort hint's legacy clause above them
  (`501d4997`, 24 lines): `:441-458` became `:465-482`, `:470-481` became `:494-505` and
  `:446-448` became `:470-472`. The Invariants' second bullet and the closed Concerns bullet carry
  that pass's two dated amendments.
- `docs/plans/020-cli-native-02.md`, `-03.md` and `-04.md`, with `.stamity/runs/2026-10-14_cli-native/` (its record,
  ledger and units' reports) — the spec deltas, sign-offs and ledger rows the text dated 2026-10-15 cites
  (REQ-LADDER-004 to REQ-LADDER-008), added 2026-10-15.
- `source` (added 2026-10-15): `src/roster/modelDefaults.ts` (`MODEL_PRIORITY`, `pickModel`, `modelMapPath`),
  `src/roster/modelLadder.ts` (`pinsFor`, `listHoldsPin`, `resolveModelValue`), `src/cli/engine/clientModels.ts`
  (`listClientModels`), `src/cli/commands/init/apply.ts` (`readClientModelLists`), `src/manifest/manifest.ts`
  (`PER_CLIENT_PINS_STEP`), `src/types/manifest.ts` (`ClassPins`, `ListedModels`), `src/cli/commands/config.ts`,
  `src/cli/commands/check.ts` (`checkModelPins`), and the four adapters.
- `test` (added 2026-10-15): `test/roster/modelDefaults.test.ts`, `test/cli/engine/clientModels.test.ts` with its
  fixtures under `test/fixtures/client-models/`, `test/adapters/cursorModelHook.test.ts`, and the suites each
  requirement above names.

## Concerns

- **A placement neither count names** (`review/31`, carried to this merge). The closure re-review
  after an escalation runs once on a stronger class (`content/commands/st-work.md:214`;
  `content/agents/stamity-reviewer.md:118-119`): a reviewer placement above the reviewer's
  declared class that no row records, that the header's two placements leave out
  (`src/roster/modelLadder.ts:36-58`), and that `/st-work`'s Model ladder paragraph does not name
  either; that paragraph also leaves out the escalation's effort step (`:484-489`). Recorded as
  observed: the plan kept the header at two placements, so naming a third moves the header, its
  pin and that paragraph together, and is left to the change that decides it. An agent checking
  the re-reviewer's class against the table finds no row for it.
  Closed 2026-10-10 (run `2026-10-10_next-tier`, units `q4b-codex-scale` and
  `q4t-ladder-placement-text`): the closure re-review is the ladder's third recorded placement,
  beside the whole-branch escalation and the fixer's drop, in the module header, the frontier
  row's `rationale` and `/st-work`'s frontier cell; and that command's Model ladder paragraph
  names the escalation's effort step beside the capacity rung's drop as the two no row records
  (REQ-LADDER-003, amended 2026-10-10). Of this bullet's citations,
  `content/commands/st-work.md:214` was re-pointed to `a60cb496`; `src/roster/modelLadder.ts:36-58`
  and `content/commands/st-work.md:484-489`, which the bullet writes as a bare `:484-489`, are left
  as the 2026-10-09 merge wrote them, since the text they cite is the text this change replaced;
  that command's Model ladder paragraph now stands at `content/commands/st-work.md:462-467`, read
  at `9a0ba4cf` (amended 2026-10-10, `review/86`; it read "`src/roster/modelLadder.ts:36-58` and
  `:484-489` are left").
- **A sixth placement no text names** (ledger `review/40` of run `2026-10-10_next-tier`, open, a
  decision). The Failure ladder's second rung reassigns a twice-failed sub-agent's work "to a
  stronger model class" (`content/commands/st-work.md:98-102`). Neither `/st-work`'s Model ladder
  paragraph, with its three recorded placements and two unrecorded ones (`:464-467`), nor the
  module header (`src/roster/modelLadder.ts:31-59`) counts it, so an agent checking a reassigned
  spawn's class finds no row and no note for it. Recorded as observed, at `a60cb496`.
