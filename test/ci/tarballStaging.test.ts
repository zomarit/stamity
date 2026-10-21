import { existsSync, readFileSync, readdirSync } from "node:fs";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { curatedPacks } from "../../src/pack/curated.ts";
import { CONTENT_CLASSES } from "../../src/types/content.ts";
import { PREDECESSOR_CONTENT_PREFIX } from "../../src/migration/detect.ts";
import { useTempDir } from "../support/tempDir.ts";
// @ts-expect-error — the smoke remains a native ESM source-checkout script.
import { packVersionMismatches, requiredPackDirs, scanPackedArtifact } from "../../scripts/tarball-smoke.mjs";

/**
 * READER coverage over the published artifact's shape.
 *
 * Two resolvers probe a source-checkout path first and a `dist/` path second —
 * `src/content/contentRoot.ts` for the corpus, `src/pack/curated.ts` for the
 * bundled packs. In this repository the FIRST candidate always exists, so every
 * suite, every generator, and the dogfood check pass whether or not the build
 * stages anything into the second. `package.json` ships `dist` and nothing
 * else, so the second candidate is the only one a user ever has: an unstaged
 * build publishes a package whose first command fails with CONFIG_ERROR, and no
 * repo-run check can see it.
 *
 * `scripts/tarball-smoke.mjs` closes that end to end (pack → install → init →
 * check) and is the CI gate. This suite is its fast, always-on half: it asserts
 * the build config actually stages a directory for every class the readers can
 * ask for, so a new content class or a new curated pack cannot be added without
 * the staging list growing with it.
 *
 * Reads `dist/` when a build is present and skips otherwise, so a plain
 * `npm test` in a fresh clone does not fail on a missing build. CI runs Build
 * before Test (`.github/workflows/ci.yml`), so there it always asserts.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = join(REPO_ROOT, "dist");
const getPackedFixture = useTempDir("packed-leak-scan");

/** Corpus directory name per content class: the reader scans `<root>/<class>s`. */
const CLASS_DIRS = CONTENT_CLASSES.map((klass) => `${klass}s`);

describe("bundled-content staging covers every reader", () => {
  it("keeps a source directory for every content class the catalog scans", () => {
    for (const dir of CLASS_DIRS) {
      expect(existsSync(join(REPO_ROOT, "content", dir)), `content/${dir}`).toBe(true);
    }
    // The charter is not a CONTENT_CLASSES member but core emission refuses to
    // run without it, so it is a required staged directory all the same.
    expect(existsSync(join(REPO_ROOT, "content", "charter"))).toBe(true);
  });

  it("keeps a source directory for every curated pack the resolver can be asked for", () => {
    // TEST CHANGE, justified (2026-10-20_packs-rebuilt/u2-pack-catalog): `CURATED_PACKS` left the module; the
    // same catalog is `curatedPacks()`, derived from the packs folder (REQ-PACK-001).
    // A bundled entry's id doubles as its directory name under `packs/`.
    for (const entry of curatedPacks()) {
      expect(existsSync(join(REPO_ROOT, "packs", entry.id)), entry.id).toBe(true);
    }
  });

  it.skipIf(!existsSync(DIST))(
    "stages each of those directories into dist/, which is all the tarball ships",
    () => {
      const staged = readdirSync(DIST);
      expect(staged, "dist/content is what a published package resolves through").toContain(
        "content",
      );
      expect(staged).toContain("packs");

      for (const dir of [...CLASS_DIRS, "charter"]) {
        expect(existsSync(join(DIST, "content", dir)), `dist/content/${dir}`).toBe(true);
      }
      // TEST CHANGE, justified (2026-10-20_packs-rebuilt/u2-pack-catalog): `CURATED_PACKS` left the module; the
      // same catalog is `curatedPacks()`, derived from the packs folder (REQ-PACK-001).
      for (const entry of curatedPacks()) {
        expect(existsSync(join(DIST, "packs", entry.id)), `dist/packs/${entry.id}`).toBe(true);
      }
    },
  );

  it.skipIf(!existsSync(join(DIST, "packs")))(
    "ships every built pack.json at the package version, every other field as its source has it",
    () => {
      // The build rewrites the staged manifests (stampPackVersions); the pin
      // covers only the integrity map, so this is the check that the rewrite
      // widened nothing else — permissions, declaredTools — on the way out.
      const version = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string })
        .version;
      const ids = requiredPackDirs(join(REPO_ROOT, "packs")) as string[];
      expect(ids.length).toBeGreaterThan(0);
      expect(packVersionMismatches(join(DIST, "packs"), ids, version)).toEqual([]);
      for (const id of ids) {
        const source = JSON.parse(readFileSync(join(REPO_ROOT, "packs", id, "pack.json"), "utf8")) as Record<string, unknown>;
        const built = JSON.parse(readFileSync(join(DIST, "packs", id, "pack.json"), "utf8")) as Record<string, unknown>;
        expect(Object.keys(built), id).toEqual(Object.keys(source));
        for (const key of Object.keys(source).filter((field) => field !== "version")) {
          expect(JSON.stringify(built[key]), `dist/packs/${id}/pack.json ${key}`).toBe(JSON.stringify(source[key]));
        }
      }
    },
  );
});

describe("the tarball smoke's pack checks", () => {
  const getPacks = useTempDir("smoke-packs");

  it("requires every source folder holding a pack.json, and refuses one without", async () => {
    const fixture = getPacks();
    await fixture.seedFiles({
      "packs/zeta/pack.json": '{"version":"1.0.0"}',
      "packs/alpha/pack.json": '{"version":"1.0.0"}',
      "packs/README.md": "not a pack\n",
    });
    expect(requiredPackDirs(fixture.path("packs"))).toEqual(["alpha", "zeta"]);

    await fixture.seedFiles({ "packs/stray/notes.md": "not a pack\n" });
    expect(() => requiredPackDirs(fixture.path("packs"))).toThrow(/no pack\.json: stray/);
  });

  it("names each installed pack whose pack.json misses the package version", async () => {
    const fixture = getPacks();
    await fixture.seedFiles({
      "dist/packs/alpha/pack.json": '{"version":"2.0.0"}',
      "dist/packs/beta/pack.json": '{"version":"0.1.0"}',
    });
    expect(packVersionMismatches(fixture.path("dist", "packs"), ["alpha", "beta", "gone"], "2.0.0")).toEqual([
      'beta: pack.json reads "0.1.0", the package is 2.0.0',
      expect.stringMatching(/^gone: .*pack\.json is unreadable/),
    ]);
  });
});

/**
 * The leak gate over the ARTIFACT, not the repository.
 *
 * `dist/` is a skipped build directory in the repository scan and is the entire published
 * package, so the bundler's output was the one tree nothing looked at. That gap is not cosmetic:
 * a name split across a concatenation or written as an escape passes the source scan and
 * reassembles to the plain string once the bundler has folded the constants.
 *
 * `scripts/tarball-smoke.mjs` already builds, packs, installs and extracts that artifact, so it
 * is the only place with the tree in hand. This suite is its fast, always-on half: it asserts the
 * smoke actually runs the gate there, with the build exemption turned off, and that the two flags
 * that make it possible exist on the gate. Running the pack itself is CI's job — it takes tens of
 * seconds and needs a build.
 */
describe("the publish artifact is scanned, not only the repository", () => {
  const SMOKE = readFileSync(join(REPO_ROOT, "scripts", "tarball-smoke.mjs"), "utf8");
  const GATE = readFileSync(join(REPO_ROOT, "scripts", "leak-gate.mjs"), "utf8");

  it("runs the real scanner through a symlinked artifact path and rejects a declaration leak", async () => {
    // 2026-09-11: replace the old source-string wiring pin with a real process
    // witness. macOS temp paths can alias /private/var; the copied scanner's
    // direct-entry guard previously exited zero without scanning that alias.
    const fixture = getPackedFixture();
    await fixture.seedFiles({
      "package/package.json": '{"type":"module"}',
      "package/dist/types/migration/detect.d.ts":
        `export declare const PREFIX = ${JSON.stringify(PREDECESSOR_CONTENT_PREFIX)};\n`,
    });
    const alias = fixture.path("alias");
    await symlink(fixture.path("package"), alias, process.platform === "win32" ? "junction" : "dir");
    expect(() => scanPackedArtifact(alias)).toThrow(/dist\/types\/migration\/detect\.d\.ts/);
  });

  it.each([
    ["silent", "process.exitCode = 0;\n"],
    ["failed", "console.log('leak-gate: FAIL - scan incomplete');\n"],
    ["empty", "console.log('leak-gate: PASS - 0 hits for 18 rule(s) across 0 file(s)');\n"],
  ])("rejects a %s scanner even when it exits zero", async (_kind, source) => {
    // A no-op scanner reproduces the false-green outcome without a platform
    // dependency. The replacement is the unavailable scan, not the scanner's
    // detection behavior; the other fixture executes the real gate.
    const fixture = getPackedFixture();
    await fixture.seedFiles({
      "package/package.json": '{"type":"module"}',
      "no-op.mjs": source,
    });
    expect(() => scanPackedArtifact(fixture.path("package"), fixture.path("no-op.mjs")))
      .toThrow(/without a nonempty successful scan/);
  });

  it("accepts a clean declared artifact and retains the narrow runtime migration exemption", async () => {
    const fixture = getPackedFixture();
    await fixture.seedFiles({
      "package/package.json": '{"type":"module"}',
      "package/dist/types/migration/detect.d.ts": "export declare const PREFIX: string;\n",
      "package/dist/src.js": `export const prefix = ${JSON.stringify(PREDECESSOR_CONTENT_PREFIX)};\n`,
    });
    const alias = fixture.path("alias");
    await symlink(fixture.path("package"), alias, process.platform === "win32" ? "junction" : "dir");
    expect(scanPackedArtifact(alias))
      .toMatch(/leak-gate: PASS - 0 hits for \d+ rule\(s\) across [1-9]\d* file\(s\)/);
  });

  it("fails the smoke when the artifact carries a hit, rather than reporting and continuing", () => {
    // A gate whose non-zero exit is swallowed is a gate that does not exist. `run()` throws on a
    // non-zero child, and this is the arm that turns that throw into a FAIL.
    expect(SMOKE).toContain("the packed artifact carries a reserved name or a credential shape");
  });

  it("keeps the two flags the artifact scan depends on", () => {
    // `--root` is unused by the smoke (it copies the gate in instead) but is the documented way
    // to point the gate at another tree; `--include-build` is what turns off the exemption that
    // made the published tree invisible.
    expect(GATE).toContain("--include-build");
    expect(GATE).toContain("--root");
    expect(GATE).toContain("INCLUDE_BUILD");
  });

  it("does not rely on the repository's .npmrc reaching the throwaway install", () => {
    // npm reads the project config from the CWD, and the consumer project's CWD is a temp
    // directory with no `.npmrc`, so `ignore-scripts` has to be passed on the install line or
    // the one install that most resembles a user's runs every dependency's lifecycle scripts.
    expect(SMOKE).toContain("'--ignore-scripts'");
  });
});
