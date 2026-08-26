---
id: verify
type: skill
description: "Runs one content-quality axis as a gate — that axis's runnable checks plus its judgment calls for ui, ux, security, reliability, testability, scalability, performance, maintainability, enhancability or product-spec — and writes .stamity/verify/<axis>-<sha>.json. Triggers when one axis needs evidence before a review or a release, when a consumer finds no artifact for the current sha, or when someone asks how a change scores on a single quality axis."
tags: [review]
load: on-demand
obsolete_when: per-axis quality gating with machine-readable results is client-native
---

# Verify

One axis per run: the axis selects the checks, every check carries its own
evidence, and the run ends in exactly one artifact.

## Quick Start

1. Name the axis — `verify axis=security`. Ten axes exist; one run takes one.
2. Read that axis's reference, and only that one (Axis dispatch).
3. Work the run contract in order, then write the artifact.

An invocation with no axis does not run: ask which axis, offering the caller's
evidence need as the default. A ten-axis sweep is ten runs and ten artifacts,
not one merged pass.

## Axis dispatch

Ungated reference reads are this skill's largest token sink, so every row states
the gate that opens it.

| Axis | Reference | Read gate |
|---|---|---|
| ui | `references/ui.md` | read when axis=ui |
| ux | `references/ux.md` | read when axis=ux |
| security | `references/security.md` | read when axis=security |
| reliability | `references/reliability.md` | read when axis=reliability |
| testability | `references/testability.md` | read when axis=testability |
| scalability | `references/scalability.md` | read when axis=scalability |
| performance | `references/performance.md` | read when axis=performance |
| maintainability | `references/maintainability.md` | read when axis=maintainability |
| enhancability | `references/enhancability.md` | read when axis=enhancability |
| product-spec | `references/product-spec.md` | read when axis=product-spec |

A reference is not standalone — each declares `load: reference` and holds one
axis's checks. Opened outside this dispatch it carries no run contract, no
artifact schema, and no status vocabulary: those live here, once.

## Run contract

1. **Detect.** Mark every check in the axis reference applicable or not, from
   facts in the tree — a committed lockfile, a route table, a component root, a
   declared budget. A check whose subject is absent is `not-applicable`, and the
   detection fact that decided it is its evidence. An assumption about the stack
   is not a detection fact.
2. **Run.** Execute each applicable `runnable` check. Where a check names a tool
   this repo does not have, it is `skipped` with the probe recorded — what was
   looked for, where. A missing tool downgrades one check; it never promotes the
   axis to pass.
3. **Judge.** Decide each applicable `judgment` check and attach file:line
   evidence to the verdict. A judgment with no evidence is not a verdict: record
   it `skipped`, reason "no evidence reachable".
4. **Write ONE artifact.** One file per axis per commit, at the path below. The
   findings live in the artifact; the reply to the caller is its summary.

## Artifact

Path: `.stamity/verify/<axis>-<sha>.json`, where `<sha>` is the short HEAD sha.
A worktree with uncommitted changes at run start appends `-dirty`
(`.stamity/verify/security-a1b2c3d-dirty.json`), so a working-tree result is
never read as a committed one.

| Field | Value |
|---|---|
| `axis` | the axis this run took — one of the ten dispatch rows |
| `sha` | short HEAD sha, `-dirty` suffixed on an unclean worktree |
| `timestamp` | run start, ISO-8601 UTC |
| `checks[]` | one row per check considered: `id`, `kind`, `status`, `evidence` |
| `summary` | counts per status, plus a one-sentence verdict |

- `kind` — `runnable` or `judgment`, matching the reference's two sections.
- `status` — `pass`, `fail`, `skipped`, or `not-applicable`.
- `evidence` — file:line, a command-output excerpt, or the detection fact behind
  a `skipped` / `not-applicable` row. Never empty.

### Honesty rule

Every check in the axis reference appears in `checks[]` on every run. A check
that cannot run on this stack is reported `skipped` or `not-applicable` with its
probe; dropping the row would report a clean axis that was never examined.

Absence of applicable checks is itself a verdict: an axis with nothing to run
still writes the artifact, every row `not-applicable`, and the summary names the
stack facts that made it so — the ui axis against a repo with no user surface is
a recorded outcome, not a blank.

Re-running an axis on the same sha overwrites the same path. The key is
`<axis>-<sha>`, so a re-run replaces its predecessor instead of accumulating
near-duplicate artifacts; a new commit is a new artifact.

## Consumers

Two seams carry different things. The **reference seam** is a read: the reviewer
and the specialist agents open one axis reference for its criteria and cite its
rows by check id, with no artifact involved. For every other consumer the path
is the seam — they read `.stamity/verify/<axis>-<sha>.json` and bind to its
fields, not to this body's wording:

- **Reviewer and specialist rubrics** — the reference seam. They load the axis
  behind a finding class and cite its rows by check id.
- **The qa skill's auto-prove pass**, at the QA checkpoint — matches an artifact
  that already exists against the walk-through row restating the same criterion,
  and moves that row to the appendix with the artifact as its pointer.
- **Installed packs** — the product-audit pack (`product-audit`, `benchmark`,
  `perf-audit`) reads the rows as finding evidence; the scaffold pack
  (`auth-scaffold`, `design-system-create`, `slo-scaffold`) reads them as the
  floor its generated code is graded against. A pack whose own steps name this
  skill runs it for the axis when the current sha has no artifact; there, an
  absent or stale artifact is a refresh trigger, not a pass. A pack that reads
  without refreshing reports the artifact as absent instead of substituting a
  threshold of its own. On neither route does a missing artifact read as a pass.
- **Manual invocation** — a human takes one axis before a release or after a
  subsystem lands, and reads the summary.

No consumer treats an artifact as a gate of its own: it records what one axis
found, and what that costs is the consumer's call. A consumer that parses this
prose instead of the artifact is coupled to wording; the fields above are the
contract.
