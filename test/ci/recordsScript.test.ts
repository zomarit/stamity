import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
/** ALPHA's folder in another case: one folder where the disk folds case, two where it does not. */
const ALPHA_UP = ALPHA.replace("alpha", "ALPHA");
// Built from code points, so this file holds only ASCII: record names outside printable ASCII, and how the script shows each.
const SIGMA_PLAN = `docs/plans/${String.fromCodePoint(0x3c3)}.md`;
const SIGMA_SHOWN = "docs/plans/<U+03C3>.md";
const DEL_PLAN = `docs/plans/a${String.fromCodePoint(0x7f)}.md`;
const DEL_SHOWN = "docs/plans/a<U+007F>.md";
/**
 * Record names in printable ASCII that are still not portable: on Windows a `:` names a stream of
 * another file, a device name opens the device, a trailing dot is stripped, and `*` is a glob to git.
 */
const UNPORTABLE = [
  "docs/plans/x:y.md", "docs/plans/001-alpha.md::$DATA", "docs/plans/nul.md", "docs/plans/CON", "docs/plans/aux/a.md",
  "docs/plans/Lpt9.log.md", "docs/plans/a*.md", "docs/plans/b.", "docs/plans/old./c.md",
];
/** The plain-git repair a refusal names for a pair the records branch already holds, `<folder>` and `<old-spelling>` to fill. */
// TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit r1-release-machinery, inbox pr/9 and pr/10): the
// printed worktree step spells the remote-tracking ref in full, since a tag named `origin/records` wins the short name.
// TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, fix round 1, ledger review/48): the printed fetch
// spells the records branch in full as well, since a tag named `records` on origin wins the short name's match.
const REPAIR = [
  "git fetch origin +refs/heads/records:refs/remotes/origin/records",
  "git worktree add --detach <folder> refs/remotes/origin/records",
  "git -C <folder> --literal-pathspecs rm -r --cached -- <old-spelling>",
  "git -C <folder> commit -q -m \"records: drop the old spelling\"",
  "git -C <folder> push origin HEAD:refs/heads/records",
  "git worktree remove --force <folder>",
  "node scripts/records.mjs restore",
];
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
  const blob = (cwd: string, body: string): string =>
    execFileSync("git", ["-C", cwd, "hash-object", "-w", "--stdin"], { env, input: body, encoding: "utf8", stdio: "pipe" }).trim();
  let crafted = 0;
  /**
   * A records commit on top of `from`, built in `cwd` through a scratch index and never pushed, as a
   * push made without this script would be: `edit` runs git against that index.
   */
  const craft = (cwd: string, from: string, edit: (indexed: (...args: string[]) => string) => void): string => {
    crafted += 1;
    const index = join(dir, `crafted-${String(crafted)}.index`);
    const indexed = (...args: string[]): string =>
      execFileSync("git", ["-C", cwd, ...args], { env: { ...env, GIT_INDEX_FILE: index }, encoding: "utf8", stdio: "pipe" }).trim();
    indexed("read-tree", from);
    edit(indexed);
    return indexed("commit-tree", indexed("write-tree"), "-p", from, "-m", "crafted");
  };
  /** A second clone of the same origin, restored, as another machine would be. */
  const machine = async (name: string): Promise<string> => {
    const path = join(dir, name);
    execFileSync("git", ["clone", "-q", url, path], { env });
    const restored: Result = await records.restore({ root: path, env });
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    return path;
  };
  return { dir, env, git, write, origin, url, clone, base, opts, refs, tree, synced, blob, craft, machine };
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

  it("in a fork with no records branch, refuses plain setup without sending the fork to init, and restores upstream's records through --ref and --no-fetch", () => {
    const w = world();
    // A fork as GitHub makes one by default: the default branch only, no `records` branch.
    const fork = join(w.dir, "fork.git");
    execFileSync("git", ["clone", "-q", "--bare", "--single-branch", "--branch", "main", w.url, fork], { env: w.env });
    const clone = join(w.dir, "fork-clone");
    execFileSync("git", ["clone", "-q", pathToFileURL(fork).href, clone], { env: w.env });
    const cli = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: clone, env: w.env, encoding: "utf8" });
    const plain = cli("setup");
    expect(plain.status, plain.stderr).toBe(1);
    expect(plain.stderr).toContain("no records branch on origin");
    expect(plain.stderr).toContain("a fork fetches upstream's records branch");
    expect(plain.stderr).toContain("setup --ref <ref> --no-fetch");
    // The one-time `init` belongs to the canonical repository; a fork that ran it would push an empty records branch.
    expect(plain.stderr).not.toMatch(/run `node scripts\/records\.mjs init/);
    expect(w.git(fork, "for-each-ref", "--format=%(refname)")).not.toContain("refs/heads/records");
    w.git(clone, "fetch", "-q", w.url, "refs/heads/records:refs/remotes/upstream/records");
    const forked = cli("setup", "--ref", "upstream/records", "--no-fetch");
    expect(forked.status, forked.stderr).toBe(0);
    expect(forked.stdout).toContain("from upstream/records");
    expect(readFileSync(join(clone, ".git/info/exclude"), "utf8")).toContain("# <<< stamity records");
    expect(readFileSync(join(clone, PLAN), "utf8")).toBe("# plan\n");
    expect(w.synced(clone)).toBe(w.git(w.origin, "rev-parse", "records"));
    const status = w.git(clone, "status", "--porcelain", "--untracked-files=all");
    for (const line of status.split("\n").filter(Boolean)) expect(isRecordPath(line.slice(3)), line).toBe(false);
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
    // Nothing was on this disk before, so nothing is re-created: a fresh clone's restore is not a list of every record.
    expect(result.lines.filter((line) => line.startsWith("re-created "))).toEqual([]);
  });

  it("names each record it re-creates, one line per path, when the copy last synced here is gone from disk", async () => {
    const w = world();
    rmSync(join(w.clone, PLAN));
    rmSync(join(w.clone, `${ALPHA}/ledger.jsonl`));
    const restored: Result = await records.restore(w.opts);
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    expect(restored.lines.filter((line) => line.startsWith("re-created ")).map((line) => line.split(":")[0]))
      .toEqual([`re-created ${ALPHA}/ledger.jsonl`, `re-created ${PLAN}`]);
    expect(restored.lines.join("\n")).toContain("commit --allow-deletions");
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
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
    expect(refused.lines.join("\n")).toContain("and deletes every unedited copy of a record deleted there");
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

  // A Windows disk keeps no executable bit (git there runs with core.fileMode off and chmod sets
  // only the read-only flag), so a change of mode can be made, and these two cases run, only on a POSIX host.
  it.skipIf(!POSIX)("counts a change of mode alone as a change on either side: against the other side's change it refuses, writing and deleting nothing", async () => {
    const w = world();
    const tool = `${RUN}/tool.sh`, ledger = `${ALPHA}/ledger.jsonl`;
    const b = await w.machine("b");
    w.write(b, PLAN, "# plan, from b\n");
    chmodSync(join(b, tool), 0o644);
    rmSync(join(b, ledger));
    expect((await records.publish({ root: b, env: w.env, message: "b", allowDeletions: true, runGates: passing().run }) as Result).code).toBe(0);
    const before = w.synced(w.clone);
    // Here: a mode change against b's content change, a content change against b's mode change, and a mode change against b's deletion.
    chmodSync(join(w.clone, PLAN), 0o755);
    w.write(w.clone, tool, "#!/bin/sh\necho tool, from a\n");
    chmodSync(join(w.clone, ledger), 0o755);
    const refused: Result = await records.restore(w.opts);
    expect(refused.code, refused.lines.join("\n")).toBe(1);
    expect(refused.lines).toEqual(expect.arrayContaining([PLAN, tool, ledger]));
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
    expect(statSync(join(w.clone, PLAN)).mode & 0o111).toBe(0o111);
    expect(readFileSync(join(w.clone, tool), "utf8")).toBe("#!/bin/sh\necho tool, from a\n");
    expect(statSync(join(w.clone, tool)).mode & 0o111).toBe(0o111);
    expect(statSync(join(w.clone, ledger)).mode & 0o111).toBe(0o111);
    expect(w.synced(w.clone)).toBe(before);
  });

  it.skipIf(!POSIX)("writes a mode changed only on the ref, and keeps a mode changed only here, which the next commit publishes", async () => {
    const w = world();
    const tool = `${RUN}/tool.sh`;
    const b = await w.machine("b");
    chmodSync(join(b, tool), 0o644);
    expect((await records.publish({ root: b, env: w.env, message: "b", runGates: passing().run }) as Result).code).toBe(0);
    chmodSync(join(w.clone, PLAN), 0o755);
    const restored: Result = await records.restore(w.opts);
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    expect(statSync(join(w.clone, tool)).mode & 0o111).toBe(0);
    expect(statSync(join(w.clone, PLAN)).mode & 0o111).toBe(0o111);
    expect(restored.lines).toContain(`kept ${PLAN}: a local edit not yet published`);
    expect(w.synced(w.clone)).toBe(w.git(w.origin, "rev-parse", "records"));
    const published: Result = await records.publish({ ...w.opts, message: "a", runGates: passing().run });
    expect(published.code, published.lines.join("\n")).toBe(0);
    expect(published.lines.filter((line) => /^[ADM] /.test(line))).toEqual([`M ${PLAN}`]);
    expect(w.git(w.origin, "ls-tree", "records", PLAN)).toMatch(/^100755 /);
    expect(w.git(w.origin, "ls-tree", "records", tool)).toMatch(/^100644 /);
  });

  // ADDED by run 2026-10-13_records-branch, fix batch 3 (the re-review's note 1): a copy whose mode alone differs keeps
  // that mode through a redirect, so advice to write the ref's bytes over it loops; the advice brings the mode too.
  it.skipIf(!POSIX)("advises a conflict over a mode change so that, followed as printed, restore writes the ref's bytes and mode and runs clean", async () => {
    const w = world();
    const b = await w.machine("b");
    w.write(b, PLAN, "# plan, from b\n");
    expect((await records.publish({ root: b, env: w.env, message: "b", runGates: passing().run }) as Result).code).toBe(0);
    chmodSync(join(w.clone, PLAN), 0o755);
    const refused: Result = await records.restore(w.opts);
    expect(refused.code, refused.lines.join("\n")).toBe(1);
    expect(refused.lines).toContain(PLAN);
    const advice = refused.lines.find((line) => line.startsWith("For each, ")) ?? "";
    expect(advice).toContain("move your copy out of the checkout and run restore again, which writes origin/records's copy, bytes and mode");
    // Followed as printed: the copy leaves the checkout, and the next restore writes the ref's.
    rmSync(join(w.clone, PLAN));
    const followed: Result = await records.restore(w.opts);
    expect(followed.code, followed.lines.join("\n")).toBe(0);
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan, from b\n");
    expect(statSync(join(w.clone, PLAN)).mode & 0o111).toBe(0);
    expect(w.synced(w.clone)).toBe(w.git(w.origin, "rev-parse", "records"));
  });

  // ADDED by run 2026-10-13_records-branch, fix batch 3 (the re-review's note 2): where git keeps no executable bit
  // (core.fileMode false: Windows, WSL on /mnt/c, exFAT, each reading every file as executable), the disk's mode is
  // never a change, so a stale copy is not a pending edit, an upstream edit is no conflict, and nothing is published.
  it("reads no change of mode from the disk where core.fileMode is false: restore takes the ref's edit and keeps no local one, and commit has nothing to publish", async () => {
    const w = world();
    const b = await w.machine("b");
    w.write(b, PLAN, "# plan, from b\n");
    expect((await records.publish({ root: b, env: w.env, message: "b", runGates: passing().run }) as Result).code).toBe(0);
    w.git(w.clone, "config", "core.fileMode", "false");
    const listed = w.git(w.clone, "ls-tree", "-r", "-z", "--name-only", "refs/remotes/origin/records", "--", ...SPECS).split("\0").filter(Boolean);
    for (const path of listed) if (existsSync(join(w.clone, path))) chmodSync(join(w.clone, path), 0o755);
    const restored: Result = await records.restore(w.opts);
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    expect(restored.lines[0]).toMatch(/, updated 1, overwrote 0, .* kept 0 local edit\(s\)$/);
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan, from b\n");
    const dry: Result = await records.publish({ ...w.opts, message: "a", dryRun: true, runGates: passing().run });
    expect(dry.code, dry.lines.join("\n")).toBe(0);
    expect(dry.lines).toEqual(["nothing to publish: the records on disk equal origin/records"]);
  });

  // ADDED by run 2026-10-13_records-branch, fix batch 3 (ledger pr/5): a full-history checkout fetches every tag, and
  // a tag named `origin/records` wins git's lookup of that short name over the remote-tracking ref.
  it("reads origin/records by its full ref by default, so a tag of that name stands in for neither restore nor verify", async () => {
    const w = world();
    const branch = w.git(w.origin, "rev-parse", "records");
    const decoy = w.craft(w.clone, branch, (indexed) => {
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# plan, from a tag\n")},${PLAN}`);
    });
    w.git(w.clone, "tag", "origin/records", decoy);
    const restored: Result = await records.restore(w.opts);
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
    expect(w.synced(w.clone)).toBe(branch);
    const verified: Result = await records.verify({ ...w.opts, base: branch });
    expect(verified.code, verified.lines.join("\n")).toBe(0);
  });

  it("removes a record the other side deleted when this copy is the sync base's, and keeps an unpublished new file", async () => {
    const w = world();
    const b = await w.machine("b");
    rmSync(join(b, PLAN));
    expect((await records.publish({ root: b, env: w.env, message: "b", allowDeletions: true, runGates: passing().run }) as Result).code).toBe(0);
    w.write(w.clone, `${ALPHA}/notes.md`, "unpublished\n");
    const restored: Result = await records.restore(w.opts);
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    expect(restored.lines.some((line) => line.startsWith(`deleted ${PLAN}`))).toBe(true);
    expect(existsSync(join(w.clone, PLAN))).toBe(false);
    expect(readFileSync(join(w.clone, `${ALPHA}/notes.md`), "utf8")).toBe("unpublished\n");
    expect(w.synced(w.clone)).toBe(w.git(w.origin, "rev-parse", "records"));
    const published: Result = await records.publish({ ...w.opts, message: "a", runGates: passing().run });
    expect(published.code, published.lines.join("\n")).toBe(0);
    expect(published.lines).toContain(`A ${ALPHA}/notes.md`);
    expect(published.lines.filter((line) => line.includes(PLAN))).toEqual([]);
    expect(w.tree("records")).not.toContain(PLAN);
  });

  it("refuses a record deleted on the other side and edited here, writing nothing; --force deletes the unedited copy and keeps the edited one, naming it", async () => {
    const w = world();
    const b = await w.machine("b");
    rmSync(join(b, PLAN));
    rmSync(join(b, `${ALPHA}/ledger.jsonl`));
    w.write(b, `${RUN}/RESULTS.md`, "# results, from b\n");
    expect((await records.publish({ root: b, env: w.env, message: "b", allowDeletions: true, runGates: passing().run }) as Result).code).toBe(0);
    const before = w.synced(w.clone);
    w.write(w.clone, PLAN, "# plan, a's unpublished edit\n");
    const refused: Result = await records.restore(w.opts);
    expect(refused.code).toBe(1);
    expect(refused.lines).toContain(PLAN);
    expect(refused.lines).not.toContain(`${ALPHA}/ledger.jsonl`);
    // The advice names what --force does to such a copy, so taking it publishes nothing by surprise.
    expect(refused.lines.join("\n")).toContain("--force keeps every one, and the next `commit` publishes it again unless you remove it");
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan, a's unpublished edit\n");
    expect(readFileSync(join(w.clone, `${ALPHA}/ledger.jsonl`), "utf8")).toBe("{\"id\":\"alpha/1\"}\n");
    expect(readFileSync(join(w.clone, `${RUN}/RESULTS.md`), "utf8")).toBe("# results\n");
    expect(w.synced(w.clone)).toBe(before);
    const forced: Result = await records.restore({ ...w.opts, force: true });
    expect(forced.code, forced.lines.join("\n")).toBe(0);
    expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan, a's unpublished edit\n");
    expect(forced.lines).toContain(`kept ${PLAN}: deleted on origin/records and edited here; the next \`commit\` publishes it again unless you remove it`);
    // The unedited copy holds nothing unpublished, so --force removes it as a plain restore would.
    expect(existsSync(join(w.clone, `${ALPHA}/ledger.jsonl`))).toBe(false);
    expect(forced.lines.some((line) => line.startsWith(`deleted ${ALPHA}/ledger.jsonl`))).toBe(true);
    expect(readFileSync(join(w.clone, `${RUN}/RESULTS.md`), "utf8")).toBe("# results, from b\n");
    const published: Result = await records.publish({ ...w.opts, message: "a", runGates: passing().run });
    expect(published.code, published.lines.join("\n")).toBe(0);
    expect(published.lines.filter((line) => line.includes(`${ALPHA}/ledger.jsonl`))).toEqual([]);
    expect(published.lines).toContain(`A ${PLAN}`);
    expect(w.tree("records")).not.toContain(`${ALPHA}/ledger.jsonl`);
  });

  it("keeps a record renamed only in case on the other side, deleting nothing, and never deletes the placeholder main keeps", async () => {
    const w = world();
    const renamed = "docs/plans/001-Alpha.md";
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    const oid = w.git(w.clone, "rev-parse", `${upstream}:${PLAN}`);
    const rename = w.craft(w.clone, upstream, (indexed) => {
      indexed("update-index", "--force-remove", "--", PLAN);
      indexed("update-index", "--add", "--cacheinfo", `100644,${oid},${renamed}`);
    });
    const restored: Result = await records.restore({ ...w.opts, ref: rename, fetch: false });
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    expect(restored.lines.some((line) => line.startsWith("deleted "))).toBe(false);
    expect(existsSync(join(w.clone, PLAN))).toBe(true);
    expect(readFileSync(join(w.clone, renamed), "utf8")).toBe("# plan\n");
    expect(restored.lines.join("\n")).toContain(`kept ${PLAN}: ${rename} holds it as ${renamed}`);
    // A base row spelled as main's placeholder in another case is never a deletion either.
    const shouting = GITKEEP.replace(".gitkeep", ".GITKEEP");
    const crafted = w.craft(w.clone, upstream, (indexed) => {
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "")},${shouting}`);
    });
    w.git(w.clone, "update-ref", SYNC_BASE, crafted);
    const again: Result = await records.restore({ ...w.opts, force: true });
    expect(again.code, again.lines.join("\n")).toBe(0);
    expect(existsSync(join(w.clone, GITKEEP))).toBe(true);
    expect(w.git(w.clone, "status", "--porcelain", "--", GITKEEP)).toBe("");
  });

  it("refuses, before any write and naming each path, a records commit holding a path that is neither a record nor the branch's own file", async () => {
    const w = world();
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    const before = w.synced(w.clone);
    for (const stray of ["dist/x.js", "docs/specs/a.md", GITKEEP.replace(".gitkeep", ".GITKEEP")]) {
      const crafted = w.craft(w.clone, upstream, (indexed) => {
        indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# plan, upstream\n")},${PLAN}`);
        indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "stray\n")},${stray}`);
      });
      for (const force of [false, true]) {
        // oxlint-disable-next-line no-await-in-loop -- each restore runs over the checkout the previous one left
        const result: Result = await records.restore({ ...w.opts, ref: crafted, fetch: false, force });
        expect(result.code, `${stray} ${String(force)}`).toBe(1);
        expect(result.lines).toContain(stray);
        expect(result.lines[0]).toContain("neither records nor the branch's own files");
        expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
        expect(w.synced(w.clone)).toBe(before);
      }
    }
    expect(existsSync(join(w.clone, "dist/x.js"))).toBe(false);
    expect(existsSync(join(w.clone, "docs/specs/a.md"))).toBe(false);
    expect(readFileSync(join(w.clone, GITKEEP), "utf8")).toBe("");
  });

  it("refuses, before any write, a records commit holding two paths equal under case folding, naming both spellings", async () => {
    const w = world();
    const shouted = "docs/plans/001-Alpha.md";
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    const before = w.synced(w.clone);
    const crafted = w.craft(w.clone, upstream, (indexed) => {
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# plan, upstream\n")},${PLAN}`);
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# plan, the other spelling\n")},${shouted}`);
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# results, upstream\n")},${RUN}/RESULTS.md`);
    });
    for (const force of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- each restore runs over the checkout the previous one left
      const result: Result = await records.restore({ ...w.opts, ref: crafted, fetch: false, force });
      expect(result.code, `${String(force)}: ${result.lines.join("\n")}`).toBe(1);
      expect(result.lines[0]).toContain("equal under case folding");
      expect(result.lines[0]).toContain("the old spelling");
      expect(result.lines).toContain(`${shouted} and ${PLAN}`);
      expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
      expect(readFileSync(join(w.clone, `${RUN}/RESULTS.md`), "utf8")).toBe("# results\n");
      expect(w.synced(w.clone)).toBe(before);
    }
    expect(readdirSync(join(w.clone, "docs/plans"))).toEqual(["001-alpha.md"]);
  });

  it("refuses, before any write, a records commit holding one folder in two spellings, naming both once, forced or not", async () => {
    const w = world();
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    const before = w.synced(w.clone);
    // No two full paths fold equal here: only the folders do, and a disk that folds case writes both into one.
    const crafted = w.craft(w.clone, upstream, (indexed) => {
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# plan, upstream\n")},${PLAN}`);
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "b\n")},${ALPHA_UP}/b.md`);
    });
    for (const force of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- each restore runs over the checkout the previous one left
      const result: Result = await records.restore({ ...w.opts, ref: crafted, fetch: false, force });
      expect(result.code, `${String(force)}: ${result.lines.join("\n")}`).toBe(1);
      expect(result.lines[0]).toContain("equal under case folding");
      expect(result.lines.filter((line) => line.startsWith(".stamity/runs/"))).toEqual([`${ALPHA_UP} and ${ALPHA}`]);
      expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
      expect(readdirSync(join(w.clone, ".stamity/runs"))).toEqual(["2026-01-01_alpha"]);
      expect(readdirSync(join(w.clone, ALPHA)).toSorted()).toEqual(["ledger.jsonl", "record.md"]);
      expect(w.synced(w.clone)).toBe(before);
    }
  });

  it("refuses, before any write, a records commit holding a path outside printable ASCII, naming it, forced or not", async () => {
    const w = world();
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    const before = w.synced(w.clone);
    for (const [odd, shown] of [[SIGMA_PLAN, SIGMA_SHOWN], [DEL_PLAN, DEL_SHOWN]] as const) {
      const crafted = w.craft(w.clone, upstream, (indexed) => {
        indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# plan, upstream\n")},${PLAN}`);
        indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "odd\n")},${odd}`);
      });
      for (const force of [false, true]) {
        // oxlint-disable-next-line no-await-in-loop -- each restore runs over the checkout the previous one left
        const result: Result = await records.restore({ ...w.opts, ref: crafted, fetch: false, force });
        expect(result.code, `${shown} ${String(force)}: ${result.lines.join("\n")}`).toBe(1);
        expect(result.lines.some((line) => line.includes("not portable") && line.includes("nothing was written"))).toBe(true);
        expect(result.lines).toContain(shown);
        expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
        expect(readdirSync(join(w.clone, "docs/plans"))).toEqual(["001-alpha.md"]);
        expect(w.synced(w.clone)).toBe(before);
      }
    }
  });

  // Git for Windows refuses these names in an index and on disk, so only a POSIX host can build the commit that carries them.
  it.skipIf(!POSIX)("refuses, before any write, a records commit holding a printable name that is not portable, naming each, forced or not", async () => {
    const w = world();
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    const before = w.synced(w.clone);
    const crafted = w.craft(w.clone, upstream, (indexed) => {
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# plan, upstream\n")},${PLAN}`);
      for (const odd of UNPORTABLE) indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "odd\n")},${odd}`);
    });
    for (const force of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- each restore runs over the checkout the previous one left
      const result: Result = await records.restore({ ...w.opts, ref: crafted, fetch: false, force });
      expect(result.code, `${String(force)}: ${result.lines.join("\n")}`).toBe(1);
      expect(result.lines.some((line) => line.includes("not portable") && line.includes("Windows device name") && line.includes("nothing was written"))).toBe(true);
      for (const odd of UNPORTABLE) expect(result.lines, odd).toContain(odd);
      expect(readFileSync(join(w.clone, PLAN), "utf8")).toBe("# plan\n");
      expect(readdirSync(join(w.clone, "docs/plans"))).toEqual(["001-alpha.md"]);
      expect(w.synced(w.clone)).toBe(before);
    }
  });

  it("names the plain-git repair for a pair the records branch holds, and following it as printed lets restore run clean", async () => {
    const w = world();
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    const paired = w.craft(w.clone, upstream, (indexed) => {
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "b\n")},${ALPHA_UP}/b.md`);
    });
    // Pushed without this script: neither restore, which refuses the ref, nor commit, whose checkout cannot sync to it, can drop it.
    w.git(w.clone, "push", "-q", "origin", `${paired}:refs/heads/records`);
    const before = w.synced(w.clone);
    const refused: Result = await records.restore(w.opts);
    expect(refused.code, refused.lines.join("\n")).toBe(1);
    expect(refused.lines).toContain(`${ALPHA_UP} and ${ALPHA}`);
    expect(w.synced(w.clone)).toBe(before);
    const at = refused.lines.findIndex((line) => line.includes("with plain git"));
    expect(at, refused.lines.join("\n")).toBeGreaterThan(-1);
    const steps = refused.lines.slice(at + 1).map((line) => line.trim());
    expect(steps).toEqual(REPAIR);
    // TEST CHANGE, justified (2026-10-14, run 2026-10-14_cli-native, unit r1-release-machinery, inbox pr/9 and pr/10):
    // a tag named `origin/records` on the commit before the pair; a step that spelled the ref short would check the
    // tag out, find no old spelling to drop, and fail, so the walk below proves every printed step names the branch.
    w.git(w.clone, "tag", "origin/records", upstream);
    // ADDED (2026-10-14, run 2026-10-14_cli-native, fix round 1, ledger review/48): the remote-side twin. A tag named
    // `records` on origin and this clone's remote-tracking ref left on the commit before the pair; a fetch that named
    // the branch short would take the tag, leave the ref stale, and the worktree step would find no old spelling.
    w.git(w.clone, "push", "-q", "origin", `${upstream}:refs/tags/records`);
    w.git(w.clone, "update-ref", "refs/remotes/origin/records", upstream);
    // The prose ahead of the steps names the ref in full as well, where it says how to save a record first.
    expect(refused.lines[at]).toContain("git show refs/remotes/origin/records:<path>");
    // Each step run as printed, on this host's disk, the placeholders filled.
    const scratch = join(w.dir, "repair");
    for (const step of steps.slice(0, -1)) {
      const words = (step.match(/"[^"]*"|\S+/g) ?? []).map((word) => word.replace(/^"(.*)"$/, "$1"))
        .map((word) => (word === "<folder>" ? scratch : word === "<old-spelling>" ? ALPHA_UP : word));
      execFileSync("git", words.slice(1), { cwd: w.clone, env: w.env, stdio: "pipe" });
    }
    // The origin tag goes again, so the reads of origin below name the branch alone.
    w.git(w.origin, "tag", "-d", "records");
    const restored: Result = await records.restore(w.opts);
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    const tree = w.tree("records");
    expect(tree.filter((path) => path.startsWith(".stamity/runs/"))).toEqual([`${ALPHA}/ledger.jsonl`, `${ALPHA}/record.md`]);
    expect(w.git(w.origin, "rev-parse", "records^")).toBe(paired);
    expect(w.synced(w.clone)).toBe(w.git(w.origin, "rev-parse", "records"));
    expect(existsSync(scratch)).toBe(false);
  });

  it.skipIf(!POSIX)("refuses a symlinked folder or file in place of a record deleted on the other side, forced or not, deleting nothing", async () => {
    const w = world();
    const b = await w.machine("b");
    rmSync(join(b, PLAN));
    rmSync(join(b, `${ALPHA}/ledger.jsonl`));
    expect((await records.publish({ root: b, env: w.env, message: "b", allowDeletions: true, runGates: passing().run }) as Result).code).toBe(0);
    const before = w.synced(w.clone);
    // Outside the checkout, a byte-for-byte copy of the sync base's plan: a restore that followed the link would delete it.
    const outside = join(w.dir, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "001-alpha.md"), "# plan\n");
    const shapes = [
      { blocked: "docs/plans", place: () => { rmSync(join(w.clone, "docs/plans"), { recursive: true }); symlinkSync(outside, join(w.clone, "docs/plans")); } },
      { blocked: PLAN, place: () => { rmSync(join(w.clone, "docs/plans")); mkdirSync(join(w.clone, "docs/plans")); symlinkSync(join(outside, "001-alpha.md"), join(w.clone, PLAN)); } },
    ];
    for (const shape of shapes) {
      shape.place();
      for (const force of [false, true]) {
        // oxlint-disable-next-line no-await-in-loop -- each restore runs over the checkout the previous one left
        const result: Result = await records.restore({ ...w.opts, force });
        expect(result.code, `${shape.blocked} ${String(force)}: ${result.lines.join("\n")}`).toBe(1);
        expect(result.lines[0]).toContain("is a symlink");
        expect(result.lines).toContain(shape.blocked);
        expect(readFileSync(join(outside, "001-alpha.md"), "utf8")).toBe("# plan\n");
        expect(readFileSync(join(w.clone, `${ALPHA}/ledger.jsonl`), "utf8")).toBe("{\"id\":\"alpha/1\"}\n");
        expect(w.synced(w.clone)).toBe(before);
      }
    }
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

  it("refuses a publish from a checkout that never synced, naming restore, and pushes nothing", async () => {
    const w = world();
    // A fresh clone with every record on disk (copied in, as from a backup), one an old copy: no sync base says which copy they are.
    const fresh = join(w.dir, "fresh");
    execFileSync("git", ["clone", "-q", w.url, fresh], { env: w.env });
    for (const record of w.tree("records").filter((path) => isRecordPath(path)))
      w.write(fresh, record, w.git(w.origin, "cat-file", "blob", `records:${record}`) + "\n");
    w.write(fresh, PLAN, "# plan, an old copy\n");
    const before = { origin: w.refs(w.origin), fresh: w.refs(fresh) };
    const gates = passing();
    const refused: Result = await records.publish({ root: fresh, env: w.env, message: "m", runGates: gates.run });
    expect(refused.code).toBe(1);
    expect(refused.lines.join("\n")).toContain("has not synced to the records branch yet");
    expect(refused.lines.join("\n")).toContain("run `node scripts/records.mjs restore`");
    expect(gates.calls).toHaveLength(0);
    expect(w.refs(w.origin)).toBe(before.origin);
    expect(w.refs(fresh)).toBe(before.fresh);
    expect(w.git(w.origin, "show", `records:${PLAN}`)).toBe("# plan");
  });

  it("refuses both spellings of a record the records branch renamed only in case, pushing nothing, and publishes once the old spelling is gone", async () => {
    const w = world();
    const renamed = "docs/plans/001-Alpha.md";
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    const oid = w.git(w.clone, "rev-parse", `${upstream}:${PLAN}`);
    const rename = w.craft(w.clone, upstream, (indexed) => {
      indexed("update-index", "--force-remove", "--", PLAN);
      indexed("update-index", "--add", "--cacheinfo", `100644,${oid},${renamed}`);
    });
    w.git(w.clone, "push", "-q", "origin", `${rename}:refs/heads/records`);
    const restored: Result = await records.restore(w.opts);
    expect(restored.code, restored.lines.join("\n")).toBe(0);
    // The old spelling is still on disk: the one file where the disk folds case, a second file where it does not.
    expect(existsSync(join(w.clone, PLAN))).toBe(true);
    const before = { clone: w.refs(w.clone), origin: w.refs(w.origin) };
    const gates = passing();
    for (const dryRun of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- each publish reads the checkout the previous one left
      const refused: Result = await records.publish({ ...w.opts, message: "m", dryRun, runGates: gates.run });
      expect(refused.code, `${String(dryRun)}: ${refused.lines.join("\n")}`).toBe(1);
      expect(refused.lines[0]).toContain("equal under case folding");
      expect(refused.lines[0]).toContain("nothing was pushed");
      expect(refused.lines[0]).toContain("the old spelling");
      expect(refused.lines).toContain(`${renamed} and ${PLAN}`);
      // The branch holds one spelling only, so the old one is this checkout's to drop: no plain-git repair is named.
      expect(refused.lines.some((line) => line.includes("with plain git"))).toBe(false);
    }
    expect(gates.calls).toHaveLength(0);
    expect({ clone: w.refs(w.clone), origin: w.refs(w.origin) }).toEqual(before);
    // The old spelling deleted (where the disk folds case, the record's one file) and the record written under the branch's spelling.
    rmSync(join(w.clone, PLAN));
    w.write(w.clone, renamed, "# plan, revised\n");
    const published: Result = await records.publish({ ...w.opts, message: "m", runGates: gates.run });
    expect(published.code, published.lines.join("\n")).toBe(0);
    expect(published.lines.filter((line) => line.includes("docs/plans/"))).toEqual([`M ${renamed}`]);
    expect(w.tree("records")).not.toContain(PLAN);
    expect(w.git(w.origin, "show", `records:${renamed}`)).toBe("# plan, revised");
  });

  it("refuses a folder in two spellings that the records branch already holds, naming the plain-git repair, and pushes nothing", async () => {
    const w = world();
    const beta = ".stamity/runs/2026-01-03_beta", betaUp = beta.replace("beta", "BETA");
    const upstream = w.git(w.clone, "rev-parse", "origin/records");
    // A pair that landed before this check, or by plain git, and that this checkout last synced to.
    const paired = w.craft(w.clone, upstream, (indexed) => {
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "# beta\n\nStatus: in progress\n")},${beta}/record.md`);
      indexed("update-index", "--add", "--cacheinfo", `100644,${w.blob(w.clone, "b\n")},${betaUp}/b.md`);
    });
    w.git(w.clone, "push", "-q", "origin", `${paired}:refs/heads/records`);
    w.git(w.clone, "fetch", "-q", "origin");
    w.git(w.clone, "update-ref", SYNC_BASE, paired);
    // The run is in progress, so its folder stays out of the listing on any disk, and the other spelling's
    // file is the base's byte for byte: the built tree is the base's pair plus one plan edit, on every host.
    w.write(w.clone, `${beta}/record.md`, "# beta\n\nStatus: in progress\n");
    w.write(w.clone, `${betaUp}/b.md`, "b\n");
    w.write(w.clone, PLAN, "# plan, revised\n");
    const before = { clone: w.refs(w.clone), origin: w.refs(w.origin) };
    const gates = passing();
    for (const dryRun of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- each publish reads the checkout the previous one left
      const refused: Result = await records.publish({ ...w.opts, message: "m", dryRun, runGates: gates.run });
      expect(refused.code, `${String(dryRun)}: ${refused.lines.join("\n")}`).toBe(1);
      expect(refused.lines.some((line) => line.includes("equal under case folding") && line.includes("nothing was pushed"))).toBe(true);
      expect(refused.lines.filter((line) => line.startsWith(".stamity/runs/"))).toEqual([`${betaUp} and ${beta}`]);
      const at = refused.lines.findIndex((line) => line.includes("with plain git"));
      expect(at, refused.lines.join("\n")).toBeGreaterThan(-1);
      expect(refused.lines.slice(at + 1).map((line) => line.trim())).toEqual(REPAIR);
    }
    expect(gates.calls).toHaveLength(0);
    expect({ clone: w.refs(w.clone), origin: w.refs(w.origin) }).toEqual(before);
  });

  it("refuses a record path outside printable ASCII, naming it, and pushes nothing", async () => {
    const w = world();
    w.write(w.clone, SIGMA_PLAN, "# plan, another\n");
    w.write(w.clone, PLAN, "# plan, revised\n");
    const before = { clone: w.refs(w.clone), origin: w.refs(w.origin) };
    const gates = passing();
    const refused: Result = await records.publish({ ...w.opts, message: "m", runGates: gates.run });
    expect(refused.code, refused.lines.join("\n")).toBe(1);
    expect(refused.lines.some((line) => line.includes("not portable") && line.includes("nothing was pushed"))).toBe(true);
    expect(refused.lines).toContain(SIGMA_SHOWN);
    expect(gates.calls).toHaveLength(0);
    expect({ clone: w.refs(w.clone), origin: w.refs(w.origin) }).toEqual(before);
  });

  // A Windows disk cannot hold these names as files of their own, so only a POSIX host can list them.
  it.skipIf(!POSIX)("refuses a record name in printable ASCII that is not portable, naming each, and pushes nothing", async () => {
    const w = world();
    for (const odd of UNPORTABLE) w.write(w.clone, odd, "odd\n");
    w.write(w.clone, PLAN, "# plan, revised\n");
    const before = { clone: w.refs(w.clone), origin: w.refs(w.origin) };
    const gates = passing();
    for (const dryRun of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- each publish reads the checkout the previous one left
      const refused: Result = await records.publish({ ...w.opts, message: "m", dryRun, runGates: gates.run });
      expect(refused.code, `${String(dryRun)}: ${refused.lines.join("\n")}`).toBe(1);
      expect(refused.lines.some((line) => line.includes("not portable") && line.includes("nothing was pushed"))).toBe(true);
      for (const odd of UNPORTABLE) expect(refused.lines, odd).toContain(odd);
    }
    expect(gates.calls).toHaveLength(0);
    expect({ clone: w.refs(w.clone), origin: w.refs(w.origin) }).toEqual(before);
    expect(w.tree("records").filter((path) => path.startsWith("docs/plans/"))).toEqual([PLAN]);
  });

  it("refuses a case variant of the placeholder main keeps, naming it, and pushes nothing", async () => {
    const w = world();
    const shouting = GITKEEP.replace(".gitkeep", ".GITKEEP");
    // Main's placeholder leaves its index and the disk, so that where the disk folds case too the variant is a file of its own that commit lists.
    w.git(w.clone, "rm", "-q", "--cached", "--", GITKEEP);
    rmSync(join(w.clone, GITKEEP));
    w.write(w.clone, shouting, "");
    w.write(w.clone, PLAN, "# plan, revised\n");
    const before = { clone: w.refs(w.clone), origin: w.refs(w.origin) };
    const gates = passing();
    const refused: Result = await records.publish({ ...w.opts, message: "m", runGates: gates.run });
    expect(refused.code, refused.lines.join("\n")).toBe(1);
    expect(refused.lines[0]).toContain("neither records nor the branch's own files");
    expect(refused.lines[0]).toContain("nothing was pushed");
    expect(refused.lines).toContain(shouting);
    expect(gates.calls).toHaveLength(0);
    expect({ clone: w.refs(w.clone), origin: w.refs(w.origin) }).toEqual(before);
    expect(w.tree("records")).not.toContain(shouting);
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

  it("init refuses a record path outside printable ASCII at the base, naming it, and creates no branch", async () => {
    const local = world({ init: false });
    local.write(local.clone, SIGMA_PLAN, "# plan, another\n");
    local.git(local.clone, "add", "--", SIGMA_PLAN);
    local.git(local.clone, "-c", "commit.gpgsign=false", "commit", "-qm", "a record named outside ASCII");
    const refused: Result = await records.init({ ...local.opts, base: local.git(local.clone, "rev-parse", "HEAD") });
    expect(refused.code, refused.lines.join("\n")).toBe(1);
    expect(refused.lines).toContain(`100644 ${SIGMA_SHOWN}`);
    expect(local.refs(local.clone)).not.toContain("refs/heads/records");
    expect(local.refs(local.origin)).not.toContain("refs/heads/records");
  });

  // Git for Windows refuses these names in an index, so only a POSIX host can build the base that carries them.
  it.skipIf(!POSIX)("init refuses a record name in printable ASCII that is not portable at the base, naming each, and creates no branch", async () => {
    const local = world({ init: false });
    const odd = local.craft(local.clone, local.base, (indexed) => {
      for (const name of UNPORTABLE) indexed("update-index", "--add", "--cacheinfo", `100644,${local.blob(local.clone, "odd\n")},${name}`);
    });
    const refused: Result = await records.init({ ...local.opts, base: odd });
    expect(refused.code, refused.lines.join("\n")).toBe(1);
    expect(refused.lines[0]).toContain("not portable");
    for (const name of UNPORTABLE) expect(refused.lines, name).toContain(`100644 ${name}`);
    expect(local.refs(local.clone)).not.toContain("refs/heads/records");
    expect(local.refs(local.origin)).not.toContain("refs/heads/records");
  });

  it("init refuses a base whose records hold a folder or a file in two spellings, naming each pair, and creates no branch", async () => {
    const local = world({ init: false });
    const paired = local.craft(local.clone, local.base, (indexed) => {
      indexed("update-index", "--add", "--cacheinfo", `100644,${local.blob(local.clone, "b\n")},${ALPHA_UP}/b.md`);
      indexed("update-index", "--add", "--cacheinfo", `100644,${local.blob(local.clone, "# plan, the other spelling\n")},docs/plans/001-Alpha.md`);
    });
    const refused: Result = await records.init({ ...local.opts, base: paired });
    expect(refused.code, refused.lines.join("\n")).toBe(1);
    expect(refused.lines.some((line) => line.includes("equal under case folding") && line.includes("nothing was created"))).toBe(true);
    expect(refused.lines).toEqual(expect.arrayContaining([`${ALPHA_UP} and ${ALPHA}`, `docs/plans/001-Alpha.md and ${PLAN}`]));
    expect(refused.lines.some((line) => line.includes("with plain git"))).toBe(false);
    expect(local.refs(local.clone)).not.toContain("refs/heads/records");
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

  it("never reads a flag as an option's value: commit -m --dry-run exits 2, pushes nothing and moves no ref", () => {
    const w = world();
    w.write(w.clone, PLAN, "# plan, revised\n");
    const before = { clone: w.refs(w.clone), origin: w.refs(w.origin) };
    const dry = spawnSync(process.execPath, [SCRIPT, "commit", "-m", "--dry-run"], { cwd: w.clone, env: w.env, encoding: "utf8" });
    expect(dry.status, `${dry.stdout}${dry.stderr}`).toBe(2);
    expect(dry.stderr).toContain("-m needs a value");
    expect({ clone: w.refs(w.clone), origin: w.refs(w.origin) }).toEqual(before);
    for (const [args, flag] of [
      [["commit", "-m", "--allow-deletions"], "-m"], [["commit", "--dry-run", "-m", "--force"], "-m"],
      [["restore", "--ref", "--no-fetch"], "--ref"], [["setup", "--ref", "--force"], "--ref"],
      [["verify", "--base", "--ref", "x"], "--base"], [["init", "--base", "-m"], "--base"],
    ] as const) expect((records.parseArgs([...args]) as { error?: string }).error, args.join(" ")).toContain(`${flag} needs a value`);
    // A message that merely starts with a dash is no flag, and stays a message.
    expect(records.parseArgs(["commit", "-m", "-x: a message", "--dry-run"])).toEqual({ verb: "commit", options: { message: "-x: a message", dryRun: true } });
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
      "cannot be deleted", "Status: in progress", "deleted on the branch", "publishes it again", "nothing but records", "differ only in case", "`commit` refuses to build one",
      "letters, digits, `.`, `_` and `-`", "Windows device name", "files or folders", "`git --literal-pathspecs rm -r --cached`",
      "`git push origin HEAD:refs/heads/records`"])
      expect(readme).toContain(text);
  });
});
