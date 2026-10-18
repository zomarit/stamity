import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { chmod, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import type * as PersonOnlyModule from "../../../src/hooks/personOnly.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * u18b-run-checkpoint (REQ-FLOW-092, REQ-FLOW-093, REQ-FLOW-102,
 * REQ-FLOW-103): `stamity run checkpoint`, through the in-process funnel.
 * Git runs for real, in scratch repositories pushing to a real bare remote
 * (each push alone maps origin's GitHub URL to it, see the spy below), while origin names a GitHub
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

/** The push check's stand-in state (review/211): a reason to deny every `git push` with, and each command it read. */
const table = vi.hoisted(() => ({ denyPush: null as string | null, commands: [] as string[] }));

// A spy over the real table: every command still gets the real verdict, unless a case sets `denyPush`, which makes
// the push command's check refuse. Mock reason: after the verb's own branch refusals no branch it can push makes the
// real table deny `HEAD:refs/heads/<current>` (review/211), so the refusal path is reachable only through a stub.
vi.mock("../../../src/hooks/personOnly.ts", async (importOriginal) => {
  const real = await importOriginal<typeof PersonOnlyModule>();
  return {
    ...real,
    personOnlyVerdict: (command: string, ctx: PersonOnlyModule.PersonOnlyContext): PersonOnlyModule.PersonOnlyVerdict => {
      table.commands.push(command);
      if (table.denyPush !== null && command.startsWith("git push ")) return { deny: true, rule: "push-default", reason: table.denyPush };
      return real.personOnlyVerdict(command, ctx);
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
const ORIGIN_PIN = `${RUN_DIR}/origin.json`;
/** The pin `run start` writes for origin's repository, `https://github.com/o/r.git`. */
const PIN_TEXT = `${JSON.stringify({ host: "github.com", owner: "o", repo: "r" })}\n`;

/** A token-shaped value built from fragments, so this file carries none. */
const TOKEN = ["gh", "p", "_", "Q7RTW2KZ9MXC4HBN8JVL5DPF3GYSA6EUT2RW"].join("");

describe("stamity run checkpoint", () => {
  const getRoot = useTempDir("run-checkpoint");

  beforeEach(() => {
    rest.calls.length = 0;
    rest.routes.clear();
    writes.argv.length = 0;
    table.denyPush = null;
    table.commands.length = 0;
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
  async function seed(mode: "attended" | "unattended" | null, opts: { branch?: string; pin?: "base" | "untracked" | "none" } = {}): Promise<Seeded> {
    const dir = getRoot().path(`case-${Math.random().toString(36).slice(2, 8)}`);
    const repo = join(dir, "repo");
    const remote = join(dir, "remote.git");
    await mkdir(repo, { recursive: true });
    git(dir, ["init", "-q", "--bare", remote]);
    git(repo, ["-c", "init.defaultBranch=main", "init", "-q"]);
    git(repo, ["config", "user.name", "Alice Example"]);
    git(repo, ["config", "user.email", "alice@example.com"]);
    await Promise.all(["a.txt", "b.txt", "[ab].txt", ".cursorrules"].map((name) => writeFile(join(repo, name), `${name}\n`)));
    // TEST CHANGE, justified: review/209 refuses an unattended checkpoint with no origin pin, which `run start` writes;
    // the seed carries the pin `start` would write for origin's repository, in the base commit so no case's staged
    // or pushed set changes. A case about the pin itself rewrites or removes it.
    // `untracked` leaves it out of the base, as a run whose folder git ignores has it; `none` writes no pin.
    if ((opts.pin ?? "base") === "base") await put(repo, ORIGIN_PIN, PIN_TEXT);
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "seed"]);
    git(repo, ["remote", "add", "origin", "https://github.com/o/r.git"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    // TEST CHANGE, justified: review/159 and review/160 read every commit no remote-tracking ref holds, so the
    // seed is fetched as origin/main, as a run's clone has it; with none, the seed (.cursorrules) would be unpushed.
    git(repo, ["update-ref", "refs/remotes/origin/main", base]);
    // TEST CHANGE, justified: pr/46 reads what origin holds from the remote itself (`git ls-remote origin`), not from
    // the remote-tracking ref above, so the bare remote holds the seed as origin's main, as a run's clone's remote does;
    // with an empty remote the seed (.cursorrules) would be unpushed. "Nothing pushed" is now that main alone.
    git(repo, ["push", "-q", remote, "HEAD:refs/heads/main"]);
    const branch = opts.branch ?? RUN_BRANCH;
    if (branch !== "main") git(repo, ["switch", "-q", "-c", branch]);
    if (opts.pin === "untracked") await put(repo, ORIGIN_PIN, PIN_TEXT);
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
  /** The branches the bare remote holds: the seed's main alone until a push lands (pr/46). */
  const remoteHeads = (remote: string): string[] => git(remote, ["for-each-ref", "--format=%(refname)", "refs/heads/"]).split("\n").filter((ref) => ref !== "");
  const SEEDED = ["refs/heads/main"];
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

  // TEST CHANGE, justified (pr/38): since pr/6's third part the patch no longer yields the index side when applied on
  // Base:; it yields the work tree's bytes, and the staged change is read from its first part, so the title says so.
  it("holds a held change staged and then undone in the work tree alone: part 0 carries the staged change, the whole patch applies on Base: to the work tree's bytes (review/156)", async () => {
    const { repo, remote, base } = await seed("unattended");
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
    // TEST CHANGE, justified: pr/6 adds the index-to-work-tree part, so the patch applied on Base: gives the work
    // tree's .cursorrules; the workflow's deletion part is in the patch too.
    expect(patch).toContain("deleted file mode");
    // pr/38: part 0 (Base: to the index) is where the staged change lives: .cursorrules' first section adds it, and
    // the last section, the index-to-work-tree part, takes it back out.
    const sections = patch.split(/^(?=diff --git )/m).filter((section) => section.startsWith("diff --git a/.cursorrules "));
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain("+steered rules");
    expect(sections[0]).not.toContain("-steered rules");
    expect(sections[1]).toContain("-steered rules");
    expect(sections[1]).toContain("+.cursorrules");
    const fresh = join(dirname(repo), "at-base");
    git(repo, ["worktree", "add", "-q", "--detach", fresh, base]);
    git(fresh, ["apply", join(repo, PATCH)]);
    // The whole patch yields the work tree's bytes, Base:'s here, not the staged ones.
    expect(await readFile(join(fresh, ".cursorrules"), "utf8")).toBe(await readFile(join(repo, ".cursorrules"), "utf8"));
    expect(await readFile(join(fresh, ".cursorrules"), "utf8")).toBe(".cursorrules\n");
  });

  // pr/6: a held path staged and then edited again keeps both layers, so the patch reproduces the work tree's bytes.
  it("holds a held file staged and then edited again with both layers, the patch applying on Base: to the work tree's bytes", async () => {
    const { repo, base } = await seed("unattended");
    await writeFile(join(repo, ".cursorrules"), "staged rules\n");
    git(repo, ["add", "--", ".cursorrules"]);
    await writeFile(join(repo, ".cursorrules"), "edited rules\n");

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules"] });
    const patch = await readFile(join(repo, PATCH), "utf8");
    expect(patch).toContain("+staged rules");
    expect(patch).toContain("+edited rules");
    const fresh = join(dirname(repo), "at-base");
    git(repo, ["worktree", "add", "-q", "--detach", fresh, base]);
    git(fresh, ["apply", join(repo, PATCH)]);
    expect(await readFile(join(fresh, ".cursorrules"), "utf8")).toBe("edited rules\n");
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
    expect(remoteHeads(remote)).toEqual(SEEDED);
  });

  it("refuses the push when a commit only another remote holds changes a held path, since the push goes to origin (build/108)", async () => {
    const { repo, remote } = await seed("unattended");
    await writeFile(join(repo, ".cursorrules"), "steered rules\n");
    git(repo, ["commit", "-q", "-am", "a mirror's commit"]);
    // A second remote (a mirror) holds the commit; origin does not, so the push sends it.
    git(repo, ["update-ref", "refs/remotes/upstream/main", "HEAD"]);
    await writeFile(join(repo, ".cursorrules"), ".cursorrules\n");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ pushed: false, notDone: ["held path in history (.cursorrules)"] });
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual(SEEDED);
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
    expect(remoteHeads(remote)).toEqual(SEEDED);
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
    // TEST CHANGE, justified: an attended run with no origin pin is not refused (review/209), and a tracked pin under
    // the ignored folder is no file git adds; this case is about the record, so it carries none.
    const { repo, remote } = await seed("attended", { pin: "none" });
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

  // pr/20: "nothing ahead" is the remote's own branch, not a remote-tracking ref a deletion on the remote left stale.
  it("pushes again when the remote's branch is gone though the remote-tracking ref still names HEAD", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");
    expect((await run(repo, [...CHECKPOINT, "--paths", "a.txt"])).code).toBe(0);
    const head = git(repo, ["rev-parse", "HEAD"]);
    expect(git(repo, ["rev-parse", `refs/remotes/origin/${RUN_BRANCH}`])).toBe(head);
    git(remote, ["update-ref", "-d", `refs/heads/${RUN_BRANCH}`]);
    writes.argv.length = 0;

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ committed: null, pushed: true, notDone: [] });
    expect(pushes()).toHaveLength(1);
    expect(git(remote, ["rev-parse", `refs/heads/${RUN_BRANCH}`])).toBe(head);
  });

  // pr/5: the commit takes the whole index, so a path staged before the verb ran and not in its list refuses it.
  it("refuses a path staged outside --paths, naming it and committing and pushing nothing", async () => {
    const { repo, remote, base } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");
    await writeFile(join(repo, "b.txt"), "staged by someone else\n");
    git(repo, ["add", "--", "b.txt"]);

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ committed: null, pushed: false, notDone: ["commit refused: b.txt is staged and not in --paths"] });
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual(SEEDED);
  });

  it("commits a path staged beforehand under a --paths folder", async () => {
    const { repo, remote } = await seed("attended");
    await put(repo, "src/x.ts", "export const x = 1;\n");
    git(repo, ["add", "--", "src/x.ts"]);

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "src"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [] });
    expect(pushedTree(remote)).toContain("src/x.ts");
  });

  // pr/7: an unread code file does not hold the push, and notDone says the scan left it out.
  it("names a pushed code file the scan could not read in notDone, and still pushes with exit 0", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, "x.ts"), Buffer.from("export const x = 1;\n\0\n"));

    const { code, doc, stdout } = await run(repo, [...CHECKPOINT, "--paths", "x.ts"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, scan: { hits: [], unscanned: ["x.ts"] }, notDone: ["secret scan: 1 files unscanned (x.ts)"] });
    expect(stdout).toContain("secret scan: 1 files unscanned (x.ts)");
    expect(pushedTree(remote)).toContain("x.ts");
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
    expect(remoteHeads(remote)).toEqual(SEEDED);
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
    expect(remoteHeads(remote)).toEqual(SEEDED);
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
    expect(remoteHeads(remote)).toEqual(SEEDED);
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

  it.skipIf(process.platform === "win32")("holds a link added at a held glob's directory prefix, and pushes a link elsewhere (review/200)", async () => {
    const { repo, remote } = await seed("unattended");
    // A folder no glob holds, with the settings a client would read through `.claude`.
    await put(repo, "cfg/settings.json", '{ "hooks": {} }\n');
    await symlink("cfg", join(repo, ".claude"));
    await mkdir(join(repo, "sub"));
    await symlink("../cfg", join(repo, "sub", ".vscode"));
    await symlink("cfg", join(repo, "notes"));

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "cfg", ".claude", "sub/.vscode", "notes"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [] });
    expect(doc["held"]).toEqual([".claude", "sub/.vscode"]);
    const tree = pushedTree(remote);
    expect(tree).not.toContain(".claude");
    expect(tree).not.toContain("sub/.vscode");
    expect(tree).toEqual(expect.arrayContaining(["cfg/settings.json", "notes", PATCH]));
    const patch = await readFile(join(repo, PATCH), "utf8");
    expect(patch).toContain("diff --git a/.claude b/.claude\nnew file mode 120000");
    expect(patch).toContain("diff --git a/sub/.vscode b/sub/.vscode\nnew file mode 120000");
    // The work tree keeps both links.
    expect(lstatSync(join(repo, ".claude")).isSymbolicLink()).toBe(true);
  });

  it.skipIf(process.platform === "win32")("holds a link a dry run would stage at a held prefix (review/200)", async () => {
    const { repo } = await seed("unattended");
    await put(repo, "cfg/hooks.json", "{}\n");
    await symlink("cfg", join(repo, ".cursor"));

    const { code, doc } = await run(repo, [...CHECKPOINT, "--dry-run", "--paths", "cfg", ".cursor"]);

    expect(code).toBe(0);
    expect(doc["held"]).toEqual([".cursor"]);
  });

  it.skipIf(process.platform === "win32")("refuses the push when a commit it would send retypes a file to a link at a held prefix (review/200)", async () => {
    const { repo, remote } = await seed("unattended");
    // Committed by the run itself: a plain file first, which no glob holds, then retyped to a link to a settings folder.
    await put(repo, "cfg/settings.json", '{ "hooks": {} }\n');
    await put(repo, "pkg/.vscode", "a note\n");
    git(repo, ["add", "--", "cfg", "pkg/.vscode"]);
    git(repo, ["commit", "-q", "-m", "a note"]);
    await rm(join(repo, "pkg/.vscode"));
    await symlink("../cfg", join(repo, "pkg/.vscode"));
    git(repo, ["add", "--", "pkg/.vscode"]);
    git(repo, ["commit", "-q", "-m", "retyped"]);

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ pushed: false, notDone: ["held path in history (pkg/.vscode)"] });
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual(SEEDED);
  });

  // TEST CHANGE, justified: pr/46 (signed off 2026-10-17) reads what origin holds with `git ls-remote origin` and drops
  // review/201's Base..HEAD fallback and its note, so this case pins the half of review/201 that stays: a remote that
  // holds the seed, with no remote-tracking ref here, reads only what it lacks.
  it("reads only what origin lacks where the remote holds the seed and no remote-tracking ref is left (review/201, pr/46)", async () => {
    const { repo, remote } = await seed("unattended");
    // The seed commit changes .cursorrules, a held path; read from the tracking refs alone, every commit would be unpushed.
    git(repo, ["update-ref", "-d", "refs/remotes/origin/main"]);
    await writeFile(join(repo, "a.txt"), "the unit's change\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, held: [], notDone: [] });
    expect(pushedTree(remote)).toContain("a.txt");
  });

  // TEST CHANGE, justified: pr/46 (signed off 2026-10-17) reads the pushed history against origin's own branches and
  // tags, so on an empty remote a token committed and removed below Base: is in what the push sends and holds it,
  // where review/201's fallback read Base..HEAD alone and pushed it unscanned.
  it("holds the push on a token removed below Base: where origin is empty and no remote-tracking ref is left (pr/46)", async () => {
    const { repo, remote } = await seed("attended");
    git(repo, ["update-ref", "-d", "refs/remotes/origin/main"]);
    git(remote, ["update-ref", "-d", "refs/heads/main"]);
    // History the run did not write: a token committed and removed again, both below the run's Base:.
    await put(repo, "c.txt", `the key is ${TOKEN}\n`);
    git(repo, ["add", "--", "c.txt"]);
    git(repo, ["commit", "-q", "-m", "old"]);
    const old = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["rm", "-q", "--", "c.txt"]);
    git(repo, ["commit", "-q", "-m", "older fix"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: attended\nBranch: ${RUN_BRANCH}\nBase: ${base}\n`);
    await writeFile(join(repo, "a.txt"), "the unit's change\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ pushed: false });
    expect(doc["notDone"]).toEqual([`push held: secret scan hit at c.txt:1 (commit ${old.slice(0, 12)}) (github-token)`]);
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual([]);
  });

  // pr/46: a remote-tracking ref is local state a run can write, so one naming Base: on an empty remote changes nothing
  // the push sends: the scan still reads the token below it, and unattended the seed's .cursorrules is still held.
  it.each([
    ["attended", (old: string) => `push held: secret scan hit at c.txt:1 (commit ${old.slice(0, 12)}) (github-token)`],
    ["unattended", () => "held path in history (.cursorrules)"],
  ] as const)("holds the %s push where a written remote-tracking ref names Base: and origin is empty (pr/46)", async (mode, refusal) => {
    const { repo, remote } = await seed(mode);
    git(remote, ["update-ref", "-d", "refs/heads/main"]);
    await put(repo, "c.txt", `the key is ${TOKEN}\n`);
    git(repo, ["add", "--", "c.txt"]);
    git(repo, ["commit", "-q", "-m", "old"]);
    const old = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["rm", "-q", "--", "c.txt"]);
    git(repo, ["commit", "-q", "-m", "older fix"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["update-ref", "refs/remotes/origin/main", base]);
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: ${mode}\nBranch: ${RUN_BRANCH}\nBase: ${base}\n`);
    await writeFile(join(repo, "a.txt"), "the unit's change\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ pushed: false });
    expect(doc["notDone"]).toEqual([refusal(old)]);
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual([]);
  });

  // pr/46: what origin holds is read from the remote, so a remote that cannot be read holds the push before the commit.
  it("holds the push, committing nothing, where git ls-remote cannot read origin (pr/46)", async () => {
    const { repo, remote, base } = await seed("attended");
    await rm(remote, { recursive: true, force: true });
    await mkdir(remote);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ committed: null, pushed: false });
    expect(doc["notDone"]).toEqual([expect.stringMatching(/^push held: origin's branches and tags could not be read \(git ls-remote origin answered 128: /)]);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(pushes()).toEqual([]);
  });

  // pr/47: a record whose Branch: is missing, or not bare at column 0, names no branch to match, so it refuses.
  it.each([
    ["no Branch: line", ""],
    ["a bulleted Branch: line", `- Branch: ${RUN_BRANCH}\n`],
  ])("refuses a record with %s, committing and pushing nothing (pr/47)", async (_, branchLine) => {
    const { repo, remote, base } = await seed("unattended", { branch: "feature/other" });
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: unattended\n${branchLine}Base: ${base}\n`);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ branch: "feature/other", committed: null, pushed: false });
    expect(doc["notDone"]).toEqual([`commit refused: ${RUN_DIR}/record.md names no Branch:`]);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual(SEEDED);
  });

  it("refuses as origin changed where origin names another repository than the pin, staging and pushing nothing (review/209)", async () => {
    const { repo, remote } = await seed("unattended");
    git(repo, ["remote", "set-url", "origin", "https://github.com/elsewhere/r.git"]);
    await writeFile(join(repo, "a.txt"), "changed\n");
    const head = git(repo, ["rev-parse", "HEAD"]);

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual([
      `origin changed: ${ORIGIN_PIN} pins github.com/o/r, and origin now names github.com/elsewhere/r`,
    ]);
    expect(doc).toMatchObject({ committed: null, pushed: false });
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual(SEEDED);
  });

  it("refuses as Not done: origin changed where a pushInsteadOf set after run start moves origin's push (review/209)", async () => {
    const { repo, remote } = await seed("unattended", { pin: "none" });
    expect((await run(repo, ["start", "--run", RUN])).code).toBe(0);
    expect(await readFile(join(repo, ORIGIN_PIN), "utf8")).toBe(PIN_TEXT);
    // A config write with no remote.* key: git now pushes origin to another repository, and fetches it from the same one.
    git(repo, ["config", "url.https://github.com/elsewhere/.pushInsteadOf", "https://github.com/o/"]);
    await writeFile(join(repo, "a.txt"), "changed\n");

    const json = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);
    const text = await run(repo, ["checkpoint", "--run", RUN, "--paths", "a.txt"]);

    expect(json.code).toBe(1);
    expect(json.doc["notDone"]).toEqual([
      `origin changed: ${ORIGIN_PIN} pins github.com/o/r, and a push URL of origin names another repository than its fetch URL`,
    ]);
    expect(json.doc).toMatchObject({ committed: null, pushed: false });
    expect(text.code).toBe(1);
    expect(text.stdout).toContain(`Not done:\n  - origin changed: ${ORIGIN_PIN} pins github.com/o/r`);
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual(SEEDED);
  });

  it("refuses as origin changed where a pushInsteadOf sends origin's push off GitHub (review/209)", async () => {
    const { repo } = await seed("unattended");
    git(repo, ["config", "url.https://git.example.com/.pushInsteadOf", "https://github.com/"]);

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual([
      `origin changed: ${ORIGIN_PIN} pins github.com/o/r, and a push URL of origin names no GitHub repository gh reaches`,
    ]);
    expect(pushes()).toEqual([]);
  });

  it("refuses an unattended run with no origin pin, and passes an attended one (review/209)", async () => {
    const unattended = await seed("unattended", { pin: "none" });
    const attended = await seed("attended", { pin: "none" });

    const refused = await run(unattended.repo, CHECKPOINT);
    const kept = await run(attended.repo, CHECKPOINT);

    expect(refused.code).toBe(1);
    expect(refused.doc["notDone"]).toEqual([`origin not pinned: ${ORIGIN_PIN} is missing, so the push's destination is not proven the run's`]);
    expect(kept.code).toBe(0);
    expect(kept.doc).toMatchObject({ pushed: true, notDone: [] });
  });

  it("refuses a pin that holds no repository, and stages a readable pin with the run folder (review/209)", async () => {
    const broken = await seed("attended");
    await writeFile(join(broken.repo, ORIGIN_PIN), '{ "host": "github.com", "owner": "o/../x", "repo": "r" }\n');
    const fresh = await seed("unattended", { pin: "untracked" });

    const refused = await run(broken.repo, CHECKPOINT);
    const staged = await run(fresh.repo, CHECKPOINT);

    expect(refused.code).toBe(1);
    expect(refused.doc["notDone"]).toEqual([`origin not pinned: ${ORIGIN_PIN} holds no repository this verb reads`]);
    expect(staged.code).toBe(0);
    expect(pushedFile(fresh.remote, ORIGIN_PIN)).toBe(PIN_TEXT.trimEnd());
  });

  it("refuses the push when the push command's own check denies it, committing first and pushing nothing (review/211)", async () => {
    const { repo, remote } = await seed("attended");
    await writeFile(join(repo, "a.txt"), "changed\n");
    table.denyPush = "a stand-in refusal";

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc["notDone"]).toEqual(["push refused: a stand-in refusal"]);
    expect(doc).toMatchObject({ pushed: false });
    expect(doc["committed"]).toMatch(/^[0-9a-f]{40}$/);
    // The check read the exact command the push would have run.
    expect(table.commands).toEqual([`git push origin HEAD:refs/heads/${RUN_BRANCH}`]);
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual(SEEDED);
  });

  it("refuses a commit at a detached HEAD, staging, committing and pushing nothing (review/212)", async () => {
    const { repo, remote } = await seed("unattended");
    git(repo, ["switch", "-q", "--detach"]);
    await writeFile(join(repo, "a.txt"), "changed\n");
    const head = git(repo, ["rev-parse", "HEAD"]);

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ branch: null, committed: null, pushed: false });
    expect(doc["notDone"]).toEqual(["commit refused: HEAD is detached, so there is no run branch to push"]);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(repo, ["diff", "--cached", "--name-only"])).toBe("");
    expect(writes.argv.some((argv) => argv[0] === "add" || argv[0] === "commit")).toBe(false);
    expect(pushes()).toEqual([]);
    expect(remoteHeads(remote)).toEqual(SEEDED);
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
