---
id: typed-unicode-escapes-land-as-raw-code-points
title: typed unicode escapes land as raw code points
date: 2026-09-24
confidence: high
summary: a unicode escape typed into an Edit, Write or Bash call lands as the raw code point (build/103); a doubled backslash lands as two; write such lines by script, then prove them with an rg grep
reviewBy: 2026-12-03
validatedAgainst: "the rg code-point grep over src/runs/ledgerStore.ts before and after 58312346, and od -c reads of escapes typed through Write and Bash on 2026-09-24"
integrity: sha256:0d6f054bd063c22d625fa9dd61d6f2e52e57a7a4d898efd24c0b6c2184125628
---

A `\uXXXX` escape that an agent types into a tool call does not reach the tool as text.
The client decodes it first, so `\u202E` or `\u200B` in an Edit or Write call's new
text, or in a Bash command, lands as the one raw code point: a bidi override or a
zero-width character, invisible in the editor, the diff and the review. A quoted heredoc
does not help, because the decoding happens before the shell sees the text. Doubling the
backslash does not help either: `\\u0041` lands as two backslashes and `u0041`, not as the
escape. In a regex class or a string literal this is the Trojan Source shape. The line
renders reordered in bidi-aware views, and any later tool that normalises invisible
characters silently changes what the code matches.

## Why

Observed on 2026-09-23 in run 2026-09-23_orchestrator-context, ledger row build/103 (the
reviewer's build/105 on the same line, rejected as its duplicate): the fixer of
`ctx-ledger-append` wrote `printableId`'s strip class in `src/runs/ledgerStore.ts:365` with
escapes, and the file received U+200B-U+200F, U+202A-U+202E, U+2060, U+2066-U+2069 and
U+FEFF as raw code points, with the RLO never closed. Both review lenses caught it in round
2; the fix 58312346 respelled the class as escape text. Reproduced on 2026-09-24 while
capturing this learning: a quoted Bash heredoc that wrote this body received raw U+202E and
U+200B for three of its escapes, and the grep below found them (exit 0). A probe the same
day, read back with `od -c`, gave the same result through Write and through Bash: typed
`\u0041` landed as `A`, and typed `\\u0041` landed as both backslashes. The grep below
finds line 365 in `git show 58312346^:src/runs/ledgerStore.ts` and nothing in the fixed
file. The byte-hygiene case in `test/merge/writeEscape.test.ts` ("holds no literal control,
invisible, or bidi code point in src") was widened from `src/merge/` to all of `src/` after
that respell. It now fails on such a byte, but only in `.ts` under `src/`; tests, fixtures,
scripts and corpus files are outside it by design. Review horizon: re-probe on the next
client minor; retire if typed escapes start reaching tools as text, or if a gate covers
every tracked text file.

## How to apply

When a line must carry an escape as text, never type the escape into a tool call. Write
the line with a script that builds the backslash itself (a placeholder replaced with
`chr(92)`), or copy it from a file that already holds it. Then prove the file and read
the exit code (1 means clean):

```sh
rg -n '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}\x{2066}-\x{2069}\x{FEFF}]' <file>
```

ripgrep reads `\x{…}` as a code point, so escape text such as `\u200B` does not match
and only raw characters do. For a file under `src/`, `npx vitest run
test/merge/writeEscape.test.ts` is the backstop. For any other file, the grep is the only
proof.
