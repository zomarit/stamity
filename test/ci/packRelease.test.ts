import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { seedGitRepo } from "../support/repoFixtures.ts";
import { type TempDirHandle, useTempDir } from "../support/tempDir.ts";
// @ts-expect-error — the release pack is a native ESM source-checkout script with no type declarations.
import { packRelease, productionShrinkwrap, SHRINKWRAP } from "../../scripts/pack-release.mjs";
// @ts-expect-error — the smoke remains a native ESM source-checkout script.
import { installedShrinkwrapProblem } from "../../scripts/tarball-smoke.mjs";

/**
 * REQ-FLOW-049: the published package carries the dependency tree it was tested with.
 *
 * `scripts/pack-release.mjs` derives a production `npm-shrinkwrap.json` from the gated
 * `package-lock.json`, packs with it at the root, and removes it again. These cases hold the
 * derivation to the lock's own rows (no dev row ships, a devOptional row reads optional, the root
 * row loses its devDependencies), and the pack to its write-then-remove contract, a throwing pack
 * included. The pack itself is a stub `run`: a real `npm pack` here would pack this checkout's
 * whole `dist/` from inside a unit test, and the real pack is proved end to end by
 * `node scripts/tarball-smoke.mjs`, which installs the tarball and reads the shrinkwrap back.
 */

type Row = Record<string, unknown>;
interface Lock {
  name: string;
  version: string;
  lockfileVersion: number;
  requires?: boolean;
  packages: Record<string, Row>;
}
interface RunCall {
  command: string;
  args: readonly string[];
  options: { cwd?: string };
}

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "pack-release.mjs");
const getTemp = useTempDir("pack-release");

/** A lock holding one row of each kind npm writes: prod, optional, devOptional, dev, dev+optional. */
function fixtureLock(): Lock {
  return {
    name: "fixture",
    version: "1.2.3",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "fixture",
        version: "1.2.3",
        license: "MIT",
        dependencies: { prod: "^1.0.0", both: "^1.0.0" },
        bin: { fixture: "dist/cli.js" },
        devDependencies: { dev: "^1.0.0" },
        optionalDependencies: { opt: "^1.0.0" },
      },
      "node_modules/prod": { version: "1.0.0", resolved: "https://r/prod", integrity: "sha512-p", license: "MIT" },
      "node_modules/opt": { version: "1.0.0", integrity: "sha512-o", optional: true, os: ["linux"] },
      "node_modules/both": { version: "1.0.0", integrity: "sha512-b", devOptional: true, license: "ISC" },
      "node_modules/dev": { version: "1.0.0", integrity: "sha512-d", dev: true, license: "MIT" },
      "node_modules/dev-opt": { version: "1.0.0", integrity: "sha512-x", dev: true, optional: true },
    },
  };
}

/** The pack JSON `npm pack --json` prints, listing `files`. */
function packJson(paths: readonly string[]): string {
  return `${JSON.stringify([{ filename: "fixture-1.2.3.tgz", files: paths.map((path) => ({ path, size: 1, mode: 420 })) }], null, 2)}\n`;
}

/** A git repository in `temp` whose one commit holds `lock` as package-lock.json, the release's input. */
async function seedCommittedLock(temp: TempDirHandle, lock: unknown = fixtureLock()): Promise<void> {
  await temp.seedFiles({ "package-lock.json": JSON.stringify(lock) });
  await seedGitRepo(temp.dir);
}

describe("productionShrinkwrap", () => {
  it("drops every dev row, reads devOptional as optional, strips the root's devDependencies, and keeps the rest", () => {
    const lock = fixtureLock();
    const before = JSON.stringify(lock);
    const shrinkwrap = productionShrinkwrap(lock) as Lock;

    expect(Object.keys(shrinkwrap.packages)).toEqual(["", "node_modules/prod", "node_modules/opt", "node_modules/both"]);
    // devOptional becomes optional in the spot it held, so the file diffs as one changed key.
    expect(shrinkwrap.packages["node_modules/both"]).toEqual({ version: "1.0.0", integrity: "sha512-b", optional: true, license: "ISC" });
    expect(Object.keys(shrinkwrap.packages["node_modules/both"]!)).toEqual(["version", "integrity", "optional", "license"]);
    expect(Object.keys(shrinkwrap.packages[""]!)).toEqual(["name", "version", "license", "dependencies", "bin", "optionalDependencies"]);
    const { devDependencies: _dropped, ...root } = lock.packages[""]!;
    expect(shrinkwrap.packages[""]).toEqual(root);
    expect(shrinkwrap.packages["node_modules/prod"]).toEqual(lock.packages["node_modules/prod"]);
    expect(shrinkwrap.packages["node_modules/opt"]).toEqual(lock.packages["node_modules/opt"]);
    expect(Object.keys(shrinkwrap)).toEqual(["name", "version", "lockfileVersion", "requires", "packages"]);
    expect({ ...shrinkwrap, packages: {} }).toEqual({ ...lock, packages: {} });
    // Pure: the input lock is untouched.
    expect(JSON.stringify(lock)).toBe(before);
  });

  it("refuses a lock that is not lockfileVersion 3", () => {
    for (const lockfileVersion of [1, 2, 4]) {
      expect(() => productionShrinkwrap({ ...fixtureLock(), lockfileVersion }), String(lockfileVersion)).toThrow(
        /lockfileVersion 3/,
      );
    }
    expect(() => productionShrinkwrap({ lockfileVersion: 3 })).toThrow(/packages/);
  });

  it("over this repository's lock, keeps a row for every production and optional dependency and no dev row", () => {
    const lock = JSON.parse(readFileSync(join(REPO_ROOT, "package-lock.json"), "utf8")) as Lock;
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      optionalDependencies: Record<string, string>;
    };
    const devRows = Object.values(lock.packages).filter((row) => row["dev"] === true).length;
    expect(devRows, "the lock holds dev rows, so dropping them is a real change").toBeGreaterThan(0);

    const shrinkwrap = productionShrinkwrap(lock) as Lock;
    const names = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.optionalDependencies)];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(shrinkwrap.packages[`node_modules/${name}`], name).toBeDefined();
    for (const [path, row] of Object.entries(shrinkwrap.packages)) {
      expect(row["dev"], path).toBeUndefined();
      expect(row["devOptional"], path).toBeUndefined();
    }
    expect(shrinkwrap.packages[""]!["devDependencies"]).toBeUndefined();
    // Every non-dev row of the gated lock is there, byte for byte apart from the devOptional rename.
    const kept = Object.entries(lock.packages).filter(([, row]) => row["dev"] !== true);
    expect(Object.keys(shrinkwrap.packages)).toEqual(kept.map(([path]) => path));
  });
});

describe("packRelease", () => {
  it("writes the shrinkwrap for the pack, runs npm pack --json into the destination, and removes it", async () => {
    const temp = getTemp();
    await seedCommittedLock(temp);
    const shrinkwrapPath = temp.path(SHRINKWRAP);
    const calls: RunCall[] = [];
    let seen: unknown;
    const run = (command: string, args: readonly string[], options: { cwd?: string }): string => {
      calls.push({ command, args, options });
      seen = JSON.parse(readFileSync(shrinkwrapPath, "utf8"));
      return packJson(["package.json", "npm-shrinkwrap.json", "dist/cli.js"]);
    };

    const result = packRelease({ root: temp.dir, destination: temp.path("out"), run }) as {
      stdout: string;
      packed: readonly { filename: string }[];
    };

    expect(calls).toHaveLength(1);
    expect(calls[0]!.command).toBe("npm");
    expect(calls[0]!.args).toEqual(["pack", "--json", "--pack-destination", temp.path("out")]);
    expect(calls[0]!.options.cwd).toBe(temp.dir);
    expect(seen).toEqual(productionShrinkwrap(fixtureLock()));
    expect(existsSync(shrinkwrapPath), "the shrinkwrap outlived the pack").toBe(false);
    expect(result.stdout).toBe(packJson(["package.json", "npm-shrinkwrap.json", "dist/cli.js"]));
    expect(result.packed[0]!.filename).toBe("fixture-1.2.3.tgz");
  });

  it("removes the shrinkwrap when the pack throws, and passes the failure on", async () => {
    const temp = getTemp();
    await seedCommittedLock(temp);
    let present = false;
    const run = (): string => {
      present = existsSync(temp.path(SHRINKWRAP));
      throw new Error("npm pack died");
    };

    expect(() => packRelease({ root: temp.dir, destination: temp.dir, run })).toThrow(/npm pack died/);
    expect(present).toBe(true);
    expect(existsSync(temp.path(SHRINKWRAP))).toBe(false);
  });

  it("refuses a leftover shrinkwrap at the root before any write or pack", async () => {
    const temp = getTemp();
    const leftover = '{"stale":true}\n';
    await temp.seedFiles({ "package-lock.json": JSON.stringify(fixtureLock()), [SHRINKWRAP]: leftover });
    let called = false;
    const run = (): string => {
      called = true;
      return packJson([SHRINKWRAP]);
    };

    expect(() => packRelease({ root: temp.dir, destination: temp.dir, run })).toThrow(/leftover/);
    expect(called).toBe(false);
    expect(readFileSync(temp.path(SHRINKWRAP), "utf8")).toBe(leftover);
  });

  it("refuses pack JSON whose file list lacks the shrinkwrap, and still removes it", async () => {
    const temp = getTemp();
    await seedCommittedLock(temp);
    const run = (): string => packJson(["package.json", "dist/cli.js"]);

    expect(() => packRelease({ root: temp.dir, destination: temp.dir, run })).toThrow(/npm-shrinkwrap\.json/);
    expect(existsSync(temp.path(SHRINKWRAP))).toBe(false);
  });

  it("writes nothing when the lock is not version 3", async () => {
    const temp = getTemp();
    await seedCommittedLock(temp, { ...fixtureLock(), lockfileVersion: 2 });
    let called = false;
    const run = (): string => {
      called = true;
      return packJson([SHRINKWRAP]);
    };

    expect(() => packRelease({ root: temp.dir, destination: temp.dir, run })).toThrow(/lockfileVersion 3/);
    expect(called).toBe(false);
    expect(existsSync(temp.path(SHRINKWRAP))).toBe(false);
  });

  // The release's lock check runs right after `npm ci`; build, tests and smoke run code before the
  // pack. A pin written in that window would ship, so the pack compares the lock with the commit.
  it("refuses a lock changed after the commit, before any write or pack", async () => {
    const temp = getTemp();
    await seedCommittedLock(temp);
    const swapped = fixtureLock();
    swapped.packages["node_modules/prod"] = { ...swapped.packages["node_modules/prod"], resolved: "https://elsewhere/prod", integrity: "sha512-z" };
    writeFileSync(temp.path("package-lock.json"), JSON.stringify(swapped));
    let called = false;
    const run = (): string => {
      called = true;
      return packJson([SHRINKWRAP]);
    };

    expect(() => packRelease({ root: temp.dir, destination: temp.dir, run })).toThrow(/differs from the committed one/);
    // One byte is enough: a trailing newline the commit does not hold is refused as well.
    writeFileSync(temp.path("package-lock.json"), `${JSON.stringify(fixtureLock())}\n`);
    expect(() => packRelease({ root: temp.dir, destination: temp.dir, run })).toThrow(/differs from the committed one/);
    expect(called).toBe(false);
    expect(existsSync(temp.path(SHRINKWRAP))).toBe(false);
  });

  it("refuses a root with no committed lock to compare with, before any write or pack", async () => {
    const temp = getTemp();
    await temp.seedFiles({ "package-lock.json": JSON.stringify(fixtureLock()) });
    let called = false;
    const run = (): string => {
      called = true;
      return packJson([SHRINKWRAP]);
    };

    expect(() => packRelease({ root: temp.dir, destination: temp.dir, run })).toThrow(/cannot read the committed package-lock\.json/);
    expect(called).toBe(false);
    expect(existsSync(temp.path(SHRINKWRAP))).toBe(false);
  });

  // An interrupt during the slow `npm pack` (Ctrl-C in a local smoke) used to end Node before the
  // `finally`, leaving a git-ignored shrinkwrap a plain `npm pack` or `npm publish` would ship. The
  // driver's stub `run` sends its own process the signal, inside the synchronous pack. Windows has
  // no POSIX signal delivery to a process from itself, so these cases run elsewhere.
  it.skipIf(process.platform === "win32")(
    "removes the shrinkwrap on SIGINT, SIGTERM and SIGHUP, still ends by the signal, and the next pack refuses an uncatchable kill's leftover",
    async () => {
      const temp = getTemp();
      await seedCommittedLock(temp);
      const driver = temp.path("driver.mjs");
      writeFileSync(
        driver,
        [
          `import { existsSync } from "node:fs";`,
          `import { join } from "node:path";`,
          `import { packRelease } from ${JSON.stringify(pathToFileURL(join(REPO_ROOT, "scripts", "pack-release.mjs")).href)};`,
          `const [root, signal] = process.argv.slice(2);`,
          `const run = () => {`,
          `  process.stdout.write(\`present:\${existsSync(join(root, ${JSON.stringify(SHRINKWRAP)}))}\\n\`);`,
          `  process.kill(process.pid, signal);`,
          `  return ${JSON.stringify(packJson([SHRINKWRAP]))};`,
          `};`,
          `packRelease({ root, destination: root, run });`,
          `process.stdout.write("returned\\n");`,
          ``,
        ].join("\n"),
      );
      const drive = (signal: string): ReturnType<typeof spawnSync> =>
        spawnSync(process.execPath, [driver, temp.dir, signal], { cwd: temp.dir, encoding: "utf8" });

      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        const result = drive(signal);
        expect(result.stdout, signal).toContain("present:true");
        expect(existsSync(temp.path(SHRINKWRAP)), `${signal} left the shrinkwrap at the root`).toBe(false);
        // The signal is held, not swallowed: the pack finishes its clean-up, then the process ends by it.
        expect(result.signal, signal).toBe(signal);
      }

      // SIGKILL cannot be caught, so its leftover stays, and the next pack refuses it untouched.
      const killed = drive("SIGKILL");
      expect(killed.signal).toBe("SIGKILL");
      const leftover = readFileSync(temp.path(SHRINKWRAP), "utf8");
      expect(() => packRelease({ root: temp.dir, destination: temp.dir, run: () => packJson([SHRINKWRAP]) })).toThrow(/leftover/);
      expect(readFileSync(temp.path(SHRINKWRAP), "utf8")).toBe(leftover);
    },
  );
});

describe("installedShrinkwrapProblem, the smoke's read of the installed package", () => {
  it("passes a production shrinkwrap and names a missing one, a dev row, a devOptional row and root devDependencies", async () => {
    const temp = getTemp();
    const write = (shrinkwrap: unknown): Promise<void> => temp.seedFiles({ [SHRINKWRAP]: JSON.stringify(shrinkwrap) });

    expect(installedShrinkwrapProblem(temp.dir)).toMatch(/missing or unreadable/);
    await write(productionShrinkwrap(fixtureLock()));
    expect(installedShrinkwrapProblem(temp.dir)).toBeNull();
    // The dev lock itself, copied as the shrinkwrap: the abuse case the release pack exists to stop.
    await write(fixtureLock());
    expect(installedShrinkwrapProblem(temp.dir)).toBe("ships 3 dev row(s): node_modules/both, node_modules/dev, node_modules/dev-opt");
    const rootOnly = fixtureLock();
    rootOnly.packages = { "": rootOnly.packages[""]! };
    await write(rootOnly);
    expect(installedShrinkwrapProblem(temp.dir)).toBe("root row still lists devDependencies");
    await write({ lockfileVersion: 3, packages: {} });
    expect(installedShrinkwrapProblem(temp.dir)).toBe("holds no packages");
  });
});

describe("pack-release.mjs, the command line", () => {
  function cli(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("exits 2 on a bad argument, names the usage, and writes nothing", () => {
    for (const args of [["--bogus"], ["--json"], ["--pack-destination"], ["--pack-destination", "."]]) {
      const result = cli(args);
      expect(result.status, args.join(" ")).toBe(2);
      expect(result.stdout, args.join(" ")).toBe("");
      expect(result.stderr, args.join(" ")).toContain("usage: node scripts/pack-release.mjs --pack-destination <dir> --json");
      expect(existsSync(join(REPO_ROOT, SHRINKWRAP)), args.join(" ")).toBe(false);
    }
  });

  it("exits 1 on a leftover shrinkwrap and leaves its bytes alone", async () => {
    // The CLI packs the checkout it lives in, so the leftover case runs against a copy of the
    // script beside a fixture lock, never against this repository's root.
    const temp = getTemp();
    await temp.seedFiles({
      "scripts/pack-release.mjs": readFileSync(SCRIPT, "utf8"),
      "scripts/native-typescript.mjs": readFileSync(join(REPO_ROOT, "scripts", "native-typescript.mjs"), "utf8"),
      "package-lock.json": JSON.stringify(fixtureLock()),
      [SHRINKWRAP]: "{}\n",
    });
    const result = spawnSync(process.execPath, [temp.path("scripts", "pack-release.mjs"), "--pack-destination", temp.dir, "--json"], {
      cwd: temp.dir,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("leftover");
    expect(readFileSync(temp.path(SHRINKWRAP), "utf8")).toBe("{}\n");
  });
});
