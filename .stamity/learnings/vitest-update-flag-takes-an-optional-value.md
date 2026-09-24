---
id: vitest-update-flag-takes-an-optional-value
title: vitest update flag takes an optional value
date: 2026-09-24
confidence: high
summary: "vitest 5's -u is --update [type], an optional value: 'vitest run -u <file>' takes the path as the value and updates snapshots across the whole suite; name files first, --update last"
reviewBy: 2026-12-03
validatedAgainst: "npx vitest --help and the update option in node_modules/vitest/dist/chunks/cac.*.js on vitest 5.0.1, and npx vitest list -u <file> --filesOnly (250 files) against npx vitest list <file> --update --filesOnly (1) on 2026-09-24"
integrity: sha256:c13e52edab8aa82c10142c3923c40528a6f96cab0a5491a1941d775a629d15e0
---

vitest 5 declares its snapshot flag as `-u, --update [type]` — an OPTIONAL value
("accepts boolean, \"new\", \"all\" or \"none\""). The CLI parser therefore takes the next
bare word after `-u` as that value, and a test path written there stops being a file
filter. `npx vitest run -u <file>` runs the WHOLE suite with snapshot updating on, and
`npx vitest run -u <a> <b>` updates under a filter of `<b>` alone. Nothing warns: the run
looks like a targeted update and rewrites every stale snapshot it meets.

## Why

Observed on 2026-09-23 in run 2026-09-23_orchestrator-context, ledger row build/87: the
first batch sync's dispatch said `npx vitest run -u <a> <b>` for the two emission-golden
suites; the first path was consumed, and the runner's one-path retry then ran the whole
suite with `-u`. Only the two intended snapshot files moved, which the runner checked by
hand — luck, not a guard, since any other stale snapshot would have been rewritten
silently. The declaration was read from the installed vitest 5.0.1 (`"vitest": "^5.0.0"`
in `package.json`): `npx vitest --help` prints `-u, --update [type]`, and
`node_modules/vitest/dist/chunks/cac.*.js` declares `update: { shorthand: "u", …,
argument: "[type]" }`, square brackets being the parser's optional-value form (a required
value is `<path>`). Reproduced on 2026-09-24 without writing anything:
`npx vitest list -u test/learnings/store.test.ts --filesOnly` collects all 250 test
files, the same as an unfiltered list, while `npx vitest list test/learnings/store.test.ts
--update --filesOnly` collects one. Review horizon: re-check on the next vitest major, or
if `update` stops taking a value.

## How to apply

A snapshot update names its files first and puts the long flag last:
`npx vitest run <file> <file> --update`. Never write `-u` or `--update` in front of a
path, in a command or in a brief that hands a command to another agent. After any update,
read `git status` and account for every moved `.snap` file before staging; a snapshot
file the change did not target is the sign the filter was lost.
