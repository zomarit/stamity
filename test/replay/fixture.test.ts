import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { FIXED_GIT_ENV, PASS_IDS, applyPatch, createReplayFixture, refuseOutInsideRepository, renderPlan } from "../../scripts/replay/fixture.mjs";

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
        `\tprogram = ${join(root, "no-such-gpg")}`,
        "[core]",
        `\thooksPath = ${hooks}`,
        `\texcludesFile = ${excludes}`,
        "\tautocrlf = true",
        "[apply]",
        "\twhitespace = error",
        "",
      ].join("\n"),
      "utf8",
    );
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
        `\tattributesFile = ${attributes}`,
        '[filter "hostile"]',
        "\tclean = sed s/line/LINE/",
        "[init]",
        `\ttemplateDir = ${template}`,
        "",
      ].join("\n"),
      "utf8",
    );
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
