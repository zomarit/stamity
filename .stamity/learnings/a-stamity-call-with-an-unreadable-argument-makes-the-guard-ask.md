---
id: a-stamity-call-with-an-unreadable-argument-makes-the-guard-ask
title: a stamity call with an unreadable argument makes the guard ask
date: 2026-11-10
confidence: high
summary: a stamity call with a shell variable or loop variable in its arguments makes the person-only guard ask (autonomy-loosen); the same call with literal arguments runs (probed 2026-11-10)
reviewBy: 2027-02-10
validatedAgainst: "a PreToolUse payload probe of .claude/hooks/stamity/stamity-person-only-guard.mjs on 2026-11-10 at bcf4eeb9, and src/hooks/personOnly.ts:3384-3386"
integrity: sha256:3d4103010f4f8a7fc6690f52fdff6ef8c2c05d0990ae724f9e4963636034577c
---

The person-only guard reads every `stamity` or `node dist/cli.js` call before it runs. An argument it
cannot read might spell `--loosen`, so on such a call it asks a person instead of allowing it
(`autonomy-loosen`, `src/hooks/personOnly.ts:3384-3386`). A shell variable or a loop variable in the
call's arguments is enough. A reversible bookkeeping act, a ledger close for instance, then waits on a
person, and in a run with nobody watching it waits until morning.

## Why

Probed on 2026-11-10 at `bcf4eeb9` by feeding the installed guard
(`.claude/hooks/stamity/stamity-person-only-guard.mjs`) a PreToolUse payload on stdin, which runs
nothing: `for i in 4 5; do node dist/cli.js ledger close --run $R --id $R/prove/$i; done` returned
`permissionDecision: "ask"` with the `autonomy-loosen` reason, and so did `R=<run id>; node dist/cli.js
ledger close --run $R --id $R/prove/4`. The same call with its run id and row id written out returned
no decision, so it runs. The same ask was met in live sessions on 2026-10-25, 2026-10-26 and
2026-11-09, each from a variable or a loop around a ledger call.

Confidence high: reproduced by the probe. Validated against the probe above and
`src/hooks/personOnly.ts` at `bcf4eeb9`. Review horizon: re-check when the guard learns to read a
variable inside a value-taking option.

## How to apply

The calls that pass without an ask carry every run id, row id and path as literal text, one call per
shell line; a value one command prints is written into the next call as text. A new command shape
can be checked the same way before an unattended stretch: fed to the guard as a payload, its
`permissionDecision` shows whether it would ask.
