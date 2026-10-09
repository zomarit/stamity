---
id: corpus-edits-ship-with-a-dogfood-sync
title: corpus edits ship with a dogfood sync
date: 2026-10-09
confidence: high
summary: a content/<class>/ edit needs npm run build && node dist/cli.js sync in the same change; the local tests miss a stale .claude/.apm copy, CI's Dogfood check (check) goes red
reviewBy: 2026-12-10
validatedAgainst: "npm run build && node dist/cli.js sync, then node dist/cli.js check exit 0; CI Dogfood check red at 51667e43 on two stale copies (run 2026-10-08_product-core)"
integrity: sha256:9a94ec1f3d6eb68ad6e36de3efa99939ff178f44362192dac09d56d6280c8a52
---

Editing a corpus artifact under `content/agents|rules|skills|commands/` is only half the
change: this repository dogfoods its own engine, so the emitted per-client copies of that
artifact (`.claude/agents/…`, `.apm/agents/…`, the generated hooks, `AGENTS.md`, and the
`crossClientGoldens` snapshot) are tracked files that go stale unless `npm run build && node
dist/cli.js sync` (plus `node scripts/generate-apm-package.mjs` and a `vitest -u` on the goldens
where those gates demand it) runs in the same change. No vitest suite reads the emitted
`.claude/` tree, so the local test gate stays green on a stale copy. CI's `Dogfood check` step
(`node dist/cli.js check`, `.github/workflows/ci.yml:411-413`, on every push of a pull request)
does read them: a stale copy turns the `check` legs red, so a change that holds its sync back
for a later commit leaves every push in between red.

## Why

Verified by run 2026-08-31_batch-d11-skill-emission (finding C1): the skill-override emission
change edited `content/agents/stamity-creator.md` but not the tracked copy
`.claude/agents/stamity-creator.md`, which kept the old prose; the full suite was green and only
the reviewer caught it. `npm run build` then `node dist/cli.js sync` regenerated exactly that
file plus the manifest's `updatedAt` and the artifact's `contentHash`.

Observed again on 2026-10-09 in run 2026-10-08_product-core: units were briefed to leave their
copies for a final sync unit, and the push at `51667e43` went red on `check (lts)`,
`check (floor)` and `check (windows-1)`, all at the Dogfood check step, which named two stale
copies (the generated review-gate hook and `AGENTS.md`). The next fix round ran `sync`, committed
every regenerated copy, and `node dist/cli.js check` exited 0. The earlier text of this learning
said no gate reads the copies; the CI step is that gate, though the local test command is not.
Review horizon: revisit if the local gate command gains `check`, or the repo adds a second
configured client (the sync then moves more than one file per artifact).

## How to apply

In this repository a change touching `content/<class>/` lands its sync in the same commit or the
commit right after it, before a push: `npm run build && node dist/cli.js sync`, then `git status`
and `git diff` show the emitted copies and `.stamity/manifest.json` moving, each move explained by
the corpus edit (an unexplained one is a finding). `node dist/cli.js check` exiting 0 is the local
reading of what CI's Dogfood check will say. A red goldens snapshot
(`test/emit/__snapshots__/crossClientGoldens.test.ts.snap`) or apm package test names its own
regeneration command in its failure message.
