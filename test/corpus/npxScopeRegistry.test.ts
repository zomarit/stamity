import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pinnedCliCall } from "../../src/shared/cliCall.ts";
import { makeTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * What the registry-bound call buys, measured on npm itself (REQ-PLUGIN-048).
 *
 * A fork made with `fork-identity.mjs --registry` publishes `@acme/stamity` to its own registry,
 * and npx finds a scope's registry only in npm's configuration. On a machine without the scope
 * mapping, the bare `npx -y @acme/stamity@<v> <verb>` asks the default registry, where anyone may
 * hold the name. The call `pinnedCliCall` renders for such a fork names the registry for the scope
 * ahead of the spec, and npm then takes the fork's package from the fork's registry and every other
 * package from the default one.
 *
 * Two stub registries on 127.0.0.1, built here: a "fork" stub serving `@acme/stamity`, which
 * depends on the unscoped `acme-dep-x`, and a "public" stub serving that dependency plus a
 * look-alike `@acme/stamity`. The child's default registry is the public stub, and no scope
 * mapping exists. The rendered call must run the fork's build, with the dependency from the public
 * stub; the bare call (the positive control) must run the look-alike, or the first case's
 * assertions could never fail.
 *
 * The rendered call names an https registry, the only kind `pinnedCliCall` writes (`REGISTRY_URL`),
 * and the stubs speak plain http, so the one URL is swapped for the fork stub's address before the
 * run. The flag, its place between `-y` and the spec, and the spec are the rendered call's own.
 *
 * npm runs as `npx-cli.js` under this interpreter with an environment built from scratch, as in
 * `npxNoRefusal.test.ts`, whose tarball, PATH and environment helpers these restate (a test file
 * cannot import another's without running its cases).
 */

const FORK_NAME = "@acme/stamity";
const VERSION = "1.2.3-acme.1";
const DEP_NAME = "acme-dep-x";
const DEP_VERSION = "1.0.0";
const FORK_TEXT = "ACME-FORK-BUILD-RAN";
const LOOK_ALIKE_TEXT = "ACME-LOOK-ALIKE-RAN";
/** The https placeholder the call is rendered with; swapped for the fork stub's http address. */
const RENDERED_REGISTRY = "https://fork.registry.invalid/";
const SPAWN_BUDGET_MS = 45_000;
const TEST_TIMEOUT_MS = 60_000;

/** `npx-cli.js` beside the `npm-cli.js` that launched this process, else beside the interpreter. */
function locateNpxCli(): { npxCli: string; version: string } {
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
  if (found === undefined) throw new Error(`no npx-cli.js found; looked at ${candidates.join(", ")}`);
  const npxCli = realpathSync(found);
  const manifest = JSON.parse(readFileSync(join(dirname(dirname(npxCli)), "package.json"), "utf8")) as {
    version: string;
  };
  return { npxCli, version: manifest.version };
}

/** One ustar header; the zeroed buffer already holds every terminator. */
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

interface ServedPackage {
  readonly manifest: Record<string, unknown> & { name: string; version: string };
  readonly tarball: Buffer;
}

/** A package whose single bin prints `text`, then whatever its dependency exports, if it has one. */
function binPackage(name: string, text: string, dependency?: string): ServedPackage {
  const manifest = {
    name,
    version: VERSION,
    bin: { stamity: "bin.js" },
    ...(dependency === undefined ? {} : { dependencies: { [dependency]: DEP_VERSION } }),
  };
  const tail = dependency === undefined ? "" : ` + " " + require(${JSON.stringify(dependency)})`;
  const tarball = npmTarball({
    "package.json": JSON.stringify(manifest),
    "bin.js": `#!/usr/bin/env node\nconsole.log(${JSON.stringify(text)}${tail} + " argv=" + process.argv.slice(2).join(","));\n`,
  });
  return { manifest, tarball };
}

function dependencyPackage(): ServedPackage {
  const manifest = { name: DEP_NAME, version: DEP_VERSION, main: "index.js" };
  const tarball = npmTarball({
    "package.json": JSON.stringify(manifest),
    "index.js": 'module.exports = "dep-ok";\n',
  });
  return { manifest, tarball };
}

interface StubRegistry {
  readonly server: Server;
  readonly url: string;
  /** Every request's decoded path, in arrival order. */
  readonly requests: string[];
}

/** A registry serving `packages` by name; every other path answers 404. */
async function startRegistry(packages: readonly ServedPackage[]): Promise<StubRegistry> {
  const requests: string[] = [];
  const state = { url: "" };
  const byName = new Map(packages.map((served) => [served.manifest.name, served]));
  const tarballPath = (served: ServedPackage): string =>
    `/${served.manifest.name}/-/${served.manifest.name.split("/").pop()}-${served.manifest.version}.tgz`;
  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url ?? "");
    requests.push(path);
    const packument = byName.get(path.slice(1));
    if (packument !== undefined) {
      const { manifest, tarball } = packument;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          name: manifest.name,
          "dist-tags": { latest: manifest.version },
          versions: {
            [manifest.version]: {
              ...manifest,
              _id: `${manifest.name}@${manifest.version}`,
              dist: {
                tarball: `${state.url}${tarballPath(packument).slice(1)}`,
                shasum: createHash("sha1").update(tarball).digest("hex"),
                integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
              },
            },
          },
        }),
      );
      return;
    }
    const served = packages.find((candidate) => tarballPath(candidate) === path);
    if (served !== undefined) {
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
  return { server, url: state.url, requests };
}

async function stopRegistry(registry: StubRegistry | undefined): Promise<void> {
  if (registry === undefined) return;
  await new Promise<void>((resolveClose) => {
    registry.server.close(() => resolveClose());
    registry.server.closeAllConnections();
  });
}

/** The child's one PATH folder: links to this interpreter and `sh` on POSIX, the interpreter's folder on Windows. */
function pathDir(root: string): string {
  return process.platform === "win32" ? dirname(process.execPath) : join(root, "path-bin");
}

/** Windows' process basics; none carries npm configuration. */
const WINDOWS_CARRIED = ["SystemRoot", "windir", "ComSpec", "PATHEXT"];

/** The child environment from scratch: the public stub is the default registry, and no scope is mapped. */
function isolatedEnv(root: string, defaultRegistry: string): Record<string, string> {
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
  env["npm_config_registry"] = defaultRegistry;
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
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Asynchronous, so the stubs keep serving from this event loop while npm runs. */
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

describe("the registry-bound call on npm itself (REQ-PLUGIN-048)", () => {
  let npm: { npxCli: string; version: string };
  let temp: TempDirHandle;
  let fork: StubRegistry;
  let publicRegistry: StubRegistry;

  beforeAll(async () => {
    npm = locateNpxCli();
    temp = await makeTempDir("npx-scope-registry");
    fork = await startRegistry([binPackage(FORK_NAME, FORK_TEXT, DEP_NAME)]);
    publicRegistry = await startRegistry([binPackage(FORK_NAME, LOOK_ALIKE_TEXT), dependencyPackage()]);
  });

  afterAll(async () => {
    await stopRegistry(fork);
    await stopRegistry(publicRegistry);
    await temp?.cleanup();
  });

  beforeEach(() => {
    fork.requests.length = 0;
    publicRegistry.requests.length = 0;
  });

  /** A fresh project and npm home per case, so no case sees another's npx cache. */
  async function freshCase(label: string): Promise<{ project: string; env: Record<string, string> }> {
    const root = temp.path(label);
    const project = join(root, "project");
    const dirs = [project, join(root, "home"), join(root, "tmp"), join(root, "global")];
    if (process.platform === "win32") dirs.push(join(root, "appdata"), join(root, "localappdata"));
    await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
    if (process.platform !== "win32") {
      await mkdir(pathDir(root), { recursive: true });
      await symlink(process.execPath, join(pathDir(root), "node"));
      await symlink("/bin/sh", join(pathDir(root), "sh"));
    }
    await writeFile(join(root, "empty-npmrc"), "");
    await writeFile(join(root, "empty-globalrc"), "");
    await writeFile(
      join(project, "package.json"),
      `${JSON.stringify({ name: `scope-registry-${label}`, version: "1.0.0", private: true }, null, 2)}\n`,
    );
    return { project, env: isolatedEnv(root, publicRegistry.url) };
  }

  /** The call's arguments after `npx`, as rendered, with the one registry URL pointed at the fork stub. */
  function argsOf(call: string): string[] {
    const args = call.split(" ").slice(1);
    return args.map((arg) => arg.replace(RENDERED_REGISTRY, fork.url));
  }

  function context(run: NpxRun): string {
    return (
      `npm ${npm.version}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}\n` +
      `fork: ${fork.requests.join(", ")}\npublic: ${publicRegistry.requests.join(", ")}`
    );
  }

  it(
    "runs the fork's build from the fork's registry, taking only the unscoped dependency from the default one",
    async () => {
      const { project, env } = await freshCase("bound");
      const call = pinnedCliCall(FORK_NAME, VERSION, "learn capture", { registry: RENDERED_REGISTRY });
      // The rendered shape: the flag between `-y` and the spec it must precede.
      expect(call).toBe(`npx -y --@acme:registry=${RENDERED_REGISTRY} ${FORK_NAME}@${VERSION} learn capture`);

      const run = await runNpx(npm.npxCli, argsOf(call), project, env);
      const why = context(run);

      expect(run.code, why).toBe(0);
      expect(run.stdout, why).toContain(`${FORK_TEXT} dep-ok argv=learn,capture`);
      expect(run.stdout, why).not.toContain(LOOK_ALIKE_TEXT);
      // The fork stub served the package's packument and tarball, and nothing else.
      expect(fork.requests, why).toContain(`/${FORK_NAME}`);
      expect(fork.requests.some((path) => path.endsWith(".tgz")), why).toBe(true);
      expect(fork.requests.every((path) => path.startsWith(`/${FORK_NAME}`)), why).toBe(true);
      // The default registry was asked for the unscoped dependency only.
      expect(publicRegistry.requests, why).toContain(`/${DEP_NAME}`);
      expect(publicRegistry.requests.every((path) => path.startsWith(`/${DEP_NAME}`)), why).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "control: the bare call on the same machine runs the default registry's look-alike",
    async () => {
      const { project, env } = await freshCase("bare");
      const call = pinnedCliCall(FORK_NAME, VERSION, "learn capture");

      const run = await runNpx(npm.npxCli, argsOf(call), project, env);
      const why = context(run);

      expect(run.code, why).toBe(0);
      expect(run.stdout, why).toContain(LOOK_ALIKE_TEXT);
      expect(run.stdout, why).not.toContain(FORK_TEXT);
      expect(fork.requests, why).toEqual([]);
      expect(publicRegistry.requests, why).toContain(`/${FORK_NAME}`);
    },
    TEST_TIMEOUT_MS,
  );
});
