import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { propagationPatch, workspaceCommand } from "../../src/cli/commands/workspace.ts";
import { runCli, type CommandIo } from "../../src/cli/kit/program.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import { createManifest, readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import {
  MANIFEST_FILE,
  type McpConfig,
  type McpOwnServer,
  type SetupManifest,
} from "../../src/types/manifest.ts";
import { STATE_DIR } from "../../src/types/markers.ts";
import {
  WORKSPACE_MANIFEST_FILE,
  WORKSPACE_MANIFEST_VERSION,
  type WorkspaceDefaults,
  type WorkspaceManifest,
} from "../../src/workspace/model.ts";
import {
  findOwnRowClashes,
  resolveRepoConfig,
  type ResolvedRepoConfig,
} from "../../src/workspace/resolve.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * REQ-FLOW-160: a workspace `mcp` block merges with a member's own servers.
 *
 * The first half calls the two pure pieces directly: `propagationPatch` for the
 * merge rule and `findOwnRowClashes` for the two-member refusal. The lane half
 * drives `workspace sync` over real member repositories and reads the bytes back,
 * since what a person loses to a replacement is a line in a manifest and a server
 * in `.mcp.json`, and no library proof reaches either. No mocks.
 */

const T0 = new Date("2026-11-05T09:00:00.000Z");

const OWN_ID = "acme-wiki";
const OWN_PACKAGE = "@acme/wiki-mcp";
const OWN_VERSION = "2.4.0";
const OWN_VAR = "ACME_WIKI_TOKEN";

/** A curated server that needs no credential, as the workspace's own selection. */
const CURATED_ID = "filesystem";

const CHARTER_FIXTURE = [
  "---",
  "id: charter",
  "type: charter",
  "description: fixture charter",
  "tags: [orchestration]",
  "load: always",
  "obsolete_when: fixture trigger",
  "---",
  "",
  "# Test Charter",
  "",
  "Charter guidance body.",
  "",
].join("\n");

/** A row held to the pack bar: exact pin, no shell, the credential by reference. */
function ownRow(overrides: Readonly<Record<string, unknown>> = {}): McpOwnServer {
  return {
    id: OWN_ID,
    description: "Search the company wiki.",
    command: "npx",
    args: ["-y", `${OWN_PACKAGE}@${OWN_VERSION}`, "--token", `\${env:${OWN_VAR}}`],
    transport: "stdio",
    requiresEnv: [{ name: OWN_VAR, description: "Read-only wiki token" }],
    pinnedVersion: OWN_VERSION,
    packageNameLock: OWN_PACKAGE,
    blastRadius: "Low: read-only wiki search, and it cannot change a page.",
    docsUrl: "https://example.invalid/acme-wiki",
    ...overrides,
  } as McpOwnServer;
}

/** The same row at another pin, so the two members disagree on what the id launches. */
function ownRowAt(version: string): McpOwnServer {
  return ownRow({
    args: ["-y", `${OWN_PACKAGE}@${version}`, "--token", `\${env:${OWN_VAR}}`],
    pinnedVersion: version,
  });
}

/** What the bridge hands `propagationPatch`: a member already on the workspace's tools. */
function resolvedWith(mcp: NonNullable<ResolvedRepoConfig["mcp"]> | undefined): ResolvedRepoConfig {
  return {
    repoPath: "apps/api",
    tools: ["claude"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    ...(mcp === undefined ? {} : { mcp }),
    lockedApplied: [],
  };
}

function memberWith(mcp: McpConfig | undefined): SetupManifest {
  return {
    ...createManifest({
      tools: ["claude"],
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "0.0.0-test",
      now: T0,
    }),
    ...(mcp === undefined ? {} : { mcp }),
  };
}

describe("propagationPatch — the merge rule", () => {
  it("keeps a member's selected own id and its row under a block that names neither", () => {
    const row = ownRow();
    const { patch, fields } = propagationPatch(
      memberWith({ servers: ["github", OWN_ID], ownServers: [row] }),
      resolvedWith({ servers: [CURATED_ID] }),
    );

    // `github` is the block's to replace; the own id is not.
    expect(patch.mcp).toEqual({ servers: [CURATED_ID, OWN_ID], ownServers: [row] });
    expect(fields).toEqual(["mcp"]);
  });

  it("keeps a row nothing selects, and does not select it", () => {
    const row = ownRow();
    const { patch } = propagationPatch(
      memberWith({ servers: [], ownServers: [row] }),
      resolvedWith({ servers: [CURATED_ID] }),
    );

    expect(patch.mcp).toEqual({ servers: [CURATED_ID], ownServers: [row] });
  });

  it("drops an id with no row, so a kept id always has one", () => {
    const row = ownRow();
    const { patch } = propagationPatch(
      memberWith({ servers: [OWN_ID, "lost-row"], ownServers: [row] }),
      resolvedWith({ servers: [CURATED_ID] }),
    );

    expect(patch.mcp?.servers).toEqual([CURATED_ID, OWN_ID]);
  });

  it("lists an own id once when the block names it too", () => {
    const { patch } = propagationPatch(
      memberWith({ servers: [OWN_ID, "github"], ownServers: [ownRow()] }),
      resolvedWith({ servers: [OWN_ID, CURATED_ID] }),
    );

    expect(patch.mcp?.servers).toEqual([OWN_ID, CURATED_ID]);
  });

  it("takes the block's protocol version, keeping the row", () => {
    const row = ownRow();
    const { patch } = propagationPatch(
      memberWith({ servers: [OWN_ID], protocolVersion: "2024-11-05", ownServers: [row] }),
      resolvedWith({ servers: [], protocolVersion: "2025-06-18" }),
    );

    expect(patch.mcp).toEqual({
      servers: [OWN_ID],
      protocolVersion: "2025-06-18",
      ownServers: [row],
    });
  });

  it("owes a member already on the merged list nothing", () => {
    const { patch, fields } = propagationPatch(
      memberWith({ servers: [CURATED_ID, OWN_ID], ownServers: [ownRow()] }),
      resolvedWith({ servers: [CURATED_ID] }),
    );

    expect(fields).toEqual([]);
    expect(patch).toEqual({});
  });

  it("leaves a member alone when the workspace declares no block", () => {
    const { patch, fields } = propagationPatch(
      memberWith({ servers: [OWN_ID], ownServers: [ownRow()] }),
      resolvedWith(undefined),
    );

    expect(fields).toEqual([]);
    expect(patch).toEqual({});
  });

  it("adds no ownServers key to a member that has none", () => {
    const { patch } = propagationPatch(
      memberWith({ servers: ["github"] }),
      resolvedWith({ servers: [CURATED_ID] }),
    );

    expect(patch.mcp).toEqual({ servers: [CURATED_ID] });
    expect(Object.hasOwn(patch.mcp ?? {}, "ownServers")).toBe(false);
  });

  it("writes a list and a row list the member's document does not share", () => {
    const rows = [ownRow()];
    const { patch } = propagationPatch(
      memberWith({ servers: [OWN_ID], ownServers: rows }),
      resolvedWith({ servers: [CURATED_ID] }),
    );

    expect(patch.mcp?.ownServers).toEqual(rows);
    expect(patch.mcp?.ownServers).not.toBe(rows);
  });
});

describe("the workspace block carries no rows", () => {
  it("has no ownServers field in the type", () => {
    expectTypeOf<NonNullable<WorkspaceDefaults["mcp"]>>().not.toHaveProperty("ownServers");
    expectTypeOf<NonNullable<ResolvedRepoConfig["mcp"]>>().not.toHaveProperty("ownServers");
    // The rest of the block stays the member's shape.
    expectTypeOf<NonNullable<WorkspaceDefaults["mcp"]>>().toExtend<McpConfig>();
  });

  it("resolves a hand-written row out of the block, so no row launches from workspace.json", () => {
    const manifest: WorkspaceManifest = {
      version: WORKSPACE_MANIFEST_VERSION,
      defaults: {
        tools: ["claude"],
        // A row a person typed here: the reader takes unknown keys, so the cast is what it hands over.
        mcp: { servers: [OWN_ID], ownServers: [ownRow()] } as NonNullable<WorkspaceDefaults["mcp"]>,
      },
      repos: [{ path: "apps/api" }],
    };

    expect(resolveRepoConfig(manifest, "apps/api").mcp).toEqual({ servers: [OWN_ID] });
  });
});

describe("findOwnRowClashes", () => {
  it("names both members and the id when their rows differ", () => {
    expect(
      findOwnRowClashes([
        { repoPath: "apps/api", rows: [ownRowAt("2.4.0")] },
        { repoPath: "apps/web", rows: [ownRowAt("2.5.0")] },
      ]),
    ).toEqual([{ id: OWN_ID, repoPaths: ["apps/api", "apps/web"] }]);
  });

  it("answers one clash per member that differs from the first holder", () => {
    expect(
      findOwnRowClashes([
        { repoPath: "a", rows: [ownRowAt("1.0.0")] },
        { repoPath: "b", rows: [ownRowAt("1.0.0")] },
        { repoPath: "c", rows: [ownRowAt("3.0.0")] },
      ]),
    ).toEqual([{ id: OWN_ID, repoPaths: ["a", "c"] }]);
  });

  it("takes two rows that differ only in key order as one row", () => {
    const row = ownRow();
    const reversed = Object.fromEntries(Object.entries(row).toReversed()) as unknown as McpOwnServer;

    expect(
      findOwnRowClashes([
        { repoPath: "a", rows: [row] },
        { repoPath: "b", rows: [reversed] },
      ]),
    ).toEqual([]);
  });

  it("leaves two different ids alone", () => {
    expect(
      findOwnRowClashes([
        { repoPath: "a", rows: [ownRow({ id: "one" })] },
        { repoPath: "b", rows: [ownRow({ id: "two" })] },
      ]),
    ).toEqual([]);
  });

  it("leaves a clash inside one member to the seam, which names the row", () => {
    expect(findOwnRowClashes([{ repoPath: "a", rows: [ownRowAt("1.0.0"), ownRowAt("2.0.0")] }])).toEqual([]);
  });

  it("skips a row with no string id: the seam refuses it in its own member", () => {
    // Differing rows that would clash if a missing or numeric id were a key.
    const first: { id?: unknown; description: string }[] = [{ description: "one" }, { id: 7, description: "one" }];
    const second: { id?: unknown; description: string }[] = [{ description: "two" }, { id: 7, description: "two" }];

    expect(
      findOwnRowClashes([
        { repoPath: "a", rows: first },
        { repoPath: "b", rows: second },
      ]),
    ).toEqual([]);
  });
});

// ── The lane ───────────────────────────────────────────────────────────────

const getTemp = useTempDir("stamity-workspace-own");

afterEach(() => {
  __resetContentRootCacheForTests();
});

/** The corpus sits beside the workspace root, so no member's analysis walks it. */
async function seedCorpus(temp: TempDirHandle): Promise<void> {
  __setContentRootForTests(temp.path("corpus"));
  await temp.seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE });
}

async function seedWorkspace(
  temp: TempDirHandle,
  paths: readonly string[],
  mcp: WorkspaceDefaults["mcp"],
): Promise<string> {
  const root = temp.path("ws");
  await mkdir(root, { recursive: true });
  const manifest: WorkspaceManifest = {
    version: WORKSPACE_MANIFEST_VERSION,
    defaults: { tools: ["claude"], ...(mcp === undefined ? {} : { mcp }) },
    repos: paths.map((path) => ({ path })),
  };
  await writeFile(join(root, WORKSPACE_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return root;
}

async function seedMember(root: string, path: string, mcp: McpConfig): Promise<string> {
  const dir = join(root, path);
  await mkdir(dir, { recursive: true });
  await writeManifest(dir, memberWith(mcp), { now: T0 });
  return dir;
}

async function runSync(
  cwd: string,
  args: readonly string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CommandIo = {
    out: (text) => {
      stdout.push(text);
    },
    err: (text) => {
      stderr.push(text);
    },
  };
  const code = await runCli(["workspace", "sync", ...args], [workspaceCommand], {
    cwd,
    env: { NO_COLOR: "1" },
    io,
    clock: { now: () => T0 },
  });
  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

interface SyncDoc {
  outcome?: string;
  repos?: { repoPath: string; state: string; patched?: string[]; error?: { message: string } }[];
  error?: { code: string; message: string; next?: string };
}

async function syncDocument(cwd: string, args: readonly string[] = []): Promise<SyncDoc> {
  return JSON.parse((await runSync(cwd, ["--json", ...args])).stdout) as SyncDoc;
}

async function manifestBytes(memberDir: string): Promise<string> {
  return readFile(join(memberDir, STATE_DIR, MANIFEST_FILE), "utf8");
}

async function launched(memberDir: string): Promise<Record<string, { args?: string[] }>> {
  const doc = JSON.parse(await readFile(join(memberDir, ".mcp.json"), "utf8")) as {
    mcpServers: Record<string, { args?: string[] }>;
  };
  return doc.mcpServers;
}

describe("workspace sync — a member's own server survives the block", () => {
  it("keeps the id and the row on disk, and the server launches beside the block's", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api"], { servers: [CURATED_ID] });
    const row = ownRow();
    const api = await seedMember(root, "apps/api", { servers: ["github", OWN_ID], ownServers: [row] });

    const result = await runSync(root);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const written = await readManifest(api);
    expect(written?.mcp?.servers).toEqual([CURATED_ID, OWN_ID]);
    expect(written?.mcp?.ownServers).toEqual([row]);

    const servers = await launched(api);
    expect(Object.keys(servers).toSorted()).toEqual([OWN_ID, CURATED_ID].toSorted());
    expect(servers[OWN_ID]?.args).toContain(`${OWN_PACKAGE}@${OWN_VERSION}`);
  });

  it("writes nothing on the second run: the merged list is not a change", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api"], { servers: [CURATED_ID] });
    const api = await seedMember(root, "apps/api", { servers: [OWN_ID], ownServers: [ownRow()] });

    expect((await runSync(root)).code).toBe(0);
    const before = await manifestBytes(api);
    const doc = await syncDocument(root);

    expect(doc.repos?.[0]?.patched).toEqual([]);
    expect(await manifestBytes(api)).toBe(before);
  });

  it("still holds a member's row to the seam: a bad row fails that member alone", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web"], { servers: [CURATED_ID] });
    await seedMember(root, "apps/api", {
      servers: [OWN_ID],
      ownServers: [ownRow({ pinnedVersion: "latest" })],
    });
    const web = await seedMember(root, "apps/web", { servers: [] });

    const doc = await syncDocument(root);

    expect(doc.outcome).toBe("partial");
    const api = doc.repos?.find((row) => row.repoPath === "apps/api");
    expect(api?.state).toBe("failed");
    expect(api?.error?.message).toContain(`mcp.ownServers[0] ("${OWN_ID}")`);
    expect((await readManifest(web))?.mcp?.servers).toEqual([CURATED_ID]);
  });
});

describe("workspace sync — two members, one own id, different rows", () => {
  it("refuses before either member is touched, naming both and the id", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web"], { servers: [CURATED_ID] });
    const api = await seedMember(root, "apps/api", { servers: [OWN_ID], ownServers: [ownRowAt("2.4.0")] });
    const web = await seedMember(root, "apps/web", { servers: [OWN_ID], ownServers: [ownRowAt("2.5.0")] });
    const before = [await manifestBytes(api), await manifestBytes(web)];

    const result = await runSync(root);
    const doc = await syncDocument(root);

    expect(result.code).toBe(1);
    for (const text of [result.stderr, doc.error?.message ?? ""]) {
      expect(text).toContain("apps/api");
      expect(text).toContain("apps/web");
      expect(text).toContain(OWN_ID);
    }
    expect(doc.error?.code).toBe("VALIDATION_ERROR");
    expect([await manifestBytes(api), await manifestBytes(web)]).toEqual(before);
  });

  it("refuses a preview the same way, since the real run would be refused", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web"], undefined);
    await seedMember(root, "apps/api", { servers: [], ownServers: [ownRowAt("2.4.0")] });
    await seedMember(root, "apps/web", { servers: [], ownServers: [ownRowAt("2.5.0")] });

    expect((await runSync(root, ["--dry-run"])).code).toBe(1);
  });

  it("names the order that takes the old server down before a rename", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web"], undefined);
    await seedMember(root, "apps/api", { servers: [], ownServers: [ownRowAt("2.4.0")] });
    await seedMember(root, "apps/web", { servers: [], ownServers: [ownRowAt("2.5.0")] });

    const doc = await syncDocument(root);

    // A row renamed first can no longer prove the old client entry, which then keeps launching.
    expect(doc.error?.next).toContain("config mcp remove");
    expect(doc.error?.next).toContain("stamity sync");
  });

  it("names every clash in one refusal", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web"], undefined);
    const other = "acme-tickets";
    await seedMember(root, "apps/api", {
      servers: [],
      ownServers: [ownRowAt("2.4.0"), ownRow({ id: other, description: "One." })],
    });
    await seedMember(root, "apps/web", {
      servers: [],
      ownServers: [ownRowAt("2.5.0"), ownRow({ id: other, description: "Two." })],
    });

    const doc = await syncDocument(root);

    expect(doc.error?.message).toContain(OWN_ID);
    expect(doc.error?.message).toContain(other);
  });

  it("passes two members holding the same row", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web"], { servers: [CURATED_ID] });
    const api = await seedMember(root, "apps/api", { servers: [OWN_ID], ownServers: [ownRow()] });
    const web = await seedMember(root, "apps/web", { servers: [OWN_ID], ownServers: [ownRow()] });

    expect((await runSync(root)).code).toBe(0);
    expect((await readManifest(api))?.mcp?.servers).toEqual([CURATED_ID, OWN_ID]);
    expect((await readManifest(web))?.mcp?.servers).toEqual([CURATED_ID, OWN_ID]);
  });

  it("leaves a member it cannot read to the cascade, which reports that row", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web", "apps/gone"], { servers: [CURATED_ID] });
    const api = await seedMember(root, "apps/api", { servers: [OWN_ID], ownServers: [ownRow()] });
    await mkdir(join(root, "apps/web", STATE_DIR), { recursive: true });
    await writeFile(join(root, "apps/web", STATE_DIR, MANIFEST_FILE), "{ not json", "utf8");

    const doc = await syncDocument(root);

    expect(doc.error).toBeUndefined();
    expect(doc.repos?.map((row) => row.state)).toEqual(["synced", "failed", "failed"]);
    expect((await readManifest(api))?.mcp?.servers).toEqual([CURATED_ID, OWN_ID]);
  });

  it.skipIf(process.platform === "win32")(
    "reads no row through a link out of the root, and the cascade refuses that member",
    async () => {
      const temp = getTemp();
      await seedCorpus(temp);
      const root = await seedWorkspace(temp, ["apps/api", "apps/out"], { servers: [CURATED_ID] });
      await seedMember(root, "apps/api", { servers: [OWN_ID], ownServers: [ownRowAt("2.4.0")] });
      const outside = await seedMember(temp.path("outside"), ".", {
        servers: [OWN_ID],
        ownServers: [ownRowAt("2.5.0")],
      });
      await symlink(outside, join(root, "apps/out"), "dir");

      const doc = await syncDocument(root);

      expect(doc.error).toBeUndefined();
      expect(doc.repos?.map((row) => row.state)).toEqual(["synced", "failed"]);
    },
  );
});

describe("workspace sync — a block naming an own id", () => {
  it("serves the member holding the row and fails the one without, by name", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web"], { servers: [OWN_ID] });
    const api = await seedMember(root, "apps/api", { servers: [], ownServers: [ownRow()] });
    await seedMember(root, "apps/web", { servers: [] });

    const doc = await syncDocument(root);

    expect(doc.outcome).toBe("partial");
    expect(Object.keys(await launched(api))).toEqual([OWN_ID]);
    const web = doc.repos?.find((row) => row.repoPath === "apps/web");
    expect(web?.state).toBe("failed");
    expect(web?.error?.message).toContain(OWN_ID);
  });

  async function seedRowlessMember(): Promise<{ root: string; api: string; web: string }> {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, ["apps/api", "apps/web"], { servers: [OWN_ID] });
    const api = await seedMember(root, "apps/api", { servers: [], ownServers: [ownRow()] });
    const web = await seedMember(root, "apps/web", { servers: ["github"] });
    // A second tool, so the patch this member is owed carries more than `mcp`.
    await writeManifest(web, { ...memberWith({ servers: ["github"] }), tools: ["claude", "cursor"] }, { now: T0 });
    return { root, api, web };
  }

  function rowOf(doc: SyncDoc, repoPath: string): NonNullable<SyncDoc["repos"]>[number] | undefined {
    return doc.repos?.find((row) => row.repoPath === repoPath);
  }

  it("writes nothing to a member with no row, on the first run or the next", async () => {
    const { root, web } = await seedRowlessMember();
    const before = await manifestBytes(web);
    const expectRefused = async (doc: SyncDoc): Promise<void> => {
      const row = rowOf(doc, "apps/web");
      expect(row?.state).toBe("failed");
      expect(row?.error?.message).toContain(OWN_ID);
      // A patch that never landed is not reported as one.
      expect(row?.patched).toBeUndefined();
      expect(await manifestBytes(web)).toBe(before);
    };

    await expectRefused(await syncDocument(root));
    await expectRefused(await syncDocument(root));
    await expect(launched(web)).rejects.toThrow(/ENOENT/);
  });

  it("fails the same row under --dry-run, in the same words, and writes nothing", async () => {
    const { root, api, web } = await seedRowlessMember();
    const before = [await manifestBytes(api), await manifestBytes(web)];

    const preview = await runSync(root, ["--dry-run", "--json"]);
    const previewed = JSON.parse(preview.stdout) as SyncDoc;

    expect(preview.code).toBe(1);
    expect(previewed.outcome).toBe("partial");
    expect(rowOf(previewed, "apps/api")?.state).toBe("synced");
    expect(rowOf(previewed, "apps/api")?.patched).toEqual(["mcp"]);
    expect(rowOf(previewed, "apps/web")?.state).toBe("failed");
    expect([await manifestBytes(api), await manifestBytes(web)]).toEqual(before);

    const real = await syncDocument(root);

    expect(rowOf(real, "apps/web")?.error).toEqual(rowOf(previewed, "apps/web")?.error);
  });

  it.each([[[] as string[]], [["--dry-run"]]])(
    "leaves a member whose row fails the seam unwritten (%j)",
    async (args) => {
      const temp = getTemp();
      await seedCorpus(temp);
      const root = await seedWorkspace(temp, ["apps/api"], { servers: [CURATED_ID] });
      const api = await seedMember(root, "apps/api", {
        servers: [OWN_ID],
        ownServers: [ownRow({ pinnedVersion: "latest" })],
      });
      const before = await manifestBytes(api);

      const doc = await syncDocument(root, args);

      expect(rowOf(doc, "apps/api")?.state).toBe("failed");
      expect(rowOf(doc, "apps/api")?.error?.message).toContain(`mcp.ownServers[0] ("${OWN_ID}")`);
      expect(await manifestBytes(api)).toBe(before);
    },
  );
});

describe("workspace sync — a row typed into workspace.json", () => {
  it("names the key it does not read, and launches nothing from it", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const typed = { servers: [CURATED_ID], ownServers: [ownRow()] } as NonNullable<WorkspaceDefaults["mcp"]>;
    const root = await seedWorkspace(temp, ["apps/api"], typed);
    const api = await seedMember(root, "apps/api", { servers: [] });

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("defaults.mcp.ownServers");
    expect(Object.keys(await launched(api))).toEqual([CURATED_ID]);
    expect((await readManifest(api))?.mcp?.ownServers).toBeUndefined();
  });
});
