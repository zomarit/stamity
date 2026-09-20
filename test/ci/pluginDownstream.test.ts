// Every walk here reads a generated tree in a fixed order, and the spawns are deliberately
// sequential — a comparison must observe the tree a build left, not a concurrent one.
/* oxlint-disable no-await-in-loop */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonical, canonicalOnly } from "../support/identity.ts";
import {
  downstreamCheckout,
  EXPECTED_PLUGIN_FILES,
  FORK_ONLY_IDS,
  FORK_PUBLISHER,
  FORK_REPOSITORY,
  fixtureProvenance,
  write,
} from "./downstreamFixture.ts";

/**
 * A DOWNSTREAM-CUSTOMIZED distribution, built by the downstream itself (REQ-PLUGIN-022).
 *
 * The subject is `scripts/build-plugin-distribution.mjs` run FROM A FORK: a checkout that carries
 * its own `fork/` layer over the bundled corpus and publishes under its own owner. Two properties
 * have to hold at once for an enterprise to be able to use this route, and neither is provable
 * from the canonical build:
 *
 *   the CUSTOMIZATION arrives   every fork operation — add, full replacement, patch, and a direct
 *                               content edit — lands in each client's own home, under the id the
 *                               CLI route emits, with the fork's bytes and not the upstream's.
 *   the IDENTITY is the fork's  every catalog, every container manifest and every capability file
 *                               names the fork's publisher and the fork's https source, and the
 *                               canonical owner appears nowhere in the published tree.
 *
 * The build runs as a CHILD PROCESS from the fixture checkout, the way a downstream's own CI runs
 * it, because `scripts/build-plugin-distribution.mjs` resolves its repository root from its own
 * module URL: an in-process call would build THIS checkout's corpus under THIS checkout's
 * identity and prove nothing about a fork. The fixture is `test/ci/downstreamFixture.ts`, shared
 * with the APM and plugin-root suites, asked here for its optional fork identity and for a git
 * commit so the build has a HEAD to stamp.
 *
 * `--runtime` is a STUB: the three files the builder requires of a runtime (`package.json`,
 * `dist/cli.js`, `RUNTIME.json`), carrying the FORK's package name because the runtime a fork
 * bundles is the fork's own. The real bundled runtime is built from a packed tarball and proven
 * by `test/ci/pluginRuntime.test.ts`; rebuilding it here would add a minute of `npm pack` to
 * every run to re-prove a contract that already has an owner.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLIENTS = ["claude", "cursor", "copilot", "codex"] as const;
const VERSION = "1.9.0";
const TAG = `plugins/v${VERSION}`;

/**
 * Wall-time budgets, derived rather than guessed, with the command that produced each number.
 *
 * Measured 2026-09-20 on darwin INSIDE this harness — a timing case in this directory run with
 * `npx vitest run`, so the figures include the spawn a vitest worker pays for rather than the
 * cheaper one an idle shell sees (a standalone probe of the same builds came back at 1.3–2.1s,
 * and quoting that here would have set the budget from the wrong process):
 *
 *   fixture checkout      `downstreamCheckout` + the charter copy + `git init`      2.0s
 *   four-root build       `--out <dir> --runtime <stub> --version 1.9.0`            4.3s, 5.0s, 5.5s
 *   one-root build        the same plus `--client claude`                           3.3s
 *
 * A four-root build is roots, the APM projection, four archives and four catalogs; it is an order
 * of magnitude under the canonical build measured at the head of `./pluginDistribution.test.ts`
 * (13s) because this corpus is sixteen artifacts rather than the whole one, and the fixed cost —
 * node's start, the corpus staging, the APM projection — is most of what is left, which is why one
 * root is not a quarter of four.
 *
 * BASIS 6s per build and 3s per checkout, each measured figure rounded up; MARGIN is the one
 * guessed number and it is wide because the required CI legs include a Windows runner that is not
 * measurable from here. A case that builds N times is budgeted N x basis x MARGIN, plus a checkout
 * where it makes its own.
 *
 * The basis is deliberately the COLD figure. The same suite, run again on a warm cache with the
 * shared checkouts below, came in at 17.5s in total with its individual builds between 1.0s and
 * 2.4s — which is what this file costs a green run, and is not what the budget is set from,
 * because a budget set from a warm number fails a cold runner.
 */
const MARGIN = 8;
const BUILD_BASIS_MS = 6_000;
const CHECKOUT_BASIS_MS = 3_000;
const ONE_BUILD_MS = (BUILD_BASIS_MS + CHECKOUT_BASIS_MS) * MARGIN;
const THREE_BUILDS_MS = (3 * BUILD_BASIS_MS + CHECKOUT_BASIS_MS) * MARGIN;

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-downstream-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/**
 * A `--runtime` input the builder accepts. Justified stub — see the suite header; the real
 * runtime has its own proof in `test/ci/pluginRuntime.test.ts`.
 */
function stubRuntime(): string {
  const dir = tempDir("runtime");
  const name = `@${FORK_PUBLISHER}/stamity`;
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name, version: "1.8.0", engines: { node: ">=22.22.2" } }, null, 2)}\n`,
  );
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist", "cli.js"), "#!/usr/bin/env node\nconsole.log('stub runtime');\n");
  writeFileSync(
    join(dir, "RUNTIME.json"),
    `${JSON.stringify(
      { package: name, version: "1.8.0", nodeFloor: ">=22.22.2", tarballSha256: "a".repeat(64), dependencies: [] },
      null,
      2,
    )}\n`,
  );
  return dir;
}

const RUNTIME = stubRuntime();

interface Fixture {
  readonly root: string;
  readonly commit: string;
  readonly date: string;
}

/**
 * A fork checkout: the shared corpus fixture, published under the fork's identity, with one commit.
 *
 * The charter is seeded from this repository for the same reason
 * `./pluginPackages.test.ts` seeds it: a plugin build PLANS, the charter is the engine's one
 * always-on artifact, and a corpus without it cannot emit at all. It is also the one UPSTREAM
 * artifact both the forked and the unforked build carry, which is what makes the comparison
 * below about more than the runtime.
 */
function forkFixture(label = "fork"): Fixture {
  const root = tempDir(`checkout-${label}`);
  downstreamCheckout(root, { identity: true, git: true });
  cpSync(join(REPO_ROOT, "content", "charter"), join(root, "content", "charter"), { recursive: true });
  return { root, ...fixtureProvenance(root) };
}

/** The builder, spawned from the fixture checkout — the only way its own root is the fork's. */
function build(fixture: Fixture, out: string, extra: string[] = []): SpawnSyncReturns<string> {
  return spawnSync(
    process.execPath,
    [join(fixture.root, "scripts", "build-plugin-distribution.mjs"), "--out", out, "--runtime", RUNTIME, "--version", VERSION, ...extra],
    { cwd: fixture.root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

/** Every regular file under `dir`, as POSIX-relative paths, sorted. */
function treeFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return treeFiles(join(dir, entry.name), rel);
      return entry.isFile() ? [rel] : [];
    });
}

/** The files inside the four plugin ROOTS, which is where a corpus comparison belongs. */
function rootFiles(dist: string): string[] {
  return treeFiles(dist).filter((path) => CLIENTS.some((client) => path.startsWith(`${client}/`)));
}

/** One authored fixture document, in the shape the fixture module writes its own. */
const fixtureDocument = (id: string, type: string, body: string): string =>
  `---\nid: ${id}\ntype: ${type}\ndescription: Fixture ${type}\ntags: [fixture]\nload: on-demand\n---\n\n${body}\n`;

/**
 * The body after a document's head.
 *
 * Taken by the fence rather than by the engine's `parseFrontmatter`, which `./apmDownstream.test.ts`
 * uses on the APM primitives: a client dialect is not always YAML. Cursor's rule head carries its
 * glob UNQUOTED (`globs:` followed by a bare double-star pattern), and a leading `*` is an alias
 * indicator to a strict YAML reader, so the engine parser would throw on a file this suite has to
 * read. Companion files carry no head and come back whole.
 */
function bodyOf(text: string): string {
  const match = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(text);
  return match === null ? text : text.slice(match[0].length);
}

const readText = (...parts: string[]): string => readFileSync(join(...parts), "utf8");

const readJson = (...parts: string[]): Record<string, unknown> =>
  JSON.parse(readText(...parts)) as Record<string, unknown>;

/**
 * A delivered DOCUMENT for a replaced or patched id, in any of the three spellings the four
 * clients use for one: `<id>.md`, `<id>.mdc`, `<id>.agent.md` (Copilot's agent home) and
 * `<id>/SKILL.md` (a skill directory, and Cursor's converted commands). Companions end in `.txt`
 * and are not documents, which is why the match is on the class of file rather than on a
 * hand-kept second list.
 */
const DELIVERED_DOCUMENT = /(?:replace|patch)-[a-z]+(?:\/SKILL|\.agent)?\.(?:md|mdc)$/;

/**
 * The ids the fork REPLACES or PATCHES, derived from the oracle's own paths: the delivered
 * documents whose upstream twin exists and has to have moved.
 */
const TOUCHED_IDS = EXPECTED_PLUGIN_FILES.filter(([path]) => DELIVERED_DOCUMENT.test(path)).map(([path]) => path);

/**
 * Files a root derives from the corpus AS A WHOLE, so a fork that adds one artifact changes them
 * by construction and they are not "untouched ids":
 *
 *   `<client>/stamity-plugin.json`   declares a per-class COUNT, so one added agent moves it.
 *   `cursor/hooks/subagent-guard.mjs`  embeds the agent roster it guards; the fork's added agent
 *                                      is one line inside that list.
 */
const CORPUS_DERIVED = [...CLIENTS.map((client) => `${client}/stamity-plugin.json`), "cursor/hooks/subagent-guard.mjs"];

let forked: Fixture;
let forkedDist: string;
let unforkedDist: string;
let emptyForkDist: string;

/**
 * THREE BUILDS OF ONE CHECKOUT, in this order: with the fork layer, with it removed, and with it
 * back as an empty directory.
 *
 * One checkout rather than three, and that is what makes the comparison a comparison: the three
 * trees are built from the same corpus, the same identity and the same HEAD, so the only input
 * that varied is the fork layer and no `--source-commit` override has to stand in for a
 * provenance three separate `git init`s would have disagreed about.
 */
beforeAll(() => {
  forked = forkFixture();
  forkedDist = tempDir("dist-fork");
  const built = build(forked, forkedDist);
  expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);

  rmSync(join(forked.root, "fork"), { recursive: true, force: true });
  unforkedDist = tempDir("dist-unforked");
  const baseline = build(forked, unforkedDist);
  expect(baseline.status, `${baseline.stdout}\n${baseline.stderr}`).toBe(0);

  mkdirSync(join(forked.root, "fork"));
  emptyForkDist = tempDir("dist-empty-fork");
  const empty = build(forked, emptyForkDist);
  expect(empty.status, `${empty.stdout}\n${empty.stderr}`).toBe(0);
}, THREE_BUILDS_MS);

describe("a fork's own distribution", () => {
  it("delivers every fork operation at the home, id and body each client takes", () => {
    // Non-degenerate by construction: the oracle covers four operations across four classes in
    // four clients, and every pair below is a file that had to be planned, projected and written.
    expect(EXPECTED_PLUGIN_FILES.length).toBeGreaterThan(50);
    for (const [path, body] of EXPECTED_PLUGIN_FILES) {
      const text = readText(forkedDist, ...path.split("/"));
      expect(bodyOf(text), path).toBe(body);
    }
    // A replaced artifact must not keep a trace of the body it replaced. The upstream body is
    // `Original <id>.` for every bundled fixture artifact, so the absent string is derived from
    // the path rather than listed again.
    const replaced = EXPECTED_PLUGIN_FILES.filter(([path]) => DELIVERED_DOCUMENT.test(path) && path.includes("replace-"));
    expect(replaced.length, "no replaced id was checked for its upstream body").toBe(12);
    for (const [path] of replaced) {
      const id = /(?:st|stamity)-(replace-[a-z]+)/.exec(path)?.[1] ?? "";
      expect(id, path).not.toBe("");
      const text = readText(forkedDist, ...path.split("/"));
      expect(text.split(`Original ${id}.`).length - 1, `${path} still carries the upstream body`).toBe(0);
    }
  });

  it("delivers each fork-only id exactly once and no consumer override at all", () => {
    const files = treeFiles(forkedDist);
    // "Exactly once" is two claims, and the walk answers only the first: the file list is a set of
    // paths, so a path is present or absent. The second claim — the id appears under ONE name —
    // is the twin checks below and the added-path equality in the comparison group.
    for (const path of FORK_ONLY_IDS) expect(files, path).toContain(path);
    // An addition lands under its BARE id: a prefixed twin would be a second copy of the same
    // artifact under the name the bundled corpus uses for its own.
    for (const client of CLIENTS) {
      expect(files, client).not.toContain(`${client}/skills/st-add-skill/SKILL.md`);
    }
    // The replaced skill's own companion does not survive a full replacement, in any root.
    for (const client of CLIENTS) {
      expect(files, client).not.toContain(`${client}/skills/st-replace-skill/references/upstream.txt`);
    }
    // `.stamity/overrides/` is a CONSUMER's local layer, never a packaging input: its body must
    // not appear anywhere in a published tree.
    const overrides = files.filter((path) => readText(forkedDist, ...path.split("/")).includes("Consumer-only body."));
    expect(overrides, "a consumer override reached the distribution").toEqual([]);
    // The binary companion is delivered; its bytes are the inbox's build/28 defect and are
    // deliberately not pinned here (see the oracle's header).
    for (const client of CLIENTS) {
      expect(files, client).toContain(`${client}/skills/add-skill/assets/data.bin`);
    }
  });

  it("stamps every root with the fixture checkout's own HEAD", () => {
    expect(forked.commit).toMatch(/^[0-9a-f]{40}$/);
    for (const client of CLIENTS) {
      const capability = readJson(forkedDist, client, "stamity-plugin.json");
      expect(capability["sourceCommit"], client).toBe(forked.commit);
    }
    const manifest = readJson(forkedDist, "release.json") as { sourceCommit?: unknown };
    expect(manifest.sourceCommit).toBe(forked.commit);
  });

  it("publishes the fork's identity in every catalog that carries an owner or a url", () => {
    const claude = readJson(forkedDist, ".claude-plugin", "marketplace.json");
    expect(claude["owner"]).toEqual({ name: FORK_PUBLISHER, url: `https://github.com/${FORK_PUBLISHER}` });
    const entry = (claude["plugins"] as Record<string, unknown>[])[0] ?? {};
    expect(entry["source"]).toEqual({
      source: "git-subdir",
      url: `${FORK_REPOSITORY}.git`,
      path: "claude",
      ref: TAG,
    });
    expect(entry["repository"]).toBe(FORK_REPOSITORY);
    expect(entry["author"]).toEqual({ name: FORK_PUBLISHER });

    for (const [client, path] of [
      ["cursor", ".cursor-plugin/marketplace.json"],
      ["copilot", ".github/plugin/marketplace.json"],
    ] as const) {
      const catalog = readJson(forkedDist, ...path.split("/"));
      expect(catalog["owner"], client).toEqual({ name: FORK_PUBLISHER });
    }

    // Codex carries NEITHER an owner nor a url, and that is recorded rather than skipped: its
    // vendored schema documents no owner field, and the source of a catalog shipping inside the
    // tree it addresses is the in-tree `local` path. There is no identity to assert, so the
    // assertion is that there is no identity — a later renderer that grew one has to come back
    // through this line.
    const codex = readJson(forkedDist, ".agents", "plugins", "marketplace.json");
    expect(Object.hasOwn(codex, "owner")).toBe(false);
    expect((codex["plugins"] as Record<string, unknown>[])[0]?.["source"]).toEqual({
      source: "local",
      path: "./codex",
    });

    // Every root's container manifest is the fork's too, not only the catalogs.
    expect(readJson(forkedDist, "claude", ".claude-plugin", "plugin.json")["author"]).toEqual({ name: FORK_PUBLISHER });
    for (const client of ["copilot", "codex"] as const) {
      expect(readJson(forkedDist, client, "plugin.json")["author"], client).toEqual({ name: FORK_PUBLISHER });
    }
  });

  // Gated on the canonical checkout, not relaxed on a fork: the token this greps for IS the
  // canonical owner, and in a checkout renamed to that same owner the grep would match its own
  // legitimate identity everywhere. Vitest prints the reason with the skipped title.
  it.skipIf(!canonical().canonical)(
    canonicalOnly("names the canonical owner and package nowhere in the published tree"),
    () => {
      const tokens = [canonical().publisher.toLowerCase(), canonical().name.toLowerCase()];
      const files = treeFiles(forkedDist).filter((path) => !path.endsWith(".zip"));
      // Non-degenerate: a whole distribution, not a directory that failed to build.
      expect(files.length).toBeGreaterThan(120);
      const offenders = files.filter((path) => {
        const text = readFileSync(join(forkedDist, ...path.split("/"))).toString("utf8").toLowerCase();
        return tokens.some((token) => text.includes(token));
      });
      expect(offenders, "the canonical identity leaked into a downstream distribution").toEqual([]);
      // The archives are deflated, so a byte scan of them proves nothing either way. Their
      // content is the roots, which the walk above did read, file by file.
      expect(treeFiles(forkedDist).filter((path) => path.endsWith(".zip")).length).toBe(CLIENTS.length);
    },
  );
});

describe("the unforked build the fork is measured against", () => {
  it("leaves every id the fork does not touch byte-identical", () => {
    const forkedFiles = rootFiles(forkedDist);
    const baselineFiles = new Set(rootFiles(unforkedDist));
    const shared = forkedFiles.filter((path) => baselineFiles.has(path));
    // Non-degenerate: the two trees share most of four roots — the hooks, the runtime, the
    // container manifests, the READMEs and every id the fork layer never named.
    expect(shared.length).toBeGreaterThan(80);

    const differing = shared.filter(
      (path) =>
        !readFileSync(join(forkedDist, ...path.split("/"))).equals(readFileSync(join(unforkedDist, ...path.split("/")))),
    );
    expect(TOUCHED_IDS.length, "the touched-id set is derived and must not be empty").toBe(24);
    expect(differing.toSorted()).toEqual([...TOUCHED_IDS, ...CORPUS_DERIVED].toSorted());
  });

  it("adds only the fork's own ids and drops the replaced skill's companion", () => {
    const forkedFiles = rootFiles(forkedDist);
    const baselineFiles = rootFiles(unforkedDist);
    const inFork = new Set(forkedFiles);
    const inBaseline = new Set(baselineFiles);

    const added = forkedFiles.filter((path) => !inBaseline.has(path));
    const removed = baselineFiles.filter((path) => !inFork.has(path));
    // Every fork-only id, its two companions per root, and nothing else.
    expect(added.toSorted()).toEqual(
      [
        ...FORK_ONLY_IDS,
        ...CLIENTS.map((client) => `${client}/skills/add-skill/assets/data.bin`),
        ...CLIENTS.map((client) => `${client}/skills/add-skill/references/own.txt`),
        ...CLIENTS.map((client) => `${client}/skills/st-replace-skill/references/own.txt`),
      ].toSorted(),
    );
    expect(removed.toSorted()).toEqual(
      CLIENTS.map((client) => `${client}/skills/st-replace-skill/references/upstream.txt`).toSorted(),
    );
  });

  it("treats an empty fork layer as the absence of one, byte for byte", () => {
    const baselineFiles = treeFiles(unforkedDist);
    expect(treeFiles(emptyForkDist)).toEqual(baselineFiles);
    // The whole distribution this time, catalogs and archives included: a `fork/` directory with
    // nothing in it must not change one byte a consumer fetches.
    expect(baselineFiles.length).toBeGreaterThan(120);
    const differing = baselineFiles.filter(
      (path) =>
        !readFileSync(join(unforkedDist, ...path.split("/"))).equals(
          readFileSync(join(emptyForkDist, ...path.split("/"))),
        ),
    );
    expect(differing).toEqual([]);
  });
});

/**
 * The refusals a downstream has to be able to rely on.
 *
 * ONE CHECKOUT, mutated and restored per case, except where a mutation cannot be undone — the
 * case-insensitive twin below overwrites the sibling it contests, so that case pays for its own
 * tree and says so. The builds run `--client claude`: every refusal here is a corpus or a
 * configuration fault, decided before a second root would have been planned, and three more roots
 * would buy nothing but wall time. An `--out` directory is never reused, because a refused build
 * leaves whatever the step before it wrote and the builder refuses a non-empty `--out`.
 */
describe("a fork the build refuses", () => {
  const ONE_CLIENT = ["--client", "claude"];
  let fixture: Fixture;
  beforeAll(() => {
    fixture = forkFixture("refusals");
  }, CHECKOUT_BASIS_MS * MARGIN);

  it(
    "refuses a fork id that case-folds onto a bundled one, naming the contested path",
    () => {
      // PORTABLE construction, and the reason is the filesystem: a twin in the SAME directory
      // collapses onto its sibling on darwin and Windows, where the case never reaches the
      // index. This twin lives in the fork layer and contests a path the CONTENT layer projects,
      // so both files exist on every host and the case-folded collision is real everywhere.
      const twin = join(fixture.root, "fork/agents/SOURCE-AGENT.md");
      write(twin, fixtureDocument("SOURCE-AGENT", "agent", "Case twin."));
      const out = tempDir("case-fold-out");
      const result = build(fixture, out, ONE_CLIENT);
      rmSync(twin);
      expect(result.status).toBe(1);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain("project onto");
      expect(output).toContain("stamity-SOURCE-AGENT");
      // The distribution was not completed: no catalog and no manifest were written. The root the
      // earlier step wrote IS left in place — recorded rather than asserted away, because a retry
      // therefore needs a fresh directory.
      expect(existsSync(join(out, "release.json"))).toBe(false);
      expect(existsSync(join(out, ".claude-plugin", "marketplace.json"))).toBe(false);
    },
    ONE_BUILD_MS,
  );

  it(
    "refuses a fork twin that differs from its sibling only in case",
    () => {
      // Its own checkout: on a case-insensitive volume this write LANDS ON `add-agent.md`, so the
      // mutation destroys the fixture's own addition and cannot be reverted by deleting a file.
      const own = forkFixture("case-twin");
      write(join(own.root, "fork/agents/Add-Agent.md"), fixtureDocument("Add-Agent", "agent", "Case twin."));
      const out = tempDir("case-twin-out");
      const result = build(own, out, ONE_CLIENT);
      // ONE outcome, reached by two routes, and which one runs is a property of the host
      // filesystem rather than of the generator. On a case-INSENSITIVE volume (darwin, Windows)
      // the write lands on `add-agent.md`, keeping that name and the new `id`, and the corpus
      // planner refuses the pair as `filename-mismatch`. On a case-SENSITIVE volume both files
      // exist and project onto paths that differ only in case, which the APM projection refuses
      // for the consumer volumes it has to install on. Either way: exit 1, and the message names
      // the contested id.
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(/add-agent/i);
      expect(existsSync(join(out, "release.json"))).toBe(false);
    },
    ONE_BUILD_MS,
  );

  // Windows has no unprivileged file symlinks, so the input this refuses cannot be created there.
  it.skipIf(process.platform === "win32")(
    "refuses a symlink under the fork's skill companions",
    () => {
      write(join(fixture.root, "outside/private.txt"), "Outside content.\n");
      const link = join(fixture.root, "fork/skills/add-skill/leak.txt");
      symlinkSync(join(fixture.root, "outside/private.txt"), link);
      const out = tempDir("symlink-out");
      const result = build(fixture, out, ONE_CLIENT);
      rmSync(link);
      expect(result.status).toBe(1);
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain("fork/skills/add-skill/leak.txt");
      expect(output).toContain("symlink");
      expect(existsSync(join(out, "claude", "skills", "add-skill", "leak.txt"))).toBe(false);
    },
    ONE_BUILD_MS,
  );
});

/**
 * A fork that publishes from a host that is not github.com.
 *
 * `repository.url` cannot express one — `scripts/distribution-identity.mjs` requires it to
 * normalize to `https://github.com/<owner>/<repo>`, because the publisher slug and the owner in
 * that URL are one identity. Where a downstream's own server DOES get named is
 * `stamity.distribution.sources`, which is the block the module's header says a consuming
 * organization repoints at its own remote. So that is the fork built here.
 */
describe("a fork on another host", () => {
  const MIRROR = "https://git.acme.example/stamity/plugins.git";

  // One checkout for both cases: each rewrites the whole `stamity` block, so the second does not
  // inherit the first's sources and nothing has to be restored between them.
  let fixture: Fixture;
  beforeAll(() => {
    fixture = forkFixture("other-host");
  }, CHECKOUT_BASIS_MS * MARGIN);

  function withSources(sources: Record<string, unknown>): void {
    const path = join(fixture.root, "package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    pkg["stamity"] = { publisher: FORK_PUBLISHER, distribution: { sources } };
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  it(
    "addresses the mirror as git-subdir and emits no github source",
    () => {
      withSources(Object.fromEntries(CLIENTS.map((client) => [client, { kind: "git-subdir", url: MIRROR }])));
      const out = tempDir("other-host-out");
      // `--client claude,codex`: those are the two catalogs whose schemas carry a remote source
      // object at all. Cursor's entry source is a directory path string and Copilot's catalog
      // emits the relative path, both documented in `.github/client-contracts.md`, so a remote
      // host is not expressible there and building them would cost two roots to assert nothing.
      const result = build(fixture, out, ["--client", "claude,codex"]);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

      const claude = readJson(out, ".claude-plugin", "marketplace.json");
      expect((claude["plugins"] as Record<string, unknown>[])[0]?.["source"]).toEqual({
        source: "git-subdir",
        url: MIRROR,
        path: "claude",
        ref: TAG,
      });
      const codex = readJson(out, ".agents", "plugins", "marketplace.json");
      expect((codex["plugins"] as Record<string, unknown>[])[0]?.["source"]).toEqual({
        source: "git-subdir",
        url: MIRROR,
        path: "./codex",
        ref: TAG,
      });
      // No `github` source anywhere in the published catalogs: the kind names the GitHub API, and
      // this tree is not on it.
      for (const path of [".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"]) {
        expect(readText(out, ...path.split("/")), path).not.toContain('"github"');
      }
    },
    ONE_BUILD_MS,
  );

  it(
    "refuses a github source kind pointed at another host",
    () => {
      withSources({ claude: { kind: "github", url: MIRROR } });
      const result = build(fixture, tempDir("github-kind-out"));
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain("addresses github.com only");
    },
    ONE_BUILD_MS,
  );
});

/**
 * The renamed private copy, opt-in on the same variable `./forkIdentity.test.ts` declares.
 *
 * That suite's opt-in group already proves the renamed fork (`@acme/stamity`, `private: true`)
 * PASSES the inherited gate over the fifteen identity-sensitive suites, and its always-on group
 * proves the regenerated marketplace names a git source rather than an npm package it cannot
 * publish. What neither covers is the DISTRIBUTION built inside such a copy, which is this one
 * case; the tarball smoke and the whole-suite run stay where they are.
 *
 * Opt-in for what it costs to get there, not for its wall time: it copies the whole working tree
 * and builds the real corpus, which the coverage and Windows legs are charged differently for.
 */
const FORK_SUITE = process.env["STAMITY_FORK_SUITE"] === "1";

describe.skipIf(!FORK_SUITE)(
  "a renamed private copy of this checkout (set STAMITY_FORK_SUITE=1 to run)",
  () => {
    it(
      "builds its distribution and publishes the renamed identity in its catalogs",
      () => {
        const root = tempDir("renamed");
        // Cached AND untracked-not-ignored, the same list `scripts/leak-gate.mjs` builds, so the
        // copy carries the working tree rather than only the last commit.
        const tracked = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
          cwd: REPO_ROOT,
          encoding: "utf8",
        });
        expect(tracked.status, tracked.stderr).toBe(0);
        const files = tracked.stdout.split("\0").filter((entry) => entry !== "" && entry !== "node_modules");
        expect(files.length, "no tracked file was listed").toBeGreaterThan(100);
        for (const relPath of files) cpSync(join(REPO_ROOT, relPath), join(root, relPath));
        // Never installed: the copy borrows the real dependency tree, as the fixture does.
        symlinkSync(join(REPO_ROOT, "node_modules"), join(root, "node_modules"), "junction");

        const manifestPath = join(root, "package.json");
        const pkg = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
        pkg["name"] = `@${FORK_PUBLISHER}/stamity`;
        pkg["stamity"] = { publisher: FORK_PUBLISHER };
        pkg["repository"] = { type: "git", url: `${FORK_REPOSITORY}.git` };
        pkg["homepage"] = FORK_REPOSITORY;
        pkg["private"] = true;
        delete pkg["publishConfig"];
        writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);

        const out = join(root, "dist", "plugins");
        const result = spawnSync(
          process.execPath,
          [
            join(root, "scripts", "build-plugin-distribution.mjs"),
            "--out",
            out,
            "--runtime",
            RUNTIME,
            "--version",
            VERSION,
            "--source-commit",
            "0".repeat(39) + "1",
            "--source-commit-date",
            "2026-09-20T00:00:00Z",
          ],
          { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        );
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

        const claude = readJson(out, ".claude-plugin", "marketplace.json");
        expect(claude["owner"]).toEqual({ name: FORK_PUBLISHER, url: `https://github.com/${FORK_PUBLISHER}` });
        expect((claude["plugins"] as Record<string, unknown>[])[0]?.["source"]).toEqual({
          source: "git-subdir",
          url: `${FORK_REPOSITORY}.git`,
          path: "claude",
          ref: TAG,
        });
        for (const client of CLIENTS) {
          expect(readJson(out, client, "stamity-plugin.json")["sourceCommit"], client).toBe("0".repeat(39) + "1");
        }
      },
      600_000,
    );
  },
);
