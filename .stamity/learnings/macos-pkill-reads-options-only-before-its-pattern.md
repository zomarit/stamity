---
id: macos-pkill-reads-options-only-before-its-pattern
title: macos pkill reads options only before its pattern
date: 2026-11-10
confidence: high
summary: macOS pgrep and pkill read options only before the pattern, so a later -n or -U becomes one more pattern; a Linux-style pkill on 2026-09-23 signalled every app on the machine
reviewBy: 2027-02-10
validatedAgainst: "list-only pgrep runs on macOS 27.2 on 2026-11-10, options after and before the pattern"
integrity: sha256:30dec98f1560d3975fcb04472b3392efbc93b4127c59867f2feda1d75788be42
---

On macOS (BSD) `pgrep` and `pkill` stop reading options at the first operand, so options written
after the pattern, in the Linux style, become more patterns. `pkill -f <pattern> -U <uid> -n` then
matches every process whose command line holds the pattern, `-U`, the uid or `-n`, instead of only
the newest match, and signals all of them. This repository's lanes and full suites run on macOS
machines (the run lock in `.claude/rules/stamity-maintainer-process.md`, floor 4, is a `lockf`
prefix there), so a Linux habit in an agent's shell lands on the BSD tools.

## Why

Checked on 2026-11-10 on macOS 27.2 with list-only commands that send no signal: `pgrep -f <a string
no process carries> -n` listed 70 processes, because `-n` was read as a pattern, while `pgrep -n -f
<the same string>` listed none. On 2026-09-23 an agent stopping its own hung `cat` with `pkill -f
"cat" -U <uid> -n` signalled every application and terminal tab whose command line held `cat` (any
path under `/Applications`) or `-n`, which ended two unrelated long-running sessions.

Confidence high: reproduced with `pgrep`, which parses its arguments the same way. Validated against
the `pgrep` check above. Review horizon: retire if the lanes stop running on macOS.

## How to apply

A hung command a session started is stopped by its process id, or by the tool's own task stop.
Where a pattern search cannot be avoided, every option goes before the pattern, and `pgrep -lf`
shows the match before anything is signalled.
