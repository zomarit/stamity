import { mkdir, symlink } from "node:fs/promises";
import type * as NodeFsPromises from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPILOT_SETUP_STEPS_PATH } from "../../src/adapters/copilot.ts";
import {
  DETECTABLE_LANGUAGES,
  LANGUAGE_INDICATORS,
  analyzeRepo,
  detectCIProviders,
  detectDataArtifacts,
  detectDockerfile,
  detectLanguages,
  detectLinters,
  detectMonorepoPackages,
  detectTestFrameworks,
  formatRepoSummary,
  isGreenfield,
} from "../../src/detect/repoAnalyzer.ts";
import type { RepoInfo } from "../../src/types/detect.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Real temp directories rather than the virtual-fs lane: the analyzer reads the
 * filesystem directly, and two of its contracts — symlink resolution in the
 * workspace walk, directory-versus-file probes — are filesystem facts a memory
 * volume would only approximate.
 */
const getRepo = useTempDir("detect-repo");

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

let caseCounter = 0;

/**
 * Seeds a repository root inside the current test's temp directory and returns
 * its absolute path. Each call gets its own root, so a fixture from one
 * assertion cannot leak into the next one in the same test.
 */
async function seedRepo(files: Record<string, string> = {}): Promise<string> {
  const repo = getRepo();
  caseCounter += 1;
  const name = `repo-${caseCounter}`;
  const root = repo.path(name);
  await mkdir(root, { recursive: true });
  await repo.seedFiles(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [`${name}/${path}`, content]),
    ),
  );
  return root;
}

/** Analysis of a freshly seeded repository. */
async function analyze(files: Record<string, string>): Promise<RepoInfo> {
  return analyzeRepo(await seedRepo(files));
}

/** A complete `RepoInfo` with nothing detected, for the cases that supply their own analysis. */
function emptyInfo(rootDir: string, overrides: Partial<RepoInfo> = {}): RepoInfo {
  return {
    rootDir,
    languages: [],
    frameworks: [],
    linters: [],
    testFrameworks: [],
    ciProviders: [],
    monorepoPackages: [],
    hasDockerfile: false,
    hasDataArtifacts: false,
    hasExistingAgents: false,
    existingTools: [],
    ...overrides,
  };
}

describe("analyzeRepo", () => {
  it("reads the toolchain a typescript repository declares", async () => {
    const info = await analyze({
      "package.json": json({ name: "app", scripts: { test: "vitest run" } }),
      "package-lock.json": "{}",
      "tsconfig.json": "{}",
      "vitest.config.ts": "export default {}\n",
      "eslint.config.js": "export default []\n",
      ".github/workflows/ci.yml": "name: CI\n",
    });

    expect(info.languages).toContain("typescript");
    expect(info.testFrameworks).toEqual(["vitest"]);
    expect(info.linters).toEqual(["eslint"]);
    expect(info.ciProviders).toEqual(["github-actions"]);
    expect(info.packageManager).toBe("npm");
    expect(info.frameworks).toEqual([]);
    expect(info.monorepoPackages).toEqual([]);
    expect(info.hasExistingAgents).toBe(false);
  });

  it("returns empty arrays and no package manager for an empty repository", async () => {
    const info = await analyze({});

    expect(info).toEqual(emptyInfo(info.rootDir));
    expect(info.packageManager).toBeUndefined();
    expect(isGreenfield(info)).toBe(true);
  });

  it("analyses a directory that does not exist as an empty repository", async () => {
    const root = await seedRepo();
    const info = await analyzeRepo(join(root, "never-created"));

    expect(info.languages).toEqual([]);
    expect(isGreenfield(info)).toBe(true);
  });

  it("records the package manager only when the repository names one", async () => {
    const detected = await analyze({ "package.json": json({ packageManager: "pnpm@9.0.0" }) });
    expect(detected.packageManager).toBe("pnpm");

    const undeclared = await analyze({ "tsconfig.json": "{}" });
    expect(undeclared.packageManager).toBeUndefined();
  });

  it("reports the agent configuration other tools already left in the repository", async () => {
    const info = await analyze({
      ".claude/settings.json": "{}",
      ".cursor/rules/house.mdc": "---\n---\n",
      ".github/copilot-instructions.md": "# Instructions\n",
      "AGENTS.md": "# Agents\n",
    });

    expect(info.existingTools).toEqual(["claude", "cursor", "copilot", "agents"]);
    expect(info.hasExistingAgents).toBe(true);
    expect(isGreenfield(info)).toBe(false);
  });

  it("detects a codex trace from its .codex directory", async () => {
    // Additive assertion: the SoT names `.codex` traces among the detectable
    // agent tools and the original indicator table lacked the probe.
    // New test only — no existing indicator expectation above is weakened
    // (the four-tool fixture seeds no `.codex`, so its output is unchanged).
    const info = await analyze({ ".codex/config.toml": "" });

    expect(info.existingTools).toEqual(["codex"]);
    expect(info.hasExistingAgents).toBe(true);
    expect(isGreenfield(info)).toBe(false);
  });

  it("counts its own state directory as an existing setup without calling the repo brownfield", async () => {
    // MODIFIED, and the behavior that moved is the last line only: this case
    // used to assert `isGreenfield(info) === false` for a repository whose sole
    // content is the engine's OWN state directory — detection reading its own
    // output back as evidence. `hasExistingAgents` is unchanged and still true:
    // the field reports what is on disk, and it is the greenfield PREDICATE
    // that stopped reading it. Both assertions are kept so the split is
    // visible. This closes the `.stamity/` instance ONLY; the tool-surface
    // instance is still open, pinned by the residual case further down.
    const info = await analyze({ [`${STATE_DIR}/manifest.json`]: "{}" });

    expect(info.existingTools).toEqual([]);
    expect(info.hasExistingAgents).toBe(true);
    expect(isGreenfield(info)).toBe(true);
  });

  it("excludes the exact state directory, and nothing that merely shares its name", async () => {
    // RE-TITLED: the previous title claimed a re-sync, which this fixture does
    // not model — `init` never leaves a repo holding `.stamity/` and nothing
    // else, it writes the charter and the adapter directories in the same run
    // (see the residual case below for that state). What the case does pin is
    // the STATE_DIR exclusion itself: a repo carrying nothing but `.stamity/` is
    // greenfield on every run, and a sibling directory that merely shares the
    // name's opening characters is not the state directory and is not excluded
    // by anything (it never fed `hasExistingAgents`).
    const own = await analyze({
      [`${STATE_DIR}/manifest.json`]: "{}",
      [`${STATE_DIR}/generated/plan.json`]: "{}",
    });
    expect(isGreenfield(own)).toBe(true);

    const lookalike = await analyze({ [`${STATE_DIR}x/notes.md`]: "# notes\n" });
    expect(lookalike.hasExistingAgents).toBe(false);
    expect(isGreenfield(lookalike)).toBe(true);
  });

  it("classifies a repository with source history as brownfield", async () => {
    const sourced = await analyze({ "tsconfig.json": "{}", "src/index.ts": "export const x = 1;\n" });
    expect(sourced.languages).toContain("typescript");
    expect(isGreenfield(sourced)).toBe(false);
  });

  it("classifies a repo carrying an agent-tool surface as brownfield, whoever wrote it", async () => {
    // SPLIT OUT AND RE-TITLED, assertion unchanged. This arm used to sit under
    // "source history" as the other tool's configuration case, and
    // `.cursor/rules/*.mdc` cannot prove that: it is exactly what this engine's
    // own cursor adapter emits (`CURSOR_RULES_DIR` in src/adapters/cursor.ts).
    // What the row actually pins is the weaker true statement — the predicate
    // reads the surface and not its author — which is also why the residual
    // below exists.
    const info = await analyze({
      [`${STATE_DIR}/manifest.json`]: "{}",
      ".cursor/rules/house.mdc": "---\n---\n",
    });
    expect(isGreenfield(info)).toBe(false);
  });

  it("is still brownfield on a repo this engine already emitted into (open residual)", async () => {
    // The OPEN half of the greenfield defect, pinned rather than left implicit.
    // This fixture is what `init --tools cursor` leaves behind on an empty
    // directory — the state directory, the root charter, one adapter directory
    // — and it is the state every post-init `sync` re-analyses. So the verdict
    // is `false` for a repository that was empty before the run, which is the
    // defect: `existingTools` reports the surface, and all five rows of the
    // agent-tool table are surfaces this engine writes.
    //
    // Closing it means persisting the init-time verdict and having `sync` read
    // it instead of re-deriving it, across src/cli/commands/init/apply.ts,
    // src/cli/commands/sync/engine.ts and the manifest schema — none of which
    // this unit owns. When that lands, this expectation flips to `true` and
    // this case is the regression net that forces the update.
    const postInit = await analyze({
      [`${STATE_DIR}/manifest.json`]: "{}",
      "AGENTS.md": "# charter\n",
      ".cursor/rules/stamity-house.mdc": "---\n---\n",
    });

    expect(postInit.languages).toEqual([]);
    expect(postInit.existingTools).toEqual(["cursor", "agents"]);
    expect(isGreenfield(postInit)).toBe(false);
  });

  it("drops a base framework the detected meta-framework already wraps", async () => {
    const info = await analyze({
      "package.json": json({ dependencies: { next: "15.0.0", react: "19.0.0", express: "5.0.0" } }),
    });

    expect(info.frameworks).toContain("next");
    expect(info.frameworks).toContain("express");
    expect(info.frameworks).not.toContain("react");
  });

  it("reads a framework out of a language-native manifest by dependency, not by file", async () => {
    const phoenix = await analyze({ "mix.exs": 'defp deps do [{:phoenix, "~> 1.7"}] end\n' });
    expect(phoenix.frameworks).toEqual(["phoenix"]);

    const plainElixir = await analyze({ "mix.exs": "defp deps do [] end\n" });
    expect(plainElixir.frameworks).toEqual([]);
    expect(plainElixir.languages).toContain("elixir");
  });

  it("does not read Flask off a file every Python web stack writes", async () => {
    // `wsgi.py` is the WSGI entry point, not Flask's: Django, Pyramid and a
    // hand-rolled app all write one. Only a declared dependency says Flask.
    const bare = await analyze({ "wsgi.py": "application = None\n", "setup.py": "" });
    expect(bare.frameworks).not.toContain("flask");

    const declared = await analyze({
      "wsgi.py": "application = None\n",
      "requirements.txt": "flask==3.0.0\n",
    });
    expect(declared.frameworks).toContain("flask");

    const pyproject = await analyze({ "pyproject.toml": '[project]\ndependencies = ["Flask"]\n' });
    expect(pyproject.frameworks).toContain("flask");
  });

  it("does not read Rails off a plain Rakefile", async () => {
    // A Rakefile is Ruby build tooling; `config/routes.rb` and `bin/rails` are
    // written by `rails new` and by nothing else.
    const rakeOnly = await analyze({ Rakefile: "task :default\n", Gemfile: "source 'x'\n" });
    expect(rakeOnly.frameworks).not.toContain("rails");

    const routes = await analyze({ "config/routes.rb": "Rails.application.routes.draw do\nend\n" });
    expect(routes.frameworks).toContain("rails");

    const binScript = await analyze({ "bin/rails": "#!/usr/bin/env ruby\n" });
    expect(binScript.frameworks).toContain("rails");
  });

  it("does not read Spring off a JVM application-config file", async () => {
    // `src/main/resources/application.{properties,yml}` is a config LOCATION
    // any JVM app may use; the spring-boot coordinate in the build file is the
    // signal.
    const configOnly = await analyze({
      "src/main/resources/application.yml": "server:\n  port: 8080\n",
      "pom.xml": "<project><artifactId>plain</artifactId></project>\n",
    });
    expect(configOnly.frameworks).not.toContain("spring");

    const maven = await analyze({
      "pom.xml": "<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>\n",
    });
    expect(maven.frameworks).toContain("spring");

    // Both spellings, each on its own repo: the Gradle plugin id hyphenates
    // differently from the artifact id, and only checking one would miss half
    // the Spring repos in existence.
    const gradle = await analyze({
      "build.gradle": 'plugins { id "org.springframework.boot" version "3.2.0" }\n',
    });
    expect(gradle.frameworks).toContain("spring");

    const gradleKts = await analyze({
      "build.gradle.kts": 'dependencies { implementation("org.springframework.boot:spring-boot-starter") }\n',
    });
    expect(gradleKts.frameworks).toContain("spring");
  });
});

describe("detectLanguages", () => {
  it("enumerates every detectable language, including the extension-scanned one", () => {
    expect(DETECTABLE_LANGUAGES).toEqual([...Object.keys(LANGUAGE_INDICATORS), "csharp"]);
    expect(new Set(DETECTABLE_LANGUAGES).size).toBe(DETECTABLE_LANGUAGES.length);
  });

  it.each(Object.entries(LANGUAGE_INDICATORS))(
    "identifies %s from its indicator file",
    async (language, files) => {
      const root = await seedRepo({ [files[0] as string]: "" });
      await expect(detectLanguages(root)).resolves.toContain(language);
    },
  );

  it("finds csharp by project file and ignores a directory of the same shape", async () => {
    const withProject = await seedRepo({ "App.csproj": "<Project />\n" });
    await expect(detectLanguages(withProject)).resolves.toEqual(["csharp"]);

    const decoy = await seedRepo({ "App.sln/notes.txt": "" });
    await expect(detectLanguages(decoy)).resolves.toEqual([]);
  });
});

describe("detectMonorepoPackages", () => {
  const rootManifest = json({ name: "root", private: true });

  it("enumerates pnpm workspace packages and never walks an installed tree", async () => {
    const root = await seedRepo({
      "package.json": rootManifest,
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "packages/a/package.json": json({ name: "@acme/a" }),
      "packages/b/package.json": json({ version: "1.0.0" }),
      // Neither of these is a workspace package: one is an installed dependency
      // tree, the other a tool cache. Both carry a package.json, so only the name
      // filters keep them out.
      "packages/node_modules/package.json": json({ name: "hoisted-dependency" }),
      "packages/.cache/package.json": json({ name: "cache" }),
    });

    await expect(detectMonorepoPackages(root)).resolves.toEqual([
      { name: "@acme/a", path: "packages/a" },
      { name: "b", path: "packages/b" },
    ]);
  });

  it("reads flow-style workspace lists as well as block style", async () => {
    const root = await seedRepo({
      "package.json": rootManifest,
      "pnpm-workspace.yaml": "packages: ['packages/*']\n",
      "packages/a/package.json": json({ name: "@acme/a" }),
    });

    await expect(detectMonorepoPackages(root)).resolves.toEqual([
      { name: "@acme/a", path: "packages/a" },
    ]);
  });

  it.each([
    ["a workspaces array", json({ workspaces: ["packages/*"] })],
    ["a workspaces object", json({ workspaces: { packages: ["packages/*"] } })],
  ])("reads %s from package.json", async (_case, manifest) => {
    const root = await seedRepo({
      "package.json": manifest,
      "packages/a/package.json": json({ name: "@acme/a" }),
    });

    await expect(detectMonorepoPackages(root)).resolves.toEqual([
      { name: "@acme/a", path: "packages/a" },
    ]);
  });

  it("reads lerna globs and exact, wildcard-free paths", async () => {
    const root = await seedRepo({
      "package.json": rootManifest,
      "lerna.json": json({ packages: ["tools/cli"] }),
      "tools/cli/package.json": json({ name: "@acme/cli" }),
    });

    await expect(detectMonorepoPackages(root)).resolves.toEqual([
      { name: "@acme/cli", path: "tools/cli" },
    ]);
  });

  it("returns nothing for a single-package repo or an unparseable workspace file", async () => {
    const single = await seedRepo({ "package.json": json({ name: "solo" }) });
    await expect(detectMonorepoPackages(single)).resolves.toEqual([]);

    const broken = await seedRepo({
      "package.json": rootManifest,
      "pnpm-workspace.yaml": "packages:\n  - [unterminated\n",
    });
    await expect(detectMonorepoPackages(broken)).resolves.toEqual([]);
  });

  it("skips a candidate directory whose package.json is missing or malformed", async () => {
    const root = await seedRepo({
      "package.json": json({ workspaces: ["packages/*"] }),
      "packages/a/package.json": json({ name: "@acme/a" }),
      "packages/docs/README.md": "# not a package\n",
      "packages/broken/package.json": "{ not json",
    });

    await expect(detectMonorepoPackages(root)).resolves.toEqual([
      { name: "@acme/a", path: "packages/a" },
    ]);
  });

  it("follows a symlinked package once and does not chase a cycle", async () => {
    const root = await seedRepo({
      "package.json": json({ name: "root", workspaces: ["packages/*"] }),
      "packages/a/package.json": json({ name: "@acme/a" }),
    });
    // `mirror` is a second route to a package already listed; `up` points back at
    // the repository root, itself a package.json-bearing directory — the cycle a
    // naive walk would re-enter.
    await symlink("a", join(root, "packages", "mirror"), "dir");
    await symlink("..", join(root, "packages", "up"), "dir");

    await expect(detectMonorepoPackages(root)).resolves.toEqual([
      { name: "@acme/a", path: "packages/a" },
    ]);
  });

  it("follows a symlink that is the only route to a package", async () => {
    const root = await seedRepo({
      "package.json": json({ name: "root", workspaces: ["packages/*"] }),
      "external/tool/package.json": json({ name: "@acme/tool" }),
      "packages/.keep": "",
    });
    await symlink("../external/tool", join(root, "packages", "tool"), "dir");

    await expect(detectMonorepoPackages(root)).resolves.toEqual([
      { name: "@acme/tool", path: "packages/tool" },
    ]);
  });
});

describe("toolchain probes", () => {
  it("does not report a python linter that pyproject.toml never configures", async () => {
    const bare = await seedRepo({ "pyproject.toml": '[project]\nname = "app"\n' });
    await expect(detectLinters(bare)).resolves.toEqual([]);

    const ruff = await seedRepo({
      "pyproject.toml": '[project]\nname = "app"\n\n[tool.ruff.lint]\nselect = ["E"]\n',
    });
    await expect(detectLinters(ruff)).resolves.toEqual(["ruff"]);

    const black = await seedRepo({ "pyproject.toml": "[tool.black]\nline-length = 100\n" });
    await expect(detectLinters(black)).resolves.toEqual(["black"]);
  });

  it("reads a linter out of an embedded package.json block", async () => {
    const root = await seedRepo({ "package.json": json({ eslintConfig: { root: true } }) });
    await expect(detectLinters(root)).resolves.toEqual(["eslint"]);
  });

  it("falls back to a wired lint script only when no linter was identified", async () => {
    const scriptOnly = await seedRepo({ "package.json": json({ scripts: { lint: "oxlint" } }) });
    await expect(detectLinters(scriptOnly)).resolves.toEqual(["lint-script"]);

    const alsoConfigured = await seedRepo({
      "package.json": json({ scripts: { lint: "eslint ." } }),
      ".eslintrc.json": "{}",
    });
    await expect(detectLinters(alsoConfigured)).resolves.toEqual(["eslint"]);
  });

  it("ignores the placeholder test script npm init writes", async () => {
    const placeholder = await seedRepo({
      "package.json": json({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    });
    await expect(detectTestFrameworks(placeholder)).resolves.toEqual([]);

    const wired = await seedRepo({ "package.json": json({ scripts: { test: "node --test" } }) });
    await expect(detectTestFrameworks(wired)).resolves.toEqual(["test-script"]);

    const embedded = await seedRepo({ "package.json": json({ jest: { preset: "ts-jest" } }) });
    await expect(detectTestFrameworks(embedded)).resolves.toEqual(["jest"]);
  });

  it("reports every CI provider with a pipeline in the repository", async () => {
    const root = await seedRepo({
      ".github/workflows/ci.yml": "name: CI\n",
      ".gitlab-ci.yml": "stages: []\n",
      Jenkinsfile: "pipeline {}\n",
    });

    await expect(detectCIProviders(root)).resolves.toEqual([
      "github-actions",
      "gitlab-ci",
      "jenkins",
    ]);
  });

  it("does not read the engine's own copilot workflow as a CI pipeline", async () => {
    // Self-detection fixpoint: the copilot adapter writes this exact path, and
    // detection re-runs on every sync/check. Keying github-actions on directory
    // existence made a no-CI repo detect its own output on run 2 and rewrite
    // the charter's CI line with zero user changes.
    const engineOnly = await seedRepo({
      [`${COPILOT_SETUP_STEPS_PATH}`]: "name: copilot-setup-steps\n",
    });
    await expect(detectCIProviders(engineOnly)).resolves.toEqual([]);

    const empty = await seedRepo({ ".github/workflows/.gitkeep": "" });
    await expect(detectCIProviders(empty)).resolves.toEqual([]);

    const real = await seedRepo({
      [`${COPILOT_SETUP_STEPS_PATH}`]: "name: copilot-setup-steps\n",
      ".github/workflows/release.yaml": "name: release\n",
    });
    await expect(detectCIProviders(real)).resolves.toEqual(["github-actions"]);
  });

  it("keeps the detector's exclusion list in step with the adapter that emits it", () => {
    // The detector names the workflow locally (no detect -> adapters import
    // edge); this is the guard against the two spellings drifting apart.
    expect(COPILOT_SETUP_STEPS_PATH).toBe(".github/workflows/copilot-setup-steps.yml");
  });

  it("detects a container build from any of its root-level definitions", async () => {
    const compose = await seedRepo({ "compose.yaml": "services: {}\n" });
    await expect(detectDockerfile(compose)).resolves.toBe(true);

    const devcontainer = await seedRepo({ ".devcontainer/devcontainer.json": "{}" });
    await expect(detectDockerfile(devcontainer)).resolves.toBe(true);

    const none = await seedRepo({ "package.json": "{}" });
    await expect(detectDockerfile(none)).resolves.toBe(false);
  });

  it("detects data artifacts from a data directory or a root-level dataset", async () => {
    const dataDir = await seedRepo({ "data/notes.txt": "" });
    await expect(detectDataArtifacts(dataDir)).resolves.toBe(true);

    const dataset = await seedRepo({ "measurements.parquet": "" });
    await expect(detectDataArtifacts(dataset)).resolves.toBe(true);

    const none = await seedRepo({ "src/index.ts": "" });
    await expect(detectDataArtifacts(none)).resolves.toBe(false);
  });
});

describe("isGreenfield", () => {
  // MODIFIED: the fourth row's expectation moved from `false` to `true`, and
  // `hasExistingAgents` left the input shape because the predicate no longer
  // reads it. That field is `hasOwnState || existingTools.length > 0`, so the
  // only case it decided on its own was "our own `.stamity/` exists" — which is
  // this engine's output, not a fact about the repository. Rows 1-3 are
  // unchanged in input and expectation.
  //
  // Row 3 is named for what the input encodes and no more: a `cursor` row in
  // `existingTools` says a cursor surface is on disk, NOT that another vendor
  // put it there — this engine emits `.cursor/` itself. The on-disk cases that
  // distinguish the two live in the `analyzeRepo` block above, including the
  // open residual.
  it.each([
    ["nothing detected", { languages: [], existingTools: [] }, true],
    ["a detected language", { languages: ["typescript"], existingTools: [] }, false],
    ["an agent-tool surface on disk", { languages: [], existingTools: ["cursor"] }, false],
    ["this engine's own state, which never reaches existingTools", { languages: [], existingTools: [] }, true],
  ])("is %s → %s", (_case, info, expected) => {
    expect(isGreenfield(info)).toBe(expected);
  });
});

describe("formatRepoSummary", () => {
  it("prints one line per detected signal and omits the rest", () => {
    const summary = formatRepoSummary(
      emptyInfo("/repo", {
        languages: ["typescript"],
        packageManager: "pnpm",
        frameworks: ["next"],
        linters: ["eslint"],
        ciProviders: ["github-actions"],
        monorepoPackages: [
          { name: "@acme/a", path: "apps/a" },
          { name: "@acme/b", path: "apps/b" },
          { name: "@acme/c", path: "packages/c" },
          { name: "@acme/d", path: "packages/d" },
        ],
        hasDockerfile: true,
      }),
    );

    expect(summary).toBe(
      [
        "Languages: typescript",
        "Package manager: pnpm",
        "Frameworks: next",
        "Linters: eslint",
        "CI: github-actions",
        "Workspace packages: 4 (apps/a, apps/b, packages/c, +1 more)",
        "Container build: yes",
      ].join("\n"),
    );
  });

  it("says so when there is nothing to report", () => {
    expect(formatRepoSummary(emptyInfo("/repo"))).toBe("No stack signals detected.");
  });
});

/*
 * TEST CHANGE, justified: a maintainer ruling deleted `src/detect/projectType.ts`
 * as unwired dead code, so the `describe("detectProjectType")` block that used
 * to sit here — and the `verdict()` helper it alone used — went with the module
 * they covered. Nothing that still ships lost coverage: every case in the block
 * exercised `detectProjectType`, which no longer exists.
 *
 * Same rework deleted `test/detect/aux.test.ts`, which covered
 * `src/detect/installContext.ts` and `src/detect/conventionConflict.ts` (both
 * also deleted) AND `src/detect/stackSupport.ts`, which is KEPT and wired into
 * the init stack-suggestion pass. stackSupport's coverage is a hand-off, not a
 * drop: its successor file is `test/detect/stackSupport.test.ts`, written by the
 * unit that wires it, and the module is uncovered until that unit lands.
 */

/**
 * A workspace directory the process cannot read. `node:fs/promises` is mocked
 * for this one case: a chmod-based denial is a no-op for a root user, so the
 * assertion would quietly stop testing anything in a container that runs as
 * root.
 */
describe("unreadable directories", () => {
  afterEach(() => {
    vi.doUnmock("node:fs/promises");
    vi.resetModules();
  });

  it("skips a workspace directory that denies a read rather than failing the analysis", async () => {
    const root = await seedRepo({
      "package.json": json({ name: "root", workspaces: ["packages/*"] }),
      "tsconfig.json": "{}",
      "packages/a/package.json": json({ name: "@acme/a" }),
    });
    const denied = join(root, "packages");

    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof NodeFsPromises>();
      const readdir = (path: unknown, options: unknown): unknown => {
        if (path === denied) {
          return Promise.reject(
            Object.assign(new Error(`EACCES: permission denied, scandir '${denied}'`), {
              code: "EACCES",
            }),
          );
        }
        return (actual.readdir as (target: unknown, opts: unknown) => unknown)(path, options);
      };
      return { ...actual, readdir: readdir as unknown as typeof actual.readdir };
    });

    const isolated = await import("../../src/detect/repoAnalyzer.ts");
    const info = await isolated.analyzeRepo(root);

    expect(info.monorepoPackages).toEqual([]);
    expect(info.languages).toContain("typescript");
  });
});
