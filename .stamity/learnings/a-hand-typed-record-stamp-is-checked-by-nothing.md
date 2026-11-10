---
id: a-hand-typed-record-stamp-is-checked-by-nothing
title: a hand-typed record stamp is checked by nothing
date: 2026-11-10
confidence: medium
summary: the run and ledger verbs take the stamps they write from the clock, but a stamp typed by hand into a run record is checked by nothing; five typed stamps were wrong in October 2026
reviewBy: 2027-02-10
validatedAgainst: "src/cli/commands/run.ts:1847 and :3033, src/cli/commands/ledger.ts:596, src/runs/ledgerStore.ts:942-943 and src/runs/morning.ts:222 on the tree CI run 42730516873 tested (PR #138); a person-only guard probe on 2026-11-10"
integrity: sha256:eb27c287ef72d77dd5784093721031e22a084811b8fc675ffa15b5de0caa6c64
---

The run and ledger verbs take the stamps they write from the clock: the run verb's review-request
notice in a run's `record.md` (`src/cli/commands/run.ts:1847`, `new Date()`) and its run-ended marker
(`:3033`, `ctx.app.runtime.clock`), and the ledger's one dated field, a retired row's day
(`src/cli/commands/ledger.ts:596` hands the same clock to `retireRow`, which writes the day at
`src/runs/ledgerStore.ts:942-943`). A line a session appends by hand to a run's `record.md` or to a
report carries whatever time was typed, and nothing in `src/runs/` or the run verbs compares a
hand-written stamp with the clock or with the line before it. A stamp estimated from memory
therefore lands as fact, and a later reader takes it as the order things happened in.

## Why

Observed in October 2026: five stamps across two sessions' run records were typed before the clock
was read, were wrong, and each needed a correcting line. Read on the tree CI run `42730516873` tested (PR #138): a search of `src/runs/`
and the run and ledger commands for an order or clock check on record stamps finds only the morning
list's section order (`src/runs/morning.ts:222`). A guard probe on 2026-11-10 showed that a line which
reads `date -u` into a variable and appends it in the same command runs without an ask.

Confidence medium: the slips were observed, and the absence of a check is read from the source.
Validated against those files on the tree CI run `42730516873` tested (PR #138). Review horizon: retire when record lines are written
only by a verb.

## How to apply

A stamp that holds comes from the clock in the same step that writes it: `date -u
+%Y-%m-%dT%H:%MZ` read inside the command that appends the line, or a small script that reads the
clock and writes. A time copied from earlier in the session, or typed from an estimate, is the shape
that slipped.
