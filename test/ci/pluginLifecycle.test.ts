// Every walk below drives one client CLI through three states in a fixed order, and the spawns are
// deliberately sequential — an update must observe the tree the install left, not a concurrent one.
/* oxlint-disable no-await-in-loop */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — the distribution modules ship as plain .mjs with no type declarations: they
// run under bare Node in a release job, with no TypeScript nearby.
import { CATALOG_PATHS } from "../../scripts/plugins/catalogs.mjs";

/**
 * `scripts/plugin-lifecycle-fixture.mjs` and the consumer walks it exists for: install at one
 * version, update to the next, roll back to the first, with the repository's own files proved
 * untouched at every step (REQ-PLUGIN-021, REQ-PLUGIN-013).
 *
 * TWO GROUPS, SPLIT BY WHAT THEY NEED.
 *
 *   the fixture       the builder as a CHILD PROCESS, with a STUB runtime. What is under test are
 *                     properties of the two TREES and the bare repository it leaves — a diff whose
 *                     every path is accounted for, two orphan commits, a rebuild that reproduces
 *                     the same bytes and the same shas — and an in-process call would prove the
 *                     renderer agrees with itself while saying nothing about what lands on disk.
 *                     No client, no network: this group runs everywhere.
 *   the client walks  one per client, each `describe.skipIf`-gated on that client's
 *                     `STAMITY_<CLIENT>_BIN` and on a built `dist/`, sharing ONE fixture built
 *                     with a REAL runtime. The locator the walk calls spawns the bundled runtime,
 *                     so a stub runtime cannot answer `plugin status`; that is the whole reason
 *                     this second, expensive fixture exists.
 *
 * `--runtime` is a STUB in the first group: a directory carrying the three files the distribution
 * build requires of a runtime (`package.json`, `dist/cli.js`, `RUNTIME.json`). The real bundled
 * runtime is built from a packed tarball and proven by `test/ci/pluginRuntime.test.ts`; rebuilding
 * it here would add a minute of `npm pack` to every run to re-prove a contract that already has an
 * owner. The second group pays for a real one because its assertions run it.
 *
 * Everything lands under `os.tmpdir()`, never inside the checkout: the leak gate lists files
 * through `git ls-files` and an ignored directory inside a repository lists ZERO files, which
 * would turn its "0 hits" into a pass over nothing.
 *
 * THE ROUTES, AS MEASURED ON 2026-09-20 rather than as documented. Every step below was walked by
 * hand on this machine before it was written down, against claude 2.1.278, GitHub Copilot CLI
 * 1.0.85, codex-cli 0.154.0 and Cursor agent CLI 2026.09.15, and the walks assert exactly what was
 * observed:
 *
 *   claude   A local bare repository cannot be a marketplace source at all: `marketplace add
 *            <path>#<tag>` reports "Path does not exist" for the literal string, and a `file://`
 *            URL is refused as "Invalid marketplace source format". What works is a CLONE checked
 *            out at the tag, added as a DIRECTORY marketplace — and the shipped catalog's
 *            `git-subdir` source then still sends the install to the configured https url, which
 *            fails with "Remote branch plugins/v1.9.0-fixture.1 not found in upstream origin". So
 *            the walk rewrites the CLONE's catalog entry `source` to the relative root path
 *            `./claude` — the form the Cursor and Copilot catalogs already ship, and the consumer-
 *            side rewrite `docs/plugins.md`'s private-mirror route describes — and never touches
 *            the plugin root itself. Install and update are then scope-bound: `--scope project` on
 *            BOTH, because `plugin update` defaults to user scope and refuses with "not installed
 *            at scope user". There is NO `rollback` subcommand on 2.1.278 (`claude plugin
 *            rollback stamity` answers `error: unknown command 'rollback'`, and the sha-256 of
 *            `claude plugin --help` is recorded in the run record), so the rollback route is the
 *            marketplace moved back to the `.1` tag plus `plugin update`, which re-records the
 *            version downwards — the route the CLI's own reinstall message names.
 *   copilot  A local directory marketplace loads the plugin LIVE: `plugin install` answers "it is
 *            loaded live from <path> … nothing was copied", and `plugin update` answers "there is
 *            nothing to update". The version therefore follows the marketplace directory, so
 *            update and rollback are both TREE REPLACEMENT and `plugin update` is a no-op that the
 *            walk records rather than skips.
 *   codex    A local marketplace is COPIED into `$CODEX_HOME/plugins/cache/<market>/<plugin>/
 *            <version>/`, and `plugin marketplace upgrade` answers "No configured Git marketplaces
 *            to upgrade" — it refreshes git snapshots only. So update and rollback are the
 *            marketplace directory moved plus `plugin add <plugin>@<marketplace>` again.
 *   cursor   `agent plugin marketplace add` takes a git URL and needs an account
 *            ("Authentication required. Run 'agent login' …"), so a local bare repository is not a
 *            source it can take at all and that step is recorded SKIPPED with the reason. The
 *            route walked is `--plugin-dir` over the tree, replaced between states.
 *
 * Wall-time budgets, derived rather than guessed, with the command that produced each number.
 * Measured 2026-09-20 on this repository's corpus (darwin 25.6.0, `/usr/bin/time -p` around a real
 * `node scripts/plugin-lifecycle-fixture.mjs`):
 *
 *   two versions, four roots, stub runtime   `--runtime <stub>`                  4.95s
 *   two versions, one root, stub runtime     the same plus `--client claude`      4.34s
 *   two versions, four roots, own runtime    no `--runtime` (npm pack + npm ci)  67.60s
 *
 * The bases below round each figure up. MARGIN is the one guessed number and it is wide, because
 * the required CI legs include a Windows runner that is not measurable from here.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT = join(REPO_ROOT, "scripts", "plugin-lifecycle-fixture.mjs");
const CLIENTS = ["claude", "cursor", "copilot", "codex"] as const;
type Client = (typeof CLIENTS)[number];

/** The pair every case builds. The `-fixture.N` suffix is deliberate — see the note at `VERSIONS`. */
const V1 = "1.9.0-fixture.1";
const V2 = "1.9.0-fixture.2";
/**
 * A prerelease suffix, not a plain patch bump: `renovate/plugins.json`'s tag regex ignores
 * `-fixture.N`, so building and (in the maintainer's own rehearsal) pushing this pair cannot open
 * an update pull request anywhere. The private mirror's suffix-free tags are a separate walk.
 */
const VERSIONS = [V1, V2] as const;

const MARGIN = 8;
/** One `--runtime <stub>` build of both versions and all four roots: 4.95s measured. */
const STUB_BUILD_MS = 6_000 * MARGIN;
/**
 * One build that packs this checkout and installs a production graph: 67.60s measured. The margin
 * is 4 rather than 8 because the dominant term is `npm ci` against a registry, whose own budget
 * `test/ci/pluginRuntime.test.ts` already derives at 600s for the cold-cache case.
 */
const REAL_BUILD_MS = 70_000 * 4;
/** One client CLI call, or one locator call. Each observed under 10s; a loaded runner gets 12x. */
const STEP_MS = 120_000;
/** A whole three-state walk: an install, a setup, three status reads, an update, a rollback. */
const WALK_MS = 600_000;

/** The repository must be built for a real runtime to exist — `test/ci/pluginRuntime.test.ts`'s rule. */
const BUILT = existsSync(join(REPO_ROOT, "dist", "cli.js"));

const work = realpathSync(mkdtempSync(join(tmpdir(), "stamity-plugin-lifecycle-")));
/**
 * The removal is given the step budget explicitly: an armed run leaves two distribution trees per
 * fixture, a real bundled runtime inside each of their four roots and a clone per client — tens of
 * thousands of files, which is well past vitest's 20s default hook timeout (measured: the default
 * fired on the first armed run of this suite).
 */
afterAll(() => rmSync(work, { recursive: true, force: true }), STEP_MS);

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/**
 * A `--runtime` input the builder accepts. Justified stub — see the suite header; the real runtime
 * has its own proof in `test/ci/pluginRuntime.test.ts`, and the second group here builds one.
 */
function stubRuntime(): string {
  const dir = tempDir("runtime");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "@zomarit/stamity", version: "1.8.0", engines: { node: ">=22.22.2" } }, null, 2)}\n`,
  );
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist", "cli.js"), "#!/usr/bin/env node\nconsole.log('stub runtime');\n");
  writeFileSync(
    join(dir, "RUNTIME.json"),
    `${JSON.stringify(
      { package: "@zomarit/stamity", version: "1.8.0", nodeFloor: ">=22.22.2", tarballSha256: "a".repeat(64), dependencies: [] },
      null,
      2,
    )}\n`,
  );
  return dir;
}

function fixture(args: string[], timeout: number): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
}

/** Both versions and the bare repository, into a fresh directory. */
function buildFixture(out: string, extra: string[], timeout: number): SpawnSyncReturns<string> {
  const result = fixture(["--out", out, "--versions", VERSIONS.join(","), ...extra], timeout);
  if (result.status !== 0) {
    throw new Error(`the fixture build exited ${String(result.status)}:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

/** Every regular file under `dir`, POSIX-relative and sorted; `.git` is never part of a tree. */
function treeFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      if (entry.name === ".git") return [];
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return treeFiles(join(dir, entry.name), rel);
      return entry.isFile() ? [rel] : [];
    });
}

function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The sha-256 of every file in a tree, keyed by POSIX-relative path — the map every walk compares. */
function digestMap(dir: string): Map<string, string> {
  return new Map(treeFiles(dir).map((rel) => [rel, digest(readFileSync(join(dir, rel)))]));
}

function git(args: string[], cwd: string): SpawnSyncReturns<string> {
  return spawnSync("git", args, { cwd, encoding: "utf8", timeout: STEP_MS, maxBuffer: 64 * 1024 * 1024 });
}

function gitOut(args: string[], cwd: string): string {
  const result = git(args, cwd);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} exited ${String(result.status)}: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * One result row, the form REQ-PLUGIN-021 asks the walk to print, kept as well as printed so each
 * walk can assert its own row set rather than leave the lines decorative.
 *
 * A RAW STDOUT WRITE, not `console.log`: vitest intercepts the console and this repository's
 * reporter drops the interception for a passing test — measured 2026-09-20 on vitest 5.0.0 with a
 * two-line probe suite, where `process.stdout.write` reached the run's output and `console.log` and
 * `console.info` did not. The run record and the QA evidence read these rows from that output.
 */
const ROWS: string[] = [];
function row(client: Client, step: string, verdict: "PASS" | "FAIL" | "SKIPPED", reason = ""): void {
  const line = `plugin-lifecycle: ${client} ${step} ${verdict}${reason === "" ? "" : ` (${reason})`}`;
  ROWS.push(line);
  process.stdout.write(`${line}\n`);
}

/** The steps this client's walk has recorded so far, in order, with their verdicts. */
function stepsOf(client: Client): string[] {
  const prefix = `plugin-lifecycle: ${client} `;
  return ROWS.filter((line) => line.startsWith(prefix)).map((line) => {
    const [step, verdict] = line.slice(prefix.length).split(" ");
    return `${step ?? ""} ${verdict ?? ""}`;
  });
}

/** The release manifest, with each archive's digest and size blanked — see the case that uses it. */
interface ReleaseManifest {
  readonly packages: { readonly sha256: string; readonly bytes: number }[];
}
function withoutArchiveDigests(manifest: ReleaseManifest): unknown {
  return { ...manifest, packages: manifest.packages.map((entry) => ({ ...entry, sha256: null, bytes: null })) };
}

// ── group one: the fixture the walks run on ──────────────────────────────────────────────

describe("plugin-lifecycle-fixture, the two trees", () => {
  let out = "";
  let first = "";
  let second = "";
  let release: {
    readonly distribution: { readonly branch: string; readonly tag: string };
    readonly sourceCommit: string;
    readonly sourceCommitDate: string;
  };

  beforeAll(() => {
    out = join(tempDir("fixture"), "lifecycle");
    buildFixture(out, ["--runtime", stubRuntime()], STUB_BUILD_MS);
    first = join(out, V1);
    second = join(out, V2);
    release = JSON.parse(readFileSync(join(first, "release.json"), "utf8")) as typeof release;
  }, STUB_BUILD_MS);

  /** `<version 2>`'s text with every mention of its version rewritten to `<version 1>`'s. */
  const asFirstVersion = (path: string): string => readFileSync(join(second, path), "utf8").replaceAll(V2, V1);

  it("adds exactly the marker skill and the second version's archives", () => {
    const before = digestMap(first);
    const after = digestMap(second);
    const added = [...after.keys()].filter((path) => !before.has(path)).toSorted();
    const removed = [...before.keys()].filter((path) => !after.has(path)).toSorted();

    // The marker lands in every client's skills home and in the APM primitives beside them, under
    // the PREFIXED-free slug the fork layer authored it as (the generator refuses a `st-`-prefixed
    // fork directory: that prefix names the generated corpus, not a fork's own artifact).
    const marker = [".apm/skills/fixture-marker/SKILL.md", ...CLIENTS.map((c) => `${c}/skills/fixture-marker/SKILL.md`)];
    const archives = (version: string): string[] =>
      CLIENTS.flatMap((c) => [`stamity-plugin-${c}-${version}.zip`, `stamity-plugin-${c}-${version}.zip.sha256`]);

    expect(added).toEqual([...marker, ...archives(V2)].toSorted());
    expect(removed).toEqual(archives(V1).toSorted());
    // Non-degenerate by construction: five artifacts and eight archives on one side, eight on the
    // other, over a tree of several hundred files.
    expect(added.length).toBe(13);
    expect(removed.length).toBe(8);
  });

  it("changes nothing a version rewrite plus the marker does not account for", () => {
    const before = digestMap(first);
    const after = digestMap(second);
    const changed = [...before.keys()].filter((path) => after.has(path) && before.get(path) !== after.get(path)).toSorted();

    // Every differing path is checked against the allow-list, and the list has exactly three rows.
    const unexplained: string[] = [];
    for (const path of changed) {
      if (path === "release.json") {
        // The manifest names each archive's digest and byte count, and the second version's
        // archives really do carry one more file — that difference is the marker's, not a drift.
        const rewritten = JSON.parse(asFirstVersion(path)) as ReleaseManifest;
        const original = JSON.parse(readFileSync(join(first, path), "utf8")) as ReleaseManifest;
        expect(withoutArchiveDigests(rewritten)).toEqual(withoutArchiveDigests(original));
        expect(rewritten.packages.map((entry) => entry.sha256)).not.toEqual(original.packages.map((entry) => entry.sha256));
        continue;
      }
      if (CLIENTS.some((client) => path === `${client}/stamity-plugin.json`)) {
        // The capability file counts the artifacts its root carries, so the SKILL class is one
        // higher and every other class — carried or repository-owned — is untouched.
        interface Capability {
          readonly classes: Record<string, { readonly status: string; readonly count?: number }>;
        }
        const rewritten = JSON.parse(asFirstVersion(path)) as Capability;
        const original = JSON.parse(readFileSync(join(first, path), "utf8")) as Capability;
        expect({ ...rewritten, classes: null }).toEqual({ ...original, classes: null });
        const moved = Object.keys(rewritten.classes).filter(
          (kind) => JSON.stringify(rewritten.classes[kind]) !== JSON.stringify(original.classes[kind]),
        );
        expect(moved).toEqual(["skill"]);
        expect(rewritten.classes["skill"]?.count).toBe((original.classes["skill"]?.count ?? 0) + 1);
        continue;
      }
      if (asFirstVersion(path) !== readFileSync(join(first, path), "utf8")) unexplained.push(path);
    }
    expect(unexplained).toEqual([]);

    // The floor under the allow-list: the paths that MUST differ do, so a build that stopped
    // stamping the version could not pass this case by producing two identical trees.
    expect(changed).toContain("release.json");
    expect(changed).toContain("README.md");
    for (const client of CLIENTS) expect(changed).toContain(`${client}/stamity-plugin.json`);
    // Three catalogs carry the version and its tag as a `ref`; the Codex catalog carries NEITHER,
    // because its schema documents no entry version and its source here is the local `./codex`
    // path — the fact `scripts/plugins/catalogs.mjs` records against REQ-PLUGIN-010, measured here
    // as two identical files rather than taken on the module's word.
    for (const client of ["claude", "cursor", "copilot"] as const) expect(changed).toContain(CATALOG_PATHS[client]);
    expect(changed).not.toContain(CATALOG_PATHS.codex);
  });

  it("commits each tree as an orphan, tags both and leaves the branch at the second", () => {
    const bare = join(out, "remote.git");
    const tagOf = (version: string): string => release.distribution.tag.replace(V1, version);

    const refs = new Map(
      gitOut(["show-ref"], bare)
        .split("\n")
        .map((line) => line.split(" "))
        .map(([sha, ref]) => [ref ?? "", sha ?? ""]),
    );
    expect([...refs.keys()].toSorted()).toEqual(
      [`refs/heads/${release.distribution.branch}`, `refs/tags/${tagOf(V1)}`, `refs/tags/${tagOf(V2)}`].toSorted(),
    );
    // The branch names the NEWEST version, which is what a consumer tracking it installs.
    expect(refs.get(`refs/heads/${release.distribution.branch}`)).toBe(refs.get(`refs/tags/${tagOf(V2)}`));
    expect(refs.get(`refs/tags/${tagOf(V1)}`)).not.toBe(refs.get(`refs/tags/${tagOf(V2)}`));
    // HEAD points at the branch before anything is pushed, so a plain clone lands on a tree.
    expect(gitOut(["symbolic-ref", "HEAD"], bare)).toBe(`refs/heads/${release.distribution.branch}`);

    for (const version of VERSIONS) {
      // `rev-list --parents -n 1` prints the commit followed by its parents, so one field is an
      // orphan: the release's own rule, and what makes each version independently fetchable.
      expect(gitOut(["rev-list", "--parents", "-n", "1", tagOf(version)], bare).split(" ")).toHaveLength(1);
      expect(gitOut(["cat-file", "-t", tagOf(version)], bare)).toBe("commit");
      const commit = gitOut(["cat-file", "commit", tagOf(version)], bare);
      expect(commit).toContain("author fixture <fixture@example.invalid>");
      expect(commit).toContain(`plugins: v${version} from ${release.sourceCommit}`);
      // Both dates come from the manifest, never from the clock: that is what makes the sha stable.
      const stamp = String(Math.floor(Date.parse(release.sourceCommitDate) / 1000));
      expect(commit).toContain(`committer fixture <fixture@example.invalid> ${stamp}`);
    }

    expect(gitOut(["ls-tree", "-r", "--name-only", tagOf(V2)], bare).split("\n")).toContain(
      "claude/skills/fixture-marker/SKILL.md",
    );
    expect(gitOut(["ls-tree", "-r", "--name-only", tagOf(V1)], bare).split("\n")).not.toContain(
      "claude/skills/fixture-marker/SKILL.md",
    );
  });

  it(
    "rebuilds the same bytes and the same two commit shas",
    () => {
      const again = join(tempDir("rebuild"), "lifecycle");
      buildFixture(again, ["--runtime", stubRuntime()], STUB_BUILD_MS);
      for (const version of VERSIONS) {
        expect([...digestMap(join(again, version))]).toEqual([...digestMap(join(out, version))]);
      }
      // The shas are the strongest form of the same claim: they fold the tree, the message, the
      // author and both dates into one value, and a release that cannot reproduce them cannot
      // re-run its own publish step idempotently.
      expect(gitOut(["show-ref"], join(again, "remote.git"))).toBe(gitOut(["show-ref"], join(out, "remote.git")));
    },
    STUB_BUILD_MS,
  );
});

describe("plugin-lifecycle-fixture, the refusals", () => {
  const refuse = (args: string[]): SpawnSyncReturns<string> => fixture(args, STEP_MS);

  it.each([
    { label: "one version", args: ["--out", "x", "--versions", V1], message: "exactly two versions; got 1" },
    { label: "two identical versions", args: ["--out", "x", "--versions", `${V1},${V1}`], message: "two DIFFERENT versions" },
    { label: "build metadata", args: ["--out", "x", "--versions", `1.9.0+1,${V2}`], message: "no build metadata" },
    { label: "an unknown client", args: ["--out", "x", "--versions", VERSIONS.join(","), "--client", "emacs"], message: "--client emacs is not one of" },
    { label: "no versions at all", args: ["--out", "x"], message: "--versions is required" },
    { label: "no output directory", args: ["--versions", VERSIONS.join(",")], message: "--out is required" },
    { label: "an unknown flag", args: ["--out", "x", "--nope", "y"], message: "Unknown argument: --nope" },
  ])("refuses $label with exit 2 before any build", ({ args, message }) => {
    const result = refuse(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
    // Nothing was built: a refusal that had started writing would leave half a fixture behind.
    expect(result.stdout).toBe("");
  });

  it("refuses an output directory that already holds files", () => {
    const occupied = tempDir("occupied");
    writeFileSync(join(occupied, "keep.txt"), "mine\n");
    const result = refuse(["--out", occupied, "--versions", VERSIONS.join(",")]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("already holds files");
    expect(readFileSync(join(occupied, "keep.txt"), "utf8")).toBe("mine\n");
  });
});

// ── group two: the client walks ──────────────────────────────────────────────────────────

/**
 * The expensive fixture, built at most once for every walk suite that runs. A module-level memo
 * rather than a shared `beforeAll`, because four independent `describe`s cannot share one hook and
 * building it four times would cost four minutes to prove the same two trees.
 */
let realFixture: string | null = null;
function withRealRuntime(): string {
  realFixture ??= (() => {
    const out = join(tempDir("real"), "lifecycle");
    // No `--runtime`: the builder packs this checkout and builds one, which is the route the
    // verify line in the plan cell runs and the only runtime the locator can actually spawn.
    buildFixture(out, [], REAL_BUILD_MS);
    return out;
  })();
  return realFixture;
}

interface Walk {
  /** The fixture's two distribution trees. */
  readonly out: string;
  /** A clone of the fixture's bare repository, checked out at one tag at a time. */
  readonly mirror: string;
  /** A scratch repository the plugin is installed into, outside every checkout. */
  readonly project: string;
  /** This client's scratch home, so nothing touches the operator's own configuration. */
  readonly home: string;
}

function startWalk(client: Client): Walk {
  const out = withRealRuntime();
  const base = tempDir(`walk-${client}`);
  const mirror = join(base, "mirror");
  const project = join(base, "project");
  const home = join(base, "home");
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  // `--no-local`, so the clone is a real fetch rather than a hardlink farm into the fixture: a
  // checkout in the clone must never be able to touch the trees the assertions compare against.
  expect(git(["clone", "-q", "--no-local", join(out, "remote.git"), mirror], base).status).toBe(0);
  expect(git(["init", "-q", "."], project).status).toBe(0);
  return { out, mirror, project, home };
}

/** The mirror, moved to one version's tag. This is the "tree replacement" every route rests on. */
function moveMirror(walk: Walk, version: string, rewriteClaudeCatalog: boolean): void {
  const tag = (JSON.parse(readFileSync(join(walk.out, version, "release.json"), "utf8")) as {
    distribution: { tag: string };
  }).distribution.tag;
  expect(git(["checkout", "-q", "-f", tag], walk.mirror).status).toBe(0);
  if (!rewriteClaudeCatalog) return;
  // The consumer-side catalog rewrite the Claude route needs, and ONLY the catalog: the shipped
  // `git-subdir` source names an https url that a local fixture cannot serve, while a relative
  // root path is what the Cursor and Copilot catalogs already carry. The plugin root is untouched,
  // which the installed-tree map below proves independently.
  const path = join(walk.mirror, ".claude-plugin", "marketplace.json");
  const catalog = JSON.parse(readFileSync(path, "utf8")) as { plugins: { source: unknown }[] };
  const entry = catalog.plugins[0];
  if (entry === undefined) throw new Error("the Claude catalog carries no plugin entry");
  entry.source = "./claude";
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

/** The shipped root for one client at one version: what every installed tree is compared against. */
function shippedRoot(walk: Walk, client: Client, version: string): string {
  return join(walk.out, version, client);
}

/**
 * The repository's own files, with the manifest's `updatedAt` dropped. That one field is a clock
 * read by design, so comparing it would make every re-read of a repository look like a change;
 * everything else in the map is a byte a person would notice moving.
 */
function repositoryOwned(project: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rel of treeFiles(project)) {
    if (rel === ".claude/settings.json") continue; // the client's own explicit install write
    if (rel === ".stamity/manifest.json") {
      const manifest = JSON.parse(readFileSync(join(project, rel), "utf8")) as Record<string, unknown>;
      delete manifest["updatedAt"];
      map.set(rel, digest(JSON.stringify(manifest)));
      continue;
    }
    map.set(rel, digest(readFileSync(join(project, rel))));
  }
  return map;
}

/** `stamity plugin <args>` through an installed root's own locator, the way a client spawns it. */
function locate(root: string, project: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(root, "runtime", "locate.mjs"), "--", ...args], {
    cwd: project,
    encoding: "utf8",
    timeout: STEP_MS,
    maxBuffer: 64 * 1024 * 1024,
    // The variable a client sets when it spawns a plugin's command. The locator resolves the
    // runtime from its OWN path, so this is the client's convention rather than an input it needs.
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
  });
}

/** `plugin status --json` through the locator, asserted `compatible` and returned for the record. */
function assertCompatible(client: Client, root: string, project: string, version: string, state: string): void {
  const result = locate(root, project, ["plugin", "status", "--json"]);
  expect(result.status, result.stderr).toBe(0);
  const status = JSON.parse(result.stdout) as {
    installMode: string;
    compatibility: { state: string; pluginVersion: string };
  };
  expect(status.compatibility.pluginVersion).toBe(version);
  expect(status.compatibility.state).toBe("compatible");
  expect(status.installMode).toBe("plugin-backed");
  row(client, `status-${state}`, "PASS", `compatible at ${version}`);
}

/** The version a root declares, read from its capability file rather than from a CLI's wording. */
function rootVersion(root: string): string {
  return (JSON.parse(readFileSync(join(root, "stamity-plugin.json"), "utf8")) as { version: string }).version;
}

const skipReason = (client: Client): string =>
  process.env[`STAMITY_${client.toUpperCase()}_BIN`] === undefined
    ? `STAMITY_${client.toUpperCase()}_BIN unset`
    : "dist/cli.js absent; run npm run build";
const armed = (client: Client): boolean => BUILT && process.env[`STAMITY_${client.toUpperCase()}_BIN`] !== undefined;

describe.skipIf(!armed("claude"))("the Claude install, update and rollback walk", () => {
  let walk: Walk;
  let bin = "";
  let owned: Map<string, string>;

  beforeAll(() => {
    walk = startWalk("claude");
    bin = process.env["STAMITY_CLAUDE_BIN"] ?? "";
  }, REAL_BUILD_MS);

  /**
   * A scratch `CLAUDE_CONFIG_DIR` and the operator's real `HOME`. Measured: every command this
   * walk runs works with no login at all, and every write it makes — the marketplace record, the
   * per-version plugin cache — lands inside that scratch directory, so nothing has to be cleaned
   * out of the operator's own configuration afterwards and no credential is read or copied.
   */
  const claude = (args: string[]): SpawnSyncReturns<string> =>
    spawnSync(bin, args, {
      cwd: walk.project,
      encoding: "utf8",
      timeout: STEP_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CLAUDE_CONFIG_DIR: join(walk.home, "claude-config") },
    });

  /** Where a project-scope install of this marketplace lands: one directory per version. */
  const installedRoot = (version: string): string =>
    join(walk.home, "claude-config", "plugins", "cache", "stamity", "stamity", version);

  it(
    "installs at the first version, updates to the second and rolls back to the first",
    () => {
      // ── install ───────────────────────────────────────────────────────
      moveMirror(walk, V1, true);
      const added = claude(["plugin", "marketplace", "add", walk.mirror]);
      expect(added.status, added.stderr).toBe(0);
      expect(`${added.stdout}${added.stderr}`).toContain("stamity");
      const install = claude(["plugin", "install", "stamity@stamity", "--scope", "project", "--json"]);
      expect(install.status, install.stderr).toBe(0);
      expect(JSON.parse(install.stdout)).toMatchObject({ outcome: "ok", scope: "project" });
      expect([...digestMap(installedRoot(V1))]).toEqual([...digestMap(shippedRoot(walk, "claude", V1))]);
      expect(rootVersion(installedRoot(V1))).toBe(V1);
      row("claude", "install", "PASS", `directory marketplace at ${V1}, ${String(digestMap(installedRoot(V1)).size)} files`);

      // The one repository write a project-scope install makes, and the marketplace record that
      // does NOT land here: `extraKnownMarketplaces` went to the scratch config directory.
      const settings = JSON.parse(readFileSync(join(walk.project, ".claude", "settings.json"), "utf8")) as Record<
        string,
        unknown
      >;
      expect(Object.keys(settings)).toEqual(["enabledPlugins"]);
      expect(settings["enabledPlugins"]).toEqual({ "stamity@stamity": true });

      // ── setup, so a manifest exists for `plugin status` to compare against ──
      const setup = locate(installedRoot(V1), walk.project, ["plugin", "setup", "--client", "claude", "-y"]);
      expect(setup.status, setup.stderr).toBe(0);
      owned = repositoryOwned(walk.project);
      expect(owned.size).toBeGreaterThan(5);
      row("claude", "setup", "PASS", `${String(owned.size)} repository-owned files`);
      assertCompatible("claude", installedRoot(V1), walk.project, V1, "installed");

      // ── auto-update stays off ─────────────────────────────────────────
      // The explicit update against an UNMOVED source: a third-party marketplace must not move a
      // pinned consumer on its own, and this is the assertion that would catch it if it did.
      const idle = claude(["plugin", "update", "stamity", "--scope", "project", "--json"]);
      expect(idle.status, idle.stderr).toBe(0);
      expect(JSON.parse(idle.stdout)).toMatchObject({ updateOutcome: "up_to_date", oldVersion: V1, newVersion: V1 });
      row("claude", "no-auto-update", "PASS", "up_to_date while the source had not moved");

      // ── update ────────────────────────────────────────────────────────
      moveMirror(walk, V2, true);
      expect(claude(["plugin", "marketplace", "update", "stamity"]).status).toBe(0);
      const update = claude(["plugin", "update", "stamity", "--scope", "project", "--json"]);
      expect(update.status, update.stderr).toBe(0);
      expect(JSON.parse(update.stdout)).toMatchObject({ updateOutcome: "updated", oldVersion: V1, newVersion: V2 });
      expect([...digestMap(installedRoot(V2))]).toEqual([...digestMap(shippedRoot(walk, "claude", V2))]);
      expect(rootVersion(installedRoot(V2))).toBe(V2);
      expect(existsSync(join(installedRoot(V2), "skills", "fixture-marker", "SKILL.md"))).toBe(true);
      expect([...repositoryOwned(walk.project)]).toEqual([...owned]);
      row("claude", "update", "PASS", `plugin update --scope project to ${V2}, marker discovered`);
      assertCompatible("claude", installedRoot(V2), walk.project, V2, "updated");

      // ── rollback ──────────────────────────────────────────────────────
      // Measured on 2.1.278: there is no `rollback` subcommand, so the route is the marketplace
      // moved back to the `.1` tag and `plugin update` re-recording the version downwards.
      const absent = claude(["plugin", "rollback", "stamity"]);
      expect(`${absent.stdout}${absent.stderr}`).toContain("unknown command 'rollback'");
      row("claude", "rollback-subcommand", "SKIPPED", "claude 2.1.278 has no rollback subcommand");
      moveMirror(walk, V1, true);
      expect(claude(["plugin", "marketplace", "update", "stamity"]).status).toBe(0);
      const back = claude(["plugin", "update", "stamity", "--scope", "project", "--json"]);
      expect(back.status, back.stderr).toBe(0);
      expect(JSON.parse(back.stdout)).toMatchObject({ updateOutcome: "updated", oldVersion: V2, newVersion: V1 });
      expect([...digestMap(installedRoot(V1))]).toEqual([...digestMap(shippedRoot(walk, "claude", V1))]);
      expect(existsSync(join(installedRoot(V1), "skills", "fixture-marker", "SKILL.md"))).toBe(false);
      expect([...repositoryOwned(walk.project)]).toEqual([...owned]);
      row("claude", "rollback", "PASS", `reinstall route: marketplace at ${V1} plus plugin update`);
      assertCompatible("claude", installedRoot(V1), walk.project, V1, "rolled-back");

      // The rows are the walk's own record, so the walk asserts them: a step that stopped running
      // would otherwise drop out of the output with nothing failing.
      expect(stepsOf("claude")).toEqual([
        "install PASS",
        "setup PASS",
        "status-installed PASS",
        "no-auto-update PASS",
        "update PASS",
        "status-updated PASS",
        "rollback-subcommand SKIPPED",
        "rollback PASS",
        "status-rolled-back PASS",
      ]);
    },
    WALK_MS,
  );
});

describe.skipIf(!armed("copilot"))("the Copilot install, update and rollback walk", () => {
  let walk: Walk;
  let bin = "";

  beforeAll(() => {
    walk = startWalk("copilot");
    bin = process.env["STAMITY_COPILOT_BIN"] ?? "";
  }, REAL_BUILD_MS);

  /** A scratch `HOME` and `COPILOT_HOME`: no credential is read, and nothing is cleaned up after. */
  const copilot = (args: string[]): SpawnSyncReturns<string> =>
    spawnSync(bin, args, {
      cwd: walk.project,
      encoding: "utf8",
      timeout: STEP_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, HOME: walk.home, COPILOT_HOME: join(walk.home, ".copilot") },
    });

  it(
    "installs live from the marketplace directory and follows it through both states",
    () => {
      moveMirror(walk, V1, false);
      const live = join(walk.mirror, "copilot");
      expect(copilot(["plugin", "marketplace", "add", walk.mirror]).status).toBe(0);
      const install = copilot(["plugin", "install", "stamity@stamity"]);
      expect(install.status, install.stderr).toBe(0);
      // The vendor's own words for the route: a local marketplace is not copied, so the installed
      // tree IS the marketplace directory and its version follows every checkout of it.
      expect(`${install.stdout}${install.stderr}`).toContain("loaded live");
      expect([...digestMap(live)]).toEqual([...digestMap(shippedRoot(walk, "copilot", V1))]);
      row("copilot", "install", "PASS", `live from a local marketplace at ${V1}`);

      const setup = locate(live, walk.project, ["plugin", "setup", "--client", "copilot", "-y"]);
      expect(setup.status, setup.stderr).toBe(0);
      const owned = repositoryOwned(walk.project);
      row("copilot", "setup", "PASS", `${String(owned.size)} repository-owned files`);
      assertCompatible("copilot", live, walk.project, V1, "installed");

      const idle = copilot(["plugin", "update", "stamity"]);
      expect(`${idle.stdout}${idle.stderr}`).toContain("nothing to update");
      expect(rootVersion(live)).toBe(V1);
      row("copilot", "no-auto-update", "PASS", "plugin update is a no-op for a local marketplace");

      moveMirror(walk, V2, false);
      expect(rootVersion(live)).toBe(V2);
      expect(existsSync(join(live, "skills", "fixture-marker", "SKILL.md"))).toBe(true);
      expect([...digestMap(live)]).toEqual([...digestMap(shippedRoot(walk, "copilot", V2))]);
      expect(copilot(["plugin", "list"]).stdout).toContain(V2);
      expect([...repositoryOwned(walk.project)]).toEqual([...owned]);
      row("copilot", "update", "PASS", `tree replacement to ${V2}; plugin update reports nothing to update`);
      assertCompatible("copilot", live, walk.project, V2, "updated");

      moveMirror(walk, V1, false);
      expect(rootVersion(live)).toBe(V1);
      expect(existsSync(join(live, "skills", "fixture-marker", "SKILL.md"))).toBe(false);
      expect([...digestMap(live)]).toEqual([...digestMap(shippedRoot(walk, "copilot", V1))]);
      expect(copilot(["plugin", "list"]).stdout).toContain(V1);
      expect([...repositoryOwned(walk.project)]).toEqual([...owned]);
      row("copilot", "rollback", "PASS", `reinstall route by tree replacement to ${V1}`);
      assertCompatible("copilot", live, walk.project, V1, "rolled-back");

      expect(stepsOf("copilot")).toEqual([
        "install PASS",
        "setup PASS",
        "status-installed PASS",
        "no-auto-update PASS",
        "update PASS",
        "status-updated PASS",
        "rollback PASS",
        "status-rolled-back PASS",
      ]);
    },
    WALK_MS,
  );
});

describe.skipIf(!armed("codex"))("the Codex install, update and rollback walk", () => {
  let walk: Walk;
  let bin = "";

  beforeAll(() => {
    walk = startWalk("codex");
    bin = process.env["STAMITY_CODEX_BIN"] ?? "";
  }, REAL_BUILD_MS);

  /** A scratch `CODEX_HOME`: the cache, the config and the marketplace record all land inside it. */
  const codex = (args: string[]): SpawnSyncReturns<string> =>
    spawnSync(bin, args, {
      cwd: walk.project,
      encoding: "utf8",
      timeout: STEP_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CODEX_HOME: walk.home },
    });

  const installedRoot = (version: string): string =>
    join(walk.home, "plugins", "cache", "stamity", "stamity", version);

  it(
    "copies the local marketplace into its cache and re-adds for both states",
    () => {
      moveMirror(walk, V1, false);
      expect(codex(["plugin", "marketplace", "add", walk.mirror]).status).toBe(0);
      const add = codex(["plugin", "add", "stamity@stamity"]);
      expect(add.status, add.stderr).toBe(0);
      expect([...digestMap(installedRoot(V1))]).toEqual([...digestMap(shippedRoot(walk, "codex", V1))]);
      row("codex", "install", "PASS", `local marketplace copied into the cache at ${V1}`);

      const setup = locate(installedRoot(V1), walk.project, ["plugin", "setup", "--client", "codex", "-y"]);
      expect(setup.status, setup.stderr).toBe(0);
      const owned = repositoryOwned(walk.project);
      row("codex", "setup", "PASS", `${String(owned.size)} repository-owned files`);
      assertCompatible("codex", installedRoot(V1), walk.project, V1, "installed");

      // Measured: `marketplace upgrade` refreshes GIT snapshots only, so a moved local tree does
      // not move an installed copy — which is the auto-update-off property, stated by the client.
      moveMirror(walk, V2, false);
      const upgrade = codex(["plugin", "marketplace", "upgrade"]);
      expect(`${upgrade.stdout}${upgrade.stderr}`).toContain("No configured Git marketplaces to upgrade");
      expect(codex(["plugin", "list"]).stdout).toContain(V1);
      row("codex", "no-auto-update", "PASS", "marketplace upgrade refreshes git sources only");

      expect(codex(["plugin", "add", "stamity@stamity"]).status).toBe(0);
      expect(codex(["plugin", "list"]).stdout).toContain(V2);
      expect([...digestMap(installedRoot(V2))]).toEqual([...digestMap(shippedRoot(walk, "codex", V2))]);
      expect(existsSync(join(installedRoot(V2), "skills", "fixture-marker", "SKILL.md"))).toBe(true);
      expect([...repositoryOwned(walk.project)]).toEqual([...owned]);
      row("codex", "update", "PASS", `tree replacement plus plugin add to ${V2}`);
      assertCompatible("codex", installedRoot(V2), walk.project, V2, "updated");

      moveMirror(walk, V1, false);
      expect(codex(["plugin", "add", "stamity@stamity"]).status).toBe(0);
      expect(codex(["plugin", "list"]).stdout).toContain(V1);
      expect([...digestMap(installedRoot(V1))]).toEqual([...digestMap(shippedRoot(walk, "codex", V1))]);
      expect([...repositoryOwned(walk.project)]).toEqual([...owned]);
      row("codex", "rollback", "PASS", `reinstall route: tree replacement plus plugin add to ${V1}`);
      assertCompatible("codex", installedRoot(V1), walk.project, V1, "rolled-back");

      expect(stepsOf("codex")).toEqual([
        "install PASS",
        "setup PASS",
        "status-installed PASS",
        "no-auto-update PASS",
        "update PASS",
        "status-updated PASS",
        "rollback PASS",
        "status-rolled-back PASS",
      ]);
    },
    WALK_MS,
  );
});

describe.skipIf(!armed("cursor"))("the Cursor local-path walk", () => {
  let walk: Walk;
  let bin = "";

  beforeAll(() => {
    walk = startWalk("cursor");
    bin = process.env["STAMITY_CURSOR_BIN"] ?? "";
  }, REAL_BUILD_MS);

  it(
    "replaces the --plugin-dir tree for each state, with no marketplace route available",
    () => {
      const version = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: STEP_MS });
      expect(version.status, version.stderr).toBe(0);
      row("cursor", "binary", "PASS", `agent ${version.stdout.trim()}`);

      // The marketplace route, measured and NOT walked: `agent plugin marketplace add` takes a git
      // URL and answers "Authentication required" against a local path, on a scratch HOME. A local
      // bare repository is not a source this client can take, so the row is honest about it rather
      // than reaching for the operator's account to make a green.
      const refused = spawnSync(bin, ["plugin", "marketplace", "add", join(walk.out, V1)], {
        cwd: walk.project,
        encoding: "utf8",
        timeout: STEP_MS,
        env: { ...process.env, HOME: walk.home },
      });
      expect(`${refused.stdout}${refused.stderr}`).toMatch(/Authentication required|git repository URL/);
      row("cursor", "marketplace", "SKIPPED", "agent plugin marketplace add needs a git URL and an account");

      const root = join(walk.mirror, "cursor");
      for (const [state, target, marker] of [
        ["install", V1, false],
        ["update", V2, true],
        ["rollback", V1, false],
      ] as const) {
        moveMirror(walk, target, false);
        expect([...digestMap(root)]).toEqual([...digestMap(shippedRoot(walk, "cursor", target))]);
        expect(rootVersion(root)).toBe(target);
        expect(existsSync(join(root, "skills", "fixture-marker", "SKILL.md"))).toBe(marker);
        if (state === "install") {
          const setup = locate(root, walk.project, ["plugin", "setup", "--client", "cursor", "-y"]);
          expect(setup.status, setup.stderr).toBe(0);
          row("cursor", "setup", "PASS", `${String(repositoryOwned(walk.project).size)} repository-owned files`);
        }
        row("cursor", state, "PASS", `--plugin-dir tree replacement to ${target}`);
        assertCompatible("cursor", root, walk.project, target, state);
      }

      expect(stepsOf("cursor")).toEqual([
        "binary PASS",
        "marketplace SKIPPED",
        "setup PASS",
        "install PASS",
        "status-install PASS",
        "update PASS",
        "status-update PASS",
        "rollback PASS",
        "status-rollback PASS",
      ]);
    },
    WALK_MS,
  );
});

describe.skipIf(CLIENTS.every((client) => armed(client)))("the unarmed walks", () => {
  it("records a reason for every client whose walk could not run", () => {
    for (const client of CLIENTS) {
      if (armed(client)) continue;
      row(client, "walk", "SKIPPED", skipReason(client));
    }
    // The point of this case is the record, not a claim: a client with no binary on the machine
    // keeps its row present with the probe's reason rather than disappearing from the output.
    expect(CLIENTS.filter((client) => !armed(client)).length).toBeGreaterThan(0);
  });
});
