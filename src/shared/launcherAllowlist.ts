import { lstatSync } from "node:fs";
import { posix as posixPath, resolve } from "node:path";

/**
 * The fails-closed launcher gate: one rule, one module, every lane that lets a
 * declaration name a command the operator's machine will run.
 *
 * Two lanes read this. A hook definition (`../hooks/userHooks.ts`) becomes a
 * `PreToolUse`/`SessionStart` entry in the client's own settings file and runs
 * on every matching tool call. An MCP server definition (`../pack/manifest.ts`)
 * becomes a launcher the editor spawns at start-up. Both accept exec-form argv
 * from a file a pack may supply, so both are answering the same question — may
 * this argv run? — and answering it twice produced two different answers: the
 * MCP lane banned `env`, the hook lane did not.
 *
 * An ALLOW-list, not a deny-list, for the reason `../pack/manifest.ts` already
 * states about launcher options: the launchers keep adding ways to reach a
 * shell, so a deny-list always trails the next release. Naming `sh`, `bash` and
 * `pwsh` catches the shells and misses `node -e`, `python3 -c` and
 * `env FOO=1 node -e 1` — all three of which re-enter arbitrary code with no
 * shell metacharacter anywhere in the argv, and all three of which the deny-list
 * this module replaced let through into `.claude/settings.json`.
 *
 * Four conditions, all required, checked in the order a refusal reads best:
 *
 * 1. `argv[0]`'s basename is a launcher on {@link ALLOWED_LAUNCHERS}. Anything
 *    else — a shell, a package runner, an unknown binary, a launcher added to a
 *    host since this list was written — refuses.
 * 2. No argument is an inline-code flag ({@link CODE_EVAL_FLAGS}). `-e`, `-c`,
 *    `--eval`, `-p`, `-r`, `-m`, a bare `-` and their `=` forms all mean "the
 *    program is named in this argument", which is the load-time-execution shape
 *    this gate exists for.
 * 3. No argument is a short option carrying its value attached — `-r/tmp/evil`,
 *    `-e1`, `-Ic`. Condition 2 reads a flag TOKEN and a token only ends at an
 *    `=`, so `ruby -r/tmp/evil` is one unrecognised word to it while ruby still
 *    preloads and runs the file. Written apart, `-r /tmp/evil` is exactly what
 *    condition 2 already refuses, so the refusal asks for that form rather than
 *    guessing where each launcher's short options stop.
 * 4. The PROGRAM POSITION — the first argument after the launcher that is not a
 *    flag, stepping over one {@link RUN_FILE_SUBCOMMANDS} word where the
 *    launcher documents one — is a SCRIPT: a repo-relative path with a script
 *    extension, the only such argument in the argv, existing inside the repo as
 *    a regular file. A committed script is a file a reviewer can read and a diff
 *    can show.
 *
 * Condition 4 rules on the argument the launcher will EXECUTE, not on a
 * script-shaped word being present SOMEWHERE in the argv. Presence was the whole
 * of the earlier check, and presence accepted
 * `npx <attacker-package> .stamity/hooks/guard.mjs`: the committed script
 * satisfied the condition while the launcher fetched and ran the package named
 * ahead of it, with the script demoted to an argument. `npm exec`, `pnpm dlx`,
 * `yarn dlx` and `bun x` are the same sentence with a different first word.
 * Reading the position makes the check answer the question that matters — what
 * runs — and it is why the package runners left {@link ALLOWED_LAUNCHERS}
 * entirely.
 *
 * Nothing here throws: an unreadable path is a refusal, not an exception, so a
 * caller reading a directory of third-party declarations reports the bad row and
 * keeps the healthy ones.
 */

/**
 * Launchers a declaration may name.
 *
 * Deliberately short. Each row is an interpreter whose first non-flag argument
 * is the FILE it runs, which is what condition 4 then requires that argument to
 * be. `env` and `wsl` are absent on purpose: both exist to hand an argv to
 * ANOTHER interpreter with an environment the declaration controls, so allowing
 * either would make conditions 1-3 inspect the wrong program.
 *
 * `npm`, `npx`, `pnpm` and `yarn` were rows here and are not any more. Their
 * first non-flag argument is a PACKAGE SPECIFIER resolved against a registry,
 * never a path in this repo: `npx <pkg> <script>` and `pnpm dlx <pkg> <script>`
 * fetch and run `<pkg>` and hand the committed script to it as an argument, and
 * even alone `npx <name>.mjs` resolves a registry package rather than the file
 * of that name committed beside it. No argv makes one of them run a repo file,
 * so the four rows bought no capability and kept a registry reachable. `bun`
 * stays: `bun x` is a package runner but `bun <file>` is not, and condition 4
 * separates them by reading which one the argv actually asks for.
 *
 * Adding a row is a review decision, not a convenience: a launcher that can be
 * pointed at a registry, a second package, or an inline program re-opens the
 * channel the whole module closes.
 */
export const ALLOWED_LAUNCHERS: ReadonlySet<string> = new Set([
  "node",
  "bun",
  "deno",
  "python3",
  "ruby",
]);

/**
 * The one subcommand word a launcher may put ahead of its script, keyed by
 * launcher. `deno run x.ts` and `bun run x.ts` are those two runtimes' spelling
 * of `node x.ts`, and `deno` has no other way to pass a permission flag, so
 * refusing the word would refuse the ordinary shape rather than an attack.
 *
 * An allow-list one level below {@link ALLOWED_LAUNCHERS}, read the same way and
 * for the same reason: `run` names a FILE, so condition 4 still lands on a path
 * this module can check. `exec`, `dlx` and `x` name a PACKAGE, which is why they
 * are absent — and why adding a row is a review decision, since a subcommand
 * that resolves against a registry re-opens exactly the channel the delisting
 * above closed.
 */
const RUN_FILE_SUBCOMMANDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["deno", new Set(["run"])],
  ["bun", new Set(["run"])],
]);

/**
 * Flags that mean "the program is named in this argument". Matched on the flag
 * TOKEN, so `--eval=…` is refused exactly as `--eval …` is; the attached short
 * form (`-e…`) is condition 3's job, because a token has no way to know where
 * `-e` stops and its value starts.
 *
 * `-p`/`--print` are here beside the evaluators because on `node` they take a
 * program too (`node -p "require('child_process').execSync(…)"`); `-r`/`--require`
 * loads a module before the entry point, which runs its top level, and
 * `--loader`/`--experimental-loader`/`--preload` do the same one step earlier;
 * `-m` names a MODULE as the program, which demotes any file also on the line to
 * an argument of it; and a bare `-` says the program arrives on stdin, which no
 * diff shows at all. None of them has a legitimate use in a committed hook,
 * whose whole contract is that the code it runs is a file in the repo.
 */
export const CODE_EVAL_FLAGS: ReadonlySet<string> = new Set([
  "-",
  "-e",
  "--eval",
  "-c",
  "--command",
  "-p",
  "--print",
  "-r",
  "--require",
  "-m",
  "--import",
  "--loader",
  "--experimental-loader",
  "--preload",
]);

/** Extensions that mark an argument as the code the launcher will execute. */
const SCRIPT_EXTENSIONS: readonly string[] = [
  ".mjs",
  ".cjs",
  ".js",
  ".ts",
  ".mts",
  ".cts",
  ".sh",
  ".bash",
  ".py",
  ".rb",
];

/**
 * Why an argv was refused, in check order. Codes are per DEFECT CLASS rather
 * than per condition: conditions 2 and 3 are two spellings of "the program is on
 * the command line" and share `INLINE_CODE_FLAG`, and condition 4's three ways
 * to fail — nothing in the program position, something that is not a script
 * there, two scripts to choose between — share `NO_SCRIPT_ARGUMENT`, because a
 * caller translating these into its own vocabulary (`../hooks/userHooks.ts`)
 * reports one class per fix and each class here has one fix.
 */
export type LauncherRefusalCode =
  | "LAUNCHER_NOT_ALLOWED"
  | "INLINE_CODE_FLAG"
  | "NO_SCRIPT_ARGUMENT"
  | "SCRIPT_OUTSIDE_REPO"
  | "SCRIPT_MISSING";

/** The gate's answer: accepted, or refused with the one reason it refused for. */
export type LauncherVerdict =
  | { readonly ok: true; readonly script: string }
  | { readonly ok: false; readonly code: LauncherRefusalCode; readonly reason: string };

function refuse(code: LauncherRefusalCode, reason: string): LauncherVerdict {
  return { ok: false, code, reason };
}

/**
 * Basename of a launcher, lower-cased, with a Windows `.exe` suffix dropped.
 *
 * Backslashes count as separators so a declaration authored on Windows is judged
 * the same way everywhere, and `./tools/node` resolves to `node` — the directory
 * prefix says where the binary is, not what it is. `.cmd` and `.bat` are NOT
 * stripped: those are shell-interpreted wrappers on Windows, so a `node.cmd`
 * stays outside the allow-list rather than being renamed into it.
 */
function launcherName(argument: string): string {
  const base = posixPath.basename(argument.replaceAll("\\", "/")).toLowerCase();
  return base.endsWith(".exe") ? base.slice(0, -4) : base;
}

/** The flag token an argument carries — `--eval=x` is the `--eval` flag. */
function flagToken(argument: string): string {
  if (!argument.startsWith("-")) return "";
  const separator = argument.indexOf("=");
  return separator === -1 ? argument : argument.slice(0, separator);
}

/**
 * A short option carrying its value with no separator: `-r/tmp/evil`, `-e1`,
 * `-Ic`.
 *
 * {@link flagToken} cannot split these — a short option's value simply abuts it,
 * with no `=` to cut on and no per-launcher grammar here that says which letters
 * take one — so `-r/tmp/evil` reaches the flag set as one unrecognised word and
 * passes. Refusing the whole shape is the check that does not need the grammar:
 * every short option worth writing can be written as two arguments, and in two
 * arguments {@link CODE_EVAL_FLAGS} sees the flag.
 *
 * `--long=value` is not this shape (it has the separator), and `-` and `-e` are
 * not either (nothing is attached).
 */
function isAttachedShortOption(argument: string): boolean {
  return argument.startsWith("-") && !argument.startsWith("--") && argument.length > 2;
}

/**
 * The argument the launcher will EXECUTE: the first one that is not a flag,
 * stepping over at most one {@link RUN_FILE_SUBCOMMANDS} word for the launchers
 * that document one. `undefined` when the argv names no program at all.
 *
 * Flags are stepped over rather than parsed, and that is the deliberate limit of
 * this function: it does not model each launcher's option grammar, so an option
 * whose value is a SEPARATE argument (`--max-old-space-size 4096`) leaves that
 * value standing in the program position and the argv refuses. The `=` form
 * keeps the value attached to its flag, which is the form the refusal asks for —
 * the alternative is a per-launcher table of which options consume the next
 * word, which is the deny-list-shaped thing this module exists to avoid.
 */
function programArgument(launcher: string, rest: readonly string[]): string | undefined {
  const subcommands = RUN_FILE_SUBCOMMANDS.get(launcher);
  let subcommandTaken = false;
  for (const argument of rest) {
    if (argument.startsWith("-")) continue;
    if (!subcommandTaken && subcommands !== undefined && subcommands.has(argument)) {
      subcommandTaken = true;
      continue;
    }
    return argument;
  }
  return undefined;
}

/**
 * The path an argument points at. A flag contributes its `=` value
 * (`--config=x` points at `x`) and nothing otherwise, so a bare switch is never
 * read as a path.
 */
function pathCandidate(argument: string): string {
  if (!argument.startsWith("-")) return argument;
  const separator = argument.indexOf("=");
  return separator === -1 ? "" : argument.slice(separator + 1);
}

function hasScriptExtension(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return SCRIPT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Absolute paths, any path normalising above its anchor, and anything carrying a
 * URI scheme leave the repo. Lexical, so the judgement is made before the
 * filesystem is touched and a path that does not exist is still refused for the
 * right reason.
 *
 * The scheme test generalises the Windows drive letter it replaced — `C:` is the
 * one-character case of it — so `deno run https://host/x.ts` and `npm:pkg/x.ts`
 * are refused for naming code outside this repo rather than left to fail the
 * existence probe as if someone had forgotten to commit a file.
 */
function escapesRepo(candidate: string): boolean {
  const unified = candidate.replaceAll("\\", "/");
  if (unified.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(unified)) return true;
  const normalized = posixPath.normalize(unified);
  return normalized === ".." || normalized.startsWith("../");
}

/**
 * Rule on one exec-form argv.
 *
 * `repoRoot` anchors the script argument: containment is judged against it and
 * existence is probed under it, so a caller that knows the root passes it rather
 * than letting the check guess from the declaration's own depth.
 *
 * Fails closed on every axis. An empty argv, an unknown launcher, an
 * inline-code flag, a short option with its value attached, no program
 * argument, a program that is not a script, two script arguments, a script that
 * escapes the repo, a script that is missing, a directory, or a symlink all
 * refuse — the last because a link's target sits wherever it likes and can be
 * repointed after the file was reviewed, which is exactly the property a
 * repo-committed script is supposed to have.
 */
export function checkLauncherArgv(argv: readonly string[], repoRoot: string): LauncherVerdict {
  const launcher = argv[0];
  if (launcher === undefined || launcher === "") {
    return refuse("LAUNCHER_NOT_ALLOWED", "the command is empty, so it names no launcher to check.");
  }

  const name = launcherName(launcher);
  if (!ALLOWED_LAUNCHERS.has(name)) {
    return refuse(
      "LAUNCHER_NOT_ALLOWED",
      `${JSON.stringify(name)} is not an allowed launcher. Allowed: ${[...ALLOWED_LAUNCHERS].join(", ")} — ` +
        `and each of them must be handed a committed script as the first argument that is not a flag. ` +
        `A package runner (npm, npx, pnpm, yarn) is not on that list: its first argument names a ` +
        `package it fetches, not a file this repo commits.`,
    );
  }

  const rest = argv.slice(1);
  const inline = rest.find((argument) => CODE_EVAL_FLAGS.has(flagToken(argument)));
  if (inline !== undefined) {
    return refuse(
      "INLINE_CODE_FLAG",
      `${JSON.stringify(inline)} passes the program on the command line, which runs code no reviewer ` +
        `can read in a diff. Commit the script and name its path instead.`,
    );
  }

  const attached = rest.find((argument) => isAttachedShortOption(argument));
  if (attached !== undefined) {
    return refuse(
      "INLINE_CODE_FLAG",
      `${JSON.stringify(attached)} is a short option carrying its value attached, so this gate cannot ` +
        `tell where the flag ends and what it points at begins — ${JSON.stringify("-r/tmp/evil")} ` +
        `preloads and runs a file exactly as ${JSON.stringify("-r")} ${JSON.stringify("/tmp/evil")} ` +
        `does. Write the option and its value as two arguments.`,
    );
  }

  const program = programArgument(name, rest);
  if (program === undefined) {
    return refuse(
      "NO_SCRIPT_ARGUMENT",
      `${name} is given no program to run. Name one committed, repo-relative script file ` +
        `(for example ${JSON.stringify(".stamity/hooks/guard.mjs")}).`,
    );
  }
  if (!hasScriptExtension(program)) {
    return refuse(
      "NO_SCRIPT_ARGUMENT",
      `${name} runs ${JSON.stringify(program)} — the first argument that is not a flag — and that is ` +
        `not a script file. A package name, a subcommand, or an option value standing where the ` +
        `program goes all mean the code that runs is not the one this repo commits. Name the script ` +
        `first (for example ${JSON.stringify(".stamity/hooks/guard.mjs")}) and write option values in ` +
        `--option=value form so nothing else lands in that position.`,
    );
  }

  const scripts = rest.map(pathCandidate).filter((candidate) => hasScriptExtension(candidate));
  if (scripts.length > 1) {
    return refuse(
      "NO_SCRIPT_ARGUMENT",
      `${name} is given ${scripts.length} script arguments (${scripts.map((s) => JSON.stringify(s)).join(", ")}); ` +
        `exactly one names the code that runs, and the rest are ambiguous about what executes.`,
    );
  }

  const script = program;
  if (escapesRepo(script)) {
    return refuse(
      "SCRIPT_OUTSIDE_REPO",
      `${JSON.stringify(script)} resolves outside the repository. The code a declaration runs lives in ` +
        `the repo and is committed with it.`,
    );
  }

  let stats;
  try {
    // `lstat`, not `stat`: a symlink is the defect, not something to follow.
    stats = lstatSync(resolve(repoRoot, script));
  } catch {
    return refuse(
      "SCRIPT_MISSING",
      `${JSON.stringify(script)} could not be read. Commit the script before wiring the command.`,
    );
  }
  if (stats.isSymbolicLink()) {
    return refuse(
      "SCRIPT_OUTSIDE_REPO",
      `${JSON.stringify(script)} is a symbolic link, whose target is not reviewable in this repo.`,
    );
  }
  if (!stats.isFile()) {
    return refuse("SCRIPT_MISSING", `${JSON.stringify(script)} is not a regular file.`);
  }

  return { ok: true, script };
}
