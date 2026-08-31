---
id: corpus-edits-ship-with-a-dogfood-sync
title: corpus edits ship with a dogfood sync
date: 2026-08-31
confidence: high
summary: a change under content/<class>/ must run npm run build && node dist/cli.js sync so the tracked emitted .claude/.apm copies regenerate — no gate reads them, so a stale dogfood copy passes green
integrity: sha256:8fedc7507824d2d446dd0f18635c1357b5a22cd6967a44d39b8e5118c1b5a9ee
---

Editing a corpus artifact under `content/agents|rules|skills|commands/` is only half
the change: this repository dogfoods its own engine, so the *emitted* per-client copies
of that artifact (`.claude/agents/…`, `.apm/agents/…`, and the `crossClientGoldens`
snapshot) are tracked files that go stale unless `npm run build && node dist/cli.js sync`
(plus `node scripts/generate-apm-package.mjs` and a `vitest -u` on the goldens where those
gates demand it) is run in the same change. No test reads the emitted `.claude/agents/`
tree, so a stale dogfood copy passes every gate green while shipping the old prose to any
agent that loads the artifact from its client location.

## Why

Verified by run 2026-08-31_batch-d11-skill-emission (finding C1): the skill-override
emission change edited `content/agents/stamity-creator.md` and its test-demanded
derivations, but not the tracked emitted copy `.claude/agents/stamity-creator.md`, which
kept the pre-change "a skill is indexed but not projected" prose. The full suite was green
— `test/corpus/commands/lightTrio.test.ts` reads the corpus source, not the emitted copy —
so only the reviewer caught it. The fix was the repo's own mechanism: `npm run build`
then `node dist/cli.js sync` regenerated exactly the one stale file plus the manifest's
`updatedAt` and that artifact's `contentHash`; on this single-client repo (`tools:
["claude"]`) nothing else moved. Re-applied cleanly in D12 with the same edit shipping its
sync. Review horizon: revisit if a test is ever added that regenerates-and-diffs the
emitted client trees (then the gate is the better home and this learning retires), or if
the repo adds a second configured client (the sync then moves more than one file).

## How to apply

Any change touching a file under `content/<class>/` runs `npm run build && node dist/cli.js
sync` before the gates, then reads `git status`/`git diff`: the emitted `.claude/…` (and
`.apm/…`) copies and `.stamity/manifest.json` should move, and every moved file should be
explained by this change's corpus edit — a diff you cannot explain is a finding, not
something to commit. If the goldens snapshot (`test/emit/__snapshots__/crossClientGoldens.
test.ts.snap`) or the apm package test goes red, its own failure message names the
regeneration command; run it, read the diff, confirm it is only your artifact's dialects.
