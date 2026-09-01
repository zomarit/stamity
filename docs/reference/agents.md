---
title: Agents
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# Agents

An agent is a role a client spawns for one bounded job. Its `description` is the trigger the spawning side reads to decide whether this role fits the work, so it states the job rather than advertising the role. Authored in `content/agents/`. Each heading is the name the agent is emitted under — the frontmatter `id` behind the `stamity-` filename prefix every non-invocable class carries — so it matches the artifact's filename stem in that directory rather than the bare `id:` line inside it.

10 agents.

### `stamity-creator`

Authors user custom artifacts into .stamity/overrides through the strict save gates.

- **Tags:** `maintenance`
- **Load:** `on-demand`
- **Obsolete when:** user artifact authoring with gated saves is client-native

### `stamity-design-quality`

Reviews rendered surfaces and the flows through them when a component, view, or style file changes, deciding named accessibility success criteria and design-token adherence, and returning graded findings with path:line evidence and no edits.

- **Tags:** `review`
- **Load:** `on-demand`
- **Obsolete when:** target clients decide success-criterion conformance and token adherence on a rendered surface from source alone, at a measured false-positive rate below 10%

### `stamity-fixer`

Applies minimal fixes for the Critical and Warning findings of one review round, answers findings it judges wrong with technical reasoning, and hands the changed-file list back for re-review.

- **Tags:** `implementation`, `review`, `floor:spine`
- **Load:** `on-demand`
- **Obsolete when:** target clients resolve a graded finding list to minimal verified fixes with a disagreement path, without a scope or round contract

### `stamity-implementer`

Builds one planned unit — code plus the tests that prove it — inside the unit's file set, runs the local gates, and returns a structured result with the spec delta.

- **Tags:** `implementation`, `floor:spine`
- **Load:** `on-demand`
- **Obsolete when:** target clients execute a multi-file planned unit with its tests and gate evidence from the plan alone, without a unit contract

### `stamity-performance`

Reviews the cost of a change on data-access, background-work, and cache surfaces against the budgets the repository declared, blocking only on a breached budget and staying advisory otherwise, with path:line evidence and no edits.

- **Tags:** `review`
- **Load:** `on-demand`
- **Obsolete when:** repositories carry machine-readable performance budgets that client tooling measures a diff against without a review pass

### `stamity-researcher`

Answers one written brief against the codebase, project docs, and (at the widest tool tier) the web, returning the named output sections with path:line evidence.

- **Tags:** `planning`, `floor:spine`
- **Load:** `on-demand`
- **Obsolete when:** target clients resolve a multi-question repo brief into cited, sectioned evidence in one pass without a brief schema

### `stamity-reviewer`

Reviews a change set across ten quality lenses and returns a verdict with confidence and graded findings, each behavior claim carrying path:line evidence.

- **Tags:** `review`, `floor:spine`
- **Load:** `on-demand`
- **Obsolete when:** target clients return a graded, evidence-cited multi-lens verdict on a diff whose per-severity catch rate is measured against a recorded seeded-defect baseline and whose dismissal rate holds under the declared 10% per-cycle ceiling

### `stamity-security`

Reviews the security surface of a change set — authentication, authorization, cryptography, trust boundaries, and the dependency set — when a change lands on those paths, returning graded findings with path:line evidence and making no edits.

- **Tags:** `review`, `floor:security`
- **Load:** `on-demand`
- **Obsolete when:** target clients decide resource-level authorization, trust-boundary validation, and dependency advisories on a diff at a measured false-positive rate below 10%

### `stamity-spec-author`

Authors specs, plans, ADRs and docs in the spec format contract; greenfield, brownfield, architect and docs modes.

- **Tags:** `planning`
- **Load:** `on-demand`
- **Obsolete when:** spec authoring to the format contract is client-native

### `stamity-test-runner`

Executes the full verification gate set and returns gate-by-gate structured results with verbatim failure excerpts; never fixes.

- **Tags:** `review`, `implementation`, `floor:spine`
- **Load:** `on-demand`
- **Obsolete when:** clients natively run gates in isolated context and return structured per-gate evidence
