import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { awayCommand } from "../../../src/cli/commands/away.ts";
import { runInProcess } from "../../support/inProcess.ts";
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
});
