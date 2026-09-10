import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { carriedProcessEnv, NO_GIT_CONFIG } from "../support/repoFixtures.ts";

/**
 * Temporary repositories for the upstream lane's acceptance suite.
 *
 * Two repositories, built with the real `git` binary in an isolated environment (the
 * `seedGitRepo` idiom from `../support/repoFixtures.ts`: no system or global config, `HOME`
 * pointed at the fixture, identity and dates pinned through the env, `commit.gpgsign=false`):
 *
 *   the UPSTREAM  releases `v1.0.0` … `v1.3.0` over a tree that mirrors this repository's
 *                 risk classes — a source under `content/`, a generated file derived from it by
 *                 a committed generator (`scripts/gen.mjs`), a default (`defaults.json`, resolved
 *                 by `scripts/resolve-tier.mjs` with `config.json`), a pin file (`README.md`), a
 *                 `CHANGELOG.md` with a Keep-a-Changelog footer — plus a prerelease tag and a
 *                 tag outside the release pattern, so selection has something to exclude.
 *   a FORK        a clone of the upstream at one release with the full history, its `main`
 *                 reset there and the cloned tags dropped, then customized per the options:
 *                 an overlapping edit of `alpha.md`, an enterprise tier in `config.json` with
 *                 the behaviour gate that pins it, extra files, and `.stamity/upstream.json`.
 *
 * What each release changes, and which scenario it exists for:
 *   v1.1.0  edits the line of `content/rules/alpha.md` the fork also edits (a content conflict),
 *           regenerates `generated/alpha.txt`, adds `beta.md` and `delta.md`, bumps README's count
 *   v1.2.0  changes the tier RESOLUTION RULE in `scripts/resolve-tier.mjs` — a file no fork
 *           edits — so a fork's top-level `"tier"` in `config.json` is no longer read: a clean
 *           textual merge that changes behaviour, which the fork's gate catches
 *   v1.3.0  renames `beta.md` to `gamma.md` and deletes `delta.md` (rename and modify/delete
 *           against a fork that edited them)
 *   v1.1.1  a maintenance release cut on a side branch from v1.1.0 AFTER v1.3.0: older by
 *           version than v1.2.0 and v1.3.0, and in neither one's ancestry, so a merge of those
 *           covers it only if the lane reasons by ancestry rather than by version order
 *
 * Besides the sources, v1.0.0 carries a binary `assets/logo.bin` that v1.1.0 changes: a fork
 * that also changes it gets a conflict git cannot merge and leaves "ours" in the worktree for —
 * the case where staging a generated path nothing regenerated would prefer a side.
 *
 * Machines without git: the first git call throws an Error whose `name` is
 * `"GitUnavailableError"`; the suite converts that to a skip.
 */

const SCRIPT = fileURLToPath(new URL("../../scripts/upstream.mjs", import.meta.url));

/** 2026-01-01T00:00:00Z; the n-th commit or tag of the process is stamped EPOCH + n minutes. */
const FIXTURE_EPOCH_SECONDS = 1767225600;
let tick = 0;

const IDENTITY = { name: "Fixture Fork", email: "fork@fixture.invalid" };

export interface Repo {
  /** Absolute, symlink-resolved path of the working tree. */
  readonly dir: string;
  /** The isolated child environment every git and lane process runs with. */
  readonly env: Record<string, string>;
}

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** The isolated environment: PATH carried, everything git reads pinned or cut off. */
export function isolatedEnv(home: string): Record<string, string> {
  const env = carriedProcessEnv();
  env["HOME"] = home;
  env["USERPROFILE"] = home;
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  env["GIT_CONFIG_GLOBAL"] = NO_GIT_CONFIG;
  env["GIT_TERMINAL_PROMPT"] = "0";
  env["LC_ALL"] = "C";
  env["GIT_AUTHOR_NAME"] = IDENTITY.name;
  env["GIT_AUTHOR_EMAIL"] = IDENTITY.email;
  env["GIT_COMMITTER_NAME"] = IDENTITY.name;
  env["GIT_COMMITTER_EMAIL"] = IDENTITY.email;
  return env;
}

function nextStamp(): string {
  tick += 1;
  return `${FIXTURE_EPOCH_SECONDS + tick * 60} +0000`;
}

/** Runs git in `repo` (or `opts.cwd`); throws on failure unless `allowFailure`. */
export function git(
  repo: Repo,
  args: readonly string[],
  opts: { cwd?: string; allowFailure?: boolean; env?: Record<string, string> } = {},
): GitResult {
  const result = spawnSync("git", [...args], {
    cwd: opts.cwd ?? repo.dir,
    env: { ...repo.env, ...opts.env },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      const unavailable = new Error(
        "git executable not found on PATH — install git, or skip git-backed fixtures " +
          '(error.name === "GitUnavailableError" is the skip signal)',
      );
      unavailable.name = "GitUnavailableError";
      throw unavailable;
    }
    throw result.error;
  }
  const status = result.status ?? 1;
  if (status !== 0 && opts.allowFailure !== true) {
    throw new Error(`git ${args.join(" ")} failed in ${opts.cwd ?? repo.dir} (exit ${status}):\n${result.stderr}`);
  }
  return { status, stdout: result.stdout, stderr: result.stderr };
}

/** True when a git binary answers on PATH; the suite's skip probe. */
export function gitAvailable(): boolean {
  try {
    git({ dir: process.cwd(), env: isolatedEnv(tmpdir()) }, ["--version"]);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "GitUnavailableError") return false;
    throw error;
  }
}

/** Writes (a string, or bytes for a binary file) or deletes (null) files keyed by POSIX repository-relative path. */
export function writeFiles(dir: string, files: Record<string, string | Uint8Array | null>): void {
  for (const [key, content] of Object.entries(files)) {
    const target = join(dir, ...key.split("/"));
    if (content === null) {
      rmSync(target, { force: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    if (typeof content === "string") writeFileSync(target, content, "utf8");
    else writeFileSync(target, content);
  }
}

/** Stages everything and commits with pinned dates; returns the new HEAD. */
export function commitAll(repo: Repo, message: string, opts: { cwd?: string } = {}): string {
  const cwd = opts.cwd ?? repo.dir;
  const stamp = nextStamp();
  git(repo, ["add", "-A"], { cwd });
  git(repo, ["-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", message], {
    cwd,
    env: { GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
  });
  return git(repo, ["rev-parse", "HEAD"], { cwd }).stdout.trim();
}

function tagHead(repo: Repo, name: string, opts: { annotated: boolean }): void {
  const stamp = nextStamp();
  const args = opts.annotated ? ["tag", "-a", name, "-m", `release ${name}`] : ["tag", name];
  git(repo, args, { env: { GIT_COMMITTER_DATE: stamp } });
}

// ---------------------------------------------------------------------------------------------
// The generator, the resolver, the gates — committed scripts of the fixture repositories

/** `scripts/gen.mjs`: every `content/rules/*.md` -> `generated/<stem>.txt`, stale outputs removed. */
const GENERATOR_SOURCE = `import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const rules = join(root, 'content', 'rules')
const out = join(root, 'generated')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const name of readdirSync(rules).filter((entry) => entry.endsWith('.md')).sort()) {
  const source = readFileSync(join(rules, name), 'utf8')
  const heading = (source.split('\\n').find((line) => line.startsWith('# ')) ?? '# (none)').slice(2)
  const all = source.split('\\n')
  const lines = all[all.length - 1] === '' ? all.length - 1 : all.length
  const sha256 = createHash('sha256').update(source).digest('hex')
  writeFileSync(
    join(out, name.slice(0, -3) + '.txt'),
    '# generated from content/rules/' + name + '\\nheading: ' + heading + '\\nlines: ' + lines + '\\nsha256: ' + sha256 + '\\n',
  )
}
`;

/** The generator's output for one source, mirrored so the suite can state what "derived" means. */
export function renderGenerated(stem: string, source: string): string {
  const heading = (source.split("\n").find((line) => line.startsWith("# ")) ?? "# (none)").slice(2);
  const all = source.split("\n");
  const lines = all[all.length - 1] === "" ? all.length - 1 : all.length;
  const sha256 = createHash("sha256").update(source).digest("hex");
  return `# generated from content/rules/${stem}.md\nheading: ${heading}\nlines: ${lines}\nsha256: ${sha256}\n`;
}

/** `scripts/resolve-tier.mjs` at v1.0.0: `config.json`'s top-level `tier` overrides the default. */
const RESOLVER_V1 = `import { readFileSync } from 'node:fs'

const read = (name) => JSON.parse(readFileSync(new URL('../' + name, import.meta.url), 'utf8'))
const config = read('config.json')
const defaults = read('defaults.json')
process.stdout.write((config.tier ?? defaults.tier) + '\\n')
`;

/** `scripts/resolve-tier.mjs` at v1.2.0: only `config.json`'s `overrides.tier` is honoured. */
const RESOLVER_V2 = `import { readFileSync } from 'node:fs'

// 1.2.0: a top-level "tier" in config.json is no longer read; overrides live under "overrides".
const read = (name) => JSON.parse(readFileSync(new URL('../' + name, import.meta.url), 'utf8'))
const config = read('config.json')
const defaults = read('defaults.json')
process.stdout.write((config.overrides?.tier ?? defaults.tier) + '\\n')
`;

/** `scripts/gate.mjs`, added by an enterprise fork: exits 1 unless the effective tier is enterprise. */
const GATE_SOURCE = `import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const resolver = fileURLToPath(new URL('./resolve-tier.mjs', import.meta.url))
const result = spawnSync(process.execPath, [resolver], { encoding: 'utf8' })
const tier = (result.stdout ?? '').trim()
if (result.status !== 0 || tier !== 'enterprise') {
  console.error('gate: effective tier is ' + JSON.stringify(tier) + ', expected "enterprise"')
  process.exit(1)
}
console.log('gate: effective tier is enterprise')
`;

/**
 * `scripts/stray.mjs`: a generator that rewrites a tracked file no `generatedPaths` glob of the
 * base configuration covers (`README.md`), with the same bytes on every run.
 */
export const STRAY_GENERATOR_SOURCE = `import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

writeFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), '# Fixture upstream\\n\\nRules: rewritten by scripts/stray.mjs\\n')
`;

/** The bytes of `README.md` after `scripts/stray.mjs` ran. */
export const README_STRAY = "# Fixture upstream\n\nRules: rewritten by scripts/stray.mjs\n";

/**
 * `scripts/slow-gate.mjs`: writes the sentinel named by `FIXTURE_SENTINEL`, idles for
 * `FIXTURE_HOLD_MS` (default 3000) so a test can kill the lane while a gate is running, then
 * writes `<sentinel>.done` on its way out so the test can wait for the orphan. With no sentinel
 * in the environment it exits at once, so a later `continue` is not slowed by it.
 */
export const SLOW_GATE_SOURCE = `import { writeFileSync } from 'node:fs'

const sentinel = process.env.FIXTURE_SENTINEL
if (sentinel === undefined || sentinel === '') process.exit(0)
writeFileSync(sentinel, 'gate started\\n')
setTimeout(() => {
  writeFileSync(sentinel + '.done', 'gate finished\\n')
  process.exit(0)
}, Number(process.env.FIXTURE_HOLD_MS ?? '3000'))
`;

// ---------------------------------------------------------------------------------------------
// The upstream

export const RELEASE_TAGS = ["v1.0.0", "v1.1.0", "v1.2.0", "v1.3.0"] as const;
export const PRERELEASE_TAG = "v1.4.0-rc.1";
export const OFF_PATTERN_TAG = "nightly-2026-09-10";
export const MAINTENANCE_TAG = "v1.1.1";

/** `assets/logo.bin` at v1.0.0, at v1.1.0, and as a fork changes it: three binaries, one path. */
export const LOGO_V1 = Uint8Array.from([0x89, 0x4c, 0x4f, 0x47, 0x4f, 0x00, 0x01]);
export const LOGO_V1_1 = Uint8Array.from([0x89, 0x4c, 0x4f, 0x47, 0x4f, 0x00, 0x02]);
export const LOGO_FORK = Uint8Array.from([0x89, 0x4c, 0x4f, 0x47, 0x4f, 0x00, 0xff]);

export const ALPHA_V1 = "# Alpha\n\nAlpha line one.\nAlpha line two.\nAlpha line three.\n";
export const ALPHA_V1_1 = "# Alpha\n\nAlpha line one.\nAlpha line two, revised upstream.\nAlpha line three.\n";
export const ALPHA_FORK = "# Alpha\n\nAlpha line one.\nAlpha line two, the fork's wording.\nAlpha line three.\n";
export const BETA_V1_1 = "# Beta\n\nBeta line one.\nBeta line two.\nBeta line three.\nBeta line four.\n";
export const DELTA_V1_1 = "# Delta\n\nDelta line one.\nDelta line two.\n";

const CHANGELOG_V1 = `# Changelog

All notable changes to this fixture are documented here.

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- The first release.

[Unreleased]: https://example.invalid/compare/v1.0.0...HEAD
[1.0.0]: https://example.invalid/releases/v1.0.0
`;

function changelogWith(sections: string): string {
  return `# Changelog

All notable changes to this fixture are documented here.

## [Unreleased]

${sections}
## [1.0.0] - 2026-01-01

### Added

- The first release.

[Unreleased]: https://example.invalid/compare/v1.3.0...HEAD
[1.3.0]: https://example.invalid/releases/v1.3.0
[1.2.0]: https://example.invalid/releases/v1.2.0
[1.1.0]: https://example.invalid/releases/v1.1.0
[1.0.0]: https://example.invalid/releases/v1.0.0
`;
}

/** The `## [1.1.0]` body a reader expects: the link definition mid-body is kept, the footer is not. */
export const RELEASE_NOTES_V1_1 = `
### Changed

- \`alpha.md\`'s second line was revised; see [the note].

[the note]: https://example.invalid/notes/alpha

### Added

- \`beta.md\` and \`delta.md\`.
`.trim();

const SECTION_V1_1 = `## [1.1.0] - 2026-02-01

${RELEASE_NOTES_V1_1}

`;
const SECTION_V1_2 = `## [1.2.0] - 2026-03-01

### Changed

- The tier resolution rule: a top-level \`tier\` in \`config.json\` is no longer read.

`;
const SECTION_V1_3 = `## [1.3.0] - 2026-04-01

### Changed

- \`beta.md\` renamed to \`gamma.md\`; \`delta.md\` removed.

`;

export interface UpstreamFixture extends Repo {
  /** Tag name -> the commit it peels to. */
  readonly tags: Record<string, string>;
}

function regenerate(repo: Repo, cwd: string = repo.dir): void {
  const result = spawnSync(process.execPath, [join(cwd, "scripts", "gen.mjs")], {
    cwd,
    env: repo.env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`fixture generator failed:\n${result.stderr}`);
}

/** Builds the upstream repository with its four releases under `parent`. */
export function createUpstream(parent: string): UpstreamFixture {
  const dir = join(parent, "upstream");
  mkdirSync(dir, { recursive: true });
  const repo: Repo = { dir, env: isolatedEnv(parent) };
  git(repo, ["-c", "init.defaultBranch=main", "init", "--quiet"]);

  // v1.0.0 — the baseline tree.
  writeFiles(dir, {
    ".gitignore": "node_modules/\n\n# The upstream lane's update worktrees.\n.stamity/upstream-work/\n",
    "package.json": `${JSON.stringify({ name: "fixture-upstream", version: "1.0.0", private: true, type: "module" }, null, 2)}\n`,
    "README.md": "# Fixture upstream\n\nRules: 1\n",
    "CHANGELOG.md": CHANGELOG_V1,
    "content/rules/alpha.md": ALPHA_V1,
    "scripts/gen.mjs": GENERATOR_SOURCE,
    "scripts/resolve-tier.mjs": RESOLVER_V1,
    "defaults.json": '{\n  "tier": "team"\n}\n',
    "config.json": "{}\n",
    "assets/logo.bin": LOGO_V1,
  });
  regenerate(repo);
  commitAll(repo, "release 1.0.0");
  tagHead(repo, "v1.0.0", { annotated: false });

  // v1.1.0 — the overlapping edit, two new sources, the pin file, the binary.
  writeFiles(dir, {
    "content/rules/alpha.md": ALPHA_V1_1,
    "content/rules/beta.md": BETA_V1_1,
    "content/rules/delta.md": DELTA_V1_1,
    "assets/logo.bin": LOGO_V1_1,
    "README.md": "# Fixture upstream\n\nRules: 3\n",
    "CHANGELOG.md": changelogWith(SECTION_V1_1),
    "package.json": `${JSON.stringify({ name: "fixture-upstream", version: "1.1.0", private: true, type: "module" }, null, 2)}\n`,
  });
  regenerate(repo);
  commitAll(repo, "release 1.1.0");
  tagHead(repo, "v1.1.0", { annotated: true });

  // v1.2.0 — the resolution rule moves, in a file no fork edits.
  writeFiles(dir, {
    "scripts/resolve-tier.mjs": RESOLVER_V2,
    "CHANGELOG.md": changelogWith(SECTION_V1_2 + SECTION_V1_1),
    "package.json": `${JSON.stringify({ name: "fixture-upstream", version: "1.2.0", private: true, type: "module" }, null, 2)}\n`,
  });
  commitAll(repo, "release 1.2.0");
  tagHead(repo, "v1.2.0", { annotated: true });

  // v1.3.0 — the rename and the deletion.
  git(repo, ["mv", "content/rules/beta.md", "content/rules/gamma.md"]);
  writeFiles(dir, {
    "content/rules/delta.md": null,
    "README.md": "# Fixture upstream\n\nRules: 2\n",
    "CHANGELOG.md": changelogWith(SECTION_V1_3 + SECTION_V1_2 + SECTION_V1_1),
    "package.json": `${JSON.stringify({ name: "fixture-upstream", version: "1.3.0", private: true, type: "module" }, null, 2)}\n`,
  });
  regenerate(repo);
  commitAll(repo, "release 1.3.0");
  tagHead(repo, "v1.3.0", { annotated: true });

  // Past the newest stable release: a prerelease and a tag outside the pattern, on one commit.
  writeFiles(dir, { "README.md": "# Fixture upstream\n\nRules: 2\n\nA release candidate is out.\n" });
  commitAll(repo, "prepare 1.4.0");
  tagHead(repo, PRERELEASE_TAG, { annotated: true });
  tagHead(repo, OFF_PATTERN_TAG, { annotated: false });

  // v1.1.1 — the maintenance release, cut last, on a side branch from v1.1.0.
  git(repo, ["checkout", "--quiet", "-b", "maint-1.1", "v1.1.0"]);
  writeFiles(dir, {
    "package.json": `${JSON.stringify({ name: "fixture-upstream", version: "1.1.1", private: true, type: "module" }, null, 2)}\n`,
  });
  commitAll(repo, "release 1.1.1");
  tagHead(repo, MAINTENANCE_TAG, { annotated: true });
  git(repo, ["checkout", "--quiet", "main"]);

  const tags: Record<string, string> = {};
  for (const name of [...RELEASE_TAGS, PRERELEASE_TAG, OFF_PATTERN_TAG, MAINTENANCE_TAG]) {
    tags[name] = git(repo, ["rev-parse", `${name}^{commit}`]).stdout.trim();
  }
  return { ...repo, tags };
}

// ---------------------------------------------------------------------------------------------
// Forks

export interface ForkOptions {
  /** The release the fork starts from (default `v1.0.0`). */
  at?: string;
  /** `.stamity/upstream.json` overrides; `null` writes no configuration file at all. */
  config?: Record<string, unknown> | null;
  /** Edit the same line of `alpha.md` as v1.1.0 does, and regenerate — the content conflict. */
  editAlpha?: boolean;
  /** `config.json` tier enterprise plus `scripts/gate.mjs`, the behaviour gate. */
  enterprise?: boolean;
  /** Extra files (a string, bytes for a binary, or null for a deletion) for the customization commit. */
  files?: Record<string, string | Uint8Array | null>;
  /** Run the generator before the customization commit. */
  regenerate?: boolean;
  /** A directory name under `parent` (default `fork`). */
  name?: string;
}

export interface ForkFixture extends Repo {
  readonly upstream: UpstreamFixture;
  /** The head after the customization commit (or the release commit when there was none). */
  readonly head: string;
  /** The configuration the fork carries, or null when none was written. */
  readonly config: Record<string, unknown> | null;
}

/** The minimal configuration every fork starts from: no gates, the fixture's generator. */
function baseConfig(upstream: UpstreamFixture): Record<string, unknown> {
  return {
    version: 1,
    upstream: upstream.dir,
    regenerate: ["node scripts/gen.mjs"],
    generatedPaths: ["generated/**"],
  };
}

/** Clones the upstream at `options.at` with full history and applies the customizations. */
export function createFork(upstream: UpstreamFixture, parent: string, options: ForkOptions = {}): ForkFixture {
  const at = options.at ?? "v1.0.0";
  const dir = join(parent, options.name ?? "fork");
  const repo: Repo = { dir, env: isolatedEnv(parent) };
  git(repo, ["clone", "--quiet", upstream.dir, dir], { cwd: parent });
  git(repo, ["checkout", "--quiet", "-B", "main", upstream.tags[at] ?? at]);
  const cloned = git(repo, ["tag", "-l"]).stdout.split("\n").filter((line) => line !== "");
  if (cloned.length > 0) git(repo, ["tag", "-d", ...cloned]);

  const config = options.config === null ? null : { ...baseConfig(upstream), ...options.config };
  const files: Record<string, string | Uint8Array | null> = { ...options.files };
  if (config !== null) files[".stamity/upstream.json"] = `${JSON.stringify(config, null, 2)}\n`;
  if (options.editAlpha === true) files["content/rules/alpha.md"] = ALPHA_FORK;
  if (options.enterprise === true) {
    files["config.json"] = '{\n  "tier": "enterprise"\n}\n';
    files["scripts/gate.mjs"] = GATE_SOURCE;
  }
  writeFiles(dir, files);
  if (options.editAlpha === true || options.regenerate === true) regenerate(repo);
  const head =
    Object.keys(files).length > 0
      ? commitAll(repo, "fork customizations")
      : git(repo, ["rev-parse", "HEAD"]).stdout.trim();
  return { ...repo, upstream, head, config };
}

/** A repository with the upstream's v1.0.0 tree and none of its history. */
export function createUnrelatedFork(upstream: UpstreamFixture, parent: string): ForkFixture {
  const fork = createFork(upstream, parent, { name: "unrelated" });
  rmSync(join(fork.dir, ".git"), { recursive: true, force: true });
  git(fork, ["-c", "init.defaultBranch=main", "init", "--quiet"]);
  const head = commitAll(fork, "imported without history");
  return { ...fork, head };
}

// ---------------------------------------------------------------------------------------------
// Running the lane

export interface LaneDocument {
  tool: string;
  version: number;
  verb: string | null;
  outcome: string;
  exitCode: number;
  config: Record<string, unknown> | null;
  upstream: { url: string; remote: string; branch: string; defaultBranchHead: string | null } | null;
  integrated: { tag: string; commit: string; record: Record<string, unknown> | null } | null;
  integratedReleases: { tag: string; commit: string; record: Record<string, unknown> | null; verified: boolean }[];
  unverified: { tag: string; commit: string; gates: string | null }[];
  target: { tag: string; commit: string; date: string | null; isPrerelease: boolean } | null;
  candidates: { tag: string; commit: string; date: string }[];
  skipped: string[];
  divergence: { behindRelease: number; aheadOfRelease: number; upstreamAheadOfRelease: number | null } | null;
  affected: {
    overlaps: { path: string; upstreamLines: { added: number | null; removed: number | null } }[];
    watched: { path: string; upstreamLines: { added: number | null; removed: number | null } }[];
    shadowed: {
      forkPath: string;
      upstreamPath: string;
      change: string;
      renamedTo?: string;
      upstreamLines: { added: number | null; removed: number | null };
    }[];
    renamed: { from: string; to: string; forkChanged: boolean }[];
  } | null;
  conflicts: {
    path: string;
    kind: string;
    generated: boolean;
    deletedBy?: string;
    renamedFrom?: string;
    renamedTo?: string;
    resolvedBy?: string;
    regenerated?: boolean;
  }[];
  gates: { name: string; run: string; status: string; exitCode: number | null; durationMs: number; outputTail: string }[];
  regenerate: { run: string; status: string; exitCode: number; durationMs: number; outputTail: string }[];
  unlistedGenerated: { path: string; change: string }[];
  branch: string | null;
  worktree: string | null;
  mergeCommit: string | null;
  record: string | null;
  lostRecords: { path: string; tag: string; commit: string }[];
  releaseNotes: string | null;
  diffStat: string | null;
  report: string;
  messages: string[];
}

export interface LaneResult {
  code: number;
  doc: LaneDocument;
  stdout: string;
  stderr: string;
}

/** Spawns `node scripts/upstream.mjs <args> --json` in `cwd` and parses the document. */
export function runLane(repo: Repo, args: readonly string[], opts: { cwd?: string; env?: Record<string, string> } = {}): LaneResult {
  const cwd = opts.cwd ?? repo.dir;
  const result = spawnSync(process.execPath, [SCRIPT, ...args, "--json"], {
    cwd,
    env: { ...repo.env, ...opts.env },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  let doc: LaneDocument;
  try {
    doc = JSON.parse(result.stdout) as LaneDocument;
  } catch (error) {
    throw new Error(
      `the lane wrote no JSON document for ${args.join(" ")} in ${cwd} (exit ${result.status}):\n` +
        `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
      { cause: error },
    );
  }
  return { code: result.status ?? -1, doc, stdout: result.stdout, stderr: result.stderr };
}

/** Starts the lane without waiting, for the interruption scenario. */
export function spawnLane(repo: Repo, args: readonly string[], env: Record<string, string>): ChildProcess {
  return spawn(process.execPath, [SCRIPT, ...args, "--json"], {
    cwd: repo.dir,
    env: { ...repo.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

/** Waits for `predicate` to become true, polling; rejects at the deadline. */
export async function waitFor(predicate: () => boolean, label: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
    // oxlint-disable-next-line no-await-in-loop -- a poll is sequential by nature: each wait precedes the next look
    await new Promise((done) => setTimeout(done, 50));
  }
}

/** Waits for a child to exit, whatever way. */
export function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      done();
      return;
    }
    child.once("exit", () => done());
  });
}

// ---------------------------------------------------------------------------------------------
// Assertions' raw material

const UPDATE_WORKTREE_ROOT = `.stamity/upstream-work`;

/**
 * Everything an operator owns in a repository, as one comparable string: the sha256 of every
 * file in the working tree (the `.git` directory and the lane's own `.stamity/upstream-work/`
 * excepted — the latter is the one directory the spec lets the lane create there), the index
 * as `ls-files --stage` lists it, the status, the stash list, and every branch and tag.
 *
 * The index is compared by content rather than by the raw `.git/index` bytes: this snapshot
 * itself runs `git status`, which refreshes stat data in the file, so raw bytes would
 * disagree between two snapshots for a reason that has nothing to do with the lane.
 *
 * The lane's own update branches (`refs/heads/stamity-upstream/`) are left out of the ref
 * list for the same reason the update worktree is left out of the file walk: REQ-UPSTREAM-006
 * lets `integrate` create exactly those, and the cases that promise NO branch (preview) assert
 * `updateBranches()` is empty on their own.
 */
export function snapshotRepo(repo: Repo): string {
  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).toSorted((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(current, entry.name);
      const rel = relative(repo.dir, absolute).split(sep).join("/");
      if (rel === ".git" || rel === UPDATE_WORKTREE_ROOT) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files[rel] = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    }
  };
  walk(repo.dir);
  return JSON.stringify(
    {
      head: git(repo, ["rev-parse", "HEAD"]).stdout,
      index: git(repo, ["ls-files", "--stage"]).stdout,
      status: git(repo, ["status", "--porcelain=v2", "--untracked-files=all"]).stdout,
      stash: git(repo, ["stash", "list"]).stdout,
      refs: git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/tags"])
        .stdout.split("\n")
        .filter((line) => !line.startsWith("refs/heads/stamity-upstream/"))
        .join("\n"),
      files,
    },
    null,
    1,
  );
}

/** The commit a branch points at, or null. */
export function branchHead(repo: Repo, branch: string): string | null {
  const result = git(repo, ["rev-parse", "-q", "--verify", `refs/heads/${branch}^{commit}`], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** The update branches (`stamity-upstream/*`) the repository holds. */
export function updateBranches(repo: Repo): string[] {
  return git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads/stamity-upstream/"])
    .stdout.split("\n")
    .filter((line) => line !== "");
}

/** The registered worktrees other than the main one, in the platform's own path spelling. */
export function linkedWorktrees(repo: Repo): string[] {
  return git(repo, ["worktree", "list", "--porcelain"])
    .stdout.split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => resolve(line.slice("worktree ".length)))
    .slice(1);
}

/** The file at `path` in `commit`, or null when the commit has no such path. */
export function fileAt(repo: Repo, commit: string, path: string): string | null {
  const result = git(repo, ["show", `${commit}:${path}`], { allowFailure: true });
  return result.status === 0 ? result.stdout : null;
}

/** The blob id of `path` at `commit`, or null: how two binaries are compared without decoding them. */
export function blobIdAt(repo: Repo, commit: string, path: string): string | null {
  const result = git(repo, ["rev-parse", "-q", "--verify", `${commit}:${path}`], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** The parents of a commit, in order. */
export function parentsOf(repo: Repo, commit: string): string[] {
  return git(repo, ["rev-list", "--parents", "-n", "1", commit]).stdout.trim().split(" ").slice(1);
}

/** True when `ancestor` is reachable from `descendant`. */
export function isAncestor(repo: Repo, ancestor: string, descendant: string): boolean {
  return git(repo, ["merge-base", "--is-ancestor", ancestor, descendant], { allowFailure: true }).status === 0;
}

/** The record committed at `commit` for `tag`, parsed, or null. */
export function recordAt(repo: Repo, commit: string, tag: string): Record<string, unknown> | null {
  const text = fileAt(repo, commit, `.stamity/upstream/integrations/${tag}.json`);
  return text === null ? null : (JSON.parse(text) as Record<string, unknown>);
}

/** Reads a file of the working tree at `dir` by POSIX path. */
export function readTreeFile(dir: string, path: string): string {
  return readFileSync(join(dir, ...path.split("/")), "utf8");
}

export function treeFileExists(dir: string, path: string): boolean {
  const target = join(dir, ...path.split("/"));
  return existsSync(target) && statSync(target).isFile();
}

/** A fresh, symlink-resolved scratch directory for one fixture family. */
export function makeScratch(label: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), `stamity-upstream-${label}-${process.pid}-`));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) };
}
