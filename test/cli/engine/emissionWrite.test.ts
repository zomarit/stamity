import { createHash } from "node:crypto";
import { chmod, link, lstat, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CODEX_CONFIG_FILE, codexConfigTableRendering } from "../../../src/adapters/codex.ts";
import { createManifest } from "../../../src/manifest/manifest.ts";
import { materializeUserMcpJson } from "../../../src/manifest/mcpFilter.ts";
import {
  ledgerHashIndex,
  ledgerPathSet,
  predictMergeAction,
  safeWriteFile,
} from "../../../src/merge/safeWrite.ts";
import {
  coOwnedDocumentLanes,
  coOwnedOwnershipOf,
  coOwnedHookDocuments,
  coOwnedReclaimReducers,
  coOwnedReclaimRenderings,
  installedPackServers,
  ledgerRowsForOutput,
  outputWriteOptions,
  predictMcpDocumentMerge,
  readIfExists,
  rowsCarriedThroughSweep,
  sha256,
} from "../../../src/cli/engine/emissionWrite.ts";
import type { ReclaimActionEntry, ReclaimReport } from "../../../src/merge/reclaim.ts";
import type { AdapterOutput } from "../../../src/types/content.ts";
import type { LedgerEntry, SetupManifest } from "../../../src/types/manifest.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The write contract `init` and `sync` share.
 *
 * Every case here is about AGREEMENT, not about the arithmetic: these four
 * primitives used to exist twice, once per verb, and each one is silent when
 * the copies drift — a ledger row is a claim of authorship over a user's files,
 * so a claim the two writers spell differently is a claim whose meaning depends
 * on which verb ran last. The assertions therefore reach for the real READERS of
 * each artifact (the drift gate, the merge writer, the disposition predictor)
 * rather than for a re-implementation of the producer.
 *
 * The end-to-end shape — init writes, sync re-plans, drift, deselection reclaim
 * — is `test/emit/syncDriftProof.e2e.test.ts`. This file is the unit lane under
 * it: it drives the shared functions directly so a regression names the rule
 * that broke rather than the run that noticed.
 */

const ENGINE_VERSION = "9.9.9";

/** Bytes reclaim re-hashes: the file's own, as a Buffer, exactly as `src/merge/reclaim.ts` reads them. */
async function diskDigest(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function outputOf(overrides: Partial<AdapterOutput> = {}): AdapterOutput {
  return {
    path: ".mcp.json",
    content: '{"mcpServers":{}}\n',
    owner: { adapter: "claude", artifactId: "mcp-json", artifactType: "infra" },
    ...overrides,
  };
}

describe("sha256 — the ledger's one authorship proof", () => {
  const getTemp = useTempDir("emission-write-hash");

  /**
   * The property both writers depend on, asserted through the reader rather
   * than through a second digest: a hash this function produced must satisfy
   * `hasLedgerDrift`, so a file `init` recorded verifies clean when `sync`
   * rewrites it. Two implementations that agree today are two implementations
   * that can stop agreeing in one edit; this is what would go red.
   */
  it("produces the digest the drift gate accepts as 'still the bytes we wrote'", async () => {
    const temp = getTemp();
    const target = temp.path("settings.json");
    const previous = '{"generated":true}\n';
    await writeFile(target, previous, "utf8");

    const rows: LedgerEntry[] = [
      {
        path: "settings.json",
        adapter: "claude",
        artifactId: "settings",
        artifactType: "infra",
        contentHash: sha256(previous),
      },
    ];
    const result = await safeWriteFile(target, '{"generated":true,"v":2}\n', {
      version: ENGINE_VERSION,
      force: false,
      backup: true,
      boundaryDir: temp.dir,
      ledgerPaths: ledgerPathSet(temp.dir, ["settings.json"]),
      ledgerHashes: ledgerHashIndex(temp.dir, rows),
    });

    expect(result.action).toBe("updated");
    // No drift means no rescue copy: the recorded hash matched the bytes found.
    expect(result.warning).toBeUndefined();
  });

  it("makes bytes it did not record read as an operator edit, backed up before replacement", async () => {
    const temp = getTemp();
    const target = temp.path("settings.json");
    await writeFile(target, '{"hand":"edited"}\n', "utf8");

    const rows: LedgerEntry[] = [
      {
        path: "settings.json",
        adapter: "claude",
        artifactId: "settings",
        artifactType: "infra",
        contentHash: sha256('{"generated":true}\n'),
      },
    ];
    const result = await safeWriteFile(target, '{"generated":true,"v":2}\n', {
      version: ENGINE_VERSION,
      force: false,
      backup: true,
      boundaryDir: temp.dir,
      ledgerPaths: ledgerPathSet(temp.dir, ["settings.json"]),
      ledgerHashes: ledgerHashIndex(temp.dir, rows),
    });

    expect(result.action).toBe("updated");
    expect(result.warning).toContain("edited by hand since");
  });

  /**
   * The encoding half of the same agreement. The recorded hash is computed over
   * a JS string here and re-computed over a `Buffer` by the reclaim sweep
   * (`src/merge/reclaim.ts` gates 2b/4), so a non-ASCII emission — every charter
   * that carries an em dash — only verifies if the string path is UTF-8.
   */
  it("hashes a string as UTF-8, so the on-disk re-hash matches", async () => {
    const temp = getTemp();
    const target = temp.path("AGENTS.md");
    const content = "# Charter — invariants, not defaults\n";
    await writeFile(target, content, "utf8");

    expect(sha256(content)).toBe(await diskDigest(target));
  });

  it("is plain SHA-256 hex", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("readIfExists", () => {
  const getTemp = useTempDir("emission-write-read");

  it("returns the file's content", async () => {
    const temp = getTemp();
    await temp.seedFiles({ "a.txt": "hello\n" });
    await expect(readIfExists(temp.path("a.txt"))).resolves.toBe("hello\n");
  });

  it("reads an absent file as null rather than failing", async () => {
    const temp = getTemp();
    await expect(readIfExists(temp.path("missing.txt"))).resolves.toBeNull();
  });

  /**
   * Only ENOENT is absence. Every other errno propagates, because a permission
   * refusal or a directory where a file was expected read as "no file here"
   * would let a merge write over content it never managed to look at.
   */
  it("propagates an errno that is not ENOENT", async () => {
    const temp = getTemp();
    await expect(readIfExists(temp.dir)).rejects.toThrow();
  });
});

describe("outputWriteOptions — one lane decision for both verbs", () => {
  const getTemp = useTempDir("emission-write-lane");

  it("routes an output carrying a managed block into the merge lane", () => {
    const options = outputWriteOptions("body\n", ENGINE_VERSION, false, "/repo");
    expect(options.managedContent).toBe("body\n");
    expect(options.appendIfNoBlock).toBe(true);
  });

  /**
   * The marker-less lane, asserted as ABSENCE rather than as `undefined`:
   * `safeWriteFile` selects its lane on `managedContent !== undefined`, so a key
   * present and unset is the merge lane, not the whole-file one.
   */
  it("leaves a marker-less output whole-file, with no managed keys at all", () => {
    const options = outputWriteOptions(null, ENGINE_VERSION, false, "/repo");
    expect("managedContent" in options).toBe(false);
    expect("appendIfNoBlock" in options).toBe(false);
  });

  it("always declares the version, the force flag, the backup and the boundary", () => {
    const options = outputWriteOptions(null, ENGINE_VERSION, true, "/repo");
    expect(options).toMatchObject({
      version: ENGINE_VERSION,
      force: true,
      backup: true,
      boundaryDir: "/repo",
    });
  });

  /**
   * `exactOptionalPropertyTypes` is load-bearing at this seam: the substrate
   * reads "unset" and "explicitly undefined" as two different policies, so the
   * plan lane — which passes no hash index — must produce an options object with
   * no `ledgerHashes` key.
   */
  it("omits the ledger inputs entirely when the caller supplies none", () => {
    const options = outputWriteOptions(null, ENGINE_VERSION, false, "/repo");
    expect("ledgerPaths" in options).toBe(false);
    expect("ledgerHashes" in options).toBe(false);
  });

  it("carries the ledger inputs through when the caller has them", () => {
    const paths = ledgerPathSet("/repo", ["a.json"]);
    const hashes = ledgerHashIndex("/repo", [{ path: "a.json", contentHash: "deadbeef" }]);
    const options = outputWriteOptions(null, ENGINE_VERSION, false, "/repo", paths, hashes);
    expect(options.ledgerPaths).toBe(paths);
    expect(options.ledgerHashes).toBe(hashes);
  });

  /**
   * The disposition the plan previews and the disposition the write performs are
   * read off ONE options object, which is why both verbs build it here. An
   * engine-owned marker-less path updates; the same path unowned is refused.
   */
  it("gives the predictor the same ownership answer the writer would act on", () => {
    const owned = outputWriteOptions(
      null,
      ENGINE_VERSION,
      false,
      "/repo",
      ledgerPathSet("/repo", ["hooks/guard.mjs"]),
    );
    expect(predictMergeAction("old\n", "new\n", owned, "/repo/hooks/guard.mjs")).toBe("updated");

    const unowned = outputWriteOptions(null, ENGINE_VERSION, false, "/repo");
    expect(predictMergeAction("old\n", "new\n", unowned, "/repo/hooks/guard.mjs")).toBe("skipped");
  });

  /**
   * The regression the lane split exists for. Handing a marker-less artifact to
   * the managed lane makes `appendIfNoBlock` treat the engine's OWN previous
   * output as user bytes to preserve — it prepends a duplicate copy of the file
   * above itself, and second-run-only, which is why only a re-run surfaced it.
   * Two writes through these options leave the emission and nothing else.
   */
  it("does not stack a second copy of a marker-less output on a re-run", async () => {
    const temp = getTemp();
    const target = temp.path("hooks/guard.mjs");
    const first = "process.exit(0)\n";
    const second = "process.exit(1)\n";
    const options = outputWriteOptions(
      null,
      ENGINE_VERSION,
      false,
      temp.dir,
      ledgerPathSet(temp.dir, ["hooks/guard.mjs"]),
    );

    await safeWriteFile(target, first, options);
    await safeWriteFile(target, second, options);

    await expect(readFile(target, "utf8")).resolves.toBe(second);
  });
});

describe("ledgerRowsForOutput — the row shape both writers persist", () => {
  const getTemp = useTempDir("emission-write-rows");

  /**
   * The historical defect, in one assertion. The three merged MCP documents land
   * as emission ∪ the operator's preserved entries, and `contentHash` has
   * exactly one reader: the reclaim sweep, which re-hashes the file on disk to
   * prove the engine wrote it and nobody edited it since. Recording the
   * EMISSION's hash made the sweep read the engine's own document as "edited
   * since", so a deselected client doc could never be auto-reclaimed and stayed
   * behind forever. Both writers carried the bug; the rule lives in one place so
   * it cannot come back on one side only.
   */
  it("hashes the WRITTEN bytes, not the emission, when the merge changed them", async () => {
    const temp = getTemp();
    const target = temp.path(".mcp.json");
    const emitted = '{"mcpServers":{"engine":{"command":"npx"}}}\n';
    const merged = '{"mcpServers":{"engine":{"command":"npx"},"hand-added":{"command":"uvx"}}}\n';
    await writeFile(target, merged, "utf8");

    const rows = ledgerRowsForOutput(outputOf({ content: emitted }), merged, null, ENGINE_VERSION);

    expect(rows[0]?.contentHash).toBe(await diskDigest(target));
    expect(rows[0]?.contentHash).not.toBe(sha256(emitted));
  });

  it("hashes the emission when the write put it down verbatim", () => {
    const output = outputOf({ path: "AGENTS.md", content: "# Charter\n" });
    const rows = ledgerRowsForOutput(output, null, null, ENGINE_VERSION);
    expect(rows[0]?.contentHash).toBe(sha256("# Charter\n"));
  });

  /**
   * A recorded hash that is not the bytes on disk is not an inert mistake: it
   * makes every later reader classify the engine's own file as hand-edited. This
   * drives the emission-hash mistake through the drift gate to show what the
   * assertion above is protecting.
   */
  it("records a hash the drift gate reads as clean, where the emission's would not", async () => {
    const temp = getTemp();
    const target = temp.path(".mcp.json");
    const emitted = '{"mcpServers":{"engine":{"command":"npx"}}}\n';
    const merged = '{"mcpServers":{"engine":{"command":"npx"},"hand":{"command":"uvx"}}}\n';
    await writeFile(target, merged, "utf8");

    // `EmittedArtifact` is structurally the drift check's `LedgerHashRow`, so
    // the rows go to the reader as produced — no re-shaping between them.
    const correct = ledgerRowsForOutput(outputOf({ content: emitted }), merged, null, ENGINE_VERSION);
    const hashIndex = ledgerHashIndex(temp.dir, correct);
    const stale = ledgerHashIndex(temp.dir, [{ path: ".mcp.json", contentHash: sha256(emitted) }]);

    const paths = ledgerPathSet(temp.dir, [".mcp.json"]);
    const base = { version: ENGINE_VERSION, force: false, backup: true, boundaryDir: temp.dir, ledgerPaths: paths };

    const clean = await safeWriteFile(target, emitted, { ...base, ledgerHashes: hashIndex });
    expect(clean.warning).toBeUndefined();

    await writeFile(target, merged, "utf8");
    const drifted = await safeWriteFile(target, emitted, { ...base, ledgerHashes: stale });
    expect(drifted.warning).toContain("edited by hand since");
  });

  /**
   * Co-ownership is what lets a shared path (the root `AGENTS.md`) survive the
   * deselection of one tool: the sweep drops a path only when every owner has
   * stopped emitting it. One row per owner, one hash for the single write, and a
   * repeated adapter collapsed so no `(adapter, path)` pair is recorded twice.
   */
  it("expands co-owners into one row each, all carrying the single write's hash", () => {
    const output = outputOf({
      path: "AGENTS.md",
      content: "# Charter\n",
      owner: { adapter: "claude", artifactId: "charter", artifactType: "infra" },
      coOwners: [
        { adapter: "cursor", artifactId: "charter", artifactType: "infra" },
        { adapter: "claude", artifactId: "charter-dupe", artifactType: "infra" },
      ],
    });

    const rows = ledgerRowsForOutput(output, null, null, ENGINE_VERSION);

    expect(rows.map((row) => row.adapter)).toEqual(["claude", "cursor"]);
    expect(new Set(rows.map((row) => row.contentHash)).size).toBe(1);
    expect(rows.every((row) => row.path === "AGENTS.md")).toBe(true);
  });

  /**
   * `stampedVersion` claims a version marker is present in the file. The great
   * majority of outputs carry no managed block to stamp one into, and recording
   * it unconditionally made the ledger assert a marker that was not there.
   */
  it("stamps the version only where a managed block exists to hold it", () => {
    const output = outputOf({ path: "AGENTS.md", content: "# Charter\n" });
    expect(ledgerRowsForOutput(output, null, "body\n", ENGINE_VERSION)[0]?.stampedVersion).toBe(
      ENGINE_VERSION,
    );
    const unstamped = ledgerRowsForOutput(output, null, null, ENGINE_VERSION)[0];
    expect(unstamped?.stampedVersion).toBeUndefined();
    expect("stampedVersion" in (unstamped ?? {})).toBe(false);
  });

  /**
   * A co-owned document's rows carry what the engine wrote inside it
   * (REQ-FLOW-036): one record for the one write, on every owner's row, and
   * no row sharing it with another or with the caller.
   */
  it("puts the co-owned record on every row it returns, each its own copy, and none when absent", () => {
    const record = { elements: { "/permissions/allow": ["a".repeat(64)] }, createdFile: true as const };
    const output = outputOf({
      path: ".claude/settings.json",
      content: "{}\n",
      owner: { adapter: "claude", artifactId: "settings", artifactType: "infra" },
      coOwners: [{ adapter: "cursor", artifactId: "settings", artifactType: "infra" }],
    });

    const rows = ledgerRowsForOutput(output, null, null, ENGINE_VERSION, record);

    expect(rows.map((row) => row.coOwned)).toEqual([record, record]);
    expect(rows[0]?.coOwned).not.toBe(record);
    expect(rows[0]?.coOwned).not.toBe(rows[1]?.coOwned);
    record.elements["/permissions/allow"].push("b".repeat(64));
    expect(rows[0]?.coOwned?.elements?.["/permissions/allow"]).toHaveLength(1);
    expect("coOwned" in (ledgerRowsForOutput(output, null, null, ENGINE_VERSION)[0] ?? {})).toBe(false);
  });

  it("carries the owner triple through unchanged", () => {
    const rows = ledgerRowsForOutput(
      outputOf({
        path: ".cursor/rules/guard.mdc",
        owner: { adapter: "cursor", artifactId: "guard", artifactType: "rule" },
      }),
      null,
      null,
      ENGINE_VERSION,
    );
    expect(rows).toEqual([
      {
        path: ".cursor/rules/guard.mdc",
        adapter: "cursor",
        artifactId: "guard",
        artifactType: "rule",
        contentHash: sha256('{"mcpServers":{}}\n'),
      },
    ]);
  });
});

/**
 * The fifth shared rule, and the one whose divergence was a live defect rather
 * than a latent one: what a DRY RUN of the three merged MCP documents predicts.
 *
 * `sync`'s plan ran the real ownership merge; `init`'s dry run predicted from
 * the target's mere EXISTENCE — file there, therefore `updated`. Two previews of
 * one regeneration, disagreeing about one tree, and a dry run is a promise about
 * what the apply will do. Every case here therefore asserts the prediction
 * against the WRITER it predicts (`materializeUserMcpJson`) rather than against
 * a restatement of the merge, so the promise is what goes red when it breaks.
 */
describe("coOwnedOwnershipOf and the co-owned lanes (REQ-FLOW-036)", () => {
  const PATH = ".claude/settings.json";
  const row = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
    path: PATH,
    adapter: "claude",
    artifactId: "claude-settings",
    artifactType: "infra",
    contentHash: "a".repeat(64),
    ...over,
  });
  const h = (n: number): string => String(n).repeat(64).slice(0, 64);

  it("reads no row as adoption, rows without a record as a 1.11.0 ledger, and unions the records of several rows", () => {
    expect(coOwnedOwnershipOf([], PATH)).toEqual({ owned: false, legacy: false, record: null, deleteWhenEngineOnly: false });
    // A row at another spelling is not this path's: rows match exactly.
    expect(coOwnedOwnershipOf([row({ path: ".Claude/settings.json" })], PATH).owned).toBe(false);
    expect(coOwnedOwnershipOf([row()], PATH, { boundaryDir: "/repo" })).toEqual({
      owned: true,
      legacy: true,
      record: null,
      deleteWhenEngineOnly: true,
      boundaryDir: "/repo",
    });

    const hashes = new Map([["x", new Set(["y"])]]);
    const both = coOwnedOwnershipOf(
      [
        row({ coOwned: { elements: { "/permissions/allow": [h(1), h(2)] }, preexisting: ["/permissions"] } }),
        row({ adapter: "cursor", coOwned: { elements: { "/permissions/allow": [h(2), h(3)], "/hooks/Stop": [h(4)] }, members: { "/a": h(5) }, createdFile: true } }),
      ],
      PATH,
      { ledgerHashes: hashes },
    );
    expect(both).toEqual({
      owned: true,
      legacy: false,
      record: {
        members: { "/a": h(5) },
        elements: { "/permissions/allow": [h(1), h(2), h(3)], "/hooks/Stop": [h(4)] },
        preexisting: ["/permissions"],
        createdFile: true,
      },
      deleteWhenEngineOnly: true,
      ledgerHashes: hashes,
    });
    // A recorded row the engine did not create keeps the file once only its entries are gone.
    expect(coOwnedOwnershipOf([row({ coOwned: { elements: { "/permissions/allow": [h(1)] } } })], PATH)).toMatchObject({
      record: { elements: { "/permissions/allow": [h(1)] } },
      deleteWhenEngineOnly: false,
    });
  });

  it("names only the co-owned documents that wire hooks, never an MCP document, for the sweep's script keep (review/49)", () => {
    const manifest = createManifest({ tools: ["claude"], selection: { items: { agent: [], skill: [], rule: [], command: [] } }, generatorVersion: "1.0.0", now: new Date(0) });
    // TEST CHANGE, justified: REQ-FLOW-037 — Cursor's and Codex's hook files join the
    // settings document as co-owned documents that wire hooks.
    expect([...coOwnedHookDocuments(manifest)]).toEqual([PATH, ".cursor/hooks.json", ".codex/hooks.json"]);
    expect([...coOwnedReclaimReducers(manifest).keys()]).toContain(".mcp.json");
    expect(coOwnedHookDocuments(manifest).has(".mcp.json")).toBe(false);
    expect(coOwnedDocumentLanes(null).get(PATH)?.wiresHooks).toBe(true);
  });

  it("registers the settings lane, and hands the sweep a reducer over what the ledger records there", () => {
    const lanes = coOwnedDocumentLanes(null);
    // TEST CHANGE, justified: REQ-FLOW-037 — the hook-file unit registers Cursor's and
    // Codex's hook files, and the Codex config is owned per table, so four lanes sit
    // side by side; only the config wires no hook command (integration of both halves).
    expect([...lanes.keys()]).toEqual([PATH, ".cursor/hooks.json", ".codex/hooks.json", CODEX_CONFIG_FILE]);
    expect([...lanes.values()].map((lane) => [lane.path, lane.wiresHooks])).toEqual([
      [PATH, true],
      [".cursor/hooks.json", true],
      [".codex/hooks.json", true],
      [CODEX_CONFIG_FILE, false],
    ]);
    expect(lanes.get(PATH)?.noun).toBe("settings document");

    const raw = `${JSON.stringify({ permissions: { allow: ["Read", "Bash"] }, model: "opus" }, null, 2)}\n`;
    const manifest = createManifest({ tools: ["claude"], selection: { items: { agent: [], skill: [], rule: [], command: [] } }, generatorVersion: "1.0.0", now: new Date(0) });
    const reduce = (ledger: LedgerEntry[]) => coOwnedReclaimReducers({ ...manifest, ledger }).get(PATH)?.(raw);
    // A 1.11.0 row: the in-bound row is the engine's, unproven.
    expect(reduce([row()])).toMatchObject({ kind: "reduced", proven: false });
    // A recorded row: proven, and the owner's `Bash` stays.
    expect(reduce([row({ coOwned: { elements: { "/permissions/allow": [createHash("sha256").update('"Read"').digest("hex")] } } })])).toMatchObject({
      kind: "reduced",
      proven: true,
      content: `${JSON.stringify({ permissions: { allow: ["Bash"] }, model: "opus" }, null, 2)}\n`,
    });
  });
});

describe("the Codex config lane (REQ-FLOW-037)", () => {
  const render = codexConfigTableRendering([]);
  const tableHash = (name: string): string => createHash("sha256").update(render(name) ?? "").digest("hex");
  const configRow = (coOwned?: LedgerEntry["coOwned"]): LedgerEntry => ({
    path: CODEX_CONFIG_FILE,
    adapter: "codex",
    artifactId: "codex-config",
    artifactType: "infra",
    contentHash: "0".repeat(64),
    ...(coOwned === undefined ? {} : { coOwned }),
  });
  const manifest = createManifest({ tools: ["codex"], selection: { items: { agent: [], skill: [], rule: [], command: [] } }, generatorVersion: "1.0.0", now: new Date(0) });

  it("hands the sweep a table reducer: the recorded tables leave and the owner's table stays", () => {
    const team = '[mcp_servers.team]\ncommand = "team-mcp"\n';
    const raw = `${render("features")}\n${render("mcp_servers")}\n${team}`;
    const reducer = coOwnedReclaimReducers({
      ...manifest,
      ledger: [configRow({ members: { "/features": tableHash("features"), "/mcp_servers": tableHash("mcp_servers") } })],
    }).get(CODEX_CONFIG_FILE);
    expect(reducer?.(raw)).toMatchObject({ kind: "reduced", content: team, proven: true });
  });

  it("wires no hooks, and proves its tables by the registry's own rendering whatever the sweep's renderings hold", () => {
    expect(coOwnedDocumentLanes(manifest).get(CODEX_CONFIG_FILE)?.wiresHooks).toBe(false);
    expect(coOwnedHookDocuments(manifest).has(CODEX_CONFIG_FILE)).toBe(false);
    const raw = `${render("features")}\n${render("mcp_servers")}\n`;
    const recorded = {
      ...manifest,
      ledger: [configRow({ members: { "/features": tableHash("features"), "/mcp_servers": tableHash("mcp_servers") } })],
    };
    const bare = coOwnedReclaimReducers(recorded).get(CODEX_CONFIG_FILE)?.(raw);
    expect(bare).toMatchObject({ proven: true });
    expect(bare).not.toHaveProperty("mustBackUp");
    const handed = coOwnedReclaimReducers(recorded, [], new Map([[CODEX_CONFIG_FILE, { features: "not the rendering" }]])).get(CODEX_CONFIG_FILE)?.(raw);
    expect(handed).toEqual(bare);
  });

  it("reads the manifest's server selection for a legacy row's proof", () => {
    const github = `${render("features")}\n${render("mcp_servers.github")}`;
    const reduceWith = (servers: string[]) =>
      coOwnedReclaimReducers({ ...manifest, mcp: { servers }, ledger: [configRow()] }).get(CODEX_CONFIG_FILE)?.(github);
    expect(reduceWith(["github"])).toMatchObject({ kind: "engine-only", proven: false });
    expect(reduceWith([])).toMatchObject({ kind: "reduced", content: render("mcp_servers.github") });
  });
});

describe("predictMcpDocumentMerge — the dry-run answer both verbs give", () => {
  const getTemp = useTempDir("emission-write-mcp-predict");

  /** The emitted document, in the exact 2-space + newline shape the emitter writes. */
  const EMITTED = `${JSON.stringify({ mcpServers: { github: { command: "npx" } } }, null, 2)}\n`;
  const SELECTED = ["github"] as const;

  async function predict(absPath: string) {
    return predictMcpDocumentMerge(absPath, ".mcp.json", EMITTED, SELECTED, []);
  }

  it("predicts created for a path nothing occupies, and creates nothing", async () => {
    const temp = getTemp();
    const target = temp.path(".mcp.json");

    const predicted = await predict(target);

    expect(predicted).toEqual({ result: { path: target, action: "created" }, refusal: null });
    await expect(readIfExists(target)).resolves.toBeNull();
  });

  /**
   * The disagreement's own tree, in one assertion. An already-current document
   * is not work about to happen, and predicting `updated` for it is what made
   * `init --force --dry-run` and `sync --dry-run` describe one tree two ways.
   * The writer is then run against the same bytes to show the prediction was
   * right: it reports `unchanged` too.
   */
  it("predicts unchanged for a document the merge would leave exactly as it is", async () => {
    const temp = getTemp();
    const target = temp.path(".mcp.json");
    await writeFile(target, EMITTED, "utf8");

    const predicted = await predict(target);
    expect(predicted.result.action).toBe("unchanged");
    expect(predicted.refusal).toBeNull();

    const written = await materializeUserMcpJson(target, EMITTED, new Set(SELECTED));
    expect(written.action).toBe("unchanged");
  });

  /**
   * The non-degenerate half: `unchanged` has to be computed, not constant. A
   * hand-added server means the merge genuinely rewrites the file, and the
   * prediction has to say so before the writer proves it.
   */
  it("predicts updated where the merge really rewrites the document", async () => {
    const temp = getTemp();
    const target = temp.path(".mcp.json");
    await writeFile(
      target,
      `${JSON.stringify({ mcpServers: { mine: { command: "own" } } }, null, 2)}\n`,
      "utf8",
    );

    expect((await predict(target)).result.action).toBe("updated");

    const written = await materializeUserMcpJson(target, EMITTED, new Set(SELECTED));
    expect(written.action).toBe("updated");
    const merged = JSON.parse(await readFile(target, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(merged.mcpServers).toSorted()).toEqual(["github", "mine"]);
  });

  /**
   * A document that cannot be parsed is left untouched by the writer, so the
   * preview reports `skipped` with the writer's own sentence — and `refusal`
   * stays null, because this is not the hard-link class a caller types as
   * `shared-name`. A preview that classified it as one would print the
   * copy-and-move remedy for a file whose fix is to repair the JSON.
   */
  it("predicts skipped with the writer's sentence for a document it cannot read", async () => {
    const temp = getTemp();
    const target = temp.path(".mcp.json");
    await writeFile(target, "{not json\n", "utf8");

    const predicted = await predict(target);

    expect(predicted.result.action).toBe("skipped");
    expect(predicted.result.warning).toContain("not valid JSON");
    expect(predicted.refusal).toBeNull();
  });

  describe.skipIf(process.platform === "win32")("hard-linked target", () => {
    const getOutside = useTempDir("emission-write-mcp-outside");
    const CANARY = "GOCSPX-CANARY-PRIVATE-KEY-MATERIAL";

    /** A 0600 credentials file outside the tree. Valid JSON, which is what makes
     *  the ownership merge keep its fields one by one — and publish them. */
    async function plantCredentials(): Promise<string> {
      const credPath = getOutside().path("adc.json");
      await writeFile(
        credPath,
        `${JSON.stringify({ client_secret: CANARY, type: "authorized_user" }, null, 2)}\n`,
        "utf8",
      );
      await chmod(credPath, 0o600);
      return credPath;
    }

    /**
     * The refusal a preview could not previously express. Both halves matter:
     * the disposition is `skipped` so no caller counts it as a write, and
     * `refusal` carries the text so the caller that types collisions can label
     * it `shared-name` without string-matching a warning.
     */
    it("predicts the refusal the write raises, as a skipped row carrying its text", async () => {
      const temp = getTemp();
      const cred = await plantCredentials();
      const target = temp.path(".mcp.json");
      await link(cred, target);

      const predicted = await predict(target);

      expect(predicted.result.action).toBe("skipped");
      expect(predicted.refusal).toContain("hard link");
      expect(predicted.refusal).toContain("--force does not help");
      // One text, one source: the row's warning IS the refusal, so the two
      // surfaces cannot say different things about the same file.
      expect(predicted.result.warning).toBe(predicted.refusal);

      // And it is a prediction OF the writer: the same target refuses.
      await expect(materializeUserMcpJson(target, EMITTED, new Set(SELECTED))).rejects.toMatchObject(
        { code: "FS_ERROR" },
      );
    });

    /**
     * Order, not merely outcome. The refusal runs AHEAD of the read because the
     * parse-failure sentence quotes the parser's message, which carries a
     * fragment of whatever was read — so a `.mcp.json` linked to a key file
     * would print part of that key at the one moment nothing has been written
     * yet. The message names the path and the remedy and nothing else, and the
     * link keeps its inode, its link count and its mode.
     */
    it("names the path and the remedy without reading a byte of what the link points at", async () => {
      const temp = getTemp();
      const cred = await plantCredentials();
      const target = temp.path(".mcp.json");
      await link(cred, target);
      const before = await lstat(target);
      const original = await readFile(cred, "utf8");

      const predicted = await predict(target);

      expect(predicted.refusal).not.toContain(CANARY);
      expect(predicted.refusal).not.toContain("authorized_user");
      expect(predicted.refusal).toContain(target);

      const after = await lstat(target);
      expect(after.ino).toBe(before.ino);
      expect(after.nlink).toBe(2);
      expect(after.mode & 0o777).toBe(0o600);
      await expect(readFile(cred, "utf8")).resolves.toBe(original);
    });
  });
});

describe("installedPackServers", () => {
  const getTemp = useTempDir("emission-write-packs");

  function manifestWith(ledger: LedgerEntry[]): SetupManifest {
    const manifest = createManifest({
      tools: ["claude"],
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: ENGINE_VERSION,
    });
    return { ...manifest, ledger };
  }

  it("answers empty for a ledger carrying no pack rows", async () => {
    const temp = getTemp();
    await expect(installedPackServers(temp.dir, manifestWith([]))).resolves.toEqual([]);
  });

  /**
   * Ownership is what this answer decides. `engineOwnedServerIds` proves
   * authorship of an unselected entry by RE-RENDERING it, so an id it cannot
   * resolve is judged an unowned user row and preserved verbatim — a deselected
   * pack server would never leave `.mcp.json`, `.cursor/mcp.json` or
   * `.vscode/mcp.json` and would keep launching with the credential in
   * `.env.mcp`. Every lane asks this one function so no lane can be the one
   * holding the narrower set.
   */
  it("resolves the servers of a pack the ledger records", async () => {
    const temp = getTemp();
    const definition = {
      id: "acme-telemetry",
      description: "Deployment telemetry queries.",
      command: "npx",
      args: ["-y", "@acme/telemetry-mcp@3.2.1", "--token", "${env:ACME_TELEMETRY_TOKEN}"],
      transport: "stdio",
      requiresEnv: [{ name: "ACME_TELEMETRY_TOKEN", description: "Read-only telemetry API token" }],
      pinnedVersion: "3.2.1",
      packageNameLock: "@acme/telemetry-mcp",
      blastRadius: "Low — read-only telemetry queries against a staging project.",
      docsUrl: "https://example.invalid/acme-telemetry",
    };
    await temp.seedFiles({
      ".stamity/packs/acme-ops/mcp_servers/acme-telemetry.json": `${JSON.stringify(definition, null, 2)}\n`,
    });

    const servers = await installedPackServers(
      temp.dir,
      manifestWith([
        {
          path: ".stamity/packs/acme-ops/mcp_servers/acme-telemetry.json",
          adapter: "pack:acme-ops",
          artifactId: "acme-ops/mcp_servers/acme-telemetry.json",
          artifactType: "infra",
        },
      ]),
    );

    expect(servers.map((server) => server.id)).toEqual(["acme-telemetry"]);
    expect(servers[0]?.sourcePackId).toBe("acme-ops");
    // A pack never claims to be the vendor of the service it fronts.
    expect(servers[0]?.firstParty).toBe(false);
  });
});

describe("coOwnedReclaimRenderings — the proof by re-rendering for user hooks (review/44, reading 1)", () => {
  const getTemp = useTempDir("emission-write-renderings");
  const manifestOf = (extra: Partial<SetupManifest> = {}): SetupManifest => ({
    ...createManifest({ tools: ["claude"], selection: { items: { agent: [], skill: [], rule: [], command: [] } }, generatorVersion: "1.0.0", now: new Date(0) }),
    ...extra,
  });
  const definition = JSON.stringify({
    hooks: [
      { event: "pre_tool_use", matcher: "Bash", command: ["node", ".stamity/hooks/audit.mjs"], timeoutMs: 1500 },
      { event: "session_start", command: ["node", ".stamity/hooks/audit.mjs"] },
    ],
  });

  it("renders each definition still present as the Claude adapter writes it into the settings document", async () => {
    const temp = getTemp();
    await temp.seedFiles({ ".stamity/hooks/audit.mjs": "process.exit(0)\n", ".stamity/hooks/audit.json": definition });

    const renderings = await coOwnedReclaimRenderings(temp.dir, manifestOf());

    const command = 'node "${CLAUDE_PROJECT_DIR}/.stamity/hooks/audit.mjs"';
    expect(renderings.get(".claude/settings.json")).toEqual({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command }] }],
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command, timeout: 2 }] }],
      },
    });
  });

  it("renders nothing with no definitions, a folder it cannot read, or a plugin carrying Claude's hooks", async () => {
    const temp = getTemp();
    expect((await coOwnedReclaimRenderings(temp.dir, manifestOf())).size).toBe(0);

    await temp.seedFiles({ "not-a-folder": "x" });
    expect((await coOwnedReclaimRenderings(temp.dir, manifestOf({ hooks: { userHooksDir: "not-a-folder" } }))).size).toBe(0);

    await temp.seedFiles({ ".stamity/hooks/audit.mjs": "process.exit(0)\n", ".stamity/hooks/audit.json": definition });
    // TEST CHANGE, justified: build/54 (revised sign-off) — Cursor's and Codex's
    // hook files now take a rendering too, so a plugin carrying Claude's hooks
    // drops the settings document's alone; one carrying all three drops them all.
    const plugin: SetupManifest["plugin"] = { mode: "plugin-backed", clients: { claude: { version: "1.9.0", classes: ["hooks"] } } };
    expect([...(await coOwnedReclaimRenderings(temp.dir, manifestOf({ plugin }))).keys()]).toEqual([".cursor/hooks.json", ".codex/hooks.json"]);
    const all: SetupManifest["plugin"] = {
      mode: "plugin-backed",
      clients: Object.fromEntries((["claude", "cursor", "codex"] as const).map((tool) => [tool, { version: "1.9.0", classes: ["hooks"] }])),
    };
    expect((await coOwnedReclaimRenderings(temp.dir, manifestOf({ plugin: all }))).size).toBe(0);
  });

  it("renders each definition into Cursor's and Codex's hook files as a release up to 1.6.0 wired it directly (build/54)", async () => {
    const temp = getTemp();
    await temp.seedFiles({ ".stamity/hooks/audit.mjs": "process.exit(0)\n", ".stamity/hooks/audit.json": definition });

    const renderings = await coOwnedReclaimRenderings(temp.dir, manifestOf());

    expect(renderings.get(".cursor/hooks.json")).toEqual({
      hooks: {
        preToolUse: [{ command: "node .stamity/hooks/audit.mjs", matcher: "Bash", failClosed: true }],
        sessionStart: [{ command: "node .stamity/hooks/audit.mjs" }],
      },
    });
    expect(renderings.get(".codex/hooks.json")).toEqual({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: ["node", ".stamity/hooks/audit.mjs"], timeout: 2 }] }],
        SessionStart: [{ hooks: [{ type: "command", command: ["node", ".stamity/hooks/audit.mjs"] }] }],
      },
    });
  });
});

describe("rowsCarriedThroughSweep (review/91)", () => {
  const row = (path: string, adapter: LedgerEntry["adapter"] = "cursor"): LedgerEntry => ({
    path,
    adapter,
    artifactId: path,
    artifactType: "infra",
    contentHash: sha256(path),
  });
  const entry = (path: string, action: ReclaimActionEntry["action"], refused = false): ReclaimActionEntry => ({
    path,
    candidateReason: "adapter-removed",
    action,
    detail: "",
    ...(refused ? { refused: true as const } : {}),
  });
  const report = (entries: ReclaimActionEntry[], wiringKept?: ReclaimReport["wiringKept"]): ReclaimReport => ({
    entries,
    consent: true,
    ...(wiringKept === undefined ? {} : { wiringKept }),
    deletedCount: 0,
    strippedCount: 0,
    skippedCount: 0,
  });
  const coOwned = new Set([".cursor/hooks.json", ".cursor/mcp.json", ".codex/config.toml", ".codex/hooks.json", ".vscode/mcp.json"]);

  it("carries no row when no sweep ran", () => {
    expect(rowsCarriedThroughSweep([row(".cursor/hooks.json")], null, coOwned)).toEqual([]);
  });

  // TEST CHANGE, justified: review/97 — only a reducer's refusal (the flag on the entry) or an
  // unsafe path carries a co-owned row; the first entry is now marked a refusal, and the
  // holding-none `.vscode/mcp.json` below is the owner's and carries nothing.
  it("carries the rows of a co-owned document the sweep refused and of each script a kept document runs, and nothing else", () => {
    const ledger = [
      row(".cursor/hooks.json"),
      row(".cursor/mcp.json"),
      row(".codex/config.toml", "codex"),
      row(".codex/hooks.json", "codex"),
      row(".stamity/generated/hooks/cursor/a.mjs"),
      row(".stamity/generated/hooks/cursor/a.mjs", "pack:acme__ops"),
      row(".stamity/generated/hooks/cursor/b.mjs"),
      row(".cursor/rules/x.mdc"),
      row(".vscode/mcp.json", "copilot"),
    ];
    const swept = report(
      [
        entry(".cursor/hooks.json", "skipped-user-content", true),
        entry(".cursor/mcp.json", "skipped-unsafe-path"),
        entry(".codex/config.toml", "co-owned-reduced"),
        entry(".codex/hooks.json", "skipped-missing"),
        entry(".stamity/generated/hooks/cursor/a.mjs", "skipped-user-content"),
        entry(".stamity/generated/hooks/cursor/b.mjs", "skipped-user-content"),
        entry(".cursor/rules/x.mdc", "skipped-user-content"),
        entry(".vscode/mcp.json", "skipped-user-content"),
      ],
      [{ path: ".cursor/hooks.json", scripts: [".stamity/generated/hooks/cursor/a.mjs"] }],
    );
    expect(rowsCarriedThroughSweep(ledger, swept, coOwned)).toEqual([ledger[0], ledger[1], ledger[4]]);
    // With nothing held by wiring, only the refused documents.
    expect(rowsCarriedThroughSweep(ledger, report(swept.entries), coOwned)).toEqual([ledger[0], ledger[1]]);
  });
});
