---
id: a-plan-naming-a-new-spec-commits-its-skeleton
title: a plan naming a new spec commits its skeleton
date: 2026-09-30
confidence: high
reviewBy: 2027-04-29
validatedAgainst: "npx vitest run test/records/specStatus.test.ts in a scratch copy of b28d6a6b with a probe plan naming a missing docs/specs/ path, then a skeleton without and with status: design, 2026-09-30"
summary: "a plan naming a new docs/specs/ path turns test/records/specStatus.test.ts red until the same commit carries the spec skeleton with status: design (probed 2026-09-30)"
integrity: sha256:35b783501650d1b6954e8a3da886fc751c8d157700e61370e833abf463f70bbc
---

`test/records/specStatus.test.ts` reads every plan under `docs/plans/` and treats each
`docs/specs/<name>.md` path in its prose as a reference. A plan that names a spec the tree does
not yet carry turns the suite red on "names no spec file the tree does not carry", with the
message `<plan> names docs/specs/<name>.md, which is not in the tree`. The same file then holds
every spec to a frontmatter `status` from the vocabulary `design | shipped |
shipped-with-<major>.<minor>.<patch>`, so a skeleton with no frontmatter fails the next case,
"holds every spec's status to the declared vocabulary". The commit that lands a plan naming a
new spec therefore also lands that spec's skeleton: a frontmatter head with `status: design` and
the requirement headings the plan cites.

The ordering is what makes it surprising. The flow writes the plan before the spec exists (the
spec author applies a plan's delta later), and a plan is prose, so nothing about writing it looks
like a gate. The test's own note (`specStatus.test.ts`, the `SPEC_REFERENCE` comment) records
that only the repo-relative path form counts: a bare backticked `<name>.md` is not a reference,
which is an evasion of the check, not a fix for it.

## Why

Verified on 2026-09-30 in a scratch copy of the tree at b28d6a6b, with one probe plan
`docs/plans/999-probe.md` naming `docs/specs/probe-new-thing.md`:
`npx vitest run test/records/specStatus.test.ts` failed 1 of 10 on the dangling-reference case;
with a skeleton carrying no frontmatter it failed 1 of 10 on the vocabulary case ("carries no
frontmatter `status`"); with `status: design` in the head it passed (9 passed, 1 skipped: the
shipped-spec case needs release tags, which that copy had no git history for). A `design` spec
named by an unshipped plan is not a problem for the shipped-spec case, which fires only once the
plan's `stamp:` commit is an ancestor of the newest `v*` tag. Since 4589ace1 that case also reads
the requirement ids the spec defines: a `design` spec named by a shipped plan passes while it
defines ids and no file under `test/` cites one. The same headings are what
`content/skills/st-verify/scripts/spec-plan-coverage.mjs` reads as definitions when a plan's
requirement ids are checked against the spec. Review horizon:
retire this if the gate starts accepting a forward reference (a plan naming a spec it will
create), or if plans stop naming spec paths.

## How to apply

A plan unit that introduces a `docs/specs/` file lists that file in its own `files` cell, and
the plan's commit carries the skeleton (`status: design` plus the requirement headings), so the
spec author later fills a file that already passes the gate. A red "names no spec file the tree
does not carry" on a plan-only commit reads as this ordering, not as a mistyped path, when the
plan names a spec that is meant to be new.
