import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  COVERAGE_REPORTS,
  assessReadiness,
  readReadinessFiles,
  type ReadinessCheckId,
  type ReadinessFiles,
  type ReadinessReads,
  type ReadinessReport,
} from "../../src/detect/readiness.ts";
import type { RepoInfo } from "../../src/types/detect.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Stand-in for `node:child_process`, every entry a spy that throws. Justified: the
 * criterion is that the readiness read spawns nothing, and the real module cannot
 * say whether it was called; a spy can, and a throw makes a hidden spawn fail the
 * case that reached it instead of running a repository's command.
 */
const spawned = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const refuse = (name: string) => () => {
    spawned.calls.push(name);
    throw new Error(`readiness spawned ${name}`);
  };
  const names = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"];
  return { ...actual, ...Object.fromEntries(names.map((name) => [name, refuse(name)])) };
});

/** Real temp directories: the file reads, the size caps and the symlink refusal are file-system facts. */
const getRepo = useTempDir("readiness-repo");

let caseCounter = 0;

async function seedRepo(files: Record<string, string> = {}): Promise<string> {
  const repo = getRepo();
  caseCounter += 1;
  const name = `repo-${caseCounter}`;
  const root = repo.path(name);
  await mkdir(root, { recursive: true });
  await repo.seedFiles(Object.fromEntries(Object.entries(files).map(([path, content]) => [`${name}/${path}`, content])));
  return root;
}

const PR_WORKFLOW = "name: ci\non:\n  pull_request:\n  push:\n    branches: [main]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps: [{ run: echo }]\n";
const PUSH_WORKFLOW = "name: ci\non: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps: [{ run: echo }]\n";
const TESTS_CLASS = `${JSON.stringify({ classes: { tests: ["spec/**"] } })}\n`;
const ISTANBUL_SUMMARY = `${JSON.stringify({ total: { lines: { total: 200, covered: 167, skipped: 0, pct: 83.5 } }, "src/a.ts": { lines: { pct: 10 } } })}\n`;

/** A repository the detector has read as a TypeScript one with every readiness signal on. */
function readyInfo(rootDir = "/repo"): RepoInfo {
  return {
    rootDir,
    languages: ["typescript"],
    frameworks: [],
    linters: ["eslint"],
    testFrameworks: ["vitest"],
    ciProviders: ["github-actions"],
    packageManager: "npm",
    monorepoPackages: [],
    hasDockerfile: false,
    hasDataArtifacts: false,
    hasExistingAgents: true,
    existingTools: [],
    legacyStacks: [],
    languageVersions: [{ language: "node", version: "20.11.0", source: ".nvmrc" }],
  };
}

function readyFiles(): ReadinessFiles {
  return {
    workflows: [{ file: ".github/workflows/ci.yml", triggers: ["pull_request", "push"] }],
    lockfiles: ["package-lock.json"],
    classFile: { state: "read", testGlobs: ["spec/**"] },
    coverage: { state: "read", file: "coverage/coverage-summary.json", linesPct: 83.5 },
  };
}

function readyReads(): ReadinessReads {
  return {
    ...readyFiles(),
    gates: { unresolved: [] },
    landJob: { status: "pass", detail: "a workflow file carries every name in autonomy.landJob.workflows" },
    setup: { manifest: "present", pinnedVersion: "1.19.0", committed: true },
  };
}

function check(report: ReadinessReport, id: ReadinessCheckId): ReadinessReport["checks"][number] {
  const row = report.checks.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`no ${id} row`);
  return row;
}

afterAll(() => {
  // The whole file ran through every read path; none of them may have spawned anything.
  expect(spawned.calls).toEqual([]);
});

describe("assessReadiness", () => {
  it("is ready when every check is ready, the branch rule left not-checked", () => {
    const report = assessReadiness(readyInfo(), readyReads());
    expect(report.ready).toBe(true);
    expect(report.checks.filter((row) => row.state === "gap" || row.state === "unknown")).toEqual([]);
    expect(report.notChecked).toEqual(["branch-rule"]);
    expect(check(report, "branch-rule")).toMatchObject({
      state: "not-checked",
      fix: "stamity gate preflight --unattended --dry-run",
    });
    expect(report.coverage).toEqual({ file: "coverage/coverage-summary.json", linesPct: 83.5 });
  });

  it("names every check, each with evidence and a fix", () => {
    const report = assessReadiness(readyInfo(), readyReads());
    expect(report.checks.map((row) => row.id)).toEqual([
      "test-framework",
      "gates-resolve",
      "ci-provider",
      "pr-workflow",
      "land-job-workflows",
      "lockfile",
      "setup-pinned",
      "tests-class",
      "coverage",
      "branch-rule",
    ]);
    for (const row of report.checks) {
      expect(row.evidence.length, row.id).toBeGreaterThan(0);
      expect(row.fix.length, row.id).toBeGreaterThan(0);
    }
  });

  it("carries the stack: languages, legacy stacks, versions and tiers", () => {
    const info = { ...readyInfo(), languages: ["typescript", "cpp"], legacyStacks: ["cobol"] };
    const report = assessReadiness(info, readyReads());
    expect(report.stack.languages).toEqual(["typescript", "cpp"]);
    expect(report.stack.legacyStacks).toEqual(["cobol"]);
    expect(report.stack.versions).toEqual([{ language: "node", version: "20.11.0", source: ".nvmrc" }]);
    expect(report.stack.tiers.map((row) => row.subject)).toEqual(["typescript", "cpp"]);
    for (const row of report.stack.tiers) expect(["full", "partial", "none"]).toContain(row.tier);
  });

  it("gives empty versions when no file states one", () => {
    const { languageVersions: _dropped, ...info } = readyInfo();
    expect(assessReadiness(info, readyReads()).stack.versions).toEqual([]);
  });

  describe("each check: one input makes it ready, one makes it a gap", () => {
    it("test-framework", () => {
      expect(check(assessReadiness(readyInfo(), readyReads()), "test-framework").state).toBe("ready");
      const gap = check(assessReadiness({ ...readyInfo(), testFrameworks: [] }, readyReads()), "test-framework");
      expect(gap.state).toBe("gap");
    });

    it("gates-resolve", () => {
      expect(check(assessReadiness(readyInfo(), readyReads()), "gates-resolve").state).toBe("ready");
      const reads = { ...readyReads(), gates: { unresolved: [{ kind: "Tests", value: "npm run test" }] } };
      const gap = check(assessReadiness(readyInfo(), reads), "gates-resolve");
      expect(gap.state).toBe("gap");
      expect(gap.evidence).toContain("npm run test");
      expect(check(assessReadiness(readyInfo(), { ...readyReads(), gates: null }), "gates-resolve").state).toBe(
        "unknown",
      );
    });

    it("ci-provider", () => {
      expect(check(assessReadiness(readyInfo(), readyReads()), "ci-provider").state).toBe("ready");
      expect(check(assessReadiness({ ...readyInfo(), ciProviders: [] }, readyReads()), "ci-provider").state).toBe(
        "gap",
      );
    });

    it("pr-workflow", () => {
      const ready = check(assessReadiness(readyInfo(), readyReads()), "pr-workflow");
      expect(ready.state).toBe("ready");
      expect(ready.evidence).toContain(".github/workflows/ci.yml");
      const pushOnly = { ...readyReads(), workflows: [{ file: ".github/workflows/ci.yml", triggers: ["push"] }] };
      expect(check(assessReadiness(readyInfo(), pushOnly), "pr-workflow").state).toBe("gap");
    });

    it("pr-workflow: a non-GitHub provider is a gap, commit status only", () => {
      const info = { ...readyInfo(), ciProviders: ["gitlab-ci"] };
      const row = check(assessReadiness(info, { ...readyReads(), workflows: [] }), "pr-workflow");
      expect(row.state).toBe("gap");
      expect(row.evidence).toContain("commit status only");
    });

    it("pr-workflow: a workflow that does not parse, with none on pull_request, is unknown", () => {
      const reads = {
        ...readyReads(),
        workflows: [
          { file: ".github/workflows/ci.yml", triggers: ["push"] },
          { file: ".github/workflows/broken.yml", triggers: null },
        ],
      };
      const row = check(assessReadiness(readyInfo(), reads), "pr-workflow");
      expect(row.state).toBe("unknown");
      expect(row.evidence).toContain("broken.yml");
    });

    it("land-job-workflows", () => {
      expect(check(assessReadiness(readyInfo(), readyReads()), "land-job-workflows").state).toBe("ready");
      const reads = { ...readyReads(), landJob: { status: "warn" as const, detail: "no workflow file carries ci" } };
      const gap = check(assessReadiness(readyInfo(), reads), "land-job-workflows");
      expect(gap.state).toBe("gap");
      expect(gap.evidence).toContain("no workflow file carries ci");
      const off = check(assessReadiness(readyInfo(), { ...readyReads(), landJob: "off" }), "land-job-workflows");
      expect(off.state).toBe("not-checked");
    });

    it("lockfile", () => {
      expect(check(assessReadiness(readyInfo(), readyReads()), "lockfile").state).toBe("ready");
      const gap = check(assessReadiness(readyInfo(), { ...readyReads(), lockfiles: [] }), "lockfile");
      expect(gap.state).toBe("gap");
      expect(gap.evidence).toContain("typescript");
      const twoLanguages = { ...readyInfo(), languages: ["typescript", "python"] };
      const half = check(assessReadiness(twoLanguages, readyReads()), "lockfile");
      expect(half.state).toBe("gap");
      expect(half.evidence).toContain("python");
      const noConvention = { ...readyInfo(), languages: ["cpp"] };
      expect(check(assessReadiness(noConvention, { ...readyReads(), lockfiles: [] }), "lockfile").state).toBe(
        "not-checked",
      );
    });

    it("setup-pinned", () => {
      expect(check(assessReadiness(readyInfo(), readyReads()), "setup-pinned").state).toBe("ready");
      const absent = { ...readyReads(), setup: { manifest: "absent" as const, pinnedVersion: null, committed: null } };
      expect(check(assessReadiness(readyInfo(), absent), "setup-pinned").state).toBe("gap");
      const unpinned = { ...readyReads(), setup: { manifest: "present" as const, pinnedVersion: null, committed: true } };
      expect(check(assessReadiness(readyInfo(), unpinned), "setup-pinned").state).toBe("gap");
      const uncommitted = {
        ...readyReads(),
        setup: { manifest: "present" as const, pinnedVersion: "1.19.0", committed: false },
      };
      const row = check(assessReadiness(readyInfo(), uncommitted), "setup-pinned");
      expect(row.state).toBe("gap");
      expect(row.fix).toContain("commit");
      const unread = {
        ...readyReads(),
        setup: { manifest: "unreadable" as const, pinnedVersion: null, committed: null },
      };
      expect(check(assessReadiness(readyInfo(), unread), "setup-pinned").state).toBe("unknown");
      const commitUnknown = {
        ...readyReads(),
        setup: { manifest: "present" as const, pinnedVersion: "1.19.0", committed: null },
      };
      expect(check(assessReadiness(readyInfo(), commitUnknown), "setup-pinned").state).toBe("unknown");
    });

    it("tests-class", () => {
      expect(check(assessReadiness(readyInfo(), readyReads()), "tests-class").state).toBe("ready");
      const none = { ...readyReads(), classFile: { state: "read" as const, testGlobs: [] } };
      expect(check(assessReadiness(readyInfo(), none), "tests-class").state).toBe("gap");
      const absent = { ...readyReads(), classFile: { state: "absent" as const } };
      expect(check(assessReadiness(readyInfo(), absent), "tests-class").state).toBe("gap");
      const refused = { ...readyReads(), classFile: { state: "unreadable" as const, reason: "not valid JSON" } };
      expect(check(assessReadiness(readyInfo(), refused), "tests-class").state).toBe("unknown");
    });

    it("coverage: a report on disk is ready, none is not-checked, an unreadable one unknown", () => {
      const ready = assessReadiness(readyInfo(), readyReads());
      expect(check(ready, "coverage")).toMatchObject({ state: "ready" });
      expect(check(ready, "coverage").evidence).toContain("83.5");
      const absent = assessReadiness(readyInfo(), { ...readyReads(), coverage: { state: "absent" } });
      expect(check(absent, "coverage").state).toBe("not-checked");
      expect(absent.coverage).toBeNull();
      expect(absent.notChecked).toEqual(["coverage", "branch-rule"]);
      expect(absent.ready).toBe(true);
      const unread = assessReadiness(readyInfo(), {
        ...readyReads(),
        coverage: { state: "unknown", file: "coverage/lcov.info", reason: "over 5 MB with no totals line" },
      });
      expect(check(unread, "coverage").state).toBe("unknown");
      expect(unread.coverage).toBeNull();
    });
  });

  it("is not ready with one gap, and not ready with one unknown", () => {
    expect(assessReadiness({ ...readyInfo(), ciProviders: [] }, readyReads()).ready).toBe(false);
    expect(assessReadiness(readyInfo(), { ...readyReads(), gates: null }).ready).toBe(false);
  });

  it("does not mutate its inputs", () => {
    const info = readyInfo();
    const reads = readyReads();
    const before = JSON.stringify([info, reads]);
    assessReadiness(info, reads);
    expect(JSON.stringify([info, reads])).toBe(before);
  });
});

describe("readReadinessFiles", () => {
  it("reads a ready repository: a pull_request workflow, a lockfile, a tests class and coverage", async () => {
    const root = await seedRepo({
      ".github/workflows/ci.yml": PR_WORKFLOW,
      ".github/workflows/stamity-land.yml": "on: pull_request\n",
      "package-lock.json": "{}\n",
      ".stamity/change-classes.json": TESTS_CLASS,
      "coverage/coverage-summary.json": ISTANBUL_SUMMARY,
    });
    const files = await readReadinessFiles(root);
    expect(files.workflows).toEqual([{ file: ".github/workflows/ci.yml", triggers: ["pull_request", "push"] }]);
    expect(files.lockfiles).toEqual(["package-lock.json"]);
    expect(files.classFile).toEqual({ state: "read", testGlobs: ["spec/**"] });
    expect(files.coverage).toEqual({ state: "read", file: "coverage/coverage-summary.json", linesPct: 83.5 });
    const report = assessReadiness(readyInfo(root), {
      ...files,
      gates: { unresolved: [] },
      landJob: "off",
      setup: { manifest: "present", pinnedVersion: "1.19.0", committed: true },
    });
    expect(check(report, "pr-workflow").state).toBe("ready");
    expect(check(report, "tests-class").state).toBe("ready");
  });

  it("reads a repository whose only workflow runs on push as a pr-workflow gap", async () => {
    const root = await seedRepo({ ".github/workflows/ci.yml": PUSH_WORKFLOW, "package-lock.json": "{}\n" });
    const files = await readReadinessFiles(root);
    expect(files.workflows).toEqual([{ file: ".github/workflows/ci.yml", triggers: ["push"] }]);
    const report = assessReadiness(readyInfo(root), { ...readyReads(), ...files });
    expect(check(report, "pr-workflow").state).toBe("gap");
    expect(check(report, "tests-class").state).toBe("gap");
    expect(report.coverage).toBeNull();
    expect(report.ready).toBe(false);
  });

  it("reads an empty repository as absent everywhere, without a throw", async () => {
    const files = await readReadinessFiles(await seedRepo({ "notes.txt": "x\n" }));
    expect(files).toEqual({ workflows: [], lockfiles: [], classFile: { state: "absent" }, coverage: { state: "absent" } });
  });

  it("reads each trigger form: a string, a list and a map", async () => {
    const root = await seedRepo({
      ".github/workflows/a.yml": "on: pull_request\n",
      ".github/workflows/b.yaml": "on: [push, pull_request]\n",
      ".github/workflows/c.yml": "on:\n  workflow_dispatch: {}\n",
    });
    const files = await readReadinessFiles(root);
    expect(files.workflows).toEqual([
      { file: ".github/workflows/a.yml", triggers: ["pull_request"] },
      { file: ".github/workflows/b.yaml", triggers: ["push", "pull_request"] },
      { file: ".github/workflows/c.yml", triggers: ["workflow_dispatch"] },
    ]);
  });

  it("reads a workflow that does not parse, or holds no on: key, as triggers null", async () => {
    const root = await seedRepo({
      ".github/workflows/bad.yml": "on: [pull_request\n",
      ".github/workflows/none.yml": "name: x\n",
    });
    const files = await readReadinessFiles(root);
    expect(files.workflows).toEqual([
      { file: ".github/workflows/bad.yml", triggers: null },
      { file: ".github/workflows/none.yml", triggers: null },
    ]);
  });

  it("reads a class file without a tests class as an empty list, and a malformed one as unreadable", async () => {
    const empty = await readReadinessFiles(await seedRepo({ ".stamity/change-classes.json": '{"classes":{}}\n' }));
    expect(empty.classFile).toEqual({ state: "read", testGlobs: [] });
    const broken = await readReadinessFiles(await seedRepo({ ".stamity/change-classes.json": "{not json" }));
    expect(broken.classFile.state).toBe("unreadable");
  });

  it("finds a lockfile of each ecosystem it knows", async () => {
    const root = await seedRepo({ "uv.lock": "x\n", "Cargo.lock": "x\n", "go.sum": "x\n" });
    expect((await readReadinessFiles(root)).lockfiles).toEqual(["uv.lock", "Cargo.lock", "go.sum"]);
  });

  it("refuses a symlinked workflow, lockfile and coverage report", async () => {
    const root = await seedRepo({ "real/ci.yml": PR_WORKFLOW, "real/lock": "{}\n", "real/summary.json": ISTANBUL_SUMMARY });
    await mkdir(join(root, ".github/workflows"), { recursive: true });
    await mkdir(join(root, "coverage"), { recursive: true });
    await symlink(join(root, "real/ci.yml"), join(root, ".github/workflows/ci.yml"));
    await symlink(join(root, "real/lock"), join(root, "package-lock.json"));
    await symlink(join(root, "real/summary.json"), join(root, "coverage/coverage-summary.json"));
    const files = await readReadinessFiles(root);
    expect(files.workflows).toEqual([]);
    expect(files.lockfiles).toEqual([]);
    expect(files.coverage).toMatchObject({ state: "unknown", file: "coverage/coverage-summary.json" });
  });

  describe("coverage, totals only", () => {
    it("lists the report paths in the order it tries them", () => {
      expect(COVERAGE_REPORTS.map((report) => report.file)).toEqual([
        "coverage/coverage-summary.json",
        "coverage/lcov.info",
        "coverage.xml",
        "target/site/jacoco/jacoco.xml",
        "build/reports/jacoco/test/jacocoTestReport.xml",
      ]);
    });

    it("sums an lcov report's LF and LH lines across two records", async () => {
      const lcov = "TN:\nSF:a.ts\nDA:1,1\nLF:10\nLH:8\nend_of_record\nSF:b.ts\nLF:30\nLH:12\nend_of_record\n";
      const files = await readReadinessFiles(await seedRepo({ "coverage/lcov.info": lcov }));
      expect(files.coverage).toEqual({ state: "read", file: "coverage/lcov.info", linesPct: 50 });
    });

    it("reads Cobertura's root line-rate", async () => {
      const xml = '<?xml version="1.0" ?>\n<coverage line-rate="0.7312" branch-rate="0.5" version="7">\n<packages/>\n</coverage>\n';
      const files = await readReadinessFiles(await seedRepo({ "coverage.xml": xml }));
      expect(files.coverage).toEqual({ state: "read", file: "coverage.xml", linesPct: 73.12 });
    });

    it("reads JaCoCo's report-level LINE counter, not a class's", async () => {
      const xml = [
        '<?xml version="1.0"?><report name="x">',
        '<package name="p"><class name="p/A"><counter type="LINE" missed="9" covered="1"/></class>',
        '<counter type="LINE" missed="9" covered="1"/></package>',
        '<counter type="INSTRUCTION" missed="5" covered="5"/>',
        '<counter type="LINE" missed="25" covered="75"/>',
        '<counter type="METHOD" missed="1" covered="3"/>',
        "</report>",
      ].join("\n");
      const maven = await readReadinessFiles(await seedRepo({ "target/site/jacoco/jacoco.xml": xml }));
      expect(maven.coverage).toEqual({ state: "read", file: "target/site/jacoco/jacoco.xml", linesPct: 75 });
      const gradle = await readReadinessFiles(
        await seedRepo({ "build/reports/jacoco/test/jacocoTestReport.xml": xml }),
      );
      expect(gradle.coverage).toMatchObject({ state: "read", linesPct: 75 });
    });

    it("takes the first report present", async () => {
      const lcov = "SF:a.ts\nLF:4\nLH:1\nend_of_record\n";
      const files = await readReadinessFiles(
        await seedRepo({ "coverage/coverage-summary.json": ISTANBUL_SUMMARY, "coverage/lcov.info": lcov }),
      );
      expect(files.coverage).toMatchObject({ file: "coverage/coverage-summary.json", linesPct: 83.5 });
    });

    it("reads a malformed or out-of-range report as unknown, never a throw", async () => {
      const cases: Record<string, string>[] = [
        { "coverage/coverage-summary.json": "{not json" },
        { "coverage/coverage-summary.json": '{"total":{"lines":{"pct":"Unknown"}}}' },
        { "coverage/lcov.info": "SF:a.ts\nend_of_record\n" },
        { "coverage.xml": '<coverage line-rate="7.5">' },
        { "target/site/jacoco/jacoco.xml": "<report></report>" },
      ];
      const roots = await Promise.all(cases.map((seeded) => seedRepo(seeded)));
      const reads = await Promise.all(roots.map((root) => readReadinessFiles(root)));
      reads.forEach((files, index) => {
        expect(files.coverage.state, Object.keys(cases[index] ?? {})[0]).toBe("unknown");
      });
    });

    it("reads a report over 5 MB only for its totals line, else marks it unknown", async () => {
      const filler = "x".repeat(5 * 1024 * 1024 + 10);
      const big = await seedRepo({});
      // Cobertura's totals sit on the root element, so the head of a huge report still gives them.
      await writeFile(join(big, "coverage.xml"), `<coverage line-rate="0.5" version="7">\n<!-- ${filler} -->\n</coverage>\n`);
      expect((await readReadinessFiles(big)).coverage).toEqual({ state: "read", file: "coverage.xml", linesPct: 50 });

      // JaCoCo's report-level counters close the file, so its tail gives them.
      const jacoco = await seedRepo({});
      await mkdir(join(jacoco, "target/site/jacoco"), { recursive: true });
      await writeFile(
        join(jacoco, "target/site/jacoco/jacoco.xml"),
        `<report><!-- ${filler} --><counter type="LINE" missed="1" covered="3"/></report>\n`,
      );
      expect((await readReadinessFiles(jacoco)).coverage).toMatchObject({ state: "read", linesPct: 75 });

      // lcov has no totals line, so a huge one is unknown rather than read whole.
      const lcov = await seedRepo({});
      await mkdir(join(lcov, "coverage"), { recursive: true });
      await writeFile(join(lcov, "coverage/lcov.info"), `SF:a.ts\nLF:4\nLH:1\nend_of_record\n# ${filler}\n`);
      const read = (await readReadinessFiles(lcov)).coverage;
      expect(read).toMatchObject({ state: "unknown", file: "coverage/lcov.info" });
    });
  });

  it("reads a workflow over its cap as triggers null, never parsing it", async () => {
    const root = await seedRepo({});
    await mkdir(join(root, ".github/workflows"), { recursive: true });
    await writeFile(join(root, ".github/workflows/huge.yml"), `on: pull_request\n# ${"x".repeat(1024 * 1024 + 10)}\n`);
    expect((await readReadinessFiles(root)).workflows).toEqual([{ file: ".github/workflows/huge.yml", triggers: null }]);
  });

  it("imports no process-spawning module", async () => {
    const source = await readFile(join(import.meta.dirname, "../../src/detect/readiness.ts"), "utf8");
    expect(source).not.toMatch(/child_process|worker_threads|node:vm\b/);
  });
});
