# Independent Windows scheduling review

Reviewed on 2026-09-11 against `f7d3f95a7dac26c702c17b3e19ffd9c691e5d2cb`
plus the three source changes below. No actionable source finding remains. The
local scheduled coverage gate passes; actual Windows acceptance of this mitigation
has not yet run. Final committed identity and platform outcomes belong to
[PR #34](https://github.com/zomarit/stamity/pull/34), as described in `handoff.md`.
This review does not replace the failed run or perform human QA.

## Observed failure and bounded scope

[CI 34538915096](https://github.com/zomarit/stamity/actions/runs/34538915096)
failed on the evidence-only `f7d3f95` head. Windows job `103076834099` failed eight
tests: two upstream cases at their existing 30-second limits and six MCP ownership
cases at their existing 20-second limits. Its totals were 190 passing files, two
failing files and two skipped files; 7,513 passing tests, eight failing tests and
148 existing skips. Aggregate `103079077901` failed. Earlier `713c057` Windows
success remains historical evidence, with its own receipts in `ci-verification.md`.

Independent raw-log comparison found identical runner, image, Git, Node and npm
versions. The upstream suite grew from 241,166 to 285,374 ms, MCP ownership from
22,052 to 156,824 ms, and the pack install suite from 87,301 to 204,442 ms. The
pack tampering case grew from 4,514 to 109,318 ms. The six MCP failures form a
localized interval between normally timed cases; many other suites were faster.
The eval-runner fixture starts after that interval. These observations support
reducing overlap among the three expensive suites. They do not establish a CPU,
filesystem, antivirus or other host-level root cause, or excuse the red gate.

The approved source scope is exactly:

| File | Reviewed change | SHA-256 |
|---|---|---|
| `vitest.config.ts` | Windows-only scheduling function and two ordered projects | `d8d666888169e2fde6e20b3e38434a5bfea3591459609150b493af1723a03c55` |
| `test/ci/testScheduling.test.ts` | Four meaningful tests of actual project resolution and discovery | `0d2f74d0f20004a234d2ebf7e5cf7775da425d36cb5ae4d40c092e97fb27d82f` |
| `test/support/cliHarness.ts` | Reconciled scheduling comment only | `f3d811e0cf7c1438c795881cd1f55b6009d91338b488ecf09a2ce06bcdbc2fe9` |

No runtime implementation, workflow, existing test assertion, timeout, skip,
retry policy or coverage threshold changed. All 194 original test files remain;
the regression adds one file and four tests.

## Independent contract checks

The reviewer inspected installed Vitest 5.0.0 project inheritance, worker-budget
resolution and task-group execution, together with the primary
[project documentation](https://vitest.dev/guide/projects.html) and
[group-order documentation](https://vitest.dev/config/sequence.html#sequence-grouporder).
Inline inherited arrays concatenate, so the Windows root uses an empty include
array and each project supplies its own roster. Coverage remains at the root.
The executor awaits each group before applying the next group's worker limit;
this does not introduce two simultaneous worker pools or raise the original budget.

An independent `createVitest`/`globTestSpecifications` probe resolved all three
platform selections on the actual Darwin host:

| Selection | Resolved roster | Worker/group settings |
|---|---|---|
| Windows | 192 ordinary files, then exactly `upstream/lane.test.ts`, `pack/installSmoke.e2e.test.ts` and `cli/commands/syncMcpOwnership.test.ts` | Default workers in group 0; one worker in group 1 |
| Darwin | All 195 files in the original project | Original default workers/group |
| Linux | All 195 files in the original project | Original default workers/group |

Every file appears exactly once. Resolved projects retain 20,000 ms test/hook
budgets, isolation and zero retries; explicit case budgets remain byte-unchanged.
Resolved root coverage thresholds match the unchanged configured thresholds.
The writer's preserved negative control failed one of four tests against the old
scheduling behavior. Its final focused run passed 130 tests across the new
regression and the three heavy files; file intervals are ordered and nonoverlapping.
These receipts were inspected and copied to durable private storage.

## Local verification and input binding

The independent full run selected the same Windows scheduling function through a
retained configuration wrapper. It ran on Darwin with Node 22.22.3 and Vitest 5.0.0;
`process.platform` was not overridden. Private-path placeholders below are
normalized for this public record; exact arguments, wrapper bytes and raw logs
are retained privately.

| Command | Observed result |
|---|---|
| `npm run lint` | Exit 0 |
| `npm run typecheck` | Exit 0 |
| `npm run knip` | Exit 0 |
| `npm run test -- --coverage --config <retained Windows scheduling config>` | Exit 0; 195 files pass, 7,671 tests pass, two existing skips; 166.788 seconds |

Both projects contribute to one coverage report and every configured floor
passes. Totals: statements 96.37%, branches 89.66%, functions 98.68%, lines 97.25%.
The full-coverage log SHA-256 is
`042e57861958a8ffca7f5b4c919b2f8cd9cbec6b930225275b73d1a941529991`;
the coverage-summary SHA-256 is
`c41def94dc18c10fb5a5974e2aa4aa0ea2291f7b8a29b905c631b7a920864c44`.

Before and after inventories are identical across 1,076 inputs, excluding this
current run's evidence directory to avoid a self-reference. Source digest:
`2dd850b73c4a2e03a4511d95394749633e4b9749faf4c8dcdfdfd01e1a01ec2c`.
Before-manifest SHA-256:
`f1b6e5328b3d524e9ffb40a460ecedf15af1cc6547061e8883c1cadf32ca0d95`.
After-manifest SHA-256:
`5dd418836beab03df61d074c825e03650b7c8fa1aa87623f368e03eb10f849cd`.

Of the previous 1,075 verified inputs, 1,073 remain byte-identical; only the config
and harness comment differ, with the new regression added. Runtime, build,
packed-consumer, generator, dogfood, website, browser and original run-12 inputs
are unchanged. Their prior corrected proofs remain bound to those unchanged
inputs; they were not rerun or relabeled as new observations here. Earlier
verification records and original failed CI receipts remain preserved.

Not done: actual final-head Windows/required CI and non-publishing rehearsal have
not run at this record's freeze. Their completed results must be captured in the
PR and retained platform receipts before handback. Run 12 remains BLOCKED with no
live calls, calibration or scores; affected three-sample behavior is unmeasured.
Current human QA and protected publication approval remain unsigned/unperformed.
Version 1.7.0 is unpublished; this scheduling proof supplies no release authorization.
