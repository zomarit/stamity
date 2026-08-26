import type * as NodeFs from "node:fs";
import { isAbsolute } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineError } from "../../src/types/errors.ts";
import { findPackageRoot } from "../../src/shared/paths.ts";
import { getRunId, resetRunIdForTesting } from "../../src/shared/runId.ts";
import { useTempDir } from "../support/tempDir.ts";

const HEX_8 = /^[0-9a-f]{8}$/;

describe("getRunId", () => {
  afterEach(() => {
    resetRunIdForTesting();
    vi.unstubAllEnvs();
  });

  it("is 8 lowercase hex characters", () => {
    expect(getRunId()).toMatch(HEX_8);
  });

  it("returns the same id on every call within the process", () => {
    const first = getRunId();
    expect(getRunId()).toBe(first);
    expect(getRunId()).toBe(first);
  });

  it("mints a new id after resetRunIdForTesting", () => {
    const first = getRunId();
    resetRunIdForTesting();
    const second = getRunId();

    expect(second).toMatch(HEX_8);
    expect(second).not.toBe(first);
    expect(getRunId()).toBe(second);
  });

  it("mints distinct ids across repeated resets", () => {
    // 32 bits of entropy per mint: 40 draws collide with probability ~2e-7, so a
    // repeat here means the id stopped being random, not that the test got unlucky.
    const ids = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      resetRunIdForTesting();
      ids.add(getRunId());
    }
    expect(ids.size).toBe(40);
  });

  it("ignores an environment-supplied id — the guard's marker salt must not be settable", () => {
    vi.stubEnv("STAMITY_RUN_ID", "deadbeef");
    resetRunIdForTesting();
    expect(getRunId()).not.toBe("deadbeef");
  });

  it("tolerates a reset before the first read", () => {
    resetRunIdForTesting();
    resetRunIdForTesting();
    expect(getRunId()).toMatch(HEX_8);
  });
});

/**
 * paths.ts ships no test file of its own in this unit; its cases ride the shared
 * lane here. Real temp directories, not the virtual volume: findPackageRoot
 * probes the filesystem directly, by design — it is the bootstrap that runs
 * before any fs seam is wired.
 */
describe("findPackageRoot", () => {
  const tempDir = useTempDir("stamity-paths");

  it("returns the start directory when it holds the package.json", async () => {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": "{}" });

    expect(findPackageRoot(handle.dir)).toBe(handle.dir);
  });

  it("walks up to the nearest ancestor that holds one", async () => {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": "{}", "src/deep/leaf.ts": "" });

    expect(findPackageRoot(handle.path("src/deep"))).toBe(handle.dir);
  });

  it("stops at the nearest package root, not the outermost", async () => {
    const handle = tempDir();
    await handle.seedFiles({
      "package.json": "{}",
      "packages/inner/package.json": "{}",
      "packages/inner/src/leaf.ts": "",
    });

    expect(findPackageRoot(handle.path("packages/inner/src"))).toBe(handle.path("packages/inner"));
  });

  it("normalizes the start path before walking", async () => {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": "{}", "src/leaf.ts": "" });

    expect(findPackageRoot(`${handle.path("src")}/./../src/.`)).toBe(handle.dir);
  });

  it("walks up from a start directory that does not exist", async () => {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": "{}" });

    expect(findPackageRoot(handle.path("absent/deeper"))).toBe(handle.dir);
  });

  it("does not accept a directory named package.json as a package root", async () => {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": "{}", "sub/package.json/inner.txt": "x" });

    expect(findPackageRoot(handle.path("sub"))).toBe(handle.dir);
  });

  it("throws a typed FS_ERROR naming the start directory when nothing qualifies", async () => {
    // The probe is stubbed to report "no package.json anywhere", which is the only
    // deterministic way to reach the filesystem root on a real fs. Reaching the
    // assertion at all proves the walk terminates at the root fixpoint rather than
    // looping; the vitest timeout is the backstop if it ever regresses.
    const handle = tempDir();
    await handle.seedFiles({ "package.json": "{}" });

    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => ({
      // Type-only alias for the module shape; behaviour is unchanged from the
      // inline `typeof import("node:fs")` form, which lint forbids.
      ...(await importOriginal<typeof NodeFs>()),
      statSync: () => undefined,
    }));

    try {
      const { findPackageRoot: probe } = await import("../../src/shared/paths.ts");
      let thrown: unknown;
      try {
        probe("/deep/nested/start");
      } catch (error) {
        thrown = error;
      }

      // Duck-typed, not `instanceof`: vi.resetModules() gave the re-imported module
      // its own copy of the EngineError class.
      const error = thrown as EngineError;
      expect(error?.name).toBe("EngineError");
      expect(error.code).toBe("FS_ERROR");
      expect(error.exitCode).toBe(1);
      expect(error.message).toContain("/deep/nested/start");

      // Pins that the stub is what produced the throw: a directory that really
      // does hold a package.json is rejected too while the probe reports nothing.
      expect(() => probe(handle.dir)).toThrow(/No package.json found/);
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });

  it("reads the real filesystem again once the stub is torn down", async () => {
    // Guards the module-identity caveat above: the statically imported binding is
    // untouched by the reset, and the class it throws is the one callers catch.
    const handle = tempDir();
    await handle.seedFiles({ "package.json": "{}" });

    expect(isAbsolute(findPackageRoot(handle.dir))).toBe(true);
    expect(findPackageRoot(handle.path("absent"))).toBe(handle.dir);
    expect(new EngineError("x", { code: "FS_ERROR" }).code).toBe("FS_ERROR");
  });
});
