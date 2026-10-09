---
id: typed-unicode-escapes-land-as-raw-code-points
title: typed unicode escapes land as raw code points
date: 2026-10-09
confidence: high
summary: a unicode escape typed into an Edit, Write or Bash call lands as the raw code point; the proof reads only via /usr/bin/grep or rg by path, after a false calibration
reviewBy: 2027-04-19
validatedAgainst: "od -c reads of escapes typed through Write and Bash on 2026-09-24; on 2026-10-09 a false calibration, then bare rg (no status) against /usr/bin/grep and /opt/homebrew/bin/rg (exit 1) on a no-match"
integrity: sha256:49ef179c0e8f13c6646434df316ef24eb8aa541ed701ea6789233648dafacc17
---

A `\uXXXX` escape that an agent types into a tool call does not reach the tool as text.
The client decodes it first, so a bidi-override or zero-width escape in an Edit or Write
call's new text, or in a Bash command, lands as the one raw code point, invisible in the
editor, the diff and the review. A quoted heredoc does not help, because the decoding happens
before the shell sees the text. Doubling the backslash does not help either: `\\u0041` lands as
two backslashes and `u0041`, not as the escape. In a regex class or a string literal this is the
Trojan Source shape.

The proof step has its own trap in the agents' shell: there, a bare `grep` is a shell function
the client installs (`type grep` names a shell-snapshot file), and a bare `rg` call showed no
exit status on a no-match. Both read as passes when they are not. `/usr/bin/grep` and
`/opt/homebrew/bin/rg`, called by path, return their real status.

## Why

Observed on 2026-09-23 in run 2026-09-23_orchestrator-context, ledger row build/103: the fixer
of `ctx-ledger-append` wrote `printableId`'s strip class in `src/runs/ledgerStore.ts:365` with
escapes, and the file received U+200B-U+200F, U+202A-U+202E, U+2060, U+2066-U+2069 and U+FEFF
as raw code points. Both review lenses caught it; 58312346 respelled the class as escape text.
Reproduced on 2026-09-24 through a quoted Bash heredoc and through Write, read back with `od -c`.
The byte-hygiene case in `test/merge/writeEscape.test.ts` covers `.ts` under `src/` only.

The shell trap: in run 2026-10-08_product-core (ledger rows build/92 and build/59) the bare
`grep` function missed real matches that `/usr/bin/grep` found, and the `rg` proof's exit code
read as unknown. Re-checked on 2026-10-09 after a `false` calibration showed the tool prints a
failing status: a bare `rg` with a pattern absent from the file printed no status, while
`/usr/bin/grep` and `/opt/homebrew/bin/rg` on the same input printed exit code 1. The code-point
class below, run through `/opt/homebrew/bin/rg` over four edited files, printed exit code 1
(clean). Review horizon: re-probe on the next client minor; retire if typed escapes reach tools
as text, or if a gate covers every tracked text file.

## How to apply

A line that must carry an escape as text is written by a script that builds the backslash
itself (a placeholder replaced with `chr(92)`), or copied from a file that already holds it.
The proof that reads cleanly in this shell is the code-point class through a binary called by
its path, after one `false` calibration in the session, with exit code 1 meaning clean:

```sh
/opt/homebrew/bin/rg -a -n '[\x{00}-\x{08}\x{0B}\x{0C}\x{0E}-\x{1F}\x{7F}-\x{9F}\x{AD}\x{61C}\x{180E}\x{200B}-\x{200F}\x{2028}\x{2029}\x{202A}-\x{202E}\x{2060}\x{2066}-\x{2069}\x{FEFF}\x{E0000}-\x{E007F}]' <file>
```

(`command -v rg` gives the path on another machine.) The class is the union of
`isLiteralControlCodePoint` in `test/merge/writeEscape.test.ts` and `UNPRINTABLE_CHARS` with
`UNICODE_TAG_CHARS` in `src/runs/layout.ts`; when either list moves, this class moves with it.
`-a` matters: without it ripgrep treats a file holding a raw NUL as binary and exits 1, which
reads as clean. ripgrep reads `\x{…}` as a code point, so escape text does not match. For a
file under `src/`, `npx vitest run test/merge/writeEscape.test.ts` is the backstop.
