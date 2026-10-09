---
id: model-ladder
# A design document, authored from docs/plans/008-plugin-lifecycle-02.md on 2026-09-17, extended from docs/plans/009-orchestrator-context-economy-01.md on 2026-09-23, amended in run 2026-10-08_product-core on 2026-10-09, and excluded from the site build.
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
(`content/commands/st-work.md:143-147`) reads any stop as a failed sub-agent: its first rung
re-briefs the agent, and its second reassigns the work to a stronger class. Under a limit on
one model, that stronger class is the one already out of capacity. REQ-LADDER-001 shipped with
1.9.0. REQ-LADDER-002 and REQ-LADDER-003 ship with 1.10.0. `status` stays
`shipped-with-1.9.0`, the release that first shipped this spec, and the 1.10.0 release does not
move it (the `spec-citations` unit of `docs/plans/010-enterprise-release-02.md`, 2026-09-27).

## Intent

Let an operator ask for any effort level a selected client documents, refuse at configuration
time what a selected client cannot express, and never downgrade silently — neither an effort
level nor, when a model runs out of capacity, a verdict role's class.

## Invariants

- Class defaults do not move with this spec (`frontier` stays `high`); a default change is a
  separate, measured decision.
- A level a selected client cannot express is refused when set, naming the client and its top or
  bottom level; a level a later-selected client cannot express is emitted as that client's nearest
  expressible level with a disclosure line, never dropped.
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
(`content/commands/st-work.md:143-147`) and its pinned phrases
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
`performance` lens, or the fresh fixer spawned on a stronger class
(`content/commands/st-work.md:260-262`) — or the spec-author does, Then it is resumed, waited
for, or returned as `BLOCKED_DEPENDENCY` at the class the ladder assigns it, and it is never
re-dispatched on a weaker class: the spec-author holds its class like the verdict roles, because
later units are planned against its text (amendment A9); When a build role — the implementer,
the fixer on rounds 1–3, the researcher, the creator or the test-runner (amendment A9) — stops
as `limit-no-reset`, Then it may be re-dispatched one class below its assigned class and no
further, and the proof block's per-action attribution (`content/commands/st-work.md:356`) names
that role, the class it was assigned and the class it ran at; When a build role stops as
`stall`, `connection` or `limit-reset`, Then it keeps its assigned class; and When
`test/roster/modelLadder.test.ts` runs after the change, Then it passes with no change to the
four class rows of the `### Model ladder` table, and with no change to
`src/roster/modelLadder.ts` beyond its header comment, which names the capacity rung's
one-class drop as a second flow placement no row records (`src/roster/modelLadder.ts:36`,
`:48-56`).

Work run at a lower class is still reviewed at the verdict roles' declared classes, and the
effective-identity check (`content/commands/st-work.md:466-469`) still applies. The same
`work.test.ts` case pins the no-fallback sentence. The class a build role actually ran at is
checked against the proof block: `judgment: reviewer`.

Amended 2026-10-09 (run `2026-10-08_product-core`, units `p4a-review-cap` and
`p4b-fixer-escalation`, and the p4 fix round; every `path:line` in this paragraph reads at
`90710ba5`). The review loop no longer escalates to a fresh fixer on a stronger class at round 4.
Its escalation is a fresh fixer spawn on the same model at one effort level above the fixer's
declared one, where the client's dispatch takes an effort setting; where it takes none, the fresh
spawn is the escalation and the proof block records `effort: not settable`
(`content/commands/st-work.md:251-260`; `content/agents/stamity-fixer.md:74-85`). So, in the
paragraph above, "the fresh fixer spawned on a stronger class" now reads "the escalation fixer",
which still never falls back to a weaker class, and the build role "the fixer on rounds 1–3"
now reads "the fixer before an escalation" (`content/commands/st-work.md:140-146`). The
per-action attribution sits at `:353`, and the effective-identity check at `:480-482`. The header
of `src/roster/modelLadder.ts` still counts two flow placements no row records: the first is now
the escalation's effort step (`:36-48`), the second the capacity rung's one-class drop
(`:50-58`); the class rows and the `TWO FLOW PLACEMENTS` pin are unchanged
(`test/roster/modelLadder.test.ts`).

## References

- `docs/plans/008-plugin-lifecycle-02.md` — unit C9.
- `docs/configuration.md` — the `effort.*` keys as rendered.
- `docs/plans/009-orchestrator-context-economy-01.md` — the capacity rung and the no-downgrade rule (REQ-LADDER-002, REQ-LADDER-003). The line citations in those two requirements and in the capacity paragraph above are to the tree at `d227ca57`, the 1.10.0 release candidate. On 2026-09-27 each was read at the tree it was first written against (`fed39ac` for the `content/commands/st-work.md` and `test/corpus/commands/work.test.ts` ones, before the body reorder and its tests moved them; the spec merge `12d8f20e` for the rest) and found again, with the same text, at `d227ca57`. The "Findings ledger" bullet is cited by name, because its text changed after `fed39ac`: it now says each event is appended as a one-row findings block on `--stdin`.
- `content/commands/st-work.md` — the Dispatch contract's capacity bullet, after "Findings ledger".
- `.stamity/runs/2026-10-08_product-core/plan.md` and its `record.md` — the escalation's sign-offs
  and the p4 review rounds the paragraph dated 2026-10-09 cites.

## Concerns

- **A placement neither count names** (`review/31`, carried to this merge). The closure re-review
  after an escalation runs once on a stronger class (`content/commands/st-work.md:244`;
  `content/agents/stamity-reviewer.md:118-119`): a reviewer placement above the reviewer's
  declared class that no row records, that the header's two placements leave out
  (`src/roster/modelLadder.ts:36-58`), and that `/st-work`'s Model ladder paragraph does not name
  either; that paragraph also leaves out the escalation's effort step (`:484-489`). Recorded as
  observed: the plan kept the header at two placements, so naming a third moves the header, its
  pin and that paragraph together, and is left to the change that decides it. An agent checking
  the re-reviewer's class against the table finds no row for it.
