import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { FIXED_GIT_ENV, PASS_IDS, applyPatch, createReplayFixture, dataDirOf, fixtureOptionsOf, refuseOutInsideRepository, renderPlan, seededPatchSet } from "../../scripts/replay/fixture.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { DEFAULT_PROTOCOL, PROTOCOLS } from "../../scripts/replay/protocols.mjs";

/**
 * The replay fixture generator, over a synthetic `v1Dir` this suite writes: a two-file base patch,
 * two pass patches cut from one chain, a plan template, and — beside them, where a careless copy
 * would pick them up — a `seeds.json` and the two oracle patches. The real replay data (the base
 * service and the six seeded passes) lands in later units; everything the generator promises is a
 * property of how it treats whatever data it is given, so the suite does not wait on them.
 *
 * Every git call here runs with an empty global config and no system config, so the operator's own
 * git settings cannot shape the patches this suite cuts or the commits it compares.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const FIXTURE_MJS = join(REPO_ROOT, "scripts", "replay", "fixture.mjs");

let root: string;
let cleanGlobal: string;
let v1: string;
let savedGlobal: string | undefined;

/** Twenty numbered lines. Pass 1 edits line 3, pass 2 edits line 12, the context test edits line 9. */
const A_LINES = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
/** Line 5 ends in a space, so a whitespace-fixing apply config would change the base bytes. */
A_LINES[4] = "line 5 ";

function gitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_CONFIG_GLOBAL: cleanGlobal, GIT_CONFIG_NOSYSTEM: "1", ...FIXED_GIT_ENV };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: gitEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * A real path as it is spelled inside a gitconfig value: git reads a backslash there as an escape,
 * so a native Windows path (`C:\Users\…`) is a "bad config line". Git on Windows accepts forward
 * slashes, so every path this suite writes into config text goes through here.
 */
function configPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function writeTree(dir: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content, "utf8");
  }
}

/**
 * A `v1Dir` whose patches are real `git diff` output cut from one chain in a scratch repository:
 * `base.patch` from the empty tree, then one patch per pass against the state before it. That is
 * how the replay's own patches are made, so their `index` lines name the chain's preimage blobs.
 */
function writeV1(name: string, base: Record<string, string>, passes: Record<string, string>[], template: string): string {
  const dir = join(root, name);
  const scratch = join(root, `${name}-chain`);
  mkdirSync(join(dir, "patches"), { recursive: true });
  mkdirSync(join(dir, "plan"), { recursive: true });
  mkdirSync(scratch, { recursive: true });
  git(scratch, ["init", "--quiet", "--initial-branch", "main"]);
  const cut = (files: Record<string, string>, patch: string): void => {
    writeTree(scratch, files);
    // `--force`, so a case can cut a patch that carries a file its own .gitignore covers.
    git(scratch, ["add", "-A", "--force"]);
    writeFileSync(join(dir, "patches", patch), git(scratch, ["diff", "--cached"]), "utf8");
    git(scratch, ["commit", "--quiet", "-m", patch]);
  };
  cut(base, "base.patch");
  passes.forEach((files, index) => cut(files, `${PASS_IDS[index]}.patch`));
  writeFileSync(join(dir, "plan", "001-replay.md"), template, "utf8");
  return dir;
}

function unitSection(id: string, dependsOn: string): string {
  return [
    `### ${id} — pass ${id}`,
    "",
    "| Field | Content |",
    "|---|---|",
    `| \`id\` | ${id} |`,
    `| \`depends_on\` | ${dependsOn} |`,
    "",
  ].join("\n");
}

const TEMPLATE = [
  "---",
  "id: replay",
  "intent: feature",
  "stamp: {{STAMP}}",
  "reads: [src/a.txt]",
  "---",
  "",
  "# Replay",
  "",
  "## Context",
  "",
  "The synthetic service.",
  "",
  "## Units",
  "",
  unitSection("u1-p1", "none"),
  unitSection("u1-p2", "u1-p1"),
  "## Risks",
  "",
  "None.",
  "",
].join("\n");

function withLine(lines: string[], lineNumber: number, text: string): string {
  const copy = [...lines];
  copy[lineNumber - 1] = text;
  return `${copy.join("\n")}\n`;
}

const PASS_1_A = withLine(A_LINES, 3, "line 3 changed by pass 1");
const PASS_2_A = withLine(PASS_1_A.trimEnd().split("\n"), 12, "line 12 changed by pass 2");
/** Pass 1 as another chain had it: the same line, different bytes. */
const OTHER_PASS_1_A = withLine(A_LINES, 3, "line 3 as another chain had it");

function build(options: Record<string, unknown> = {}): {
  dir: string;
  baseCommit: string;
  planCommit: string;
  setupCommit: string | null;
  planPath: string;
  planSha256: string;
  units: string[];
  steps: { name: string; command: string; exitCode: number | null; output: string }[];
  cli: unknown;
  gates: Record<string, { exitCode: number | null; output: string }> | null;
} {
  return createReplayFixture({ out: root, v1Dir: v1, install: false, setup: false, ...options });
}

function lsFiles(dir: string): string[] {
  return git(dir, ["ls-files"]).split("\n").filter((path) => path !== "");
}

/** The preimage ids a patch records, excluding new files (all zeros). */
function preimages(patch: string): string[] {
  return [...readFileSync(patch, "utf8").matchAll(/^index ([0-9a-f]+)\.\./gm)]
    .map((match) => match[1]!)
    .filter((id) => !/^0+$/.test(id));
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "stamity-replay-test-"));
  cleanGlobal = join(root, "empty.gitconfig");
  writeFileSync(cleanGlobal, "", "utf8");
  // Pin the generator's global config for the whole file; the hostile-config case swaps it.
  savedGlobal = process.env["GIT_CONFIG_GLOBAL"];
  process.env["GIT_CONFIG_GLOBAL"] = cleanGlobal;
  v1 = writeV1(
    "v1",
    { ".gitignore": "node_modules/\n", "src/a.txt": `${A_LINES.join("\n")}\n` },
    [{ "src/a.txt": PASS_1_A }, { "src/a.txt": PASS_2_A, "src/b.txt": "added by pass 2\n" }],
    TEMPLATE,
  );
  // The answer key, beside the data it grades — exactly where a whole-directory copy would find it.
  writeFileSync(join(v1, "seeds.json"), '{"schema":"stamity/replay-seeds/v1","seeds":[],"decoys":[]}\n', "utf8");
  mkdirSync(join(v1, "oracle"), { recursive: true });
  writeFileSync(join(v1, "oracle", "oracles.patch"), "", "utf8");
  writeFileSync(join(v1, "oracle", "reference-fixes.patch"), "", "utf8");
});

afterAll(() => {
  if (savedGlobal === undefined) delete process.env["GIT_CONFIG_GLOBAL"];
  else process.env["GIT_CONFIG_GLOBAL"] = savedGlobal;
  rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

describe("createReplayFixture — S0", () => {
  it("builds the same base and plan commits twice", () => {
    const first = build({ units: "u1-p1,u1-p2" });
    const second = build({ units: "u1-p1,u1-p2" });
    expect(first.dir).not.toBe(second.dir);
    expect(first.baseCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(second.baseCommit).toBe(first.baseCommit);
    expect(second.planCommit).toBe(first.planCommit);
    expect(first.setupCommit).toBeNull();
    expect(first.cli).toBeNull();
    expect(first.gates).toBeNull();
    // The base bytes survived the apply, trailing space included.
    expect(readFileSync(join(first.dir, "src", "a.txt"), "utf8")).toBe(`${A_LINES.join("\n")}\n`);
    expect(git(first.dir, ["log", "--format=%s|%an|%ae|%aI"])).toBe(
      "replay plan|replay fixture|replay@invalid.local|2026-09-24T00:00:00Z\n" +
        "service base|replay fixture|replay@invalid.local|2026-09-24T00:00:00Z\n",
    );
  });

  it("spells a native Windows path in config text with forward slashes, which git parses", () => {
    // The two hostile-config cases below failed on the Windows leg at `git init` with "bad config
    // line": a backslash in a gitconfig value is an escape. The shape reproduces on any platform.
    const windowsPath = "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\no-such-gpg";
    const spelled = configPath(windowsPath);
    expect(spelled).toBe("C:/Users/RUNNER~1/AppData/Local/Temp/no-such-gpg");
    const probe = (value: string): number => {
      const file = join(root, "probe.gitconfig");
      writeFileSync(file, ["[gpg]", `\tprogram = ${value}`, ""].join("\n"), "utf8");
      return spawnSync("git", ["config", "--file", file, "gpg.program"], { encoding: "utf8", env: gitEnv() }).status ?? -1;
    };
    expect(probe(windowsPath)).not.toBe(0);
    expect(probe(spelled)).toBe(0);
  });

  it("holds S0 fixed under a global config that signs, hooks, excludes and fixes whitespace", () => {
    const reference = build({ units: "u1-p1,u1-p2" }).baseCommit;
    const hooks = join(root, "hostile-hooks");
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, "commit-msg"), '#!/bin/sh\necho "rewritten by a global hook" >> "$1"\n', "utf8");
    chmodSync(join(hooks, "commit-msg"), 0o755);
    const excludes = join(root, "hostile-excludes");
    writeFileSync(excludes, "vendor/\n", "utf8");
    const hostile = join(root, "hostile.gitconfig");
    writeFileSync(
      hostile,
      [
        "[commit]",
        "\tgpgsign = true",
        "[gpg]",
        `\tprogram = ${configPath(join(root, "no-such-gpg"))}`,
        "[core]",
        `\thooksPath = ${configPath(hooks)}`,
        `\texcludesFile = ${configPath(excludes)}`,
        "\tautocrlf = true",
        "[apply]",
        "\twhitespace = error",
        "",
      ].join("\n"),
      "utf8",
    );
    expect(readFileSync(hostile, "utf8")).not.toContain("\\");
    process.env["GIT_CONFIG_GLOBAL"] = hostile;
    try {
      const built = build({ units: "u1-p1,u1-p2" });
      expect(built.baseCommit).toBe(reference);
      expect(git(built.dir, ["log", "-1", "--format=%B", built.baseCommit]).trim()).toBe("service base");
    } finally {
      process.env["GIT_CONFIG_GLOBAL"] = cleanGlobal;
    }
  });

  it("refuses an --out inside this repository, naming the leak gate, and creates nothing there", () => {
    const inside = join(REPO_ROOT, "replay-fixture-out-test");
    expect(() => build({ out: inside })).toThrow(/leak gate/);
    expect(existsSync(inside)).toBe(false);
  });

  it("holds S0 fixed under a global attributes file with a filter driver and a template that excludes vendor/", () => {
    const reference = build({ units: "u1-p1,u1-p2" }).baseCommit;
    const attributes = join(root, "hostile-attributes");
    writeFileSync(attributes, "* filter=hostile\n", "utf8");
    const template = join(root, "hostile-template");
    mkdirSync(join(template, "info"), { recursive: true });
    writeFileSync(join(template, "info", "exclude"), "vendor/\n", "utf8");
    const hostile = join(root, "hostile-attributes.gitconfig");
    writeFileSync(
      hostile,
      [
        "[core]",
        `\tattributesFile = ${configPath(attributes)}`,
        '[filter "hostile"]',
        "\tclean = sed s/line/LINE/",
        "[init]",
        `\ttemplateDir = ${configPath(template)}`,
        "",
      ].join("\n"),
      "utf8",
    );
    expect(readFileSync(hostile, "utf8")).not.toContain("\\");
    process.env["GIT_CONFIG_GLOBAL"] = hostile;
    try {
      const built = build({ units: "u1-p1,u1-p2" });
      expect(lsFiles(built.dir)).toEqual(expect.arrayContaining(["vendor/contrib/u1-p1.patch", "vendor/contrib/u1-p2.patch"]));
      expect(built.baseCommit).toBe(reference);
    } finally {
      process.env["GIT_CONFIG_GLOBAL"] = cleanGlobal;
    }
  });

  it("refuses an --out inside another worktree of the same repository, through the git common dir", () => {
    const main = join(root, "wt-main");
    mkdirSync(main, { recursive: true });
    git(main, ["init", "--quiet", "--initial-branch", "main"]);
    writeFileSync(join(main, "f.txt"), "f\n", "utf8");
    git(main, ["add", "-A"]);
    git(main, ["commit", "--quiet", "-m", "f"]);
    const linked = join(root, "wt-linked");
    git(main, ["worktree", "add", "--quiet", "--detach", linked]);
    // A path that does not exist yet: the nearest existing ancestor decides.
    expect(() => refuseOutInsideRepository(join(linked, "not", "yet"), main)).toThrow(/inside this repository.*leak gate/s);
    expect(() => refuseOutInsideRepository(join(main, "sub"), main)).toThrow(/leak gate/);
    expect(() => refuseOutInsideRepository(join(root, "elsewhere"), main)).not.toThrow();
  });

  it("refuses the same --out from the command line with exit 1", () => {
    const inside = join(REPO_ROOT, "replay-fixture-out-test");
    const result = spawnSync(process.execPath, [FIXTURE_MJS, "--out", inside, "--no-setup", "--no-install"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/inside this repository.*leak gate/s);
    expect(existsSync(inside)).toBe(false);
  });

  it("copies only the selected pass patches and renders only their unit sections", () => {
    const built = build({ units: ["u1-p1"] });
    expect(built.units).toEqual(["u1-p1"]);
    expect(readdirSync(join(built.dir, "vendor", "contrib"))).toEqual(["u1-p1.patch"]);
    const plan = readFileSync(join(built.dir, built.planPath), "utf8");
    expect(plan.match(/^### /gm)).toHaveLength(1);
    expect(plan).toContain("### u1-p1 — pass u1-p1");
    expect(plan).not.toContain("u1-p2");
    // The sections around the units survive the drop.
    expect(plan).toContain("## Risks");
    expect(built.planSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never commits the answer key sitting beside the data", () => {
    const built = build({ units: "u1-p1,u1-p2" });
    const files = lsFiles(built.dir);
    expect(files).toEqual(
      expect.arrayContaining([".gitignore", "src/a.txt", "vendor/contrib/u1-p1.patch", "vendor/contrib/u1-p2.patch", "docs/plans/001-replay.md"]),
    );
    expect(files.filter((path) => /seeds\.json|__oracle__|reference-fixes/.test(path))).toEqual([]);
  });

  it("refuses S0 when a patch itself carries an answer-key path", () => {
    const leaky = writeV1("v1-leaky", { "src/a.txt": "a\n", "test/__oracle__/x.test.ts": "export {};\n" }, [], TEMPLATE);
    expect(() => build({ v1Dir: leaky, units: "none" })).toThrow(/answer-key paths \(test\/__oracle__\/x\.test\.ts\)/);
  });

  it("refuses S0 when a patch leaves an answer-key file in the tree behind a .gitignore line", () => {
    const hidden = writeV1("v1-hidden", { "src/a.txt": "a\n", ".gitignore": "seeds.json\n", "seeds.json": "{}\n" }, [], TEMPLATE);
    let caught: (Error & { dir?: string }) | undefined;
    try {
      build({ v1Dir: hidden, units: "none" });
    } catch (error) {
      caught = error as typeof caught;
    }
    expect(caught?.message).toMatch(/answer-key paths \(seeds\.json\)/);
    // The refused tree is named, so the caller can inspect or remove it.
    expect(caught?.dir).toMatch(/stamity-replay-/);
    expect(existsSync(caught!.dir!)).toBe(true);
  });

  it("stamps the plan with S0 and the fixture date", () => {
    const built = build({ units: "u1-p1,u1-p2" });
    const plan = readFileSync(join(built.dir, built.planPath), "utf8");
    expect(plan.split("\n").filter((line) => line.startsWith("stamp:"))).toEqual([`stamp: ${built.baseCommit} 2026-09-24`]);
  });
});

describe("createReplayFixture — stored preimages", () => {
  it("stores a later pass's preimage blobs, which S0's tree does not hold", () => {
    const built = build({ units: "u1-p1,u1-p2" });
    const pass2 = join(built.dir, "vendor", "contrib", "u1-p2.patch");
    const ids = preimages(pass2);
    expect(ids.length).toBeGreaterThan(0);
    const s0Blobs = git(built.dir, ["ls-tree", "-r", built.baseCommit]);
    for (const id of ids) {
      // Not reachable from S0: pass 2's preimage is the tree after pass 1.
      expect(s0Blobs).not.toContain(` ${id}`);
      expect(spawnSync("git", ["cat-file", "-e", `${id}^{blob}`], { cwd: built.dir, env: gitEnv() }).status).toBe(0);
    }
  });

  it("applies pass 2 with --3way after pass 1 and an edit to one of pass 2's context lines", () => {
    const built = build({ units: "u1-p1,u1-p2" });
    const contrib = join(built.dir, "vendor", "contrib");
    applyPatch(built.dir, join(contrib, "u1-p1.patch"), { threeWay: true });
    const aPath = join(built.dir, "src", "a.txt");
    writeFileSync(aPath, readFileSync(aPath, "utf8").replace("line 9\n", "line 9 edited by an agent\n"), "utf8");
    git(built.dir, ["add", "src/a.txt"]);
    // On its own this case passes without the stored preimages: `--3way` of pass 1 implies
    // `--index`, which writes pass 1's postimage blob itself. The two cases around it are the proof.
    // The edit breaks a context line, so a plain apply refuses and only the fallback can land it.
    expect(() => applyPatch(built.dir, join(contrib, "u1-p2.patch"))).toThrow();
    applyPatch(built.dir, join(contrib, "u1-p2.patch"), { threeWay: true });
    const merged = readFileSync(aPath, "utf8");
    expect(merged).toContain("line 9 edited by an agent\n");
    expect(merged).toContain("line 12 changed by pass 2\n");
    expect(merged).not.toContain("<<<<<<<");
    expect(readFileSync(join(built.dir, "src", "b.txt"), "utf8")).toBe("added by pass 2\n");
  });

  it("resolves the fallback even when pass 1 went in without --index, so only S0's store holds pass 2's preimage", () => {
    const built = build({ units: "u1-p1,u1-p2" });
    const contrib = join(built.dir, "vendor", "contrib");
    applyPatch(built.dir, join(contrib, "u1-p1.patch"));
    const aPath = join(built.dir, "src", "a.txt");
    writeFileSync(aPath, readFileSync(aPath, "utf8").replace("line 9\n", "line 9 edited by an agent\n"), "utf8");
    git(built.dir, ["add", "-A"]);
    applyPatch(built.dir, join(contrib, "u1-p2.patch"), { threeWay: true });
    expect(readFileSync(aPath, "utf8")).toContain("line 12 changed by pass 2\n");
  });

  it("keeps the stored preimages reachable from a ref, so a gc --prune=now leaves the fallback working", () => {
    const built = build({ units: "u1-p1,u1-p2" });
    git(built.dir, ["gc", "--quiet", "--prune=now"]);
    for (const id of preimages(join(built.dir, "vendor", "contrib", "u1-p2.patch"))) {
      expect(spawnSync("git", ["cat-file", "-e", `${id}^{blob}`], { cwd: built.dir, env: gitEnv() }).status).toBe(0);
    }
    const contrib = join(built.dir, "vendor", "contrib");
    applyPatch(built.dir, join(contrib, "u1-p1.patch"));
    const aPath = join(built.dir, "src", "a.txt");
    writeFileSync(aPath, readFileSync(aPath, "utf8").replace("line 9\n", "line 9 edited by an agent\n"), "utf8");
    git(built.dir, ["add", "-A"]);
    applyPatch(built.dir, join(contrib, "u1-p2.patch"), { threeWay: true });
    expect(readFileSync(aPath, "utf8")).toContain("line 12 changed by pass 2\n");
    // The refs name trees, which a history walk does not show the agent.
    expect(git(built.dir, ["log", "--all", "--format=%s"])).toBe("replay plan\nservice base\n");
  });

  it("refuses a pass patch cut from bytes other than the chain's", () => {
    const drifted = writeV1("v1-drifted", { "src/a.txt": `${A_LINES.join("\n")}\n` }, [{ "src/a.txt": PASS_1_A }], TEMPLATE);
    // Pass 2 cut from a different pass-1 result than the chain's own pass 1.
    const other = writeV1(
      "v1-other",
      { "src/a.txt": `${A_LINES.join("\n")}\n` },
      [{ "src/a.txt": OTHER_PASS_1_A }, { "src/a.txt": withLine(OTHER_PASS_1_A.trimEnd().split("\n"), 12, "line 12 changed by pass 2") }],
      TEMPLATE,
    );
    writeFileSync(join(drifted, "patches", "u1-p2.patch"), readFileSync(join(other, "patches", "u1-p2.patch")));
    expect(() => build({ v1Dir: drifted, units: "u1-p1" })).toThrow(/u1-p2\.patch records preimage blob/);
  });
});

describe("createReplayFixture — dependencies and gates", () => {
  it("records a failed install step and throws naming it", () => {
    const broken = writeV1("v1-broken", { "package.json": "{ this is not json\n" }, [], TEMPLATE);
    let caught: (Error & { step?: string; steps?: { name: string; exitCode: number | null; output: string }[] }) | undefined;
    try {
      build({ v1Dir: broken, units: "none", install: true });
    } catch (error) {
      caught = error as typeof caught;
    }
    expect(caught?.message).toMatch(/step "npm install" exited/);
    expect(caught?.step).toBe("npm install");
    const last = caught?.steps?.at(-1);
    expect(last?.name).toBe("npm install");
    expect(last?.exitCode).not.toBe(0);
    expect(last?.output).not.toBe("");
  });

  it("names the partial tree a failed step leaves behind", () => {
    const broken = writeV1("v1-broken-dir", { "package.json": "{ this is not json\n" }, [], TEMPLATE);
    let caught: (Error & { dir?: string }) | undefined;
    try {
      build({ v1Dir: broken, units: "none", install: true });
    } catch (error) {
      caught = error as typeof caught;
    }
    expect(caught?.dir).toMatch(/stamity-replay-/);
    expect(existsSync(join(caught!.dir!, ".git"))).toBe(true);
    expect(caught?.message).toContain(caught!.dir!);
  });

  it("bounds a hung step with a timeout, records the signal and the elapsed time, and throws naming it", () => {
    // A stand-in CLI whose bin never exits: the step that runs it is `stamity init`. (A hung
    // `preinstall` would not do: this checkout's .npmrc sets ignore-scripts, which npx hands down.)
    // The command budget also binds the tarball install before it, which cannot be made to hang, so
    // the budget is one that install clears on a slow runner (npm.cmd through a shell on Windows, a
    // loaded CI leg): the step that times out is always `stamity init`, and the case costs 20 s.
    const pkg = join(root, "hung-cli");
    writeTree(pkg, {
      "package.json": `${JSON.stringify({ name: "@zomarit/stamity", version: "0.0.0-hung", bin: { stamity: "bin.mjs" } })}\n`,
      "bin.mjs": "setInterval(() => {}, 1000);\n",
    });
    const packs = join(root, "hung-cli-packs");
    mkdirSync(packs, { recursive: true });
    const packed = spawnSync("npm", ["pack", "--pack-destination", packs], { cwd: pkg, encoding: "utf8", shell: process.platform === "win32" });
    expect(packed.status, packed.stderr).toBe(0);
    const tarball = join(packs, readdirSync(packs)[0]!);
    let caught: (Error & { step?: string; steps?: { name: string; exitCode: number | null; output: string }[] }) | undefined;
    const started = Date.now();
    try {
      build({ units: "none", setup: true, cliTarball: tarball, timeouts: { command: 20_000 } });
    } catch (error) {
      caught = error as typeof caught;
    }
    // Bounded by the budget plus the steps before it, not by the case's own timeout.
    expect(Date.now() - started).toBeLessThan(90_000);
    expect(caught?.steps?.find((step) => step.name === "npm install cli tarball")?.exitCode).toBe(0);
    expect(caught?.step).toBe("stamity init");
    const last = caught?.steps?.at(-1);
    expect(last?.exitCode).toBeNull();
    expect(last?.output).toMatch(/timed out after 20000 ms: killed by SIGTERM after \d+ ms/);
  }, 180_000);

  // Skipped on win32: npm goes through cmd.exe there (`shell: true`), and the spawnSync timeout
  // kills only that shell, so npm and the hung `node hang.mjs` live on with their cwd inside the
  // fixture, and afterAll's rmSync cannot remove the directory. The timeout logic under test does
  // not depend on the platform, and the POSIX legs cover it. The hung-step case runs its bin through
  // process.execPath with no shell, so it stays on every platform.
  it.skipIf(process.platform === "win32")("records a hung gate as timed out without throwing", () => {
    // The hung gate is lint, the first step the command budget binds (no install, no setup): no
    // earlier step can use up the budget on a slow runner. The two gates after it may time out
    // there too, so only that the build returns with all three recorded is asserted of them.
    const gated = writeV1(
      "v1-gate-hung",
      {
        "package.json": `${JSON.stringify({ name: "gate-hung", private: true, scripts: { lint: "node hang.mjs", typecheck: "node ok.mjs", test: "node ok.mjs" } })}\n`,
        "ok.mjs": "process.exitCode = 0;\n",
        "hang.mjs": "setInterval(() => {}, 1000);\n",
      },
      [],
      TEMPLATE,
    );
    const built = build({ v1Dir: gated, units: "none", runGates: true, timeouts: { command: 3000 } });
    expect(built.steps.filter((step) => step.command.startsWith("npm")).map((step) => step.name)).toEqual(["gate lint", "gate typecheck", "gate test"]);
    expect(built.gates?.["lint"]?.exitCode).toBeNull();
    expect(built.gates?.["lint"]?.output).toMatch(/timed out after 3000 ms: killed by SIGTERM after \d+ ms/);
    expect(Object.keys(built.gates ?? {})).toEqual(["lint", "typecheck", "test"]);
  }, 60_000);

  it("copies --deps with its links verbatim and links --deps-link, keeping both out of git", () => {
    const deps = join(root, "deps");
    writeTree(deps, { "pkg/index.js": "export default 1;\n" });
    const copied = build({ units: "none", deps });
    expect(readFileSync(join(copied.dir, "node_modules", "pkg", "index.js"), "utf8")).toBe("export default 1;\n");
    const linked = build({ units: "none", depsLink: deps });
    expect(lstatSync(join(linked.dir, "node_modules")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(linked.dir, "node_modules", "pkg", "index.js"), "utf8")).toBe("export default 1;\n");
    expect(git(linked.dir, ["status", "--porcelain"])).toBe("");
    expect(() => build({ deps, depsLink: deps })).toThrow(/exclusive/);
  });

  it("refuses --deps-link on a setup build, before building anything", () => {
    const deps = join(root, "deps");
    writeTree(deps, { "pkg/index.js": "export default 1;\n" });
    const before = readdirSync(root).filter((name) => name.startsWith("stamity-replay-")).length;
    expect(() => build({ units: "none", depsLink: deps, setup: true, cliTarball: join(root, "no-such.tgz") })).toThrow(/--deps-link.*setup/s);
    expect(readdirSync(root).filter((name) => name.startsWith("stamity-replay-"))).toHaveLength(before);
  });

  it.skipIf(process.platform === "win32")("keeps a relative link inside --deps pointing where it pointed", () => {
    const deps = join(root, "deps-with-link");
    writeTree(deps, { "real/index.js": "export default 2;\n" });
    symlinkSync("real", join(deps, "alias"));
    const copied = build({ units: "none", deps });
    expect(lstatSync(join(copied.dir, "node_modules", "alias")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(copied.dir, "node_modules", "alias", "index.js"), "utf8")).toBe("export default 2;\n");
  });

  it("records each gate's exit code without throwing on a red gate", () => {
    const gated = writeV1(
      "v1-gated",
      {
        "package.json": `${JSON.stringify({ name: "gated", private: true, scripts: { lint: "node ok.mjs", typecheck: "node ok.mjs", test: "node fail.mjs" } })}\n`,
        "ok.mjs": "process.exitCode = 0;\n",
        "fail.mjs": "process.exitCode = 3;\n",
      },
      [],
      TEMPLATE,
    );
    const built = build({ v1Dir: gated, units: "none", runGates: true });
    expect(built.gates?.["lint"]?.exitCode).toBe(0);
    expect(built.gates?.["typecheck"]?.exitCode).toBe(0);
    expect(built.gates?.["test"]?.exitCode).toBe(3);
    expect(built.steps.map((step) => step.name).slice(-3)).toEqual(["gate lint", "gate typecheck", "gate test"]);
  });

  it("installs the CLI tarball, runs init, sync and check through its bin, and commits the setup", () => {
    // A stand-in tarball rather than this repository's own: packing the real CLI needs a full build
    // and its dependency tree, and what this case proves is the generator's wiring (install
    // --no-save, bin resolution, the three verbs, the no-update-check env, the commit, the recorded
    // tarball hash), not the CLI's behaviour — the pilot runs exercise the real one.
    const pkg = join(root, "fake-cli");
    writeTree(pkg, {
      "package.json": `${JSON.stringify({ name: "@zomarit/stamity", version: "0.0.0-replay-test", bin: { stamity: "bin.mjs" } })}\n`,
      "bin.mjs": [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'mkdirSync(".fake-setup", { recursive: true });',
        'writeFileSync(`.fake-setup/${process.argv[2]}.txt`, `${process.argv.slice(2).join(" ")} update-check=${process.env.STAMITY_NO_UPDATE_CHECK}\\n`);',
        "",
      ].join("\n"),
    });
    const packs = join(root, "fake-cli-packs");
    mkdirSync(packs, { recursive: true });
    const packed = spawnSync("npm", ["pack", "--pack-destination", packs], {
      cwd: pkg,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    expect(packed.status, packed.stderr).toBe(0);
    const tarball = join(packs, readdirSync(packs)[0]!);
    const built = build({ units: "none", setup: true, cliTarball: tarball });
    expect(built.steps.map((step) => step.command).filter((command) => command.startsWith("stamity"))).toEqual([
      "stamity init -y --tools claude",
      "stamity sync -y",
      "stamity check",
    ]);
    expect(readFileSync(join(built.dir, ".fake-setup", "init.txt"), "utf8")).toBe("init -y --tools claude update-check=1\n");
    expect(built.cli).toEqual({
      tarballSha256: createHash("sha256").update(readFileSync(tarball)).digest("hex"),
      version: "0.0.0-replay-test",
    });
    expect(built.setupCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(built.setupCommit).not.toBe(built.planCommit);
    expect(git(built.dir, ["show", "--name-only", "--format=%s", built.setupCommit!]).trim().split("\n")).toEqual([
      "stamity setup",
      "",
      ".fake-setup/check.txt",
      ".fake-setup/init.txt",
      ".fake-setup/sync.txt",
    ]);
  });

  it("refuses setup with no CLI tarball before building anything", () => {
    expect(() => createReplayFixture({ out: root, v1Dir: v1, install: false, units: "none" })).toThrow(/--cli-tarball/);
  });
});

describe("renderPlan", () => {
  it("keeps every unit for the full selection and none for the empty one", () => {
    const all = renderPlan(TEMPLATE, { stamp: "abc", units: ["u1-p1", "u1-p2"] });
    expect(all.match(/^### /gm)).toHaveLength(2);
    expect(all).toContain("stamp: abc 2026-09-24");
    const none = renderPlan(TEMPLATE, { stamp: "abc", units: [] });
    expect(none.match(/^### /gm)).toBeNull();
    expect(none).toContain("## Units");
    expect(none).toContain("## Risks");
  });

  it("refuses a unit the template does not carry, and a template without a stamp", () => {
    expect(() => renderPlan(TEMPLATE, { stamp: "abc", units: ["u2-p1"] })).toThrow(/no unit section for u2-p1/);
    expect(() => renderPlan(TEMPLATE.replace("{{STAMP}}", "x"), { stamp: "abc", units: [] })).toThrow(/STAMP/);
  });

  it("rewrites a kept unit's depends_on past the dropped units, so no reference dangles", () => {
    const three = TEMPLATE.replace("## Risks", `${unitSection("u2-p1", "u1-p2")}## Risks`);
    // The full selection renders the template's bytes, depends_on rows included.
    expect(renderPlan(three, { stamp: "abc", units: ["u1-p1", "u1-p2", "u2-p1"] })).toBe(three.replace("{{STAMP}}", "abc 2026-09-24"));
    const skipOne = renderPlan(three, { stamp: "abc", units: ["u1-p1", "u2-p1"] });
    expect(skipOne).toContain("| `depends_on` | u1-p1 |");
    expect(skipOne).not.toContain("u1-p2");
    const alone = renderPlan(three, { stamp: "abc", units: ["u2-p1"] });
    expect(alone.split("\n").filter((line: string) => line.includes("`depends_on`"))).toEqual(["| `depends_on` | none |"]);
  });

  it("names the six passes in chain order", () => {
    expect(PASS_IDS).toEqual(["u1-p1", "u1-p2", "u2-p1", "u2-p2", "u3-p1", "u3-p2"]);
  });
});

describe("--protocol (plan 011 v2-protocol-paths)", () => {
  it("reads each version's data directory from the protocol table", () => {
    expect(dataDirOf("v1")).toBe(join(REPO_ROOT, "evals", "replay", "v1"));
    expect(dataDirOf("v2")).toBe(join(REPO_ROOT, "evals", "replay", "v2"));
  });

  it("builds S0 from v1's data under --protocol v1, the same commit as with no --protocol", () => {
    const buildCli = (extra: string[]): { baseCommit: string; dir: string } => {
      const out = mkdtempSync(join(tmpdir(), "stamity-replay-protocol-"));
      const result = spawnSync(process.execPath, [FIXTURE_MJS, "--out", out, "--no-setup", "--no-install", "--units", "none", "--json", ...extra], { encoding: "utf8", env: gitEnv() });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const built = JSON.parse(result.stdout) as { baseCommit: string; dir: string };
      rmSync(out, { recursive: true, force: true });
      return built;
    };
    const explicit = buildCli(["--protocol", "v1"]);
    expect(explicit.baseCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(explicit.baseCommit).toBe(buildCli([]).baseCommit);
  });

  it("exits 1 with the usage on an unknown version, and builds nothing (review/48)", () => {
    const out = mkdtempSync(join(tmpdir(), "stamity-replay-protocol-"));
    try {
      // Modified by plan 012 (v3-fixture): `v3` became a protocol version, so the unknown version
      // this case feeds is now `v4`, and the listed versions gain v3. The behaviour pinned — exit 1,
      // the usage, nothing built — is unchanged.
      const result = spawnSync(process.execPath, [FIXTURE_MJS, "--out", out, "--protocol", "v4", "--no-setup", "--no-install"], { encoding: "utf8", env: gitEnv() });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/--protocol v4 is not a protocol version: v1 or v2 or v3/);
      expect(result.stderr).toContain("Usage: node scripts/replay/fixture.mjs");
      expect(result.stderr).toContain("an unknown version exits 1 with this usage, and nothing is built");
      expect(readdirSync(out)).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("the protocol table (plan 012 v3-fixture, criterion 31)", () => {
  it("adds v3's four paths and keeps v1, v2 and the default as they were", () => {
    expect(PROTOCOLS.v3).toEqual({ path: "evals/replay/REPLAY-v3.md", data: "evals/replay/v3", runs: "evals/replay/v3/runs", comparison: "evals/replay/COMPARISON-v3.md" });
    expect(Object.isFrozen(PROTOCOLS.v3)).toBe(true);
    expect(PROTOCOLS.v1).toEqual({ path: "evals/replay/REPLAY-v1.md", data: "evals/replay/v1", runs: "evals/replay/runs", comparison: "evals/replay/COMPARISON-v1.md" });
    expect(PROTOCOLS.v2).toEqual({ path: "evals/replay/REPLAY-v2.md", data: "evals/replay/v2", runs: "evals/replay/v2/runs", comparison: "evals/replay/COMPARISON-v2.md" });
    expect(Object.keys(PROTOCOLS)).toEqual(["v1", "v2", "v3"]);
    expect(DEFAULT_PROTOCOL).toBe("v1");
    expect(dataDirOf("v3")).toBe(join(REPO_ROOT, "evals", "replay", "v3"));
  });

  it("gives v1 and v2 no fixture option, so their builds keep today's bytes, and v3 the four options and the plan subject", () => {
    expect(fixtureOptionsOf("v1")).toEqual({});
    expect(fixtureOptionsOf("v2")).toEqual({});
    expect(fixtureOptionsOf("v3")).toEqual({
      vendor: "excluded",
      preimages: "kept-pack",
      identity: { name: "Orders Maintainers", email: "maintainers@orders.invalid" },
      prefix: "replay-orders-",
      planSubject: "docs: add plan 001",
    });
  });
});

describe("createReplayFixture — v1 and v2 builds unchanged (plan 012 v3-fixture (d))", () => {
  // Pinned at the plan's base `ae2ef5c7` by building both data sets before any v3 change: a v1 or
  // v2 build takes no v3 option, so its S0 and plan commit hash as they did.
  it.each([
    ["v1", "3754489e71e7f2582cfeb75bb52e4a38ce8e2f8f", "360f836f75c1359a5a526dc4cb23a4ab160bbd0b"],
    ["v2", "914d38783e8114f67e8353d2d58e7343479c0816", "5b4f9fd669038ab67735828516bdeab561e5c45e"],
  ])("builds %s's S0 and plan commit to the ids they had before v3", (version, s0, planCommit) => {
    const built = createReplayFixture({ out: root, v1Dir: dataDirOf(version), setup: false, install: false, ...fixtureOptionsOf(version) });
    expect([built.baseCommit, built.planCommit]).toEqual([s0, planCommit]);
    expect(basename(built.dir)).toMatch(/^stamity-replay-/);
    expect(lsFiles(built.dir).filter((path: string) => path.startsWith("vendor/contrib/"))).toHaveLength(PASS_IDS.length);
    expect(git(built.dir, ["for-each-ref", "--format=%(refname)"]).trim().split("\n")).toEqual([
      "refs/heads/main",
      ...PASS_IDS.map((id: string) => `refs/replay/preimages/${id}`),
    ]);
  }, 60_000);
});

/**
 * A synthetic v3 data set (contract S1): the clean chain's patches, the seeded patches cut from the
 * same chain with this pass's seeds injected, and a `seeds.json` with `arrival: "patch"` and the
 * patches' digests. Every patch is `git diff --cached --full-index`, the way the replay's own v3
 * patches are cut. Pass 1 adds `src/s1.txt` carrying seed `sec-one`; pass 2 edits `src/a.txt` and
 * adds `src/b.txt` carrying seed `cor-two`.
 */
interface SynthSeed {
  id: string;
  pass: string;
  file: string;
  find: string;
  replace: string;
}

const SYNTH_SEEDS: SynthSeed[] = [
  { id: "sec-one", pass: "u1-p1", file: "src/s1.txt", find: "limit = 10", replace: "limit = 99" },
  { id: "cor-two", pass: "u1-p2", file: "src/b.txt", find: "check = on\n", replace: "check = no\n" },
];

const V3_BASE = { ".gitignore": "node_modules/\n", "src/a.txt": `${A_LINES.join("\n")}\n` };
const V3_PASSES: Record<string, string>[] = [
  { "src/a.txt": PASS_1_A, "src/s1.txt": "alpha\nlimit = 10\nomega\n" },
  { "src/a.txt": PASS_2_A, "src/b.txt": "added by pass 2\ncheck = on\n" },
];

const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Nanoseconds as the seconds `utimesSync` takes, with the swap's half-microsecond bias. */
const seconds = (ns: bigint): number => (Number(ns / 1000n) + 0.5) / 1e6;

function writeV3(name: string, { base = V3_BASE, passes = V3_PASSES, seeds = SYNTH_SEEDS }: { base?: Record<string, string>; passes?: Record<string, string>[]; seeds?: SynthSeed[] } = {}): string {
  const dir = join(root, name);
  const scratch = join(root, `${name}-chain`);
  for (const sub of ["patches", "patches-seeded", "plan"]) mkdirSync(join(dir, sub), { recursive: true });
  mkdirSync(scratch, { recursive: true });
  git(scratch, ["init", "--quiet", "--initial-branch", "main"]);
  const staged = (): string => {
    git(scratch, ["add", "-A", "--force"]);
    return git(scratch, ["diff", "--cached", "--full-index"]);
  };
  writeTree(scratch, base);
  writeFileSync(join(dir, "patches", "base.patch"), staged(), "utf8");
  git(scratch, ["commit", "--quiet", "-m", "base"]);
  const digests: Record<string, { clean: string; seeded: string }> = {};
  passes.forEach((files, index) => {
    const id = PASS_IDS[index] as string;
    writeTree(scratch, files);
    const clean = staged();
    const own = seeds.filter((seed) => seed.pass === id);
    for (const seed of own) {
      const path = join(scratch, seed.file);
      writeFileSync(path, readFileSync(path, "utf8").replace(seed.find, seed.replace), "utf8");
    }
    const seeded = staged();
    writeTree(scratch, files);
    git(scratch, ["add", "-A", "--force"]);
    git(scratch, ["commit", "--quiet", "-m", id]);
    writeFileSync(join(dir, "patches", `${id}.patch`), clean, "utf8");
    writeFileSync(join(dir, "patches-seeded", `${id}.patch`), seeded, "utf8");
    digests[id] = { clean: sha256Hex(clean), seeded: sha256Hex(seeded) };
  });
  const doc = {
    schema: "stamity/replay-seeds/v1",
    arrival: "patch",
    matcher: { lineTolerance: 3, severities: ["Critical", "Warning"] },
    patches: digests,
    seeds: seeds.map((seed) => ({
      id: seed.id,
      class: seed.id.startsWith("sec-") ? "security" : "correctness",
      severity: seed.id.startsWith("sec-") ? "Critical" : "Warning",
      pass: seed.pass,
      file: seed.file,
      locate: { text: seed.replace.trimEnd(), from: 0, to: 0 },
      present: { contains: seed.replace.trimEnd() },
      injection: { file: seed.file, find: seed.find, replace: seed.replace },
      span: [2, 2],
      terms: ["limit"],
      oracle: { kind: "static", file: seed.file, mustMatch: [], mustNotMatch: [] },
    })),
    decoys: [],
  };
  writeFileSync(join(dir, "seeds.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "plan", "001-replay.md"), TEMPLATE, "utf8");
  return dir;
}

/** Every object in a repository's store, with its bytes. */
function objectsOf(dir: string): { id: string; type: string; body: Buffer }[] {
  const out = execFileSync("git", ["cat-file", "--batch-all-objects", "--batch"], { cwd: dir, env: gitEnv(), maxBuffer: 256 * 1024 * 1024 });
  const objects: { id: string; type: string; body: Buffer }[] = [];
  let at = 0;
  while (at < out.length) {
    const eol = out.indexOf(10, at);
    const [id, type, size] = out.subarray(at, eol).toString("utf8").split(" ") as [string, string, string];
    const start = eol + 1;
    objects.push({ id, type, body: out.subarray(start, start + Number(size)) });
    at = start + Number(size) + 1;
  }
  return objects;
}

const V3_OPTIONS = {
  vendor: "excluded",
  preimages: "kept-pack",
  identity: { name: "Orders Maintainers", email: "maintainers@orders.invalid" },
  prefix: "replay-orders-",
  planSubject: "docs: add plan 001",
};

describe("createReplayFixture — the v3 build (plan 012 v3-fixture (b), criterion 32)", () => {
  let data: string;
  let built: ReturnType<typeof build>;

  beforeAll(() => {
    data = writeV3("v3");
    built = build({ v1Dir: data, units: "u1-p1,u1-p2", ...V3_OPTIONS });
  }, 60_000);

  it("commits no vendor/ in S0 while the clean patches sit, ignored, under vendor/contrib/", () => {
    expect(git(built.dir, ["ls-tree", "-r", "--name-only", built.baseCommit]).split("\n").filter((path) => path.startsWith("vendor/"))).toEqual([]);
    expect(lsFiles(built.dir).filter((path) => path.startsWith("vendor/"))).toEqual([]);
    for (const id of ["u1-p1", "u1-p2"]) {
      expect(readFileSync(join(built.dir, "vendor", "contrib", `${id}.patch`), "utf8"), id).toBe(readFileSync(join(data, "patches", `${id}.patch`), "utf8"));
    }
    expect(readFileSync(join(built.dir, ".git", "info", "exclude"), "utf8")).toBe("/vendor/\n");
    expect(git(built.dir, ["status", "--porcelain"])).toBe("");
    expect(git(built.dir, ["status", "--porcelain", "--ignored", "--untracked-files=all"]).split("\n").filter((line) => line !== "")).toEqual([
      "!! vendor/contrib/u1-p1.patch",
      "!! vendor/contrib/u1-p2.patch",
    ]);
  });

  it("keeps git status empty after a patch is overwritten with its seeded bytes and its times restored", () => {
    const fresh = build({ v1Dir: data, units: "u1-p1,u1-p2", ...V3_OPTIONS });
    const path = join(fresh.dir, "vendor", "contrib", "u1-p1.patch");
    const before = statSync(path, { bigint: true });
    writeFileSync(path, readFileSync(join(data, "patches-seeded", "u1-p1.patch")));
    // The swap's restore (plan 012, v3-driver): from nanoseconds, with a half-microsecond bias, so the
    // millisecond the client floors the mtime to is unchanged.
    utimesSync(path, seconds(before.atimeNs), seconds(before.mtimeNs));
    expect(statSync(path, { bigint: true }).mtimeNs / 1_000_000n).toBe(before.mtimeNs / 1_000_000n);
    expect(readFileSync(path, "utf8")).toContain("+limit = 99");
    expect(git(fresh.dir, ["status", "--porcelain"])).toBe("");
  });

  it("has refs/heads/main as its only ref, and every preimage id on the pass patches resolves", () => {
    expect(git(built.dir, ["for-each-ref", "--format=%(refname)"])).toBe("refs/heads/main\n");
    const ids = ["u1-p1", "u1-p2"].flatMap((id) => preimages(join(data, "patches", `${id}.patch`)));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(spawnSync("git", ["cat-file", "-e", `${id}^{blob}`], { cwd: built.dir, env: gitEnv() }).status, id).toBe(0);
    // One kept pack holds them: a .keep beside exactly one pack.
    const pack = readdirSync(join(built.dir, ".git", "objects", "pack"));
    expect(pack.filter((name) => name.endsWith(".keep"))).toHaveLength(1);
    expect(pack.filter((name) => name.endsWith(".pack"))).toHaveLength(1);
  });

  it("stores no seed's clean text, no clean postimage of a seeded file and no patch blob", () => {
    const objects = objectsOf(built.dir);
    expect(objects.length).toBeGreaterThan(5);
    for (const seed of SYNTH_SEEDS) {
      expect(objects.filter((object) => object.body.includes(seed.find)).map((object) => object.id), seed.id).toEqual([]);
    }
    const cleanPosts = ["u1-p1", "u1-p2"].flatMap((id) =>
      [...readFileSync(join(data, "patches", `${id}.patch`), "utf8").matchAll(/^diff --git a\/(\S+) b\/\1\n(?:.*\n)*?index [0-9a-f]+\.\.([0-9a-f]+)/gm)]
        .filter((match) => SYNTH_SEEDS.some((seed) => seed.file === match[1]))
        .map((match) => match[2] as string),
    );
    expect(cleanPosts).toHaveLength(2);
    const blobs = [...cleanPosts, ...["patches", "patches-seeded"].flatMap((sub) => ["u1-p1", "u1-p2"].map((id) => git(built.dir, ["hash-object", join(data, sub, `${id}.patch`)]).trim()))];
    for (const id of blobs) expect(spawnSync("git", ["cat-file", "-e", id], { cwd: built.dir, env: gitEnv() }).status, id).not.toBe(0);
  });

  it("applies the seeded pass 2 with --3way over an edited context line after git gc --prune=now", () => {
    const fresh = build({ v1Dir: data, units: "u1-p1,u1-p2", ...V3_OPTIONS });
    git(fresh.dir, ["gc", "--quiet", "--prune=now"]);
    const contrib = join(fresh.dir, "vendor", "contrib");
    writeFileSync(join(contrib, "u1-p1.patch"), readFileSync(join(data, "patches-seeded", "u1-p1.patch")));
    writeFileSync(join(contrib, "u1-p2.patch"), readFileSync(join(data, "patches-seeded", "u1-p2.patch")));
    applyPatch(fresh.dir, join(contrib, "u1-p1.patch"));
    const aPath = join(fresh.dir, "src", "a.txt");
    writeFileSync(aPath, readFileSync(aPath, "utf8").replace("line 9\n", "line 9 edited by an agent\n"), "utf8");
    git(fresh.dir, ["add", "-A"]);
    // The edit breaks a context line, so only the three-way fallback over the stored preimage lands it.
    expect(() => applyPatch(fresh.dir, join(contrib, "u1-p2.patch"))).toThrow();
    applyPatch(fresh.dir, join(contrib, "u1-p2.patch"), { threeWay: true });
    expect(readFileSync(aPath, "utf8")).toContain("line 9 edited by an agent\n");
    expect(readFileSync(aPath, "utf8")).toContain("line 12 changed by pass 2\n");
    expect(readFileSync(join(fresh.dir, "src", "b.txt"), "utf8")).toBe("added by pass 2\ncheck = no\n");
    expect(readFileSync(join(fresh.dir, "src", "s1.txt"), "utf8")).toContain("limit = 99");
  }, 60_000);

  it("commits under the service's own identity and plan subject, in a folder with the service's prefix", () => {
    expect(basename(built.dir)).toMatch(/^replay-orders-/);
    const log = git(built.dir, ["log", "--format=%s|%an|%ae|%cn|%ce|%aI"]);
    expect(log).toBe(
      "docs: add plan 001|Orders Maintainers|maintainers@orders.invalid|Orders Maintainers|maintainers@orders.invalid|2026-09-24T00:00:00Z\n" +
        "service base|Orders Maintainers|maintainers@orders.invalid|Orders Maintainers|maintainers@orders.invalid|2026-09-24T00:00:00Z\n",
    );
    for (const text of [basename(built.dir), log]) {
      expect(text).not.toContain("replay fixture");
      expect(text).not.toContain("stamity-replay-");
    }
  });

  it("builds the same S0 twice", () => {
    expect(build({ v1Dir: data, units: "u1-p1,u1-p2", ...V3_OPTIONS }).baseCommit).toBe(built.baseCommit);
  });
});

describe("createReplayFixture — the v3 refusals (plan 012 v3-fixture (c), criterion 33)", () => {
  function refusal(options: Record<string, unknown>): (Error & { dir?: string }) | undefined {
    try {
      build({ units: "u1-p1,u1-p2", ...V3_OPTIONS, ...options });
    } catch (error) {
      return error as Error & { dir?: string };
    }
    return undefined;
  }

  it("refuses a data set whose later pass touches an earlier seed's file, naming the seed, before building anything", () => {
    const leaf = writeV3("v3-leaf", { passes: [V3_PASSES[0]!, { ...V3_PASSES[1]!, "src/s1.txt": "alpha\nlimit = 10\nomega and more\n" }] });
    const before = readdirSync(root).filter((name) => name.startsWith("replay-orders-")).length;
    const caught = refusal({ v1Dir: leaf });
    expect(caught?.message).toMatch(/sec-one/);
    expect(caught?.message).toMatch(/u1-p2\.patch touches src\/s1\.txt/);
    expect(readdirSync(root).filter((name) => name.startsWith("replay-orders-"))).toHaveLength(before);
  });

  it("refuses a data set whose store would hold a seed's clean text, naming the seed", () => {
    const leaky = writeV3("v3-leaky", { base: { ...V3_BASE, "src/notes.txt": "the old limit = 10 setting\n" } });
    const caught = refusal({ v1Dir: leaky });
    expect(caught?.message).toMatch(/sec-one/);
    expect(caught?.message).toMatch(/clean text/);
    expect(caught?.message).not.toMatch(/cor-two/);
  });

  it("refuses a committed vendor/ under the kept pack: the clean patches would carry every seed's clean text", () => {
    const data = writeV3("v3-committed");
    const caught = refusal({ v1Dir: data, vendor: "committed" });
    expect(caught?.message).toMatch(/sec-one|cor-two/);
  });

  it("refuses a seeded patch whose preimage ids differ from its clean patch's, before S0", () => {
    const drifted = writeV3("v3-drifted");
    const seededPath = join(drifted, "patches-seeded", "u1-p2.patch");
    const [pre] = preimages(seededPath);
    expect(pre).toMatch(/^[0-9a-f]{40}$/);
    writeFileSync(seededPath, readFileSync(seededPath, "utf8").replace(`index ${pre}..`, `index ${"f".repeat(40)}..`), "utf8");
    const before = readdirSync(root).filter((name) => name.startsWith("replay-orders-")).length;
    const caught = refusal({ v1Dir: drifted });
    expect(caught?.message).toMatch(/u1-p2.*preimage/);
    expect(readdirSync(root).filter((name) => name.startsWith("replay-orders-"))).toHaveLength(before);
  });

  it("refuses an option value it does not know", () => {
    expect(() => build({ v1Dir: writeV3("v3-options"), vendor: "tracked" })).toThrow(/vendor/);
    expect(() => build({ v1Dir: writeV3("v3-options-2"), preimages: "loose" })).toThrow(/preimages/);
    expect(() => build({ identity: { name: "Orders Maintainers" } })).toThrow(/identity must be \{ name, email \}/);
    expect(() => build({ prefix: "../elsewhere-" })).toThrow(/prefix must be a folder-name prefix/);
    expect(() => build({ planSubject: " " })).toThrow(/planSubject/);
    expect(() => fixtureOptionsOf("v9")).toThrow(/"v9" is not a protocol version: v1 or v2 or v3/);
  });

  it("refuses a kept-pack build over data with no seeds.json or no seeded patch for a pass, naming the missing file", () => {
    const noSeeds = writeV3("v3-no-seeds");
    rmSync(join(noSeeds, "seeds.json"));
    expect(refusal({ v1Dir: noSeeds })?.message).toMatch(/needs the data set's seeds\.json/);
    const noSeeded = writeV3("v3-no-seeded");
    rmSync(join(noSeeded, "patches-seeded", "u1-p2.patch"));
    expect(refusal({ v1Dir: noSeeded })?.message).toMatch(/needs patches-seeded\/u1-p2\.patch beside u1-p2\.patch/);
  });

  it("refuses a pass whose clean and seeded patches both record a preimage the chain never had", () => {
    const drifted = writeV3("v3-both-drifted");
    for (const sub of ["patches", "patches-seeded"]) {
      const path = join(drifted, sub, "u1-p2.patch");
      const [pre] = preimages(path);
      writeFileSync(path, readFileSync(path, "utf8").replace(`index ${pre}..`, `index ${"e".repeat(40)}..`), "utf8");
    }
    expect(refusal({ v1Dir: drifted })?.message).toMatch(/u1-p2\.patch records preimage blob e{40}, which is not the chain's content before u1-p2/);
  });

  it("makes no pack when no pass patch records a preimage, and still builds, reading a seed of a pass the chain lacks as arriving nowhere", () => {
    const fresh = writeV3("v3-new-files-only", { passes: [{ "src/s1.txt": "alpha\nlimit = 10\nomega\n" }], seeds: [SYNTH_SEEDS[0]!] });
    // A seed of u1-p2, which this one-pass chain lacks, in the one file u1-p1 touches: no pass comes after it.
    const docPath = join(fresh, "seeds.json");
    const doc = JSON.parse(readFileSync(docPath, "utf8")) as { seeds: Record<string, unknown>[] };
    doc.seeds.push({ ...doc.seeds[0], id: "cor-later", pass: "u1-p2", injection: { file: "src/s1.txt", find: "no such text", replace: "x" } });
    writeFileSync(docPath, JSON.stringify(doc), "utf8");
    const built = build({ v1Dir: fresh, units: "u1-p1", ...V3_OPTIONS });
    expect(readdirSync(join(built.dir, ".git", "objects", "pack")).filter((name) => /\.(?:pack|keep)$/.test(name))).toEqual([]);
    expect(git(built.dir, ["for-each-ref", "--format=%(refname)"])).toBe("refs/heads/main\n");
  });

  it("refuses a setup commit that would store a seed's clean text, checking the store again after setup", () => {
    // A stand-in CLI whose init writes a file holding sec-one's clean text: what the check after the
    // setup commit exists for. Packing the real CLI would need a full build (see the setup case above).
    const pkg = join(root, "leaky-cli");
    writeTree(pkg, {
      "package.json": `${JSON.stringify({ name: "@zomarit/stamity", version: "0.0.0-leaky", bin: { stamity: "bin.mjs" } })}\n`,
      "bin.mjs": 'import { writeFileSync } from "node:fs";\nif (process.argv[2] === "init") writeFileSync("notes.txt", "limit = 10\\n");\n',
    });
    const packs = join(root, "leaky-cli-packs");
    mkdirSync(packs, { recursive: true });
    const packed = spawnSync("npm", ["pack", "--pack-destination", packs], { cwd: pkg, encoding: "utf8", shell: process.platform === "win32" });
    expect(packed.status, packed.stderr).toBe(0);
    const caught = refusal({ v1Dir: writeV3("v3-setup"), setup: true, cliTarball: join(packs, readdirSync(packs)[0]!) });
    expect(caught?.message).toMatch(/^sec-one: the fixture's object store would hold the seed's clean text \(its injection\.find\) in blob [0-9a-f]{40}/);
    expect(git(caught!.dir!, ["log", "-1", "--format=%s"]).trim()).toBe("stamity setup");
  }, 120_000);
});

describe("seededPatchSet (plan 012 v3-fixture)", () => {
  it("rebuilds each pass's seeded patch from the clean chain and the seeds' injections, byte for byte", () => {
    const data = writeV3("v3-set");
    const set = seededPatchSet(data) as Record<string, string>;
    expect(Object.keys(set)).toEqual(["u1-p1", "u1-p2"]);
    for (const id of ["u1-p1", "u1-p2"]) {
      expect(set[id], id).toBe(readFileSync(join(data, "patches-seeded", `${id}.patch`), "utf8"));
      expect(set[id], id).not.toBe(readFileSync(join(data, "patches", `${id}.patch`), "utf8"));
    }
  });

  it("refuses a seed whose file is absent, whose clean text is not there once, or whose pass does not touch its file, naming it", () => {
    const edit = (name: string, injection: { file: string; find: string; replace: string }): string => {
      const data = writeV3(name);
      const doc = JSON.parse(readFileSync(join(data, "seeds.json"), "utf8")) as { seeds: { file: string; injection: unknown }[] };
      doc.seeds[0]!.file = injection.file;
      doc.seeds[0]!.injection = injection;
      writeFileSync(join(data, "seeds.json"), JSON.stringify(doc), "utf8");
      return data;
    };
    expect(() => seededPatchSet(edit("v3-set-absent", { file: "src/none.txt", find: "x", replace: "y" }))).toThrow(/^sec-one: src\/none\.txt is not in the chain after u1-p1$/);
    expect(() => seededPatchSet(edit("v3-set-count", { file: "src/s1.txt", find: "limit = 11", replace: "limit = 12" }))).toThrow(/^sec-one: its injection\.find occurs 0 times in src\/s1\.txt after u1-p1$/);
    expect(() => seededPatchSet(edit("v3-set-untouched", { file: ".gitignore", find: "node_modules/", replace: "node_modules" }))).toThrow(/^sec-one: u1-p1\.patch does not touch \.gitignore, the seed's own file$/);
  });

  it("refuses a seed whose clean text is not in a line its own pass's clean patch adds, naming it", () => {
    const data = writeV3("v3-set-context");
    const doc = JSON.parse(readFileSync(join(data, "seeds.json"), "utf8")) as { seeds: { id: string; file: string; injection: { file: string; find: string; replace: string } }[] };
    // `line 4` is in src/a.txt once, and u1-p1 touches src/a.txt, but only as a context line there.
    doc.seeds[0]!.file = "src/a.txt";
    doc.seeds[0]!.injection = { file: "src/a.txt", find: "line 4\n", replace: "line four\n" };
    writeFileSync(join(data, "seeds.json"), JSON.stringify(doc), "utf8");
    expect(() => seededPatchSet(data)).toThrow(/^sec-one: its injection\.find is not in exactly one run of lines u1-p1\.patch adds to src\/a\.txt \(the own-hunk rule\)$/);
  });
});

describe("--protocol v3 from the command line (plan 012 v3-fixture)", () => {
  it("builds with the v3 options: no vendor/ in S0, the service's identity, prefix and plan subject", () => {
    const out = mkdtempSync(join(tmpdir(), "stamity-replay-protocol-"));
    try {
      const result = spawnSync(process.execPath, [FIXTURE_MJS, "--out", out, "--no-setup", "--no-install", "--units", "u1-p1", "--protocol", "v3", "--json"], { encoding: "utf8", env: gitEnv() });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const built = JSON.parse(result.stdout) as { dir: string; baseCommit: string };
      expect(basename(built.dir)).toMatch(/^replay-orders-/);
      expect(git(built.dir, ["log", "--format=%s|%an|%ce"])).toBe("docs: add plan 001|Orders Maintainers|maintainers@orders.invalid\nservice base|Orders Maintainers|maintainers@orders.invalid\n");
      expect(git(built.dir, ["ls-tree", "-r", "--name-only", built.baseCommit]).split("\n").filter((path) => path.startsWith("vendor/"))).toEqual([]);
      expect(existsSync(join(built.dir, "vendor", "contrib", "u1-p1.patch"))).toBe(true);
      expect(git(built.dir, ["for-each-ref", "--format=%(refname)"])).toBe("refs/heads/main\n");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
