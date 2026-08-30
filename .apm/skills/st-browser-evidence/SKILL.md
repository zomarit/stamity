---
description: Drives a real browser against the built artifact and returns the evidence bundle a QA checkpoint cites — spec-derived scenario runs, screenshot diffs, and accessibility scan output. Triggers when a change touches a rendered surface and the checkpoint needs captured evidence, or when someone asks for a screenshot comparison or an accessibility scan of the running app.
name: st-browser-evidence
---

# Browser evidence

A harness, not a gate. It drives a real browser against a built artifact and
returns an evidence bundle that the QA checkpoint and the proof block cite. It
renders no verdict on whether the change is good — the reviewer and the human
checkpoint do that, using what this bundle contains.

## Quick Start

1. Preflight the harness. An absent harness stops the run (Step 1).
2. Derive scenarios from acceptance criteria (Step 2).
3. Run them headless against the built artifact; read failures only (Step 3).
4. Capture screenshot diffs and an accessibility scan (Steps 4-5).
5. Write the bundle and hand back its path (Step 6).

## Step 1 — Preflight

Probe, in order, and record each probe with what it found. Every probe carries
its own disposition, so no probe comes back with a result nobody acts on:

| Probe | Looks for | Absent |
|---|---|---|
| Harness | a browser-automation package in the dependency manifest | stops the run |
| Accessibility scanner | an accessibility-scan package bound to that harness | Step 5 only |
| Serving path | a build command plus a preview or static-serve command | stops the run |
| Browser build | a browser binary the harness can reach | stops the run |
| Surface | a route table, page inventory, or served entry point | no web surface |

A missing harness stops the run: report `BLOCKED_DEPENDENCY` naming the absent
package and the probe that found it absent, then hand the decision back to the
operator. An absent serving path and an absent browser build stop it the same
way, for the same reason: this skill adds no dependency and downloads no browser
— the dependency manifest is the operator's file, and a browser binary changes
the operator's machine. Recommending a package or a binary is fine; acquiring
one is not this skill's authority.

A stopped preflight still writes the bundle. `BLOCKED_DEPENDENCY` is what this
skill returns to the run that spawned it; the bundle is what an operator reads,
so every probe lands in `probes[]`, the one that stopped the run carries
`not-applicable` with what it looked for and where, and the summary names it. A
preflight that stopped without a bundle leaves no record that the run happened.

A missing accessibility scanner degrades one step, not the run: Steps 2-4
continue and Step 5 is recorded as skipped with the probe attached.

An absent surface is the "no web surface" case below, not a blocked dependency.

## Step 2 — Derive scenarios

Scenarios come from the acceptance criteria of the requirements this change
touches, in `docs/specs/` — one scenario per Given/When/Then criterion, each
recording the requirement id it proves. That is what makes a row in the bundle
traceable to the thing it was supposed to show.

Where no spec covers the surface, derive scenarios from the change's stated
observable behaviors and mark each `origin: change-description`. A scenario with
neither origin is not run: an unanchored click-through proves nothing and costs
a browser session to learn it.

Prefer role- and label-based selectors over structural ones. A selector bound to
markup shape breaks on every refactor and reports a defect that is not there.

## Step 3 — Run the scenarios

Run against the built artifact rather than a development server: the build is
what ships, and development servers hide asset-pipeline and dead-code-removal
differences. Run headless.

Read the minimum. On a pass, read the summary count and nothing else. On a
failure, read the failing excerpt — the assertion, the selector, and the
observed value. Reporter dumps, traces, and console logs stay on disk and enter
the bundle as paths, so a passing run costs a handful of lines of context.

## Step 4 — Screenshot diffs

Compare against committed baselines rather than describing images. Record the
changed-pixel ratio per comparison and open a diff image only where the ratio
crosses the repo's tolerance — and then only the failing one.

Mask regions that move on their own: timestamps, identifiers, avatars,
animation frames. An unmasked clock produces a diff on every run and trains the
next reader to look past real ones.

Baselines are updated only on an explicit operator instruction, in the same
change as the visual difference they record. A silently refreshed baseline turns
a regression into a pass.

## Step 5 — Accessibility scan

Scan each surface in the run with the detected scanner and record, per surface:
the rule set applied, the count of serious and critical findings, and the path
to the full results. Report the counts; the axis reference that owns
accessibility thresholds decides what they mean.

An automated scan covers part of the accessibility surface. Keyboard-only
traversal and screen-reader passes stay in the human QA rows, and the bundle
says so rather than implying full coverage.

## Step 6 — Bundle and hand back

Write the bundle, return its path plus a one-line summary, and stop. Interpreting
the bundle belongs to the QA checkpoint and the reviewer.

## When there is no web surface

A repo with no runnable web surface reports `not-applicable` and lists every
probe from Step 1 with what it found: no build or preview command, no route or
page inventory, no served entry point. The bundle is still written — an absent
surface is a recorded outcome, not a blank.

Never describe a screenshot that was not captured, a scenario that was not run,
or a violation count that was not measured. Every row in the bundle points at a
file on disk; a row with no artifact path is deleted rather than narrated.

## Output artifact

One bundle per run at `.stamity/evidence/browser-<sha>.json`, where `<sha>` is
the short HEAD sha with a `-dirty` suffix on an unclean worktree. Fields:

| Field | Value |
|---|---|
| `sha`, `timestamp` | run identity; ISO-8601 UTC start |
| `target` | what was driven — build command, served address, viewport |
| `harness` | package name and version, plus the browser build identifier |
| `scenarios[]` | `id`, `requirement`, `origin`, `status`, `evidence` path |
| `screenshots[]` | baseline, candidate, diff paths, changed-pixel ratio, opened |
| `accessibility` | per surface: scanner, rule set, serious and critical counts, results path |
| `probes[]` | every Step 1 probe with its result, so an absent surface is auditable |
| `summary` | one line, plus the QA rows this bundle can prove |

`status` is `pass`, `fail`, `skipped`, or `not-applicable` — the same four words
the rest of the corpus uses, so a QA row and a bundle row read alike. The QA
checkpoint reads this file; the proof block cites its path. Two runs on one sha
overwrite the same path.
