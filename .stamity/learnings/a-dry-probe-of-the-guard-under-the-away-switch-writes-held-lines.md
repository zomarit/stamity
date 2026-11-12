---
id: a-dry-probe-of-the-guard-under-the-away-switch-writes-held-lines
title: a dry probe of the guard under the away switch writes held lines
date: 2026-11-12
confidence: medium
summary: with the away switch on, command forms handed to the installed person-only guard as a dry probe are written to .stamity/away-held.jsonl as if attempted (seven lines, 2026-11-10)
reviewBy: 2027-02-12
validatedAgainst: 37 PreToolUse payloads handed to the installed guard on 2026-11-10 with the away marker on, .stamity/away-held.jsonl read after it, and REQ-FLOW-166 in docs/specs/everyday-flows.md
integrity: sha256:d24a71bb7705e1092c0b4f5c035c74a3c7066135a346e15fa5d71c3cca49bb16
---

With the away switch on, the person-only guard appends one line to `.stamity/away-held.jsonl` for every
person-only act it stops (REQ-FLOW-166). The guard cannot tell a payload a client sent from one handed to it by
hand, so a dry probe (command forms given to the installed guard as PreToolUse payloads, none of them run) lands on
the held list as if each refused form had been attempted.

## Why

On 2026-11-10 a probe of 37 command forms went to the installed guard at
`.claude/hooks/stamity/stamity-person-only-guard.mjs` while the away marker was on (`stamity away status` read
`away: on`, `source: marker`). Seven lines appeared in `.stamity/away-held.jsonl` within 21 seconds: two
`outside-write`, three `push-default`, two `pr-merge`. No push and no merge was made; the lines were the probe's
own. The write sits in the guard's stop path (`src/hooks/scripts.ts`, the held list beside the away marker), which
runs for every stopped act while the switch is on and has no notion of a probe. `away off` keeps the list, so the
lines stay until a person reads them.

## How to apply

`stamity away status` prints `away: on|off` and the held count; read right before a probe, it says whether the
probe will write. A guard copy placed in a scratch repository under the system's temporary folder, as
`test/hooks/nobodyWatching.test.ts` places one, writes its held lines there and leaves the checkout's list alone.
Lines a probe wrote are told apart by their stamps: they sit seconds apart and match the probed forms one for one.
