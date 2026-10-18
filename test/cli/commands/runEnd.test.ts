import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import { buildUnattendedAskGate, UNATTENDED_ASK_GATE_FILE } from "../../../src/hooks/scripts.ts";
import { RUN_ENDED_MARKER_FILE } from "../../../src/mcp/env.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * u19-run-end (REQ-FLOW-092, REQ-FLOW-094, REQ-FLOW-095, REQ-FLOW-103):
 * `stamity run end`, through the in-process funnel. It runs `checkpoint`'s
 * steps and then the draft pull request every time; on the morning walk's
 * attended record (`Resumes: <run-id>`) the body is the resumed run's list. Git runs for real, in
 * scratch repositories pushing to a real bare remote (each push alone maps origin's
 * GitHub URL to it, see the spy below), while origin names a GitHub repository so the REST reads and the
 * pull request step have one to match.
 */

/** Every REST call the verb made, and the answer each `METHOD path` gets. */
const rest = vi.hoisted(() => ({
  calls: [] as { method: string; path: string; body?: unknown }[],
  routes: new Map<string, { status: number; json: unknown }>(),
  /** Answers given once each, in order, before `routes` answers the same `METHOD path`. */
  queued: new Map<string, { status: number; json: unknown }[]>(),
}));

// Mocked: the real `ghApi` starts `gh`, which calls GitHub over the network
// under the machine's login; a unit test can reach neither. What the verb asks
// for (path, method, body) is recorded and answered from `rest.routes`.
vi.mock("../../../src/cli/engine/ghRunner.ts", () => ({
  ghApi: (request: { method: string; path: string; body?: unknown }) => {
    const path = request.path.replace(/^\//, "").replace(/\?.*$/, "");
    rest.calls.push({ method: request.method, path, body: request.body });
    const key = `${request.method} ${path}`;
    return Promise.resolve(rest.queued.get(key)?.shift() ?? rest.routes.get(key) ?? { status: 404, json: { message: "Not Found" } });
  },
}));

/** Every argument vector the verb gave the write runner. */
const writes = vi.hoisted(() => ({ argv: [] as string[][] }));

// A spy, not a stand-in: each call is recorded and passed to the real runner,
// so git still does every write; the record is how the test reads the push
// argv, which git's own state cannot show.
vi.mock("../../../src/cli/engine/gitWrite.ts", async (importOriginal) => {
  const real = await importOriginal<typeof GitWriteModule>();
  return {
    ...real,
    gitWrite: (cwd: string, args: readonly string[], opts?: Parameters<typeof real.gitWrite>[2]) => {
      writes.argv.push([...args]);
      // TEST CHANGE, justified: review/209 refuses a push URL naming no GitHub repository, so origin's push URL is
      // its GitHub URL; for the push call alone an `insteadOf` in the environment (read once, as the call starts)
      // sends it to the case's bare remote, `remote.git` beside the repository the push runs at the top of, so
      // every read the verb makes sees the GitHub URL git would push to.
      const remote = join(dirname(cwd), "remote.git");
      // TEST CHANGE, justified: pr/20 reads the remote branch with `git ls-remote origin`, so that read goes there too.
      if ((args[0] !== "push" && args[0] !== "ls-remote") || !existsSync(remote)) return real.gitWrite(cwd, args, opts);
      const mapping = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${remote}.insteadOf`, GIT_CONFIG_VALUE_0: "https://github.com/o/r.git" };
      const previous = Object.fromEntries(Object.keys(mapping).map((key) => [key, process.env[key]]));
      Object.assign(process.env, mapping);
      try {
        return real.gitWrite(cwd, args, opts);
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  };
});

const IDENTITY = {
  GIT_AUTHOR_NAME: "Alice Example",
  GIT_AUTHOR_EMAIL: "alice@example.com",
  GIT_COMMITTER_NAME: "Alice Example",
  GIT_COMMITTER_EMAIL: "alice@example.com",
} as const;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, ...IDENTITY },
  }).trim();
}

const RUN = "2026-10-16_overnight";
const RUN_BRANCH = `stamity/${RUN}`;
const RUN_DIR = `.stamity/runs/${RUN}`;
const MARKER = `<!-- stamity:run ${RUN} -->`;
const ORIGIN_PIN = `${RUN_DIR}/origin.json`;
/** The pin `run start` writes for origin's repository, `https://github.com/o/r.git`. */
const PIN_TEXT = `${JSON.stringify({ host: "github.com", owner: "o", repo: "r" })}\n`;

/** The morning walk's own run (review/164): an attended record reading `Resumes: <RUN>`, on the same branch. */
const WALK = "2026-10-16_morning-walk";
const WALK_DIR = `.stamity/runs/${WALK}`;

/** A token-shaped value built from fragments, so this file carries none. */
const TOKEN = ["gh", "p", "_", "Q7RTW2KZ9MXC4HBN8JVL5DPF3GYSA6EUT2RW"].join("");

/** A morning list in the shape `prBodyFrom` reads, its decisions line given. */
function morningList(decision: string): string {
  const question = JSON.stringify({ id: "Q1", kind: "decision", question: "Merge the delta?", options: ["yes", "no"], default: 2, source: "record" });
  return [`# Morning list — ${RUN}`, "", "## For you to check", "", "none", "", "## Decisions", "", `- ${decision}`, "", "## Prerequisites", "", "none", "",
    "## Person's calls held", "", "none", "", "## Not done:", "", "none", "", "## How to answer", "", "Answer `Q1→1`.", "",
    "```stamity-morning", question, "```", ""].join("\n");
}

describe("stamity run end", () => {
  const getRoot = useTempDir("run-end");

  beforeEach(() => {
    rest.calls.length = 0;
    rest.routes.clear();
    rest.queued.clear();
    writes.argv.length = 0;
    rest.routes.set("GET repos/o/r", { status: 200, json: { default_branch: "main" } });
    rest.routes.set("GET repos/o/r/pulls", { status: 200, json: [] });
    rest.routes.set("POST repos/o/r/pulls", { status: 201, json: { number: 7, html_url: "https://github.com/o/r/pull/7" } });
  });

  interface Seeded {
    repo: string;
    remote: string;
    base: string;
  }

  /**
   * A repository on `main` (a.txt, b.txt), its own identity in its config,
   * `origin` naming GitHub and pushing to a bare remote, then on the run's
   * branch with a record reading `mode` (no `Mode:` line for `null`).
   */
  async function seed(mode: "attended" | "unattended" | null, opts: { branch?: string; pin?: "base" | "untracked" | "none" } = {}): Promise<Seeded> {
    const dir = getRoot().path(`case-${Math.random().toString(36).slice(2, 8)}`);
    const repo = join(dir, "repo");
    const remote = join(dir, "remote.git");
    await mkdir(repo, { recursive: true });
    git(dir, ["init", "-q", "--bare", remote]);
    git(repo, ["-c", "init.defaultBranch=main", "init", "-q"]);
    git(repo, ["config", "user.name", "Alice Example"]);
    git(repo, ["config", "user.email", "alice@example.com"]);
    await Promise.all(["a.txt", "b.txt"].map((name) => writeFile(join(repo, name), `${name}\n`)));
    // TEST CHANGE, justified: review/209 refuses an unattended checkpoint with no origin pin, which `run start` writes;
    // the seed carries the pin `start` would write for origin's repository, in the base commit so no case's staged
    // or pushed set changes. A case about the pin itself rewrites or removes it.
    // `untracked` leaves it out of the base, as a run whose folder git ignores has it; `none` writes no pin.
    if ((opts.pin ?? "base") === "base") await put(repo, ORIGIN_PIN, PIN_TEXT);
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "seed"]);
    git(repo, ["remote", "add", "origin", "https://github.com/o/r.git"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    const branch = opts.branch ?? RUN_BRANCH;
    git(repo, ["switch", "-q", "-c", branch]);
    if (opts.pin === "untracked") await put(repo, ORIGIN_PIN, PIN_TEXT);
    const modeLine = mode === null ? "" : `Mode: ${mode}\n`;
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\n${modeLine}Branch: ${RUN_BRANCH}\nBase: ${base}\n`);
    return { repo, remote, base };
  }

  async function put(repo: string, path: string, text: string): Promise<void> {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await writeFile(join(repo, path), text);
  }

  /** Runs the verb with `HOME` at an empty folder and no host identity, so only the repository's config decides. */
  async function run(cwd: string, argv: readonly string[], env?: Record<string, string>) {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    const overrides: Record<string, string | undefined> = { HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: "1", EMAIL: undefined };
    for (const key of Object.keys(IDENTITY)) overrides[key] = undefined;
    const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      const result = await runInProcess([runCommand], ["run", ...argv], { cwd, ...(env === undefined ? {} : { env }) });
      const envelope = argv.includes("--json") && result.stdout !== "" ? (JSON.parse(result.stdout) as Record<string, unknown>) : {};
      // The funnel's three envelope keys, set aside so `doc` is the verb's own document.
      const { ok, command, version, ...doc } = envelope;
      return { ...result, ok, command, version, doc };
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  const END = (title: string): string[] => ["end", "--run", RUN, "--title", title, "--json"];
  const pushes = (): string[][] => writes.argv.filter((argv) => argv[0] === "push");
  const writesToGitHub = () => rest.calls.filter((call) => call.method !== "GET");
  /** The one pull request the verb created. */
  const created = (): { title: string; body: string; draft?: boolean } => {
    const calls = rest.calls.filter((entry) => entry.method === "POST" && entry.path === "repos/o/r/pulls");
    if (calls.length === 0) throw new Error("no pull request was created");
    return calls[calls.length - 1]?.body as { title: string; body: string; draft?: boolean };
  };

  it("opens the pull request with no --pr, after the push, its JSON checkpoint's with subcommand end and inferred present", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...END("feat: the change"), "--paths", "a.txt"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({
      subcommand: "end",
      run: RUN,
      branch: RUN_BRANCH,
      pushed: true,
      held: [],
      pr: { number: 7, url: "https://github.com/o/r/pull/7", how: "created" },
      notDone: [],
      inferred: [],
    });
    expect(git(remote, ["show", `refs/heads/${RUN_BRANCH}:a.txt`])).toBe("changed");
    expect(created()).toEqual({
      title: "feat: the change",
      head: RUN_BRANCH,
      base: "main",
      body: `Run \`${RUN}\`, attended. Its record: \`${RUN_DIR}/record.md\`.\n\n${MARKER}`,
      draft: true,
    });
    // The push ran before the pull request was asked for.
    expect(pushes()).toEqual([["push", "--quiet", "origin", `HEAD:refs/heads/${RUN_BRANCH}`]]);
  });

  it("replaces the body of an open pull request that ends with this run's marker, opening no second one", async () => {
    const { repo } = await seed("unattended");
    await put(repo, `${RUN_DIR}/morning.md`, morningList("the delta"));
    rest.routes.set("GET repos/o/r/pulls", {
      status: 200,
      // The lookup now matches the base as well as the head (pr/52), so the open pull request names its base.
      json: [{ number: 12, html_url: "https://github.com/o/r/pull/12", body: `an earlier list\n\n${MARKER}`, head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` }, base: { ref: "main" } }],
    });
    rest.routes.set("PATCH repos/o/r/pulls/12", { status: 200, json: {} });

    const { code, doc } = await run(repo, END("Overnight"));

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pr: { number: 12, how: "existing" }, notDone: [] });
    expect(writesToGitHub().map((call) => `${call.method} ${call.path}`)).toEqual(["PATCH repos/o/r/pulls/12"]);
    const patched = writesToGitHub()[0]?.body as { body: string };
    expect(patched.body.startsWith(`# Morning list — ${RUN}`)).toBe(true);
    expect(patched.body.trimEnd().endsWith(MARKER)).toBe(true);
  });

  it("comments once on an open pull request without the marker, leaving its body untouched", async () => {
    const { repo } = await seed("unattended");
    await put(repo, `${RUN_DIR}/morning.md`, morningList("the delta"));
    rest.routes.set("GET repos/o/r/pulls", {
      status: 200,
      // The lookup now matches the base as well as the head (pr/52), so the open pull request names its base.
      json: [{ number: 15, html_url: "https://github.com/o/r/pull/15", body: "A person's description.", head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` }, base: { ref: "main" } }],
    });
    rest.routes.set("POST repos/o/r/issues/15/comments", { status: 201, json: {} });

    const { code, doc } = await run(repo, END("Overnight"));

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pr: { number: 15, how: "commented" }, notDone: [] });
    expect(writesToGitHub().map((call) => `${call.method} ${call.path}`)).toEqual(["POST repos/o/r/issues/15/comments"]);
  });

  it("posts the fixed body when the morning list holds a token, and no output or request holds the value", async () => {
    // TEST CHANGE, justified: the run folder is ignored, so the origin pin `start` wrote is untracked there (review/209).
    const { repo } = await seed("unattended", { pin: "untracked" });
    // The run folder is ignored, so the list never reaches the pushed tree and the push scan; the outbound screen still reads it.
    await writeFile(join(repo, ".gitignore"), ".stamity/runs/\n");
    await put(repo, `${RUN_DIR}/morning.md`, morningList(`the key is ${TOKEN}`));

    const { code, doc, stdout, stderr } = await run(repo, [...END("Overnight"), "--paths", ".gitignore"]);

    expect(code).toBe(0);
    expect(doc["pr"]).toMatchObject({ how: "created" });
    expect(doc["notDone"]).toEqual([
      `records: not committed (${RUN_DIR}/record.md: .gitignore:1 .stamity/runs/)`,
      `records: not committed (${RUN_DIR}/morning.md: .gitignore:1 .stamity/runs/)`,
      `records: not committed (${ORIGIN_PIN}: .gitignore:1 .stamity/runs/)`,
      "pull request body replaced: the outbound screen matched line 9 (github-token)",
    ]);
    expect(created().body).toBe(
      `Run \`${RUN}\`: the body made from \`${RUN_DIR}/morning.md\` was not posted, because the outbound screen matched its line 9 (github-token). Read the morning list on the branch.\n\n${MARKER}`,
    );
    const fragment = TOKEN.slice(4, 16);
    expect(stdout).not.toContain(fragment);
    expect(stderr).not.toContain(fragment);
    expect(JSON.stringify(rest.calls)).not.toContain(fragment);
  });

  it("titles a refused run's pull request Refused: <title>", async () => {
    const { repo } = await seed("unattended");
    await put(repo, `${RUN_DIR}/morning.md`, morningList("refused at the ready check"));

    const { code } = await run(repo, [...END("plan 021 not ready"), "--refused"]);

    expect(code).toBe(0);
    expect(created().title).toBe("Refused: plan 021 not ready");
  });

  it("gives a refused title the outbound screen matches as Run <run-id>", async () => {
    const { repo } = await seed("attended");

    const { code } = await run(repo, [...END(`fix ${TOKEN}`), "--refused"]);

    expect(code).toBe(0);
    expect(created().title).toBe(`Run ${RUN}`);
  });

  it("falls back to a normal pull request titled [DRAFT] on a repository that takes no drafts", async () => {
    const { repo } = await seed("attended");
    // The first POST is GitHub's draft refusal; the second, the fallback, is answered by the route.
    rest.queued.set("POST repos/o/r/pulls", [
      { status: 422, json: { message: "Validation Failed", errors: [{ message: "Draft pull requests are not supported in this repository." }] } },
    ]);
    rest.routes.set("POST repos/o/r/pulls", { status: 201, json: { number: 8, html_url: "https://github.com/o/r/pull/8" } });

    const { code, doc } = await run(repo, END("feat: x"));

    expect(code).toBe(0);
    expect(doc["pr"]).toEqual({ number: 8, url: "https://github.com/o/r/pull/8", how: "created-fallback" });
    expect(created()).toMatchObject({ title: "[DRAFT] feat: x" });
    expect(created().draft).toBeUndefined();
  });

  it("names a missing morning list and opens an unattended run's pull request with the fixed body", async () => {
    const { repo } = await seed("unattended");

    const { code, doc } = await run(repo, END("feat: x"));

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pr: { how: "created" }, notDone: ["morning list missing"], inferred: [] });
    expect(created().body).toBe(`Run \`${RUN}\`: no morning list was posted. Its record: \`${RUN_DIR}/record.md\`.\n\n${MARKER}`);
  });

  it("reads a record with no Mode: line as unattended while STAMITY_UNATTENDED is set, posting the unattended body (review/162)", async () => {
    const { repo } = await seed(null);

    const { code, doc } = await run(repo, END("feat: x"), { STAMITY_UNATTENDED: "1" });

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pr: { how: "created" }, notDone: ["morning list missing"] });
    expect(created().body).toBe(`Run \`${RUN}\`: no morning list was posted. Its record: \`${RUN_DIR}/record.md\`.\n\n${MARKER}`);
  });

  it("opens no pull request when the secret scan holds the push, the reason in notDone", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, "a.txt"), `the key is ${TOKEN}\n`);

    const { code, doc } = await run(repo, [...END("feat: x"), "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ subcommand: "end", pushed: false, pr: null, inferred: [], notDone: ["push held: secret scan hit at a.txt:1 (github-token)"] });
    expect(writesToGitHub()).toEqual([]);
    expect(git(remote, ["for-each-ref", "refs/heads/"])).toBe("");
  });

  // pr/17: the ask gate allows the final question round only where this marker names the closed run.
  // TEST CHANGE, justified (pr/36, pr/37, signed off 12:41Z): only the run's last end, --final-round, writes the
  // marker, and it carries the time it was written, which the gate's window is read from.
  it("writes the run-ended marker under --final-round, naming the run and when it ended, refused or not, never pushed; none under --dry-run", async () => {
    const done = await seed("attended");
    const refused = await seed("unattended", { branch: "feature/other" });
    const dry = await seed("attended");
    await Promise.all([done, refused, dry].map(({ repo }) => writeFile(join(repo, "a.txt"), "changed\n")));

    const before = Date.now();
    const ok = await run(done.repo, [...END("feat: x"), "--paths", "a.txt", "--final-round"]);
    const no = await run(refused.repo, [...END("feat: x"), "--paths", "a.txt", "--final-round"]);
    const planned = await run(dry.repo, [...END("feat: x"), "--paths", "a.txt", "--final-round", "--dry-run"]);
    const after = Date.now();

    /** The marker's fields, its at checked to fall while the verb ran. */
    const marker = async (repo: string): Promise<unknown> => {
      const text = await readFile(join(repo, RUN_ENDED_MARKER_FILE), "utf8");
      const parsed = JSON.parse(text) as { run: unknown; at: string };
      expect(text).toBe(`${JSON.stringify({ run: RUN, at: parsed.at })}\n`);
      const at = Date.parse(parsed.at);
      expect(at >= before && at <= after, parsed.at).toBe(true);
      return parsed.run;
    };
    expect(ok.code).toBe(0);
    expect(await marker(done.repo)).toBe(RUN);
    expect(git(done.remote, ["ls-tree", "-r", "--name-only", `refs/heads/${RUN_BRANCH}`])).not.toContain(RUN_ENDED_MARKER_FILE);
    expect(no.code).toBe(1);
    expect(await marker(refused.repo)).toBe(RUN);
    expect(planned.code).toBe(0);
    expect(existsSync(join(dry.repo, RUN_ENDED_MARKER_FILE))).toBe(false);
  });

  // pr/25, pr/37: between two chain files the session is still unattended with nobody to answer, so a plain end, the
  // chain's middle file or a final round that left the flag out, writes no marker and removes one left behind; only
  // --final-round opens the gate's final-round exception, and only within its window (pr/36).
  // TEST CHANGE, justified (pr/37, signed off 12:41Z): the flag inverts, so --chain-next is gone and the plain end
  // is the one that closes the gate.
  it("leaves no run-ended marker on a plain end, so the ask gate refuses a question between two chain files", async () => {
    const closed = (base: string): string =>
      `# Run ${RUN}\n\nStatus: closed 2026-10-16\nMode: unattended\nBranch: ${RUN_BRANCH}\nBase: ${base}\n`;
    const left = `${JSON.stringify({ run: RUN, at: new Date().toISOString() })}\n`;
    const chained = await seed("unattended");
    const bare = await seed("unattended");
    const last = await seed("unattended");
    const dry = await seed("unattended");
    await Promise.all([chained, bare, last, dry].map(({ repo, base }) => put(repo, `${RUN_DIR}/record.md`, closed(base))));
    await Promise.all([chained, dry].map(({ repo }) => put(repo, RUN_ENDED_MARKER_FILE, left)));

    const next = await run(chained.repo, END("feat: x"));
    const none = await run(bare.repo, END("feat: x"));
    const final = await run(last.repo, [...END("feat: x"), "--final-round"]);
    const planned = await run(dry.repo, [...END("feat: x"), "--dry-run"]);
    const misplaced = await run(chained.repo, ["checkpoint", "--run", RUN, "--final-round", "--json"]);
    const dropped = await run(chained.repo, [...END("feat: x"), "--chain-next"]);

    /** The ask gate as Claude Code runs it in that checkout, the variable set: its exit code. */
    const ask = async (repo: string): Promise<number | null> => {
      const gate = join(repo, ".stamity", "generated", "hooks", "claude", UNATTENDED_ASK_GATE_FILE);
      await put(repo, relative(repo, gate), buildUnattendedAskGate({ layout: "generated" }));
      const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: { questions: [] } });
      const env: NodeJS.ProcessEnv = { ...process.env, STAMITY_UNATTENDED: "1" };
      delete env["STAMITY_REPO_ROOT"];
      return spawnSync(process.execPath, [gate], { input, encoding: "utf8", env, cwd: repo }).status;
    };

    // A chain's middle file: the marker an earlier final round left is removed, and the gate refuses.
    expect(next.code).toBe(0);
    expect(existsSync(join(chained.repo, RUN_ENDED_MARKER_FILE))).toBe(false);
    expect(await ask(chained.repo)).toBe(2);
    // No marker there to begin with: a plain end writes none, and the gate refuses.
    expect(none.code).toBe(0);
    expect(existsSync(join(bare.repo, RUN_ENDED_MARKER_FILE))).toBe(false);
    expect(await ask(bare.repo)).toBe(2);
    // One fact away: the chain's last file ends with --final-round, so its final round may ask.
    expect(final.code).toBe(0);
    expect(existsSync(join(last.repo, RUN_ENDED_MARKER_FILE))).toBe(true);
    expect(await ask(last.repo)).toBe(0);
    // The same marker gone stale, as a later session on a persistent checkout finds it: the gate refuses (pr/36).
    // TEST CHANGE, justified (pr/41, signed off 17:49Z): the window is 15 minutes now, so stale is 16 minutes, not 10.
    await put(last.repo, RUN_ENDED_MARKER_FILE, `${JSON.stringify({ run: RUN, at: new Date(Date.now() - 16 * 60_000).toISOString() })}\n`);
    expect(await ask(last.repo)).toBe(2);
    expect(planned.code).toBe(0);
    expect(await readFile(join(dry.repo, RUN_ENDED_MARKER_FILE), "utf8")).toBe(left);
    expect(misplaced.code).toBe(2);
    expect(dropped.code).toBe(2);
  });

  it("refuses as branch mismatch off the record's Branch:, pushing nothing and opening no pull request", async () => {
    const { repo, base } = await seed("unattended", { branch: "feature/other" });
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...END("feat: x"), "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ subcommand: "end", pushed: false, pr: null, inferred: [] });
    expect(doc["notDone"]).toEqual([`branch mismatch: the checkout is on feature/other, and the record's Branch: names ${RUN_BRANCH}`]);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(pushes()).toEqual([]);
    expect(writesToGitHub()).toEqual([]);
  });

  // pr/47: a record whose Branch: is missing, or not bare at column 0, names no branch to match, so end refuses it.
  it.each([
    ["no Branch: line", ""],
    ["a bulleted Branch: line", `- Branch: ${RUN_BRANCH}\n`],
  ])("refuses a record with %s, pushing nothing and opening no pull request", async (_, branchLine) => {
    const { repo, remote, base } = await seed("unattended", { branch: "feature/other" });
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: unattended\n${branchLine}Base: ${base}\n`);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...END("feat: x"), "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ subcommand: "end", branch: "feature/other", committed: null, pushed: false, pr: null, inferred: [] });
    expect(doc["notDone"]).toEqual([`commit refused: ${RUN_DIR}/record.md names no Branch:`]);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(pushes()).toEqual([]);
    expect(git(remote, ["for-each-ref", "refs/heads/"])).toBe("");
    expect(writesToGitHub()).toEqual([]);
  });

  // review/166: one input activates the inferred rows, so `end`'s JSON is shown to carry draftPr's, not the default.
  it("carries the prerequisites the pushed change implies in end's inferred, and in the body", async () => {
    const { repo } = await seed("unattended");
    await put(repo, "src/client.ts", "export const url = process.env.SERVICE_URL;\n");
    await put(repo, `${RUN_DIR}/morning.md`, morningList("the delta"));

    const { code, doc } = await run(repo, [...END("feat: client"), "--paths", "src/client.ts"]);

    expect(code).toBe(0);
    expect(doc["inferred"]).toMatchObject([{ kind: "env", name: "SERVICE_URL", where: "src/client.ts:1" }]);
    expect(created().body).toContain("SERVICE_URL");
  });

  // review/165: the step sends only a body to a pull request already open, so the Refused: title never lands there.
  it("says a refused run's title was not changed when its branch already has an open pull request", async () => {
    const { repo } = await seed("unattended");
    await put(repo, `${RUN_DIR}/morning.md`, morningList("refused at the ready check"));
    rest.routes.set("GET repos/o/r/pulls", {
      status: 200,
      // The lookup now matches the base as well as the head (pr/52), so the open pull request names its base.
      json: [{ number: 12, html_url: "https://github.com/o/r/pull/12", body: `an earlier list\n\n${MARKER}`, head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` }, base: { ref: "main" } }],
    });
    rest.routes.set("PATCH repos/o/r/pulls/12", { status: 200, json: {} });

    const { code, doc } = await run(repo, [...END("plan 021 not ready"), "--refused"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pr: { number: 12, how: "existing" } });
    expect(doc["notDone"]).toEqual(["title not changed: pull request #12 was already open, so it keeps its own title, not the Refused: one"]);
    expect(writesToGitHub().map((call) => `${call.method} ${call.path}`)).toEqual(["PATCH repos/o/r/pulls/12"]);
  });

  // review/168: a push git refuses stops end before any pull request call, as a scan hit does.
  it("opens no pull request when a pre-push hook refuses the push", async () => {
    const { repo, remote } = await seed("attended");
    const hook = join(repo, ".git", "hooks", "pre-push");
    await writeFile(hook, "#!/bin/sh\nexit 1\n");
    await chmod(hook, 0o755);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...END("feat: x"), "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ subcommand: "end", pushed: false, pr: null, inferred: [], notDone: ["push refused by a hook"] });
    expect(pushes()).toHaveLength(1);
    expect(writesToGitHub()).toEqual([]);
    expect(git(remote, ["for-each-ref", "refs/heads/"])).toBe("");
  });

  describe("the morning walk's body (review/164)", () => {
    const WALK_END = (title: string): string[] => ["end", "--run", WALK, "--title", title, "--json"];
    const WALK_RECORD = `${WALK_DIR}/record.md`;
    /** The body of the one write the verb sent GitHub. */
    const sent = (): string => (writesToGitHub()[0]?.body as { body?: string } | undefined)?.body ?? "";

    /**
     * The overnight run's branch after its close: the first run's record and
     * morning list, an overnight commit adding an env read, then the walk's own
     * attended record reading `Resumes: <resumes>`, its `Base:` the overnight tip.
     */
    async function walk(resumes: string, opts: { firstBase?: boolean } = {}): Promise<Seeded & { tip: string }> {
      const seeded = await seed("unattended");
      const { repo } = seeded;
      if (opts.firstBase === false) await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: closed\nMode: unattended\n`);
      await put(repo, "src/client.ts", "export const url = process.env.SERVICE_URL;\n");
      git(repo, ["add", "--", "src/client.ts"]);
      git(repo, ["commit", "-q", "-m", "overnight"]);
      const tip = git(repo, ["rev-parse", "HEAD"]);
      await put(repo, WALK_RECORD, `# Run ${WALK}\n\nStatus: in progress\nMode: attended\nBranch: ${RUN_BRANCH}\nBase: ${tip}\nResumes: ${resumes}\n`);
      rest.routes.set("GET repos/o/r/pulls", {
        status: 200,
        // The lookup now matches the base as well as the head (pr/52), so the open pull request names its base.
        json: [{ number: 12, html_url: "https://github.com/o/r/pull/12", body: `the overnight list\n\n${MARKER}`, head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` }, base: { ref: "main" } }],
      });
      rest.routes.set("PATCH repos/o/r/pulls/12", { status: 200, json: {} });
      rest.routes.set("POST repos/o/r/issues/12/comments", { status: 201, json: {} });
      return { ...seeded, tip };
    }

    it("replaces the open pull request's body with the resumed run's answered list, under its marker, never a comment", async () => {
      const { repo } = await walk(RUN);
      await put(repo, `${RUN_DIR}/morning.md`, morningList("the delta, answered Q1→1"));

      const { code, doc } = await run(repo, [...WALK_END("Morning walk"), "--paths", `${RUN_DIR}/morning.md`]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ run: WALK, pushed: true, pr: { number: 12, how: "existing" }, notDone: [] });
      expect(writesToGitHub().map((call) => `${call.method} ${call.path}`)).toEqual(["PATCH repos/o/r/pulls/12"]);
      const body = sent();
      expect(body.startsWith(`# Morning list — ${RUN}`)).toBe(true);
      expect(body).toContain("the delta, answered Q1→1");
      expect(body.trimEnd().endsWith(MARKER)).toBe(true);
      expect(body).not.toContain(`stamity:run ${WALK}`);
      // The prerequisites are read since the resumed run's Base:, so the overnight commit's env read stays in the body.
      expect(doc["inferred"]).toMatchObject([{ kind: "env", name: "SERVICE_URL", where: "src/client.ts:1" }]);
    });

    it("screens the walk's body as the unattended one, a hit posting the replacement under the resumed run's marker", async () => {
      const { repo } = await walk(RUN);
      // Not staged, so the push scan leaves it out; the outbound screen still reads it.
      await put(repo, `${RUN_DIR}/morning.md`, morningList(`the key is ${TOKEN}`));

      const { code, doc, stdout, stderr } = await run(repo, WALK_END("Morning walk"));

      expect(code).toBe(0);
      expect(doc["notDone"]).toEqual(["pull request body replaced: the outbound screen matched line 9 (github-token)"]);
      const body = sent();
      expect(body).toBe(
        `Run \`${RUN}\`: the body made from \`${RUN_DIR}/morning.md\` was not posted, because the outbound screen matched its line 9 (github-token). Read the morning list on the branch.\n\n${MARKER}`,
      );
      const fragment = TOKEN.slice(4, 16);
      expect(stdout).not.toContain(fragment);
      expect(stderr).not.toContain(fragment);
      expect(JSON.stringify(rest.calls)).not.toContain(fragment);
    });

    it("reads the prerequisites since the walk's own Base: where the resumed record names none, saying so", async () => {
      const { repo } = await walk(RUN, { firstBase: false });
      await put(repo, `${RUN_DIR}/morning.md`, morningList("the delta"));

      const { code, doc } = await run(repo, WALK_END("Morning walk"));

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pr: { number: 12, how: "existing" }, inferred: [] });
      expect(doc["notDone"]).toEqual([`prerequisites read since this run's Base: only: ${RUN_DIR}/record.md names no Base: that is a commit here`]);
    });

    it.each([
      ["names no run id", "../escape", "pull request body not refreshed: the record's Resumes: names no run id"],
      ["names a run with no folder", "2026-10-15_gone", "pull request body not refreshed: Resumes: names 2026-10-15_gone, and .stamity/runs/2026-10-15_gone is no run folder here"],
      ["names a run with no morning list", RUN, `pull request body not refreshed: the morning list of ${RUN} is missing`],
    ])("keeps the attended fixed body, commenting, when Resumes: %s", async (_case, resumes, reason) => {
      const { repo } = await walk(resumes);

      const { code, doc } = await run(repo, WALK_END("Morning walk"));

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pr: { number: 12, how: "commented" }, inferred: [], notDone: [reason] });
      expect(writesToGitHub().map((call) => `${call.method} ${call.path}`)).toEqual(["POST repos/o/r/issues/12/comments"]);
      expect(sent()).toBe(`Run \`${WALK}\`, attended. Its record: \`${WALK_RECORD}\`.\n\n<!-- stamity:run ${WALK} -->`);
    });
  });

  it.each([
    [["end", "--run", RUN], "run end needs --title <title>"],
    [["end", "--run", RUN, "--title", "x", "--pr"], "--pr does not apply to end"],
    [["end", "--run", RUN, "--title", " "], "--title takes a title"],
    [["checkpoint", "--run", RUN, "--refused"], "--refused does not apply to checkpoint"],
    [["start", "--run", RUN, "--refused"], "--refused does not apply to start"],
  ])("is a usage error (exit 2): %j", async (argv, message) => {
    const { repo } = await seed("attended");

    const { code, stderr } = await run(repo, argv);

    expect(code).toBe(2);
    expect(stderr).toContain(message);
    expect(writes.argv).toEqual([]);
    expect(rest.calls).toEqual([]);
  });

  it("refuses an unattended end where only the main/master fallback answered, opening no pull request (pr/55)", async () => {
    rest.routes.delete("GET repos/o/r");
    const { repo } = await seed("unattended");

    const { code, doc } = await run(repo, END("overnight"));

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual([
      "commit refused: no source named the default branch (GitHub's REST API gave no answer and refs/remotes/origin/HEAD names none), so an unattended run pushes nothing",
    ]);
    expect(pushes()).toEqual([]);
    expect(writesToGitHub()).toEqual([]);
    // One fact away: the same unattended end, origin/HEAD naming the default, commits and pushes (its missing morning
    // list is the only gap it names).
    const named = await seed("unattended");
    git(named.repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    const pushed = await run(named.repo, END("overnight"));
    expect(pushed.doc["notDone"]).toEqual(["morning list missing"]);
    expect(pushed.doc).toMatchObject({ pushed: true });
    expect(pushes()).toHaveLength(1);
  });

  it("refuses as origin changed, and opens no pull request, where origin names another repository than the pin (review/209)", async () => {
    const { repo } = await seed("unattended");
    git(repo, ["remote", "set-url", "origin", "https://github.com/elsewhere/r.git"]);

    const { code, doc } = await run(repo, END("Overnight"));

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual([`origin changed: ${ORIGIN_PIN} pins github.com/o/r, and origin now names github.com/elsewhere/r`]);
    expect(doc).toMatchObject({ pr: null, pushed: false, inferred: [] });
    expect(pushes()).toEqual([]);
    expect(writesToGitHub()).toEqual([]);
  });

  it("refuses at a detached HEAD, and opens no pull request (review/212)", async () => {
    const { repo } = await seed("unattended");
    git(repo, ["switch", "-q", "--detach"]);

    const { code, doc } = await run(repo, END("Overnight"));

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual(["commit refused: HEAD is detached, so there is no run branch to push"]);
    expect(doc).toMatchObject({ branch: null, committed: null, pr: null, pushed: false });
    expect(pushes()).toEqual([]);
    expect(writesToGitHub()).toEqual([]);
  });
});
