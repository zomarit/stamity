import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { planCommand } from "../../../src/cli/commands/plan.ts";
import { runCommand } from "../../../src/cli/commands/run.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import { personOnlyVerdict } from "../../../src/hooks/personOnly.ts";
import { planHash } from "../../../src/runs/itemContract.ts";
import { parseRunContract } from "../../../src/runs/runContract.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * item-contract (REQ-FLOW-155): `stamity run contract`, through the in-process funnel. Git runs
 * for real in a scratch repository whose origin names a GitHub repository; GitHub's answers are
 * recorded routes. What the verb did is read from the file it wrote, the calls it made and
 * `stamity plan check` run over the result.
 */

const RUN = "2026-11-04_ready-item";
const RUN_DIR = `.stamity/runs/${RUN}`;
const CONTRACT = `${RUN_DIR}/contract.yml`;
const BRANCH = "feat/expiry";
const PLAN_PATH = "docs/plans/001-demo.md";
const SPEC_PATH = "docs/specs/demo.md";
const ITEM = "o/r#7";
const ISSUE = "repos/o/r/issues/7";

/** What the verb asked of GitHub, and what each path answers. */
const rest = vi.hoisted(() => ({
  calls: [] as { path: string; hostname: string; method: string }[],
  routes: new Map<string, { status: number; json: unknown }>(),
  failure: null as Error | null,
}));

// Mocked: the real `ghApi` starts `gh`, which calls GitHub over the network under the machine's
// login; a unit test can reach neither. The verb's own work (which host, which path, what it does
// with the answer) is unchanged.
vi.mock("../../../src/cli/engine/ghRunner.ts", () => ({
  ghApi: (request: { path: string; hostname: string; method: string }) => {
    const path = request.path.replace(/^\//, "");
    rest.calls.push({ path, hostname: request.hostname, method: request.method });
    if (rest.failure !== null) return Promise.reject(rest.failure);
    return Promise.resolve(rest.routes.get(path) ?? { status: 404, json: { message: "Not Found" } });
  },
}));

/** Set, every git read the verb makes rejects with it, as a git missing from `PATH` does. */
const gitFault = vi.hoisted(() => ({ error: null as Error | null }));

// A spy, not a stand-in: every call goes to the real runner unless a case sets the fault. Mock reason: the runner
// finds git on the live process's `PATH`, which a unit test cannot empty without breaking the fixture's own git.
vi.mock("../../../src/cli/engine/gitWrite.ts", async (importOriginal) => {
  const real = await importOriginal<typeof GitWriteModule>();
  return {
    ...real,
    gitWrite: (...args: Parameters<typeof real.gitWrite>) => (gitFault.error === null ? real.gitWrite(...args) : Promise.reject(gitFault.error)),
  };
});

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
  GIT_AUTHOR_NAME: "Fixture One",
  GIT_AUTHOR_EMAIL: "one@fixture.invalid",
  GIT_COMMITTER_NAME: "Fixture One",
  GIT_COMMITTER_EMAIL: "one@fixture.invalid",
};

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: GIT_ENV }).trim();
}

async function put(root: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text, "utf8");
}

const SPEC_TEXT = "# Demo\n\n## Requirements\n\n### REQ-DEMO-001 — Reject expired values\nGiven an expired value, Then it is refused.\n";

/** A plan every `plan check` rule passes, its one unit naming `files`. */
function planText(stamp: string, files = "`src/b.ts`, a new `src/c.ts`"): string {
  return [
    "---",
    "id: demo-01",
    "intent: feature",
    `stamp: ${stamp} 2026-11-04`,
    "reads: [src/b.ts]",
    "---",
    "",
    "# Demo",
    "",
    "## Context",
    "",
    "Values expire.",
    "",
    "## Spec delta",
    "",
    "### REQ-DEMO-001 — Reject expired values (ADDED)",
    "Given an expired value, Then it is refused.",
    "",
    "## Units",
    "",
    "### u1-guard — a unit",
    "",
    "| Field | Content |",
    "|---|---|",
    "| `id` | u1-guard |",
    "| `requirements` | REQ-DEMO-001 |",
    `| \`files\` | ${files} |`,
    "| `interfaces` | `check(value): boolean` |",
    "| `testCriteria` | an expired value → false |",
    "| `edgeCases` | an expired value → refused |",
    "| `depends_on` | none |",
    "| `verify` | `npx vitest run test/b.test.ts` |",
    "",
    "## Risks",
    "",
    "- **Warning** — a retry storm. Mitigation: a cap.",
    "",
    "## Open questions",
    "",
    "None.",
    "",
  ].join("\n");
}

const SUMMARY = "Expired values are refused from now on.";
const CRITERIA = "- [ ] an expired value is refused\n- [ ] a retry keeps its state";

/** The filed body of an item with a plan, in `content/commands/st-board.md`'s order. */
function plannedBody(hash: string, branch = BRANCH): string {
  return [
    SUMMARY,
    "",
    "## Acceptance criteria",
    "",
    CRITERIA,
    "",
    `Branch: ${branch}`,
    `Plan: ${PLAN_PATH} ${hash}`,
    `Ref: ${SPEC_PATH}`,
    "",
    "<!-- stamity:item docs/specs/demo.md#expired/5f3a9c01d2e4 -->",
  ].join("\n");
}

const issue = (body: unknown, extra: Record<string, unknown> = {}): { status: number; json: unknown } => ({
  status: 200,
  json: { number: 7, user: { login: "a-person", type: "User" }, body, ...extra },
});

interface Verb {
  code: number;
  stdout: string;
  stderr: string;
  doc: { subcommand: string; outcome: string; run: string; item: string; path: string; notDone: string[]; dryRun?: boolean };
}

async function contract(cwd: string, extra: readonly string[] = [], item: string = ITEM): Promise<Verb> {
  const result = await runInProcess([runCommand], ["run", "contract", "--run", RUN, "--item", item, "--json", ...extra], { cwd, env: { PATH: process.env["PATH"] } });
  return { ...result, doc: JSON.parse(result.stdout) as Verb["doc"] };
}

const inRepo = useTempDir("stamity-run-contract-");

/** A repository on the item's branch, with `origin` on GitHub, the spec in its tree and the plan committed. */
async function seeded(opts: { files?: string; commitPlan?: boolean } = {}): Promise<{ cwd: string; head: string; hash: string; plan: string }> {
  const cwd = inRepo().path("repo");
  await put(cwd, "src/b.ts", "export const b = 1;\n");
  await put(cwd, SPEC_PATH, SPEC_TEXT);
  git(cwd, ["-c", "init.defaultBranch=main", "init", "--quiet"]);
  git(cwd, ["remote", "add", "origin", "https://github.com/o/r.git"]);
  git(cwd, ["add", "--all"]);
  git(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "seed"]);
  const stamp = git(cwd, ["rev-parse", "HEAD"]);
  git(cwd, ["switch", "--quiet", "-c", BRANCH]);
  const plan = planText(stamp, opts.files);
  await put(cwd, PLAN_PATH, plan);
  if (opts.commitPlan !== false) {
    git(cwd, ["add", "--", PLAN_PATH]);
    git(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "plan"]);
  }
  return { cwd, head: git(cwd, ["rev-parse", "HEAD"]), hash: planHash(plan), plan };
}

beforeEach(() => {
  rest.calls.length = 0;
  rest.routes.clear();
  rest.failure = null;
  gitFault.error = null;
});

describe("stamity run contract", () => {
  it("writes a contract from a ready item that `plan check --contract` passes", async () => {
    const { cwd, head, hash } = await seeded();
    rest.routes.set(ISSUE, issue(plannedBody(hash)));

    const { code, doc, stdout } = await contract(cwd);

    expect(doc).toMatchObject({ subcommand: "contract", run: RUN, item: ITEM, outcome: "written", path: CONTRACT, notDone: [] });
    expect(code, stdout).toBe(0);
    expect(rest.calls).toEqual([{ path: ISSUE, hostname: "github.com", method: "GET" }]);

    const text = await readFile(join(cwd, CONTRACT), "utf8");
    expect(parseRunContract(text, CONTRACT)).toMatchObject({
      ok: true,
      contract: { version: 1, plan: PLAN_PATH, item: ITEM, base: head, acceptance: CRITERIA, scope: { in: ["src/b.ts", "src/c.ts"] }, answerer: "@a-person" },
    });
    expect(text).not.toContain(SUMMARY);
    expect(text).not.toContain(BRANCH);

    const check = await runInProcess([planCommand], ["plan", "check", PLAN_PATH, "--contract", CONTRACT, "--json"], { cwd, env: { PATH: process.env["PATH"] } });
    expect(JSON.parse(check.stdout)).toMatchObject({ contract: { ok: true, problems: [] } });
    expect(check.code, check.stdout).toBe(0);
  });

  it("reads a body whose lines end in CRLF, as GitHub's web form saves one", async () => {
    const { cwd, hash } = await seeded();
    rest.routes.set(ISSUE, issue(plannedBody(hash).replaceAll("\n", "\r\n")));

    const { code } = await contract(cwd);

    expect(code).toBe(0);
    expect(parseRunContract(await readFile(join(cwd, CONTRACT), "utf8"), CONTRACT)).toMatchObject({ contract: { acceptance: CRITERIA } });
  });

  it("names the item's repository in the read, where the item lives elsewhere than origin", async () => {
    const { cwd, hash } = await seeded();
    rest.routes.set("repos/board-org/board/issues/12", issue(plannedBody(hash)));

    const { code, doc } = await contract(cwd, [], "board-org/board#12");

    expect(code).toBe(0);
    expect(doc.item).toBe("board-org/board#12");
    expect(parseRunContract(await readFile(join(cwd, CONTRACT), "utf8"), CONTRACT)).toMatchObject({ contract: { item: "board-org/board#12" } });
  });

  it("replaces a contract an earlier call wrote, which the base has since moved past", async () => {
    const { cwd, hash } = await seeded();
    rest.routes.set(ISSUE, issue(plannedBody(hash)));
    await contract(cwd);
    await put(cwd, "src/d.ts", "export const d = 1;\n");
    git(cwd, ["add", "--", "src/d.ts"]);
    git(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "more"]);

    const { code } = await contract(cwd);

    expect(code).toBe(0);
    expect(parseRunContract(await readFile(join(cwd, CONTRACT), "utf8"), CONTRACT)).toMatchObject({ contract: { base: git(cwd, ["rev-parse", "HEAD"]) } });
  });

  it("says what it would write under --dry-run and writes nothing", async () => {
    const { cwd, hash } = await seeded();
    rest.routes.set(ISSUE, issue(plannedBody(hash)));

    const { code, doc } = await contract(cwd, ["--dry-run"]);

    expect(doc).toMatchObject({ outcome: "would-write", path: CONTRACT, dryRun: true });
    expect(code).toBe(0);
    expect(existsSync(join(cwd, RUN_DIR))).toBe(false);
  });

  it("prints the plan, the contract's path and the outcome as text", async () => {
    const { cwd, hash } = await seeded();
    rest.routes.set(ISSUE, issue(plannedBody(hash)));

    const { code, stdout } = await runInProcess([runCommand], ["run", "contract", "--run", RUN, "--item", ITEM], { cwd, env: { PATH: process.env["PATH"] } });

    expect(code).toBe(0);
    expect(stdout).toContain(`item: ${ITEM}`);
    expect(stdout).toContain(`contract: ${CONTRACT}`);
    expect(stdout).toContain("outcome: written");
  });

  describe("refuses, writing nothing", () => {
    const refused = async (cwd: string, ...named: string[]): Promise<Verb> => {
      const verb = await contract(cwd);
      expect(verb.doc.outcome).toBe("refused");
      expect(verb.code).toBe(1);
      for (const word of named) expect(verb.doc.notDone.join("\n")).toContain(word);
      expect(existsSync(join(cwd, CONTRACT))).toBe(false);
      return verb;
    };

    it("where the current branch is not the item's, naming both", async () => {
      const { cwd, hash } = await seeded();
      rest.routes.set(ISSUE, issue(plannedBody(hash, "feat/other")));
      await refused(cwd, BRANCH, "feat/other");
    });

    it("at a detached HEAD, saying so", async () => {
      const { cwd, hash } = await seeded();
      git(cwd, ["switch", "--quiet", "--detach"]);
      rest.routes.set(ISSUE, issue(plannedBody(hash)));
      await refused(cwd, "detached", BRANCH);
    });

    it("where the plan's hash is not the item's, naming the plan and both hashes", async () => {
      const { cwd, hash } = await seeded();
      rest.routes.set(ISSUE, issue(plannedBody("0123456789ab")));
      await refused(cwd, PLAN_PATH, "0123456789ab", hash);
    });

    it("where the plan changed after the item was filed", async () => {
      const { cwd, hash, plan } = await seeded();
      await put(cwd, PLAN_PATH, `${plan}\nOne more line.\n`);
      git(cwd, ["add", "--", PLAN_PATH]);
      git(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "move the plan"]);
      rest.routes.set(ISSUE, issue(plannedBody(hash)));
      await refused(cwd, PLAN_PATH, hash);
    });

    it("where the plan matches only as an uncommitted file: the hash ties the item to a committed plan", async () => {
      const { cwd, hash } = await seeded({ commitPlan: false });
      rest.routes.set(ISSUE, issue(plannedBody(hash)));
      await refused(cwd, PLAN_PATH, "not committed");
    });

    it("where the item's hash matches HEAD's plan and the branch and hash are both wrong: each is named in one pass", async () => {
      const { cwd } = await seeded();
      rest.routes.set(ISSUE, issue(plannedBody("0123456789ab", "feat/other")));
      const { doc } = await refused(cwd, "feat/other", "0123456789ab");
      expect(doc.notDone).toHaveLength(2);
    });

    it("an item with no `Plan:`: the old body of a plain item", async () => {
      const { cwd } = await seeded();
      rest.routes.set(ISSUE, issue(`${CRITERIA}\n\nRef: ${SPEC_PATH}\n\n<!-- stamity:item inbox:5f3a9c01d2e4 -->`));
      await refused(cwd, ITEM, "Plan:");
    });

    it("an item with an empty body, which GitHub answers as null", async () => {
      const { cwd } = await seeded();
      rest.routes.set(ISSUE, issue(null));
      await refused(cwd, "Plan:");
    });

    it("an item with a plan and no `Branch:`", async () => {
      const { cwd, hash } = await seeded();
      rest.routes.set(ISSUE, issue(plannedBody(hash).replace(`Branch: ${BRANCH}\n`, "")));
      await refused(cwd, "Branch:");
    });

    it("an item with a plan and no criteria", async () => {
      const { cwd, hash } = await seeded();
      rest.routes.set(ISSUE, issue(plannedBody(hash).replace(CRITERIA, "")));
      await refused(cwd, "acceptance criteria");
    });

    it("a plan whose units name no file, since scope.in needs an entry", async () => {
      const { cwd, hash } = await seeded({ files: "none" });
      rest.routes.set(ISSUE, issue(plannedBody(hash)));
      await refused(cwd, PLAN_PATH, "scope.in");
    });

    it("a body over the read cap, before it reads the body", async () => {
      const { cwd, hash } = await seeded();
      rest.routes.set(ISSUE, issue(`${"x".repeat(262_145)}\n${plannedBody(hash)}`));
      await refused(cwd, "262144");
    });

    it("a number that is a pull request, which the issues path also answers", async () => {
      const { cwd, hash } = await seeded();
      rest.routes.set(ISSUE, issue(plannedBody(hash), { pull_request: { url: "x" } }));
      await refused(cwd, "pull request");
    });

    it.each([
      ["no user", { user: null }],
      ["no login", { user: {} }],
    ])("an item whose author reads with %s", async (_label, extra) => {
      const { cwd, hash } = await seeded();
      rest.routes.set(ISSUE, issue(plannedBody(hash), extra));
      await refused(cwd, "author");
    });

    it("an item GitHub does not find, naming the status", async () => {
      const { cwd } = await seeded();
      await refused(cwd, ITEM, "404");
    });

    it("an item read that gh could not make, naming why", async () => {
      const { cwd } = await seeded();
      rest.failure = Object.assign(new Error("gh api answered no HTTP status: no login"), { code: "GH_NO_STATUS" });
      await refused(cwd, ITEM, "no login");
    });

    it("an origin naming no GitHub repository, with no REST call made", async () => {
      const { cwd } = await seeded();
      git(cwd, ["remote", "set-url", "origin", "https://example.invalid/o/r.git"]);
      await refused(cwd, "origin");
      expect(rest.calls).toEqual([]);
    });

    it("a repository with no origin", async () => {
      const { cwd } = await seeded();
      git(cwd, ["remote", "remove", "origin"]);
      await refused(cwd, "origin");
    });

    it("outside a git repository", async () => {
      const cwd = inRepo().path("plain");
      await mkdir(cwd, { recursive: true });
      await refused(cwd, "HEAD");
    });

    it("where git does not start, naming that, with no REST call made", async () => {
      const { cwd } = await seeded();
      gitFault.error = new Error("spawn git ENOENT");
      await refused(cwd, "git did not run", "ENOENT");
      expect(rest.calls).toEqual([]);
    });

    it("a repository with no commit", async () => {
      const cwd = inRepo().path("empty");
      await mkdir(cwd, { recursive: true });
      git(cwd, ["-c", "init.defaultBranch=main", "init", "--quiet"]);
      await refused(cwd, "HEAD");
    });
  });

  it("refuses when the contract cannot be written, naming the path", async () => {
    const { cwd, hash } = await seeded();
    rest.routes.set(ISSUE, issue(plannedBody(hash)));
    await put(cwd, RUN_DIR, "a file where the run folder goes\n");

    const { code, doc } = await contract(cwd);

    expect(code).toBe(1);
    expect(doc).toMatchObject({ outcome: "refused" });
    expect(doc.notDone.join("\n")).toContain(CONTRACT);
  });

  it("strips what would break a line from a named branch before it prints", async () => {
    const { cwd, hash } = await seeded();
    const hidden = String.fromCodePoint(0x200b);
    rest.routes.set(ISSUE, issue(plannedBody(hash, `feat/ot${hidden}her`)));

    const { doc } = await contract(cwd);

    expect(doc.notDone.join("\n")).toContain("feat/other");
    expect(doc.notDone.join("\n")).not.toContain(hidden);
  });

  describe("usage", () => {
    const usage = (args: readonly string[]) => runInProcess([runCommand], ["run", ...args], { env: { PATH: process.env["PATH"] } });

    it("needs --run and --item, exit 2, before git or REST", async () => {
      const noRun = await usage(["contract", "--item", ITEM]);
      expect(noRun.code).toBe(2);
      expect(noRun.stderr).toContain("run contract needs --run <run-id>");

      const noItem = await usage(["contract", "--run", RUN]);
      expect(noItem.code).toBe(2);
      expect(noItem.stderr).toContain("run contract needs --item <owner/repo#n>");
      expect(rest.calls).toEqual([]);
    });

    it.each(["o/r", "o/r#0", "o/r#x", "#7", "o/r/x#7", "-o/r#7", "o/r#7 --x"])("refuses --item %s, exit 2", async (item) => {
      const { code, stderr } = await usage(["contract", "--run", RUN, "--item", item]);
      expect(code).toBe(2);
      expect(stderr).toContain("an item is owner/repo#<number>.");
    });

    it("refuses a run id outside the run folder's grammar", async () => {
      const { code, stderr } = await usage(["contract", "--run", "not a run", "--item", ITEM]);
      expect(code).not.toBe(0);
      expect(stderr).toContain("is not a run id");
      expect(rest.calls).toEqual([]);
    });

    it("keeps --item to contract and the other verbs' options off it", async () => {
      const land = await usage(["land", "--run", RUN, "--item", ITEM]);
      expect(land.code).toBe(2);
      expect(land.stderr).toContain("--item does not apply to land");

      const paths = await usage(["contract", "--run", RUN, "--item", ITEM, "--paths", "a.txt"]);
      expect(paths.code).toBe(2);
      expect(paths.stderr).toContain("--paths does not apply to contract");
    });
  });

  it("passes the shell guard: the verb pushes nothing, so no run verb rule reads it", () => {
    const line = `stamity run contract --run ${RUN} --item ${ITEM} --json`;
    expect(personOnlyVerdict(line, { defaultBranches: ["main"], currentBranch: BRANCH, tags: [] })).toEqual({ deny: false });
  });
});
