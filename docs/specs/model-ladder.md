---
id: model-ladder
# A design document, authored from docs/plans/008-plugin-lifecycle-02.md on 2026-09-17 and excluded from the site build.
status: shipped-with-1.9.0
obsolete_when: every supported client publishes one effort scale the ladder can name without a per-client table, or a decision row cuts the surface
---
# Model ladder

The effort axis of the model ladder (`src/roster/modelLadder.ts`). The three-level band
(`low, medium, high`) was chosen in 1.7.0 as the scale every supported client shared; by
2026-09-17 Claude Code documents `xhigh` and `max`, Codex documents `minimal` and `xhigh`, and
Cursor passes the value through to the model, so the band capped the deep-review class below what
three of four clients accept. `/st-work` moves `status` to `shipped-with-1.9.0` at the close.

## Intent

Let an operator ask for any effort level a selected client documents, refuse at configuration
time what a selected client cannot express, and never downgrade silently.

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

## References

- `docs/plans/008-plugin-lifecycle-02.md` — unit C9.
- `docs/configuration.md` — the `effort.*` keys as rendered.
