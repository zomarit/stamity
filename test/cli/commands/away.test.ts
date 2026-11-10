import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, type TestContext } from "vitest";
import { awayCommand } from "../../../src/cli/commands/away.ts";
import { CLAUDE_HOOKS_DIR } from "../../../src/hooks/model.ts";
import { PERSON_ONLY_GUARD_FILE, planCoreHookScripts } from "../../../src/hooks/scripts.ts";
import { CHILD_TIMEOUT_MS } from "../../support/childTimeout.ts";
import { canonical } from "../../support/identity.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { seedGitRepo } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * `stamity away` (REQ-FLOW-166): the nobody-watching switch's marker, written, removed and reported, and the held list
 * the guard writes while it is on. Nothing is mocked: the verb reads and writes two files in a scratch folder, and the
 * environment is the funnel's own `env` option, empty unless a case names the variable.
 */

const MARKER = ".stamity/away.json";
const HELD = ".stamity/away-held.jsonl";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const heldLine = (act: string, rule: string, at: string): string => `${JSON.stringify({ at, rule, act, client: "claude" })}\n`;
const THREE_HELD =
  heldLine("A merge of a pull request", "gh-pr-merge", "2026-11-09T22:10:00.000Z") +
  heldLine("A push to the default branch", "push-default", "2026-11-09T22:11:00.000Z") +
  heldLine("A call to the GitHub MCP server", "merge_pull_request", "2026-11-09T22:12:00.000Z");

describe("stamity away", () => {
  const getRoot = useTempDir("away");

  /** A project root: a folder holding `.stamity/`, plus any files a case names. */
  async function project(files: Record<string, string> = {}): Promise<string> {
    const root = getRoot();
    await root.seedFiles({ ".stamity/manifest.json": "{}\n", ...files });
    return root.dir;
  }

  const away = (cwd: string, argv: readonly string[], env: Record<string, string> = {}) =>
    runInProcess([awayCommand], ["away", ...argv], { cwd, env });

  const json = async (cwd: string, argv: readonly string[], env: Record<string, string> = {}): Promise<Record<string, unknown>> => {
    const result = await away(cwd, [...argv, "--json"], env);
    expect(result.code, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as Record<string, unknown>;
  };

  it("on writes the marker with its time, and status then reads on with source marker", async () => {
    const cwd = await project();

    const on = await away(cwd, ["on"]);

    expect(on.code, on.stderr).toBe(0);
    const marker = JSON.parse(readFileSync(join(cwd, MARKER), "utf8")) as Record<string, unknown>;
    expect(marker["by"]).toBe("stamity away");
    expect(String(marker["since"])).toMatch(ISO);
    const status = await away(cwd, ["status"]);
    expect(status.code, status.stderr).toBe(0);
    expect(status.stdout).toContain("away: on\n");
    expect(status.stdout).toContain("source: marker\n");
    expect(status.stdout).toContain(`since: ${String(marker["since"])}\n`);
    expect(await json(cwd, ["status"])).toMatchObject({ subcommand: "status", away: true, source: "marker", held: 0 });
  });

  it("off removes the marker, and status then reads off with no source", async () => {
    const cwd = await project();
    expect((await away(cwd, ["on"])).code).toBe(0);

    const off = await away(cwd, ["off"]);

    expect(off.code, off.stderr).toBe(0);
    expect(existsSync(join(cwd, MARKER))).toBe(false);
    expect(off.stdout).toContain("away: off\n");
    const status = await away(cwd, ["status"]);
    expect(status.stdout).toContain("away: off\n");
    expect(status.stdout).toContain("source: none\n");
    expect(await json(cwd, ["status"])).toMatchObject({ away: false, source: "none" });
  });

  it("reads the variable as the source env, both beside the marker, and off where it is 0, false or empty", async () => {
    const cwd = await project();

    expect(await json(cwd, ["status"], { STAMITY_NOBODY_WATCHING: "1" })).toMatchObject({ away: true, source: "env" });
    const offValues = ["0", "false", " FALSE ", ""];
    const offDocs = await Promise.all(offValues.map((value) => json(cwd, ["status"], { STAMITY_NOBODY_WATCHING: value })));
    offDocs.forEach((doc, index) => expect(doc, JSON.stringify(offValues[index])).toMatchObject({ away: false, source: "none" }));
    expect((await away(cwd, ["on"])).code).toBe(0);
    expect(await json(cwd, ["status"], { STAMITY_NOBODY_WATCHING: "yes" })).toMatchObject({ away: true, source: "both" });
  });

  it("off with the variable set removes the marker and says the variable still holds the switch on", async () => {
    const cwd = await project();
    expect((await away(cwd, ["on"])).code).toBe(0);

    const off = await away(cwd, ["off"], { STAMITY_NOBODY_WATCHING: "1" });

    expect(off.code, off.stderr).toBe(0);
    expect(existsSync(join(cwd, MARKER))).toBe(false);
    expect(off.stdout).toContain("away: on\n");
    expect(off.stdout).toContain("STAMITY_NOBODY_WATCHING is set, so the switch stays on");
    expect(await json(cwd, ["off"], { STAMITY_NOBODY_WATCHING: "1" })).toMatchObject({ subcommand: "off", removed: false, away: true, source: "env" });
  });

  it("on twice keeps the first since and says it was already on", async () => {
    const cwd = await project();
    expect((await away(cwd, ["on"])).code).toBe(0);
    const first = readFileSync(join(cwd, MARKER), "utf8");

    const again = await away(cwd, ["on"]);

    expect(again.code, again.stderr).toBe(0);
    expect(readFileSync(join(cwd, MARKER), "utf8")).toBe(first);
    const since = String((JSON.parse(first) as Record<string, unknown>)["since"]);
    expect(again.stdout).toContain(`already on since ${since}`);
    expect(await json(cwd, ["on"])).toMatchObject({ subcommand: "on", written: false, away: true, since });
  });

  it("status counts the held list and prints each held act, its rule and its time, skipping a line that is no entry", async () => {
    const cwd = await project({ [HELD]: `${THREE_HELD}not json\n{"rule":"x","act":7,"at":"y"}\n\n` });

    const status = await away(cwd, ["status"]);

    expect(status.code, status.stderr).toBe(0);
    expect(status.stdout).toContain("held: 3\n");
    expect(status.stdout).toContain("- A merge of a pull request (gh-pr-merge, 2026-11-09T22:10:00.000Z)\n");
    expect(status.stdout).toContain("- A push to the default branch (push-default, 2026-11-09T22:11:00.000Z)\n");
    expect(status.stdout).toContain("- A call to the GitHub MCP server (merge_pull_request, 2026-11-09T22:12:00.000Z)\n");
    const doc = await json(cwd, ["status"]);
    expect(doc["held"]).toBe(3);
    expect(doc["heldList"]).toEqual([
      { rule: "gh-pr-merge", act: "A merge of a pull request", at: "2026-11-09T22:10:00.000Z" },
      { rule: "push-default", act: "A push to the default branch", at: "2026-11-09T22:11:00.000Z" },
      { rule: "merge_pull_request", act: "A call to the GitHub MCP server", at: "2026-11-09T22:12:00.000Z" },
    ]);
  });

  it("status counts none where the held list is missing or no line of it is an entry, and does not fail", async () => {
    const missing = await project();
    expect(await json(missing, ["status"])).toMatchObject({ held: 0, heldList: [] });
    const malformed = await project({ [HELD]: "not json\n[1,2]\nnull\n" });
    const status = await away(malformed, ["status"]);
    expect(status.code, status.stderr).toBe(0);
    expect(status.stdout).toContain("held: 0\n");
  });

  it("drops what a terminal would act on from each held line it prints", async () => {
    const cwd = await project({ [HELD]: heldLine("A push\u001b[2J to main", "push-default", "2026-11-09T22:11:00.000Z") });

    const status = await away(cwd, ["status"]);

    expect(status.stdout).not.toContain("\u001b");
    expect(status.stdout).toContain("held: 1\n");
  });

  it("on refuses where the folder holds no .stamity/, and writes nothing", async () => {
    const cwd = getRoot().dir;

    const on = await away(cwd, ["on"]);

    expect(on.code).toBe(1);
    expect(on.stderr).toContain(".stamity/");
    expect(on.stderr).toContain("project root");
    expect(existsSync(join(cwd, ".stamity"))).toBe(false);
  });

  it("writes and removes nothing under --dry-run", async () => {
    const cwd = await project();

    const on = await away(cwd, ["on", "--dry-run"]);
    expect(on.code, on.stderr).toBe(0);
    expect(on.stdout).toContain(`Would write ${MARKER}`);
    expect(existsSync(join(cwd, MARKER))).toBe(false);

    expect((await away(cwd, ["on"])).code).toBe(0);
    const off = await away(cwd, ["off", "--dry-run"]);
    expect(off.code, off.stderr).toBe(0);
    expect(off.stdout).toContain(`Would remove ${MARKER}`);
    expect(existsSync(join(cwd, MARKER))).toBe(true);
  });

  it("off says the marker was not there, and exits 0", async () => {
    const cwd = await project();

    const off = await away(cwd, ["off"]);

    expect(off.code, off.stderr).toBe(0);
    expect(off.stdout).toContain(`${MARKER} was not there`);
  });

  it("off refuses a folder at the marker's name, which the guard reads as on, and leaves it", async () => {
    const cwd = await project();
    mkdirSync(join(cwd, MARKER));

    expect(await json(cwd, ["status"])).toMatchObject({ away: true, source: "marker" });
    const off = await away(cwd, ["off"]);

    expect(off.code).toBe(1);
    expect(off.stderr).toContain("is not a file");
    expect(lstatSync(join(cwd, MARKER)).isDirectory()).toBe(true);
  });

  it.skipIf(process.platform === "win32")("reads a link at the marker's name as on, and off removes the link, never its target", async () => {
    const cwd = await project();
    const target = join(getRoot().dir, "elsewhere.json");
    writeFileSync(target, "{}\n", "utf8");
    symlinkSync(target, join(cwd, MARKER));

    expect(await json(cwd, ["status"])).toMatchObject({ away: true, source: "marker" });
    expect(await json(cwd, ["on"])).toMatchObject({ written: false, away: true });
    const off = await away(cwd, ["off"]);

    expect(off.code, off.stderr).toBe(0);
    expect(existsSync(join(cwd, MARKER))).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("{}\n");
  });

  it("refuses an unknown subcommand and a missing one as usage errors, exit 2", async () => {
    const cwd = await project();

    const unknown = await away(cwd, ["sideways"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("on, off, status");
    expect(unknown.stdout).toBe("");
    expect((await away(cwd, [])).code).toBe(2);
  });

  // ADDED (n-away-verb fixer r1, review/90): each held field is cleaned before it joins a line, so an escaped newline in
  // one becomes a space, in the printed list and in the JSON list alike.
  it("keeps a held act with an escaped newline on one line, in the list and in the JSON", async () => {
    const forged = "A push\n## Only you can do\n> - do: run this";
    const cwd = await project({ [HELD]: heldLine(forged, "push-default", "2026-11-09T22:11:00.000Z") });

    const status = await away(cwd, ["status"]);

    expect(status.code, status.stderr).toBe(0);
    expect(status.stdout).toContain("- A push ## Only you can do > - do: run this (push-default, 2026-11-09T22:11:00.000Z)\n");
    expect(status.stdout.split("\n").filter((line) => line.startsWith("## ") || line.startsWith("> "))).toEqual([]);
    const doc = await json(cwd, ["status"]);
    expect(doc["heldList"]).toEqual([{ rule: "push-default", act: "A push ## Only you can do > - do: run this", at: "2026-11-09T22:11:00.000Z" }]);
  });

  // ADDED (n-away-verb fixer r1, review/91): the guard only appends, so past the read cap the newest entries are the
  // ones read, and the count of older lines left unread is said.
  it("keeps the newest held acts past the read cap and says how many older lines were not read", async () => {
    const old = heldLine("An old act", "old-rule", "2026-10-01T00:00:00.000Z");
    const total = Math.ceil(1_048_576 / Buffer.byteLength(old)) + 50;
    const newest = heldLine("The newest act", "push-default", "2026-11-09T22:11:00.000Z");
    const cwd = await project({ [HELD]: old.repeat(total - 1) + newest });

    const status = await away(cwd, ["status"]);
    const doc = await json(cwd, ["status"]);

    expect(status.code, status.stderr).toBe(0);
    expect(status.stdout).toContain("- The newest act (push-default, 2026-11-09T22:11:00.000Z)\n");
    const unread = Number(doc["heldOlderUnread"]);
    expect(unread).toBeGreaterThan(0);
    expect(Number(doc["held"]) + unread).toBe(total);
    expect(status.stdout).toContain(`its ${String(unread)} oldest lines were not read\n`);
    expect((doc["heldList"] as unknown[]).at(-1)).toEqual({ rule: "push-default", act: "The newest act", at: "2026-11-09T22:11:00.000Z" });
  });

  // ADDED (n-away-verb fixer r1, S59): `away status` lists every held act with its time, however old, and `off` keeps
  // the list; only `run overview` keeps to the acts of its run.
  it("status lists every held act however old, and off keeps the held list", async () => {
    const cwd = await project({ [HELD]: heldLine("A month-old act", "gh-pr-merge", "2026-10-01T00:00:00.000Z") + THREE_HELD });
    expect((await away(cwd, ["on"])).code).toBe(0);

    expect((await away(cwd, ["off"])).code).toBe(0);
    const status = await away(cwd, ["status"]);

    expect(existsSync(join(cwd, HELD))).toBe(true);
    expect(status.stdout).toContain("held: 4\n");
    expect(status.stdout).toContain("- A month-old act (gh-pr-merge, 2026-10-01T00:00:00.000Z)\n");
  });

  // ADDED (n-away-verb fixer r1, build/53 and review M-2): the verb acts on the marker at the repository's top, where the
  // guard reads it, from any folder under it, and a `.stamity` that is a link to a folder is followed, as the guard does.
  it("acts on the marker at the repository's top from a folder under it", async ({ skip }) => {
    const cwd = await project({ "packages/web/README.md": "a package\n" });
    try {
      await seedGitRepo(cwd);
    } catch (error) {
      if ((error as Error).name === "GitUnavailableError") skip("git is not installed here");
      throw error;
    }
    const below = join(cwd, "packages", "web");

    expect((await away(below, ["on"])).code).toBe(0);
    expect(existsSync(join(cwd, MARKER))).toBe(true);
    expect(existsSync(join(below, ".stamity"))).toBe(false);
    expect(await json(below, ["status"])).toMatchObject({ away: true, source: "marker" });
    expect((await away(below, ["off"])).code).toBe(0);
    expect(existsSync(join(cwd, MARKER))).toBe(false);
  });

  it.skipIf(process.platform === "win32")("on follows a .stamity that is a link to a folder, as the guard reads through it", async () => {
    const root = getRoot();
    await root.seedFiles({ "main/.stamity/manifest.json": "{}\n", "lane/README.md": "a lane\n" });
    symlinkSync(join(root.dir, "main", ".stamity"), join(root.dir, "lane", ".stamity"));
    const lane = join(root.dir, "lane");

    const on = await away(lane, ["on"]);

    expect(on.code, on.stderr).toBe(0);
    expect(existsSync(join(root.dir, "main", MARKER))).toBe(true);
    expect(await json(lane, ["status"])).toMatchObject({ away: true, source: "marker" });
  });

  // ADDED (n-away-verb fixer r3, build/53 and review/105): the guard's root is the folder above the hooks folder it was
  // emitted into, the folder `stamity init` set up, and that folder can sit below git's top. The verb walks up from where
  // it runs to the nearest setup, no further than git's top.
  describe("finds the setup the guard reads", () => {
    /** A git repository at the case's scratch folder, with a setup's manifest in each folder named (top-relative). */
    async function repoWithSetups(skip: TestContext["skip"], setups: readonly string[]): Promise<string> {
      const top = getRoot().dir;
      try {
        await seedGitRepo(top);
      } catch (error) {
        if ((error as Error).name === "GitUnavailableError") skip("git is not installed here");
        throw error;
      }
      await getRoot().seedFiles(Object.fromEntries(setups.map((setup) => [join(setup, ".stamity", "manifest.json"), "{}\n"])));
      return top;
    }

    /** The real person-only guard for Claude Code, placed in `setup` where emission writes it; returns its path. */
    function placeGuard(setup: string): string {
      // TEST CHANGE, justified (u-ci1): the package name is read from this checkout's manifest, not spelled, so a renamed
      // fork runs this case unedited (test/ci/forkIdentity.test.ts); the guard's away marker does not depend on the name.
      const guard = planCoreHookScripts("../../agent-tool-policies.json", "claude", {
        packageName: canonical().name,
        version: "1.0.0-golden",
        personOnlyGuard: true,
        layout: "claude",
      }).find((script) => script.fileName === PERSON_ONLY_GUARD_FILE);
      if (guard === undefined) throw new Error("the plan carried no person-only guard");
      const folder = join(setup, ...CLAUDE_HOOKS_DIR.split("/"));
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, guard.fileName), guard.content, "utf8");
      return join(folder, guard.fileName);
    }

    /** What the guard answers a shell call run from `cwd`, as Claude Code hands it over, with the switch's variable unset. */
    function guardSays(guard: string, cwd: string, command: string): "ask" | "refuse" | "allow" {
      const env = { ...process.env };
      for (const name of ["STAMITY_UNATTENDED", "STAMITY_REPO_ROOT", "STAMITY_NOBODY_WATCHING"]) delete env[name];
      const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
      const result = spawnSync(process.execPath, [guard], { cwd, input, encoding: "utf8", env, timeout: CHILD_TIMEOUT_MS });
      if (result.status === 2) return "refuse";
      expect(result.status, String(result.stderr)).toBe(0);
      return String(result.stdout).includes('"permissionDecision":"ask"') ? "ask" : "allow";
    }

    it("acts on a setup below git's top, the marker its own emitted guard reads, from a folder under that setup", async ({ skip }) => {
      const top = await repoWithSetups(skip, ["packages/api"]);
      const setup = join(top, "packages", "api");
      const below = join(setup, "src");
      mkdirSync(below, { recursive: true });
      const guard = placeGuard(setup);
      // Non-degenerate: with the switch off, the same call asks.
      expect(guardSays(guard, below, "npm publish")).toBe("ask");

      const on = await away(below, ["on"]);

      expect(on.code, on.stderr).toBe(0);
      expect(existsSync(join(setup, MARKER))).toBe(true);
      expect(existsSync(join(top, ".stamity"))).toBe(false);
      expect(guardSays(guard, below, "npm publish")).toBe("refuse");
      // The held list the guard wrote is the one the verb reads.
      expect(await json(below, ["status"])).toMatchObject({ away: true, source: "marker", held: 1 });
      expect((await away(below, ["off"])).code).toBe(0);
      expect(existsSync(join(setup, MARKER))).toBe(false);
      expect(guardSays(guard, below, "npm publish")).toBe("ask");
    });

    it("takes the nearest setup where git's top holds one too", async ({ skip }) => {
      const top = await repoWithSetups(skip, ["", "packages/api"]);
      const setup = join(top, "packages", "api");
      mkdirSync(join(setup, "src"), { recursive: true });
      mkdirSync(join(top, "docs"), { recursive: true });

      expect((await away(join(setup, "src"), ["on"])).code).toBe(0);
      expect(existsSync(join(setup, MARKER))).toBe(true);
      expect(existsSync(join(top, MARKER))).toBe(false);
      expect(await json(join(top, "docs"), ["status"])).toMatchObject({ away: false, source: "none" });
      expect((await away(join(top, "docs"), ["on"])).code).toBe(0);
      expect(existsSync(join(top, MARKER))).toBe(true);
    });

    it("refuses on and off where no setup is at or above the folder, naming where it looked; status reads the variable alone", async ({ skip }) => {
      const top = await repoWithSetups(skip, ["packages/api"]);

      const on = await away(top, ["on"]);
      const off = await away(top, ["off"]);
      const status = await away(top, ["status"], { STAMITY_NOBODY_WATCHING: "1" });

      expect(on.code).toBe(1);
      expect(on.stderr).toContain(`found no .stamity/manifest.json in ${top}`);
      expect(on.stderr).toContain("run stamity away on in the folder stamity init set up, or in a folder below it");
      expect(off.code).toBe(1);
      expect(off.stderr).toContain("run stamity away off in the folder stamity init set up");
      expect(existsSync(join(top, ".stamity"))).toBe(false);
      expect(status.code, status.stderr).toBe(0);
      expect(status.stdout).toContain("away: on\nsource: env\nsetup: none found in ");
    });

    it("walks no further than git's top, so a setup around the repository is never the one switched", async ({ skip }) => {
      const outer = getRoot().dir;
      await getRoot().seedFiles({ ".stamity/manifest.json": "{}\n", "repo/sub/README.md": "a folder\n" });
      const repo = join(outer, "repo");
      try {
        await seedGitRepo(repo);
      } catch (error) {
        if ((error as Error).name === "GitUnavailableError") skip("git is not installed here");
        throw error;
      }

      const on = await away(join(repo, "sub"), ["on"]);

      expect(on.code).toBe(1);
      expect(on.stderr).toContain(`up to ${repo}`);
      expect(existsSync(join(outer, MARKER))).toBe(false);
    });
  });
});
