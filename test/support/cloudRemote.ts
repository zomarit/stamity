import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { carriedProcessEnv, NO_GIT_CONFIG } from "./repoFixtures.ts";

/**
 * The cloud machine's surroundings for the suite under `test/cloud/` (REQ-PROVE-039): a bare remote
 * with a cloud's push rules, two clones of it under one parent, a `gh` stub on `PATH`, and the hook
 * commands an initialized repository carries, run the way a client runs them.
 *
 * The remote stands in for a cloud's git proxy: its `pre-receive` hook refuses a tag, a deletion
 * and a push to the branch its `HEAD` names. The clones' `origin` names `https://github.com/o/r.git`,
 * as a cloud checkout's names GitHub; {@link pushMapping} sends one git call there, since
 * `git remote get-url` expands an `insteadOf` written to config and the run verbs would then read
 * origin as no GitHub repository.
 *
 * Like `cliHarness.ts`, this module imports nothing from `src/`.
 */

/** Origin's URL in every clone, and the repository the `gh` stub answers for. */
const ORIGIN_URL = "https://github.com/o/r.git";

/** The branch the remote starts with as its default. */
export const DEFAULT_BRANCH = "main";

/** The identity every commit made here carries. */
export const IDENTITY = {
  GIT_AUTHOR_NAME: "Cloud Leg",
  GIT_AUTHOR_EMAIL: "cloud-leg@fixture.invalid",
  GIT_COMMITTER_NAME: "Cloud Leg",
  GIT_COMMITTER_EMAIL: "cloud-leg@fixture.invalid",
} as const;

/**
 * Git's auto maintenance off in the remote and the clones (runCheckpoint.test.ts's seed, prove/12): a push into the
 * remote and a commit in a clone each start a detached `git maintenance run --auto`, which outlives the call and can
 * still write under the tree while the case removes it.
 */
const NO_AUTO_MAINTENANCE: readonly (readonly [string, string])[] = [
  ["receive.autogc", "false"],
  ["gc.auto", "0"],
  ["maintenance.auto", "false"],
];

/** Runs git with no system or global config and the fixture identity; its trimmed stdout. Throws on a non-zero exit. */
export function git(cwd: string, args: readonly string[], env: Record<string, string> = {}): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...carriedProcessEnv(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, ...IDENTITY, ...env },
    windowsHide: true,
  }).trim();
}

/** Like {@link git}, its exit code and both streams instead of a throw. */
export function gitTry(cwd: string, args: readonly string[], env: Record<string, string> = {}): { code: number; stdout: string; stderr: string } {
  try {
    return { code: 0, stdout: git(cwd, args, env), stderr: "" };
  } catch (error) {
    const failed = error as { status?: number | null; stdout?: string; stderr?: string };
    return { code: failed.status ?? -1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

/**
 * The cloud's push rules, as a POSIX `pre-receive` hook: a tag, a deletion (an all-zero new id, SHA-1 or SHA-256),
 * and the branch the remote's `HEAD` names are refused, each with a line naming the ref.
 */
const PRE_RECEIVE = `#!/bin/sh
default="$(git symbolic-ref -q HEAD || true)"
status=0
while read -r old new ref; do
  case "$ref" in
    refs/tags/*) echo "cloud remote: refused: $ref is a tag" >&2; status=1; continue ;;
  esac
  case "$new" in
    *[!0]*) ;;
    *) echo "cloud remote: refused: deleting $ref" >&2; status=1; continue ;;
  esac
  if [ "$ref" = "$default" ]; then
    echo "cloud remote: refused: $ref is the default branch" >&2
    status=1
  fi
done
exit $status
`;

export interface CloudRemote {
  /** The bare remote, `<parent>/remote.git`. */
  readonly bare: string;
  /** The two clones, `<parent>/a` and `<parent>/b`. */
  readonly clones: readonly [string, string];
}

/**
 * A bare remote at `<parent>/remote.git` holding `seed`'s `HEAD` as {@link DEFAULT_BRANCH}, its push rules installed
 * after that first push, and two clones of it under `parent`, each with origin naming {@link ORIGIN_URL}, the
 * fixture identity in its config and auto maintenance off.
 */
export function makeCloudRemote(parent: string, seed: string): CloudRemote {
  const bare = join(parent, "remote.git");
  mkdirSync(parent, { recursive: true });
  git(parent, ["init", "--quiet", "--bare", bare]);
  for (const [key, value] of NO_AUTO_MAINTENANCE) git(bare, ["config", key, value]);
  git(seed, ["push", "--quiet", bare, `HEAD:refs/heads/${DEFAULT_BRANCH}`]);
  git(bare, ["symbolic-ref", "HEAD", `refs/heads/${DEFAULT_BRANCH}`]);
  const hook = join(bare, "hooks", "pre-receive");
  mkdirSync(join(bare, "hooks"), { recursive: true });
  writeFileSync(hook, PRE_RECEIVE);
  chmodSync(hook, 0o755);
  const clones = [join(parent, "a"), join(parent, "b")] as const;
  for (const clone of clones) {
    git(parent, ["clone", "--quiet", bare, basename(clone)]);
    git(clone, ["remote", "set-url", "origin", ORIGIN_URL]);
    git(clone, ["config", "user.name", IDENTITY.GIT_AUTHOR_NAME]);
    git(clone, ["config", "user.email", IDENTITY.GIT_AUTHOR_EMAIL]);
    for (const [key, value] of NO_AUTO_MAINTENANCE) git(clone, ["config", key, value]);
  }
  return { bare, clones };
}

/** The environment that sends one git call's {@link ORIGIN_URL} to `bare`, read as the call starts. */
export function pushMapping(bare: string): Record<string, string> {
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${bare}.insteadOf`, GIT_CONFIG_VALUE_0: ORIGIN_URL };
}

/** One `gh api` call the stub answered. */
interface GhCall {
  readonly host: string;
  readonly method: string;
  readonly path: string;
  readonly body?: Record<string, unknown>;
}

export interface GhStub {
  /** The folder to put first on `PATH`. */
  readonly dir: string;
  /** The calls answered so far, in order. */
  calls(): GhCall[];
  /** The status the second `POST …/pulls` (the one with no `draft`) gets: 201 opens pull request #9. */
  answerSecondPost(status: 201 | 403): void;
}

/**
 * The stub's program: it accepts only the argument vector `ghApiArgs` builds (`api --hostname <h> --include
 * --method <M> [--input -] <path>`), logs each call, and prints an HTTP head line, headers and a JSON body as
 * `gh api --include` does, exiting 1 on a status of 400 and over as `gh` does. `GET repos/o/r` → 200 with
 * `default_branch`; `GET repos/o/r/pulls?…` → 200 `[]`; `POST repos/o/r/pulls` with `draft: true` → GitHub's
 * 422 for a repository that takes no drafts; the second `POST` → the answer the test set; anything else → 404.
 */
const GH_STUB = `"use strict";
const fs = require("node:fs");
const path = require("node:path");
const argv = process.argv.slice(2);
const shaped = argv[0] === "api" && argv[1] === "--hostname" && argv[3] === "--include" && argv[4] === "--method";
if (!shaped) {
  process.stderr.write("gh stub: unexpected arguments " + JSON.stringify(argv) + "\\n");
  process.exit(2);
}
const method = argv[5];
const input = argv[6] === "--input" && argv[7] === "-";
const target = argv[input ? 8 : 6];
const text = input ? fs.readFileSync(0, "utf8") : "";
const body = text === "" ? undefined : JSON.parse(text);
fs.appendFileSync(path.join(__dirname, "calls.jsonl"), JSON.stringify({ host: argv[2], method, path: target, body }) + "\\n");
const answers = JSON.parse(fs.readFileSync(path.join(__dirname, "answers.json"), "utf8"));
const REASONS = { 200: "OK", 201: "Created", 403: "Forbidden", 404: "Not Found", 422: "Unprocessable Entity" };
function reply(status, json) {
  process.stdout.write("HTTP/2.0 " + status + " " + REASONS[status] + "\\r\\nContent-Type: application/json; charset=utf-8\\r\\n\\r\\n" + JSON.stringify(json));
  process.exitCode = status >= 400 ? 1 : 0;
}
const route = target.split("?")[0];
if (method === "GET" && route === "repos/o/r") reply(200, { full_name: "o/r", default_branch: "main" });
else if (method === "GET" && route === "repos/o/r/pulls") reply(200, []);
else if (method === "POST" && route === "repos/o/r/pulls" && body !== undefined && body.draft === true) {
  reply(422, {
    message: "Validation Failed",
    errors: [{ resource: "PullRequest", code: "custom", message: "Draft pull requests are not supported in this repository." }],
  });
} else if (method === "POST" && route === "repos/o/r/pulls") {
  if (answers.second === 201) reply(201, { number: 9, html_url: "https://github.com/o/r/pull/9", draft: false });
  else reply(answers.second, { message: "Resource not accessible by integration" });
} else reply(404, { message: "Not Found" });
`;

/**
 * Writes the `gh` stub into `dir`: `gh-stub.cjs`, and `gh`, a POSIX launcher running it with this process's own
 * `node`, so the stub needs nothing on `PATH`. POSIX only: on Windows the runner starts `gh` only as a program file.
 */
export function writeGhStub(dir: string): GhStub {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "gh-stub.cjs"), GH_STUB);
  writeFileSync(join(dir, "calls.jsonl"), "");
  const answers = join(dir, "answers.json");
  writeFileSync(answers, JSON.stringify({ second: 201 }));
  const launcher = join(dir, "gh");
  writeFileSync(launcher, `#!/bin/sh\nexec '${process.execPath.replace(/'/g, `'\\''`)}' '${join(dir, "gh-stub.cjs").replace(/'/g, `'\\''`)}' "$@"\n`);
  chmodSync(launcher, 0o755);
  return {
    dir,
    calls: () =>
      readFileSync(join(dir, "calls.jsonl"), "utf8")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as GhCall),
    answerSecondPost: (status) => writeFileSync(answers, JSON.stringify({ second: status })),
  };
}

type Client = "claude" | "cursor" | "copilot" | "codex";

/** One hook command a client's file carries, in the variant this platform runs, with its declared timeout. */
export interface HookCommand {
  readonly client: Client;
  readonly event: string;
  /** The hook script the command ends up running, by file name without `.mjs`. */
  readonly script: string;
  readonly command: string;
  /** The timeout the row declares, in seconds; `undefined` where it declares none. */
  readonly timeoutSeconds: number | undefined;
}

type Entry = Record<string, unknown>;

/**
 * The script a command runs: a walk-up starter carries its hook spec as a base64url JSON argument
 * (`{"command":["node","<script>"]}`), or names the script itself; a direct command names it
 * (test/cloud/containerLeg.test.ts's reading).
 */
function scriptOf(command: string): string {
  const spec = /\s([A-Za-z0-9_-]{24,})\s*$/.exec(command)?.[1];
  if (spec !== undefined) {
    const decoded = JSON.parse(Buffer.from(spec, "base64url").toString("utf8")) as { command?: unknown };
    const target = Array.isArray(decoded.command) ? decoded.command[1] : undefined;
    if (typeof target === "string") return basename(target, ".mjs");
  }
  const named = /(stamity-[a-z-]+)\.mjs/.exec(command)?.[1];
  if (named === undefined) throw new Error(`no hook script found in ${command}`);
  return named;
}

function readJson(path: string): Entry {
  return JSON.parse(readFileSync(path, "utf8")) as Entry;
}

function seconds(value: unknown): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

/**
 * Every hook command the four clients' files under `root` carry, in the variant this platform runs, as
 * test/cloud/containerLeg.test.ts reads them: Claude Code's POSIX commands only off Windows, Copilot's `bash` or
 * `command`, Codex's `command` or `commandWindows`.
 */
export function emittedHooks(root: string): HookCommand[] {
  const windows = process.platform === "win32";
  const rows: HookCommand[] = [];
  const add = (client: Client, event: string, command: unknown, timeout: unknown): void => {
    if (typeof command !== "string" || command === "") throw new Error(`${client} ${event}: no command`);
    rows.push({ client, event, script: scriptOf(command), command, timeoutSeconds: seconds(timeout) });
  };
  const grouped = (doc: Entry): [string, Entry[]][] =>
    Object.entries(doc["hooks"] as Record<string, Entry[]>).map(([event, groups]) => [event, groups.flatMap((group) => group["hooks"] as Entry[])]);
  const flat = (doc: Entry): [string, Entry[]][] => Object.entries(doc["hooks"] as Record<string, Entry[]>);
  if (!windows) {
    for (const [event, hooks] of grouped(readJson(join(root, ".claude", "settings.json")))) {
      for (const hook of hooks) add("claude", event, hook["command"], hook["timeout"]);
    }
  }
  for (const [event, hooks] of flat(readJson(join(root, ".cursor", "hooks.json")))) {
    for (const hook of hooks) add("cursor", event, hook["command"], hook["timeout"]);
  }
  for (const [event, hooks] of flat(readJson(join(root, ".github", "hooks", "stamity.json")))) {
    for (const hook of hooks) add("copilot", event, windows ? hook["command"] : hook["bash"], hook["timeoutSec"]);
  }
  for (const [event, hooks] of grouped(readJson(join(root, ".codex", "hooks.json")))) {
    for (const hook of hooks) add("codex", event, windows ? hook["commandWindows"] : hook["command"], hook["timeout"]);
  }
  return rows;
}

/** The session-start rows among {@link emittedHooks}, one per client. */
export function sessionStarts(root: string): HookCommand[] {
  return emittedHooks(root).filter((row) => row.script === "stamity-session-start");
}

export interface HookRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Wall time from the spawn to the close, in milliseconds. */
  readonly ms: number;
}

/**
 * Runs one hook command as a client does: through the platform shell, the payload on stdin, killed at `killAfterMs`.
 * A command that closes stdin early is not a fault here, so that EPIPE is swallowed.
 */
export function runHook(command: string, cwd: string, env: Record<string, string>, payload: unknown, killAfterMs = 60_000): Promise<HookRun> {
  return new Promise((resolvePromise, rejectPromise) => {
    const started = Date.now();
    const child = spawn(command, [], { cwd, env, shell: true, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), killAfterMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      resolvePromise({ code: code ?? -1, stdout, stderr: signal === null ? stderr : `${stderr}[signal ${signal}]`, ms });
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE" && error.code !== "EOF") rejectPromise(error);
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

/** A hook environment: `PATH` (and Windows' runtime keys) carried, then `vars`, an `undefined` value removing its key. */
export function hookEnv(vars: Record<string, string | undefined>): Record<string, string> {
  const env = carriedProcessEnv();
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}
