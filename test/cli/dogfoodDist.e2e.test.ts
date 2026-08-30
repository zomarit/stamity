import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeCliFixture, type CliFixture } from "../support/cliHarness.ts";
import { ensureDistBuilt } from "../support/distBuild.ts";
import { packInstallDir, readLedgerRows, readReceipt, stagePack } from "../support/packFixtures.ts";
import { tsRepoFiles } from "../support/repoFixtures.ts";

/**
 * The built-binary dogfood journey: one serialized lifecycle through plain
 * `node dist/cli.js` (cliHarness `entry: "dist"` — NO tsx loader) in a
 * pseudo-home scratch repo. Every other e2e lane drives the src entry; this
 * file is the proof that the ARTIFACT `npx <cli> init -y` actually executes —
 * the first-run bar — behaves at the process boundary: exit codes, piped
 * stdout completeness, and the bytes it leaves on disk.
 *
 * Scope discipline: this file proves the BINARY, not the engine again — the
 * drift/learn/`clean -y` arcs stay in flows.e2e.test.ts, and the trust-gate
 * matrix stays in installSmoke.e2e.test.ts. What it adds beyond those:
 *   - init/check/add/clean/sync/config/validate all through dist/cli.js;
 *   - post-init `check` reporting drift-clean on the freshly emitted SCRATCH
 *     tree (distinct from the repo-root dogfood check against committed
 *     configs);
 *   - a local-dir pack add via a RELATIVE dot-path spec, receipt-recorded
 *     verbatim;
 *   - `clean --pack` round-trip proven as an exact single-file tree delta;
 *   - second-sync idempotency proven BYTE-STABLE via sha256 tree maps with
 *     `.stamity/manifest.json` `updatedAt` as the sole permitted delta — the
 *     generate-and-diff claim at the binary boundary, stronger than
 *     flows.e2e's count-based assertion.
 *
 * The build precondition is ensureDistBuilt (absent-only build; a stale local
 * dist is accepted by design — see test/support/distBuild.ts). Git-less
 * machines skip per the harness convention: makeCliFixture in the test body,
 * GitUnavailableError -> ctx.skip().
 */

/** The one pack the journey installs, staged from the checkout's supply. */
const PACK_ID = "ops";

/**
 * The local-dir spec, RELATIVE to the fixture repo cwd: stagePack lands the
 * copy at `<tree>/staged/<id>` BESIDE `<tree>/repo` (so repo-tree maps see
 * only engine writes), and `add` resolves dot-path specs against the repo
 * root — the same `looksLikePathSpec` lane `./ops` takes. Forward slashes on
 * purpose: Node path resolution accepts them on every platform, keeping the
 * receipt assertion byte-stable across hosts.
 */
const PACK_SPEC = `../staged/${PACK_ID}`;

/** Sole path permitted to differ across a no-op sync / a clean round-trip. */
const MANIFEST_REL = ".stamity/manifest.json";

/** The manifest as observed on disk — structural, never imported from src/. */
interface ObservedManifest {
  updatedAt: string;
  selection: { items: Record<string, string[]> };
}

/**
 * sha256 per file under `dir`, keyed by repo-relative POSIX path (`sep` split
 * -> "/" join, so Windows separators never skew a compare), `.git/` excluded.
 * The byte-stability assertions diff these maps.
 */
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

/** Sorted key sets — the "no file appeared or vanished" half of a tree diff. */
function sortedKeys(map: Map<string, string>): string[] {
  return [...map.keys()].toSorted();
}

/** Paths present in both maps whose bytes changed, sorted. */
function changedPaths(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...after.entries()]
    .filter(([path, hash]) => before.has(path) && before.get(path) !== hash)
    .map(([path]) => path)
    .toSorted();
}

/** True when anything exists at `path`. */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("dist-binary dogfood journey (node dist/cli.js, pseudo-home)", () => {
  beforeAll(async () => {
    await ensureDistBuilt();
  }, 240_000);

  it("runs init -> check -> add -> clean round-trip -> byte-stable sync -> config -> validate", {
    timeout: 240_000,
  }, async (ctx) => {
    // Harness skip convention: body-built fixture so a git-less machine skips
    // rather than fails (useCliFixture's beforeEach would reject instead).
    let fixture: CliFixture;
    try {
      fixture = await makeCliFixture({ seed: tsRepoFiles(), git: true, entry: "dist" });
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") ctx.skip();
      throw error;
    }

    try {
      // ── init -y through the built binary: the first-run bar ────────────
      const init = await fixture.run(["init", "-y"]);
      expect(init.code, `init failed:\n${init.stderr}`).toBe(0);
      expect(init.stdout).toContain("stamity is ready.");
      // Ready-panel tail intact: the LAST line of the panel arrived through a
      // piped stream — stdout completeness through the real bin.
      expect(init.stdout.trimEnd().endsWith("st-onboard/SKILL.md")).toBe(true);

      expect(await exists(join(fixture.repoDir, "AGENTS.md"))).toBe(true);
      const manifestPath = join(fixture.repoDir, ...MANIFEST_REL.split("/"));
      expect(await exists(manifestPath)).toBe(true);

      // Every selection class carries picks — the bundled corpus resolved
      // from the BUILT package layout, not the src tree.
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ObservedManifest;
      const classes = Object.entries(manifest.selection.items);
      expect(classes.length).toBeGreaterThan(0);
      for (const [contentClass, ids] of classes) {
        expect(ids.length, `selection.items.${contentClass} is empty`).toBeGreaterThan(0);
      }

      // Every ledger row hashed at write time — what makes the scratch repo
      // drift-checkable and cleanable at all.
      const coreRows = await readLedgerRows(fixture, "");
      expect(coreRows.length).toBeGreaterThan(0);
      for (const row of coreRows) {
        expect(row.contentHash, `ledger row ${row.path} lacks contentHash`).toMatch(
          /^[0-9a-f]{64}$/,
        );
      }

      // ── check: drift-clean on the freshly emitted scratch tree ─────────
      const check = await fixture.run(["check"]);
      expect(check.code, check.stderr).toBe(0);
      expect(check.stdout).toContain("drift: clean");

      // ── add from a local dir, via the relative dot-path spec ───────────
      const staged = await stagePack(fixture, PACK_ID);
      // Guard the hardcoded spec against harness-layout drift: the relative
      // spec must resolve to exactly where stagePack put the copy.
      expect(resolve(fixture.repoDir, PACK_SPEC)).toBe(staged);

      const treeBeforeAdd = await treeHashMap(fixture.repoDir);
      // --allow-untrusted: a path spec never consults the catalog, so the
      // stage has no trust basis — the refusal-without-waiver lane is
      // installSmoke's; here the waiver is the setup, not the subject.
      const add = await fixture.run(["add", PACK_SPEC, "--allow-untrusted"]);
      expect(add.code, `add failed:\n${add.stderr}\n${add.stdout}`).toBe(0);

      const receipt = await readReceipt(fixture, PACK_ID);
      expect(receipt.packId).toBe(PACK_ID);
      // The receipt records the operator's spec VERBATIM — relative dot-path
      // in, relative dot-path out.
      expect(receipt.source).toEqual({ kind: "local-path", spec: PACK_SPEC });

      const packRows = await readLedgerRows(fixture, `pack:${PACK_ID}`);
      expect(packRows.length).toBeGreaterThan(0);
      // The ledger grew by exactly the pack's rows.
      expect((await readLedgerRows(fixture, "")).length).toBe(
        coreRows.length + packRows.length,
      );

      // ── clean --pack round-trip ────────────────────────────────────────
      const clean = await fixture.run(["clean", "--pack", PACK_ID, "-y"]);
      expect(clean.code, clean.stderr).toBe(0);

      // Exactly the pack's ledger rows are gone…
      expect(await readLedgerRows(fixture, `pack:${PACK_ID}`)).toEqual([]);
      expect((await readLedgerRows(fixture, "")).map((row) => row.path).toSorted()).toEqual(
        coreRows.map((row) => row.path).toSorted(),
      );
      // …and exactly the pack's files: same key set as before the add, every
      // byte identical except the manifest (updatedAt + ledger churn). Core
      // outputs provably untouched.
      expect(await exists(join(fixture.repoDir, ...packInstallDir(PACK_ID).split("/")))).toBe(
        false,
      );
      const treeAfterClean = await treeHashMap(fixture.repoDir);
      expect(sortedKeys(treeAfterClean)).toEqual(sortedKeys(treeBeforeAdd));
      expect(changedPaths(treeBeforeAdd, treeAfterClean)).toEqual([MANIFEST_REL]);

      // Round-trip: the re-add lands clean.
      const reAdd = await fixture.run(["add", PACK_SPEC, "--allow-untrusted"]);
      expect(reAdd.code, `re-add failed:\n${reAdd.stderr}\n${reAdd.stdout}`).toBe(0);
      expect((await readReceipt(fixture, PACK_ID)).packId).toBe(PACK_ID);
      expect((await readLedgerRows(fixture, `pack:${PACK_ID}`)).length).toBe(packRows.length);

      // ── sync twice: the second run is byte-stable ──────────────────────
      // First sync converges the tree (projects the installed pack's skills).
      const syncFirst = await fixture.run(["sync"]);
      expect(syncFirst.code, syncFirst.stderr).toBe(0);

      const treeBeforeResync = await treeHashMap(fixture.repoDir);
      const manifestBeforeResync = await readFile(manifestPath, "utf8");
      const syncSecond = await fixture.run(["sync"]);
      expect(syncSecond.code, syncSecond.stderr).toBe(0);
      const treeAfterResync = await treeHashMap(fixture.repoDir);
      const manifestAfterResync = await readFile(manifestPath, "utf8");

      // The exact single-file delta: no file created or removed, no file's
      // bytes changed but the manifest's — and within the manifest, updatedAt
      // is the ONLY changed field. Generate-and-diff, at the binary boundary.
      expect(sortedKeys(treeAfterResync)).toEqual(sortedKeys(treeBeforeResync));
      expect(changedPaths(treeBeforeResync, treeAfterResync)).toEqual([MANIFEST_REL]);
      const parsedBefore = JSON.parse(manifestBeforeResync) as Record<string, unknown>;
      const parsedAfter = JSON.parse(manifestAfterResync) as Record<string, unknown>;
      expect(Date.parse(parsedAfter["updatedAt"] as string)).toBeGreaterThan(
        Date.parse(parsedBefore["updatedAt"] as string),
      );
      expect({ ...parsedAfter, updatedAt: "(normalized)" }).toEqual({
        ...parsedBefore,
        updatedAt: "(normalized)",
      });

      // ── config: get echoes the detected tier, set round-trips ──────────
      const getBefore = await fixture.run(["config", "get", "maturityTier"]);
      expect(getBefore.code, getBefore.stderr).toBe(0);
      expect(getBefore.stdout).toMatch(/maturityTier\s+solo\b/);

      const set = await fixture.run(["config", "set", "maturityTier", "team"]);
      expect(set.code, set.stderr).toBe(0);
      expect(set.stdout).toContain("set maturityTier: solo -> team");

      const getAfter = await fixture.run(["config", "get", "maturityTier"]);
      expect(getAfter.code, getAfter.stderr).toBe(0);
      expect(getAfter.stdout).toMatch(/maturityTier\s+team\b/);

      // ── validate: the emitted + installed tree passes its own gate ─────
      const validate = await fixture.run(["validate"]);
      expect(validate.code, `validate failed:\n${validate.stderr}\n${validate.stdout}`).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
