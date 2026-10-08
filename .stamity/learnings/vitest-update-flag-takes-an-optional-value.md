---
id: vitest-update-flag-takes-an-optional-value
title: vitest update flag takes an optional value
date: 2026-10-08
confidence: high
summary: "vitest 5's -u is --update [type] and list's --json is [true/path]: a path after either is the flag's value; name files first, the flag last, a list's file as --json=<out>"
reviewBy: 2027-04-08
validatedAgainst: "npx vitest --help and npx vitest list --help on vitest 5.0.3, the update and list json declarations in node_modules/vitest/dist/chunks/cac.*.js, outputJsonFileList in cli-api.*.js, and npx vitest list <file> --filesOnly --json --outputFile <scratch> (no file) against --json=<scratch> (written) on 2026-10-08"
integrity: sha256:5092a5aa5b37c214fcef47f83e3d96c9fb82e443f1d013d5367390837279d752
---

vitest 5 declares its snapshot flag as `-u, --update [type]` — an OPTIONAL value
("accepts boolean, \"new\", \"all\" or \"none\""). The CLI parser therefore takes the next
bare word after `-u` as that value, and a test path written there stops being a file
filter. `npx vitest run -u <file>` runs the WHOLE suite with snapshot updating on, and
`npx vitest run -u <a> <b>` updates under a filter of `<b>` alone. Nothing warns: the run
looks like a targeted update and rewrites every stale snapshot it meets.

`vitest list` has a second optional-value flag of the same shape: `--json [true/path]`
("Print collected tests as JSON or write to a file"). A test path written after it is
taken as the output file, so `npx vitest list --json <test file>` writes the collected
JSON OVER that test file (the list code calls `mkdirSync` and `writeFileSync` on the
value). `--outputFile <filename/-s>` is not the way out for `list`: it takes a required
value and feeds the run reporters, and the list code never reads it, so
`npx vitest list <file> --json --outputFile <out>` prints the JSON to stdout and writes
nothing at `<out>`. A list's file is named in the flag itself: `--json=<out>`.

## Why

Observed on 2026-09-23 in run 2026-09-23_orchestrator-context, ledger row build/87: the
first batch sync's dispatch said `npx vitest run -u <a> <b>` for the two emission-golden
suites; the first path was consumed, and the runner's one-path retry then ran the whole
suite with `-u`. Only the two intended snapshot files moved, which the runner checked by
hand — luck, not a guard, since any other stale snapshot would have been rewritten
silently. The declaration was read from the installed vitest (`"vitest": "^5.0.0"` in
`package.json`): `npx vitest --help` prints `-u, --update [type]`, and
`node_modules/vitest/dist/chunks/cac.*.js` declares `update: { shorthand: "u", …,
argument: "[type]" }`, square brackets being the parser's optional-value form (a required
value is `<path>`). Reproduced on 2026-09-24 without writing anything:
`npx vitest list -u test/learnings/store.test.ts --filesOnly` collects all 250 test
files, the same as an unfiltered list, while `npx vitest list test/learnings/store.test.ts
--update --filesOnly` collects one.

The `list --json` half: during plan 016 file 1's drafting on 2026-10-01 a drafter ran
`npx vitest list --json test/merge/coverageGaps.test.ts` in the main checkout and the test
file was overwritten with JSON (restored from HEAD the same hour; the plan's risk table,
`docs/plans/016-fork-distribution-01.md:2155`). Re-read on 2026-10-08 against the
installed vitest 5.0.3: `npx vitest list --help` prints `--json [true/path]` and
`--outputFile <filename/-s>`; `collectCliOptionsConfig` in
`node_modules/vitest/dist/chunks/cac.*.js` declares `json` with `argument: "[true/path]"`,
and `outputJsonFileList` and `processJsonOutput` in
`node_modules/vitest/dist/chunks/cli-api.*.js` write to `options.json` when it is a string
and print it when it is `true`, with no reference to `outputFile`. Run that day with the
output pointed at a scratch folder: `npx vitest list test/learnings/store.test.ts
--filesOnly --json --outputFile <scratch>/a.json` printed one entry and created no file;
`npx vitest list test/learnings/store.test.ts --filesOnly --json=<scratch>/b.json` wrote
that entry to `b.json`. Review horizon: re-check on the next vitest major, or if `update`
or `list --json` stops taking an optional value.

## How to apply

A snapshot update names its files first and puts the long flag last:
`npx vitest run <file> <file> --update`. A JSON listing names its files first too, and
either ends on a bare `--json` (stdout) or names its output inside the flag:
`npx vitest list <file> --json=<out>.json`. No optional-value flag (`-u`, `--update`,
`--json`) is written in front of a path, in a command or in a brief that hands a command
to another agent. After any update or listing, `git status` accounts for every moved file
before staging; a snapshot or test file the command did not target is the sign a path was
taken as a flag's value.
