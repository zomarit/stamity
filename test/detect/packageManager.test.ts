import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectPackageManager,
  type PackageManagerInfo,
  type PackageManagerName,
} from "../../src/detect/packageManager.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Real temp directories rather than the virtual-fs lane: detection reads the
 * filesystem directly, and every case here turns on which files exist rather
 * than on how they parse.
 */
const getRepo = useTempDir("detect-pm");

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Seeds a repository and detects its package manager. */
async function detect(files: Record<string, string>): Promise<PackageManagerInfo> {
  const repo = getRepo();
  await repo.seedFiles(files);
  return detectPackageManager(repo.dir);
}

/** Every recognised lockfile and the manager it names; typed so a misspelt name fails to compile. */
const LOCKFILE_CASES: readonly (readonly [string, PackageManagerName])[] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
];

describe("detectPackageManager", () => {
  it.each(LOCKFILE_CASES)("reads %s as a %s repository", async (lockfile, name) => {
    await expect(detect({ [lockfile]: "" })).resolves.toEqual({
      name,
      lockfile,
      fromPackageJsonField: false,
    });
  });

  it("ranks lockfiles pnpm > yarn > bun > npm when several are present", async () => {
    const repo = getRepo();

    await repo.seedFiles({ "package-lock.json": "{}" });
    expect((await detectPackageManager(repo.dir)).name).toBe("npm");

    await repo.seedFiles({ "bun.lock": "" });
    expect((await detectPackageManager(repo.dir)).name).toBe("bun");

    await repo.seedFiles({ "yarn.lock": "" });
    expect((await detectPackageManager(repo.dir)).name).toBe("yarn");

    await repo.seedFiles({ "pnpm-lock.yaml": "" });
    expect(await detectPackageManager(repo.dir)).toEqual({
      name: "pnpm",
      lockfile: "pnpm-lock.yaml",
      fromPackageJsonField: false,
    });
  });

  it("prefers yarn over a package-lock.json left behind by a stray npm install", async () => {
    await expect(detect({ "yarn.lock": "", "package-lock.json": "{}" })).resolves.toEqual({
      name: "yarn",
      lockfile: "yarn.lock",
      fromPackageJsonField: false,
    });
  });

  it("lets the packageManager pin beat a stray lockfile, and still reports the lockfile", async () => {
    await expect(
      detect({
        "package.json": json({ name: "app", packageManager: "pnpm@9.0.0" }),
        "package-lock.json": "{}",
      }),
    ).resolves.toEqual({
      name: "pnpm",
      lockfile: "package-lock.json",
      fromPackageJsonField: true,
    });
  });

  it("accepts a pin carrying an integrity suffix", async () => {
    const info = await detect({
      "package.json": json({ packageManager: "pnpm@9.12.1+sha512.e9bd2a1c7f0f" }),
    });
    expect(info).toEqual({ name: "pnpm", lockfile: null, fromPackageJsonField: true });
  });

  it("ignores a pin naming a manager it does not know and lets the lockfile decide", async () => {
    await expect(
      detect({ "package.json": json({ packageManager: "deno@2.0.0" }), "yarn.lock": "" }),
    ).resolves.toEqual({ name: "yarn", lockfile: "yarn.lock", fromPackageJsonField: false });
  });

  it.each([
    ["a malformed manifest", "{ not json"],
    ["a non-object manifest", "[]"],
    ["a non-string pin", json({ packageManager: 9 })],
  ])("falls back to the lockfile on %s", async (_case, manifest) => {
    await expect(detect({ "package.json": manifest, "bun.lock": "" })).resolves.toEqual({
      name: "bun",
      lockfile: "bun.lock",
      fromPackageJsonField: false,
    });
  });

  it("defaults to npm on an empty repository and says the default was not observed", async () => {
    await expect(detect({})).resolves.toEqual({
      name: "npm",
      lockfile: null,
      fromPackageJsonField: false,
    });
  });

  it("detects a pinned manager with no lockfile at all", async () => {
    await expect(
      detect({ "package.json": json({ packageManager: "yarn@4.5.0" }) }),
    ).resolves.toEqual({ name: "yarn", lockfile: null, fromPackageJsonField: true });
  });

  it("does not mistake a directory for a lockfile", async () => {
    await expect(detect({ "yarn.lock/placeholder": "" })).resolves.toEqual({
      name: "npm",
      lockfile: null,
      fromPackageJsonField: false,
    });
  });
});

/**
 * REQ-FLOW-182: the root manifest this module reads is read like every other
 * root file detection reads. A link, or a file over 1 MiB, reads as absent, so
 * the lockfile alone names the manager. Each pin names `pnpm` beside a
 * `yarn.lock`, so a pin that was read and one that was refused give different
 * answers.
 */
describe("REQ-FLOW-182 the root manifest detectPackageManager reads", () => {
  const PINNED = json({ name: "app", packageManager: "pnpm@9.0.0" });
  const LOCKFILE_ONLY: PackageManagerInfo = { name: "yarn", lockfile: "yarn.lock", fromPackageJsonField: false };

  it("reads a linked package.json as absent, so the lockfile alone decides", async () => {
    const repo = getRepo();
    const root = repo.path("root");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "yarn.lock"), "");
    const target = repo.path("outside-package.json");
    await writeFile(target, PINNED);
    await symlink(target, join(root, "package.json"), "file");

    await expect(detectPackageManager(root)).resolves.toEqual(LOCKFILE_ONLY);
  });

  it("reads a valid package.json over 1 MiB as absent, so the lockfile alone decides", async () => {
    const over = json({ name: "app", description: "x".repeat(1_048_576), packageManager: "pnpm@9.0.0" });
    expect(Buffer.byteLength(over)).toBeGreaterThan(1_048_576);

    await expect(detect({ "package.json": over, "yarn.lock": "" })).resolves.toEqual(LOCKFILE_ONLY);
  });

  it("reads a regular package.json under the cap as before, so its pin decides", async () => {
    // Behaviour that must not change: the cap refuses only what is over it.
    const under = json({ name: "app", description: "x".repeat(1_000_000), packageManager: "pnpm@9.0.0" });
    expect(Buffer.byteLength(under)).toBeLessThan(1_048_576);

    await expect(detect({ "package.json": under, "yarn.lock": "" })).resolves.toEqual({
      name: "pnpm",
      lockfile: "yarn.lock",
      fromPackageJsonField: true,
    });
  });
});
