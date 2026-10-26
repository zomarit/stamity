import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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

/**
 * REQ-FLOW-028 with REQ-FLOW-016: the engine's machine-local files go with the
 * setup, so no file is left whose ignore line `clean` took back. The take-back
 * runs after the files are gone, and the manifest goes only after it (review/58).
 */
describe("clean removes the machine-local files and then their ignore lines (REQ-FLOW-028)", () => {
  /** The four machine-local files a session writes, as their writers leave them. */
  const MACHINE_LOCAL: Readonly<Record<string, string>> = {
    ".stamity/client-models.json": `${JSON.stringify({ listed: { codex: { ids: ["gpt-6-sol"], source: "codex-debug-models" } } })}\n`,
    ".stamity/preflight-canary.json": `${JSON.stringify({ at: new Date().toISOString() })}\n`,
    ".stamity/run-ended.json": `${JSON.stringify({ run: "2026-10-25_work", at: new Date().toISOString() })}\n`,
    [`.stamity/context-once/${"ab".repeat(32)}`]: "",
  };
  const MACHINE_LOCAL_LINES = [".stamity/client-models.json", ".stamity/preflight-canary.json", ".stamity/run-ended.json", ".stamity/context-once/"];

  async function writeMachineLocal(root: string): Promise<void> {
    await mkdir(join(root, ".stamity", "context-once"), { recursive: true });
    for (const [path, body] of Object.entries(MACHINE_LOCAL)) await writeFile(join(root, ...path.split("/")), body, "utf8");
  }

  it("leaves none of them, no ignore line for them, and git status as it was before init", async () => {
    const root = await freshRepo();
    const before = await snapshot(root);
    const statusBefore = status(root);

    await run(root, ["init", "-y", "--tools", FOUR_CLIENTS]);
    await writeMachineLocal(root);
    await run(root, ["clean", "-y"]);

    for (const path of Object.keys(MACHINE_LOCAL)) expect(existsSync(join(root, ...path.split("/"))), path).toBe(false);
    expect(existsSync(join(root, ".stamity"))).toBe(false);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
    expect(await snapshotBesideSettings(root)).toEqual(before);
    expect(status(root)).toBe(statusBefore);
  }, 120_000);

  it("keeps a filled .env.mcp ignored while every machine-local line goes", async () => {
    const root = await freshRepo();
    await run(root, ["init", "-y", "--tools", FOUR_CLIENTS]);
    await run(root, ["config", "mcp", "add", "github", "-y"]);
    await run(root, ["sync"]);
    const filled = (await readFile(join(root, ".env.mcp"), "utf8")).replace(/^(GITHUB_[A-Z_]+)=$/m, "$1=filled-by-the-owner");
    await writeFile(join(root, ".env.mcp"), filled, "utf8");
    await writeMachineLocal(root);

    await run(root, ["clean", "-y"]);

    expect(await readFile(join(root, ".env.mcp"), "utf8")).toBe(filled);
    expect(git(root, ["check-ignore", "-q", ".env.mcp"]).status).toBe(0);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(".env.mcp\n");
  }, 180_000);

  it.skipIf(process.platform === "win32")("keeps a client model cache that is a link, names it, and keeps its ignore line", async () => {
    const root = await freshRepo();
    await run(root, ["init", "-y", "--tools", FOUR_CLIENTS]);
    const outside = tempDir().path("models-elsewhere.json");
    await writeFile(outside, MACHINE_LOCAL[".stamity/client-models.json"] ?? "", "utf8");
    await symlink(outside, join(root, ".stamity", "client-models.json"));

    const out = await run(root, ["clean", "-y"]);

    expect((await lstat(join(root, ".stamity", "client-models.json"))).isSymbolicLink()).toBe(true);
    expect(await readFile(outside, "utf8")).toBe(MACHINE_LOCAL[".stamity/client-models.json"]);
    expect(out).toContain("Left .stamity/client-models.json: it is a link, so clean did not follow it.");
    expect((await readFile(join(root, ".gitignore"), "utf8")).split("\n")).toContain(".stamity/client-models.json");
    for (const line of MACHINE_LOCAL_LINES.filter((entry) => entry !== ".stamity/client-models.json")) {
      expect((await readFile(join(root, ".gitignore"), "utf8")).split("\n"), line).not.toContain(line);
    }
  }, 120_000);

  it("keeps the take-back working across the kept manifest: lines stay while a hook still runs from .stamity/, and the re-run takes them back (b4's review/29)", async () => {
    const root = await freshRepo();
    const before = await snapshot(root);
    await run(root, ["init", "-y", "--tools", "claude"]);
    await writeMachineLocal(root);
    const settings = join(root, KEPT_SETTINGS);
    const wired = await readFile(settings, "utf8");
    // The owner's comment line: the document no longer parses, so the sweep keeps it whole, still running every copy.
    await writeFile(settings, `// team settings\n${wired}`, "utf8");
    const ignoreDuring = await readFile(join(root, ".gitignore"), "utf8");

    await run(root, ["clean", "-y"]);

    expect(existsSync(join(root, ".stamity", "manifest.json"))).toBe(true);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(ignoreDuring);
    for (const path of Object.keys(MACHINE_LOCAL)) expect(existsSync(join(root, ...path.split("/"))), path).toBe(false);

    // The owner takes the comment out: the wiring is the engine's again, and the re-run finishes.
    await writeFile(settings, wired, "utf8");
    await run(root, ["clean", "-y"]);

    expect(existsSync(join(root, ".stamity"))).toBe(false);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
    expect(await snapshotBesideSettings(root)).toEqual(before);
  }, 180_000);
});

/**
 * REQ-FLOW-027, the import part: the owner's instruction files, taken in by
 * `--import-config supplement` or written over by `replace`, come back byte for
 * byte after `clean -y`. Leading whitespace, a BOM and a missing final newline
 * are the bytes a normalising prepend or strip loses.
 */
describe("init --import-config then clean restores the owner's instruction files (REQ-FLOW-027)", () => {
  // Fixture names kept out of the test-input census: built at run time, as a literal each names this repository's own file.
  const AGENTS = ["AGENTS", "md"].join(".");
  const CLAUDE = ["CLAUDE", "md"].join(".");
  const OWNER_AGENTS = "\n\n  # Team\n\nno final newline";
  const OWNER_CLAUDE = "\uFEFF# Claude notes\n\nkeep the BOM\n";

  async function ownerRepo(): Promise<string> {
    const root = await freshRepo();
    await writeFile(join(root, AGENTS), OWNER_AGENTS, "utf8");
    await writeFile(join(root, CLAUDE), OWNER_CLAUDE, "utf8");
    return root;
  }

  /** Every name in the root folder that starts with `AGENTS.md.bak`. */
  async function agentsBackups(root: string): Promise<string[]> {
    return (await readdir(root)).filter((name) => name.startsWith("AGENTS.md.bak"));
  }

  it("gives back a supplemented AGENTS.md and CLAUDE.md byte-identical", async () => {
    const root = await ownerRepo();

    await run(root, ["init", "-y", "--tools", "claude", "--import-config", "supplement"]);
    // The setup did take both files in: the round trip below is not a no-op.
    expect(await readFile(join(root, AGENTS), "utf8")).toContain("STAMITY:BEGIN");
    expect(await readFile(join(root, AGENTS), "utf8")).toContain(OWNER_AGENTS);
    expect(await readFile(join(root, CLAUDE), "utf8")).toContain(OWNER_CLAUDE);
    await run(root, ["clean", "-y"]);

    expect(await readFile(join(root, AGENTS), "utf8")).toBe(OWNER_AGENTS);
    expect(await readFile(join(root, CLAUDE), "utf8")).toBe(OWNER_CLAUDE);
    expect(await agentsBackups(root)).toEqual([]);
  }, 120_000);

  it("records the backup a replace took, and moves it back after clean", async () => {
    const root = await ownerRepo();

    await run(root, ["init", "-y", "--tools", "claude", "--import-config", "replace"]);
    const manifest = await readManifest(root);
    const decision = manifest?.importChoice?.find((row) => row.path === AGENTS);
    expect(decision).toEqual({
      path: AGENTS,
      mode: "replace",
      backup: { path: "AGENTS.md.bak", sha256: createHash("sha256").update(OWNER_AGENTS, "utf8").digest("hex") },
    });
    // The owner's text is gone from AGENTS.md while the setup stands: replace wrote over it.
    expect(await readFile(join(root, AGENTS), "utf8")).not.toContain("# Team");
    await run(root, ["clean", "-y"]);

    expect(await readFile(join(root, AGENTS), "utf8")).toBe(OWNER_AGENTS);
    expect(await readFile(join(root, CLAUDE), "utf8")).toBe(OWNER_CLAUDE);
    expect(await agentsBackups(root)).toEqual([]);
  }, 120_000);
});
