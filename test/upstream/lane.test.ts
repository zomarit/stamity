import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BRANCH_PREFIX,
  CONFIG_DEFAULTS,
  GIT_FLOOR,
  OUTCOMES,
  RECORD_DIRECTORY,
  buildRecord,
  checkTagShape,
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
  redactUrl,
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
  LOGO_FORK,
  MAINTENANCE_TAG,
  OFF_PATTERN_TAG,
  PRERELEASE_TAG,
  README_STRAY,
  RELEASE_NOTES_V1_1,
  RELEASE_TAGS,
  SECRETS_V1,
  SECRETS_V1_1,
  SKILL_V1,
  SKILL_V1_1,
  SLOW_GATE_SOURCE,
  STRAY_GENERATOR_SOURCE,
  blobIdAt,
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

describe("the seams a hostile input reaches: tag shapes and URL userinfo", () => {
  it("refuses a tag that could become an option, carry a control character, or walk a path", () => {
    expect(checkTagShape("v1.2.3")).toBeNull();
    expect(checkTagShape("release/1.2.3")).toBeNull();
    expect(checkTagShape("-x")).toMatch(/starts with "-"/);
    expect(checkTagShape("v1\u00012")).toMatch(/control character/);
    expect(checkTagShape("v1\u007f")).toMatch(/control character/);
    expect(checkTagShape("v1 2")).toMatch(/whitespace/);
    expect(checkTagShape("../x")).toMatch(/path segment/);
    expect(checkTagShape("a//b")).toMatch(/path segment/);
    expect(checkTagShape("a/./b")).toMatch(/path segment/);
    expect(checkTagShape("")).toMatch(/empty/);
  });

  it("strips userinfo from a URL and leaves every other form alone", () => {
    expect(redactUrl("https://x-access-token:SECRET@github.invalid/org/repo.git")).toBe("https://github.invalid/org/repo.git");
    expect(redactUrl("https://SECRET@github.invalid/org/repo.git")).toBe("https://github.invalid/org/repo.git");
    expect(redactUrl("https://github.invalid/org/repo.git")).toBe("https://github.invalid/org/repo.git");
    expect(redactUrl("https://github.invalid/org/repo.git#a@b")).toBe("https://github.invalid/org/repo.git#a@b");
    expect(redactUrl("ssh://git@github.invalid/org/repo.git")).toBe("ssh://github.invalid/org/repo.git");
    expect(redactUrl("git@github.invalid:org/repo.git")).toBe("git@github.invalid:org/repo.git");
    expect(redactUrl("/srv/git/upstream")).toBe("/srv/git/upstream");
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
  /**
   * A corpus at the target head, in every spelling the engine mints (`contentPrefixFor`,
   * `src/types/markers.ts:216-231`): agents and rules under `stamity-`, commands and skills under
   * `st-`, one file left bare, one command still carrying the pre-split `stamity-` spelling, and
   * `content/charter/` — a directory that is NOT one of the four content classes
   * (`CONTENT_CLASSES`, `src/types/content.ts:14`), so no prefix is ever tried for it.
   */
  const CORPUS = new Set([
    "content/rules/alpha.md",
    "content/rules/stamity-secrets.md",
    "content/agents/stamity-reviewer.md",
    "content/commands/st-ask.md",
    "content/commands/stamity-legacy.md",
    "content/skills/st-eval-run/SKILL.md",
    "content/skills/st-eval-run/references/rubric.md",
    "content/charter/stamity-charter.md",
  ]);
  const inCorpus = (path: string): boolean => CORPUS.has(path);

  it("derives an overrides pair by restoring the reserved prefix the corpus spells the id with", () => {
    expect(
      deriveShadowPairs(
        [
          ".stamity/overrides/rules/secrets.md",
          ".stamity/overrides/rules/secrets.customize.yaml",
          ".stamity/overrides/agents/reviewer.customize.md",
          ".stamity/overrides/commands/ask.md",
          ".stamity/overrides/skills/eval-run/SKILL.md",
          ".stamity/overrides/skills/eval-run/references/rubric.md",
          ".stamity/overrides/README.txt",
          "content/rules/alpha.md",
        ],
        inCorpus,
      ),
    ).toEqual({
      ".stamity/overrides/rules/secrets.md": "content/rules/stamity-secrets.md",
      ".stamity/overrides/rules/secrets.customize.yaml": "content/rules/stamity-secrets.md",
      ".stamity/overrides/agents/reviewer.customize.md": "content/agents/stamity-reviewer.md",
      ".stamity/overrides/commands/ask.md": "content/commands/st-ask.md",
      ".stamity/overrides/skills/eval-run/SKILL.md": "content/skills/st-eval-run/SKILL.md",
    });
  });

  it("takes the bare corpus name when one exists, and the file's own spelling when it is already prefixed", () => {
    expect(
      deriveShadowPairs([".stamity/overrides/rules/alpha.md", ".stamity/overrides/rules/stamity-secrets.md"], inCorpus),
    ).toEqual({
      ".stamity/overrides/rules/alpha.md": "content/rules/alpha.md",
      ".stamity/overrides/rules/stamity-secrets.md": "content/rules/stamity-secrets.md",
    });
  });

  it("derives the fork layer's pairs from `fork/`: replacements, patches and skills alike", () => {
    expect(
      deriveShadowPairs(
        [
          "fork/rules/secrets.md",
          "fork/agents/reviewer.customize.yaml",
          "fork/commands/ask.customize.md",
          "fork/skills/eval-run/SKILL.md",
          "fork/skills/eval-run/references/rubric.md",
          "fork/README.md",
        ],
        inCorpus,
      ),
    ).toEqual({
      "fork/rules/secrets.md": "content/rules/stamity-secrets.md",
      "fork/agents/reviewer.customize.yaml": "content/agents/stamity-reviewer.md",
      "fork/commands/ask.customize.md": "content/commands/st-ask.md",
      "fork/skills/eval-run/SKILL.md": "content/skills/st-eval-run/SKILL.md",
    });
  });

  it("pairs a skill's overlay siblings with the same bundled SKILL.md, from either root", () => {
    // A patch of a skill hides changes to the file a replacement of it hides; the skill's own
    // material — `references/`, scripts — stands in for no bundled file even when one exists there.
    expect(
      deriveShadowPairs(
        [
          "fork/skills/eval-run/SKILL.customize.yaml",
          "fork/skills/eval-run/SKILL.customize.md",
          ".stamity/overrides/skills/eval-run/SKILL.customize.yaml",
          ".stamity/overrides/skills/eval-run/SKILL.customize.md",
          "fork/skills/eval-run/references/rubric.md",
          ".stamity/overrides/skills/eval-run/references/rubric.md",
        ],
        inCorpus,
      ),
    ).toEqual({
      "fork/skills/eval-run/SKILL.customize.yaml": "content/skills/st-eval-run/SKILL.md",
      "fork/skills/eval-run/SKILL.customize.md": "content/skills/st-eval-run/SKILL.md",
      ".stamity/overrides/skills/eval-run/SKILL.customize.yaml": "content/skills/st-eval-run/SKILL.md",
      ".stamity/overrides/skills/eval-run/SKILL.customize.md": "content/skills/st-eval-run/SKILL.md",
    });
  });

  it("falls back to the other minted prefix for a class whose corpus file predates the split", () => {
    // `ENGINE_CONTENT_PREFIXES` keeps both spellings forever because a repository upgraded across
    // the split holds emissions under both (`src/types/markers.ts:184-199`); a command still filed
    // as `stamity-legacy.md` is therefore found, after the `st-` spelling its class now mints.
    expect(deriveShadowPairs(["fork/commands/legacy.md"], inCorpus)).toEqual({
      "fork/commands/legacy.md": "content/commands/stamity-legacy.md",
    });
  });

  it("derives nothing for a fork file that adds an id the corpus does not carry", () => {
    expect(
      deriveShadowPairs(
        [
          "fork/rules/acme-house-style.md",
          "fork/rules/acme-house-style.customize.yaml",
          "fork/skills/acme-review/SKILL.md",
          "fork/skills/acme-review/SKILL.customize.yaml",
          "fork/skills/acme-review/SKILL.customize.md",
        ],
        inCorpus,
      ),
    ).toEqual({});
  });

  it("tries no prefixed spelling for a directory that is not a content class", () => {
    // `content/charter/stamity-charter.md` exists, and `charter` is not one of the four classes
    // `contentPrefixFor` rules on — so the bare name is the only candidate and it misses.
    expect(deriveShadowPairs(["fork/charter/charter.md", ".stamity/overrides/charter/charter.md"], inCorpus)).toEqual({});
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
    // The floor is the version that introduced `--end-of-options`, which every revision reader
    // passes so a record-supplied object id can never be read as an option.
    expect(GIT_FLOOR).toEqual([2, 24]);
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
        { path: "assets/logo.bin", kind: "content", generated: true, regenerated: false },
        { path: "content/rules/delta.md", kind: "modify/delete", generated: false, deletedBy: "upstream" },
      ],
      gates: [{ name: "check", run: "npm test", status: "failed", exitCode: 1, durationMs: 40, outputTail: "1 failed" }],
      regenerate: [],
      unlistedGenerated: [{ path: "README.md", change: "modified" }],
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
    expect(report).toContain("`assets/logo.bin` — content; generated, but regeneration did not produce it: resolve it by hand and `git add` it, or fix the regenerate list");
    expect(report).toContain("## Regeneration");
    expect(report).toContain("`README.md` — modified by regeneration, and no generatedPaths glob covers it: add it to generatedPaths");
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

  it("builds the upstream the criteria describe: four releases, a prerelease, a side-branch maintenance release, a generator that derives", () => {
    expect(Object.keys(upstream.tags)).toEqual([...RELEASE_TAGS, PRERELEASE_TAG, OFF_PATTERN_TAG, MAINTENANCE_TAG]);
    // The maintenance release descends from v1.1.0 and from nothing newer; nothing newer contains it.
    expect(isAncestor(upstream, upstream.tags["v1.1.0"]!, upstream.tags[MAINTENANCE_TAG]!)).toBe(true);
    expect(isAncestor(upstream, upstream.tags["v1.2.0"]!, upstream.tags[MAINTENANCE_TAG]!)).toBe(false);
    expect(isAncestor(upstream, upstream.tags[MAINTENANCE_TAG]!, upstream.tags["v1.3.0"]!)).toBe(false);
    expect(isAncestor(upstream, upstream.tags[MAINTENANCE_TAG]!, upstream.tags[PRERELEASE_TAG]!)).toBe(false);
    // The binary changes in v1.1.0, so a fork that changes it too gets a conflict git cannot merge.
    expect(blobIdAt(upstream, upstream.tags["v1.0.0"]!, "assets/logo.bin")).not.toBe(blobIdAt(upstream, upstream.tags["v1.1.0"]!, "assets/logo.bin"));
    expect(fileAt(upstream, upstream.tags["v1.0.0"]!, "content/rules/alpha.md")).toBe(ALPHA_V1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "content/rules/alpha.md")).toBe(ALPHA_V1_1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "content/rules/delta.md")).toBe(DELTA_V1_1);
    // The prefixed corpus file: filed under the spelling an agent or a rule is minted with, and
    // changed in v1.1.0, so a shadow filed under the bare id `secrets` has drift to report.
    expect(fileAt(upstream, upstream.tags["v1.0.0"]!, "content/rules/stamity-secrets.md")).toBe(SECRETS_V1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "content/rules/stamity-secrets.md")).toBe(SECRETS_V1_1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "content/rules/secrets.md")).toBeNull();
    // The bundled skill: the `st-` prefix sits on the directory, and v1.1.0 revises its body.
    expect(fileAt(upstream, upstream.tags["v1.0.0"]!, "content/skills/st-review/SKILL.md")).toBe(SKILL_V1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "content/skills/st-review/SKILL.md")).toBe(SKILL_V1_1);
    expect(fileAt(upstream, upstream.tags["v1.1.0"]!, "content/skills/review/SKILL.md")).toBeNull();
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
      // The regenerate command ran from the merged tree with this process's environment, and the
      // report said so once.
      expect(result.doc.messages.filter((line) => line.includes("run the merged tree's regenerate commands and gates with the caller's environment"))).toHaveLength(1);

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
        // rerere is enabled per command and never persisted: the repository configuration the two
        // worktrees share stays unset, while the merge recorded its preimage into the shared rr-cache.
        expect(git(fork, ["config", "--get", "rerere.enabled"], { allowFailure: true }).status).toBe(1);
        expect(git(fork, ["config", "--get", "rerere.enabled"], { cwd: worktree, allowFailure: true }).status).toBe(1);
        const rrCache = join(fork.dir, ".git", "rr-cache");
        expect(readdirSync(rrCache).some((id) => existsSync(join(rrCache, id, "preimage")))).toBe(true);
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
        // The merge commit ran under rerere too: the resolution is recorded beside the preimage.
        const rrCache = join(fork.dir, ".git", "rr-cache");
        expect(readdirSync(rrCache).some((id) => existsSync(join(rrCache, id, "postimage")))).toBe(true);
        expect(git(fork, ["config", "--get", "rerere.enabled"], { allowFailure: true }).status).toBe(1);
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

  // Criterion 6 — and the skipped list is by ancestry, not by version order: the maintenance
  // release v1.1.1 sorts below v1.3.0 and is a candidate, yet a merge of v1.3.0 does not contain it.
  it(
    "targets the newest stable release without --release, lists the skipped ones the merge contains, and merges them in one commit",
    () => {
      const fork = createFork(upstream, forkDir());
      const status = runLane(fork, ["status"]);
      expectOutcome(status, "update-available");
      expect(status.doc.integrated?.tag).toBe("v1.0.0");
      expect(status.doc.target).toMatchObject({ tag: "v1.3.0", commit: upstream.tags["v1.3.0"], isPrerelease: false });
      expect(status.doc.candidates.map((release) => release.tag)).toEqual(["v1.1.0", MAINTENANCE_TAG, "v1.2.0", "v1.3.0"]);
      expect(status.doc.skipped).toEqual(["v1.1.0", "v1.2.0"]);
      // One commit ahead: the fork's customization commit (its configuration file).
      expect(status.doc.divergence).toEqual({ aheadOfRelease: 1, behindRelease: 3, upstreamAheadOfRelease: 1 });
      expect(status.doc.upstream?.defaultBranchHead).toBe(upstream.tags[PRERELEASE_TAG]);

      const pre = runLane(fork, ["status", "--prerelease"]);
      expect(pre.doc.target).toMatchObject({ tag: PRERELEASE_TAG, isPrerelease: true });
      expect(pre.doc.candidates.map((release) => release.tag)).toEqual(["v1.1.0", MAINTENANCE_TAG, "v1.2.0", "v1.3.0", PRERELEASE_TAG]);

      // Selecting the maintenance release itself covers v1.1.0, its one ancestor among the candidates.
      const maintenance = runLane(fork, ["status", "--release", MAINTENANCE_TAG]);
      expectOutcome(maintenance, "update-available");
      expect(maintenance.doc.skipped).toEqual(["v1.1.0"]);

      const result = runLane(fork, ["integrate"]);
      expectOutcome(result, "integrated");
      expect(result.doc.target?.tag).toBe("v1.3.0");
      expect(result.doc.skipped).toEqual(["v1.1.0", "v1.2.0"]);
      expect(result.doc.report).toContain("Covered by this single merge besides the target: v1.1.0, v1.2.0");
      const merge = result.doc.mergeCommit!;
      expect(parentsOf(fork, merge)).toEqual([fork.head, upstream.tags["v1.3.0"]]);
      expect(git(fork, ["rev-list", "--count", "--first-parent", `${fork.head}..${merge}`]).stdout.trim()).toBe("1");
      for (const tag of ["v1.1.0", "v1.2.0", "v1.3.0"]) expect(isAncestor(fork, upstream.tags[tag]!, merge)).toBe(true);
      expect(isAncestor(fork, upstream.tags[MAINTENANCE_TAG]!, merge)).toBe(false);
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

  // REQ-FORK-008 — the bundled fork layer's drift rows, and the same repair for the override tree.
  it(
    "pairs a bare-slug shadow with the prefixed corpus file it hides, from `fork/` and from the override tree, and never pairs a fork addition",
    () => {
      const fork = createFork(upstream, forkDir(), {
        name: "forklayer",
        files: {
          // A fork replacement of the corpus rule `secrets`, whose corpus file is spelled
          // `content/rules/stamity-secrets.md` — the pair a bare-name derivation never found.
          "fork/rules/secrets.md": "# Secrets, the fork's wording\n",
          // A fork patch of a bare-named corpus rule: the other spelling, same derivation.
          "fork/rules/alpha.customize.yaml": "tags: [fork]\n",
          // A fork patch of a bundled SKILL: the `st-` prefix sits on the corpus DIRECTORY.
          "fork/skills/review/SKILL.customize.yaml": "tags: [fork]\n",
          // Additions: no corpus counterpart under any spelling, so no pair and no row — the
          // patch of the fork's OWN skill is an addition too, and derives nothing either.
          "fork/rules/acme-house-style.md": "# Acme house style\n",
          "fork/skills/acme-review/SKILL.md": "# Acme review\n",
          "fork/skills/acme-review/SKILL.customize.yaml": "tags: [fork]\n",
          // The consumer tree files the same id the same way, and is repaired the same way.
          ".stamity/overrides/rules/secrets.md": "# Secrets, this repository's wording\n",
        },
      });

      const result = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(result, "integrated");
      expect(result.doc.conflicts).toEqual([]);
      expect(result.doc.affected?.shadowed).toEqual([
        { forkPath: ".stamity/overrides/rules/secrets.md", upstreamPath: "content/rules/stamity-secrets.md", release: "v1.1.0", change: "modified", upstreamLines: { added: 1, removed: 1 } },
        { forkPath: "fork/rules/alpha.customize.yaml", upstreamPath: "content/rules/alpha.md", release: "v1.1.0", change: "modified", upstreamLines: { added: 1, removed: 1 } },
        { forkPath: "fork/rules/secrets.md", upstreamPath: "content/rules/stamity-secrets.md", release: "v1.1.0", change: "modified", upstreamLines: { added: 1, removed: 1 } },
        { forkPath: "fork/skills/review/SKILL.customize.yaml", upstreamPath: "content/skills/st-review/SKILL.md", release: "v1.1.0", change: "modified", upstreamLines: { added: 1, removed: 1 } },
      ]);
      expect(result.doc.report).toContain(
        "the default behind `fork/rules/secrets.md` changed in v1.1.0 (+1/−1 lines); the override still applies and hides the change — review it",
      );
      // The additions carry no bundled default, so the lane has nothing to compare and says nothing.
      const rows = result.doc.affected?.shadowed.map((row) => row.forkPath) ?? [];
      expect(rows).not.toContain("fork/rules/acme-house-style.md");
      expect(rows).not.toContain("fork/skills/acme-review/SKILL.md");
      expect(rows).not.toContain("fork/skills/acme-review/SKILL.customize.yaml");
      expect(result.doc.report).not.toContain("acme-house-style");
      expect(result.doc.report).not.toContain("acme-review");
      expect(result.doc.report).toContain(
        "the default behind `fork/skills/review/SKILL.customize.yaml` changed in v1.1.0 (+1/−1 lines); the override still applies and hides the change — review it",
      );
      expect((recordAt(fork, result.doc.mergeCommit!, "v1.1.0") as { affected: { shadowed: unknown[] } }).affected.shadowed).toHaveLength(4);
      // The fork's own files are the fork's: the merge carries them through untouched.
      expect(fileAt(fork, result.doc.mergeCommit!, "fork/rules/secrets.md")).toBe("# Secrets, the fork's wording\n");
      expect(fileAt(fork, result.doc.mergeCommit!, "content/rules/stamity-secrets.md")).toBe(SECRETS_V1_1);
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
      expect(validated.doc.messages.filter((line) => line.includes("with the caller's environment"))).toHaveLength(1);
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
        "README.md": "# Fixture upstream\n\nRules: 2\n\nAn uncommitted operator note.\n",
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

  // Criterion 14, and the recovery REQ-UPSTREAM-004 names: `status` diagnoses, `preview` and
  // `integrate` carry the diagnosis and proceed, and the re-merge's record supersedes the stale one.
  it(
    "names the record whose release the history lacks after a squash landing, and the re-merge supersedes it once landed by merge commit",
    () => {
      const fork = createFork(upstream, forkDir());
      expectOutcome(runLane(fork, ["integrate", "--release", "v1.1.0"]), "integrated");
      git(fork, ["merge", "--squash", "--quiet", "stamity-upstream/v1.1.0"]);
      const squashed = commitAll(fork, "squash-landed the update branch");
      const lost = [{ path: ".stamity/upstream/integrations/v1.1.0.json", tag: "v1.1.0", commit: upstream.tags["v1.1.0"]! }];

      const status = runLane(fork, ["status", "--release", "v1.1.0"]);
      expectOutcome(status, "ancestry-lost");
      expect(status.doc.lostRecords).toEqual(lost);
      expect(status.doc.report).toContain("`.stamity/upstream/integrations/v1.1.0.json` claims v1.1.0");
      const guidance = status.doc.messages.join("\n");
      expect(guidance).toContain("land update branches by merge commit");
      expect(guidance).toContain("rerere");
      expect(guidance).toContain("run `integrate --release v1.1.0` again");
      expect(guidance).toContain("delete or correct .stamity/upstream/integrations/v1.1.0.json on the target branch");

      // preview merges (cleanly: the squash brought the same bytes) and carries the rows.
      const preview = runLane(fork, ["preview", "--release", "v1.1.0"]);
      expectOutcome(preview, "update-available");
      expect(preview.doc.conflicts).toEqual([]);
      expect(preview.doc.lostRecords).toEqual(lost);
      expect(preview.doc.report).toContain("## Records whose release the history lacks");
      expect(preview.doc.messages.join("\n")).toContain("supersedes the stale one");

      // integrate gets past the diagnosis too; what stops it here is the earlier update branch,
      // still around and stale because main moved past its cut point. It carries nothing but the
      // lane's own merge commit, so --recreate discards it the way deleting the branch after the
      // pull request landed would have.
      const stale = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(stale, "update-branch-stale");
      expect(stale.doc.lostRecords).toEqual(lost);
      const again = runLane(fork, ["integrate", "--release", "v1.1.0", "--recreate"]);
      expectOutcome(again, "integrated");
      expect(again.doc.lostRecords).toEqual(lost);
      expect(again.doc.report).toContain("`.stamity/upstream/integrations/v1.1.0.json` claims v1.1.0");
      expect(again.doc.messages.join("\n")).toContain("supersedes the stale one");
      const merge = again.doc.mergeCommit!;
      expect(parentsOf(fork, merge)).toEqual([squashed, upstream.tags["v1.1.0"]]);
      expect(recordAt(fork, merge, "v1.1.0")).toMatchObject({ releaseCommit: upstream.tags["v1.1.0"], targetHead: squashed, gates: "none" });
      expect(branchHead(fork, "main")).toBe(squashed);

      // Landed by merge commit, the history contains the release and the record agrees with it.
      git(fork, ["merge", "--no-ff", "--quiet", "-m", "land v1.1.0 by merge commit", "stamity-upstream/v1.1.0"]);
      const after = runLane(fork, ["status", "--release", "v1.1.0"]);
      expectOutcome(after, "up-to-date");
      expect(after.doc.lostRecords).toEqual([]);
      expect(after.doc.integrated).toMatchObject({
        tag: "v1.1.0",
        commit: upstream.tags["v1.1.0"],
        record: { releaseCommit: upstream.tags["v1.1.0"], targetHead: squashed },
      });
    },
    CHAINED_TIMEOUT_MS,
  );

  // M3: a record that cannot be read is named, not skipped, and a record path is read raw.
  it(
    "names every record it cannot read under the record directory, and reads a non-ASCII record path as it is",
    () => {
      const fork = createFork(upstream, forkDir(), {
        files: {
          ".stamity/upstream/integrations/notes.txt": "not a record\n",
          ".stamity/upstream/integrations/bad.json": `${JSON.stringify({ release: "v1.1.0", releaseCommit: "--output=owned" })}\n`,
          ".stamity/upstream/integrations/v1.1.0-€.json": `${JSON.stringify({ release: "v1.1.0-€", releaseCommit: upstream.tags["v1.1.0"] })}\n`,
        },
      });
      const status = runLane(fork, ["status", "--release", "v1.1.0"]);
      expectOutcome(status, "ancestry-lost");
      expect(status.doc.lostRecords).toEqual([{ path: ".stamity/upstream/integrations/v1.1.0-€.json", tag: "v1.1.0-€", commit: upstream.tags["v1.1.0"] }]);
      expect(status.doc.messages).toContain(".stamity/upstream/integrations/notes.txt under .stamity/upstream/integrations/ is not a .json record and was ignored");
      expect(status.doc.messages).toContain(
        'record .stamity/upstream/integrations/bad.json does not name its release commit as a full object id in "releaseCommit" and was ignored',
      );
    },
    CASE_TIMEOUT_MS,
  );

  // M8: a release landed with a failed record is not integrated, and integrate says what turns it.
  it(
    "names validate on the update branch when a landed release's record says the gates failed",
    () => {
      const fork = createFork(upstream, forkDir(), { enterprise: true, config: { gates: [{ name: "tier", run: "node scripts/gate.mjs" }] } });
      const failed = runLane(fork, ["integrate", "--release", "v1.2.0"]);
      expectOutcome(failed, "validation-failed");
      // Landed anyway, by fast-forward, so the release IS in main's history — with the failed record.
      git(fork, ["merge", "--ff-only", "--quiet", "stamity-upstream/v1.2.0"]);
      const again = runLane(fork, ["integrate", "--release", "v1.2.0"]);
      expectOutcome(again, "validation-failed");
      expect(again.doc.mergeCommit).toBeNull();
      const guidance = again.doc.messages.join("\n");
      expect(guidance).toContain("v1.2.0 is in main's history and its record says the gates failed");
      expect(guidance).toContain("run `validate --release v1.2.0` on the update branch stamity-upstream/v1.2.0");
      expect(guidance).toContain("git branch stamity-upstream/v1.2.0 main");
      expect(guidance).toContain("no update branch was created");
      const status = runLane(fork, ["status", "--release", "v1.2.0"]);
      expectOutcome(status, "validation-failed");
      expect(status.doc.messages.join("\n")).toContain("run `validate --release v1.2.0` on the update branch");

      // Following the guidance: the fix on the branch, validate, land the record commit.
      writeFiles(failed.doc.worktree!, { "config.json": '{\n  "overrides": {\n    "tier": "enterprise"\n  }\n}\n' });
      commitAll(fork, "fork: follow the 1.2.0 resolution rule", { cwd: failed.doc.worktree! });
      expectOutcome(runLane(fork, ["validate", "--release", "v1.2.0"]), "integrated");
      git(fork, ["merge", "--ff-only", "--quiet", "stamity-upstream/v1.2.0"]);
      expectOutcome(runLane(fork, ["status", "--release", "v1.2.0"]), "up-to-date");
    },
    CASE_TIMEOUT_MS,
  );

  // Criterion 15
  it(
    "preview leaves the working tree, index, stash list and branches byte-identical, clean or conflicted",
    () => {
      const clean = createFork(upstream, forkDir(), { name: "clean" });
      writeFiles(clean.dir, { "README.md": "# Fixture upstream\n\nRules: 2\n\nStashed.\n" });
      git(clean, ["stash", "push", "--quiet", "-m", "operator stash"]);
      writeFiles(clean.dir, { "notes.txt": "untracked\n", "README.md": "# Fixture upstream\n\nRules: 2\n\nDirty.\n" });
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
      // From inside the worktree abort would remove, abort refuses and removes nothing.
      const inside = runLane(fork, ["abort"], { cwd: conflict.doc.worktree! });
      expect(inside.code).toBe(2);
      expect(inside.doc.messages[0]).toContain("leave the directory first");
      expect(existsSync(conflict.doc.worktree!)).toBe(true);
      expect(linkedWorktrees(fork)).toHaveLength(1);
      expect(git(fork, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: conflict.doc.worktree!, allowFailure: true }).status).toBe(0);
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

      // A --release value is refused before it can become an option, a ref or a directory; a
      // fetched tag of that shape is listed as ignored and never used.
      const dash = runLane(fork, ["status", "--release", "-x"]);
      expect(dash.code).toBe(2);
      expect(dash.doc.messages[0]).toContain('release "-x" is refused: it starts with "-"');
      const dots = runLane(fork, ["continue", "--release", "../x"]);
      expect(dots.code).toBe(2);
      expect(dots.doc.messages[0]).toContain('release "../x" is refused: it contains an empty, "." or ".." path segment');
      git(upstream, ["update-ref", "refs/tags/-evil", upstream.tags["v1.1.0"]!]);
      const hostile = runLane(fork, ["status"]);
      git(upstream, ["update-ref", "-d", "refs/tags/-evil"]);
      expectOutcome(hostile, "update-available");
      expect(hostile.doc.messages).toContain('tag "-evil" was ignored: it starts with "-", which a command would read as an option');
      expect(hostile.doc.candidates.map((release) => release.tag)).not.toContain("-evil");

      const help = runLane(fork, ["help"]);
      expect(help.code).toBe(0);
      expect(help.doc.outcome).toBe("help");
      expect(help.doc.report).toContain("usage: node scripts/upstream.mjs");
      expect(help.doc.report).toContain("--branch <name> takes <name> as the target branch instead of the configured one, for every verb");
      expect(help.doc.report).toContain("run the merged tree's regenerate commands and gates with the\ncaller's environment");
    },
    CASE_TIMEOUT_MS,
  );

  // W2: regeneration output outside generatedPaths is a refusal, not a silent omission.
  it(
    "refuses to commit when regeneration rewrote a tracked path no generatedPaths glob covers, and names the path and the fix",
    () => {
      const fork = createFork(upstream, forkDir(), {
        files: { "scripts/stray.mjs": STRAY_GENERATOR_SOURCE },
        config: { regenerate: ["node scripts/gen.mjs", "node scripts/stray.mjs"] },
      });
      const result = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(result, "regenerate-failed");
      expect(result.doc.regenerate.map((step) => step.status)).toEqual(["passed", "passed"]);
      expect(result.doc.unlistedGenerated).toEqual([{ path: "README.md", change: "modified" }]);
      expect(result.doc.report).toContain("`README.md` — modified by regeneration, and no generatedPaths glob covers it: add it to generatedPaths");
      expect(result.doc.messages.join("\n")).toContain("regeneration modified `README.md`, a tracked path no generatedPaths glob covers");
      expect(result.doc.messages.join("\n")).toContain("add it to generatedPaths, then run `continue`");
      expect(result.doc.mergeCommit).toBeNull();
      expect(branchHead(fork, "stamity-upstream/v1.1.0")).toBe(fork.head);
      const worktree = result.doc.worktree!;
      expect(git(fork, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: worktree, allowFailure: true }).status).toBe(0);
      // The stray rewrite sits in the worktree, unstaged: the index still holds the merge's README.
      expect(git(fork, ["diff", "--name-only"], { cwd: worktree }).stdout.trim()).toBe("README.md");
      expect(readTreeFile(worktree, "README.md")).toBe(README_STRAY);

      // The fix the message names; continue then commits what the gates test.
      const config = JSON.parse(readTreeFile(fork.dir, ".stamity/upstream.json")) as { generatedPaths: string[] };
      config.generatedPaths = ["generated/**", "README.md"];
      writeFileSync(join(fork.dir, ".stamity", "upstream.json"), `${JSON.stringify(config, null, 2)}\n`);
      const finished = runLane(fork, ["continue", "--release", "v1.1.0"]);
      expectOutcome(finished, "integrated");
      expect(finished.doc.unlistedGenerated).toEqual([]);
      expect(fileAt(fork, finished.doc.mergeCommit!, "README.md")).toBe(README_STRAY);
      expect(git(fork, ["status", "--porcelain"], { cwd: worktree }).stdout.trim()).toBe("");
    },
    CASE_TIMEOUT_MS,
  );

  // W3: a conflicted generated path regeneration did not produce is nobody's resolution.
  it(
    "leaves a conflicted generated path that regeneration did not produce unmerged for the human, with no side preferred",
    () => {
      const fork = createFork(upstream, forkDir(), {
        files: { "assets/logo.bin": LOGO_FORK },
        config: { generatedPaths: ["generated/**", "assets/**"] },
      });
      const result = runLane(fork, ["integrate", "--release", "v1.1.0"]);
      expectOutcome(result, "conflict");
      expect(result.doc.conflicts).toEqual([expect.objectContaining({ path: "assets/logo.bin", kind: "content", generated: true, regenerated: false })]);
      expect(result.doc.report).toContain("`assets/logo.bin` — content; generated, but regeneration did not produce it: resolve it by hand and `git add` it, or fix the regenerate list");
      expect(result.doc.messages.join("\n")).toContain("assets/logo.bin is still unmerged after regeneration: the regenerate commands did not produce it");
      expect(result.doc.mergeCommit).toBeNull();
      const worktree = result.doc.worktree!;
      expect(branchHead(fork, "stamity-upstream/v1.1.0")).toBe(fork.head);
      // Still unmerged, both sides in the index stages: nothing chose for the human.
      expect(git(fork, ["ls-files", "-u", "--", "assets/logo.bin"], { cwd: worktree }).stdout.trim()).not.toBe("");
      expect(git(fork, ["rev-parse", ":2:assets/logo.bin"], { cwd: worktree }).stdout.trim()).toBe(blobIdAt(fork, fork.head, "assets/logo.bin"));
      expect(git(fork, ["rev-parse", ":3:assets/logo.bin"], { cwd: worktree }).stdout.trim()).toBe(blobIdAt(fork, upstream.tags["v1.1.0"]!, "assets/logo.bin"));

      // continue with nothing changed says the same thing again and commits nothing.
      const again = runLane(fork, ["continue", "--release", "v1.1.0"]);
      expectOutcome(again, "conflict");
      expect(again.doc.conflicts).toEqual([expect.objectContaining({ path: "assets/logo.bin", generated: true, regenerated: false })]);
      expect(again.doc.mergeCommit).toBeNull();

      // The human resolves it by hand — upstream's bytes — and the record says who did.
      git(fork, ["checkout", "--theirs", "--", "assets/logo.bin"], { cwd: worktree });
      git(fork, ["add", "assets/logo.bin"], { cwd: worktree });
      const finished = runLane(fork, ["continue", "--release", "v1.1.0"]);
      expectOutcome(finished, "integrated");
      const merge = finished.doc.mergeCommit!;
      expect(blobIdAt(fork, merge, "assets/logo.bin")).toBe(blobIdAt(fork, upstream.tags["v1.1.0"]!, "assets/logo.bin"));
      expect(recordAt(fork, merge, "v1.1.0")).toMatchObject({
        conflicts: [expect.objectContaining({ path: "assets/logo.bin", kind: "content", generated: true, resolvedBy: "human" })],
      });
    },
    CASE_TIMEOUT_MS,
  );

  // W5: the upstream URL's userinfo never reaches a document, a message or a log line.
  it(
    "strips the upstream URL's userinfo from the document, the report and every message, while git receives it as configured",
    () => {
      const fork = createFork(upstream, forkDir());
      expectOutcome(runLane(fork, ["status"]), "update-available");
      const secret = "https://x-access-token:SECRETTOKEN@example.invalid/org/upstream.git";
      const shown = "https://example.invalid/org/upstream.git";
      // The configuration names the URL with a token, the remote is repointed to match, and the
      // runs are offline: what was fetched is read, and nothing goes to that host.
      const config = JSON.parse(readTreeFile(fork.dir, ".stamity/upstream.json")) as { upstream: string };
      config.upstream = secret;
      writeFileSync(join(fork.dir, ".stamity", "upstream.json"), `${JSON.stringify(config, null, 2)}\n`);
      git(fork, ["remote", "set-url", "upstream", secret]);
      const offline = runLane(fork, ["status", "--offline"]);
      expectOutcome(offline, "update-available");
      expect(offline.doc.config?.["upstream"]).toBe(shown);
      expect(offline.doc.upstream?.url).toBe(shown);
      expect(offline.doc.report).toContain(`Upstream ${shown} (remote \`upstream\`)`);
      expect(`${offline.stdout}${offline.stderr}`).not.toContain("SECRETTOKEN");

      // The mismatch refusal names both URLs, both stripped.
      git(fork, ["remote", "set-url", "upstream", "https://other:ALSOSECRET@example.invalid/elsewhere.git"]);
      const mismatch = runLane(fork, ["status", "--offline"]);
      expect(mismatch.code).toBe(2);
      expect(mismatch.doc.messages[0]).toContain("https://example.invalid/elsewhere.git");
      expect(mismatch.doc.messages[0]).toContain(shown);
      expect(`${mismatch.stdout}${mismatch.stderr}`).not.toContain("SECRET");

      // A remote the lane creates gets the URL as configured — git needs the credential — and the
      // message that says so does not.
      git(fork, ["remote", "remove", "upstream"]);
      const created = runLane(fork, ["status", "--offline"]);
      expectOutcome(created, "update-available");
      expect(git(fork, ["remote", "get-url", "upstream"]).stdout.trim()).toBe(secret);
      expect(created.doc.messages).toContain(`remote "upstream" was created with ${shown}`);
      expect(`${created.stdout}${created.stderr}`).not.toContain("SECRETTOKEN");
    },
    CASE_TIMEOUT_MS,
  );

  it("the fixture generator and its mirror agree, so 'derived' means one thing in this suite", () => {
    expect(readTreeFile(upstream.dir, "generated/alpha.txt")).toBe(renderGenerated("alpha", readTreeFile(upstream.dir, "content/rules/alpha.md")));
  });
});
