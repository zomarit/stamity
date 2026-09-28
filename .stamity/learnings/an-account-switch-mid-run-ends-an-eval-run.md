---
id: an-account-switch-mid-run-ends-an-eval-run
title: an account switch mid-run ends an eval run
date: 2026-09-28
confidence: high
reviewBy: 2026-12-01
validatedAgainst: "run 33's terminal record at call 269 of 617 on 2026-09-27 after a mid-run login switch, and run 34's full re-run of every case from the start"
summary: a login switch changes the client's ambient text, so the route's ambient check ends a running or held eval run (run 33, 2026-09-27); switch accounts only between runs
integrity: sha256:a703e39daf8ca342b208ba14e7950cfff15dd911df988f2235abc19b30a4463e
---

## What happened

On 2026-09-27, run 33 of the eval route of record ended terminal at call 269 of 617. The session had switched the eval configuration folder's login to another account while the run was paused on a capacity hold, then resumed the run. The route's driver checks each call's ambient text (the client's system prompt and reminders) against the first call of the same role in the run. The client's ambient text carries the signed-in account's identity line, so the first call after the switch no longer matched and the driver ended the run as the rule requires. Its admitted samples cannot be composed with a new run, so run 34 re-measured every case from the start.

## Why

A different configuration folder, or the same folder under a different login, is a different ambient configuration. Checking that the new folder is safe is not enough: the check compares within the run, so any change to what the client injects, including the account line, is material.

## How to apply

- Switch accounts, or re-log a configuration folder, only between eval runs, never while one is prepared, running or on hold.
- To move a held run to another account, start a new run on that account instead of resuming.
- Before resuming a held run, confirm that the folder's login is the one the run started with.
