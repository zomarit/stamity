import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFIG_KEYS,
  configCommand,
  getConfigValue,
  setConfigValue,
} from "../../../src/cli/commands/config.ts";
import { CliFailure } from "../../../src/cli/kit/output.ts";
import { readManifest } from "../../../src/manifest/manifest.ts";
import { getSourceEnvMcpCommand } from "../../../src/mcp/env.ts";
import { resolveModelValue } from "../../../src/roster/modelLadder.ts";
import {
  DEFAULT_MAX_REVIEW_ITERATIONS,
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
} from "../../../src/roster/reviewCaps.ts";
import { MODEL_CLASSES } from "../../../src/types/core.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../../src/types/content.ts";
import { MANIFEST_FILE, MANIFEST_VERSION, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * `stamity config` — the reconfigure verb.
 *
 * Lane: the in-process CLI runner over a REAL temp directory. The command's
 * whole job is reading and rewriting on-disk state through the engine's atomic
 * writer (temp+rename under a cross-process lock), so the virtual-fs lane
 * cannot host it; running the funnel in-process keeps every case deterministic
 * and child-process free. `runInProcess` defaults env to `{}` and every TTY
 * fact to false, so no ANSI codes reach the assertions and no prompt can hang.
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

async function readOrNull(handle: TempDirHandle, relative: string): Promise<string | null> {
  try {
    return await readFile(join(handle.dir, relative), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function run(
  handle: TempDirHandle,
  args: readonly string[],
): ReturnType<typeof runInProcess> {
  return runInProcess([configCommand], ["config", ...args], { cwd: handle.dir });
}

/** The single JSON document a `--json` run is allowed to write to stdout. */
function singleDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

/** The `list` row for one key, matched whole so the marker cannot be read off a neighbour. */
function rowFor(stdout: string, key: string): string {
  const line = stdout
    .split("\n")
    .find((candidate) => candidate.trimStart().startsWith(`${key} `));
  expect(line, `no list row for ${key}`).toBeDefined();
  return line ?? "";
}

const tempDir = useTempDir("stamity-config");

/** A github token literal, shaped to match the scanner's `github-token` pattern. */
const TOKEN_LITERAL = `ghp_${"0123456789abcdefghijklmnopqrstuvwxyz"}`;

// ── An installed pack that supplies one MCP server ─────────────────────────
//
// Seeded as installed state (ledger row + on-disk definition) rather than run
// through `planPackInstall`/`applyPackInstall`: this suite is the config
// command's lane, and the install path has its own. The two halves discovery
// actually reads are exactly what is seeded — the `pack:<id>` ledger rows that
// name the class, and the bytes under `.stamity/packs/<id>/mcp_servers/`.

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

/** The ledger rows an install of the fixture pack leaves behind. */
const PACK_LEDGER: SetupManifest["ledger"] = [
  {
    path: `${PACK_DIR}/mcp_servers/telemetry.json`,
    adapter: `pack:${PACK_ID}`,
    artifactId: `${PACK_ID}/mcp_servers/telemetry.json`,
    artifactType: "infra",
  },
];

/** Seed a repo whose manifest records the fixture pack as installed. */
async function seedInstalledPack(handle: TempDirHandle): Promise<void> {
  await seedManifest(handle, { ledger: PACK_LEDGER });
  await handle.seedFiles({ [`${PACK_DIR}/mcp_servers/telemetry.json`]: PACK_SERVER_JSON });
}

describe("config list", () => {
  it("prints every key with a (set)/(default) marker and resolves defaults", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude", "cursor"], maturityTier: "scaleup" });

    const result = await run(handle, []);

    expect(result.code).toBe(0);
    for (const key of CONFIG_KEYS) expect(rowFor(result.stdout, key)).toContain(key);
    expect(rowFor(result.stdout, "tools")).toMatch(/claude, cursor\s+\(set\)/);
    expect(rowFor(result.stdout, "maturityTier")).toMatch(/scaleup\s+\(set\)/);
    // No confidence-floor row. The dial was closed by REMOVAL, not by wiring: the
    // review-loop gate is already enforced at a fixed threshold the operator
    // does not set — the emitted review-gate hook refuses exactly one pair, an
    // approval the reviewer itself rated `low`, and lets `medium` and `high`
    // close the loop (`UNTRUSTED_CONFIDENCE`, `src/hooks/scripts.ts`). So the
    // row did not merely lack a reader; it declared a threshold that shipped
    // enforcement ignores, which is the framing `src/types/core.ts` ratifies.
    // Asserted on BOTH surfaces: the closed registry the loop above walks, and
    // the rendered output — a row printed outside the registry walk would pass
    // the registry arm alone.
    expect(CONFIG_KEYS).not.toContain("confidenceFloor");
    expect(result.stdout).not.toMatch(/confidence/i);
    expect(rowFor(result.stdout, "platform")).toMatch(/none\s+\(default\)/);
    expect(rowFor(result.stdout, "learnings.maxCount")).toMatch(/150\s+\(default\)/);
  });

  it("emits exactly one JSON document carrying every key row", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["--json"]);

    expect(result.code).toBe(0);
    const doc = singleDoc(result.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["command"]).toBe("config");
    expect(doc["keys"]).toHaveLength(CONFIG_KEYS.length);
  });
});

describe("config get", () => {
  it("prints the raw persisted value", async () => {
    const handle = tempDir();
    await seedManifest(handle, { maturityTier: "team" });

    const result = await run(handle, ["get", "maturityTier"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("maturityTier  team");
  });

  it("prints (default: none) for mcp.servers on a manifest without mcp", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["get", "mcp.servers"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("(default: none)");
  });

  it("refuses an unknown key, listing every config key", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["get", "maturity"]);

    expect(result.code).toBe(1);
    for (const key of CONFIG_KEYS) expect(result.stderr).toContain(key);
  });

  it("refuses a bare get with the usage next-step", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["get"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stamity config get <key>");
  });
});

describe("config set", () => {
  it("persists the value and closes with the sync next-step", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "maturityTier", "team"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("next: run stamity sync to apply");
    expect((await readManifest(handle.dir))?.maturityTier).toBe("team");
  });

  it("refuses an out-of-enum value, listing the four tiers", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "maturityTier", "bogus"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("solo | team | scaleup | enterprise");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses an unknown key, listing every config key", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "maturity", "team"]);

    expect(result.code).toBe(1);
    for (const key of CONFIG_KEYS) expect(result.stderr).toContain(key);
  });

  it("sets tools from a csv and refuses an unknown tool with the valid set", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const ok = await run(handle, ["set", "tools", "claude,cursor"]);
    expect(ok.code).toBe(0);
    expect((await readManifest(handle.dir))?.tools).toEqual(["claude", "cursor"]);

    const bad = await run(handle, ["set", "tools", "claude,vim"]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("claude, cursor, copilot, codex");
    // The rejected write left the accepted one standing.
    expect((await readManifest(handle.dir))?.tools).toEqual(["claude", "cursor"]);
  });

  it("normalizes csv values written with spaces", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "tools", "claude, cursor"]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.tools).toEqual(["claude", "cursor"]);
  });

  it("refuses learnings.maxCount 0 and accepts 150", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const zero = await run(handle, ["set", "learnings.maxCount", "0"]);
    expect(zero.code).toBe(1);
    expect(zero.stderr).toContain("positive integer");

    const ok = await run(handle, ["set", "learnings.maxCount", "150"]);
    expect(ok.code).toBe(0);
    expect((await readManifest(handle.dir))?.learnings?.maxCount).toBe(150);
  });

  it("surfaces the engine's message for a userHooksDir that climbs out of the repo", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "hooks.userHooksDir", "../outside"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("climbs out of the repo root");
    expect((await readManifest(handle.dir))?.hooks).toBeUndefined();
  });

  it("prints the diff and writes nothing under --dry-run", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "maturityTier", "team", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would set maturityTier: solo -> team");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("reports a set to the current value as a no-op", async () => {
    const handle = tempDir();
    await seedManifest(handle, { maturityTier: "team" });
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "maturityTier", "team"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("emits exactly one ok:false document for a rejected value in JSON mode", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "maturityTier", "bogus", "--json"]);

    expect(result.code).toBe(1);
    const doc = singleDoc(result.stdout);
    expect(doc["ok"]).toBe(false);
    expect(doc["error"]).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("config — the model ladder's nine keys", () => {
  const LADDER_KEYS = [
    ...MODEL_CLASSES.map((modelClass) => `model.${modelClass}`),
    ...MODEL_CLASSES.map((modelClass) => `effort.${modelClass}`),
    "review.maxIterations",
  ];

  it("addresses one key per class per axis, plus the cap", () => {
    expect(LADDER_KEYS).toHaveLength(9);
    for (const key of LADDER_KEYS) expect(CONFIG_KEYS).toContain(key);
  });

  it("lists every ladder key with a readable effective value and a (default) marker", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, []);

    expect(result.code).toBe(0);
    for (const key of LADDER_KEYS) {
      const row = rowFor(result.stdout, key);
      expect(row, `row for ${key}`).toContain("(default)");
      // Non-degenerate: the value column carries a word, never a blank.
      expect(row.slice(key.length).trim().replace("(default)", "").trim()).not.toBe("");
    }
  });

  it("resolves every ladder key to a string on a manifest that persists nothing", () => {
    const manifest = baseManifest();
    for (const key of LADDER_KEYS) {
      const read = getConfigValue(manifest, key);
      expect(read.value, `${key} must persist nothing`).toBeNull();
      expect(read.isDefault).toBe(true);
      expect(read.resolved.trim(), `${key} must resolve to something readable`).not.toBe("");
    }
  });

  it("shows the class's own ladder effort as the effective value when none is set", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, []);

    // The ladder's own rows: advanced runs high, standard medium, economy low.
    expect(rowFor(result.stdout, "effort.advanced")).toMatch(/high\s+\(default\)/);
    expect(rowFor(result.stdout, "effort.standard")).toMatch(/medium\s+\(default\)/);
    expect(rowFor(result.stdout, "effort.economy")).toMatch(/low\s+\(default\)/);
  });

  it("names the clients that carry effort rather than implying all four do", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["copilot"] });

    // Setting effort on a copilot-only repo is legal and inert; the refusal
    // message quotes the hint, which is where the carrier list is published.
    const inert = await run(handle, ["set", "effort.standard", "high"]);
    expect(inert.code).toBe(0);
    expect((await readManifest(handle.dir))?.models?.effort?.standard).toBe("high");

    const refused = await run(handle, ["set", "effort.standard", "nonsense"]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("carried on claude, cursor, codex");
    expect(refused.stderr).toContain("omitted on copilot");
  });

  it("persists a pin under models.pins and reads it back with a before->after diff", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const set = await run(handle, ["set", "model.standard", "vendor-x-1"]);
    expect(set.code).toBe(0);
    expect(set.stdout).toContain("set model.standard:");
    expect(set.stdout).toContain("-> vendor-x-1");
    expect(set.stdout).toContain("next: run stamity sync to apply");
    expect((await readManifest(handle.dir))?.models?.pins?.standard).toBe("vendor-x-1");

    const get = await run(handle, ["get", "model.standard"]);
    expect(get.code).toBe(0);
    expect(get.stdout).toContain("model.standard  vendor-x-1");
  });

  it("resolves a pinned row to exactly what the adapter will write for that client", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["cursor"] });

    await run(handle, ["set", "model.standard", "vendor-x-1"]);
    const manifest = await readManifest(handle.dir);
    const expected = resolveModelValue("standard", "cursor", { standard: "vendor-x-1" });

    // The bracket client carries effort inside the model value, so the stored
    // pin and the effective value legitimately differ — the page's whole point.
    expect(expected).toBe("vendor-x-1[effort=medium]");
    expect(getConfigValue(manifest as SetupManifest, "model.standard")).toEqual({
      value: "vendor-x-1",
      isDefault: false,
      resolved: expected,
    });
  });

  it("renders per client when the selected clients resolve a class differently", () => {
    const manifest = baseManifest({ tools: ["claude", "cursor"] });

    // claude publishes an alias for `advanced`; cursor resolves nothing without
    // a pin. Collapsing that to one string would name a model cursor's emitted
    // file does not contain.
    const resolved = getConfigValue(manifest, "model.advanced").resolved;
    expect(resolved).toContain("claude=opus");
    expect(resolved).toContain("cursor=(client default)");
  });

  it("keeps a pin no selected client can express — the client may be added later", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["copilot"] });

    const result = await run(handle, ["set", "model.frontier", "vendor-x-9"]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.models?.pins?.frontier).toBe("vendor-x-9");
    expect((await run(handle, ["get", "model.frontier"])).stdout).toContain("vendor-x-9");
  });

  it("refuses a blank pin rather than emitting a key with no value", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "model.standard", "   "]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("`models.pins.standard`");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses an out-of-band effort level, naming the three", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "effort.standard", "nonsense"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("low | medium | high");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses a cap below the floor, above the ceiling, or fractional", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    // A refusal writes nothing, so the three attempts are independent of one
    // another and of the byte check that follows them.
    const attempts = [
      String(MIN_MAX_REVIEW_ITERATIONS - 1),
      String(HARD_MAX_REVIEW_ITERATIONS + 1),
      "4.5",
    ];
    const results = await Promise.all(
      attempts.map((raw) => run(handle, ["set", "review.maxIterations", raw])),
    );

    results.forEach((result, index) => {
      expect(result.code, `cap ${attempts[index]} must be refused`).toBe(1);
      expect(result.stderr).toContain(
        `${MIN_MAX_REVIEW_ITERATIONS}..${HARD_MAX_REVIEW_ITERATIONS}`,
      );
    });
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses a trailing-garbage cap instead of reading the leading digits", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    // Number() over parseInt(): parseInt("4abc") is 4, which would silently
    // persist a cap the operator never typed.
    const result = await run(handle, ["set", "review.maxIterations", "4abc"]);

    expect(result.code).toBe(1);
    expect((await readManifest(handle.dir))?.models).toBeUndefined();
  });

  it("persists an in-band cap and reports it as the effective one", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const cap = DEFAULT_MAX_REVIEW_ITERATIONS + 2;

    const result = await run(handle, ["set", "review.maxIterations", String(cap)]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.models?.reviewCap).toBe(cap);
    expect(rowFor((await run(handle, [])).stdout, "review.maxIterations")).toMatch(
      new RegExp(`${cap}\\s+\\(set\\)`),
    );
  });

  it("shows the engine's cap as the effective value before anything is set", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["get", "review.maxIterations"]);

    expect(result.stdout).toContain(`(default: ${DEFAULT_MAX_REVIEW_ITERATIONS})`);
  });

  it("refuses a class the registry does not name, listing the closed key set", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "model.turbo", "vendor-x-1"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("config addresses a closed key set");
    for (const key of CONFIG_KEYS) expect(result.stderr).toContain(key);
    expect((await readManifest(handle.dir))?.models).toBeUndefined();
  });

  it("writes nothing under --dry-run and still prints the diff", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "model.economy", "vendor-x-mini", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would set model.economy:");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("emits exactly one JSON envelope for a ladder set", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "effort.frontier", "low", "--json"]);

    expect(result.code).toBe(0);
    const doc = singleDoc(result.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["command"]).toBe("config");
    expect(doc["changed"]).toBe(true);
    expect(doc["value"]).toBe("low");
  });

  it("adds no models block to a manifest that sets none", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    // A read-only pass over every ladder key must not persist a thing — and
    // reads are independent, so they run together.
    await run(handle, []);
    await Promise.all(LADDER_KEYS.map((key) => run(handle, ["get", key])));

    expect(await manifestBytes(handle)).toBe(before);
    expect(before).not.toContain("models");
  });
});

describe("config detect", () => {
  /** A TypeScript repo the analyzer identifies by its root config files. */
  const tsRepo = {
    "package.json": `${JSON.stringify({ name: "fixture", private: true }, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`,
  };

  it("refreshes manifest.detected and prints the before->after diff", async () => {
    const handle = tempDir();
    await handle.seedFiles(tsRepo);
    await seedManifest(handle, {
      detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    });

    const result = await run(handle, ["detect"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("languages");
    expect(result.stdout).toContain("none -> typescript");
    expect(result.stdout).toContain("next: run stamity sync to apply");
    expect((await readManifest(handle.dir))?.detected?.languages).toContain("typescript");
  });

  it("reports nothing to refresh once the manifest matches the repo", async () => {
    const handle = tempDir();
    await handle.seedFiles(tsRepo);
    await seedManifest(handle, {
      detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    });

    await run(handle, ["detect"]);
    const settled = await manifestBytes(handle);
    const second = await run(handle, ["detect"]);

    expect(second.code).toBe(0);
    expect(second.stdout).toContain("already matches");
    expect(await manifestBytes(handle)).toBe(settled);
  });

  it("writes nothing under --dry-run", async () => {
    const handle = tempDir();
    await handle.seedFiles(tsRepo);
    await seedManifest(handle, {
      detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    });
    const before = await manifestBytes(handle);

    const result = await run(handle, ["detect", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("none -> typescript");
    expect(await manifestBytes(handle)).toBe(before);
  });
});

describe("config mcp", () => {
  it("adds a curated server, provisions .env.mcp, and keeps it gitignored", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "add", "brave-search"]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.mcp?.servers).toEqual(["brave-search"]);
    expect(await readOrNull(handle, ".env.mcp")).toContain("BRAVE_API_KEY=");
    expect(await readOrNull(handle, ".gitignore")).toContain(".env.mcp");
    // The disclaimer names the command for the shell this process is running in.
    expect(result.stdout).toContain(getSourceEnvMcpCommand());
    expect(result.stdout).toContain("next: run stamity sync to apply");
  });

  it("refuses an unknown server id, listing the curated ids", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "add", "nope"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("github");
    expect(result.stderr).toContain("context7");
    expect(result.stderr).toContain("no installed pack supplies a server");
    expect(await readOrNull(handle, ".env.mcp")).toBeNull();
  });

  it("selects a server an installed pack supplies and provisions its credential", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);

    const result = await run(handle, ["mcp", "add", PACK_SERVER_ID]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.mcp?.servers).toEqual([PACK_SERVER_ID]);
    // Selecting it is only half the job: without the variable the pack's
    // definition references, the server cannot launch.
    expect(await readOrNull(handle, ".env.mcp")).toContain(`${PACK_SERVER_VAR}=`);
    expect(result.stdout).toContain(PACK_SERVER_VAR);
  });

  it("names BOTH the curated ids and the installed pack's ids on an unknown id", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);

    const result = await run(handle, ["mcp", "add", "nope"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("context7");
    expect(result.stderr).toContain(`installed packs: ${PACK_SERVER_ID}`);
    expect(await readOrNull(handle, ".env.mcp")).toBeNull();
  });

  it("lists a selected pack server by its supplier, not as an unknown id", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);
    await run(handle, ["mcp", "add", PACK_SERVER_ID]);

    const result = await run(handle, ["mcp", "list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`(pack ${PACK_ID})`);
    expect(result.stdout).not.toContain("not in catalog");
    expect(result.stdout).toContain("Deployment telemetry queries.");
    expect(result.stdout).toContain(`${PACK_SERVER_VAR}  missing`);
  });

  it("still refuses a pack id once the supplying pack is no longer installed", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "add", PACK_SERVER_ID]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`unknown MCP server "${PACK_SERVER_ID}"`);
  });

  it("is idempotent for an already-selected id", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: ["context7"] } });

    const result = await run(handle, ["mcp", "add", "context7"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already selected");
    expect((await readManifest(handle.dir))?.mcp?.servers).toEqual(["context7"]);
  });

  it("warns without blocking when .env.mcp already holds a literal credential", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await handle.seedFiles({ ".env.mcp": `GITHUB_PAT=${TOKEN_LITERAL}\n` });

    const result = await run(handle, ["mcp", "add", "github"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("warning:");
    // Masked, never echoed: the literal must not reach the transcript.
    expect(result.stderr).not.toContain(TOKEN_LITERAL);
    expect((await readManifest(handle.dir))?.mcp?.servers).toEqual(["github"]);
  });

  it("removes the id and leaves .env.mcp byte-identical", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: ["brave-search", "context7"] } });
    await handle.seedFiles({ ".env.mcp": "BRAVE_API_KEY=filled-in-by-hand\n" });
    const envBefore = await readOrNull(handle, ".env.mcp");

    const result = await run(handle, ["mcp", "remove", "brave-search"]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.mcp?.servers).toEqual(["context7"]);
    expect(await readOrNull(handle, ".env.mcp")).toBe(envBefore);
    expect(result.stdout).toContain("next: run stamity sync to apply");
  });

  it("refuses to remove a server that is not selected", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: ["context7"] } });

    const result = await run(handle, ["mcp", "remove", "brave-search"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("context7");
  });

  it("lists the selection with a credential verdict per required variable", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: ["brave-search"] } });
    await handle.seedFiles({ ".env.mcp": "BRAVE_API_KEY=\n" });

    const result = await run(handle, ["mcp", "list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("brave-search");
    expect(result.stdout).toContain("BRAVE_API_KEY  missing");
  });

  it("writes nothing under --dry-run", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "add", "brave-search", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("none -> brave-search");
    expect(await manifestBytes(handle)).toBe(before);
    expect(await readOrNull(handle, ".env.mcp")).toBeNull();
  });

  it("refuses an mcp action with no server id", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "add"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stamity config mcp add <id>");
  });
});

describe("config on an uninitialised repo", () => {
  const invocations: readonly (readonly string[])[] = [
    [],
    ["list"],
    ["get", "platform"],
    ["set", "platform", "github"],
    ["detect"],
    ["mcp", "list"],
    ["mcp", "add", "context7"],
    ["mcp", "remove", "context7"],
  ];

  it.each(invocations.map((args) => [args.join(" ") || "(bare)", args] as const))(
    "config %s exits 1 pointing at init",
    async (_label, args) => {
      const handle = tempDir();

      const result = await run(handle, args);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("stamity init");
    },
  );
});

describe("config subcommand dispatch", () => {
  it("refuses an unknown subcommand, naming the five it takes", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["reset"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("list, get, set, detect, mcp");
  });

  it("rejects excess positionals as a usage error", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["set", "maturityTier", "team", "extra"]);

    expect(result.code).toBe(2);
  });
});

describe("getConfigValue / setConfigValue", () => {
  it("reports persisted values as set and absent ones as engine defaults", () => {
    const manifest = baseManifest({ maturityTier: "enterprise" });

    expect(getConfigValue(manifest, "maturityTier")).toEqual({
      value: "enterprise",
      isDefault: false,
      resolved: "enterprise",
    });
    expect(getConfigValue(manifest, "communicationStyle")).toEqual({
      value: null,
      isDefault: true,
      resolved: "plain",
    });
  });

  it("returns a new manifest and never mutates the input", () => {
    const manifest = baseManifest();
    const snapshot = structuredClone(manifest);

    const next = setConfigValue(manifest, "communicationStyle", "technical");

    expect(next.communicationStyle).toBe("technical");
    expect(next).not.toBe(manifest);
    expect(manifest).toEqual(snapshot);
  });

  it("throws CliFailure for an unknown key and for a value the schema refuses", () => {
    const manifest = baseManifest();

    expect(() => setConfigValue(manifest, "nope", "x")).toThrow(CliFailure);
    expect(() => setConfigValue(manifest, "maturityTier", "huge")).toThrow(CliFailure);
    expect(() => setConfigValue(manifest, "mcp.servers", "context7,nope")).toThrow(/nope/);
  });

  it("accepts a curated csv for mcp.servers, collapsing repeats", () => {
    const next = setConfigValue(baseManifest(), "mcp.servers", "context7, github, context7");

    expect(next.mcp?.servers).toEqual(["context7", "github"]);
  });

  it("keeps the mcp block schema-valid when only protocolVersion is set", () => {
    // The two mcp keys write into one object, so the spread order is load-bearing:
    // an absent block has to gain the `servers: []` the schema requires, and a
    // populated one must not have its selection erased by that same default.
    const fresh = setConfigValue(baseManifest(), "mcp.protocolVersion", "2025-06-18");
    expect(fresh.mcp).toEqual({ servers: [], protocolVersion: "2025-06-18" });

    const existing = setConfigValue(
      baseManifest({ mcp: { servers: ["github"] } }),
      "mcp.protocolVersion",
      "2025-06-18",
    );
    expect(existing.mcp).toEqual({ servers: ["github"], protocolVersion: "2025-06-18" });

    // ...and the reverse write leaves the revision standing.
    expect(setConfigValue(existing, "mcp.servers", "context7").mcp).toEqual({
      servers: ["context7"],
      protocolVersion: "2025-06-18",
    });
  });
});
