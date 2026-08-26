import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Deterministic repository fixtures for the child-process e2e lane.
 *
 * `seedGitRepo` drives the real `git` binary so history-derived detection (the
 * maturity seed reads contributors and commit counts) is exercised against
 * genuine repositories — but every input git folds into a commit is pinned:
 * author, committer, dates, message, and content. Two runs with the same
 * options produce byte-identical history (same HEAD sha).
 *
 * Machines without git: `seedGitRepo` throws an Error whose `name` is
 * `"GitUnavailableError"`; suites convert that to a vitest skip.
 */

const execFileAsync = promisify(execFile);

/** 2026-01-01T00:00:00Z — commit i is stamped EPOCH + i minutes. */
const FIXTURE_EPOCH_SECONDS = 1767225600;

const DEFAULT_AUTHORS: readonly { name: string; email: string }[] = [
  { name: "Fixture One", email: "one@fixture.invalid" },
];

/**
 * The value git documents for "read no configuration at this level", used for
 * `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` alike: git-config(1) ENVIRONMENT
 * says each "can be set to `/dev/null` to skip reading configuration files of
 * the respective level".
 *
 * The literal string, NOT `os.devNull`. On Windows that property is the device
 * path `\\.\nul`, which is not the spelling git knows: its config sequence
 * calls `access()` on the path first, gets EINVAL rather than ENOENT, and dies
 * — `fatal: unable to access '\\.\nul': Invalid argument` — before any
 * command runs. `/dev/null` is safe on both platforms because both of its
 * outcomes are the same outcome: git for Windows maps the name onto the `nul`
 * device and reads it empty, and any git that does not simply fails to find a
 * file at that path, which `access_or_die` classifies as a missing config and
 * skips. On POSIX the value is byte-identical to `os.devNull`.
 */
export const NO_GIT_CONFIG = "/dev/null";

/** Env vars the platform's process machinery needs to launch child binaries at all.
 *  Everything else is withheld — fixtures build their child env fresh. */
const WINDOWS_RUNTIME_KEYS = new Set(["SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP"]);

/**
 * PATH plus (on Windows) the runtime keys above, carried from the parent so
 * node and git resolve inside children. Shared by the git seeder here and the
 * CLI harness env builder — the single definition of "what leaks through".
 */
export function carriedProcessEnv(): Record<string, string> {
  const carried: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    // Windows spells it "Path"; env lookups there are case-insensitive.
    const isPath = process.platform === "win32" ? key.toUpperCase() === "PATH" : key === "PATH";
    const isWindowsRuntime =
      process.platform === "win32" && WINDOWS_RUNTIME_KEYS.has(key.toUpperCase());
    if (isPath || isWindowsRuntime) carried[key] = value;
  }
  return carried;
}

/**
 * Initializes `dir` as a git repository with `opts.commits` commits (default 1)
 * cycling round-robin through `opts.authors` (default one pinned author).
 * Commit i appends a line to `history.md` and stages the whole worktree, so
 * files seeded before the call land in the first commit — deterministic for a
 * given seed map. Single-shot: call once per directory.
 *
 * Isolation: system and global git config are cut off (`GIT_CONFIG_NOSYSTEM`,
 * `GIT_CONFIG_GLOBAL=/dev/null`, `HOME` pointed at `dir`), so user-level
 * signing, hooks, and templates cannot leak in. Identity comes solely from the
 * per-commit `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env.
 *
 * @throws Error with `name === "GitUnavailableError"` when the git binary
 *   cannot be resolved — callers convert this to a vitest skip.
 */
export async function seedGitRepo(
  dir: string,
  opts?: { commits?: number; authors?: readonly { name: string; email: string }[] },
): Promise<void> {
  const commits = opts?.commits ?? 1;
  if (!Number.isInteger(commits) || commits < 1) {
    throw new Error(`seedGitRepo(): commits must be a positive integer, got ${String(commits)}`);
  }
  const authors = opts?.authors !== undefined && opts.authors.length > 0
    ? opts.authors
    : DEFAULT_AUTHORS;
  const env = gitEnv(dir);

  // `-c init.defaultBranch=main` instead of `--initial-branch` so gits older
  // than 2.28 still initialize (branch name is irrelevant to the fixtures).
  await runGit(dir, ["-c", "init.defaultBranch=main", "init", "--quiet"], env);

  for (let index = 1; index <= commits; index += 1) {
    const author = authors[(index - 1) % authors.length];
    if (author === undefined) throw new Error("unreachable: authors is non-empty");
    const stamp = `${FIXTURE_EPOCH_SECONDS + index * 60} +0000`;

    // oxlint-disable-next-line no-await-in-loop -- commit N parents commit N-1; history is a dependency chain
    await appendFile(join(dir, "history.md"), `commit ${index}\n`, "utf8");
    // oxlint-disable-next-line no-await-in-loop -- staging must land between the append and the commit
    await runGit(dir, ["add", "-A"], env);
    // oxlint-disable-next-line no-await-in-loop -- commit N parents commit N-1; history is a dependency chain
    await runGit(
      dir,
      ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", `fixture commit ${index}`],
      {
        ...env,
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_AUTHOR_DATE: stamp,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
        GIT_COMMITTER_DATE: stamp,
      },
    );
  }
}

/** Minimal TypeScript repo: package.json + tsconfig + one source file. Keys are repo-relative. */
export function tsRepoFiles(): Record<string, string> {
  return {
    "package.json": `${JSON.stringify(
      {
        name: "fixture-app",
        version: "0.1.0",
        private: true,
        type: "module",
        devDependencies: { typescript: "^5.9.0" },
      },
      null,
      2,
    )}\n`,
    "tsconfig.json": `${JSON.stringify(
      { compilerOptions: { strict: true, module: "nodenext", moduleResolution: "nodenext" } },
      null,
      2,
    )}\n`,
    "src/index.ts": "export const fixture = true;\n",
  };
}

/** One representative file per tool, matching the repo-analyzer trace indicators:
 *  `.claude/`, `.cursor/`, `.github/copilot-instructions.md`, `.codex/`. */
const TOOL_TRACES: Record<"claude" | "cursor" | "copilot" | "codex", Record<string, string>> = {
  claude: { ".claude/settings.json": "{}\n" },
  cursor: {
    ".cursor/rules/fixture.mdc": "---\ndescription: fixture rule\n---\n\nFixture body.\n",
  },
  copilot: { ".github/copilot-instructions.md": "# Fixture instructions\n" },
  codex: { ".codex/config.toml": "# fixture trace\n" },
};

/** File map that plants the on-disk traces of the requested tools (duplicates collapse). */
export function toolTraceFiles(
  tools: readonly ("claude" | "cursor" | "copilot" | "codex")[],
): Record<string, string> {
  const files: Record<string, string> = {};
  for (const tool of tools) Object.assign(files, TOOL_TRACES[tool]);
  return files;
}

function gitEnv(dir: string): Record<string, string> {
  const env = carriedProcessEnv();
  env["HOME"] = dir;
  env["USERPROFILE"] = dir;
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  env["GIT_CONFIG_GLOBAL"] = NO_GIT_CONFIG;
  env["GIT_TERMINAL_PROMPT"] = "0";
  env["LC_ALL"] = "C";
  return env;
}

async function runGit(
  dir: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<void> {
  try {
    await execFileAsync("git", [...args], { cwd: dir, env, windowsHide: true });
  } catch (error) {
    const failure = error as { code?: unknown; stderr?: string; message?: string };
    if (failure.code === "ENOENT") {
      const unavailable = new Error(
        "git executable not found on PATH — install git, or skip git-backed fixtures " +
          '(error.name === "GitUnavailableError" is the skip signal)',
      );
      unavailable.name = "GitUnavailableError";
      throw unavailable;
    }
    throw new Error(
      `seedGitRepo(): git ${args.join(" ")} failed in ${dir}: ${
        failure.stderr?.trim() !== undefined && failure.stderr.trim() !== ""
          ? failure.stderr.trim()
          : (failure.message ?? String(error))
      }`,
      { cause: error },
    );
  }
}
