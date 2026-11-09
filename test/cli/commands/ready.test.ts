import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../../src/cli.ts";
import { readyCommand } from "../../../src/cli/commands/ready.ts";
import type { ReadinessReport } from "../../../src/detect/readiness.ts";
import { runGit } from "../../../src/worktree/git.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/** Real temp folders and a real `git`: the verb reads files and asks git whether the manifest is tracked. */
const getDir = useTempDir("ready-verb");
const gitAvailable = (await runGit({ args: ["--version"], cwd: process.cwd() })).status === 0;

let caseCounter = 0;

async function seed(files: Record<string, string>): Promise<string> {
  const dir = getDir();
  caseCounter += 1;
  const name = `repo-${caseCounter}`;
  await mkdir(dir.path(name), { recursive: true });
  await dir.seedFiles(Object.fromEntries(Object.entries(files).map(([path, body]) => [`${name}/${path}`, body])));
  return dir.path(name);
}

async function mustGit(cwd: string, ...args: string[]): Promise<void> {
  const outcome = await runGit({ args, cwd });
  if (outcome.status !== 0) throw new Error(`git ${args.join(" ")}: ${outcome.stderr}`);
}

async function ready(cwd: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  // PATH passes through: the gates-resolve row looks each gate's first word up on it, as it does for a person.
  const env = { NO_COLOR: "1", PATH: process.env["PATH"], PATHEXT: process.env["PATHEXT"] };
  return runInProcess([readyCommand], ["ready", ...args], { cwd, env });
}

function payload(stdout: string): ReadinessReport & { ok: boolean; command: string } {
  return JSON.parse(stdout) as ReadinessReport & { ok: boolean; command: string };
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** A TypeScript repository with every readiness signal a file can carry. */
const READY_FILES: Record<string, string> = {
  "package.json": json({
    name: "ready-fixture",
    private: true,
    scripts: { test: "vitest run", lint: "eslint .", typecheck: "tsc --noEmit" },
    devDependencies: { vitest: "^3.0.0", eslint: "^9.0.0", typescript: "^5.0.0" },
  }),
  "package-lock.json": json({ name: "ready-fixture", lockfileVersion: 3, packages: {} }),
  "tsconfig.json": json({ compilerOptions: { strict: true } }),
  "eslint.config.js": "export default [];\n",
  "vitest.config.ts": "export default {};\n",
  ".nvmrc": "20.11.0\n",
  ".github/workflows/ci.yml": "name: ci\non:\n  pull_request:\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps: [{ run: npm test }]\n",
  "coverage/coverage-summary.json": json({ total: { lines: { total: 50, covered: 40, pct: 80 } } }),
};

describe("stamity ready", () => {
  it("is registered as an advertised, read-only verb", () => {
    const registered = COMMANDS.find((command) => command.name === "ready");
    expect(registered).toBe(readyCommand);
    expect(readyCommand.mutating).toBe(false);
    expect(readyCommand.hidden).toBeUndefined();
  });

  it("exits 0 with the gaps on a repository that is not ready", async () => {
    const root = await seed({ "notes.txt": "nothing here\n", "legacy.cbl": "       IDENTIFICATION DIVISION.\n" });
    const text = await ready(root);
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(/^test-framework\s+gap\s+no test framework detected at the root {2}\(fix: /m);
    expect(text.stdout).toMatch(/^branch-rule\s+not-checked\s+.*\(fix: stamity gate preflight --unattended --dry-run\)$/m);
    expect(text.stdout).toContain("languages: none detected");
    expect(text.stdout).toContain("legacy: cobol");
    expect(text.stdout).not.toContain("coverage: ");
    expect(text.stdout).toMatch(/^verdict: not ready \(gaps: test-framework, ci-provider, pr-workflow, setup-pinned, tests-class/m);

    const doc = payload((await ready(root, "--json")).stdout);
    expect(doc).toMatchObject({ ok: true, command: "ready", ready: false, coverage: null });
    expect(doc.checks.filter((row) => row.state === "gap").map((row) => row.id)).toEqual([
      "test-framework",
      "ci-provider",
      "pr-workflow",
      "setup-pinned",
      "tests-class",
    ]);
    expect(doc.stack.legacyStacks).toEqual(["cobol"]);
  });

  it.skipIf(!gitAvailable)(
    "exits 0 with ready: true on a committed, set-up repository with CI, a lockfile and a tests class",
    async () => {
      const root = await seed(READY_FILES);
      await mustGit(root, "init", "-q", "-b", "main");
      const init = await runInProcess(COMMANDS, ["init", "-y"], { cwd: root });
      expect(init.code, init.stderr).toBe(0);
      await writeFile(join(root, ".stamity/change-classes.json"), json({ classes: { tests: ["test/**"] } }));
      await mustGit(root, "add", "-A");
      await mustGit(root, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "setup");

      const result = await ready(root, "--json");
      expect(result.code).toBe(0);
      const doc = payload(result.stdout);
      const open = doc.checks.filter((row) => row.state === "gap" || row.state === "unknown");
      expect(open, JSON.stringify(open)).toEqual([]);
      expect(doc.ready).toBe(true);
      expect(doc.coverage).toEqual({ file: "coverage/coverage-summary.json", linesPct: 80 });
      expect(doc.notChecked).toEqual(["land-job-workflows", "branch-rule"]);

      const text = await ready(root);
      expect(text.code).toBe(0);
      expect(text.stdout).toContain("coverage: 80% from coverage/coverage-summary.json");
      expect(text.stdout).toMatch(/^languages: typescript; versions: node 20\.11\.0 from \.nvmrc$/m);
      expect(text.stdout).toMatch(/^verdict: ready$/m);
    },
    120_000,
  );

  it.skipIf(!gitAvailable)("reads an uncommitted setup as a setup-pinned gap", async () => {
    const root = await seed(READY_FILES);
    await mustGit(root, "init", "-q", "-b", "main");
    const init = await runInProcess(COMMANDS, ["init", "-y"], { cwd: root });
    expect(init.code, init.stderr).toBe(0);
    const doc = payload((await ready(root, "--json")).stdout);
    expect(doc.checks.find((row) => row.id === "setup-pinned")).toMatchObject({ state: "gap" });
    expect(doc.checks.find((row) => row.id === "gates-resolve")?.state).not.toBe("unknown");
  }, 120_000);

  it("reads the folder --path names, relative to the current folder", async () => {
    const root = await seed({ "sub/notes.txt": "x\n", "sub/legacy.cob": "x\n" });
    const doc = payload((await ready(root, "--path", "sub", "--json")).stdout);
    expect(doc.stack.legacyStacks).toEqual(["cobol"]);
  });

  it("exits 1 when the root cannot be read", async () => {
    const root = await seed({ "notes.txt": "x\n" });
    const result = await ready(root, "--path", join(root, "no-such-folder"));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cannot read");
  });

  it("exits 2 when --path names a file", async () => {
    const file = fileURLToPath(import.meta.url);
    const result = await ready(process.cwd(), "--path", file);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--path takes a folder");
  });
});
