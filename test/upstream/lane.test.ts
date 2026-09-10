import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BRANCH_PREFIX,
  CONFIG_DEFAULTS,
  OUTCOMES,
  RECORD_DIRECTORY,
  buildRecord,
  classifyConflicts,
  compareReleases,
  deriveShadowPairs,
  exitCodeFor,
  extractReleaseNotes,
  findConflictMarkers,
  gatesVerdict,
  globToRegExp,
  hasConflictMarkers,
  matchesAnyGlob,
  parseArguments,
  parseConfig,
  parseMergeOutput,
  parsePorcelainStatus,
  parseReleaseTag,
  renderReport,
  selectReleases,
  // @ts-expect-error — the lane is a plain .mjs script with no type declarations, and it stays
  // that way on purpose: it has to run in a tree that is mid-merge, where `src/` may not compile
  // and `dist/` may be stale, so it imports nothing typed and nothing imports types from it.
} from "../../scripts/upstream.mjs";
import {
  ALPHA_FORK,
  ALPHA_V1,
  ALPHA_V1_1,
  BETA_V1_1,
  DELTA_V1_1,
  OFF_PATTERN_TAG,
  PRERELEASE_TAG,
  RELEASE_NOTES_V1_1,
  RELEASE_TAGS,
  SLOW_GATE_SOURCE,
  branchHead,
  commitAll,
  createFork,
  createUnrelatedFork,
  createUpstream,
  fileAt,
  git,
  gitAvailable,
  isAncestor,
  isolatedEnv,
  linkedWorktrees,
  makeScratch,
  parentsOf,
  readTreeFile,
  recordAt,
  renderGenerated,
  runLane,
  snapshotRepo,
  spawnLane,
  treeFileExists,
  updateBranches,
  waitFor,
  waitForExit,
  writeFiles,
  type LaneDocument,
  type LaneResult,
  type UpstreamFixture,
} from "./fixtures.ts";

/**
 * The enterprise upstream lane (`scripts/upstream.mjs`), proven two ways.
 *
 * The pure helpers the script exports — configuration, release ordering, globs, conflict
 * classification, marker detection, release notes, the record — are asserted directly, so a
 * regression in one of them fails with its own name rather than as a lifecycle outcome.
 *
 * The lifecycle is one `it` per acceptance criterion of `docs/specs/enterprise-upstream-lane.md`
 * (sixteen), plus the requirement-level cases the criteria do not reach on their own (abort,
 * a stale branch and `--recreate`, a failed regeneration, a leftover marker, `--no-gates`, the
 * exit-2 refusals). Every case spawns the real script with `--json` over temporary repositories
 * (`./fixtures.ts`) and asserts on the document, the refs, the worktree bytes and the records.
 * Machines without git skip the lifecycle: `gitAvailable()` turns the fixture's
 * `GitUnavailableError` into a skip.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Wall-clock budgets for the lifecycle cases, derived rather than inherited from the suite's
 * 20s default (`vitest.config.ts`), the way `test/ci/leakGate.test.ts` derives its own.
 *
 *   one lane run      0.2-0.4s  — node start plus 20-40 git spawns and a local fetch
 *   one fork          0.2s      — a clone of the upstream, a checkout, one commit
 *   a single case     0.2-1.9s  — one or two forks and two to six lane runs, measured with
 *                                 `--reporter=verbose` on 2026-09-10 (the gate case is the 1.9s)
 *   a chained case    up to 2.7s — abort, stale and --recreate over two forks and nine runs;
 *                                 the interruption case adds waits of its own: up to 20s for the
 *                                 gate's sentinel and up to 3s for the killed gate to exit
 *   CI ratio          2x        — the runner class is about half this machine's speed
 *   margin            4x        — a shared runner with a cold cache, not a second budget
 *   = 1.9 x 2 x 4 ≈ 15s → 30s for a case (the leak gate's own budget, a known-good unit);
 *     2.7 x 2 x 4 ≈ 22s, plus the interruption case's 23s of bounded waits → 60s for a chain
 */
const CASE_TIMEOUT_MS = 30_000;
const CHAINED_TIMEOUT_MS = 60_000;

const GIT = gitAvailable();

function expectOutcome(result: LaneResult, outcome: string): void {
  const doc: LaneDocument = result.doc;
  expect(
    doc.outcome,
    `expected ${outcome}, got ${result.doc.outcome}\nmessages:\n${result.doc.messages.join("\n")}\nstderr:\n${result.stderr}`,
  ).toBe(outcome);
  expect(result.code, `exit status for ${outcome}`).toBe(OUTCOMES[outcome]);
  expect(result.doc.exitCode).toBe(result.code);
}

// ---------------------------------------------------------------------------------------------

describe("configuration (REQ-UPSTREAM-001)", () => {
  it("applies every default when only upstream and version are given", () => {
    const config = parseConfig('{"version": 1, "upstream": "https://example.invalid/up.git"}', "x.json");
    expect(config).toEqual({
      path: "x.json",
      version: 1,
      upstream: "https://example.invalid/up.git",
      remote: "upstream",
      branch: "main",
      releases: { pattern: "v*", prerelease: false },
      gates: [],
      regenerate: [],
      generatedPaths: [],
      watch: [],
      shadows: {},
    });
    expect(CONFIG_DEFAULTS.releases).toEqual({ pattern: "v*", prerelease: false });
  });

  it("keeps every explicit value", () => {
    const config = parseConfig(
      JSON.stringify({
        version: 1,
        upstream: "u",
        remote: "canonical",
        branch: "integration",
        releases: { pattern: "release-*", prerelease: true },
        gates: [{ name: "check", run: "npm run check" }],
        regenerate: ["node scripts/gen.mjs"],
        generatedPaths: [".apm/**"],
        watch: ["src/types/core.ts"],
        shadows: { "packs/a/rules/x.md": "content/rules/x.md" },
      }),
    );
    expect(config.remote).toBe("canonical");
    expect(config.branch).toBe("integration");
    expect(config.releases).toEqual({ pattern: "release-*", prerelease: true });
    expect(config.gates).toEqual([{ name: "check", run: "npm run check" }]);
    expect(config.shadows).toEqual({ "packs/a/rules/x.md": "content/rules/x.md" });
  });

  it.each([
    ["not JSON", "{", /not valid JSON/],
    ["a non-object", "[1]", /must be a JSON object/],
    ["an unknown key", '{"version":1,"upstream":"u","gate":[]}', /unknown key\(s\) "gate"/],
    ["a version other than 1", '{"version":2,"upstream":"u"}', /"version" must be the number 1/],
    ["a missing version", '{"upstream":"u"}', /found no version/],
    ["a missing upstream", '{"version":1}', /"upstream" must be a non-empty string/],
    ["a remote with a slash", '{"version":1,"upstream":"u","remote":"a/b"}', /plain remote name/],
    ["an unknown releases key", '{"version":1,"upstream":"u","releases":{"tag":"v*"}}', /unknown key\(s\) "tag" in "releases"/],
    ["a gate missing its command", '{"version":1,"upstream":"u","gates":[{"name":"x"}]}', /gates\[0\]\.run/],
    ["a gate with an extra key", '{"version":1,"upstream":"u","gates":[{"name":"x","run":"y","cwd":"z"}]}', /unknown key\(s\) "cwd" in "gates\[0\]"/],
    ["a non-string regenerate entry", '{"version":1,"upstream":"u","regenerate":[1]}', /"regenerate" must be an array of non-empty strings/],
    ["a shadow with an empty target", '{"version":1,"upstream":"u","shadows":{"a":""}}', /"shadows" entry "a"/],
  ])("rejects %s as a config error (exit 2)", (_label, text, message) => {
    let caught: unknown;
    try {
      parseConfig(text, "cfg.json");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(message);
    expect((caught as Error).message.startsWith("cfg.json: ")).toBe(true);
    expect((caught as { exitCode?: number }).exitCode).toBe(2);
    expect((caught as { outcome?: string }).outcome).toBe("error");
  });
});

describe("release selection", () => {
  it("parses the version out of the pattern's wildcard span", () => {
    expect(parseReleaseTag("v1.2.3")).toMatchObject({ major: 1, minor: 2, patch: 3, prerelease: null, version: "1.2.3" });
    expect(parseReleaseTag("release-1.2.3", "release-*")).toMatchObject({ version: "1.2.3" });
    expect(parseReleaseTag("1.2.3", "*")).toMatchObject({ version: "1.2.3" });
    expect(parseReleaseTag("v1.2.3-rc.1")).toMatchObject({ prerelease: ["rc", "1"], version: "1.2.3-rc.1" });
    expect(parseReleaseTag("v1.2.3+build.7")).toMatchObject({ version: "1.2.3", prerelease: null });
    expect(parseReleaseTag("nightly-2026", "v*")).toBeNull();
    expect(parseReleaseTag("v1.2", "v*")).toBeNull();
    expect(parseReleaseTag("v01.2.3", "v*")).toBeNull();
    expect(parseReleaseTag("release-1.2.3", "v*")).toBeNull();
  });

  it("orders by semantic version, not by string, and ranks prereleases below their release", () => {
    const tags = ["v1.10.0", "v1.9.0", "v1.9.1", "v2.0.0-rc.2", "v2.0.0-rc.10", "v2.0.0-beta", "v2.0.0", "v0.1.0", "nightly"];
    expect(selectReleases(tags).map((release: { tag: string }) => release.tag)).toEqual(["v0.1.0", "v1.9.0", "v1.9.1", "v1.10.0", "v2.0.0"]);
    expect(selectReleases(tags, { prerelease: true }).map((release: { tag: string }) => release.tag)).toEqual([
      "v0.1.0",
      "v1.9.0",
      "v1.9.1",
      "v1.10.0",
      "v2.0.0-beta",
      "v2.0.0-rc.2",
      "v2.0.0-rc.10",
      "v2.0.0",
    ]);
    expect(compareReleases(parseReleaseTag("v1.0.0-alpha"), parseReleaseTag("v1.0.0-alpha.1"))).toBeLessThan(0);
    expect(compareReleases(parseReleaseTag("v1.0.0-alpha.beta"), parseReleaseTag("v1.0.0-beta"))).toBeLessThan(0);
    expect(compareReleases(parseReleaseTag("v1.0.0"), parseReleaseTag("v1.0.0"))).toBe(0);
  });
});

describe("gitignore-style globs", () => {
  it.each([
    [".apm/**", ".apm/instructions/x.md", true],
    [".apm/**", ".apm", false],
    [".apm/**", "docs/.apm/x", false],
    ["AGENTS.md", "AGENTS.md", true],
    ["AGENTS.md", "packs/x/AGENTS.md", true],
    ["/AGENTS.md", "packs/x/AGENTS.md", false],
    ["docs/reference/**", "docs/reference/a/b.md", true],
    ["docs/reference/**", "docs/referenced.md", false],
    ["src/pack/catalogPins.ts", "src/pack/catalogPins.ts", true],
    ["*.md", "a/b/c.md", true],
    ["*.md", "a/b/c.mdx", false],
    ["content/charter/**", "content/charter/stamity.md", true],
    ["content/charter/**", "content/rules/x.md", false],
    ["generated/", "generated/alpha.txt", true],
    ["generated/", "generated", false],
    ["**/SKILL.md", "content/skills/x/SKILL.md", true],
    ["**/SKILL.md", "SKILL.md", true],
    ["docs/?.md", "docs/a.md", true],
    ["docs/?.md", "docs/ab.md", false],
    ["docs/**/x.md", "docs/x.md", true],
    ["docs/**/x.md", "docs/a/b/x.md", true],
    [".claude", ".claude/rules/x.md", true],
    ["a.b", "a.b", true],
    ["a.b", "axb", false],
  ])("%s against %s → %s", (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
    expect(matchesAnyGlob(path, [glob])).toBe(expected);
  });

  it("matches nothing against an empty list", () => {
    expect(matchesAnyGlob("anything", [])).toBe(false);
  });
});

describe("conflict classification", () => {
  const porcelain = [
    "1 M. N... 100644 100644 100644 aaaa bbbb README.md",
    "2 R. N... 100644 100644 100644 cccc cccc R100 content/gamma.md",
    "content/beta.md",
    "u UU N... 100644 100644 100644 100644 1111 2222 3333 content/rules/alpha.md",
    "u UD N... 100644 100644 000000 100644 1111 2222 0000 content/rules/delta.md",
    "u DU N... 100644 000000 100644 100644 1111 0000 3333 content/rules/epsilon.md",
    "u AA N... 000000 100644 100644 100644 0000 2222 3333 packs/new.md",
    "u UU N... 100644 100644 100644 100644 1111 2222 3333 generated/alpha.txt",
    "? notes with spaces.txt",
    "! ignored.log",
  ].join("\0");

  it("parses porcelain v2 -z records, renames included", () => {
    const entries = parsePorcelainStatus(porcelain);
    expect(entries.map((entry: { kind: string }) => entry.kind)).toEqual([
      "changed",
      "renamed",
      "unmerged",
      "unmerged",
      "unmerged",
      "unmerged",
      "unmerged",
      "untracked",
      "ignored",
    ]);
    expect(entries[1]).toEqual({ kind: "renamed", xy: "R.", path: "content/gamma.md", from: "content/beta.md" });
    expect(entries[7]).toEqual({ kind: "untracked", xy: "??", path: "notes with spaces.txt" });
  });

  it("classifies by XY code, names the deleting side, and flags generated paths", () => {
    const conflicts = classifyConflicts(porcelain, "", ["generated/**"]);
    expect(conflicts).toEqual([
      { path: "content/rules/alpha.md", kind: "content", generated: false },
      { path: "content/rules/delta.md", kind: "modify/delete", generated: false, deletedBy: "upstream" },
      { path: "content/rules/epsilon.md", kind: "modify/delete", generated: false, deletedBy: "fork" },
      { path: "generated/alpha.txt", kind: "content", generated: true },
      { path: "packs/new.md", kind: "add/add", generated: false },
    ]);
  });

  it("takes rename/delete and its two paths from the merge's own CONFLICT line", () => {
    const output = [
      "CONFLICT (rename/delete): content/beta.md renamed to content/gamma.md in 0123abc, but deleted in HEAD.",
      "CONFLICT (modify/delete): content/rules/delta.md deleted in 0123abc and modified in HEAD.  Version HEAD of content/rules/delta.md left in tree.",
      "CONFLICT (content): Merge conflict in content/rules/alpha.md",
      "Automatic merge failed; fix conflicts and then commit the result.",
    ].join("\n");
    const kinds = parseMergeOutput(output);
    expect(kinds.get("content/gamma.md")).toMatchObject({ kind: "rename/delete", renamedFrom: "content/beta.md", renamedTo: "content/gamma.md", deletedBy: "fork" });
    expect(kinds.get("content/rules/delta.md")).toMatchObject({ kind: "modify/delete", deletedBy: "upstream" });
    expect(kinds.get("content/rules/alpha.md")).toMatchObject({ kind: "content" });

    const status = "u DU N... 100644 000000 100644 100644 1111 0000 3333 content/gamma.md";
    expect(classifyConflicts(status, output, [])).toEqual([
      {
        path: "content/gamma.md",
        kind: "rename/delete",
        generated: false,
        deletedBy: "fork",
        renamedFrom: "content/beta.md",
        renamedTo: "content/gamma.md",
        detail: expect.stringContaining("CONFLICT (rename/delete)"),
      },
    ]);
  });
});

describe("conflict markers (invariant 3)", () => {
  it("finds the three markers git writes, and the diff3 base marker", () => {
    const text = "a\n<<<<<<< HEAD\nours\n||||||| base\nbase\n=======\ntheirs\n>>>>>>> 0123abc\nz\n";
    expect(findConflictMarkers(text).map((marker: { line: number }) => marker.line)).toEqual([2, 4, 6, 8]);
    expect(hasConflictMarkers(text)).toBe(true);
    expect(hasConflictMarkers("<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> theirs")).toBe(true);
  });

  it("does not mistake a setext underline or a longer rule for a marker", () => {
    expect(hasConflictMarkers("Heading\n=======\n\nbody\n")).toBe(false);
    expect(hasConflictMarkers("Heading\n========\n")).toBe(false);
    expect(hasConflictMarkers("<<<<<<<< not seven\n")).toBe(false);
    expect(hasConflictMarkers("code: a <<<<<<< b\n")).toBe(false);
    expect(hasConflictMarkers("")).toBe(false);
  });

  it("counts a bare ======= once a boundary marker sits in the same file", () => {
    expect(findConflictMarkers("Heading\n=======\n<<<<<<< HEAD\n").map((marker: { marker: string }) => marker.marker)).toEqual(["=======", "<<<<<<<"]);
  });
});

describe("release notes (the release.yml extraction rule)", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "## [1.0.10] - 2026-03-01",
    "",
    "- ten",
    "",
    "## [1.0.1] - 2026-02-01",
    "",
    "- one, see [note].",
    "",
    "[note]: https://example.invalid/note",
    "",
    "- two",
    "",
    "[1.0.1]: https://example.invalid/1.0.1",
    "[1.0.10]: https://example.invalid/1.0.10",
    "",
    "## [1.0.0] - 2026-01-01",
    "",
    "- zero",
    "",
    "[1.0.0]: https://example.invalid/1.0.0",
  ].join("\n");

  it("returns exactly the section, keeps a mid-body link definition, drops the footer", () => {
    expect(extractReleaseNotes(changelog, "1.0.1")).toBe("- one, see [note].\n\n[note]: https://example.invalid/note\n\n- two");
  });

  it("never lets [1.0.1] match [1.0.10], and stops at the next heading", () => {
    expect(extractReleaseNotes(changelog, "1.0.10")).toBe("- ten");
    expect(extractReleaseNotes(changelog, "1.0.0")).toBe("- zero");
  });

  it("is null for a missing section and for a whitespace-only one", () => {
    expect(extractReleaseNotes(changelog, "9.9.9")).toBeNull();
    expect(extractReleaseNotes("## [1.0.0]\n\n   \n\n## [0.9.0]\n\n- x\n", "1.0.0")).toBeNull();
    expect(extractReleaseNotes("## [1.0.0]\n\n[a]: b\n", "1.0.0")).toBeNull();
  });
});

describe("the record, the shadows, the report, the exit contract", () => {
  it("derives the automatic shadow pairs from an overrides tree", () => {
    expect(
      deriveShadowPairs([
        ".stamity/overrides/rules/stamity-secrets.md",
        ".stamity/overrides/rules/stamity-secrets.customize.yaml",
        ".stamity/overrides/agents/stamity-reviewer.customize.md",
        ".stamity/overrides/skills/st-ask/SKILL.md",
        ".stamity/overrides/skills/st-ask/references/x.md",
        ".stamity/overrides/README.txt",
        "content/rules/other.md",
      ]),
    ).toEqual({
      ".stamity/overrides/rules/stamity-secrets.md": "content/rules/stamity-secrets.md",
      ".stamity/overrides/rules/stamity-secrets.customize.yaml": "content/rules/stamity-secrets.md",
      ".stamity/overrides/agents/stamity-reviewer.customize.md": "content/agents/stamity-reviewer.md",
      ".stamity/overrides/skills/st-ask/SKILL.md": "content/skills/st-ask/SKILL.md",
    });
  });

  it("shapes the record with the fields REQ-UPSTREAM-010 lists, and derives the gate verdict", () => {
    const record = buildRecord({
      release: "v1.1.0",
      releaseCommit: "a".repeat(40),
      mergeBase: "b".repeat(40),
      targetBranch: "main",
      targetHead: "c".repeat(40),
      covers: ["v1.1.0"],
      gates: "passed",
      gateResults: [{ name: "check", run: "npm run check", status: "passed", exitCode: 0, durationMs: 12, outputTail: "dropped" }],
      regenerate: [{ run: "node gen.mjs", status: "passed", exitCode: 0, durationMs: 3, outputTail: "dropped" }],
      conflicts: [{ path: "x", kind: "content", generated: false, resolvedBy: "human" }],
      affected: { overlaps: [], watched: [], shadowed: [], renamed: [] },
      createdAt: "2026-09-10T00:00:00.000Z",
    });
    expect(Object.keys(record)).toEqual([
      "tool",
      "version",
      "release",
      "releaseCommit",
      "mergeBase",
      "targetBranch",
      "targetHead",
      "covers",
      "gates",
      "gateResults",
      "regenerate",
      "conflicts",
      "affected",
      "createdAt",
    ]);
    expect(record.tool).toBe("stamity-upstream-lane");
    expect(record.gateResults[0]).toEqual({ name: "check", run: "npm run check", status: "passed", exitCode: 0, durationMs: 12 });
    expect(record.regenerate[0]).toEqual({ run: "node gen.mjs", status: "passed", exitCode: 0, durationMs: 3 });
    expect(RECORD_DIRECTORY).toBe(".stamity/upstream/integrations");

    expect(gatesVerdict([])).toBe("none");
    expect(gatesVerdict([{ status: "passed" }])).toBe("passed");
    expect(gatesVerdict([{ status: "passed" }, { status: "failed" }])).toBe("failed");
    expect(gatesVerdict([{ status: "skipped" }], { skipped: true })).toBe("skipped");
  });

  it("maps every outcome to the 0/1/2 contract", () => {
    expect(OUTCOMES).toEqual({
      "up-to-date": 0,
      "update-available": 0,
      integrated: 0,
      aborted: 0,
      help: 0,
      "validation-failed": 1,
      conflict: 1,
      "conflict-pending": 1,
      "update-branch-stale": 1,
      "regenerate-failed": 1,
      "ancestry-missing": 1,
      "ancestry-lost": 1,
      "not-a-fork": 2,
      error: 2,
    });
    expect(exitCodeFor("conflict")).toBe(1);
    expect(() => exitCodeFor("nope")).toThrow(/unknown outcome/);
    expect(BRANCH_PREFIX).toBe("stamity-upstream/");
  });

  it("parses the verb and every flag, and refuses what it does not know", () => {
    expect(parseArguments(["integrate", "--json", "--release", "v1.2.0", "--no-gates", "--recreate", "--config=x.json"])).toEqual({
      verb: "integrate",
      options: { json: true, prerelease: false, offline: false, noGates: true, recreate: true, release: "v1.2.0", config: "x.json" },
    });
    expect(() => parseArguments([])).toThrow(/a verb is required/);
    expect(() => parseArguments(["fly"])).toThrow(/unknown verb "fly"/);
    expect(() => parseArguments(["status", "--fast"])).toThrow(/unknown option --fast/);
    expect(() => parseArguments(["status", "--release"])).toThrow(/--release needs a value/);
    expect(() => parseArguments(["status", "extra"])).toThrow(/unexpected argument "extra"/);
  });

  it("renders the spec's drift rows and the conflict guidance in the report", () => {
    const report = renderReport({
      verb: "status",
      outcome: "update-available",
      config: { upstream: "u", remote: "upstream", branch: "main", path: "cfg" },
      integrated: { tag: "v1.0.0", commit: "1".repeat(40), record: null },
      unverified: [],
      target: { tag: "v1.1.0", commit: "2".repeat(40), date: "2026-02-01", isPrerelease: false },
      candidates: [{ tag: "v1.1.0" }],
      skipped: [],
      divergence: { aheadOfRelease: 1, behindRelease: 2, upstreamAheadOfRelease: null },
      lostRecords: [],
      affected: {
        overlaps: [{ path: "README.md", upstreamLines: { added: 1, removed: 1 } }],
        watched: [{ path: "content/charter/x.md", upstreamChange: "modified", upstreamLines: { added: 3, removed: 0 } }],
        shadowed: [
          { forkPath: "packs/a/x.md", upstreamPath: "content/rules/x.md", release: "v1.1.0", change: "modified", upstreamLines: { added: 2, removed: 1 } },
          { forkPath: "packs/a/y.md", upstreamPath: "content/rules/y.md", release: "v1.1.0", change: "renamed", renamedTo: "content/rules/z.md", upstreamLines: { added: 0, removed: 0 } },
        ],
        renamed: [{ from: "a.md", to: "b.md", forkChanged: true }],
      },
      conflicts: [
        { path: "content/rules/alpha.md", kind: "content", generated: false },
        { path: "generated/alpha.txt", kind: "content", generated: true },
        { path: "content/rules/delta.md", kind: "modify/delete", generated: false, deletedBy: "upstream" },
      ],
      gates: [{ name: "check", run: "npm test", status: "failed", exitCode: 1, durationMs: 40, outputTail: "1 failed" }],
      regenerate: [],
      branch: "stamity-upstream/v1.1.0",
      worktree: "/w",
      mergeCommit: null,
      record: null,
      releaseNotes: "- notes",
      diffStat: null,
      messages: ["no gates configured — a clean merge proves nothing about behaviour"],
    });
    expect(report).toContain("`README.md` — changed on both sides (+1/−1 lines upstream): merged cleanly on both sides' edits; semantic review needed");
    expect(report).toContain("the default behind `packs/a/x.md` changed in v1.1.0 (+2/−1 lines); the override still applies and hides the change — review it");
    expect(report).toContain("`packs/a/y.md` is orphaned: its upstream default `content/rules/y.md` was renamed in v1.1.0 (renamed to `content/rules/z.md`)");
    expect(report).toContain("`content/charter/x.md` — watched path modified in v1.1.0 (+3/−0 lines)");
    expect(report).toContain("`generated/alpha.txt` — content; generated: regenerated on `continue`, no hand edit needed");
    expect(report).toContain("`content/rules/delta.md` — modify/delete; deleted by upstream");
    expect(report).toContain("| check | `npm test` | failed | 1 | 40 ms |");
    expect(report).toContain("1 failed");
    expect(report).toContain("no gates configured");
    expect(report).toContain("## Release notes for v1.1.0");
    expect(report.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

describe.skipIf(!GIT)("the lifecycle over temporary repositories", () => {
  let scratch: { dir: string; cleanup: () => void };
  let upstream: UpstreamFixture;
  let forks = 0;

  /** A fresh parent directory for one fork, so every case owns its own tree and its own HOME. */
  const forkDir = (): string => {
    forks += 1;
    const dir = join(scratch.dir, `f${forks}`);
    mkdirSync(dir);
    return dir;
  };

  beforeAll(() => {
    scratch = makeScratch("lane");
    upstream = createUpstream(scratch.dir);
  }, CASE_TIMEOUT_MS);

  afterAll(() => {
    scratch.cleanup();
  });

  it("builds the upstream the criteria describe: four releases, a prerelease, a generator that derives", () => {
    expect(Object.keys(upstream.tags)).toEqual([...RELEASE_TAGS, PRERELEASE_TAG, OFF_PATTERN_TAG]);
    expect(fileAt(upstream, upstream.tags["v1.0.0"]!, "content/rules/alpha.md")).toBe(ALPHA_V1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "content/rules/alpha.md")).toBe(ALPHA_V1_1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "content/rules/delta.md")).toBe(DELTA_V1_1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "generated/alpha.txt")).toBe(renderGenerated("alpha", ALPHA_V1_1));
    expect(fileAt(upstream, upstream.tags["v1.3.0"]!, "content/rules/gamma.md")).toBe(BETA_V1_1);
    expect(fileAt(upstream, upstream.tags["v1.3.0"]!, "content/rules/beta.md")).toBeNull();
    expect(fileAt(upstream, upstream.tags["v1.3.0"]!, "content/rules/delta.md")).toBeNull();
    // v1.2.0 changed the rule, not the default: the file the fork edits stays untouched upstream.
    expect(fileAt(upstream, upstream.tags["v1.2.0"]!, "config.json")).toBe("{}\n");
    expect(fileAt(upstream, upstream.tags["v1.2.0"]!, "scripts/resolve-tier.mjs")).toContain("overrides");
  });

  // Criterion 1
  it(
    "integrates v1.1.0 into a fork with no customizations: parents, record, gates none, status up-to-date",
    () => {
      const fork = createFork(upstream, forkDir());
      // The fork's own tag under a release name — REQ-UPSTREAM-002 says the lane leaves it alone.
      git(fork, ["tag", "v1.1.0", fork.head]);

      const result = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(result, "integrated");
      expect(result.doc.branch).toBe("stamity-upstream/v1.1.0");
      expect(result.doc.worktree).toBe(join(fork.dir, ".stamity", "upstream-work", "v1.1.0"));
      expect(result.doc.target).toMatchObject({ tag: "v1.1.0", commit: upstream.tags["v1.1.0"], isPrerelease: false });

      const merge = result.doc.mergeCommit;
      expect(merge).not.toBeNull();
      expect(parentsOf(fork, merge!)).toEqual([fork.head, upstream.tags["v1.1.0"]]);
      expect(branchHead(fork, "stamity-upstream/v1.1.0")).toBe(merge);
      const message = git(fork, ["log", "-1", "--format=%B", merge!]).stdout;
      expect(message).toContain("Merge upstream release v1.1.0 into main");
      expect(message).toContain(`Stamity-Upstream-Commit: ${upstream.tags["v1.1.0"]}`);
      expect(message).toContain("Stamity-Upstream-Gates: none");

      expect(result.doc.record).toBe(".stamity/upstream/integrations/v1.1.0.json");
      expect(recordAt(fork, merge!, "v1.1.0")).toMatchObject({
        release: "v1.1.0",
        releaseCommit: upstream.tags["v1.1.0"],
        // The fork's customization commit (its configuration) sits above the release commit.
        mergeBase: upstream.tags["v1.0.0"],
        targetBranch: "main",
        targetHead: fork.head,
        gates: "none",
        covers: ["v1.1.0"],
      });

      // Invariant 1: the target branch is never written. REQ-002: the fork's tag is untouched
      // and no tag was created; the release lives under the lane's own namespace.
      expect(branchHead(fork, "main")).toBe(fork.head);
      expect(git(fork, ["rev-parse", "refs/tags/v1.1.0^{commit}"]).stdout.trim()).toBe(fork.head);
      expect(git(fork, ["for-each-ref", "--format=%(refname)", "refs/tags/"]).stdout.trim()).toBe("refs/tags/v1.1.0");
      expect(git(fork, ["rev-parse", "refs/stamity-upstream/tags/v1.1.0^{commit}"]).stdout.trim()).toBe(upstream.tags["v1.1.0"]);

      const status = runLane(fork, ["status", "--branch", "stamity-upstream/v1.1.0", "--release", "v1.1.0"]);
      expectOutcome(status, "up-to-date");
      expect(status.doc.integrated).toMatchObject({ tag: "v1.1.0", commit: upstream.tags["v1.1.0"], record: { gates: "none" } });
      expect(status.doc.messages).toContain("no gates configured — a clean merge proves nothing about behaviour");
    },
    CASE_TIMEOUT_MS,
  );

  // A headless runner has no git identity, and git resolves the committer identity at `merge`
  // time, `--no-commit` notwithstanding. The lane's fallback identity therefore has to cover
  // the merge, not only the commit; the first dispatch on GitHub Actions failed at exactly this
  // point. The strict case is forced here rather than assumed: `user.useConfigOnly` stops git
  // from guessing an identity out of the OS account, which is what hides the failure on a laptop.
  it(
    "integrates on a runner with no git identity: the merge and the commit take the fallback identity, and the report says so",
    () => {
      const fork = createFork(upstream, forkDir());
      const env: Record<string, string> = { ...fork.env };
      for (const key of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"]) {
        delete env[key];
      }
      const headless = { ...fork, env };
      const result = runLane(headless, ["integrate", "--release", "v1.1.0"], {
        env: { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.useConfigOnly", GIT_CONFIG_VALUE_0: "true" },
      });
      expectOutcome(result, "integrated");
      expect(result.doc.messages.some((line) => line.startsWith("no git identity was configured"))).toBe(true);
      const merge = result.doc.mergeCommit;
      expect(merge).not.toBeNull();
      expect(parentsOf(fork, merge!)).toEqual([fork.head, upstream.tags["v1.1.0"]]);
      expect(git(fork, ["log", "-1", "--format=%ce", merge!]).stdout.trim()).toMatch(/\.invalid$/);
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 2
  it(
    "keeps independent customizations: a new file and an edit upstream never touches survive the merge",
    () => {
      const fork = createFork(upstream, forkDir(), {
        files: { "packs/acme/rules/acme-secrets.md": "# Acme secrets\n", "config.json": '{\n  "tier": "enterprise"\n}\n' },
      });
      const result = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(result, "integrated");
      expect(result.doc.conflicts).toEqual([]);
      const merge = result.doc.mergeCommit!;
      // Invariant 5: every fork commit and the release stay reachable.
      expect(isAncestor(fork, fork.head, merge)).toBe(true);
      expect(isAncestor(fork, upstream.tags["v1.1.0"]!, merge)).toBe(true);
      expect(fileAt(fork, merge, "packs/acme/rules/acme-secrets.md")).toBe("# Acme secrets\n");
      expect(fileAt(fork, merge, "config.json")).toContain("enterprise");
      expect(fileAt(fork, merge, "content/rules/beta.md")).toBe(BETA_V1_1);
      expect(fileAt(fork, merge, "content/rules/alpha.md")).toBe(ALPHA_V1_1);
      expect(fileAt(fork, merge, "generated/alpha.txt")).toBe(renderGenerated("alpha", ALPHA_V1_1));
      expect(result.doc.affected?.overlaps).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  // Criteria 3, 4 and 5 — one fork carried through the conflict, its resolution, and the next release.
  describe("overlapping edits, the human resolution, and the second release", () => {
    let fork: ReturnType<typeof createFork>;
    let conflict: LaneResult;
    let firstMerge: string;
    const RESOLVED = "# Alpha\n\nAlpha line one.\nAlpha line two, revised upstream, in the fork's wording.\nAlpha line three.\n";

    beforeAll(() => {
      fork = createFork(upstream, forkDir(), { editAlpha: true });
    }, CASE_TIMEOUT_MS);

    // Criterion 3
    it(
      "reports a content conflict, commits nothing, leaves the operator's tree byte-identical, keeps both sides in the index",
      () => {
        writeFiles(fork.dir, { "scratch.txt": "an operator's untracked note\n" });
        const before = snapshotRepo(fork);
        conflict = runLane(fork, ["integrate", "--release", "v1.1.0"]);
        expectOutcome(conflict, "conflict");
        expect(conflict.doc.conflicts).toEqual([
          { path: "content/rules/alpha.md", kind: "content", generated: false, detail: expect.stringContaining("CONFLICT (content)") },
          { path: "generated/alpha.txt", kind: "content", generated: true, detail: expect.stringContaining("CONFLICT (content)") },
        ]);
        expect(conflict.doc.report).toContain("`content/rules/alpha.md` — content");
        expect(conflict.doc.messages.join("\n")).toContain("node scripts/upstream.mjs continue");
        expect(conflict.doc.mergeCommit).toBeNull();
        expect(branchHead(fork, "stamity-upstream/v1.1.0")).toBe(fork.head);
        expect(branchHead(fork, "main")).toBe(fork.head);
        expect(snapshotRepo(fork)).toBe(before);

        const worktree = conflict.doc.worktree!;
        expect(git(fork, ["show", ":2:content/rules/alpha.md"], { cwd: worktree }).stdout).toBe(ALPHA_FORK);
        expect(git(fork, ["show", ":3:content/rules/alpha.md"], { cwd: worktree }).stdout).toBe(ALPHA_V1_1);
        expect(hasConflictMarkers(readTreeFile(worktree, "content/rules/alpha.md"))).toBe(true);
        expect(git(fork, ["config", "rerere.enabled"], { cwd: worktree }).stdout.trim()).toBe("true");
      },
      CASE_TIMEOUT_MS,
    );

    // Criterion 4
    it(
      "continue commits the human resolution, regenerates the derived file marker-free, and records who resolved what",
      () => {
        const worktree = conflict.doc.worktree!;
        writeFiles(worktree, { "content/rules/alpha.md": RESOLVED });
        git(fork, ["add", "content/rules/alpha.md"], { cwd: worktree });
        // Run from inside the update worktree, with no --release: the lane finds its own root.
        const result = runLane(fork, ["continue"], { cwd: worktree });
        expectOutcome(result, "integrated");
        firstMerge = result.doc.mergeCommit!;
        expect(parentsOf(fork, firstMerge)).toEqual([fork.head, upstream.tags["v1.1.0"]]);
        expect(fileAt(fork, firstMerge, "content/rules/alpha.md")).toBe(RESOLVED);
        const generated = fileAt(fork, firstMerge, "generated/alpha.txt");
        expect(generated).toBe(renderGenerated("alpha", RESOLVED));
        expect(hasConflictMarkers(generated!)).toBe(false);
        expect(result.doc.regenerate).toEqual([expect.objectContaining({ run: "node scripts/gen.mjs", status: "passed", exitCode: 0 })]);
        expect(recordAt(fork, firstMerge, "v1.1.0")).toMatchObject({
          gates: "none",
          conflicts: [
            { path: "content/rules/alpha.md", kind: "content", generated: false, resolvedBy: "human" },
            { path: "generated/alpha.txt", kind: "content", generated: true, resolvedBy: "regeneration" },
          ],
        });
        expect(git(fork, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: worktree, allowFailure: true }).status).not.toBe(0);
        expect(branchHead(fork, "main")).toBe(fork.head);
      },
      CASE_TIMEOUT_MS,
    );

    // Criterion 5
    it(
      "integrates the second release from the landed first one: merge base at v1.1.0, no conflict returns, records agree",
      () => {
        // Landing by fast-forward keeps the merge commit — and so the release — in main's history.
        git(fork, ["merge", "--ff-only", "--quiet", "stamity-upstream/v1.1.0"]);
        expect(branchHead(fork, "main")).toBe(firstMerge);

        const result = runLane(fork, ["integrate", "--release", "v1.2.0"]);
        expectOutcome(result, "integrated");
        expect(result.doc.conflicts).toEqual([]);
        expect(result.doc.integrated?.tag).toBe("v1.1.0");
        const merge = result.doc.mergeCommit!;
        expect(parentsOf(fork, merge)).toEqual([firstMerge, upstream.tags["v1.2.0"]]);
        expect(recordAt(fork, merge, "v1.2.0")).toMatchObject({ mergeBase: upstream.tags["v1.1.0"], targetHead: firstMerge, covers: ["v1.2.0"] });
        const changed = git(fork, ["diff", "--name-only", `${merge}^1`, merge]).stdout.trim().split("\n");
        expect(changed).toContain("scripts/resolve-tier.mjs");
        expect(changed).not.toContain("content/rules/alpha.md");
        expect(fileAt(fork, merge, "content/rules/alpha.md")).toBe(RESOLVED);

        const status = runLane(fork, ["status", "--branch", "stamity-upstream/v1.2.0", "--release", "v1.2.0"]);
        expectOutcome(status, "up-to-date");
        expect(status.doc.integratedReleases.map((release) => [release.tag, release.verified, release.record?.["release"] ?? null])).toEqual([
          ["v1.0.0", true, null],
          ["v1.1.0", true, "v1.1.0"],
          ["v1.2.0", true, "v1.2.0"],
        ]);
        expect(status.doc.integrated?.tag).toBe("v1.2.0");
      },
      CASE_TIMEOUT_MS,
    );
  });

  // Criterion 6
  it(
    "targets the newest stable release without --release, lists the skipped ones, and merges them in one commit",
    () => {
      const fork = createFork(upstream, forkDir());
      const status = runLane(fork, ["status"]);
      expectOutcome(status, "update-available");
      expect(status.doc.integrated?.tag).toBe("v1.0.0");
      expect(status.doc.target).toMatchObject({ tag: "v1.3.0", commit: upstream.tags["v1.3.0"], isPrerelease: false });
      expect(status.doc.candidates.map((release) => release.tag)).toEqual(["v1.1.0", "v1.2.0", "v1.3.0"]);
      expect(status.doc.skipped).toEqual(["v1.1.0", "v1.2.0"]);
      // One commit ahead: the fork's customization commit (its configuration file).
      expect(status.doc.divergence).toEqual({ aheadOfRelease: 1, behindRelease: 3, upstreamAheadOfRelease: 1 });
      expect(status.doc.upstream?.defaultBranchHead).toBe(upstream.tags[PRERELEASE_TAG]);

      const pre = runLane(fork, ["status", "--prerelease"]);
      expect(pre.doc.target).toMatchObject({ tag: PRERELEASE_TAG, isPrerelease: true });
      expect(pre.doc.candidates.map((release) => release.tag)).toEqual(["v1.1.0", "v1.2.0", "v1.3.0", PRERELEASE_TAG]);

      const result = runLane(fork, ["integrate"]);
      expectOutcome(result, "integrated");
      expect(result.doc.target?.tag).toBe("v1.3.0");
      expect(result.doc.skipped).toEqual(["v1.1.0", "v1.2.0"]);
      expect(result.doc.report).toContain("Covered by this single merge besides the target: v1.1.0, v1.2.0");
      const merge = result.doc.mergeCommit!;
      expect(parentsOf(fork, merge)).toEqual([fork.head, upstream.tags["v1.3.0"]]);
      expect(git(fork, ["rev-list", "--count", "--first-parent", `${fork.head}..${merge}`]).stdout.trim()).toBe("1");
      for (const tag of ["v1.1.0", "v1.2.0", "v1.3.0"]) expect(isAncestor(fork, upstream.tags[tag]!, merge)).toBe(true);
      expect(recordAt(fork, merge, "v1.3.0")).toMatchObject({ covers: ["v1.1.0", "v1.2.0", "v1.3.0"] });

      const after = runLane(fork, ["status", "--branch", "stamity-upstream/v1.3.0"]);
      expectOutcome(after, "up-to-date");
      expect(after.doc.integratedReleases.map((release) => release.tag)).toEqual(["v1.0.0", "v1.1.0", "v1.2.0", "v1.3.0"]);
      expect(after.doc.integratedReleases.map((release) => release.verified)).toEqual([true, true, true, true]);
      expect(after.doc.candidates).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 7
  it(
    "is idempotent: a second integrate recreates nothing — one branch, one worktree, one record",
    () => {
      const fork = createFork(upstream, forkDir());
      const first = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(first, "integrated");
      const second = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(second, "integrated");
      expect(second.doc.mergeCommit).toBe(first.doc.mergeCommit);
      expect(second.doc.messages.join("\n")).toContain("nothing was redone");
      expect(updateBranches(fork)).toEqual(["stamity-upstream/v1.1.0"]);
      expect(linkedWorktrees(fork)).toEqual([first.doc.worktree]);
      expect(git(fork, ["ls-tree", "-r", "--name-only", "stamity-upstream/v1.1.0", "--", ".stamity/upstream/integrations/"]).stdout.trim()).toBe(
        ".stamity/upstream/integrations/v1.1.0.json",
      );

      const conflicted = createFork(upstream, forkDir(), { editAlpha: true, name: "conflicted" });
      const pending = runLane(conflicted, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(pending, "conflict");
      const again = runLane(conflicted, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(again, "conflict-pending");
      expect(again.doc.conflicts.map((conflict) => [conflict.path, conflict.kind, conflict.generated])).toEqual(
        pending.doc.conflicts.map((conflict) => [conflict.path, conflict.kind, conflict.generated]),
      );
      expect(updateBranches(conflicted)).toEqual(["stamity-upstream/v1.1.0"]);
      expect(linkedWorktrees(conflicted)).toHaveLength(1);
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 8
  it(
    "reports modify/delete with the deleting side when a release deletes a source the fork modified",
    () => {
      const fork = createFork(upstream, forkDir(), {
        at: "v1.1.0",
        files: { "content/rules/delta.md": "# Delta\n\nDelta line one.\nDelta line two, the fork's addition.\n" },
        regenerate: true,
      });
      const result = runLane(fork, ["integrate", "--release", "v1.3.0"]);
      expectOutcome(result, "conflict");
      expect(result.doc.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "content/rules/delta.md", kind: "modify/delete", deletedBy: "upstream", generated: false }),
          expect.objectContaining({ path: "generated/delta.txt", kind: "modify/delete", deletedBy: "upstream", generated: true }),
        ]),
      );
      expect(result.doc.report).toContain("`content/rules/delta.md` — modify/delete; deleted by upstream");

      // The human accepts the deletion; the generator drops the derived file on continue.
      git(fork, ["rm", "--quiet", "content/rules/delta.md"], { cwd: result.doc.worktree! });
      const finished = runLane(fork, ["continue", "--release", "v1.3.0"]);
      expectOutcome(finished, "integrated");
      expect(fileAt(fork, finished.doc.mergeCommit!, "content/rules/delta.md")).toBeNull();
      expect(fileAt(fork, finished.doc.mergeCommit!, "generated/delta.txt")).toBeNull();
      expect(recordAt(fork, finished.doc.mergeCommit!, "v1.3.0")).toMatchObject({
        conflicts: expect.arrayContaining([expect.objectContaining({ path: "content/rules/delta.md", resolvedBy: "human" })]),
      });
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 9
  it(
    "carries a fork edit into a renamed source, or reports rename/delete, and names both paths either way",
    () => {
      const edited = createFork(upstream, forkDir(), {
        at: "v1.1.0",
        name: "edited",
        files: { "content/rules/beta.md": BETA_V1_1.replace("Beta line three.", "Beta line three, edited by the fork.") },
        regenerate: true,
      });
      const carried = runLane(edited, ["integrate", "--release", "v1.3.0"]);
      expectOutcome(carried, "integrated");
      const merge = carried.doc.mergeCommit!;
      expect(fileAt(edited, merge, "content/rules/beta.md")).toBeNull();
      const gamma = fileAt(edited, merge, "content/rules/gamma.md");
      expect(gamma).toContain("edited by the fork");
      expect(fileAt(edited, merge, "generated/gamma.txt")).toBe(renderGenerated("gamma", gamma!));
      expect(fileAt(edited, merge, "generated/beta.txt")).toBeNull();
      expect(carried.doc.affected?.renamed).toEqual([
        expect.objectContaining({ from: "content/rules/beta.md", to: "content/rules/gamma.md", forkChanged: true }),
        expect.objectContaining({ from: "generated/beta.txt", to: "generated/gamma.txt", forkChanged: true }),
      ]);
      expect(carried.doc.report).toContain("`content/rules/beta.md` was renamed to `content/rules/gamma.md` upstream; the fork changed the old path");

      const deleted = createFork(upstream, forkDir(), { at: "v1.1.0", name: "deleted", files: { "content/rules/beta.md": null }, regenerate: true });
      const conflict = runLane(deleted, ["integrate", "--release", "v1.3.0"]);
      expectOutcome(conflict, "conflict");
      expect(conflict.doc.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "content/rules/gamma.md",
            kind: "rename/delete",
            renamedFrom: "content/rules/beta.md",
            renamedTo: "content/rules/gamma.md",
            deletedBy: "fork",
            generated: false,
          }),
        ]),
      );
      expect(conflict.doc.report).toContain("`content/rules/gamma.md` — rename/delete; deleted by fork; renamed from `content/rules/beta.md`");
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 10
  it(
    "reports a shadowed default's change, and an orphaned shadow, even though the merge was clean",
    () => {
      const fork = createFork(upstream, forkDir(), {
        config: { shadows: { "packs/acme/rules/acme-secrets.md": "content/rules/alpha.md" } },
        files: { "packs/acme/rules/acme-secrets.md": "# Acme secrets\n", ".stamity/overrides/rules/alpha.md": "# Alpha, overridden\n" },
      });
      const result = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(result, "integrated");
      expect(result.doc.conflicts).toEqual([]);
      expect(result.doc.affected?.shadowed).toEqual([
        { forkPath: ".stamity/overrides/rules/alpha.md", upstreamPath: "content/rules/alpha.md", release: "v1.1.0", change: "modified", upstreamLines: { added: 1, removed: 1 } },
        { forkPath: "packs/acme/rules/acme-secrets.md", upstreamPath: "content/rules/alpha.md", release: "v1.1.0", change: "modified", upstreamLines: { added: 1, removed: 1 } },
      ]);
      expect(result.doc.report).toContain(
        "the default behind `packs/acme/rules/acme-secrets.md` changed in v1.1.0 (+1/−1 lines); the override still applies and hides the change — review it",
      );
      expect((recordAt(fork, result.doc.mergeCommit!, "v1.1.0") as { affected: { shadowed: unknown[] } }).affected.shadowed).toHaveLength(2);

      const later = createFork(upstream, forkDir(), {
        at: "v1.1.0",
        name: "later",
        config: { shadows: { "packs/acme/rules/delta.md": "content/rules/delta.md", "packs/acme/rules/beta.md": "content/rules/beta.md" }, watch: ["README.md", "content/rules/**"] },
        files: { "packs/acme/rules/delta.md": "# D\n", "packs/acme/rules/beta.md": "# B\n" },
      });
      const status = runLane(later, ["status", "--release", "v1.3.0"]);
      expectOutcome(status, "update-available");
      expect(status.doc.affected?.shadowed).toEqual([
        expect.objectContaining({ forkPath: "packs/acme/rules/beta.md", upstreamPath: "content/rules/beta.md", change: "renamed", renamedTo: "content/rules/gamma.md" }),
        expect.objectContaining({ forkPath: "packs/acme/rules/delta.md", upstreamPath: "content/rules/delta.md", change: "deleted" }),
      ]);
      expect(status.doc.report).toContain("`packs/acme/rules/delta.md` is orphaned: its upstream default `content/rules/delta.md` was deleted in v1.3.0");
      expect(status.doc.affected?.watched.map((row) => row.path)).toEqual(["README.md", "content/rules/beta.md", "content/rules/delta.md", "content/rules/gamma.md"]);
      expect(status.doc.affected?.watched[0]?.upstreamLines).toEqual({ added: 1, removed: 1 });
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 11
  it(
    "fails the behaviour gate on a clean merge that changes a default the fork never edited, and validate turns it around",
    () => {
      const fork = createFork(upstream, forkDir(), { enterprise: true, config: { gates: [{ name: "tier", run: "node scripts/gate.mjs" }] } });
      const result = runLane(fork, ["integrate", "--release", "v1.2.0"]);
      expectOutcome(result, "validation-failed");
      expect(result.doc.conflicts).toEqual([]);
      expect(result.doc.gates).toEqual([expect.objectContaining({ name: "tier", run: "node scripts/gate.mjs", status: "failed", exitCode: 1 })]);
      expect(result.doc.gates[0]?.outputTail).toContain('expected "enterprise"');
      const merge = result.doc.mergeCommit!;
      expect(parentsOf(fork, merge)).toEqual([fork.head, upstream.tags["v1.2.0"]]);
      expect(recordAt(fork, merge, "v1.2.0")).toMatchObject({ gates: "failed", gateResults: [expect.objectContaining({ name: "tier", status: "failed", exitCode: 1 })] });
      expect(git(fork, ["log", "-1", "--format=%B", merge]).stdout).toContain("Stamity-Upstream-Gates: failed");
      expect(result.doc.report).toContain("| tier | `node scripts/gate.mjs` | failed | 1 |");

      const status = runLane(fork, ["status", "--branch", "stamity-upstream/v1.2.0", "--release", "v1.2.0"]);
      expectOutcome(status, "validation-failed");
      expect(status.doc.integrated?.tag).toBe("v1.0.0");
      // v1.1.0 arrived in the same failed merge: the record covers it, so it is unverified too.
      expect(status.doc.unverified.map((release) => [release.tag, release.gates])).toEqual([
        ["v1.1.0", "failed"],
        ["v1.2.0", "failed"],
      ]);

      const again = runLane(fork, ["integrate", "--release", "v1.2.0"]);
      expectOutcome(again, "validation-failed");
      expect(again.doc.mergeCommit).toBe(merge);

      // A dirty worktree is refused: the record must describe a commit.
      writeFiles(result.doc.worktree!, { "config.json": '{\n  "overrides": {\n    "tier": "enterprise"\n  }\n}\n' });
      const dirty = runLane(fork, ["validate", "--release", "v1.2.0"]);
      expect(dirty.code).toBe(2);
      expect(dirty.doc.messages[0]).toContain("uncommitted changes");

      commitAll(fork, "fork: follow the 1.2.0 resolution rule", { cwd: result.doc.worktree! });
      const validated = runLane(fork, ["validate", "--release", "v1.2.0"]);
      expectOutcome(validated, "integrated");
      expect(validated.doc.gates).toEqual([expect.objectContaining({ name: "tier", status: "passed", exitCode: 0 })]);
      const head = branchHead(fork, "stamity-upstream/v1.2.0")!;
      expect(git(fork, ["log", "-1", "--format=%s", head]).stdout.trim()).toBe("upstream lane: gates re-run for v1.2.0");
      expect(isAncestor(fork, merge, head)).toBe(true);
      expect(recordAt(fork, head, "v1.2.0")).toMatchObject({ gates: "passed", validatedHead: expect.any(String) });

      const after = runLane(fork, ["status", "--branch", "stamity-upstream/v1.2.0", "--release", "v1.2.0"]);
      expectOutcome(after, "up-to-date");
      expect(after.doc.integrated?.tag).toBe("v1.2.0");
      expect(after.doc.unverified).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 12
  it(
    "survives an interruption during a gate: operator changes intact, target unmoved, the next integrate sees the in-progress merge",
    async () => {
      const parent = forkDir();
      const fork = createFork(upstream, parent, {
        files: { "scripts/slow-gate.mjs": SLOW_GATE_SOURCE },
        config: { gates: [{ name: "slow", run: "node scripts/slow-gate.mjs" }] },
      });
      writeFiles(fork.dir, {
        "README.md": "# Fixture upstream\n\nRules: 1\n\nAn uncommitted operator note.\n",
        "scratch/untracked.txt": "untracked\n",
      });
      const before = snapshotRepo(fork);

      const sentinel = join(parent, "gate-started");
      const child = spawnLane(fork, ["integrate", "--release", "v1.1.0"], { FIXTURE_SENTINEL: sentinel, FIXTURE_HOLD_MS: "3000" });
      await waitFor(() => existsSync(sentinel), "the gate to start", 20_000);
      child.kill("SIGKILL");
      await waitForExit(child);

      expect(snapshotRepo(fork)).toBe(before);
      expect(readTreeFile(fork.dir, "README.md")).toContain("An uncommitted operator note.");
      expect(treeFileExists(fork.dir, "scratch/untracked.txt")).toBe(true);
      expect(branchHead(fork, "main")).toBe(fork.head);

      const next = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(next, "conflict-pending");
      expect(next.doc.conflicts).toEqual([]);
      expect(next.doc.messages.join("\n")).toContain("run `continue`");
      expect(updateBranches(fork)).toEqual(["stamity-upstream/v1.1.0"]);
      expect(linkedWorktrees(fork)).toHaveLength(1);

      const finished = runLane(fork, ["continue", "--release", "v1.1.0"]);
      expectOutcome(finished, "integrated");
      expect(finished.doc.gates).toEqual([expect.objectContaining({ name: "slow", status: "passed" })]);
      expect(parentsOf(fork, finished.doc.mergeCommit!)).toEqual([fork.head, upstream.tags["v1.1.0"]]);
      // The killed lane's gate outlives it by its hold; wait it out so the directory it sits in
      // can be removed — Windows refuses to delete a running process's working directory.
      await waitFor(() => existsSync(`${sentinel}.done`), "the orphaned gate to exit", 15_000);
    },
    CHAINED_TIMEOUT_MS,
  );

  // Criterion 13
  it(
    "names missing ancestry and attempts no merge for a fork with an unrelated history",
    () => {
      const fork = createUnrelatedFork(upstream, forkDir());
      const status = runLane(fork, ["status"]);
      expectOutcome(status, "ancestry-missing");
      expect(status.doc.messages.join("\n")).toContain("re-create the fork from a clone that carries the upstream history");
      expect(status.doc.messages.join("\n")).toContain("never runs `--allow-unrelated-histories`");
      expect(status.doc.integrated).toBeNull();
      expect(status.doc.divergence).toBeNull();

      const integrate = runLane(fork, ["integrate"]);
      expectOutcome(integrate, "ancestry-missing");
      const preview = runLane(fork, ["preview"]);
      expectOutcome(preview, "ancestry-missing");
      expect(updateBranches(fork)).toEqual([]);
      expect(linkedWorktrees(fork)).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 14
  it(
    "names the record whose release the history lacks after a squash landing",
    () => {
      const fork = createFork(upstream, forkDir());
      expectOutcome(runLane(fork, ["integrate", "--release", "v1.1.0"]), "integrated");
      git(fork, ["merge", "--squash", "--quiet", "stamity-upstream/v1.1.0"]);
      commitAll(fork, "squash-landed the update branch");

      const status = runLane(fork, ["status", "--release", "v1.1.0"]);
      expectOutcome(status, "ancestry-lost");
      expect(status.doc.lostRecords).toEqual([{ path: ".stamity/upstream/integrations/v1.1.0.json", tag: "v1.1.0", commit: upstream.tags["v1.1.0"] }]);
      expect(status.doc.report).toContain("`.stamity/upstream/integrations/v1.1.0.json` claims v1.1.0");
      expect(status.doc.messages.join("\n")).toContain("land update branches by merge commit");
      expect(status.doc.messages.join("\n")).toContain("rerere");
      expectOutcome(runLane(fork, ["preview", "--release", "v1.1.0"]), "ancestry-lost");
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 15
  it(
    "preview leaves the working tree, index, stash list and branches byte-identical, clean or conflicted",
    () => {
      const clean = createFork(upstream, forkDir(), { name: "clean" });
      writeFiles(clean.dir, { "README.md": "# Fixture upstream\n\nRules: 1\n\nStashed.\n" });
      git(clean, ["stash", "push", "--quiet", "-m", "operator stash"]);
      writeFiles(clean.dir, { "notes.txt": "untracked\n", "README.md": "# Fixture upstream\n\nRules: 1\n\nDirty.\n" });
      git(clean, ["add", "notes.txt"]);
      const before = snapshotRepo(clean);

      const preview = runLane(clean, ["preview", "--release", "v1.1.0"]);
      expectOutcome(preview, "update-available");
      expect(preview.doc.conflicts).toEqual([]);
      expect(preview.doc.diffStat).toContain("content/rules/beta.md");
      expect(preview.doc.releaseNotes).toBe(RELEASE_NOTES_V1_1);
      expect(preview.doc.report).toContain("## Release notes for v1.1.0");
      expect(snapshotRepo(clean)).toBe(before);
      expect(linkedWorktrees(clean)).toEqual([]);
      expect(updateBranches(clean)).toEqual([]);

      const conflicted = createFork(upstream, forkDir(), { editAlpha: true, name: "conflicted" });
      const beforeConflicted = snapshotRepo(conflicted);
      const result = runLane(conflicted, ["preview", "--release", "v1.1.0"]);
      expectOutcome(result, "conflict");
      expect(result.doc.conflicts).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "content/rules/alpha.md", kind: "content", generated: false })]),
      );
      expect(snapshotRepo(conflicted)).toBe(beforeConflicted);
      expect(linkedWorktrees(conflicted)).toEqual([]);
      expect(updateBranches(conflicted)).toEqual([]);

      expectOutcome(runLane(clean, ["preview", "--release", "v1.0.0"]), "up-to-date");
      expect(snapshotRepo(clean)).toBe(before);
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 16
  it(
    "exits 2 naming the missing configuration on a fork without one, and on the canonical repository itself",
    () => {
      const bare = createFork(upstream, forkDir(), { config: null });
      const result = runLane(bare, ["status"]);
      expect(result.code).toBe(2);
      expect(result.doc.outcome).toBe("not-a-fork");
      expect(result.doc.messages[0]).toContain(".stamity/upstream.json");
      expect(result.doc.messages[0]).toContain("not a fork");
      expect(result.doc.report).toContain("not-a-fork");

      // This checkout carries no configuration; the probe exits before any write.
      const canonical = runLane({ dir: REPO_ROOT, env: isolatedEnv(bare.dir) }, ["status"]);
      expect(canonical.code).toBe(2);
      expect(canonical.doc.outcome).toBe("not-a-fork");
      expect(canonical.doc.messages[0]).toContain(".stamity/upstream.json");
    },
    CASE_TIMEOUT_MS,
  );

  // REQ-UPSTREAM-012 and -006: abort, a stale branch, --recreate
  it(
    "abort discards an in-progress merge and deletes only a branch that carries nothing; a stale branch needs --recreate",
    () => {
      const fork = createFork(upstream, forkDir(), { editAlpha: true });
      const conflict = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(conflict, "conflict");
      const aborted = runLane(fork, ["abort", "--release", "v1.1.0"]);
      expectOutcome(aborted, "aborted");
      expect(existsSync(conflict.doc.worktree!)).toBe(false);
      expect(updateBranches(fork)).toEqual([]);
      expect(linkedWorktrees(fork)).toEqual([]);
      expect(branchHead(fork, "main")).toBe(fork.head);
      expect(aborted.doc.messages.join("\n")).toContain("was deleted");
      const twice = runLane(fork, ["abort", "--release", "v1.1.0"]);
      expectOutcome(twice, "aborted");
      expect(twice.doc.messages.join("\n")).toContain("nothing to abort");

      const plain = createFork(upstream, forkDir(), { name: "plain" });
      const first = runLane(plain, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(first, "integrated");
      const kept = runLane(plain, ["abort", "--release", "v1.1.0"]);
      expectOutcome(kept, "aborted");
      expect(updateBranches(plain)).toEqual(["stamity-upstream/v1.1.0"]);
      expect(linkedWorktrees(plain)).toEqual([]);
      expect(kept.doc.messages.join("\n")).toContain("was kept");

      // The target moves on: the branch is stale, and only --recreate starts over.
      writeFiles(plain.dir, { "LOCAL.md": "# Local\n" });
      const moved = commitAll(plain, "fork: a later commit on main");
      const stale = runLane(plain, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(stale, "update-branch-stale");
      expect(stale.doc.messages.join("\n")).toContain("--recreate");
      expect(branchHead(plain, "stamity-upstream/v1.1.0")).toBe(first.doc.mergeCommit);
      const recreated = runLane(plain, ["integrate", "--release", "v1.1.0", "--recreate"]);
      expectOutcome(recreated, "integrated");
      expect(parentsOf(plain, recreated.doc.mergeCommit!)).toEqual([moved, upstream.tags["v1.1.0"]]);
      expect(updateBranches(plain)).toEqual(["stamity-upstream/v1.1.0"]);
      expect(linkedWorktrees(plain)).toHaveLength(1);

      // A human commit on the branch is never deleted, --recreate or not.
      writeFiles(recreated.doc.worktree!, { "HUMAN.md": "# A hand-made fix\n" });
      const human = commitAll(plain, "a human resolution on the update branch", { cwd: recreated.doc.worktree! });
      writeFiles(plain.dir, { "LOCAL.md": "# Local, again\n" });
      commitAll(plain, "fork: main moves again");
      const refused = runLane(plain, ["integrate", "--release", "v1.1.0", "--recreate"]);
      expectOutcome(refused, "update-branch-stale");
      expect(refused.doc.messages.join("\n")).toContain("never deleted");
      expect(refused.doc.messages.join("\n")).toContain("git merge main");
      expect(branchHead(plain, "stamity-upstream/v1.1.0")).toBe(human);
    },
    CHAINED_TIMEOUT_MS,
  );

  // REQ-UPSTREAM-007 and invariant 3: a failed regeneration, a leftover marker
  it(
    "stops on a failed regenerate command, and continue refuses a leftover marker until it is gone",
    () => {
      const fork = createFork(upstream, forkDir(), {
        editAlpha: true,
        files: { "scripts/fail.mjs": "console.error('generator: refusing')\nprocess.exit(3)\n" },
        config: { regenerate: ["node scripts/fail.mjs", "node scripts/gen.mjs"] },
      });
      const conflict = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(conflict, "conflict");
      const worktree = conflict.doc.worktree!;

      // A resolution that keeps the markers, staged anyway.
      const withMarkers = readTreeFile(worktree, "content/rules/alpha.md");
      git(fork, ["add", "content/rules/alpha.md"], { cwd: worktree });
      const refused = runLane(fork, ["continue", "--release", "v1.1.0"]);
      expectOutcome(refused, "regenerate-failed");
      expect(refused.doc.regenerate).toEqual([expect.objectContaining({ run: "node scripts/fail.mjs", status: "failed", exitCode: 3 })]);
      expect(refused.doc.report).toContain("generator: refusing");
      expect(refused.doc.mergeCommit).toBeNull();

      // The operator fixes the configuration in the working tree; the lane reads the file as it is.
      const config = JSON.parse(readTreeFile(fork.dir, ".stamity/upstream.json")) as { regenerate: string[] };
      config.regenerate = ["node scripts/gen.mjs"];
      writeFileSync(join(fork.dir, ".stamity", "upstream.json"), `${JSON.stringify(config, null, 2)}\n`);
      const markers = runLane(fork, ["continue", "--release", "v1.1.0"]);
      expectOutcome(markers, "conflict");
      expect(markers.doc.messages.join("\n")).toMatch(/content\/rules\/alpha\.md still carries a conflict marker \(line \d+/);
      expect(markers.doc.messages).toContain("nothing was committed");
      expect(branchHead(fork, "stamity-upstream/v1.1.0")).toBe(fork.head);
      expect(hasConflictMarkers(withMarkers)).toBe(true);

      writeFiles(worktree, { "content/rules/alpha.md": ALPHA_V1_1 });
      git(fork, ["add", "content/rules/alpha.md"], { cwd: worktree });
      const finished = runLane(fork, ["continue", "--release", "v1.1.0"]);
      expectOutcome(finished, "integrated");
      expect(fileAt(fork, finished.doc.mergeCommit!, "generated/alpha.txt")).toBe(renderGenerated("alpha", ALPHA_V1_1));
    },
    CHAINED_TIMEOUT_MS,
  );

  // REQ-UPSTREAM-009: --no-gates is recorded as skipped and never counts
  it(
    "--no-gates records skipped, which status refuses to count as integrated until validate runs the gates",
    () => {
      const fork = createFork(upstream, forkDir(), { enterprise: true, config: { gates: [{ name: "tier", run: "node scripts/gate.mjs" }] } });
      const result = runLane(fork, ["integrate", "--release", "v1.1.0", "--no-gates"]);
      expectOutcome(result, "validation-failed");
      expect(result.doc.gates).toEqual([expect.objectContaining({ name: "tier", status: "skipped", exitCode: null })]);
      expect(recordAt(fork, result.doc.mergeCommit!, "v1.1.0")).toMatchObject({ gates: "skipped" });
      expect(git(fork, ["log", "-1", "--format=%B", result.doc.mergeCommit!]).stdout).toContain("Stamity-Upstream-Gates: skipped");
      const status = runLane(fork, ["status", "--branch", "stamity-upstream/v1.1.0", "--release", "v1.1.0"]);
      expectOutcome(status, "validation-failed");
      expect(status.doc.integrated?.tag).toBe("v1.0.0");
      // v1.1.0 does not touch the resolver, so the gate passes once it actually runs.
      const validated = runLane(fork, ["validate", "--release", "v1.1.0"]);
      expectOutcome(validated, "integrated");
      expectOutcome(runLane(fork, ["status", "--branch", "stamity-upstream/v1.1.0", "--release", "v1.1.0"]), "up-to-date");
    },
    CASE_TIMEOUT_MS,
  );

  // REQ-UPSTREAM-001 and -002: the exit-2 refusals, each with a document
  it(
    "exits 2 with a document for a config error, a mismatched remote, a missing branch, and --offline before a fetch",
    () => {
      const fork = createFork(upstream, forkDir());
      const bad = join(fork.dir, "..", "bad.json");
      writeFileSync(bad, '{"version": 1, "upstream": "x", "gate": []}\n');
      const config = runLane(fork, ["status", "--config", bad]);
      expect(config.code).toBe(2);
      expect(config.doc.outcome).toBe("error");
      expect(config.doc.messages[0]).toContain('unknown key(s) "gate"');

      const offline = runLane(fork, ["status", "--offline"]);
      expect(offline.code).toBe(2);
      expect(offline.doc.messages[0]).toContain("nothing was fetched");

      const branch = runLane(fork, ["status", "--branch", "nope"]);
      expect(branch.code).toBe(2);
      expect(branch.doc.messages[0]).toContain("refs/heads/nope");
      expect(branch.doc.messages[0]).toContain("refs/remotes/origin/nope");

      // The runs above created the remote; point it elsewhere, the way a fork with an older
      // `upstream` remote would present, and the lane refuses to repoint it.
      expect(git(fork, ["remote", "get-url", "upstream"]).stdout.trim()).toBe(upstream.dir);
      git(fork, ["remote", "set-url", "upstream", "https://example.invalid/somewhere-else.git"]);
      const mismatch = runLane(fork, ["status"]);
      expect(mismatch.code).toBe(2);
      expect(mismatch.doc.messages[0]).toContain("https://example.invalid/somewhere-else.git");
      expect(mismatch.doc.messages[0]).toContain(upstream.dir);
      expect(git(fork, ["remote", "get-url", "upstream"]).stdout.trim()).toBe("https://example.invalid/somewhere-else.git");
      git(fork, ["remote", "set-url", "upstream", upstream.dir]);

      expectOutcome(runLane(fork, ["status"]), "update-available");
      const cached = runLane(fork, ["status", "--offline"]);
      expectOutcome(cached, "update-available");
      expect(cached.doc.target?.tag).toBe("v1.3.0");

      const help = runLane(fork, ["help"]);
      expect(help.code).toBe(0);
      expect(help.doc.outcome).toBe("help");
      expect(help.doc.report).toContain("usage: node scripts/upstream.mjs");
    },
    CASE_TIMEOUT_MS,
  );

  it("the fixture generator and its mirror agree, so 'derived' means one thing in this suite", () => {
    expect(readTreeFile(upstream.dir, "generated/alpha.txt")).toBe(renderGenerated("alpha", readTreeFile(upstream.dir, "content/rules/alpha.md")));
  });
});
