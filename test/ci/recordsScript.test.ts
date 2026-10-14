import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { carriedProcessEnv, NO_GIT_CONFIG } from "../support/repoFixtures.ts";
// @ts-expect-error — import-safe native ESM maintainer script with no type declarations, outside the product package.
import * as records from "../../scripts/records.mjs";
// @ts-expect-error — import-safe native ESM path list with no type declarations, outside the product package.
import { isRecordPath, KEEP_ON_MAIN, RECORDS_PATHSPECS } from "../../scripts/records-paths.mjs";

/**
 * REQ-PROVE-024: `scripts/records.mjs` publishes and restores the records branch without touching
 * `main`. Every case runs over a temporary bare repository acting as `origin` (a local `file://`
 * URL, never the real remote) and a clone of it whose `main` carried records, with `init` run and
 * the records then untracked from `main`, as after the move. Git runs with no system or global
 * configuration, so a contributor's signing or hooks cannot leak in.
 */

interface Result { code: number; lines: string[] }
type Env = Record<string, string>;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(ROOT, "scripts/records.mjs");
const POSIX = process.platform !== "win32";
const SPECS = RECORDS_PATHSPECS as readonly string[];
const GITKEEP = (KEEP_ON_MAIN as readonly string[])[0] ?? "";
const ALPHA = ".stamity/runs/2026-01-01_alpha";
const RUN = "evals/runs/2026-01-01-run-1";
const PLAN = "docs/plans/001-alpha.md";
// Built at run time so the test-input census does not read the name as this repository's README.md:
// here it is the records branch's template and its place at that branch's root.
const README = ["README", "md"].join(".");
// The fixture's own records-suite config, built at run time for the same reason: it is not this repository's file.
const SUITE_CONFIG = ["vitest", "records", "config", "ts"].join(".");
/** The per-checkout ref naming the records commit the checkout last restored or published. */
const SYNC_BASE = "refs/worktree/stamity/records-base";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

// The default gates run the real leak gate, hygiene check and records suite; these cases test the
// publish mechanics around them, so a recording runner stands in, and one describe runs the real one.
const passing = () => {
  const calls: { commit: string; base: string }[] = [];
  return { calls, run: async (input: { commit: string; base: string }) => { calls.push(input); return { failed: null, lines: [] }; } };
};

function world(options: { init?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "stamity-records-test-"));
  dirs.push(dir);
  const env: Env = {
    ...carriedProcessEnv(), HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync("git", ["-C", cwd, ...args], { env, encoding: "utf8", stdio: "pipe" }).trim();
  const write = (root: string, path: string, body: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  const origin = join(dir, "origin.git");
  const url = pathToFileURL(origin).href;
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--bare", "-q", origin], { env });
  const seed = join(dir, "seed");
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q", seed], { env });
  const files: Record<string, string> = {
    // The canonical ignore rules, so `commit`'s publish filter is the one `main` applies.
    ".gitignore": readFileSync(join(ROOT, ".gitignore"), "utf8"),
    "package.json": `${JSON.stringify({ name: "fixture", private: true })}\n`,
    // The records suite `commit` runs: vitest through node, never npm, so no shell is needed on Windows.
    [SUITE_CONFIG]: "export default { cacheDir: \".records-suite-cache\", test: { include: [\"records-suite.test.ts\"], globals: true } };\n",
    "records-suite.test.ts": "it(\"reads the records\", () => { if (process.env.RECORDS_SUITE_EXIT === \"1\") throw new Error(\"the records suite is red\"); });\n",
    "src/app.txt": "product\n",
    [GITKEEP]: "",
    [`${ALPHA}/record.md`]: "# alpha\n\nStatus: closed 2026-01-02\n",
    [`${ALPHA}/ledger.jsonl`]: "{\"id\":\"alpha/1\"}\n",
    [PLAN]: "# plan\n",
    [`${RUN}/RESULTS.md`]: "# results\n",
    [`${RUN}/tool.sh`]: "#!/bin/sh\necho tool\n",
  };
  for (const [path, body] of Object.entries(files)) write(seed, path, body);
  chmodSync(join(seed, RUN, "tool.sh"), 0o755);
  git(seed, "add", "-A");
  git(seed, "update-index", "--chmod=+x", `${RUN}/tool.sh`);
  git(seed, "-c", "commit.gpgsign=false", "commit", "-qm", "main with records");
  git(seed, "push", "-q", url, "main");
  const clone = join(dir, "clone");
  execFileSync("git", ["clone", "-q", url, clone], { env });
  const base = git(clone, "rev-parse", "HEAD");
  const opts = { root: clone, env };
  if (options.init !== false) {
    const imported = execFileSync(process.execPath, [SCRIPT, "init", "--base", base], { cwd: clone, env, encoding: "utf8" });
    expect(imported).toContain("pushed origin/records");
    git(clone, "rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", ...SPECS, `:(exclude)${GITKEEP}`);
    git(clone, "-c", "commit.gpgsign=false", "commit", "-qm", "records leave main");
    git(clone, "push", "-q", "origin", "main");
  }
  const refs = (cwd: string): string => git(cwd, "for-each-ref", "--format=%(refname) %(objectname)");
  const tree = (ref: string): string[] => git(origin, "ls-tree", "-r", "--name-only", ref).split("\n");
  const synced = (cwd: string): string => git(cwd, "rev-parse", "--verify", "--quiet", SYNC_BASE);
  /** A second clone of the same origin, restored, as another machine would be. */
  const machine = async (name: string): Promise<string> => {
    const path = join(dir, name);
    execFileSync("git", ["clone", "-q", url, path], { env });
    const restored: Result = await records.restore({ root: path, env });
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    return path;
  };
  return { dir, env, git, write, origin, url, clone, base, opts, refs, tree, synced, machine };
}

describe("the record paths", () => {
  it("names a record by its pathspec, never the kept placeholder or a path that leaves its folder", () => {
    for (const spec of SPECS) {
      expect(isRecordPath(spec), spec).toBe(true);
      expect(isRecordPath(`${spec}/x/y.md`), spec).toBe(true);
    }
    for (const path of [GITKEEP, "docs/plansx/a.md", "docs/plans/../specs/a.md", "docs/plans/./a.md",
      "docs/plans/.git/config", "docs/plans\\a.md", "docs/plans//a.md", "docs/specs/a.md", ""])
      expect(isRecordPath(path), path).toBe(false);
  });
});

describe("setup", { timeout: 60_000 }, () => {
  it("writes one byte-identical exclude block on every run, restores, and leaves no record path in status", async () => {
    const w = world();
    const exclude = join(w.clone, ".git/info/exclude");
    writeFileSync(exclude, "# mine\n");
    rmSync(join(w.clone, PLAN));
    w.write(w.clone, `${ALPHA}/notes.md`, "unpublished\n");
    const first: Result = await records.setup(w.opts);
    expect(first.code, first.lines.join("\n")).toBe(0);
    const once = readFileSync(exclude, "utf8");
    const second: Result = await records.setup(w.opts);
    expect(second.code).toBe(0);
    expect(readFileSync(exclude, "utf8")).toBe(once);
    const block = once.split("\n");
    expect(block[0]).toBe("# mine");
    const entries = block.filter((line) => line.startsWith("/"));
    expect(entries.map((entry, i) => entry.startsWith(`/${SPECS[i] ?? "?"}`))).toEqual(SPECS.map(() => true));
    expect(block.filter((line) => line.startsWith("# >>> stamity records") || line === "# <<< stamity records")).toHaveLength(2);
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
    const status = w.git(w.clone, "status", "--porcelain", "--untracked-files=all");
    for (const line of status.split("\n").filter(Boolean)) expect(isRecordPath(line.slice(3)), line).toBe(false);
  });

  it("writes the common directory's exclude from a linked worktree", async () => {
    const w = world();
    const lane = join(w.dir, "lane");
    w.git(w.clone, "worktree", "add", "-q", "--detach", lane);
    const result: Result = await records.setup({ ...w.opts, root: lane });
    expect(result.code, result.lines.join("\n")).toBe(0);
    expect(readFileSync(join(w.clone, ".git/info/exclude"), "utf8")).toContain("# <<< stamity records");
  });
});

describe("restore", { timeout: 60_000 }, () => {
  it("fills a fresh clone from origin/records, with the executable bit", async () => {
    const w = world();
    const fresh = join(w.dir, "fresh");
    execFileSync("git", ["clone", "-q", w.url, fresh], { env: w.env });
    expect(existsSync(join(fresh, PLAN))).toBe(false);
    const result: Result = await records.restore({ root: fresh, env: w.env });
    expect(result.code, result.lines.join("\n")).toBe(0);
    expect(readFileSync(join(fresh, `${ALPHA}/ledger.jsonl`), "utf8")).toBe("{\"id\":\"alpha/1\"}\n");
    if (POSIX) expect(statSync(join(fresh, RUN, "tool.sh")).mode & 0o111).toBe(0o111);
    expect(w.synced(fresh)).toBe(w.git(w.origin, "rev-parse", "records"));
  });

  it("with no sync base yet, refuses a differing local record and writes nothing, overwrites with --force, and deletes no local file", async () => {
    const w = world();
    w.git(w.clone, "update-ref", "-d", SYNC_BASE);
    w.write(w.clone, PLAN, "edited locally\n");
    rmSync(join(w.clone, `${RUN}/RESULTS.md`));
    w.write(w.clone, `${ALPHA}/local-only.md`, "mine\n");
    const refused: Result = await records.restore(w.opts);
    expect(refused.code).toBe(1);
    expect(refused.lines).toContain(PLAN);
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("edited locally\n");
    expect(existsSync(join(w.clone, `${RUN}/RESULTS.md`))).toBe(false);
    expect(spawnSync("git", ["-C", w.clone, "rev-parse", "--verify", "--quiet", SYNC_BASE], { env: w.env }).status).toBe(1);
    const forced: Result = await records.restore({ ...w.opts, force: true });
    expect(forced.code, forced.lines.join("\n")).toBe(0);
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
    expect(existsSync(join(w.clone, `${RUN}/RESULTS.md`))).toBe(true);
    expect(readFileSync(join(w.clone, `${ALPHA}/local-only.md`), "utf8")).toBe("mine\n");
    expect(w.synced(w.clone)).toBe(w.git(w.origin, "rev-parse", "records"));
  });

  it("merges three ways against the sync base: writes an upstream change, keeps a pending edit, refuses a file both changed", async () => {
    const w = world();
    const b = await w.machine("b");
    w.write(b, `${RUN}/RESULTS.md`, "# results, from b\n");
    w.write(b, `${ALPHA}/ledger.jsonl`, "{\"id\":\"alpha/1\"}\n{\"id\":\"alpha/b\"}\n");
    expect((await records.publish({ root: b, env: w.env, message: "b", runGates: passing().run }) as Result).code).toBe(0);
    const before = w.synced(w.clone);
    w.write(w.clone, PLAN, "# plan, a's unpublished edit\n");
    w.write(w.clone, `${ALPHA}/ledger.jsonl`, "{\"id\":\"alpha/1\"}\n{\"id\":\"alpha/a\"}\n");
    const refused: Result = await records.restore(w.opts);
    expect(refused.code).toBe(1);
    expect(refused.lines).toContain(`${ALPHA}/ledger.jsonl`);
    expect(refused.lines).not.toContain(PLAN);
    expect(readFileSync(join(w.clone, `${RUN}/RESULTS.md`), "utf8")).toBe("# results\n");
    expect(readFileSync(join(w.clone, `${ALPHA}/ledger.jsonl`), "utf8")).toContain("alpha/a");
    expect(w.synced(w.clone)).toBe(before);
    w.write(w.clone, `${ALPHA}/ledger.jsonl`, "{\"id\":\"alpha/1\"}\n");
    const merged: Result = await records.restore(w.opts);
    expect(merged.code, merged.lines.join("\n")).toBe(0);
    expect(merged.lines.join("\n")).toContain(PLAN);
    expect(readFileSync(join(w.clone, `${RUN}/RESULTS.md`), "utf8")).toBe("# results, from b\n");
    expect(readFileSync(join(w.clone, `${ALPHA}/ledger.jsonl`), "utf8")).toContain("alpha/b");
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan, a's unpublished edit\n");
    expect(w.synced(w.clone)).toBe(w.git(w.origin, "rev-parse", "records"));
    const forced: Result = await records.restore({ ...w.opts, force: true });
    expect(forced.code, forced.lines.join("\n")).toBe(0);
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
  });

  it.skipIf(!POSIX)("never writes through a symlinked record folder", async () => {
    const w = world();
    const outside = join(w.dir, "outside");
    mkdirSync(outside);
    rmSync(join(w.clone, "docs/plans"), { recursive: true });
    symlinkSync(outside, join(w.clone, "docs/plans"));
    const result: Result = await records.restore({ ...w.opts, force: true });
    expect(result.code).toBe(1);
    expect(result.lines).toContain("docs/plans");
    expect(existsSync(join(outside, "001-alpha.md"))).toBe(false);
  });
});

describe("commit", { timeout: 60_000 }, () => {
  it("publishes through a separate index, leaves ignored files out, and moves no ref but the records branch", async () => {
    const w = world();
    w.write(w.clone, PLAN, "# plan, revised\n");
    w.write(w.clone, `${ALPHA}/added.md`, "new record\n");
    w.write(w.clone, `${RUN}/calls/call-1.json`, "{}\n");
    w.write(w.clone, `${ALPHA}/reports/r1.md`, "a report\n");
    w.write(w.clone, "src/app.txt", "staged product change\n");
    w.git(w.clone, "add", "src/app.txt");
    const cached = w.git(w.clone, "diff", "--cached");
    const before = { clone: w.refs(w.clone), origin: w.refs(w.origin) };
    const gates = passing();
    const result: Result = await records.publish({ ...w.opts, message: "records: revise", runGates: gates.run });
    expect(result.code, result.lines.join("\n")).toBe(0);
    expect(gates.calls).toHaveLength(1);
    expect(result.lines).toEqual(expect.arrayContaining([`M ${PLAN}`, `A ${ALPHA}/added.md`]));
    const tree = w.tree("records");
    expect(tree).toContain(`${ALPHA}/added.md`);
    expect(tree.some((path) => path.includes("/calls/") || path.includes("/reports/"))).toBe(false);
    expect(w.git(w.origin, "rev-parse", "records")).toBe(gates.calls[0]?.commit);
    expect(cached).not.toBe("");
    expect(w.git(w.clone, "diff", "--cached")).toBe(cached);
    const moved = (a: string, b: string) => b.split("\n").filter((line) => !a.split("\n").includes(line)).map((line) => line.split(" ")[0]);
    expect(moved(before.clone, w.refs(w.clone))).toEqual(["refs/heads/records", "refs/remotes/origin/records", SYNC_BASE]);
    expect(moved(before.origin, w.refs(w.origin))).toEqual(["refs/heads/records"]);
    for (const ref of ["refs/heads/records", SYNC_BASE]) expect(w.git(w.clone, "rev-parse", ref), ref).toBe(gates.calls[0]?.commit);
    const again: Result = await records.publish({ ...w.opts, message: "records: again", runGates: gates.run });
    expect(again.lines).toEqual([expect.stringContaining("nothing to publish")]);
  });

  it.skipIf(!POSIX)("refuses a symlink among the records", async () => {
    const w = world();
    symlinkSync(join(w.clone, PLAN), join(w.clone, "docs/plans/002-link.md"));
    const result: Result = await records.publish({ ...w.opts, message: "m", runGates: passing().run });
    expect(result.code).toBe(1);
    expect(result.lines).toContain("docs/plans/002-link.md");
  });

  it("refuses a deletion unless --allow-deletions is given", async () => {
    const w = world();
    rmSync(join(w.clone, PLAN));
    const head = w.git(w.origin, "rev-parse", "records");
    const refused: Result = await records.publish({ ...w.opts, message: "m", runGates: passing().run });
    expect(refused.code).toBe(1);
    expect(refused.lines).toContain(PLAN);
    expect(w.git(w.origin, "rev-parse", "records")).toBe(head);
    const allowed: Result = await records.publish({ ...w.opts, message: "m", allowDeletions: true, runGates: passing().run });
    expect(allowed.code, allowed.lines.join("\n")).toBe(0);
    expect(w.tree("records")).not.toContain(PLAN);
  });

  it("pushes nothing when a gate fails, and moves no ref on --dry-run", async () => {
    const w = world();
    w.write(w.clone, PLAN, "# plan, revised\n");
    const before = { clone: w.refs(w.clone), origin: w.refs(w.origin) };
    const failing = async () => ({ failed: "hygiene check", lines: ["repo-hygiene: FAIL"] });
    const refused: Result = await records.publish({ ...w.opts, message: "m", runGates: failing });
    expect(refused.code).toBe(1);
    expect(refused.lines.join("\n")).toContain("the hygiene check failed");
    const gates = passing();
    const dry: Result = await records.publish({ ...w.opts, message: "m", dryRun: true, runGates: gates.run });
    expect(dry.code).toBe(0);
    expect(gates.calls).toHaveLength(1);
    expect(dry.lines).toContain(`M ${PLAN}`);
    expect(dry.lines.join("\n")).toContain(gates.calls[0]?.commit ?? "?");
    expect({ clone: w.refs(w.clone), origin: w.refs(w.origin) }).toEqual(before);
  });

  it("moves no ref on --dry-run when origin moved, and names restore", async () => {
    const w = world();
    const b = await w.machine("b");
    w.write(b, PLAN, "# plan, from b\n");
    expect((await records.publish({ root: b, env: w.env, message: "b", runGates: passing().run }) as Result).code).toBe(0);
    w.write(w.clone, `${ALPHA}/added.md`, "new record\n");
    const before = w.refs(w.clone);
    const gates = passing();
    const dry: Result = await records.publish({ ...w.opts, message: "m", dryRun: true, runGates: gates.run });
    expect(dry.code).toBe(1);
    expect(dry.lines.join("\n")).toContain("run `node scripts/records.mjs restore`");
    expect(gates.calls).toHaveLength(0);
    expect(w.refs(w.clone)).toBe(before);
  });

  it("refuses a publish from a checkout behind origin, then publishes its own edit after restore without reverting the other's", async () => {
    const w = world();
    const b = await w.machine("b");
    w.write(b, `${RUN}/RESULTS.md`, "# results, from b\n");
    expect((await records.publish({ root: b, env: w.env, message: "b", runGates: passing().run }) as Result).code).toBe(0);
    const theirs = w.git(w.origin, "rev-parse", "records");
    w.write(w.clone, PLAN, "# plan, from a\n");
    const refused: Result = await records.publish({ ...w.opts, message: "a", runGates: passing().run });
    expect(refused.code).toBe(1);
    expect(refused.lines.join("\n")).toContain("run `node scripts/records.mjs restore`");
    expect(w.git(w.origin, "rev-parse", "records")).toBe(theirs);
    expect((await records.restore(w.opts) as Result).code).toBe(0);
    const published: Result = await records.publish({ ...w.opts, message: "a", runGates: passing().run });
    expect(published.code, published.lines.join("\n")).toBe(0);
    expect(published.lines).toEqual(expect.arrayContaining([`M ${PLAN}`]));
    expect(published.lines.some((line) => line.endsWith(`${RUN}/RESULTS.md`))).toBe(false);
    expect(w.git(w.origin, "show", `records:${RUN}/RESULTS.md`)).toBe("# results, from b");
    expect(w.git(w.origin, "show", `records:${PLAN}`)).toBe("# plan, from a");
  });

  it("moves a local records branch with the push only by fast-forward, and says so otherwise", async () => {
    const w = world();
    const stray = w.git(w.clone, "commit-tree", "-m", "stray", w.git(w.clone, "rev-parse", "records^{tree}"));
    w.git(w.clone, "update-ref", "refs/heads/records", stray);
    w.write(w.clone, PLAN, "# plan, revised\n");
    const result: Result = await records.publish({ ...w.opts, message: "m", runGates: passing().run });
    expect(result.code, result.lines.join("\n")).toBe(0);
    expect(w.git(w.clone, "rev-parse", "refs/heads/records")).toBe(stray);
    expect(result.lines.join("\n")).toContain("left the local records branch");
  });

  it("names restore and forces nothing when the records branch moved since the fetch", async () => {
    const w = world();
    const other = join(w.dir, "other");
    execFileSync("git", ["clone", "-q", w.url, other], { env: w.env });
    expect((await records.restore({ root: other, env: w.env }) as Result).code).toBe(0);
    w.write(other, PLAN, "# plan, from another machine\n");
    w.write(w.clone, `${ALPHA}/record.md`, "# alpha\n\nStatus: closed 2026-01-03\n");
    let theirs = "";
    const race = async () => {
      const pushed: Result = await records.publish({ root: other, env: w.env, message: "theirs", runGates: passing().run });
      expect(pushed.code, pushed.lines.join("\n")).toBe(0);
      theirs = w.git(w.origin, "rev-parse", "records");
      return { failed: null, lines: [] };
    };
    const result: Result = await records.publish({ ...w.opts, message: "ours", runGates: race });
    expect(result.code).toBe(1);
    expect(result.lines.join("\n")).toContain("run `node scripts/records.mjs restore`");
    expect(w.git(w.origin, "rev-parse", "records")).toBe(theirs);
    // The advised recovery keeps the edit the rejected push carried and takes the other machine's.
    const restored: Result = await records.restore(w.opts);
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    expect(readFileSync(join(w.clone, `${ALPHA}/record.md`), "utf8")).toContain("closed 2026-01-03");
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan, from another machine\n");
    expect((await records.publish({ ...w.opts, message: "ours", runGates: passing().run }) as Result).code).toBe(0);
    expect(w.git(w.origin, "show", `records:${ALPHA}/record.md`)).toContain("closed 2026-01-03");
    expect(w.git(w.origin, "show", `records:${PLAN}`)).toBe("# plan, from another machine");
  });

  it("leaves a run still in progress out, without counting its published copy as deleted", async () => {
    const w = world();
    const beta = ".stamity/runs/2026-01-03_beta", gamma = ".stamity/runs/2026-01-03_gamma";
    w.write(w.clone, `${beta}/record.md`, "# beta\n\nStatus: in progress\n");
    w.write(w.clone, `${beta}/ledger.jsonl`, "{}\n");
    w.write(w.clone, `${gamma}/record.md`, "# gamma\n\nStatus: closed 2026-01-03\n");
    w.write(w.clone, `${ALPHA}/record.md`, "# alpha\n\nStatus: in progress\n");
    rmSync(join(w.clone, `${ALPHA}/ledger.jsonl`));
    const dry: Result = await records.publish({ ...w.opts, message: "m", dryRun: true, runGates: passing().run });
    expect(dry.code, dry.lines.join("\n")).toBe(0);
    expect(dry.lines).toContain(`left out ${beta}: the run is still in progress`);
    const result: Result = await records.publish({ ...w.opts, message: "m", runGates: passing().run });
    expect(result.code, result.lines.join("\n")).toBe(0);
    expect(result.lines).toEqual(expect.arrayContaining([
      `left out ${ALPHA}: the run is still in progress`, `left out ${beta}: the run is still in progress`, `A ${gamma}/record.md`]));
    const tree = w.tree("records");
    expect(tree).toContain(`${gamma}/record.md`);
    expect(tree.some((path) => path.startsWith(`${beta}/`))).toBe(false);
    expect(tree).toEqual(expect.arrayContaining([`${ALPHA}/record.md`, `${ALPHA}/ledger.jsonl`]));
    expect(w.git(w.origin, "show", `records:${ALPHA}/record.md`)).toContain("Status: closed 2026-01-02");
  });
});

// Not POSIX-only: the records suite runs through node and vitest's own bin, with no shell, so Windows runs it too.
describe("commit's default gates", { timeout: 180_000 }, () => {
  it("runs the leak gate, the hygiene check and the records suite on the built commit", async () => {
    const w = world();
    w.write(w.clone, PLAN, "# plan, revised\n");
    const head = w.git(w.origin, "rev-parse", "records");
    const clean: Result = await records.publish({ ...w.opts, message: "m", dryRun: true });
    expect(clean.code, clean.lines.join("\n")).toBe(0);
    const suite: Result = await records.publish({ ...w.opts, env: { ...w.env, RECORDS_SUITE_EXIT: "1" }, message: "m" });
    expect(suite.code).toBe(1);
    expect(suite.lines.join("\n")).toContain("the records suite failed");
    // The address is assembled at run time so this file carries none for the repository's own gate.
    w.write(w.clone, PLAN, `contact ${["maintainer", "records-fixture.net"].join("@")}\n`);
    const leak: Result = await records.publish({ ...w.opts, message: "m" });
    expect(leak.code).toBe(1);
    expect(leak.lines.join("\n")).toContain("the leak gate failed");
    expect(w.git(w.origin, "rev-parse", "records")).toBe(head);
    expect(w.git(w.clone, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  });
});

describe("verify, guard and init", { timeout: 60_000 }, () => {
  it("verify proves blob identity and names the one path that differs", async () => {
    const w = world();
    expect((await records.verify({ ...w.opts, base: w.base, ref: "refs/heads/records" }) as Result).code).toBe(0);
    w.write(w.clone, PLAN, "# plan, revised\n");
    expect((await records.publish({ ...w.opts, message: "m", runGates: passing().run }) as Result).code).toBe(0);
    const result: Result = await records.verify({ ...w.opts, base: w.base });
    expect(result.code).toBe(1);
    expect(result.lines.slice(1)).toEqual([PLAN]);
  });

  it("guard passes main after the move and names a record committed to it", async () => {
    const w = world();
    expect((await records.guard(w.opts) as Result).code).toBe(0);
    w.write(w.clone, ".stamity/runs/x/record.md", "# x\n");
    w.git(w.clone, "add", ".stamity/runs/x/record.md");
    w.git(w.clone, "-c", "commit.gpgsign=false", "commit", "-qm", "a record on main");
    const result: Result = await records.guard(w.opts);
    expect(result.code).toBe(1);
    expect(result.lines).toContain(".stamity/runs/x/record.md");
  });

  it("init builds an orphan import with the four templates, and refuses a branch that exists anywhere", async () => {
    const w = world();
    expect(w.git(w.origin, "rev-list", "--parents", "-n", "1", "records").split(" ")).toHaveLength(1);
    const merged = spawnSync("git", ["-C", w.clone, "merge-base", "origin/main", "origin/records"], { env: w.env });
    expect(merged.status).toBe(1);
    for (const [name, destination] of [[README, README], ["gitignore", ".gitignore"],
      ["gitattributes", ".gitattributes"], ["workflow.yml", ".github/workflows/records.yml"]] as const)
      expect(w.git(w.origin, "show", `records:${destination}`)).toBe(readFileSync(join(ROOT, "scripts/records", name), "utf8").trim());
    expect(w.git(w.origin, "ls-tree", "records", `${RUN}/tool.sh`)).toMatch(/^100755 /);
    const before = w.refs(w.clone);
    const again: Result = await records.init({ ...w.opts, base: w.base });
    expect(again.code).toBe(1);
    expect(w.refs(w.clone)).toBe(before);
    const fresh = join(w.dir, "fresh");
    execFileSync("git", ["clone", "-q", w.url, fresh], { env: w.env });
    expect((await records.init({ root: fresh, env: w.env, base: w.base }) as Result).code).toBe(1);
    const local = world({ init: false });
    local.git(local.clone, "branch", "records");
    const refused: Result = await records.init({ ...local.opts, base: local.base });
    expect(refused.code).toBe(1);
    expect(local.refs(local.origin)).not.toContain("refs/heads/records");
  });
});

describe("the CLI", { timeout: 60_000 }, () => {
  const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  it("exits 2 with the usage line on an unknown verb or a commit without -m, and maps a verb's code", () => {
    for (const args of [["publish"], ["commit"], ["commit", "--dry-run"], ["restore", "--bogus"], ["verify"], []]) {
      const result = cli(ROOT, ...args);
      expect(result.status, args.join(" ")).toBe(2);
      expect(result.stderr).toContain("Usage: node scripts/records.mjs");
    }
    const w = world();
    const guarded = spawnSync(process.execPath, [SCRIPT, "guard"], { cwd: w.clone, env: w.env, encoding: "utf8" });
    expect(guarded.status, guarded.stderr).toBe(0);
    expect(guarded.stdout).toContain("no record path is tracked at HEAD");
  });
});

describe("the branch templates", () => {
  const template = (name: string) => readFileSync(join(ROOT, "scripts/records", name), "utf8");
  it("copies only main's own ignore rules, and fixes line endings", () => {
    const main = new Set(readFileSync(join(ROOT, ".gitignore"), "utf8").split("\n"));
    const rules = template("gitignore").split("\n").filter((line) => line !== "" && !line.startsWith("#"));
    expect(rules.length).toBe(12);
    for (const rule of rules) expect(main.has(rule), rule).toBe(true);
    expect(rules.filter((rule) => rule.startsWith("/.stamity/runs/")).length).toBe(3);
    expect(template("gitattributes")).toBe("* text=auto eol=lf\n");
  });

  it("runs the records workflow on records pushes only, guarded and pinned as ci.yml is", () => {
    const flow = parse(template("workflow.yml")) as {
      on: Record<string, { branches: string[] }>; permissions: unknown;
      jobs: { records: { if: string; steps: { name: string; uses?: string; run?: string; with?: Record<string, unknown> }[] } };
    };
    expect(flow.on).toEqual({ push: { branches: ["records"] } });
    expect(flow.permissions).toEqual({ contents: "read" });
    const nightly = readFileSync(join(ROOT, ".github/workflows/nightly.yml"), "utf8");
    expect(nightly).toContain(`if: ${flow.jobs.records.if}\n`);
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const steps = flow.jobs.records.steps;
    for (const step of steps.filter((s) => s.uses !== undefined))
      expect(ci, step.uses).toContain(`uses: ${step.uses ?? "?"} #`);
    expect(steps[0]?.with).toMatchObject({ "fetch-depth": 0, "persist-credentials": false });
    const at = (text: string) => steps.findIndex((step) => step.run?.includes(text) === true);
    expect(at("records.mjs restore")).toBeGreaterThan(-1);
    expect(at("records.mjs restore")).toBeLessThan(at("npm run test:records"));
    // The leak gate reads the pushed commit itself, where every record is tracked, never main's
    // checkout, whose listing drops a restored record that main's ignore rules match.
    expect(at("npm run gate")).toBe(-1);
    const tree = steps.findIndex((step) => /git worktree add --detach (\S+) "\$RECORDS_SHA"/.test(step.run ?? ""));
    const dir = /git worktree add --detach (\S+) /.exec(steps[tree]?.run ?? "")?.[1] ?? "?";
    expect(tree).toBeGreaterThan(-1);
    const leak = at(`node scripts/leak-gate.mjs --root ${dir}`);
    expect(leak).toBeGreaterThan(tree);
    expect((steps[tree] as { env?: Record<string, string> }).env).toEqual({ RECORDS_SHA: "${{ github.sha }}" });
    expect(at(`repo-hygiene.mjs --repo ${dir}`)).toBeGreaterThan(tree);
    for (const step of steps) expect(step.run ?? "", step.name).not.toContain("${{");
  });

  it("tells a reader how to restore and publish, and that a run in progress is left out", () => {
    const readme = template(README);
    for (const text of ["node scripts/records.mjs setup", "node scripts/records.mjs commit -m", "never forced",
      "cannot be deleted", "Status: in progress"]) expect(readme).toContain(text);
  });
});
