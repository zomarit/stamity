import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — the build helpers ship as a plain .mjs module with no type
// declarations: the script that writes a release runtime runs under bare Node,
// with no TypeScript nearby.
import { runNpm } from "../../scripts/plugins/runtime.mjs";

/**
 * REQ-PLUGIN-006: the bundled runtime a plugin root ships, built by
 * `scripts/build-plugin-runtime.mjs` and proven the only way it can be proven
 * — by running it, from an empty directory, with nothing else installed.
 *
 * Two groups, deliberately split by cost.
 *
 *   the CLI contract  argument handling, the documented prune list, and the
 *                     tar reader's refusals, each driven by a hand-built
 *                     archive. No network, no build: these run everywhere and
 *                     on every commit.
 *   the built runtime a real `npm pack` of this checkout, extracted and
 *                     installed once for the whole suite. It needs `dist/`,
 *                     which CI builds before it tests (.github/workflows/ci.yml
 *                     "Build", unconditional across the matrix), so the leg is
 *                     armed on every required CI run and on any local run after
 *                     `npm run build`. A bare local `npm test` on an unbuilt
 *                     checkout SKIPS rather than packing an empty artifact and
 *                     asserting against it — the skip is loud, the false green
 *                     would not be.
 *
 * The runtime is built under `os.tmpdir()`, never inside the checkout: the leak
 * gate lists files through `git ls-files` first and an ignored directory inside
 * a repository lists ZERO files, which would turn its "0 hits" into a pass over
 * nothing.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "build-plugin-runtime.mjs");
const GATE_PATH = join(REPO_ROOT, "scripts", "leak-gate.mjs");

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly engines: { readonly node: string };
}
const PACKAGE = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8")) as Manifest;
const BUILT = existsSync(join(REPO_ROOT, "dist", "cli.js"));

/**
 * The declared size budget for a bundled runtime (REQ-PLUGIN-006's
 * testCriteria). It is a budget, not a measurement: the build prints the real
 * number on every run, and this ceiling moves only with a stated reason.
 */
const SIZE_BUDGET_BYTES = 12 * 1024 * 1024;

/**
 * Derived, not guessed. The build extracts a tarball, runs `npm ci` for the
 * whole production graph against a registry, prunes, and walks the tree twice:
 *
 *   npm ci, cold cache, shared runner   ~120s
 *   registry latency and retries         x2   — a runner with no warm cache
 *   extract + prune + two walks          ~20s
 *   margin                               x2   — a loaded runner, not a second budget
 *   = (120 x 2 + 20) x 2 ≈ 520s, rounded to 600s
 *
 * Passed to spawnSync AND to vitest, so a hung npm is killed by the child
 * timeout and REPORTS its partial output rather than being cut off by the
 * runner with nothing to read.
 */
const BUILD_TIMEOUT_MS = 600_000;

/** The same derivation as test/ci/leakGate.test.ts: a full scan of a vendor tree. */
const GATE_TIMEOUT_MS = 180_000;

const WORK = realpathSync(mkdtempSync(join(tmpdir(), "stamity-plugin-runtime-")));

afterAll(() => {
  rmSync(WORK, { recursive: true, force: true });
});

// ── a hand-built archive, for the reader's refusals ──────────────────────────

/** One 512-byte ustar header. Enough of the format for the reader to accept it. */
function tarHeader(name: string, size: number, type: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf-8");
  header.write("0000644\0", 100, 8, "utf-8");
  header.write("0000000\0", 108, 8, "utf-8");
  header.write("0000000\0", 116, 8, "utf-8");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "utf-8");
  header.write("00000000000\0", 136, 12, "utf-8");
  header.write("        ", 148, 8, "utf-8");
  header.write(type, 156, 1, "utf-8");
  header.write("ustar\u000000", 257, 8, "utf-8");
  return header;
}

interface Entry {
  readonly name: string;
  readonly type?: string;
  readonly body?: string;
}

function writeArchive(name: string, entries: readonly Entry[]): string {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? "", "utf-8");
    blocks.push(tarHeader(entry.name, body.length, entry.type ?? "0"));
    if (body.length > 0) {
      const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
      body.copy(padded);
      blocks.push(padded);
    }
  }
  blocks.push(Buffer.alloc(1024));
  const path = join(WORK, `${name}.tgz`);
  writeFileSync(path, gzipSync(Buffer.concat(blocks)));
  return path;
}

function runBuild(args: readonly string[], timeout = 60_000): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: "utf-8", timeout });
}

function outDir(name: string): string {
  return join(WORK, "out", name);
}

// ── the CLI contract ─────────────────────────────────────────────────────────

describe("build-plugin-runtime, the CLI contract", () => {
  it("exits 2 with its usage when an argument is missing", () => {
    const result = runBuild(["--out", outDir("no-tarball")]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage: node scripts/build-plugin-runtime.mjs");
  });

  it("exits 2 on an unknown argument", () => {
    const result = runBuild(["--wat"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--wat");
  });

  it("exits 2 when the tarball does not exist", () => {
    const missing = join(WORK, "absent.tgz");

    const result = runBuild(["--tarball", missing, "--out", outDir("absent")]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(missing);
  });

  it("refuses an --out that already holds files, and leaves them alone", () => {
    const out = outDir("occupied");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "keep-me"), "mine\n");
    const tarball = writeArchive("occupied", [{ name: "package/package.json", body: "{}\n" }]);

    const result = runBuild(["--tarball", tarball, "--out", out]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(out);
    expect(readFileSync(join(out, "keep-me"), "utf-8")).toBe("mine\n");
  });

  it("accepts an --out that exists and is empty", () => {
    const out = outDir("empty");
    mkdirSync(out, { recursive: true });
    // No lockfile install is reached: the archive carries no package.json, so
    // the build fails AFTER extraction. What this case proves is that the empty
    // directory was not itself the refusal.
    const tarball = writeArchive("empty", [{ name: "package/readme.txt", body: "hello\n" }]);

    const result = runBuild(["--tarball", tarball, "--out", out]);

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("already holds");
    expect(readFileSync(join(out, "readme.txt"), "utf-8")).toBe("hello\n");
  });

  it("runs npm through the interpreter, on whatever platform this is", () => {
    // The one portability claim the fast leg can make on its own. `npm` is
    // `npm.cmd` on Windows and Node will not spawn a .cmd without a shell, so
    // the helper resolves npm's JavaScript entry instead — and this asserts it
    // resolved to something that answers, rather than that the code compiles.
    expect(runNpm(["--version"]).trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("documents its exit codes and its prune list in the script header", () => {
    const source = readFileSync(SCRIPT_PATH, "utf-8");

    expect(source).toContain("Exit codes:");
    expect(source).toContain("Usage:");
    for (const pruned of [".package-lock.json", "*.md", "*.map", "*.d.ts", "*.d.mts", "*.d.cts", "node_modules/@types"]) {
      expect(source, `the header does not document pruning ${pruned}`).toContain(pruned);
    }
    expect(source).toContain("LICENSE");
  });
});

describe("build-plugin-runtime, the tar reader's refusals", () => {
  const cases = [
    { label: "a symbolic link", entry: { name: "package/evil-link", type: "2" } },
    { label: "a hard link", entry: { name: "package/evil-hard", type: "1" } },
    { label: "an absolute path", entry: { name: "/etc/passwd", body: "x\n" } },
    { label: "a backslash", entry: { name: "package\\evil.js", body: "x\n" } },
    { label: "a parent segment", entry: { name: "package/../evil.js", body: "x\n" } },
    { label: "a path outside the package prefix", entry: { name: "elsewhere/evil.js", body: "x\n" } },
  ] as const;

  for (const { label, entry } of cases) {
    it(`exits 1 naming the entry for ${label}`, () => {
      const tarball = writeArchive(`refuse-${entry.name.replaceAll(/\W/g, "_")}`, [
        { name: "package/package.json", body: "{}\n" },
        entry,
      ]);
      const out = outDir(`refuse-${label.replaceAll(" ", "-")}`);

      const result = runBuild(["--tarball", tarball, "--out", out]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(entry.name);
    });
  }
});

// ── the built runtime ────────────────────────────────────────────────────────

interface RuntimeManifest {
  readonly package: string;
  readonly version: string;
  readonly nodeFloor: string;
  readonly tarballSha256: string;
  readonly dependencies: Readonly<Record<string, string>>;
}

/** Every regular file under a tree, keyed by its POSIX-normalised relative path. */
function digestTree(root: string): Map<string, string> {
  const digests = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else digests.set(relative(root, absolute).split(sep).join("/"), createHash("sha256").update(readFileSync(absolute)).digest("hex"));
    }
  };
  walk(root);
  return digests;
}

describe.skipIf(!BUILT)("the runtime built from a real npm pack", () => {
  let tarball = "";
  let runtime = "";
  let build: SpawnSyncReturns<string> = {} as SpawnSyncReturns<string>;

  beforeAll(() => {
    const packed = JSON.parse(
      runNpm(["pack", "--json", "--pack-destination", WORK], { cwd: REPO_ROOT, timeout: BUILD_TIMEOUT_MS }),
    ) as ReadonlyArray<{ filename: string }>;
    tarball = join(WORK, packed[0]?.filename ?? "");
    runtime = outDir("runtime-a");
    build = runBuild(["--tarball", tarball, "--out", runtime], BUILD_TIMEOUT_MS);
  }, BUILD_TIMEOUT_MS);

  it("builds, and prints the file count and the byte size", () => {
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
    expect(build.stdout).toMatch(/\d+ file\(s\), \d+ byte\(s\)/);
  });

  it("runs standalone: node dist/cli.js --version in an empty directory", () => {
    const empty = join(WORK, "empty-cwd");
    mkdirSync(empty, { recursive: true });

    const result = spawnSync(process.execPath, [join(runtime, "dist", "cli.js"), "--version"], {
      cwd: empty,
      encoding: "utf-8",
      timeout: 60_000,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toContain(PACKAGE.version);
  });

  it("installs the production graph and nothing optional or type-only", () => {
    const modules = join(runtime, "node_modules");
    for (const present of ["commander", "p-limit", "semver", "yaml", "proper-lockfile"]) {
      expect(existsSync(join(modules, present)), `${present} is missing`).toBe(true);
    }
    expect(existsSync(join(modules, "sigstore")), "sigstore was installed").toBe(false);
    expect(existsSync(join(modules, "@types")), "@types survived the prune").toBe(false);
    expect(existsSync(join(modules, ".package-lock.json"))).toBe(false);
  });

  it("stays under the declared size budget", () => {
    const measured = /(\d+) file\(s\), (\d+) byte\(s\)/.exec(build.stdout);
    expect(measured, build.stdout).not.toBeNull();
    const bytes = Number(measured?.[2]);
    const files = Number(measured?.[1]);

    expect(files).toBeGreaterThan(0);
    expect(bytes, `measured ${bytes} bytes, budget ${SIZE_BUDGET_BYTES}`).toBeLessThan(SIZE_BUDGET_BYTES);
  });

  it("passes the leak gate over the whole tree, vendor directories included", () => {
    const result = spawnSync(process.execPath, [GATE_PATH, "--root", runtime, "--include-build"], {
      encoding: "utf-8",
      timeout: GATE_TIMEOUT_MS,
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    // A zero exit from a no-op path establishes no scan at all: the file count
    // has to be nonzero for this to be evidence.
    expect(result.stdout).toMatch(/^leak-gate: PASS - 0 hits for [1-9]\d* rule\(s\) across [1-9]\d* file\(s\)$/m);
  }, GATE_TIMEOUT_MS);

  it("writes RUNTIME.json in a fixed key order, naming the tarball digest", () => {
    const manifest = JSON.parse(readFileSync(join(runtime, "RUNTIME.json"), "utf-8")) as RuntimeManifest;

    expect(Object.keys(manifest)).toEqual(["package", "version", "nodeFloor", "tarballSha256", "dependencies"]);
    expect(manifest.package).toBe(PACKAGE.name);
    expect(manifest.version).toBe(PACKAGE.version);
    expect(manifest.nodeFloor).toBe(PACKAGE.engines.node);
    expect(manifest.tarballSha256).toBe(createHash("sha256").update(readFileSync(tarball)).digest("hex"));

    const names = Object.keys(manifest.dependencies);
    expect(names).toEqual(names.toSorted());
    expect(names).toContain("commander");
    expect(names).toContain("semver");
    expect(names.filter((name) => name.startsWith("@types/"))).toEqual([]);
    expect(names).not.toContain("sigstore");
    expect(manifest.dependencies["semver"]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("is deterministic: a second build of one tarball is byte-identical", () => {
    const second = outDir("runtime-b");
    const again = runBuild(["--tarball", tarball, "--out", second], BUILD_TIMEOUT_MS);
    expect(again.status, `${again.stdout}\n${again.stderr}`).toBe(0);

    const first = digestTree(runtime);
    const other = digestTree(second);

    expect([...other.keys()].toSorted()).toEqual([...first.keys()].toSorted());
    expect(Object.fromEntries(other)).toEqual(Object.fromEntries(first));
  }, BUILD_TIMEOUT_MS);

  it("leaves a runtime whose own manifest still declares the Node floor", () => {
    const installed = JSON.parse(readFileSync(join(runtime, "package.json"), "utf-8")) as Manifest;

    expect(installed.engines.node).toBe(PACKAGE.engines.node);
    expect(statSync(join(runtime, "dist", "cli.js")).size).toBeGreaterThan(0);
  });
});
