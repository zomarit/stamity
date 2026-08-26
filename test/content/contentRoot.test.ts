// The `__`-prefixed test seams keep the naming convention their module declares.
// oxlint-disable no-underscore-dangle
import { existsSync } from "node:fs";
import type * as NodeFs from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
  resolveBundledContentRoot,
} from "../../src/content/contentRoot.ts";
import type { EngineError } from "../../src/types/errors.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PACKAGE_JSON = join(REPO_ROOT, "package.json");
const SOURCE_CONTENT = join(REPO_ROOT, "content");
const BUILT_CONTENT = join(REPO_ROOT, "dist", "content");

interface ProbeHarness {
  resolveRoot: () => string;
  setRoot: (dir: string) => void;
  reset: () => void;
  /** Candidate paths reported as directories; mutate between calls to model a reinstall. */
  dirs: Set<string>;
  /** Candidate paths reported as regular files — present, but not usable as a corpus root. */
  files: Set<string>;
  statCalls: () => number;
  /**
   * The error class from the harness's own module graph. `vi.resetModules()`
   * gives the re-imported modules fresh class identities, so the statically
   * imported `EngineError` would fail `instanceof` against what they throw.
   */
  EngineError: typeof EngineError;
}

/**
 * Loads a fresh contentRoot module over a stubbed filesystem. `package.json`
 * exists only at the repo root, so the package-root walk terminates exactly
 * there; `dirs`/`files` decide what each candidate looks like. Stubbing rather
 * than seeding real directories keeps these cases independent of whether this
 * checkout happens to carry a built or a source corpus.
 */
async function loadWithFs(...dirPaths: string[]): Promise<ProbeHarness> {
  const dirs = new Set(dirPaths);
  const files = new Set([PACKAGE_JSON]);
  const statSync = vi.fn((target: string) => {
    if (dirs.has(target)) return { isFile: () => false, isDirectory: () => true };
    if (files.has(target)) return { isFile: () => true, isDirectory: () => false };
    return undefined;
  });

  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => ({
    // Type-only alias for the module shape; the inline `typeof import(...)` form is lint-banned.
    ...(await importOriginal<typeof NodeFs>()),
    statSync,
  }));

  const contentRoot = await import("../../src/content/contentRoot.ts");
  const errors = await import("../../src/types/errors.ts");
  return {
    resolveRoot: contentRoot.resolveBundledContentRoot,
    setRoot: contentRoot.__setContentRootForTests,
    reset: contentRoot.__resetContentRootCacheForTests,
    dirs,
    files,
    statCalls: () => statSync.mock.calls.length,
    EngineError: errors.EngineError,
  };
}

afterEach(() => {
  __resetContentRootCacheForTests();
  vi.doUnmock("node:fs");
  vi.resetModules();
});

describe("__setContentRootForTests", () => {
  it("pins a fixture root that never has to exist on disk", () => {
    const fixture = "/virtual/volume/content";
    expect(existsSync(fixture)).toBe(false);

    __setContentRootForTests(fixture);

    expect(resolveBundledContentRoot()).toBe(fixture);
    expect(resolveBundledContentRoot()).toBe(fixture);
  });

  it("serves the fixture without touching the filesystem, and reset restores probing", async () => {
    const harness = await loadWithFs(BUILT_CONTENT);
    const fixture = "/virtual/volume/content";

    harness.setRoot(fixture);
    expect(harness.resolveRoot()).toBe(fixture);
    expect(harness.statCalls()).toBe(0);

    harness.reset();

    expect(harness.resolveRoot()).toBe(BUILT_CONTENT);
    expect(harness.statCalls()).toBeGreaterThan(0);
  });
});

describe("resolveBundledContentRoot", () => {
  it("prefers the source-checkout corpus when both layouts exist", async () => {
    const harness = await loadWithFs(SOURCE_CONTENT, BUILT_CONTENT);

    expect(harness.resolveRoot()).toBe(SOURCE_CONTENT);
  });

  it("falls back to the built corpus", async () => {
    const harness = await loadWithFs(BUILT_CONTENT);

    expect(harness.resolveRoot()).toBe(BUILT_CONTENT);
  });

  it("skips a candidate that exists as a file", async () => {
    const harness = await loadWithFs(BUILT_CONTENT);
    harness.files.add(SOURCE_CONTENT);

    expect(harness.resolveRoot()).toBe(BUILT_CONTENT);
  });

  it("caches the resolved root instead of re-probing", async () => {
    const harness = await loadWithFs(SOURCE_CONTENT);

    const first = harness.resolveRoot();
    const afterFirst = harness.statCalls();
    // The layout changing underneath must not change the answer within a process.
    harness.dirs.clear();

    expect(harness.resolveRoot()).toBe(first);
    expect(harness.statCalls()).toBe(afterFirst);
  });

  it("throws CONFIG_ERROR listing the package root and every probed path", async () => {
    const harness = await loadWithFs();

    let thrown: unknown;
    try {
      harness.resolveRoot();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(harness.EngineError);
    const error = thrown as EngineError;
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.exitCode).toBe(1);
    expect(error.message).toContain(REPO_ROOT);
    expect(error.message).toContain(SOURCE_CONTENT);
    expect(error.message).toContain(BUILT_CONTENT);
  });

  it("does not cache the failure, so a reinstall resolves without a restart", async () => {
    const harness = await loadWithFs();

    expect(() => harness.resolveRoot()).toThrow(harness.EngineError);

    harness.dirs.add(BUILT_CONTENT);

    expect(harness.resolveRoot()).toBe(BUILT_CONTENT);
  });
});
