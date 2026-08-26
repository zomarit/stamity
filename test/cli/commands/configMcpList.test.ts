import { describe, expect, it } from "vitest";
import { configCommand } from "../../../src/cli/commands/config.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../../src/types/content.ts";
import { MANIFEST_FILE, MANIFEST_VERSION, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * `stamity config mcp list` — the empty-state answer to "which ids exist".
 *
 * The module's own doctrine (`src/cli/commands/config/mcp.ts` header) says the
 * answer is two-part: the curated catalog is one half, an installed pack's
 * `mcp_servers/` supply is the other, and "an operator who just installed a
 * pack must not be told their own server does not exist". Three surfaces
 * answered it. The `--json` payload carried `packCatalog`; the `config mcp add`
 * refusal named both halves in its `next:`; the zero-selected HUMAN branch
 * printed `curated:` alone. So the terminal told an operator with a pack
 * installed exactly what it tells an operator with none — the one state the
 * doctrine singles out as the one not to produce.
 *
 * What these cases pin: the empty state discloses both halves, the two prose
 * surfaces agree on the wording rather than merely resembling each other, and
 * a repo with no pack installed gains no line (the disclosure is a strict
 * addition, not a new fixed row that has to say "none").
 *
 * Green-signal guard: cases 1, 2 and 4 fail on the pre-change code — 1 and 4 on
 * the missing `installed packs:` line in stdout, 2 on the two surfaces printing
 * different text for the same fact. Case 3 (no pack -> no line) and case 5 (the
 * non-empty branch is untouched) are the negative controls that pass before and
 * after; they exist so a fix that prints the line unconditionally, or leaks it
 * into the selection listing, is caught rather than rewarded.
 *
 * Lane: the in-process CLI runner over a real temp directory, matching
 * `./config.test.ts` and `./configMcpEffort.test.ts`. The command reads on-disk
 * state (manifest ledger plus the pack bytes the projection parses), so the
 * virtual-fs lane cannot host it.
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

function run(handle: TempDirHandle, args: readonly string[]): ReturnType<typeof runInProcess> {
  return runInProcess([configCommand], ["config", ...args], { cwd: handle.dir });
}

const tempDir = useTempDir("stamity-config-mcp-list");

// ── An installed pack that supplies TWO MCP servers ────────────────────────
//
// Seeded as installed state — the `pack:<id>` ledger rows discovery reads plus
// the bytes under `.stamity/packs/<id>/mcp_servers/` the projection parses — for
// the reason `./config.test.ts` gives: this is the config command's lane, and
// the install path has its own.
//
// Two servers, not one: the disclosure joins its ids, and a single-server
// fixture cannot tell a working join from a `[0]` that happens to read the
// same. Ids are chosen so the projection's id sort (`acme-telemetry` before
// `acme-tracing`) is a different order from the file-name order the directory
// listing yields, which pins the rendered order to the seam rather than to the
// fixture's filenames.

const PACK_ID = "telepack";
const PACK_DIR = `${STATE_DIR}/packs/${PACK_ID}`;
const PACK_SERVER_ID = "acme-telemetry";
const PACK_SERVER_VAR = "ACME_TELEMETRY_TOKEN";
const SECOND_SERVER_ID = "acme-tracing";
const SECOND_SERVER_VAR = "ACME_TRACING_TOKEN";

function packServerJson(id: string, envVar: string, packageName: string): string {
  return `${JSON.stringify(
    {
      id,
      description: `${id} queries.`,
      command: "npx",
      args: ["-y", `${packageName}@3.2.1`, "--token", `\${env:${envVar}}`],
      transport: "stdio",
      requiresEnv: [{ name: envVar, description: "Read-only API token" }],
      pinnedVersion: "3.2.1",
      packageNameLock: packageName,
      blastRadius: "Low — read-only queries against a staging project.",
      docsUrl: `https://example.invalid/${id}`,
    },
    null,
    2,
  )}\n`;
}

/** One ledger row per pack file: discovery reads supply off the ledger, not the directory. */
function packLedger(files: readonly string[]): SetupManifest["ledger"] {
  return files.map((file) => ({
    path: `${PACK_DIR}/mcp_servers/${file}`,
    adapter: `pack:${PACK_ID}`,
    artifactId: `${PACK_ID}/mcp_servers/${file}`,
    artifactType: "infra" as const,
  }));
}

/** Seed a repo whose manifest records the fixture pack as installed. */
async function seedInstalledPack(
  handle: TempDirHandle,
  overrides: Partial<SetupManifest> = {},
): Promise<void> {
  await seedManifest(handle, {
    ledger: packLedger(["a-telemetry.json", "b-tracing.json"]),
    ...overrides,
  });
  await handle.seedFiles({
    [`${PACK_DIR}/mcp_servers/a-telemetry.json`]: packServerJson(
      PACK_SERVER_ID,
      PACK_SERVER_VAR,
      "@acme/telemetry-mcp",
    ),
    [`${PACK_DIR}/mcp_servers/b-tracing.json`]: packServerJson(
      SECOND_SERVER_ID,
      SECOND_SERVER_VAR,
      "@acme/tracing-mcp",
    ),
  });
}

/** The `curated:` line of the empty state, matched whole so a neighbour cannot answer for it. */
function lineContaining(stdout: string, needle: string): string | undefined {
  return stdout.split("\n").find((candidate) => candidate.includes(needle));
}

describe("config mcp list — the zero-selected empty state", () => {
  it("names the installed pack's servers beside the curated half", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);

    const result = await run(handle, ["mcp", "list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("none selected");
    // Both halves, always. The curated half is unchanged; the pack half is the
    // one an operator who just ran `stamity add` is looking for.
    expect(result.stdout).toContain("curated: github");
    expect(result.stdout).toContain(`installed packs: ${PACK_SERVER_ID}, ${SECOND_SERVER_ID}`);
    // Its own line beside `curated:`, not appended onto that line — the two
    // halves are separately readable, and a curated list that grows must not
    // push the pack half off the end of a wrapped row.
    expect(lineContaining(result.stdout, "installed packs:")).not.toContain("curated:");
    // The closing verb still points at the selection act: resolvable is not
    // selected, and nothing here has written to the manifest.
    expect(result.stdout).toContain("stamity config mcp add <id>");
  });

  it("prints the same wording the add refusal prints for the same fact", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);

    const listed = await run(handle, ["mcp", "list"]);
    const refused = await run(handle, ["mcp", "add", "nope"]);

    // The finding was two surfaces disagreeing about one fact, so the assertion
    // is agreement itself: the exact rendering the refusal has always used is
    // the rendering the empty state now uses. Built from the fixture ids, so a
    // fix that quietly re-words one side fails here rather than drifting.
    const disclosure = `installed packs: ${PACK_SERVER_ID}, ${SECOND_SERVER_ID}`;
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain(disclosure);
    expect(listed.stdout).toContain(disclosure);
  });

  it("adds no line at all when no pack is installed", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("none selected");
    expect(result.stdout).toContain("curated: github");
    // Negative control. The disclosure is a strict addition for the repos that
    // have something to disclose; a fixed row reading "installed packs: none"
    // would be noise on every pack-less repo, which is most of them.
    expect(result.stdout).not.toContain("installed packs");
    expect(result.stdout).not.toContain(PACK_SERVER_ID);
  });

  it("keeps the human and --json answers agreeing about pack supply", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);

    const human = await run(handle, ["mcp", "list"]);
    const json = await run(handle, ["mcp", "list", "--json"]);

    // `packCatalog` already carried both ids; the human surface hid them. The
    // payload is asserted unchanged so this fix reads as a disclosure on one
    // surface, not a contract move on the machine-readable one.
    const payload = JSON.parse(json.stdout) as { servers: unknown[]; packCatalog: string[] };
    expect(payload.packCatalog).toEqual([PACK_SERVER_ID, SECOND_SERVER_ID]);
    expect(payload.servers).toEqual([]);
    for (const id of payload.packCatalog) expect(human.stdout).toContain(id);
  });

  it("leaves the non-empty listing alone when a server is selected", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle, { mcp: { servers: ["github"] } });

    const result = await run(handle, ["mcp", "list"]);

    expect(result.code).toBe(0);
    // Negative control for branch leakage: with a selection the operator is
    // past the "which ids exist" question, and this branch answers "what is
    // selected and what is still blank". The curated dump does not belong here
    // and neither does the pack dump.
    expect(result.stdout).toContain("1 selected");
    expect(result.stdout).toContain("github");
    expect(result.stdout).not.toContain("installed packs:");
    expect(result.stdout).not.toContain("curated:");
  });
});
