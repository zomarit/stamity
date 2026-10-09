import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CLASS_FILE, parseClassFile } from "../../src/change/classify.ts";
import { selectTests, type TestInputEntry } from "../../src/change/testInputs.ts";
// @ts-expect-error — import-safe native ESM CI helper, outside the product package.
import * as lanesModule from "../../scripts/ci/records-only.mjs";

const { decide, isRecordsPath, LANE_PATHS, laneOf, RECORDS_PATHS } = lanesModule as Record<string, unknown>;

// Fixture data kept out of the test-input census: built at run time, as a literal it names this repository's own inbox.
const INBOX = [".stamity", "inbox.md"].join("/");
// Fixture data kept out of the test-input census: built at run time, as a literal it names this repository's own handoffs keep file.
const HANDOFFS_KEEP = [".stamity/handoffs", ".gitkeep"].join("/");

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
interface DecideInput {
  event: string | undefined;
  base: string | undefined;
  paths: readonly string[];
  // `undefined` too: one case passes it explicitly, as a caller leaving the argument out does.
  map?: readonly TestInputEntry[] | null | undefined;
}
const decideRaw = decide as (input: DecideInput) => Decision;
const isRecords = isRecordsPath as (path: string) => boolean;
const laneOfTyped = laneOf as (path: string) => string | null;
const lanePaths = LANE_PATHS as Readonly<Record<string, readonly string[]>>;

/**
 * The census map: this repository's own class file, parsed the way the script parses the base
 * commit's copy. Read from the work tree here, since the pure half takes the map as an argument.
 */
const CENSUS_TEXT = readFileSync(join(REPO_ROOT, CLASS_FILE), "utf8");
const CENSUS = parseClassFile(CENSUS_TEXT);
const CENSUS_MAP: readonly TestInputEntry[] | null = CENSUS.ok ? CENSUS.testInputs : null;

/**
 * TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map):
 * `decide` takes the base commit's test-input map (`map`), and every case written before it is
 * called with the census map unless it passes its own, so each answer it pinned is held unchanged
 * against the map that replaced `LANE_SUITES`.
 */
function decideTyped(input: DecideInput): Decision {
  return decideRaw({ map: CENSUS_MAP, ...input });
}

/** What `selectTests` selects for these paths from the census map: the union the lanes must equal. */
function mapSelection(paths: readonly string[]): string[] {
  const selection = selectTests({ paths, class: "records", map: CENSUS_MAP ?? [] });
  expect(selection.full, selection.reason).toBe(false);
  return selection.files;
}

/**
 * The floor: the suites `LANE_SUITES` (with `RECORDS_SUITES` as the records lane) listed on
 * 2026-10-08, the last day the classifier spelled them. The map may add to a lane, never drop one.
 */
const RECORDS_FLOOR: readonly string[] = [
  "test/records",
  "test/docsPages.test.ts",
  "test/cli/docs/measurements.test.ts",
  "test/authoring/specPlanCoverage.test.ts",
  "test/ci/leakGate.test.ts",
];
const LANE_FLOOR: Readonly<Record<string, readonly string[]>> = {
  records: RECORDS_FLOOR,
  specs: [...RECORDS_FLOOR, "test/records/specStatus.test.ts", "test/ci/docsRoster.test.ts"],
  learnings: ["test/learnings/repoLearnings.test.ts", "test/ci/leakGate.test.ts"],
  website: [
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
  ],
};

/** A path strictly beneath a lane pattern, built from the pattern so no literal names a tracked file. */
function sampleUnder(pattern: string): string {
  return pattern.endsWith("/**") ? `${pattern.slice(0, -2)}p2c-sample/probe.md` : pattern;
}

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
      // Fixture data kept out of the test-input census: the globs are built at run time, as literals they name every record.
      [".stamity/runs", "**"].join("/"),
      INBOX,
      [".stamity/handoffs", "**"].join("/"),
      ["docs/plans", "**"].join("/"),
    ]);
  });

  it("matches a file in each record location", () => {
    for (const path of [
      ".stamity/runs/2026-09-30_x/record.md",
      ".stamity/runs/2026-09-30_x/reports/u1-implementer-r1.md",
      INBOX,
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
      HANDOFFS_KEEP,
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
    // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map):
    // `RECORDS_SUITES` left the classifier; the records suites are what the census map gives the
    // four record locations. The pinned list moved here as `RECORDS_FLOOR`, which the map's answer
    // for each location must hold, and the answer is the census's own records suites.
    expect(lanesModule).not.toHaveProperty("RECORDS_SUITES");
    for (const pattern of RECORDS_PATHS as readonly string[]) {
      const path = sampleUnder(pattern);
      const decision = decideTyped({ event: "pull_request", base: SHA, paths: [path] });
      expect(decision, path).toMatchObject({ full: false, lanes: ["records"], recordsOnly: true });
      expect(decision.suites, path).toEqual(expect.arrayContaining([...RECORDS_FLOOR]));
      expect(decision.suites, path).toEqual(mapSelection([path]));
      for (const suite of decision.suites) expect(existsSync(join(REPO_ROOT, suite)), suite).toBe(true);
    }
  });
});

describe("decide — the pure classification", () => {
  it("reads true for a push or pull request whose every path is a record", () => {
    for (const event of ["push", "pull_request"]) {
      const decision = decideTyped({
        event,
        base: SHA,
        paths: [".stamity/runs/x/record.md", "docs/plans/013-x.md", INBOX],
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
    // Fixture data kept out of the test-input census: the globs are built at run time, as literals they name every lane file.
    expect(lanePaths["specs"]).toEqual([["docs/specs", "**"].join("/")]);
    expect(lanePaths["learnings"]).toEqual([[".stamity/learnings", "**"].join("/")]);
    expect(lanePaths["website"]).toEqual([["website", "**"].join("/"), ["docs", "**"].join("/")]);
    // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map):
    // `LANE_SUITES` left the classifier, so where this case pinned its keys it now pins its absence;
    // the lanes' suites come from the base commit's map (the next case).
    expect(lanesModule).not.toHaveProperty("LANE_SUITES");
  });

  it("names, per lane, the suites that read that lane's committed paths, and each exists", () => {
    // Confirmed at build (2026-10-08) by reading every test that opens a repository-root path in
    // a lane: the spec walk and the spec-plan check and the site roster over docs/specs; the
    // learnings suite and the whole-tree leak gate over .stamity/learnings; and over website/ and
    // docs/ every page, roster, generated-page and site suite, plus two the census added beyond
    // the plan's list — the corpus invariants (docs/capability-matrix.md) and the pack signing
    // rehearsal (docs/packs-and-trust.md).
    // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map,
    // review/77 signed off as the union): the per-lane lists moved out of `LANE_SUITES` into the
    // census map. The lists this case pinned are `LANE_FLOOR` now, and each lane's answer for a
    // path under each of its patterns must hold its floor. The answer may be larger than the old
    // list, since a path takes every matching entry's suites (a `docs/specs/` path also matches
    // `docs/**`), the same answer `selectTests` gives for it.
    for (const lane of ALL_LANES) {
      for (const pattern of lanePaths[lane] ?? []) {
        const path = sampleUnder(pattern);
        const decision = decideTyped({ event: "pull_request", base: SHA, paths: [path] });
        expect(decision, `${lane}: ${path}`).toMatchObject({ full: false, lanes: [lane] });
        expect(decision.suites, `${lane}: ${path}`).toEqual(expect.arrayContaining([...(LANE_FLOOR[lane] ?? [])]));
        expect(new Set(decision.suites).size, `${lane} lists a suite twice`).toBe(decision.suites.length);
        for (const suite of decision.suites) expect(existsSync(join(REPO_ROOT, suite)), `${lane}: ${suite}`).toBe(true);
      }
    }
  });

  it("names each lane alone for a diff of that lane's paths alone", () => {
    for (const lane of ALL_LANES) {
      const path = SAMPLE[lane] as string;
      const decision = decideTyped({ event: "pull_request", base: SHA, paths: [path] });
      expect(decision, lane).toMatchObject({
        full: false,
        lanes: [lane],
        // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map):
        // the suites were `LANE_SUITES[lane]`; they are the census map's selection for the path.
        suites: mapSelection([path]),
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
    // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map):
    // the union was `LANE_SUITES.specs`, which carried every records suite; it is now the union of
    // every census entry either path matches, the selection `selectTests` makes for the two.
    expect(decision.suites).toEqual(mapSelection(["docs/specs/x.md", ".stamity/runs/r/record.md"]));
    expect(decision.suites).toEqual(expect.arrayContaining([...(LANE_FLOOR["specs"] ?? []), ...RECORDS_FLOOR]));
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
      // TEST CHANGE, justified (2026-10-08, run 2026-10-08_maintainer-tooling, unit a2-ci-lanes,
      // review/32 signed off): a full answer now reports the site build when the diff touches the
      // site, so the mixed diff here reads `siteBuild: true`, and the path alone reads `false`.
      // The property this case pins is unchanged: a path in no lane is full CI and runs no lane.
      const decision = decideTyped({ event: "pull_request", base: SHA, paths: ["website/x.md", path] });
      expect(decision, path).toMatchObject({ full: true, lanes: [], suites: [], siteBuild: true, cliCheck: false });
      expect(decision.reason, path).toContain(path);
      const alone = decideTyped({ event: "pull_request", base: SHA, paths: [path] });
      expect(alone, `${path} alone`).toMatchObject({ full: true, lanes: [], suites: [], siteBuild: false, cliCheck: false });
    }
  });

  // ADDED by run 2026-10-08_maintainer-tooling, unit a2-ci-lanes (review/32, signed off: S3 as
  // written). `all-ci-checks` never passes a website change whose site does not build, mixed
  // changes included, so the site build is reported on a full answer too: the full side's LTS leg
  // reads it. The direction of risk is a site change that no required job builds, so a diff the
  // classifier could not read builds the site as well.
  it("reports the site build on a full answer whose diff touches the site, mixed changes included", () => {
    for (const paths of [
      ["website/src/pages/index.tsx", "src/cli.ts"],
      ["docs/getting-started.md", "README.md"],
      ["src/cli.ts", "content/x.md", "website/package-lock.json"],
      [".stamity/runs/r/record.md", "docs/specs/x.md", "docs/troubleshooting.md", "src/cli.ts"],
    ]) {
      const decision = decideTyped({ event: "pull_request", base: SHA, paths });
      expect(decision, paths.join(" ")).toMatchObject({ full: true, lanes: [], suites: [], siteBuild: true, recordsOnly: false });
    }
    // A full answer whose diff names no site path builds no site.
    for (const paths of [
      ["src/cli.ts"],
      ["docs/specs/x.md", "src/cli.ts"],
      ["docs/plans/019-x.md", "README.md"],
      [".stamity/learnings/x.md", "content/x.md"],
      ["website-old/x", "docs/../src/cli.ts"],
    ]) {
      const decision = decideTyped({ event: "push", base: SHA, paths });
      expect(decision, paths.join(" ")).toMatchObject({ full: true, siteBuild: false });
    }
  });

  it("builds the site when it cannot read the diff, and not for an empty one", () => {
    for (const event of ["schedule", "workflow_dispatch", "merge_group", undefined]) {
      expect(decideTyped({ event, base: SHA, paths: ["src/cli.ts"] }), String(event)).toMatchObject({ full: true, siteBuild: true });
    }
    for (const base of [undefined, "", "0".repeat(40), "not-a-sha"]) {
      expect(decideTyped({ event: "push", base, paths: ["src/cli.ts"] }), String(base)).toMatchObject({ full: true, siteBuild: true });
    }
    expect(decideTyped({ event: "push", base: SHA, paths: [] })).toMatchObject({ full: true, siteBuild: false });
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

/** `<folder>/**`, built at run time so this file's text holds no glob literal over tracked files. */
function under(folder: string): string {
  return [folder, "**"].join("/");
}

// ADDED by run 2026-10-08_product-core, unit p2c-ci-lanes-from-map (REQ-FLOW-062, REQ-PROVE-031):
// the lanes' suites come from the base commit's test-input map. The direction of risk is the same
// as above: a path the map cannot answer for, an "all" entry, or no map at all is full CI.
describe("decide — the lanes' suites from the base commit's map", () => {
  const RUNS = under(".stamity/runs");
  const DOCS = under("docs");
  const SITE = under("website");

  it("unions every entry a lane path matches, and leaves out an entry no changed path matches", () => {
    const map = [
      { glob: RUNS, tests: ["test/a.test.ts", "test/b.test.ts"] },
      { glob: DOCS, tests: ["test/b.test.ts", "test/c.test.ts"] },
      { glob: SITE, tests: ["test/w.test.ts"] },
    ];
    const paths = [".stamity/runs/x/record.md", "docs/plans/001-x.md"];
    const decision = decideRaw({ event: "pull_request", base: SHA, paths, map });
    expect(decision).toMatchObject({
      full: false,
      lanes: ["records"],
      suites: ["test/a.test.ts", "test/b.test.ts", "test/c.test.ts"],
      recordsOnly: true,
    });
    // The same union `selectTests` gives for these paths and this map (review/77).
    expect(decision.suites).toEqual(selectTests({ paths, class: "records", map }).files);
  });

  it("names the census's records suites for a records-only diff", () => {
    const paths = [".stamity/runs/x/record.md", INBOX];
    const decision = decideTyped({ event: "push", base: SHA, paths });
    expect(decision).toMatchObject({ full: false, lanes: ["records"], recordsOnly: true });
    expect(decision.suites).toEqual(mapSelection(paths));
    // The census lists its own guard on every records entry, which `RECORDS_SUITES` never did.
    expect(decision.suites).toContain("test/ci/testInputsGuard.test.ts");
  });

  it("gives each lane the suites selectTests gives for that lane's paths", () => {
    for (const [lane, patterns] of Object.entries(lanePaths)) {
      const paths = patterns.map(sampleUnder);
      const decision = decideTyped({ event: "pull_request", base: SHA, paths });
      expect(decision.full, lane).toBe(false);
      expect(decision.suites, lane).toEqual(mapSelection(paths));
      expect(decision.suites.length, lane).toBeGreaterThan(0);
    }
  });

  it("reads full with no map, an empty one, or the argument left out, building the site only for a site path", () => {
    for (const map of [null, [], undefined]) {
      const records = decideRaw({ event: "pull_request", base: SHA, paths: [".stamity/runs/x/record.md"], map });
      expect(records, String(map)).toMatchObject({ full: true, lanes: [], suites: [], siteBuild: false, recordsOnly: false });
      const site = decideRaw({ event: "pull_request", base: SHA, paths: ["website/x.md"], map });
      expect(site, String(map)).toMatchObject({ full: true, lanes: [], suites: [], siteBuild: true });
    }
    expect(decideRaw({ event: "push", base: SHA, paths: ["docs/x.md"], map: null }).reason).toMatch(/map/);
  });

  it("reads full when one lane path matches no entry, naming it", () => {
    const map = [{ glob: RUNS, tests: ["test/a.test.ts"] }];
    const decision = decideRaw({ event: "pull_request", base: SHA, paths: [".stamity/runs/x/record.md", "website/x.md"], map });
    expect(decision).toMatchObject({ full: true, lanes: [], suites: [], siteBuild: true });
    expect(decision.reason).toContain("website/x.md");
  });

  it("reads full when a matching entry says all, naming the entry", () => {
    const map = [
      { glob: RUNS, tests: ["test/a.test.ts"] },
      { glob: DOCS, tests: "all" as const },
    ];
    const decision = decideRaw({ event: "push", base: SHA, paths: [".stamity/runs/x/record.md", "docs/plans/1.md"], map });
    expect(decision).toMatchObject({ full: true, lanes: [], suites: [] });
    expect(decision.reason).toContain(DOCS);
    // An "all" entry no changed path matches selects nothing.
    expect(decideRaw({ event: "push", base: SHA, paths: [".stamity/runs/x/record.md"], map })).toMatchObject({
      full: false,
      suites: ["test/a.test.ts"],
    });
  });

  it("reads full when a selected name could reach the runner as an option or a pattern", () => {
    // `parseClassFile` refuses these at the base; the pure half refuses them again, since the
    // workflow passes the list to `npx vitest run` unquoted.
    for (const name of ["--reporter=json", "test/a b.test.ts", "test/x/*.test.ts", "../outside.test.ts"]) {
      const map = [{ glob: RUNS, tests: ["test/a.test.ts", name] }];
      const decision = decideRaw({ event: "push", base: SHA, paths: [".stamity/runs/x/record.md"], map });
      expect(decision, name).toMatchObject({ full: true, lanes: [], suites: [] });
      expect(decision.reason, name).toContain(JSON.stringify(name));
    }
  });
});

/**
 * The classifier's import closure: the script and every module it reaches through relative
 * imports, as repository paths. A bare specifier other than a `node:` built-in fails the walk,
 * since the `changes` job installs nothing.
 */
function importClosure(entry: string): string[] {
  const SPECIFIER = /\b(?:from|import)\s*\(?\s*(["'])([^"']+)\1/g;
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    for (const match of readFileSync(join(REPO_ROOT, file), "utf8").matchAll(SPECIFIER)) {
      const specifier = match[2] ?? "";
      if (specifier.startsWith("node:")) continue;
      expect(specifier, `${file} imports a package the changes job has not installed`).toMatch(/^\.{1,2}\//);
      const target = posix.normalize(posix.join(posix.dirname(file), specifier));
      expect(existsSync(join(REPO_ROOT, target)), `${file} imports ${target}`).toBe(true);
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen].toSorted();
}

const SCRIPT_PATH = "scripts/ci/records-only.mjs";

// ADDED by run 2026-10-08_product-core, unit p2c-ci-lanes-from-map (the sign-off on review/8): the
// classifier runs from the pull request's head, so a change to it or to a module it imports
// decides its own routing. No lane may hold those paths, and a diff touching one is full CI.
describe("the lanes' own decision code", () => {
  const closure = importClosure(SCRIPT_PATH);
  // The cell names both modules; the walk adds what they import, so a new import joins the check.
  const decisionCode = [...new Set([...closure, "src/change/classify.ts", "src/change/testInputs.ts"])].toSorted();

  it("walks the script into the change classifier", () => {
    expect(closure).toContain(SCRIPT_PATH);
    expect(closure).toContain("src/change/classify.ts");
    expect(closure.length).toBeGreaterThan(2);
  });

  it("gives a diff touching any of it full CI, alone or beside records, and no lane pattern holds it", () => {
    for (const path of decisionCode) {
      expect(laneOfTyped(path), path).toBeNull();
      // Read as the classifier reads a pattern: `/**` holds every path beneath its folder, any
      // other pattern one exact path.
      for (const pattern of Object.values(lanePaths).flat()) {
        const holds = pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : path === pattern;
        expect(holds, `${pattern} holds ${path}`).toBe(false);
      }
      for (const paths of [[path], [".stamity/runs/x/record.md", path], [path, INBOX, "docs/plans/1.md"]]) {
        const decision = decideTyped({ event: "pull_request", base: SHA, paths });
        expect(decision, paths.join(" ")).toMatchObject({ full: true, lanes: [], suites: [] });
        expect(decision.reason, paths.join(" ")).toContain(path);
      }
    }
  });
});

const scratches: string[] = [];
afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A throwaway repository with one base commit holding a code file, a record and the census map.
 * TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map):
 * the base commit now carries the class file, since the script reads its lanes' suites from the
 * base's map and answers full CI with none; every case below keeps the answer it had.
 */
function repository(
  classFile: string | null = CENSUS_TEXT,
): { root: string; commit: (message: string) => string; write: (path: string, body: string) => void } {
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
  write(INBOX, "# inbox\n");
  if (classFile !== null) write(CLASS_FILE, classFile);
  commit("base");
  return { root, commit, write };
}

function run(root: string, args: readonly string[], env: Record<string, string> = {}, script = SCRIPT) {
  const inherited = { ...process.env };
  delete inherited.GITHUB_OUTPUT;
  delete inherited.GITHUB_EVENT_NAME;
  return spawnSync(process.execPath, [script, ...args], {
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
    repo.write(INBOX, "# inbox, one row more\n");
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
    // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map):
    // the suites line was `RECORDS_SUITES`; it is the base map's selection for the plan, which the
    // pure half computes from the same census map the scratch base commits.
    const suites = decideTyped({ event: "push", base: SHA, paths: ["docs/plans/001-x.md"] }).suites;
    expect(suites).toEqual(expect.arrayContaining([...RECORDS_FLOOR]));
    expect(readFileSync(output, "utf8")).toBe(
      [
        "earlier=1",
        "full=false",
        'lanes=["records"]',
        `suites=${suites.join(" ")}`,
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
      // TEST CHANGE, justified (2026-10-09, run 2026-10-08_product-core, unit p2c-ci-lanes-from-map):
      // the suites were `LANE_SUITES.website`; they are the base map's selection for the lockfile.
      suites: mapSelection(["website/package-lock.json"]).join(" "),
      site_build: "true",
      cli_check: "false",
      records_only: "false",
    });
  });

  // ADDED by run 2026-10-08_maintainer-tooling, unit a2-ci-lanes (review/32): a real diff mixing a
  // site page with code takes the full matrix AND reports the site build, which the full side's
  // LTS leg runs inside the required result.
  it("reports the site build on a full answer for a diff mixing a site page with code", () => {
    const repo = repository();
    const base = repo.commit("noop");
    repo.write("website/src/pages/index.tsx", "export default function Home() { return null; }\n");
    repo.write("src/cli.ts", "export const changed = 1;\n");
    repo.commit("site and code");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "pull_request" });
    expect(result.status, result.stderr).toBe(0);
    expect(outputsOf(result.stdout)).toEqual({
      full: "true",
      lanes: "[]",
      suites: "",
      site_build: "true",
      cli_check: "false",
      records_only: "false",
    });
  });

  it("reports the site build when git cannot diff against the base", () => {
    const repo = repository();
    repo.write("src/cli.ts", "export const changed = 1;\n");
    repo.commit("code");
    const result = run(repo.root, ["--base", "b".repeat(40)], { GITHUB_EVENT_NAME: "push" });
    expect(result.status, result.stderr).toBe(0);
    expect(outputsOf(result.stdout)).toMatchObject({ full: "true", site_build: "true" });
  });

  it("refuses an argument it does not know, rather than guessing", () => {
    const repo = repository();
    const result = run(repo.root, ["--bsae", "HEAD"], { GITHUB_EVENT_NAME: "push" });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  });

  // ADDED by run 2026-10-08_product-core, unit p2c-ci-lanes-from-map: the map is read from the base
  // commit only. A change to the class file is in no lane, so a head that edits it runs full CI;
  // the checked-out copy, which is the head's in CI, is never read.
  it("reads the base commit's map, not the checked-out copy, when the head's drops a suite", () => {
    const classFile = (tests: readonly string[]) => JSON.stringify({ testInputs: [{ glob: under(".stamity/runs"), tests }] });
    const repo = repository(classFile(["test/records", "test/ci/leakGate.test.ts"]));
    const base = repo.commit("noop");
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.commit("a record");
    // The work tree's copy drops the leak gate, as a head commit would; git's diff never sees it.
    repo.write(CLASS_FILE, classFile(["test/records"]));
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "pull_request" });
    expect(result.status, result.stderr).toBe(0);
    expect(outputsOf(result.stdout)).toMatchObject({ full: "false", lanes: '["records"]', suites: "test/ci/leakGate.test.ts test/records" });
  });

  it("runs full CI when the base commit has no class file, or one the parser refuses", () => {
    const refused = JSON.stringify({ testInputs: [{ glob: under(".stamity/runs"), tests: ["--reporter=json"] }] });
    for (const classFile of [null, refused, "{ not json"]) {
      const repo = repository(classFile);
      const base = repo.commit("noop");
      repo.write(".stamity/runs/x/record.md", "# new record\n");
      repo.commit("a record");
      const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "push" });
      expect(result.status, result.stderr).toBe(0);
      expect(outputsOf(result.stdout), String(classFile)).toMatchObject({ full: "true", lanes: "[]", suites: "", records_only: "false" });
      expect(result.stderr, String(classFile)).toMatch(/map/);
    }
  });

  // ADDED by run 2026-10-08_product-core, unit p2c-ci-lanes-from-map (plan/26): the `changes` job
  // runs the script on Node 24 with no install, so every module it imports must load by type
  // stripping alone. A module using syntax stripping cannot erase (an enum, a parameter property)
  // fails here rather than in CI.
  it("runs from a copy of its import closure with plain node and no node_modules", () => {
    // The real path: the script's main-module check compares its argv path with its own URL,
    // which Node resolves through a symlinked temp folder (macOS's /var), so the copy would not run.
    const copy = realpathSync(mkdtempSync(join(tmpdir(), "stamity-records-only-closure-")));
    scratches.push(copy);
    for (const file of importClosure(SCRIPT_PATH)) {
      mkdirSync(dirname(join(copy, file)), { recursive: true });
      copyFileSync(join(REPO_ROOT, file), join(copy, file));
    }
    expect(existsSync(join(copy, "node_modules"))).toBe(false);
    expect(existsSync(join(copy, "package.json"))).toBe(false);
    const repo = repository();
    const base = repo.commit("noop");
    repo.write(".stamity/runs/x/record.md", "# new record\n");
    repo.commit("a record");
    const result = run(repo.root, ["--base", base], { GITHUB_EVENT_NAME: "pull_request" }, join(copy, SCRIPT_PATH));
    expect(result.status, result.stderr).toBe(0);
    expect(outputsOf(result.stdout)).toMatchObject({
      full: "false",
      lanes: '["records"]',
      suites: mapSelection([".stamity/runs/x/record.md"]).join(" "),
    });
  });
});
