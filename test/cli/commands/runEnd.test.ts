import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * u19-run-end (REQ-FLOW-092, REQ-FLOW-094, REQ-FLOW-095, REQ-FLOW-103):
 * `stamity run end`, through the in-process funnel. It runs `checkpoint`'s
 * steps and then the draft pull request every time. Git runs for real, in
 * scratch repositories pushing to a real bare remote (`remote.origin.pushurl`),
 * while `remote.origin.url` names a GitHub repository so the REST reads and the
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
      return real.gitWrite(cwd, args, opts);
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
  async function seed(mode: "attended" | "unattended" | null, opts: { branch?: string } = {}): Promise<Seeded> {
    const dir = getRoot().path(`case-${Math.random().toString(36).slice(2, 8)}`);
    const repo = join(dir, "repo");
    const remote = join(dir, "remote.git");
    await mkdir(repo, { recursive: true });
    git(dir, ["init", "-q", "--bare", remote]);
    git(repo, ["-c", "init.defaultBranch=main", "init", "-q"]);
    git(repo, ["config", "user.name", "Alice Example"]);
    git(repo, ["config", "user.email", "alice@example.com"]);
    await Promise.all(["a.txt", "b.txt"].map((name) => writeFile(join(repo, name), `${name}\n`)));
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "seed"]);
    git(repo, ["remote", "add", "origin", "https://github.com/o/r.git"]);
    git(repo, ["config", "remote.origin.pushurl", remote]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    const branch = opts.branch ?? RUN_BRANCH;
    git(repo, ["switch", "-q", "-c", branch]);
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
      json: [{ number: 12, html_url: "https://github.com/o/r/pull/12", body: `an earlier list\n\n${MARKER}`, head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` } }],
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
      json: [{ number: 15, html_url: "https://github.com/o/r/pull/15", body: "A person's description.", head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` } }],
    });
    rest.routes.set("POST repos/o/r/issues/15/comments", { status: 201, json: {} });

    const { code, doc } = await run(repo, END("Overnight"));

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pr: { number: 15, how: "commented" }, notDone: [] });
    expect(writesToGitHub().map((call) => `${call.method} ${call.path}`)).toEqual(["POST repos/o/r/issues/15/comments"]);
  });

  it("posts the fixed body when the morning list holds a token, and no output or request holds the value", async () => {
    const { repo } = await seed("unattended");
    // The run folder is ignored, so the list never reaches the pushed tree and the push scan; the outbound screen still reads it.
    await writeFile(join(repo, ".gitignore"), ".stamity/runs/\n");
    await put(repo, `${RUN_DIR}/morning.md`, morningList(`the key is ${TOKEN}`));

    const { code, doc, stdout, stderr } = await run(repo, [...END("Overnight"), "--paths", ".gitignore"]);

    expect(code).toBe(0);
    expect(doc["pr"]).toMatchObject({ how: "created" });
    expect(doc["notDone"]).toEqual([
      `records: not committed (${RUN_DIR}/record.md: .gitignore:1 .stamity/runs/)`,
      `records: not committed (${RUN_DIR}/morning.md: .gitignore:1 .stamity/runs/)`,
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
});
