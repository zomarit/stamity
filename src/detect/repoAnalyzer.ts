import type { Dirent } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { isPlainObject, parseYamlStrict } from "../config/parse.ts";
import type { Framework, PackageEntry, RepoInfo } from "../types/detect.ts";
import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import type { DetectedSummary } from "../types/detect.ts";
import { detectPackageManager } from "./packageManager.ts";

/**
 * Repository analysis: what stack a repo already runs, read off the files it
 * committed.
 *
 * Every result here is advisory evidence — it picks defaults and fills
 * generated guidance, it never gates a run. So every probe answers a presence
 * question and no probe can fail: an unreadable directory, a manifest that does
 * not parse, a symlink pointing nowhere are each a missing signal rather than
 * an error. Refusing to analyse a repository because one subdirectory denied a
 * read would be a strictly worse outcome than analysing the rest of it.
 *
 * Probing is shallow by design: the repository root, plus exactly one level
 * into the directories a workspace file declares. There is no recursive tree
 * walk, so cost stays flat on large repositories and an installed dependency
 * tree never enters the analysis.
 *
 * Detection reports; it does not filter. Names are emitted as plain strings
 * because a repo legitimately carries tools this engine has no support for, and
 * hiding them would make the analysis lie about the repository.
 */

/** One detection row: the name to report, and the repo-relative paths whose presence implies it. */
interface Indicator<T extends string> {
  readonly name: T;
  readonly files: readonly string[];
}

/**
 * Config files that identify a language. Presence of any one file in a row
 * reports that row's language, so the table is also the closed set of languages
 * filename probing can emit — `csharp` is the one outlier, found by extension
 * scan below and appended to {@link DETECTABLE_LANGUAGES}.
 */
export const LANGUAGE_INDICATORS: Record<string, string[]> = {
  typescript: ["tsconfig.json", "tsconfig.base.json", "tsconfig.app.json"],
  javascript: ["jsconfig.json", ".babelrc", "babel.config.js", "babel.config.json"],
  python: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile", "setup.cfg", "tox.ini"],
  rust: ["Cargo.toml", "Cargo.lock"],
  go: ["go.mod", "go.sum"],
  java: ["pom.xml", "build.gradle"],
  kotlin: ["build.gradle.kts"],
  ruby: ["Gemfile", ".ruby-version"],
  php: ["composer.json", "artisan"],
  swift: ["Package.swift"],
  dart: ["pubspec.yaml"],
  elixir: ["mix.exs"],
  scala: ["build.sbt"],
  zig: ["build.zig"],
  ocaml: ["dune-project"],
  haskell: ["stack.yaml", "cabal.project"],
  clojure: ["deps.edn", "project.clj"],
  lua: [".luacheckrc", "rockspec"],
};

/**
 * Every language name {@link detectLanguages} can return. Content selection maps
 * languages to tags, so a language added above without a matching mapping would
 * silently strip language-scoped content — this export is what lets that skew be
 * asserted in one place instead of discovered by a user.
 */
export const DETECTABLE_LANGUAGES: readonly string[] = [
  ...Object.keys(LANGUAGE_INDICATORS),
  "csharp",
];

/** Frameworks identified by a config file at the repo root. */
const FRAMEWORK_CONFIG_INDICATORS: readonly Indicator<Framework>[] = [
  { name: "next", files: ["next.config.js", "next.config.mjs", "next.config.ts"] },
  { name: "angular", files: ["angular.json"] },
  { name: "svelte", files: ["svelte.config.js", "svelte.config.ts"] },
  { name: "nuxt", files: ["nuxt.config.js", "nuxt.config.ts"] },
  { name: "astro", files: ["astro.config.mjs", "astro.config.ts"] },
];

/**
 * Frameworks identified by a `package.json` dependency name. Meta-frameworks
 * are listed before the base framework they wrap so {@link FRAMEWORK_SUPPRESSION}
 * has both entries to reconcile.
 */
const FRAMEWORK_DEP_INDICATORS: readonly { framework: Framework; deps: readonly string[] }[] = [
  { framework: "next", deps: ["next"] },
  { framework: "angular", deps: ["@angular/core"] },
  { framework: "sveltekit", deps: ["@sveltejs/kit"] },
  { framework: "svelte", deps: ["svelte"] },
  { framework: "nuxt", deps: ["nuxt"] },
  { framework: "remix", deps: ["@remix-run/react"] },
  { framework: "astro", deps: ["astro"] },
  { framework: "vue", deps: ["vue"] },
  { framework: "tanstack-start", deps: ["@tanstack/start", "@tanstack/react-start"] },
  { framework: "solid-start", deps: ["@solidjs/start", "solid-start"] },
  { framework: "qwik", deps: ["@builder.io/qwik", "@qwik.dev/core"] },
  { framework: "react", deps: ["react"] },
  { framework: "express", deps: ["express"] },
  { framework: "fastify", deps: ["fastify"] },
  { framework: "hono", deps: ["hono"] },
  { framework: "nestjs", deps: ["@nestjs/core"] },
];

/**
 * Non-JS frameworks identified by a file only that framework's scaffolding
 * creates.
 *
 * "Only that framework" is the whole bar, and three rows used to miss it:
 * `wsgi.py` is the WSGI entry point every Python web stack writes (Django and
 * Pyramid included), `Rakefile` is plain Ruby build tooling, and
 * `src/main/resources/application.{properties,yml}` is the config location of
 * any JVM app that uses it. Each wrote a false framework name into the
 * charter's confident register; each moved to a dependency indicator below,
 * which is the same discipline {@link NON_JS_FRAMEWORK_DEP_INDICATORS} already
 * states for `mix.exs` and {@link PYPROJECT_LINTER_SECTIONS} for
 * `pyproject.toml`. `config/routes.rb` and `bin/rails` stay: both are written
 * by `rails new` and by nothing else.
 */
const NON_JS_FRAMEWORK_INDICATORS: readonly Indicator<Framework>[] = [
  { name: "django", files: ["manage.py"] },
  { name: "rails", files: [join("config", "routes.rb"), join("bin", "rails")] },
  { name: "laravel", files: ["artisan"] },
];

/**
 * Non-JS frameworks identified by a dependency name appearing anywhere in a
 * language-native manifest body.
 *
 * The match is a substring rather than a parse: `Cargo.toml`, `pyproject.toml`,
 * `requirements.txt`, and `mix.exs` each declare dependencies in a different
 * syntax, and parsing four formats buys nothing a substring does not already
 * give. The failure mode is a comment mentioning the framework, which produces
 * one extra line of guidance — cheap next to four parsers.
 *
 * Note the keys: the framework signal is the declared dependency, never the
 * manifest itself. `mix.exs` exists in every Elixir project, so keying Phoenix
 * to the file would report a web framework for every Elixir library; the
 * `:phoenix` atom appears only when Phoenix is actually a dependency.
 */
const NON_JS_FRAMEWORK_DEP_INDICATORS: readonly {
  framework: Framework;
  manifest: string;
  deps: readonly string[];
}[] = [
  { framework: "fastapi", manifest: "pyproject.toml", deps: ["fastapi"] },
  { framework: "fastapi", manifest: "requirements.txt", deps: ["fastapi"] },
  { framework: "flask", manifest: "pyproject.toml", deps: ["flask", "Flask"] },
  { framework: "flask", manifest: "requirements.txt", deps: ["flask", "Flask"] },
  { framework: "axum", manifest: "Cargo.toml", deps: ["axum"] },
  { framework: "actix", manifest: "Cargo.toml", deps: ["actix-web", "actix_web"] },
  { framework: "phoenix", manifest: "mix.exs", deps: [":phoenix"] },
  // The Spring Boot coordinate, not the file: `pom.xml` and `build.gradle` are
  // the JVM's build files, not Spring's. Two spellings because the artifact id
  // (`spring-boot-starter-*`, the Maven parent) and the Gradle plugin id
  // (`org.springframework.boot`) hyphenate differently.
  { framework: "spring", manifest: "pom.xml", deps: ["spring-boot", "springframework.boot"] },
  { framework: "spring", manifest: "build.gradle", deps: ["spring-boot", "springframework.boot"] },
  {
    framework: "spring",
    manifest: "build.gradle.kts",
    deps: ["spring-boot", "springframework.boot"],
  },
];

/** Meta-framework → the base framework it wraps, which is dropped when both are detected. */
const FRAMEWORK_SUPPRESSION: readonly (readonly [Framework, Framework])[] = [
  ["next", "react"],
  ["remix", "react"],
  ["tanstack-start", "react"],
  ["nuxt", "vue"],
  ["sveltekit", "svelte"],
];

/** Linters and formatters identified by a dedicated config file. */
const LINTER_INDICATORS: readonly Indicator<string>[] = [
  { name: "eslint", files: [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml",
    ".eslintrc.cjs", "eslint.config.js", "eslint.config.mjs", "eslint.config.ts"] },
  { name: "prettier", files: [".prettierrc", ".prettierrc.js", ".prettierrc.json",
    ".prettierrc.yml", ".prettierrc.cjs", "prettier.config.js", "prettier.config.mjs"] },
  { name: "biome", files: ["biome.json", "biome.jsonc"] },
  { name: "oxlint", files: [".oxlintrc.json"] },
  { name: "ruff", files: ["ruff.toml", ".ruff.toml"] },
  { name: "rubocop", files: [".rubocop.yml"] },
  { name: "golangci-lint",
    files: [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"] },
  { name: "clippy", files: [".clippy.toml", "clippy.toml"] },
  { name: "checkstyle", files: ["checkstyle.xml"] },
  { name: "stylelint", files: [".stylelintrc", ".stylelintrc.json", ".stylelintrc.yml",
    "stylelint.config.js"] },
  { name: "deno-lint", files: ["deno.json", "deno.jsonc"] },
];

/**
 * Python linters configured inside `pyproject.toml`, matched on their table
 * header. The file's mere presence is not the signal: `pyproject.toml` is the
 * standard Python project manifest, so keying a linter to the file would report
 * it for every Python repository whether or not that tool is configured.
 * `[tool.ruff` (no closing bracket) also matches the `[tool.ruff.lint]` form.
 */
const PYPROJECT_LINTER_SECTIONS: readonly { name: string; section: string }[] = [
  { name: "ruff", section: "[tool.ruff" },
  { name: "black", section: "[tool.black]" },
];

/** Linters that support an embedded `package.json` config block instead of an rc file. */
const LINTER_MANIFEST_KEYS: readonly { name: string; key: string }[] = [
  { name: "eslint", key: "eslintConfig" },
  { name: "prettier", key: "prettier" },
];

/** Test frameworks identified by a dedicated config file. */
const TEST_FRAMEWORK_INDICATORS: readonly Indicator<string>[] = [
  { name: "vitest", files: ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"] },
  { name: "jest", files: ["jest.config.js", "jest.config.ts", "jest.config.mjs",
    "jest.config.json"] },
  { name: "mocha", files: [".mocharc.yml", ".mocharc.json", ".mocharc.js"] },
  { name: "pytest", files: ["pytest.ini", "conftest.py"] },
  { name: "rspec", files: [".rspec", join("spec", "spec_helper.rb")] },
  { name: "junit", files: [join("src", "test", "java")] },
  // Go and Rust ship their runner in the toolchain: the module manifest is the
  // only evidence a repo can give that `go test` / `cargo test` are available.
  { name: "go-test", files: ["go.mod"] },
  { name: "cargo-test", files: ["Cargo.toml"] },
  { name: "phpunit", files: ["phpunit.xml", "phpunit.xml.dist"] },
  { name: "playwright", files: ["playwright.config.ts", "playwright.config.js"] },
  { name: "cypress", files: ["cypress.config.ts", "cypress.config.js", "cypress.json"] },
];

/** Test frameworks that support an embedded `package.json` config block. */
const TEST_MANIFEST_KEYS: readonly { name: string; key: string }[] = [{ name: "jest", key: "jest" }];

/**
 * Reported when a wired `lint` / `test` script is the only evidence of a
 * toolchain. The script body is not parsed, so the name says what is known —
 * something runs — without guessing which tool it runs.
 */
const LINT_SCRIPT_FALLBACK = "lint-script";
const TEST_SCRIPT_FALLBACK = "test-script";

/**
 * Workflow filenames this engine emits into `.github/workflows/` itself —
 * currently the Copilot coding agent's environment-preparation workflow
 * (`src/adapters/copilot.ts`, `COPILOT_SETUP_STEPS_PATH`). Named here rather
 * than imported so the detector keeps no edge into the adapter layer;
 * `test/detect/repoAnalyzer.test.ts` asserts the two spellings agree.
 *
 * These names are excluded from the github-actions probe because detection
 * runs fresh on every sync and check: keying CI on the mere existence of
 * `.github/workflows/` made a copilot-selected repo detect its OWN output on
 * the second run, flipping the emitted charter's CI line from `unknown` to
 * `github-actions` with zero user changes — emission that is not a fixpoint,
 * and a detected fact that is false (no pipeline exists).
 */
const ENGINE_EMITTED_WORKFLOWS: ReadonlySet<string> = new Set(["copilot-setup-steps.yml"]);

/** Extensions GitHub Actions reads inside `.github/workflows/`. */
const WORKFLOW_EXTENSIONS: readonly string[] = [".yml", ".yaml"];

/** Repo-relative directory GitHub Actions reads workflow definitions from. */
const GITHUB_WORKFLOWS_DIR = join(".github", "workflows");

/**
 * CI providers identified by their config file or pipeline directory.
 * `github-actions` is NOT in this table — it needs a workflow FILE the engine
 * did not write, which {@link hasForeignWorkflow} answers.
 */
const CI_PROVIDER_INDICATORS: readonly Indicator<string>[] = [
  { name: "gitlab-ci", files: [".gitlab-ci.yml"] },
  { name: "circleci", files: [join(".circleci", "config.yml")] },
  { name: "travis", files: [".travis.yml"] },
  { name: "jenkins", files: ["Jenkinsfile"] },
  { name: "azure-pipelines", files: ["azure-pipelines.yml"] },
  { name: "bitbucket-pipelines", files: ["bitbucket-pipelines.yml"] },
  { name: "buildkite", files: [join(".buildkite", "pipeline.yml")] },
  { name: "drone", files: [".drone.yml"] },
  { name: "woodpecker", files: [".woodpecker.yml", ".woodpecker"] },
];

/** Root files that mean a container or dev-container build is defined for the repo. */
const CONTAINER_INDICATORS: readonly string[] = [
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  ".devcontainer",
  ".devcontainer.json",
];

/**
 * Agent-tool configuration surfaces that may exist in the repository.
 *
 * Detected so a generated setup can adopt or sit beside what a repo already
 * uses instead of overwriting it. `AGENTS.md` is the cross-tool convention
 * rather than one vendor's file, and is reported under its own name.
 *
 * A row reports the surface, never its author. Every one of these five is also
 * a path this engine emits — root `AGENTS.md` for any non-empty tool selection
 * (`src/emit/planner.ts`, shared core rows), then `CLAUDE.md` and `.claude/`,
 * `.cursor/`, `.github/copilot-instructions.md`, `.codex/` from the matching
 * adapters — so from the first `init` onward the repo's own generated setup is
 * in `existingTools` too. That inclusive reading is load-bearing rather than
 * incidental: `checkToolTraces` in `src/cli/commands/check.ts` reports a
 * targeted tool with no matching row as an emission that was deleted or never
 * written. A caller that needs "some OTHER vendor's tool" — {@link isGreenfield}
 * is the only one — cannot get it by narrowing this table; see the residual
 * recorded there.
 */
const AGENT_TOOL_INDICATORS: readonly Indicator<string>[] = [
  { name: "claude", files: ["CLAUDE.md", ".claude"] },
  { name: "cursor", files: [".cursor"] },
  { name: "copilot", files: [join(".github", "copilot-instructions.md")] },
  { name: "codex", files: [".codex"] },
  { name: "agents", files: ["AGENTS.md", "AGENT.md"] },
];

/** Directory names never treated as workspace packages, whatever a glob matches. */
const NON_PACKAGE_DIRS: ReadonlySet<string> = new Set(["node_modules"]);

/**
 * Analyse the repository rooted at `rootDir`.
 *
 * All probes run concurrently — they are independent reads, and the total cost
 * is one round of I/O rather than a dozen sequential ones. A `rootDir` that
 * does not exist analyses to an empty result rather than throwing, for the same
 * reason every other absent thing does: absence is an answer.
 *
 * `packageManager` is set only when the repository actually showed evidence of
 * one (a lockfile or a Corepack pin). The detector's npm fallback is a safe
 * default for running commands, not an observation, so recording it here would
 * put a guess into a field callers read as a fact.
 */
export async function analyzeRepo(rootDir: string): Promise<RepoInfo> {
  const [
    languages,
    packageManager,
    frameworks,
    linters,
    testFrameworks,
    ciProviders,
    monorepoPackages,
    packageScripts,
    hasDockerfile,
    hasDataArtifacts,
    existingTools,
    hasOwnState,
  ] = await Promise.all([
    detectLanguages(rootDir),
    detectPackageManager(rootDir),
    detectFrameworks(rootDir),
    detectLinters(rootDir),
    detectTestFrameworks(rootDir),
    detectCIProviders(rootDir),
    detectMonorepoPackages(rootDir),
    detectPackageScripts(rootDir),
    detectDockerfile(rootDir),
    detectDataArtifacts(rootDir),
    presentIndicators(rootDir, AGENT_TOOL_INDICATORS),
    dirExists(join(rootDir, STATE_DIR)),
  ]);

  const observed = packageManager.lockfile !== null || packageManager.fromPackageJsonField;
  return {
    rootDir,
    languages,
    frameworks,
    linters,
    testFrameworks,
    ciProviders,
    ...(observed ? { packageManager: packageManager.name } : {}),
    ...(packageScripts === null ? {} : { packageScripts }),
    monorepoPackages,
    hasDockerfile,
    hasDataArtifacts,
    hasExistingAgents: hasOwnState || existingTools.length > 0,
    existingTools,
  };
}

/**
 * Whether the repository is greenfield: no language identified and no agent
 * tool's configuration on disk.
 *
 * One predicate, one definition. The classification decides how much a first
 * run may assume, and two call sites drifting apart on what "greenfield" means
 * is exactly how a brownfield repository gets treated as empty.
 *
 * `hasExistingAgents` is deliberately not read. It folds in this engine's own
 * `{@link STATE_DIR}` (`analyzeRepo` sets it from `hasOwnState || existingTools
 * .length > 0`), and that directory exists from the first `init` onward, so on
 * its own it decided nothing about the repository. The exclusion is by field,
 * not by name prefix: a user-authored directory whose name merely starts with
 * the same characters (`.stamityx/`, `.stamity-notes/`) is untouched by it, since
 * those never fed `hasOwnState`, which stats the exact `{@link STATE_DIR}` path.
 *
 * KNOWN RESIDUAL, and the reason this predicate is not yet trustworthy after
 * the first run: the verdict is still `false` on every repository this engine
 * has emitted into. `existingTools` reports a surface and not its author, and
 * all five rows of {@link AGENT_TOOL_INDICATORS} are surfaces this engine
 * writes, so a `sync` that re-derives the verdict is reading this engine's own
 * output back as evidence — the fixpoint failure the `github-actions` probe
 * closed with {@link ENGINE_EMITTED_WORKFLOWS}, still open here. Only the
 * `{@link STATE_DIR}` instance of it is closed above.
 *
 * It is not closable inside detection, and subtracting the ledger's
 * engine-emitted paths would replace it with a worse answer: `LedgerEntry`
 * (`src/types/manifest.ts`) records path, owner, artifact id and content hash
 * with no create-versus-merge discriminator, so a repository that already
 * carried `.claude/` before `init` merged into it would subtract to greenfield
 * — trading a constant `false` for an occasional wrong `true`. Greenfield is an
 * `init`-time fact; the close is to persist it at `init` and have `sync` read
 * it instead of re-deriving it, which spans `src/cli/commands/init/apply.ts`,
 * `src/cli/commands/sync/engine.ts` and the manifest schema.
 */
export function isGreenfield(info: Pick<RepoInfo, "languages" | "existingTools">): boolean {
  return info.languages.length === 0 && info.existingTools.length === 0;
}

/**
 * Languages identified by their config files, in table order, plus `csharp`
 * when a project or solution file sits in the root.
 *
 * An empty array means no language was identified — an empty repository, or one
 * built with tooling that leaves no root-level marker. There is no `unknown`
 * placeholder: a sentinel inside a list of real names invites callers to render
 * or match on it as though it were a language.
 */
export async function detectLanguages(rootDir: string): Promise<string[]> {
  const [byConfig, rootEntries, nodeManifest] = await Promise.all([
    presentIndicators(
      rootDir,
      Object.entries(LANGUAGE_INDICATORS).map(([name, files]) => ({ name, files })),
    ),
    readDirEntries(rootDir),
    readJsonObject(join(rootDir, "package.json")),
  ]);

  const found = new Set(byConfig);
  const hasDotNetProject = rootEntries.some(
    (entry) => entry.isFile() && (entry.name.endsWith(".csproj") || entry.name.endsWith(".sln")),
  );
  if (hasDotNetProject) found.add("csharp");
  const nodeFallback = nodeLanguage(nodeManifest, rootEntries, found);
  if (nodeFallback !== null) found.add(nodeFallback);
  // Table order, then the appended rows, so the answer is stable whichever
  // evidence produced it.
  return [...found];
}

/** Root-file extensions that identify a TypeScript project on their own. */
const TYPESCRIPT_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".mts", ".cts"];

/**
 * The JavaScript/TypeScript FALLBACK, for the repositories the config-file
 * table alone cannot see. Returns `null` whenever the table already answered.
 *
 * {@link LANGUAGE_INDICATORS} identifies JS and TS by `tsconfig.json`,
 * `jsconfig.json` or a Babel config, and an ordinary Node service carries none
 * of the three: an Express app on npm, or a pnpm repo whose only TypeScript
 * evidence is the dependency and the sources themselves. Those repositories
 * reported NO language at all — which made `isGreenfield` call a live codebase
 * empty and the init panel's first line call it "a fresh repo (no traces)"
 * while the charter generated by the same run named its linter, its test
 * framework, its CI and its package manager.
 *
 * A fallback, not a second opinion: a repo the table already resolved is left
 * exactly as the table reported it, so this can only turn an empty answer into
 * a non-empty one and never widen an existing one. Evidence, strongest first:
 * a declared `typescript` dependency, a root-level `.ts`-family source file,
 * then `package.json` itself — which is what makes a manifest-only repository
 * report `javascript` rather than nothing, since a `package.json` is a
 * JavaScript-runtime project by definition even before the first source file
 * lands.
 */
function nodeLanguage(
  manifest: Record<string, unknown> | null,
  rootEntries: readonly Dirent[],
  alreadyFound: ReadonlySet<string>,
): string | null {
  if (manifest === null) return null;
  if (alreadyFound.has("typescript") || alreadyFound.has("javascript")) return null;
  const extensions = new Set(
    rootEntries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name.slice(entry.name.lastIndexOf("."))),
  );
  const typescript =
    dependencyNames(manifest).has("typescript") ||
    TYPESCRIPT_EXTENSIONS.some((extension) => extensions.has(extension));
  return typescript ? "typescript" : "javascript";
}

/**
 * Workspace packages of a monorepo, sorted by path; empty for a single-package
 * repository.
 *
 * Globs come from the package manager's workspace declaration — the
 * authoritative source, since `turbo.json` and `nx.json` defer package layout to
 * it. A directory qualifies as a package only by holding a readable
 * `package.json`, which is also the rule every workspace-aware manager applies.
 *
 * Only one level below a wildcard is enumerated (`packages/*`, `apps/**`, and
 * exact paths), covering the conventional layouts; a deeper glob collapses to
 * its first wildcard-free prefix rather than triggering a recursive walk.
 *
 * Symlinked package directories are followed once and de-duplicated by their
 * physical path, and the repository root is pre-seeded as already-seen. That is
 * the cycle guard: a link pointing back at the root or at a package already
 * listed contributes nothing instead of producing a duplicate or an infinite
 * chase.
 */
export async function detectMonorepoPackages(rootDir: string): Promise<PackageEntry[]> {
  const patterns = await collectWorkspaceGlobs(rootDir);
  if (patterns.length === 0) return [];

  const exact = new Set<string>();
  const wildcardParents = new Set<string>();
  for (const pattern of patterns) {
    const normalized = normalizeGlob(pattern);
    if (normalized === null) continue;
    if (normalized.includes("*")) wildcardParents.add(wildcardFreePrefix(normalized));
    else exact.add(normalized);
  }

  const enumerated = await Promise.all(
    [...wildcardParents].map((parent) => listChildDirectories(rootDir, parent)),
  );
  const candidates = [...new Set([...exact, ...enumerated.flat()])].toSorted(comparePaths);

  const resolved = await Promise.all(
    candidates.map(async (path) => {
      const dir = join(rootDir, path);
      const [physical, manifest] = await Promise.all([
        physicalPath(dir),
        readJsonObject(join(dir, "package.json")),
      ]);
      return { path, physical, manifest };
    }),
  );

  const seen = new Set<string>([await physicalPath(rootDir)]);
  const packages: PackageEntry[] = [];
  for (const { path, physical, manifest } of resolved) {
    if (seen.has(physical)) continue;
    seen.add(physical);
    if (manifest === null) continue;
    const declared = manifest.name;
    const name =
      typeof declared === "string" && declared.length > 0 ? declared : basenameOf(path);
    packages.push({ name, path });
  }
  return packages;
}

/**
 * Linters and formatters. A dedicated config file is the primary signal;
 * `pyproject.toml` tables and the `package.json` blocks that eslint and
 * prettier officially support cover the tools that keep their config inside a
 * shared file. A wired `lint` script is a last resort, reported only when
 * nothing else matched — a `lint` script in a repo with a known linter adds no
 * information, and reporting both would fabricate a second linter.
 */
export async function detectLinters(rootDir: string): Promise<string[]> {
  const [byConfig, manifest, pyproject] = await Promise.all([
    presentIndicators(rootDir, LINTER_INDICATORS),
    readJsonObject(join(rootDir, "package.json")),
    readText(join(rootDir, "pyproject.toml")),
  ]);

  const detected = new Set<string>(byConfig);
  for (const { name, section } of PYPROJECT_LINTER_SECTIONS) {
    if (pyproject?.includes(section) === true) detected.add(name);
  }
  if (manifest !== null) {
    for (const { name, key } of LINTER_MANIFEST_KEYS) {
      if (manifest[key] !== undefined) detected.add(name);
    }
    if (detected.size === 0 && hasWiredScript(manifest, "lint")) detected.add(LINT_SCRIPT_FALLBACK);
  }
  return [...detected];
}

/** Test frameworks, on the same evidence ladder as {@link detectLinters}. */
export async function detectTestFrameworks(rootDir: string): Promise<string[]> {
  const [byConfig, manifest] = await Promise.all([
    presentIndicators(rootDir, TEST_FRAMEWORK_INDICATORS),
    readJsonObject(join(rootDir, "package.json")),
  ]);

  const detected = new Set<string>(byConfig);
  if (manifest !== null) {
    for (const { name, key } of TEST_MANIFEST_KEYS) {
      if (manifest[key] !== undefined) detected.add(name);
    }
    if (detected.size === 0 && hasWiredScript(manifest, "test")) detected.add(TEST_SCRIPT_FALLBACK);
  }
  return [...detected];
}

/**
 * CI providers with a pipeline definition in the repository.
 *
 * `github-actions` leads the list when it is present, preserving the order the
 * single indicator table used to produce; it is probed separately because it
 * is the one provider whose directory this engine also writes into (see
 * {@link ENGINE_EMITTED_WORKFLOWS}).
 */
export async function detectCIProviders(rootDir: string): Promise<string[]> {
  const [githubActions, others] = await Promise.all([
    hasForeignWorkflow(rootDir),
    presentIndicators(rootDir, CI_PROVIDER_INDICATORS),
  ]);
  return githubActions ? ["github-actions", ...others] : others;
}

/**
 * True when `.github/workflows/` holds at least one workflow file this engine
 * did not emit — the evidence that a real GitHub Actions pipeline exists.
 *
 * A directory holding nothing but engine output is not a pipeline, and an
 * empty (or absent) directory never was one. Only immediate entries count:
 * GitHub reads workflows from that one directory, not from subdirectories.
 */
async function hasForeignWorkflow(rootDir: string): Promise<boolean> {
  const entries = await readDirEntries(join(rootDir, GITHUB_WORKFLOWS_DIR));
  return entries.some(
    (entry) =>
      entry.isFile() &&
      WORKFLOW_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext)) &&
      !ENGINE_EMITTED_WORKFLOWS.has(entry.name),
  );
}

/** Whether a container or dev-container build is defined at the repository root. */
export async function detectDockerfile(rootDir: string): Promise<boolean> {
  return anyExists(rootDir, CONTAINER_INDICATORS);
}

/**
 * Whether the repository carries data artifacts: a top-level `data/` directory,
 * or a `.csv` / `.parquet` file in the root. A root-level probe only — one
 * `readdir` and one `stat`, no tree walk — because the signal only needs to be
 * strong enough to pull in data-handling guidance.
 */
export async function detectDataArtifacts(rootDir: string): Promise<boolean> {
  const [hasDataDir, entries] = await Promise.all([
    dirExists(join(rootDir, "data")),
    readDirEntries(rootDir),
  ]);
  return (
    hasDataDir ||
    entries.some(
      (entry) =>
        entry.isFile() && (entry.name.endsWith(".csv") || entry.name.endsWith(".parquet")),
    )
  );
}

/**
 * Human-readable multi-line summary of an analysis. Plain text, no styling:
 * this states what was found, and how it is presented belongs to whatever
 * renders it. Rows with nothing to report are omitted, so the summary never
 * pads itself with empty lines.
 */
export function formatRepoSummary(info: RepoInfo): string {
  const rows: string[] = [];
  const add = (label: string, values: readonly string[]): void => {
    if (values.length > 0) rows.push(`${label}: ${values.join(", ")}`);
  };

  add("Languages", info.languages);
  if (info.packageManager !== undefined) rows.push(`Package manager: ${info.packageManager}`);
  add("Frameworks", info.frameworks);
  add("Linters", info.linters);
  add("Test frameworks", info.testFrameworks);
  add("CI", info.ciProviders);
  if (info.monorepoPackages.length > 0) {
    rows.push(`Workspace packages: ${summarizePackages(info.monorepoPackages)}`);
  }
  add("Existing tool configs", info.existingTools);
  if (info.hasDockerfile) rows.push("Container build: yes");
  if (info.hasDataArtifacts) rows.push("Data artifacts: yes");

  return rows.length === 0 ? "No stack signals detected." : rows.join("\n");
}

/** `3 (apps/web, packages/core, packages/ui)`, truncated so a wide monorepo stays one line. */
function summarizePackages(packages: readonly PackageEntry[]): string {
  const shown = packages.slice(0, 3).map((entry) => entry.path);
  const rest = packages.length - shown.length;
  const listed = rest > 0 ? `${shown.join(", ")}, +${rest} more` : shown.join(", ");
  return `${packages.length} (${listed})`;
}

/**
 * Frameworks in use. Config files and dependency names are both read, then
 * meta-frameworks suppress the base framework they wrap: a Next.js repository
 * reports `next`, not `next` and `react`, because the guidance that matters is
 * the outer framework's.
 */
async function detectFrameworks(rootDir: string): Promise<Framework[]> {
  const [byConfig, byNonJsConfig, manifest, manifestBodies] = await Promise.all([
    presentIndicators(rootDir, FRAMEWORK_CONFIG_INDICATORS),
    presentIndicators(rootDir, NON_JS_FRAMEWORK_INDICATORS),
    readJsonObject(join(rootDir, "package.json")),
    readNonJsManifests(rootDir),
  ]);

  const detected = new Set<Framework>([...byConfig, ...byNonJsConfig]);

  const deps = dependencyNames(manifest);
  for (const row of FRAMEWORK_DEP_INDICATORS) {
    if (row.deps.some((dep) => deps.has(dep))) detected.add(row.framework);
  }
  for (const row of NON_JS_FRAMEWORK_DEP_INDICATORS) {
    const body = manifestBodies.get(row.manifest);
    if (body != null && row.deps.some((dep) => body.includes(dep))) detected.add(row.framework);
  }
  for (const [meta, base] of FRAMEWORK_SUPPRESSION) {
    if (detected.has(meta)) detected.delete(base);
  }
  return [...detected];
}

/** Bodies of the language-native manifests the non-JS dependency probes read, each read once. */
async function readNonJsManifests(rootDir: string): Promise<Map<string, string | null>> {
  const files = [...new Set(NON_JS_FRAMEWORK_DEP_INDICATORS.map((row) => row.manifest))];
  const bodies = await Promise.all(files.map((file) => readText(join(rootDir, file))));
  return new Map(files.map((file, index) => [file, bodies[index] ?? null]));
}

/** Every dependency and devDependency name declared by a root manifest. */
function dependencyNames(manifest: Record<string, unknown> | null): ReadonlySet<string> {
  const names = new Set<string>();
  for (const field of ["dependencies", "devDependencies"] as const) {
    const block = manifest?.[field];
    if (isPlainObject(block)) for (const name of Object.keys(block)) names.add(name);
  }
  return names;
}

/**
 * Script names declared in the root `package.json`, or `null` when the repo has
 * no readable one. The empty array is a real answer — a Node repo with no
 * scripts block — and is what tells the gate resolver to stop spelling
 * `<pm> run test` for a script that is not there.
 */
async function detectPackageScripts(rootDir: string): Promise<string[] | null> {
  const manifest = await readJsonObject(join(rootDir, "package.json"));
  if (manifest === null) return null;
  const scripts = manifest["scripts"];
  return isPlainObject(scripts) ? Object.keys(scripts) : [];
}

/**
 * Whether `scripts[name]` is a real command. `npm init`'s placeholder test
 * script exits 1 with a message and runs nothing, so counting it would report a
 * test framework for every freshly scaffolded repository.
 */
function hasWiredScript(manifest: Record<string, unknown>, name: string): boolean {
  const scripts = manifest.scripts;
  if (!isPlainObject(scripts)) return false;
  const script = scripts[name];
  return typeof script === "string" && script.trim().length > 0 && !/no test specified/i.test(script);
}

/** Names from `table` whose row has at least one path present in the repo. */
async function presentIndicators<T extends string>(
  rootDir: string,
  table: readonly Indicator<T>[],
): Promise<T[]> {
  const present = await Promise.all(table.map((row) => anyExists(rootDir, row.files)));
  return table.filter((_row, index) => present[index] === true).map((row) => row.name);
}

/** Workspace globs declared by pnpm, by `package.json` workspaces, or by lerna. */
async function collectWorkspaceGlobs(rootDir: string): Promise<string[]> {
  const [workspaceYaml, manifest, lerna] = await Promise.all([
    readText(join(rootDir, "pnpm-workspace.yaml")),
    readJsonObject(join(rootDir, "package.json")),
    readJsonObject(join(rootDir, "lerna.json")),
  ]);

  const workspaces = manifest?.workspaces;
  return [
    ...stringList(workspaceYamlPackages(workspaceYaml)),
    // The array form and the `{ packages: [...] }` object form are both valid.
    ...stringList(Array.isArray(workspaces) ? workspaces : nestedPackages(workspaces)),
    ...stringList(lerna?.packages),
  ];
}

function nestedPackages(value: unknown): unknown {
  return isPlainObject(value) ? value.packages : null;
}

/** The `packages:` list of a pnpm workspace file; null when the file is absent or malformed. */
function workspaceYamlPackages(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    const document = parseYamlStrict(raw, "pnpm-workspace.yaml");
    return isPlainObject(document) ? document.packages : null;
  } catch (error) {
    // A workspace file that does not parse declares no globs — the same outcome
    // as an absent one. Detection sniffs this file; it does not own it, so it is
    // not the place to fail a run over its syntax.
    if (error instanceof EngineError) return null;
    throw error;
  }
}

/** Non-empty trimmed strings from a value that may or may not be a list. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * A workspace glob reduced to a repo-relative POSIX path, or null when it
 * cannot address one: absolute paths, negations (`!packages/legacy`, an
 * exclusion this single-level expansion does not model), and anything climbing
 * above the root are dropped rather than guessed at.
 */
function normalizeGlob(pattern: string): string | null {
  const unified = pattern.trim().replaceAll("\\", "/");
  if (unified.length === 0 || unified.startsWith("/") || unified.startsWith("!")) return null;
  const segments = unified.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.length === 0 || segments.includes("..")) return null;
  return segments.join("/");
}

/** The segments before the first wildcard — the deepest prefix that names a real directory. */
function wildcardFreePrefix(pattern: string): string {
  const segments = pattern.split("/");
  const wildcardAt = segments.findIndex((segment) => segment.includes("*"));
  return segments.slice(0, wildcardAt).join("/");
}

/**
 * Directories one level under `parentRel`, as repo-relative paths.
 *
 * Dot-directories and `node_modules` are excluded by name: an installed
 * dependency tree holds thousands of `package.json` files, and a glob that
 * reaches one would report a dependency as a workspace package.
 */
async function listChildDirectories(rootDir: string, parentRel: string): Promise<string[]> {
  const parent = parentRel.length > 0 ? join(rootDir, parentRel) : rootDir;
  const entries = await readDirEntries(parent);
  const paths = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".") || NON_PACKAGE_DIRS.has(entry.name)) return null;
      // A package reached through a symlink is still a package — local checkouts
      // and pnpm's `link:` protocol produce exactly that — so a link to a
      // directory is followed here and de-duplicated by physical path later.
      const isDirectory =
        entry.isDirectory() ||
        (entry.isSymbolicLink() && (await dirExists(join(parent, entry.name))));
      if (!isDirectory) return null;
      return parentRel.length > 0 ? `${parentRel}/${entry.name}` : entry.name;
    }),
  );
  return paths.filter((path): path is string => path !== null);
}

/** Symlink-resolved path, falling back to the literal path when it cannot be resolved. */
async function physicalPath(path: string): Promise<string> {
  return probe<string>(() => realpath(path), path);
}

function basenameOf(path: string): string {
  return path.split("/").findLast((segment) => segment.length > 0) ?? path;
}

/** Byte-order comparison, so package ordering does not shift with the machine's locale. */
function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Run a filesystem read, answering `fallback` when the filesystem says no.
 *
 * ENOENT (absent), EACCES/EPERM (unreadable), ENOTDIR (a file where a directory
 * was expected), and ELOOP (a symlink cycle) all mean the same thing to a
 * presence probe: no signal here. A rejection carrying no errno code is a
 * defect in this module rather than a fact about the repository, so it
 * propagates instead of being absorbed into a plausible-looking result.
 */
async function probe<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (typeof (error as NodeJS.ErrnoException).code === "string") return fallback;
    throw error;
  }
}

async function anyExists(rootDir: string, relatives: readonly string[]): Promise<boolean> {
  const hits = await Promise.all(relatives.map((relative) => pathExists(join(rootDir, relative))));
  return hits.includes(true);
}

async function pathExists(path: string): Promise<boolean> {
  return probe(async () => {
    await stat(path);
    return true;
  }, false);
}

async function dirExists(path: string): Promise<boolean> {
  return probe(async () => (await stat(path)).isDirectory(), false);
}

async function readDirEntries(path: string): Promise<Dirent[]> {
  return probe<Dirent[]>(() => readdir(path, { withFileTypes: true }), []);
}

async function readText(path: string): Promise<string | null> {
  return probe<string | null>(() => readFile(path, "utf8"), null);
}

/** A JSON file as an object, or null when it is absent, unreadable, or not valid JSON. */
async function readJsonObject(path: string): Promise<Record<string, unknown> | null> {
  const raw = await readText(path);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    // A manifest that does not parse is one no tool in the repo could act on
    // either; the remaining evidence still describes the repository.
    return null;
  }
}

/**
 * The manifest-persisted subset of a live analysis.
 *
 * One function rather than an object literal at each call site: the persisted
 * summary is what generated content states as detection-derived FACTS about the
 * reader's repository, and a field that three constructors have to remember to
 * copy is a field that will be dropped at one of them. It already was —
 * `packageManager` existed on `RepoInfo`, was never carried across, and every
 * emitted verification gate spelled `npm run test` as a result, in pnpm and bun
 * repositories alike.
 *
 * Optional fields are omitted rather than set to `undefined`, so a summary
 * round-trips through JSON without gaining null-valued keys.
 */
export function summarizeDetection(info: RepoInfo): DetectedSummary {
  return {
    languages: [...info.languages],
    linters: [...info.linters],
    testFrameworks: [...info.testFrameworks],
    ciProviders: [...info.ciProviders],
    ...(info.packageManager === undefined ? {} : { packageManager: info.packageManager }),
    ...(info.packageScripts === undefined ? {} : { packageScripts: [...info.packageScripts] }),
  };
}
