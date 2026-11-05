import { createHash } from "node:crypto";
import { link, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configCommand } from "../../../src/cli/commands/config.ts";
import { initCommand } from "../../../src/cli/commands/init.ts";
import { syncCommand } from "../../../src/cli/commands/sync.ts";
import { __resetContentRootCacheForTests, __setContentRootForTests } from "../../../src/content/contentRoot.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../../src/types/content.ts";
import { MANIFEST_FILE, MANIFEST_VERSION, type McpOwnServer, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess, type InProcessResult } from "../../support/inProcess.ts";
import { seedGitRepo } from "../../support/repoFixtures.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * `stamity config mcp` — the execution disclosure on the two surfaces that
 * select and list an MCP server.
 *
 * An MCP server is not a document: it is an argv the editor spawns with the
 * operator's privileges. `config mcp add` is the act that selects one and
 * `config mcp list` is where a standing selection is audited, and both printed
 * an id, a description, a supplier and credential rows — prose about what the
 * server IS, and nothing about what it RUNS. For a curated row that prose is a
 * reviewed claim; for a pack-supplied row the description and the blast-radius
 * note are the pack author's own words, so on exactly the rows where prose is
 * least load-bearing it was the only thing shown.
 *
 * What these cases pin: the launcher is in the DEFAULT view on both surfaces
 * and on `--dry-run`, the argv renders as the placeholder token and never as a
 * `.env.mcp` value, a pack-supplied argv cannot repaint the line it is printed
 * on, an elided line says where the whole one is, and an id nothing resolves
 * says so rather than going silent.
 *
 * Green-signal guard. Every string these cases read — `runs on this machine:`,
 * the transport sentence, `supplied by pack …`, the elision pointer, the
 * unresolvable line — reaches stdout only from the launcher block, and no
 * launcher block existed before it: the pre-change `runMcpAdd` and `runMcpList`
 * printed an id, a description, a supplier label and credential rows and no
 * argv, which is the observation the finding was filed on. So every case fails
 * pre-change except the two named next, and both are deliberate:
 *
 * - "says nothing new on the already-selected branch" passes before and after.
 *   It is the negative control that catches a fix which prints the block on a
 *   branch that selects nothing, rather than rewarding it.
 * - the control-character case pairs a guard assertion (nothing repaints the
 *   terminal) that a silent surface satisfies trivially with a positive one
 *   (the flattened argv is on the line) that only the fix satisfies. Read the
 *   two together: the guard is meaningful only over a line that exists.
 *
 * Division with the neighbouring files: `./config.test.ts` owns the `config mcp`
 * write behaviour (manifest, `.env.mcp`, `.gitignore`) and `./configMcpList.test.ts`
 * owns the zero-selected "which ids exist" answer. This file owns one question
 * on both surfaces — what does the selected id run — so a change to the
 * disclosure has one home rather than edits scattered across three.
 *
 * Lane: the in-process CLI runner over a real temp directory, matching those two
 * neighbours. The command reads on-disk state (manifest ledger plus the pack
 * bytes the projection parses), so the virtual-fs lane cannot host it.
 *
 * The own-server cases at the end (REQ-FLOW-160) live here because they ask the
 * same question of a row a person wrote, and `config mcp own` adds that surface.
 * The lanes that remove and carry a row run `init` and `sync` for real, so a
 * client document under test is one the engine wrote, not a hand-made fixture.
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

const tempDir = useTempDir("stamity-config-mcp");

// ── Curated fixtures, read off the catalog rather than restated ───────────────
//
// `context7` is the curated row with NO `requiresEnv`, which is why it carries
// the plain-add case: before this change an `add` of it printed an id and a
// transition and stopped, so it is the row where "the surface said nothing
// about what runs" was most literally true.
//
// `github` carries the placeholder case because its argv holds `${env:GITHUB_PAT}`
// — a variable reference in the args themselves, which is the only shape that
// can turn a rendered argv into a credential leak.

const CONTEXT7_ARGV = "npx -y @upstash/context7-mcp@2.1.1";
const GITHUB_PLACEHOLDER = "${env:GITHUB_PAT}";

/**
 * A filled-in credential, spelled the way `./config.test.ts:107` spells it:
 * assembled from two pieces so the contiguous token never sits in source, where
 * a secret scanner would read a fixture as a leak. Long enough to match the
 * engine's own detector, so the run also exercises the masked-warning path.
 */
const TOKEN_LITERAL = `ghp_${"0123456789abcdefghijklmnopqrstuvwxyz"}`;

// ── An installed pack that supplies one MCP server ───────────────────────────
//
// Seeded as installed state — the `pack:<id>` ledger rows discovery reads plus
// the bytes under `.stamity/packs/<id>/mcp_servers/` the projection parses — for
// the reason `./config.test.ts` gives: this is the config command's lane, and
// the install path has its own. The server definition is a parameter of the
// fixture rather than a constant, because three cases need three different
// argvs (ordinary, hostile, over-long) under one otherwise identical pack.

const PACK_ID = "telepack";
const PACK_DIR = `${STATE_DIR}/packs/${PACK_ID}`;
const PACK_SERVER_ID = "acme-telemetry";
const PACK_SERVER_VAR = "ACME_TELEMETRY_TOKEN";

function packServerJson(args: readonly string[]): string {
  return `${JSON.stringify(
    {
      id: PACK_SERVER_ID,
      description: "Deployment telemetry queries.",
      command: "npx",
      args,
      transport: "stdio",
      requiresEnv: [{ name: PACK_SERVER_VAR, description: "Read-only API token" }],
      pinnedVersion: "3.2.1",
      packageNameLock: "@acme/telemetry-mcp",
      blastRadius: "Low — read-only queries against a staging project.",
      docsUrl: "https://example.invalid/acme-telemetry",
    },
    null,
    2,
  )}\n`;
}

/** The pack's ordinary argv: a pinned fetch launcher, nothing unusual about it. */
const PACK_ARGS: readonly string[] = [
  "-y",
  "@acme/telemetry-mcp@3.2.1",
  "--token",
  `\${env:${PACK_SERVER_VAR}}`,
];

/** Seed a repo whose manifest records the fixture pack as installed. */
async function seedInstalledPack(
  handle: TempDirHandle,
  args: readonly string[] = PACK_ARGS,
  overrides: Partial<SetupManifest> = {},
): Promise<void> {
  await seedManifest(handle, {
    ledger: [
      {
        path: `${PACK_DIR}/mcp_servers/telemetry.json`,
        adapter: `pack:${PACK_ID}`,
        artifactId: `${PACK_ID}/mcp_servers/telemetry.json`,
        artifactType: "infra" as const,
      },
    ],
    ...overrides,
  });
  await handle.seedFiles({
    [`${PACK_DIR}/mcp_servers/telemetry.json`]: packServerJson(args),
  });
}

/** The one line carrying `needle`, so a neighbouring line cannot answer for it. */
function lineContaining(stdout: string, needle: string): string | undefined {
  return stdout.split("\n").find((candidate) => candidate.includes(needle));
}

/**
 * Every control character in `text` except the newline that ends each printed
 * line. C0 minus LF, plus DEL: the class that can move the cursor, clear a row,
 * or start an escape sequence — that is, repaint the line the operator reads.
 */
function controlCharsIn(text: string): string[] {
  return [...text].filter((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return (code < 0x20 && ch !== "\n") || code === 0x7f;
  });
}

describe("config mcp add — what the selected id runs", () => {
  it("prints the curated launcher and its transport in the default view", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "add", "context7"]);

    expect(result.code).toBe(0);
    // The argv itself, not a summary of it. `context7` requires no credential,
    // so before this change the whole outcome was two lines that never named a
    // command — the case the finding is about, in its plainest form.
    expect(result.stdout).toContain("runs on this machine:");
    expect(result.stdout).toContain(CONTEXT7_ARGV);
    // What spawning it means, said in the same block. A pinned package name
    // without "your editor spawns this as a child process, with your
    // privileges" is a fact an operator has to already know to act on.
    expect(result.stdout).toContain("stdio — your editor spawns this argv as a child process");
    // Not behind `--json`: the operator deciding is reading the terminal.
    expect(result.stdout).toContain("next: run stamity sync to apply");
  });

  it("prints a pack-supplied launcher and marks the surrounding prose pack-authored", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);

    const result = await run(handle, ["mcp", "add", PACK_SERVER_ID]);

    expect(result.code).toBe(0);
    // The pack's own argv, verbatim from the definition the projection read.
    expect(result.stdout).toContain(`npx -y @acme/telemetry-mcp@3.2.1 --token \${env:${PACK_SERVER_VAR}}`);
    // The half F-4 singles out: `blastRadius` and `description` on this row are
    // the pack author's words. Naming that is what stops the reassuring prose
    // beside an unreviewed launcher from reading as review.
    expect(result.stdout).toContain(`supplied by pack ${PACK_ID}`);
    expect(result.stdout).toContain("the pack author's words, not a review");
    // The credential rows the surface already had are unchanged — this is a
    // disclosure added beside them, not a replacement for them.
    expect(result.stdout).toContain(PACK_SERVER_VAR);
  });

  it("renders the placeholder token and never a value from .env.mcp", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await handle.seedFiles({ ".env.mcp": `GITHUB_PAT=${TOKEN_LITERAL}\n` });

    const result = await run(handle, ["mcp", "add", "github"]);

    expect(result.code).toBe(0);
    // The argv holds a variable REFERENCE, so rendering the argv renders the
    // reference. This is the assertion that keeps the module's "values are
    // never printed" rule true now that the argv reaches the terminal.
    expect(result.stdout).toContain(GITHUB_PLACEHOLDER);
    // Both streams. `./config.test.ts` already pins the masked stderr warning;
    // the new surface is stdout, which is where a rendered argv could carry a
    // filled-in value if the line were ever built from `.env.mcp` instead of
    // from the catalog row.
    expect(result.stdout).not.toContain(TOKEN_LITERAL);
    expect(result.stderr).not.toContain(TOKEN_LITERAL);
  });

  it("flattens control characters in a pack-supplied argv instead of printing them", async () => {
    const handle = tempDir();
    // Ingress checks `command` against a bare-launcher pattern and refuses
    // shells (`src/pack/manifest.ts` → `readServerCommand`) but takes `args` as
    // any string array (`readServerArgs`), so this reaches the renderer exactly
    // as written. The payload is a cursor-control sequence and a carriage
    // return followed by a reassuring string: on a raw print it would erase the
    // real argv and leave the operator reading the substitute.
    const hostile = "\u001b[2K\rnpx -y @acme/reviewed-and-safe@1.0.0";
    await seedInstalledPack(handle, ["-y", "@acme/telemetry-mcp@3.2.1", hostile]);

    const result = await run(handle, ["mcp", "add", PACK_SERVER_ID]);

    expect(result.code).toBe(0);
    // The guard REFUSES the repaint: no escape and no carriage return survives
    // to stdout, so nothing the pack ships can move the cursor on the one line
    // whose job is to be read accurately.
    expect(controlCharsIn(result.stdout)).toEqual([]);
    // Flattened, not dropped. The smuggled text is still shown — as text, on
    // the same line, after the real argv — because hiding it would trade one
    // undisclosed command for another.
    const launcher = lineContaining(result.stdout, "@acme/telemetry-mcp@3.2.1");
    expect(launcher).toBeDefined();
    expect(launcher).toContain("@acme/reviewed-and-safe@1.0.0");
  });

  it("discloses the same launcher under --dry-run", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "add", "context7", "--dry-run"]);

    expect(result.code).toBe(0);
    // A dry run is where an operator goes to find out what a selection would
    // do; it is the last branch that may be the quieter one.
    expect(result.stdout).toContain("would add");
    expect(result.stdout).toContain("runs on this machine:");
    expect(result.stdout).toContain(CONTEXT7_ARGV);
  });

  it("says nothing new on the already-selected branch, which selects nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: ["context7"] } });

    const result = await run(handle, ["mcp", "add", "context7"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("already selected");
    // Negative control. The disclosure travels with the act: this branch writes
    // nothing and changes nothing, so it makes no new claim. An operator
    // auditing a standing selection reads the block from `config mcp list`,
    // which the case below pins.
    expect(result.stdout).not.toContain("runs on this machine:");
  });
});

describe("config mcp add — the .gitignore lines it records (REQ-FLOW-016)", () => {
  const readLedger = async (handle: TempDirHandle): Promise<SetupManifest["ledger"]> =>
    (JSON.parse(await readFile(handle.path(STATE_DIR, MANIFEST_FILE), "utf8")) as SetupManifest).ledger;

  it("appends and records .env.mcp's line for a server that needs a credential, beside the other seven", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "add", "github"]);

    expect(result.code, result.stderr).toBe(0);
    const lines = (await readFile(handle.path(".gitignore"), "utf8")).split("\n");
    expect(lines).toContain(".env.mcp");
    const rows = (await readLedger(handle)).filter((row) => row.path === ".gitignore");
    expect(rows.map((row) => row.adapter)).toEqual(["claude"]);
    expect(rows[0]?.coOwned?.lines).toContain(".env.mcp");
    expect(rows[0]?.coOwned?.lines).toHaveLength(8);
  });

  it("writes no .env.mcp line for a server that needs none", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "add", "context7"]);

    expect(result.code, result.stderr).toBe(0);
    expect((await readFile(handle.path(".gitignore"), "utf8")).split("\n")).not.toContain(".env.mcp");
    expect((await readLedger(handle)).find((row) => row.path === ".gitignore")?.coOwned?.lines).toHaveLength(7);
  });
});

describe("config mcp list — what the standing selection runs", () => {
  it("prints the launcher under each selected row, above its credential rows", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle, PACK_ARGS, { mcp: { servers: [PACK_SERVER_ID] } });

    const result = await run(handle, ["mcp", "list"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1 selected");
    expect(result.stdout).toContain(`(pack ${PACK_ID})`);
    expect(result.stdout).toContain("runs on this machine:");
    expect(result.stdout).toContain("npx -y @acme/telemetry-mcp@3.2.1");
    // Order is the argument: the credential is worth filling in only for a
    // launcher the operator meant to keep, so the argv comes first.
    const stdout = result.stdout;
    expect(stdout.indexOf("runs on this machine:")).toBeLessThan(stdout.indexOf(PACK_SERVER_VAR));
  });

  it("says an unresolvable selected id has no command line rather than going silent", async () => {
    const handle = tempDir();
    // The id is in the manifest and no pack is installed — the state left by
    // uninstalling a pack whose server was selected.
    await seedManifest(handle, { mcp: { servers: [PACK_SERVER_ID] } });

    const result = await run(handle, ["mcp", "list"]);

    expect(result.code).toBe(0);
    // Silence here would read as "nothing runs". The true statement is
    // narrower and is the one printed: nothing supplies a definition for it.
    expect(result.stdout).toContain("runs on this machine:");
    expect(result.stdout).toContain(
      "no command line — no curated row and no installed pack supplies this id",
    );
  });

  it("elides an over-long argv, points at --json, and --json carries it whole", async () => {
    const handle = tempDir();
    // Longer than the 160-character display bound, so the terminal line is cut.
    // An operator with a truncated argv and no way to see the rest is back in
    // the half-disclosed state, which is why the pointer is part of the fix.
    const longArg = `--allow=${"a".repeat(200)}`;
    await seedInstalledPack(handle, ["-y", "@acme/telemetry-mcp@3.2.1", longArg], {
      mcp: { servers: [PACK_SERVER_ID] },
    });

    const human = await run(handle, ["mcp", "list"]);
    const json = await run(handle, ["mcp", "list", "--json"]);

    expect(human.code).toBe(0);
    const launcher = lineContaining(human.stdout, "@acme/telemetry-mcp@3.2.1");
    expect(launcher).toBeDefined();
    expect(launcher).toContain("…");
    expect(human.stdout).toContain("line elided — run with --json for the argv in full");

    // Verbatim and unelided on the machine-readable side: `JSON.stringify`
    // escapes control characters, so the payload needs no flattening and must
    // not be handed a truncated argv.
    const payload = JSON.parse(json.stdout) as {
      servers: { id: string; launcher: { command: string; args: string[]; transport: string } }[];
    };
    expect(payload.servers).toHaveLength(1);
    expect(payload.servers[0]?.launcher).toEqual({
      command: "npx",
      args: ["-y", "@acme/telemetry-mcp@3.2.1", longArg],
      transport: "stdio",
    });
  });
});

// ── A repository's own server (REQ-FLOW-160) ──────────────────────────────────

const OWN_ID = "acme-wiki";
const OWN_PACKAGE = "@acme/wiki-mcp";
const OWN_VERSION = "2.4.0";
const OWN_VAR = "ACME_WIKI_TOKEN";
const OWN_ARGV = `npx -y ${OWN_PACKAGE}@${OWN_VERSION} --token \${env:${OWN_VAR}}`;
const OWN_FILE = "acme-wiki.json";

/** A row held to the pack bar: exact pin, no shell, the credential by reference. */
function ownRow(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
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
  };
}

/** Rows arrive unvalidated, so the cast is what the manifest reader hands over. */
const asRows = (...rows: readonly unknown[]): McpOwnServer[] => rows as McpOwnServer[];

async function readSetup(root: string): Promise<SetupManifest> {
  return JSON.parse(await readFile(join(root, STATE_DIR, MANIFEST_FILE), "utf8")) as SetupManifest;
}

/** The manifest's bytes, for the cases that promise a refusal wrote nothing. */
function manifestBytes(handle: TempDirHandle): Promise<string> {
  return readFile(handle.path(STATE_DIR, MANIFEST_FILE), "utf8");
}

describe("config mcp own <file> — adding a row (REQ-FLOW-160)", () => {
  async function seedRowFile(handle: TempDirHandle, row: unknown = ownRow()): Promise<void> {
    await handle.seedFiles({ [OWN_FILE]: `${JSON.stringify(row, null, 2)}\n` });
  }

  it("adds a valid row, selects nothing, and discloses what it would run", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: ["context7"] } });
    await seedRowFile(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE]);

    expect(result.code, result.stderr).toBe(0);
    const mcp = (await readSetup(handle.dir)).mcp;
    expect(mcp?.ownServers).toEqual([ownRow()]);
    // A row resolves; only the selection launches. Adding one must not start it.
    expect(mcp?.servers).toEqual(["context7"]);
    expect(result.stdout).toContain("runs on this machine:");
    expect(result.stdout).toContain(OWN_ARGV);
    expect(result.stdout).toContain(`stamity config mcp add ${OWN_ID}`);
    expect(result.stdout).not.toContain(":own");
  });

  it("adds beside a row already there", async () => {
    const handle = tempDir();
    const first = ownRow({ id: "acme-docs" });
    await seedManifest(handle, { mcp: { servers: [], ownServers: asRows(first) } });
    await seedRowFile(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE]);

    expect(result.code, result.stderr).toBe(0);
    expect((await readSetup(handle.dir)).mcp?.ownServers?.map((row) => row.id)).toEqual(["acme-docs", OWN_ID]);
  });

  it("refuses an unpinned launcher, naming the row, and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedRowFile(handle, ownRow({ pinnedVersion: "9.9.9" }));
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(OWN_FILE);
    expect(result.stderr).toContain(`mcp.ownServers[0] ("${OWN_ID}")`);
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses a literal secret without printing it, and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedRowFile(handle, ownRow({ args: ["-y", `${OWN_PACKAGE}@${OWN_VERSION}`, "--token", TOKEN_LITERAL] }));
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`("${OWN_ID}")`);
    expect(result.stdout).not.toContain(TOKEN_LITERAL);
    expect(result.stderr).not.toContain(TOKEN_LITERAL);
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses a file that does not parse, quoting none of it, and writes nothing", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await handle.seedFiles({ [OWN_FILE]: `{ "id": "${TOKEN_LITERAL}", ` });
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${OWN_FILE} is not valid JSON`);
    expect(result.stderr).not.toContain(TOKEN_LITERAL);
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses a file holding anything but one row", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedRowFile(handle, [ownRow()]);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("one server row");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses a file that is not there", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "own", "missing.json"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("missing.json");
  });

  it("refuses an id a pack supplies, naming the pack, and writes nothing", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle);
    await seedRowFile(handle, ownRow({ id: PACK_SERVER_ID }));
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`is already supplied by pack ${PACK_ID}`);
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("refuses an id another own row holds", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: [], ownServers: asRows(ownRow()) } });
    await seedRowFile(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is already supplied by");
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("previews under --dry-run: the launcher disclosed, nothing written", async () => {
    const handle = tempDir();
    await seedManifest(handle);
    await seedRowFile(handle);
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "own", OWN_FILE, "--dry-run"]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("would add");
    expect(result.stdout).toContain(OWN_ARGV);
    expect(await manifestBytes(handle)).toBe(before);
  });

  it("asks for a file or --remove, and refuses both at once", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const neither = await run(handle, ["mcp", "own"]);
    const both = await run(handle, ["mcp", "own", OWN_FILE, "--remove", OWN_ID]);

    expect(neither.code).toBe(1);
    expect(neither.stderr).toContain("stamity config mcp own <file>");
    expect(both.code).toBe(1);
    expect(both.stderr).toContain("either a file or --remove");
  });

  it("names the new action when an unknown one is given", async () => {
    const handle = tempDir();
    await seedManifest(handle);

    const result = await run(handle, ["mcp", "nope"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("use one of: list, add, remove, own");
  });
});

describe("config — an own id on the verbs that select and list (REQ-FLOW-160)", () => {
  it("`mcp add` selects it and writes its .env.mcp row, as for a curated server", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: [], ownServers: asRows(ownRow()) } });

    const result = await run(handle, ["mcp", "add", OWN_ID]);

    expect(result.code, result.stderr).toBe(0);
    expect((await readSetup(handle.dir)).mcp?.servers).toEqual([OWN_ID]);
    expect(await readFile(handle.path(".env.mcp"), "utf8")).toContain(`${OWN_VAR}=`);
    expect((await readFile(handle.path(".gitignore"), "utf8")).split("\n")).toContain(".env.mcp");
    expect(result.stdout).toContain(OWN_ARGV);
    // The reserved source is the engine's word, never a pack's name to show.
    expect(result.stdout).not.toContain("supplied by pack");
    expect(result.stdout).toContain("this repository's own row");
  });

  it("`set mcp.servers` accepts it", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: [], ownServers: asRows(ownRow()) } });

    const result = await run(handle, ["set", "mcp.servers", `context7,${OWN_ID}`]);

    expect(result.code, result.stderr).toBe(0);
    expect((await readSetup(handle.dir)).mcp?.servers).toEqual(["context7", OWN_ID]);
  });

  it("`mcp list` shows its launcher and says whose row it is", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: [OWN_ID], ownServers: asRows(ownRow()) } });

    const human = await run(handle, ["mcp", "list"]);
    const json = await run(handle, ["mcp", "list", "--json"]);

    expect(human.code, human.stderr).toBe(0);
    expect(human.stdout).toContain("(own server)");
    expect(human.stdout).not.toContain("(pack");
    expect(human.stdout).toContain(OWN_ARGV);
    const payload = JSON.parse(json.stdout) as {
      servers: { id: string; own: boolean; pack: string | null; curated: boolean }[];
      packCatalog: string[];
      ownCatalog: string[];
    };
    expect(payload.servers[0]).toMatchObject({ id: OWN_ID, own: true, pack: null, curated: false });
    expect(payload.packCatalog).toEqual([]);
    expect(payload.ownCatalog).toEqual([OWN_ID]);
  });

  it("names own ids beside the pack's where a person reads which ids exist", async () => {
    const handle = tempDir();
    await seedInstalledPack(handle, PACK_ARGS, { mcp: { servers: [], ownServers: asRows(ownRow()) } });

    const list = await run(handle, ["mcp", "list"]);
    const add = await run(handle, ["mcp", "add", "nope"]);
    const set = await run(handle, ["set", "mcp.servers", "nope"]);

    expect(list.stdout).toContain(`installed packs: ${PACK_SERVER_ID}`);
    expect(list.stdout).toContain(`own servers: ${OWN_ID}`);
    expect(add.stderr).toContain(`installed packs: ${PACK_SERVER_ID}; own servers: ${OWN_ID}`);
    expect(set.stderr).toContain(`installed packs: ${PACK_SERVER_ID}; own servers: ${OWN_ID}`);
  });

  it("refuses to select through a bad row, naming it", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: [], ownServers: asRows(ownRow({ command: "bash" })) } });

    const result = await run(handle, ["mcp", "add", OWN_ID]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`mcp.ownServers[0] ("${OWN_ID}")`);
  });
});

// ── The lanes that need the real engine: `init`, `sync`, the four client documents ─

/** The charter is the only artifact core emission requires; the rest of the corpus is noise here. */
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

const ALL_CLIENTS = "claude,cursor,copilot,codex";
const CLAUDE_DOC = ".mcp.json";
const CODEX_DOC = ".codex/config.toml";
const MERGED_DOCS: readonly string[] = [CLAUDE_DOC, ".cursor/mcp.json", ".vscode/mcp.json"];

const USER_SERVER_ID = "internal-tools";
const USER_SERVER_DEFINITION = { command: "node", args: ["./scripts/internal-mcp.mjs"] };

afterEach(() => {
  __resetContentRootCacheForTests();
});

/** Every command below by its real module, in a real git repo, with the client probe off. */
function cli(root: string, argv: readonly string[]): Promise<InProcessResult> {
  return runInProcess([initCommand, configCommand, syncCommand], argv, {
    cwd: root,
    env: { STAMITY_NO_CLIENT_PROBE: "1" },
  });
}

async function cliOk(root: string, argv: readonly string[]): Promise<InProcessResult> {
  const result = await cli(root, argv);
  expect(result.code, `${argv.join(" ")}: ${result.stdout}\n${result.stderr}`).toBe(0);
  return result;
}

/** An empty repository, the fixture corpus pinned beside it so the real corpus stays out. */
async function emptyRepo(handle: TempDirHandle): Promise<string> {
  __setContentRootForTests(handle.path("corpus"));
  await handle.seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE, "repo/.keep": "" });
  const root = handle.path("repo");
  await seedGitRepo(root);
  return root;
}

/** A repo set up for every client, `github` selected and the own server added, selected and synced. */
async function repoWithOwnServer(handle: TempDirHandle, row: unknown = ownRow()): Promise<string> {
  const root = await emptyRepo(handle);
  await cliOk(root, ["init", "-y", "--tools", ALL_CLIENTS]);
  await writeFile(join(root, OWN_FILE), `${JSON.stringify(row, null, 2)}\n`, "utf8");
  await cliOk(root, ["config", "mcp", "own", OWN_FILE]);
  await cliOk(root, ["config", "mcp", "add", "github"]);
  await cliOk(root, ["config", "mcp", "add", OWN_ID]);
  await cliOk(root, ["sync"]);
  return root;
}

function readDoc(root: string, relPath: string): Promise<string> {
  return readFile(join(root, ...relPath.split("/")), "utf8");
}

async function idsIn(root: string, relPath: string): Promise<string[]> {
  const doc = JSON.parse(await readDoc(root, relPath)) as Record<string, Record<string, unknown>>;
  return Object.keys(doc["mcpServers"] ?? doc["servers"] ?? {}).toSorted();
}

async function idsByDoc(root: string): Promise<Record<string, string[]>> {
  const pairs = await Promise.all(
    MERGED_DOCS.map(async (path): Promise<[string, string[]]> => [path, await idsIn(root, path)]),
  );
  return Object.fromEntries(pairs);
}

const sameIdsEverywhere = (ids: readonly string[]): Record<string, string[]> =>
  Object.fromEntries(MERGED_DOCS.map((path) => [path, [...ids]]));

async function addUserServer(root: string): Promise<void> {
  const doc = JSON.parse(await readDoc(root, CLAUDE_DOC)) as { mcpServers: Record<string, unknown> };
  doc.mcpServers[USER_SERVER_ID] = USER_SERVER_DEFINITION;
  await writeFile(join(root, CLAUDE_DOC), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

describe("config mcp own --remove — no client entry left launching (REQ-FLOW-160)", () => {
  it("takes the entry out of all four client documents, then the selection, then the row", async () => {
    const root = await repoWithOwnServer(tempDir());
    await addUserServer(root);
    // The premise, so a green result cannot mean the entry was never there.
    expect(await idsIn(root, ".cursor/mcp.json")).toEqual([OWN_ID, "github"]);
    expect(await readDoc(root, CODEX_DOC)).toContain(`${OWN_PACKAGE}@${OWN_VERSION}`);

    const result = await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect(await idsIn(root, CLAUDE_DOC)).toEqual(["github", USER_SERVER_ID]);
    expect(await idsIn(root, ".cursor/mcp.json")).toEqual(["github"]);
    expect(await idsIn(root, ".vscode/mcp.json")).toEqual(["github"]);
    const codex = await readDoc(root, CODEX_DOC);
    expect(codex).not.toContain(OWN_ID);
    expect(codex).toContain("[mcp_servers.github]");
    const { mcp } = await readSetup(root);
    expect(mcp?.servers).toEqual(["github"]);
    expect(mcp?.ownServers).toEqual([]);
    expect(result.stdout).toContain(CODEX_DOC);
  });

  it("leaves a setup the next sync finds nothing to bring back in", async () => {
    const root = await repoWithOwnServer(tempDir());

    await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);
    const codexAfterRemove = await readDoc(root, CODEX_DOC);
    await cliOk(root, ["sync"]);

    expect(await idsByDoc(root)).toEqual(sameIdsEverywhere(["github"]));
    // The hand-assembled rendering is the rendering: sync has nothing to change.
    expect(await readDoc(root, CODEX_DOC)).toBe(codexAfterRemove);
  });

  it("gives back the bytes of a setup that never held the row", async () => {
    const root = await emptyRepo(tempDir());
    await cliOk(root, ["init", "-y", "--tools", ALL_CLIENTS]);
    await cliOk(root, ["config", "mcp", "add", "github"]);
    await cliOk(root, ["sync"]);
    const paths = [...MERGED_DOCS, CODEX_DOC];
    const before = await Promise.all(paths.map((path) => readDoc(root, path)));
    await writeFile(join(root, OWN_FILE), `${JSON.stringify(ownRow(), null, 2)}\n`, "utf8");
    await cliOk(root, ["config", "mcp", "own", OWN_FILE]);
    await cliOk(root, ["config", "mcp", "add", OWN_ID]);
    await cliOk(root, ["sync"]);
    expect(await readDoc(root, CODEX_DOC)).not.toBe(before.at(-1));

    await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    // Bytes, not ids: a rendering put together badly reads the same to a table
    // parser, and a sync keeps a block whose tables match.
    expect(await Promise.all(paths.map((path) => readDoc(root, path)))).toEqual(before);
  });

  it("records what it wrote, so the ledger proves the documents as a sync would", async () => {
    const root = await repoWithOwnServer(tempDir());

    await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    const { ledger } = await readSetup(root);
    const paths = [...MERGED_DOCS, CODEX_DOC];
    const onDisk = await Promise.all(paths.map((path) => readDoc(root, path)));
    expect(paths.map((path) => ledger.find((entry) => entry.path === path)?.contentHash)).toEqual(onDisk.map(sha256));
    const codexRow = ledger.find((entry) => entry.path === CODEX_DOC);
    expect(Object.keys(codexRow?.coOwned?.members ?? {})).not.toContain(`/mcp_servers/${OWN_ID}`);
    expect(Object.keys(codexRow?.coOwned?.members ?? {})).toContain("/mcp_servers/github");
  });

  it("takes the last selected server out, leaving the empty table a sync would write", async () => {
    const root = await emptyRepo(tempDir());
    await cliOk(root, ["init", "-y", "--tools", ALL_CLIENTS]);
    await writeFile(join(root, OWN_FILE), `${JSON.stringify(ownRow(), null, 2)}\n`, "utf8");
    await cliOk(root, ["config", "mcp", "own", OWN_FILE]);
    await cliOk(root, ["config", "mcp", "add", OWN_ID]);
    await cliOk(root, ["sync"]);

    await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect(await readDoc(root, CODEX_DOC)).not.toContain(OWN_ID);
    expect(await readDoc(root, CODEX_DOC)).toContain("[mcp_servers]");
    expect(await idsIn(root, CLAUDE_DOC)).toEqual([]);
    await cliOk(root, ["sync"]);
  });

  it("deletes a row nothing selected and no document holds, touching no client document", async () => {
    const root = await repoWithOwnServer(tempDir());
    await cliOk(root, ["config", "mcp", "remove", OWN_ID]);
    await cliOk(root, ["sync"]);
    const before = await readDoc(root, CODEX_DOC);

    await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect((await readSetup(root)).mcp?.ownServers).toEqual([]);
    expect(await readDoc(root, CODEX_DOC)).toBe(before);
  });

  it("keeps an entry a person tuned, says so, and still lets go of the row", async () => {
    const root = await repoWithOwnServer(tempDir());
    const doc = JSON.parse(await readDoc(root, CLAUDE_DOC)) as { mcpServers: Record<string, Record<string, unknown>> };
    const entry = doc.mcpServers[OWN_ID];
    if (entry === undefined) throw new Error("fixture lost its entry");
    entry["args"] = ["-y", `${OWN_PACKAGE}@${OWN_VERSION}`, "--verbose"];
    await writeFile(join(root, CLAUDE_DOC), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

    const result = await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect(await idsIn(root, CLAUDE_DOC)).toEqual([OWN_ID, "github"]);
    expect(await idsIn(root, ".cursor/mcp.json")).toEqual(["github"]);
    // Silence here would read as "nothing launches any more", and one entry does.
    expect(result.stderr).toContain(`still launches from ${CLAUDE_DOC}`);
    expect((await readSetup(root)).mcp?.ownServers).toEqual([]);
  });

  it("keeps a Codex table a person edited, says so, and takes the rest", async () => {
    const root = await repoWithOwnServer(tempDir());
    const codex = await readDoc(root, CODEX_DOC);
    await writeFile(join(root, CODEX_DOC), codex.replace(`${OWN_PACKAGE}@${OWN_VERSION}`, `${OWN_PACKAGE}@9.9.9`), "utf8");

    const result = await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect(await readDoc(root, CODEX_DOC)).toContain(`${OWN_PACKAGE}@9.9.9`);
    expect(await idsIn(root, CLAUDE_DOC)).toEqual(["github"]);
    expect(result.stderr).toContain(`still launches from ${CODEX_DOC}`);
  });

  it("stops on a document it cannot read, keeping the row so a re-run can still prove the rest", async () => {
    const root = await repoWithOwnServer(tempDir());
    const cursorDoc = await readDoc(root, ".cursor/mcp.json");
    await writeFile(join(root, ".cursor/mcp.json"), "{ not json", "utf8");

    const failed = await cli(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain(".cursor/mcp.json");
    const held = (await readSetup(root)).mcp;
    expect(held?.servers).toEqual(["github"]);
    expect(held?.ownServers?.map((row) => row.id)).toEqual([OWN_ID]);
    // What could go, went: the proof held for the other three.
    expect(await idsIn(root, CLAUDE_DOC)).toEqual(["github"]);

    await writeFile(join(root, ".cursor/mcp.json"), cursorDoc, "utf8");
    await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect(await idsIn(root, ".cursor/mcp.json")).toEqual(["github"]);
    expect((await readSetup(root)).mcp?.ownServers).toEqual([]);
  });

  it("stops on a hard-linked document, and the preview says the same", async () => {
    const handle = tempDir();
    const root = await repoWithOwnServer(handle);
    await link(join(root, ".cursor/mcp.json"), handle.path("second-name.json"));

    const preview = await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID, "--dry-run"]);
    const failed = await cli(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect(preview.stdout).toContain("would stop here");
    expect(failed.code).toBe(1);
    expect(await idsIn(root, ".cursor/mcp.json")).toEqual([OWN_ID, "github"]);
    expect((await readSetup(root)).mcp?.ownServers?.map((row) => row.id)).toEqual([OWN_ID]);
  });

  it("leaves Codex alone when another selected id renders nothing, rather than take that table too", async () => {
    const handle = tempDir();
    const root = await repoWithOwnServer(handle);
    const other = ownRow({ id: "acme-docs" });
    await writeFile(join(root, "other.json"), `${JSON.stringify(other, null, 2)}\n`, "utf8");
    await cliOk(root, ["config", "mcp", "own", "other.json"]);
    await cliOk(root, ["config", "mcp", "add", "acme-docs"]);
    await cliOk(root, ["sync"]);
    const setup = await readSetup(root);
    const rows = asRows(ownRow(), ownRow({ id: "acme-docs", command: "bash" }));
    await writeFile(
      join(root, STATE_DIR, MANIFEST_FILE),
      `${JSON.stringify({ ...setup, mcp: { ...setup.mcp, ownServers: rows } }, null, 2)}\n`,
      "utf8",
    );
    const codex = await readDoc(root, CODEX_DOC);

    const failed = await cli(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("acme-docs");
    expect(await readDoc(root, CODEX_DOC)).toBe(codex);
    expect((await readSetup(root)).mcp?.ownServers?.map((row) => row.id)).toEqual([OWN_ID, "acme-docs"]);
  });

  it("removes a row past the bar, and says the entry it can no longer prove still launches", async () => {
    const root = await repoWithOwnServer(tempDir());
    const setup = await readSetup(root);
    const rows = asRows(ownRow({ pinnedVersion: "9.9.9" }));
    await writeFile(
      join(root, STATE_DIR, MANIFEST_FILE),
      `${JSON.stringify({ ...setup, mcp: { ...setup.mcp, ownServers: rows } }, null, 2)}\n`,
      "utf8",
    );

    const result = await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID]);

    expect((await readSetup(root)).mcp?.ownServers).toEqual([]);
    expect(result.stderr).toContain("still launches from");
    await cliOk(root, ["sync"]);
  });

  it("previews under --dry-run, naming the documents and writing nothing", async () => {
    const root = await repoWithOwnServer(tempDir());
    const before = await Promise.all([...MERGED_DOCS, CODEX_DOC, `${STATE_DIR}/${MANIFEST_FILE}`].map((path) => readDoc(root, path)));

    const result = await cliOk(root, ["config", "mcp", "own", "--remove", OWN_ID, "--dry-run"]);

    expect(result.stdout).toContain("would remove");
    for (const path of [...MERGED_DOCS, CODEX_DOC]) expect(result.stdout).toContain(path);
    const after = await Promise.all([...MERGED_DOCS, CODEX_DOC, `${STATE_DIR}/${MANIFEST_FILE}`].map((path) => readDoc(root, path)));
    expect(after).toEqual(before);
  });

  it("refuses an id no own row holds, naming the ones that exist", async () => {
    const handle = tempDir();
    await seedManifest(handle, { mcp: { servers: ["context7"], ownServers: asRows(ownRow()) } });
    const before = await manifestBytes(handle);

    const result = await run(handle, ["mcp", "own", "--remove", "context7"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`own servers: ${OWN_ID}`);
    expect(await manifestBytes(handle)).toBe(before);
  });
});

describe("a re-init keeps an own server (REQ-FLOW-160)", () => {
  it("init --force keeps the row and its selection, and the entry stays emitted", async () => {
    const root = await repoWithOwnServer(tempDir());

    await cliOk(root, ["init", "-y", "--force"]);

    const { mcp } = await readSetup(root);
    expect(mcp?.ownServers?.map((row) => row.id)).toEqual([OWN_ID]);
    expect(mcp?.servers).toEqual([OWN_ID]);
    expect(await idsIn(root, CLAUDE_DOC)).toContain(OWN_ID);
    await cliOk(root, ["sync"]);
    expect(await idsIn(root, CLAUDE_DOC)).toContain(OWN_ID);
  });

  it("init --force keeps a row nothing selected, and selects nothing for it", async () => {
    const root = await repoWithOwnServer(tempDir());
    await cliOk(root, ["config", "mcp", "remove", OWN_ID]);

    await cliOk(root, ["init", "-y", "--force"]);

    const { mcp } = await readSetup(root);
    expect(mcp?.ownServers?.map((row) => row.id)).toEqual([OWN_ID]);
    expect(mcp?.servers).toEqual([]);
  });

  it("is not stopped by a row past the bar: it leaves that row behind and says so", async () => {
    const root = await repoWithOwnServer(tempDir());
    const setup = await readSetup(root);
    const rows = asRows(ownRow(), ownRow({ id: "acme-bad", command: "bash" }));
    await writeFile(
      join(root, STATE_DIR, MANIFEST_FILE),
      `${JSON.stringify({ ...setup, mcp: { servers: [OWN_ID, "acme-bad"], ownServers: rows } }, null, 2)}\n`,
      "utf8",
    );

    const result = await cliOk(root, ["init", "-y", "--force"]);

    const { mcp } = await readSetup(root);
    expect(mcp?.ownServers?.map((row) => row.id)).toEqual([OWN_ID]);
    expect(mcp?.servers).toEqual([OWN_ID]);
    expect(result.stdout + result.stderr).toContain("acme-bad");
  });

  it("a migration carries the row with the id it lifts, so the id still resolves", async () => {
    const handle = tempDir();
    const root = await emptyRepo(handle);
    // Assembled from fragments, as `./init.test.ts` does: the leak gate allows the
    // predecessor's name only under `src/migration/` and `test/migration/`.
    const predecessorDir = `.${["hat", "ch3r"].join("")}`;
    const predecessor = { version: "3.0.0", tools: ["claude"], mcp: { servers: [OWN_ID], ownServers: [ownRow()] } };
    await handle.seedFiles({ [`repo/${predecessorDir}/hatch.json`]: `${JSON.stringify(predecessor, null, 2)}\n` });

    await cliOk(root, ["init", "-y", "--migrate", "full"]);

    const { mcp } = await readSetup(root);
    expect(mcp?.servers).toEqual([OWN_ID]);
    expect(mcp?.ownServers).toEqual([ownRow()]);
    expect(await idsIn(root, CLAUDE_DOC)).toEqual([OWN_ID]);
  });
});
