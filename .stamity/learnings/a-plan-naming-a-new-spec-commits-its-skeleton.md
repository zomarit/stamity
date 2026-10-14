---
id: a-plan-naming-a-new-spec-commits-its-skeleton
title: a plan naming a new spec commits its skeleton
date: 2026-09-30
confidence: high
reviewBy: 2027-04-29
validatedAgainst: "npx vitest run test/records/specStatus.test.ts in a scratch copy of b28d6a6b with a probe plan naming a missing docs/specs/ path, then a skeleton without and with status: design, 2026-09-30"
summary: "a records-branch plan naming a docs/specs/ path main lacks turns npm run test:records red (records push, main CI, release); merge the status: design skeleton to main first"
integrity: sha256:061bac70cbb129ce845ec0c89e7ecbc8f5eeacac4cb5680914bd04f6af078c97
---

`test/records/specStatus.test.ts` reads every plan under `docs/plans/` and treats each
`docs/specs/<name>.md` path in its prose as a reference. Its case "names no spec file the tree
does not carry" fails with `<plan> names docs/specs/<name>.md, which is not in the tree` when the
checkout's `docs/specs/` lacks one. The plans are records and live on the `records` branch; the
specs live on `main`. The file runs only in the records suite, `npm run test:records`
(`vitest.records.config.ts`, whose global setup fails the run until `node scripts/records.mjs
restore` has written the records into the checkout); `npm test` excludes `test/records/`.

Three places run that suite, each over a records commit and a `main`-side tree:
- `node scripts/records.mjs commit` runs it in the local checkout before it pushes a records
  commit (`defaultGates` in `scripts/records.mjs`), so it reads whatever `docs/specs/` that
  checkout holds.
- `.github/workflows/records.yml`, which lives only on the `records` branch, runs on every push
  to `records`: it checks out `main`'s tip, restores the pushed records commit and runs the suite.
- `ci.yml`'s `records` job runs on every trigger of `main`'s CI, pull requests included: it
  restores `origin/records` into the commit under test and runs the suite, and `all-ci-checks`
  requires it. `release.yml` runs the suite again before a release.

So a plan published to `records` that names a spec `main` does not carry yet turns the records
push red, and every `main` pull request whose tree lacks the spec, until the spec lands on `main`.
The local `commit` gate misses that ordering when the checkout is a branch already holding the
skeleton: it passes there, while the records workflow, reading `main`'s tip, goes red. What keeps
every run green is the spec skeleton merged to `main` before the plan is published to `records`:
a frontmatter head with `status: design` and the requirement headings the plan cites. The status
is held on `main` itself: the case "holds every spec's status to the declared vocabulary" in
`test/authoring/specStatusRules.test.ts` reads `docs/specs/` alone, runs in `npm test`, and fails
a skeleton with no frontmatter `status` from `design | shipped |
shipped-with-<major>.<minor>.<patch>`.

The ordering is what makes it surprising. The flow writes the plan before the spec exists (the
spec author applies a plan's delta later), and a plan is prose, so nothing about writing it looks
like a gate. The comment on `SPEC_REFERENCE` in `test/support/specStatusRules.ts` records that
only the repo-relative path form counts: a bare backticked `<name>.md` is not a reference, which
is an evasion of the check, not a fix for it.

## Why

Verified on 2026-09-30 in a scratch copy of the tree at b28d6a6b, when plans and specs both lived
on `main` and one file held both cases, with one probe plan `docs/plans/999-probe.md` naming
`docs/specs/probe-new-thing.md`:
`npx vitest run test/records/specStatus.test.ts` failed 1 of 10 on the dangling-reference case;
with a skeleton carrying no frontmatter it failed 1 of 10 on the vocabulary case ("carries no
frontmatter `status`"); with `status: design` in the head it passed (9 passed, 1 skipped: the
shipped-spec case needs release tags, which that copy had no git history for).

Re-probed on 2026-10-14 in a scratch copy of `114aa996` with the records of `origin/records` at
`a5bb07f3` written in (no git history, so the shipped-spec case skipped itself). The same probe
plan made `vitest run --config vitest.records.config.ts test/records/specStatus.test.ts` fail 1 of
3 with `docs/plans/999-probe.md names docs/specs/probe-new-thing.md, which is not in the tree`. A
skeleton with no frontmatter passed that file (2 passed, 1 skipped) and failed the vocabulary case
of `test/authoring/specStatusRules.test.ts` on "carries no frontmatter `status`". With
`status: design` both passed. The three runners were read at `114aa996`, `records.yml` at
`a5bb07f3`; no records push or CI run was made for the probe.

A `design` spec named by an unshipped plan is not a problem for the shipped-spec case, which fires
only once the plan's `stamp:` commit is an ancestor of the newest `v*` tag. Since ee2a0e3d that
case also reads the requirement ids the spec defines: a `design` spec named by a shipped plan
passes while it defines ids and no file under `test/` cites one. The same headings are what
`content/skills/st-verify/scripts/spec-plan-coverage.mjs` reads as definitions when a plan's
requirement ids are checked against the spec. Review horizon: retire this if the gate starts
accepting a forward reference (a plan naming a spec it will create), or if plans stop naming
spec paths; re-check if plans or specs change branch again.

## How to apply

A plan unit that introduces a `docs/specs/` file lists that file in its own `files` cell. The
skeleton (`status: design` plus the requirement headings) reaches `main` first, through its own
pull request, and the plan is published to `records` (`node scripts/records.mjs commit`) only
after that merge, so the spec author later fills a file that already passes both gates. A red
"names no spec file the tree does not carry" on a records push or a `main` pull request reads as
this ordering, not as a mistyped path, when the plan names a spec that is meant to be new.
