import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  CONFIG_KEYS,
  configCommand,
  getConfigValue,
  setConfigValue,
} from "../../../src/cli/commands/config.ts";
import { CliFailure } from "../../../src/cli/kit/output.ts";
import { runCli, type CommandIo } from "../../../src/cli/kit/program.ts";
import { readManifest } from "../../../src/manifest/manifest.ts";
import { getSourceEnvMcpCommand } from "../../../src/mcp/env.ts";
import { resolveEffortValue, resolveModelValue } from "../../../src/roster/modelLadder.ts";
import {
  DEFAULT_MAX_REVIEW_ITERATIONS,
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
} from "../../../src/roster/reviewCaps.ts";
import { MODEL_CLASSES } from "../../../src/types/core.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../../src/types/content.ts";
import {
  MANIFEST_FILE,
  MANIFEST_VERSION,
  RULE_DELIVERIES,
  RULE_DELIVERY_DEFAULT,
  type SetupManifest,
} from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { MENU_KEYS, MenuTtyInput, waitForOutput } from "../../support/menuTty.ts";
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

/**
 * The same funnel with somebody on the other end: a TTY stdin and the answers
 * they would type.
 *
 * This is the picker's TYPED path — `runInProcess`'s stdin is a PassThrough
 * with no `setRawMode`, which is exactly the input the kit's menu probe
 * refuses — so every case here reads the numbered list. The two raw-menu cases
 * build their own stdin below.
 *
 * BOTH stdin AND stdout are wired as TTYs (B8): a real interactive session has
 * both, and `config`'s bare-verb branch now reads `ctx.terminal.stdoutIsTTY`
 * too, so a caller of this helper that left stdout off the TTY set would stop
 * opening the picker at all — exactly the bug this fix closes, reproduced by
 * accident rather than on purpose. `NO_COLOR` goes along with it: a TTY stdout
 * also flips `colorEnabled` on (`../../../src/cli/kit/terminal.ts::resolveColorEnabled`),
 * and every assertion in this describe block matches plain, uncoloured text —
 * this keeps the fixture's own long-standing "no TTY facts leak ANSI" property
 * true after the stdout fact changes, rather than repainting every assertion.
 */
function runInteractive(
  handle: TempDirHandle,
  args: readonly string[],
  stdinLines: readonly string[],
): ReturnType<typeof runInProcess> {
  return runInProcess([configCommand], ["config", ...args], {
    cwd: handle.dir,
    stdinLines,
    tty: { stdin: true, stdout: true },
    env: { NO_COLOR: "1" },
  });
}

/** The 1-based row a key occupies in the picker, read off the registry order. */
function keyRow(key: string): string {
  return String(CONFIG_KEYS.indexOf(key) + 1);
}

/**
 * Starts bare `config` against a stdin the raw-menu probe accepts, and hands
 * back the running promise, the live transcript and the stream to press keys
 * into. Command output and prompt output share one transcript, as they share
 * one stdout in production.
 */
function startConfigOnMenuTty(
  handle: TempDirHandle,
  argv: readonly string[] = [],
): { run: Promise<number>; input: MenuTtyInput; transcript: () => string } {
  const chunks: string[] = [];
  const io: CommandIo = {
    out: (text) => {
      chunks.push(text);
    },
    err: (text) => {
      chunks.push(text);
    },
  };
  const input = new MenuTtyInput();
  const promptOut = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  }) as Writable & { isTTY?: boolean };
  // The menu writes cursor escapes, so it draws only where the OUTPUT is a
  // terminal too — the second half of the kit's capability probe.
  promptOut.isTTY = true;

  const running = runCli(["config", ...argv], [configCommand], {
    cwd: handle.dir,
    // NO_COLOR alongside `stdoutIsTTY: true` (B8): `terminal.stdoutIsTTY` now
    // has to read true here too — the bare-verb branch checks it to decide
    // whether the picker is even reachable, and a real raw-menu-capable
    // session genuinely has both stdin AND stdout as TTYs — but that also
    // flips `colorEnabled` on, and every menu-transcript assertion in this
    // suite matches plain text. `NO_COLOR` keeps that true without touching
    // the fact under test.
    env: { NO_COLOR: "1" },
    io,
    promptIo: { input, output: promptOut },
    terminal: { stdoutIsTTY: true, stderrIsTTY: false, stdinIsTTY: true },
  });
  return { run: running, input, transcript: () => chunks.join("") };
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

  it("strips control bytes from a manifest-derived value before it reaches the terminal (W3, second sink)", async () => {
    // `model.standard` is shape-checked only (non-empty, one line — embedded
    // \r/\n are the ONE thing the schema itself refuses) and passed through
    // verbatim otherwise, so an ESC/OSC sequence in a pinned model id survives
    // to `getConfigValue`/`resolvePin` unmodified. `runList` prints that value
    // straight to the terminal with no menu frame around it at all — the
    // second sink for the same hazard the raw menu's `sanitizeLabel` already
    // closes, and the one this case proves closed too.
    const handle = tempDir();
    const esc = String.fromCharCode(27);
    const bel = String.fromCharCode(7);
    const hostile = `vendor-x${esc}]0;pwned${bel}-1`;
    await seedManifest(handle, { models: { pins: { standard: hostile } } });

    const result = await run(handle, []);

    expect(result.code).toBe(0);
    const row = rowFor(result.stdout, "model.standard");
    expect(row).not.toContain(esc);
    expect(row).not.toContain(bel);
    expect(row).toContain("vendor-x");
    expect(row).toContain("pwned");
    expect(row).toContain("-1");
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

/**
 * Bare `stamity config` — the picker, and the scriptability floor under it.
 *
 * Decision 6 gives the config surface ONE interactive rendering, on the one
 * invocation that names no action: bare `config` on an interactive terminal
 * offers a navigable list of the keys and applies one change through the same
 * path `set` uses. Every other run of it — a pipe, CI, `-y`, `--json`, an
 * explicit `config list` — is the list it always was, which is the property the
 * first two cases pin byte for byte.
 */
describe("config — the bare picker", () => {
  it("prints the list byte-identically when nothing interactive is attached", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude", "cursor"], maturityTier: "scaleup" });

    const bare = await run(handle, []);
    const listed = await run(handle, ["list"]);

    expect(bare.code).toBe(0);
    expect(bare.stdout).toBe(listed.stdout);
    expect(bare.stdout).not.toContain("Which setting?");
  });

  // B8: `promptGate` reads stdin alone, so a TTY stdin with a PIPED stdout
  // (`stamity config | less`, or any script that captures output while
  // attended) still opened the picker and wrote its typed prompt into the
  // pipe — nobody there to answer it. docs/configuration.md and this file's
  // own header promise "Scripts, pipes and CI see no prompt — bare config is
  // config list"; a TTY stdin with a non-TTY stdout is exactly that case and
  // was the one this promise did not hold for.
  it("takes the list when stdin is a TTY but stdout is piped, and asks nothing (B8)", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude", "cursor"], maturityTier: "scaleup" });

    // TTY stdin, but stdout left OFF the TTY set — the piped-stdout shape.
    const piped = await runInProcess([configCommand], ["config"], {
      cwd: handle.dir,
      tty: { stdin: true },
    });
    const listed = await run(handle, ["list"]);

    expect(piped.code).toBe(0);
    expect(piped.stdout).toBe(listed.stdout);
    expect(piped.stdout).not.toContain("Which setting?");
  });

  it("takes the list on a terminal under -y, so a script that asked for silence gets it", async () => {
    const handle = tempDir();
    await seedManifest(handle, { maturityTier: "scaleup" });

    const yes = await runInteractive(handle, ["-y"], []);
    const listed = await run(handle, ["list"]);

    expect(yes.code).toBe(0);
    expect(yes.stdout).toBe(listed.stdout);
  });

  it("emits one JSON document and no prompt on a terminal under --json", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await runInteractive(handle, ["--json"], []);

    expect(result.code).toBe(0);
    const doc = singleDoc(result.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["keys"]).toHaveLength(CONFIG_KEYS.length);
  });

  it("picks a key off the list, picks a value from its vocabulary, and applies it", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    // Row 1 is "(keep unchanged)" (F4): row 2 is now the first real choice
    // (`solo`), row 3 `team`. Was "2" before that row was prepended, and this
    // answer moved one row down rather than the assertion below changing.
    const result = await runInteractive(handle, [], [keyRow("maturityTier"), "3"]);

    expect(result.code).toBe(0);
    // The menu IS the list: every key row carries the resolved value and the
    // (set)/(default) marker `config list` prints for it.
    expect(result.stdout).toMatch(/maturityTier\s+solo\s+\(default\)/);
    // ...and the confirmation is `set`'s own, run-sync reminder included.
    expect(result.stdout).toContain("set maturityTier: solo -> team");
    expect(result.stdout).toContain("next: run stamity sync to apply");
    expect((await readManifest(handle.dir))?.maturityTier).toBe("team");
  });

  it("declines through the (keep unchanged) row: Enter-Enter off bare config leaves the manifest untouched (F4)", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    // Row 1 of the key menu (`tools`), blank answer -> Enter accepts the
    // default row there too. Row 1 of the VALUE menu is the new
    // "(keep unchanged)" row and is also the default: two blank answers must
    // decline the whole picker rather than landing on `platform`'s (or any
    // key's) first real choice, the way Enter-Enter used to.
    const result = await runInteractive(handle, [], [keyRow("platform"), ""]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no value chosen — platform is unchanged.");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("shows the key's hint and takes a typed value for a free-form key", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await runInteractive(handle, [], [keyRow("model.standard"), "vendor-x-1"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("a model id your client accepts");
    expect(result.stdout).toContain("set model.standard:");
    expect((await readManifest(handle.dir))?.models?.pins?.standard).toBe("vendor-x-1");
  });

  it("writes nothing when the value prompt comes back empty", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await runInteractive(handle, [], [keyRow("hooks.userHooksDir"), ""]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no value chosen — hooks.userHooksDir is unchanged");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("opens the tools checkbox on the current set", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude"] });

    // Blank answer: the typed multi-select returns its defaults verbatim, so
    // the bracket IS the preselection — row 1, the one tool the manifest names.
    const result = await runInteractive(handle, [], [keyRow("tools"), ""]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("comma-separated [1]");
    expect(result.stdout).toContain("tools is already");
    expect((await readManifest(handle.dir))?.tools).toEqual(["claude"]);
  });

  it("previews through the picker and writes nothing under --dry-run", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    // Row 3 selects `team` now that row 1 is "(keep unchanged)" (F4).
    const result = await runInteractive(handle, ["--dry-run"], [keyRow("maturityTier"), "3"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would set maturityTier: solo -> team");
    expect(result.stdout).toContain("next: re-run without --dry-run to apply");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("arrows to a key, arrows to a value, and persists what the cursor landed on", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const { run: running, input, transcript } = startConfigOnMenuTty(handle);

    await waitForOutput(transcript, "> tools", "the key menu");
    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> platform", "the cursor on platform");
    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> maturityTier", "the cursor on maturityTier");
    input.write(MENU_KEYS.enter);
    // Row 1 of the value menu is "(keep unchanged)" (F4) and opens as the
    // default, so `solo` — the persisted default before this change — is now
    // one arrow down rather than the opening row.
    await waitForOutput(transcript, "> (keep unchanged)", "the maturityTier value menu");
    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> solo", "the cursor on solo");
    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> team", "the cursor on team");
    input.write(MENU_KEYS.enter);

    expect(await running).toBe(0);
    expect((await readManifest(handle.dir))?.maturityTier).toBe("team");
    expect(transcript()).toContain("set maturityTier: solo -> team");
  });

  it("toggles a box on the tools menu and writes the set the boxes say", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude"] });
    const { run: running, input, transcript } = startConfigOnMenuTty(handle);

    await waitForOutput(transcript, "> tools", "the key menu");
    input.write(MENU_KEYS.enter);
    // Preselected from the manifest, not from a default: the box under the
    // cursor is already ticked and the others are not.
    await waitForOutput(transcript, "> [x] claude", "the tools checkbox on the current set");
    expect(transcript()).toContain("[ ] cursor");
    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> [ ] cursor", "the cursor on the cursor row");
    input.write(MENU_KEYS.space);
    await waitForOutput(transcript, "> [x] cursor", "the toggled box");
    input.write(MENU_KEYS.enter);

    expect(await running).toBe(0);
    expect((await readManifest(handle.dir))?.tools).toEqual(["claude", "cursor"]);
    expect(transcript()).toContain("set tools:");
  });

  it("re-reads the manifest before applying, so a concurrent write between the key and value prompts survives (SW3)", async () => {
    // The interleave is driven by the test, not by real concurrency: the key
    // menu is answered, and BEFORE the value prompt is answered a second write
    // lands on disk directly — standing in for a concurrent `stamity sync` or a
    // second `config set` racing this picker. `runPicker` reads the manifest
    // once, up front, to render the key list and the value menu; unfixed, the
    // write below would apply the chosen key against that stale snapshot and
    // silently revert the concurrent write when it persists.
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude"], maturityTier: "solo" });
    const { run: running, input, transcript } = startConfigOnMenuTty(handle);

    await waitForOutput(transcript, "> tools", "the key menu");
    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> platform", "the cursor on platform");
    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> maturityTier", "the cursor on maturityTier");
    input.write(MENU_KEYS.enter);
    await waitForOutput(transcript, "> (keep unchanged)", "the maturityTier value menu");

    // The concurrent write: a field this run never touches, changed on disk
    // while the operator is still looking at the value menu.
    await seedManifest(handle, {
      tools: ["claude"],
      maturityTier: "solo",
      communicationStyle: "technical",
    });

    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> solo", "the cursor on solo");
    input.write(MENU_KEYS.down);
    await waitForOutput(transcript, "> team", "the cursor on team");
    input.write(MENU_KEYS.enter);

    expect(await running).toBe(0);
    const after = await readManifest(handle.dir);
    expect(after?.maturityTier).toBe("team");
    // The concurrent field survived instead of being reverted to whatever the
    // snapshot at the start of the interaction held for it.
    expect(after?.communicationStyle).toBe("technical");
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

  it.each(MODEL_CLASSES)("persists and resolves an Astra pin for %s without changing effort", async (modelClass) => {
    const handle = tempDir();
    await seedManifest(handle, {
      tools: ["codex"],
      models: {
        pins: { [modelClass]: "previous-model" },
        effort: { [modelClass]: "medium" },
        reviewCap: 6,
      },
    });

    const key = `model.${modelClass}`;
    const set = await run(handle, ["set", key, "gpt-6-astra"]);
    expect(set.code).toBe(0);
    expect(set.stdout).toContain("-> gpt-6-astra");

    const manifest = await readManifest(handle.dir);
    expect(manifest?.models).toEqual({
      pins: { [modelClass]: "gpt-6-astra" },
      effort: { [modelClass]: "medium" },
      reviewCap: 6,
    });
    expect(getConfigValue(manifest as SetupManifest, key)).toEqual({
      value: "gpt-6-astra",
      isDefault: false,
      resolved: "gpt-6-astra",
    });
    const get = await run(handle, ["get", key]);
    expect(get.code).toBe(0);
    expect(get.stdout).toContain(`${key}  gpt-6-astra`);
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

  // JUSTIFIED CHANGE (REQ-LADDER-001, unit c9-effort-scale): the vocabulary the
  // refusal names widened from the three levels every client shared to the six
  // the clients document between them. The behaviour asserted — an off-vocabulary
  // level is refused, names the vocabulary, and writes nothing — is unchanged.
  it("refuses an out-of-band effort level, naming the six", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "effort.standard", "nonsense"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("minimal | low | medium | high | xhigh | max");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("writes a level every selected client documents, and each emits it in its own dialect", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude", "codex"] });

    const set = await run(handle, ["set", "effort.frontier", "xhigh"]);

    expect(set.code).toBe(0);
    expect((await readManifest(handle.dir))?.models?.effort?.frontier).toBe("xhigh");
    // The two carriers, asserted through the resolvers the adapters call: one
    // client writes `effort: xhigh` into its agent frontmatter, the other
    // `model_reasoning_effort = "xhigh"` into its config table.
    expect(resolveEffortValue("frontier", "claude", { frontier: "xhigh" })).toBe("xhigh");
    expect(resolveEffortValue("frontier", "codex", { frontier: "xhigh" })).toBe("xhigh");
    expect(rowFor((await run(handle, ["list"])).stdout, "effort.frontier")).toContain("xhigh");
  });

  it("refuses a level a selected client cannot express, naming the client and its ceiling", async () => {
    // Exit 1 with `VALIDATION_ERROR` in `error.code` — this CLI retired the
    // sysexits translation (`src/types/errors.ts`), so every refusal exits 1
    // and the kind travels in the code, exactly as the gate rows refuse.
    const handle = tempDir();
    await seedManifest(handle, { tools: ["codex"] });
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "effort.frontier", "max"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "effort.frontier max is not expressible on codex (its scale ends at xhigh)",
    );
    expect(result.stderr).toContain("set xhigh or lower, or deselect the client");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("accepts the same level once the client that could not express it is gone", async () => {
    // The control for the refusal above: `max` is not an illegal level, it is a
    // level one client cannot express. The refusal has to be about the
    // selection, not about the word.
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude"] });

    const result = await run(handle, ["set", "effort.frontier", "max"]);

    expect(result.code).toBe(0);
    expect((await readManifest(handle.dir))?.models?.effort?.frontier).toBe("max");
  });

  it("refuses a level below a selected client's floor, naming its lowest", async () => {
    const handle = tempDir();
    await seedManifest(handle, { tools: ["claude", "codex"] });
    const before = await manifestBytes(handle);

    // `minimal` is on one client's documented scale and below the other's
    // floor, so the refusal has to name the client that cannot go that low —
    // not the one that can.
    const result = await run(handle, ["set", "effort.economy", "minimal"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "effort.economy minimal is not expressible on claude (its scale starts at low)",
    );
    expect(result.stderr).toContain("set low or higher, or deselect the client");
    expect(result.stderr).not.toContain("codex");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("marks the clamped client in the list when a narrower client joined later", async () => {
    // Written straight into the manifest, because `config set` would have
    // refused it — this is the state a repository reaches by widening `tools`
    // after the level was set, which is the case the disclosure exists for.
    const handle = tempDir();
    await seedManifest(handle, {
      tools: ["claude", "codex"],
      models: { effort: { frontier: "max" } },
    });

    const row = rowFor((await run(handle, ["list"])).stdout, "effort.frontier");

    expect(row).toContain("claude=max");
    expect(row).toContain("codex=xhigh (clamped from max)");
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


/**
 * The rule-delivery dial. Added as an ordinary registry row, so the list, the
 * get, the picker and the reference page pick it up without a second code path
 * — what this block pins is the pair a wrong value could break: the persisted
 * spelling the engine reads, and the refusal that keeps an unsanctioned one out
 * of the manifest at all.
 */
describe("config — ruleDelivery", () => {
  it("reports the engine default when the manifest carries no key", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["get", "ruleDelivery"]);

    // DERIVED 2026-09-15, from a literal `always-on`. The default moved to
    // `on-demand` that day, and a typed spelling of it here is a pin that can
    // silently disagree with the constant the engine actually resolves — which
    // is the one thing this case exists to check.
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`(default: ${RULE_DELIVERY_DEFAULT})`);
    expect(rowFor((await run(handle, ["list"])).stdout, "ruleDelivery")).toMatch(
      new RegExp(String.raw`${RULE_DELIVERY_DEFAULT}\s+\(default\)`),
    );
    // The two modes are distinguishable, so this case cannot pass by matching a
    // value that happens to be printed for another reason.
    expect(RULE_DELIVERIES).toContain(RULE_DELIVERY_DEFAULT);
    expect(RULE_DELIVERIES.length).toBeGreaterThan(1);
  });

  it("persists on-demand and reads it back as set", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const written = await run(handle, ["set", "ruleDelivery", "on-demand"]);

    expect(written.code).toBe(0);
    expect((await readManifest(handle.dir))?.ruleDelivery).toBe("on-demand");
    expect((await run(handle, ["get", "ruleDelivery"])).stdout).toContain(
      "ruleDelivery  on-demand",
    );
    expect(rowFor((await run(handle, ["list"])).stdout, "ruleDelivery")).toMatch(
      /on-demand\s+\(set\)/,
    );
  });

  it("refuses an unsanctioned value, naming both, and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "ruleDelivery", "nonsense"]);

    // Non-zero and specific: the engine's own enum message, not a generic parse
    // failure, so the operator reads the two values they may write.
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("always-on | on-demand");
    expect(result.stderr).toContain("ruleDelivery");
    expect(await manifestBytes(handle)).toBe(before);
    expect((await readManifest(handle.dir))?.ruleDelivery).toBeUndefined();
  });
});

/**
 * The four verification-gate keys.
 *
 * What they close: the charter states four commands as FACTS about the
 * reader's repository, and until now the only source for them was detection —
 * so a repo whose suite is split, whose gate lives behind a task runner, or
 * that detection could read nothing from shipped an `unknown` sentinel with no
 * way to correct it. `config detect` could not help: it re-observes, and the
 * command an operator runs is not observable. These rows are that way in, and
 * they are ordinary registry rows, so the list, the get, the picker and the
 * reference page pick them up with no second code path.
 *
 * The refusals below exit 1, not 64: this CLI collapses every failure to
 * status 1 and carries the kind in `error.code` (`src/types/errors.ts` — the
 * sysexits translation was retired), so "the key is named and nothing is
 * written" is the whole contract a caller can rely on.
 */
describe("config — the four gate keys", () => {
  const GATE_KEYS = ["gates.test", "gates.lint", "gates.typecheck", "gates.all"];

  it("addresses one key per gate", () => {
    for (const key of GATE_KEYS) expect(CONFIG_KEYS).toContain(key);
  });

  it("persists a pinned command and reads it back as set", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const written = await run(handle, ["set", "gates.test", "npm run test:unit"]);

    expect(written.code).toBe(0);
    expect((await readManifest(handle.dir))?.gates?.test).toBe("npm run test:unit");
    expect((await run(handle, ["get", "gates.test"])).stdout).toContain(
      "gates.test  npm run test:unit",
    );
    expect(rowFor((await run(handle, ["list"])).stdout, "gates.test")).toMatch(
      /npm run test:unit\s+\(set\)/,
    );
  });

  it("clears one key with `none`, leaving no empty gates object behind", async () => {
    const handle = tempDir();
    await seedManifest(handle, { gates: { test: "npm run test:unit", lint: "oxlint" } });

    const first = await run(handle, ["set", "gates.test", "none"]);

    expect(first.code).toBe(0);
    // The sibling pin survives: `none` clears the key it names, not the block.
    expect((await readManifest(handle.dir))?.gates).toEqual({ lint: "oxlint" });

    const second = await run(handle, ["set", "gates.lint", "none"]);

    expect(second.code).toBe(0);
    expect((await readManifest(handle.dir))?.gates).toBeUndefined();
    // An emptied object would round-trip forever as a key the manifest carries
    // and nothing reads — and `config get` would report it as (set).
    expect(await manifestBytes(handle)).not.toContain("gates");
    expect((await run(handle, ["get", "gates.lint"])).stdout).toContain("(default: detected:");
  });

  it("refuses an empty command, naming the key, and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "gates.lint", ""]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("gates.lint");
    expect(result.stderr).toContain("is empty");
    expect(await manifestBytes(handle)).toBe(before);
    expect((await readManifest(handle.dir))?.gates).toBeUndefined();
  });

  it("refuses a command that spans more than one line", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["set", "gates.all", "npm run lint\nnpm run test"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("gates.all");
    expect(result.stderr).toContain("spans more than one line");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("prints the detected command behind a `detected:` prefix for every unpinned gate", async () => {
    const handle = tempDir();
    await seedManifest(handle, {
      detected: {
        languages: ["python"],
        linters: ["ruff"],
        testFrameworks: ["pytest"],
        ciProviders: [],
      },
      gates: { test: "npm run test:unit" },
    });

    const result = await run(handle, ["list"]);

    expect(result.code).toBe(0);
    // A pinned row prints the command alone: it is not a detection, and
    // prefixing it would say the engine observed something it did not.
    expect(rowFor(result.stdout, "gates.test")).toMatch(/npm run test:unit\s+\(set\)/);
    expect(rowFor(result.stdout, "gates.lint")).toMatch(/detected: ruff check \.\s+\(default\)/);
    expect(rowFor(result.stdout, "gates.typecheck")).toMatch(/detected: mypy \.\s+\(default\)/);
    expect(rowFor(result.stdout, "gates.all")).toContain("detected:");
  });

  it("prints `detected: unknown` where detection ran and found nothing to run", async () => {
    const handle = tempDir();
    await seedManifest(handle, {
      detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    });

    const result = await run(handle, ["list"]);

    expect(result.code).toBe(0);
    // The charter's own word for an unconfigured fact, and the one the hint
    // tells an operator how to replace — never an invented command.
    expect(rowFor(result.stdout, "gates.test")).toMatch(/detected: unknown\s+\(default\)/);
  });

  it("keeps a pinned gate across `config detect`", async () => {
    const handle = tempDir();
    await handle.seedFiles({
      "package.json": `${JSON.stringify({ name: "fixture", private: true }, null, 2)}\n`,
      "tsconfig.json": `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`,
    });
    await seedManifest(handle, {
      detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
      gates: { test: "npm run test:unit" },
    });

    const result = await run(handle, ["detect"]);

    expect(result.code).toBe(0);
    // Detection refreshed the facts it observes...
    expect((await readManifest(handle.dir))?.detected?.languages).toContain("typescript");
    // ...and left the one fact it cannot observe exactly where the operator put
    // it. `detect` re-observing a repo must never silently un-pin a gate.
    expect((await readManifest(handle.dir))?.gates).toEqual({ test: "npm run test:unit" });
  });

  it("applies and clears a gate as a pure function over a manifest", () => {
    const manifest = baseManifest();
    const snapshot = structuredClone(manifest);

    const pinned = setConfigValue(manifest, "gates.typecheck", "tsc --noEmit");
    expect(pinned.gates).toEqual({ typecheck: "tsc --noEmit" });
    expect(manifest).toEqual(snapshot);

    // Clearing a key the manifest never carried is a no-op, not a crash, and
    // does not mint an empty block on the way through.
    expect(setConfigValue(manifest, "gates.typecheck", "none").gates).toBeUndefined();
    expect(setConfigValue(pinned, "gates.typecheck", "none").gates).toBeUndefined();
    expect(() => setConfigValue(manifest, "gates.test", "  ")).toThrow(CliFailure);
  });
});
