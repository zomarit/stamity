import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { delimiter, dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * npm's own refusal behind the corpus call form (REQ-FLOW-002, QA row P01 of
 * run 2026-09-30_optimization-sweep).
 *
 * The corpus tells an agent to run `npx --no stamity <verb>` and to fall back to
 * the pinned `${STAMITY:CLI} <verb>` where npm refuses. `cliCallForm.test.ts`
 * proves our files always carry `--no`; this file proves what `--no` buys, by
 * running npm itself: with no installed copy, `npx --no stamity check` reads the
 * unscoped name's manifest and then refuses, downloading, installing and running
 * nothing — whether the registry holds no `stamity` (today) or a squatter's.
 *
 * The registry is a stub on 127.0.0.1 built here, so the run needs no internet
 * and the squatter case is real: the stub serves a packument and a tarball for
 * an unscoped `stamity@99.0.0` whose bin and preinstall script would write a
 * marker file. Its request log is the evidence that npm really resolved the
 * name (the packument was fetched) and never fetched the tarball.
 *
 * A positive control runs the same squatter with `--yes` and must see the
 * tarball fetched, the preinstall and the bin both write the marker, and the
 * bin's output: without it the "nothing ran" assertions could never fail. Each
 * case has its own marker path, baked into its own tarball, so the control's
 * marker cannot satisfy or poison a refusal case.
 *
 * npm is run as the JavaScript program it is — `npx-cli.js` under this
 * interpreter — so no `.cmd` shim and no shell sits between the test and npm on
 * Windows. The child environment is built from scratch: `npm test` exports
 * dozens of `npm_config_*` keys (a `yes` among them would change the answer),
 * so none is inherited; the cache, the user and global config, and the global
 * prefix are temp paths, and PATH is one folder (`pathDir`) that holds no
 * `stamity`, so no bin on the operator's PATH or in a global prefix is visible.
 *
 * A probe must use a verb. `npx --no stamity --version` proves nothing: npm
 * takes a `--version` that follows the package name as its own flag, prints
 * npm's version and exits 0 without resolving `stamity` at all (observed on
 * npm 10.9.8, 2026-09-30). P01's first step 2 used that form, so it could not
 * show the refusal; `check` is the verb here.
 *
 * Observed wording, npm 10.9.8 and 11.19.0: a squatter-served name ends in
 * "npx canceled due to missing packages and no YES option" on both (libnpmexec's
 * `yes === false` branch). An absent name ends in `npm error code E404` on both,
 * but the detail line moved: npm 10 says "'stamity@*' is not in this registry",
 * npm 11 says it "could not be found or you do not have permission to access
 * it", so the absent case asserts the error code only.
 */

const NAME = "stamity";
const SQUATTER_VERSION = "99.0.0";
const PACKUMENT_PATH = `/${NAME}`;
const TARBALL_PATH = `/${NAME}/-/${NAME}-${SQUATTER_VERSION}.tgz`;
/** What the squatter's bin prints and writes if it ever runs. */
const RAN_TEXT = "STAMITY-SQUATTER-RAN";
/** npm's own timings are 1-3 s a run; the spawn budget sits well inside the test's. */
const SPAWN_BUDGET_MS = 45_000;
const TEST_TIMEOUT_MS = 60_000;

/** The copy of npm that runs this suite, as npm's JavaScript entries. */
interface NpmInstall {
  readonly npxCli: string;
  readonly version: string;
}

/**
 * `npx-cli.js`: beside the `npm-cli.js` npm exports when it launched this
 * process, else beside the interpreter in the Windows or the POSIX layout.
 * Symlinks resolve, so a version manager's shim lands on the real install.
 */
function locateNpm(): NpmInstall {
  const execDir = dirname(process.execPath);
  const declared = process.env["npm_execpath"];
  const candidates = [
    ...(typeof declared === "string" && /(^|[\\/])npm-cli\.[cm]?js$/.test(declared)
      ? [join(dirname(declared), "npx-cli.js")]
      : []),
    join(execDir, "node_modules", "npm", "bin", "npx-cli.js"),
    join(execDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(`no npx-cli.js found for this interpreter; looked at ${candidates.join(", ")}`);
  }
  const npxCli = realpathSync(found);
  const manifest = JSON.parse(readFileSync(join(dirname(dirname(npxCli)), "package.json"), "utf8")) as {
    version: string;
  };
  return { npxCli, version: manifest.version };
}

/**
 * One ustar header. The buffer starts zeroed, so every field's terminator and
 * the NUL between `ustar` and `00` are already in place.
 */
function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000755 ", 100, 8, "utf8");
  header.write("0000000 ", 108, 8, "utf8");
  header.write("0000000 ", 116, 8, "utf8");
  header.write(`${size.toString(8).padStart(11, "0")} `, 124, 12, "utf8");
  header.write("00000000000 ", 136, 12, "utf8");
  header.write("0", 156, 1, "utf8");
  header.write("ustar", 257, 5, "utf8");
  header.write("00", 263, 2, "utf8");
  // The checksum is summed with its own field read as eight spaces.
  header.fill(0x20, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(sum.toString(8).padStart(6, "0"), 148, 6, "utf8");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

/** A gzipped npm tarball: every file under `package/`. */
function npmTarball(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text, "utf8");
    blocks.push(tarHeader(`package/${name}`, body.length), body);
    const pad = (512 - (body.length % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

/** A package the stub registry serves: its manifest and its tarball. */
interface ServedPackage {
  readonly manifest: Record<string, unknown>;
  readonly tarball: Buffer;
}

/**
 * The squatter: a real, installable `stamity` that appends to `markerPath` when
 * its preinstall runs (`installed`) and when its bin runs (`ran`).
 */
function squatterPackage(markerPath: string): ServedPackage {
  const manifest = {
    name: NAME,
    version: SQUATTER_VERSION,
    bin: { [NAME]: "bin.js" },
    scripts: { preinstall: "node install.js" },
  };
  const marker = JSON.stringify(markerPath);
  const tarball = npmTarball({
    "package.json": JSON.stringify(manifest),
    "bin.js": `#!/usr/bin/env node\nrequire("node:fs").appendFileSync(${marker}, "ran\\n");\nconsole.log(${JSON.stringify(RAN_TEXT)});\n`,
    "install.js": `require("node:fs").appendFileSync(${marker}, "installed\\n");\n`,
  });
  return { manifest, tarball };
}

interface StubRegistry {
  readonly server: Server;
  readonly url: string;
  /** Every request's path, in arrival order. */
  readonly requests: string[];
  /** The squatter this registry serves as `stamity`; `null` serves a 404 for every path. */
  served: ServedPackage | null;
}

async function startRegistry(): Promise<StubRegistry> {
  const requests: string[] = [];
  const state = { served: null as ServedPackage | null, url: "" };
  const server = createServer((request, response) => {
    const path = request.url ?? "";
    requests.push(path);
    const served = state.served;
    if (served !== null && path === PACKUMENT_PATH) {
      const { manifest, tarball } = served;
      const packument = {
        name: NAME,
        "dist-tags": { latest: SQUATTER_VERSION },
        versions: {
          [SQUATTER_VERSION]: {
            ...manifest,
            _id: `${NAME}@${SQUATTER_VERSION}`,
            dist: {
              tarball: `${state.url}${TARBALL_PATH.slice(1)}`,
              shasum: createHash("sha1").update(tarball).digest("hex"),
              integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
            },
          },
        },
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(packument));
      return;
    }
    if (served !== null && path === TARBALL_PATH) {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(served.tarball);
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const { port } = server.address() as AddressInfo;
  state.url = `http://127.0.0.1:${port}/`;
  return {
    server,
    url: state.url,
    requests,
    get served() {
      return state.served;
    },
    set served(next: ServedPackage | null) {
      state.served = next;
    },
  };
}

/**
 * The child's one PATH folder. On POSIX it is `<root>/path-bin`, holding links
 * to this interpreter and to /bin/sh and nothing else: the interpreter's own
 * folder may hold a globally installed `stamity`, and npx starts the scripts of
 * what it installs through a bare `sh` it finds on PATH (it ignores
 * `script-shell` there). With both reachable, a squatter npm did install could
 * run its preinstall and its bin and write the marker, so the marker
 * assertions can see an install. On Windows, where a link needs a privilege
 * the runner may lack, it is the interpreter's folder, and the script shell is
 * the carried ComSpec; each case asserts no `stamity` sits in it.
 */
function pathDir(root: string): string {
  return process.platform === "win32" ? dirname(process.execPath) : join(root, "path-bin");
}

async function preparePathDir(root: string): Promise<void> {
  if (process.platform === "win32") return;
  const dir = pathDir(root);
  await mkdir(dir, { recursive: true });
  await symlink(process.execPath, join(dir, "node"));
  await symlink("/bin/sh", join(dir, "sh"));
}

/**
 * Windows needs these to start any process; none of them carries npm
 * configuration. One spelling each: `process.env` reads them case-insensitively
 * there, so a second spelling would only duplicate the key in the child.
 */
const WINDOWS_CARRIED = ["SystemRoot", "windir", "ComSpec", "PATHEXT"];

/**
 * The child environment, from scratch: no inherited key at all but Windows'
 * process basics, so no `npm_config_*`, `NPM_CONFIG_*`, proxy or CI key reaches
 * npm from the suite's own environment.
 */
function isolatedEnv(root: string, registryUrl: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.platform === "win32") {
    for (const key of WINDOWS_CARRIED) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }
    env["APPDATA"] = join(root, "appdata");
    env["LOCALAPPDATA"] = join(root, "localappdata");
  }
  env["PATH"] = pathDir(root);
  env["HOME"] = join(root, "home");
  env["USERPROFILE"] = join(root, "home");
  env["TMPDIR"] = join(root, "tmp");
  env["TEMP"] = join(root, "tmp");
  env["TMP"] = join(root, "tmp");
  env["NO_COLOR"] = "1";
  env["npm_config_registry"] = registryUrl;
  env["npm_config_cache"] = join(root, "cache");
  env["npm_config_userconfig"] = join(root, "empty-npmrc");
  env["npm_config_globalconfig"] = join(root, "empty-globalrc");
  env["npm_config_prefix"] = join(root, "global");
  env["npm_config_update_notifier"] = "false";
  env["npm_config_audit"] = "false";
  env["npm_config_fund"] = "false";
  return env;
}

interface NpxRun {
  /** The exit code; `null` when the child died by signal or could not start. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Asynchronous on purpose: the stub registry serves from this process's event
 * loop, so a synchronous spawn would starve it. The budget kills a hung npm.
 */
function runNpx(npxCli: string, args: readonly string[], cwd: string, env: Record<string, string>): Promise<NpxRun> {
  return new Promise((resolveRun) => {
    execFile(
      process.execPath,
      [npxCli, ...args],
      { cwd, env, timeout: SPAWN_BUDGET_MS, windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : null;
        resolveRun({ code, stdout, stderr });
      },
    );
  });
}

/** Any `stamity` bin the child's PATH could reach. */
function stamityOnPath(env: Record<string, string>): string[] {
  return (env["PATH"] ?? "")
    .split(delimiter)
    .flatMap((dir) => [join(dir, NAME), join(dir, `${NAME}.cmd`)])
    .filter((path) => existsSync(path));
}

/** `_npx/<hash>` folders that hold a `node_modules` — any install npx made. */
function npxInstalls(cacheDir: string): string[] {
  const npxDir = join(cacheDir, "_npx");
  if (!existsSync(npxDir)) return [];
  return readdirSync(npxDir).filter((hash) => existsSync(join(npxDir, hash, "node_modules")));
}

/** Where a global install of `stamity` would land, in the POSIX and the Windows prefix layouts. */
function globalCopies(prefix: string): string[] {
  return [
    join(prefix, "lib", "node_modules", NAME),
    join(prefix, "node_modules", NAME),
    join(prefix, "bin", NAME),
    join(prefix, NAME),
    join(prefix, `${NAME}.cmd`),
  ].filter((path) => existsSync(path));
}

describe("npx --no on the unscoped name (REQ-FLOW-002, QA P01)", () => {
  let npm: NpmInstall;
  let temp: TempDirHandle;
  let registry: StubRegistry;

  beforeAll(async () => {
    npm = locateNpm();
    temp = await makeTempDir("npx-no-refusal");
    registry = await startRegistry();
  });

  afterAll(async () => {
    if (registry !== undefined) {
      await new Promise<void>((resolveClose) => {
        registry.server.close(() => resolveClose());
        registry.server.closeAllConnections();
      });
    }
    await temp?.cleanup();
  });

  beforeEach(() => {
    registry.requests.length = 0;
  });

  /**
   * A fresh project, npm home and marker path per case, so no case sees another's
   * cache or marker.
   */
  async function freshCase(
    label: string,
  ): Promise<{ project: string; root: string; markerPath: string; env: Record<string, string> }> {
    const root = temp.path(label);
    const project = join(root, "project");
    const dirs = [project, join(root, "home"), join(root, "tmp"), join(root, "global")];
    if (process.platform === "win32") dirs.push(join(root, "appdata"), join(root, "localappdata"));
    await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
    await preparePathDir(root);
    await writeFile(join(root, "empty-npmrc"), "");
    await writeFile(join(root, "empty-globalrc"), "");
    await writeFile(
      join(project, "package.json"),
      `${JSON.stringify({ name: `qa-p01-${label}`, version: "1.0.0", private: true }, null, 2)}\n`,
    );
    return { project, root, markerPath: join(root, "marker.txt"), env: isolatedEnv(root, registry.url) };
  }

  it(
    "refuses a registry-served stamity: reads its manifest, never fetches the tarball, installs and runs nothing",
    async () => {
      const { project, root, markerPath, env } = await freshCase("squatter");
      registry.served = squatterPackage(markerPath);
      const before = await readFile(join(project, "package.json"), "utf8");

      const run = await runNpx(npm.npxCli, ["--no", NAME, "check"], project, env);
      const context = `npm ${npm.version}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}\nrequests: ${registry.requests.join(", ")}`;
      expect(stamityOnPath(env), context).toEqual([]);

      // The scenario is live: npm resolved the name against the stub.
      expect(registry.requests, context).toContain(PACKUMENT_PATH);
      // An npm error, and a non-zero exit.
      expect(run.code, context).not.toBe(0);
      expect(run.code, context).not.toBeNull();
      expect(run.stderr, context).toMatch(/canceled due to missing packages/i);
      // Nothing was downloaded.
      expect(registry.requests.filter((path) => path.endsWith(".tgz")), context).toEqual([]);
      expect(registry.requests, context).not.toContain(TARBALL_PATH);
      // Nothing ran and no install script ran: no stamity output, no marker.
      expect(run.stdout, context).not.toContain(RAN_TEXT);
      expect(existsSync(markerPath), context).toBe(false);
      // Nothing was installed here, in npx's cache, or globally.
      expect(existsSync(join(project, "node_modules")), context).toBe(false);
      expect(await readFile(join(project, "package.json"), "utf8"), context).toBe(before);
      expect(npxInstalls(join(root, "cache")), context).toEqual([]);
      expect(globalCopies(join(root, "global")), context).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "refuses when the registry holds no stamity: a 404, a non-zero exit, nothing installed or run",
    async () => {
      const { project, root, markerPath, env } = await freshCase("absent");
      registry.served = null;
      const before = await readFile(join(project, "package.json"), "utf8");

      const run = await runNpx(npm.npxCli, ["--no", NAME, "check"], project, env);
      const context = `npm ${npm.version}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}\nrequests: ${registry.requests.join(", ")}`;
      expect(stamityOnPath(env), context).toEqual([]);

      expect(registry.requests, context).toContain(PACKUMENT_PATH);
      expect(run.code, context).not.toBe(0);
      expect(run.code, context).not.toBeNull();
      expect(run.stderr, context).toMatch(/\bE404\b/);
      expect(registry.requests.filter((path) => path.endsWith(".tgz")), context).toEqual([]);
      expect(run.stdout, context).not.toContain(RAN_TEXT);
      expect(existsSync(markerPath), context).toBe(false);
      expect(existsSync(join(project, "node_modules")), context).toBe(false);
      expect(await readFile(join(project, "package.json"), "utf8"), context).toBe(before);
      expect(npxInstalls(join(root, "cache")), context).toEqual([]);
      expect(globalCopies(join(root, "global")), context).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "control: the same squatter with --yes is fetched, installed and run, so the refusal assertions can fail",
    async () => {
      const { project, markerPath, env } = await freshCase("yes-control");
      registry.served = squatterPackage(markerPath);

      const run = await runNpx(npm.npxCli, ["--yes", NAME, "check"], project, env);
      const context = `npm ${npm.version}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}\nrequests: ${registry.requests.join(", ")}`;
      expect(stamityOnPath(env), context).toEqual([]);

      // The stub's packument is accepted and its tarball is installable.
      expect(registry.requests, context).toContain(PACKUMENT_PATH);
      expect(registry.requests, context).toContain(TARBALL_PATH);
      // The preinstall script ran, then the bin ran, each through the child's PATH.
      expect(existsSync(markerPath), context).toBe(true);
      expect(await readFile(markerPath, "utf8"), context).toBe("installed\nran\n");
      expect(run.stdout, context).toContain(RAN_TEXT);
      expect(run.code, context).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
