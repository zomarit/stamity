import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { devNull } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach } from "vitest";
import { carriedProcessEnv, seedGitRepo } from "./repoFixtures.ts";
import { makeTempDir } from "./tempDir.ts";

/**
 * The child-process e2e lane: spawns the real CLI entry (`node --import tsx
 * src/cli.ts`, the same mechanics as test/smoke.test.ts) against an isolated
 * pseudo-home fixture, so every run exercises the bin exactly as a user would
 * — without ever touching the developer's real home, config, or state.
 *
 * Entry selection: `entry: "dist"` spawns the BUILT binary — plain
 * `node <repo>/dist/cli.js`, no tsx loader — under the same isolation
 * contract, which is how the dist dogfood lane proves the artifact `npx`
 * actually runs. The caller makes the build exist first
 * (test/support/distBuild.ts::ensureDistBuilt); the default stays `"src"`,
 * so existing suites are byte-untouched by the option.
 *
 * Isolation contract (per run):
 *   - the child env is BUILT FRESH — `process.env` is never spread wholesale.
 *     Carried from the parent: PATH (+ Windows runtime keys) so node and git
 *     resolve, and `NODE_*` vars so the runtime behaves as configured.
 *   - HOME, USERPROFILE, XDG_CONFIG_HOME, XDG_CACHE_HOME, XDG_STATE_HOME all
 *     point inside the fixture's pseudo-home.
 *   - git reads no machine state: GIT_CONFIG_NOSYSTEM=1 cuts /etc/gitconfig and
 *     GIT_CONFIG_GLOBAL=os.devNull cuts ~/.gitconfig, so a developer's signing
 *     key, hook template, alias, or `status.showUntrackedFiles` cannot change
 *     what a CLI run under this harness sees. Same pair repoFixtures.ts's
 *     seeder sets; test/cli/engine/gitStatus.test.ts spells the system half
 *     `GIT_CONFIG_SYSTEM=devNull`, which is the same cut by the other of git's
 *     two documented switches.
 *   - defaults: NO_COLOR=1, STAMITY_NO_UPDATE_CHECK=1, TERM=dumb, LC_ALL=C —
 *     each overridable per run (an `undefined` override deletes the key).
 *   - CI and NO_UPDATE_NOTIFIER are never carried.
 *   - no network: nothing here reaches beyond the local filesystem and git.
 *
 * Serialization: vitest runs the tests within one file sequentially, and each
 * fixture owns its own mkdtemp tree (realpath-resolved base via tempDir.ts),
 * so cross-file parallelism is safe through per-fixture isolation alone — no
 * vitest.config change is made for this lane.
 *
 * Lane discipline: like tempDir.ts/vfs.ts, this module imports nothing from
 * src/ — the CLI is exercised only across the process boundary.
 */

export interface CliRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface PseudoHome {
  home: string;
  configDir: string;
  cacheDir: string;
  stateDir: string;
}

export interface CliFixture {
  repoDir: string;
  home: PseudoHome;
  run(
    args: readonly string[],
    opts?: { env?: Record<string, string | undefined>; cwd?: string; stdin?: string },
  ): Promise<CliRunResult>;
  seed(files: Record<string, string>): Promise<void>;
  cleanup(): Promise<void>;
}

const CLI_ENTRY = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const DIST_ENTRY = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

// Resolved to an absolute file URL because the child's cwd is the fixture repo
// dir, from which the bare specifier "tsx" would not resolve. tsx's "." export
// is its loader entry — the module `node --import tsx` loads.
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

/**
 * Constructs the child env per the isolation contract in the header. Exported
 * (internal to the harness + its tests) so tests can assert on the exact env a
 * run receives and reuse it for non-CLI probe children.
 */
export function buildChildEnv(
  home: PseudoHome,
  overrides?: Record<string, string | undefined>,
): Record<string, string> {
  const env = carriedProcessEnv();
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key.startsWith("NODE_")) env[key] = value;
  }
  // CI and NO_UPDATE_NOTIFIER are intentionally absent: a fresh build carries
  // nothing, and neither is in the carried set above.
  env["HOME"] = home.home;
  env["USERPROFILE"] = home.home;
  env["XDG_CONFIG_HOME"] = home.configDir;
  env["XDG_CACHE_HOME"] = home.cacheDir;
  env["XDG_STATE_HOME"] = home.stateDir;
  // Both halves of git's config search path, cut. HOME already points at the
  // pseudo-home, but that only moves ~/.gitconfig — it does not stop git from
  // reading /etc/gitconfig, and a fixture that later writes into the
  // pseudo-home would re-open the global half.
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  env["GIT_CONFIG_GLOBAL"] = devNull;
  env["TERM"] = "dumb";
  env["LC_ALL"] = "C";
  env["NO_COLOR"] = "1";
  env["STAMITY_NO_UPDATE_CHECK"] = "1";
  if (overrides !== undefined) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
  return env;
}

export interface SpawnCollectOptions {
  cwd: string;
  env: Record<string, string>;
  stdin?: string | undefined;
}

/**
 * Low-level spawn-and-collect used by `CliFixture.run` and exported (internal
 * to the harness + its tests) so probe children share the exact code path.
 *
 * - `stdin` provided: written, then the stream is closed — no hang. Delivery
 *   in full is attempted, not guaranteed: a child that closes its read end
 *   early, or a payload past the pipe buffer that the child never drains,
 *   fails the write. That failure REJECTS this promise with the command named,
 *   which is the narrow claim — an unhandled `error` event on `child.stdin`
 *   is an uncaught exception at process level, and it takes down the vitest
 *   worker (every test in the file, attributed to whichever one was running)
 *   rather than the run that could not deliver its input.
 *   Absent: stdin is wired to the null device, so reads see immediate EOF.
 * - Signal death (`code === null`): mapped to `code: -1` with the signal
 *   named in stderr for diagnosis.
 */
export function spawnCollect(
  command: string,
  args: readonly string[],
  options: SpawnCollectOptions,
): Promise<CliRunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      if (code === null) {
        const separator = stderr === "" || stderr.endsWith("\n") ? "" : "\n";
        resolvePromise({
          code: -1,
          stdout,
          stderr: `${stderr}${separator}[cliHarness] child terminated by signal ${signal ?? "unknown"}\n`,
        });
      } else {
        resolvePromise({ code, stdout, stderr });
      }
    });

    if (options.stdin !== undefined) {
      const { stdin } = child;
      if (stdin === null) {
        rejectPromise(
          new Error(`[cliHarness] ${command} was given stdin but has no stdin stream to write it to`),
        );
        return;
      }
      // Attached BEFORE `end()`: the write starts as soon as it is called, so a
      // listener registered afterwards can miss an EPIPE the same turn raises —
      // which is the exact error this listener exists for.
      stdin.on("error", (cause: NodeJS.ErrnoException) => {
        rejectPromise(
          new Error(
            `[cliHarness] failed to pipe stdin to ${command} ${JSON.stringify(args)}: ` +
              `${cause.code ?? "unknown"} ${cause.message}`,
            { cause },
          ),
        );
      });
      stdin.end(options.stdin);
    }
  });
}

/**
 * Creates an isolated CLI fixture: `<tree>/home` (pseudo-home with .config,
 * .cache, .local/state) and `<tree>/repo` (the working repo, the default cwd
 * for runs). All paths are canonical: the tempDir base is realpath-resolved,
 * so the macOS /var -> /private/var symlink never skews path comparisons.
 *
 * `opts.seed` writes repo-relative files before `opts.git` (when true) runs
 * `seedGitRepo` on the repo dir — so seeded files land in the first commit.
 * Construction failures (e.g. GitUnavailableError) clean up their own tree.
 */
export async function makeCliFixture(opts?: {
  seed?: Record<string, string>;
  git?: boolean;
  entry?: "src" | "dist";
}): Promise<CliFixture> {
  const temp = await makeTempDir("cli-fixture");
  try {
    const home: PseudoHome = {
      home: temp.path("home"),
      configDir: temp.path("home", ".config"),
      cacheDir: temp.path("home", ".cache"),
      stateDir: temp.path("home", ".local", "state"),
    };
    const repoDir = temp.path("repo");
    // Sequential: concurrent recursive mkdir over the shared "home" ancestor
    // can surface EEXIST (see the note in tempDir.ts::seedFiles).
    await mkdir(home.configDir, { recursive: true });
    await mkdir(home.cacheDir, { recursive: true });
    await mkdir(home.stateDir, { recursive: true });
    await mkdir(repoDir, { recursive: true });

    const seed = async (files: Record<string, string>): Promise<void> => {
      // Repo-scoped containment guard; tempDir's own guard only catches
      // escapes from the whole tree, not from repo/ into home/.
      for (const key of Object.keys(files)) {
        const target = resolve(repoDir, key);
        const rel = relative(repoDir, target);
        if (rel === "") {
          throw new Error(`seed(): ${JSON.stringify(key)} is not a file path`);
        }
        if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
          throw new Error(`seed(): ${JSON.stringify(key)} escapes the fixture repo dir ${repoDir}`);
        }
      }
      await temp.seedFiles(
        Object.fromEntries(
          Object.entries(files).map(([key, content]) => [`repo/${key}`, content]),
        ),
      );
    };

    if (opts?.seed !== undefined) await seed(opts.seed);
    if (opts?.git === true) await seedGitRepo(repoDir);

    // "dist" runs the built artifact bare — the tsx loader must NOT be present,
    // or the run would prove the loader lane instead of the shipped binary.
    const entryArgs =
      opts?.entry === "dist" ? [DIST_ENTRY] : ["--import", TSX_LOADER, CLI_ENTRY];

    return {
      repoDir,
      home,
      run: (args, runOpts) =>
        spawnCollect(process.execPath, [...entryArgs, ...args], {
          cwd: runOpts?.cwd === undefined ? repoDir : resolve(repoDir, runOpts.cwd),
          env: buildChildEnv(home, runOpts?.env),
          stdin: runOpts?.stdin,
        }),
      seed,
      cleanup: () => temp.cleanup(),
    };
  } catch (error) {
    await temp.cleanup();
    throw error;
  }
}

/**
 * Wires a fresh fixture into vitest's per-test lifecycle and returns a getter
 * for it. Call at suite scope; call the getter inside the test. With
 * `git: true` a missing git binary rejects in beforeEach (failing the test,
 * not skipping) — suites that must skip instead call `makeCliFixture` in the
 * test body and convert GitUnavailableError to `ctx.skip()`.
 */
export function useCliFixture(opts?: {
  seed?: Record<string, string>;
  git?: boolean;
  entry?: "src" | "dist";
}): () => CliFixture {
  let current: CliFixture | null = null;

  beforeEach(async () => {
    current = await makeCliFixture(opts);
  });

  afterEach(async () => {
    const fixture = current;
    current = null;
    await fixture?.cleanup();
  });

  return () => {
    if (current === null) {
      throw new Error(
        "useCliFixture(): no fixture for the current test — call the getter inside it()/test(), not at suite scope",
      );
    }
    return current;
  };
}
