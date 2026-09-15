import { homedir, tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type * as NodeModule from "node:module";
import { join, resolve } from "node:path";
import type * as NodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * S-4: the browser lane's skip reasons must never interpolate a raw
 * resolver/launcher error message into the evidence file, because those
 * messages carry the absolute paths (typically under the operator's home
 * directory) that the resolver or the browser launcher searched.
 *
 * Two checks: `loadBrowserLane` (the "packages not installed" reason) is
 * exercised directly, with `node:module`'s `createRequire` mocked to fail the
 * way a missing `website/node_modules/playwright` would; the launch-failure
 * reason is checked statically, because faking a `playwright.chromium.launch`
 * rejection would mean stubbing the whole `playwright` package the same way
 * `loadBrowserLane` loads it — the source text is the more honest evidence
 * that no raw `error.message` reaches that reason either.
 */

const RUN_MJS = resolve(import.meta.dirname, "../../scripts/qa/run.mjs");
const HOME = homedir();
const REPO_ROOT = resolve(import.meta.dirname, "../..");

function pathFree(reason: string): void {
  expect(reason, reason).not.toContain(HOME);
  expect(reason, reason).not.toContain(REPO_ROOT);
  // A resolver error message lists every candidate directory it tried,
  // one per line — the absence of any `node_modules` mention is the
  // cheapest signal that the raw message never landed in the reason.
  expect(reason, reason).not.toContain("node_modules");
}

/** One evidence object's `rowHash` for the named row. */
function rowHashOf(evidence: { rows: { row: string; rowHash: string }[] }, id: string): string {
  return evidence.rows.find((row) => row.row === id)!.rowHash;
}

describe("loadBrowserLane — path-free skip reason", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:module");
  });

  it("never interpolates the resolver's own error message, which lists the paths it searched", async () => {
    vi.doMock("node:module", async (importOriginal) => {
      const actual = await importOriginal<typeof NodeModule>();
      return {
        ...actual,
        createRequire: () => {
          const fakeResolve = () => {
            throw new Error(
              `Cannot find module 'playwright' from '${HOME}/repos/stamity/website/package.json'\n` +
                `Require stack:\n- ${REPO_ROOT}/website/package.json`,
            );
          };
          fakeResolve.resolve = fakeResolve;
          return fakeResolve as unknown as NodeJS.Require;
        },
      };
    });

    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { loadBrowserLane } = await import("../../scripts/qa/run.mjs");
    const lane = await loadBrowserLane();

    expect(lane.available).toBe(false);
    pathFree(lane.reason);
    // The reason still carries the fact and the fix, just not the path.
    expect(lane.reason).toContain("website/");
    expect(lane.reason).toContain("npx playwright install chromium");
  });
});

describe("isOutsideRoot", () => {
  it("reads a plain `..`-prefixed relative path as outside", async () => {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { isOutsideRoot } = await import("../../scripts/qa/run.mjs");
    expect(isOutsideRoot("/repo", "/repo/fixtures")).toBe(false);
    expect(isOutsideRoot("/repo", "/elsewhere/fixtures")).toBe(true);
  });

  it("reads an absolute relative() result as outside, not only a `..`-prefixed one", async () => {
    // M5: on Windows, `relative()` between two paths on different drives (`C:\repo` vs
    // `D:\fixtures`) answers with the target's own ABSOLUTE path rather than a `..`-prefixed one.
    // `path.relative` cannot reproduce that shape running on POSIX (there is no second drive to
    // cross), so `node:path`'s own `relative` is stubbed to return that Windows shape directly —
    // the one part of the Windows behaviour this suite CAN pin without a Windows host, the same
    // posture `.stamity/learnings/the-local-test-gate-is-weaker-than-ci.md` documents for the rest.
    // A POSIX absolute path stands in for the Windows drive-letter one below — this suite's own
    // `isAbsolute` (POSIX) would not read `D:\fixtures` as absolute, only `/…` is, and the
    // property under test is "an absolute `relative()` result reads as outside", not the exact
    // Windows spelling.
    vi.doMock("node:path", async (importOriginal) => {
      const actual = await importOriginal<typeof NodePath>();
      return { ...actual, relative: () => "/elsewhere/fixtures" };
    });
    vi.resetModules();
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { isOutsideRoot } = await import("../../scripts/qa/run.mjs");

    expect(isOutsideRoot("/repo", "/elsewhere/fixtures")).toBe(true);

    vi.doUnmock("node:path");
    vi.resetModules();
  });
});

describe("run.mjs source — launch-failure reason", () => {
  it("never builds the browser-binary-missing reason from a raw launch error message", () => {
    const source = readFileSync(RUN_MJS, "utf8");
    const launchCatch = source.slice(
      source.indexOf("browser = await lane.playwright.chromium.launch()"),
      source.indexOf("browser = await lane.playwright.chromium.launch()") + 400,
    );
    expect(launchCatch).not.toContain("error.message");
    expect(launchCatch).toContain("no browser binary");
    expect(launchCatch).toContain("BROWSER_INSTALL_HINT");
    expect(source).toContain("const BROWSER_INSTALL_HINT = 'cd website && npx playwright install chromium'");
  });
});

/**
 * The relativize fix: `inputHashes` keys must never carry the checkout location the harness ran
 * from — a `--site` argument (or any other input) is free to be absolute, since that is how an
 * orchestrator that has already resolved paths would invoke this script, and the evidence file's
 * keys must not be. Exercised through `main()` itself, not through `repoRelativeLabel` alone,
 * because the bug this fixes was in how `main()` built the label BEFORE handing it to that
 * function's predecessor — a unit test of the helper in isolation would not have caught it.
 */
describe("main — inputHashes keys never carry the checkout location", () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const PAGE_FILES = [
    "index.html",
    "docs/getting-started/index.html",
    "docs/customization/index.html",
    "docs/packs-and-trust/index.html",
    "docs/capability-matrix/index.html",
  ];

  /**
   * A built-site tree carrying every file `PAGES` names, at a fresh ABSOLUTE directory nested
   * under `website/build/` — the real shape `--site` is documented and used against
   * (`[--site website/build]`), never a location outside the repository entirely. `website/build/`
   * is wholesale gitignored (`.gitignore`), so a fixture left here by an interrupted run is neither
   * tracked nor walked by the leak gate.
   */
  function siteFixture(): string {
    mkdirSync(join(REPO_ROOT, "website", "build"), { recursive: true });
    const dir = mkdtempSync(join(REPO_ROOT, "website", "build", "stamity-qa-run-site-"));
    temps.push(dir);
    for (const file of PAGE_FILES) {
      const target = join(dir, ...file.split("/"));
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, `<!doctype html><title>${file}</title>\n`);
    }
    return dir;
  }

  function evidencePath(): string {
    const dir = mkdtempSync(join(tmpdir(), "stamity-qa-run-out-"));
    temps.push(dir);
    return join(dir, "evidence.json");
  }

  it("keeps every H2/H3 inputHashes key repo-relative, home-free and repo-root-free — even given an absolute --site", async () => {
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { main } = await import("../../scripts/qa/run.mjs");
    const site = siteFixture();

    const evidence = await main([
      "--site",
      site,
      "--skip-browser",
      "--skip-hooks",
      "--sha",
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "--out",
      evidencePath(),
    ]);

    const rowsWithInputs = evidence.rows.filter(
      (row: { inputHashes: Record<string, string> }) => Object.keys(row.inputHashes).length > 0,
    );
    expect(rowsWithInputs.length, "at least one row carries page inputs").toBeGreaterThan(0);
    for (const row of rowsWithInputs) {
      for (const key of Object.keys((row as { inputHashes: Record<string, string> }).inputHashes)) {
        expect(key, `${row.row} key ${key}`).not.toMatch(/^[/\\]|^[A-Za-z]:[/\\]/);
        expect(key, `${row.row} key ${key}`).not.toContain(HOME);
        expect(key, `${row.row} key ${key}`).not.toContain(REPO_ROOT);
        // The fixture's own directory name is expected to survive as a relative SEGMENT
        // (`website/build/stamity-qa-run-site-XXXX/index.html`) — what must not survive is the
        // absolute prefix in front of it, already ruled out above.
        expect(key.startsWith("website/build/")).toBe(true);
      }
    }
  });

  it("gives the same rowHash for the same page bytes whether --site is spelled relative or absolute", async () => {
    // "A checkout location never moves it": the ONE thing this test can vary within a single
    // process is how the caller SPELLS the path to the very same on-disk bytes, not which checkout
    // it runs from — but that is exactly the mechanism the fix changed. Before the fix, `siteLabel`
    // was the `--site` argument's own spelling verbatim, so an absolute and a relative spelling of
    // the identical location produced two different labels and two different row hashes for
    // identical bytes; `repoRelativeLabel` resolves both spellings through the same
    // `relative(REPO_ROOT, …)` call, so they now agree — which is the same invariance a different
    // checkout root would get, through the same mechanism.
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { main } = await import("../../scripts/qa/run.mjs");
    const site = siteFixture();
    const relativeSite = site.slice(REPO_ROOT.length + 1);

    const evidenceRelative = await main([
      "--site",
      relativeSite,
      "--skip-browser",
      "--skip-hooks",
      "--sha",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--out",
      evidencePath(),
    ]);
    const evidenceAbsolute = await main([
      "--site",
      site,
      "--skip-browser",
      "--skip-hooks",
      "--sha",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "--out",
      evidencePath(),
    ]);

    expect(rowHashOf(evidenceRelative, "H2")).toBe(rowHashOf(evidenceAbsolute, "H2"));
    expect(rowHashOf(evidenceRelative, "H3a")).toBe(rowHashOf(evidenceAbsolute, "H3a"));
  });
});
