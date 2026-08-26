---
id: design-system-create
type: command
description: "Generates a design system from the recorded inventory and an intake dialog — three-tier tokens, perceptual colour ramps, theme sets, and the design document — with the interface and interaction lenses gating contrast, parity, and alias integrity."
tags: [implementation]
load: on-demand
obsolete_when: design tooling emits a themed three-tier token graph that clears the contrast, parity, and alias gates without authoring
spawns: [researcher, implementer, reviewer]
---

# /stamity-design-system-create

Generates the token graph and the design document a repo's interface work reuses. It
starts from what the repo already has, delegates every write, and gates what came back.

## Input: the design-system inventory

The run starts from `.stamity/design-system-inventory.md`, the artifact the core
`stamity-design-system-detect` skill writes. This command performs no detection of its own
and holds no probe list: absent inventory, or one whose recorded commit sits far behind
the current head, means run that skill first and re-enter with the fresh file. Its
verdict routes the run.

| Verdict | Route |
|---|---|
| `reuse` | Stop. Report the token source and component roots the inventory names. A working system is never overwritten here. |
| `extend` | Generate only the gaps the inventory records — a missing theme, an absent component group, a token category no source covers. Existing token names are read-only input, and the inventory's canonical token location wins over every default below. |
| `create` | Full run — after the system-level re-read below, which is what decides whether `create` means this repo has no design system or only that it lacks one component. |
| `blocked` | Stop until the operator names the canonical token source. Writing a new source beside competing ones multiplies the problem the inventory found. |

A verdict of `reuse` or `blocked` ends the run before the first write. Neither is a
question with options: one says a working system already occupies the ground and the other
says the operator has to name the canonical source first, and generating over either is the
irreversible act this command refuses. The run reports the verdict and stops.

### `create` is a per-need verdict, re-read at system level

The inventory's verdict answers one component need: `create` means nothing covers THAT
need. It does not mean the repo has no design system, and routing a full run on it
regenerates a three-tier token graph over a working one — the same irreversible act the
`reuse` row exists to refuse, arriving through the door beside it.

So before the full run starts, read the inventory's own sections rather than its verdict
line. A canonical token source with no conflict recorded, plus a non-empty component list,
plus a theming mechanism, means a system is already here: the run downgrades itself to the
`extend` route and generates the single gap, reporting the downgrade and what it read to
reach it. The full run proceeds only where those sections are empty, or where the inventory
records no canonical token source at all. This gate reads `create` and nothing else — an
`extend` verdict is already scoped to a gap and passes through untouched.

## Generator contract

1. **Plan first.** Resolve the intake below into one written spec — hues, themes, tiers,
   emission targets, file locations — and confirm it once. That confirmation is the only
   interactive step; after it the run is autonomous through the report.
2. **The implementer writes.** Every file lands through an `implementer` spawn. Generation
   stays a single spawn by dependency, not by frugality: every alias resolves inside one
   token graph, so two writers would produce a graph nobody reviewed.
3. **The reviewer gates.** A `reviewer` spawn reads the generated set through the UI and
   UX lenses and returns a graded verdict with path:line evidence.
4. **One regeneration, then stop.** A failed gate buys exactly one corrective implementer
   pass, scoped to the failing rows. A second failure ends the run: the findings go to the
   operator verbatim and the system is reported not-merge-ready. The cap is fail-closed —
   this loop has no third round and no operator flag that adds one.
5. **The floor is the repo's, not this command's.** Gate criteria are the ui and ux axes
   of the `stamity-verify` skill, read from `.stamity/verify/ui-<sha>.json` and
   `.stamity/verify/ux-<sha>.json`, where `<sha>` carries the producer's `-dirty` suffix
   whenever the worktree is unclean. The run reads the artifacts for the CURRENT key: a
   clean-tree artifact does not answer for a dirty tree, and the gate runs after the
   implementer has written, so the tree is unclean by construction and the `-dirty` key is
   the normal one here. No artifact for that key means invoke the skill for that axis first
   and gate on what that run wrote. This generator builds to that floor and cites it; it
   does not define one.
6. **The Gate rows below are this generator's acceptance criteria, not a second floor.**
   They state what the generated set must look like for this run to report merge-ready,
   and they are evaluated against the axis artifacts as evidence. Where a row's threshold
   is stricter than the axis check's, the stricter one is this generator's own choice and
   is marked as such rather than presented as the repo's floor.

## Ask before writing

Each trigger stops the run before the first write and asks one question with numbered
options and a declared default, per the core `stamity-question-protocol` rule.

Routing verdicts are not listed here. `reuse` and `blocked` are unconditional stops with no
options to offer, so presenting them as questions would contradict the one-question-with-a-
declared-default contract this section holds itself to.

| Trigger | Why it stops |
|---|---|
| Theme set or emission target undeclared | Both change the shape of every generated file; adding a theme afterwards is a regeneration, not an edit. |
| No brand input and no intake answers | Hues, density, and radius are product decisions. The intake dialog asks for them rather than assigning house defaults to someone else's brand. |

## Intake

| Input | Default | Notes |
|---|---|---|
| Brand hues | ask | one to three; each hue gets its own ramp |
| Neutral temperature | pure | warm · cool · pure — the hue bias of the neutral ramp |
| Density | comfortable | compact · comfortable · spacious — the base of the spacing scale |
| Radius scale | 4px base | none · 4px · 8px · fully rounded |
| Motion | 200ms ease, with a reduced-motion variant | the variant is generated, not optional |
| Theme set | light and dark | a high-contrast set is a third override set when asked for |
| Emission targets | the token file alone | utility-framework theme block · custom properties, written under `styles/` unless the repo's convention names another root |
| Token location | the repo's convention, else `tokens/` | the inventory's canonical location wins on `extend` |

A `researcher` spawn reads supplied brand assets when they exist — one per asset class,
read-only, returning candidate hues and any spacing or radius conventions the assets
already imply. With no assets, the intake dialog is the whole input.

## Token architecture

Three tiers. Each references the tier above it and nothing else.

| Tier | Holds | References |
|---|---|---|
| Primitive | raw scales with no theme awareness — colour ramps, spacing, radius, type scale | nothing; these carry literal values |
| Semantic | roles: surface, text, border, brand, and the status set | primitives only |
| Component | per-component roles: control text, control border, and their states | semantic tokens only |

The hard rule: a component token never references a primitive directly. Theme switching is
then a semantic-tier override and nothing else has to move, which is exactly what the rule
buys. A direct component-to-primitive reference is a blocking gate row, not a style note.

## Ramps and themes

- Ramps are authored in a perceptual colour space, so a step's lightness is what its
  contrast tracks. To reach a target contrast, hold lightness and move chroma and hue —
  chasing it by nudging every channel produces a ramp nobody can extend.
- Dark-theme surface ramps carry reduced chroma; the same chroma that reads as calm on a
  light surface reads as loud on a dark one.
- Themes are override sets over identical semantic key sets. A key present in one theme
  and absent from another is a blocking gate row: it is a runtime hole that renders as a
  missing colour, not as an error.

## Emission

The token file is the only authored source. Utility-framework theme blocks and custom
properties are generated from it, regenerated when it changes, and never edited in place —
a second hand-maintained source is the failure this tier structure exists to prevent.

## Gate rows

| Row | Passing condition | Blocking |
|---|---|---|
| Text contrast | every semantic foreground-on-background pair meets WCAG 2.2 AA — 4.5:1 body, 3:1 large — in every theme | yes |
| Non-text contrast | interface boundaries and state indicators at 3:1 | yes |
| Focus indicator | 3:1 against both the component and its surround | yes |
| Pointer target sizing | the sizing token clears the platform guidance floor — this generator's own criterion, deliberately above the axis check's AA minimum, because a token scale is set once and inherited by every control | yes |
| Dangling aliases | zero: every alias resolves to a declared token | yes |
| Theme parity | identical semantic key sets across every generated theme | yes |
| Component-to-primitive references | zero | yes |
| Perceptual contrast reading | recorded per pair in the design document | advisory |

## Documentation output

`docs/design.md`, written by the same implementer spawn: the intake decisions restated as
principles, the ramp tables per hue, the tier diagram, a theme table of semantic keys by
theme, one usage example per emission target, and the accessibility report holding the
gate matrix plus the advisory readings.

## Flow

1. **Read the inventory**, route on its verdict, and re-read `create` at system level
   before committing to a full run.
2. **Intake.** Fill the table from assets and dialog; a `researcher` spawn per asset class
   when assets exist.
3. **Plan.** Write the resolved spec and confirm it once.
4. **Build.** One `implementer`: token file, emission targets, design document.
5. **Gate.** One `reviewer` on the UI and UX lenses, with the axis artifacts as evidence
   input; regenerate at most once, then re-gate the failing rows.
6. **Report.** Files written, gate matrix, advisory readings, and what the operator wires
   next.

## Report and boundaries

- The run writes tokens, derived emission targets, and the design document. It creates no
  branch, no commit, and no pull request.
- Importing the token file into the build, and pointing component authors at the design
  document, stay operator steps and are named in the report.
- A run that ends after the second gate failure reports `not-merge-ready` with the open
  findings attached. Reporting it as complete is a contract breach.
