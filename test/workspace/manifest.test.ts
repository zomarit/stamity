import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EngineError, type ErrorCode } from "../../src/types/errors.ts";
import {
  WORKSPACE_MANIFEST_MIGRATIONS,
  collectWorkspaceManifestErrors,
  createWorkspaceManifest,
  isUnsafeRepoPath,
  migrateWorkspaceManifest,
  normalizeRepoPathKey,
  readWorkspaceManifest,
  writeWorkspaceManifest,
} from "../../src/workspace/manifest.ts";
import {
  WORKSPACE_MANIFEST_FILE,
  WORKSPACE_MANIFEST_VERSION,
  type WorkspaceDefaults,
  type WorkspaceManifest,
  type WorkspaceRepoEntry,
} from "../../src/workspace/model.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The pure half (path safety, validation, migration, create) runs on data
 * alone. The IO half uses real temp directories rather than the virtual-fs
 * lane: the writer's guarantees are the write lock, temp+rename, and the temp
 * sweep on failure — semantics memfs does not model.
 */
const getRoot = useTempDir("workspace-manifest");

function validManifest(overrides: Partial<WorkspaceManifest> = {}): WorkspaceManifest {
  return {
    version: WORKSPACE_MANIFEST_VERSION,
    defaults: {
      tools: ["claude"],
      selection: { items: { agent: ["reviewer"], skill: [], rule: ["security"], command: [] } },
      maturityTier: "team",
      mcp: { servers: ["github"], protocolVersion: "2025-06-18" },
    },
    groups: [{ name: "frontend", addItems: { rule: ["a11y"] }, toolOverrides: ["cursor"] }],
    repos: [
      {
        path: "apps/web",
        groups: ["frontend"],
        overrides: { tools: ["claude", "codex"], removeItems: { rule: ["a11y"] } },
      },
      { path: "services/api" },
    ],
    lockedContent: ["security"],
    ...overrides,
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

/** The single error a one-defect fixture is expected to produce. */
function onlyError(data: unknown): string {
  const errors = collectWorkspaceManifestErrors(data);
  expect(errors).toHaveLength(1);
  return errors[0] ?? "";
}

describe("isUnsafeRepoPath", () => {
  it("accepts every spelling of a path that stays under the workspace root", () => {
    for (const path of ["apps/web", "./apps/web", "apps/web/", "apps\\web", "Apps/Web", "web"]) {
      expect(isUnsafeRepoPath(path)).toBe(false);
    }
  });

  it("rejects absolute paths in POSIX, drive-letter, and UNC spellings", () => {
    // Drive-letter and UNC forms are refused on POSIX hosts too: a manifest is
    // read on machines other than the one that authored it.
    for (const path of ["/srv/app", "C:/x", "C:x", "c:\\x", "\\\\server\\share", "\\srv"]) {
      expect(isUnsafeRepoPath(path)).toBe(true);
    }
  });

  it("rejects a `..` segment anywhere, not only at the front", () => {
    // An inner `..` is refused rather than collapsed so this module's duplicate
    // key agrees with the resolution layer, which preserves `..` when matching.
    for (const path of ["..", "../escape", "apps/../../etc", "a/../b", "apps/..\\etc"]) {
      expect(isUnsafeRepoPath(path)).toBe(true);
    }
  });

  it("rejects NUL bytes and paths that name nothing", () => {
    for (const path of ["\0", "apps/\0web", "", ".", "./", "//"]) {
      expect(isUnsafeRepoPath(path)).toBe(true);
    }
  });
});

describe("normalizeRepoPathKey", () => {
  it("collapses leading './', trailing slashes, doubled and backslash separators", () => {
    for (const path of ["apps/web", "./apps/web", "apps/web/", "apps//web", "apps\\web", ".//apps/web//"]) {
      expect(normalizeRepoPathKey(path)).toBe("apps/web");
    }
  });

  it("preserves case — a case-insensitive filesystem is not the author's intent", () => {
    expect(normalizeRepoPathKey("Apps/Web")).toBe("Apps/Web");
    expect(normalizeRepoPathKey("Apps/Web")).not.toBe(normalizeRepoPathKey("apps/web"));
  });

  it("leaves `..` in the key — unsafe paths are rejected before they are keyed", () => {
    expect(normalizeRepoPathKey("../a")).toBe("../a");
    expect(normalizeRepoPathKey("")).toBe("");
  });
});

describe("collectWorkspaceManifestErrors", () => {
  it("reports nothing for a manifest using every field", () => {
    expect(collectWorkspaceManifestErrors(validManifest())).toEqual([]);
  });

  it("accepts a workspace with zero repos", () => {
    // A workspace is assembled — manifest first, policy agreed — before the
    // member repositories are registered into it.
    expect(collectWorkspaceManifestErrors(validManifest({ repos: [] }))).toEqual([]);
  });

  it("reports a root that is not a JSON object as the single defect", () => {
    expect(onlyError(null)).toContain("null");
    expect(onlyError([])).toContain("an array");
    expect(onlyError("workspace")).toContain("string");
  });

  it("requires `version` to be a semantic version string", () => {
    expect(onlyError(validManifest({ version: "banana" }))).toContain("`version`");
    const { version: _dropped, ...withoutVersion } = validManifest();
    expect(onlyError(withoutVersion)).toContain("`version`");
  });

  it("reports defaults shape, unknown tool ids, and unknown content classes", () => {
    expect(onlyError({ ...validManifest(), defaults: "claude" })).toBe("`defaults` must be an object");

    const badTool = validManifest();
    badTool.defaults.tools = ["claude", "windsurf" as never];
    expect(onlyError(badTool)).toContain('unknown tool "windsurf"');

    const badToolShape = validManifest();
    expect(onlyError({ ...badToolShape, defaults: { tools: "claude" } })).toBe(
      "`defaults.tools` must be an array of strings",
    );

    const badClass = validManifest({ groups: [{ name: "frontend", addItems: { hook: ["x"] } as never }] });
    expect(onlyError(badClass)).toContain("`groups[0].addItems.hook` is not a content class");
  });

  it("reports selection, maturityTier, and mcp defects by field path", () => {
    const manifest = validManifest();
    const errors = collectWorkspaceManifestErrors({
      ...manifest,
      defaults: {
        tools: ["claude"],
        selection: { items: { agent: "reviewer" } },
        maturityTier: "startup",
        mcp: { servers: [1], protocolVersion: 2 },
      },
    });
    expect(errors).toEqual([
      "`defaults.selection.items.agent` must be an array of strings",
      "`defaults.maturityTier` must be one of solo | team | scaleup | enterprise",
      "`defaults.mcp.servers` must be an array of strings",
      "`defaults.mcp.protocolVersion` must be a string",
    ]);
  });

  it("collapses two spellings of one repo path into a single duplicate error", () => {
    for (const twin of ["./api", "api/", "api\\", ".//api"]) {
      const error = onlyError(validManifest({ repos: [{ path: "api" }, { path: twin }] }));
      expect(error).toContain('"api"');
      expect(error).toContain(JSON.stringify(twin));
      expect(error).toContain("race every write");
    }
  });

  it("distinguishes an absolute path from a traversing one", () => {
    const errors = collectWorkspaceManifestErrors(
      validManifest({ repos: [{ path: "/srv/app" }, { path: "../escape" }] }),
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("is an absolute path");
    expect(errors[1]).toContain("`..` segment");
    expect(errors[0]).not.toBe(errors[1]);
  });

  it("rejects a Windows drive-letter repo path as absolute", () => {
    expect(onlyError(validManifest({ repos: [{ path: "C:/x" }] }))).toBe(
      '`repos[0].path` "C:/x" is an absolute path — repo paths are relative to the workspace root',
    );
  });

  it("rejects a NUL byte and an empty repo path with their own messages", () => {
    expect(onlyError(validManifest({ repos: [{ path: "apps/\0web" }] }))).toContain("NUL byte");
    expect(onlyError(validManifest({ repos: [{ path: "." }] }))).toContain("is empty");
  });

  it("reports repo entries that are not objects or carry a non-string path", () => {
    expect(onlyError(validManifest({ repos: ["apps/web" as never] }))).toBe(
      "`repos[0]` must be an object",
    );
    expect(onlyError(validManifest({ repos: [{ path: 7 as never }] }))).toBe(
      "`repos[0].path` must be a string",
    );
    expect(onlyError({ ...validManifest(), repos: { "apps/web": {} } })).toBe(
      "`repos` must be an array",
    );
  });

  it("reports a group delta defined twice", () => {
    const twice = validManifest({
      groups: [
        { name: "frontend", addItems: { rule: ["a11y"] } },
        { name: "frontend", removeItems: { rule: ["a11y"] } },
      ],
    });
    expect(onlyError(twice)).toContain('`groups[]` defines "frontend" more than once');
  });

  it("reports a member naming one group twice", () => {
    const twice = validManifest({ repos: [{ path: "apps/web", groups: ["frontend", "frontend"] }] });
    expect(onlyError(twice)).toBe('`repos[0].groups` names "frontend" twice');
  });

  it("reports group and override shape defects", () => {
    expect(onlyError({ ...validManifest(), groups: {} })).toBe(
      "`groups` must be an array of group deltas",
    );
    expect(onlyError(validManifest({ groups: [{ name: "" }] }))).toBe(
      "`groups[0].name` must be a non-empty string",
    );
    expect(onlyError(validManifest({ groups: [{ name: "a", toolOverrides: ["nano" as never] }] })))
      .toContain("`groups[0].toolOverrides` names unknown tool");
    expect(onlyError(validManifest({ repos: [{ path: "a", overrides: "tools" as never }] }))).toBe(
      "`repos[0].overrides` must be an object",
    );
    expect(onlyError(validManifest({ repos: [{ path: "a", groups: "frontend" as never }] }))).toBe(
      "`repos[0].groups` must be an array of strings",
    );
    expect(onlyError(validManifest({ lockedContent: [1] as never }))).toBe(
      "`lockedContent` must be an array of strings",
    );
  });

  it("collects every defect in one pass instead of stopping at the first", () => {
    const errors = collectWorkspaceManifestErrors({
      version: 1,
      defaults: { tools: ["nano"] },
      repos: [{ path: "/srv/app" }, { path: "api" }, { path: "./api" }],
      lockedContent: "security",
    });

    expect(errors).toHaveLength(5);
    for (const field of ["`version`", "`defaults.tools`", "`repos[0].path`", "`repos[]`", "`lockedContent`"]) {
      expect(errors.some((error) => error.includes(field))).toBe(true);
    }
  });
});

describe("migrateWorkspaceManifest", () => {
  it("ships no migrations at schema generation 1", () => {
    expect(WORKSPACE_MANIFEST_MIGRATIONS).toEqual([]);
  });

  it("returns a deep copy that shares nothing with its input", () => {
    const raw = validManifest() as unknown as Record<string, unknown>;
    const migrated = migrateWorkspaceManifest(raw);

    expect(migrated).toEqual(raw);
    (migrated.repos as { path: string }[])[0]!.path = "mutated";
    expect((raw.repos as { path: string }[])[0]!.path).toBe("apps/web");
  });

  it("is idempotent — a second run over the result changes nothing", () => {
    const raw = validManifest() as unknown as Record<string, unknown>;
    const once = migrateWorkspaceManifest(raw);
    expect(migrateWorkspaceManifest(once)).toEqual(once);
  });

  it("passes an unversioned document through untouched for validation to report", () => {
    expect(migrateWorkspaceManifest({ repos: [] })).toEqual({ repos: [] });
  });
});

describe("createWorkspaceManifest", () => {
  it("stamps the current schema generation over the given defaults and repos", () => {
    const manifest = createWorkspaceManifest({ tools: ["claude"] }, [{ path: "apps/web" }]);

    expect(manifest).toEqual({
      version: WORKSPACE_MANIFEST_VERSION,
      defaults: { tools: ["claude"] },
      repos: [{ path: "apps/web" }],
    });
    expect(collectWorkspaceManifestErrors(manifest)).toEqual([]);
  });

  it("shares no reference with its inputs", () => {
    // `servers` is held separately so the nested array — the one a shallow copy
    // would still share — is mutated through the caller's own reference.
    const servers = ["github"];
    const defaults: WorkspaceDefaults = { tools: ["claude"], mcp: { servers } };
    const repos: WorkspaceRepoEntry[] = [{ path: "apps/web" }];
    const manifest = createWorkspaceManifest(defaults, repos);

    defaults.tools.push("cursor");
    servers.push("linear");
    repos.push({ path: "services/api" });

    expect(manifest.defaults.tools).toEqual(["claude"]);
    expect(manifest.defaults.mcp?.servers).toEqual(["github"]);
    expect(manifest.repos).toEqual([{ path: "apps/web" }]);
  });
});

describe("readWorkspaceManifest", () => {
  it("returns null when the directory holds no manifest, and when it does not exist", async () => {
    expect(await readWorkspaceManifest(getRoot().dir)).toBeNull();
    expect(await readWorkspaceManifest(getRoot().path("absent"))).toBeNull();
  });

  it("round-trips a written manifest deep-equal", async () => {
    const manifest = validManifest();
    await writeWorkspaceManifest(getRoot().dir, manifest);

    expect(await readWorkspaceManifest(getRoot().dir)).toEqual(manifest);
  });

  it("rejects malformed JSON with CONFIG_ERROR naming the file", async () => {
    await getRoot().seedFiles({ [WORKSPACE_MANIFEST_FILE]: '{"version": "1.0.0",' });

    const error = await rejects(() => readWorkspaceManifest(getRoot().dir), "CONFIG_ERROR");
    expect(error.message).toContain(WORKSPACE_MANIFEST_FILE);
  });

  it("rejects a JSON root that is not an object", async () => {
    await getRoot().seedFiles({ [WORKSPACE_MANIFEST_FILE]: "[]" });

    await rejects(() => readWorkspaceManifest(getRoot().dir), "CONFIG_ERROR");
  });

  it("rejects a newer schema generation before reading its shape", async () => {
    // Shape checks on a future generation either misdescribe it or pass it
    // through as if it were this one, so the version gate runs first.
    await getRoot().seedFiles({
      [WORKSPACE_MANIFEST_FILE]: JSON.stringify({ version: "2.0.0", repos: "later" }),
    });

    const error = await rejects(() => readWorkspaceManifest(getRoot().dir), "CONFIG_ERROR");
    expect(error.message).toContain("2.0.0");
    expect(error.message).toContain("schema 2.x");
    expect(error.message).not.toContain("`repos`");
  });

  it("lists every field defect in one VALIDATION_ERROR", async () => {
    await getRoot().seedFiles({
      [WORKSPACE_MANIFEST_FILE]: JSON.stringify({
        version: "1.0.0",
        defaults: { tools: ["claude"] },
        repos: [{ path: "../escape" }, { path: "api" }, { path: "api/" }],
      }),
    });

    const error = await rejects(() => readWorkspaceManifest(getRoot().dir), "VALIDATION_ERROR");
    expect(error.message).toContain("`..` segment");
    expect(error.message).toContain("race every write");
  });

  it("classifies a manifest that exists but cannot be read as FS_ERROR", async () => {
    // A directory at the manifest path is the portable non-ENOENT read failure:
    // EISDIR everywhere the engine runs, with no chmod that a root-running CI
    // container would ignore. Absence stays `null`; unreadable is a throw.
    await mkdir(join(getRoot().dir, WORKSPACE_MANIFEST_FILE));

    const error = await rejects(() => readWorkspaceManifest(getRoot().dir), "FS_ERROR");
    expect(error.message).toContain(WORKSPACE_MANIFEST_FILE);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("reads a same-generation manifest carrying fields it does not know", async () => {
    // Forward compatibility within a major: a newer minor's field is carried
    // through rather than rejected, which is what the major gate is for.
    const manifest = { ...validManifest(), syncStrategy: "on-sync" };
    await getRoot().seedFiles({ [WORKSPACE_MANIFEST_FILE]: JSON.stringify(manifest) });

    expect(await readWorkspaceManifest(getRoot().dir)).toEqual(manifest);
  });
});

describe("writeWorkspaceManifest", () => {
  it("writes two-space JSON with a trailing newline, creating missing parents", async () => {
    const root = getRoot().path("nested", "workspace");
    await writeWorkspaceManifest(root, validManifest());

    const raw = await readFile(join(root, WORKSPACE_MANIFEST_FILE), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw).toContain('\n  "version": "1.0.0",');
    expect(JSON.parse(raw)).toEqual(validManifest());
  });

  it("refuses to persist a manifest the reader would reject, leaving no file", async () => {
    const invalid = validManifest({ repos: [{ path: "api" }, { path: "./api" }] });

    const error = await rejects(
      () => writeWorkspaceManifest(getRoot().dir, invalid),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("Refusing to write");
    expect(await readdir(getRoot().dir)).toEqual([]);
  });

  it("leaves no temp file behind when the write fails", async () => {
    // A directory at the target path fails the rename, not the temp write: the
    // error names the temp file, so the residue check below is not vacuous.
    await mkdir(join(getRoot().dir, WORKSPACE_MANIFEST_FILE));
    await writeFile(getRoot().path(WORKSPACE_MANIFEST_FILE, "occupant"), "in the way");

    let caught: unknown = null;
    try {
      await writeWorkspaceManifest(getRoot().dir, validManifest());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(".tmp.");
    expect(await readdir(getRoot().dir)).toEqual([WORKSPACE_MANIFEST_FILE]);
  });
});
