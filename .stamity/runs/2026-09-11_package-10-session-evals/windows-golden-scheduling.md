# Windows golden scheduling follow-up

Prepared on 2026-09-11 after
[CI 34588320202](https://github.com/zomarit/stamity/actions/runs/34588320202)
failed on `c4571693c1baefddf9c53d74a683e8ff193d0295`.
The bounded correction adds `test/emit/crossClientGoldens.test.ts` to the existing
Windows fixture group. Focused local verification passes; independent review,
full gates and actual Windows acceptance of this change remain pending.

## Observed failure

Windows job `103227545528` reported one failure: `emitted tree for all-four` /
`emits a byte-identical tree on a second run into a fresh directory`, at
`test/emit/crossClientGoldens.test.ts:840`. It exceeded the unchanged 20,000 ms
test timeout, with a reported duration of 20,008 ms. The 59-test golden file took
74,240 ms in the ordinary `parallel` group. Its four single-client determinism
cases passed in 1,869–3,262 ms. The job finished with 192 passing files, one failing
file and two skipped files; 7,623 passing tests, one failure and 148 existing skips.
The retained raw-log SHA-256 is
`aa3506ce0d62b6689378aea3355c813adc3824cd05c2c76cfcf1f5b7246075f3`.

Reporter timestamps and file durations place this golden file alongside other
ordinary real-disk suites. The previously isolated three fixtures ran later and
passed. This supports removing the golden file's overlap with the ordinary group;
it does not establish which operation stalled or a CPU, filesystem, scanning or
other host-level cause. The timeout covers fixture creation, initialization,
emitted-tree reading and cleanup. Earlier Windows passes retain their original
candidate identities and do not clear this later failure.

## Scheduling contract

Only Windows selection changes. The existing group 0 retains default workers and
now selects 191 files. Group 1 runs after it with one worker and exactly four files:

- `test/upstream/lane.test.ts`
- `test/pack/installSmoke.e2e.test.ts`
- `test/cli/commands/syncMcpOwnership.test.ts`
- `test/emit/crossClientGoldens.test.ts`

Vitest's [group-order contract](https://vitest.dev/config/sequence.html#sequence-grouporder)
runs project groups in ascending order; the existing one-worker setting serializes
the fixture files within group 1. Project include/exclude inheritance and root
coverage remain as described in the
[original scheduling review](../2026-09-10_package-10/windows-scheduling-review.md).
That dated three-suite record and the original implementation record remain unchanged.

The regression resolves real Vitest projects and discovers every test file. It
requires the exact four-file fixture roster, its ordinary complement, an empty
intersection and all 195 files exactly once. It retains the existing worker,
group-order, isolation, retry, test/hook timeout and coverage-floor assertions.
Darwin and Linux keep the original selection. No golden assertion, fixture,
snapshot, case timeout, skip or coverage threshold changes. The CLI harness edit
only reconciles its scheduling comment from three suites to four.

| Source | SHA-256 |
|---|---|
| `vitest.config.ts` | `4aa18521405a71f0951b73f3df97851c893114c86afc64efe8c9f9cdd1eadac6` |
| `test/ci/testScheduling.test.ts` | `f47d216fe35d45ba801ba55b2fd78a0d2243e74130c08914f8a211abcadc2993` |
| `test/support/cliHarness.ts` | `175fb6c5aef6e9099190899ce40e94f5d586961ef5869c97e66f7228851bb3fd` |

## Focused local evidence and remaining gates

The expanded regression first failed against the old configuration: one failure,
three passes, specifically the missing golden file in the resolved fixture group.
After the config change, `npm run test -- test/ci/testScheduling.test.ts` passed
all four tests. The retained negative-control report SHA-256 is
`ec66edaa93837a34fd2c3746cacec74cb58a9671a7f09e84b3c8049d4b13c774`.

A temporary config imported the actual configuration and selected
`fixtureScheduling("win32")`. The host remained Darwin, Node 22.22.3 and Vitest
5.0.0; `process.platform` was not overridden. The focused command was
`npm run test -- --config <retained Windows scheduling config>` with the five
explicit file filters: the scheduling regression and all four fixtures above.
It passed **189 tests across five files**, with no failures or skips. The JSON
report shows the ordinary regression finishing before all four fixture files,
whose reported execution intervals are ordered and nonoverlapping. All 59 golden
tests passed; the all-four second-directory case took 2,191.5 ms on this local host.
The report SHA-256 is
`37ac963123ec8b1f3aa833c6a25e2a17ccbdbe0561b522ee1783fea5cee5a32d`;
the config wrapper SHA-256 is
`5c035fd973a191428498532942d19f5e3019cca9b7c751b4fb5b2240adeef73f`.

The root config, including coverage, remains byte-identical to `c4571693` after
the scheduling function. Git object checks retain the golden source, fixture and
snapshot, the original three fixture files, both dated scheduling/implementation
records and all 13 original run-13 export files. Targeted Oxlint and
`git diff --check` exit 0. This focused Darwin evidence does not complete full
coverage gates or actual Windows verification; both remain required on the new
candidate, along with independent review.

Run 13 remains terminally blocked at C3's valid calibration mismatch, with zero
scenario samples. C4's applied invalid, ungraded and nonretryable bookkeeping
record is unchanged. No eval input, helper, label, threshold, score or model call
changes here. H1–H3 and every required H-row walkthrough remain unsigned; version
1.7.0 remains prepared and unpublished. The scheduling follow-up starts no
Package 11/12 work or cleanup.
