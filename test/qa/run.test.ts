import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import type * as NodeModule from "node:module";
import { resolve } from "node:path";
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
