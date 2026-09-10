<!-- HAND-WRITTEN PAGE — verified against the tree at commit b801fe5. -->
<!-- Re-open when: a step joins or leaves `npm run check`, a generated artifact class gains or
     loses a regeneration command, either Node floor moves, a test lane joins or leaves, a
     coverage floor in `vitest.config.ts` moves, or the eval set's version bumps — the `evals/`
     paths named below carry that version in their own names, so a bump silently repoints them
     and is what last carried this page past its stamp. `test/docsPages.test.ts` asserts `npm run
     check`, the leak-gate row and four of the seven regeneration commands against this page;
     `test/ci/workflow.test.ts` asserts the two required contexts and the `pr-checks`
     attribution. Beyond its Leak-gate row, the step table — the other five steps and their
     order — is unasserted. -->

# Contributing

Pull requests are welcome. The bar is the gate below, not a reviewer's mood: every check runs
in CI on every pull request, and a merge needs all of them green.

One person maintains this repository, and the branch protection says so candidly —
**0 required approvals**. A rubber-stamp approval from the only maintainer would add a click and
no scrutiny, so the review that counts is mechanical — the gate — plus a read. External pull
requests get that read through the product's own review command, `/st-pr-resolve`: the
setup this repository generates is the setup used to review changes to it. If that command
reviews your PR badly, say so in the thread — a weak review is a defect in the corpus, and it
gets fixed there rather than worked around.

Sign your commits off (`git commit -s`) — that trailer is the DCO — and write
conventional-commit subjects. Both are checked by the `pr-checks` workflow on every pull
request: it walks the pull request's own commit list for the sign-off trailer and fails naming
the commits that lack one, and it matches the title against the conventional-commit pattern.
Details under [Commits](#commits).

## The loop

```sh
npm install
npm run check
```

`npm run check` is the gate, in this order:

| Step | Command | What it proves |
|---|---|---|
| Leak gate | `npm run gate` | `scripts/leak-gate.mjs`: no reserved name, credential shape or private-layer reference in any scanned path or file |
| Typecheck | `npm run typecheck` | TypeScript 7 native, strict, zero errors across `src/` and `test/` |
| Lint | `npm run lint` | oxlint over the TypeScript surface, ESLint over the JavaScript surface |
| Test | `npm test` | The whole suite, all three lanes |
| Build | `npm run build` | tsdown produces `dist/cli.js` and `dist/index.js` |
| Unused code | `npm run knip` | No orphan file, export or dependency |

Every step exits 0 before a commit, and CI runs the same steps on the pull request.

Two required status contexts gate a merge. `all-ci-checks` (`.github/workflows/ci.yml`) is the
matrix above plus a generate-and-diff self-consistency step, the dogfood `node dist/cli.js check`
and a tarball smoke, on every event. It also carries the APM route gate:
`node scripts/apm-install-smoke.mjs` installs this repository's `apm.yml` + `.apm/` package into a
throwaway consumer and verifies the deployed tree — every primitive id at its target's path,
carrying its source heading — on apm-cli 0.29.1 (the minimum tested client), 0.30.0 (current), and
once more on 0.29.0 with `--expect-failure`, so the check keeps proving it can still see the
routing failure that shipped zero primitives while exiting 0. Run it locally with
`node scripts/apm-install-smoke.mjs --apm <path-to-apm>` (or `STAMITY_APM_BIN=<path>`); apm-cli is
a Python package and no step of `npm run check` needs it. `all-pr-checks`
(`.github/workflows/pr-checks.yml`) runs on pull requests only and carries what only a pull request
can be asked: the DCO trailer on every commit, the conventional-commit title, and the dual size
budget over the built `dist/` — bundled logic at most 2 MiB, staged corpus at most 1.5 MiB, both
numbers read from `tsdown.config.mjs` so the gate and the build cannot disagree. `npm run check`
does not run that budget separately; `npm run build` already evaluates it in its own build hook, so
a local build fails on a violation before a push does. `node scripts/size-budget.mjs` prints both
totals against a `dist/` you already built.

One Node floor for the package and its suite, and it is the one in `package.json`; the docs
site under `website/` is a separate npm project and declares its own (`>=22.12` in
`website/package.json`). `>= 22.22.2` is the PUBLISHED RUNTIME floor: what the CLI needs, what
the engines field declares, and what a consumer is held to. It used to sit below the DEV
TOOLCHAIN floor — at 22.12 `npm install` reported `EBADENGINE` for 15 packages, headed by
tsdown (`^22.18.0`) and ESLint (`^22.13.0`) — and the raise past both closed that gap, so
develop on 22.22.2 or 24. The engines field still moves for the RUNTIME graph only, never to
match the toolchain: raising it for a dev-only requirement would narrow who can install the
published package for a reason that applies to this repository alone. `test/ci/engines.test.ts`
holds it to the runtime half of the lockfile. Beyond Node, the suite needs a `git` binary on
PATH — the fixture lanes spawn it — and, on POSIX hosts, `mkfifo` for one workspace case
(`test/cli/commands/workspace.test.ts`, skipped on Windows). Nothing is installed globally, and
no network service is contacted.

## Test lanes

Three lanes, one runner (Vitest):

1. **Virtual-filesystem unit tests.** Generators driven over an in-memory filesystem
   (`test/support/vfs.ts`), no disk touched. The bulk of `test/<module>/*.test.ts`.
2. **Golden files.** Emitted trees and builder output byte-compared against committed
   snapshots (`test/emit/crossClientGoldens.test.ts` and `test/corpus/emissionGoldens.test.ts`,
   snapshots under `test/emit/__snapshots__/` and `test/corpus/__snapshots__/`).
3. **Child-process end-to-end.** The real CLI spawned against a pseudo-home and a scratch
   repository, serialized (`test/cli/*.e2e.test.ts` and `test/pack/*.e2e.test.ts` through
   `test/support/cliHarness.ts`). The fifth `.e2e.test.ts` file,
   `test/emit/syncDriftProof.e2e.test.ts`, spawns nothing: it is an in-process sync-loop proof
   over the golden fixture with the git seam stubbed.

Two habits ride on top. Property tests cover the invariant-bearing cores
(`test/**/*.property.test.ts`, fast-check). Generate-and-diff gates re-render every
generator-owned artifact and byte-compare it against the committed copy, so staleness fails the
build — the matrix, docs and pins failures name the regeneration command; the plugin-manifest and
APM failures say only that the file is stale, and the sync-emitted trees are held drift-clean by
`node dist/cli.js check` in CI rather than by a test. Coverage is report-only globally with a
blocking floor on the merge and emit core; there is no mutation gating.

Do not weaken or delete a test to land a change. When a test genuinely has to change, the
diff carries a comment in the test saying why.

## Test self-application

The corpus ships a testing rule, `content/rules/stamity-testing.md`, and this repository is one
of its consumers. What that rule asks is qualitative — what an assertion states, what a fix ships
with, what a diff may not weaken — and it says outright that numeric floors are the repository's
own. Every row below is therefore this repository's number, not the rule's.

| Practice | What the rule asks of a consumer | What this repository is held to |
|---|---|---|
| Suite shape | nothing; the rule names suite shape as the repository's own | the three lanes above, one runner |
| Property tests | nothing | fast-check properties on the invariant-bearing cores (`test/**/*.property.test.ts`) |
| Coverage | nothing; a floor is the repository's own data | per-file floors in `vitest.config.ts`: 100% on the merge and emit core with named exceptions, report-only elsewhere |
| Derived artifacts | nothing | generate-and-diff over every generator-owned artifact, plus `node dist/cli.js check` over the sync output |
| Reserved names | nothing | the leak gate, over every tracked and untracked-but-not-ignored path and file |
| Model-executed prose | nothing; the rule is written for deterministic code | an eval set over `content/`, golden and adversarial cases against pre-declared thresholds |
| Emitted bytes | nothing | golden files: every emitted artifact byte-compared against a committed snapshot |

The whole table is the more-than half, and for one reason repeated seven times: the rule governs
what a test asserts, and each row is a mechanism or a number chosen on top of that — the lane
split, the per-file coverage floors, the generate-and-diff gates, the leak gate, the eval set,
and the goldens — and a coverage exception is named rather than granted, each one stating the
branch no public input reaches. Where this repository is held to exactly the rule is the floor:
assertions state a caller's promise rather than an internal call, every defect fix ships a case
seen red first, a test name states the invariant, done means the gates exit 0, a gating test is
not weakened by the change it gates, a substitute carries its reason inline, determinism is
injected rather than hoped for, and each changed behaviour gets one non-degenerate input. None
of those eight is relaxed here and none is extended — they are read exactly as any consumer
repository reads them.

## Regenerating derived files

Never hand-edit a generated file: a drift gate fails on the next run — a test for the
generator-owned rows, CI's `node dist/cli.js check` for the last row — and the edit is lost
at the next regeneration.

| Artifact | Regenerate with |
|---|---|
| `docs/capability-matrix.md` | `node scripts/generate-capability-matrix.mjs` |
| `docs/cli-reference.md`, `docs/configuration.md`, `docs/reference/`, `llms.txt` | `node scripts/generate-docs.mjs` |
| `src/pack/catalogPins.ts` | `node scripts/generate-pack-manifests.mjs` — verifies every pack against its own `pack.json` integrity map, then rewrites the pins module and nothing else (`--check` verifies and writes nothing) |
| `packs/*/pack.json` integrity maps | `node scripts/generate-pack-manifests.mjs --write` — maintenance mode, after a deliberate pack edit; the plain invocation fails on the drift instead |
| `.claude-plugin/`, `.cursor-plugin/plugin.json`, `plugin.json` | `node scripts/generate-plugin-manifests.mjs` (`--check` verifies and writes nothing) |
| `apm.yml`, `.apm/` | `node scripts/generate-apm-package.mjs` (`--check` verifies and writes nothing) |
| `AGENTS.md`, `CLAUDE.md` (its managed block), `.claude/`, `.stamity/generated/` | `npm run build && node dist/cli.js sync` |

The last row is this repository's own setup — it runs its own output. `node dist/cli.js
check` at the root reports whether that setup is still drift-clean. The manifest here selects
Claude alone, which does not read the `.agents/skills/` projection, so no `.agents/` tree is
emitted or committed in this repository.

## The leak gate

`npm run gate` runs `scripts/leak-gate.mjs` over every tracked and untracked-but-not-ignored path
— every path by name and every file by content; gitignored files are outside the scan, and so are
the build and vendor directories. It fails the build on three families: reserved names, meaning
the working names this project retired and the predecessor project; credential shapes; and
references to the operator's private governance layer, meaning one of its ledger row identifiers
or the name of the repository holding them. Every exemption is by path and is printed on every
run, up to 25 per reason. The reserved-name allowlist covers the migration-detection module and
its tests, which need the predecessor's literal marker strings to recognise a predecessor install;
the published migration guide, which cannot be written without naming the tool it moves off; and
the three bundled `dist/` JS files those sources compile into. The gate assembles each reserved
token from fragments at runtime, so it is scanned by its own rules and has no self-exemption, and
it prints the paths it skipped — up to 25 per reason, then a count of the rest — on a pass as well
as on a failure.

Write about the engine in plain nouns — "the CLI", "the engine", "the corpus" — rather than
repeating the product name in prose. Spellings the engine emits come from the manifest and
need no edit at all.

## Changing the corpus

`content/` is model-executed prose: what it does is decided at execution by a model, so a diff
review does not establish behaviour the way it does for `src/`. A change under `content/` re-runs
the eval cases it affects — find them by the `source` field in `evals/cases-v4/**`, where every
case names the corpus path and line range its claim comes from, and move a case's `source` and
its inlined brief in the same diff when the claim itself moves. An eval-coverage gate holds every
content artifact's path to at least one case's `source` or to the written exemption list
`evals/coverage-exemptions-v4.md`. A change of the model under test re-runs every adversarial
case at a zero-break bar, because guardrail behaviour is a property of the model-and-prose pair
rather than of the prose alone. Thresholds, the run-artifact contract and the case index live in
`evals/SET-v4.md`; runs are manual, in a harness session, on the operator's word.

Select the model pair through `evals/MODEL-PROFILES-v1.md`: the original Claude profile
remains the default, while `codex-astra` and `codex-astra-judge` support Astra in either
role. Calibrate the selected judge/rubric and record the full profile; never pool results
from different profiles into one baseline.

## Commits

Conventional-commit subjects (`feat:`, `fix:`, `docs:`, `chore:`), imperative mood, one unit
of work per commit, sign-off (`git commit -s`). The sign-off is the Developer Certificate of
Origin: it states that you wrote the patch or otherwise have the right to contribute it under
the MIT license this repository ships. The accepted types are `feat` `fix` `refactor` `test`
`docs` `chore` `ci` `perf` `build` `style`, an optional lower-case `(scope)`, and an optional
`!` before the colon for a breaking change — the pattern `pr-checks` applies to the pull-request
title. Missed the sign-off on a branch? `git rebase --signoff origin/main`.

Formatting follows `.editorconfig`: LF endings, two-space indent, 100-column lines, final
newline.

Something wrong that is not a vulnerability goes to the issue tracker,
<https://github.com/zomarit/stamity/issues>. A suspected vulnerability does not — read
[SECURITY.md](SECURITY.md) first and use the private channel it names.

## Where things live

`src/` engine and CLI, `content/` the canonical corpus, `packs/` the first-party packs, `test/` the
three lanes, `scripts/` generators, the leak gate, the two smokes (publish shape, APM route) and
the upstream lane (`upstream.mjs`, for forks), `docs/` the generated reference pages
(`capability-matrix.md`, `cli-reference.md`, `configuration.md`, `reference/`) beside the
hand-written guides, `plans/` and `specs/`. The boundary between engine and CLI is
enforced by a static import-graph test (`test/architecture/boundaries.test.ts`), not by
convention: the engine never imports the CLI, and a new `src/` file that no entrypoint reaches
fails that suite.
