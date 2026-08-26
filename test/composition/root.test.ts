import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import * as publicApi from "../../src/index.ts";
import type {
  EmissionOwner,
  ImportDecision,
  ModelConfig,
  EffortLevel,
  ImportMode,
  ModelClass,
} from "../../src/index.ts";
import { createApp, createEngine, VERSION } from "../../src/composition/root.ts";

/**
 * The registry's expected shape is DERIVED from the tree, not declared here.
 *
 * The previous version of this file carried a hand-written ledger of every
 * group and leaf plus a literal leaf count, and certified a completeness claim
 * it could not check: eight engine modules were on disk, reachable from the
 * CLI, and absent from both the registry and the ledger, while the count the
 * ledger asserted had drifted from its own arithmetic. A ledger that is edited
 * to match whatever the registry currently holds proves the two were edited
 * together and nothing more.
 *
 * So the expectation is computed: walk `src/`, subtract {@link EXCLUSIONS},
 * and require a registry entry per surviving module. A new engine module fails
 * this file until it is wired or excluded — and an exclusion is a visible edit
 * with a stated reason, which a silent absence never was.
 *
 * Registry membership is not a call site. `test/architecture/boundaries.test.ts`
 * is where a module that only the registry reaches gets named.
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC_ROOT = path.join(REPO_ROOT, "src");

/**
 * Files the registry is not expected to hold. Short by design: every entry
 * carries the reason it is not an engine module, because a long or unexplained
 * list degrades the derived check back into the hand-kept ledger it replaces.
 */
const EXCLUSIONS: readonly { readonly match: (file: string) => boolean; readonly why: string }[] = [
  {
    match: (file) => file === "src/index.ts" || file === "src/cli.ts",
    why: "the two program entrypoints — they import the registry rather than appearing in it",
  },
  {
    match: (file) => file === "src/composition/root.ts",
    why: "the registry itself — it cannot compose a namespace import of its own module",
  },
  {
    match: (file) => file.startsWith("src/cli/"),
    why: "the CLI layer, composed by src/cli.ts; the engine never reaches it (boundary rule 4)",
  },
  {
    match: (file) => file.startsWith("src/migration/"),
    why: "migration detection, on the CLI lane and reached only from it",
  },
  {
    match: (file) => file.startsWith("src/shared/"),
    why: "kernel utilities each consumer imports directly; they carry no feature surface to compose",
  },
  {
    match: (file) => file.startsWith("src/types/"),
    why: "the declared vocabulary leaf — it imports nothing internal (boundary rule 2)",
  },
];

/**
 * Registry keys that do not follow `<directory>.<basename>`. One entry, and it
 * exists because the group is a single module rather than a family.
 */
const KEY_OVERRIDES: Readonly<Record<string, string>> = {
  "src/denyscan/denyScan.ts": "denyscan",
};

/** Every `.ts` file under `src/`, repo-relative and POSIX-addressed. */
function walkSource(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSource(absolute, out);
    else if (entry.name.endsWith(".ts")) {
      out.push(path.relative(REPO_ROOT, absolute).split(path.sep).join("/"));
    }
  }
  return out;
}

/** The registry key a module file is expected to occupy. */
function keyFor(file: string): string {
  const override = KEY_OVERRIDES[file];
  if (override !== undefined) return override;
  const segments = file.split("/");
  const group = segments.at(-2) ?? "";
  const base = (segments.at(-1) ?? "").replace(/\.ts$/, "");
  return `${group}.${base}`;
}

/** Flattened registry: `group.leaf` (or `group` for a module-valued group). */
function registryKeys(engine: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const [group, value] of Object.entries(engine)) {
    const record = value as Record<string, unknown>;
    // A module namespace has function/const exports; a feature group holds
    // module namespaces. The discriminator is whether every value is itself a
    // namespace-shaped object, which no engine module's export set is.
    const members = Object.values(record);
    const isGroup =
      members.length > 0 &&
      members.every((member) => typeof member === "object" && member !== null && !Array.isArray(member));
    if (!isGroup) {
      keys.push(group);
      continue;
    }
    for (const leaf of Object.keys(record)) keys.push(`${group}.${leaf}`);
  }
  return keys.toSorted();
}

/** Modules with at least one runtime export — the shape a registry entry needs. */
async function hasRuntimeExports(file: string): Promise<boolean> {
  const namespace = (await import(pathToFileURL(path.join(REPO_ROOT, file)).href)) as Record<
    string,
    unknown
  >;
  return Object.keys(namespace).filter((name) => name !== "default").length > 0;
}

/** A wired leaf must be a non-empty module namespace with no undefined export. */
function expectModuleNamespace(value: unknown, at: string): void {
  expect(value, `${at} is not wired`).toBeDefined();
  expect(typeof value, `${at} is not a module namespace`).toBe("object");
  expect(value, `${at} is not a module namespace`).not.toBeNull();
  const namespace = value as Record<string, unknown>;
  const exportNames = Object.keys(namespace);
  expect(exportNames.length, `${at} has no runtime exports`).toBeGreaterThan(0);
  for (const name of exportNames) {
    expect(namespace[name], `${at}.${name} is undefined`).toBeDefined();
  }
}

describe("createEngine", () => {
  it("holds an entry for every engine module on disk, derived from the tree", async () => {
    const candidates = walkSource(SRC_ROOT).filter(
      (file) => !EXCLUSIONS.some((exclusion) => exclusion.match(file)),
    );
    // Exclude by SHAPE, not by name: a module with no runtime exports is a pure
    // type module, and there is nothing for the registry to hold. Checked by
    // importing it rather than by pattern-matching its path, so a type-only
    // module anywhere in the tree is handled without a new exclusion row.
    const shapes = await Promise.all(candidates.map(hasRuntimeExports));
    const runtimeModules = candidates.filter((_, index) => shapes[index] === true);

    const expected = runtimeModules.map(keyFor).toSorted();
    const actual = registryKeys({ ...createEngine() });

    expect(
      expected.filter((key) => !actual.includes(key)),
      "on disk under src/ and missing from the composition root. Wire it, or add an " +
        "EXCLUSIONS row saying why it is not an engine module.",
    ).toEqual([]);
    expect(
      actual.filter((key) => !expected.includes(key)),
      "wired in the composition root with no module file behind it (renamed, deleted, or " +
        "keyed off <directory>.<basename> without a KEY_OVERRIDES row).",
    ).toEqual([]);
  });

  it("drops a pure type module by shape, and keeps a module that exports a value", async () => {
    // Guard on the shape filter: it must answer differently for the two, or the
    // derived check above either demands type files or excuses real modules.
    expect(await hasRuntimeExports("src/types/detect.ts")).toBe(false);
    expect(await hasRuntimeExports("src/types/core.ts")).toBe(true);
    expect(await hasRuntimeExports("src/content/catalog.ts")).toBe(true);
  });

  it("names a reason for every exclusion, and excludes nothing else", () => {
    for (const exclusion of EXCLUSIONS) {
      expect(exclusion.why.trim().length, "an exclusion with no stated reason is a silent absence")
        .toBeGreaterThan(20);
    }
    // The list is the whole escape hatch: a file that is neither excluded nor
    // wired has nowhere to hide, which is the property the previous hand-kept
    // ledger could not offer.
    const excluded = walkSource(SRC_ROOT).filter((file) =>
      EXCLUSIONS.some((exclusion) => exclusion.match(file)),
    );
    expect(excluded).toContain("src/composition/root.ts");
    expect(excluded).not.toContain("src/pack/install.ts");
    expect(excluded).not.toContain("src/emit/planner.ts");
  });

  it("wires every leaf to a non-empty module namespace, no undefined anywhere", () => {
    const engine: Record<string, unknown> = { ...createEngine() };
    for (const key of registryKeys(engine)) {
      const [group, leaf] = key.split(".");
      const groupValue = engine[group ?? ""];
      expect(groupValue, `group ${String(group)} is not wired`).toBeDefined();
      const target =
        leaf === undefined ? groupValue : (groupValue as Record<string, unknown>)[leaf];
      expectModuleNamespace(target, key);
    }
  });

  it("returns a fresh frozen registry per call, over the same module namespaces", () => {
    const first = createEngine();
    const second = createEngine();
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.denyscan).toBe(second.denyscan);
    expect(first.merge.safeWrite).toBe(second.merge.safeWrite);
    expect(first.config.parse).toBe(second.config.parse);
  });

  it("wires real module exports, spot-checked by name", () => {
    const engine = createEngine();
    expect(typeof engine.denyscan.scanForDeniedPatterns).toBe("function");
    expect(typeof engine.config.parse.parseJsonStrict).toBe("function");
    expect(engine.merge.safeWrite).not.toBe(engine.merge.atomicWrite);
  });

  it("carries the whole pack lane, not the two leaves it used to name", () => {
    // The concrete regression the derived check found: the CLI reached eight
    // pack modules by its own import path while the registry named two, so the
    // composition root's completeness claim was false by exactly those eight.
    const pack = createEngine().pack;
    expect(Object.keys(pack).toSorted()).toEqual([
      "catalogPins",
      "curated",
      "install",
      "manifest",
      "orgPolicy",
      "permissions",
      "projection",
      "receipt",
      "trust",
      "verifyInstalled",
    ]);
  });
});

describe("public entry", () => {
  it("re-exports the composition root, not a copy", () => {
    expect(publicApi.createEngine).toBe(createEngine);
    expect(publicApi.createApp).toBe(createApp);
    expect(publicApi.VERSION).toBe(VERSION);
  });

  it("keeps the error contract and core vocabulary on the public surface", () => {
    expect(typeof publicApi.EngineError).toBe("function");
    // No exit-code translator: the classification is `error.code`, and the
    // retired sysexits mapping must not linger as public API.
    expect(Object.keys(publicApi)).not.toContain("exitCodeFor");
    expect(Object.keys(publicApi)).not.toContain("ERROR_CODE_TO_EXIT_CODE");
    // No confidence-floor dial either: the review-loop gate is fixed in the
    // emitted review-gate hook, so re-exporting a settable floor would publish
    // a knob the engine does not honour (closed by removal).
    expect(Object.keys(publicApi).filter((name) => name.includes("CONFIDENCE"))).toEqual([]);
    expect(publicApi.TOOLS.length).toBeGreaterThan(0);
    expect(publicApi.CONTENT_CLASSES.length).toBeGreaterThan(0);
    expect(publicApi.STATE_DIR.startsWith(".")).toBe(true);
  });

  it("ships every closed enum as its full trio, membership set included", () => {
    // Three trios were reachable from exported manifest types while unexported
    // themselves, so a consumer could name a `ModelConfig` and then have no way
    // to narrow a string to the `ModelClass` inside it.
    const trios = [
      [publicApi.TOOLS, publicApi.VALID_TOOLS],
      [publicApi.MATURITY_TIERS, publicApi.VALID_MATURITY_TIERS],
      [publicApi.COMMUNICATION_STYLES, publicApi.VALID_COMMUNICATION_STYLES],
      [publicApi.IMPORT_MODES, publicApi.VALID_IMPORT_MODES],
      [publicApi.MODEL_CLASSES, publicApi.VALID_MODEL_CLASSES],
      [publicApi.EFFORT_LEVELS, publicApi.VALID_EFFORT_LEVELS],
    ] as const;

    for (const [members, valid] of trios) {
      expect(members.length).toBeGreaterThan(0);
      expect([...valid].toSorted()).toEqual([...members].toSorted());
    }
    expect(publicApi.DEFAULT_IMPORT_MODE).toBe("supplement");
  });

  it("names every type reachable from an exported type", () => {
    // A compile-time assertion: these six were reachable from `SetupManifest`,
    // `AdapterOutput` and the core enums while unexported, so this file would
    // not have typechecked before they were named. The runtime half only proves
    // the values line up with the types.
    const owner: EmissionOwner = { adapter: "claude", artifactType: "infra", artifactId: "charter" };
    const models: ModelConfig = { pins: { frontier: "vendor-x-1" } };
    const mode: ImportMode = "supplement";
    const choice: ImportDecision = { path: "AGENTS.md", mode };
    const modelClass: ModelClass = "frontier";
    const effort: EffortLevel = "high";

    expect(owner.adapter).toBe("claude");
    expect(models.pins?.frontier).toBe("vendor-x-1");
    expect(choice.mode).toBe(mode);
    expect(publicApi.VALID_MODEL_CLASSES.has(modelClass)).toBe(true);
    expect(publicApi.VALID_EFFORT_LEVELS.has(effort)).toBe(true);
  });
});

describe("createApp (ported shell)", () => {
  it("keeps the version and live-process defaults intact after the move", () => {
    const app = createApp();
    expect(app.version).toBe(VERSION);
    expect(app.runtime.cwd).toBe(process.cwd());
    expect(app.runtime.env).toBe(process.env);
  });
});
