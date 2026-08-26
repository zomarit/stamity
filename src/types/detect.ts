/**
 * Repo-analysis shapes: what detection reads off a repository and the
 * manifest-persisted subset of it. Zero-import leaf — detection results are
 * plain strings on purpose (a repo may carry tools the engine has no adapter
 * for; detection reports, it never filters).
 */

/**
 * Frameworks detectable from dependency indicators (package.json for JS,
 * pyproject.toml / requirements.txt for Python, mix.exs for Elixir,
 * Cargo.toml for Rust, Gemfile for Ruby, composer.json for PHP, build files
 * for JVM).
 */
export type Framework =
  | "next"
  | "angular"
  | "vue"
  | "svelte"
  | "sveltekit"
  | "remix"
  | "astro"
  | "nuxt"
  | "react"
  | "express"
  | "fastify"
  | "hono"
  | "nestjs"
  | "django"
  | "flask"
  | "rails"
  | "spring"
  | "laravel"
  | "tanstack-start"
  | "solid-start"
  | "qwik"
  | "fastapi"
  | "phoenix"
  | "axum"
  | "actix";

/** A monorepo workspace package resolved from the package manager's workspace globs. */
export interface PackageEntry {
  name: string;
  /** Repo-relative directory of the package. */
  path: string;
}

/**
 * Full live analysis of a repository. Computed fresh per run and never
 * persisted whole — the manifest stores only {@link DetectedSummary}.
 */
export interface RepoInfo {
  /** Absolute repository root. */
  rootDir: string;
  /** Detected languages (e.g. `typescript`, `python`). */
  languages: string[];
  frameworks: Framework[];
  /** Detected linter/formatter tools. */
  linters: string[];
  /** Detected test frameworks. */
  testFrameworks: string[];
  /** Detected CI providers. */
  ciProviders: string[];
  /** Detected package manager name; absent when none was identified. */
  packageManager?: string;
  /** Script names declared in the root `package.json`; absent when there is none. */
  packageScripts?: string[];
  /** Workspace packages; empty for single-package repos. */
  monorepoPackages: PackageEntry[];
  /** True when a Dockerfile / compose file / devcontainer is present. */
  hasDockerfile: boolean;
  /** True when the repo carries data artifacts (csv/parquet or a top-level data dir). */
  hasDataArtifacts: boolean;
  /** True when an agentic setup from any tool already exists in the repo. */
  hasExistingAgents: boolean;
  /** Names of AI coding tools with existing config dirs — free-form, not limited to adapted tools. */
  existingTools: string[];
}

/**
 * The manifest-persisted subset of {@link RepoInfo}, feeding emission-time
 * token substitution without re-running analysis. Deliberately excludes
 * frameworks and monorepo layout — those are recomputed live each run.
 */
export interface DetectedSummary {
  languages: string[];
  linters: string[];
  testFrameworks: string[];
  ciProviders: string[];
  /**
   * Detected package manager name; absent when the repo showed no evidence of
   * one. Persisted because generated content states verification commands as
   * DETECTION-DERIVED FACTS about this repository: dropping the field here made
   * every emitted gate spell `npm run test`, which is simply wrong in a pnpm,
   * yarn, or bun repo — and wrong in the confident register of a detected fact.
   */
  packageManager?: string;
  /**
   * Script names present in the root `package.json`, when there is one. Absent
   * for a non-Node repo, empty for a Node repo with no scripts block.
   *
   * A run prefix says HOW to invoke a script; it does not say the script
   * exists. Emitting `pnpm run test` into a repo whose package.json declares no
   * `test` is the same failure one layer down — an agent runs it, the command
   * errors, and the gate reports a non-result. This list is what lets the
   * resolver fall back to a runner invocation the repo can actually execute.
   */
  packageScripts?: string[];
}
