import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CURATED_PACKS } from "../../src/pack/curated.ts";
import { CONTENT_CLASSES } from "../../src/types/content.ts";

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
    // A bundled entry's id doubles as its directory name under `packs/`.
    for (const entry of CURATED_PACKS) {
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
      for (const entry of CURATED_PACKS) {
        expect(existsSync(join(DIST, "packs", entry.id)), `dist/packs/${entry.id}`).toBe(true);
      }
    },
  );
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

  it("runs the leak gate over the extracted package", () => {
    expect(SMOKE).toContain("leak-gate.mjs");
    // Copied in beside the extracted package: the gate derives its root from its own location,
    // so it has to sit inside the tree it is meant to scan.
    expect(SMOKE).toContain("copyFileSync(GATE");
    expect(SMOKE).toContain("'--include-build'");
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
