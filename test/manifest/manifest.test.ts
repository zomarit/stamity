import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_MIGRATIONS,
  applyPreservedManifestFields,
  collectManifestErrors,
  communicationStyleDirective,
  createManifest,
  extractPreservedManifestFields,
  manifestPath,
  maturityDirective,
  migrateManifest,
  readCommunicationStyle,
  readManifest,
  readMaturityTier,
  readReviewCap,
  validateManifest,
  writeManifest,
  type CreateManifestOptions,
} from "../../src/manifest/manifest.ts";
import { REPO_SUBSTITUTION_TOKENS } from "../../src/emit/substitution.ts";
import {
  DEFAULT_MAX_REVIEW_ITERATIONS,
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
} from "../../src/roster/reviewCaps.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../src/types/content.ts";
import * as core from "../../src/types/core.ts";
import {
  COMMUNICATION_STYLES,
  MATURITY_TIERS,
  TOOLS,
  type Tool,
} from "../../src/types/core.ts";
import { EngineError, type ErrorCode } from "../../src/types/errors.ts";
import { MANIFEST_VERSION, type SetupManifest } from "../../src/types/manifest.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The pure half (validation, migration, create, preserved fields, directives)
 * runs on data alone. The IO half uses real temp directories rather than the
 * virtual-fs lane: the writer's guarantees are the write lock, temp+rename, and
 * parent-directory creation — semantics memfs does not model.
 */
const getRoot = useTempDir("manifest");

/** Fixed clock for every timestamp assertion; no test reads the wall clock. */
const FIXED_NOW = new Date("2026-08-13T09:15:00.000Z");
const LATER = new Date("2026-08-14T10:00:00.000Z");

const SELECTION: ContentSelection = {
  items: { agent: ["reviewer", "implementer"], skill: ["handoff"], rule: ["security"], command: [] },
};

function createOptions(overrides: Partial<CreateManifestOptions> = {}): CreateManifestOptions {
  // Deep-copied per call: the aliasing tests below mutate what they pass in, and
  // a shared fixture object would leak that mutation into every later test.
  return {
    tools: ["claude", "cursor"],
    platform: "github",
    selection: structuredClone(SELECTION),
    maturityTier: "scaleup",
    mcp: { servers: ["github"], protocolVersion: "2025-06-18" },
    detected: {
      languages: ["typescript"],
      linters: ["oxlint"],
      testFrameworks: ["vitest"],
      ciProviders: ["github-actions"],
    },
    now: FIXED_NOW,
    generatorVersion: "1.4.2",
    ...overrides,
  };
}

function fullManifest(): SetupManifest {
  return {
    ...createManifest(createOptions()),
    communicationStyle: "technical",
    learnings: { maxCount: 40 },
    hooks: { userHooksDir: ".stamity/hooks" },
    toolOptions: { claude: { plugin: true, nested: { b: 1, a: 2 } } },
    ledger: [
      {
        path: ".claude/agents/reviewer.md",
        adapter: "claude",
        artifactId: "reviewer",
        artifactType: "agent",
        contentHash: "abc123",
        stampedVersion: "1.4.2",
      },
      {
        path: ".cursor/rules/30-security.mdc",
        adapter: "cursor",
        artifactId: "security",
        artifactType: "rule",
      },
      { path: ".mcp.json", adapter: "claude", artifactId: "mcp-config", artifactType: "infra" },
    ],
  };
}

/** The typed-rejection assertion: classified throw, returned for message checks. */
async function rejects(run: () => Promise<unknown>, code: ErrorCode): Promise<EngineError> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(EngineError);
  const error = caught as EngineError;
  expect(error.code).toBe(code);
  return error;
}

async function seedManifest(root: string, raw: string): Promise<string> {
  const path = manifestPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, raw, "utf8");
  return path;
}

describe("createManifest", () => {
  it("stamps the current generation with an empty ledger and an injected clock", () => {
    const manifest = createManifest(createOptions());

    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.generatedBy).toBe("1.4.2");
    expect(manifest.createdAt).toBe(FIXED_NOW.toISOString());
    expect(manifest.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(manifest.ledger).toEqual([]);
    expect(validateManifest(manifest)).toBe(true);
  });

  it("omits absent optionals instead of writing undefined keys", () => {
    const manifest = createManifest({
      tools: ["codex"],
      selection: SELECTION,
      generatorVersion: "1.0.0",
      now: FIXED_NOW,
    });

    expect(Object.keys(manifest)).toEqual([
      "version",
      "generatedBy",
      "createdAt",
      "updatedAt",
      "tools",
      "selection",
      "ledger",
    ]);
  });

  it("shares no reference with its inputs", () => {
    const options = createOptions();
    const manifest = createManifest(options);

    options.selection.items.agent.push("late-addition");
    options.tools.push("copilot");

    expect(manifest.selection.items.agent).toEqual(["reviewer", "implementer"]);
    expect(manifest.tools).toEqual(["claude", "cursor"]);
  });
});

describe("collectManifestErrors", () => {
  it("accepts a fully populated manifest", () => {
    expect(collectManifestErrors(fullManifest())).toEqual([]);
  });

  it("names every defect in one pass", () => {
    const defective = {
      ...fullManifest(),
      version: "not-a-version",
      tools: ["claude", "emacs"],
      ledger: [{ path: "/etc/passwd", adapter: "claude", artifactId: "x", artifactType: "agent" }],
      ledgar: [],
    };

    const errors = collectManifestErrors(defective);

    expect(errors).toHaveLength(4);
    expect(errors.join(" | ")).toContain("`version`");
    expect(errors.join(" | ")).toContain('"emacs"');
    expect(errors.join(" | ")).toContain("is an absolute path");
    expect(errors.join(" | ")).toContain("unknown field `ledgar`");
  });

  it("refuses a dot-slash spelling so one file cannot have two ledger identities", () => {
    // `./AGENTS.md` and `AGENTS.md` address one file and are two STRINGS, and
    // the ledger is keyed by string: a row written under one spelling was
    // queued for reclaim while the sweep's trusted-infra allowlist held the
    // other, so a path the engine still emits could be proposed for deletion.
    // Refused by shape at the persistence boundary — one identity, one place.
    for (const path of ["./AGENTS.md", ".claude/./agents/x.md", "docs/./a.md", "."]) {
      const errors = collectManifestErrors({
        ...fullManifest(),
        ledger: [{ path, adapter: "claude", artifactId: "x", artifactType: "agent" }],
      });

      expect(errors, `path ${JSON.stringify(path)} must be refused`).toHaveLength(1);
      expect(errors[0]).toContain("`.` segment");
      expect(errors[0]).toContain("drop the `./`");
    }

    // A dot INSIDE a segment is a filename, not a traversal step.
    expect(
      collectManifestErrors({
        ...fullManifest(),
        ledger: [
          { path: ".claude/agents/x.md", adapter: "claude", artifactId: "x", artifactType: "agent" },
        ],
      }),
    ).toEqual([]);
  });

  it("flags a ledger path that escapes the repo root, in every spelling", () => {
    for (const path of ["/abs/file.md", "C:/win/file.md", "..\\..\\escape.md", "a/../../b.md", ""]) {
      const manifest = {
        ...fullManifest(),
        ledger: [{ path, adapter: "claude", artifactId: "x", artifactType: "agent" }],
      };
      const errors = collectManifestErrors(manifest);
      expect(errors, `path ${JSON.stringify(path)} must be refused`).toHaveLength(1);
      expect(errors[0]).toContain("`ledger[0].path`");
    }
  });

  it("accepts a pack owner and refuses one carrying no pack id", () => {
    const row = { path: ".stamity/packs/ops/agents/reviewer.md", artifactType: "infra" as const };

    expect(
      collectManifestErrors({
        ...fullManifest(),
        ledger: [{ ...row, adapter: "pack:@acme/ops", artifactId: "@acme/ops/agents/reviewer.md" }],
      }),
    ).toEqual([]);

    const errors = collectManifestErrors({
      ...fullManifest(),
      ledger: [{ ...row, adapter: "pack:", artifactId: "x" }],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("no pack id");
  });

  it("refuses two ledger rows claiming one path FOR THE SAME OWNER", () => {
    // RE-TITLED from "refuses two ledger rows claiming one path": the code
    // enforces uniqueness per (adapter, path) pair, not per path, and the wider
    // title would have stayed green if someone tightened the key back to the
    // path alone — silently breaking every co-owned row the composer writes.
    const row = { adapter: "claude" as Tool, artifactId: "x", artifactType: "agent" as const };
    const manifest = {
      ...fullManifest(),
      ledger: [
        { path: "AGENTS.md", ...row },
        { path: "AGENTS.md", ...row, artifactId: "y" },
      ],
    };

    expect(collectManifestErrors(manifest)).toEqual([
      expect.stringContaining("both claim") as unknown as string,
    ]);
  });

  it("accepts one path co-owned by two different adapters", () => {
    // The shape the engine writes BY DESIGN: a shared `AGENTS.md` carries a row
    // per selected tool, and the file is only reclaimable once every owner has
    // stopped emitting it. The collector had no positive case for it, so the
    // pair key was asserted from the failure side only.
    const row = { artifactId: "charter", artifactType: "infra" as const };

    expect(
      collectManifestErrors({
        ...fullManifest(),
        ledger: [
          { path: "AGENTS.md", adapter: "claude", ...row },
          { path: "AGENTS.md", adapter: "codex", ...row },
          { path: "AGENTS.md", adapter: "pack:@acme/ops", ...row },
        ],
      }),
    ).toEqual([]);
  });

  it("validates all six detected fields, including the two the gate resolver reads", () => {
    // `packageManager` and `packageScripts` were the two fields this collector
    // skipped and the two the gate resolver consumes: a hand-edited or
    // migration-sourced manifest carrying `packageScripts: "test"` passed
    // validation and then threw a raw TypeError out of emission, with no what,
    // no why and no next.
    const detectedWith = (over: Record<string, unknown>): unknown => ({
      ...fullManifest(),
      detected: {
        languages: ["typescript"],
        linters: [],
        testFrameworks: [],
        ciProviders: [],
        ...over,
      },
    });

    expect(collectManifestErrors(detectedWith({ packageScripts: "test" }))).toEqual([
      "`detected.packageScripts` must be an array of strings",
    ]);
    expect(collectManifestErrors(detectedWith({ packageScripts: ["ok", 7] }))).toHaveLength(1);
    expect(collectManifestErrors(detectedWith({ packageManager: 7 }))).toEqual([
      "`detected.packageManager` must be a non-empty package-manager name",
    ]);
    expect(collectManifestErrors(detectedWith({ packageManager: "" }))).toHaveLength(1);

    // Both present and well-formed is the shape detection actually writes.
    expect(
      collectManifestErrors(detectedWith({ packageManager: "pnpm", packageScripts: ["test"] })),
    ).toEqual([]);
  });

  it("names an unknown field inside the detected block instead of carrying it", () => {
    // A typo'd `testFramework` accepted silently reads as "no test frameworks
    // detected" and quietly changes what the emitted charter states as fact.
    const errors = collectManifestErrors({
      ...fullManifest(),
      detected: {
        languages: [],
        linters: [],
        testFrameworks: [],
        ciProviders: [],
        testFramework: ["vitest"],
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unknown field `detected.testFramework`");
    expect(errors[0]).toContain("testFrameworks");
  });

  it("requires the whole selection map and rejects a class it does not know", () => {
    const errors = collectManifestErrors({
      ...fullManifest(),
      selection: { items: { agent: ["a"], skill: [], rule: [], prompt: [] } },
    });

    expect(errors).toContain("`selection.items.command` must be an array of strings");
    expect(errors.some((entry) => entry.includes("`selection.items.prompt`"))).toBe(true);
  });

  it("rejects a manifest with no target tool", () => {
    expect(collectManifestErrors({ ...fullManifest(), tools: [] })).toEqual([
      "`tools` must name at least one target tool",
    ]);
  });

  it("rejects an out-of-enum scalar dial", () => {
    const errors = collectManifestErrors({
      ...fullManifest(),
      maturityTier: "startup",
      communicationStyle: "brusque",
    });

    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("`maturityTier`");
    expect(errors[1]).toContain("`communicationStyle`");
  });

  it("rejects a root that is not an object", () => {
    for (const value of [null, [], "manifest", 7]) {
      expect(collectManifestErrors(value)).toHaveLength(1);
    }
  });

  it("agrees with validateManifest on every fixture", () => {
    for (const fixture of [fullManifest(), { ...fullManifest(), tools: [] }, null]) {
      expect(validateManifest(fixture)).toBe(collectManifestErrors(fixture).length === 0);
    }
  });

  it("accepts a fully populated `models` block", () => {
    const errors = collectManifestErrors({
      ...fullManifest(),
      models: {
        pins: { frontier: "vendor-x-1", advanced: "vendor-x-1[effort=high]" },
        effort: { standard: "medium", economy: "low" },
        reviewCap: 6,
      },
    });

    expect(errors).toEqual([]);
  });

  it("refuses a pins or effort key that is not a model class, naming the four", () => {
    const errors = collectManifestErrors({
      ...fullManifest(),
      models: { pins: { turbo: "x" }, effort: { cheap: "low" } },
    });

    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("`models.pins.turbo`");
    expect(errors[0]).toContain("frontier, advanced, standard, economy");
    expect(errors[1]).toContain("`models.effort.cheap`");
  });

  it("validates a pin by shape only — empty, blank, multi-line and non-string are out", () => {
    for (const pin of ["", "   ", "vendor\nx", "vendor\r\nx", 7, null]) {
      const errors = collectManifestErrors({
        ...fullManifest(),
        models: { pins: { standard: pin } },
      });
      expect(errors, `pin ${JSON.stringify(pin)} must be refused`).toHaveLength(1);
      expect(errors[0]).toContain("`models.pins.standard`");
    }
  });

  it("passes an unverifiable vendor id through — shape is all this engine can check", () => {
    // The point of the shape-only rule: no catalogue exists to reject this
    // against, so refusing it would be a guarantee the engine cannot keep.
    expect(
      collectManifestErrors({
        ...fullManifest(),
        models: { pins: { frontier: "some-vendor/model-nobody-has-heard-of@2031" } },
      }),
    ).toEqual([]);
  });

  it("refuses an effort level outside the three the clients share", () => {
    const errors = collectManifestErrors({
      ...fullManifest(),
      models: { effort: { advanced: "maximum" } },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("low | medium | high");
  });

  it("refuses a listed effort class carrying no level, rather than reading it as unset", () => {
    const errors = collectManifestErrors({
      ...fullManifest(),
      models: { effort: { advanced: undefined } },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("drop the class");
  });

  it("refuses a review cap outside the band, fractional, or not a number", () => {
    for (const reviewCap of [
      MIN_MAX_REVIEW_ITERATIONS - 1,
      HARD_MAX_REVIEW_ITERATIONS + 1,
      4.5,
      Number.NaN,
      "4",
    ]) {
      const errors = collectManifestErrors({ ...fullManifest(), models: { reviewCap } });
      expect(errors, `cap ${JSON.stringify(reviewCap)} must be refused`).toHaveLength(1);
      expect(errors[0]).toContain(
        `${MIN_MAX_REVIEW_ITERATIONS}..${HARD_MAX_REVIEW_ITERATIONS}`,
      );
    }
  });

  it("accepts every whole cap inside the band", () => {
    for (let cap = MIN_MAX_REVIEW_ITERATIONS; cap <= HARD_MAX_REVIEW_ITERATIONS; cap += 1) {
      expect(collectManifestErrors({ ...fullManifest(), models: { reviewCap: cap } })).toEqual([]);
    }
  });

  it("names a stray field under `models` and a `models` that is not an object", () => {
    expect(
      collectManifestErrors({ ...fullManifest(), models: { pins: {}, ladder: "custom" } }),
    ).toEqual(["unknown field `models.ladder`"]);

    for (const models of ["frontier", 3, null, []]) {
      expect(collectManifestErrors({ ...fullManifest(), models })).toEqual([
        "`models` must be an object",
      ]);
    }
  });

  it("names a pins or effort map that is not an object", () => {
    const errors = collectManifestErrors({
      ...fullManifest(),
      models: { pins: "opus", effort: ["high"] },
    });

    expect(errors).toEqual([
      "`models.pins` must be an object keyed by model class",
      "`models.effort` must be an object keyed by model class",
    ]);
  });
});

describe("migrateManifest", () => {
  it("ships no steps at generation 1", () => {
    expect(MANIFEST_MIGRATIONS).toEqual([]);
  });

  it("is identity on a current-generation document and never mutates the input", () => {
    const manifest = fullManifest();
    const raw = structuredClone(manifest) as unknown as Record<string, unknown>;

    const migrated = migrateManifest(raw);

    expect(migrated).toEqual(manifest);
    expect(migrated).not.toBe(raw);
    expect(raw).toEqual(manifest as unknown as Record<string, unknown>);
  });
});

describe("readManifest / writeManifest", () => {
  it("round-trips create -> write -> read deep-equal, ledger and detection included", async () => {
    const root = getRoot().dir;
    const manifest = fullManifest();

    await writeManifest(root, manifest, { now: FIXED_NOW });

    expect(await readManifest(root)).toEqual(manifest);
  });

  it("returns null when the repo carries no manifest", async () => {
    expect(await readManifest(getRoot().dir)).toBeNull();
  });

  it("writes to .stamity/manifest.json, creating the state dir", async () => {
    const root = getRoot().dir;

    await writeManifest(root, fullManifest(), { now: FIXED_NOW });

    // Joined, not spelled with a literal "/": manifestPath() builds a NATIVE
    // path, whose separator is `\` on Windows.
    expect(manifestPath(root).endsWith(join(STATE_DIR, "manifest.json"))).toBe(true);
    expect(await readFile(manifestPath(root), "utf8")).toMatch(/\n$/);
  });

  it("stamps updatedAt from the injected clock without touching the caller's object", async () => {
    const root = getRoot().dir;
    const manifest = fullManifest();

    await writeManifest(root, manifest, { now: LATER });

    expect(manifest.updatedAt).toBe(FIXED_NOW.toISOString());
    const read = await readManifest(root);
    expect(read?.updatedAt).toBe(LATER.toISOString());
    expect(read?.createdAt).toBe(FIXED_NOW.toISOString());
  });

  it("serializes byte-identically for deep-equal input written in another key order", async () => {
    const root = getRoot().dir;
    const manifest = fullManifest();
    // Same data, keys assigned in a different order — top level reversed, and
    // reordered inside the ledger rows, the mcp block, and the opaque
    // toolOptions bag the engine passes through untouched.
    const reordered: SetupManifest = {
      ...manifest,
      ledger: manifest.ledger.map((entry) => ({
        artifactType: entry.artifactType,
        path: entry.path,
        artifactId: entry.artifactId,
        adapter: entry.adapter,
        ...(entry.contentHash !== undefined ? { contentHash: entry.contentHash } : {}),
        ...(entry.stampedVersion !== undefined ? { stampedVersion: entry.stampedVersion } : {}),
      })),
      toolOptions: { claude: { nested: { a: 2, b: 1 }, plugin: true } },
      mcp: { protocolVersion: "2025-06-18", servers: ["github"] },
    };
    const shuffled = Object.fromEntries(
      Object.entries(reordered).toReversed(),
    ) as unknown as SetupManifest;

    await writeManifest(root, manifest, { now: FIXED_NOW });
    const first = await readFile(manifestPath(root), "utf8");
    await writeManifest(root, shuffled, { now: FIXED_NOW });

    expect(await readFile(manifestPath(root), "utf8")).toBe(first);
    // Human-diffable: the declared field order leads, not an alphabetical one.
    expect(Object.keys(JSON.parse(first) as Record<string, unknown>).slice(0, 5)).toEqual([
      "version",
      "generatedBy",
      "createdAt",
      "updatedAt",
      "tools",
    ]);
  });

  it("refuses to persist a manifest that readManifest would reject", async () => {
    const root = getRoot().dir;
    const broken = { ...fullManifest(), tools: [] } as SetupManifest;

    const error = await rejects(() => writeManifest(root, broken), "CONFIG_ERROR");

    expect(error.message).toContain("Refusing to write");
    expect(await readManifest(root)).toBeNull();
  });

  it("reads a manifest saved with a UTF-8 BOM", async () => {
    const root = getRoot().dir;
    await writeManifest(root, fullManifest(), { now: FIXED_NOW });
    const withBom = `\uFEFF${await readFile(manifestPath(root), "utf8")}`;
    await writeFile(manifestPath(root), withBom, "utf8");

    expect(await readManifest(root)).toEqual(fullManifest());
  });

  it("reports every field defect of a hand-edited manifest in one message", async () => {
    const root = getRoot().dir;
    await seedManifest(
      root,
      JSON.stringify({ ...fullManifest(), version: "nope", generatedBy: "", extra: 1 }),
    );

    const error = await rejects(() => readManifest(root), "CONFIG_ERROR");

    expect(error.message).toContain("`version`");
    expect(error.message).toContain("`generatedBy`");
    expect(error.message).toContain("unknown field `extra`");
  });

  it("rejects malformed JSON as a config defect", async () => {
    const root = getRoot().dir;
    await seedManifest(root, "{ not json");

    const error = await rejects(() => readManifest(root), "CONFIG_ERROR");
    expect(error.message).toContain("Malformed JSON");
  });

  it("refuses a manifest from a newer schema generation", async () => {
    const root = getRoot().dir;
    await seedManifest(root, JSON.stringify({ ...fullManifest(), version: "9.0.0" }));

    const error = await rejects(() => readManifest(root), "CONFIG_ERROR");
    expect(error.message).toContain("newer than the");
  });

  it("maps a directory sitting on the manifest path to FS_ERROR", async () => {
    const root = getRoot().dir;
    await mkdir(manifestPath(root), { recursive: true });

    const error = await rejects(() => readManifest(root), "FS_ERROR");
    expect(error.message).toContain("directory, not a file");
  });
});

describe("preserved fields", () => {
  it("carries the user's answers across a regeneration", () => {
    const previous = fullManifest();
    const preserved = extractPreservedManifestFields(previous);

    // A fresh run recomputes everything: new version stamp, new clock, default
    // dials, a selection built from defaults, and an empty ledger.
    const fresh = createManifest({
      tools: ["claude"],
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "2.0.0",
      now: LATER,
    });

    const merged = applyPreservedManifestFields(fresh, preserved);

    expect(merged.selection).toEqual(previous.selection);
    expect(merged.mcp).toEqual(previous.mcp);
    expect(merged.maturityTier).toBe(previous.maturityTier);
    expect(merged.communicationStyle).toBe(previous.communicationStyle);
    expect(merged.learnings).toEqual(previous.learnings);
    expect(merged.toolOptions).toEqual(previous.toolOptions);
    // Regenerated facts stay the fresh run's.
    expect(merged.generatedBy).toBe("2.0.0");
    expect(merged.updatedAt).toBe(LATER.toISOString());
    expect(merged.tools).toEqual(["claude"]);
    expect(merged.ledger).toEqual([]);
    expect(validateManifest(merged)).toBe(true);
  });

  it("extracts nothing from a manifest that carries no user answers beyond selection", () => {
    const bare = createManifest({
      tools: ["copilot"],
      selection: SELECTION,
      generatorVersion: "1.0.0",
      now: FIXED_NOW,
    });

    expect(Object.keys(extractPreservedManifestFields(bare))).toEqual(["selection"]);
  });

  it("leaves both inputs untouched and shares no reference with either", () => {
    const previous = fullManifest();
    const preserved = extractPreservedManifestFields(previous);
    const fresh = createManifest(createOptions({ now: LATER }));
    const freshBefore = structuredClone(fresh);

    const merged = applyPreservedManifestFields(fresh, preserved);
    merged.selection.items.agent.push("mutated");
    merged.ledger.push({
      path: "x.md",
      adapter: "claude",
      artifactId: "x",
      artifactType: "agent",
    });

    expect(fresh).toEqual(freshBefore);
    expect(preserved.selection?.items.agent).toEqual(["reviewer", "implementer"]);
    expect(previous.selection.items.agent).toEqual(["reviewer", "implementer"]);
  });
});

/**
 * Every `src/` file whose text mentions `name`, repo-relative to `src/` and
 * sorted. Pins a symbol's reference set: a name that gains a reference
 * anywhere under `src/` changes the set, which is how a test can assert that
 * an exported function is still dead rather than trusting a comment saying so.
 */
async function srcFilesMentioning(name: string): Promise<string[]> {
  const srcRoot = fileURLToPath(new URL("../../src", import.meta.url));
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const absolute = join(dir, entry.name);
        if (entry.isDirectory()) return walk(absolute);
        if (!entry.name.endsWith(".ts")) return [];
        const text = await readFile(absolute, "utf8");
        return text.includes(name) ? [relative(srcRoot, absolute).replaceAll("\\", "/")] : [];
      }),
    );
    return nested.flat();
  };
  return (await walk(srcRoot)).toSorted();
}

describe("scalar dials", () => {
  it("defaults the maturity tier for an absent or unread manifest", () => {
    expect(readMaturityTier(null)).toBe("solo");
    expect(readMaturityTier(undefined)).toBe("solo");
    expect(readMaturityTier(createManifest(createOptions()))).toBe("scaleup");
  });

  it("defaults the communication style", () => {
    expect(readCommunicationStyle(null)).toBe("plain");
    expect(readCommunicationStyle({ ...fullManifest() })).toBe("technical");
  });

  it("carries NO confidence-floor dial on any surface — the gate is fixed, not settable", async () => {
    // Closed by REMOVAL. This case replaces the two-armed tripwire that
    // stood here while the defect was parked; it is the same two arms inverted,
    // so it is strictly stronger than what it supersedes — the old arms allowed
    // the dial to exist as long as it stayed unwired, these forbid it existing
    // at all. It is deliberately NOT deleted: the dial's failure mode was that
    // a settable floor CONTRADICTED shipped enforcement (the emitted review-gate
    // hook refuses an approval the reviewer rated `low` and accepts `medium` and
    // `high`, at a threshold no config key feeds), so re-adding one is a
    // regression this repo has already paid for once.
    //
    // Arm 1: no substitution token ever carries a floor into an emitted
    // artifact. Arm 2: neither the renderer nor the resolver exists anywhere
    // under `src/` — a zero-length reference set, not a one-file one.
    expect(REPO_SUBSTITUTION_TOKENS.some((token) => token.includes("CONFIDENCE"))).toBe(false);
    expect(await srcFilesMentioning("confidenceFloorDirective")).toEqual([]);
    expect(await srcFilesMentioning("readConfidenceFloor")).toEqual([]);

    // Arm 3: the enum trio is gone from the core vocabulary, so the type that
    // made the field spellable cannot be reached from anywhere.
    expect(Object.keys(core).filter((name) => name.includes("CONFIDENCE"))).toEqual([]);

    // Arm 4: the persistence grammar refuses the key by name rather than
    // carrying it silently — the strict unknown-field gate is what makes a
    // stale hand-edited manifest repairable instead of quietly inert.
    const stale = { ...fullManifest(), confidenceFloor: "high" };
    expect(collectManifestErrors(stale)).toContain("unknown field `confidenceFloor`");
  });

  it("emits a one-line directive carrying the resolved value for every enum member", () => {
    for (const tier of MATURITY_TIERS) {
      expect(maturityDirective(tier)).toContain(`maturity=${tier}`);
      expect(maturityDirective(tier)).not.toContain("\n");
    }
    for (const style of COMMUNICATION_STYLES) {
      expect(communicationStyleDirective(style)).toContain(`style=${style}`);
      expect(communicationStyleDirective(style)).not.toContain("\n");
    }
  });
});

describe("models — the operator's ladder overrides", () => {
  it("resolves the review cap to the engine default for an absent or unread manifest", () => {
    expect(readReviewCap(null)).toBe(DEFAULT_MAX_REVIEW_ITERATIONS);
    expect(readReviewCap(undefined)).toBe(DEFAULT_MAX_REVIEW_ITERATIONS);
    expect(readReviewCap(fullManifest())).toBe(DEFAULT_MAX_REVIEW_ITERATIONS);
    expect(readReviewCap({ ...fullManifest(), models: {} })).toBe(DEFAULT_MAX_REVIEW_ITERATIONS);
  });

  it("returns the persisted cap when it is in band", () => {
    const cap = DEFAULT_MAX_REVIEW_ITERATIONS + 2;
    expect(readReviewCap({ ...fullManifest(), models: { reviewCap: cap } })).toBe(cap);
    expect(cap).toBeLessThanOrEqual(HARD_MAX_REVIEW_ITERATIONS);
  });

  it("clamps a hand-edited out-of-band cap rather than propagating it", () => {
    // Persistence refuses these, so they only reach a caller holding a manifest
    // OBJECT — which is exactly the case this resolver is total for.
    expect(readReviewCap({ ...fullManifest(), models: { reviewCap: 99 } })).toBe(
      HARD_MAX_REVIEW_ITERATIONS,
    );
    expect(readReviewCap({ ...fullManifest(), models: { reviewCap: 0 } })).toBe(
      MIN_MAX_REVIEW_ITERATIONS,
    );
    expect(readReviewCap({ ...fullManifest(), models: { reviewCap: 6.9 } })).toBe(6);
  });

  it("round-trips a populated block through write -> read deep-equal", async () => {
    const root = getRoot().dir;
    const manifest: SetupManifest = {
      ...fullManifest(),
      models: {
        pins: { advanced: "vendor-x-1", economy: "vendor-x-mini" },
        effort: { advanced: "high", economy: "low" },
        reviewCap: 7,
      },
    };

    await writeManifest(root, manifest, { now: FIXED_NOW });

    expect(await readManifest(root)).toEqual(manifest);
  });

  it("leaves a manifest that sets no models untouched — no migration, no added key", async () => {
    const root = getRoot().dir;
    const manifest = fullManifest();

    await writeManifest(root, manifest, { now: FIXED_NOW });
    const bytes = await readFile(manifestPath(root), "utf8");
    const reread = await readManifest(root);

    expect(MANIFEST_MIGRATIONS).toEqual([]);
    expect(bytes).not.toContain("models");
    expect(reread).toEqual(manifest);
    expect(reread?.models).toBeUndefined();

    // ...and writing what was read back produces the same bytes, so a no-op
    // sync on an existing repo does not gain an empty block in its diff.
    await writeManifest(root, reread as SetupManifest, { now: FIXED_NOW });
    expect(await readFile(manifestPath(root), "utf8")).toBe(bytes);
  });
});

describe("properties", () => {
  // Fixed seed: the suite must be deterministic run-to-run (CI contract).
  const FC_PARAMS = { seed: 20260813, numRuns: 200 } as const;

  const idArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);
  const selectionArb: fc.Arbitrary<ContentSelection> = fc
    .tuple(...CONTENT_CLASSES.map(() => fc.array(idArb, { maxLength: 4 })))
    .map((lists) => ({
      items: Object.fromEntries(
        CONTENT_CLASSES.map((contentClass, index) => [contentClass, lists[index] ?? []]),
      ) as ContentSelection["items"],
    }));

  const optionsArb: fc.Arbitrary<CreateManifestOptions> = fc.record(
    {
      tools: fc.uniqueArray(fc.constantFrom(...TOOLS), { minLength: 1 }),
      platform: fc.constantFrom("github" as const, "azure-devops" as const, "gitlab" as const),
      selection: selectionArb,
      maturityTier: fc.constantFrom(...MATURITY_TIERS),
      mcp: fc.record({ servers: fc.array(idArb, { maxLength: 3 }) }),
      detected: fc.record({
        languages: fc.array(idArb, { maxLength: 3 }),
        linters: fc.array(idArb, { maxLength: 3 }),
        testFrameworks: fc.array(idArb, { maxLength: 3 }),
        ciProviders: fc.array(idArb, { maxLength: 3 }),
      }),
      now: fc.date({ min: new Date("2000-01-01T00:00:00.000Z"), noInvalidDate: true }),
      generatorVersion: fc.stringMatching(/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}$/),
    },
    { requiredKeys: ["tools", "selection", "generatorVersion"] },
  );

  it("createManifest always produces a manifest validateManifest accepts", () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        expect(collectManifestErrors(createManifest(options))).toEqual([]);
      }),
      FC_PARAMS,
    );
  });

  it("migrateManifest is identity and idempotent on any current-generation manifest", () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const manifest = createManifest(options) as unknown as Record<string, unknown>;
        const once = migrateManifest(manifest);
        expect(once).toEqual(manifest);
        expect(migrateManifest(once)).toEqual(once);
      }),
      FC_PARAMS,
    );
  });

  it("applying extracted fields to their own manifest changes nothing", () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const manifest = createManifest(options);
        const reapplied = applyPreservedManifestFields(
          manifest,
          extractPreservedManifestFields(manifest),
        );
        expect(reapplied).toEqual(manifest);
      }),
      FC_PARAMS,
    );
  });
});
