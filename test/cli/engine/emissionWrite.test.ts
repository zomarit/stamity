import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createManifest } from "../../../src/manifest/manifest.ts";
import {
  ledgerHashIndex,
  ledgerPathSet,
  predictMergeAction,
  safeWriteFile,
} from "../../../src/merge/safeWrite.ts";
import {
  installedPackServers,
  ledgerRowsForOutput,
  outputWriteOptions,
  readIfExists,
  sha256,
} from "../../../src/cli/engine/emissionWrite.ts";
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
