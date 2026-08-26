import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
import { stateKeepPaths } from "../../src/emit/stateScaffold.ts";
import { readManifest } from "../../src/manifest/manifest.ts";
import type { Tool } from "../../src/types/core.ts";
import { MANIFEST_FILE, type LedgerOwner, type SetupManifest } from "../../src/types/manifest.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import type { GitRunner } from "../../src/workspace/git.ts";
import { makeTempDir } from "../support/tempDir.ts";

/**
 * The one canonical fixture behind the emission regression net: a temp repo the REAL
 * init write path (planner -> safeWrite -> ledger -> manifest) runs against,
 * shared by the cross-client golden suite and the sync/drift proof.
 *
 * Nothing here reconstructs an expectation. The fixture seeds a repo, calls the
 * shipped `buildInitDecisions` + `applyInit`, and reads the resulting tree back
 * off disk — so a golden that moves means emitted bytes moved, never that a
 * test-side rebuild of the same logic moved with it.
 *
 * What the seed is FOR, one clause per file group:
 *   - `package.json` + `tsconfig.json` + `vitest.config.ts` + `eslint.config.js`
 *     + `.github/workflows/` — the four detection facts emission substitutes on
 *     (typescript / eslint / vitest / github-actions). Asserted, not assumed:
 *     the golden suite reads them back off the persisted manifest.
 *   - `workspaces` + `packages/alpha` + `packages/beta` — the monorepo layout
 *     that makes nested `AGENTS.md` emission reachable.
 *   - `.stamity/hooks/` — one user-authored hook, so every client's hook surface
 *     is exercised with a user row beside the generated ones.
 *
 * Determinism is a contract of this module, not a hope: the clock is injected
 * ({@link GOLDEN_NOW}), the engine version is pinned
 * ({@link GOLDEN_ENGINE_VERSION}), and the git seam is stubbed
 * ({@link goldenGitRunner}) so no child process and no wall clock reaches the
 * emitted bytes. Two `makeGoldenRepo` calls with equal options produce
 * byte-identical trees; the suite proves that rather than trusting it.
 */

/** Engine version stamped into managed blocks and version fields. Pinned, never `package.json`'s. */
export const GOLDEN_ENGINE_VERSION = "1.0.0-golden";

/** Injected clock for manifest timestamps — the only wall-clock input emission has. */
export const GOLDEN_NOW = new Date("2026-08-14T00:00:00.000Z");

/** One pinned catalog server, so the MCP substrate emits in every client's dialect. */
export const GOLDEN_MCP_SERVER_ID = "github";

/** The user-authored hook the fixture commits; adapters carry it beside the generated rows. */
export const GOLDEN_USER_HOOK = Object.freeze({
  event: "pre_tool_use",
  matcher: "Bash",
  command: Object.freeze(["node", ".stamity/hooks/guard.mjs"]),
  timeoutMs: 5000,
});

/**
 * Repo-relative seed map, written before init runs. Frozen: every suite reads
 * the same bytes, and a test that needs a variation makes its own copy rather
 * than mutating the shared fixture.
 */
export const GOLDEN_SEED_FILES: Readonly<Record<string, string>> = Object.freeze({
  "package.json": `${JSON.stringify(
    {
      name: "golden-fixture",
      version: "1.0.0",
      private: true,
      type: "module",
      workspaces: ["packages/*"],
      // A real project declares the scripts its gates call. Emission states
      // verification commands as detection-derived FACTS, so a fixture with no
      // scripts and no lockfile goldened a charter telling the reader to run
      // commands that repo could not execute.
      scripts: { test: "vitest run", lint: "eslint .", typecheck: "tsc --noEmit" },
      devDependencies: { eslint: "^9.0.0", typescript: "^5.9.0", vitest: "^2.0.0" },
    },
    null,
    2,
  )}\n`,
  // pnpm, deliberately not npm: the gates must be resolved from the repo's own
  // package manager, and a fixture on the default would let a hard-coded `npm`
  // pass forever.
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "tsconfig.json": `${JSON.stringify(
    { compilerOptions: { strict: true, module: "nodenext", moduleResolution: "nodenext" } },
    null,
    2,
  )}\n`,
  "vitest.config.ts": 'import { defineConfig } from "vitest/config";\n\nexport default defineConfig({});\n',
  "eslint.config.js": "export default [];\n",
  ".github/workflows/ci.yml": "name: ci\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
  "src/index.ts": "export const fixture = true;\n",
  "packages/alpha/package.json": `${JSON.stringify({ name: "@golden/alpha", version: "1.0.0", private: true }, null, 2)}\n`,
  "packages/alpha/src/index.ts": "export const alpha = true;\n",
  "packages/beta/package.json": `${JSON.stringify({ name: "@golden/beta", version: "1.0.0", private: true }, null, 2)}\n`,
  "packages/beta/src/index.ts": "export const beta = true;\n",
  ".stamity/hooks/guard.mjs": "process.exit(0)\n",
  ".stamity/hooks/hooks.json": `${JSON.stringify(
    {
      hooks: [
        {
          event: GOLDEN_USER_HOOK.event,
          matcher: GOLDEN_USER_HOOK.matcher,
          command: [...GOLDEN_USER_HOOK.command],
          timeoutMs: GOLDEN_USER_HOOK.timeoutMs,
        },
      ],
    },
    null,
    2,
  )}\n`,
});

/**
 * Engine-written paths that carry no ledger row BY DESIGN, so the completeness
 * assertion can name its exemptions instead of hand-waving them:
 *   - the manifest is the ledger's own home — a row for itself would authorise
 *     a reclaim sweep to delete the record of what may be reclaimed;
 *   - `.gitignore` is a one-line rule maintained by `ensureGitignoreEntry`, not
 *     a planned emission — the engine appends to a user-owned file;
 *   - the two state-directory placeholders are scaffolding, like the
 *     directories that hold them (`src/emit/stateScaffold.ts`). Git
 *     tracks files rather than directories, so without them a clone loses
 *     `.stamity/learnings/` and `.stamity/handoffs/` and `check` warns about it
 *     forever. As LEDGERED rows a missing placeholder would be
 *     missing-generated-file drift — a red `check` and an exit 1 where the
 *     honest verdict is an advisory "the stores rebuild these on first write".
 */
export const UNLEDGERED_ENGINE_PATHS: ReadonlySet<string> = new Set([
  `${STATE_DIR}/${MANIFEST_FILE}`,
  ".gitignore",
  ...stateKeepPaths(),
]);

/**
 * Reserved product names, assembled from fragments at runtime so this file
 * never contains one literally — the same technique
 * `scripts/leak-gate.mjs` uses on itself, and for the same reason: the
 * gate scans every tracked file including this one, with no test exemption.
 */
const RESERVED_NAME_FRAGMENTS: readonly (readonly string[])[] = [
  ["tess", "ity"],
  ["apris", "ity"],
  ["h4t", "cher"],
  ["hat", "ch3r"],
];

/**
 * Git seam stub: a clean working tree with no child process. `planSync` takes
 * the runner injected, so this keeps the sync proof deterministic on machines
 * with and without git, and keeps a developer's own repo state out of the plan.
 */
export const goldenGitRunner: GitRunner = () => "";

/** A fixture repo: where it lives, what init persisted, and how to drop it. */
export interface GoldenRepo {
  /** Absolute, symlink-resolved repo root the emission was written into. */
  rootDir: string;
  /** The manifest exactly as init persisted it — ledger included. */
  manifest: SetupManifest;
  /** Removes the temp tree. Idempotent. */
  cleanup(): Promise<void>;
}

/**
 * Seed a repo and run the real init apply against it for `opts.tools`.
 *
 * Decisions come from the shipped `buildInitDecisions` (real detection over the
 * seeded tree) with two pins: `deps.history = null` so no git history seeds the
 * maturity dial, and the tool set forced to exactly `opts.tools` with source
 * `flag` — passing them as an override would route an EMPTY selection through
 * the "no flag given" fallback and silently emit the default single-tool setup.
 *
 * `maturityTier: "team"` is an override rather than a detected value: the tier
 * is a substituted token in the charter, and pinning it keeps the golden from
 * tracking whatever the history seed would have inferred.
 *
 * `opts.seed` replaces {@link GOLDEN_SEED_FILES} wholesale for the cases the
 * shared seed cannot express — a repo with NO CI provider, notably, which the
 * shared seed rules out by always shipping `.github/workflows/ci.yml`. Byte
 * goldens keep using the default seed; a variant seed is for postures, not
 * for snapshot drift.
 */
export async function makeGoldenRepo(opts: {
  tools: readonly Tool[];
  seed?: Readonly<Record<string, string>>;
}): Promise<GoldenRepo> {
  const handle = await makeTempDir("stamity-golden");
  try {
    await handle.seedFiles({ ...(opts.seed ?? GOLDEN_SEED_FILES) });

    const decisions = await buildInitDecisions(
      handle.dir,
      { maturityTier: "team" },
      { history: null },
    );

    await applyInit({
      rootDir: handle.dir,
      decisions: { ...decisions, tools: [...opts.tools], toolsSource: "flag" },
      // The migration carry is the only surface that seeds MCP servers into a
      // fresh manifest, so the fixture reaches the MCP substrate through it.
      defaults: { mcpServers: [GOLDEN_MCP_SERVER_ID] },
      engineVersion: GOLDEN_ENGINE_VERSION,
      dryRun: false,
      force: false,
      now: GOLDEN_NOW,
    });

    const manifest = await readManifest(handle.dir);
    if (manifest === null) {
      throw new Error(`makeGoldenRepo(): init wrote no manifest under ${handle.dir}`);
    }
    return { rootDir: handle.dir, manifest, cleanup: handle.cleanup };
  } catch (error) {
    await handle.cleanup();
    throw error;
  }
}

/**
 * Every file under `rootDir` as `repo-relative POSIX path -> bytes`, sorted by
 * path, with `.git` and `node_modules` pruned.
 *
 * Keys are joined with "/" at every depth rather than run through `path.join`,
 * which is what makes the emitted-tree map identical on Windows and POSIX — the
 * golden asserts that separator normalisation survives the real write path.
 */
export async function readEmittedTree(rootDir: string): Promise<Record<string, string>> {
  const files = await collectFiles(rootDir, "");
  return Object.fromEntries(files.toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Tree keys that init produced — the seeded fixture files subtracted. */
export function emittedPaths(tree: Readonly<Record<string, string>>): string[] {
  return Object.keys(tree).filter((path) => !Object.hasOwn(GOLDEN_SEED_FILES, path));
}

/**
 * Content-addressed view of a tree: `path -> "<sha256> <n> bytes"`.
 *
 * The tree-level golden is a digest rather than inlined bodies because the same
 * corpus body is projected into up to four client dialects — inlining them all
 * would put roughly four copies of the corpus into one snapshot, and a snapshot
 * nobody can read is a snapshot everybody `-u`s. The digest still fails on a
 * single changed byte; the suite pairs it with full-byte goldens of the
 * client-shaped documents, which is where adapter residue actually lives.
 */
export function treeDigest(tree: Readonly<Record<string, string>>): Record<string, string> {
  const digest: Record<string, string> = {};
  for (const path of Object.keys(tree).toSorted()) {
    const content = tree[path] ?? "";
    const bytes = Buffer.byteLength(content, "utf8");
    digest[path] = `${createHash("sha256").update(content, "utf8").digest("hex")} ${bytes} bytes`;
  }
  return digest;
}

/** Ledger owners per emitted path, in ledger order, duplicates preserved as recorded. */
export function ownersByPath(manifest: SetupManifest): Map<string, LedgerOwner[]> {
  const owners = new Map<string, LedgerOwner[]>();
  for (const row of manifest.ledger) {
    owners.set(row.path, [...(owners.get(row.path) ?? []), row.adapter]);
  }
  return owners;
}

/** Ledger `artifactType` values recorded per emitted path. */
export function artifactTypesByPath(manifest: SetupManifest): Map<string, Set<string>> {
  const types = new Map<string, Set<string>>();
  for (const row of manifest.ledger) {
    const seen = types.get(row.path) ?? new Set<string>();
    seen.add(row.artifactType);
    types.set(row.path, seen);
  }
  return types;
}

/** `path -> matched reserved name` for every tree entry carrying one; empty when clean. */
export function findReservedNameHits(tree: Readonly<Record<string, string>>): Record<string, string> {
  const hits: Record<string, string> = {};
  for (const [path, content] of Object.entries(tree)) {
    const haystack = `${path}\n${content}`.toLowerCase();
    const hit = RESERVED_NAME_FRAGMENTS.map((parts) => parts.join("")).find((name) =>
      haystack.includes(name),
    );
    if (hit !== undefined) hits[path] = hit;
  }
  return hits;
}

/** Recursive walk returning `[posixRelativePath, content]` pairs. */
async function collectFiles(dir: string, prefix: string): Promise<[string, string][]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<[string, string][]> => {
      if (entry.name === ".git" || entry.name === "node_modules") return [];
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(absolute, relative);
      if (!entry.isFile()) return [];
      return [[relative, await readFile(absolute, "utf8")]];
    }),
  );
  return nested.flat();
}
