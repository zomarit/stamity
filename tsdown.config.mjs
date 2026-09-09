import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig } from "tsdown";

// Plain ESM JavaScript, loaded with `--config-loader native` (see the build script): together
// that is a bare `import` of this file, with no TypeScript stripping and no third-party loader,
// so it behaves identically across the supported range. The two alternatives both break inside
// it — `auto` resolves to the uninstalled `unrun` on any runtime without native type stripping,
// which the old 22.12 floor was and a host Node below the declared `>=22.22.2` still is, and
// `tsx` crashes tsdown's CJS config load on Node 24 (`ENOENT ... node:fs?tsx-namespace=<uuid>`,
// tsx 4.23.12, the current release). Authoring this config in TypeScript is what would
// reintroduce that choice; keep it JavaScript.

// ── Dual budget ──────────────────────────────────────────────────────────────
// Two numbers, because dist/ holds two things with unrelated growth curves: the
// bundled logic, which grows when code is added, and the staged corpus, which grows
// when content is authored. One combined figure lets either hide inside the other —
// which is how this tree reached 4.05 MiB unpacked with nothing measuring it.
//
// Both are BLOCKING: an unenforced number is a comment, and this is an npx-first CLI
// where the download precedes the first useful second a user gets.

/**
 * The bundled logic half — every `.js` tsdown emits into dist/, entries and shared
 * chunks together.
 *
 * 2 MiB, and held there. Not derived from the current build: it is the ceiling
 * the distribution design fixed for the logic bundle. What follows is the
 * measurement it is held against, taken on the build that stripped JSDoc from
 * the output (`outputOptions` below).
 *
 * Measured basis — ONE figure, pinned to the tree it was taken on, because a
 * figure pinned to nothing drifts and then disagrees with its own copies.
 * BEFORE is the clean head b2d51a6, where the build printed 2,081,093 bytes of
 * the 2,097,152-byte budget: 99.2% spent, 16,059 bytes of headroom, under one
 * percent. What the strip recovers is measured on that same ONE tree — b2d51a6
 * with only `comments: { jsdoc: false }` changed — and it is 1,014,152 bytes,
 * 48.7% of what the logic half used to be.
 *
 * There is deliberately no AFTER figure written here for the current tree. The
 * `[size]` line prints it on every build (see below), and it is a NET of two
 * effects rather than a comment measurement: the strip recovered the space, and
 * this tree's own shipped code moved the other way over the same interval — the
 * emitted review-gate script alone is several kilobytes larger here than at
 * b2d51a6, which `wc -c` on
 * `.stamity/generated/hooks/claude/stamity-review-gate.mjs` against that tree's
 * copy checks in one command, and it keeps moving. A hand-copied after-figure
 * is what left this file, and the test that pins the strip, quoting three
 * different numbers for one measurement.
 * Nothing published reads the comments: package.json's `exports` maps `.` to
 * `./dist/index.js` and `./package.json`, with no `types` condition, so the
 * shipped surface is the bin plus one re-export module. The prose belongs in
 * src/, where a reader can see the code it describes; the bundle is a
 * download.
 *
 * Why the ceiling is not redrawn onto the new figure: the recovered space is
 * headroom on purpose. The budget's job is unchanged — a build that crosses it
 * is a review prompt ("what got bundled?"), not a number to raise — and a
 * ceiling pinned to today's measurement becomes a high-water mark that ratchets
 * on every commit, which is what the number was set to avoid. Moving it in
 * either direction is a change with its own reason recorded beside it, not a
 * consequence of this one.
 *
 * The `[size]` line every build prints is the figure of record. Read it, not
 * this paragraph: nothing recomputes these figures, and the earlier wording here
 * ("roughly 1.5 MiB measured, so ~0.5 MiB of room to grow") drifted far enough
 * to size other people's changes against room that did not exist.
 *
 * What that line is NOT is the guard. Two ways the logic half roughly doubles
 * again with no code added — the `comments` option removed, or a
 * tsdown/rolldown upgrade changing what it defaults to, since package.json pins
 * tsdown by caret — and neither one FAILS anything here, because the pre-strip
 * measurement (2,081,093 bytes) is under this ceiling: the build would exit 0,
 * the `size-budget` check would pass, and the megabyte would be back in every
 * npx download with a printed line as its only trace. The gate against that is
 * a test, not a budget — `test/support/support.test.ts` asserts this config's
 * `outputOptions.comments.jsdoc === false`, and that assertion goes red on both
 * regressions. This ceiling catches something else: bytes ARRIVING, a
 * dependency or a fixture tree bundled in.
 */
export const LOGIC_BUDGET_BYTES = 2 * 1024 * 1024;

/**
 * The staged corpus half — `dist/content` plus `dist/packs`, the DATA the runtime
 * reads.
 *
 * 1.5 MiB, roughly three times the measured staged tree (519,715 bytes = 0.50 MiB
 * across the corpus and the three bundled packs — the `[size]` line's corpus
 * figure on this tree, 2026-09-07). Content earns its way
 * in one artifact at a time, so the ratio is wide on purpose: the ceiling exists to
 * catch a category error — a fixture tree, a build directory, a media file staged by
 * accident — not to ration authoring.
 */
export const CORPUS_BUDGET_BYTES = 1536 * 1024;

/**
 * Which budget a dist-relative POSIX path counts against.
 *
 * The corpus prefixes are checked first, so a `.js` staged as DATA under
 * `content/` or `packs/` counts as corpus rather than as bundled logic. Every
 * other JavaScript chunk is logic at any depth — entries at the root today, and
 * a shared chunk under a subdirectory if a future tsdown/rolldown release starts
 * placing one there. Depth used to be part of the test
 * (`!relPath.includes("/")`), which made a nested chunk `other`: printed, never
 * a violation, so a chunk-naming change would have moved the logic half's bytes
 * out of both budgets without failing anything.
 *
 * The extension test is `/\.[cm]?js$/` rather than `.js` alone for the same
 * reason the depth test went: `fixedExtension: false` keeps today's output on
 * plain `.js`, but that is an option and a bundler default, not a guarantee. An
 * `.mjs` or `.cjs` chunk under a changed emit would have been `other` —
 * unbudgeted bytes in a printed line that can never fail — which is the exact
 * escape the depth fix closed.
 *
 * Sourcemaps stay deliberately unclassified: they are not emitted (see
 * `sourcemap` below), and if one ever reappears it should surface as an
 * unbudgeted file rather than quietly consume the logic half.
 */
export function classifyDistEntry(relPath) {
  if (relPath.startsWith("content/") || relPath.startsWith("packs/")) return "corpus";
  if (/\.[cm]?js$/.test(relPath)) return "logic";
  return "other";
}

/**
 * Total each half and report the ones over budget.
 *
 * Pure over `[{ relPath, bytes }]` so the gate is testable without a build: the
 * caller supplies the listing, and a seeded oversize row proves the measurement
 * fires rather than proving that today's build happens to fit.
 *
 * @param {readonly {relPath: string, bytes: number}[]} files
 */
export function checkSizeBudgets(files) {
  const totals = { logic: 0, corpus: 0, other: 0 };
  for (const file of files) totals[classifyDistEntry(file.relPath)] += file.bytes;

  const budgets = [
    { half: "logic", bytes: totals.logic, budget: LOGIC_BUDGET_BYTES },
    { half: "corpus", bytes: totals.corpus, budget: CORPUS_BUDGET_BYTES },
  ];
  return {
    ...totals,
    budgets,
    violations: budgets.filter((row) => row.bytes > row.budget),
  };
}

/** `<n> bytes (<n.nn> MiB)` — both, so a budget diff is readable and exact. */
export function formatBytes(bytes) {
  return `${bytes} bytes (${(bytes / (1024 * 1024)).toFixed(2)} MiB)`;
}

/** Every file under `dir`, as dist-relative POSIX paths with their byte counts. */
async function listTree(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  return await Promise.all(
    files.map(async (entry) => {
      const absPath = join(entry.parentPath, entry.name);
      return {
        relPath: absPath.slice(dir.length + 1).split("\\").join("/"),
        bytes: (await stat(absPath)).size,
      };
    }),
  );
}

/**
 * The post-build gate. Runs in `build:done`, which tsdown calls AFTER `copy` has
 * staged the corpus, so one walk sees both halves.
 *
 * Throwing here fails the build, which is the point: the alternative is a warning
 * nobody reads in a log nobody opens.
 */
async function reportSizeBudgets(outDir) {
  const report = checkSizeBudgets(await listTree(outDir));
  const line = (row) =>
    `${row.half}: ${formatBytes(row.bytes)} of ${formatBytes(row.budget)} budget`;
  for (const row of report.budgets) console.info(`[size] ${line(row)}`);
  if (report.other > 0) console.info(`[size] unbudgeted: ${formatBytes(report.other)}`);

  if (report.violations.length > 0) {
    throw new Error(
      `size budget exceeded — ${report.violations.map(line).join("; ")}. ` +
        `Reduce what landed in ${outDir}/, or move the budget in tsdown.config.mjs with ` +
        `the reason it moved.`,
    );
  }
}

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  // Deliberately at or below the declared engines floor, and not a second spelling of it:
  // the target only ever downlevels, so a number under the floor stays correct output for
  // every Node the floor admits. Raising it to match `>=22.22.2` changes emitted bytes, and
  // therefore what the dual budget above measures — a build decision of its own rather than
  // part of a floor move.
  target: "node22.12",
  // The package is type: module, so ESM output keeps the plain .js extension the bin
  // entry in package.json points at.
  fixedExtension: false,
  // Deterministic output names: dist/ is diffable between builds.
  hash: false,
  clean: true,
  // No sourcemaps. `files: ["dist"]` publishes this directory whole, so a .map is
  // download weight on every install of an npx-first CLI — 2.54 MiB of the 4.05 MiB
  // unpacked tree measured before this line changed, more than the logic and the
  // corpus put together, and neither budget above covers it. Nothing consumes them:
  // no published `sources` reader, no stack-trace lane in the suite. A maintainer
  // debugging a bundled stack turns this on locally rather than shipping it to
  // everyone.
  sourcemap: false,
  // No JSDoc in the emitted bundles. The bundle is the shipped artifact, not the
  // reading copy: this codebase's reasoning lives in src/, which is where a reader
  // should meet it, and documentation comments were 48.7% of the logic half by
  // measurement (see LOGIC_BUDGET_BYTES above) — download weight on every npx run
  // that answers nobody's question. `gzip -9` over the three emitted files totalled
  // 671,973 bytes before and 291,932 after, which is closer to what an install pays.
  // Rolldown drops plain line and block comments whatever this option says (its own
  // note on `comments`: "Regular line and block comments without these markers are
  // always removed regardless of this option"); `legal` and `annotation` stay on
  // by default, so `@license`/`@preserve` notices and the `/*#__PURE__*/`
  // tree-shaking hints survive. Comments carry no semantics, and the emission proves
  // it: running `init --yes --tools claude` into two fresh fixture repositories, one
  // with each bundle, produced 61 files whose only difference was the created/updated
  // timestamp pair in `.stamity/manifest.json`.
  outputOptions: { comments: { jsdoc: false } },
  treeshake: true,
  failOnWarn: true,
  // Declaration emit stays off on ONE reason: nothing consumes this package as a
  // typed library — `exports` publishes `./dist/index.js` with no `types` condition,
  // and the surface users touch is the bin.
  //
  // Not for want of a generator. rolldown-plugin-dts (installed, tsdown's own dts
  // dependency, 0.27.14) selects its `tsgo` generator when TypeScript 7 is present
  // (`isTS70Installed()` in its dist/index.mjs), which is this repo's typescript
  // 7.0.2 — the earlier claim that no dts generator supports the TS7 native compiler
  // was wrong. What that path does carry is the vendor's own caveat, printed once on
  // every such run: "TypeScript 7.0 does not yet have a stable API and is
  // experimental. Some options will be unavailable."
  dts: false,
  // The corpus and the bundled packs are DATA the runtime reads, not modules the
  // bundler can follow: `resolveBundledContentRoot()` probes `<packageRoot>/content`
  // then `<packageRoot>/dist/content`, and `files: ["dist"]` means only the second
  // one is inside the published tarball. Without this staging step the build
  // produced a dist/ that works in a source checkout (candidate 1 still resolves)
  // and a published package with no corpus at all — `init` failing with
  // CONFIG_ERROR on the first command a user runs, invisible to every check that
  // runs from the repo. Staged here rather than in a separate script so the
  // guarantee holds for anyone who runs the build, not only for CI.
  // `to` names the PARENT the source directory lands in, so `dist` yields
  // `dist/content` and `dist/packs` — the two paths the readers probe.
  copy: [
    { from: "content", to: "dist", flatten: false },
    { from: "packs", to: "dist", flatten: false },
  ],
  // Measured here rather than in a package.json script: the budget belongs to the
  // build that produces the tree, so it holds for anyone who runs the build and not
  // only for whoever remembers the extra command.
  hooks: {
    "build:done": async (ctx) => {
      await reportSizeBudgets(ctx.options.outDir);
    },
  },
});
