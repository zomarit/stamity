---
description: Detects the design system a repo already has — design tokens, components, theming, responsive strategy — and writes the inventory the next interface change reuses instead of minting a parallel one. Triggers before interface work that would add a token or a component, when it is unclear whether a repo has a design system at all, or when a recorded inventory has fallen behind the current head.
name: st-design-system-detect
metadata:
  id: design-system-detect
  type: skill
  tags:
    - maintenance
  load: on-demand
  obsolete_when: design-system inventory is a client-native detection
---

# Design system detect

Read-only detection. It reports the design system this repo already has, so the
next interface change reuses it instead of minting a parallel one. It writes no
tokens, no components, and no themes: generation belongs to a generator pack,
and a detector that also generates cannot be trusted to report what it found.

## Quick Start

1. Scan the dependency manifest for library signals (Step 1).
2. Locate the token source, in detection order (Step 2).
3. Inventory the existing components (Step 3).
4. Classify theming and responsive strategy (Step 4).
5. Write the inventory and state the reuse verdict (Step 5).

## Step 1 — Library signals

Read the dependency manifest and record every interface-library dependency with
its resolved version: component kits, headless primitive sets, utility-class
frameworks, and their configuration companions. Record the major version too —
configuration shape and token syntax usually move with it.

Zero matches is a finding, not an error: record "no interface library detected"
and continue. A repo can carry a hand-rolled design system with no dependency at
all, and Steps 2-4 are what find it.

## Step 2 — Token source

Detection order, every match recorded. The order is the reporting order, not an
election — which source is canonical is decided per value category by the one
rule under "Competing token sources", so a later match is never discarded for
arriving second:

1. A design-token file in the interchange format the repo uses, at the root or
   under a design, tokens, or styles directory.
2. A theme block declared inside the stylesheet layer.
3. Custom properties declared at the document root in a stylesheet.
4. A theme section inside the utility framework's configuration file.
5. A design-tool export committed into the repo.

Per source, record: path, format, the value categories it covers (colour,
spacing, typography, radius, elevation, motion), and the colour notation in use.

## Step 3 — Component inventory

Locate the directories that hold shared components — a registry configuration
names them where one exists; otherwise take the conventional roots for the
detected framework. List each existing component by name, with its path and
whether it is generated, vendored, or hand-authored.

The list is the reuse surface. An implementer reads it to decide between reusing
a component, composing around it, and adding a new one.

## Step 4 — Theming and responsive strategy

Record how themes are selected (attribute on the root element, class name, media
preference, or none), and which theme variants exist.

Classify the responsive strategy as container-scoped, viewport-scoped, or mixed,
by counting container-scoped and viewport-scoped rules across the stylesheet
layer. Record the breakpoint values found. A repo whose components are
container-scoped is not extended with viewport-only additions.

## Step 5 — Emit the inventory

Write the inventory, state the verdict, and stop. The verdict is one of:

| Verdict | Meaning |
|---|---|
| `reuse` | a component covering the need already exists — use it |
| `extend` | a component exists but does not cover the need — compose around it |
| `create` | nothing covers the need — author one, in the inventoried location |
| `blocked` | the answer needs an operator decision the detector cannot make — competing token sources, below |

`create` carries a one-line justification naming the components checked first.
`blocked` carries its reason, and it is the row that stops an irreversible
write: a `create` issued over a contested token set mints the parallel system
this skill exists to prevent.

## Competing token sources

One rule, keyed on how many sources define the SAME value category:

- **One source defines a category** — that source is `canonical` for it.
- **Two or more define it** — every one of them is marked `conflicting` for that
  category, none is elected, and the verdict is
  `blocked: competing token sources`. Two overlapping sources block exactly as
  five do; the count past two changes nothing.
- **Sources whose categories do not overlap** — each is `canonical` for its own,
  and the verdict is unaffected. Several sources is not by itself a conflict.

Three sources all declaring the same colour ramp is the case this skill exists
for. The inventory lists all three with `file:line` for the declaration in each,
marks the conflict, and picks none. Electing a canonical source is an operator
decision with consequences the detector cannot see — which one the design team
maintains, which one a build step generates, which one is dead. The verdict
field reads `blocked: competing token sources` until the operator names the
winner, and any interface work that would add a token waits for that answer.

Overlap is reported per value category, so "three sources, no overlap" and
"three sources, all defining the same colour ramp" are distinguishable.

## Non-JavaScript stacks and missing manifests

No dependency manifest does not mean no design system. Where the manifest is
absent or the stack is not JavaScript, record the detected stack and probe its
own conventions: template partial directories, stylesheet variable files,
component libraries vendored into the tree. Record what was probed either way —
a reader must be able to tell "looked and found nothing" from "did not look".

## Output artifact

One file per repo at `.stamity/design-system-inventory.md`, regenerated in place
rather than accumulating per-run copies: consumers read the current inventory,
and a stale copy is worse than none. Sections, in order:

| Section | Content |
|---|---|
| Libraries | dependency, resolved version, role |
| Token sources | path, format, categories covered, colour notation, canonical or conflicting |
| Components | name, path, origin |
| Theming | selection mechanism, variants |
| Responsive | strategy, breakpoint values |
| Probes | what was looked for and what each probe found |
| Verdict | `reuse`, `extend`, `create`, or `blocked` with its reason |

The file records the commit it was generated from. A consumer that finds the
recorded commit far behind the current head regenerates rather than trusting it.
