---
id: a-dry-probe-of-the-guard-under-the-away-switch-writes-held-lines
title: a dry probe of the guard under the away switch writes held lines
date: 2026-11-12
confidence: medium
summary: with the away switch on, the ask-class forms of a dry probe of the installed person-only guard are written to .stamity/away-held.jsonl as if attempted (seven of 37 forms, 2026-11-10)
reviewBy: 2027-02-12
validatedAgainst: 37 PreToolUse payloads handed to the installed guard on 2026-11-10 with the away marker on, .stamity/away-held.jsonl read after it, and REQ-FLOW-166 in docs/specs/everyday-flows.md
integrity: sha256:731fb03e6fd5b85737bd2a4a7acfdc6a34dc4367a176edfbc0cec98459a9c968
---

While the away switch is on, the person-only guard refuses a call that would have reached the person's ask, and
the main thread's remote write, and appends one line for it to `.stamity/away-held.jsonl` (REQ-FLOW-166). The guard
cannot tell a payload a client sent from one handed to it by hand, so the ask-class forms of a dry probe (command
forms given to the installed guard as PreToolUse payloads, none of them run) land on the held list as if each had
been attempted. A form the guard lets run writes nothing, and a form it refuses outright stays a plain refusal.

## Why

On 2026-11-10 a probe of 37 command forms went to the installed guard at
`.claude/hooks/stamity/stamity-person-only-guard.mjs` while the away marker was on (`stamity away status` read
`away: on`, `source: marker`). Seven lines appeared in `.stamity/away-held.jsonl` within 21 seconds: two
`outside-write`, three `push-default`, two `pr-merge`, the probe's seven ask-class forms. Its other thirty forms,
which the guard let run, wrote nothing. No push and no merge was made; the lines were the probe's own. The write
sits where the guard turns an ask into a held refusal (`nobodyWatching` and `heldForMorning` in
`src/hooks/scripts.ts`), and that path has no notion of a probe. `away off` keeps the list, so the lines are still
on it after the switch goes off.

## How to apply

`stamity away status` prints `away: on|off` and the held count; read right before a probe, it says whether the
probe's ask-class forms will be written. A guard copy placed in a scratch repository under the system's temporary
folder, as `test/hooks/nobodyWatching.test.ts` places one, writes its held lines there and leaves the checkout's
list alone. Lines a probe wrote are told apart by their stamps: they sit seconds apart and match the probed
ask-class forms one for one.
