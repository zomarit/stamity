<!-- HAND-WRITTEN PAGE — verified against the tree at commit e79dcf0. Re-attested 2026-09-16 in the Package 14 rewrite. -->
<!-- Re-open when: a step joins or leaves `npm run check`, a generated artifact class gains or loses a
     regeneration command, either Node floor moves, a test lane joins or leaves, a coverage floor in
     `vitest.config.ts` moves, a type-only dependency exception joins or leaves `knip.json`, or the
     eval set's version bumps — the `evals/` paths below carry that version in their own names.
     `test/docsPages.test.ts` asserts the contributor-gate command, the
     leak-gate row and five regeneration commands; `test/ci/workflow.test.ts` asserts the two
     required status contexts. -->

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
| Leak gate | `npm run gate` | `scripts/leak-gate.mjs` finds no reserved name, credential shape or private-layer reference in any scanned path or file |
| Typecheck | `npm run typecheck` | TypeScript 7, strict: zero errors across `src/`, `test/` and the root config files |
| Lint | `npm run lint` | oxlint over the TypeScript surface, ESLint over the JavaScript surface |
| Test | `npm run test` | The whole suite, all three lanes |
| Build | `npm run build` | tsdown produces `dist/cli.js` and `dist/index.js` |
| Unused code | `npm run knip` | No orphan file, export or dependency |

CI runs the same six steps on your pull request.

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

`all-ci-checks` (`.github/workflows/ci.yml`) runs on every event. It passes when the check matrix
and the APM route lane both pass. The matrix has three legs: the declared Node floor, the LTS
canonical, and one Windows leg. Beside the six steps you already ran, it adds five things:

- A generate-and-diff self-consistency step over every generated artifact class.
- The dogfood check, `node dist/cli.js check`, which re-proves this repository's own generated setup
  drift-clean against the binary the job just built.
- A tarball smoke on the floor leg: pack the package, install it into a throwaway project, then run
  it. The published shape is a different tree from the repository, and this is the only gate that
  reads it.
- A repository hygiene scan on pull requests. It rejects tracked runtime files, new raw evidence,
  and growth past the file budgets.
- The APM route gate, `node scripts/apm-install-smoke.mjs`. It installs this repository's `apm.yml`
  and `.apm/` package into a throwaway consumer, then verifies the deployed tree: every primitive id
  at its target's path, carrying its source heading. It runs on apm-cli 0.29.1, the minimum tested
  client, and on 0.30.0, the current one. It runs once more on 0.29.0 with `--expect-failure`, so
  the check keeps proving it can still see the routing failure that shipped zero primitives while
  exiting 0.

Run the APM smoke locally with `node scripts/apm-install-smoke.mjs --apm <path-to-apm>`, or point
`STAMITY_APM_BIN` at that path instead. apm-cli is a Python package, and no step of `npm run check`
needs it.

`all-pr-checks` (`.github/workflows/pr-checks.yml`) runs on pull requests only. It carries the three
gates only a pull request can be asked. They are the DCO trailer on every commit, the
conventional-commit title, and the dual size budget over the built `dist/`. Bundled logic is capped
at 2 MiB and the staged corpus at 1.5 MiB. Both numbers are read from `tsdown.config.mjs`, so the
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
   repository, serialized. These are `test/cli/*.e2e.test.ts` and `test/pack/*.e2e.test.ts`, running
   through `test/support/cliHarness.ts`. The fifth `.e2e.test.ts` file,
   `test/emit/syncDriftProof.e2e.test.ts`, spawns nothing. It is an in-process sync-loop proof over
   the golden fixture, with the git seam stubbed.

Two habits ride on top. Property tests cover the invariant-bearing cores, through fast-check
(`test/**/*.property.test.ts`). Generate-and-diff gates re-render every generator-owned artifact and
byte-compare it against the committed copy, so staleness fails the build.

Those gates name their own repair unevenly. The matrix, docs and pins failures print the
regeneration command. The plugin-manifest and APM failures say only that the file is stale. The
sync-emitted trees are held drift-clean by `node dist/cli.js check` in CI rather than by a test.

Coverage is report-only globally, with a blocking floor on the merge and emit core. There is no
mutation gating.

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
| Coverage | nothing; a floor is the repository's own data | per-file floors in `vitest.config.ts`: 100% on the merge and emit core with named exceptions, report-only elsewhere |
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
| `docs/measurements.md` | `node scripts/merge-ready-rate.mjs --write`, then `node scripts/generate-docs.mjs --page measurements` |
| `src/pack/catalogPins.ts` | `node scripts/generate-pack-manifests.mjs` |
| `packs/*/pack.json` integrity maps | `node scripts/generate-pack-manifests.mjs --write` |
| `.claude-plugin/`, `.cursor-plugin/plugin.json`, `plugin.json` | `node scripts/generate-plugin-manifests.mjs` |
| `apm.yml`, `.apm/` | `node scripts/generate-apm-package.mjs` |
| `dist/plugins/` | `node scripts/generate-plugin-packages.mjs --out-dir dist/plugins --runtime <dir>` |
| `AGENTS.md`, `CLAUDE.md` (its managed block), `.claude/`, `.stamity/generated/` | `npm run build && node dist/cli.js sync` |

Four notes on that table:

- `--write` on `merge-ready-rate.mjs` freezes the snapshot under `evals/measurements/`, which the
  measurements page renders from.
- `generate-pack-manifests.mjs` verifies every pack against its own `pack.json` integrity map, then
  rewrites the pins module and nothing else. Its `--write` mode is maintenance, for after a
  deliberate pack edit. The plain invocation fails on the drift instead.
- The three manifest generators each take `--check`, which verifies and writes nothing. That is how
  CI runs them.
- The last row is this repository's own setup running its own output. `node dist/cli.js check` at
  the root reports whether that setup is still drift-clean.

The manifest here selects Claude alone. Claude does not read the `.agents/skills/` projection, so no
`.agents/` tree is emitted or committed in this repository.

## What the leak gate refuses

`npm run gate` runs `scripts/leak-gate.mjs` over every tracked and untracked-but-not-ignored path.
It reads every path by name and every file by content. Gitignored files are outside the scan, and so
are the build and vendor directories.

It fails the build on three families:

- **Reserved names** — the working names this project retired, and the predecessor project.
- **Credential shapes.**
- **Private-layer references** — a row identifier out of one of the operator's private governance
  ledgers, or the name of the repository holding them.

Every exemption is by path, and every run prints the paths it skipped: up to 25 per reason, then a
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

Select the model pair through `evals/MODEL-PROFILES-v1.md`. The original Claude profile remains the
default, while `codex-astra` and `codex-astra-judge` support Astra in either role. Calibrate the
selected judge and rubric, and record the full profile. Never pool results from different profiles
into one baseline.

The manual Codex transport is one shell command. Replace `YYYY-MM-DD-run-N` with the run id:

```sh
node scripts/eval-run.mjs --run-id YYYY-MM-DD-run-N \
  --profile codex-astra --trigger content --capacity 4
```

It runs all current cases under the set's two-class scoring rule, after exact input/provider
admission and calibration against every fixture the rubric declares. A case passes when at least
two of its three samples pass every binding criterion, and, where the case carries non-negotiable
rows, all three samples pass every one of those; `evals/SET-v7.md` carries the rule and the
decision behind it. The strict three-of-three rule it replaced is `SET-v5.md`'s, retained as the
baseline runs 19 to 21 were scored under. This transport requires committed inputs and an
authorized `OPENAI_API_KEY`. An unavailable credential or control writes a blocked artifact and
admits no scores, which is the only thing it has produced so far: run 12 is blocked, and no run of
record has come through this route. See [evals/README.md](evals/README.md) for the transport's
isolation limits and artifact layout.

## Write the commit, then open the pull request

Write conventional-commit subjects in the imperative mood. Keep one unit of work per commit. Sign
each commit off with `git commit -s`.

That sign-off is the Developer Certificate of Origin. It states that you wrote the patch, or
otherwise have the right to contribute it under the MIT license this repository ships.

The accepted types are `feat` `fix` `refactor` `test` `docs` `chore` `ci` `perf` `build` `style`. A
lower-case `(scope)` in parentheses is optional. A `!` before the colon marks a breaking change. The
same pattern applies to the pull-request title.

The DCO trailer and the title are both checked by the `pr-checks` workflow on every pull request. It
walks the pull request's own commit list for the sign-off trailer and fails naming the commits that
lack one. It matches the title against the conventional-commit pattern.

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
| `evals/` | the eval set, its cases, and its run artifacts |
| `scripts/` | generators, the leak gate, the two smokes (publish shape, APM route), and the upstream lane (`upstream.mjs`, for forks) |
| `docs/` | the generated reference pages (`capability-matrix.md`, `cli-reference.md`, `configuration.md`, `measurements.md`, `reference/`) beside the hand-written guides, plus `docs/plans/` and `docs/specs/` |
| `website/` | the docs site, a separate npm project |

The boundary between engine and CLI is enforced by a static import-graph test, not by convention
(`test/architecture/boundaries.test.ts`). The engine never imports the CLI, and a new `src/` file
that no entrypoint reaches fails that suite.
