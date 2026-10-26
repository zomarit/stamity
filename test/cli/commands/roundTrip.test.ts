import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../../src/cli.ts";
import { readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { seedGitRepo } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * REQ-FLOW-027 (the `.gitignore` part) and REQ-FLOW-016: setup then `clean`
 * restores the repository byte for byte. `init` records each ignore line it
 * appends (`coOwned.lines` on the `.gitignore` row), and `clean` takes back
 * exactly those, once the file each one ignores is gone.
 *
 * Real filesystem, real git and the real composed planner, through the
 * in-process CLI funnel: the contract is what `git status --porcelain
 * --ignored` prints before and after, which no double of the planner or of git
 * can answer for.
 */
/* oxlint-disable no-await-in-loop */

const tempDir = useTempDir("stamity-round-trip");

const FOUR_CLIENTS = "claude,codex,cursor,copilot";

/** Every file under `dir` but `.git/`, as `posix/path -> content`. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const seen: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      const key = relative(dir, abs).split(sep).join("/");
      if (key === ".git") continue;
      if (entry.isDirectory()) await walk(abs);
      else seen[key] = await readFile(abs, "utf8");
    }
  };
  await walk(dir);
  return seen;
}

/** git's answer for `root`, by this repository's own rules: no machine-wide excludes file. */
function git(root: string, args: readonly string[]): { status: number | null; stdout: string } {
  const noGlobal = `core.excludesFile=${join(root, ".no-global-excludes")}`;
  const result = spawnSync("git", ["-c", noGlobal, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout };
}

/**
 * The one exception REQ-FLOW-027 names (`2026-10-25_autonomy-distribution-02/build/7`): every
 * file that existed before is byte-identical and no other file exists, except
 * `.claude/settings.json`, which keeps the deny and ask rows the engine recorded (REQ-FLOW-036).
 * The engine records those rows and never owns one, so `clean` leaves them
 * (`src/manifest/claudeSettings.ts`).
 */
const KEPT_SETTINGS = ".claude/settings.json";

/** `git status --porcelain --ignored`, less the kept settings document's own line. */
const status = (root: string): string =>
  git(root, ["status", "--porcelain", "--ignored"])
    .stdout.split("\n")
    .filter((line) => line !== "?? .claude/")
    .join("\n");

/** {@link snapshot} less the kept settings document. */
async function snapshotBesideSettings(dir: string): Promise<Record<string, string>> {
  const { [KEPT_SETTINGS]: _kept, ...rest } = await snapshot(dir);
  return rest;
}

async function run(root: string, argv: readonly string[]): Promise<string> {
  const result = await runInProcess(COMMANDS, argv, { cwd: root });
  expect(result.code, `${argv.join(" ")}: ${result.stdout}\n${result.stderr}`).toBe(0);
  return result.stdout;
}

async function freshRepo(gitignore?: string): Promise<string> {
  const root = tempDir().path("repo");
  await mkdir(root, { recursive: true });
  await seedGitRepo(root);
  if (gitignore !== undefined) await writeFile(join(root, ".gitignore"), gitignore, "utf8");
  return root;
}

describe("init then clean restores .gitignore byte for byte (REQ-FLOW-027)", () => {
  it("leaves no .gitignore where there was none, every file byte-identical and git status unchanged", async () => {
    const root = await freshRepo();
    const before = await snapshot(root);
    const statusBefore = status(root);

    await run(root, ["init", "-y", "--tools", FOUR_CLIENTS]);
    // The setup did write lines: the round trip below is not a no-op.
    expect(await readFile(join(root, ".gitignore"), "utf8")).toContain(".stamity/review-gate.json\n");
    await run(root, ["clean", "-y"]);

    expect(await snapshotBesideSettings(root)).toEqual(before);
    expect(status(root)).toBe(statusBefore);
    expect(git(root, ["status", "--porcelain", "--ignored"]).stdout).not.toContain(".gitignore");
  }, 120_000);

  it.each([
    ["with a final newline", "node_modules/\n"],
    ["without a final newline", "node_modules/"],
    ["on CRLF", "node_modules/\r\ndist/\r\n"],
  ])("gives a pre-existing .gitignore %s back byte-identical", async (_label, original) => {
    const root = await freshRepo(original);
    const statusBefore = status(root);

    await run(root, ["init", "-y", "--tools", FOUR_CLIENTS]);
    const during = await readFile(join(root, ".gitignore"), "utf8");
    expect(during.startsWith(original)).toBe(true);
    expect(during.length).toBeGreaterThan(original.length);
    if (original.includes("\r\n")) expect(during).not.toMatch(/[^\r]\n/);
    await run(root, ["clean", "-y"]);

    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(original);
    expect(status(root)).toBe(statusBefore);
  }, 120_000);

  it("keeps a filled .env.mcp ignored after clean, and keeps its line once no server needs it and no file is there", async () => {
    const root = await freshRepo("node_modules/\n");
    await run(root, ["init", "-y", "--tools", "claude"]);
    await run(root, ["config", "mcp", "add", "github", "-y"]);
    await run(root, ["sync"]);
    expect((await readFile(join(root, ".gitignore"), "utf8")).split("\n")).toContain(".env.mcp");
    const filled = (await readFile(join(root, ".env.mcp"), "utf8")).replace(/^(GITHUB_[A-Z_]+)=$/m, "$1=filled-by-the-owner");
    await writeFile(join(root, ".env.mcp"), filled, "utf8");

    // A copy of the same setup standing for another checkout: no server needs a credential and no
    // .env.mcp is on disk there, yet the committed line may be what keeps a filled one ignored elsewhere.
    const deletedFirst = tempDir().path("deleted-first");
    await cp(root, deletedFirst, { recursive: true });

    await run(root, ["clean", "-y"]);
    expect(await readFile(join(root, ".env.mcp"), "utf8")).toBe(filled);
    expect(git(root, ["check-ignore", "-q", ".env.mcp"]).status).toBe(0);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("node_modules/\n.env.mcp\n");

    // TEST CHANGE, justified: review/28 — neither sync nor clean takes back the .env.mcp line once
    // written; it read "the next clean removes the line" (plan round 2), which the sign-off reversed.
    await rm(join(deletedFirst, ".env.mcp"));
    const manifest = await readManifest(deletedFirst);
    if (manifest === null) throw new Error("the copy lost its manifest");
    await writeManifest(deletedFirst, { ...manifest, mcp: { servers: [] } });
    await run(deletedFirst, ["sync"]);
    expect((await readFile(join(deletedFirst, ".gitignore"), "utf8")).split("\n")).toContain(".env.mcp");
    await run(deletedFirst, ["clean", "-y"]);
    expect(await readFile(join(deletedFirst, ".gitignore"), "utf8")).toBe("node_modules/\n.env.mcp\n");
  }, 180_000);
});
