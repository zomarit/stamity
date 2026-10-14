import { createHash } from "node:crypto";
import { cp, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, type TestContext } from "vitest";
import { makeCliFixture, type CliFixture } from "../support/cliHarness.ts";
import { ensureDistBuilt } from "../support/distBuild.ts";
import { seedGitRepo } from "../support/repoFixtures.ts";

/**
 * The upgrade proof (REQ-PLUGIN-046, plan 020-cli-native-01 unit d9): a tree the released 1.14.0
 * wrote goes through this checkout's BUILT `sync` and `check` (`node dist/cli.js`, cliHarness
 * `entry: "dist"`), the way an operator's repository meets 1.15.0 the first time.
 *
 * The fixture, `test/fixtures/release-1-14-0-tree/`, is the released package's own output, never
 * hand-written: on 2026-10-14, in a scratch git repository seeded with this file's two user files
 * (`package.json` as `tsRepoFiles()` writes it, `tsconfig.json`) and one committed source file,
 * `npx -y @zomarit/stamity@1.14.0 init --tools claude,cursor,copilot,codex -y` ran under an empty
 * HOME. Everything it left beside `.git/` is kept, all four clients: the largest file is the
 * manifest at 79 KB, well inside the repository's 1 MB per-file hygiene budget, so the two-client
 * trim the plan allows for an oversized fixture was not needed. The source file is left out: `sync`
 * over the tree without it wrote the same bytes and the same manifest (bar `updatedAt`), and kept,
 * it would sit inside this repository's own typecheck and dead-code scopes as an orphan. The
 * fixture is LF on every checkout (`.gitattributes`), which the recorded content hashes need.
 *
 * One encoding, undone on copy: each of the tree's twenty `.mjs` files is stored as
 * `<name>.mjs.fixture`, bytes untouched. Under `test/` a `.mjs` file is a test source to the
 * test-input census (`test/ci/testInputsGuard.test.ts`), and the 1.14.0 session-start hook holds a
 * regex literal past that guard's 200-character bound, which fails it; the linters would also read
 * shipped hook bytes as this repository's source. {@link upgradeFixture} renames them back before
 * the commit, so `sync` meets the tree exactly as 1.14.0 wrote it.
 *
 * What the cases hold, and nothing about the manifest's own shape beyond its ledger's `path`s and
 * the held `plugin` block: the manifest generation moves in this package (a migration on read), and
 * the claims here are the upgrade's, not a schema's.
 *   - `sync` exits 0; every path the 1.14.0 ledger recorded either is still owned after it (rewritten
 *     or confirmed under the owner rules) or was reclaimed; every other file the tree held — the
 *     user's — keeps its bytes; any file `sync` adds is one the new ledger owns.
 *   - a second `sync` moves no byte: the one permitted difference is the manifest's `updatedAt`, the
 *     write clock `sync` stamps on every run (the same allowance the dist dogfood journey makes).
 *   - `check` exits 0 on the upgraded tree, its `plugin-duplicates` row `pass`.
 *   - with the 1.14.0 `plugin` block added to the manifest, `sync` keeps the block value-identical
 *     and `check` still exits 0, the row `warn`.
 *
 * Git-less machines skip per the harness convention. The fixture is committed before the first
 * `sync`, as an operator's tree would be, so an overwrite is recoverable from history and no `.bak`
 * is taken.
 */

/** Per-case budget: two or three cold dist runs over a ~200-file four-client tree, plus the copy. */
const CASE_TIMEOUT_MS = 240_000;

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/release-1-14-0-tree", import.meta.url));

/** The suffix the fixture's `.mjs` files are stored under (see the header). */
const STORED_SUFFIX = ".fixture";

/** How many `.mjs` files the released 1.14.0 four-client tree holds. */
const STORED_SCRIPT_COUNT = 20;

/** Repo-relative manifest path; structural, never imported from src/ (cliHarness lane discipline). */
const MANIFEST_REL = ".stamity/manifest.json";

/** The manifest as observed on disk: only what the claims above read. */
interface ObservedManifest {
  updatedAt?: unknown;
  ledger: { path: string }[];
  plugin?: unknown;
  [key: string]: unknown;
}

/** One `check --json` doctor row. */
interface DoctorRow {
  id: string;
  status: string;
  detail: string;
}

/**
 * The block a 1.14.0 manifest carried when it recorded plugin installs, in that release's
 * `PluginConfig` shape (`mode`, `clients.<tool>.{version, classes}`). `mode: "generated"` is
 * legal 1.14.0 with `clients` present (the record names the roots without moving ownership), which
 * keeps the fixture's generated tree exactly what that manifest describes. Two clients, so the
 * warning has more than one line to carry.
 */
const HELD_PLUGIN_BLOCK = {
  mode: "generated",
  clients: {
    claude: { version: "1.14.0", classes: ["skill", "command"] },
    cursor: { version: "1.14.0", classes: ["rule"] },
  },
};

/** sha256 per file under `dir`, keyed by repo-relative POSIX path, `.git/` excluded. */
async function treeHashMap(dir: string): Promise<Map<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      abs: join(entry.parentPath, entry.name),
      rel: join(entry.parentPath, entry.name).slice(dir.length + 1).split(sep).join("/"),
    }))
    .filter(({ rel }) => rel !== ".git" && !rel.startsWith(".git/"));
  const map = new Map<string, string>();
  await Promise.all(
    files.map(async ({ abs, rel }) => {
      map.set(rel, createHash("sha256").update(await readFile(abs)).digest("hex"));
    }),
  );
  return map;
}

async function readManifest(repoDir: string): Promise<ObservedManifest> {
  return JSON.parse(await readFile(join(repoDir, ...MANIFEST_REL.split("/")), "utf8")) as ObservedManifest;
}

function ledgerPaths(manifest: ObservedManifest): Set<string> {
  return new Set(manifest.ledger.map((row) => row.path));
}

/** The manifest minus its write clock, for the second-sync comparison. */
function withoutClock(manifest: ObservedManifest): Record<string, unknown> {
  const { updatedAt: _clock, ...rest } = manifest;
  return rest;
}

/** Renames every `<name>.mjs.fixture` under `dir` back to `<name>.mjs`; returns how many. */
async function restoreStoredScripts(dir: string): Promise<number> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const stored = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(`.mjs${STORED_SUFFIX}`))
    .map((entry) => join(entry.parentPath, entry.name));
  await Promise.all(stored.map((path) => rename(path, path.slice(0, -STORED_SUFFIX.length))));
  return stored.length;
}

/**
 * A fresh pseudo-home fixture holding a copy of the 1.14.0 tree, its scripts renamed back,
 * committed. `edit` runs on the copy before the commit. A missing git binary skips the case; any
 * other failure cleans up and throws.
 */
async function upgradeFixture(
  ctx: TestContext,
  edit?: (repoDir: string) => Promise<void>,
): Promise<CliFixture> {
  const fixture = await makeCliFixture({ entry: "dist" });
  try {
    await cp(FIXTURE_DIR, fixture.repoDir, { recursive: true });
    const restored = await restoreStoredScripts(fixture.repoDir);
    if (restored !== STORED_SCRIPT_COUNT) {
      throw new Error(`expected ${STORED_SCRIPT_COUNT} stored .mjs files in the fixture, found ${restored}`);
    }
    if (edit !== undefined) await edit(fixture.repoDir);
    await seedGitRepo(fixture.repoDir);
  } catch (error) {
    await fixture.cleanup();
    if (error instanceof Error && error.name === "GitUnavailableError") ctx.skip();
    throw error;
  }
  return fixture;
}

/** `check --json`'s doctor row by id; fails the case when the row is missing. */
function doctorRow(stdout: string, id: string): DoctorRow {
  const report = JSON.parse(stdout) as { doctor: DoctorRow[] };
  const row = report.doctor.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`check --json carries no ${id} row:\n${stdout}`);
  return row;
}

describe("a 1.14.0 tree upgrades through the current sync and check (node dist/cli.js)", () => {
  beforeAll(async () => {
    await ensureDistBuilt();
  }, CASE_TIMEOUT_MS);

  it("syncs under the owner rules, a second sync moves no byte, and check exits 0", {
    timeout: CASE_TIMEOUT_MS,
  }, async (ctx) => {
    const fixture = await upgradeFixture(ctx);
    try {
      const before = await treeHashMap(fixture.repoDir);
      const ownedBefore = ledgerPaths(await readManifest(fixture.repoDir));
      // The fixture is the four-client tree, not an empty one: the walk below has work to do.
      expect(ownedBefore.size).toBeGreaterThan(100);

      const first = await fixture.run(["sync"]);
      expect(first.code, `first sync failed:\n${first.stdout}\n${first.stderr}`).toBe(0);

      const afterFirst = await treeHashMap(fixture.repoDir);
      const upgraded = await readManifest(fixture.repoDir);
      const ownedAfter = ledgerPaths(upgraded);

      const rewritten: string[] = [];
      const reclaimed: string[] = [];
      const userFiles: string[] = [];
      for (const [path, hash] of before) {
        if (path === MANIFEST_REL) continue;
        if (ownedBefore.has(path)) {
          if (!afterFirst.has(path)) reclaimed.push(path);
          else {
            // Still on disk, so still the engine's: a path sync keeps but no longer owns would be
            // an orphan nothing reclaims.
            expect(ownedAfter.has(path), `${path} stayed on disk but left the ledger`).toBe(true);
            if (afterFirst.get(path) !== hash) rewritten.push(path);
          }
        } else {
          userFiles.push(path);
          expect(afterFirst.get(path), `the user's ${path} was moved by sync`).toBe(hash);
        }
      }
      // Activated, not a no-op: 1.14.0's content is behind this checkout's, so the upgrade rewrites
      // engine files, and the tree holds user files whose bytes the walk above held still.
      expect(rewritten.length).toBeGreaterThan(0);
      expect(userFiles.length).toBeGreaterThan(0);
      for (const path of reclaimed) {
        expect(ownedAfter.has(path), `${path} was reclaimed yet is still in the ledger`).toBe(false);
      }
      for (const path of afterFirst.keys()) {
        if (before.has(path) || path === MANIFEST_REL) continue;
        expect(ownedAfter.has(path), `sync created ${path}, which no ledger row owns`).toBe(true);
      }

      const second = await fixture.run(["sync"]);
      expect(second.code, `second sync failed:\n${second.stdout}\n${second.stderr}`).toBe(0);
      const afterSecond = await treeHashMap(fixture.repoDir);
      expect([...afterSecond.keys()].toSorted()).toEqual([...afterFirst.keys()].toSorted());
      for (const [path, hash] of afterFirst) {
        if (path === MANIFEST_REL) continue;
        expect(afterSecond.get(path), `the second sync moved ${path}`).toBe(hash);
      }
      expect(withoutClock(await readManifest(fixture.repoDir))).toEqual(withoutClock(upgraded));

      const check = await fixture.run(["check", "--json"]);
      expect(check.code, `check failed:\n${check.stdout}\n${check.stderr}`).toBe(0);
      // The contrast for the variant below: no held block, no leftover warning.
      expect(doctorRow(check.stdout, "plugin-duplicates").status).toBe("pass");
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps a held 1.14.0 plugin block through sync, and check exits 0 with plugin-duplicates warn", {
    timeout: CASE_TIMEOUT_MS,
  }, async (ctx) => {
    const fixture = await upgradeFixture(ctx, async (repoDir) => {
      const manifestPath = join(repoDir, ...MANIFEST_REL.split("/"));
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ObservedManifest;
      manifest.plugin = HELD_PLUGIN_BLOCK;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    });
    try {
      const sync = await fixture.run(["sync"]);
      expect(sync.code, `sync failed:\n${sync.stdout}\n${sync.stderr}`).toBe(0);
      // Held, not read: the block sync writes back is the one 1.14.0 recorded, value for value.
      expect((await readManifest(fixture.repoDir)).plugin).toEqual(HELD_PLUGIN_BLOCK);

      const check = await fixture.run(["check", "--json"]);
      expect(check.code, `check failed:\n${check.stdout}\n${check.stderr}`).toBe(0);
      const row = doctorRow(check.stdout, "plugin-duplicates");
      expect(row.status).toBe("warn");
      expect(row.detail).toContain("claude:");
      expect(row.detail).toContain("cursor:");
    } finally {
      await fixture.cleanup();
    }
  });
});
