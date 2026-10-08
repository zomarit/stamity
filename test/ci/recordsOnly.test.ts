import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM CI helper, outside the product package.
import { decide, isRecordsPath, LANE_PATHS, LANE_SUITES, laneOf, RECORDS_PATHS, RECORDS_SUITES } from "../../scripts/ci/records-only.mjs";

/**
 * The CI lane classifier, `scripts/ci/records-only.mjs` (the file name predates the other lanes).
 *
 * What it guards is one direction of one mistake: a change that touches code must never be
 * classified into a lane, because that classification skips the three heavy jobs. So every
 * near-miss here is asserted to read `full`, and a lane is asserted only for diffs made of that
 * lane's paths alone. The records answer (`recordsOnly`, the `records_only` output) is kept for
 * one release and still means "every path is a record". The CLI half runs against real scratch
 * repositories, because the property that matters — what `git diff` lists — is not visible to
 * the pure half.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "ci", "records-only.mjs");
const SHA = "a".repeat(40);

interface Decision {
  readonly full: boolean;
  readonly lanes: readonly string[];
  readonly suites: readonly string[];
  readonly siteBuild: boolean;
  readonly cliCheck: boolean;
  readonly recordsOnly: boolean;
  readonly reason: string;
}
const decideTyped = decide as (input: {
  event: string | undefined;
  base: string | undefined;
  paths: readonly string[];
}) => Decision;
const isRecords = isRecordsPath as (path: string) => boolean;
const laneOfTyped = laneOf as (path: string) => string | null;
const lanePaths = LANE_PATHS as Readonly<Record<string, readonly string[]>>;
const laneSuites = LANE_SUITES as Readonly<Record<string, readonly string[]>>;

/** The CLI's `key=value` lines as a map, so a case reads the one answer it is about. */
function outputsOf(stdout: string): Record<string, string> {
  return Object.fromEntries(
    stdout
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

describe("the records list", () => {
  it("is the four record locations and nothing else", () => {
    expect(RECORDS_PATHS).toEqual([
      ".stamity/runs/**",
      ".stamity/inbox.md",
      ".stamity/handoffs/**",
      "docs/plans/**",
    ]);
  });

  it("matches a file in each record location", () => {
    for (const path of [
      ".stamity/runs/2026-09-30_x/record.md",
      ".stamity/runs/2026-09-30_x/reports/u1-implementer-r1.md",
      ".stamity/inbox.md",
      ".stamity/handoffs/archive/2026-09-22_note_8457c.md",
      "docs/plans/013-optimization-sweep-03.md",
    ]) {
      expect(isRecords(path), path).toBe(true);
    }
  });

  it("refuses every near miss, the learnings and the engine-written keep file", () => {
    for (const path of [
      // The learnings feed the session hook and the troubleshooting count: not a record.
      ".stamity/learnings/some-finding.md",
      // Engine-emitted state scaffold, planned by sync and re-proven by the dogfood check.
      ".stamity/handoffs/.gitkeep",
      ".stamity/runs/.gitkeep",
      // Prefix look-alikes.
      ".stamity/runsX/record.md",
      ".stamity/runs",
      ".stamity/inbox.md.bak",
      ".stamity/inbox.mdx",
      "docs/plans",
      "docs/plans-old/001.md",
      "docs/specs/everyday-flows.md",
      ".stamity/manifest.json",
      "src/cli.ts",
      // Case differs: git paths are case-exact, and the lane fails closed.
      ".Stamity/runs/x.md",
      // A segment that walks back out of the record location.
      ".stamity/runs/../../src/cli.ts",
    ]) {
      expect(isRecords(path), path).toBe(false);
    }
  });

  it("names the suites that read the committed records, and each exists", () => {
    // Confirmed at build (2026-09-30) by reading which suites open the REAL repository-root
    // copies of the four locations: the ledgers and the spec-status walk (test/records), the
    // measurements page rendered from the committed runs, the plan-coverage check over two real
    // plans, and the two leak-gate runs over the whole tree (docsPages and leakGate). The
    // leak-gate evasion and hygiene suites run on scratch trees and are not in the list.
    expect(RECORDS_SUITES).toEqual([
      "test/records",
      "test/docsPages.test.ts",
      "test/cli/docs/measurements.test.ts",
      "test/authoring/specPlanCoverage.test.ts",
      "test/ci/leakGate.test.ts",
    ]);
    for (const suite of RECORDS_SUITES as readonly string[]) {
      expect(existsSync(join(REPO_ROOT, suite)), suite).toBe(true);
    }
  });
});

describe("decide — the pure classification", () => {
  it("reads true for a push or pull request whose every path is a record", () => {
    for (const event of ["push", "pull_request"]) {
      const decision = decideTyped({
        event,
        base: SHA,
        paths: [".stamity/runs/x/record.md", "docs/plans/013-x.md", ".stamity/inbox.md"],
      });
      expect(decision.recordsOnly, event).toBe(true);
    }
  });

  it("reads false the moment one path is not a record", () => {
    const decision = decideTyped({
      event: "push",
      base: SHA,
      paths: [".stamity/runs/x/record.md", "src/cli.ts"],
    });
    // TEST CHANGE, justified (2026-10-08, unit a2-ci-lanes): the decision carries the lane answer
    // beside `recordsOnly` (`full`, `lanes`, `suites`, `siteBuild`, `cliCheck`), so the whole
    // object is pinned to the full-CI answer instead of the two keys it used to have.
    expect(decision).toEqual({
      full: true,
      lanes: [],
      suites: [],
      siteBuild: false,
      cliCheck: false,
      recordsOnly: false,
      reason: expect.stringContaining("src/cli.ts"),
    });
  });

  it("reads false for a learnings change", () => {
    expect(
      decideTyped({ event: "push", base: SHA, paths: [".stamity/learnings/x.md"] }).recordsOnly,
    ).toBe(false);
  });

  it("reads false with no base to compare against", () => {
    for (const base of [undefined, "", "0".repeat(40), "0000000", "not-a-sha", "--output=/tmp/x"]) {
      const decision = decideTyped({ event: "push", base, paths: [".stamity/runs/x/record.md"] });
      expect(decision.recordsOnly, String(base)).toBe(false);
    }
  });

  it("reads false on the schedule, a dispatch, or an event it does not know", () => {
    for (const event of ["schedule", "workflow_dispatch", "merge_group", "", undefined]) {
      const decision = decideTyped({ event, base: SHA, paths: [".stamity/runs/x/record.md"] });
      expect(decision.recordsOnly, String(event)).toBe(false);
    }
  });

  it("reads false for an empty diff, since nothing proves the change is a record", () => {
    expect(decideTyped({ event: "push", base: SHA, paths: [] }).recordsOnly).toBe(false);
  });
});

// ADDED by run 2026-10-08_maintainer-tooling, unit a2-ci-lanes: the website, spec and learnings
// lanes beside the records lane. Same direction of risk as above: a path no lane names is full CI.
describe("the lanes — website, specs and learnings beside the records", () => {
  const ALL_LANES = ["records", "specs", "learnings", "website"];
  const SAMPLE: Readonly<Record<string, string>> = {
    records: ".stamity/runs/x/record.md",
    specs: "docs/specs/everyday-flows.md",
    learnings: ".stamity/learnings/some-finding.md",
    website: "website/package-lock.json",
  };

  it("names four lanes, the records lane's paths unchanged", () => {
    expect(Object.keys(lanePaths)).toEqual(ALL_LANES);
    expect(lanePaths["records"]).toEqual(RECORDS_PATHS);
    expect(lanePaths["specs"]).toEqual(["docs/specs/**"]);
    expect(lanePaths["learnings"]).toEqual([".stamity/learnings/**"]);
    expect(lanePaths["website"]).toEqual(["website/**", "docs/**"]);
    expect(Object.keys(laneSuites)).toEqual(ALL_LANES);
    expect(laneSuites["records"]).toEqual(RECORDS_SUITES);
  });

  it("names, per lane, the suites that read that lane's committed paths, and each exists", () => {
    // Confirmed at build (2026-10-08) by reading every test that opens a repository-root path in
    // a lane: the spec walk and the spec-plan check and the site roster over docs/specs; the
    // learnings suite and the whole-tree leak gate over .stamity/learnings; and over website/ and
    // docs/ every page, roster, generated-page and site suite, plus two the census added beyond
    // the plan's list — the corpus invariants (docs/capability-matrix.md) and the pack signing
    // rehearsal (docs/packs-and-trust.md).
    expect(laneSuites["specs"]).toEqual([
      ...(RECORDS_SUITES as readonly string[]),
      "test/records/specStatus.test.ts",
      "test/ci/docsRoster.test.ts",
    ]);
    expect(laneSuites["learnings"]).toEqual(["test/learnings/repoLearnings.test.ts", "test/ci/leakGate.test.ts"]);
    expect(laneSuites["website"]).toEqual([
      "test/ci/docsSite.test.ts",
      "test/ci/docsRoster.test.ts",
      "test/ci/tableHeaderScope.test.ts",
      "test/docsPages.test.ts",
      "test/ci/workflow.test.ts",
      "test/ci/leakGate.test.ts",
      "test/cli/docs/cliReference.test.ts",
      "test/cli/docs/configReference.test.ts",
      "test/cli/docs/measurements.test.ts",
      "test/cli/docs/referencePages.test.ts",
      "test/cli/docs/llmsIndex.test.ts",
      "test/cli/commands/check.test.ts",
      "test/content/invariantsVersion.test.ts",
      "test/emit/capabilityMatrix.test.ts",
      "test/corpus/invariants.test.ts",
      "test/ci/packSigningRehearsal.test.ts",
    ]);
    for (const lane of ALL_LANES) {
      const suites = laneSuites[lane] ?? [];
      expect(new Set(suites).size, `${lane} lists a suite twice`).toBe(suites.length);
      for (const suite of suites) expect(existsSync(join(REPO_ROOT, suite)), `${lane}: ${suite}`).toBe(true);
    }
  });

  it("names each lane alone for a diff of that lane's paths alone", () => {
    for (const lane of ALL_LANES) {
      const decision = decideTyped({ event: "pull_request", base: SHA, paths: [SAMPLE[lane] as string] });
      expect(decision, lane).toMatchObject({
        full: false,
        lanes: [lane],
        suites: laneSuites[lane],
        siteBuild: lane === "website",
        cliCheck: lane === "learnings",
        recordsOnly: lane === "records",
      });
    }
  });

  it("runs the union of two lanes' suites with no suite twice, and is records-only on neither", () => {
    const decision = decideTyped({
      event: "push",
      base: SHA,
      paths: ["docs/specs/x.md", ".stamity/runs/r/record.md"],
    });
    expect(decision.full).toBe(false);
    expect(decision.lanes).toEqual(["records", "specs"]);
    // The specs lane carries every records suite, so the union is the specs list, once each.
    expect(decision.suites).toEqual(laneSuites["specs"]);
    expect(new Set(decision.suites).size).toBe(decision.suites.length);
    expect(decision.recordsOnly).toBe(false);
    const everything = decideTyped({ event: "push", base: SHA, paths: Object.values(SAMPLE) });
    expect(everything.lanes).toEqual(["learnings", "records", "specs", "website"]);
    expect(everything).toMatchObject({ full: false, siteBuild: true, cliCheck: true, recordsOnly: false });
    expect(new Set(everything.suites).size).toBe(everything.suites.length);
    expect(everything.suites).toContain("test/learnings/repoLearnings.test.ts");
    expect(everything.suites).toContain("test/ci/docsSite.test.ts");
  });

  it("reads full for any path in no lane, beside lane paths or alone", () => {
    for (const path of [
      "website-old/x",
      ".stamity/learnings.md",
      ".stamity/learnings/.gitkeep",
      ".stamity/learnings",
      "content/x.md",
      // It ships in the npm tarball, so it is product, not website.
      "README.md",
      "src/cli.ts",
      "docs/../src/cli.ts",
      "website/./x.md",
    ]) {
      expect(laneOfTyped(path), path).toBeNull();
      const decision = decideTyped({ event: "pull_request", base: SHA, paths: ["website/x.md", path] });
      expect(decision, path).toMatchObject({ full: true, lanes: [], suites: [], siteBuild: false, cliCheck: false });
      expect(decision.reason, path).toContain(path);
    }
  });

  it("sends a docs path to the website lane unless it sits under plans or specs", () => {
    expect(laneOfTyped("docs/specs.md")).toBe("website");
    expect(laneOfTyped("docs/plans-old/x.md")).toBe("website");
    expect(laneOfTyped("docs/specs-old/x.md")).toBe("website");
    expect(laneOfTyped("docs/getting-started.md")).toBe("website");
    expect(laneOfTyped("docs/plans/019-x.md")).toBe("records");
    expect(laneOfTyped("docs/specs/x.md")).toBe("specs");
    expect(laneOfTyped(".stamity/learnings/x.md")).toBe("learnings");
  });

  it("reads full on every event but push and pull request, and on a bad base, whatever the paths", () => {
    for (const event of ["schedule", "workflow_dispatch", undefined]) {
      expect(decideTyped({ event, base: SHA, paths: ["website/x.md"] }).full, String(event)).toBe(true);
    }
    for (const base of [undefined, "0".repeat(40), "not-a-sha"]) {
      expect(decideTyped({ event: "push", base, paths: ["website/x.md"] }).full, String(base)).toBe(true);
    }
    expect(decideTyped({ event: "push", base: SHA, paths: [] }).full).toBe(true);
  });
});

// ── the CLI, against real scratch repositories ───────────────────────────────

const scratches: string[] = [];
afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repository with one base commit holding a code file and a record. */
function repository(): { root: string; commit: (message: string) => string; write: (path: string, body: string) => void } {
  const root = mkdtempSync(join(tmpdir(), "stamity-records-only-"));
  scratches.push(root);
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args],
      { cwd: root, encoding: "utf8" },
    ).trim();
  const write = (path: string, body: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  const commit = (message: string) => {
    git("add", "-A");
    git("commit", "--quiet", "--no-verify", "--allow-empty", "--message", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet");
  write("src/cli.ts", "export {};\n");
  write(".stamity/runs/r1/record.md", "# record\n");
  write(".stamity/inbox.md", "# inbox\n");
  commit("base");
  return { root, commit, write };
}

function run(root: string, args: readonly string[], env: Record<string, string> = {}) {
  const inherited = { ...process.env };
  delete inherited.GITHUB_OUTPUT;
  delete inherited.GITHUB_EVENT_NAME;
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...inherited, ...env },
    windowsHide: true,
  });
}

describe("records-only.mjs — the CLI over a real diff", () => {
  it("prints records_only=true for a diff touching only a run record", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.write(".stamity/inbox.md", "# inbox, one row more\n");
    repo.commit("records");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "push" });
    expect(result.status, result.stderr).toBe(0);
    // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes):
    // the CLI now prints one line per output (`full`, `lanes`, `suites`, `site_build`,
    // `cli_check`, `records_only`) where it printed `records_only` alone. The records answer this
    // case pins is unchanged; it is read out of the six lines, and the lane is pinned beside it.
    expect(outputsOf(result.stdout)).toMatchObject({ records_only: "true", full: "false", lanes: '["records"]' });
  });

  it("prints records_only=false when the same diff also touches src/cli.ts", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.write("src/cli.ts", "export const changed = 1;\n");
    repo.commit("records and code");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "push" });
    expect(result.status, result.stderr).toBe(0);
    // TEST CHANGE, justified (2026-10-08, unit a2-ci-lanes): read out of the six output lines, as
    // above; a code path is in no lane, so the answer is full CI.
    expect(outputsOf(result.stdout)).toMatchObject({ records_only: "false", full: "true" });
    expect(result.stderr).toContain("src/cli.ts");
  });

  it("sees both sides of a rename, so moving code into a record location is not a record", () => {
    // `git diff --name-only` reports a detected rename by its NEW name only. Without
    // `--no-renames` this diff would list one record path and read true while deleting code.
    const repo = repository();
    const base = repo.commit("noop");
    mkdirSync(join(repo.root, ".stamity/runs/x"), { recursive: true });
    renameSync(join(repo.root, "src/cli.ts"), join(repo.root, ".stamity/runs/x/cli.ts"));
    repo.commit("move code under the runs folder");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "pull_request" });
    expect(result.status, result.stderr).toBe(0);
    // TEST CHANGE, justified (2026-10-08, unit a2-ci-lanes): read out of the six output lines.
    expect(outputsOf(result.stdout)).toMatchObject({ records_only: "false", full: "true" });
  });

  it("prints false on the schedule and on a dispatch, even for a records-only diff", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.commit("records");
    for (const event of ["schedule", "workflow_dispatch"]) {
      const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: event });
      expect(result.status, result.stderr).toBe(0);
      // TEST CHANGE, justified (2026-10-08, unit a2-ci-lanes): read out of the six output lines.
      expect(outputsOf(result.stdout), event).toMatchObject({ records_only: "false", full: "true" });
    }
  });

  it("prints false for an all-zero, empty or absent base, and for a base git does not have", () => {
    const repo = repository();
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.commit("records");
    for (const args of [["--base", "0".repeat(40)], ["--base", ""], [], ["--base", "b".repeat(40)]]) {
      const result = run(repo.root, args, { GITHUB_EVENT_NAME: "push" });
      expect(result.status, `${args.join(" ")}: ${result.stderr}`).toBe(0);
      // TEST CHANGE, justified (2026-10-08, unit a2-ci-lanes): read out of the six output lines.
      expect(outputsOf(result.stdout), args.join(" ")).toMatchObject({ records_only: "false", full: "true" });
    }
  });

  it("appends the answer to GITHUB_OUTPUT when the runner provides one", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write("docs/plans/001-x.md", "# plan\n");
    repo.commit("a plan");
    const output = join(repo.root, "..", `${repo.root.split(/[\\/]/).at(-1) ?? "x"}.output`);
    scratches.push(output);
    writeFileSync(output, "earlier=1\n");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "push", GITHUB_OUTPUT: output });
    expect(result.status, result.stderr).toBe(0);
    // TEST CHANGE, justified (2026-10-08, unit a2-ci-lanes): the runner's file now receives the
    // six outputs, in the order the job maps them, after what an earlier step wrote.
    expect(readFileSync(output, "utf8")).toBe(
      [
        "earlier=1",
        "full=false",
        'lanes=["records"]',
        `suites=${(RECORDS_SUITES as readonly string[]).join(" ")}`,
        "site_build=false",
        "cli_check=false",
        "records_only=true",
        "",
      ].join("\n"),
    );
  });

  // ADDED by unit a2-ci-lanes (2026-10-08): the website-only Dependabot lockfile bump.
  it("puts a website-only lockfile diff on the website lane, with the site build and no full CI", () => {
    const repo = repository();
    repo.write("website/package-lock.json", "{}\n");
    const base = repo.commit("a site lockfile");
    repo.write("website/package-lock.json", '{"lockfileVersion":3}\n');
    repo.commit("bump the site lockfile");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "pull_request" });
    expect(result.status, result.stderr).toBe(0);
    expect(outputsOf(result.stdout)).toEqual({
      full: "false",
      lanes: '["website"]',
      suites: (laneSuites["website"] ?? []).join(" "),
      site_build: "true",
      cli_check: "false",
      records_only: "false",
    });
  });

  it("refuses an argument it does not know, rather than guessing", () => {
    const repo = repository();
    const result = run(repo.root, ["--bsae", "HEAD"], { GITHUB_EVENT_NAME: "push" });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  });
});
