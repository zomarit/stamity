import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  configCommand,
  getConfigValue,
  setConfigValue,
  type ConfigApplyContext,
} from "../../../src/cli/commands/config.ts";
import { CliFailure } from "../../../src/cli/kit/output.ts";
import { readManifest } from "../../../src/manifest/manifest.ts";
import { discoverInstalledPacks, packMcpServers } from "../../../src/pack/projection.ts";
import { resolveEffortValue, resolveModelValue } from "../../../src/roster/modelLadder.ts";
import { EFFORT_LEVELS, MODEL_CLASSES, TOOLS, type Tool } from "../../../src/types/core.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../../src/types/content.ts";
import { MANIFEST_FILE, MANIFEST_VERSION, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * `stamity config` — the two places the command described a state the engine
 * does not produce.
 *
 * **One manifest field, two writers that disagreed.** `mcp.servers` is written
 * by `config mcp add` AND by the generic `config set mcp.servers` row. The
 * first validates against the curated catalog plus whatever the installed
 * packs supply; the second validated against the curated catalog alone, so an
 * operator holding a pack-supplied selection was refused the round-trip of
 * their own current state, told their server was unknown, and pointed at a
 * curated-only list — a next step that reads as "delete it".
 *
 * **A level no selected client emits.** The `effort.<class>` rows answered the
 * effective column off the ladder's `defaultEffort` without consulting
 * `manifest.tools`, so a repo whose clients cannot express the axis was still
 * shown a level. The model rows never did this: they fold the resolver over
 * the repo's real client set and print a marker where nothing resolves. These
 * cases hold the effort rows to the same rule, from the other direction —
 * every level this surface prints has to be one an emitted file would carry.
 *
 * Green-signal guard: every case here fails on the pre-change code, not on a
 * missing export. The pack cases fail with `unknown MCP server(s):
 * acme-telemetry` (exit 1 where 0 is asserted) and on the refusal text, which
 * named one half of the answer. The effort cases fail on the value itself —
 * `medium` where `(not expressed)` is asserted — and the two cross-checks
 * compare against the ladder resolvers the adapters call rather than against a
 * second copy of the expectation.
 *
 * Lane: the in-process CLI runner over a real temp directory, matching
 * `./config.test.ts`. The command reads and rewrites on-disk state (and now
 * reads the pack ledger), so the virtual-fs lane cannot host it.
 */

const timestamp = "2026-01-01T00:00:00.000Z";

/** Empty selection, derived from the class list so a new content class cannot skew a fixture. */
function emptySelection(): ContentSelection {
  const items = {} as ContentSelection["items"];
  for (const contentClass of CONTENT_CLASSES) items[contentClass] = [];
  return { items };
}

function baseManifest(overrides: Partial<SetupManifest> = {}): SetupManifest {
  return {
    version: MANIFEST_VERSION,
    generatedBy: "0.0.0",
    createdAt: timestamp,
    updatedAt: timestamp,
    tools: ["claude"],
    selection: emptySelection(),
    ledger: [],
    ...overrides,
  };
}

async function seedManifest(
  handle: TempDirHandle,
  overrides: Partial<SetupManifest> = {},
): Promise<void> {
  await handle.seedFiles({
    [`${STATE_DIR}/${MANIFEST_FILE}`]: `${JSON.stringify(baseManifest(overrides), null, 2)}\n`,
  });
}

function manifestBytes(handle: TempDirHandle): Promise<string> {
  return readFile(join(handle.dir, STATE_DIR, MANIFEST_FILE), "utf8");
}

function run(handle: TempDirHandle, args: readonly string[]): ReturnType<typeof runInProcess> {
  return runInProcess([configCommand], ["config", ...args], { cwd: handle.dir });
}

/** The `list` row for one key, matched whole so a marker cannot be read off a neighbour. */
function rowFor(stdout: string, key: string): string {
  const line = stdout.split("\n").find((candidate) => candidate.trimStart().startsWith(`${key} `));
  expect(line, `no list row for ${key}`).toBeDefined();
  return line ?? "";
}

const tempDir = useTempDir("stamity-config-truth");

// ── An installed pack that supplies one MCP server ─────────────────────────
//
// Seeded as installed state — the `pack:<id>` ledger rows discovery reads, and
// the bytes under `.stamity/packs/<id>/mcp_servers/` the projection reads — for
// the reason `./config.test.ts` gives: this is the config command's lane, and
// the install path has its own.

const PACK_ID = "telepack";
const PACK_DIR = `${STATE_DIR}/packs/${PACK_ID}`;
const PACK_SERVER_ID = "acme-telemetry";
const PACK_SERVER_PACKAGE = "@acme/telemetry-mcp";
const PACK_SERVER_VERSION = "3.2.1";
const PACK_SERVER_VAR = "ACME_TELEMETRY_TOKEN";

const PACK_SERVER_JSON = `${JSON.stringify(
  {
    id: PACK_SERVER_ID,
    description: "Deployment telemetry queries.",
    command: "npx",
    args: [
      "-y",
      `${PACK_SERVER_PACKAGE}@${PACK_SERVER_VERSION}`,
      "--token",
      `\${env:${PACK_SERVER_VAR}}`,
    ],
    transport: "stdio",
    requiresEnv: [{ name: PACK_SERVER_VAR, description: "Read-only telemetry API token" }],
    pinnedVersion: PACK_SERVER_VERSION,
    packageNameLock: PACK_SERVER_PACKAGE,
    blastRadius: "Low — read-only telemetry queries against a staging project.",
    docsUrl: "https://example.invalid/acme-telemetry",
  },
  null,
  2,
)}\n`;

const PACK_LEDGER: SetupManifest["ledger"] = [
  {
    path: `${PACK_DIR}/mcp_servers/telemetry.json`,
    adapter: `pack:${PACK_ID}`,
    artifactId: `${PACK_ID}/mcp_servers/telemetry.json`,
    artifactType: "infra",
  },
];

/** Seed a repo whose manifest records the fixture pack as installed. */
async function seedInstalledPack(
  handle: TempDirHandle,
  overrides: Partial<SetupManifest> = {},
): Promise<void> {
  await seedManifest(handle, { ledger: PACK_LEDGER, ...overrides });
  await handle.seedFiles({ [`${PACK_DIR}/mcp_servers/telemetry.json`]: PACK_SERVER_JSON });
}

describe("config set mcp.servers — the second writer of the field", () => {
  it("accepts a server an installed pack supplies, exactly as `config mcp add` does", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);

    // Non-degenerate: a curated id and a pack id in one selection, so the case
    // distinguishes "the check was widened" from "the check was dropped".
    const result = await run(handle, ["set", "mcp.servers", `github,${PACK_SERVER_ID}`]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.mcp?.servers).toEqual(["github", PACK_SERVER_ID]);
  });

  it("lets an operator re-write the selection `config mcp add` just made", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);
    await run(handle, ["mcp", "add", PACK_SERVER_ID]);

    // The round trip an operator actually performs: read the field back, then
    // set it to what was read. Refusing this is refusing the repo's own state.
    const current = (await readManifest(handle.dir))?.mcp?.servers ?? [];
    expect(current).toEqual([PACK_SERVER_ID]);
    const result = await run(handle, ["set", "mcp.servers", current.join(",")]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already");
    expect((await readManifest(handle.dir))?.mcp?.servers).toEqual([PACK_SERVER_ID]);
  });

  it("names the curated ids AND the installed pack's ids when an id resolves to nothing", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "mcp.servers", "nope"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown MCP server(s): nope");
    // Both halves of "which ids exist" — the refusal that named only the
    // curated half steered an operator into deleting a valid selection.
    expect(result.stderr).toContain("github");
    expect(result.stderr).toContain(`installed packs: ${PACK_SERVER_ID}`);
    expect(result.stderr).toContain("or an installed pack");
    // A refused value is byte-neutral: nothing is half-applied.
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("says no pack supplies one when the repo has none installed", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "mcp.servers", PACK_SERVER_ID]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no installed pack supplies a server");
    expect((await readManifest(handle.dir))?.mcp?.servers).toBeUndefined();
  });

  it("still refuses a pack id once the supplying pack is gone from the ledger", async () => {
    const handle = tempDir();
    // The definition bytes are on disk, but no `pack:<id>` ledger row claims
    // them — the state a reclaim leaves behind. Supply is what the ledger
    // says, so the id stops resolving and the refusal is correct.
    await seedManifest(handle);
    await handle.seedFiles({ [`${PACK_DIR}/mcp_servers/telemetry.json`]: PACK_SERVER_JSON });

    const result = await run(handle, ["set", "mcp.servers", PACK_SERVER_ID]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`unknown MCP server(s): ${PACK_SERVER_ID}`);
  });

  it("keeps a curated selection working with no pack installed at all", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "mcp.servers", "github,context7"]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.mcp?.servers).toEqual(["github", "context7"]);
  });

  it("writes nothing on --dry-run even though the pack id now validates", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "mcp.servers", PACK_SERVER_ID, "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would set");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("validates against the curated catalog alone when the caller read no pack ledger", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);
    const manifest = (await readManifest(handle.dir)) as SetupManifest;

    // `setConfigValue` is exported as a pure function over a manifest, so it
    // cannot read the ledger itself. The default context means "no pack read
    // happened here" — the same default `validateServerIds` applies to its own
    // optional tail — and this case pins that default rather than letting the
    // widened check leak into callers that never resolved supply.
    expect(() => setConfigValue(manifest, "mcp.servers", PACK_SERVER_ID)).toThrow(CliFailure);
    expect(setConfigValue(manifest, "mcp.servers", "github").mcp?.servers).toEqual(["github"]);

    // Resolved through the seam the command body itself uses, not hand-built:
    // a fixture row could drift from what the projection actually returns, and
    // then this case would prove the fixture rather than the wiring.
    const context: ConfigApplyContext = {
      packServers: await packMcpServers(
        await discoverInstalledPacks(handle.dir, manifest),
        handle.dir,
      ),
    };
    expect(context.packServers.map((server) => server.id)).toEqual([PACK_SERVER_ID]);
    expect(context.packServers[0]?.sourcePackId).toBe(PACK_ID);
    expect(setConfigValue(manifest, "mcp.servers", PACK_SERVER_ID, context).mcp?.servers).toEqual([
      PACK_SERVER_ID,
    ]);
  });
});

describe("config effort rows — only a level an emitted file would carry", () => {
  it("prints the marker on a client that carries effort only inside an unpinned model value", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["cursor"] });

    const result = await run(handle, []);

    // The bracket client writes `<id>[effort=<level>]`, so with no pin there
    // is no id for the parameter to ride on and the emitted file has neither
    // key. Cross-checked against the resolvers the adapter itself calls.
    expect(resolveModelValue("standard", "cursor", {}, {})).toBeUndefined();
    expect(resolveEffortValue("standard", "cursor", {})).toBeUndefined();
    expect(rowFor(result.stdout, "effort.standard")).toContain("(not expressed)");
    expect(rowFor(result.stdout, "effort.standard")).not.toMatch(/\bmedium\b/);
  });

  it("prints the marker on the client that publishes no effort surface", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["copilot"] });

    const result = await run(handle, []);

    expect(resolveEffortValue("advanced", "copilot", { advanced: "high" })).toBeUndefined();
    expect(rowFor(result.stdout, "effort.advanced")).toContain("(not expressed)");
    expect(rowFor(result.stdout, "effort.advanced")).not.toMatch(/\bhigh\b/);
  });

  it("prints the level on a client that does write it — the positive control", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude"] });

    const result = await run(handle, []);

    // Non-degenerate: this client has a standalone effort key, so the ladder's
    // own default for the class is exactly what the emitted file carries.
    expect(resolveEffortValue("standard", "claude", {})).toBe("medium");
    expect(rowFor(result.stdout, "effort.standard")).toMatch(/medium\s+\(default\)/);
    expect(rowFor(result.stdout, "effort.standard")).not.toContain("(not expressed)");
  });

  it("prints the level on the bracket client once a pin gives it somewhere to ride", async () => {
    const handle = tempDir();
    await seedManifest(handle, {
      tools: ["cursor"],
      models: { pins: { standard: "vendor-x-1" } },
    });

    const result = await run(handle, []);

    expect(resolveModelValue("standard", "cursor", { standard: "vendor-x-1" }, {})).toBe(
      "vendor-x-1[effort=medium]",
    );
    expect(rowFor(result.stdout, "effort.standard")).toMatch(/medium\s+\(default\)/);
  });

  it("prints the marker when the operator's own brackets are what stand", async () => {
    const handle = tempDir();
    await seedManifest(handle, {
      tools: ["cursor"],
      // A pin carrying its own bracket group is emitted verbatim: options live
      // comma-separated inside ONE group, so the ladder appends nothing and
      // the config effort value reaches no file.
      models: { pins: { standard: "vendor-x-1[effort=high]" }, effort: { standard: "low" } },
    });

    const result = await run(handle, []);

    expect(
      resolveModelValue("standard", "cursor", { standard: "vendor-x-1[effort=high]" }, {
        standard: "low",
      }),
    ).toBe("vendor-x-1[effort=high]");
    expect(rowFor(result.stdout, "effort.standard")).toContain("(not expressed)");
    // The value IS persisted — the marker describes what binds, not what is stored.
    expect(rowFor(result.stdout, "effort.standard")).toContain("(set)");
  });

  it("renders per client when the selected clients disagree", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude", "cursor"] });

    const result = await run(handle, []);

    // One client writes a standalone key, the other has nowhere to put it
    // without a pin. Collapsing that to one string would be false for one of
    // them, whichever string was chosen.
    const row = rowFor(result.stdout, "effort.standard");
    expect(row).toContain("claude=medium");
    expect(row).toContain("cursor=(not expressed)");
  });

  it("does not promote an explicitly set level that reaches no emitted file", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["cursor"] });

    const set = await run(handle, ["set", "effort.standard", "high"]);
    const list = await run(handle, []);

    // Setting it stays legal and is persisted — the manifest outlives the
    // client set. What changes is the claim: `high` is stored, and nothing
    // this repo emits carries it.
    expect(set.code).toBe(0);
    expect((await readManifest(handle.dir))?.models?.effort?.standard).toBe("high");
    expect(resolveModelValue("standard", "cursor", {}, { standard: "high" })).toBeUndefined();
    expect(resolveEffortValue("standard", "cursor", { standard: "high" })).toBeUndefined();
    expect(rowFor(list.stdout, "effort.standard")).toContain("(not expressed)");
    expect(rowFor(list.stdout, "effort.standard")).toMatch(/\(set\)/);
  });

  it("never prints a level no selected client would emit, over every class and client", () => {
    // The ladder's "never invent a value" rule as a property rather than a
    // sample: for every single-client repo and every class, a printed level
    // has to appear in something that client emits, and the marker has to mean
    // nothing does. Sweeps the pin states that change the answer.
    const pinStates = [
      {},
      { standard: "vendor-x-1", frontier: "vendor-x-1", advanced: "vendor-x-1", economy: "vendor-x-1" },
      {
        standard: "vendor-x-1[effort=high]",
        frontier: "vendor-x-1[effort=high]",
        advanced: "vendor-x-1[effort=high]",
        economy: "vendor-x-1[effort=high]",
      },
    ] as const;

    for (const tool of TOOLS) {
      for (const pins of pinStates) {
        for (const modelClass of MODEL_CLASSES) {
          const manifest = baseManifest({ tools: [tool as Tool], models: { pins } });
          const printed = getConfigValue(manifest, `effort.${modelClass}`).resolved;
          const emitted = [
            resolveModelValue(modelClass, tool, pins, {}),
            resolveEffortValue(modelClass, tool, {}),
          ].filter((value): value is string => value !== undefined);
          const carried = emitted.some((value) =>
            EFFORT_LEVELS.some(
              (level) => value === level || value.includes(`[effort=${level}]`),
            ),
          );
          const label = `${tool}/${modelClass}/${JSON.stringify(pins)}`;

          if (printed === "(not expressed)") {
            // The marker's own claim: the operator's level changes nothing the
            // client writes. Proved by moving it and comparing the emissions.
            const low = resolveModelValue(modelClass, tool, pins, { [modelClass]: "low" });
            const high = resolveModelValue(modelClass, tool, pins, { [modelClass]: "high" });
            expect(low, label).toBe(high);
            expect(resolveEffortValue(modelClass, tool, { [modelClass]: "low" }), label).toBe(
              resolveEffortValue(modelClass, tool, { [modelClass]: "high" }),
            );
          } else {
            expect(EFFORT_LEVELS as readonly string[], label).toContain(printed);
            expect(carried, `${label} printed ${printed} but emits none`).toBe(true);
          }
        }
      }
    }
  });

  /**
   * Reversed during integration, deliberately, and recorded here rather than
   * quietly re-expected: this case previously asserted `(not expressed)` on a
   * client-less manifest. The assertion is changed, not relaxed — the case
   * still pins the client-less resolution exactly, and now also pins the
   * shipped page it exists to protect, so it covers strictly more than before.
   *
   * Why the old expectation was wrong where it was published. The marker is a
   * PER-CLIENT verdict: "this client emits no effort, so your level reaches
   * none of its files". A manifest with no clients has nobody to hold that
   * verdict — and it is not a state a repo can reach, because the manifest
   * schema refuses it (`src/manifest/manifest.ts` → "`tools` must name at
   * least one target tool"). The only caller that constructs it is
   * `src/cli/docs/configReference.ts`'s `UNSET_PROBE`, which selects no client
   * ON PURPOSE so the generated page cannot publish a client-specific value —
   * the same probe keeps the model rows at `(client default)` instead of
   * naming `opus`.
   *
   * So the client-less answer is the page's answer, and `(not expressed)`
   * there published a falsehood: every reader of docs/configuration.md was
   * told effort binds nowhere, when a repo on claude or codex has the level
   * reach its emitted files. The level is a property of the CLASS and is
   * nameable without a client; WHICH clients apply it is column two's half of
   * the answer, which already reads "carried on …, omitted on …".
   *
   * The unit's own rule — "every level this surface prints has to be one an
   * emitted file would carry" — is not weakened by this. It is vacuous on a
   * client-less manifest (no file is emitted at all), and on the shipped page
   * the printed level is one claude and codex do carry. Every real-repo case
   * above, where the rule has force, is untouched and still green.
   */
  it("answers the effort rows with the class default on a repo that selected no client", () => {
    const manifest = baseManifest({ tools: [] });
    const expected: Record<string, string> = {
      frontier: "high",
      advanced: "high",
      standard: "medium",
      economy: "low",
    };
    for (const modelClass of MODEL_CLASSES) {
      const read = getConfigValue(manifest, `effort.${modelClass}`);
      expect(read.value, `effort.${modelClass} persists nothing`).toBeNull();
      // The ladder row's own default, not the per-client marker: with no
      // client selected there is no client the marker could be true of.
      expect(read.resolved, `effort.${modelClass} on a client-less repo`).toBe(
        expected[modelClass],
      );
      expect(read.resolved, `effort.${modelClass} must not print the marker`).not.toBe(
        "(not expressed)",
      );
    }
  });
});
