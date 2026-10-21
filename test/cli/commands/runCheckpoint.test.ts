import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { appendFile, chmod, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { GitWriteGroupStopped } from "../../../src/cli/engine/gitWrite.ts";
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

/**
 * Every argument vector the verb gave the write runner, the stdin each call was handed at the same index (pr/49),
 * and the made-up tag tips a case adds to what `git ls-remote origin` answers.
 */
const writes = vi.hoisted(() => ({
  argv: [] as string[][],
  inputs: [] as (string | undefined)[],
  /** review/179: whether each call, at the same index, asked for a process group of its own. */
  groups: [] as boolean[],
  extraTips: [] as string[],
  /**
   * review/136, review/137: a case's stand-in answer for the calls it matches, handed the real call to run first or
   * not at all; unset, every call goes to the real runner.
   */
  override: null as
    | ((
        args: readonly string[],
        real: (extra?: GitWriteModule.GitWriteOptions) => Promise<GitWriteModule.GitWriteResult>,
      ) => Promise<GitWriteModule.GitWriteResult> | undefined)
    | null,
}));

// A spy, not a stand-in: each call is recorded and passed to the real runner,
// so git still does every write; the record is how the test reads the exact
// push argv, which git's own state cannot show.
vi.mock("../../../src/cli/engine/gitWrite.ts", async (importOriginal) => {
  const real = await importOriginal<typeof GitWriteModule>();
  return {
    ...real,
    gitWrite: (cwd: string, args: readonly string[], opts?: Parameters<typeof real.gitWrite>[2]) => {
      writes.argv.push([...args]);
      writes.inputs.push(opts?.input);
      writes.groups.push(opts?.processGroup === true);
      // Mock reason (review/136, review/137): git's wall time (120 s) and a path read git refuses after a commit
      // cannot be brought about in a unit test's time, so a case answers the one call it names in their place.
      // TEST CHANGE, justified (review/148): the real call takes a case's own options too, so a case can run git for
      // real under a wall time it makes small, and the runner's own kill stops it, rather than a made-up rejection.
      const answered = writes.override?.(args, (extra) => real.gitWrite(cwd, args, { ...opts, ...extra }));
      if (answered !== undefined) return answered;
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
        // pr/49: a case's made-up tips are answered as tags of origin's, as a remote with that many would list them.
        const rows = writes.extraTips.map((sha, index) => `${sha}\trefs/tags/synthetic-${index}\n`).join("");
        return real.gitWrite(cwd, args, opts).then((read) => (args[0] === "ls-remote" && read.code === 0 ? { ...read, stdout: `${read.stdout}${rows}` } : read));
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  };
});

/**
 * The push check's stand-in state (review/211): a reason to deny every `git push` with, each command it read, and a
 * branch name (pr/61) whose push line the real verdict is handed in place of the verb's own.
 */
const table = vi.hoisted(() => ({ denyPush: null as string | null, commands: [] as string[], pushBranch: null as string | null }));

// A spy over the real table: every command still gets the real verdict, unless a case sets `denyPush`, which makes
// the push command's check refuse. Mock reason: after the verb's own branch refusals no branch it can push makes the
// real table deny `HEAD:refs/heads/<current>` (review/211), so the refusal path is reachable only through a stub.
vi.mock("../../../src/hooks/personOnly.ts", async (importOriginal) => {
  const real = await importOriginal<typeof PersonOnlyModule>();
  return {
    ...real,
    personOnlyVerdict: (command: string, ctx: PersonOnlyModule.PersonOnlyContext): PersonOnlyModule.PersonOnlyVerdict => {
      table.commands.push(command);
      // TEST CHANGE (v0a, build/10): a person-only verdict now carries the act it names and its class; the stub's
      // refusal gains both so it stays a well-typed verdict, and the verb still prints only its `reason`.
      if (table.denyPush !== null && command.startsWith("git push ")) {
        return { deny: true, rule: "push-default", act: "A push to the default branch", reason: table.denyPush, ask: true };
      }
      // Mock reason (pr/61): the verb refuses a branch name outside [A-Za-z0-9._/-] before this check, so a name that
      // nests past the verdict's four levels reaches the real verdict only when the spy hands its push line over.
      if (table.pushBranch !== null && command.startsWith("git push ")) {
        return real.personOnlyVerdict(`git push origin HEAD:refs/heads/${table.pushBranch}`, { ...ctx, currentBranch: table.pushBranch });
      }
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

/**
 * Git's auto maintenance off, in the bare remote and the repository alike (prove/12). The race it closes: every push
 * into the remote ends with receive-pack starting `git maintenance run --auto --detach`, and every commit starts the
 * same in the repository. That command forks and its parent exits, so the child outlives git, the verb and the case,
 * and nothing awaits it; under load it was still writing under `remote.git/objects` while the case's cleanup removed
 * the folder, which failed `ENOTEMPTY` (CI's coverage leg). With these keys git starts no maintenance at all, so no git
 * process outlives the call that started it.
 */
const NO_AUTO_MAINTENANCE = "[receive]\n\tautogc = false\n[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n";

describe("stamity run checkpoint", () => {
  const getRoot = useTempDir("run-checkpoint");

  beforeEach(() => {
    rest.calls.length = 0;
    rest.routes.clear();
    writes.argv.length = 0;
    writes.inputs.length = 0;
    writes.groups.length = 0;
    writes.extraTips.length = 0;
    writes.override = null;
    table.denyPush = null;
    table.commands.length = 0;
    table.pushBranch = null;
    rest.routes.set("GET repos/o/r", { status: 200, json: { default_branch: "main" } });
    rest.routes.set("GET repos/o/r/pulls", { status: 200, json: [] });
    rest.routes.set("POST repos/o/r/pulls", { status: 201, json: { number: 7, html_url: "https://github.com/o/r/pull/7" } });
  });

  interface Seeded {
    repo: string;
    remote: string;
    base: string;
    /** The project root the verb runs from: the repository's top, or the `project` folder below it (build/99). */
    project: string;
  }

  /**
   * A repository on `main` (a.txt, b.txt, `[ab].txt`, .cursorrules), its own
   * identity in its config, `origin` naming GitHub and pushing to a bare
   * remote, then on the run's branch with a record reading `mode` (no `Mode:` line for `null`).
   * TEST CHANGE, justified (build/99): `project` names a folder below the git top the project lives in, its run
   * folder (the pin and the record) written there; left out, they sit at the top as before, so no other case moves.
   */
  async function seed(
    mode: "attended" | "unattended" | null,
    opts: { branch?: string; pin?: "base" | "untracked" | "none"; files?: Record<string, string>; links?: Record<string, string>; project?: string } = {},
  ): Promise<Seeded> {
    const inProject = (path: string): string => (opts.project === undefined ? path : `${opts.project}/${path}`);
    const dir = getRoot().path(`case-${Math.random().toString(36).slice(2, 8)}`);
    const repo = join(dir, "repo");
    const remote = join(dir, "remote.git");
    await mkdir(repo, { recursive: true });
    git(dir, ["init", "-q", "--bare", remote]);
    // prove/12: before the first push or commit, so no detached maintenance child outlives either (see the constant).
    await appendFile(join(remote, "config"), NO_AUTO_MAINTENANCE);
    git(repo, ["-c", "init.defaultBranch=main", "init", "-q"]);
    await appendFile(join(repo, ".git", "config"), NO_AUTO_MAINTENANCE);
    git(repo, ["config", "user.name", "Alice Example"]);
    git(repo, ["config", "user.email", "alice@example.com"]);
    await Promise.all(["a.txt", "b.txt", "[ab].txt", ".cursorrules"].map((name) => writeFile(join(repo, name), `${name}\n`)));
    // TEST CHANGE, justified: review/209 refuses an unattended checkpoint with no origin pin, which `run start` writes;
    // the seed carries the pin `start` would write for origin's repository, in the base commit so no case's staged
    // or pushed set changes. A case about the pin itself rewrites or removes it.
    // `untracked` leaves it out of the base, as a run whose folder git ignores has it; `none` writes no pin.
    if ((opts.pin ?? "base") === "base") await put(repo, inProject(ORIGIN_PIN), PIN_TEXT);
    // review/175: a case's own files in Base:, hook declarations and the scripts they name among them.
    await Promise.all(Object.entries(opts.files ?? {}).map(([path, text]) => put(repo, path, text)));
    git(repo, ["add", "-A"]);
    // review/185: a case's links in Base:, written to the index alone, so Base: holds each as a link on every platform
    // (Windows included, where a checkout may write no link); the work tree lacks them, and each case refuses before staging.
    for (const [path, target] of Object.entries(opts.links ?? {})) {
      const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: target, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG } }).trim();
      git(repo, ["update-index", "--add", "--cacheinfo", `120000,${blob},${path}`]);
    }
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
    if (opts.pin === "untracked") await put(repo, inProject(ORIGIN_PIN), PIN_TEXT);
    const modeLine = mode === null ? "" : `Mode: ${mode}\n`;
    await put(repo, inProject(`${RUN_DIR}/record.md`), `# Run ${RUN}\n\nStatus: in progress\n${modeLine}Branch: ${branch}\nBase: ${base}\n`);
    return { repo, remote, base, project: opts.project === undefined ? repo : join(repo, ...opts.project.split("/")) };
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
    // TEST CHANGE, justified (v21, REQ-FLOW-093, pr/39): the workflow is absent at Base: and absent from the work tree,
    // staged and then deleted, so the patch carries no section for it (it carried an addition and a deletion, and a
    // patch applied part by part restored a file the run deleted); `held` still names it (its text line below), and
    // the index still drops it.
    expect(patch).not.toContain(".github/workflows/x.yml");
    expect(patch).not.toContain("+on: push");
    expect(patch).not.toContain("deleted file mode");
    expect(git(repo, ["ls-files", "--", ".github/workflows/x.yml"])).toBe("");
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
    // v21 (REQ-FLOW-093): the patch applied on Base: does not create the workflow the run staged and then deleted.
    expect(existsSync(join(fresh, ".github/workflows/x.yml"))).toBe(false);
  });

  // v21 (REQ-FLOW-093): the text's held line names a staged-then-deleted path and says it has no section; with no
  // other held path there is no patch to write, so none is left in the run folder or the pushed branch.
  it("names a held path staged and then deleted, absent at Base:, on the held line with no section, writing no patch", async () => {
    const { repo, remote } = await seed("unattended");
    await put(repo, ".github/workflows/x.yml", "on: push\n");
    git(repo, ["add", "--", ".github/workflows/x.yml"]);
    await rm(join(repo, ".github"), { recursive: true });

    const { code, stdout } = await run(repo, ["checkpoint", "--run", RUN]);

    expect(code).toBe(0);
    expect(stdout).toContain(`held (in ${PATCH}; the work tree keeps them): .github/workflows/x.yml (staged, then deleted: no section)`);
    expect(isFile(join(repo, PATCH))).toBe(false);
    expect(pushedTree(remote)).not.toContain(PATCH);
    expect(pushedTree(remote)).not.toContain(".github/workflows/x.yml");
    expect(git(repo, ["ls-files", "--", ".github/workflows/x.yml"])).toBe("");
  });

  // v21 (REQ-FLOW-093): the reverse of the staged-then-deleted case, a held path absent at Base:, staged, deleted and then written
  // again in the work tree, keeps both layers: only a path absent at both ends gets no section.
  it("keeps both layers for a held path absent at Base:, staged, then deleted and recreated in the work tree, the patch applying on Base: to the work tree's bytes", async () => {
    const { repo, base } = await seed("unattended");
    await put(repo, ".github/workflows/x.yml", "on: push\n");
    git(repo, ["add", "--", ".github/workflows/x.yml"]);
    await rm(join(repo, ".github"), { recursive: true });
    await put(repo, ".github/workflows/x.yml", "on: pull_request\n");

    const { code, doc, stdout } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".github/workflows/x.yml"] });
    expect(stdout).not.toContain("no section");
    const patch = await readFile(join(repo, PATCH), "utf8");
    const sections = patch.split(/^(?=diff --git )/m).filter((section) => section.startsWith("diff --git a/.github/workflows/x.yml "));
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain("+on: push");
    expect(sections[1]).toContain("+on: pull_request");
    const fresh = join(dirname(repo), "at-base");
    git(repo, ["worktree", "add", "-q", "--detach", fresh, base]);
    git(fresh, ["apply", join(repo, PATCH)]);
    expect(await readFile(join(fresh, ".github/workflows/x.yml"), "utf8")).toBe("on: pull_request\n");
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

  // review/2 (REQ-FLOW-093): a held path Base: holds, its deletion staged (git rm --cached keeping the file, git rm and
  // then written again), is untracked in the work tree, so the index-to-work-tree part skipped it and the patch carried
  // the deletion alone; it now adds the work tree's bytes too, and the real index ends at Base:'s copy as before.
  it.each([
    { how: "git rm --cached, the file kept as it was", rm: ["rm", "-q", "--cached"], text: null },
    { how: "git rm --cached, the file rewritten", rm: ["rm", "-q", "--cached"], text: "rewritten rules\n" },
    { how: "git rm, then the file written again", rm: ["rm", "-q"], text: "written again\n" },
  ])("holds a held path Base: holds whose deletion is staged while the work tree has it ($how), the patch applying on Base: to the work tree's bytes", async ({ rm: removal, text }) => {
    const { repo, base } = await seed("unattended");
    git(repo, [...removal, "--", ".cursorrules"]);
    if (text !== null) await writeFile(join(repo, ".cursorrules"), text);
    const bytes = await readFile(join(repo, ".cursorrules"), "utf8");

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules"] });
    const patch = await readFile(join(repo, PATCH), "utf8");
    const sections = patch.split(/^(?=diff --git )/m).filter((section) => section.startsWith("diff --git a/.cursorrules "));
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain("deleted file mode");
    expect(sections[1]).toContain("new file mode 100644");
    const fresh = join(dirname(repo), "at-base");
    git(repo, ["worktree", "add", "-q", "--detach", fresh, base]);
    git(fresh, ["apply", join(repo, PATCH)]);
    expect(await readFile(join(fresh, ".cursorrules"), "utf8")).toBe(bytes);
    // The real index was not used to build the part: it ends at Base:'s copy, as every held path's does.
    expect(git(repo, ["diff", "--cached", "--name-only", base, "--", ".cursorrules"])).toBe("");
    expect(await readFile(join(repo, ".cursorrules"), "utf8")).toBe(bytes);
  });

  // review/3: with core.abbrev=6 the raw reads printed six-digit object ids, the zero id among them, which read as modes.
  it.skipIf(process.platform === "win32")("holds a link added at a held prefix where core.abbrev is 6 (review/3)", async () => {
    const { repo, remote } = await seed("unattended");
    git(repo, ["config", "core.abbrev", "6"]);
    await put(repo, "cfg/settings.json", '{ "hooks": {} }\n');
    await symlink("cfg", join(repo, ".claude"));

    const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "cfg", ".claude"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".claude"] });
    expect(pushedTree(remote)).not.toContain(".claude");
    expect(await readFile(join(repo, PATCH), "utf8")).toContain("diff --git a/.claude b/.claude\nnew file mode 120000");
  });

  it("gives a held path staged and then deleted, absent at Base:, no section where core.abbrev is 6 (review/3)", async () => {
    const { repo, remote } = await seed("unattended");
    git(repo, ["config", "core.abbrev", "6"]);
    await put(repo, ".github/workflows/x.yml", "on: push\n");
    git(repo, ["add", "--", ".github/workflows/x.yml"]);
    await rm(join(repo, ".github"), { recursive: true });

    const { code, stdout } = await run(repo, ["checkpoint", "--run", RUN]);

    expect(code).toBe(0);
    expect(stdout).toContain(".github/workflows/x.yml (staged, then deleted: no section)");
    expect(isFile(join(repo, PATCH))).toBe(false);
    expect(pushedTree(remote)).not.toContain(PATCH);
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

  describe("the scripts the hook declarations at Base: name (review/175)", () => {
    /** A hook file declaring one hook, run as `node <script>`. */
    const declaring = (script: string): string => `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", script] }] })}\n`;
    const USER_HOOKS = { ".stamity/hooks/guard.json": declaring("tools/guard.mjs"), "tools/guard.mjs": "base guard\n", "tools/other.mjs": "base other\n" };

    it("holds a user hook's script outside the held folders, edited by an unattended run, out of the push and in the patch", async () => {
      const { repo, remote } = await seed("unattended", { files: USER_HOOKS });
      await writeFile(join(repo, "tools/guard.mjs"), "steered guard\n");
      await writeFile(join(repo, "a.txt"), "the unit's change\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "tools/guard.mjs"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["tools/guard.mjs"] });
      expect(pushedFile(remote, "tools/guard.mjs")).toBe("base guard");
      expect(pushedFile(remote, "a.txt")).toBe("the unit's change");
      expect(pushedFile(remote, PATCH)).toContain("+steered guard");
      expect(await readFile(join(repo, "tools/guard.mjs"), "utf8")).toBe("steered guard\n");
    });

    it("pushes a script no declaration at Base: names as before, and holds nothing for an attended run", async () => {
      const unattended = await seed("unattended", { files: USER_HOOKS });
      const attended = await seed("attended", { files: USER_HOOKS });
      await writeFile(join(unattended.repo, "tools/other.mjs"), "the unit's change\n");
      await writeFile(join(attended.repo, "tools/guard.mjs"), "the person's change\n");

      const other = await run(unattended.repo, [...CHECKPOINT, "--paths", "tools/other.mjs"]);
      const own = await run(attended.repo, [...CHECKPOINT, "--paths", "tools/guard.mjs"]);

      expect(other.code).toBe(0);
      expect(other.doc).toMatchObject({ pushed: true, notDone: [], held: [] });
      expect(pushedFile(unattended.remote, "tools/other.mjs")).toBe("the unit's change");
      expect(own.code).toBe(0);
      expect(own.doc).toMatchObject({ pushed: true, notDone: [], held: [] });
      expect(pushedFile(attended.remote, "tools/guard.mjs")).toBe("the person's change");
    });

    it("still holds the script when the run edits its declaration to drop it, the declaration held too", async () => {
      const { repo, remote } = await seed("unattended", { files: USER_HOOKS });
      await writeFile(join(repo, ".stamity/hooks/guard.json"), declaring("tools/other.mjs"));
      await writeFile(join(repo, "tools/guard.mjs"), "steered guard\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "tools/guard.mjs"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".stamity/hooks/guard.json", "tools/guard.mjs"] });
      expect(pushedFile(remote, "tools/guard.mjs")).toBe("base guard");
      expect(pushedFile(remote, ".stamity/hooks/guard.json")).toBe(declaring("tools/guard.mjs").trimEnd());
    });

    it("holds a script a declaration at Base: names though Base: lacks it, the run adding it", async () => {
      const { repo, remote } = await seed("unattended", { files: { ".stamity/hooks/guard.json": declaring("tools/new.mjs") } });
      await put(repo, "tools/new.mjs", "added by the run\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "tools/new.mjs"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["tools/new.mjs"] });
      expect(pushedTree(remote)).not.toContain("tools/new.mjs");
    });

    it.skipIf(process.platform === "win32")("holds a link the run adds at a folder above such a script", async () => {
      const { repo, remote } = await seed("unattended", { files: { ".stamity/hooks/guard.json": declaring("tools/guard.mjs") } });
      await put(repo, "elsewhere/guard.mjs", "steered guard\n");
      await symlink("elsewhere", join(repo, "tools"));

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "elsewhere", "tools"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["tools"] });
      expect(pushedTree(remote)).not.toContain("tools");
      expect(pushedTree(remote)).toContain("elsewhere/guard.mjs");
    });

    it("holds an installed pack's hook declaration and the script it names", async () => {
      const declaration = ".stamity/packs/acme__guard/hooks/pre.json";
      const { repo, remote } = await seed("unattended", { files: { [declaration]: declaring("scripts/pack-guard.mjs"), "scripts/pack-guard.mjs": "base pack guard\n" } });
      await writeFile(join(repo, declaration), declaring("scripts/elsewhere.mjs"));
      await writeFile(join(repo, "scripts/pack-guard.mjs"), "steered pack guard\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "scripts/pack-guard.mjs"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [declaration, "scripts/pack-guard.mjs"] });
      expect(pushedFile(remote, "scripts/pack-guard.mjs")).toBe("base pack guard");
      expect(pushedFile(remote, declaration)).toBe(declaring("scripts/pack-guard.mjs").trimEnd());
    });

    it("reads the declarations in the folder Base:'s manifest names", async () => {
      const manifest = `${JSON.stringify({ hooks: { userHooksDir: "hooks" } })}\n`;
      const { repo, remote } = await seed("unattended", { files: { ".stamity/manifest.json": manifest, "hooks/guard.json": declaring("tools/guard.mjs"), "tools/guard.mjs": "base guard\n" } });
      await writeFile(join(repo, "tools/guard.mjs"), "steered guard\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "tools/guard.mjs"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["tools/guard.mjs"] });
      expect(pushedFile(remote, "tools/guard.mjs")).toBe("base guard");
    });

    it("refuses the push when a commit it would send changes such a script", async () => {
      const { repo, remote } = await seed("unattended", { files: USER_HOOKS });
      await writeFile(join(repo, "tools/guard.mjs"), "steered guard\n");
      git(repo, ["commit", "-q", "-am", "run's own commit"]);
      await writeFile(join(repo, "tools/guard.mjs"), "base guard\n");
      await writeFile(join(repo, "a.txt"), "changed\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({ pushed: false, notDone: ["held path in history (tools/guard.mjs)"] });
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    it("refuses before staging when a hook file at Base: does not parse, naming it, and pushes nothing", async () => {
      const { repo, remote } = await seed("unattended", { files: { ".stamity/hooks/broken.json": "{ not json\n", "tools/guard.mjs": "base guard\n" } });
      await writeFile(join(repo, "tools/guard.mjs"), "steered guard\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "tools/guard.mjs"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({
        pushed: false,
        committed: null,
        held: [],
        notDone: [
          "hold refused: .stamity/hooks/broken.json at Base: does not parse, so the hook scripts it names are unknown and the run pushes nothing",
        ],
      });
      expect(git(repo, ["diff", "--cached", "--name-only"])).toBe("");
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    describe("the hold fails closed on anything it cannot resolve cleanly at Base: (review/182-/189)", () => {
      const refused = (path: string, why: string): string =>
        `hold refused: ${path} at Base: ${why}, so the hook scripts it names are unknown and the run pushes nothing`;
      const manifestNaming = (folder: string): string => `${JSON.stringify({ hooks: { userHooksDir: folder } })}\n`;
      const GUARD = { "tools/guard.mjs": "base guard\n" };

      it("holds the whole folder Base:'s manifest names: a declaration the run edits there, and one it adds, stay out of the push (review/182, review/184)", async () => {
        const { repo, remote } = await seed("unattended", { files: { ".stamity/manifest.json": manifestNaming("hooks"), "hooks/guard.json": declaring("tools/guard.mjs"), ...GUARD } });
        await writeFile(join(repo, "hooks/guard.json"), declaring("tools/other.mjs"));
        await put(repo, "hooks/new.json", declaring("tools/new.mjs"));
        await put(repo, "tools/new.mjs", "added by the run\n");
        await writeFile(join(repo, "a.txt"), "the unit's change\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "hooks/guard.json", "hooks/new.json", "tools/new.mjs"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["hooks/guard.json", "hooks/new.json"] });
        expect(pushedFile(remote, "hooks/guard.json")).toBe(declaring("tools/guard.mjs").trimEnd());
        expect(pushedTree(remote)).not.toContain("hooks/new.json");
        expect(pushedFile(remote, "a.txt")).toBe("the unit's change");
      });

      it("holds a launcher a declaration at Base: names as a repository file, and leaves a bare launcher name to PATH (build/98)", async () => {
        const declaration = `${JSON.stringify({
          hooks: [
            { event: "pre_tool_use", command: ["./tools/node", "tools/guard.mjs"] },
            { event: "pre_tool_use", command: ["node", "tools/other.mjs"] },
          ],
        })}\n`;
        const { repo, remote } = await seed("unattended", {
          files: { ".stamity/hooks/guard.json": declaration, "tools/node": "base launcher\n", node: "a file named like the bare launcher\n", ...GUARD },
        });
        await writeFile(join(repo, "tools/node"), "steered launcher\n");
        await writeFile(join(repo, "node"), "the unit's change\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "tools/node", "node"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["tools/node"] });
        expect(pushedFile(remote, "tools/node")).toBe("base launcher");
        expect(pushedFile(remote, "node")).toBe("the unit's change");
      });

      it("holds a script a declaration at Base: spells with backslashes, on every platform (review/183, review/186)", async () => {
        const { repo, remote } = await seed("unattended", { files: { ".stamity/hooks/guard.json": declaring("tools\\guard.mjs"), ...GUARD } });
        await writeFile(join(repo, "tools/guard.mjs"), "steered guard\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "tools/guard.mjs"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["tools/guard.mjs"] });
        expect(pushedFile(remote, "tools/guard.mjs")).toBe("base guard");
      });

      it("reads a manifest and a declaration at Base: that open with a byte-order mark, as the manifest reader does (review/188)", async () => {
        const { repo, remote } = await seed("unattended", {
          files: { ".stamity/manifest.json": `﻿${manifestNaming("hooks")}`, "hooks/guard.json": `﻿${declaring("tools/guard.mjs")}`, ...GUARD },
        });
        await writeFile(join(repo, "tools/guard.mjs"), "steered guard\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "tools/guard.mjs"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["tools/guard.mjs"] });
        expect(pushedFile(remote, "tools/guard.mjs")).toBe("base guard");
      });

      it("holds a path a run spells in the other Unicode normalization form than the declaration at Base: names it (review/194)", async () => {
        // The declaration names the script decomposed and Base: lacks it; the run adds it composed, which a
        // normalization-insensitive checkout opens at the declared spelling.
        const { repo, remote } = await seed("unattended", { files: { ".stamity/hooks/guard.json": declaring("tools/cafe\u0301.mjs") } });
        await put(repo, "tools/caf\u00e9.mjs", "added by the run\n");
        await writeFile(join(repo, "a.txt"), "the unit's change\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "tools/caf\u00e9.mjs"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [] });
        expect((doc["held"] as string[]).map((path) => path.normalize("NFC"))).toEqual(["tools/caf\u00e9.mjs"]);
        expect(pushedTree(remote).map((path) => path.normalize("NFC"))).not.toContain("tools/caf\u00e9.mjs");
        expect(pushedFile(remote, "a.txt")).toBe("the unit's change");
      });

      it.each([
        { layout: "at a folder above a declared script Base: lacks (review/195)", at: "tools" },
        { layout: "at a held glob's directory prefix, as a link there is", at: ".claude" },
      ])("refuses the push when a commit it would send adds a submodule $layout", async ({ at }) => {
        const { repo, remote, base } = await seed("unattended", { files: { ".stamity/hooks/guard.json": declaring("tools/guard.mjs") } });
        // Written to the index alone, as `git submodule add` records it: a gitlink to a commit of the run's choosing.
        git(repo, ["update-index", "--add", "--cacheinfo", `160000,${base},${at}`]);
        git(repo, ["commit", "-q", "-m", "a submodule"]);
        await writeFile(join(repo, "a.txt"), "changed\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

        expect(code).toBe(1);
        expect(doc).toMatchObject({ pushed: false, notDone: [`held path in history (${at})`] });
        expect(pushes()).toEqual([]);
        expect(remoteHeads(remote)).toEqual(SEEDED);
      });

      it("holds each repository file a declaration at Base: names as an option's value, and leaves a word naming a folder alone (the option-value question)", async () => {
        const declaration = `${JSON.stringify({
          hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs", "--config=cfg/policy.json", "--rules", "rules/r.yml", "--table=table.json", "--dir=src"] }],
        })}\n`;
        const { repo, remote } = await seed("unattended", {
          files: {
            ".stamity/hooks/guard.json": declaration,
            "cfg/policy.json": "base policy\n",
            "rules/r.yml": "base rules\n",
            "table.json": "base table\n",
            "src/a.ts": "base source\n",
            ...GUARD,
          },
        });
        await writeFile(join(repo, "cfg/policy.json"), "steered policy\n");
        await writeFile(join(repo, "rules/r.yml"), "steered rules\n");
        await writeFile(join(repo, "table.json"), "steered table\n");
        await writeFile(join(repo, "src/a.ts"), "the unit's change\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "cfg/policy.json", "rules/r.yml", "table.json", "src/a.ts"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["cfg/policy.json", "rules/r.yml", "table.json"] });
        expect(pushedFile(remote, "cfg/policy.json")).toBe("base policy");
        expect(pushedFile(remote, "rules/r.yml")).toBe("base rules");
        expect(pushedFile(remote, "table.json")).toBe("base table");
        expect(pushedFile(remote, "src/a.ts")).toBe("the unit's change");
      });

      it("holds a bare option value and a bare argument word naming a file Base: lacks, the run adding both (review/196, review/199)", async () => {
        const declaration = `${JSON.stringify({
          hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs", "--table=table.json", "policy.json"] }],
        })}\n`;
        const { repo, remote } = await seed("unattended", { files: { ".stamity/hooks/guard.json": declaration, ...GUARD } });
        await put(repo, "table.json", "added table\n");
        await put(repo, "policy.json", "added policy\n");
        await writeFile(join(repo, "a.txt"), "the unit's change\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "table.json", "policy.json"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [], held: ["policy.json", "table.json"] });
        expect(pushedTree(remote)).not.toContain("table.json");
        expect(pushedTree(remote)).not.toContain("policy.json");
        expect(pushedFile(remote, PATCH)).toContain("+added table");
        expect(pushedFile(remote, "a.txt")).toBe("the unit's change");
      });

      it("leaves a folder a declaration at Base: names alone, written as a path or bare, so the unit's work under it is pushed (review/197)", async () => {
        const declaration = `${JSON.stringify({
          hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs", "--cwd=./src", "--include=lib/", "packages/app", "--dir=docs"] }],
        })}\n`;
        const { repo, remote } = await seed("unattended", {
          files: {
            ".stamity/hooks/guard.json": declaration,
            "src/a.ts": "base source\n",
            "lib/b.ts": "base lib\n",
            "packages/app/c.ts": "base app\n",
            "docs/d.md": "base docs\n",
            ...GUARD,
          },
        });
        await Promise.all(["src/a.ts", "lib/b.ts", "packages/app/c.ts", "docs/d.md"].map((path) => writeFile(join(repo, path), `the unit's ${path}\n`)));

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "src/a.ts", "lib/b.ts", "packages/app/c.ts", "docs/d.md"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [], held: [] });
        for (const path of ["src/a.ts", "lib/b.ts", "packages/app/c.ts", "docs/d.md"]) expect(pushedFile(remote, path)).toBe(`the unit's ${path}`);
      });

      it("neither holds nor refuses a value with a URL-like scheme, which names no repository file (review/198)", async () => {
        const declaration = `${JSON.stringify({
          hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs", "--endpoint=unix:/tmp/hook.sock", "--registry=npm:@scope/pkg", "--socket=unix:hook.sock"] }],
        })}\n`;
        const { repo, remote } = await seed("unattended", { files: { ".stamity/hooks/guard.json": declaration, ...GUARD } });
        await writeFile(join(repo, "a.txt"), "the unit's change\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

        expect(code).toBe(0);
        expect(doc).toMatchObject({ pushed: true, notDone: [], held: [] });
        expect(pushedFile(remote, "a.txt")).toBe("the unit's change");
      });

      const PACK_DECLARATION = declaring("tools/guard.mjs");
      it.each([
        {
          layout: "a link above the folder Base:'s manifest names (review/185)",
          files: { ".stamity/manifest.json": manifestNaming("cfg/hooks"), "elsewhere/hooks/guard.json": declaring("tools/guard.mjs") },
          links: { cfg: "elsewhere" },
          line: refused("cfg/hooks", "passes through a link (cfg)"),
        },
        {
          layout: "the packs folder is a link (review/185)",
          files: { "elsewhere/packs/acme__guard/hooks/pre.json": PACK_DECLARATION },
          links: { ".stamity/packs": "../elsewhere/packs" },
          line: refused(".stamity/packs", "passes through a link (.stamity/packs)"),
        },
        {
          layout: "a pack root is a link (review/185)",
          files: { "elsewhere/acme/hooks/pre.json": PACK_DECLARATION },
          links: { ".stamity/packs/acme__guard": "../../elsewhere/acme" },
          line: refused(".stamity/packs/acme__guard/hooks", "passes through a link (.stamity/packs/acme__guard)"),
        },
        {
          layout: "the manifest names its hooks folder in another letter case than the tree (review/185)",
          files: { ".stamity/manifest.json": manifestNaming("Hooks"), "hooks/guard.json": declaring("tools/guard.mjs") },
          links: {},
          line: refused("Hooks", "is spelled in another letter case than the tree's hooks"),
        },
        {
          layout: "the tree holds the default hooks folder in another letter case (review/185)",
          files: { ".stamity/Hooks/guard.json": declaring("tools/guard.mjs") },
          links: {},
          line: refused(".stamity/hooks", "is spelled in another letter case than the tree's .stamity/Hooks"),
        },
        {
          layout: "a declared script's path passes through a link (review/185)",
          files: { ".stamity/hooks/guard.json": declaring("lnk/guard.mjs") },
          links: { lnk: "tools" },
          line: refused(".stamity/hooks/guard.json", "names lnk/guard.mjs, which passes through a link (lnk)"),
        },
        {
          layout: "a declared launcher's path passes through a link (build/98)",
          files: { ".stamity/hooks/guard.json": `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["lnk/node", "tools/guard.mjs"] }] })}\n`, "bin/node": "base launcher\n" },
          links: { lnk: "bin" },
          line: refused(".stamity/hooks/guard.json", "names lnk/node, which passes through a link (lnk)"),
        },
        {
          layout: "a declared launcher's path holds a .. segment (build/98)",
          files: { ".stamity/hooks/guard.json": `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["bin/../bin/node", "tools/guard.mjs"] }] })}\n`, "bin/node": "base launcher\n" },
          links: {},
          line: refused(".stamity/hooks/guard.json", "names bin/../bin/node, which holds a .. segment"),
        },
        {
          layout: "a declared script's path holds a .. segment (review/186)",
          files: { ".stamity/hooks/guard.json": declaring("tools/../tools/guard.mjs") },
          links: {},
          line: refused(".stamity/hooks/guard.json", "names tools/../tools/guard.mjs, which holds a .. segment"),
        },
        {
          layout: "a declared script's path leaves the repository (review/186)",
          files: { ".stamity/hooks/guard.json": declaring("../guard.mjs") },
          links: {},
          line: refused(".stamity/hooks/guard.json", "names a path outside the repository"),
        },
        {
          layout: "a declared option value's path passes through a link (the option-value question)",
          files: { ".stamity/hooks/guard.json": `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs", "--config=lnk/policy.json"] }] })}\n`, "cfg/policy.json": "base policy\n" },
          links: { lnk: "cfg" },
          line: refused(".stamity/hooks/guard.json", "names lnk/policy.json, which passes through a link (lnk)"),
        },
        {
          // review/198: a drive letter is no URL-like scheme, so a value naming a drive path stays absolute and refuses.
          layout: "a declared option value names a drive path (review/198)",
          files: { ".stamity/hooks/guard.json": `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs", "--out=C:\\tmp\\out.json"] }] })}\n` },
          links: {},
          line: refused(".stamity/hooks/guard.json", "names a path outside the repository"),
        },
        {
          // A hook naming tools/guard.mjs, and another naming a path under it, which leaves no file to stand in its place.
          layout: "a declared script's stand-in cannot land (review/189)",
          files: {
            ".stamity/hooks/guard.json": `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs"] }, { event: "pre_tool_use", command: ["node", "tools/guard.mjs/x.mjs"] }] })}\n`,
          },
          links: {},
          line: refused(".stamity/hooks/guard.json", "names a script the hold could not stand in for"),
        },
      ])("refuses before staging when $layout, naming it, and pushes nothing", async ({ files, links, line }) => {
        const { repo, remote } = await seed("unattended", { files: { ...files, ...GUARD }, links });
        await writeFile(join(repo, "tools/guard.mjs"), "steered guard\n");

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "tools/guard.mjs"]);

        expect(code).toBe(1);
        expect(doc).toMatchObject({ pushed: false, committed: null, held: [], notDone: [line] });
        expect(git(repo, ["diff", "--cached", "--name-only"])).toBe("");
        expect(pushes()).toEqual([]);
        expect(remoteHeads(remote)).toEqual(SEEDED);
      });
    });
  });

  describe("a project below the git top (build/99)", () => {
    const PROJECT = "apps/web";

    it("holds the project's client settings, hook script and generated file and the top's workflow out of an unattended push, and pushes the rest", async () => {
      const { repo, remote, project } = await seed("unattended", { project: PROJECT });
      await put(repo, `${PROJECT}/.claude/settings.json`, '{ "hooks": {} }\n');
      await put(repo, `${PROJECT}/.claude/hooks/x.mjs`, "steered hook\n");
      await put(repo, `${PROJECT}/.stamity/generated/y`, "steered policy\n");
      await put(repo, ".github/workflows/ci.yml", "on: push\n");
      await put(repo, "docs/notes.md", "outside the project\n");
      await put(repo, `${PROJECT}/a.txt`, "the unit's change\n");

      const { code, doc } = await run(project, [
        ...CHECKPOINT,
        "--paths",
        "a.txt",
        ".claude/settings.json",
        ".claude/hooks/x.mjs",
        ".stamity/generated/y",
        "../../.github/workflows/ci.yml",
        "../../docs/notes.md",
      ]);

      const held = [".github/workflows/ci.yml", `${PROJECT}/.claude/hooks/x.mjs`, `${PROJECT}/.claude/settings.json`, `${PROJECT}/.stamity/generated/y`];
      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [] });
      expect(doc["held"]).toEqual(held);
      const tree = pushedTree(remote);
      for (const path of held) expect(tree).not.toContain(path);
      expect(tree).toContain(`${PROJECT}/${PATCH}`);
      expect(pushedFile(remote, "docs/notes.md")).toBe("outside the project");
      expect(pushedFile(remote, `${PROJECT}/a.txt`)).toBe("the unit's change");
      expect(pushedFile(remote, `${PROJECT}/${PATCH}`)).toContain("+steered hook");
    });

    it("holds the script a declaration in the project's hooks folder at Base: names, read from the project root", async () => {
      const declaration = `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs"] }] })}\n`;
      const { repo, remote, project } = await seed("unattended", {
        project: PROJECT,
        files: { [`${PROJECT}/.stamity/hooks/guard.json`]: declaration, [`${PROJECT}/tools/guard.mjs`]: "base guard\n", "tools/guard.mjs": "the top's own file\n" },
      });
      await writeFile(join(repo, PROJECT, "tools/guard.mjs"), "steered guard\n");
      await writeFile(join(repo, "tools/guard.mjs"), "the unit's change\n");

      const { code, doc } = await run(project, [...CHECKPOINT, "--paths", "tools/guard.mjs", "../../tools/guard.mjs"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [`${PROJECT}/tools/guard.mjs`] });
      expect(pushedFile(remote, `${PROJECT}/tools/guard.mjs`)).toBe("base guard");
      expect(pushedFile(remote, "tools/guard.mjs")).toBe("the unit's change");
    });

    it.skipIf(process.platform === "win32")("holds a link the run adds at the project's .claude, and pushes a link elsewhere", async () => {
      const { repo, remote, project } = await seed("unattended", { project: PROJECT });
      await put(repo, `${PROJECT}/cfg/settings.json`, '{ "hooks": {} }\n');
      await symlink("cfg", join(project, ".claude"));
      await symlink("cfg", join(project, "notes"));

      const { code, doc } = await run(project, [...CHECKPOINT, "--paths", "cfg", ".claude", "notes"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [] });
      expect(doc["held"]).toEqual([`${PROJECT}/.claude`]);
      const tree = pushedTree(remote);
      expect(tree).not.toContain(`${PROJECT}/.claude`);
      expect(tree).toEqual(expect.arrayContaining([`${PROJECT}/cfg/settings.json`, `${PROJECT}/notes`]));
    });

    it("refuses the push when a commit it would send changes the project's client settings", async () => {
      const { repo, remote, project } = await seed("unattended", { project: PROJECT });
      await put(repo, `${PROJECT}/.claude/settings.json`, '{ "hooks": {} }\n');
      git(repo, ["add", "--", `${PROJECT}/.claude/settings.json`]);
      git(repo, ["commit", "-q", "-m", "run's own commit"]);
      await put(repo, `${PROJECT}/a.txt`, "changed\n");

      const { code, doc } = await run(project, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({ pushed: false, notDone: [`held path in history (${PROJECT}/.claude/settings.json)`] });
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });
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

  // pr/1 (REQ-FLOW-093): the hooks run inside the commit, after the staged-path check, so the commit's own paths are
  // read after it, and a commit carrying a path outside the list, or a commit a hook made, is undone before any push.
  describe("a commit a hook widened (pr/1)", () => {
    /** Writes `name` into the repository's hooks as an executable shell script. */
    async function hook(repo: string, name: string, body: string): Promise<void> {
      const file = join(repo, ".git", "hooks", name);
      await writeFile(file, `#!/bin/sh\n${body}`);
      await chmod(file, 0o755);
    }

    it.each(["attended", "unattended"] as const)("%s: undoes a commit a pre-commit hook staged a path outside --paths into, the path still staged, pushing nothing", async (mode) => {
      const { repo, remote, base } = await seed(mode);
      await writeFile(join(repo, "a.txt"), "changed\n");
      await writeFile(join(repo, "b.txt"), "a hook's change\n");
      await hook(repo, "pre-commit", "git add -- b.txt\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({ committed: null, pushed: false, held: [], notDone: ["commit refused: b.txt was staged by a hook and is not in --paths (commit undone)"] });
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
      expect(git(repo, ["diff", "--cached", "--name-only"]).split("\n")).toEqual([`${RUN_DIR}/record.md`, "a.txt", "b.txt"]);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    it("undoes a commit a pre-commit hook made of its own, which the verb's commit then failed on, pushing nothing", async () => {
      const { repo, remote, base } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await writeFile(join(repo, "b.txt"), "a hook's change\n");
      await hook(repo, "pre-commit", "git commit -q --no-verify -m 'a hook commit' -- b.txt\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({ committed: null, pushed: false });
      expect(doc["notDone"]).toEqual(
        expect.arrayContaining([
          "commit refused: a hook made a commit of its own (commit undone)",
          "commit refused: b.txt was staged by a hook and is not in --paths (commit undone)",
        ]),
      );
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    it("undoes a commit a post-commit hook stacked on the verb's own, though it changes only a listed path", async () => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      // The guard keeps the hook's own commit from starting the hook again.
      await hook(repo, "post-commit", '[ -n "$INNER" ] && exit 0\necho more >> a.txt\nINNER=1 git commit -q -m \'a hook commit\' -- a.txt\n');

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({ committed: null, pushed: false, notDone: ["commit refused: a hook made a commit of its own (commit undone)"] });
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    it("names the undone commit and each path in the human report", async () => {
      const { repo, base } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await writeFile(join(repo, "b.txt"), "a hook's change\n");
      await hook(repo, "pre-commit", "git add -- b.txt\n");

      const { code, stdout } = await run(repo, ["checkpoint", "--run", RUN, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(stdout).toContain("\ncommit: undone (a hook staged paths outside the list)\n");
      expect(stdout).toContain("  - commit refused: b.txt was staged by a hook and is not in --paths (commit undone)");
      expect(stdout).not.toContain("push:");
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
    });

    /** The checkpoint marker, under the work tree's own git directory (review/142, review/143). */
    const markerAt = (repo: string): string => join(git(repo, ["rev-parse", "--absolute-git-dir"]), "stamity", "checkpoint-pending");
    /** The line naming the marker a call leaves where its commit was not checked or not undone. */
    const markerLeft = (repo: string, before: string): string =>
      `checkpoint marker left: ${markerAt(repo)} records ${before}, so every later checkpoint and end refuses until a person resolves it`;
    /** The refusal every later call gives while the marker is there, naming what it records and what HEAD holds. */
    const markerRefusal = (repo: string, before: string): string =>
      `commit and push refused: ${markerAt(repo)} records ${before}, left by a checkpoint whose commit was not checked or not undone, ` +
      `and HEAD holds ${git(repo, ["rev-parse", "HEAD"])}; a person reviews the commits after ${before}, resets the branch to it ` +
      `if one carries a path outside --paths, then removes ${markerAt(repo)}`;

    // TEST CHANGE, justified (review/136, review/138, then review/142 and review/143's redesign): the undo is a
    // compare-and-swap on the run branch by name, so git's refusal reads `git update-ref`, the line names the commit left
    // and the reset target, and a second line names the checkpoint marker the call leaves; the later calls, with and
    // without a change of their own, are refused by that marker, and push nothing until a person resolves it.
    it("says the commit was not undone, naming it, the reset target and the marker, and no later call pushes it (review/136, review/139)", async () => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await writeFile(join(repo, "b.txt"), "a hook's change\n");
      await hook(repo, "pre-commit", "git add -- b.txt\n");
      // The branch's ref lock, taken once the commit has moved the branch, makes the undo's ref update fail.
      const lock = join(repo, ".git", "refs", "heads", `${RUN_BRANCH}.lock`);
      await hook(repo, "post-commit", `: > "$(git rev-parse --git-dir)/refs/heads/${RUN_BRANCH}.lock"\n`);

      const first = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      const left = git(repo, ["rev-parse", "HEAD"]);
      expect(first.code).toBe(1);
      expect(first.doc["pushed"]).toBe(false);
      const notDone = first.doc["notDone"] as string[];
      expect(notDone).toContain("commit refused: b.txt was staged by a hook and is not in --paths");
      expect(notDone.at(-2)).toMatch(new RegExp(`^commit not undone: git update-ref answered \\d+: .*; HEAD holds ${left}, reset target ${base}$`));
      expect(notDone.at(-1)).toBe(markerLeft(repo, base));
      expect(first.doc["committed"]).toBe(left);
      expect(git(repo, ["rev-parse", "HEAD^"])).toBe(base);
      expect(readFileSync(markerAt(repo), "utf8")).toBe(`${base}\n`);

      // The lock and the hooks gone, two later calls, with and without a change of their own, still push nothing.
      await rm(lock);
      await rm(join(repo, ".git", "hooks", "pre-commit"));
      await rm(join(repo, ".git", "hooks", "post-commit"));
      const second = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);
      await writeFile(join(repo, "a.txt"), "changed again\n");
      const third = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(second.code).toBe(1);
      expect(second.doc).toMatchObject({ committed: null, pushed: false, notDone: [markerRefusal(repo, base)] });
      expect(third.code).toBe(1);
      expect(third.doc).toMatchObject({ committed: null, pushed: false, notDone: [markerRefusal(repo, base)] });
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(left);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);

      // A person resets the branch to the recorded commit and removes the marker; the next call pushes the unit alone.
      git(repo, ["reset", "-q", base]);
      await rm(markerAt(repo));
      const fourth = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(fourth.code).toBe(0);
      expect(fourth.doc).toMatchObject({ pushed: true, notDone: [] });
      expect(pushedFile(remote, "a.txt")).toBe("changed again");
      expect(pushedFile(remote, "b.txt")).toBe("b.txt");
    });

    it("names the commit left and the reset target in the human report when the undo fails", async () => {
      const { repo, base } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await writeFile(join(repo, "b.txt"), "a hook's change\n");
      await hook(repo, "pre-commit", "git add -- b.txt\n");
      await hook(repo, "post-commit", `: > "$(git rev-parse --git-dir)/refs/heads/${RUN_BRANCH}.lock"\n`);

      const { code, stdout } = await run(repo, ["checkpoint", "--run", RUN, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(stdout).toContain(`\ncommit: ${git(repo, ["rev-parse", "HEAD"])} (not undone; reset target ${base})\n`);
      expect(stdout).toContain(`  - ${markerLeft(repo, base)}`);
      expect(stdout).not.toContain("push:");
    });

    // review/136: a call the write runner's wall time stops rejects, which the verb's git helper throws; the commit,
    // the path read and the undo each fail closed, naming HEAD's commit, the reset target and the marker left, and the
    // next call is refused by that marker.
    it.each([
      ["commit", (args: readonly string[]) => args[0] === "commit"],
      ["diff", (args: readonly string[]) => args[0] === "diff" && args.includes("--name-only") && !args.includes("--cached")],
      ["update-ref", (args: readonly string[]) => args[0] === "update-ref" && (args[1] ?? "").startsWith("refs/heads/")],
    ] as const)("fails closed when git %s does not finish after the commit, and the next call pushes nothing (review/136)", async (step, matches) => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await writeFile(join(repo, "b.txt"), "a hook's change\n");
      await hook(repo, "pre-commit", "git add -- b.txt\n");
      // The commit itself lands before its call is stopped, as a post-commit hook past the wall time leaves it.
      writes.override = (args, real) => (matches(args) ? (step === "commit" ? real() : Promise.resolve()).then(() => Promise.reject(new Error("killed by the wall time"))) : undefined);

      const first = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      const left = git(repo, ["rev-parse", "HEAD"]);
      expect(left).not.toBe(base);
      expect(first.code).toBe(1);
      expect(first.doc).toMatchObject({ committed: null, pushed: false });
      expect((first.doc["notDone"] as string[]).slice(-2)).toEqual([
        `commit not checked: run checkpoint could not run git ${step} (killed by the wall time); HEAD holds ${left}, reset target ${base}`,
        markerLeft(repo, base),
      ]);

      writes.override = null;
      await rm(join(repo, ".git", "hooks", "pre-commit"));
      const second = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(second.code).toBe(1);
      expect(second.doc).toMatchObject({ committed: null, pushed: false, notDone: [markerRefusal(repo, base)] });
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    // review/137: the commit's paths unread is a refusal and an undo, never a pass.
    it("undoes the commit and pushes nothing when its path list cannot be read (review/137)", async () => {
      const { repo, remote, base } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      writes.override = (args) =>
        args[0] === "diff" && args.includes("--name-only") && !args.includes("--cached") ? Promise.resolve({ code: 128, stdout: "", stderr: "fatal: bad object\n" }) : undefined;

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({ committed: null, pushed: false, notDone: ["commit refused: git diff answered 128: fatal: bad object (commit undone)"] });
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
      // review/142: an undo that succeeds removes the marker.
      expect(existsSync(markerAt(repo))).toBe(false);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    // review/138: a post-commit hook that switches branches leaves HEAD on another branch; the undo never rewinds it,
    // and the marker stays (review/142's redesign).
    it("refuses without rewinding either branch when a hook moved HEAD off the run branch (review/138)", async () => {
      const { repo, remote, base } = await seed("attended");
      git(repo, ["switch", "-q", "-c", "other"]);
      await writeFile(join(repo, "c.txt"), "another branch's file\n");
      git(repo, ["add", "--", "c.txt"]);
      git(repo, ["commit", "-q", "-m", "other's work"]);
      const other = git(repo, ["rev-parse", "HEAD"]);
      git(repo, ["switch", "-q", RUN_BRANCH]);
      await writeFile(join(repo, "a.txt"), "changed\n");
      await hook(repo, "post-commit", "git checkout -q other\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      const verbCommit = git(repo, ["rev-parse", RUN_BRANCH]);
      expect(code).toBe(1);
      expect(doc["pushed"]).toBe(false);
      expect((doc["notDone"] as string[]).slice(-2)).toEqual([
        `commit not undone: HEAD has left ${RUN_BRANCH} (at ${verbCommit}) for other, so neither branch was rewound; HEAD holds ${other}, reset target ${base}`,
        markerLeft(repo, base),
      ]);
      expect(git(repo, ["rev-parse", "other"])).toBe(other);
      expect(git(repo, ["rev-parse", `${RUN_BRANCH}^`])).toBe(base);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    // review/142: the marker goes once the commit reads clean, before the scan and the push, so a call that stops there
    // holds no later call, which names only its own unit's paths and pushes both commits.
    it("leaves no marker once its commit reads clean, so a stop before the push holds no later call (review/142)", async () => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      // Mock reason: the secret scan's own git reads (its 60 s wall time, its output cap) run outside this spy, so the
      // held-tree read, which sits between the commit's check and the push as the scan does, stands in for a read
      // that does not finish there.
      writes.override = (args) => (args[0] === "diff" && args.includes("--raw") && args.at(-2) === "HEAD" ? Promise.reject(new Error("killed by the wall time")) : undefined);
      const first = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);
      writes.override = null;

      const committed = git(repo, ["rev-parse", "HEAD"]);
      expect(first.code).toBe(1);
      expect(git(repo, ["rev-parse", "HEAD^"])).toBe(base);
      expect(existsSync(markerAt(repo))).toBe(false);
      expect(pushes()).toEqual([]);

      await writeFile(join(repo, "c.txt"), "the next unit\n");
      const second = await run(repo, [...CHECKPOINT, "--paths", "c.txt"]);

      expect(second.code).toBe(0);
      expect(second.doc).toMatchObject({ pushed: true, notDone: [] });
      expect(git(repo, ["rev-parse", "HEAD^"])).toBe(committed);
      expect(pushedFile(remote, "a.txt")).toBe("changed");
      expect(pushedFile(remote, "c.txt")).toBe("the next unit");
    });

    // review/142, review/143: a marker that cannot be created refuses the commit, so no commit goes unguarded.
    it("refuses the commit, committing and pushing nothing, when the marker cannot be created", async () => {
      const { repo, remote, base } = await seed("attended");
      // A file where the marker's folder goes makes its creation fail.
      await writeFile(join(repo, ".git", "stamity"), "");
      await writeFile(join(repo, "a.txt"), "changed\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({ committed: null, pushed: false });
      const notDone = doc["notDone"] as string[];
      expect(notDone).toHaveLength(1);
      expect(notDone[0]?.startsWith(`commit refused: the checkpoint marker ${markerAt(repo)} could not be created (`)).toBe(true);
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    // review/143: the marker is the work tree's, not the run's, so a later run on the branch (a chain's next file)
    // whose Base: is a HEAD already holding the commit an earlier run could not undo is refused, and pushes nothing.
    it("refuses a later run on the branch whose Base: sits above a commit an earlier run could not undo (review/143)", async () => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await writeFile(join(repo, "b.txt"), "a hook's change\n");
      await hook(repo, "pre-commit", "git add -- b.txt\n");
      await hook(repo, "post-commit", `: > "$(git rev-parse --git-dir)/refs/heads/${RUN_BRANCH}.lock"\n`);
      const first = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);
      expect(first.code).toBe(1);
      await rm(join(repo, ".git", "refs", "heads", `${RUN_BRANCH}.lock`));
      await rm(join(repo, ".git", "hooks", "pre-commit"));
      await rm(join(repo, ".git", "hooks", "post-commit"));

      // The chain's next file: a run of its own on the same branch, its Base: the HEAD the widened commit is.
      const widened = git(repo, ["rev-parse", "HEAD"]);
      const next = "2026-10-16_overnight-2";
      await put(repo, `.stamity/runs/${next}/origin.json`, PIN_TEXT);
      await put(repo, `.stamity/runs/${next}/record.md`, `# Run ${next}\n\nStatus: in progress\nMode: unattended\nBranch: ${RUN_BRANCH}\nBase: ${widened}\n`);
      await writeFile(join(repo, "c.txt"), "the next file's unit\n");

      const { code, doc } = await run(repo, ["checkpoint", "--run", next, "--json", "--paths", "c.txt"]);

      expect(code).toBe(1);
      expect(doc).toMatchObject({ base: widened, committed: null, pushed: false, notDone: [markerRefusal(repo, base)] });
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(widened);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    /** The bytes of the index, the held patch and every work tree file a case changes, read before and after a call. */
    const snapshot = (repo: string): Record<string, string> =>
      Object.fromEntries(
        [".git/index", PATCH, "a.txt", "b.txt", ".cursorrules", `${RUN_DIR}/record.md`].map((path) => [path, readFileSync(join(repo, path)).toString("base64")]),
      );

    // pr/4 (signed off): an earlier checkpoint's marker is read as soon as the top level is resolved, so a call refuses
    // before any `git add`, held-patch write or index restore, and leaves the uncertain commit's state as it found it.
    it.each(process.platform === "win32" ? (["file", "folder"] as const) : (["file", "link", "folder"] as const))(
      "refuses before any staging, held-patch or index write while a marker (a %s) is there, the index, the patch and the work tree byte-identical (pr/4)",
      async (kind) => {
        const { repo, remote, base } = await seed("unattended");
        // The state an uncertain earlier commit leaves: a staged change, a held patch, a held change and an unstaged one.
        await writeFile(join(repo, "a.txt"), "staged by the earlier call\n");
        git(repo, ["add", "--", "a.txt"]);
        await put(repo, PATCH, "the earlier call's patch\n");
        await writeFile(join(repo, ".cursorrules"), "steered rules\n");
        await writeFile(join(repo, "b.txt"), "changed\n");
        const marker = markerAt(repo);
        await mkdir(dirname(marker), { recursive: true });
        if (kind === "file") await writeFile(marker, `${base}\n`);
        else if (kind === "link") await symlink("nowhere", marker);
        else await mkdir(marker);
        const before = snapshot(repo);

        const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "b.txt"]);

        expect(code).toBe(1);
        expect(doc).toMatchObject({ committed: null, pushed: false, held: [], notDone: [markerRefusal(repo, kind === "file" ? base : "an unread commit")] });
        expect(snapshot(repo)).toEqual(before);
        expect(writes.argv.filter((argv) => ["add", "restore", "rm", "diff", "commit", "push"].includes(argv[0] ?? ""))).toEqual([]);
        expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
        expect(remoteHeads(remote)).toEqual(SEEDED);
      },
    );

    /**
     * A pre- or post-commit hook that outlasts a small wall time: it lets go of git's output at once, so the call ends
     * when git does, then waits (30 s at most) for the case's release file, and once that is there it returns at once.
     */
    const WAITING_HOOK =
      '[ -e .git/stamity-release ] && exit 0\nexec >/dev/null 2>&1\ni=0\nwhile [ ! -e .git/stamity-release ] && [ "$i" -lt 300 ]; do sleep 0.1; i=$((i+1)); done\n';
    /** The wall time a case gives the verb's commit alone, through the spy's real call. */
    const SMALL_WALL_TIME = (args: readonly string[], real: (extra?: GitWriteModule.GitWriteOptions) => Promise<GitWriteModule.GitWriteResult>) =>
      args[0] === "commit" ? real({ timeoutMs: 500 }) : undefined;

    // review/148, review/179 (signed off): a commit the runner's wall time stopped, its whole process group (git and the
    // waiting hook) gone, no index lock left and HEAD still at the commit read before it on the run branch, made no
    // commit, so the marker goes and the next call commits. Skipped on Windows, where the runner starts no group and the
    // verb leaves the marker; the injected-stop case below pins both branches on every leg (review/176).
    it.skipIf(process.platform === "win32")("clears the marker when a pre-commit hook outlasts the wall time and HEAD still names the commit before, so the next call commits (review/148)", async () => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await hook(repo, "pre-commit", WAITING_HOOK);
      writes.override = SMALL_WALL_TIME;

      const first = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);
      await writeFile(join(repo, ".git", "stamity-release"), "");
      writes.override = null;

      expect(first.code).toBe(1);
      expect(first.doc).toMatchObject({ committed: null, pushed: false });
      const notDone = first.doc["notDone"] as string[];
      expect(notDone).toHaveLength(1);
      expect(notDone[0]).toMatch(/^commit not made: run checkpoint could not run git commit \(.+\)$/);
      expect(existsSync(markerAt(repo))).toBe(false);
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);

      const second = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(second.code).toBe(0);
      expect(second.doc).toMatchObject({ pushed: true, notDone: [] });
      expect(git(repo, ["rev-parse", "HEAD^"])).toBe(base);
      expect(pushedFile(remote, "a.txt")).toBe("changed");
    });

    it.skipIf(process.platform === "win32")("names the commit not made in the human report", async () => {
      const { repo, base } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await hook(repo, "pre-commit", WAITING_HOOK);
      writes.override = SMALL_WALL_TIME;

      const { code, stdout } = await run(repo, ["checkpoint", "--run", RUN, "--paths", "a.txt"]);
      await writeFile(join(repo, ".git", "stamity-release"), "");

      expect(code).toBe(1);
      expect(stdout).toContain(`\ncommit: not made (HEAD still ${base})\n`);
      expect(stdout).toContain("  - commit not made: run checkpoint could not run git commit (");
      expect(stdout).not.toContain("checkpoint marker left");
    });

    /** review/206: the wall time the landed-commit case gives the commit, long enough that only its held hook reaches it. */
    const LANDED_WALL_MS = 5_000;

    // review/148: a commit that lands and is then stopped (a post-commit hook past the wall time) moved HEAD, so the
    // marker stays, as before. Skipped on Windows for the waiting hook's sake; the marker stays there in every case.
    // TEST CHANGE, justified (review/206): under a 500 ms wall a starved runner could stop git before the commit
    // landed, so HEAD never moved and the case went red for timing alone. The post-commit hook now marks that it ran
    // (the commit has landed by then) before it holds until the case releases it, the wall is long enough that only
    // that held hook reaches it, and the case first checks the hook ran, so the stop it reads always came after the
    // commit landed; every assertion below keeps its meaning.
    it.skipIf(process.platform === "win32")("leaves the marker when the commit lands and its call is then stopped by the wall time (review/148)", async () => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await hook(repo, "post-commit", `: > .git/stamity-landed\n${WAITING_HOOK}`);
      writes.override = (args, real) => (args[0] === "commit" ? real({ timeoutMs: LANDED_WALL_MS }) : undefined);

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);
      await writeFile(join(repo, ".git", "stamity-release"), "");

      expect(existsSync(join(repo, ".git", "stamity-landed"))).toBe(true);
      const left = git(repo, ["rev-parse", "HEAD"]);
      expect(code).toBe(1);
      expect(left).not.toBe(base);
      expect(git(repo, ["rev-parse", "HEAD^"])).toBe(base);
      const notDone = doc["notDone"] as string[];
      expect(notDone.at(-2)).toMatch(new RegExp(`^commit not checked: run checkpoint could not run git commit \\(.+\\); HEAD holds ${left}, reset target ${base}$`));
      expect(notDone.at(-1)).toBe(markerLeft(repo, base));
      expect(readFileSync(markerAt(repo), "utf8")).toBe(`${base}\n`);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
      // The case always waits out its wall time, so it gets room beyond the 20 s default on a starved runner.
    }, 60_000);

    /** review/179: the runner's answer once the commit's process group was stopped, gone or not, in place of git's. */
    const GROUP_STOP = "git did not finish within 500 ms; its process group was stopped";
    const groupStop = (gone: boolean): Promise<GitWriteModule.GitWriteResult> => Promise.reject(new GitWriteGroupStopped(GROUP_STOP, gone));

    // review/176, review/179 (signed off): on every leg, a commit whose whole process group the runner stopped and saw
    // gone, with HEAD still at the commit before, clears the marker on POSIX; on Windows, where the runner starts no
    // group and the program it stops may be a launcher, the marker stays. The commit's call alone asks for the group.
    it("answers a commit whose whole process group was stopped and is gone: not made and no marker on POSIX, not checked and the marker on Windows (review/176, review/179)", async () => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      writes.override = (args) => (args[0] === "commit" ? groupStop(true) : undefined);

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      const why = `run checkpoint could not run git commit (${GROUP_STOP})`;
      expect(code).toBe(1);
      expect(doc).toMatchObject({ committed: null, pushed: false });
      if (process.platform === "win32") {
        expect(doc["notDone"]).toEqual([`commit not checked: ${why}; HEAD holds ${base}, reset target ${base}`, markerLeft(repo, base)]);
        expect(readFileSync(markerAt(repo), "utf8")).toBe(`${base}\n`);
      } else {
        expect(doc["notDone"]).toEqual([`commit not made: ${why}`]);
        expect(existsSync(markerAt(repo))).toBe(false);
      }
      expect(writes.groups.filter((group, index) => group !== (writes.argv[index]?.[0] === "commit"))).toEqual([]);
      expect(writes.groups.filter(Boolean)).toHaveLength(1);
      expect(git(repo, ["rev-parse", "HEAD"])).toBe(base);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    // review/178, review/180 (signed off): an index lock still there after the group is gone, or a stop the runner made
    // for an output past its bound (never read as gone), keeps the marker on every leg.
    it.each([
      ["an index lock is left", true, true],
      ["the output passed the runner's bound", false, false],
    ] as const)("leaves the marker when the commit's group was stopped and %s (review/178, review/180)", async (_case, gone, lock) => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      const indexLock = join(repo, ".git", "index.lock");
      writes.override = (args) => (args[0] === "commit" ? (lock ? writeFile(indexLock, "") : Promise.resolve()).then(() => groupStop(gone)) : undefined);

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);
      await rm(indexLock, { force: true });

      expect(code).toBe(1);
      expect(doc).toMatchObject({ committed: null, pushed: false });
      expect(doc["notDone"]).toEqual([
        `commit not checked: run checkpoint could not run git commit (${GROUP_STOP}); HEAD holds ${base}, reset target ${base}`,
        markerLeft(repo, base),
      ]);
      expect(readFileSync(markerAt(repo), "utf8")).toBe(`${base}\n`);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    it("commits and pushes as before where the pre-commit hook stages nothing outside the list", async () => {
      const { repo, remote } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      await hook(repo, "pre-commit", "git add -- a.txt\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [] });
      expect(doc["committed"]).toBe(git(repo, ["rev-parse", "HEAD"]));
      expect(pushedTree(remote)).toContain("a.txt");
    });
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

  // pr/79: a run-owned file the branch holds and the work tree no longer does is staged as its deletion, as a missing
  // --paths entry the index tracks is, so the pushed branch stops carrying the stale file.
  describe("a deleted run-owned file (pr/79)", () => {
    const LEDGER = `${RUN_DIR}/ledger.jsonl`;
    const PLAN = `${RUN_DIR}/plan.md`;

    /** An unattended seed whose run branch has committed the record, the ledger and the plan. */
    async function seedRunFiles(): Promise<Seeded> {
      const seeded = await seed("unattended");
      await put(seeded.repo, LEDGER, '{"event":"start"}\n');
      await put(seeded.repo, PLAN, "# Plan\n");
      git(seeded.repo, ["add", "--", RUN_DIR]);
      git(seeded.repo, ["commit", "-q", "-m", "run files"]);
      await writeFile(join(seeded.repo, PLAN), "# Plan\n\nThe next unit.\n");
      return seeded;
    }

    const committedChanges = (repo: string): string[] =>
      git(repo, ["show", "--name-status", "--format=", "--no-renames", "HEAD"]).split("\n").filter((row) => row !== "");

    it("commits the deletion of a ledger removed from the work tree, and the pushed branch no longer has it", async () => {
      const { repo, remote } = await seedRunFiles();
      await rm(join(repo, LEDGER));

      const { code, doc } = await run(repo, CHECKPOINT);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [] });
      expect(committedChanges(repo)).toEqual(expect.arrayContaining([`D\t${LEDGER}`, `M\t${PLAN}`]));
      expect(pushedTree(remote)).not.toContain(LEDGER);
      expect(pushedFile(remote, PLAN)).toContain("The next unit.");
    });

    it("commits a ledger deletion staged beforehand with git rm, rather than refusing it as staged outside --paths", async () => {
      const { repo, remote } = await seedRunFiles();
      git(repo, ["rm", "-q", "--", LEDGER]);

      const { code, doc } = await run(repo, CHECKPOINT);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [] });
      expect(committedChanges(repo)).toEqual(expect.arrayContaining([`D\t${LEDGER}`, `M\t${PLAN}`]));
      expect(pushedTree(remote)).not.toContain(LEDGER);
    });
  });

  // review/84: a --paths entry whose deletion is already staged (git rm) is neither in the work tree nor in the index,
  // so it was dropped as "no such file" and then refused as staged outside --paths; it is now committed as staged.
  describe("a --paths entry whose deletion is already staged (review/84)", () => {
    const committedChanges = (repo: string): string[] =>
      git(repo, ["show", "--name-status", "--format=", "--no-renames", "HEAD"]).split("\n").filter((row) => row !== "");

    it("commits and pushes a file's and a folder's deletion staged beforehand with git rm", async () => {
      const { repo, remote } = await seed("attended");
      await put(repo, "docs/x.md", "x\n");
      git(repo, ["add", "--", "docs/x.md"]);
      git(repo, ["commit", "-q", "-m", "docs"]);
      git(repo, ["rm", "-q", "--", "b.txt"]);
      git(repo, ["rm", "-q", "-r", "--", "docs"]);

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "b.txt", "docs"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [] });
      expect(committedChanges(repo)).toEqual(expect.arrayContaining(["D\tb.txt", "D\tdocs/x.md"]));
      expect(pushedTree(remote)).not.toContain("b.txt");
      expect(pushedTree(remote)).not.toContain("docs/x.md");
    });

    it("commits the staged deletion of a file tracked under an ignore rule, never naming it as an ignored record", async () => {
      const { repo, remote } = await seed("attended");
      await put(repo, ".gitignore", "*.log\n");
      await put(repo, "kept.log", "kept\n");
      git(repo, ["add", "-f", "--", ".gitignore", "kept.log"]);
      git(repo, ["commit", "-q", "-m", "a tracked log"]);
      git(repo, ["rm", "-q", "--", "kept.log"]);

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "kept.log"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [] });
      expect(committedChanges(repo)).toEqual(expect.arrayContaining(["D\tkept.log"]));
      expect(pushedTree(remote)).not.toContain("kept.log");
    });

    it("keeps today's reading of a deletion not yet staged, and of a path no layer holds", async () => {
      const { repo, remote } = await seed("attended");
      await rm(join(repo, "b.txt"));

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "b.txt", "nowhere.txt"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: ["not staged: nowhere.txt (no such file)"] });
      expect(committedChanges(repo)).toEqual(expect.arrayContaining(["D\tb.txt"]));
      expect(pushedTree(remote)).not.toContain("b.txt");
    });

    it("still holds a held path whose deletion is staged, the pushed branch keeping Base:'s copy", async () => {
      const { repo, remote, base } = await seed("unattended");
      git(repo, ["rm", "-q", "--", ".cursorrules"]);

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", ".cursorrules"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules"] });
      expect(pushedFile(remote, ".cursorrules")).toBe(git(repo, ["show", `${base}:.cursorrules`]));
      expect(await readFile(join(repo, PATCH), "utf8")).toContain("diff --git a/.cursorrules b/.cursorrules\ndeleted file mode");
    });
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

  describe("the record's blast radius in the body (u9, REQ-FLOW-127)", () => {
    const SECTION = ["## Blast radius", "", "- moderate — the body's two callers", "- rests on: the cut keeps the marker last — run"];

    it("posts an attended run's one-liner, the record's section, then the marker", async () => {
      const { repo } = await seed("attended");
      await appendFile(join(repo, RUN_DIR, "record.md"), ["", "## Decisions trace", "", "- a choice", "", ...SECTION, "", "## Later", "", "- not in it", ""].join("\n"));
      await writeFile(join(repo, "a.txt"), "changed\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "--pr", "--title", "feat: the change"]);

      expect(code).toBe(0);
      expect(doc["notDone"]).toEqual([]);
      expect(created().body).toBe(`Run \`${RUN}\`, attended. Its record: \`${RUN_DIR}/record.md\`.\n\n${SECTION.join("\n")}\n\n${MARKER}`);
    });

    it("posts an unattended run's morning list, then the section, then the marker", async () => {
      const { repo } = await seed("unattended");
      await appendFile(join(repo, RUN_DIR, "record.md"), ["", ...SECTION, ""].join("\n"));
      const question = JSON.stringify({ id: "Q1", kind: "decision", question: "Merge the delta?", options: ["yes", "no"], default: 2, source: "record" });
      await put(
        repo,
        `${RUN_DIR}/morning.md`,
        [`# Morning list — ${RUN}`, "", "## For you to check", "", "none", "", "## Decisions", "", "- the delta", "", "## Prerequisites", "", "none", "",
          "## Person's calls held", "", "none", "", "## Not done:", "", "none", "", "## How to answer", "", "Answer `Q1→1`.", "",
          "```stamity-morning", question, "```", ""].join("\n"),
      );
      await writeFile(join(repo, "a.txt"), "changed\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "--pr", "--title", "feat: x"]);

      expect(code).toBe(0);
      expect(doc["notDone"]).toEqual([]);
      const lines = created().body.split("\n");
      expect(lines[0]).toBe(`# Morning list — ${RUN}`);
      const at = lines.indexOf("## Blast radius");
      expect(at).toBeGreaterThan(lines.indexOf("## How to answer"));
      expect(lines.slice(at)).toEqual([...SECTION, "", MARKER]);
    });

    it("cuts a 70,000-character section to fit an attended body, the marker last", async () => {
      const { repo } = await seed("attended");
      const rows = Array.from({ length: 1_400 }, (_, at) => `- reach row ${at} ${"r".repeat(40)}`);
      await appendFile(join(repo, RUN_DIR, "record.md"), ["", "## Blast radius", "", ...rows, ""].join("\n"));
      await writeFile(join(repo, "a.txt"), "changed\n");

      const { code } = await run(repo, [...CHECKPOINT, "--paths", "a.txt", "--pr", "--title", "feat: the change"]);

      expect(code).toBe(0);
      const { body } = created();
      expect(body.length).toBeLessThanOrEqual(60_000);
      expect(body).toContain("- reach row 0 ");
      expect(body).not.toContain("- reach row 1399 ");
      expect(body.split("\n").at(-1)).toBe(MARKER);
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

  // TEST CHANGE, justified (review/6, signed off by the orchestrator): a held patch a commit carries is kept and listed
  // until a checkpoint writes a new one, never removed because the work tree holds no held change, so build/96's
  // removal of a committed patch whose change the work tree reverted now keeps it; one no commit carries still goes (below).
  it("keeps and lists a committed held patch whose change the work tree no longer holds (build/96, review/6)", async () => {
    const { repo, remote } = await seed("unattended");
    await writeFile(join(repo, ".cursorrules"), "steered rules\n");
    expect((await run(repo, CHECKPOINT)).code).toBe(0);
    expect(pushedTree(remote)).toContain(PATCH);
    const committed = pushedFile(remote, PATCH);
    // The change is reverted: the index already holds Base:'s copy, so restoring from it brings the file back.
    git(repo, ["restore", "--", ".cursorrules"]);

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ held: [".cursorrules"], notDone: [] });
    expect(pushedTree(remote)).toContain(PATCH);
    expect(pushedFile(remote, PATCH)).toBe(committed);
    expect(isFile(join(repo, PATCH))).toBe(true);
    expect(git(repo, ["status", "--porcelain", "--", RUN_DIR])).toBe("");
  });

  // build/96: a patch no commit carries (a checkpoint that wrote it and then failed) names a change the run no longer
  // makes, so it leaves the folder.
  it("removes a held patch no commit carries where no held change is left (build/96)", async () => {
    const { repo, remote } = await seed("unattended");
    await put(repo, PATCH, "diff --git a/.cursorrules b/.cursorrules\n");

    const { code, doc } = await run(repo, CHECKPOINT);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ held: [], notDone: [] });
    expect(isFile(join(repo, PATCH))).toBe(false);
    expect(pushedTree(remote)).not.toContain(PATCH);
  });

  // review/6 (signed off): a run continued on a fresh clone (REQ-FLOW-105) holds Base:'s bytes at every held path, its
  // person-only change living in the patch the branch carries alone; that patch stays on the branch and is listed.
  it("keeps and lists the branch's held patch where a fresh clone continues the run with no held change (review/6)", async () => {
    const { repo, remote } = await seed("unattended");
    await writeFile(join(repo, ".cursorrules"), "steered rules\n");
    expect((await run(repo, CHECKPOINT)).code).toBe(0);
    const committed = pushedFile(remote, PATCH);
    // The machine that ran it is gone; a clone beside it (so the push still maps to the case's remote) continues the run.
    const clone = join(dirname(repo), "clone");
    git(dirname(repo), ["clone", "-q", "--branch", RUN_BRANCH, remote, clone]);
    await appendFile(join(clone, ".git", "config"), NO_AUTO_MAINTENANCE);
    git(clone, ["config", "user.name", "Alice Example"]);
    git(clone, ["config", "user.email", "alice@example.com"]);
    git(clone, ["remote", "set-url", "origin", "https://github.com/o/r.git"]);
    expect(await readFile(join(clone, ".cursorrules"), "utf8")).toBe(".cursorrules\n");
    await writeFile(join(clone, "a.txt"), "the next unit's change\n");

    const { code, doc } = await run(clone, [...CHECKPOINT, "--paths", "a.txt"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules"] });
    expect(pushedFile(remote, "a.txt")).toBe("the next unit's change");
    expect(pushedFile(remote, PATCH)).toBe(committed);
    expect(isFile(join(clone, PATCH))).toBe(true);

    const again = await run(clone, ["checkpoint", "--run", RUN]);

    expect(again.code).toBe(0);
    expect(again.stdout).toContain(`held (kept in ${PATCH} from an earlier checkpoint; the work tree holds no held change): .cursorrules`);
    expect(pushedFile(remote, PATCH)).toBe(committed);
  });

  describe("a fresh clone that holds a new change keeps the branch's earlier sections (n14 P3, REQ-FLOW-105)", () => {
    /** A clone of the run's branch beside the repository, so its push still maps to the case's remote, as review/6's case makes it. */
    async function cloneRun(repo: string, remote: string): Promise<string> {
      const clone = join(dirname(repo), "clone");
      git(dirname(repo), ["clone", "-q", "--branch", RUN_BRANCH, remote, clone]);
      await appendFile(join(clone, ".git", "config"), NO_AUTO_MAINTENANCE);
      git(clone, ["config", "user.name", "Alice Example"]);
      git(clone, ["config", "user.email", "alice@example.com"]);
      git(clone, ["remote", "set-url", "origin", "https://github.com/o/r.git"]);
      return clone;
    }

    /** The patch's sections, split at line-start `diff --git ` headers, as bytes. */
    const sections = (patch: Buffer): Buffer[] => {
      const text = patch.toString("latin1");
      const starts = [...text.matchAll(/^diff --git /gm)].map((match) => match.index);
      return starts.map((start, index) => patch.subarray(start, starts[index + 1] ?? patch.length));
    };
    const pushedBytes = (remote: string): Buffer =>
      execFileSync("git", ["show", `refs/heads/${RUN_BRANCH}:${PATCH}`], { cwd: remote, stdio: ["ignore", "pipe", "pipe"] });

    /** Applies `patch` to a checkout of `base`, after a `git apply --check` there, and returns that checkout. */
    function applyOnBase(repo: string, base: string, patch: string): string {
      const fresh = getRoot().path(`base-${Math.random().toString(36).slice(2, 8)}`);
      git(repo, ["worktree", "add", "-q", "--detach", fresh, base]);
      git(fresh, ["apply", "--check", patch]);
      git(fresh, ["apply", patch]);
      return fresh;
    }

    it("pushes a patch carrying the earlier section and the new one, in that order, held listing both, that applies on Base:", async () => {
      const { repo, remote, base } = await seed("unattended");
      await writeFile(join(repo, ".cursorrules"), "steered rules\n");
      expect((await run(repo, CHECKPOINT)).code).toBe(0);
      const [earlier] = sections(pushedBytes(remote));
      const clone = await cloneRun(repo, remote);
      await put(clone, ".github/workflows/x.yml", "on: push\n");

      const { code, doc } = await run(clone, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules", ".github/workflows/x.yml"] });
      const pushed = pushedBytes(remote);
      expect((await readFile(join(clone, PATCH))).equals(pushed)).toBe(true);
      const parts = sections(pushed);
      expect(parts.map((part) => part.toString("utf8").split("\n")[0])).toEqual([
        "diff --git a/.cursorrules b/.cursorrules",
        "diff --git a/.github/workflows/x.yml b/.github/workflows/x.yml",
      ]);
      expect(earlier !== undefined && parts[0]?.equals(earlier)).toBe(true);
      expect(pushedTree(remote)).not.toContain(".github/workflows/x.yml");
      const fresh = applyOnBase(repo, base, join(clone, PATCH));
      expect(await readFile(join(fresh, ".cursorrules"), "utf8")).toBe("steered rules\n");
      expect(await readFile(join(fresh, ".github/workflows/x.yml"), "utf8")).toBe("on: push\n");

      // Again on the same clone, the workflow named again: the patch it wrote is the one HEAD carries now, and comes out the same.
      const again = await run(clone, ["checkpoint", "--run", RUN, "--paths", ".github/workflows/x.yml"]);

      expect(again.code).toBe(0);
      expect(again.stdout).toContain(
        `held (in ${PATCH}; the work tree keeps them, save .cursorrules, whose sections are kept from an earlier checkpoint): .cursorrules, .github/workflows/x.yml\n`,
      );
      expect(pushedBytes(remote).equals(pushed)).toBe(true);
    });

    it("reads the earlier sections from HEAD's copy where the work tree's patch is gone, and refuses one a text read cannot carry whole", async () => {
      const utf8 = await seed("unattended");
      const latin1 = await seed("unattended");
      await writeFile(join(utf8.repo, ".cursorrules"), "steered rules\n");
      // "café" in Latin-1: its 0xE9 byte is no UTF-8, so HEAD's copy cannot pass the text read whole.
      await writeFile(join(latin1.repo, ".cursorrules"), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
      // One at a time: each run swaps HOME and the identity variables in this process for its length.
      expect((await run(utf8.repo, CHECKPOINT)).code).toBe(0);
      expect((await run(latin1.repo, CHECKPOINT)).code).toBe(0);
      const clones = await Promise.all([utf8, latin1].map(({ repo, remote }) => cloneRun(repo, remote)));
      await Promise.all(clones.map(async (clone) => Promise.all([rm(join(clone, PATCH)), put(clone, ".github/workflows/x.yml", "on: push\n")])));
      const [read, refused] = clones as [string, string];
      const before = git(refused, ["rev-parse", "HEAD"]);

      const kept = await run(read, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);
      const held = await run(refused, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);

      expect(kept.code).toBe(0);
      expect(kept.doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules", ".github/workflows/x.yml"] });
      expect(sections(pushedBytes(utf8.remote)).map((part) => part.toString("utf8").split("\n")[0])).toEqual([
        "diff --git a/.cursorrules b/.cursorrules",
        "diff --git a/.github/workflows/x.yml b/.github/workflows/x.yml",
      ]);
      expect(held.code).toBe(1);
      expect(held.doc).toMatchObject({
        pushed: false,
        notDone: [`hold failed: the kept ${PATCH} is not in the work tree, and HEAD's copy holds bytes this verb cannot read whole`],
      });
      expect(git(refused, ["rev-parse", "HEAD"])).toBe(before);
    });

    it("keeps a binary section whole, and a path held again takes the current diff in place of its earlier section", async () => {
      const { repo, remote, base } = await seed("unattended");
      // NUL bytes make git write the file as a base85 `GIT binary patch` section.
      const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00, 0x7f, 0x0a, 0x00, 0x10]);
      await writeFile(join(repo, ".cursorrules"), "steered rules\n");
      await mkdir(join(repo, ".github", "workflows"), { recursive: true });
      await writeFile(join(repo, ".github/workflows/blob.bin"), binary);
      expect((await run(repo, [...CHECKPOINT, "--paths", ".github/workflows/blob.bin"])).code).toBe(0);
      const earlier = sections(pushedBytes(remote)).find((part) => part.toString("latin1").startsWith("diff --git a/.github/workflows/blob.bin "));
      expect(earlier?.toString("latin1")).toContain("GIT binary patch");
      const clone = await cloneRun(repo, remote);
      await writeFile(join(clone, ".cursorrules"), "steered again\n");

      const { code, doc } = await run(clone, CHECKPOINT);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules", ".github/workflows/blob.bin"] });
      const parts = sections(pushedBytes(remote));
      expect(parts).toHaveLength(2);
      expect(earlier !== undefined && parts[0]?.equals(earlier)).toBe(true);
      const rules = parts[1]?.toString("utf8") ?? "";
      expect(rules.startsWith("diff --git a/.cursorrules b/.cursorrules\n")).toBe(true);
      expect(rules).toContain("+steered again");
      expect(rules).not.toContain("+steered rules");
      const fresh = applyOnBase(repo, base, join(clone, PATCH));
      expect((await readFile(join(fresh, ".github/workflows/blob.bin"))).equals(binary)).toBe(true);
      expect(await readFile(join(fresh, ".cursorrules"), "utf8")).toBe("steered again\n");
    });

    /**
     * A clone whose work-tree patch, which a steered run can write, has `extra` appended after its one section's hunks,
     * and which holds a new change to the workflow; the checkpoint's result and `HEAD` before it.
     */
    async function steeredClone(extra: string, commit = false): Promise<{ clone: string; before: string; outcome: Awaited<ReturnType<typeof run>> }> {
      const { repo, remote } = await seed("unattended");
      await writeFile(join(repo, ".cursorrules"), "steered rules\n");
      expect((await run(repo, CHECKPOINT)).code).toBe(0);
      const clone = await cloneRun(repo, remote);
      await appendFile(join(clone, PATCH), extra);
      // `commit`: the steered patch is committed too, so HEAD's copy carries `extra` as well as the work tree's.
      if (commit) git(clone, ["commit", "-q", "-m", "steered patch", "--", PATCH]);
      await put(clone, ".github/workflows/x.yml", "on: push\n");
      const before = git(clone, ["rev-parse", "HEAD"]);
      const outcome = await run(clone, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);
      return { clone, before, outcome };
    }

    // review/249 (W-1): git apply reads a `---`/`+++` pair after a section's hunks as a further file patch with no
    // `diff --git` header, so it never gets a split point; mapped by its first record only, its path rode unlisted.
    it("refuses a section that carries a second file patch after its hunks (review/249)", async () => {
      const { clone, before, outcome } = await steeredClone("--- /dev/null\n+++ b/.github/workflows/y.yml\n@@ -0,0 +1 @@\n+on: push\n");

      expect(outcome.code).toBe(1);
      expect(outcome.doc).toMatchObject({
        pushed: false,
        notDone: [`hold failed: a section of the kept ${PATCH} carries more than one file patch, so a path past its first would be carried unlisted`],
      });
      expect(git(clone, ["rev-parse", "HEAD"])).toBe(before);
    });

    // review/249 (W-1): a stale section for a path held now, hidden inside another section, was not dropped, so the new
    // patch carried two sections for that path against Base: and the person's apply of the hand-off failed.
    it("refuses a stale section for a path held now hidden inside another section, so only the current diff could stand for it (review/249)", async () => {
      const { clone, before, outcome } = await steeredClone("--- /dev/null\n+++ b/.github/workflows/x.yml\n@@ -0,0 +1 @@\n+on: stale\n");

      expect(outcome.code).toBe(1);
      expect(outcome.doc).toMatchObject({
        pushed: false,
        notDone: [`hold failed: a section of the kept ${PATCH} carries more than one file patch, so a path past its first would be carried unlisted`],
      });
      expect(git(clone, ["rev-parse", "HEAD"])).toBe(before);
    });

    // review/250 (M-1): a carried path joined held and the commit's own-path set unchecked, so a path no person-only
    // glob holds passed the stray and hook checks and was pushed while the held line listed it as held.
    it("refuses a section naming a path the hold does not hold (review/250)", async () => {
      const { clone, before, outcome } = await steeredClone("diff --git a/a.txt b/a.txt\nnew file mode 100644\n--- /dev/null\n+++ b/a.txt\n@@ -0,0 +1 @@\n+x\n");

      expect(outcome.code).toBe(1);
      expect(outcome.doc).toMatchObject({
        pushed: false,
        notDone: [`hold failed: a section of the kept ${PATCH} names a.txt, which the hold does not hold`],
      });
      expect(git(clone, ["rev-parse", "HEAD"])).toBe(before);
    });

    /** A section that renames or copies the unheld `a.txt` to the held `.github/workflows/y.yml`, with no hunks. */
    const moved = (kind: "rename" | "copy"): string =>
      `diff --git a/a.txt b/.github/workflows/y.yml\nsimilarity index 100%\n${kind} from a.txt\n${kind} to .github/workflows/y.yml\n`;

    // review/251 (W-1), measured rather than assumed: `git apply --numstat -z` prints one record per file patch, naming
    // a rename's or a copy's new path only, so the path it moves or reads from never reaches the hold's checks.
    it.each(["rename", "copy"] as const)("pins that git apply --numstat -z names only a %s section's new path (review/251)", async (kind) => {
      const dir = getRoot().path(`numstat-${kind}`);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "moved.patch"), moved(kind));

      const records = git(dir, ["apply", "--numstat", "-z", "moved.patch"]).split("\0");

      expect(records.filter((record) => record !== "")).toEqual(["0\t0\t.github/workflows/y.yml"]);
      expect(records.join("\n")).not.toContain("a.txt");
    });

    // review/251 (W-1): a rename section from an unheld path to a held one was carried by its held new path alone, so
    // the hand-off deleted the source with no row in held or the morning list; a copy read a path the hold never checked.
    it.each(["rename", "copy"] as const)("refuses a committed patch's %s section from an unheld path to a held one (review/251)", async (kind) => {
      const { clone, before, outcome } = await steeredClone(moved(kind), true);

      expect(outcome.code).toBe(1);
      expect(outcome.doc).toMatchObject({
        pushed: false,
        notDone: [
          `hold failed: a section of the kept ${PATCH} renames or copies a path, and git apply --numstat names only its new one, so the path it moves or reads from would be carried unlisted`,
        ],
      });
      expect(git(clone, ["rev-parse", "HEAD"])).toBe(before);
    });

    /** Each section's header as git wrote it: its lines up to its first hunk or binary line, that line kept, ids masked. */
    const headers = (parts: Buffer[]): string[][] =>
      parts.map((part) => {
        const lines = part.toString("latin1").split("\n");
        const body = lines.findIndex((line) => line.startsWith("@@ ") || line === "GIT binary patch");
        return lines.slice(0, body === -1 ? lines.length - 1 : body + 1).map((line) => line.replace(/\b[0-9a-f]{40,64}\b/g, "<id>"));
      });

    // review/251, measured rather than assumed: the header lines the verb's own diffs write, renames pinned off, for each
    // kind of section it holds; the carried read's allowlist is these, and each such section is still carried whole.
    it("pins the header lines its own diffs write for each kind of section it holds, and carries each one whole (review/251)", async () => {
      const { repo, remote, base } = await seed("unattended", {
        files: {
          ".github/workflows/blob.bin": "\u0000\u0001\u0002",
          ".github/workflows/old.yml": "on: pull_request\n",
          ".github/workflows/run.sh": "echo run\n",
          ".github/workflows/sp ace.yml": "on: pull_request\n",
          ".github/workflows/ø.yml": "on: pull_request\n",
        },
      });
      const binary = Buffer.from([0x00, 0x03, 0xff, 0x0a]);
      await writeFile(join(repo, ".cursorrules"), "steered rules\n");
      await writeFile(join(repo, ".github/workflows/blob.bin"), binary);
      await put(repo, ".github/workflows/new.yml", "on: push\n");
      await rm(join(repo, ".github/workflows/old.yml"));
      await writeFile(join(repo, ".github/workflows/sp ace.yml"), "on: push\n");
      await writeFile(join(repo, ".github/workflows/ø.yml"), "on: push\n");
      // Staged as well, so git reads the mode change where the file system keeps no executable bit (Windows) too.
      await chmod(join(repo, ".github/workflows/run.sh"), 0o755);
      git(repo, ["update-index", "--chmod=+x", "--", ".github/workflows/run.sh"]);
      expect((await run(repo, [...CHECKPOINT, "--paths", ".github/workflows/new.yml"])).code).toBe(0);
      const earlier = sections(pushedBytes(remote));

      expect(headers(earlier)).toEqual([
        [
          "diff --git a/.github/workflows/new.yml b/.github/workflows/new.yml",
          "new file mode 100644",
          "index <id>..<id>",
          "--- /dev/null",
          "+++ b/.github/workflows/new.yml",
          "@@ -0,0 +1 @@",
        ],
        ["diff --git a/.github/workflows/run.sh b/.github/workflows/run.sh", "old mode 100644", "new mode 100755"],
        ["diff --git a/.cursorrules b/.cursorrules", "index <id>..<id> 100644", "--- a/.cursorrules", "+++ b/.cursorrules", "@@ -1 +1 @@"],
        ["diff --git a/.github/workflows/blob.bin b/.github/workflows/blob.bin", "index <id>..<id> 100644", "GIT binary patch"],
        [
          "diff --git a/.github/workflows/old.yml b/.github/workflows/old.yml",
          "deleted file mode 100644",
          "index <id>..<id>",
          "--- a/.github/workflows/old.yml",
          "+++ /dev/null",
          "@@ -1 +0,0 @@",
        ],
        // A name with a space: git ends its ---/+++ label with a tab.
        [
          "diff --git a/.github/workflows/sp ace.yml b/.github/workflows/sp ace.yml",
          "index <id>..<id> 100644",
          "--- a/.github/workflows/sp ace.yml\t",
          "+++ b/.github/workflows/sp ace.yml\t",
          "@@ -1 +1 @@",
        ],
        // A name past ASCII: git C-quotes it, on its diff --git line and its labels alike.
        [
          'diff --git "a/.github/workflows/\\303\\270.yml" "b/.github/workflows/\\303\\270.yml"',
          "index <id>..<id> 100644",
          '--- "a/.github/workflows/\\303\\270.yml"',
          '+++ "b/.github/workflows/\\303\\270.yml"',
          "@@ -1 +1 @@",
        ],
      ]);
      const clone = await cloneRun(repo, remote);
      await put(clone, ".github/workflows/x.yml", "on: push\n");

      const { code, doc } = await run(clone, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({
        pushed: true,
        notDone: [],
        held: [
          ".cursorrules",
          ".github/workflows/blob.bin",
          ".github/workflows/new.yml",
          ".github/workflows/old.yml",
          ".github/workflows/run.sh",
          ".github/workflows/sp ace.yml",
          ".github/workflows/x.yml",
          ".github/workflows/ø.yml",
        ],
      });
      const parts = sections(pushedBytes(remote));
      expect(parts).toHaveLength(earlier.length + 1);
      expect(earlier.every((part, index) => parts[index]?.equals(part) === true)).toBe(true);
      const fresh = applyOnBase(repo, base, join(clone, PATCH));
      expect((await readFile(join(fresh, ".github/workflows/blob.bin"))).equals(binary)).toBe(true);
      expect(isFile(join(fresh, ".github/workflows/old.yml"))).toBe(false);
      expect(await readFile(join(fresh, ".github/workflows/new.yml"), "utf8")).toBe("on: push\n");
      expect(await readFile(join(fresh, ".github/workflows/ø.yml"), "utf8")).toBe("on: push\n");
    });

    // review/251: the verb pins no diff prefix, so a repository's diff.mnemonicPrefix writes c/, i/ and w/ in place of
    // a/ and b/; git apply sets each name's first component aside, and so does the carried read.
    it("carries a section its diffs wrote with diff.mnemonicPrefix's prefixes (review/251)", async () => {
      const { repo, remote } = await seed("unattended");
      git(repo, ["config", "diff.mnemonicPrefix", "true"]);
      await writeFile(join(repo, ".cursorrules"), "steered rules\n");
      expect((await run(repo, CHECKPOINT)).code).toBe(0);
      expect(headers(sections(pushedBytes(remote)))[0]).toEqual([
        "diff --git c/.cursorrules w/.cursorrules",
        "index <id>..<id> 100644",
        "--- c/.cursorrules",
        "+++ w/.cursorrules",
        "@@ -1 +1 @@",
      ]);
      const clone = await cloneRun(repo, remote);
      await put(clone, ".github/workflows/x.yml", "on: push\n");

      const { code, doc } = await run(clone, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules", ".github/workflows/x.yml"] });
    });

    // review/251: a checkout under core.autocrlf (Git for Windows' default) leaves the work tree's copy of the committed
    // patch with CRLF line ends, which the verb's git add turns back to LF; the header read takes CR LF as a line end.
    it("carries a section whose work-tree copy has CRLF line ends, as an autocrlf checkout leaves it (review/251)", async () => {
      const { repo, remote } = await seed("unattended");
      await writeFile(join(repo, ".cursorrules"), "steered rules\n");
      expect((await run(repo, CHECKPOINT)).code).toBe(0);
      const clone = await cloneRun(repo, remote);
      await writeFile(join(clone, PATCH), (await readFile(join(clone, PATCH), "utf8")).replaceAll("\n", "\r\n"));
      await put(clone, ".github/workflows/x.yml", "on: push\n");

      const { code, doc } = await run(clone, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".cursorrules", ".github/workflows/x.yml"] });
    });

    /**
     * review/251, round 3: sections that move the unheld `a.txt` (Base: holds `a.txt\n`) to the held
     * `.github/workflows/y.yml` with no header line the round-2 refusal named, each with the refusal it now gets.
     */
    const forged = [
      {
        route: "the older rename old/rename new pair, with no similarity line",
        section: "diff --git a/a.txt b/.github/workflows/y.yml\nrename old a.txt\nrename new .github/workflows/y.yml\n",
        refusal: "renames or copies a path, and git apply --numstat names only its new one, so the path it moves or reads from would be carried unlisted",
      },
      {
        route: "two paths on its diff --git line, its ---/+++ pair naming them",
        section: "diff --git a/a.txt b/.github/workflows/y.yml\n--- a/a.txt\n+++ b/.github/workflows/y.yml\n@@ -1 +1 @@\n-a.txt\n+on: push\n",
        refusal: "does not name one path twice on its diff --git line, as every section this verb writes does, so a path git apply moves there would be carried unlisted",
      },
      {
        route: "no rename header, its --- and +++ lines naming different paths",
        section: "diff --git a/.github/workflows/y.yml b/.github/workflows/y.yml\n--- a/a.txt\n+++ b/.github/workflows/y.yml\n@@ -1 +1 @@\n-a.txt\n+on: push\n",
        refusal:
          "has a --- or +++ line that does not name its diff --git line's path (or /dev/null where it adds or deletes the file), so a path git apply moves there would be carried unlisted",
      },
    ];

    // Measured rather than assumed: git apply moves a.txt for each, while --numstat names the held new path alone.
    it.each(forged)("pins that git apply moves a.txt and --numstat names only the new path for $route (review/251)", async ({ section }) => {
      const dir = getRoot().path(`forged-${Math.random().toString(36).slice(2, 8)}`);
      await mkdir(dir, { recursive: true });
      git(dir, ["-c", "init.defaultBranch=main", "init", "-q"]);
      await writeFile(join(dir, "a.txt"), "a.txt\n");
      await writeFile(join(dir, "forged.patch"), section);

      const records = git(dir, ["apply", "--numstat", "-z", "forged.patch"]).split("\0");
      git(dir, ["apply", "forged.patch"]);

      expect(records.filter((record) => record !== "")).toEqual([expect.stringMatching(/^\d+\t\d+\t\.github\/workflows\/y\.yml$/)]);
      expect(records.join("\n")).not.toContain("a.txt");
      expect(isFile(join(dir, "a.txt"))).toBe(false);
      expect(isFile(join(dir, ".github/workflows/y.yml"))).toBe(true);
    });

    // review/251 (round 3): the round-2 refusal listed five header spellings, so each of these passed it and was carried
    // by its held new path alone, the hand-off moving a.txt with no row in held or the morning list.
    it.each(forged)("refuses a committed patch's section with $route (review/251)", async ({ section, refusal }) => {
      const { clone, before, outcome } = await steeredClone(section, true);

      expect(outcome.code).toBe(1);
      expect(outcome.doc).toMatchObject({ pushed: false, notDone: [`hold failed: a section of the kept ${PATCH} ${refusal}`] });
      expect(git(clone, ["rev-parse", "HEAD"])).toBe(before);
    });

    // review/251: the allowlist refuses any header line the verb's own diffs never write, not the renames alone; git
    // reads both of these, the second because a section's header runs past its +++ line up to its first hunk.
    it.each([
      {
        line: "a dissimilarity index line",
        section: "diff --git a/.github/workflows/y.yml b/.github/workflows/y.yml\ndissimilarity index 100%\nnew file mode 100644\n--- /dev/null\n+++ b/.github/workflows/y.yml\n@@ -0,0 +1 @@\n+on: push\n",
      },
      {
        line: "a mode line after its +++ line",
        section: "diff --git a/.github/workflows/y.yml b/.github/workflows/y.yml\nnew file mode 100644\n--- /dev/null\n+++ b/.github/workflows/y.yml\nnew mode 100755\n@@ -0,0 +1 @@\n+on: push\n",
      },
    ])("refuses a committed patch's section with $line, which its own diffs never write (review/251)", async ({ section }) => {
      const { clone, before, outcome } = await steeredClone(section, true);

      expect(outcome.code).toBe(1);
      expect(outcome.doc).toMatchObject({
        pushed: false,
        notDone: [`hold failed: a section of the kept ${PATCH} has a header line this verb's own diffs never write, so what git apply does with it would be carried unchecked`],
      });
      expect(git(clone, ["rev-parse", "HEAD"])).toBe(before);
    });

    // review/250: a held link (one at a held glob's directory prefix, review/200) is held by its mode, so its carried
    // section is still kept and listed.
    it.skipIf(process.platform === "win32")("keeps a carried section for a held link (review/250, review/200)", async () => {
      const { repo, remote } = await seed("unattended");
      await put(repo, "cfg/settings.json", '{ "hooks": {} }\n');
      await symlink("cfg", join(repo, ".claude"));
      expect((await run(repo, [...CHECKPOINT, "--paths", "cfg", ".claude"])).code).toBe(0);
      const clone = await cloneRun(repo, remote);
      await put(clone, ".github/workflows/x.yml", "on: push\n");

      const { code, doc } = await run(clone, [...CHECKPOINT, "--paths", ".github/workflows/x.yml"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [], held: [".claude", ".github/workflows/x.yml"] });
    });
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

  // pr/49: origin's tips reach git on stdin, so 2,000 of them, made-up ones `--ignore-missing` skips, answer as the
  // seed's tip alone does, on a remote that holds the seed and on an empty one, with a log command line kept short.
  it.each([
    ["holds the seed", { code: 0, pushed: true, held: [], notDone: [] }],
    ["is empty", { code: 1, pushed: false, notDone: ["held path in history (.cursorrules)"] }],
  ] as const)("reads the history from 2,000 tips handed on stdin as from the remote's own, where origin %s (pr/49)", async (state, expected) => {
    const madeUp = Array.from({ length: 2000 }, (_, index) => `d${index.toString(16).padStart(39, "0")}`);
    // One checkpoint on its own seed, the case's made-up tips added to what the remote answers; one runs at a time.
    const answer = async (extra: readonly string[]): Promise<Record<string, unknown>> => {
      const { repo, remote } = await seed("unattended");
      if (state === "is empty") git(remote, ["update-ref", "-d", "refs/heads/main"]);
      await writeFile(join(repo, "a.txt"), "the unit's change\n");
      writes.argv.length = 0;
      writes.inputs.length = 0;
      writes.extraTips.splice(0, writes.extraTips.length, ...extra);
      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);
      return { code, pushed: doc["pushed"], held: doc["held"], notDone: doc["notDone"] };
    };

    const small = await answer([]);
    const large = await answer(madeUp);

    expect(small).toMatchObject(expected);
    expect(large).toEqual(small);
    const log = writes.argv.findIndex((argv) => argv[0] === "log");
    expect(writes.argv[log]?.slice(-3)).toEqual(["--ignore-missing", "--stdin", "--"]);
    expect(writes.inputs[log]?.split("\n").filter((line) => line.startsWith("^"))).toHaveLength(state === "is empty" ? 2000 : 2001);
    expect(Math.max(...writes.argv.map((argv) => argv.join(" ").length))).toBeLessThan(1024);
    expect(writes.argv.flat().some((arg) => madeUp.includes(arg))).toBe(false);
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

  describe("a branch name nesting past the verdict's four levels (pr/61)", () => {
    /** git accepts it (`git check-ref-format --branch`), and the real verdict throws NESTING_DEPTH on its push line. */
    const NESTED = `stamity/x${'"$('.repeat(5)}y`;
    const REFUSED = "push refused: the shell guard's table could not decide this push, its branch name nesting past four levels (NESTING_DEPTH)";

    it("refuses the push with exit 1 when the verdict throws NESTING_DEPTH, committing first and pushing nothing", async () => {
      const { repo, remote } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      table.pushBranch = NESTED;

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc["notDone"]).toEqual([REFUSED]);
      expect(doc).toMatchObject({ pushed: false });
      expect(doc["committed"]).toMatch(/^[0-9a-f]{40}$/);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });

    it("pushes where the name nests four levels, which the verdict decides (the twin)", async () => {
      const { repo } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "changed\n");
      table.pushBranch = `stamity/x${'"$('.repeat(4)}y`;

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(0);
      expect(doc).toMatchObject({ pushed: true, notDone: [] });
    });

    // Skipped on Windows (prove/10): NTFS, through the Windows file API, cannot hold `"` in a loose ref's file name, so
    // the seed's `git switch -c` fails there ("cannot lock ref", "Invalid argument") and no Windows checkout on git's
    // default files backend can carry the branch this case needs. The name refusal it pins is a string check that reads
    // alike on every platform, proven here on the POSIX legs; the spy-driven case above hands the same name to the real
    // verdict without a checkout, so the NESTING_DEPTH catch is proven on every platform, Windows included.
    it.skipIf(process.platform === "win32")("on a checkout of that branch, refuses the commit by its name before the verdict runs", async () => {
      const { repo, remote } = await seed("attended", { branch: NESTED });
      await writeFile(join(repo, "a.txt"), "changed\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc["notDone"]).toEqual([`commit refused: the branch name ${NESTED} holds characters the push check does not read`]);
      expect(table.commands).toEqual([]);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
    });
  });

  describe("the default branch's sources (pr/55)", () => {
    const FALLBACK = "commit refused: no source named the default branch (GitHub's REST API gave no answer and refs/remotes/origin/HEAD names none), so an unattended run pushes nothing";
    const originHead = (repo: string): string | null => {
      try {
        return git(repo, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
      } catch {
        return null;
      }
    };

    it("points an absent origin/HEAD at the default branch REST names, and writes nothing under --dry-run", async () => {
      const { repo } = await seed("attended");
      const dry = await seed("attended");

      const wrote = await run(repo, ["checkpoint", "--run", RUN]);
      const planned = await run(dry.repo, ["checkpoint", "--run", RUN, "--dry-run"]);

      expect(wrote.code).toBe(0);
      expect(originHead(repo)).toBe("refs/remotes/origin/main");
      expect(wrote.stdout).toContain("origin/HEAD: pointed at refs/remotes/origin/main (was absent), so the shell guard counts main as the default branch");
      expect(planned.code).toBe(0);
      expect(originHead(dry.repo)).toBeNull();
      expect(planned.stdout).toContain("origin/HEAD: would point at refs/remotes/origin/main (absent)");
    });

    it("refuses an unattended commit where only the main/master fallback answered, staging and pushing nothing", async () => {
      rest.routes.delete("GET repos/o/r");
      const { repo, remote } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "changed\n");

      const { code, doc } = await run(repo, [...CHECKPOINT, "--paths", "a.txt"]);

      expect(code).toBe(1);
      expect(doc["notDone"]).toEqual([FALLBACK]);
      expect(writes.argv.some((argv) => argv[0] === "add" || argv[0] === "commit")).toBe(false);
      expect(pushes()).toEqual([]);
      expect(remoteHeads(remote)).toEqual(SEEDED);
      expect(originHead(repo)).toBeNull();
    });

    it("lets an attended commit through on the fallback, and an unattended one once origin/HEAD names the default", async () => {
      rest.routes.delete("GET repos/o/r");
      const attended = await seed("attended");
      const named = await seed("unattended");
      git(named.repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
      await Promise.all([attended, named].map(({ repo }) => writeFile(join(repo, "a.txt"), "changed\n")));

      const kept = await run(attended.repo, [...CHECKPOINT, "--paths", "a.txt"]);
      const read = await run(named.repo, [...CHECKPOINT, "--paths", "a.txt"]);

      for (const result of [kept, read]) {
        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ pushed: true, notDone: [] });
      }
      expect(remoteHeads(named.remote)).toEqual([...SEEDED, `refs/heads/${RUN_BRANCH}`]);
    });
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

  describe("git's program-valued variables, unattended (v0c, REQ-FLOW-122)", () => {
    /** The three the cell names, each set to a value the line must never print. */
    const PLANTED = { GIT_EXEC_PATH: "/planted/exec-path", GIT_SSH_COMMAND: "planted-ssh -i /planted/key", GIT_ASKPASS: "/planted/askpass" } as const;
    const LINE = "removed from git's environment: GIT_SSH_COMMAND, GIT_ASKPASS, GIT_EXEC_PATH";
    /** The stand-in's log line for a write runner's git: the three gone, GIT_ASKPASS set and empty (review/18). */
    const WRITE_LINE = "unset|unset|";
    /** The stand-in's log line for a read runner's git (the scan's), which drops every GIT_* variable. */
    const READ_LINE = "unset|unset|unset";

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** No program-valued variable from the host's own shell reaches a case, so the line names only what the case sets. */
    async function withPrograms<T>(set: Record<string, string>, body: () => Promise<T>): Promise<T> {
      const { GIT_PROGRAM_VARIABLES } = await vi.importActual<typeof GitWriteModule>("../../../src/cli/engine/gitWrite.ts");
      for (const name of GIT_PROGRAM_VARIABLES) vi.stubEnv(name, undefined);
      for (const [name, value] of Object.entries(set)) vi.stubEnv(name, value);
      try {
        return await body();
      } finally {
        // Unstubbed before the case reads the repositories back with the fixtures' own git.
        vi.unstubAllEnvs();
      }
    }

    /**
     * A stand-in ahead of git on PATH that appends the three variables it was started with (`unset` where absent) to
     * `log`, then clears them and runs the real git. Mock reason: no real git reports the environment it was started
     * with, and a real git started with GIT_EXEC_PATH at a folder holding no git programs would fail before the
     * attended control could show the variables reached it. Windows starts no shebang script, so its cases are POSIX only.
     */
    async function standIn(dir: string): Promise<{ path: string; lines: () => string[] }> {
      const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
      const bin = join(dir, "stand-in");
      const log = join(dir, "git-env.log");
      await mkdir(bin, { recursive: true });
      const fields = Object.keys(PLANTED).map((name) => `\${${name}-unset}`).join("|");
      const script = `#!/bin/sh\nprintf '%s\\n' "${fields}" >> '${log}'\nunset ${Object.keys(PLANTED).join(" ")}\nexec '${real}' "$@"\n`;
      await writeFile(join(bin, "git"), script);
      await chmod(join(bin, "git"), 0o755);
      return {
        path: `${bin}:${process.env["PATH"] ?? ""}`,
        lines: () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((line) => line !== "") : []),
      };
    }

    it.skipIf(process.platform === "win32")("unattended, the verb's git runs without them, the line names each by name only, and the GIT_CONFIG_* insteadOf still sends the push", async () => {
      const { repo, remote } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "the unit's change\n");
      const stand = await standIn(dirname(repo));

      const { code, stdout } = await withPrograms({ ...PLANTED, PATH: stand.path }, () => run(repo, ["checkpoint", "--run", RUN, "--paths", "a.txt"]));

      expect(code).toBe(0);
      expect(stdout).toContain(`run: ${RUN} (unattended)\nbase: `);
      expect(stdout).toContain(`\n${LINE}\n`);
      for (const value of Object.values(PLANTED)) expect(stdout).not.toContain(value);
      // Non-degenerate: git ran, a push among its calls, and not one call received any of the three.
      expect(pushes()).toHaveLength(1);
      expect(stand.lines().length).toBeGreaterThan(0);
      // TEST CHANGE, justified: review/18 (signed off 19:53Z) starts the write runner's git with GIT_ASKPASS set and
      // empty, not removed, so its calls log an empty third field; the read runner's still log `unset` there.
      expect(stand.lines()).toContain(WRITE_LINE);
      expect(stand.lines().filter((line) => line !== WRITE_LINE && line !== READ_LINE)).toEqual([]);
      // The spy's GIT_CONFIG_COUNT insteadOf (the push's seam) was kept, so the push landed in the case's remote.
      expect(remoteHeads(remote)).toEqual([...SEEDED, `refs/heads/${RUN_BRANCH}`]);
    });

    it.skipIf(process.platform === "win32")("attended, the same variables reach the verb's git, and no line names them", async () => {
      const { repo, remote } = await seed("attended");
      await writeFile(join(repo, "a.txt"), "the unit's change\n");
      const stand = await standIn(dirname(repo));

      const { code, stdout } = await withPrograms({ ...PLANTED, PATH: stand.path }, () => run(repo, ["checkpoint", "--run", RUN, "--paths", "a.txt"]));

      expect(code).toBe(0);
      expect(stdout).not.toContain("removed from git's environment");
      expect(stand.lines()).toContain(Object.values(PLANTED).join("|"));
      expect(remoteHeads(remote)).toEqual([...SEEDED, `refs/heads/${RUN_BRANCH}`]);
    });

    it("unattended with none of them set, prints no line", async () => {
      const { repo } = await seed("unattended");
      await writeFile(join(repo, "a.txt"), "the unit's change\n");

      const { code, stdout } = await withPrograms({}, () => run(repo, ["checkpoint", "--run", RUN, "--paths", "a.txt"]));

      expect(code).toBe(0);
      expect(stdout).toContain(`run: ${RUN} (unattended)`);
      expect(stdout).not.toContain("removed from git's environment");
    });

    it("run start, unattended, names them too, and attended does not", async () => {
      const unattended = await seed("unattended");
      const attended = await seed("attended");

      const named = await withPrograms({ GIT_SSH_COMMAND: PLANTED.GIT_SSH_COMMAND, GIT_EDITOR: "" }, () => run(unattended.repo, ["start", "--run", RUN]));
      const plain = await withPrograms({ GIT_SSH_COMMAND: PLANTED.GIT_SSH_COMMAND, GIT_EDITOR: "" }, () => run(attended.repo, ["start", "--run", RUN]));

      expect(named.code).toBe(0);
      expect(named.stdout).toContain("removed from git's environment: GIT_EDITOR, GIT_SSH_COMMAND\n");
      expect(named.stdout).not.toContain(PLANTED.GIT_SSH_COMMAND);
      expect(plain.code).toBe(0);
      expect(plain.stdout).not.toContain("removed from git's environment");
    });

    // review/17: an unattended run calls every verb with --json, which silences the text line, so the JSON names them.
    it("checkpoint's --json document names them in gitEnvRemoved unattended, by name only; attended, or with none set, it has no such key", async () => {
      const unattended = await seed("unattended");
      const attended = await seed("attended");
      const none = await seed("unattended");
      await Promise.all([unattended, attended, none].map(({ repo }) => writeFile(join(repo, "a.txt"), "the unit's change\n")));
      const set = { GIT_SSH_COMMAND: PLANTED.GIT_SSH_COMMAND, GIT_ASKPASS: PLANTED.GIT_ASKPASS, GIT_EDITOR: "" };

      const named = await withPrograms(set, () => run(unattended.repo, [...CHECKPOINT, "--paths", "a.txt"]));
      const plain = await withPrograms(set, () => run(attended.repo, [...CHECKPOINT, "--paths", "a.txt"]));
      const clean = await withPrograms({}, () => run(none.repo, [...CHECKPOINT, "--paths", "a.txt"]));

      expect(named.code).toBe(0);
      expect(named.doc["gitEnvRemoved"]).toEqual(["GIT_EDITOR", "GIT_SSH_COMMAND", "GIT_ASKPASS"]);
      expect(named.doc).toMatchObject({ subcommand: "checkpoint", run: RUN, pushed: true });
      expect(named.stdout).not.toContain(PLANTED.GIT_SSH_COMMAND);
      expect(named.stdout).not.toContain(PLANTED.GIT_ASKPASS);
      expect(plain.code).toBe(0);
      expect(plain.doc).toMatchObject({ subcommand: "checkpoint", pushed: true });
      expect(plain.doc).not.toHaveProperty("gitEnvRemoved");
      expect(clean.code).toBe(0);
      expect(clean.doc).toMatchObject({ subcommand: "checkpoint", pushed: true });
      expect(clean.doc).not.toHaveProperty("gitEnvRemoved");
    });

    // review/17 for start, and the security lens' M-1: what start's own git calls receive is read where git runs.
    it.skipIf(process.platform === "win32")("run start, unattended: its git receives none of them and its --json names them in gitEnvRemoved; attended: no such key", async () => {
      const unattended = await seed("unattended");
      const attended = await seed("attended");
      const stand = await standIn(dirname(unattended.repo));

      // review/24: attended first, so the mode the run verbs keep between calls reads attended when the unattended start
      // begins (the case before leaves it unattended): a git call of start's moved above its mode read would then
      // receive the three, and the stand-in's lines below would fail the case.
      const plain = await withPrograms({ GIT_SSH_COMMAND: PLANTED.GIT_SSH_COMMAND, GIT_EDITOR: "" }, () => run(attended.repo, ["start", "--run", RUN, "--json"]));
      const named = await withPrograms({ ...PLANTED, PATH: stand.path }, () => run(unattended.repo, ["start", "--run", RUN, "--json"]));

      expect(named.code).toBe(0);
      expect(named.doc).toMatchObject({ subcommand: "start", run: RUN, gitEnvRemoved: ["GIT_SSH_COMMAND", "GIT_ASKPASS", "GIT_EXEC_PATH"] });
      for (const value of Object.values(PLANTED)) expect(named.stdout).not.toContain(value);
      // Non-degenerate: start ran git through the write runner, and not one of its calls received any of the three.
      expect(stand.lines()).toContain(WRITE_LINE);
      expect(stand.lines().filter((line) => line !== WRITE_LINE && line !== READ_LINE)).toEqual([]);
      expect(plain.code).toBe(0);
      expect(plain.doc).toMatchObject({ subcommand: "start", run: RUN });
      expect(plain.doc).not.toHaveProperty("gitEnvRemoved");
    });
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
