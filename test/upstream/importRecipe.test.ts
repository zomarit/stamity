import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { commitAll, git, gitAvailable, isolatedEnv, makeScratch, writeFiles, type Repo } from "./fixtures.ts";

/**
 * f1-import-recipe (REQ-UPSTREAM-014): the private import in `docs/enterprise-forks.md` copies
 * upstream `main` alone.
 *
 * A doc example comes from a run: the two git commands of the guide's import block are taken from
 * the page itself, pointed at temporary bare repositories over `file://`, and run with
 * `execFileSync` and no shell, so the destination's refs are what the printed recipe produces and
 * not what a paraphrase of it would. The fixture upstream carries every ref kind the canonical
 * repository holds besides `main` — an annotated release tag, an annotated replay tag, an orphan
 * `plugin-dist` branch and a `plugins/v*` tag on it — so a recipe that copied any of them shows.
 *
 * Machines without git skip, as the lane's suite does.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GUIDE = readFileSync(join(REPO_ROOT, "docs/enterprise-forks.md"), "utf8");

const UPSTREAM_URL = "https://github.com/zomarit/stamity";
const DESTINATION_ARGUMENT = '"$STAMITY_PRIVATE_URL.git"';
const CLONE_PREFIX = "git clone --bare";
const PUSH_PREFIX = "git -C stamity-import.git push";

/** The fenced `sh` block holding the import's clone line. */
function importBlock(page: string): string {
  const blocks = [...page.matchAll(/^```sh\n([\s\S]*?)^```$/gm)].map((match) => match[1] ?? "");
  const holding = blocks.filter((block) => block.split("\n").some((line) => line.startsWith(CLONE_PREFIX)));
  if (holding.length !== 1) throw new Error(`expected one sh block with a "${CLONE_PREFIX}" line, found ${holding.length}`);
  return holding[0] ?? "";
}

/** The one line of the block that starts with `prefix`. */
function lineStarting(block: string, prefix: string): string {
  const lines = block.split("\n").filter((line) => line.startsWith(prefix));
  if (lines.length !== 1) throw new Error(`expected one line starting "${prefix}", found ${lines.length}`);
  return lines[0] ?? "";
}

/**
 * One printed command as an argument vector, the two URLs replaced. Only the shapes the recipe uses
 * are accepted — bare words, one single-quoted word, the quoted destination variable — so a line
 * that grew a shell feature this split cannot reproduce fails here instead of running differently.
 */
function argumentsOf(line: string, upstreamUrl: string, destinationUrl: string): string[] {
  let replaced = 0;
  const words = line.split(/\s+/).filter((word) => word !== "");
  const argv = words.map((word) => {
    if (word === UPSTREAM_URL) {
      replaced += 1;
      return upstreamUrl;
    }
    if (word === DESTINATION_ARGUMENT) {
      replaced += 1;
      return destinationUrl;
    }
    const quoted = /^'([^']*)'$/.exec(word);
    if (quoted !== null) return quoted[1] ?? "";
    if (/['"$\\`|;&<>]/.test(word)) throw new Error(`the recipe line carries a shell form this test cannot run: ${word}`);
    return word;
  });
  if (replaced !== 1) throw new Error(`expected one URL to replace in "${line}", replaced ${replaced}`);
  if (argv[0] !== "git") throw new Error(`the recipe line does not run git: ${line}`);
  return argv.slice(1);
}

function refsOf(repo: Repo, gitDir: string): string[] {
  return git(repo, ["--git-dir", gitDir, "for-each-ref", "--format=%(refname)"])
    .stdout.split("\n")
    .filter((line) => line !== "")
    .toSorted();
}

const GIT = gitAvailable();

describe("the guide's import block", () => {
  const block = importBlock(GUIDE);

  it("clones bare, single-branch at main and without tags, and pushes main alone", () => {
    expect(lineStarting(block, CLONE_PREFIX)).toContain("--single-branch --branch main --no-tags");
    expect(lineStarting(block, PUSH_PREFIX)).toContain("'refs/heads/main:refs/heads/main'");
    expect(block, "the import still mirrors every upstream ref").not.toContain("--mirror");
    expect(block, "the import still pushes an upstream tag").not.toContain("refs/tags/");
  });
});

describe.skipIf(!GIT)("the guide's import block, run against a fixture upstream", () => {
  const scratches: Array<() => void> = [];
  afterAll(() => {
    for (const cleanup of scratches) cleanup();
  });

  /** Upstream: `main` with two commits and two annotated tags on it, an orphan `plugin-dist` with its own tag. */
  function createUpstream(dir: string): { repo: Repo; main: string } {
    const repo: Repo = { dir, env: isolatedEnv(dir) };
    git(repo, ["-c", "init.defaultBranch=main", "init", "--quiet"]);
    writeFiles(dir, { "a.txt": "one\n" });
    commitAll(repo, "first");
    git(repo, ["tag", "-a", "v1.0.0", "-m", "release v1.0.0"]);
    writeFiles(dir, { "a.txt": "two\n" });
    const main = commitAll(repo, "second");
    git(repo, ["tag", "-a", "replay-frozen-x", "-m", "frozen replay"]);
    git(repo, ["checkout", "--quiet", "--orphan", "plugin-dist"]);
    git(repo, ["rm", "-r", "--quiet", "--cached", "."]);
    writeFiles(dir, { "a.txt": null, "plugin.json": "{}\n" });
    commitAll(repo, "plugin distribution");
    git(repo, ["tag", "-a", "plugins/v1.0.0", "-m", "plugins v1.0.0"]);
    git(repo, ["checkout", "--quiet", "main"]);
    return { repo, main };
  }

  /** Runs the guide's two commands in `work`, with the upstream and the destination behind `file://`. */
  function runRecipe(work: string, repo: Repo, upstreamDir: string, destinationDir: string): void {
    const upstreamUrl = pathToFileURL(upstreamDir).href;
    const destinationUrl = pathToFileURL(destinationDir).href;
    for (const prefix of [CLONE_PREFIX, PUSH_PREFIX]) {
      const argv = argumentsOf(lineStarting(importBlock(GUIDE), prefix), upstreamUrl, destinationUrl);
      execFileSync("git", argv, { cwd: work, env: repo.env, stdio: "pipe", windowsHide: true });
    }
  }

  function setUp(label: string): { work: string; upstream: Repo; main: string; destination: string } {
    const scratch = makeScratch(label);
    scratches.push(scratch.cleanup);
    const upstreamDir = join(scratch.dir, "upstream");
    const work = join(scratch.dir, "work");
    const destination = join(scratch.dir, "destination.git");
    for (const dir of [upstreamDir, work, destination]) mkdirSync(dir);
    const { repo, main } = createUpstream(upstreamDir);
    git(repo, ["-c", "init.defaultBranch=main", "init", "--quiet", "--bare", destination]);
    return { work, upstream: repo, main, destination };
  }

  it("leaves the destination holding refs/heads/main alone, at upstream main", () => {
    const { work, upstream, main, destination } = setUp("import-empty");
    // The fixture is non-degenerate: every ref kind the recipe must leave behind is upstream.
    expect(refsOf(upstream, join(upstream.dir, ".git"))).toEqual([
      "refs/heads/main",
      "refs/heads/plugin-dist",
      "refs/tags/plugins/v1.0.0",
      "refs/tags/replay-frozen-x",
      "refs/tags/v1.0.0",
    ]);

    runRecipe(work, upstream, upstream.dir, destination);

    expect(refsOf(upstream, join(work, "stamity-import.git")), "the bare import fetched more than main").toEqual([
      "refs/heads/main",
    ]);
    expect(refsOf(upstream, destination)).toEqual(["refs/heads/main"]);
    expect(git(upstream, ["--git-dir", destination, "rev-parse", "refs/heads/main"]).stdout.trim()).toBe(main);
  });

  it("keeps a branch the destination already holds", () => {
    const { work, upstream, main, destination } = setUp("import-feature");
    const feature = git(upstream, ["rev-parse", "plugin-dist"]).stdout.trim();
    git(upstream, ["push", "--quiet", destination, `${feature}:refs/heads/feature`]);

    runRecipe(work, upstream, upstream.dir, destination);

    expect(refsOf(upstream, destination)).toEqual(["refs/heads/feature", "refs/heads/main"]);
    expect(git(upstream, ["--git-dir", destination, "rev-parse", "refs/heads/feature"]).stdout.trim()).toBe(feature);
    expect(git(upstream, ["--git-dir", destination, "rev-parse", "refs/heads/main"]).stdout.trim()).toBe(main);
  });
});
