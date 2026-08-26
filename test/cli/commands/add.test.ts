import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCommand } from "../../../src/cli/commands/add.ts";
import { estimateTokens } from "../../../src/guard/tokenEstimate.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { PACK_MANIFEST_FILE } from "../../../src/pack/manifest.ts";
import { computeAggregateContentSha, type TrustTier } from "../../../src/pack/trust.ts";
import type { Tool } from "../../../src/types/core.ts";
import { packOwner, type LedgerEntry, type SetupManifest } from "../../../src/types/manifest.ts";
import { runInProcess, type InProcessResult } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * Real temp directories and the in-process CLI runner: `add` is judged by what
 * lands on disk (pack files, ledger rows, the install receipt) and by what a
 * refusal tells the operator, neither of which a stubbed engine would prove.
 * The pack is seeded inside the project as `./packs/ops` — how a local pack is
 * actually consumed — and installs into `.stamity/packs/…`, which never
 * overlaps its source.
 *
 * The ONE mocked seam is the curated catalog (`src/pack/curated.ts`). Its data
 * — which entries exist, their pins, their bundled roots — is the same-wave
 * catalog unit's own tested surface; mocking it here pins the CONTRACT this
 * command consumes (id lookup -> bundled root + pin pass-through) while every
 * engine gate the pin feeds (aggregate-SHA verification, tier resolution, the
 * full install) still runs for real against temp-dir packs.
 */

const catalogSeam = vi.hoisted(() => ({
  entries: new Map<
    string,
    {
      id: string;
      description: string;
      source: { kind: "bundled" } | { kind: "npm"; package: string };
      pin: { sha256: string; tier: TrustTier };
      notAudited: boolean;
      disclaimer: string;
    }
  >(),
  bundledRoots: new Map<string, string>(),
}));

vi.mock("../../../src/pack/curated.ts", () => ({
  lookupCatalogEntry: (id: string) => catalogSeam.entries.get(id),
  resolveBundledPackRoot: (id: string): string => {
    const root = catalogSeam.bundledRoots.get(id);
    if (root === undefined) throw new Error(`mock catalog: no bundled root registered for ${id}`);
    return root;
  },
}));

const getProject = useTempDir("cli-add");

beforeEach(() => {
  catalogSeam.entries.clear();
  catalogSeam.bundledRoots.clear();
});

const PACK_SPEC = "./packs/ops";
const PACK_ID = "@acme/ops";
/** The scoped id flattened to one directory segment (engine packLedgerRelPath). */
const PACK_DIR = ".stamity/packs/acme__ops";
const RECEIPT_PATH = `${PACK_DIR}/receipt.json`;
const MANIFEST_PATH = ".stamity/manifest.json";
const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

/**
 * Gate list updated for the wave-0 trust mechanics (an extension, not a
 * weakening: every original gate is still asserted): the chain gained
 * orgPolicy (no policy file -> "n/a"), trustTier, and permissions (no
 * declared block -> "n/a"), and then agentCapabilities — the pack's agent
 * bodies checked against its declared permissions. Two more moved to ingress
 * afterwards: mcpServers (no `mcp_servers/` class here -> "n/a", an absent
 * class never reads as passed) and ruleActivation, which this fixture's two
 * rules exercise for real. Then `hooks` closed the asymmetry between the two
 * execution-bearing classes (`src/pack/install.ts` -> `checkHookDefinitions`),
 * and this fixture ships no `hooks/` class either, so it reads "n/a" on the
 * same absent-class rule. Order mirrors the insertion order in
 * `planPackInstall`, which is also the human table's row order.
 */
const GATE_OUTCOMES: Record<string, "pass" | "n/a"> = {
  manifest: "pass",
  orgPolicy: "n/a",
  trustTier: "pass",
  signing: "n/a",
  lifecycleScripts: "pass",
  integrityMap: "pass",
  bodyScan: "pass",
  mcpServers: "n/a",
  hooks: "n/a",
  footprint: "pass",
  declaredTools: "pass",
  ruleActivation: "pass",
  permissions: "n/a",
  agentCapabilities: "pass",
};

const digest = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const AGENT_BODY = `---
id: reviewer
type: agent
tools:
  - claude
---
Review the change and report findings.
`;

const RULE_BODY = `---
id: naming
type: rule
---
Name things for what they are.
`;

const CURSOR_RULE_BODY = `---
id: cursor-only
type: rule
tools:
  - cursor
---
Keep rule bodies short.
`;

const DEFAULT_CONTENT: Record<string, string> = {
  "agents/reviewer.md": AGENT_BODY,
  "rules/naming.md": RULE_BODY,
};

/** The default fixture's content files, in write order (receipt lands after them). */
const CONTENT_WRITTEN = [`${PACK_DIR}/agents/reviewer.md`, `${PACK_DIR}/rules/naming.md`];

interface PackFixture {
  content?: Record<string, string>;
  declaredTools?: string[];
  permissions?: { toolFootprint?: string[]; touchedPaths?: string[] };
  /** A signing declaration to embed verbatim; the default fixture is unsigned. */
  signing?: Record<string, unknown>;
  /** Files outside the content classes (package.json, README). */
  extras?: Record<string, string>;
}

/**
 * Seeds `<project>/packs/ops` with a manifest whose integrity map matches its
 * content.
 *
 * Fixture change with the wave-0 trust ladder (not a test weakening): the
 * previous fixture declared `signing: { method: "npm-provenance" }`, which
 * passed the old declaration-only gate. The ladder recognizes only "sigstore"
 * and ships a refusing not-yet-armed verifier, so a signed-AND-installable
 * pack cannot be constructed in tests. The default fixture is therefore
 * unsigned (tier pinned-unsigned) and install tests pass --allow-untrusted
 * explicitly, keeping every original install assertion intact while the real
 * tier resolution runs.
 */
async function seedPack(fixture: PackFixture = {}): Promise<Record<string, string>> {
  const project = getProject();
  const content = fixture.content ?? DEFAULT_CONTENT;
  const packManifest: Record<string, unknown> = {
    name: PACK_ID,
    version: "1.2.3",
    integrity: Object.fromEntries(
      Object.entries(content).map(([relPath, text]) => [relPath, digest(text)]),
    ),
    declaredTools: fixture.declaredTools ?? ["claude"],
  };
  if (fixture.permissions !== undefined) packManifest.permissions = fixture.permissions;
  if (fixture.signing !== undefined) packManifest.signing = fixture.signing;

  await project.seedFiles({
    ...Object.fromEntries(
      Object.entries(content).map(([relPath, text]) => [`packs/ops/${relPath}`, text]),
    ),
    ...Object.fromEntries(
      Object.entries(fixture.extras ?? { "package.json": '{ "name": "@acme/ops" }' }).map(
        ([relPath, text]) => [`packs/ops/${relPath}`, text],
      ),
    ),
    [`packs/ops/${PACK_MANIFEST_FILE}`]: JSON.stringify(packManifest, null, 2),
  });
  return content;
}

const OPS_SKILL_BODY = `---
id: triage
type: skill
---
Triage the incident before acting.
`;

/**
 * A skill is a DIRECTORY holding `SKILL.md` — the shape the content walk reads
 * and the ingress gate now enforces, so a loose `skills/<id>.md` is refused
 * before any byte lands. The fixture carries the real shape rather than the one
 * the walk would reject.
 */
const OPS_SKILL_PATH = "skills/triage/SKILL.md";

const CATALOG_CONTENT: Record<string, string> = { [OPS_SKILL_PATH]: OPS_SKILL_BODY };

interface CatalogFixture {
  content?: Record<string, string>;
  /** Overrides the honest aggregate pin — the mismatch fixtures use this. */
  pinSha?: string;
  tier?: TrustTier;
  notAudited?: boolean;
  disclaimer?: string;
}

/**
 * Seeds a pack OUTSIDE the project's cwd-relative pack conventions (under
 * `bundled/ops`) and registers it in the mocked catalog seam as entry `ops`,
 * the way the curated catalog hands `add` a bundled first-party pack: an
 * absolute root plus a pin. Returns the pack manifest for mutation fixtures.
 */
async function seedCatalogPack(fixture: CatalogFixture = {}): Promise<Record<string, unknown>> {
  const project = getProject();
  const content = fixture.content ?? CATALOG_CONTENT;
  const integrity = Object.fromEntries(
    Object.entries(content).map(([relPath, text]) => [relPath, digest(text)]),
  );
  const packManifest: Record<string, unknown> = {
    name: "ops",
    version: "0.1.0",
    integrity,
    declaredTools: ["claude"],
  };
  await project.seedFiles({
    ...Object.fromEntries(
      Object.entries(content).map(([relPath, text]) => [`bundled/ops/${relPath}`, text]),
    ),
    [`bundled/ops/${PACK_MANIFEST_FILE}`]: JSON.stringify(packManifest, null, 2),
  });
  catalogSeam.bundledRoots.set("ops", project.path("bundled", "ops"));
  catalogSeam.entries.set("ops", {
    id: "ops",
    description: "first-party ops pack",
    source: { kind: "bundled" },
    pin: {
      sha256: fixture.pinSha ?? computeAggregateContentSha(integrity),
      tier: fixture.tier ?? "curator-verified",
    },
    notAudited: fixture.notAudited ?? false,
    disclaimer: fixture.disclaimer ?? "",
  });
  return packManifest;
}

/** Writes a valid project manifest — the state `add` requires before it plans. */
async function initProject(tools: Tool[] = ["claude"]): Promise<void> {
  await writeManifest(
    getProject().dir,
    createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "0.0.0",
      now: FIXED_NOW,
    }),
    { now: FIXED_NOW },
  );
}

const run = async (argv: readonly string[]): Promise<InProcessResult> =>
  runInProcess([addCommand], ["add", ...argv], { cwd: getProject().dir });

/** The local unsigned fixture's install argv: the waiver is the trust decision. */
const installArgs = (...extra: string[]): string[] => [PACK_SPEC, "--allow-untrusted", ...extra];

async function readProjectManifest(): Promise<SetupManifest> {
  const manifest = await readManifest(getProject().dir);
  if (manifest === null) throw new Error("expected a project manifest on disk");
  return manifest;
}

const packRows = (manifest: SetupManifest, packId: string = PACK_ID): LedgerEntry[] =>
  manifest.ledger.filter((entry) => entry.adapter === packOwner(packId));

/** Every file under `root`, as sorted root-relative POSIX paths. */
async function listTree(root: string, rel = ""): Promise<string[]> {
  const entries = await readdir(join(root, rel), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
      return entry.isDirectory() ? await listTree(root, next) : [next];
    }),
  );
  return nested.flat().toSorted();
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await lstat(absPath);
    return true;
  } catch {
    return false;
  }
}

/** The single JSON document a `--json` run is allowed to print. */
function parseDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

const errorOf = (doc: Record<string, unknown>): { code: string; message: string; next?: string } =>
  doc.error as { code: string; message: string; next?: string };

const writtenOf = (doc: Record<string, unknown>): string[] => doc.written as string[];

const checksOf = (doc: Record<string, unknown>): Record<string, string> =>
  (doc.planned as { checks: Record<string, string> }).checks;

/** The write set the plan derived — populated whether or not the apply ran. */
const plannedFilesOf = (doc: Record<string, unknown>): string[] =>
  (doc.planned as { files: string[] }).files;

/** Occurrences of `needle` in `haystack` — the preview's exactly-once contract. */
const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe("add — preconditions", () => {
  it("refuses on an uninitialised repo and points at init", async () => {
    await seedPack();

    const result = await run([PACK_SPEC]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("npx @zomarit/stamity init");
    // Nothing was written: no state dir exists to have installed into.
    expect(await pathExists(getProject().path(".stamity"))).toBe(false);
  });

  it("passes the engine's source-resolution error through with its ErrorCode", async () => {
    await initProject();

    const result = await run(["./packs/missing", "--json"]);

    expect(result.code).toBe(1);
    const doc = parseDoc(result.stdout);
    expect(doc.ok).toBe(false);
    expect(errorOf(doc).code).toBe("CONFIG_ERROR");
    // The message names the resolved directory, so its separator is native.
    expect(errorOf(doc).message).toContain(join("packs", "missing"));
  });
});

describe("add — install", () => {
  it("runs every gate, writes the pack's files + receipt, and records 1:1 ledger rows", async () => {
    await initProject();
    const content = await seedPack();

    const result = await run(installArgs("--json"));

    expect(result.code).toBe(0);
    const doc = parseDoc(result.stdout);
    expect(doc.ok).toBe(true);
    expect(doc.packId).toBe(PACK_ID);
    expect(doc.installed).toBe(true);
    expect(checksOf(doc)).toEqual(GATE_OUTCOMES);
    // Payload additions with the install-UX composite: the resolved tier, the
    // org-policy outcome, the context cost, and the receipt path.
    expect(doc.trustTier).toBe("pinned-unsigned");
    expect(doc.policy).toEqual({ decision: "allow" });
    expect(doc.totalTokens).toBe(estimateTokens(AGENT_BODY) + estimateTokens(RULE_BODY));
    expect(doc.receiptPath).toBe(RECEIPT_PATH);
    // `written` gained the engine-generated install receipt (last, after the
    // content it records) — assertion extended, not weakened.
    expect(writtenOf(doc)).toEqual([...CONTENT_WRITTEN, RECEIPT_PATH]);
    // The plan names the content files; the receipt is engine output on top.
    expect(plannedFilesOf(doc)).toEqual(CONTENT_WRITTEN);

    // The bytes that landed are the pack's own bytes, unmodified.
    await Promise.all(
      Object.entries(content).map(async ([relPath, text]) => {
        const abs = getProject().path(PACK_DIR, ...relPath.split("/"));
        expect(await readFile(abs, "utf8")).toBe(text);
      }),
    );

    const rows = packRows(await readProjectManifest());
    expect(rows.map((row) => row.path).toSorted()).toEqual([...writtenOf(doc)].toSorted());
    expect(rows).toHaveLength(writtenOf(doc).length);
    expect(rows.every((row) => row.artifactType === "infra")).toBe(true);
  });

  it("renders the gate table, the trust line, the footprint, and a validate next-step", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    for (const [gate, outcome] of Object.entries(GATE_OUTCOMES)) {
      expect(result.stdout).toMatch(new RegExp(`${gate}\\s+${outcome.replace("/", "\\/")}`));
    }
    expect(result.stdout).toContain(`pack ${PACK_ID}@1.2.3`);
    expect(result.stdout).toContain("footprint");
    expect(result.stdout).toContain(PACK_DIR);
    // The trust line names the resolved tier and its basis, replacing the old
    // bare unsigned note.
    expect(result.stdout).toMatch(/trust\s+pinned-unsigned — /);
    expect(result.stdout).toContain("stamity validate");
    // TEST CHANGE, justified: the old assertion pinned the exact defect.
    // Installed pack bytes under the pack directory are read by no client — the
    // pack's commands, agents and rules reach a tool only once sync projects
    // them — so an install that named `validate` and never named `sync` left an
    // operator with an inert pack that `validate` then reported as all-clear.
    // Sync is step one, and the dim line no longer reads as "sync is
    // irrelevant here".
    expect(result.stdout).toContain("1. stamity sync");
    expect(result.stdout).toContain("sync projects it into your tool directories");
    expect(result.stdout).not.toContain("sync never rewrites it");
  });

  it("flattens a scoped pack id into one directory segment and namespaces its rows", async () => {
    await initProject();
    await seedPack();

    expect((await run(installArgs())).code).toBe(0);

    const rows = packRows(await readProjectManifest());
    // Row set gained the receipt (ledger is path-sorted, so it sits between
    // agents/ and rules/) — original rows still asserted verbatim.
    expect(rows.map((row) => row.path)).toEqual([
      `${PACK_DIR}/agents/reviewer.md`,
      RECEIPT_PATH,
      `${PACK_DIR}/rules/naming.md`,
    ]);
    // No path carries the scope's `@` or a second directory level for it.
    expect(rows.every((row) => !row.path.includes("@"))).toBe(true);
    expect(rows.map((row) => row.artifactId)).toEqual([
      `${PACK_ID}/agents/reviewer.md`,
      `${PACK_ID}/receipt.json`,
      `${PACK_ID}/rules/naming.md`,
    ]);
  });

  it("lists the first ten written paths and counts the rest", async () => {
    await initProject();
    const content = Object.fromEntries(
      Array.from({ length: 12 }, (_unused, index) => [
        `rules/r${String(index).padStart(2, "0")}.md`,
        `---\nid: r${index}\ntype: rule\n---\nRule ${index}.\n`,
      ]),
    );
    await seedPack({ content });

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`+ ${PACK_DIR}/rules/r09.md`);
    expect(result.stdout).not.toContain(`+ ${PACK_DIR}/rules/r10.md`);
    // 12 content files + the receipt = 13 written, 3 beyond the listing cap
    // (was "2 more" before the receipt joined the write set).
    expect(result.stdout).toContain("... and 3 more");
    expect(packRows(await readProjectManifest())).toHaveLength(13);
  });

  it("surfaces the declared-tools gate for a pack targeting a tool the project does not", async () => {
    await initProject(["claude"]);
    await seedPack({
      content: { "agents/reviewer.md": AGENT_BODY, "rules/cursor-only.md": CURSOR_RULE_BODY },
      declaredTools: ["claude", "cursor"],
    });

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    // The engine's cross-check is pack-manifest vs pack-content, so a tool the
    // project does not target passes; the command only surfaces it.
    expect(result.stdout).toMatch(/declaredTools\s+pass/);
    expect(result.stdout).toContain("also targets cursor");
    expect(await pathExists(getProject().path(PACK_DIR, "rules", "cursor-only.md"))).toBe(true);
  });
});

describe("add — install composite", () => {
  it("inventories every planned file with class, size, and token estimate", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("will install");
    // Rows are grouped under their content class.
    expect(result.stdout).toMatch(/agents\n\s+agents\/reviewer\.md/);
    expect(result.stdout).toMatch(/rules\n\s+rules\/naming\.md/);
    // One per-file token estimate per planned file.
    const tokenRows = result.stdout.split("\n").filter((line) => /~\d+ tok$/.test(line));
    expect(tokenRows).toHaveLength(2);
    expect(tokenRows[0]).toContain(`~${estimateTokens(AGENT_BODY)} tok`);
    // Exactly one total context-cost line.
    expect(countOf(result.stdout, "context cost")).toBe(1);
    expect(result.stdout).toContain(
      `context cost  ~${estimateTokens(AGENT_BODY) + estimateTokens(RULE_BODY)} tokens across 2 file(s)`,
    );
  });

  it("keeps inventory columns aligned when one path is much longer than the rest", async () => {
    await initProject();
    await seedPack({
      content: {
        "rules/a.md": RULE_BODY,
        "rules/a-very-long-rule-name-that-would-break-fixed-columns.md": RULE_BODY,
      },
    });

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    const tokenRows = result.stdout.split("\n").filter((line) => /~\d+ tok$/.test(line));
    expect(tokenRows).toHaveLength(2);
    // padEnd over the measured widest row: the token column starts at one
    // offset for every row, whatever the path lengths.
    expect(new Set(tokenRows.map((line) => line.indexOf("~"))).size).toBe(1);
  });

  it("renders the declared scope verbatim", async () => {
    await initProject();
    await seedPack({
      declaredTools: ["claude"],
      permissions: { toolFootprint: ["read"], touchedPaths: ["src/**", "docs/adr"] },
    });

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("scope");
    expect(result.stdout).toMatch(/declared tools\s+claude/);
    expect(result.stdout).toMatch(/tool footprint\s+read/);
    expect(result.stdout).toMatch(/touched paths\s+src\/\*\*, docs\/adr/);
    // A declared permission block flips the gate from "n/a" to "pass".
    expect(result.stdout).toMatch(/permissions\s+pass/);
  });

  it("says 'declares none' for absent scope declarations instead of hiding them", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    // No permissions block declared: both footprint and touched paths say so.
    expect(countOf(result.stdout, "declares none")).toBe(2);
  });

  it("renders an empty pack as 'no content files' rather than an empty table", async () => {
    await initProject();
    await seedPack({ content: {} });

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no content files");
    expect(result.stdout).toContain(RECEIPT_PATH);

    const json = await run(installArgs("--json"));
    const doc = parseDoc(json.stdout);
    expect(doc.totalTokens).toBe(0);
    // Only the receipt lands — and it is still ledger-owned.
    expect(writtenOf(doc)).toEqual([RECEIPT_PATH]);
  });

  // Assertion extended, not weakened: the authorship half is still pinned, and
  // the execution half is new. The caution framed the waiver as accepting an
  // unknown AUTHOR when what it accepts is that the pack's own hook and MCP
  // definitions become commands the client runs — a different decision, and the
  // one an operator is actually being asked to make.
  it("prints the blunt caution for pinned-unsigned content, naming what will run", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "caution: unverified content — nothing attests who published these bodies,",
    );
    expect(result.stdout).toContain("commands your client RUNS");
    expect(result.stdout).toContain("runs on every matching tool call");
    expect(result.stdout).toContain("launcher your editor spawns at start-up");
    expect(result.stdout).toContain("--preview");
  });
});

describe("add — execution disclosure", () => {
  /** The repo-committed script the fixture hook names. */
  const HOOK_SCRIPT = ".stamity/hooks/probe.mjs";

  /**
   * Commits that script, the way a repo that authored a hook would.
   *
   * Required to REACH the render under test, not to soften it: the `hooks`
   * ingress gate (`src/pack/install.ts` -> `checkHookDefinitions`) runs the
   * fails-closed launcher allow-list, which refuses a hook naming a script the
   * repo has not committed ([MISSING_SCRIPT]) — before any disclosure prints.
   * Same technique the gate's own suite uses (`test/pack/install.test.ts` ->
   * `commitHookScript`); no pack class may ship an executable, so a legitimate
   * hook's script is always repo-committed.
   */
  const commitHookScript = async (): Promise<void> => {
    await getProject().seedFiles({ [HOOK_SCRIPT]: "process.exit(0)\n" });
  };

  /** A pack shipping both executable classes, in the shape each reader parses. */
  const EXECUTABLE_CONTENT: Record<string, string> = {
    "agents/reviewer.md": AGENT_BODY,
    "hooks/guard.json": JSON.stringify({
      hooks: [{ event: "pre_tool_use", command: ["node", HOOK_SCRIPT] }],
    }),
    // The full pin-discipline shape the ingress gate requires: an exact package
    // name and version, a blast-radius statement, and a docs pointer. A
    // definition missing any of them is refused before the disclosure renders,
    // so the fixture carries them to reach the block under test.
    "mcp_servers/scanner.json": JSON.stringify({
      id: "scanner",
      description: "scans things",
      command: "npx",
      args: ["-y", "@acme/scanner@1.0.0"],
      transport: "stdio",
      pinnedVersion: "1.0.0",
      packageNameLock: "@acme/scanner",
      blastRadius: "Low — read-only scans of the working tree.",
      docsUrl: "https://example.invalid/acme-scanner",
    }),
  };

  it("shows every command line the pack would wire, without --preview", async () => {
    await initProject();
    await commitHookScript();
    await seedPack({ content: EXECUTABLE_CONTENT });

    const result = await run(installArgs("--dry-run"));

    // Path, size and token count describe every class identically; these two
    // classes are execution, and they were visible nowhere in the default view.
    expect(result.stdout).toContain("runs on this machine");
    expect(result.stdout).toContain(`node ${HOOK_SCRIPT}`);
    expect(result.stdout).toContain("npx -y @acme/scanner@1.0.0");
    expect(result.stdout).toContain("pre_tool_use");
    expect(result.stdout).toContain("hooks/guard.json");
    expect(result.stdout).toContain("mcp_servers/scanner.json");
  });

  it("states plainly when a pack wires no commands at all", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs("--dry-run"));

    // A pack that wires nothing is a fact worth stating, exactly as the scope
    // block states "declares none" rather than vanishing.
    expect(result.stdout).toContain("this pack wires no commands");
  });

  /**
   * Fixture moved from `hooks/broken.json` to `hooks/wiring.yaml`, and the case
   * got STRONGER rather than softer. A malformed `.json` no longer reaches this
   * render at all: the `hooks` ingress gate parses that extension and refuses
   * the install outright (`test/pack/install.test.ts` -> "refuses an inline-code
   * hook launcher…" and siblings), which is the better outcome and is asserted
   * there. What survives is the file NO gate parses — the `.yaml`/`.yml` form
   * the `hooks` class admits and `readHookDefinitions` skips, marking the row
   * `n/a`. That is exactly the residual gap this block exists to close: a
   * definition the chain never read must still be a row the operator opens.
   */
  it("reports an unparseable executable definition instead of omitting it", async () => {
    await initProject();
    await seedPack({
      content: {
        "agents/reviewer.md": AGENT_BODY,
        "hooks/wiring.yaml": "hooks:\n  - event: pre_tool_use\n    command: [node, probe.mjs]\n",
      },
    });

    const result = await run(installArgs("--dry-run"));

    // The whole point of the block is that nothing executable installs unseen.
    expect(result.stdout).toContain("could not be parsed — read the file");
    expect(result.stdout).toContain("hooks/wiring.yaml");
  });

  it("carries the command lines in the JSON document too", async () => {
    await initProject();
    await commitHookScript();
    await seedPack({ content: EXECUTABLE_CONTENT });

    const result = await run([...installArgs("--dry-run"), "--json"]);

    const doc = parseDoc(result.stdout);
    expect(doc["executes"]).toEqual([
      {
        label: "pre_tool_use",
        command: `node ${HOOK_SCRIPT}`,
        relPath: "hooks/guard.json",
      },
      {
        label: "scanner",
        command: "npx -y @acme/scanner@1.0.0",
        relPath: "mcp_servers/scanner.json",
      },
    ]);
  });

  it("names code execution in the default refusal and in the flag's own help", async () => {
    await initProject();
    await seedPack({ content: EXECUTABLE_CONTENT });

    // The operator is asked to accept unknown AUTHORSHIP and is actually
    // accepting code execution; all three strings framed it as provenance.
    const refused = await run([PACK_SPEC]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("commands your client runs as you");
    expect(refused.stderr).toContain("MCP launcher at editor start-up");

    // The flag's own help is the third string, read off the registered option.
    const options: { flags: string; description: string }[] = [];
    addCommand.configure?.({
      option: (flags: string, description: string) => options.push({ flags, description }),
    } as never);
    const waiver = options.find((option) => option.flags === "--allow-untrusted");
    expect(waiver?.description).toContain("commands your client runs as you");
  });

  /**
   * The predecessor of this case asserted the opposite — that the check-key set
   * had no `hooks` row and that the block printed a note saying so — and it
   * carried its own expiry: "the day a `hooks` gate lands, the key assertion
   * fails and the note has to come out with it … the note documents a gap, so
   * it may not outlive one." That day is this wave (`src/pack/install.ts` ->
   * `checkHookDefinitions`), so the case is inverted rather than dropped: both
   * execution-bearing classes now carry a row, and no sentence beneath the argv
   * may claim otherwise. Read off the check keys, not the sentence.
   */
  it("carries a gate row for both execution classes, and no note claiming otherwise", async () => {
    await initProject();
    await commitHookScript();
    await seedPack({ content: EXECUTABLE_CONTENT });

    const machine = await run([...installArgs("--dry-run"), "--json"]);
    const gates = Object.keys(checksOf(parseDoc(machine.stdout)));
    expect(gates).toContain("mcpServers");
    expect(gates).toContain("hooks");

    const result = await run(installArgs("--dry-run"));
    expect(result.stdout).not.toContain("the gate table above has no hooks row");
    expect(result.stdout).not.toContain("dropped, not wired");
  });

  it("prints no hook-gate note for a pack whose only executable class is gated", async () => {
    await initProject();
    const { "hooks/guard.json": _hook, ...mcpOnly } = EXECUTABLE_CONTENT;
    await seedPack({ content: mcpOnly });

    const result = await run(installArgs("--dry-run"));

    // A pack with no `hooks/` class at all: its one command line renders, and
    // the retired note stays retired — the guard that keeps a sentence about a
    // closed gap from coming back beside a table that now has the row.
    expect(result.stdout).toContain("npx -y @acme/scanner@1.0.0");
    expect(result.stdout).not.toContain("the gate table above has no hooks row");
  });

  /**
   * Same fixture as the retired "still notes the gap …" case, inverted with the
   * gate that closed the gap. An unreadable `hooks/*.json` used to render as an
   * "unreadable" row under a note; it is now REFUSED at ingress, which is the
   * stronger outcome the note could only describe. The engine's verdict is
   * tested at `test/pack/install.test.ts`; what this pins is the CLI seam — the
   * refusal reaches the operator naming the file, at exit 1, with nothing
   * written — because a dry run that aborts silently is the same invisibility
   * the disclosure block exists to close.
   */
  it("surfaces the hook-gate refusal for a definition that will not parse", async () => {
    await initProject();
    await seedPack({
      content: { "agents/reviewer.md": AGENT_BODY, "hooks/broken.json": "{ not json" },
    });

    const result = await run(installArgs("--dry-run"));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("hooks/broken.json");
    expect(result.stderr).toContain("will not run");
    expect(await pathExists(getProject().path(PACK_DIR))).toBe(false);
  });

  it("claims no gate coverage the chain does not have, in the string docs publish", () => {
    // `summary` is copied verbatim into docs/cli-reference.md at two sites by
    // scripts/generate-docs.mjs, so a completeness claim here is a published
    // one — and "after every trust gate passes" was false for the whole hooks
    // class, and stays false for the `.yaml`/`.yml` form the `hooks` gate marks
    // `n/a` because its reader does not parse it.
    expect(addCommand.summary).not.toMatch(/\bevery\b[^,.:]*\bgate/i);
    expect(addCommand.summary).toContain("install a content pack");
  });
});

describe("add — preview", () => {
  it("prints each file's full body exactly once between per-file headers", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs("--preview"));

    expect(result.code).toBe(0);
    expect(countOf(result.stdout, AGENT_BODY)).toBe(1);
    expect(countOf(result.stdout, RULE_BODY)).toBe(1);
    expect(result.stdout).toContain("──── agents/reviewer.md ────");
    expect(result.stdout).toContain("──── rules/naming.md ────");
    // Preview does not stop the install: the run still writes.
    expect(await pathExists(getProject().path(PACK_DIR, "agents", "reviewer.md"))).toBe(true);
  });

  it("keeps bodies out of the output when --preview is absent", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    expect(countOf(result.stdout, AGENT_BODY)).toBe(0);
    expect(result.stdout).not.toContain("Review the change and report findings.");
  });

  it("rides the bodies on the JSON payload while stdout stays one document", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs("--preview", "--json"));

    expect(result.code).toBe(0);
    // parseDoc enforces the single-document contract.
    const doc = parseDoc(result.stdout);
    const preview = doc.preview as Record<string, string>;
    expect(preview[`${PACK_DIR}/agents/reviewer.md`]).toBe(AGENT_BODY);
    expect(preview[`${PACK_DIR}/rules/naming.md`]).toBe(RULE_BODY);
  });
});

describe("add — dry run", () => {
  it("previews the plan and leaves the tree and the manifest untouched", async () => {
    await initProject();
    await seedPack();
    const project = getProject();
    const treeBefore = await listTree(project.dir);
    const manifestBefore = await readFile(project.path(MANIFEST_PATH), "utf8");

    const result = await run(installArgs("--dry-run"));

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nothing written (--dry-run)");
    expect(result.stdout).toMatch(/manifest\s+pass/);
    expect(await listTree(project.dir)).toEqual(treeBefore);
    expect(await readFile(project.path(MANIFEST_PATH), "utf8")).toBe(manifestBefore);
  });

  it("reports the full write set in --json while installing nothing", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs("--dry-run", "--json"));

    expect(result.code).toBe(0);
    const doc = parseDoc(result.stdout);
    expect(doc.ok).toBe(true);
    expect(doc.dryRun).toBe(true);
    // `planned` and `written` are distinct fields precisely so a preview can
    // name every target while claiming none of them.
    expect(plannedFilesOf(doc)).toEqual(CONTENT_WRITTEN);
    expect(doc.installed).toBe(false);
    expect(writtenOf(doc)).toEqual([]);
    // No install, no receipt: the path is null until the apply writes one.
    expect(doc.receiptPath).toBeNull();
    expect(await pathExists(getProject().path(PACK_DIR))).toBe(false);
    expect(packRows(await readProjectManifest())).toEqual([]);
  });
});

describe("add — trust gates", () => {
  it("refuses a pack with no trust basis, naming the flag that waives the check", async () => {
    await initProject();
    await seedPack();

    const result = await run([PACK_SPEC]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--allow-untrusted");
    expect(await pathExists(getProject().path(PACK_DIR))).toBe(false);
  });

  it("installs an untrusted pack under --allow-untrusted, recording signing as n/a", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs("--json"));

    expect(result.code).toBe(0);
    const doc = parseDoc(result.stdout);
    expect(checksOf(doc).signing).toBe("n/a");
    // Content + receipt (the receipt joined `written` with the wave-0 engine).
    expect(writtenOf(doc)).toHaveLength(3);
    expect(await pathExists(getProject().path(PACK_DIR, "agents", "reviewer.md"))).toBe(true);
  });

  it("marks the waived signing gate and the floor tier in human output too", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/signing\s+n\/a/);
    expect(result.stdout).toContain("pinned-unsigned");
  });

  it("refuses a declared signature this build cannot verify, even under the waiver", async () => {
    await initProject();
    await seedPack({
      signing: { method: "sigstore", signer: "acme", bundlePath: "bundle.sigstore.json" },
      extras: {
        "package.json": '{ "name": "@acme/ops" }',
        "bundle.sigstore.json": "{}",
      },
    });

    // A claim is not a waivable absence: --allow-untrusted must not skip it.
    const result = await run(installArgs("--json"));

    expect(result.code).toBe(1);
    const doc = parseDoc(result.stdout);
    expect(errorOf(doc).code).toBe("INTEGRITY_ERROR");
    expect(errorOf(doc).message).toContain("cannot verify Sigstore bundles yet");
    expect(await pathExists(getProject().path(PACK_DIR))).toBe(false);
  });

  it("refuses a pack declaring a banned lifecycle script, before any write", async () => {
    await initProject();
    await seedPack({
      extras: {
        "package.json": JSON.stringify({
          name: "@acme/ops",
          scripts: { postinstall: "node ./setup.js" },
        }),
      },
    });

    // --allow-untrusted added with the unsigned default fixture: the waiver
    // clears the trust-basis refusal so the run reaches the lifecycle gate,
    // which must still refuse — a waiver never waives the execution-surface ban.
    const result = await run(installArgs("--json"));

    expect(result.code).toBe(1);
    const doc = parseDoc(result.stdout);
    expect(errorOf(doc).code).toBe("INTEGRITY_ERROR");
    expect(errorOf(doc).message).toContain("postinstall");
    expect(await pathExists(getProject().path(PACK_DIR))).toBe(false);
    expect(packRows(await readProjectManifest())).toEqual([]);
  });
});

describe("add — org policy", () => {
  it("renders the matched rule when the org trust policy denies the pack", async () => {
    await initProject();
    await seedPack();
    await getProject().seedFiles({
      ".stamity/policy.json": JSON.stringify({ version: 1, packs: { deny: [PACK_ID] } }),
    });

    const result = await run(installArgs("--json"));

    expect(result.code).toBe(1);
    const doc = parseDoc(result.stdout);
    expect(errorOf(doc).code).toBe("INTEGRITY_ERROR");
    expect(errorOf(doc).message).toContain("org trust policy");
    expect(errorOf(doc).message).toContain(`matched rule: "${PACK_ID}"`);
    expect(await pathExists(getProject().path(PACK_DIR))).toBe(false);
  });

  it("fail-closes on a malformed policy instead of installing around it", async () => {
    await initProject();
    await seedPack();
    await getProject().seedFiles({ ".stamity/policy.json": "{ not json" });

    const result = await run(installArgs("--json"));

    expect(result.code).toBe(1);
    expect(errorOf(parseDoc(result.stdout)).code).toBe("CONFIG_ERROR");
    expect(await pathExists(getProject().path(PACK_DIR))).toBe(false);
  });
});

describe("add — curated catalog", () => {
  const OPS_DIR = ".stamity/packs/ops";

  it("plans a bare catalog id at its pinned tier with no --allow-untrusted", async () => {
    await initProject();
    await seedCatalogPack();

    const result = await run(["ops", "--json"]);

    expect(result.code).toBe(0);
    const doc = parseDoc(result.stdout);
    expect(doc.packId).toBe("ops");
    expect(doc.trustTier).toBe("curator-verified");
    expect(checksOf(doc).trustTier).toBe("pass");
    // The pin is the trust basis; there is no declaration to verify.
    expect(checksOf(doc).signing).toBe("n/a");
    expect(writtenOf(doc)).toEqual([`${OPS_DIR}/${OPS_SKILL_PATH}`, `${OPS_DIR}/receipt.json`]);
    expect(await readFile(getProject().path(OPS_DIR, OPS_SKILL_PATH), "utf8")).toBe(OPS_SKILL_BODY);
  });

  it("names the catalog-pin basis and skips the unverified-content caution", async () => {
    await initProject();
    await seedCatalogPack();

    const result = await run(["ops"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/trust\s+curator-verified — catalog pin verified/);
    expect(result.stdout).not.toContain("nothing attests who published these bodies");
  });

  it("falls through to the untouched local-path/npm resolution for an unknown id", async () => {
    await initProject();

    const result = await run(["unknown-pack", "--json"]);

    expect(result.code).toBe(1);
    const doc = parseDoc(result.stdout);
    // The npm branch's own refusal, verbatim — proof the catalog miss changed nothing.
    expect(errorOf(doc).code).toBe("CONFIG_ERROR");
    expect(errorOf(doc).message).toContain("node_modules");
  });

  it("refuses a catalog pack whose bytes do not match the pin (pinned-or-refuse)", async () => {
    await initProject();
    await seedCatalogPack({ pinSha: "a".repeat(64) });

    const result = await run(["ops", "--json"]);

    expect(result.code).toBe(1);
    const doc = parseDoc(result.stdout);
    expect(errorOf(doc).code).toBe("INTEGRITY_ERROR");
    expect(errorOf(doc).message).toContain("does not match its catalog pin");
    expect(await pathExists(getProject().path(OPS_DIR))).toBe(false);
  });

  it("re-verifies the pin on re-install, refusing content that drifted (update path)", async () => {
    await initProject();
    const packManifest = await seedCatalogPack();
    expect((await run(["ops"])).code).toBe(0);

    // Drift the bundled pack AFTER the pin was issued: the per-file integrity
    // map is updated to match (so only the pin can catch it), the pin is not.
    const drifted = `${OPS_SKILL_BODY}Escalate immediately.\n`;
    await getProject().seedFiles({
      [`bundled/ops/${OPS_SKILL_PATH}`]: drifted,
      [`bundled/ops/${PACK_MANIFEST_FILE}`]: JSON.stringify(
        { ...packManifest, integrity: { [OPS_SKILL_PATH]: digest(drifted) } },
        null,
        2,
      ),
    });

    const result = await run(["ops", "--json"]);

    expect(result.code).toBe(1);
    expect(errorOf(parseDoc(result.stdout)).code).toBe("INTEGRITY_ERROR");
    // The refused update left the first install exactly as it was.
    expect(await readFile(getProject().path(OPS_DIR, OPS_SKILL_PATH), "utf8")).toBe(OPS_SKILL_BODY);
  });

  it("prints a not-audited entry's disclaimer verbatim", async () => {
    await initProject();
    await seedCatalogPack({
      tier: "scanned",
      notAudited: true,
      disclaimer: "not audited: format-verified and scanned only — no curator reviewed these bodies.",
    });

    const result = await run(["ops"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "not audited: format-verified and scanned only — no curator reviewed these bodies.",
    );
  });

  it("lets an explicit path spec win over a same-named catalog entry", async () => {
    await initProject();
    await seedCatalogPack();
    // A cwd directory `./ops` whose pack is ALSO named ops, with different bytes.
    const localBody = "Local ops pack body.\n";
    await getProject().seedFiles({
      "ops/rules/local.md": localBody,
      [`ops/${PACK_MANIFEST_FILE}`]: JSON.stringify(
        {
          name: "ops",
          version: "9.9.9",
          integrity: { "rules/local.md": digest(localBody) },
        },
        null,
        2,
      ),
    });

    // `./ops` is the directory: pinned-unsigned, waiver required — the catalog
    // entry never enters the path branch.
    const viaPath = await run(["./ops", "--allow-untrusted", "--json"]);
    expect(viaPath.code).toBe(0);
    expect((parseDoc(viaPath.stdout).trustTier as string)).toBe("pinned-unsigned");
    expect(await pathExists(getProject().path(OPS_DIR, "rules", "local.md"))).toBe(true);

    // Bare `ops` prefers the catalog: curator-verified, no waiver, and the
    // re-install (same pack id) replaces the pack's ledger rows with the
    // catalog content's.
    const viaCatalog = await run(["ops", "--json"]);
    expect(viaCatalog.code).toBe(0);
    expect((parseDoc(viaCatalog.stdout).trustTier as string)).toBe("curator-verified");
    expect(await pathExists(getProject().path(OPS_DIR, OPS_SKILL_PATH))).toBe(true);
    // Re-install replaces rows and overwrites its own write set; it does not
    // sweep prior-install files absent from the new set — the stale file stays
    // on disk, now unowned (reclaiming strays is clean's job, not add's).
    const rows = packRows(await readProjectManifest(), "ops");
    expect(rows.map((row) => row.path)).toEqual([
      `${OPS_DIR}/receipt.json`,
      `${OPS_DIR}/${OPS_SKILL_PATH}`,
    ]);
    expect(await pathExists(getProject().path(OPS_DIR, "rules", "local.md"))).toBe(true);
  });
});

describe("add — receipt", () => {
  it("prints the receipt path with tier and file count, and persists the receipt", async () => {
    await initProject();
    await seedPack();

    const result = await run(installArgs());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`receipt: ${RECEIPT_PATH} (pinned-unsigned, 2 content file(s))`);
    const receipt = JSON.parse(
      await readFile(getProject().path(PACK_DIR, "receipt.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(receipt.packId).toBe(PACK_ID);
    expect(receipt.trustTier).toBe("pinned-unsigned");
  });
});

describe("add — collisions", () => {
  it("refuses when a file it does not own sits at a target path, writing nothing", async () => {
    await initProject();
    await seedPack();
    const project = getProject();
    await project.seedFiles({ [`${PACK_DIR}/agents/reviewer.md`]: "hand-written\n" });

    const result = await run(installArgs());

    expect(result.code).toBe(1);
    // The engine's collision string, verbatim.
    expect(result.stdout).toContain(
      `${PACK_DIR}/agents/reviewer.md: a file already exists there that pack "${PACK_ID}" does not own`,
    );
    expect(result.stderr).toContain("resolve the collisions, then re-run");
    // The next step names the uninstall verb this wave shipped (the previous
    // copy said v1 had no remove-pack verb — stale once clean --pack landed).
    expect(result.stderr).toContain("stamity clean --pack");
    // No partial write: the second file never appeared and the stray is intact.
    expect(await pathExists(project.path(PACK_DIR, "rules", "naming.md"))).toBe(false);
    expect(await readFile(project.path(PACK_DIR, "agents", "reviewer.md"), "utf8")).toBe(
      "hand-written\n",
    );
    expect(packRows(await readProjectManifest())).toEqual([]);
  });

  it("carries the collisions and installed:false into the --json refusal document", async () => {
    await initProject();
    await seedPack();
    await getProject().seedFiles({ [`${PACK_DIR}/rules/naming.md`]: "hand-written\n" });

    const result = await run(installArgs("--json"));

    expect(result.code).toBe(1);
    const doc = parseDoc(result.stdout);
    expect(doc.ok).toBe(false);
    expect(doc.installed).toBe(false);
    expect(doc.receiptPath).toBeNull();
    expect(writtenOf(doc)).toEqual([]);
    expect((doc.planned as { collisions: string[] }).collisions).toHaveLength(1);
    expect(errorOf(doc).code).toBe("VALIDATION_ERROR");
    expect(errorOf(doc).next).toContain("resolve the collisions");
    expect(errorOf(doc).next).toContain("stamity clean --pack");
  });

  it("re-adding an installed pack overwrites its own rows instead of colliding", async () => {
    // Divergence from the unit brief, which expected a refusal here: the engine
    // scopes its ownership check to rows this pack does NOT own
    // (src/pack/install.ts::collectCollisions), which is what makes a re-install
    // an upgrade. The refusal path is the ledger-lost case below.
    await initProject();
    await seedPack();
    expect((await run(installArgs())).code).toBe(0);

    const result = await run(installArgs("--json"));

    expect(result.code).toBe(0);
    const doc = parseDoc(result.stdout);
    // 3 = content + receipt (the receipt row joined `written` in the first release).
    expect(writtenOf(doc)).toHaveLength(3);
    const rows = packRows(await readProjectManifest());
    expect(rows.map((row) => row.path).toSorted()).toEqual([...writtenOf(doc)].toSorted());
    // Idempotent: the second install replaced the rows rather than doubling them.
    expect(rows).toHaveLength(3);
  });

  it("refuses instructively when the pack's files outlive their ledger rows", async () => {
    await initProject();
    await seedPack();
    expect((await run(installArgs())).code).toBe(0);
    // Drop the ownership rows while the files stay: the installed content is now
    // indistinguishable from files the pack never owned.
    const manifest = await readProjectManifest();
    await writeManifest(getProject().dir, { ...manifest, ledger: [] }, { now: FIXED_NOW });

    const result = await run(installArgs());

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("does not own");
    // The stale "v1 has no remove-pack verb" copy is gone; the ledger-driven
    // uninstall is the named way out.
    expect(result.stderr).toContain("stamity clean --pack");
  });
});
