// Every walk below drives one client CLI through three states in a fixed order, and the spawns are
// deliberately sequential — an update must observe the tree the install left, not a concurrent one.
/* oxlint-disable no-await-in-loop */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — the distribution modules ship as plain .mjs with no type declarations: they
// run under bare Node in a release job, with no TypeScript nearby.
import { CATALOG_PATHS } from "../../scripts/plugins/catalogs.mjs";
import { document } from "./downstreamFixture.js";

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
 * THE ROUTES, AS MEASURED rather than as documented. Every step below was walked by hand on this
 * machine before it was written down: the four routes on 2026-09-20 against claude 2.1.278, GitHub
 * Copilot CLI 1.0.85, codex-cli 0.154.0 and Cursor agent CLI 2026.09.15-d2fe57e, and the Claude
 * three-command rollback re-walked on 2026-09-22 against 2.1.278. Those versions are the ones the
 * PROSE below describes; no case asserts a version, and each walk records the build that actually
 * ran in its own row — by 2026-09-22 this machine had moved to Copilot CLI 1.0.87 and Cursor
 * 2026.09.18-9a7762b, which is exactly the drift the row is there to make visible. A route that
 * stops behaving as described is a red case, not a stale comment.
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
 *            marketplace moved back to the `.1` tag plus `plugin update stamity@stamity --scope
 *            project`, which re-records the version downwards. That is `docs/plugins.md`'s
 *            published rollback, and the walk EXECUTES all THREE of its commands in order rather
 *            than paraphrasing them: `marketplace add` at the previous tag (answers "already on
 *            disk" when the clone is the marketplace), `plugin install stamity@stamity --scope
 *            project` (answers "already installed … it loads in place from <path>" and leaves the
 *            recorded version where it was — which is why the page needs its third line), then the
 *            QUALIFIED `plugin update stamity@stamity --scope project`, which is the command the
 *            CLI's own reinstall message names and the one that re-records `.2` down to `.1`. The
 *            row records that third command's exit code and the sha-256 of its output, because a
 *            page's route is only documented once something has run it.
 *   copilot  A local directory marketplace loads the plugin LIVE: `plugin install` answers "it is
 *            loaded live from <path> … nothing was copied", and `plugin update` answers "there is
 *            nothing to update". The version therefore follows the marketplace directory, so
 *            update and rollback are both TREE REPLACEMENT and `plugin update` is a no-op that the
 *            walk records rather than skips.
 *   codex    A local marketplace is COPIED into `$CODEX_HOME/plugins/cache/<market>/<plugin>/
 *            <version>/`, and `plugin marketplace upgrade` answers "No configured Git marketplaces
 *            to upgrade" — it refreshes git snapshots only. So update and rollback are the
 *            marketplace directory moved plus `plugin add <plugin>@<marketplace>` again. The
 *            documented rollback — remove, re-add the marketplace at the earlier tag, add again —
 *            is executed and behaves as the page says, with one correction the return hands back:
 *            the page's `codex plugin remove stamity` refuses ("plugin requires --marketplace
 *            unless passed as <plugin>@<marketplace>"), and `remove` purges the version's cache.
 *   cursor   `agent plugin marketplace add` takes a git URL and needs an account
 *            ("Authentication required. Run 'agent login' …"), so a local bare repository is not a
 *            source it can take at all and that step is recorded SKIPPED with the reason. The route
 *            walked is `--plugin-dir` over the tree, replaced between states, and the CLIENT IS
 *            DRIVEN at each of the three: `agent --trust --plugin-dir <root> -p <the discovery
 *            prompt test/ci/pluginPackages.cursor.test.ts uses>` lists `fixture-marker` at `.2` and
 *            omits it at `.1`. That leg needs the operator's own home — a scratch `HOME` refuses
 *            with "Authentication required" — so it inherits the ambient environment and removes
 *            the two traces it leaves; a refusal records the rows as `SKIPPED (needs an account)`
 *            and skips, because a row must never name a route no client ran.
 *
 * Wall-time budgets, derived rather than guessed, with the command that produced each number.
 * Measured 2026-09-20 on this repository's corpus (darwin 25.6.0, `/usr/bin/time -p` around a real
 * `node scripts/plugin-lifecycle-fixture.mjs`):
 *
 *   two versions, four roots, stub runtime   `--runtime <stub>`                  4.95s
 *   two versions, one root, stub runtime     the same plus `--client claude`      4.34s
 *   two versions, four roots, own runtime    no `--runtime` (npm pack + npm ci)  67.60s
 *   one Cursor discovery run                 `agent --trust --plugin-dir … -p …`  56.59s
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
  transcribe(line);
}

/**
 * `STAMITY_LIFECYCLE_LOG`, when exported, receives every row and the exit code, stdout and stderr of
 * every client command this suite runs. Unset — the default, and what CI does — nothing is written.
 *
 * It is an opt-in FILE rather than a fixed path because the evidence a run record cites has to be
 * quotable in full, and vitest's own output is line-wrapped and interleaved across workers; the
 * digest in a record is then the digest of one file a reader can open. A path inside this
 * repository would be an untracked file the leak gate walks, so the caller names one outside it.
 */
const LOG = process.env["STAMITY_LIFECYCLE_LOG"];
function transcribe(text: string): void {
  if (LOG === undefined) return;
  appendFileSync(LOG, `${text}\n`);
}

/**
 * One input line: a LOGICAL label and the sha-256 of the file behind it. `scripts/qa/plugin-runs.mjs`
 * reads these back to bind row `H5` to the bytes it was measured against, which is why the label is
 * never the path — the fixture lives in a temp directory and an evidence file is committed.
 */
function transcribeInput(label: string, path: string): void {
  if (LOG === undefined || !existsSync(path)) return;
  transcribe(`plugin-lifecycle-input: ${label} ${digest(readFileSync(path))}`);
}

/** One client command's full observation, appended to the transcript log under its own heading. */
function observe(label: string, command: string[], result: SpawnSyncReturns<string>): SpawnSyncReturns<string> {
  transcribe(
    [
      `── ${label}`,
      `$ ${command.join(" ")}`,
      `exit: ${String(result.status)}`,
      `stdout:\n${(result.stdout ?? "").trimEnd()}`,
      `stderr:\n${(result.stderr ?? "").trimEnd()}`,
    ].join("\n"),
  );
  return result;
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

  it("prints an unknown argument without the credential a misplaced --push left in it", () => {
    // Every flag consumes the next token, so a `--runtime` with no value swallows `--push` and the
    // URL becomes the unknown argument — which was printed whole, userinfo included, before the
    // push arm's own display form was ever reached.
    const token = "fixture-token-77aa";
    const result = refuse([
      "--out",
      "x",
      "--versions",
      VERSIONS.join(","),
      "--runtime",
      "--push",
      `https://x-access-token:${token}@127.0.0.1:9/o/r.git`,
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown argument: https://127.0.0.1:9/o/r.git");
    expect(result.stderr).not.toContain(token);
    expect(result.stdout).toBe("");
  });
});

describe("plugin-lifecycle-fixture, pushDisplay — every spelling of a push URL's userinfo", () => {
  it("drops the userinfo from the shown form and scrubs each spelling a line could carry", async () => {
    // Git's credential prompt prints the username DECODED (`Password for 'https://user@host':`), so
    // a percent-encoded token survives the encoded spelling's removal; and a token in the USERNAME
    // slot with an empty password is how GitHub takes one. Both spellings of the userinfo run go,
    // and the bare token in both spellings becomes a placeholder.
    // @ts-expect-error — native ESM contributor tool, outside the product package.
    const { pushDisplay } = await import("../../scripts/plugin-lifecycle-fixture.mjs");
    const encoded = ["s3cr3t", "40x"].join("%");
    const decoded = ["s3cr3t", "x"].join("@");

    const withPassword = pushDisplay(`https://x-access-token:${encoded}@github.com/o/r.git`) as {
      shown: string;
      scrub: (text: string) => string;
    };
    expect(withPassword.shown).toBe("https://github.com/o/r.git");
    expect(
      withPassword.scrub(
        `push https://x-access-token:${encoded}@github.com/o/r.git refs; Password for 'https://x-access-token@github.com': ${decoded}`,
      ),
    ).toBe("push https://github.com/o/r.git refs; Password for 'https://github.com': <redacted>");

    const usernameOnly = pushDisplay("https://ghp%5Ffixture@127.0.0.1:9/o/r.git") as {
      shown: string;
      scrub: (text: string) => string;
    };
    expect(usernameOnly.shown).toBe("https://127.0.0.1:9/o/r.git");
    expect(usernameOnly.scrub("fatal: 'https://ghp_fixture@127.0.0.1:9/o/r.git/' then ghp_fixture and ghp%5Ffixture")).toBe(
      "fatal: 'https://127.0.0.1:9/o/r.git/' then <redacted> and <redacted>",
    );

    // A transport user on a non-http scheme is not a secret: `git` must survive in the command
    // line the failure quotes, while the `git@` run still leaves the URL.
    const transport = pushDisplay("ssh://git@github.com/o/r.git") as { shown: string; scrub: (text: string) => string };
    expect(transport.shown).toBe("ssh://github.com/o/r.git");
    expect(transport.scrub("git -c x push ssh://git@github.com/o/r.git refs/tags/v1")).toBe("git -c x push ssh://github.com/o/r.git refs/tags/v1");

    // Values the parser refuses carry no userinfo and pass through as given.
    for (const value of ["git@github.com:o/r.git", "/tmp/remote.git"]) {
      const shape = pushDisplay(value) as { shown: string; scrub: (text: string) => string };
      expect(shape.shown, value).toBe(value);
      expect(shape.scrub(`push ${value}`), value).toBe(`push ${value}`);
    }
  });
});

describe("plugin-lifecycle-fixture, the checkout copy and the push", () => {
  it(
    "carries the checkout's own fork layer into both trees, beside the marker the second adds",
    () => {
      // `checkoutCopy` copied `src`, `scripts`, `assets`, `content` and `package.json` and not
      // `fork/`, so a fork checkout's own layer was dropped from both fixture trees while the
      // marker — written under the COPY's `fork/skills/` between the builds — still landed, which
      // is what hid the loss. The subject is the copy, so the builder runs out of a checkout this
      // case composes under the temp root: the same five inputs, `node_modules` linked, one fork
      // skill, and one empty commit so the provenance resolves (the shape of
      // `test/ci/downstreamFixture.ts`'s `downstreamCheckout`).
      const checkout = tempDir("fork-checkout");
      for (const path of ["src", "scripts", "assets", "content"]) {
        cpSync(join(REPO_ROOT, path), join(checkout, path), { recursive: true });
      }
      writeFileSync(join(checkout, "package.json"), readFileSync(join(REPO_ROOT, "package.json")));
      symlinkSync(join(REPO_ROOT, "node_modules"), join(checkout, "node_modules"), "junction");
      const probe = join(checkout, "fork", "skills", "fork-probe", "SKILL.md");
      mkdirSync(join(probe, ".."), { recursive: true });
      writeFileSync(probe, document("fork-probe", "skill", "A fork-layer skill the fixture has to carry."));
      gitOut(["init", "--quiet", "--initial-branch", "fixture"], checkout);
      gitOut(
        [
          "-c",
          "user.name=fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "-c",
          "commit.gpgsign=false",
          "commit",
          "--quiet",
          "--allow-empty",
          "--message",
          "fixture: a checkout with a fork layer",
        ],
        checkout,
      );

      const out = join(tempDir("fork-fixture"), "lifecycle");
      const result = spawnSync(
        process.execPath,
        [
          join(checkout, "scripts", "plugin-lifecycle-fixture.mjs"),
          "--out",
          out,
          "--versions",
          VERSIONS.join(","),
          "--runtime",
          stubRuntime(),
          "--client",
          "claude",
        ],
        { cwd: checkout, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: STUB_BUILD_MS },
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      // The copy says what it carried: a fork layer travels into what `--push` publishes, and the
      // console reported only the two-version diff, which never names it.
      expect(result.stdout).toContain("plugin-lifecycle-fixture: fork layer: 1 file(s) copied");
      for (const version of VERSIONS) {
        expect(existsSync(join(out, version, "claude", "skills", "fork-probe", "SKILL.md")), version).toBe(true);
      }
      // The marker stays the second version's alone: the checkout's fork layer is what both trees
      // share, and the one authored difference is still the one authored difference.
      expect(existsSync(join(out, V1, "claude", "skills", "fixture-marker", "SKILL.md"))).toBe(false);
      expect(existsSync(join(out, V2, "claude", "skills", "fixture-marker", "SKILL.md"))).toBe(true);
    },
    STUB_BUILD_MS,
  );

  it(
    "prints and throws the push URL without its userinfo",
    () => {
      // `pushed … to ${push}` echoed the URL as given, and `run()`'s failure line quotes its argv,
      // so a token in the URL's userinfo — `https://x-access-token:<token>@host/o/r.git` is how one
      // travels — reached stdout or stderr and from there a pasted record. The push goes to a
      // loopback port nothing listens on, so it fails without leaving the machine and without a
      // credential prompt (the fixture ignores stdin); git's own "unable to access" line prints the
      // URL without credentials already, so the argv and the echo are the two places the secret
      // could survive.
      const secret = "fixture-token-3f9a1c";
      const out = join(tempDir("push"), "lifecycle");
      const result = fixture(
        [
          "--out",
          out,
          "--versions",
          VERSIONS.join(","),
          "--runtime",
          stubRuntime(),
          "--client",
          "claude",
          "--push",
          `https://x-access-token:${secret}@127.0.0.1:9/o/r.git`,
        ],
        STUB_BUILD_MS,
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      const printed = `${result.stdout}\n${result.stderr}`;
      // This checkout carries no fork layer, so the copy reports none.
      expect(result.stdout).not.toContain("fork layer");
      expect(printed).not.toContain(secret);
      expect(printed).not.toContain("x-access-token");
      expect(result.stderr).toContain("plugin-lifecycle-fixture: FAIL - git");
      expect(result.stderr).toContain("push https://127.0.0.1:9/o/r.git refs/tags/");
    },
    STUB_BUILD_MS,
  );
});

// ── group two: the client walks ──────────────────────────────────────────────────────────

/**
 * The expensive fixture, built at most once for every walk suite that runs. A module-level memo
 * rather than a shared `beforeAll`, because four independent `describe`s cannot share one hook and
 * building it four times would cost four minutes to prove the same two trees.
 */
let realFixture: { readonly out: string } | { readonly error: Error } | null = null;
function withRealRuntime(): string {
  if (realFixture === null) {
    try {
      const out = join(tempDir("real"), "lifecycle");
      // `STAMITY_LIFECYCLE_RUNTIME`, when exported, is a runtime directory this build reuses instead
      // of packing the checkout and installing a production graph again — which is what the QA
      // harness passes when it already has a built distribution, whose every root bundles one.
      // Unset, the builder makes its own: the route the plan cell's verify line runs, and the only
      // runtime the locator can actually spawn.
      const given = process.env["STAMITY_LIFECYCLE_RUNTIME"];
      buildFixture(out, given === undefined ? [] : ["--runtime", given], REAL_BUILD_MS);
      // WHICH RUNTIME RAN, in the row's own words. A handed-in runtime can come from another commit
      // than the one under test — that is the whole point of reusing a built distribution's copy —
      // and a reader of the evidence has to be able to see that without recomputing a row hash. The
      // manifest the build just wrote is the authority: it carries the runtime block the roots
      // actually bundle, rather than this suite re-reading the directory it was handed.
      const runtime = (
        JSON.parse(readFileSync(join(out, V1, "release.json"), "utf8")) as {
          runtime: { package: string; version: string; nodeFloor: string; tarballSha256: string };
        }
      ).runtime;
      transcribe(
        `plugin-lifecycle-runtime: ${given === undefined ? "built by the fixture builder" : "reused from the distribution"} — ` +
          `${runtime.package}@${runtime.version} (node ${runtime.nodeFloor}, tarball sha256 ${runtime.tarballSha256})`,
      );
      // The bytes every row below is a claim about, under LOGICAL labels: an evidence file must not
      // carry the temp directory this fixture happened to land in (`run.mjs`'s S-4 rule). The two
      // INSTRUMENTS are bound beside the fixture — the builder and this suite — so a signature on a
      // measured row reopens when the thing that measured it moves, not only when the corpus does.
      transcribeInput("scripts/plugin-lifecycle-fixture.mjs", join(REPO_ROOT, "scripts", "plugin-lifecycle-fixture.mjs"));
      transcribeInput("test/ci/pluginLifecycle.test.ts", fileURLToPath(import.meta.url));
      for (const version of VERSIONS) {
        transcribeInput(`fixture/${version}/release.json`, join(out, version, "release.json"));
        for (const client of CLIENTS) {
          transcribeInput(`fixture/${version}/${client}/stamity-plugin.json`, join(out, version, client, "stamity-plugin.json"));
        }
      }
      realFixture = { out };
    } catch (error) {
      // A FAILURE IS MEMOIZED TOO. Four walk suites call this, and a build that failed once will
      // fail the same way again: retrying it would spend four minutes per suite to reproduce one
      // message, and the three later suites would report a timeout instead of the real reason.
      realFixture = { error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
  if ("error" in realFixture) throw realFixture.error;
  return realFixture.out;
}

interface Walk {
  /** The fixture's two distribution trees. */
  readonly out: string;
  /** This walk's own temp directory: every path below is inside it, which is what attributes them. */
  readonly base: string;
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
  return { out, base: realpathSync(base), mirror, project, home };
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
 * The WHOLE project surface: every file in the scratch repository, with two carve-outs stated here
 * rather than left implicit.
 *
 * `.stamity/manifest.json`'s `updatedAt` is dropped, because that one field is a clock read by
 * design and comparing it would make every re-read of a repository look like a change.
 * `.claude/settings.json` is not dropped but SPLIT OUT, so a step that changed a byte of it is a
 * visible difference rather than an exemption: the client's own install write is one declared key,
 * and anything else appearing there is the finding this map exists to catch.
 */
interface ProjectSurface {
  /** Every file except `.claude/settings.json`, keyed by POSIX-relative path. */
  readonly files: [string, string][];
  /** `.claude/settings.json` parsed, or `null` when no client has written one. */
  readonly clientSettings: unknown;
}
function projectSurface(project: string): ProjectSurface {
  const settingsPath = ".claude/settings.json";
  const files: [string, string][] = [];
  for (const rel of treeFiles(project)) {
    if (rel === settingsPath) continue;
    if (rel === ".stamity/manifest.json") {
      const manifest = JSON.parse(readFileSync(join(project, rel), "utf8")) as Record<string, unknown>;
      delete manifest["updatedAt"];
      files.push([rel, digest(JSON.stringify(manifest))]);
      continue;
    }
    files.push([rel, digest(readFileSync(join(project, rel)))]);
  }
  return {
    files,
    clientSettings: existsSync(join(project, settingsPath))
      ? JSON.parse(readFileSync(join(project, settingsPath), "utf8"))
      : null,
  };
}

/** `stamity plugin <args>` through an installed root's own locator, the way a client spawns it. */
function locate(root: string, project: string, args: string[]): SpawnSyncReturns<string> {
  const argv = [join(root, "runtime", "locate.mjs"), "--", ...args];
  return observe(`locate ${args.join(" ")}`, [process.execPath, ...argv], spawnSync(process.execPath, argv, {
    cwd: project,
    encoding: "utf8",
    timeout: STEP_MS,
    maxBuffer: 64 * 1024 * 1024,
    // The variable a client sets when it spawns a plugin's command. The locator resolves the
    // runtime from its OWN path, so this is the client's convention rather than an input it needs.
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
  }));
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
  let surface: ProjectSurface;

  beforeAll(() => {
    walk = startWalk("claude");
    bin = process.env["STAMITY_CLAUDE_BIN"] ?? "";
  }, REAL_BUILD_MS);

  /**
   * A scratch `CLAUDE_CONFIG_DIR`, with the ambient environment otherwise inherited — so the
   * operator's real `HOME` is on it.
   *
   * What was MEASURED on 2026-09-20: every command this walk runs exits 0 with the scratch
   * configuration directory, and every write it makes — the marketplace record in that directory's
   * `settings.json`, the per-version plugin cache under `plugins/cache/` — lands inside it, so
   * there is nothing to clean out of the operator's own configuration afterwards. What is INFERRED
   * from that, not measured: that no credential was read. A scratch configuration directory with
   * no session in it is not a proof of isolation — these subcommands may simply need none — and
   * this suite never reads, writes, copies or prints an auth file either way.
   */
  const claude = (args: string[], label = args.slice(0, 3).join(" ")): SpawnSyncReturns<string> =>
    observe(
      `claude ${label}`,
      [bin, ...args],
      spawnSync(bin, args, {
        cwd: walk.project,
        encoding: "utf8",
        timeout: STEP_MS,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, CLAUDE_CONFIG_DIR: join(walk.home, "claude-config") },
      }),
    );

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

      // ── setup, so a manifest exists for `plugin status` to compare against ──
      const setup = locate(installedRoot(V1), walk.project, ["plugin", "setup", "--client", "claude", "-y"]);
      expect(setup.status, setup.stderr).toBe(0);
      surface = projectSurface(walk.project);
      expect(surface.files.length).toBeGreaterThan(5);
      // `.claude/settings.json` under KEY-LEVEL ownership. `enabledPlugins` is the client's own
      // install write, and the ONLY project-side change the install made: the marketplace record
      // went to the scratch configuration directory, not here. `permissions.allow` is the SETUP's
      // write — the engine's own key in plugin mode, landed beside the client's with every foreign
      // key preserved in place — so the file carries exactly these two owners' keys after the
      // setup step. Both asserted here and re-asserted after every later step through `unchanged`
      // below, which is what proves neither the update nor the rollback touches the file.
      const settings = surface.clientSettings as { enabledPlugins?: unknown; permissions?: { allow?: unknown } } | null;
      expect(settings).not.toBeNull();
      expect(settings?.enabledPlugins).toEqual({ "stamity@stamity": true });
      // The three names are `CLAUDE_PERMISSION_ROWS` (`src/adapters/claude.ts:374`): the
      // `AGENT_POLICY_ROSTER` rows' allow categories kept to `SESSION_PREAPPROVED_CATEGORIES`
      // (read), rendered through the Claude tool-name table minus the guard-only names — "for the
      // shipped roster that is three rows". The constant is module-private, so the derivation is
      // cited beside the literal rather than imported; when the roster moves, this walk goes red
      // here and the citation says where the new value comes from.
      expect(settings?.permissions?.allow).toEqual(["Read", "Grep", "Glob"]);
      row("claude", "setup", "PASS", `${String(surface.files.length)} repository-owned files`);
      assertCompatible("claude", installedRoot(V1), walk.project, V1, "installed");

      /** The whole project surface, settings file included, at a later step. */
      const unchanged = (): void => expect(projectSurface(walk.project)).toEqual(surface);

      // ── auto-update stays off ─────────────────────────────────────────
      // The explicit update against an UNMOVED source: a third-party marketplace must not move a
      // pinned consumer on its own, and this is the assertion that would catch it if it did.
      const idle = claude(["plugin", "update", "stamity", "--scope", "project", "--json"]);
      expect(idle.status, idle.stderr).toBe(0);
      expect(JSON.parse(idle.stdout)).toMatchObject({ updateOutcome: "up_to_date", oldVersion: V1, newVersion: V1 });
      unchanged();

      // ── update ────────────────────────────────────────────────────────
      // `plugin update --scope project` AFTER the marketplace source moved is the UPDATE route,
      // and its `oldVersion` is the second half of the auto-update-off proof: the client was still
      // recorded at the first version at the moment the update ran, so nothing had moved it.
      moveMirror(walk, V2, true);
      expect(claude(["plugin", "marketplace", "update", "stamity"]).status).toBe(0);
      const update = claude(["plugin", "update", "stamity", "--scope", "project", "--json"]);
      expect(update.status, update.stderr).toBe(0);
      const updated = JSON.parse(update.stdout) as { updateOutcome: string; oldVersion: string; newVersion: string };
      expect(updated).toMatchObject({ updateOutcome: "updated", oldVersion: V1, newVersion: V2 });
      row(
        "claude",
        "no-auto-update",
        "PASS",
        `up_to_date with the source unmoved, and the post-move update reported oldVersion ${updated.oldVersion}`,
      );
      expect([...digestMap(installedRoot(V2))]).toEqual([...digestMap(shippedRoot(walk, "claude", V2))]);
      expect(rootVersion(installedRoot(V2))).toBe(V2);
      expect(existsSync(join(installedRoot(V2), "skills", "fixture-marker", "SKILL.md"))).toBe(true);
      unchanged();
      row("claude", "update", "PASS", `plugin update --scope project to ${V2} after the source moved`);
      assertCompatible("claude", installedRoot(V2), walk.project, V2, "updated");

      // ── rollback ──────────────────────────────────────────────────────
      // Measured on 2.1.278: there is no `rollback` subcommand at all.
      const absent = claude(["plugin", "rollback", "stamity"]);
      expect(`${absent.stdout}${absent.stderr}`).toContain("unknown command 'rollback'");
      row("claude", "rollback-subcommand", "SKIPPED", "claude 2.1.278 has no rollback subcommand");

      // THE DOCUMENTED ROUTE, all three commands, executed in the order `docs/plugins.md` prints
      // them and with the spelling it prints — including the QUALIFIED `stamity@stamity` on the
      // third, which is the form the CLI's own message names and is not interchangeable with the
      // bare id for a reader following the page.
      moveMirror(walk, V1, true);
      const readded = claude(["plugin", "marketplace", "add", walk.mirror], "plugin marketplace add (documented rollback)");
      expect(`${readded.stdout}${readded.stderr}`).toContain("already on disk");
      const reinstall = claude(
        ["plugin", "install", "stamity@stamity", "--scope", "project", "--json"],
        "plugin install (documented rollback)",
      );
      expect(reinstall.status, reinstall.stderr).toBe(0);
      expect(JSON.parse(reinstall.stdout)).toMatchObject({
        outcome: "ok",
        installedVersion: V2,
        availableVersion: V1,
      });
      expect(JSON.parse(reinstall.stdout)).toMatchObject({ message: expect.stringContaining("already installed") });
      // The first two commands do not re-record the version by themselves, which is exactly why the
      // page carries a third. Asserted here so the third command's effect is attributable to it.
      expect(claude(["plugin", "list"]).stdout).toContain(V2);

      const third = ["plugin", "update", "stamity@stamity", "--scope", "project", "--json"];
      const back = claude(third, "plugin update stamity@stamity --scope project (documented rollback)");
      expect(back.status, back.stderr).toBe(0);
      expect(JSON.parse(back.stdout)).toMatchObject({ updateOutcome: "updated", oldVersion: V2, newVersion: V1 });
      // PASS, and the reason names the three commands as EXECUTED plus the third one's exit code and
      // output digest: a route this repository publishes is documented once something has run it,
      // and the digest is what a run record cites when it says which run that was.
      row(
        "claude",
        "rollback-documented",
        "PASS",
        `the published three commands, executed in order (with --json added where the CLI offers it, which is this ` +
          `suite reading the result rather than part of the route): claude plugin marketplace add <the clone at ${V1}> ` +
          `→ "already on disk"; claude plugin install stamity@stamity --scope project → exit ${String(reinstall.status)}, ` +
          `already installed at ${V2}; claude ${third.join(" ")} → exit ${String(back.status)}, updated ${V2} to ${V1} ` +
          `[stdout sha256 ${digest(back.stdout)}]`,
      );

      expect([...digestMap(installedRoot(V1))]).toEqual([...digestMap(shippedRoot(walk, "claude", V1))]);
      expect(existsSync(join(installedRoot(V1), "skills", "fixture-marker", "SKILL.md"))).toBe(false);
      unchanged();
      row("claude", "rollback", "PASS", `the ${V1} tree is restored byte for byte and the project is untouched`);
      assertCompatible("claude", installedRoot(V1), walk.project, V1, "rolled-back");
      row("claude", "walk", "PASS", "reinstall route: directory marketplace, --scope project on install and update");

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
        "rollback-documented PASS",
        "rollback PASS",
        "status-rolled-back PASS",
        "walk PASS",
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
    observe(
      `copilot ${args.slice(0, 3).join(" ")}`,
      [bin, ...args],
      spawnSync(bin, args, {
        cwd: walk.project,
        encoding: "utf8",
        timeout: STEP_MS,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, HOME: walk.home, COPILOT_HOME: join(walk.home, ".copilot") },
      }),
    );

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
      const surface = projectSurface(walk.project);
      const unchanged = (): void => expect(projectSurface(walk.project)).toEqual(surface);
      // Copilot writes nothing into the repository at all, so its settings file stays absent and
      // `unchanged()` below asserts the whole surface — settings included — at every later step.
      expect(surface.clientSettings).toBeNull();
      row("copilot", "setup", "PASS", `${String(surface.files.length)} repository-owned files`);
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
      unchanged();
      row("copilot", "update", "PASS", `tree replacement to ${V2}; plugin update reports nothing to update`);
      assertCompatible("copilot", live, walk.project, V2, "updated");

      moveMirror(walk, V1, false);
      expect(rootVersion(live)).toBe(V1);
      expect(existsSync(join(live, "skills", "fixture-marker", "SKILL.md"))).toBe(false);
      expect([...digestMap(live)]).toEqual([...digestMap(shippedRoot(walk, "copilot", V1))]);
      expect(copilot(["plugin", "list"]).stdout).toContain(V1);
      unchanged();
      row("copilot", "rollback", "PASS", `reinstall route by tree replacement to ${V1}`);
      assertCompatible("copilot", live, walk.project, V1, "rolled-back");
      row("copilot", "walk", "PASS", "tree replacement: a local marketplace loads live, plugin update is a no-op");

      expect(stepsOf("copilot")).toEqual([
        "install PASS",
        "setup PASS",
        "status-installed PASS",
        "no-auto-update PASS",
        "update PASS",
        "status-updated PASS",
        "rollback PASS",
        "status-rolled-back PASS",
        "walk PASS",
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
  const codex = (args: string[], label = args.slice(0, 3).join(" ")): SpawnSyncReturns<string> =>
    observe(
      `codex ${label}`,
      [bin, ...args],
      spawnSync(bin, args, {
        cwd: walk.project,
        encoding: "utf8",
        timeout: STEP_MS,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, CODEX_HOME: walk.home },
      }),
    );

  const installedRoot = (version: string): string =>
    join(walk.home, "plugins", "cache", "stamity", "stamity", version);

  it(
    "copies the local marketplace into its cache and re-adds for both states",
    () => {
      // No rate-limit guard here, and none anywhere in this walk except the one leg that calls a
      // model: `plugin marketplace add`, `plugin add`, `plugin remove` and `plugin list` are local
      // file operations against a directory on this disk, and an account limit cannot reach them.
      // A guard over them would be a branch no limit can enter, reading as coverage of a risk that
      // is not there. The Cursor discovery leg is the one model call, and its refusal check carries
      // the limit sense.
      moveMirror(walk, V1, false);
      const market = codex(["plugin", "marketplace", "add", walk.mirror]);
      expect(market.status, market.stderr).toBe(0);
      const add = codex(["plugin", "add", "stamity@stamity"]);
      expect(add.status, add.stderr).toBe(0);
      expect([...digestMap(installedRoot(V1))]).toEqual([...digestMap(shippedRoot(walk, "codex", V1))]);
      row("codex", "install", "PASS", `local marketplace copied into the cache at ${V1}`);

      const setup = locate(installedRoot(V1), walk.project, ["plugin", "setup", "--client", "codex", "-y"]);
      expect(setup.status, setup.stderr).toBe(0);
      const surface = projectSurface(walk.project);
      const unchanged = (): void => expect(projectSurface(walk.project)).toEqual(surface);
      expect(surface.clientSettings).toBeNull();
      row("codex", "setup", "PASS", `${String(surface.files.length)} repository-owned files`);
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
      unchanged();
      row("codex", "update", "PASS", `tree replacement plus plugin add to ${V2}`);
      assertCompatible("codex", installedRoot(V2), walk.project, V2, "updated");

      // THE DOCUMENTED ROLLBACK, executed as `docs/plugins.md` writes it: remove the plugin, add
      // the marketplace at the earlier tag, add the plugin again. One correction the page needs and
      // this walk records: the page's `codex plugin remove stamity` refuses on 0.154.0 with "plugin
      // requires --marketplace unless passed as <plugin>@<marketplace>", so the form that works is
      // the qualified one. Everything after that behaves exactly as documented.
      const bareRemove = codex(["plugin", "remove", "stamity"], "plugin remove stamity (the page's spelling)");
      expect(`${bareRemove.stdout}${bareRemove.stderr}`).toContain("requires --marketplace unless passed as");
      const remove = codex(["plugin", "remove", "stamity@stamity"]);
      expect(remove.status, remove.stderr).toBe(0);
      expect(`${remove.stdout}${remove.stderr}`).toContain("Removed plugin");
      expect(codex(["plugin", "list"]).stdout).toContain("not installed");
      // `remove` purges the local cache, which is why the rollback below re-copies the tree rather
      // than re-pointing at a directory that is still there: the `.2` root is gone.
      expect(existsSync(installedRoot(V2))).toBe(false);
      row("codex", "rollback-remove", "PASS", "plugin remove stamity@stamity purged the .2 cache");

      moveMirror(walk, V1, false);
      const readded = codex(["plugin", "marketplace", "add", walk.mirror], "plugin marketplace add (documented rollback)");
      expect(`${readded.stdout}${readded.stderr}`).toContain("already added");
      expect(codex(["plugin", "add", "stamity@stamity"]).status).toBe(0);
      expect(codex(["plugin", "list"]).stdout).toContain(V1);
      expect([...digestMap(installedRoot(V1))]).toEqual([...digestMap(shippedRoot(walk, "codex", V1))]);
      expect(existsSync(join(installedRoot(V1), "skills", "fixture-marker", "SKILL.md"))).toBe(false);
      unchanged();
      row("codex", "rollback", "PASS", `documented route: plugin remove, marketplace add, plugin add at ${V1}`);
      assertCompatible("codex", installedRoot(V1), walk.project, V1, "rolled-back");
      row("codex", "walk", "PASS", "plugin remove stamity@stamity then marketplace add and plugin add");

      expect(stepsOf("codex")).toEqual([
        "install PASS",
        "setup PASS",
        "status-installed PASS",
        "no-auto-update PASS",
        "update PASS",
        "status-updated PASS",
        "rollback-remove PASS",
        "rollback PASS",
        "status-rolled-back PASS",
        "walk PASS",
      ]);
    },
    WALK_MS,
  );
});

/**
 * The prompt `test/ci/pluginPackages.cursor.test.ts` already drives this client with, kept in the
 * same words so two suites measure one discovery surface. It asks for the disabled-invocation
 * skills too, because "list the skills you can invoke" measurably returns the corpus skills and
 * none of the nine touchpoints.
 */
const CURSOR_DISCOVERY_PROMPT =
  "List every skill this plugin provides, including ones marked disable-model-invocation. " +
  "Print only the skill ids, one per line.";
/**
 * What that suite's own leg recognises as "the CLI never reached the model", plus the account limits
 * that stop it the same way.
 *
 * The limit half belongs HERE and nowhere else in this file: the Cursor discovery run is the only
 * leg of the whole walk that calls a model, and every other client command it makes is a local file
 * operation an account limit cannot reach. A limit is a fact about the account, not about the tree
 * under test, so it records `not-run` with the client's own words — never `failed`, which would send
 * the next reader to the diff.
 */
const CURSOR_REFUSAL =
  /authentication required|CURSOR_API_KEY|agent login|workspace trust required|rate limit|rate-limit|too many requests|usage limit|out of credits/i;
/** One measured discovery run took 56.59s (`/usr/bin/time -p`, 2026-09-20); 4x for a loaded worker. */
const CURSOR_PROMPT_MS = 240_000;

/** The operator's own Cursor state directory, and one sorted listing of a directory inside it. */
const cursorHome = (): string => join(process.env["HOME"] ?? "", ".cursor");
const listing = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).toSorted() : []);

/**
 * The working directory a Cursor chat record was made from, read out of the record itself.
 *
 * `~/.cursor/chats/<id>/<session>/meta.json` carries `{ schemaVersion, createdAtMs, hasConversation,
 * updatedAtMs, cwd }` — measured 2026-09-20 on 2026.09.15-d2fe57e. That `cwd` is what makes the
 * cleanup below ATTRIBUTABLE: a set difference over the directory would also match a record another
 * agent's Cursor run left while this walk was running, and this repository's own
 * `test/ci/pluginPackages.cursor.test.ts` drives the same binary from its own temp directory. That
 * is not hypothetical — a concurrent run of that suite left two records inside this walk's window.
 */
function chatCwd(record: string): string | null {
  for (const session of listing(record)) {
    const meta = join(record, session, "meta.json");
    if (!existsSync(meta)) continue;
    try {
      const parsed = JSON.parse(readFileSync(meta, "utf8")) as { cwd?: unknown };
      if (typeof parsed.cwd === "string") return parsed.cwd;
    } catch {
      // A record being written as this reads it is not ours to judge; leave it alone.
      return null;
    }
  }
  return null;
}

describe.skipIf(!armed("cursor"))("the Cursor local-path walk", () => {
  let walk: Walk;
  let bin = "";
  beforeAll(() => {
    walk = startWalk("cursor");
    bin = process.env["STAMITY_CURSOR_BIN"] ?? "";
  }, REAL_BUILD_MS);

  /**
   * THE CLEANUP STEP the lane's rule asks of a leg that runs against the operator's real home.
   *
   * Measured 2026-09-20 by diffing `~/.cursor` around a discovery run: one `chats/<id>` session
   * record per run, and one empty `projects/<slug>` directory per working directory. The chat
   * records are removed, and only the ones whose own `meta.json` names a `cwd` inside THIS walk's
   * temp directory — attribution by content, not by "it was not there before", which would sweep up
   * a concurrent run's records and did have two of another suite's in range.
   *
   * The `projects/<slug>` entries are LEFT, and that is a deliberate limit rather than an omission:
   * the slug is the working directory truncated to 42 characters plus a hash, so two different temp
   * paths under the same prefix produce names this walk cannot tell apart, and the entries are empty
   * directories. Removing one by guess would be reaching into the operator's state on a coin toss.
   * Each run leaves one empty directory there; the return names it.
   */
  afterAll(() => {
    const chats = join(cursorHome(), "chats");
    for (const record of listing(chats)) {
      const cwd = chatCwd(join(chats, record));
      if (cwd === null || !cwd.startsWith(walk.base)) continue;
      rmSync(join(chats, record), { recursive: true, force: true });
    }
  }, STEP_MS);

  it(
    "replaces the --plugin-dir tree for each state and the client discovers the marker",
    (ctx) => {
      const version = observe("agent --version", [bin, "--version"], spawnSync(bin, ["--version"], { encoding: "utf8", timeout: STEP_MS }));
      expect(version.status, version.stderr).toBe(0);
      row("cursor", "binary", "PASS", `agent ${version.stdout.trim()}`);

      // The marketplace route, measured and NOT walked: `agent plugin marketplace add` takes a git
      // URL and answers "Authentication required" against a local path even with the operator's own
      // home, so a local bare repository is not a source this client can take at all.
      const refused = observe(
        "agent plugin marketplace add <local path>",
        [bin, "plugin", "marketplace", "add", join(walk.out, V1)],
        spawnSync(bin, ["plugin", "marketplace", "add", join(walk.out, V1)], {
          cwd: walk.project,
          encoding: "utf8",
          timeout: STEP_MS,
          env: { ...process.env, HOME: walk.home },
        }),
      );
      expect(`${refused.stdout}${refused.stderr}`).toMatch(/Authentication required|git repository URL/);
      row("cursor", "marketplace", "SKIPPED", "agent plugin marketplace add needs a git URL and an account");

      /**
       * The client, driven for real over the tree under test.
       *
       * THE HOME IS THE OPERATOR'S. Measured 2026-09-20 on 2026.09.15-d2fe57e: with `HOME` pointed
       * at a scratch directory this exits with `Error: Authentication required. Please run 'agent
       * login' first, or set CURSOR_API_KEY environment variable.` — the client keeps its session in
       * the home it is given, and a scratch one has none. Cursor is also the one client here with no
       * install subcommand, so `--plugin-dir` is the ONLY way a version of this root ever reaches
       * it; a row that claimed a route without running the client would be a claim about a file
       * tree. So the leg inherits the ambient environment, which carries the operator's login, and
       * `afterAll` above removes the two traces it leaves. No credential is read, written or printed
       * by this suite: the client resolves its own session from its own home.
       *
       * `--trust` because the CLI otherwise exits 1 with "Workspace Trust Required", and the run
       * happens in the scratch project so this checkout's own `.cursor/` tree is not discovered
       * alongside the plugin's — both measurements `test/ci/pluginPackages.cursor.test.ts` records.
       */
      const discover = (root: string): SpawnSyncReturns<string> => {
        const argv = ["--trust", "--plugin-dir", root, "-p", CURSOR_DISCOVERY_PROMPT, "--output-format", "text"];
        return observe(
          `agent --plugin-dir ${root} -p <discovery>`,
          [bin, ...argv],
          spawnSync(bin, argv, { cwd: walk.project, encoding: "utf8", timeout: CURSOR_PROMPT_MS - 20_000, maxBuffer: 16 * 1024 * 1024 }),
        );
      };

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
          row("cursor", "setup", "PASS", `${String(projectSurface(walk.project).files.length)} repository-owned files`);
        }

        // The client's own discovery of the tree it was just handed. A refusal is a fact about the
        // machine's Cursor session, not about this root: it is recorded and the case skips, so no
        // row ever claims a route no client ran.
        const seen = discover(root);
        const transcript = `${seen.stdout}\n${seen.stderr}`;
        if (CURSOR_REFUSAL.test(transcript)) {
          const first = transcript.trim().split("\n")[0] ?? "";
          row("cursor", state, "SKIPPED", `needs an account: ${first}`);
          // The per-client completion row every consumer folds on, closed before the skip: a client
          // whose walk stopped has to say so on that line, not go quiet.
          row("cursor", "walk", "SKIPPED", `needs an account: agent did not reach the model — ${first}`);
          ctx.skip();
          return;
        }
        expect(seen.status, transcript).toBe(0);
        // The marker's id, as the corpus projects it into a Cursor root, from the client's own
        // listing — and absent at the first version, which is what makes the id load-bearing.
        expect(seen.stdout.split("\n").map((line) => line.trim())).toContain("st-work");
        expect(seen.stdout.split("\n").map((line) => line.trim()).includes("fixture-marker")).toBe(marker);
        row(
          "cursor",
          state,
          "PASS",
          `agent --plugin-dir at ${target}, discovery ${marker ? "lists" : "omits"} fixture-marker`,
        );
        assertCompatible("cursor", root, walk.project, target, state);
      }
      row("cursor", "walk", "PASS", "--plugin-dir tree replacement, discovery driven through the client");

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
        "walk PASS",
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
