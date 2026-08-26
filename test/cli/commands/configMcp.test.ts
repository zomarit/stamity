import { describe, expect, it } from "vitest";
import { configCommand } from "../../../src/cli/commands/config.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../../src/types/content.ts";
import { MANIFEST_FILE, MANIFEST_VERSION, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
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
