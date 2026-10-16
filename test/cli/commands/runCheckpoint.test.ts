import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * u18b-run-checkpoint (REQ-FLOW-092, REQ-FLOW-093, REQ-FLOW-102,
 * REQ-FLOW-103): `stamity run checkpoint`, through the in-process funnel.
 * Git runs for real, in scratch repositories pushing to a real bare remote
 * (`remote.origin.pushurl`), while `remote.origin.url` names a GitHub
 * repository so the REST reads and the pull request step have one to match.
 * What landed is read from the remote's refs afterwards.
 */

/** Every REST call the verb made, and the answer each `METHOD path` gets. */
const rest = vi.hoisted(() => ({
  calls: [] as { method: string; path: string; body?: unknown }[],
  routes: new Map<string, { status: number; json: unknown }>(),
}));

// Mocked: the real `ghApi` starts `gh`, which calls GitHub over the network
// under the machine's login; a unit test can reach neither. What the verb asks
// for (path, method, body) is recorded and answered from `rest.routes`.
vi.mock("../../../src/cli/engine/ghRunner.ts", () => ({
  ghApi: (request: { method: string; path: string; body?: unknown }) => {
    const path = request.path.replace(/^\//, "").replace(/\?.*$/, "");
    rest.calls.push({ method: request.method, path, body: request.body });
    return Promise.resolve(rest.routes.get(`${request.method} ${path}`) ?? { status: 404, json: { message: "Not Found" } });
  },
}));

/** Every argument vector the verb gave the write runner. */
const writes = vi.hoisted(() => ({ argv: [] as string[][] }));

// A spy, not a stand-in: each call is recorded and passed to the real runner,
// so git still does every write; the record is how the test reads the exact
// push argv, which git's own state cannot show.
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

function isFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

const RUN = "2026-10-16_overnight";
const RUN_BRANCH = `stamity/${RUN}`;
const RUN_DIR = `.stamity/runs/${RUN}`;
const PATCH = `${RUN_DIR}/held/person-only.patch`;
const MARKER = `<!-- stamity:run ${RUN} -->`;

/** A token-shaped value built from fragments, so this file carries none. */
const TOKEN = ["gh", "p", "_", "Q7RTW2KZ9MXC4HBN8JVL5DPF3GYSA6EUT2RW"].join("");

describe("stamity run checkpoint", () => {
  const getRoot = useTempDir("run-checkpoint");

  beforeEach(() => {
    rest.calls.length = 0;
    rest.routes.clear();
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
   * A repository on `main` (a.txt, b.txt, `[ab].txt`, .cursorrules), its own
   * identity in its config, `origin` naming GitHub and pushing to a bare
   * remote, then on the run's branch with a record reading `mode` (no `Mode:` line for `null`).
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
    await Promise.all(["a.txt", "b.txt", "[ab].txt", ".cursorrules"].map((name) => writeFile(join(repo, name), `${name}\n`)));
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "seed"]);
    git(repo, ["remote", "add", "origin", "https://github.com/o/r.git"]);
    git(repo, ["config", "remote.origin.pushurl", remote]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    // TEST CHANGE, justified: review/159 and review/160 read every commit no remote-tracking ref holds, so the
    // seed is fetched as origin/main, as a run's clone has it; with none, the seed (.cursorrules) would be unpushed.
    git(repo, ["update-ref", "refs/remotes/origin/main", base]);
    const branch = opts.branch ?? RUN_BRANCH;
    if (branch !== "main") git(repo, ["switch", "-q", "-c", branch]);
    const modeLine = mode === null ? "" : `Mode: ${mode}\n`;
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\n${modeLine}Branch: ${branch}\nBase: ${base}\n`);
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

  const CHECKPOINT = ["checkpoint", "--run", RUN, "--json"];
  const pushedTree = (remote: string, branch = RUN_BRANCH): string[] =>
    git(remote, ["ls-tree", "-r", "--name-only", `refs/heads/${branch}`]).split("\n");
  const pushedFile = (remote: string, path: string): string => git(remote, ["show", `refs/heads/${RUN_BRANCH}:${path}`]);
  const pushes = (): string[][] => writes.argv.filter((argv) => argv[0] === "push");
  /** The body of the one pull request the verb created. */
  const created = (): { title: string; body: string } => {
    const call = rest.calls.find((entry) => entry.method === "POST" && entry.path === "repos/o/r/pulls");
    if (call === undefined) throw new Error("no pull request was created");
    return call.body as { title: string; body: string };
  };

  // TEST CHANGE, justified: review/159 (signed off 01:28Z) refuses a push whose commits change a held path, so the
  // .cursorrules change here stays in the work tree; the committed case is pinned as a refusal below.
  it("holds a workflow change and a .cursorrules change out of an unattended push, in the patch and the work tree", async () => {
    const { repo, remote } = await seed("unattended");
    // .cursorrules changed in the work tree only; the workflow only in the work tree, named in --paths.
    await writeFile(join(repo, ".cursorrules"), "steered rules\n");
    await put(repo, ".github/workflows/x.yml", "on: push\n");
    await writeFile(join(repo, "a.txt"), "the unit's change\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", ".github/workflows/x.yml"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ subcommand: "checkpoint", run: RUN, branch: RUN_BRANCH, pushed: true, notDone: [] });
    expect(doc["held"]).toEqual([".cursorrules", ".github/workflows/x.yml"]);
    const tree = pushedTree(remote);
    expect(tree).not.toContain(".github/workflows/x.yml");
    expect(tree).toContain(PATCH);
    expect(pushedFile(remote, ".cursorrules")).toBe(".cursorrules");
    expect(pushedFile(remote, "a.txt")).toBe("the unit's change");
    const patch = pushedFile(remote, PATCH);
    expect(patch).toContain("b/.github/workflows/x.yml");
    expect(patch).toContain("+steered rules");
    expect(await readFile(join(repo, ".github/workflows/x.yml"), "utf8")).toBe("on: push\n");
    expect(await readFile(join(repo, ".cursorrules"), "utf8")).toBe("steered rules\n");
    expect(doc["committed"]).toBe(git(repo, ["rev-parse", "HEAD"]));
  });

  it("holds a held change staged and then undone in the work tree alone, from the index side (review/156)", async () => {
    const { repo, remote } = await seed("unattended");
    // Staged, then the work tree put back to Base:'s bytes; and a workflow staged, then deleted from the work tree.
    await writeFile(join(repo, ".cursorrules"), "steered rules\n");
    await put(repo, ".github/workflows/x.yml", "on: push\n");
    git(repo, ["add", "--", ".cursorrules", ".github/workflows/x.yml"]);
    await writeFile(join(repo, ".cursorrules"), ".cursorrules\n");
    await rm(join(repo, ".github"), { recursive: true });

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules", ".github/workflows/x.yml"] });
    expect(pushedTree(remote)).not.toContain(".github/workflows/x.yml");
    expect(pushedFile(remote, ".cursorrules")).toBe(".cursorrules");
    const patch = pushedFile(remote, PATCH);
    expect(patch).toContain("+steered rules");
    expect(patch).toContain("+on: push");
  });

  it("refuses the push when a commit it would send changes a held path, rewriting no history (review/159)", async () => {
    const { repo, remote } = await seed("unattended");
    await writeFile(join(repo, ".cursorrules"), "steered rules\n");
    git(repo, ["commit", "-q", "-am", "run's own commit"]);
    const own = git(repo, ["rev-parse", "HEAD"]);
    // The work tree undoes it too, so neither the work tree nor the index differs from Base: at the path.
    await writeFile(join(repo, ".cursorrules"), ".cursorrules\n");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc, stdout } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ pushed: false, notDone: ["held path in history (.cursorrules)"] });
    expect(stdout).toContain("held path in history (.cursorrules)");
    expect(git(repo, ["rev-parse", "HEAD~1"])).toBe(own);
    expect(pushes()).toEqual([]);
    expect(git(remote, ["for-each-ref", "refs/heads/"])).toBe("");
  });

  it("refuses the push when HEAD's tree still changes a held path after the commit, a hook having staged it (review/156)", async () => {
    const { repo, remote } = await seed("unattended");
    await writeFile(join(repo, ".cursorrules"), "steered rules\n");
    await writeFile(join(repo, "a.txt"), "changed\n");
    const hook = join(repo, ".git", "hooks", "pre-commit");
    await writeFile(hook, "#!/bin/sh\ngit add -- .cursorrules\n");
    await chmod(hook, 0o755);

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ pushed: false, held: [".cursorrules"], notDone: ["held path in the pushed tree (.cursorrules)"] });
    expect(pushes()).toEqual([]);
    expect(git(remote, ["for-each-ref", "refs/heads/"])).toBe("");
  });

  it("holds as unattended a record with no Mode: line while STAMITY_UNATTENDED is set, and not one reading Mode: attended (review/162)", async () => {
    const bare = await seed(null);
    const attended = await seed("attended");
    await Promise.all([bare, attended].map(({ repo }) => put(repo, ".github/workflows/x.yml", "on: push\n")));

    const held = await run(bare.repo, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"], { STAMITY_UNATTENDED: "1" });
    const kept = await run(attended.repo, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"], { STAMITY_UNATTENDED: "1" });

    expect(held.code).toBe(0);
    expect(held.doc["held"]).toEqual([".github/workflows/x.yml"]);
    expect(pushedTree(bare.remote)).not.toContain(".github/workflows/x.yml");
    expect(kept.code).toBe(0);
    expect(kept.doc["held"]).toEqual([]);
    expect(pushedTree(attended.remote)).toContain(".github/workflows/x.yml");
  });

  it("pushes an attended run's workflow change as it is, holding nothing", async () => {
    const { repo, remote } = await seed("attended");
    await put(repo, ".github/workflows/x.yml", "on: push\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, held: [] });
    expect(pushedTree(remote)).toContain(".github/workflows/x.yml");
    expect(pushedTree(remote)).not.toContain(PATCH);
  });

  it("pushes HEAD to the run's branch alone: no main, --force, --tags or -- in the push argv", async () => {
    const { repo } = await seed("unattended");
    git(repo, ["tag", "v1.0.0"]);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(0);
    expect(pushes()).toEqual([["push", "--quiet", "origin", `HEAD:refs/heads/${RUN_BRANCH}`]]);
    for (const argv of pushes()) {
      expect(argv.some((arg) => /\bmain\b|--force|--tags|^-f$/.test(arg) || arg === "--")).toBe(false);
    }
    // Every path the verb staged went after a `--`, plain: the runner adds the magic.
    const adds = writes.argv.filter((argv) => argv[0] === "add");
    expect(adds.every((argv) => argv[1] === "--" && argv.slice(2).every((path) => !path.startsWith(":")))).toBe(true);
  });

  it("stages a glob-shaped --paths entry as that file alone, and the pre-commit hook still matches its own globs", async () => {
    const { repo, remote, base } = await seed("attended");
    await Promise.all(["a.txt", "b.txt", "[ab].txt"].map((name) => writeFile(join(repo, name), `${name} changed\n`)));
    const seen = join(dirname(repo), "hook-saw.txt");
    const hook = join(repo, ".git", "hooks", "pre-commit");
    await writeFile(hook, `#!/bin/sh\ngit diff --cached --name-only -- '*.txt' > '${seen.replaceAll("\\", "/")}'\n`);
    await chmod(hook, 0o755);

    const { code } = await run(repo, [...CHECKPOINT, "--paths", "[ab].txt"]);

    expect(code).toBe(0);
    expect(git(remote, ["diff", "--name-only", base, `refs/heads/${RUN_BRANCH}`]).split("\n")).toEqual([`${RUN_DIR}/record.md`, "[ab].txt"]);
    expect((await readFile(seen, "utf8")).trim()).toBe("[ab].txt");
    expect(git(repo, ["diff", "--name-only"]).split("\n")).toEqual(["a.txt", "b.txt"]);
    expect(git(repo, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("names an ignored record as records: not committed, and still pushes the rest", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, ".gitignore"), ".stamity/runs/\n");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", ".gitignore"]);

    expect(code).toBe(0);
    expect(doc["notDone"]).toEqual([`records: not committed (${RUN_DIR}/record.md: .gitignore:1 .stamity/runs/)`]);
    expect(pushedTree(remote)).not.toContain(`${RUN_DIR}/record.md`);
    expect(pushedTree(remote)).toContain("a.txt");
  });

  it("stages a learning file the close captured when --paths names it (review/146)", async () => {
    const { repo, remote } = await seed("unattended");
    await put(repo, ".stamity/learnings/push-hooks.md", "# A learning\n");

    const { code } = await run(repo, [...CHECKPOINT, "--paths", ".stamity/learnings/push-hooks.md"]);

    expect(code).toBe(0);
    expect(pushedTree(remote)).toContain(".stamity/learnings/push-hooks.md");
  });

  it("refuses to commit on the default branch, committing and pushing nothing", async () => {
    const { repo, base } = await seed("unattended", { branch: "main" });
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual(["commit refused: main is the default branch (read from GitHub's REST API)"]);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(pushes()).toEqual([]);
  });

  it("commits nothing and pushes nothing when nothing is staged and origin already holds HEAD", async () => {
    const { repo } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");
    expect((await run(repo, [...CHECKPOINT, "--paths", "a.txt"])).code).toBe(0);
    writes.argv.length = 0;

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ committed: null, pushed: false, notDone: [] });
    expect(pushes()).toEqual([]);
  });

  it("names a failing pre-push hook and never retries around it", async () => {
    const { repo, remote } = await seed("attended");
    const hook = join(repo, ".git", "hooks", "pre-push");
    await writeFile(hook, "#!/bin/sh\nexit 1\n");
    await chmod(hook, 0o755);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ pushed: false, notDone: ["push refused by a hook"] });
    expect(pushes()).toHaveLength(1);
    expect(writes.argv.some((argv) => argv.includes("--no-verify"))).toBe(false);
    expect(git(remote, ["for-each-ref", "refs/heads/"])).toBe("");
  });

  it("names a missing identity as commit failed (identity)", async () => {
    const { repo } = await seed("attended");
    git(repo, ["config", "--unset", "user.email"]);
    git(repo, ["config", "--unset", "user.name"]);
    git(repo, ["config", "user.useConfigOnly", "true"]);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ committed: null, pushed: false, notDone: ["commit failed (identity)"] });
  });

  it("holds the push on a secret-scan hit, naming path, line and rule and none of the value", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, "a.txt"), `the key is ${TOKEN}\n`);

    const { code, doc, stdout } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "--pr", "--title", "Overnight"]);

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual(["push held: secret scan hit at a.txt:1 (github-token)"]);
    expect(doc["scan"]).toEqual({ hits: [{ path: "a.txt", line: 1, rule: "github-token" }], unscanned: [] });
    expect(stdout).not.toContain(TOKEN.slice(4, 12));
    expect(pushes()).toEqual([]);
    expect(rest.calls.filter((call) => call.method !== "GET")).toEqual([]);
    expect(git(remote, ["for-each-ref", "refs/heads/"])).toBe("");
  });

  it("opens an attended run's draft pull request with the short fixed body, no morning list asked for", async () => {
    const { repo } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "--pr", "--title", "feat: the change"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, pr: { number: 7, url: "https://github.com/o/r/pull/7", how: "created" }, notDone: [], inferred: [] });
    expect(created()).toEqual({
      title: "feat: the change",
      head: RUN_BRANCH,
      base: "main",
      body: `Run \`${RUN}\`, attended. Its record: \`${RUN_DIR}/record.md\`.\n\n${MARKER}`,
      draft: true,
    });
  });

  it("opens an unattended run's pull request from its morning list, with the prerequisites the change implies", async () => {
    const { repo } = await seed("unattended");
    await put(repo, "src/client.ts", "export const url = process.env.SERVICE_URL;\n");
    await put(repo, "src/scratch.ts", "export const probe = process.env.SCRATCH_ONLY;\n");
    const question = JSON.stringify({ id: "Q1", kind: "decision", question: "Merge the delta?", options: ["yes", "no"], default: 2, source: "record" });
    await put(
      repo,
      `${RUN_DIR}/morning.md`,
      [`# Morning list — ${RUN}`, "", "## For you to check", "", "none", "", "## Decisions", "", "- the delta", "", "## Prerequisites", "", "none", "",
        "## Person's calls held", "", "none", "", "## Not done:", "", "none", "", "## How to answer", "", "Answer `Q1→1`.", "",
        "```stamity-morning", question, "```", ""].join("\n"),
    );

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "src/client.ts", "--pr", "--title", "feat: client"]);

    expect(code).toBe(0);
    expect(doc["notDone"]).toEqual([]);
    // review/161: read from what the push carries, so the untracked scratch file's variable is no row.
    expect(doc["inferred"]).toMatchObject([{ kind: "env", name: "SERVICE_URL", where: "src/client.ts:1" }]);
    const { body } = created();
    expect(body.startsWith(`# Morning list — ${RUN}`)).toBe(true);
    expect(body).toContain("SERVICE_URL");
    expect(body.trimEnd().endsWith(MARKER)).toBe(true);
  });

  it("names a missing morning list and opens the unattended pull request with the fixed body", async () => {
    const { repo } = await seed("unattended");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "--pr", "--title", "feat: x"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pr: { how: "created" }, notDone: ["morning list missing"] });
    const { body } = created();
    expect(body).toBe(`Run \`${RUN}\`: no morning list was posted. Its record: \`${RUN_DIR}/record.md\`.\n\n${MARKER}`);
  });

  it("replaces a title the outbound screen matches with Run <run-id>", async () => {
    const { repo } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "--pr", "--title", `fix ${TOKEN}`]);

    expect(code).toBe(0);
    expect(created().title).toBe(`Run ${RUN}`);
  });

  it("screens the title as it posts, so a token split by a character the clean-up drops is still replaced (review/157)", async () => {
    const { repo } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "--pr", "--title", `fix ${TOKEN.slice(0, 10)}\u200b${TOKEN.slice(10)}`]);

    expect(code).toBe(0);
    expect(created().title).toBe(`Run ${RUN}`);
  });

  // TEST CHANGE, justified: build/97 (signed off 01:08Z) counts Branch: main as matching stamity/<this run's id>, so the
  // former "main" row here now goes ahead (pinned in the case below); the refusals left are a run branch that is not this
  // run's, under either record, and a record naming another feature branch.
  it.each([
    ["stamity/another-run", RUN_BRANCH],
    ["feature/other", RUN_BRANCH],
    ["main", "stamity/another-run"],
  ])("refuses as branch mismatch when the record's Branch: is %s and HEAD is on %s (build/93, build/97)", async (named, checkout) => {
    const { repo, base } = await seed("unattended", { branch: checkout });
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: unattended\nBranch: ${named}\nBase: ${base}\n`);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc, stdout } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ branch: checkout, committed: null, pushed: false });
    expect(doc["notDone"]).toEqual([`branch mismatch: the checkout is on ${checkout}, and the record's Branch: names ${named}`]);
    expect(stdout).toContain("branch mismatch");
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(pushes()).toEqual([]);
  });

  it.each(["main", "Master"])("counts a record's Branch: %s as this run's stamity/<run-id>, committing and pushing, the record unedited (build/97)", async (named) => {
    const { repo, remote, base } = await seed("attended");
    const record = `# Run ${RUN}\n\nStatus: in progress\nMode: attended\nBranch: ${named}\nBase: ${base}\n`;
    await put(repo, `${RUN_DIR}/record.md`, record);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch: RUN_BRANCH, pushed: true, notDone: [] });
    expect(await readFile(join(repo, RUN_DIR, "record.md"), "utf8")).toBe(record);
    expect(pushedFile(remote, `${RUN_DIR}/record.md`)).toBe(record.trimEnd());
    expect(pushedFile(remote, "a.txt")).toBe("changed");
  });

  it("pushes past a token in an unstaged change and an untracked file the push leaves behind (build/94)", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");
    await writeFile(join(repo, "b.txt"), `the key is ${TOKEN}\n`);
    await writeFile(join(repo, "notes.txt"), `the key is ${TOKEN}\n`);

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [], scan: { hits: [], unscanned: [] } });
    expect(pushedTree(remote)).not.toContain("notes.txt");
    expect(pushedFile(remote, "b.txt")).toBe("b.txt");
  });

  it("holds the push on the same token once it is committed, though the work tree has since removed it (build/94)", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, "b.txt"), `the key is ${TOKEN}\n`);
    git(repo, ["commit", "-q", "-am", "work"]);
    await writeFile(join(repo, "b.txt"), "b.txt\n");

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual(["push held: secret scan hit at b.txt:1 (github-token)"]);
    expect(pushes()).toEqual([]);
    expect(git(remote, ["for-each-ref", "refs/heads/"])).toBe("");
  });

  it("writes the held patch as bytes, so a held file in Latin-1 applies again from it (build/95)", async () => {
    const { repo, remote } = await seed("unattended");
    // "café" in Latin-1: the 0xE9 byte is no UTF-8, so a text decode would turn it into U+FFFD.
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    await writeFile(join(repo, ".cursorrules"), latin1);

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc["held"]).toEqual([".cursorrules"]);
    const pushed = execFileSync("git", ["show", `refs/heads/${RUN_BRANCH}:${PATCH}`], { cwd: remote, stdio: ["ignore", "pipe", "pipe"] });
    expect(pushed.includes(Buffer.from([0x2b, 0x63, 0x61, 0x66, 0xe9, 0x0a]))).toBe(true);
    expect((await readFile(join(repo, PATCH))).equals(pushed)).toBe(true);
    // The work tree holds the change, so the patch applies in reverse there only when its bytes are the file's.
    git(repo, ["apply", "--check", "--reverse", PATCH]);
  });

  it("removes a held patch whose change is gone, from the work tree and the pushed branch (build/96)", async () => {
    const { repo, remote } = await seed("unattended");
    await writeFile(join(repo, ".cursorrules"), "steered rules\n");
    expect((await run(repo, CHECKPOINT)).code).toBe(0);
    expect(pushedTree(remote)).toContain(PATCH);
    // The change is reverted: the index already holds Base:'s copy, so restoring from it brings the file back.
    git(repo, ["restore", "--", ".cursorrules"]);

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ held: [], pushed: true, notDone: [] });
    expect(pushedTree(remote)).not.toContain(PATCH);
    expect(isFile(join(repo, PATCH))).toBe(false);
    expect(git(repo, ["status", "--porcelain", "--", RUN_DIR])).toBe("");
  });

  it.each([
    [["checkpoint", "--run", RUN, "--pr"], "--pr and --title"],
    [["start", "--run", RUN, "--paths", "a.txt"], "--paths does not apply to start"],
    [["checkpoint", "--run", RUN, "--paths", ""], "no empty path"],
  ])("is a usage error (exit 2): %j", async (argv, message) => {
    const { repo } = await seed("attended");

    const { code, stderr } = await run(repo, argv);

    expect(code).toBe(2);
    expect(stderr).toContain(message);
    expect(writes.argv).toEqual([]);
  });
});
