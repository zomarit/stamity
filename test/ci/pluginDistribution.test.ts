// Every loop here walks a generated tree in a fixed order, and the spawns are deliberately
// sequential — a check run must observe the tree the build left, not a concurrent one.
/* oxlint-disable no-await-in-loop */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — the distribution modules ship as plain .mjs with no type declarations:
// they run under bare Node in a release job, with no TypeScript nearby.
import { buildCatalogIdentity, CATALOG_PATHS, renderCatalog } from "../../scripts/plugins/catalogs.mjs";
// @ts-expect-error — see above.
import { validateReleaseManifest } from "../../scripts/plugins/releaseManifest.mjs";
// @ts-expect-error — see above.
import { resolveDistributionIdentity } from "../../scripts/distribution-identity.mjs";
// @ts-expect-error — see above.
import { buildZip } from "../../scripts/plugins/zip.mjs";

/**
 * `scripts/build-plugin-distribution.mjs` end to end: the distribution root a release publishes
 * (REQ-PLUGIN-010, REQ-PLUGIN-011).
 *
 * The suite runs the builder as a CHILD PROCESS, the way a release runs it, because what is
 * under test are properties of the TREE it leaves — a manifest whose digests match the archives
 * beside it, two builds agreeing byte for byte, an archive a real extractor opens. An in-process
 * call would prove the renderer agrees with itself and say nothing about what lands on disk.
 *
 * ONE BUILD, SHARED. A full build plans four client roots over the whole corpus, projects the
 * APM package and compresses four archives; it is the expensive step and every tree assertion
 * below reads the same output, so it runs once in `beforeAll`. The two cases that need a
 * DIFFERENT build — a distribution commit, a single-client selection — share one narrowed build
 * of their own, and everything that is a pure function of configuration (the catalog shapes, the
 * prerelease tag, the zip writer) is tested against the modules directly with no build at all.
 *
 * `--runtime` is a STUB: a directory carrying the three files the build requires of a runtime
 * (`package.json`, `dist/cli.js`, `RUNTIME.json`). The real bundled runtime is built from a
 * packed tarball and proven by its own suite; rebuilding it here would add a minute of `npm pack`
 * to every run to re-prove a contract that already has an owner. What this suite asserts about
 * the runtime is the part the DISTRIBUTION owns: `release.json`'s `runtime` block is the stub's
 * `RUNTIME.json`, read rather than re-derived.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLIENTS = ["claude", "cursor", "copilot", "codex"] as const;

/** A 40-hex commit and its date, pinned so the build never reads this checkout's HEAD. */
const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";
/** A second 40-hex sha, standing for the commit the tree lands on once it is pushed. */
const DISTRIBUTION_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";
const VERSION = "1.9.0";

/**
 * Wall-time budgets, derived rather than guessed. One root is a full content index plus a
 * planner pass plus a tree write, measured at ~2s per client on this repository's corpus; four
 * of them behind one corpus staging is ~10s, the APM projection is ~3s, and compressing four
 * roots is ~2s — so ~15s is the honest cost of the shared build and the budget is 8x that to
 * survive a loaded CI worker. The narrowed build is one root and gets a third of the headroom.
 */
const FULL_BUILD_MS = 120_000;
const ONE_ROOT_MS = 40_000;

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-distribution-"));

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/**
 * A `--runtime` input the builder accepts. Justified stub — see the suite header; the real
 * runtime has its own proof in `test/ci/pluginRuntime.test.ts`.
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
      {
        package: "@zomarit/stamity",
        version: "1.8.0",
        nodeFloor: ">=22.22.2",
        tarballSha256: "a".repeat(64),
        dependencies: [],
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

const RUNTIME = stubRuntime();

function build(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(REPO_ROOT, "scripts", "build-plugin-distribution.mjs"), ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function buildInto(dir: string, extra: string[] = []): SpawnSyncReturns<string> {
  return build([
    "--out",
    dir,
    "--runtime",
    RUNTIME,
    "--version",
    VERSION,
    "--source-commit",
    FIXED_COMMIT,
    "--source-commit-date",
    FIXED_COMMIT_DATE,
    ...extra,
  ]);
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

interface ReleasePackage {
  client: string;
  path: string;
  archive: string;
  sha256: string;
  bytes: number;
  clientFloor: string;
}
interface ReleaseManifest {
  schemaVersion: number;
  version: string;
  sourceCommit: string;
  distribution: { branch: string; tag: string; commit: string | null };
  runtime: { package: string; version: string; nodeFloor: string; tarballSha256: string };
  packages: ReleasePackage[];
  catalogs: Record<string, string>;
  apm: { manifest: string; primitives: string; installSpec: string };
}

const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/**
 * A minimal ZIP READER, independent of the writer under test: it walks the end-of-central-
 * directory record and the central directory rather than the local headers, which is how a real
 * extractor finds entries, and inflates each body with `node:zlib`. Written here rather than
 * imported from `scripts/plugins/zip.mjs` on purpose — a reader that shared the writer's own
 * offset arithmetic would agree with a wrong archive.
 */
function readZip(bytes: Buffer): { path: string; bytes: Buffer }[] {
  const endSignature = 0x06054b50;
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== endSignature) end -= 1;
  if (end < 0) throw new Error("no end-of-central-directory record: this is not a zip archive");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const entries: { path: string; bytes: Buffer }[] = [];
  for (let i = 0; i < count; i += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error(`central directory entry ${i} has no signature`);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const path = bytes.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const bodyStart = localOffset + 30 + localNameLength + localExtraLength;
    const body = bytes.subarray(bodyStart, bodyStart + compressedSize);
    const content = method === 0 ? Buffer.from(body) : inflateRawSync(body);
    if (content.length !== uncompressedSize) {
      throw new Error(`${path}: inflated to ${String(content.length)} bytes, the header says ${String(uncompressedSize)}`);
    }
    entries.push({ path, bytes: content });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** This repository's own package.json, as the identity reads it. */
const basePackage = readJson<Record<string, unknown>>(join(REPO_ROOT, "package.json"));

/**
 * A catalog identity built from a COPY of this repository's package.json with one configuration
 * change applied — the same object shape `resolveDistributionIdentity` reads off disk in a real
 * run, which is how a downstream's `stamity.distribution` block is driven here without writing a
 * second checkout for every variant.
 */
function identityWith(distribution: Record<string, unknown>): unknown {
  const pkg = structuredClone(basePackage) as Record<string, unknown> & { stamity?: Record<string, unknown> };
  pkg.stamity = { ...pkg.stamity, distribution };
  return buildCatalogIdentity(pkg, resolveDistributionIdentity(pkg));
}

/** The default identity: no `stamity.distribution` block at all, so every default applies. */
function defaultIdentity(): unknown {
  const pkg = structuredClone(basePackage) as Record<string, unknown> & { stamity?: Record<string, unknown> };
  if (pkg.stamity !== undefined) delete pkg.stamity["distribution"];
  return buildCatalogIdentity(pkg, resolveDistributionIdentity(pkg));
}

interface CatalogEntrySource {
  source: string;
  url?: string;
  repo?: string;
  path?: string;
  ref?: string;
  sha?: string;
  sha256?: string;
  package?: string;
  version?: string;
  registry?: string;
}
interface Catalog {
  name: string;
  owner?: { name: string; url?: string; email?: string };
  interface?: { displayName: string };
  metadata?: { description: string; version: string };
  description?: string;
  version?: string;
  plugins: {
    name: string;
    source: CatalogEntrySource | string;
    version?: string;
    description?: string;
    policy?: { installation: string; authentication: string };
    category?: string;
  }[];
}

const catalogOf = (dir: string, client: string): Catalog =>
  readJson<Catalog>(join(dir, ...CATALOG_PATHS[client].split("/")));

let dist: string;
let manifest: ReleaseManifest;

beforeAll(() => {
  dist = join(work, "dist");
  const result = buildInto(dist);
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  manifest = readJson<ReleaseManifest>(join(dist, "release.json"));
}, FULL_BUILD_MS);

describe("the release manifest", () => {
  it("validates against its own schema and describes the tree beside it", () => {
    expect(validateReleaseManifest(manifest)).toEqual([]);
    expect(manifest.version).toBe(VERSION);
    expect(manifest.sourceCommit).toBe(FIXED_COMMIT);
    expect(manifest.distribution).toEqual({ branch: "plugin-dist", tag: `plugins/v${VERSION}`, commit: null });
    expect(manifest.packages.map((entry) => entry.client)).toEqual([...CLIENTS]);
    expect(manifest.catalogs).toEqual(Object.fromEntries(CLIENTS.map((client) => [client, CATALOG_PATHS[client]])));
    expect(manifest.apm).toEqual({
      manifest: "apm.yml",
      primitives: ".apm",
      installSpec: `zomarit/stamity#plugins/v${VERSION}`,
    });
    // The runtime block is the stub's RUNTIME.json, read rather than re-derived.
    expect(manifest.runtime).toEqual({
      package: "@zomarit/stamity",
      version: "1.8.0",
      nodeFloor: ">=22.22.2",
      tarballSha256: "a".repeat(64),
    });
  });

  it("carries a digest per archive that an independent hash of the file reproduces", () => {
    for (const entry of manifest.packages) {
      const archive = readFileSync(join(dist, entry.archive));
      expect(sha256(archive), entry.archive).toBe(entry.sha256);
      expect(archive.length).toBe(entry.bytes);
      expect(entry.bytes).toBeGreaterThan(0);
      // And the checksum file `sha256sum -c` reads is the same digest in its own format.
      expect(readFileSync(join(dist, `${entry.archive}.sha256`), "utf8")).toBe(`${entry.sha256}  ${entry.archive}\n`);
      expect(entry.path).toBe(entry.client);
      expect(entry.clientFloor).toBe(
        readJson<{ clientFloor: { version: string } }>(join(dist, entry.client, "stamity-plugin.json")).clientFloor
          .version,
      );
    }
  });

  it(
    "renders the same archives and the same manifest on a second build of one commit",
    () => {
      const second = join(work, "dist-again");
      const result = buildInto(second);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(readFileSync(join(second, "release.json"))).toEqual(readFileSync(join(dist, "release.json")));
      for (const entry of manifest.packages) {
        expect(sha256(readFileSync(join(second, entry.archive))), entry.archive).toBe(entry.sha256);
      }
      for (const client of CLIENTS) {
        expect(
          readFileSync(join(second, ...CATALOG_PATHS[client].split("/"))),
          `${client} catalog`,
        ).toEqual(readFileSync(join(dist, ...CATALOG_PATHS[client].split("/"))));
      }
      expect(readFileSync(join(second, "README.md"))).toEqual(readFileSync(join(dist, "README.md")));
    },
    FULL_BUILD_MS,
  );
});

describe("the archives", () => {
  it("open with an independent reader and carry the root's files under the client directory", () => {
    for (const entry of manifest.packages) {
      const read = readZip(readFileSync(join(dist, entry.archive)));
      expect(read.length, entry.archive).toBeGreaterThan(10);
      const paths = read.map((file) => file.path);
      // Every entry is under the root's own directory, so an extraction reproduces `<client>/`.
      expect(paths.every((path) => path.startsWith(`${entry.client}/`)), entry.archive).toBe(true);
      expect(paths).toContain(`${entry.client}/stamity-plugin.json`);
      expect(paths).toContain(`${entry.client}/README.md`);
      // Sorted, which is what makes the bytes a function of the tree alone.
      expect(paths).toEqual(paths.toSorted());
      // And the bytes came out the way they went in.
      const capability = read.find((file) => file.path === `${entry.client}/stamity-plugin.json`);
      expect(capability?.bytes).toEqual(readFileSync(join(dist, entry.client, "stamity-plugin.json")));
    }
  });

  // `unzip` is not guaranteed on every platform this suite runs on (the Windows leg has none),
  // so the real-extractor leg is opt-in on its presence while the reader case above always runs.
  describe.skipIf(spawnSync("unzip", ["-v"], { encoding: "utf8" }).status !== 0)("through a real unzip", () => {
    it("lists and extracts the claude root", () => {
      const archive = join(dist, `stamity-plugin-claude-${VERSION}.zip`);
      const listing = spawnSync("unzip", ["-l", archive], { encoding: "utf8" });
      expect(listing.status, listing.stderr).toBe(0);
      expect(listing.stdout).toContain("claude/stamity-plugin.json");
      expect(listing.stdout).toContain("claude/README.md");
      // A listing is a header read; extraction is the CRC check on every entry.
      const into = tempDir("unzipped");
      const extracted = spawnSync("unzip", ["-q", archive, "-d", into], { encoding: "utf8" });
      expect(extracted.status, extracted.stderr).toBe(0);
      expect(readFileSync(join(into, "claude", "stamity-plugin.json"))).toEqual(
        readFileSync(join(dist, "claude", "stamity-plugin.json")),
      );
    });
  });

  it("puts the fixed timestamp in the bytes rather than reading a clock", () => {
    const entries = [
      { path: "b.txt", bytes: Buffer.from("second\n") },
      { path: "a.txt", bytes: Buffer.from("first\n") },
    ];
    const one = buildZip(entries, { mtime: new Date(FIXED_COMMIT_DATE) }) as Buffer;
    const again = buildZip(entries, { mtime: new Date(FIXED_COMMIT_DATE) }) as Buffer;
    expect(sha256(again)).toBe(sha256(one));
    // A different commit date is a different archive: if it were not, the timestamp would not be
    // in the bytes at all and "fixed mtime" would be an unfalsifiable claim.
    const later = buildZip(entries, { mtime: new Date("2026-09-21T00:00:00Z") }) as Buffer;
    expect(sha256(later)).not.toBe(sha256(one));
    // Unsorted in, sorted out.
    expect(readZip(one).map((file) => file.path)).toEqual(["a.txt", "b.txt"]);
    expect(readZip(one)[1]?.bytes.toString("utf8")).toBe("second\n");
  });
});

describe("the catalogs", () => {
  it("gives Claude a git-subdir source pinned to the release tag by default", () => {
    const catalog = catalogOf(dist, "claude");
    expect(catalog.owner?.name).toBe("zomarit");
    expect(catalog.version).toBe(VERSION);
    expect(catalog.plugins[0]?.source).toEqual({
      source: "git-subdir",
      url: "https://github.com/zomarit/stamity.git",
      path: "claude",
      ref: `plugins/v${VERSION}`,
    });
    expect(catalog.plugins[0]?.version).toBe(VERSION);
  });

  it("replaces the whole source object, and nothing else, when a client is configured as an archive", () => {
    const identity = identityWith({
      sources: {
        claude: { kind: "archive", url: "https://downloads.example.test/stamity-<client>-<version>.zip" },
      },
    });
    const rendered = renderCatalog("claude", identity, VERSION, FIXED_COMMIT, {
      archives: { claude: { sha256: "b".repeat(64) } },
    }) as Catalog;
    expect(rendered.plugins[0]?.source).toEqual({
      source: "archive",
      url: `https://downloads.example.test/stamity-claude-${VERSION}.zip`,
      sha256: "b".repeat(64),
    });
    // Everything outside `source` is the default catalog's, byte for byte.
    const baseline = catalogOf(dist, "claude");
    expect({ ...rendered, plugins: [{ ...rendered.plugins[0], source: null }] }).toEqual({
      ...baseline,
      plugins: [{ ...baseline.plugins[0], source: null }],
    });
  });

  it("gives Claude an npm source when the client is configured for npm", () => {
    const identity = identityWith({ sources: { claude: { kind: "npm" } } });
    const rendered = renderCatalog("claude", identity, VERSION, FIXED_COMMIT) as Catalog;
    expect(rendered.plugins[0]?.source).toEqual({ source: "npm", package: "@zomarit/stamity", version: VERSION });
  });

  it("carries the owner Cursor's reference page requires", () => {
    const catalog = catalogOf(dist, "cursor");
    expect(catalog.owner).toEqual({ name: "zomarit" });
    expect(catalog.metadata?.version).toBe(VERSION);
    expect(catalog.plugins[0]?.source).toBe("./cursor");
    expect(catalog.plugins[0]?.version).toBe(VERSION);
  });

  it("gives Copilot an owner, a metadata version and a relative source", () => {
    const catalog = catalogOf(dist, "copilot");
    expect(catalog.owner).toEqual({ name: "zomarit" });
    expect(catalog.metadata).toEqual({ description: basePackage["description"], version: VERSION });
    expect(catalog.plugins[0]?.source).toBe("./copilot");
    expect(catalog.plugins[0]?.version).toBe(VERSION);
  });

  it("publishes an owner email on both catalogs that document one, and only when it is configured", () => {
    // The identity had no `ownerEmail` key at all before this unit; the Copilot and Cursor
    // catalogs document `owner.email`, so the configuration gained one.
    const identity = identityWith({ ownerEmail: "plugins@example.test" });
    for (const client of ["cursor", "copilot"] as const) {
      const rendered = renderCatalog(client, identity, VERSION, FIXED_COMMIT) as Catalog;
      expect(rendered.owner, client).toEqual({ name: "zomarit", email: "plugins@example.test" });
      // Absent by default: an empty contact field is worse than none.
      expect(Object.hasOwn(catalogOf(dist, client).owner ?? {}, "email"), client).toBe(false);
    }
  });

  it("gives Codex the display name, policy, category and `./`-prefixed path its page requires", () => {
    const catalog = catalogOf(dist, "codex");
    expect(catalog.interface).toEqual({ displayName: "stamity" });
    const entry = catalog.plugins[0];
    expect(entry?.source).toEqual({ source: "local", path: "./codex" });
    expect(entry?.policy).toEqual({ installation: "AVAILABLE", authentication: "ON_INSTALL" });
    expect(entry?.category).toBe("Productivity");
    // REQ-PLUGIN-010's "every entry's version equals the release version" cannot hold here: the
    // Codex marketplace documents NO `version` key on a plugin entry, and an unresolvable entry
    // is skipped silently, so an invented key would vanish rather than fail. The version travels
    // in the source object for a remote source, and in the root's own plugin.json otherwise.
    expect(Object.hasOwn(entry ?? {}, "version")).toBe(false);
  });

  it("addresses a configured Codex mirror as a pinned git-subdir instead of the in-tree copy", () => {
    const identity = identityWith({
      sources: { codex: { kind: "git-subdir", url: "https://git.example.test/mirror/stamity.git" } },
    });
    const rendered = renderCatalog("codex", identity, VERSION, FIXED_COMMIT) as Catalog;
    expect(rendered.plugins[0]?.source).toEqual({
      source: "git-subdir",
      url: "https://git.example.test/mirror/stamity.git",
      path: "./codex",
      ref: `plugins/v${VERSION}`,
    });
    expect(rendered.plugins[0]?.policy).toEqual({ installation: "AVAILABLE", authentication: "ON_INSTALL" });
  });

  it("renders a prerelease tag that the Renovate preset deliberately does not match", () => {
    const identity = defaultIdentity();
    const rendered = renderCatalog("claude", identity, "1.9.0-rc.1", FIXED_COMMIT) as Catalog;
    const source = rendered.plugins[0]?.source as CatalogEntrySource;
    expect(source.ref).toBe("plugins/v1.9.0-rc.1");

    // The preset's own regex, read from the committed file rather than restated here.
    const preset = readJson<{
      customManagers: { matchStrings: string[]; versioningTemplate: string }[];
    }>(join(REPO_ROOT, "renovate", "plugins.json"));
    const manager = preset.customManagers[0];
    const matcher = new RegExp(manager?.matchStrings[0] ?? "");
    const line = `  "ref": "${source.ref}"`;
    expect(matcher.exec(line)?.groups?.["currentValue"]).toBe("plugins/v1.9.0-rc.1");
    // Matched by the manager, then REFUSED by the versioning scheme: Renovate proposes releases
    // only, and a prerelease tag is intended to stay unbumped. The `regex:` prefix is Renovate's
    // versioning selector, not part of the pattern.
    const versioning = new RegExp((manager?.versioningTemplate ?? "").replace(/^regex:/, ""));
    expect(versioning.test("plugins/v1.9.0-rc.1")).toBe(false);
    expect(versioning.test("plugins/v1.9.0")).toBe(true);
  });
});

describe("the tree as a whole", () => {
  it("is also a complete APM package the generator verifies in place", () => {
    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "scripts", "generate-apm-package.mjs"), "--check", "--out-dir", dist],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(join(dist, "apm.yml"))).toBe(true);
    expect(statSync(join(dist, ".apm")).isDirectory()).toBe(true);
  });

  it("carries no credential-shaped string in any catalog, manifest or archive", () => {
    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "scripts", "leak-gate.mjs"), "--root", dist, "--include-build"],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("0 hits");
  });

  it("names every client's install, pin, update and rollback route, and the APM install spec", () => {
    const readme = readFileSync(join(dist, "README.md"), "utf8");
    expect(readme).toContain(`apm install zomarit/stamity#plugins/v${VERSION}`);
    for (const client of CLIENTS) {
      const section = readme.split(/^## /m).find((part) => part.includes(`Root: \`${client}/\``));
      expect(section, client).toBeDefined();
      for (const heading of ["### Install", "### Pin", "### Update", "### Roll back"]) {
        expect(section, `${client} ${heading}`).toContain(heading);
      }
      expect(section, client).toContain(`stamity-plugin-${client}-${VERSION}.zip`);
    }
    // The two bounds a mirror has to know, from the inbox rows this unit closes.
    expect(readme).toContain("https-only");
    expect(readme).toContain("The private mirror route");
  });
});

describe("a narrowed build", () => {
  let narrow: string;
  let narrowManifest: ReleaseManifest;

  beforeAll(() => {
    narrow = join(work, "dist-claude");
    const result = buildInto(narrow, ["--client", "claude", "--distribution-commit", DISTRIBUTION_COMMIT]);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    narrowManifest = readJson<ReleaseManifest>(join(narrow, "release.json"));
  }, ONE_ROOT_MS);

  it("records the distribution commit and adds it to the git-backed catalog entry", () => {
    expect(validateReleaseManifest(narrowManifest)).toEqual([]);
    expect(narrowManifest.distribution.commit).toBe(DISTRIBUTION_COMMIT);
    const entry = catalogOf(narrow, "claude").plugins[0];
    expect((entry?.source as CatalogEntrySource | undefined)?.sha).toBe(DISTRIBUTION_COMMIT);
  });

  it("leaves an excluded client without a catalog, a root, an archive or a manifest entry", () => {
    expect(narrowManifest.packages.map((entry) => entry.client)).toEqual(["claude"]);
    expect(Object.keys(narrowManifest.catalogs)).toEqual(["claude"]);
    for (const client of ["cursor", "copilot", "codex"] as const) {
      expect(existsSync(join(narrow, ...CATALOG_PATHS[client].split("/"))), client).toBe(false);
      expect(existsSync(join(narrow, client)), client).toBe(false);
      expect(existsSync(join(narrow, `stamity-plugin-${client}-${VERSION}.zip`)), client).toBe(false);
    }
  });
});

describe("the builder's refusals", () => {
  it("exits 2 on a bad argument and 2 on an output directory that already holds files", () => {
    expect(build(["--out", tempDir("empty"), "--runtime", RUNTIME, "--version", "not-a-version"]).status).toBe(2);
    expect(build(["--out", tempDir("empty"), "--runtime", RUNTIME, "--client", "eclipse"]).status).toBe(2);
    const occupied = tempDir("occupied");
    writeFileSync(join(occupied, "release.json"), "{}\n");
    const result = build(["--out", occupied, "--runtime", RUNTIME]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("already holds files");
  });

  it("exits 2 when the runtime is not a built runtime tree", () => {
    const bare = tempDir("bare-runtime");
    expect(build(["--out", tempDir("empty"), "--runtime", join(bare, "missing")]).status).toBe(2);
  });
});

/**
 * Opt-in: apm-cli is a Python package and nothing in this repository depends on it, so the suite
 * must stay green on a machine that has never installed it. CI arms this by putting an apm binary
 * on `STAMITY_APM_BIN`, exactly as the existing leg in `test/ci/apmInstall.test.ts` does.
 */
describe.skipIf(process.env["STAMITY_APM_BIN"] === undefined)(
  "the distribution tree as an APM source, against the client on STAMITY_APM_BIN",
  () => {
    it(
      "installs into a consumer and deploys every class for every target",
      () => {
        // `apm-install-smoke.mjs` exports a local source with `git ls-files`, so a tree that is
        // not a repository exports zero files. The distribution root is built, never committed,
        // so the leg initialises one over it — the same bytes, now listable.
        const init = spawnSync("git", ["init", "-q"], { cwd: dist, encoding: "utf8" });
        expect(init.status, init.stderr).toBe(0);
        const result = spawnSync(
          process.execPath,
          [
            join(REPO_ROOT, "scripts", "apm-install-smoke.mjs"),
            "--source",
            dist,
            "--targets",
            "claude,copilot,cursor,codex",
          ],
          { cwd: REPO_ROOT, encoding: "utf8", timeout: 900_000 },
        );
        expect(result.status, `${result.stdout ?? ""}\n${result.stderr ?? ""}`).toBe(0);
        expect(result.stdout).toContain("apm-install-smoke: PASS");
      },
      900_000,
    );
  },
);

// The temp tree outlives the suite deliberately when a case fails: `work` is under the OS temp
// directory and is swept by the platform, and a failing archive that has already been deleted is
// a failure nobody can look at. A passing run cleans up after itself.
process.on("exit", () => {
  if (process.exitCode === 0 || process.exitCode === undefined) rmSync(work, { recursive: true, force: true });
});
