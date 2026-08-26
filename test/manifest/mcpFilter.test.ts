import { chmod, link, lstat, readFile, symlink, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterMcpJsonOnDisk,
  filterMcpServers,
  materializeUserMcpJson,
  parseMcpJsonDocument,
  planUserMcpJson,
  reduceMcpDocumentToUserContent,
} from "../../src/manifest/mcpFilter.ts";
import type * as AtomicWrite from "../../src/merge/atomicWrite.ts";
import type { PackSuppliedServer } from "../../src/mcp/catalog.ts";
import {
  emitClaudeMcpJson,
  emitVsCodeServersJson,
  engineOwnedServerIds,
} from "../../src/mcp/emit.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The write substrate is counted, not stubbed: every case still lands through
 * the real temp+rename writer, and the counter turns "left the file alone"
 * into an assertion rather than an inference from unchanged bytes.
 */
const writes = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock("../../src/merge/atomicWrite.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof AtomicWrite>();
  return {
    ...actual,
    atomicWriteFile: async (path: string, content: string): Promise<void> => {
      writes.paths.push(path);
      await actual.atomicWriteFile(path, content);
    },
  };
});

const getRepo = useTempDir("mcp-filter");

beforeEach(() => {
  writes.paths.length = 0;
});

const ids = (...names: string[]): ReadonlySet<string> => new Set(names);

/** A hand-added server, written exactly as it will be asserted to survive. */
const USER_BLOCK = `    "internal-tools": {
      "command": "node",
      "args": [
        "./scripts/mcp-internal.mjs"
      ],
      "env": {
        "INTERNAL_URL": "http://localhost:9000"
      },
      "note": "hand-added; do not touch"
    }`;

const MIXED_DOC = `{
  "$schema": "https://example.invalid/mcp.schema.json",
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.1.16"
      ]
    },
    "sentry": {
      "command": "npx",
      "args": [
        "-y",
        "@sentry/mcp-server@0.29.0"
      ]
    },
${USER_BLOCK}
  },
  "protocolVersion": "2026-06-18"
}
`;

function servers(content: string): Record<string, unknown> {
  const parsed = parseMcpJsonDocument(content);
  expect(parsed.ok, "expected a parseable document").toBe(true);
  return (parsed as { servers: Record<string, unknown> }).servers;
}

/** The `inputs` row ids of a document, in document order. Empty when it has none. */
function inputIds(raw: string): string[] {
  return ((JSON.parse(raw) as { inputs?: { id: string }[] }).inputs ?? []).map((row) => row.id);
}

// ── Parsing ──────────────────────────────────────────────────────

describe("parseMcpJsonDocument", () => {
  it("reads the Claude/Cursor mcpServers spelling", () => {
    const parsed = parseMcpJsonDocument('{"mcpServers":{"github":{"command":"npx"}}}');
    // `maps` added to the exact-shape assertion rather than the assertion
    // loosened: it is what every write-back reads to put each entry back under
    // the key it came from, so a shape check that ignored it would let the two
    // drift apart silently.
    expect(parsed).toEqual({
      ok: true,
      doc: { mcpServers: { github: { command: "npx" } } },
      servers: { github: { command: "npx" } },
      maps: ["mcpServers"],
    });
  });

  it("reads the VS Code servers spelling", () => {
    const parsed = parseMcpJsonDocument('{"inputs":[],"servers":{"github":{"command":"npx"}}}');
    expect(parsed.ok && parsed.servers).toEqual({ github: { command: "npx" } });
    expect(parsed.ok && parsed.maps).toEqual(["servers"]);
  });

  it("unions both spellings when a document carries them together", () => {
    // Justification for the changed expectation: this case previously asserted
    // that only `mcpServers` was read, and that was the defect rather than the
    // contract. Every discard path already treated BOTH keys as engine
    // territory, so the entries under the unread spelling were invisible to
    // ownership and stripped by the rewrite — silent deletion of an
    // operator-authored server on every sync. Precedence on a SHARED name is
    // unchanged and still asserted below.
    const parsed = parseMcpJsonDocument('{"servers":{"a":{}},"mcpServers":{"b":{}}}');

    expect(parsed.ok && Object.keys(parsed.servers).toSorted()).toEqual(["a", "b"]);
    expect(parsed.ok && parsed.maps).toEqual(["mcpServers", "servers"]);
  });

  it("keeps mcpServers ahead of servers on a name both spellings define", () => {
    const parsed = parseMcpJsonDocument(
      '{"servers":{"dupe":{"command":"vscode"}},"mcpServers":{"dupe":{"command":"claude"}}}',
    );
    expect(parsed.ok && parsed.servers).toEqual({ dupe: { command: "claude" } });
  });

  it("returns an empty map, not a failure, when the document has neither key", () => {
    const parsed = parseMcpJsonDocument('{"protocolVersion":"2026-06-18"}');
    expect(parsed.ok && parsed.servers).toEqual({});
    expect(parsed.ok && parsed.doc).toEqual({ protocolVersion: "2026-06-18" });
    // No contributing spelling, so a rewrite has none to introduce.
    expect(parsed.ok && parsed.maps).toEqual([]);
  });

  it("keeps non-object entries instead of dropping them", () => {
    // Dropping is a destructive edit to a document the user owns; the filter
    // carries an unrecognised entry through untouched.
    expect(parseMcpJsonDocument('{"mcpServers":{"broken":"nope"}}').ok).toBe(true);
    expect(servers('{"mcpServers":{"broken":"nope"}}')).toEqual({ broken: "nope" });
  });

  it("reports a syntax failure without throwing", () => {
    const parsed = parseMcpJsonDocument("{ not json");
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toBeTruthy();
  });

  it("rejects a top-level value that is not an object", () => {
    for (const [raw, described] of [
      ["[]", "an array"],
      ['"text"', "a string"],
      ["null", "null"],
      ["7", "a number"],
    ] as const) {
      const parsed = parseMcpJsonDocument(raw);
      expect(parsed.ok, raw).toBe(false);
      expect(!parsed.ok && parsed.error).toContain(described);
    }
  });
});

// ── Filtering ────────────────────────────────────────────────────

describe("filterMcpServers", () => {
  it("removes a managed server the selection dropped", () => {
    const result = filterMcpServers(MIXED_DOC, ids("github", "sentry"), ids("github"));

    expect(result.removed).toEqual(["sentry"]);
    expect(Object.keys(servers(result.content))).toEqual(["github", "internal-tools"]);
  });

  it("preserves a hand-added server byte-exact", () => {
    const result = filterMcpServers(MIXED_DOC, ids("github", "sentry"), new Set<string>());

    expect(result.removed).toEqual(["github", "sentry"]);
    expect(result.preservedUserServers).toEqual(["internal-tools"]);
    expect(result.content).toContain(USER_BLOCK);
    expect(servers(result.content)["internal-tools"]).toEqual(
      servers(MIXED_DOC)["internal-tools"],
    );
  });

  it("keeps top-level sibling fields and their order", () => {
    const result = filterMcpServers(MIXED_DOC, ids("sentry"), new Set<string>());
    const parsed = parseMcpJsonDocument(result.content);

    expect(parsed.ok && Object.keys(parsed.doc)).toEqual([
      "$schema",
      "mcpServers",
      "protocolVersion",
    ]);
    expect(parsed.ok && parsed.doc["protocolVersion"]).toBe("2026-06-18");
  });

  it("lets the ledger decide ownership, not the name", () => {
    // `github` is a catalog id, but this file's entry was never ledgered to us.
    const result = filterMcpServers(MIXED_DOC, ids("sentry"), new Set<string>());

    expect(result.removed).toEqual(["sentry"]);
    expect(result.preservedUserServers).toEqual(["github", "internal-tools"]);
    expect(servers(result.content)["github"]).toEqual(servers(MIXED_DOC)["github"]);
  });

  it("writes back under the spelling the document already used", () => {
    const vscode = '{\n  "servers": {\n    "github": {},\n    "mine": {}\n  }\n}\n';
    const result = filterMcpServers(vscode, ids("github"), new Set<string>());

    expect(result.content).toContain('"servers"');
    expect(result.content).not.toContain("mcpServers");
    expect(Object.keys(servers(result.content))).toEqual(["mine"]);
  });

  it("echoes an unreadable document instead of rewriting it", () => {
    const result = filterMcpServers("{ broken", ids("github"), new Set<string>());

    expect(result.content).toBe("{ broken");
    expect(result.unparseable).toBeTruthy();
    expect(result).toMatchObject({ removed: [], preservedUserServers: [] });
  });

  it("emits a present-but-empty map when everything managed was deselected", () => {
    const only = '{\n  "mcpServers": {\n    "github": {}\n  }\n}\n';
    expect(filterMcpServers(only, ids("github"), new Set<string>()).content).toBe(
      '{\n  "mcpServers": {}\n}\n',
    );
  });
});

// ── Both servers-map spellings in one document ───────────────────

/**
 * A client document carrying `mcpServers` AND `servers` at once.
 *
 * Not a hypothetical: an operator who runs two clients out of one file, or who
 * pasted a VS Code snippet into `.mcp.json`, produces exactly this. Only the
 * first spelling was read, while `holdsOnlyEngineContent` and the frame merge
 * both treated the two keys as engine territory when discarding — so entries
 * under the second map were invisible to every ownership judgement and stripped
 * by every rewrite. Three lanes carried the consequence: `sync` deleted
 * operator-authored servers, the reclaim sweep read a file that still held them
 * as engine-only, and `clean --pack` reported a count computed over half the
 * document. All three are asserted below.
 */
const DUAL_DOC = `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.1.16"
      ]
    }
  },
  "servers": {
    "sentry": {
      "command": "npx",
      "args": [
        "-y",
        "@sentry/mcp-server@0.29.0"
      ]
    },
    "their-own": {
      "command": "node",
      "args": [
        "./scripts/theirs.mjs"
      ]
    }
  }
}
`;

/** Entries under one spelling of a rendered document, in document order. */
function under(content: string, key: "mcpServers" | "servers"): string[] {
  return Object.keys((JSON.parse(content) as Record<string, Record<string, unknown>>)[key] ?? {});
}

describe("documents carrying both servers-map spellings", () => {
  it("judges entries in the second map instead of dropping them unseen", () => {
    // `their-own` sits under `servers` and the ledger never claimed it.
    const result = filterMcpServers(DUAL_DOC, ids("github", "sentry"), ids("github"));

    expect(result.removed).toEqual(["sentry"]);
    expect(result.preservedUserServers).toEqual(["their-own"]);
    // Pre-fix, `their-own` was neither preserved nor removed — it was simply
    // absent from the rewritten document.
    expect(under(result.content, "servers")).toEqual(["their-own"]);
    expect(under(result.content, "mcpServers")).toEqual(["github"]);
  });

  it("keeps each surviving entry under the key it came from", () => {
    // Write-back stability: the entries must not migrate between the two keys
    // their clients read separately.
    const result = filterMcpServers(DUAL_DOC, ids("sentry"), new Set<string>());

    expect(under(result.content, "mcpServers")).toEqual(["github"]);
    expect(under(result.content, "servers")).toEqual(["their-own"]);
  });

  it("merges into a two-map document without moving or losing an entry", async () => {
    const path = getRepo().path(".mcp.json");
    await writeFile(path, DUAL_DOC, "utf8");

    // `sentry` is managed and deselected; `github` is managed and refreshed;
    // `their-own` is the operator's; `context7` is a fresh emission.
    const merged = await materializeUserMcpJson(
      path,
      emitClaudeMcpJson(["github", "context7"]),
      ids("github", "sentry"),
    );
    const written = await readFile(path, "utf8");

    expect(merged.action).toBe("updated");
    expect(Object.keys(servers(written)).toSorted()).toEqual(["context7", "github", "their-own"]);
    // The addition lands in the primary map; the operator's entry stays in its
    // own; neither key gains the other's contents.
    expect(under(written, "mcpServers")).toEqual(["github", "context7"]);
    expect(under(written, "servers")).toEqual(["their-own"]);
  });

  it("does not add the other spelling to a document that carried one", async () => {
    const path = getRepo().path(".vscode/mcp.json");
    await getRepo().seedFiles({ ".vscode/mcp.json": '{\n  "servers": {\n    "mine": {}\n  }\n}\n' });

    await materializeUserMcpJson(path, emitClaudeMcpJson(["github"]), ids("github"));
    const written = await readFile(path, "utf8");

    expect(Object.keys(JSON.parse(written) as object)).toEqual(["servers"]);
    expect(under(written, "servers")).toEqual(["mine", "github"]);
  });

  it("refuses to call a two-map document engine-only while the operator's half survives", () => {
    // The reclaim lane's leg. Ownership is computed by the real re-render, so
    // both maps have to be visible to it — otherwise the sweep sees an emptied
    // first map, calls the file engine-only, and unlinks a document still
    // holding a hand-added server.
    const engineHalf = JSON.parse(emitClaudeMcpJson(["github"])) as {
      mcpServers: Record<string, unknown>;
    };
    const onDisk = `${JSON.stringify(
      {
        mcpServers: engineHalf.mcpServers,
        servers: { "their-own": { command: "node", args: ["./scripts/theirs.mjs"] } },
      },
      null,
      2,
    )}\n`;

    const reduction = reduceMcpDocumentToUserContent(
      onDisk,
      engineOwnedServerIds(".mcp.json", [], onDisk, []),
    );

    expect(reduction.kind).toBe("reduced");
    const left = reduction.kind === "reduced" ? reduction.content : "";
    expect(Object.keys(servers(left))).toEqual(["their-own"]);
    expect(under(left, "servers")).toEqual(["their-own"]);
  });
});

// ── On disk ──────────────────────────────────────────────────────

describe("filterMcpJsonOnDisk", () => {
  it("reports nothing to do when the file does not exist", async () => {
    const path = getRepo().path(".mcp.json");
    expect(await filterMcpJsonOnDisk(path, ids("github"), new Set<string>())).toBeNull();
    expect(writes.paths).toEqual([]);
  });

  it("rewrites the file when a managed server was deselected", async () => {
    const path = getRepo().path(".mcp.json");
    await writeFile(path, MIXED_DOC, "utf8");

    const result = await filterMcpJsonOnDisk(path, ids("github", "sentry"), ids("github"));

    expect(result?.removed).toEqual(["sentry"]);
    expect(writes.paths).toEqual([path]);
    expect(await readFile(path, "utf8")).toBe(result?.content);
    expect(await readFile(path, "utf8")).toContain(USER_BLOCK);
  });

  it("leaves the file alone — formatting included — when nothing was removed", async () => {
    const path = getRepo().path(".mcp.json");
    const original = '{\n    "mcpServers": {\n        "github": {}\n    }\n}\n';
    await writeFile(path, original, "utf8");

    const result = await filterMcpJsonOnDisk(path, ids("github"), ids("github"));

    expect(result?.removed).toEqual([]);
    expect(result?.content).toBe(original);
    expect(writes.paths).toEqual([]);
    expect(await readFile(path, "utf8")).toBe(original);
  });

  it("never clobbers a file it cannot parse", async () => {
    const path = getRepo().path(".mcp.json");
    await writeFile(path, "{ not json at all", "utf8");

    const result = await filterMcpJsonOnDisk(path, ids("github"), new Set<string>());

    expect(result?.unparseable).toBeTruthy();
    expect(writes.paths).toEqual([]);
    expect(await readFile(path, "utf8")).toBe("{ not json at all");
  });
});

// ── Reclaim ──────────────────────────────────────────────────────

/**
 * The class-specific reduction the reclaim sweep runs once a client MCP document
 * has left emission entirely (`src/merge/reclaim.ts` gate 4). It answers ONE
 * question — what is left of this file once every entry the engine can prove it
 * wrote is taken out — and the sweep does every read and every write.
 *
 * The regression behind it: both writers record the hash of the MERGED bytes, so
 * an untouched co-owned document matches its ledger hash exactly. Read as proof
 * of sole authorship that match unlinked a `.mcp.json` carrying a hand-added
 * server, silently and with no backup. `engine-only` is therefore the only
 * verdict that may license an unlink, and it is asserted here to require BOTH
 * an emptied servers map and no operator field beside it.
 */
/** The engine's own rendering, so ownership is proved the way production proves it. */
const engineDoc = (selected: readonly string[]): string => emitClaudeMcpJson(selected);

/** The engine's document with a hand-added entry appended to the servers map. */
function withUserServer(raw: string): string {
  const doc = JSON.parse(raw) as { mcpServers: Record<string, unknown> };
  doc.mcpServers["internal-tools"] = { command: "node", args: ["./scripts/mcp-internal.mjs"] };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

describe("reduceMcpDocumentToUserContent", () => {
  const CLAUDE_DOC = ".mcp.json";

  /** `raw` reduced under the ownership set the sweep would compute for it. */
  const reduce = (raw: string): ReturnType<typeof reduceMcpDocumentToUserContent> =>
    reduceMcpDocumentToUserContent(raw, engineOwnedServerIds(CLAUDE_DOC, [], raw, []));

  it("keeps a hand-added server and removes only the engine's own entries", () => {
    const reduction = reduce(withUserServer(engineDoc(["github"])));

    expect(reduction.kind).toBe("reduced");
    const left = servers(reduction.kind === "reduced" ? reduction.content : "");
    expect(Object.keys(left)).toEqual(["internal-tools"]);
    expect(left["internal-tools"]).toEqual({
      command: "node",
      args: ["./scripts/mcp-internal.mjs"],
    });
  });

  it("reports engine-only when the document holds nothing else", () => {
    // The uninstall the reduction must not cost: a document that really is the
    // engine's alone still earns the unlink the sweep would otherwise skip.
    expect(reduce(engineDoc(["github"])).kind).toBe("engine-only");
  });

  it("refuses engine-only while a top-level field the operator set survives", () => {
    const doc = JSON.parse(engineDoc(["github"])) as Record<string, unknown>;
    const withField = `${JSON.stringify({ $schema: "https://example.invalid/s.json", ...doc }, null, 2)}\n`;

    // An emptied servers map is not "nothing of theirs left": an unlink here
    // would take a field the engine never wrote with it.
    const reduction = reduce(withField);
    expect(reduction.kind).toBe("reduced");
    expect(reduction.kind === "reduced" && JSON.parse(reduction.content)).toMatchObject({
      $schema: "https://example.invalid/s.json",
    });
  });

  it("claims nothing in a document whose entries were hand-tuned", () => {
    const tuned = '{\n  "mcpServers": {\n    "github": { "command": "npx", "args": ["--mine"] }\n  }\n}\n';

    // Ownership is proved by re-rendering, so an operator who edited the engine's
    // entry owns it from that moment — and an untouched verdict means the sweep
    // writes nothing at all.
    expect(reduce(tuned).kind).toBe("untouched");
  });

  it("never claims a document it cannot parse", () => {
    const reduction = reduce("{ not json at all");

    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("not valid JSON");
  });
});

describe("filterMcpServers — orphaned `inputs` rows", () => {
  const VSCODE_DOC = ".vscode/mcp.json";

  /** Ids `filterMcpServers` leaves behind after dropping `managed` entirely. */
  const survivingInputIds = (raw: string, managed: ReadonlySet<string>): string[] =>
    inputIds(filterMcpServers(raw, managed, new Set<string>()).content);

  it("drops the credential prompt of an entry the filter just removed", () => {
    const onDisk = emitVsCodeServersJson(["github", "sentry"]);
    const managed = engineOwnedServerIds(VSCODE_DOC, [], onDisk, []);
    const before = inputIds(onDisk);

    const after = survivingInputIds(onDisk, managed);

    // The merge lane rebuilds `inputs` from its emitted array; the filter has no
    // emission to rebuild from, so it prunes — and without the prune a removed
    // server left its VS Code prompt behind to be asked for forever.
    expect(before.length).toBeGreaterThan(0);
    expect(after).toEqual([]);
  });

  it("keeps a row a surviving hand-added server still references", () => {
    const emitted = JSON.parse(emitVsCodeServersJson(["sentry"])) as {
      servers: Record<string, unknown>;
      inputs: { id: string }[];
    };
    const shared = emitted.inputs[0]?.id ?? "";
    emitted.servers["internal-tools"] = { command: "node", args: [`\${input:${shared}}`] };
    const onDisk = `${JSON.stringify(emitted, null, 2)}\n`;

    const after = survivingInputIds(onDisk, engineOwnedServerIds(VSCODE_DOC, [], onDisk, []));

    expect(shared).not.toBe("");
    expect(after).toEqual([shared]);
  });

  it("leaves an `inputs` array alone in a document whose removals reference none", () => {
    // `.mcp.json` and `.cursor/mcp.json` render no `${input:…}`, so an `inputs`
    // array there is the operator's own and the prune must never reach it.
    const doc = JSON.parse(emitClaudeMcpJson(["github"])) as Record<string, unknown>;
    const onDisk = `${JSON.stringify({ ...doc, inputs: [{ id: "mine", type: "promptString" }] }, null, 2)}\n`;

    const after = survivingInputIds(onDisk, engineOwnedServerIds(".mcp.json", [], onDisk, []));

    expect(after).toEqual(["mine"]);
  });
});

// ── Materialization ──────────────────────────────────────────────

describe("materializeUserMcpJson", () => {
  const emitted = '{\n  "mcpServers": {\n    "github": {\n      "command": "npx"\n    }\n  }\n}\n';

  it("creates the file when nothing is there", async () => {
    const path = getRepo().path(".stamity/mcp/mcp.json");
    const result = await materializeUserMcpJson(path, emitted, ids("github"));

    // `writtenContent` added to the exact-shape assertion rather than the
    // assertion loosened: it is the field the ledger hashes, so an exact-shape
    // check that ignored it would let the two drift apart silently.
    expect(result).toEqual({ path, action: "created", writtenContent: emitted });
    expect(await readFile(path, "utf8")).toBe(emitted);
  });

  it("refreshes managed definitions and drops deselected ones", async () => {
    const path = getRepo().path(".mcp.json");
    await writeFile(path, MIXED_DOC, "utf8");

    const result = await materializeUserMcpJson(path, emitted, ids("github", "sentry"));

    expect(result.action).toBe("updated");
    const written = await readFile(path, "utf8");
    expect(Object.keys(servers(written))).toEqual(["github", "internal-tools"]);
    expect(servers(written)["github"]).toEqual({ command: "npx" });
    expect(written).toContain(USER_BLOCK);
  });

  it("keeps the user's frame and adds fields only the emitted document has", async () => {
    const path = getRepo().path(".mcp.json");
    await writeFile(path, MIXED_DOC, "utf8");

    await materializeUserMcpJson(
      path,
      '{"protocolVersion":"2026-11-05","inputs":[],"mcpServers":{"github":{"command":"npx"}}}',
      ids("github", "sentry"),
    );

    const parsed = parseMcpJsonDocument(await readFile(path, "utf8"));
    expect(parsed.ok && parsed.doc["protocolVersion"]).toBe("2026-06-18");
    expect(parsed.ok && parsed.doc["$schema"]).toBe("https://example.invalid/mcp.schema.json");
    expect(parsed.ok && parsed.doc["inputs"]).toEqual([]);
  });

  it("carries exactly one servers map when the target uses the VS Code spelling", async () => {
    const repo = getRepo();
    const path = repo.path(".vscode/mcp.json");
    await repo.seedFiles({ ".vscode/mcp.json": '{\n  "servers": {\n    "mine": {}\n  }\n}\n' });

    await materializeUserMcpJson(path, emitted, ids("github"));

    const parsed = parseMcpJsonDocument(await readFile(path, "utf8"));
    expect(parsed.ok && Object.keys(parsed.doc)).toEqual(["servers"]);
    expect(parsed.ok && Object.keys(parsed.servers)).toEqual(["mine", "github"]);
  });

  it("keeps the user's definition when an unmanaged entry collides with an emitted one", async () => {
    const path = getRepo().path(".mcp.json");
    await writeFile(path, MIXED_DOC, "utf8");

    const result = await materializeUserMcpJson(path, emitted, ids("sentry"));

    expect(result.action).toBe("updated");
    expect(result.warning).toContain("kept your own definition of github");
    expect(servers(await readFile(path, "utf8"))["github"]).toEqual(servers(MIXED_DOC)["github"]);
  });

  it("does not rewrite a file that already holds the merged result", async () => {
    const path = getRepo().path(".mcp.json");
    await writeFile(path, emitted, "utf8");
    writes.paths.length = 0;

    const result = await materializeUserMcpJson(path, emitted, ids("github"));

    // The `unchanged` case is the one that matters most for the added field:
    // nothing was WRITTEN, so a naive implementation reports no content and the
    // caller falls back to hashing the emission. What the file holds is the
    // merged document either way, and that is what the ledger must record.
    expect(result).toEqual({ path, action: "unchanged", writtenContent: emitted });
    expect(writes.paths).toEqual([]);
  });

  it("skips a target it cannot parse, and says why", async () => {
    const path = getRepo().path(".mcp.json");
    await writeFile(path, "{ hand-edited into invalid json", "utf8");

    const result = await materializeUserMcpJson(path, emitted, ids("github"));

    expect(result.action).toBe("skipped");
    expect(result.warning).toContain("left untouched");
    expect(writes.paths).toEqual([]);
    expect(await readFile(path, "utf8")).toBe("{ hand-edited into invalid json");
  });

  it("fails loudly when the emitted document itself is not valid JSON", async () => {
    const path = getRepo().path(".mcp.json");
    await expect(materializeUserMcpJson(path, "not json", ids("github"))).rejects.toThrow(
      EngineError,
    );
    await expect(materializeUserMcpJson(path, "not json", ids("github"))).rejects.toThrow(
      /emitted MCP document is not valid JSON/,
    );
    expect(writes.paths).toEqual([]);
  });

  it("composes with the real emitter across a deselection", async () => {
    const path = getRepo().path(".mcp.json");
    const managed = ids("github", "context7");

    expect((await materializeUserMcpJson(path, emitClaudeMcpJson(["github", "context7"]), managed)).action).toBe(
      "created",
    );

    const result = await materializeUserMcpJson(path, emitClaudeMcpJson(["context7"]), managed);

    expect(result.action).toBe("updated");
    expect(Object.keys(servers(await readFile(path, "utf8")))).toEqual(["context7"]);
  });
});

// ── Derived `inputs` ─────────────────────────────────────────────

/**
 * VS Code's `inputs` is the one top-level field the user frame does NOT win,
 * because it is not the user's: `../../src/mcp/emit.ts::emitVsCodeServersJson`
 * DERIVES it from the selected servers' `requiresEnv`.
 *
 * Under the plain frame merge the engine's own previous rows outlived the
 * servers they belonged to — `{...emitted, ...existing}` cannot tell its last
 * emission from an operator edit, so it kept the on-disk array — and a
 * deselected server's credential prompt stayed in `.vscode/mcp.json` forever
 * after its entry had left `servers`. These cases run the REAL emitter and the
 * REAL ownership computation, and assert both directions: the derived row goes,
 * the operator's row stays.
 */
describe("VS Code `inputs` rebuilt from the merged servers map", () => {
  const VSCODE_DOC = ".vscode/mcp.json";
  const PACK_ID = "acme-telemetry";
  const PACK_SERVERS: readonly PackSuppliedServer[] = [
    {
      id: PACK_ID,
      description: "Deployment telemetry queries.",
      command: "npx",
      args: ["-y", "@acme/telemetry-mcp@3.2.1", "--token", "${env:ACME_TELEMETRY_TOKEN}"],
      transport: "stdio",
      pinnedVersion: "3.2.1",
      packageNameLock: "@acme/telemetry-mcp",
      firstParty: false,
      blastRadius: "Low — read-only telemetry queries.",
      docsUrl: "https://example.invalid/acme-telemetry",
      sourcePackId: "opspack",
      requiresEnv: [
        {
          name: "ACME_TELEMETRY_TOKEN",
          comment: "Read-only telemetry API token",
          url: "https://example.invalid/acme-telemetry/tokens",
        },
      ],
    },
  ];

  const emit = (selected: readonly string[]): string =>
    emitVsCodeServersJson(selected, { packServers: PACK_SERVERS });

  /** The merge a deselection of `PACK_ID` produces, from the real emitted bytes. */
  const deselect = (onDisk: string): string => {
    const plan = planUserMcpJson(
      VSCODE_DOC,
      emit(["github"]),
      engineOwnedServerIds(VSCODE_DOC, ["github"], onDisk, PACK_SERVERS),
      onDisk,
    );
    return plan.content ?? onDisk;
  };

  it("drops the credential prompt of a server the merge just removed", () => {
    const onDisk = emit(["github", PACK_ID]);
    expect(inputIds(onDisk)).toContain("acme-telemetry-token");

    const merged = deselect(onDisk);

    expect(Object.keys(servers(merged))).toEqual(["github"]);
    // The residue this case exists for: `servers` lost the entry while `inputs`
    // kept its prompt row, because the on-disk array won the frame merge.
    expect(inputIds(merged)).toEqual(["github-pat"]);
  });

  it("keeps a prompt row a hand-added server still references", () => {
    const doc = JSON.parse(emit(["github", PACK_ID])) as {
      inputs: unknown[];
      servers: Record<string, unknown>;
    };
    doc.servers["internal-tools"] = {
      type: "stdio",
      command: "node",
      args: ["./scripts/internal-mcp.mjs", "--key", "${input:my-own-secret}"],
    };
    doc.inputs.push({ type: "promptString", id: "my-own-secret", password: true });
    const onDisk = `${JSON.stringify(doc, null, 2)}\n`;

    const merged = deselect(onDisk);

    // The no-false-positive half. The rebuild is driven by what the merged
    // servers map REFERENCES, so an operator's own prompt row survives on the
    // strength of their own server — the engine never wrote either one.
    expect(Object.keys(servers(merged))).toEqual(["github", "internal-tools"]);
    expect(inputIds(merged)).toEqual(["github-pat", "my-own-secret"]);
  });

  it("leaves an `inputs` array alone in a dialect that emits none", async () => {
    const path = getRepo().path(".mcp.json");
    // `.mcp.json` renders `${VAR}`, never `${input:…}`, so nothing there can
    // reference a prompt row. Rebuilding from references would delete every row
    // the operator put in this file — the field is theirs in this dialect and
    // keeps the user-frame-wins rule.
    const onDisk = `${JSON.stringify(
      { inputs: [{ type: "promptString", id: "mine" }], mcpServers: { github: { command: "old" } } },
      null,
      2,
    )}\n`;
    await writeFile(path, onDisk, "utf8");

    await materializeUserMcpJson(path, emitClaudeMcpJson(["github"]), ids("github"));

    expect(inputIds(await readFile(path, "utf8"))).toEqual(["mine"]);
  });
});

// ── Pack-supplied ids ────────────────────────────────────────────

/**
 * This module consults no server table, which is exactly why a pack-supplied id
 * cannot be dropped as "unknown" — unknown is not a category the filter has. It
 * knows `managedIds` and `selectedIds`, and the caller computes the first over
 * curated AND pack rows (`../../src/mcp/emit.ts::engineOwnedServerIds`). These
 * cases run the REAL emitter and the REAL ownership computation over a pack row
 * so the claim is proved end to end rather than asserted about the argument
 * shapes.
 */
describe("pack-supplied ids in the filtered-config path", () => {
  const PACK_ID = "acme-telemetry";
  const PACK_SERVERS: readonly PackSuppliedServer[] = [
    {
      id: PACK_ID,
      description: "Deployment telemetry queries.",
      command: "npx",
      args: ["-y", "@acme/telemetry-mcp@3.2.1"],
      transport: "stdio",
      pinnedVersion: "3.2.1",
      packageNameLock: "@acme/telemetry-mcp",
      firstParty: false,
      blastRadius: "Low — read-only telemetry queries.",
      docsUrl: "https://example.invalid/acme-telemetry",
      sourcePackId: "opspack",
    },
  ];

  /** The document the engine renders for `selected`, pack supply included. */
  const emit = (selected: readonly string[]): string =>
    emitClaudeMcpJson(selected, { packServers: PACK_SERVERS });

  it("removes a deselected pack entry and keeps the operator's own beside it", () => {
    const doc = `{
  "mcpServers": {
    "github": ${JSON.stringify(servers(emit(["github"]))["github"], null, 4)},
    "${PACK_ID}": ${JSON.stringify(servers(emit([PACK_ID]))[PACK_ID], null, 4)},
${USER_BLOCK}
  }
}
`;
    // Two managed ids, one curated and one pack-supplied, both deselected: the
    // pack id leaves on the same terms as the curated one.
    const result = filterMcpServers(doc, ids("github", PACK_ID), new Set<string>());

    expect(result.removed.toSorted()).toEqual([PACK_ID, "github"]);
    expect(result.preservedUserServers).toEqual(["internal-tools"]);
    expect(Object.keys(servers(result.content))).toEqual(["internal-tools"]);
  });

  it("refreshes a managed pack entry from the emitted document rather than preserving it stale", async () => {
    const path = getRepo().path(".mcp.json");
    const stale = JSON.stringify(
      { mcpServers: { [PACK_ID]: { command: "npx", args: ["-y", "@acme/telemetry-mcp@3.0.0"] } } },
      null,
      2,
    );
    await writeFile(path, `${stale}\n`, "utf8");

    // The ownership set is the real computation over the real bytes — the leg
    // that would judge the pack entry a user row if `engineOwnedServerIds` did
    // not count pack supply, leaving the old pin on disk forever.
    const managed = engineOwnedServerIds(".mcp.json", [PACK_ID], `${stale}\n`, PACK_SERVERS);
    const result = await materializeUserMcpJson(path, emit([PACK_ID]), managed);

    expect(result.action).toBe("updated");
    expect(result.warning).toBeUndefined();
    expect(servers(await readFile(path, "utf8"))[PACK_ID]).toEqual(
      servers(emit([PACK_ID]))[PACK_ID],
    );
  });

  it("runs the whole lane: a pack server selected, then deselected, then gone", async () => {
    const path = getRepo().path(".mcp.json");

    const created = await materializeUserMcpJson(
      path,
      emit([PACK_ID]),
      engineOwnedServerIds(".mcp.json", [PACK_ID], null, PACK_SERVERS),
    );
    expect(created.action).toBe("created");
    expect(Object.keys(servers(await readFile(path, "utf8")))).toEqual([PACK_ID]);

    // Deselected: the entry is proved the engine's by re-rendering it, so it
    // leaves instead of lingering as an unowned user row.
    const existing = await readFile(path, "utf8");
    const removed = await materializeUserMcpJson(
      path,
      emit([]),
      engineOwnedServerIds(".mcp.json", [], existing, PACK_SERVERS),
    );
    expect(removed.action).toBe("updated");
    expect(Object.keys(servers(await readFile(path, "utf8")))).toEqual([]);
  });

  it("leaves a hand-tuned pack entry alone, exactly as it would a curated one", async () => {
    const path = getRepo().path(".mcp.json");
    const tuned = `{\n  "mcpServers": {\n    "${PACK_ID}": {\n      "command": "npx",\n      "args": [\n        "-y",\n        "@acme/telemetry-mcp@3.2.1",\n        "--my-flag"\n      ]\n    }\n  }\n}\n`;
    await writeFile(path, tuned, "utf8");

    const managed = engineOwnedServerIds(".mcp.json", [], tuned, PACK_SERVERS);
    const result = await materializeUserMcpJson(path, emit([PACK_ID]), managed);

    expect(result.warning).toContain(`kept your own definition of ${PACK_ID}`);
    expect(servers(await readFile(path, "utf8"))[PACK_ID]).toEqual(servers(tuned)[PACK_ID]);
  });
});

// ── Link guard ───────────────────────────────────────────────────

/**
 * Every writer in this module PRESERVES the document's own top-level fields and
 * republishes them, which is the primitive the merge lanes refuse on a name
 * whose bytes are not that file's alone. The guard lives on the writers rather
 * than on their callers, and this is the suite that says so: `sync` carried a
 * check of its own and `init` did not, so `init --migrate full` over a
 * predecessor carrying `mcp.servers` walked a planted `.mcp.json` straight to
 * the write and published `client_secret` and `refresh_token` into the tree at
 * exit 0.
 *
 * A gcloud ADC file is the fixture because it is the shape that makes this lane
 * distinct from every other link case in the engine: it is valid JSON, so the
 * merge parses it, likes it, and keeps its fields one by one. There is no
 * malformed-input path to catch this one.
 */
describe.skipIf(process.platform === "win32")("linked target refusal", () => {
  const CANARY = "GOCSPX-CANARY-PRIVATE-KEY-MATERIAL";
  const emitted = '{\n  "mcpServers": {\n    "github": {\n      "command": "npx"\n    }\n  }\n}\n';

  /** A 0600 credentials document outside the repo, in the shape gcloud writes. */
  async function plantCredentials(name: string): Promise<string> {
    const credPath = getRepo().path(name);
    await writeFile(
      credPath,
      `${JSON.stringify(
        {
          client_id: "1234.apps.googleusercontent.com",
          client_secret: CANARY,
          refresh_token: `1//RT-${CANARY}`,
          type: "authorized_user",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await chmod(credPath, 0o600);
    return credPath;
  }

  it("refuses to merge into a hard-linked document, before reading a byte of it", async () => {
    const cred = await plantCredentials("adc-hardlink.json");
    const target = getRepo().path(".mcp.json");
    await link(cred, target);
    const before = await lstat(target);
    const original = await readFile(cred, "utf8");

    await expect(materializeUserMcpJson(target, emitted, ids("github"))).rejects.toMatchObject({
      code: "FS_ERROR",
      message: expect.stringContaining("hard link"),
    });

    // The leak signature in full: a fresh independent inode at the repo path,
    // nlink dropped to 1, and the canary carried into it beside the emitted
    // block. One inode under both names is the proof none of it happened —
    // mode is the third leg, not the discriminator, since the substrate
    // preserves it now (`merge/atomicWrite.ts::existingFileMode`).
    const after = await lstat(target);
    expect(after.ino).toBe(before.ino);
    expect(after.nlink).toBe(2);
    expect(after.mode & 0o777).toBe(0o600);
    expect(writes.paths).toEqual([]);
    await expect(readFile(target, "utf8")).resolves.toBe(original);
    expect(await readFile(target, "utf8")).not.toContain("mcpServers");
  });

  it("refuses to merge into a symlinked document rather than replacing the link", async () => {
    const cred = await plantCredentials("adc-symlink.json");
    const target = getRepo().path(".mcp.json");
    await symlink(cred, target);
    const original = await readFile(cred, "utf8");

    await expect(materializeUserMcpJson(target, emitted, ids("github"))).rejects.toMatchObject({
      code: "FS_ERROR",
      message: expect.stringContaining("symbolic link"),
    });

    // The symlink half is not the hard link's easier cousin — it is worse in one
    // direction. Temp+rename would REPLACE the link with a regular file, so the
    // operator loses the link as well as the target's fields to the tree. The
    // entry is still a link, and the target is untouched.
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
    expect(writes.paths).toEqual([]);
    await expect(readFile(cred, "utf8")).resolves.toBe(original);
    expect((await lstat(cred)).mode & 0o777).toBe(0o600);
  });

  it("guards the filter entry point on the same footing", async () => {
    const cred = await plantCredentials("adc-filter.json");
    const target = getRepo().path(".mcp.json");
    await link(cred, target);
    const before = await lstat(target);

    // Filtering keeps every entry but the deselections and republishes the rest
    // — the same preserve-and-republish shape, so the same refusal. No command
    // wires this entry point up today, which is the reason to close it now
    // rather than to leave it for whoever does.
    await expect(
      filterMcpJsonOnDisk(target, ids("github"), new Set<string>()),
    ).rejects.toMatchObject({ code: "FS_ERROR" });

    expect((await lstat(target)).ino).toBe(before.ino);
    expect(writes.paths).toEqual([]);
  });

  it("still creates a document at a path that does not exist", async () => {
    const path = getRepo().path("fresh/.mcp.json");

    // ENOENT is not a linked target: the guard falls through so `created` and
    // the `null` return of the filter both still work.
    expect((await materializeUserMcpJson(path, emitted, ids("github"))).action).toBe("created");
    expect(await filterMcpJsonOnDisk(getRepo().path("absent.json"), ids("x"), ids("x"))).toBeNull();
  });

  it("classifies an errno that is not ENOENT rather than reading it as unlinked", async () => {
    const blocker = getRepo().path("not-a-directory");
    await writeFile(blocker, "regular file\n", "utf8");

    // Justification for the changed expectation: this case used to pin
    // `code: "ENOTDIR"` — a RAW Node errno escaping the writer — as the
    // contract, while every sibling failure in the module produces an
    // `EngineError` naming the file and the next step. The behaviour moved, so
    // the assertion moves with it. What it still proves is unchanged and is the
    // reason the case exists: only ENOENT may mean "nothing there", so a
    // non-ENOENT failure must stop the lane rather than be read as a cleared
    // path and handed to the write.
    let thrown: unknown;
    try {
      await materializeUserMcpJson(`${blocker}/.mcp.json`, emitted, ids("github"));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("FS_ERROR");
    expect((thrown as EngineError).message).toContain("a parent path component is a file");
    expect((thrown as EngineError).message).toContain(blocker);
    // The original errno rides along, so nothing is lost by classifying it.
    expect(((thrown as EngineError).cause as NodeJS.ErrnoException | undefined)?.code).toBe(
      "ENOTDIR",
    );
    expect(writes.paths).toEqual([]);
  });

  it("classifies a permission-denied read with the remedy, not a syscall name", async () => {
    const target = getRepo().path(".mcp.json");
    await writeFile(target, '{\n  "mcpServers": {}\n}\n', "utf8");
    await chmod(target, 0o000);

    // The merge READS before it writes — it preserves the operator's top-level
    // fields — so an unreadable target stops the lane at the read. The bare
    // errno named `open` and nothing else; an operator needs to be told it is a
    // permission on this file and that the document is merged rather than
    // overwritten, which is why it has to be readable at all.
    let thrown: unknown;
    try {
      await materializeUserMcpJson(target, emitted, ids("github"));
    } catch (error) {
      thrown = error;
    } finally {
      await chmod(target, 0o600);
    }

    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("FS_ERROR");
    expect((thrown as EngineError).message).toContain("Permission denied reading");
    expect((thrown as EngineError).message).toContain("merged rather than overwritten");
    expect(writes.paths).toEqual([]);
  });

  it("merges an ordinary single-named document and keeps the mode the operator set", async () => {
    const target = getRepo().path(".mcp.json");
    await writeFile(target, '{\n  "mcpServers": {\n    "mine": {\n      "command": "own"\n    }\n  }\n}\n', "utf8");
    await chmod(target, 0o600);

    // The no-false-positive half: nlink == 1 with no link in sight is every MCP
    // document an operator ever wrote, and the guard has to be invisible on all
    // of them. The mode assertion is the second finding's lane-level leg — this
    // writer republishes through temp+rename, so before the substrate preserved
    // mode a deliberately private document came back 0644.
    const result = await materializeUserMcpJson(target, emitted, ids("github"));

    expect(result.action).toBe("updated");
    expect(Object.keys(servers(await readFile(target, "utf8"))).toSorted()).toEqual([
      "github",
      "mine",
    ]);
    expect((await lstat(target)).mode & 0o777).toBe(0o600);
  });
});
