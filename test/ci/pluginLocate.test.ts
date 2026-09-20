import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * REQ-PLUGIN-007 (resolution order and refusals) and REQ-PLUGIN-008 (the probe
 * a doctor row reads), against `scripts/plugins/locate.mjs` — the file copied
 * verbatim into every plugin root as `runtime/locate.mjs`.
 *
 * Every case runs the locator as a client runs it: a real child process, from a
 * real fixture tree, with a controlled environment. Nothing here imports the
 * module, because the two behaviours under test — which interpreter starts,
 * and what exit code comes back — do not exist in-process.
 *
 * The fixtures carry no built runtime. A plugin root here is a descriptor, the
 * verbatim locator, a runtime `package.json` declaring the Node floor, and a
 * stub `dist/cli.js` that prints which copy ran, its argv and its cwd. That is
 * the whole surface the locator touches, so the suite stays sub-second and
 * stays honest: a test that needed a real 12 MiB runtime to prove resolution
 * order would be proving something else.
 *
 * Every path assertion is composed with `node:path`, never a `/` literal — the
 * Windows CI leg is the confirmation of record for this file.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LOCATE_SOURCE = join(REPO_ROOT, "scripts", "plugins", "locate.mjs");

/** The companion package a root declares; the same name this repo publishes. */
const COMPANION = "@zomarit/stamity";
const COMPANION_SEGMENTS = COMPANION.split("/");

/** The floor every fixture runtime declares, and a version safely below it. */
const FLOOR = "22.22.2";
const BELOW_FLOOR = "20.11.1";

const WORK = realpathSync(mkdtempSync(join(tmpdir(), "stamity-locate-")));

afterAll(() => {
  rmSync(WORK, { recursive: true, force: true });
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** A runtime entry stub: it reports which copy ran, so "which one started" is observable. */
function stub(which: string): string {
  return [
    "const args = process.argv.slice(2)",
    "if (args.includes('--boom')) process.exit(7)",
    `process.stdout.write(JSON.stringify({ ran: ${JSON.stringify(which)}, args, cwd: process.cwd() }) + '\\n')`,
    "",
  ].join("\n");
}

interface RootOptions {
  readonly version?: string;
  readonly bundled?: boolean;
  readonly descriptor?: boolean;
}

/** A plugin root as P3–P6 lay one out, minus everything the locator never reads. */
function makeRoot(name: string, options: RootOptions = {}): string {
  const root = join(WORK, "roots", name);
  const version = options.version ?? "1.8.0";
  mkdirSync(join(root, "runtime", "dist"), { recursive: true });
  copyFileSync(LOCATE_SOURCE, join(root, "runtime", "locate.mjs"));
  if (options.descriptor !== false) {
    writeJson(join(root, "stamity-plugin.json"), {
      name: "stamity",
      version,
      runtime: { companion: { package: COMPANION } },
    });
  }
  writeJson(join(root, "runtime", "package.json"), {
    name: COMPANION,
    version,
    engines: { node: `>=${FLOOR}` },
    bin: { stamity: "./dist/cli.js" },
  });
  if (options.bundled !== false) {
    writeFileSync(join(root, "runtime", "dist", "cli.js"), stub("bundled"));
  }
  return root;
}

/**
 * A project directory. `companion` is a version to install under
 * `node_modules`, `"broken"` for a companion whose manifest does not parse,
 * `null` for a project with a package.json and no companion, and `"bare"` for
 * a directory with no package.json at all (its temp-root ancestors have none
 * either, which is what makes the walk terminate with no candidate).
 */
function makeProject(name: string, companion: string | null): string {
  const dir = join(WORK, "projects", name);
  mkdirSync(dir, { recursive: true });
  if (companion === "bare") return dir;
  writeJson(join(dir, "package.json"), { name, private: true, version: "0.0.0" });
  if (companion === null) return dir;
  const pkg = join(dir, "node_modules", ...COMPANION_SEGMENTS);
  if (companion === "broken") {
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), "{ this is not JSON");
    return dir;
  }
  writeJson(join(pkg, "package.json"), {
    name: COMPANION,
    version: companion,
    bin: { stamity: "./dist/cli.js" },
  });
  mkdirSync(join(pkg, "dist"), { recursive: true });
  writeFileSync(join(pkg, "dist", "cli.js"), stub("companion"));
  return dir;
}

function companionEntry(project: string): string {
  return join(project, "node_modules", ...COMPANION_SEGMENTS, "dist", "cli.js");
}

interface RunOptions {
  readonly cwd: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function runLocate(root: string, options: RunOptions): SpawnSyncReturns<string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  // The two variables under test are inherited from whatever launched vitest;
  // a case that does not set one must not read the operator's value.
  delete env["STAMITY_REPO_ROOT"];
  delete env["STAMITY_LOCATE_NODE_VERSION"];
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, [join(root, "runtime", "locate.mjs"), ...(options.args ?? [])], {
    cwd: options.cwd,
    env,
    encoding: "utf-8",
    timeout: 20_000,
  });
}

interface LocateReport {
  project: string;
  runtime: { kind: string; path: string | null; version: string | null; refusal: string | null };
  node: { version: string; floor: string | null; ok: boolean };
}

function report(result: SpawnSyncReturns<string>): LocateReport {
  expect(result.stderr, "the locator wrote to stderr").toBe("");
  return JSON.parse(result.stdout) as LocateReport;
}

describe("the locator resolves a runtime", () => {
  it("names the companion when its version satisfies the declared range", () => {
    const root = makeRoot("companion-exact");
    const project = makeProject("companion-exact", "1.8.0");

    const result = runLocate(root, { cwd: project, args: ["--print"] });

    expect(result.status, result.stderr).toBe(0);
    const json = report(result);
    expect(json.project).toBe(project);
    expect(json.runtime.kind).toBe("companion");
    expect(json.runtime.path).toBe(companionEntry(project));
    expect(json.runtime.version).toBe("1.8.0");
    expect(json.runtime.refusal).toBeNull();
  });

  it("accepts a companion ahead of the plugin inside the same major", () => {
    const root = makeRoot("companion-ahead");
    const project = makeProject("companion-ahead", "1.9.3");

    const json = report(runLocate(root, { cwd: project, args: ["--print"] }));

    expect(json.runtime.kind).toBe("companion");
    expect(json.runtime.version).toBe("1.9.3");
  });

  it("falls back to the bundled copy when the companion is a major ahead", () => {
    const root = makeRoot("companion-next-major");
    const project = makeProject("companion-next-major", "2.0.0");

    const json = report(runLocate(root, { cwd: project, args: ["--print"] }));

    expect(json.runtime.kind).toBe("bundled");
    expect(json.runtime.path).toBe(join(root, "runtime", "dist", "cli.js"));
    expect(json.runtime.version).toBe("1.8.0");
  });

  it("falls back to the bundled copy when the companion is behind the plugin", () => {
    const root = makeRoot("companion-behind");
    const project = makeProject("companion-behind", "1.7.9");

    expect(report(runLocate(root, { cwd: project, args: ["--print"] })).runtime.kind).toBe("bundled");
  });

  it("falls back to the bundled copy when the project has no companion", () => {
    const root = makeRoot("no-companion");
    const project = makeProject("no-companion", null);

    const json = report(runLocate(root, { cwd: project, args: ["--print"] }));

    expect(json.runtime.kind).toBe("bundled");
    expect(json.runtime.path).toBe(join(root, "runtime", "dist", "cli.js"));
  });

  it("falls back to the bundled copy when no package.json sits above the project", () => {
    const root = makeRoot("bare-project");
    const project = makeProject("bare-project", "bare");

    const json = report(runLocate(root, { cwd: project, args: ["--print"] }));

    expect(json.runtime.kind).toBe("bundled");
  });

  it("treats a companion manifest that does not parse as absent, and says so on stderr", () => {
    const root = makeRoot("broken-companion");
    const project = makeProject("broken-companion", "broken");

    const result = runLocate(root, { cwd: project, args: ["--print"] });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain(join(project, "node_modules", ...COMPANION_SEGMENTS, "package.json"));
    const json = JSON.parse(result.stdout) as LocateReport;
    expect(json.runtime.kind).toBe("bundled");
  });

  it("accepts only an exactly equal companion for a prerelease plugin version", () => {
    const root = makeRoot("prerelease", { version: "1.9.0-rc.1" });
    const equal = makeProject("prerelease-equal", "1.9.0-rc.1");
    const released = makeProject("prerelease-released", "1.9.0");

    expect(report(runLocate(root, { cwd: equal, args: ["--print"] })).runtime.kind).toBe("companion");
    expect(report(runLocate(root, { cwd: released, args: ["--print"] })).runtime.kind).toBe("bundled");
  });

  it("refuses a prerelease companion under a released plugin version", () => {
    const root = makeRoot("companion-prerelease");
    const project = makeProject("companion-prerelease", "1.9.0-rc.1");

    expect(report(runLocate(root, { cwd: project, args: ["--print"] })).runtime.kind).toBe("bundled");
  });

  it("reads the companion package name from --companion", () => {
    const root = makeRoot("companion-flag");
    const project = makeProject("companion-flag", "1.8.0");

    const json = report(runLocate(root, { cwd: project, args: ["--print", "--companion", "@nobody/absent"] }));

    expect(json.runtime.kind).toBe("bundled");
  });

  it("locates itself from a bare runtime directory with no plugin descriptor", () => {
    const root = makeRoot("no-descriptor", { descriptor: false });
    const project = makeProject("no-descriptor", "1.8.0");

    const json = report(runLocate(root, { cwd: project, args: ["--print"] }));

    expect(json.runtime.kind).toBe("companion");
    expect(json.runtime.version).toBe("1.8.0");
  });
});

describe("the locator resolves the project directory", () => {
  it("prefers --project over the working directory", () => {
    const root = makeRoot("project-flag");
    const cwd = makeProject("project-flag-cwd", "1.8.0");
    const elsewhere = makeProject("project-flag-elsewhere", null);

    const json = report(runLocate(root, { cwd, args: ["--print", "--project", elsewhere] }));

    expect(json.project).toBe(elsewhere);
    expect(json.runtime.kind).toBe("bundled");
  });

  it("honours STAMITY_REPO_ROOT when it is an ancestor holding a state directory", () => {
    const root = makeRoot("repo-root-ancestor");
    const declared = makeProject("repo-root-ancestor", "1.8.0");
    mkdirSync(join(declared, ".stamity"), { recursive: true });
    const nested = join(declared, "packages", "inner");
    mkdirSync(nested, { recursive: true });

    const json = report(runLocate(root, { cwd: nested, args: ["--print"], env: { STAMITY_REPO_ROOT: declared } }));

    expect(json.project).toBe(declared);
    expect(json.runtime.kind).toBe("companion");
  });

  it("ignores STAMITY_REPO_ROOT when the declared directory holds no state directory", () => {
    const root = makeRoot("repo-root-no-state");
    const declared = makeProject("repo-root-no-state", "1.8.0");
    const nested = join(declared, "packages", "inner");
    mkdirSync(nested, { recursive: true });

    const json = report(runLocate(root, { cwd: nested, args: ["--print"], env: { STAMITY_REPO_ROOT: declared } }));

    expect(json.project).toBe(nested);
  });

  it("ignores STAMITY_REPO_ROOT when it is not an ancestor of the working directory", () => {
    const root = makeRoot("repo-root-unrelated");
    const declared = makeProject("repo-root-unrelated-declared", "1.8.0");
    mkdirSync(join(declared, ".stamity"), { recursive: true });
    const cwd = makeProject("repo-root-unrelated-cwd", null);

    const json = report(runLocate(root, { cwd, args: ["--print"], env: { STAMITY_REPO_ROOT: declared } }));

    expect(json.project).toBe(cwd);
    expect(json.runtime.kind).toBe("bundled");
  });
});

describe("the locator refuses", () => {
  it("exits 2 naming the floor, the found version and the install instruction", () => {
    const root = makeRoot("below-floor");
    const project = makeProject("below-floor", "1.8.0");

    const result = runLocate(root, {
      cwd: project,
      args: [],
      env: { STAMITY_LOCATE_NODE_VERSION: BELOW_FLOOR },
    });

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe(
      `stamity plugin: Node ${BELOW_FLOOR} is below the floor ${FLOOR}; ` +
        `install Node ${FLOOR} or newer (https://nodejs.org) and retry`,
    );
  });

  it("reports the floor refusal through --print as kind none, and still exits 2", () => {
    const root = makeRoot("below-floor-print");
    const project = makeProject("below-floor-print", "1.8.0");

    const result = runLocate(root, {
      cwd: project,
      args: ["--print"],
      env: { STAMITY_LOCATE_NODE_VERSION: BELOW_FLOOR },
    });

    expect(result.status).toBe(2);
    const json = JSON.parse(result.stdout) as LocateReport;
    expect(json.runtime.kind).toBe("none");
    expect(json.runtime.path).toBeNull();
    expect(json.node).toEqual({ version: BELOW_FLOOR, floor: FLOOR, ok: false });
    expect(json.runtime.refusal).toContain("below the floor");
  });

  it("exits 2 naming both probed paths when no runtime resolves", () => {
    const root = makeRoot("no-runtime", { bundled: false });
    const project = makeProject("no-runtime", null);

    const result = runLocate(root, { cwd: project, args: [] });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(join(project, "node_modules", ...COMPANION_SEGMENTS, "package.json"));
    expect(result.stderr).toContain(join(root, "runtime", "dist", "cli.js"));
    expect(result.stderr).toContain("reinstall the plugin");
  });

  it("exits 2 on an unknown argument", () => {
    const root = makeRoot("bad-argument");
    const project = makeProject("bad-argument", null);

    const result = runLocate(root, { cwd: project, args: ["--nope"] });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--nope");
    expect(result.stderr).toContain("Usage:");
  });
});

describe("the locator runs the resolved runtime", () => {
  it("forwards the arguments after -- and runs in the project directory", () => {
    const root = makeRoot("forward-args");
    const project = makeProject("forward-args", null);

    const result = runLocate(root, { cwd: project, args: ["--", "--version"] });

    expect(result.status, result.stderr).toBe(0);
    const spoken = JSON.parse(result.stdout) as { ran: string; args: string[]; cwd: string };
    expect(spoken).toEqual({ ran: "bundled", args: ["--version"], cwd: project });
  });

  it("runs the companion copy when one resolves", () => {
    const root = makeRoot("forward-companion");
    const project = makeProject("forward-companion", "1.8.0");

    const result = runLocate(root, { cwd: project, args: ["--", "--version"] });

    expect(result.status, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as { ran: string }).ran).toBe("companion");
  });

  it("exits with the child's status", () => {
    const root = makeRoot("child-status");
    const project = makeProject("child-status", null);

    expect(runLocate(root, { cwd: project, args: ["--", "--boom"] }).status).toBe(7);
  });

  it("never runs a stamity found on PATH", () => {
    const root = makeRoot("path-shim");
    const project = makeProject("path-shim", null);
    const shimDir = join(WORK, "shim");
    mkdirSync(shimDir, { recursive: true });
    // Both spellings: a POSIX shell script and the shim a Windows PATH lookup
    // would find. The assertion is the same on either — 99 never appears.
    writeFileSync(join(shimDir, "stamity"), "#!/bin/sh\nexit 99\n");
    writeFileSync(join(shimDir, "stamity.cmd"), "@exit /b 99\r\n");
    chmodSync(join(shimDir, "stamity"), 0o755);

    const result = runLocate(root, {
      cwd: project,
      args: ["--", "--version"],
      env: { PATH: `${shimDir}${delimiter}${process.env["PATH"] ?? ""}` },
    });

    expect(result.status, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as { ran: string }).ran).toBe("bundled");
  });
});
