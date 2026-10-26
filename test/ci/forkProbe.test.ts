import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  FORK_KINDS,
  FORK_PROBE_IDENTITY,
  forkVersion,
  gateCommands,
  identityArgs,
  parseArgs,
  MADE_UP_PACK,
  PACK_RESTAMP,
  probeSteps,
  REGENERATE_COMMANDS,
  runSteps,
  writeProbePack,
  // @ts-expect-error — import-safe native ESM CI helper with no type declarations, outside the product package.
} from "../../scripts/ci/fork-probe.mjs";
import { treeDigest, writeMadeUpPack } from "../support/packFixtures.ts";

/**
 * The fork probe's script, `scripts/ci/fork-probe.mjs` (REQ-PLUGIN-033, REQ-FORK-011), which `ci.yml`'s `fork-probe`
 * job runs on every pull request. Its steps are read here against what they stand for: the fork guide's `regenerate`
 * list, `package.json`'s `scripts.check`, and the made-up pack the pack suites write. The run's order and failure
 * handling are driven with a recorded `exec`, because the real steps are a whole nested gate (the job itself runs
 * them); `--bogus` runs the real script, which refuses before it copies anything.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "ci", "fork-probe.mjs");

interface Step {
  readonly name: string;
  readonly kind: "fork" | "gate";
  readonly cwd: string;
  readonly command?: string;
  readonly run?: () => { code: number; output: string };
}

interface Result {
  readonly name: string;
  readonly kind: "fork" | "gate";
  readonly code: number;
  readonly output: string;
  readonly seconds: number;
}

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-fork-probe-test-"));
  scratch.push(dir);
  return dir;
}

/** The guide's `regenerate` list, parsed from the json block that holds it. */
function guideRegenerateList(): string[] {
  const guide = readFileSync(join(REPO_ROOT, "docs", "enterprise-forks.md"), "utf8");
  const block = [...guide.matchAll(/```json\n([\s\S]*?)```/g)]
    .map((match) => match[1] ?? "")
    .find((body) => body.includes('"regenerate"'));
  expect(block, "docs/enterprise-forks.md has no json block with a regenerate list").toBeDefined();
  return (JSON.parse(block ?? "{}") as { regenerate: string[] }).regenerate;
}

const CHECK_SCRIPT = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { scripts: { check: string } }).scripts.check;
const steps = (): Step[] => probeSteps({ copy: "/copy", scratch: "/scratch", checkScript: CHECK_SCRIPT }) as Step[];

describe("the fork probe's steps", () => {
  it("regenerates with the fork guide's list, less its install, which would write through the linked node_modules", () => {
    const guide = guideRegenerateList();
    expect(guide[0]).toBe("npm ci --ignore-scripts");
    expect(REGENERATE_COMMANDS).toEqual(guide.slice(1));
    // Non-degenerate: the list regenerates something and ends with the build and the dogfood sync.
    expect(REGENERATE_COMMANDS.length).toBeGreaterThan(2);
  });

  it("gates with every part of scripts.check in order, the test part read as CI's test step", () => {
    const parts = CHECK_SCRIPT.split("&&").map((part) => part.trim());
    expect(parts).toContain("npm run test");
    expect(gateCommands(CHECK_SCRIPT)).toEqual(parts.map((part) => (part === "npm run test" ? "node scripts/ci/test-run.mjs" : part)));
    const gate = steps().filter((step) => step.kind === "gate" && step.name.startsWith("gate: "));
    expect(gate.map((step) => step.command)).toEqual([
      ...gateCommands(CHECK_SCRIPT),
      "node dist/cli.js check",
      `node scripts/fork-identity.mjs --repository ${FORK_PROBE_IDENTITY.repository as string} --registry ${FORK_PROBE_IDENTITY.registry as string} --scope ${FORK_PROBE_IDENTITY.scope as string} --check`,
      "node scripts/tarball-smoke.mjs",
    ]);
  });

  it("renames, commits, versions and regenerates before any gate, and ends on the tracked-file check", () => {
    const all = steps();
    const forkSteps = all.filter((step) => step.kind === "fork");
    expect(all.slice(0, forkSteps.length)).toEqual(forkSteps);
    // A version bump restamps every bundled pack.json, which only the write mode does (CONTRIBUTING's regeneration table).
    expect(PACK_RESTAMP).toBe("node scripts/generate-pack-manifests.mjs --write");
    expect(forkSteps[0]?.command).toBe(
      `node scripts/fork-identity.mjs --repository ${FORK_PROBE_IDENTITY.repository as string} --registry ${FORK_PROBE_IDENTITY.registry as string} --scope ${FORK_PROBE_IDENTITY.scope as string}`,
    );
    expect(forkSteps.map((step) => step.name)).toEqual([
      "rename (fork-identity.mjs)",
      "commit the rename",
      "set the fork version",
      `restamp the bundled packs: ${PACK_RESTAMP as string}`,
      ...REGENERATE_COMMANDS.map((command: string) => `regenerate: ${command}`),
      "commit the regenerated tree",
    ]);
    expect(all.at(-1)?.name).toBe("no tracked file rewritten");
    // The walk adds the made-up pack from the scratch area, never from the checkout's packs/, and takes it back.
    const walk = all.filter((step) => step.name.startsWith("walk: ")).map((step) => step.name);
    expect(walk).toEqual([
      "walk: a scratch repository",
      "walk: init",
      `walk: add ${MADE_UP_PACK.name as string}`,
      "walk: sync",
      "walk: check",
      `walk: clean --pack ${MADE_UP_PACK.name as string}`,
      "walk: check after clean --pack",
    ]);
    const add = all.find((step) => step.name === `walk: add ${MADE_UP_PACK.name as string}`);
    expect(add?.command).toContain('"/scratch/fork-probe-pack"');
    expect(add?.command).toContain("--allow-untrusted -y");
    expect(all.some((step) => (step.command ?? "").includes("packs/"))).toBe(false);
  });

  // ADDED (build/43, the sign-off on b1's W-4): the registry-less fork, the guide's default, is the second kind. Its
  // rename and identity check carry no `--registry`, so `fork-identity.mjs` makes it private, and every other step is
  // the registry fork's, so the two legs prove one gate.
  it("renames a private fork with no --registry and a registry fork with it, every other step the same", () => {
    expect(FORK_KINDS).toEqual(["registry", "private"]);
    const of = (forkKind: string): Step[] => probeSteps({ copy: "/copy", scratch: "/scratch", checkScript: CHECK_SCRIPT, forkKind }) as Step[];
    const base = `--repository ${FORK_PROBE_IDENTITY.repository as string}`;
    const scope = `--scope ${FORK_PROBE_IDENTITY.scope as string}`;
    const registry = `--registry ${FORK_PROBE_IDENTITY.registry as string}`;
    expect(identityArgs("private")).toBe(`${base} ${scope}`);
    expect(identityArgs("registry")).toBe(`${base} ${registry} ${scope}`);
    expect(identityArgs()).toBe(identityArgs("registry"));
    const renames = (forkKind: string): (string | undefined)[] =>
      of(forkKind).filter((step) => (step.command ?? "").startsWith("node scripts/fork-identity.mjs")).map((step) => step.command);
    expect(renames("private")).toEqual([`node scripts/fork-identity.mjs ${base} ${scope}`, `node scripts/fork-identity.mjs ${base} ${scope} --check`]);
    expect(renames("registry")).toEqual([`node scripts/fork-identity.mjs ${base} ${registry} ${scope}`, `node scripts/fork-identity.mjs ${base} ${registry} ${scope} --check`]);
    const rest = (forkKind: string): unknown[] =>
      of(forkKind).map((step) => [step.name, step.kind, (step.command ?? "").includes("fork-identity.mjs") ? "rename" : step.command]);
    expect(rest("private")).toEqual(rest("registry"));
    expect(of("private").map((step) => step.name)).toEqual(steps().map((step) => step.name));
  });

  it("names a made-up fork and suffixes the version", () => {
    expect(FORK_PROBE_IDENTITY).toEqual({
      repository: "https://github.com/fork-probe/stamity-fork",
      registry: "https://npm.pkg.github.com",
      scope: "fork-probe",
    });
    expect(forkVersion("1.16.0", "fork")).toBe("1.16.0-fork.1");
    expect(forkVersion("1.17.0-rc.1", "fork")).toBe("1.17.0-fork.1");
    expect(() => forkVersion("next", "fork")).toThrow(/not a semver version/);
  });

  it("writes the made-up pack exactly as the pack suites write one", async () => {
    const ours = tempDir();
    const theirs = tempDir();
    const probeDir = writeProbePack(ours) as string;
    const fixtureDir = await writeMadeUpPack(theirs, MADE_UP_PACK.name as string, { ...(MADE_UP_PACK.files as Record<string, string>) });
    expect(Object.keys(MADE_UP_PACK.files as Record<string, string>).length).toBeGreaterThan(1);
    expect(await treeDigest(probeDir)).toBe(await treeDigest(fixtureDir));
  });
});

describe("the fork probe's run", () => {
  /** A recorded `exec`: the real steps are a nested gate the job runs; the order and the failure handling are the subject here. */
  function recorded(failing: ReadonlySet<string>) {
    const ran: string[] = [];
    const exec = (step: Step) => {
      ran.push(step.name);
      return failing.has(step.name) ? { code: 3, output: `${step.name} failed\n` } : { code: 0, output: "" };
    };
    return { ran, exec };
  }

  it("exits 0 when every step passes, running each once in order", () => {
    const { ran, exec } = recorded(new Set());
    const outcome = runSteps(steps(), exec) as { exitCode: number; results: Result[] };
    expect(outcome.exitCode).toBe(0);
    expect(ran).toEqual(steps().map((step) => step.name));
  });

  it("runs every later gate step after a failing one, then exits 1 naming it", () => {
    const failing = "gate: npm run typecheck";
    const { ran, exec } = recorded(new Set([failing]));
    const seen: string[] = [];
    const outcome = runSteps(steps(), exec, { onResult: (result: Result) => seen.push(result.name) }) as { exitCode: number; results: Result[] };
    expect(outcome.exitCode).toBe(1);
    expect(ran).toEqual(steps().map((step) => step.name));
    expect(outcome.results.filter((result) => result.code !== 0).map((result) => result.name)).toEqual([failing]);
    expect(seen).toEqual(ran);
  });

  it("runs no gate step after a failing fork step, and exits 1", () => {
    const failing = "regenerate: node scripts/generate-docs.mjs";
    const { ran, exec } = recorded(new Set([failing]));
    const outcome = runSteps(steps(), exec) as { exitCode: number; results: Result[] };
    expect(outcome.exitCode).toBe(1);
    expect(ran.at(-1)).toBe(failing);
    expect(ran.some((name) => name.startsWith("gate: ") || name.startsWith("walk: "))).toBe(false);
  });

  it("reads a step that throws as a failure", () => {
    const outcome = runSteps(
      [{ name: "boom", kind: "gate", cwd: "/", run: () => { throw new Error("no"); } }],
      (step: Step) => (step.run as () => { code: number; output: string })(),
    ) as { exitCode: number; results: Result[] };
    expect(outcome.exitCode).toBe(1);
    expect(outcome.results[0]?.output).toContain("no");
  });

  it("refuses an argument it does not know with exit 2, before it copies anything", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--bogus"], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toContain("usage: node scripts/ci/fork-probe.mjs [--kind registry|private] [--keep]");
    expect(result.stdout).toBe("");
  });

  it("reads --kind in either spelling, runs the registry fork without it, and refuses another kind with exit 2", () => {
    expect(parseArgs([])).toEqual({ keep: false, forkKind: "registry" });
    expect(parseArgs(["--kind", "private", "--keep"])).toEqual({ keep: true, forkKind: "private" });
    expect(parseArgs(["--kind=registry"])).toEqual({ keep: false, forkKind: "registry" });
    for (const argv of [["--kind", "public"], ["--kind"], ["--kind="]]) {
      expect(parseArgs(argv), argv.join(" ")).toHaveProperty("error");
      const result = spawnSync(process.execPath, [SCRIPT, ...argv], { encoding: "utf8" });
      expect(result.status, argv.join(" ")).toBe(2);
      expect(result.stderr, argv.join(" ")).toContain("--kind takes registry or private");
      expect(result.stdout, argv.join(" ")).toBe("");
    }
  });
});
