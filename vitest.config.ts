import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig, type TestUserConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";

/**
 * A private temp root per run, `<os temp>/stamity-vitest-<pid>`, handed to every worker and every
 * process a test spawns through the three variables Node's `os.tmpdir()` reads (TMPDIR on POSIX,
 * TEMP and TMP on Windows). `test/support/globalSetup.ts` creates it, sweeps what killed runs left,
 * warns on a nearly full temp volume, and removes it after the last test, which is where the trees
 * `lazyCleanup` defers are removed — outside every hook timeout.
 *
 * Both halves ride on the setup file being present. A partial copy of this config (the downstream
 * fixtures copy it without the support tree) runs on the shared temp root, as before, rather than
 * failing to load a setup it does not carry or pointing at a root nothing creates.
 */
export function privateTempRoot(setupFile: string, base: string, pid: number): Pick<TestUserConfig, "env" | "globalSetup"> {
  if (!existsSync(setupFile)) return {};
  const root = join(base, `stamity-vitest-${pid}`);
  return { env: { TMPDIR: root, TEMP: root, TMP: root }, globalSetup: ["test/support/globalSetup.ts"] };
}

/**
 * The Windows shard each serialized file runs on, so the serial group is split across both
 * shards by weight instead of by vitest's path hash, which put four of the five on shard 2 in
 * every one of the twelve full pull-request runs below and made that shard the run's critical
 * path (median Test step 8.62 min against 6.68 min).
 *
 * Weights: the per-file median duration in the Windows `Test` step logs (vitest's per-file line
 * in the `windows-fixtures` group) of the full pull-request CI runs 37753891122, 37753727570,
 * 37752273949, 37711737961, 37697142531, 37689274319, 37685980044, 37671784749, 37652601608,
 * 37648263478, 37566717697 and 37470450928 (2026-10-06 to 10-08, read 2026-10-08):
 *
 *   test/upstream/lane.test.ts                   117.7s
 *   test/ci/pluginLifecycle.test.ts               64.2s
 *   test/pack/installSmoke.e2e.test.ts            63.4s
 *   test/emit/crossClientGoldens.test.ts          25.0s
 *   test/cli/commands/syncMcpOwnership.test.ts    18.9s
 *
 * Assigned on total shard time, not on the serial files alone. Shard 1's job carries more of
 * everything else: its job minus its serial files has a median of 424.3s against shard 2's
 * 291.7s, because it runs more of the parallel group and then the dogfood check and the leak
 * gate step. Balancing the serial totals alone (lane and crossClientGoldens on shard 1, 142.7s
 * against 146.5s) only moves the critical path to shard 1. So each split with at least two
 * serial files per shard was projected per run: a shard's new job time is its measured job time
 * (`reports/ci-baseline-measure-r1.md` of run 2026-10-08_maintainer-tooling), minus the serial
 * files it ran, plus the ones the split gives it. The slower shard is that run's critical path:
 *
 *   split (shard 1's serial files)          median critical path   slower shard
 *   pluginLifecycle + syncMcpOwnership      8.64 min               shard 1 in 7 of 12  <- this table
 *   installSmoke + syncMcpOwnership         8.64 min               shard 1 in 7 of 12
 *   installSmoke + crossClientGoldens       8.73 min               shard 1 in 7 of 12
 *   lane + crossClientGoldens               9.30 min               shard 1 in 11 of 12
 *   the hash split (crossClientGoldens)     9.32 min               shard 2 in 10 of 12
 *
 * The two splits tied at 8.64 min are equal within the data, and the first is the one the
 * review proposed. Whatever split is projected, the hash split of the other files moves by about
 * one file once these five are taken out, and vitest's per-file times leave out collect time. So
 * the gain is measured on CI's Windows legs (QA row 5 of that run).
 */
export const WINDOWS_SHARD_OF: Readonly<Record<string, 1 | 2>> = {
  "test/ci/pluginLifecycle.test.ts": 1,
  "test/cli/commands/syncMcpOwnership.test.ts": 1,
  "test/upstream/lane.test.ts": 2,
  "test/pack/installSmoke.e2e.test.ts": 2,
  "test/emit/crossClientGoldens.test.ts": 2,
};

/**
 * Vitest's own sequencer with one change to `shard`: on a two-way split, a file named in
 * `WINDOWS_SHARD_OF` runs on the shard the table gives it, and every other file is split by
 * vitest's hash as before. Any other shard count is vitest's split, unchanged. Vitest constructs
 * the sequencer from the root config's `sequence.sequencer`, and only `fixtureScheduling("win32")`
 * installs it.
 */
export class WindowsFixtureSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { shard, root } = this.ctx.config;
    if (shard?.count !== 2) return super.shard(files);
    const placed = (spec: TestSpecification): 1 | 2 | undefined =>
      WINDOWS_SHARD_OF[relative(root, spec.moduleId).replaceAll("\\", "/")];
    const pinned = files.filter((spec) => placed(spec) === shard.index);
    const rest = await super.shard(files.filter((spec) => placed(spec) === undefined));
    return [...pinned, ...rest];
  }
}

// 2026-10-08: the Windows parallel group's per-case budget. Quiet Windows runs `init -y` in
// test/cli/surface.e2e.test.ts in 2.8-7.6 s; CI run 37840621578 (attempts 1-2, windows-1) ran it
// past the 20 s default on a starved runner. 120 s covers 10x the slowest quiet run with margin.
const WINDOWS_PARALLEL_TEST_TIMEOUT_MS = 120_000;

/**
 * 2026-09-11: Windows CI first showed overlapping stalls in three real-disk
 * suites. CI 34588320202 later timed out the all-four fresh-directory golden
 * while it ran in the ordinary parallel group. Isolate these four fixtures,
 * keeping all assertions and timeouts.
 * 2026-09-23: the plugin-lifecycle fixture build (a child process writing two
 * four-root trees) hit its 48s spawn budget in CI 35837987995, 35845305397 and
 * 35852090952 (attempt 1 each) while ten passing legs built it in 17-25s; the
 * same legs ran its smaller builds up to 3x slower, so it joins this group.
 * The host-level cause remains unproved; an actual Windows run must verify this.
 * Vitest groups execute in order; one worker serializes only the second group:
 * https://vitest.dev/config/sequence.html#sequence-grouporder
 * 2026-10-08: the serialized group is split across the two Windows shards by
 * `WINDOWS_SHARD_OF`; every file in `heavy` needs a row there.
 */
export function fixtureScheduling(platform: NodeJS.Platform): Pick<TestUserConfig, "include" | "projects" | "sequence"> {
  if (platform !== "win32") return {};
  const heavy = [
    "test/upstream/lane.test.ts",
    "test/pack/installSmoke.e2e.test.ts",
    "test/cli/commands/syncMcpOwnership.test.ts",
    "test/emit/crossClientGoldens.test.ts",
    "test/ci/pluginLifecycle.test.ts",
  ];
  return {
    // Inline projects inherit arrays by concatenation. An empty root include
    // lets each project select its own files; the root still owns coverage.
    include: [],
    // Read from the root config only: the pool builds one sequencer for the run.
    sequence: { sequencer: WindowsFixtureSequencer },
    projects: [
      {
        extends: true,
        test: {
          name: "parallel",
          include: ["test/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...heavy],
          testTimeout: WINDOWS_PARALLEL_TEST_TIMEOUT_MS,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "windows-fixtures",
          include: heavy,
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  };
}

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    ...fixtureScheduling(process.platform),
    ...privateTempRoot(
      fileURLToPath(new URL("./test/support/globalSetup.ts", import.meta.url)),
      tmpdir(),
      process.pid,
    ),
    environment: "node",
    // Child-process cases shell out to the CLI entry; 20s is generous for a cold start
    // and still fails fast if a spawn hangs. On win32 the parallel project raises it (see
    // WINDOWS_PARALLEL_TEST_TIMEOUT_MS); the serialized group and every POSIX run keep 20s.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Coverage is opt-in (`--coverage`), so plain `npm test` keeps its wall time.
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      // Report-only globally: NO top-level statements/branches/functions/lines keys.
      // The only blocking floors are the glob-keyed ones below, so a low-coverage
      // non-core file prints in the report and can never fail the run.
      //
      // The bounded core — the merge lane that decides what lands on a user's disk
      // and the emit lane that decides what those bytes say — is held at 100%.
      // v8 sees only in-process execution, so these floors are met by the unit and
      // golden lanes alone; nothing here counts on the child-process e2e cases.
      //
      // Per-file keys are exceptions, never silent ones: each names the exact branch
      // that no public input reaches and states why. Functions stay at 100 across the
      // whole core, and lines never drop below 98.
      //
      // Glob keys are evaluated independently, so an overlapping pair would apply
      // BOTH floors and a per-file exception could never take effect. The directory
      // keys therefore exclude their own exception files by name, leaving the two
      // sets disjoint — and leaving any file NOT named below (a newly added merge or
      // emit module included) on the full 100% floor.
      thresholds: {
        "src/merge/!(atomicWrite|managedBlocks|safeWrite).ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // `agentsMd` earns the full floor: its line counter used to carry an
        // empty-input return and an unterminated-tail ternary that no caller
        // could produce an input for, and it now exploits the single-trailing-
        // newline guarantee its only input already carries instead of branching
        // on cases that cannot arise.
        "src/emit/!(capabilityMatrix|planner|skillsProjection).ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },

        // Two post-validation narrowings: `enforcementCell`'s `guarantee === undefined`
        // (L180) and the `facts === undefined` refusal inside the TOOLS map (L315).
        // `requireExactToolCoverage` has already proved both data sets cover every
        // client exactly once by the time either runs, so neither lookup can miss.
        "src/emit/capabilityMatrix.ts": {
          statements: 96,
          branches: 93,
          functions: 100,
          lines: 100,
        },

        // Four unreachable legs: `hookScriptArtifactId`'s extension-less fallback
        // (L194 `: base`) — core hook scripts are always `*.mjs`; the equal-key arms
        // of the two path comparators (L248, L403 `: 0`) — paths are unique by
        // construction, one set being a Map keyed by path; and the empty-owners else
        // at L345 — `policy.owners` IS the selected-tool list the enclosing block
        // already proved non-empty. L443's no-corpus-root arm is reachable only with
        // a pack installed through the composer's own on-disk resolution, which the
        // e2e lane exercises in a child process v8 cannot see.
        "src/emit/planner.ts": { statements: 100, branches: 90, functions: 100, lines: 100 },

        // Four legs the catalog's own admission rules close before this module
        // runs. The equal-key arms of the two comparators (L162, L294 `: 0`):
        // paths within one projection and entry names within one directory are
        // unique by construction, so no comparison returns zero. The
        // no-frontmatter return in `toSpecFrontmatter` (L203) and the
        // empty-metadata skip (L227): a skill reaches this module only after the
        // catalog read an `id` and a `type` out of its frontmatter — true of a
        // corpus OR a pack skill alike, since both walk through the same
        // `scanClass` (`../content/catalog.ts`), which drops a frontmatter-less
        // document before any item reaches this module — so the head always
        // parses AND always contributes at least those two non-spec keys to the
        // hoisted map. Both guards enforce that invariant rather than assume it.
        // `test/emit/skillsProjection.test.ts`'s "toSpecFrontmatter document-shape
        // edges" now exercises both arms directly as calls to the exported
        // function — real coverage, not a gap — but they stay DEFENSIVE by this
        // floor's own accounting: no production call path (corpus walk or pack
        // walk) can still hand this function either shape, so the floor is not
        // raised to 100 on the strength of a direct call proving what the walk
        // already refuses to produce.
        "src/emit/skillsProjection.ts": {
          statements: 98,
          branches: 90,
          functions: 100,
          lines: 100,
        },

        // The owned-path bound (REQ-PLUGIN-045): manifest validation and the
        // reclaim sweep refuse what it refuses, so every leg it has is a line of
        // the ledger's security boundary and none is exempt.
        "src/manifest/ownedPaths.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },

        // `releaseInProcessLock`'s `if (entry)` else: every caller reserves
        // before releasing and the release closure is idempotent-guarded, so a
        // release for a path holding no reservation has no path to it.
        "src/merge/atomicWrite.ts": { statements: 100, branches: 98, functions: 100, lines: 100 },

        // Two guards protecting the block detector's own ordering invariant: the
        // token-before-`fromIdx` skip in `findAnchoredLine` (L152 else) and the
        // reversed-pair `continue` in `detectBlock` (L222). The END search starting
        // past the BEGIN line is what makes both unreachable — they exist so the
        // invariant is enforced rather than assumed.
        "src/merge/managedBlocks.ts": { statements: 99, branches: 98, functions: 100, lines: 100 },

        // `stripBlockVersionStamp`'s two early returns (L188, L190) sit behind
        // `isMergeUnchanged`, whose only two call sites are already gated on
        // `hasManagedBlock(existingContent)` — a detected block always splits and
        // always contains a newline. The three `?? ""` fallbacks (L326, L329, L333)
        // are index-access narrowing that the surrounding `< lines.length` bound
        // already guarantees. `repairTruncatedBlock`'s `terminated === null` throw
        // (L560) needs a healable prefix that no END marker closes, but the caller
        // is gated on `isHealableManagedPrefix`, which found exactly such a variant.
        "src/merge/safeWrite.ts": { statements: 97, branches: 95, functions: 100, lines: 98 },
      },
    },
  },
});
