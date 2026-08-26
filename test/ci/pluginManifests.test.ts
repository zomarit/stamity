import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { buildContentIndex } from "../../src/content/catalog.ts";
import { CONTENT_CLASSES, type ContentClass } from "../../src/types/content.ts";

/**
 * The drift gate on the four published plugin surfaces.
 *
 * A plugin manifest is a second copy of package.json's identity and a third
 * copy of where the corpus lives, and the predecessor project proved what that
 * costs when it is hand-kept: a plugin manifest at 2.8.6 beside a marketplace
 * manifest at 2.6.0, each advertising a different artifact count, with nothing
 * in CI able to say so. The generator projects every byte; this suite pins the
 * properties a regeneration could still get wrong.
 *
 * Four groups, each answering a different question:
 *
 *   the generator   deterministic (two runs, one byte sequence), `--check`
 *                   green on the committed bytes, and RED on a seeded change —
 *                   the last one is what makes the CI step a gate rather than
 *                   a command that always passes.
 *   shape           every file parses, and its bytes are exactly the
 *                   two-space, trailing-newline serialisation of what it
 *                   parses to. Key ORDER is part of that: re-serialising a
 *                   parse preserves insertion order, so a reordered emission
 *                   fails the byte-diff above rather than this assertion.
 *   identity        one plugin id and one version across all four surfaces,
 *                   and a version on every surface that carries one. "Never
 *                   omitted" is checked by counting, not by naming the fields:
 *                   the walk finds every `version` key at any depth, so a new
 *                   nested one joins the assertion on the commit that adds it.
 *   components      every declared component path names the directory it
 *                   points at, that directory holds artifacts the catalog
 *                   indexes, and every content class is addressed by at least
 *                   one surface. A fifth content class therefore fails here
 *                   instead of shipping a plugin that silently drops it.
 *
 * Component paths are found by SHAPE — a string value beginning with `./`, or
 * every such string inside an array value — rather than by a field list written
 * here. The three schemas name their component fields differently and only
 * Cursor's can address rules; a list would have to be edited on every schema
 * change and would go stale pointing at the fields it was written for.
 *
 * One field is asserted by NAME as well, because its shape is a security-
 * adjacent schema fact rather than a formatting choice: `agents` on both Claude
 * surfaces must be the agent FILE list, never a directory. The byte-diff above
 * cannot catch a wrong shape — it pins whatever was committed — so the schema
 * rule is restated as an assertion.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCRIPT_PATH = join(REPO_ROOT, "scripts/generate-plugin-manifests.mjs");

/** The committed surfaces, in the generator's emission order. */
const MANIFESTS: readonly string[] = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/plugin.json",
  // Agent Plugins 1.0.0 puts the manifest at the PLUGIN ROOT, not under a
  // dotted directory as the two vendor surfaces do. The repository root is the
  // plugin root, so this path is the spec's requirement, not a choice.
  "plugin.json",
];

/** The Agent Plugins container manifest, whose `$schema` is a schema-level const. */
const AGENT_PLUGINS_MANIFEST = "plugin.json";
const AGENT_PLUGINS_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const MARKETPLACE = ".claude-plugin/marketplace.json";
const CLAUDE_PLUGIN = ".claude-plugin/plugin.json";
const CURSOR_PLUGIN = ".cursor-plugin/plugin.json";

/** What the published tarball prefixes the corpus with; `files` ships `dist` alone. */
const TARBALL_PREFIX = "./dist/";

type Manifest = Record<string, unknown>;

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly keywords: readonly string[];
}

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8")) as PackageJson;

/** The plugin id every surface carries: the package name with its scope removed. */
const PLUGIN_NAME = pkg.name.replace(/^@[^/]+\//, "");

const readText = (base: string, relPath: string): string =>
  readFileSync(join(base, relPath), "utf-8");

const readManifest = (base: string, relPath: string): Manifest =>
  JSON.parse(readText(base, relPath)) as Manifest;

/** Every `version` value at any depth, so "never omitted" is counted, not named. */
function versionsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => versionsIn(entry));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Manifest).flatMap(([key, nested]) =>
    key === "version" && typeof nested === "string" ? [nested] : versionsIn(nested),
  );
}

/** A component path: the `./`-rooted spelling all three schemas require. */
const isComponentPath = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("./");

/**
 * The component paths one manifest declares: `[field, path]` for every string
 * value that begins with `./`, and one entry per element for an array value —
 * the shape `agents` takes on both Claude surfaces. The marketplace nests its
 * components inside the single plugin entry, which is why this reads the entry
 * rather than the root.
 */
function componentsOf(manifest: Manifest): [string, string][] {
  return Object.entries(manifest).flatMap(([field, value]): [string, string][] => {
    if (isComponentPath(value)) return [[field, value]];
    if (Array.isArray(value)) {
      return value.filter(isComponentPath).map((path): [string, string] => [field, path]);
    }
    return [];
  });
}

/** The same entries grouped by field, so an array-valued field keeps its order. */
function componentsByField(manifest: Manifest): Map<string, string[]> {
  const byField = new Map<string, string[]>();
  for (const [field, path] of componentsOf(manifest)) {
    const seen = byField.get(field);
    if (seen === undefined) byField.set(field, [path]);
    else seen.push(path);
  }
  return byField;
}

/**
 * `./content/skills/` -> `skills`, and `./content/agents/reviewer.md` ->
 * `agents`: a file names its class in the segment above it, which is the same
 * class the directory form names.
 */
function directoryOf(componentPath: string): string {
  const segments = componentPath.replace(/\/$/, "").split("/");
  const last = segments[segments.length - 1] ?? "";
  return last.includes(".") ? (segments[segments.length - 2] ?? "") : last;
}

/** `./content/skills/` -> `./content/` — the corpus root a manifest declares. */
function corpusRootOf(manifest: Manifest, label: string): string {
  const skills = manifest["skills"];
  expect(typeof skills, `${label} declares no skills path to root the agent list against`).toBe(
    "string",
  );
  return String(skills).replace(/skills\/$/, "");
}

/** The single marketplace entry — the whole plugin definition on the npm source. */
function marketplaceEntry(): Manifest {
  const plugins = readManifest(REPO_ROOT, MARKETPLACE)["plugins"];
  expect(Array.isArray(plugins), "marketplace.json declares no plugins array").toBe(true);
  const entries = plugins as Manifest[];
  expect(entries).toHaveLength(1);
  return entries[0] as Manifest;
}

/** Class -> the corpus directory the catalog walked it out of, and how many it found. */
async function corpusDirectories(): Promise<ReadonlyMap<ContentClass, { dir: string; count: number }>> {
  const index = await buildContentIndex();
  const found = new Map<ContentClass, { dir: string; count: number }>();
  for (const item of index.items) {
    const dir = item.relativePath.split("/")[0] ?? "";
    const seen = found.get(item.type);
    found.set(item.type, { dir: seen?.dir ?? dir, count: (seen?.count ?? 0) + 1 });
  }
  return found;
}

/** Class -> every corpus-relative artifact path, sorted as the generator emits them. */
async function corpusFiles(contentClass: ContentClass): Promise<string[]> {
  const index = await buildContentIndex();
  return index.items
    .filter((item) => item.type === contentClass)
    .map((item) => item.relativePath)
    .toSorted();
}

describe("scripts/generate-plugin-manifests.mjs", () => {
  const workspace = mkdtempSync(join(tmpdir(), "stamity-plugin-manifests-"));
  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const runInto = (dir: string): Map<string, string> => {
    execFileSync(process.execPath, [SCRIPT_PATH, "--out-dir", dir], { encoding: "utf-8" });
    return new Map(MANIFESTS.map((relPath) => [relPath, readText(dir, relPath)]));
  };

  it("writes every manifest, and a second run produces the same bytes", () => {
    const first = runInto(workspace);
    expect([...first.keys()]).toEqual([...MANIFESTS]);
    expect([...runInto(workspace)]).toEqual([...first]);
    // And those bytes are the committed ones: a generator that is deterministic
    // about the wrong output is still a stale tree.
    for (const relPath of MANIFESTS) {
      expect(first.get(relPath), `${relPath} is stale — regenerate it and commit the diff`).toBe(
        readText(REPO_ROOT, relPath),
      );
    }
  });

  it("passes --check against the committed manifests", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`${PLUGIN_NAME}@${pkg.version}`);
  });

  it("fails --check on a seeded change, naming the file and the repair", () => {
    // A copy, so the gate is proven against drift that the committed tree never
    // holds. Seeding the real files would leave the repository dirty if this
    // case failed part-way.
    const seeded = mkdtempSync(join(tmpdir(), "stamity-plugin-drift-"));
    try {
      for (const relPath of MANIFESTS) {
        cpSync(join(REPO_ROOT, relPath), join(seeded, relPath), { recursive: false });
      }
      const target = join(seeded, CURSOR_PLUGIN);
      const drifted = readManifest(seeded, CURSOR_PLUGIN);
      drifted["version"] = "0.0.0-drift";
      writeFileSync(target, `${JSON.stringify(drifted, null, 2)}\n`);

      const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check", "--out-dir", seeded], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(CURSOR_PLUGIN);
      expect(result.stderr).toContain("0.0.0-drift");
      expect(result.stderr).toContain("node scripts/generate-plugin-manifests.mjs");
    } finally {
      rmSync(seeded, { recursive: true, force: true });
    }
  });

  it("reports a missing manifest rather than treating absence as agreement", () => {
    const empty = mkdtempSync(join(tmpdir(), "stamity-plugin-absent-"));
    try {
      const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check", "--out-dir", empty], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      });
      expect(result.status).toBe(1);
      for (const relPath of MANIFESTS) expect(result.stderr).toContain(relPath);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("plugin manifest shape", () => {
  it("parses, and its bytes are the canonical serialisation of what it parses to", () => {
    for (const relPath of MANIFESTS) {
      const text = readText(REPO_ROOT, relPath);
      const parsed: unknown = JSON.parse(text);
      expect(`${JSON.stringify(parsed, null, 2)}\n`, `${relPath} is not canonically formatted`).toBe(
        text,
      );
    }
  });

  it("pins the Agent Plugins schema const, at the plugin root the spec requires", () => {
    // `$schema` is a const in the 1.0.0 schema and one of its two required
    // fields, so a paraphrase is a non-conforming manifest rather than a typo.
    const manifest = readManifest(REPO_ROOT, AGENT_PLUGINS_MANIFEST);
    expect(manifest["$schema"]).toBe(AGENT_PLUGINS_SCHEMA);
    expect(statSync(join(REPO_ROOT, AGENT_PLUGINS_MANIFEST)).isFile()).toBe(true);
  });

  it("claims no marketplace schema it cannot honour", () => {
    // The sibling schemastore URL the predecessor used for its marketplace file
    // returns 404 (checked 2026-08-26), and `$schema` is optional here. An
    // absent field is honest; one pointing at nothing is a validation claim
    // nothing can satisfy.
    expect(Object.keys(readManifest(REPO_ROOT, MARKETPLACE))).not.toContain("$schema");
  });
});

describe("plugin manifest identity", () => {
  it("names one plugin across every surface", () => {
    for (const relPath of MANIFESTS) {
      expect(readManifest(REPO_ROOT, relPath)["name"], relPath).toBe(PLUGIN_NAME);
    }
    expect(marketplaceEntry()["name"]).toBe(PLUGIN_NAME);
  });

  it("states the package version everywhere a version appears, and omits it nowhere", () => {
    for (const relPath of MANIFESTS) {
      const versions = versionsIn(readManifest(REPO_ROOT, relPath));
      expect(versions.length, `${relPath} carries no version`).toBeGreaterThan(0);
      for (const version of versions) expect(version, relPath).toBe(pkg.version);
    }
    // The marketplace holds three: the marketplace itself, the entry, and the
    // npm source pin. All three moving together is the drift the predecessor hit.
    expect(versionsIn(readManifest(REPO_ROOT, MARKETPLACE))).toHaveLength(3);
  });

  it("repeats package.json's description, license and keywords rather than re-wording them", () => {
    // The marketplace ROOT carries a name, an owner, a description, a version
    // and the entries; `license` and `keywords` are entry-level fields there.
    // So the identity bearers are the three plugin manifests plus the entry,
    // and the marketplace root is checked for the one field it does hold.
    const bearers: [string, Manifest][] = [
      ...[CLAUDE_PLUGIN, CURSOR_PLUGIN, AGENT_PLUGINS_MANIFEST].map(
        (relPath): [string, Manifest] => [relPath, readManifest(REPO_ROOT, relPath)],
      ),
      [`${MARKETPLACE} entry`, marketplaceEntry()],
    ];
    for (const [label, manifest] of bearers) {
      expect(manifest["description"], label).toBe(pkg.description);
      expect(manifest["license"], label).toBe(pkg.license);
      expect(manifest["keywords"], label).toEqual(pkg.keywords);
    }
    expect(readManifest(REPO_ROOT, MARKETPLACE)["description"]).toBe(pkg.description);
  });
});

describe("plugin manifest components", () => {
  it("declares only paths named after the corpus directory they point at", async () => {
    const corpus = await corpusDirectories();
    const directories = new Set([...corpus.values()].map((entry) => entry.dir));

    for (const relPath of [CLAUDE_PLUGIN, CURSOR_PLUGIN]) {
      const declared = componentsOf(readManifest(REPO_ROOT, relPath));
      expect(declared.length, `${relPath} declares no components`).toBeGreaterThan(0);
      for (const [field, path] of declared) {
        const dir = directoryOf(path);
        expect(field, `${relPath}: field ${field} points at ${path}`).toBe(dir);
        expect(directories.has(dir), `${relPath}: ${path} is not a corpus directory`).toBe(true);
        // A directory path must be a directory and a file path a file. Both
        // shapes are declared here — `agents` is a file list — so resolving
        // both against the tree is what proves neither is a path that names
        // nothing.
        const target = statSync(join(REPO_ROOT, path));
        expect(
          path.endsWith("/") ? target.isDirectory() : target.isFile(),
          `${relPath}: ${path} does not resolve to the kind of node its shape claims`,
        ).toBe(true);
      }
    }
  });

  it("points every declared class at a directory the catalog indexes artifacts in", async () => {
    const corpus = await corpusDirectories();
    const byDirectory = new Map(
      [...corpus.values()].map((entry) => [entry.dir, entry.count] as const),
    );
    for (const relPath of [CLAUDE_PLUGIN, CURSOR_PLUGIN]) {
      for (const [, path] of componentsOf(readManifest(REPO_ROOT, relPath))) {
        expect(byDirectory.get(directoryOf(path)) ?? 0, `${relPath}: ${path}`).toBeGreaterThan(0);
      }
    }
  });

  it("addresses every content class on at least one surface", async () => {
    const corpus = await corpusDirectories();
    const addressed = new Set(
      [CLAUDE_PLUGIN, CURSOR_PLUGIN, MARKETPLACE].flatMap((relPath) =>
        componentsOf(relPath === MARKETPLACE ? marketplaceEntry() : readManifest(REPO_ROOT, relPath))
          .map(([, path]) => directoryOf(path)),
      ),
    );
    for (const contentClass of CONTENT_CLASSES) {
      const dir = corpus.get(contentClass)?.dir;
      expect(dir, `the corpus indexes no ${contentClass}`).toBeDefined();
      expect(
        addressed.has(dir as string),
        `no plugin surface addresses ${contentClass} (${String(dir)}/) — a content class the ` +
          "corpus ships and every plugin drops is a surface nobody chose",
      ).toBe(true);
    }
  });

  it("declares agents as the .md file list the Claude schemas require, never a directory", async () => {
    // The one component field whose SHAPE is load-bearing. The schemastore
    // schema `.claude-plugin/plugin.json` names in its own `$schema` constrains
    // an `agents` string — alone or inside the array — to BOTH `^\./.*` and
    // `.*\.md$`, and both Claude doc pages call the field "agent files"
    // (code.claude.com/docs/en/plugins-reference and
    // .../plugin-marketplaces, accessed 2026-08-26). A directory value makes
    // the manifest fail the schema it declares, and the byte-diff above cannot
    // notice: it pins whatever was committed, wrong shape included.
    const agents = await corpusFiles("agent");
    expect(agents.length, "the corpus indexes no agents").toBeGreaterThan(0);

    const surfaces: [string, Manifest][] = [
      [CLAUDE_PLUGIN, readManifest(REPO_ROOT, CLAUDE_PLUGIN)],
      [`${MARKETPLACE} entry`, marketplaceEntry()],
    ];
    for (const [label, manifest] of surfaces) {
      const declared = manifest["agents"];
      expect(Array.isArray(declared), `${label} declares agents as ${typeof declared}`).toBe(true);
      for (const path of declared as unknown[]) {
        expect(typeof path, label).toBe("string");
        expect(String(path), `${label}: ${String(path)}`).toMatch(/^\.\//);
        expect(String(path), `${label}: ${String(path)}`).toMatch(/\.md$/);
      }
      // Rooted at the manifest's own corpus prefix, so the checkout surface and
      // the `dist/`-prefixed marketplace entry are both checked against the one
      // catalog walk rather than against a path spelled twice in this file.
      const root = corpusRootOf(manifest, label);
      expect(declared, label).toEqual(agents.map((relativePath) => `${root}${relativePath}`));
    }
  });

  it("keeps rules on the surface whose schema can carry them", () => {
    // Neither Claude Code schema has a `rules` field; Cursor's does. Stated as
    // an assertion so adding `rules` to a Claude surface has to be a deliberate
    // edit here, backed by a schema that grew the field.
    expect(Object.keys(readManifest(REPO_ROOT, CURSOR_PLUGIN))).toContain("rules");
    expect(Object.keys(readManifest(REPO_ROOT, CLAUDE_PLUGIN))).not.toContain("rules");
    expect(Object.keys(marketplaceEntry())).not.toContain("rules");
  });

  it("pins the marketplace to the npm source form, resolved against the package root", () => {
    const entry = marketplaceEntry();
    expect(entry["source"]).toEqual({
      source: "npm",
      package: pkg.name,
      version: pkg.version,
    });

    // The published tarball is a different tree from this checkout: `files`
    // ships `dist` alone, so the corpus lands at `dist/content/`. An npm source
    // resolves component paths against the package root, which is why these
    // paths carry a prefix the checkout-rooted manifests must not.
    const checkout = componentsByField(readManifest(REPO_ROOT, CLAUDE_PLUGIN));
    const published = componentsByField(entry);
    expect([...published.keys()]).toEqual([...checkout.keys()]);
    for (const [field, paths] of published) {
      for (const path of paths) {
        expect(path.startsWith(TARBALL_PREFIX), `${field} -> ${path}`).toBe(true);
      }
      // Element-wise, so the agent FILE list is proven to name the same
      // artifacts in the same order on both trees rather than merely to be the
      // same length.
      expect(paths, field).toEqual(
        (checkout.get(field) ?? []).map((path) => `${TARBALL_PREFIX}${path.replace(/^\.\//, "")}`),
      );
    }
  });
});
