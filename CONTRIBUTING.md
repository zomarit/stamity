<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.16.0 release cut (2026-10-20). -->
<!-- Re-open when: a step joins or leaves `npm run check`, a generated artifact class gains or loses a
     regeneration command, either Node floor moves, a test lane joins or leaves, a coverage floor in
     `vitest.config.ts` moves, a type-only dependency exception joins or leaves `knip.json`, or the
     eval set's version bumps — the `evals/` paths below carry that version in their own names.
     `test/docsPages.test.ts` asserts the contributor-gate command, the leak-gate row, four
     regeneration commands, the proven-push reader and the CI lane names; `test/ci/workflow.test.ts`
     asserts the two required status contexts. -->

# Contributing

This page is for a contributor making a change to stamity. When you finish it you can run the
contributor gate CI runs, regenerate the files you must not hand-edit, and open a pull request the
two required checks accept.

## Run the contributor gate

```sh
npm install
npm run check
```

`npm run check` runs six steps, in this order. Every one exits 0 before you commit.

| Step | Command | What it proves |
|---|---|---|
| Leak gate | `npm run gate` | `scripts/leak-gate.mjs` finds no reserved name, credential shape, private-layer reference or email address in any scanned path or file |
| Typecheck | `npm run typecheck` | TypeScript 7, strict: zero errors across `src/`, `test/` and the root `*.config.ts` files |
| Lint | `npm run lint` | oxlint over the TypeScript surface, ESLint over the JavaScript surface |
| Test | `npm run test` | The whole suite, all three lanes |
| Build | `npm run build` | tsdown produces `dist/cli.js`, `dist/index.js` and their shared chunk `dist/src.js`, plus the declarations under `dist/types/` |
| Unused code | `npm run knip` | No orphan file, export or dependency |

CI runs the same six steps on your pull request, with one difference in the test step. `npm run test`
is `vitest run`, with no coverage instrument, so `npm run check` never evaluates the coverage floors
in `vitest.config.ts`. CI's floor and LTS legs run the suite as
`node scripts/ci/test-run.mjs --coverage`, where those floors block. A green `npm run check` can
therefore still fail CI on coverage: run that command yourself when your change touches the merge or
emit core or `src/manifest/ownedPaths.ts`.

Two declared dependencies exist for their types alone. `@sigstore/rekor-types` and
`@types/make-fetch-happen` complete the declaration graph that Sigstore's own published types
reference. No file under `src/` imports either one, so `knip.json` lists both under
`ignoreDependencies`. That exception records transitive type use, not unused runtime code. The
packed-consumer gate is what holds the graph honest. The tarball smoke below compiles a TypeScript
consumer outside this checkout, against the packed declarations, with `skipLibCheck: false`
(`scripts/tarball-smoke.mjs`). A declaration the package fails to ship, or a type it cannot resolve,
fails there instead of in someone's project.

## What you need installed

One Node floor binds the package and its suite, and `package.json` declares it: `>=22.22.2`. That
is what the CLI needs and what a consumer of the published package is held to. Develop on 22.22.2
or on 24. `test/ci/engines.test.ts` holds the floor against the runtime half of the lockfile.

The engines field moves for the runtime graph only, never to match a dev tool. Raising it for a
dev-only requirement would narrow who can install the published package, for a reason that applies
to this repository alone. The docs site under `website/` is a separate npm project and declares its
own floor, `>=22.12` in `website/package.json`.

The suite also needs a `git` binary on `PATH`, because the fixture lanes spawn it. On POSIX hosts,
one workspace case needs `mkfifo`. That case is `test/cli/commands/workspace.test.ts`, and it is
skipped on Windows. Nothing is installed globally, and no network service is contacted.

## Who reviews your pull request

Pull requests are welcome. The bar is the contributor gate above, not a reviewer's mood.

One person maintains this repository, and the branch protection says so candidly:
**0 required approvals**. A rubber-stamp approval from the only maintainer would add a click and no
scrutiny. So the review that counts is mechanical: that gate, plus a read.

External pull requests get that read through the product's own review command, `/st-pr-resolve`.
The setup this repository generates is the setup used to review changes to it. If that command
reviews your pull request badly, say so in the thread. A weak review is a defect in the corpus, and
it gets fixed there rather than worked around.

[GOVERNANCE.md](GOVERNANCE.md) is where the decision model and the landing rules live. This page
covers the mechanics.

## What CI proves

Two required status contexts gate a merge.

`all-ci-checks` (`.github/workflows/ci.yml`) runs on every event. A full run passes when the check
matrix and the `cloud-container` job both pass. The matrix has four legs: the declared Node floor,
the LTS canonical, and Windows in two shards that split the test suite between them. Beside the six
steps you already ran, it adds four things:

- A generate-and-diff self-consistency step over every generated artifact class.
- The dogfood check, `node dist/cli.js check`, which re-proves this repository's own generated setup
  drift-clean against the binary the job just built. It and the leak gate run on every leg but the
  second Windows shard, so on Windows on the first shard only.
- A tarball smoke on the floor leg: pack the package, install it into a throwaway project, then run
  it. The published shape is a different tree from the repository, and this is the only gate that
  reads it.
- A repository hygiene scan on pull requests. It rejects tracked runtime files, new raw evidence,
  and growth past the file budgets.

The `cloud-container` job runs beside the matrix, on the same side of the split. It imitates a cloud
agent's machine: `scripts/ci/cloud-leg.mjs` builds the tree on the runner, then runs `test/cloud/` in
a Linux container (`node:24-bookworm`, pinned by digest) with no client account four times, once per
cloud profile (Claude Code's and Cursor's with an empty home folder, Copilot's with `/root`) and once
more with no network, and a failing step names its profile. The suite drives every hook command
`init` emits from the repository root and from below it, with `node` on PATH and without it.

A change whose every path falls in a lane takes the `lanes` job instead of the check matrix and the
`cloud-container` job.
`node scripts/ci/records-only.mjs` decides; its name is older than its three lanes. The lanes, the
engine's `.gitkeep` excepted at every location:

- `specs`: the spec under `docs/specs/`.
- `learnings`: `.stamity/learnings/`.
- `website`: `website/` and every other path under `docs/`.

A record is a path the `records` branch holds instead of `main`, as `scripts/records-paths.mjs`
lists them: run records under `.stamity/runs/`, `.stamity/inbox.md`, handoffs under
`.stamity/handoffs/`, evidence under `.stamity/evidence/`, plans under `docs/plans/`, and the eval
runs, measurements and reach snapshots under `evals/runs/`, `evals/measurements/` and
`evals/reach/`, with two archive notes beside them in `evals/`. No record is tracked on `main`, so
no record is in a lane; "Keep the records" below says how one reaches the `records` branch, and the
`records` job checks them there. It runs on every change, beside
whichever side ran, in this repository only, and it is merge-blocking here. It runs
`node scripts/records.mjs guard`, which refuses a record tracked on the commit, restores the records
from `origin/records` with `node scripts/records.mjs restore`, and then runs `npm run test:records`,
the leak gate over a worktree of that branch, and the measurements page's drift check. A fork has
no records branch, so there the job is skipped.

The job runs the suites that read the lanes the change fell in, the generate-and-diff step, the
leak gate and, on pull requests, the hygiene scan. Those suites come from the test-input map, the
`testInputs` list in `.stamity/change-classes.json`, read from the base commit and never from the
change itself: the union of the `tests` of every entry a changed path matches. A test you add that
names a tracked page or record in a string literal is a reader of it and belongs in that map:
`test/ci/testInputsGuard.test.ts` fails until an entry matching the path lists the test. The
`learnings` lane adds the CLI build and its
dogfood `check`, because the session hook reads the learnings. The `website` lane adds the docs site
build and the root typecheck, because a test imports a `website/` module. Any path in no lane, an
empty diff, a push with no earlier commit to compare, a diff the script cannot read, the weekly
schedule and a manual run get the full check matrix. So does a change the map cannot answer, though
every path of it is in a lane: no valid map at the base commit, a changed path no entry matches, or
a matching entry that says `"all"`. On that side the LTS leg also builds the docs
site, last, when the change touches a `website` path or no diff was read.

A push to `main` can skip both sides. `node scripts/ci/pr-proven.mjs` reads whether the pushed
commit's tree is the head tree of a pull request whose latest `ci.yml` pull-request run passed
`all-ci-checks`. When it is, the check matrix, the `cloud-container` job and the `lanes` job all
skip: that tree was already proven; the `records` job still runs. Only `ci.yml`'s own run counts as evidence. A failed or unclear read
answers not proven rather than failing a job, so the push runs the `lanes` job or the full side, as
`records-only.mjs` decides for its diff. The skip reaches only `ci.yml`:
`pack-signing-rehearsal.yml` and `docs-site.yml` still run on a push whose paths match their own
filters. `all-ci-checks` asserts which of the three shapes ran, a proven push, the `lanes` job or
the full side, so neither short answer reads as a full pass. It also asserts the `records` job:
passed in this repository, skipped in a fork.

`all-pr-checks` (`.github/workflows/pr-checks.yml`) runs on pull requests only. It carries the three
gates only a pull request can be asked. They are the DCO trailer on every commit, the
conventional-commit title, and the dual size budget over the built `dist/`. Bundled logic is capped
at 2.375 MiB and the staged corpus at 1.5 MiB. Both numbers are read from `tsdown.config.mjs`, so the
gate and the build cannot disagree.

`npm run check` does not run that budget separately. `npm run build` already evaluates it in its own
build hook, so a local build fails on a violation before a push does. `node scripts/size-budget.mjs`
prints both totals against a `dist/` you have already built.

Two more lanes report and never block: supply-chain pin currency, and dependency review over the
incoming diff.

## How the test suite is split

One runner, Vitest, and three lanes:

1. **Virtual-filesystem unit tests.** Generators driven over an in-memory filesystem
   (`test/support/vfs.ts`), with no disk touched. This is the bulk of `test/<module>/*.test.ts`.
2. **Golden files.** Emitted trees and builder output byte-compared against committed snapshots.
   The suites are `test/emit/crossClientGoldens.test.ts` and `test/corpus/emissionGoldens.test.ts`.
   The snapshots sit under `test/emit/__snapshots__/` and `test/corpus/__snapshots__/`.
3. **Child-process end-to-end.** The real CLI spawned against a pseudo-home and a scratch
   repository, serialized. These are `test/cli/*.e2e.test.ts`, `test/pack/*.e2e.test.ts`,
   `test/authoring/onboardingRecovery.e2e.test.ts`, `test/hooks/personOnlyGuardDist.e2e.test.ts` and
   `test/emit/upgradeFrom1140.e2e.test.ts`, seven files running through
   `test/support/cliHarness.ts`. The eighth `.e2e.test.ts` file,
   `test/emit/syncDriftProof.e2e.test.ts`, spawns nothing. It is an in-process sync-loop proof over
   the golden fixture, with the git seam stubbed.

Two habits ride on top. Property tests cover the invariant-bearing cores, through fast-check
(`test/**/*.property.test.ts`). Generate-and-diff gates re-render every generator-owned artifact and
byte-compare it against the committed copy, so staleness fails the build.

Those gates name their own repair. The matrix, docs and pins failures print the regeneration
command. The sync-emitted trees are held drift-clean by `node dist/cli.js check` in CI rather
than by a test.

Coverage is report-only globally, with a blocking floor on the merge and emit core and on the
owned-path bound, `src/manifest/ownedPaths.ts`. There is no mutation gating.

Do not weaken or delete a test to land a change. When a test genuinely has to change, the diff
carries a comment in the test saying why.

## What this repository holds itself to

The corpus ships a testing rule, `content/rules/stamity-testing.md`, and this repository is one of
its consumers. What that rule asks is qualitative: what an assertion states, what a fix ships with,
and what a diff may not weaken. It says outright that numeric floors are the repository's own. Every
row below is therefore this repository's number, not the rule's.

| Practice | What the rule asks of a consumer | What this repository is held to |
|---|---|---|
| Suite shape | nothing; the rule names suite shape as the repository's own | the three lanes above, one runner |
| Property tests | nothing | fast-check properties on the invariant-bearing cores (`test/**/*.property.test.ts`) |
| Coverage | nothing; a floor is the repository's own data | per-file floors in `vitest.config.ts`: 100% on the merge and emit core with named exceptions, and on the owned-path bound (`src/manifest/ownedPaths.ts`); report-only elsewhere |
| Derived artifacts | nothing | generate-and-diff over every generator-owned artifact, plus `node dist/cli.js check` over the sync output |
| Reserved names | nothing | the leak gate, over every tracked and untracked-but-not-ignored path and file |
| Model-executed prose | nothing; the rule is written for deterministic code | an eval set over `content/`, golden and adversarial cases against pre-declared thresholds |
| Emitted bytes | nothing | golden files: every emitted artifact byte-compared against a committed snapshot |

Every row is a mechanism or a number chosen on top of the rule, not one the rule asked for. A
coverage exception is named rather than granted, and each one states the branch no public input
reaches.

Where this repository is held to exactly the rule is the rule's own floor. Assertions state a
caller's promise rather than an internal call. Every defect fix ships a case seen red first. A test
name states the invariant. Done means the gates exit 0. A gating test is not weakened by the change
it gates. A substitute carries its reason inline. Determinism is injected rather than hoped for.
Each changed behaviour gets one non-degenerate input. None of those eight is relaxed here, and none
is extended.

## Regenerate a derived file

Never hand-edit a generated file. A drift gate fails on the next run, and the edit is lost at the
next regeneration. For the generator-owned rows that gate is a test. For the last row it is CI's
`node dist/cli.js check`.

| Artifact | Regenerate with |
|---|---|
| `docs/capability-matrix.md` | `node scripts/generate-capability-matrix.mjs` |
| `docs/cli-reference.md`, `docs/configuration.md`, `docs/reference/`, `llms.txt` | `node scripts/generate-docs.mjs` |
| `docs/measurements.md` | `node scripts/merge-ready-rate.mjs --write`, then `node scripts/records.mjs commit -m <message>`, then a `main` commit that moves the pin and runs `node scripts/generate-docs.mjs --page measurements` |
| `src/pack/catalogPins.ts` | `node scripts/generate-pack-manifests.mjs` |
| `packs/*/pack.json` integrity maps | `node scripts/generate-pack-manifests.mjs --write` |
| `AGENTS.md`, `CLAUDE.md` (its managed block), `.claude/`, `.stamity/generated/` | `npm run build && node dist/cli.js sync` |

Four notes on that table:

- `--write` on `merge-ready-rate.mjs` freezes a new snapshot under `evals/measurements/`. The
  measurements page renders the snapshot `MEASUREMENT_SNAPSHOT_PATH` in `src/cli/docs/measurements.ts`
  pins, not the newest one, so the page moves with its pin: publish the snapshot to `records` with
  `node scripts/records.mjs commit -m <message>`, then move the pin in the `main` commit that
  regenerates the page.
- `generate-pack-manifests.mjs` verifies every pack against its own `pack.json` integrity map, then
  rewrites the pins module and nothing else. Its `--write` mode is maintenance, for after a
  deliberate pack edit. The plain invocation fails on the drift instead.
- `generate-pack-manifests.mjs` also takes `--check`, which verifies and writes nothing. That is how
  CI runs it.
- The last row is this repository's own setup running its own output. `node dist/cli.js check` at
  the root reports whether that setup is still drift-clean.

The manifest here selects Claude alone. Claude does not read the `.agents/skills/` projection, so no
`.agents/` tree is emitted or committed in this repository.

## What the leak gate refuses

`npm run gate` runs `scripts/leak-gate.mjs` over every tracked and untracked-but-not-ignored path.
It reads every path by name and every file by content. Gitignored files are outside the scan, and so
are the build and vendor directories.

It fails the build on four families:

- **Reserved names** — the working names this project retired, and the predecessor project.
- **Credential shapes.**
- **Private-layer references** — a row identifier out of one of the operator's private governance
  ledgers, or the name of the repository holding them.
- **Email addresses** — a person's address, in a path or in a file. The report names the file and
  withholds the address, in the path as well. An address at a reserved documentation domain or under
  `.invalid` or `.test`, a no-reply address, an SSH remote's `git@` host form and URL userinfo
  are not a person's, so write example addresses that way. An address that has to be real needs an
  exact path and its reason in `EMAIL_FIXTURES`.

It also fails on a file a `working-tree-encoding` attribute re-encodes on checkout until it is
staged, and reads a staged one as git stores it.

Every exemption is by path; the `node_modules/` exemption from the email rule holds for an untracked
file only. Every run prints the paths it skipped: up to 25 per reason, then a
count of the rest. That printing happens on a pass as well as on a failure.

The reserved-name allowlist covers three things. The migration-detection module and its tests need
the predecessor's literal marker strings to recognise a predecessor install. The published migration
guide cannot be written without naming the tool it moves off. The three bundled `dist/` JS files are
what those sources compile into. The gate assembles each reserved token from fragments at runtime,
so it is scanned by its own rules and has no self-exemption.

When you write about the engine, use a plain noun rather than the product name: "the CLI", "the
engine", "the corpus". Spellings the engine emits come from the manifest and need no edit at all.

## Change the corpus

`content/` is model-executed prose. What it does is decided at execution by a model, so a diff
review does not establish behaviour the way it does for `src/`.

A change under `content/` re-runs the eval cases it affects. Find them by the `source` field in
`evals/cases-v6/**`, where every case names the corpus path and line range its claim comes from.
When the claim itself moves, move the case's `source` and its inlined brief in the same diff. An
eval-coverage gate holds every content artifact's path to at least one case's `source`, or to the
written exemption list `evals/coverage-exemptions-v6.md`.

A change of the model under test re-runs every adversarial case at a zero-break bar. Guardrail
behaviour is a property of the model-and-prose pair, not of the prose alone.

Thresholds, the run-artifact contract and the case index live in `evals/SET-v7.md`, and the default
profile grades against `evals/rubric-v7.md`. Runs are manual, in a harness session, on the
operator's word.

Select the model pair through `evals/MODEL-PROFILES-v1.md`. The Claude profile remains the default,
while `codex-astra` and `codex-astra-judge` support Astra in either role. Calibrate the selected
judge and rubric, and record the full profile. Never pool results from different profiles into one
baseline.

The manual Codex transport is one shell command. Replace `YYYY-MM-DD-run-N` with the run id:

```sh
node scripts/eval-run.mjs --run-id YYYY-MM-DD-run-N \
  --profile codex-astra --trigger content --capacity 4
```

It runs all current cases under the set's two-class scoring rule, after exact input/provider
admission and calibration against every fixture the rubric declares. A case passes when at least
two of its three samples pass every binding criterion, and, where the case carries non-negotiable
rows, all three samples pass every one of those; `evals/SET-v7.md` carries the rule and the
decision behind it. The strict three-of-three rule it replaced is `SET-v5.md`'s, retired from `main`
on 2026-10-13; it reads at tag `evals-retired-2026-10-13`. This transport requires committed inputs and an
authorized `OPENAI_API_KEY`. An unavailable credential or control writes a blocked artifact and
admits no scores, which is the only thing it has produced so far: run 12 is blocked, and no run of
record has come through this route. See [evals/README.md](evals/README.md) for the transport's
isolation limits and artifact layout.

## Keep the records

The repository's records live on the `records` branch, not on `main`: run records and ledgers, the
deferral inbox, handoffs, QA evidence, plans, eval runs and measurement snapshots, at the paths
`scripts/records-paths.mjs` lists. Read them at <https://github.com/zomarit/stamity/tree/records>.
The branch shares no history with `main` and is never merged into it.

- A new clone runs `node scripts/records.mjs setup` once. It writes the record paths into the
  clone's shared `.git/info/exclude`, so `main` never sees them, and restores the records from
  `origin/records` into the checkout.
- Publish records with `node scripts/records.mjs commit -m "<message>"`. It gates the exact commit
  it builds on `records`, then pushes it, never forced. `--dry-run` lists what it would publish. A
  run whose record still reads `Status: in progress` is left out until the run closes.
- `node scripts/records.mjs restore` brings the checkout up to `origin/records`. Run it when
  `commit` refuses because the branch moved, and in another checkout before its first `commit`. It
  merges against the sync base, the records commit this checkout last restored or published: it
  writes what changed only on `records`, keeps what you changed and have not published, and refuses
  when a record changed on both sides. A record deleted on `records` but edited here is kept, and
  the next `commit` publishes it again unless you remove it.
- Never run `git clean -X` (or `-x`) in a checkout holding unpublished records. The record paths are
  ignored there, so the clean deletes them.
- A change to `src/cli/docs/**`, `test/records/**`, the ledger grammar, or a file the records suite
  imports or runs (`scripts/eval/run.mjs`, `scripts/eval/instrument.mjs`, `src/runs/inboxStore.ts`,
  `src/runs/disposition.ts`, `content/skills/st-verify/scripts/spec-plan-coverage.mjs`) also runs
  `npm run test:records`, after `setup`. `npm run check` does not run that suite; CI's `records` job
  does.
- The release close publishes its records first, then lands `main`'s pin bump, so `main` never pins
  a snapshot the `records` branch does not hold yet.
- Lanes write no records. A linked worktree shares `.git/info/exclude` with the main checkout, so a
  record written in a lane's worktree is ignored there and lost when the worktree is removed; the
  main checkout writes the records.

A fork's `origin` has no `records` branch, so `setup` there refuses. `npm test` needs no records:
the canonical repository's `records` job checks a fork's pull request. To run
`npm run test:records` in a fork, fetch upstream's records under a local ref and restore from it
(run both again to refresh them):

```sh
git fetch https://github.com/zomarit/stamity refs/heads/records:refs/remotes/upstream/records
node scripts/records.mjs setup --ref upstream/records --no-fetch
```

A fork does not publish records: `commit` and `init` are the canonical repository's.

## Write the commit, then open the pull request

Write conventional-commit subjects in the imperative mood. Keep one unit of work per commit. Sign
each commit off with `git commit -s`.

That sign-off is the Developer Certificate of Origin. It states that you wrote the patch, or
otherwise have the right to contribute it under the MIT license this repository ships.

The accepted types are `feat` `fix` `refactor` `test` `docs` `chore` `ci` `perf` `build` `style`. A
lower-case `(scope)` in parentheses is optional. A `!` before the colon marks a breaking change. The
same pattern applies to the pull-request title.

The DCO trailer and the title are both checked by the `pr-checks` workflow on every pull request. It
walks the base-to-head comparison of the pull request to its declared `total_commits` for the
sign-off trailer and fails naming the commits that lack one (an unsigned commit is exempt only when
a configured upstream's default branch already carries it, which this repository never configures).
It matches the title against the conventional-commit pattern.

Missed the sign-off on a branch? Run `git rebase --signoff origin/main`.

Formatting follows `.editorconfig`: LF endings, two-space indent, 100-column lines, final newline.

Something wrong that is not a vulnerability goes to the
[issue tracker](https://github.com/zomarit/stamity/issues). A suspected vulnerability does not. Read
[SECURITY.md](SECURITY.md) first and use the private channel it names.

## Where things live

| Directory | What it holds |
|---|---|
| `src/` | the engine and the CLI |
| `content/` | the canonical corpus |
| `packs/` | the first-party packs |
| `test/` | the three lanes |
| `evals/` | the eval set and its cases; its run artifacts are on the `records` branch |
| `scripts/` | generators, the leak gate, the publish-shape smoke, and the upstream lane (`upstream.mjs`, for forks) |
| `docs/` | the generated reference pages (`capability-matrix.md`, `cli-reference.md`, `configuration.md`, `measurements.md`, `reference/`) beside the hand-written guides, plus `docs/specs/`; the plans under `docs/plans/` are on the `records` branch |
| `website/` | the docs site, a separate npm project |

The boundary between engine and CLI is enforced by a static import-graph test, not by convention
(`test/architecture/boundaries.test.ts`). The engine never imports the CLI, and a new `src/` file
that no entrypoint reaches fails that suite.
