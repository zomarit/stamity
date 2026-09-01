import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Child-process cases shell out to the CLI entry; 20s is generous for a cold start
    // and still fails fast if a spawn hangs.
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

        // `releaseInProcessLock`'s `if (entry)` else (L179): every caller reserves
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
