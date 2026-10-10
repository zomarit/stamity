---
id: model-ladder
# A design document, authored from docs/plans/008-plugin-lifecycle-02.md on 2026-09-17, extended from docs/plans/009-orchestrator-context-economy-01.md on 2026-09-23, amended in run 2026-10-08_product-core on 2026-10-09, amended in run 2026-10-10_next-tier on 2026-10-10, and excluded from the site build.
status: shipped-with-1.9.0
obsolete_when: every supported client publishes one effort scale the ladder can name without a per-client table and resumes, waits out and reports a sub-agent's capacity stop on its own, or a decision row cuts the surface
---
# Model ladder

Two axes of the model ladder. The first is effort (`src/roster/modelLadder.ts`). The three-level band
(`low, medium, high`) was chosen in 1.7.0 as the scale every supported client shared; by
2026-09-17 Claude Code documents `xhigh` and `max`, Codex documents `minimal` and `xhigh`, and
Cursor passes the value through to the model, so the band capped the deep-review class below what
three of four clients accept. `/st-work` moves `status` to `shipped-with-1.9.0` at the close.

The second axis is capacity, added on 2026-09-23 from `docs/plans/009-orchestrator-context-economy-01.md`
(REQ-LADDER-002, REQ-LADDER-003). It covers what the flow does when a sub-agent stops
because a model is out of capacity, not because its work failed. The failure ladder
(`content/commands/st-work.md:98-102`) reads any stop as a failed sub-agent: its first rung
re-briefs the agent, and its second reassigns the work to a stronger class. Under a limit on
one model, that stronger class is the one already out of capacity. REQ-LADDER-001 shipped with
1.9.0. REQ-LADDER-002 and REQ-LADDER-003 ship with 1.10.0. `status` stays
`shipped-with-1.9.0`, the release that first shipped this spec, and the 1.10.0 release does not
move it (the `spec-citations` unit of `docs/plans/010-enterprise-release-02.md`, 2026-09-27).

REQ-LADDER-004 and the paragraphs dated 2026-10-10 come from the spec delta of run
`2026-10-10_next-tier` (plan 019 file 3, re-planned in that run), merged by its unit
`s1-spec-merge` against the integration head `a60cb496`. They are unreleased at that merge, so
`status` does not move. A ledger id in that text (`review/5`, `build/21`) is that run's own
unless a run is named beside it. `## References` says which citations the merge re-pointed.

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
the run record's capacity lines. No engine surface changes. Codex receives no touchpoint
bodies (`docs/capability-matrix.md:240`), so the bullet has no carrier there.

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
loader also takes the `reasoningEffort` spelling of the online reference's table is unverified,
and no live run has loaded an agent carrying the key, so a wrong spelling would leave agents at
the session's effort while the capability row reads emitted (`src/roster/modelLadder.ts:410-416`;
`build/21`). The cloud agent's handling of the key is the accepted risk
`docs/specs/everyday-flows.md` records in its `## Risks`. The APM package's Copilot agents carry
no effort line (`scripts/generate-apm-package.mjs:601-606`; `build/22`).

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
  `test/roster/modelLadder.test.ts:130-142`, `docs/capability-matrix.md:240` and
  `src/roster/modelLadder.ts:36`, `:48-56`, which the run also moved. A follow-up pass on that
  unit the same day re-pointed this file's three citations of `src/cli/commands/config.ts` to
  `9a0ba4cf`, after the run's QA fix round put the effort hint's legacy clause above them
  (`501d4997`, 24 lines): `:441-458` became `:465-482`, `:470-481` became `:494-505` and
  `:446-448` became `:470-472`. The Invariants' second bullet and the closed Concerns bullet carry
  that pass's two dated amendments.

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
