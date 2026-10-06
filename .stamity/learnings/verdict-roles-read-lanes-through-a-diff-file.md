---
id: verdict-roles-read-lanes-through-a-diff-file
title: verdict roles read lanes through a diff file
date: 2026-10-06
confidence: high
summary: "reviewer and lens grants stay in the main checkout: no git -C on a lane, reports only under its .stamity/runs/*/reports/; review uncommitted lane work from a diff file (2026-10-03)"
reviewBy: 2027-03-06
validatedAgainst: "the refused git -C reads and lane report write of the u2 review and the spec-author BLOCKED_DEPENDENCY on 2026-10-03, run 2026-10-03_pack-engine-defects, and src/roster/agentPolicies.ts:135-139 at ee2fe9a5"
integrity: sha256:872e8442c744da3e3fcdbdca19e6c84e8f74ae86e57831a6f8e3a5bc5d187769
---

The grants of the reviewer, the lenses and the spec-author are scoped to the session's own
checkout, not to a worktree lane.
- **Git:** the reviewer may run read-only git, one plain invocation per read
  (`content/agents/stamity-reviewer.md:194-199`). So `git -C <lane> diff` is refused, and work a
  lane holds uncommitted is invisible to it.
- **Reports:** a verdict role may write its report only where
  `.stamity/runs/*/reports/*-<role>-r*.md` matches (`src/roster/agentPolicies.ts:135-139`). That
  is the main checkout's run folder, never the lane's.
- **The spec-author:** it runs no gate and no measurement at all.

A committed range still works from the main checkout, because worktrees share one object store
and `git diff <base>..<head>` resolves there.

## Why

Seen on 2026-10-03 in run `2026-10-03_pack-engine-defects` (its record, lines 127-129 and
279-287):
- The first unit review in a lane had its `git -C` reads and its report write in the lane
  refused, so the result came back inline.
- The docs unit's spec-author returned `BLOCKED_DEPENDENCY`. It could neither measure the token
  figure the page states nor run the docs checks, and a fixer had to do both.

After the change of dispatch described below, every lane review of the run persisted its report.

Validated against: those refusals, the cited grant lines at `ee2fe9a5`, and the reviews that
followed. Review horizon: re-check when the roles' grants change, as they did on 2026-09-30.

## How to apply

For a review of uncommitted lane work:
1. Write the diff into the main checkout's run folder first:
   `git -C <lane> add -N <new files>`, then
   `git -C <lane> diff <base> --output=<main>/.stamity/runs/<run>/reports/<unit>-diff-r<N>.patch`.
   `add -N` makes new files show in the diff.
2. Name that patch in the brief, together with a report path under the same folder.
3. Tell the role to read lane files with its file tools, never with `git -C`.

When a docs unit needs a number measured or a check run, pair the spec-author with a fixer or a
test-runner from the start.
