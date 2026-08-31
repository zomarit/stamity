import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GrantableToolCategory } from "../../src/roster/agentPolicies.ts";
import { useCliFixture, type CliFixture, type CliRunResult } from "../support/cliHarness.ts";
import {
  fileSha256,
  packInstallDir,
  readLedgerRows,
  readReceipt,
  stagePack,
  stageSyntheticPack,
  tamperFile,
  treeDigest,
  writeOrgPolicy,
  type ObservedReceipt,
} from "../support/packFixtures.ts";

/**
 * The merge-blocking pack-install smoke lane: every scenario runs through the
 * REAL `stamity` bin (test/support/cliHarness.ts — `node --import tsx
 * src/cli.ts` in a pseudo-home fixture) with no engine shortcuts, and every
 * assertion reads the public surface only — exit codes, the one-JSON-document
 * `--json` contract, and the files, receipts and ledger rows a user would
 * find on disk. The file matches the plain `test/**\/*.test.ts` vitest glob,
 * so it runs inside `npm test` with no config carve-out: red here blocks
 * merge.
 *
 * Source kinds exercised: catalog id (resolving to the bundled pack root) and
 * a local directory stage of the same pack. The installer is file-copy-only
 * BY DESIGN — no download or archive-extract path exists in the engine
 * (`src/pack/manifest.ts::resolvePackSource` resolves a directory or an
 * already-installed node_modules package; nothing fetches) — so the
 * "real tarball/dir" mandate is satisfied by dir installs through the real
 * bin: extracting an npm-packed tarball is the operator's package manager's
 * job, never the engine's.
 *
 * Isolation contract, asserted not assumed: the suite writes only inside each
 * test's fixture tree. The checkout's own supply trees (`packs/`, `content/`)
 * are digested before the first test and re-digested after the last — a
 * single stray byte written outside the fixtures fails the suite. This is
 * also why the catalog-pin-MISMATCH composite (a tampered first-party pack
 * behind its own catalog id) is not staged here: reaching it through the real
 * bin would require tampering the checkout's `packs/` supply. The pin CHECK
 * running on the catalog lane is asserted via the receipt's tier basis below,
 * and the mismatch refusal itself is unit-covered in test/pack/trust.test.ts.
 *
 * No harness accommodation was needed: the suite runs on cliHarness.ts as-is
 * and no test outside this lane was weakened. Two additions of its own:
 * packFixtures.ts gained `stageSyntheticPack` (this unit's file), and the
 * local `initRepo` helper takes an optional `--tools` pin — both for the
 * live-emission scenario, which needs pack content classes no first-party
 * pack ships (`hooks`, and the refused `mcp_servers`) and one named client
 * whose emitted config the hook row must reach.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The three first-party packs and the content classes each one ships. */
const FIRST_PARTY = [
  { id: "ops", classes: ["agents", "commands", "skills"] },
  { id: "product-audit", classes: ["commands", "rules", "skills"] },
  { id: "scaffold", classes: ["commands"] },
] as const;

/**
 * Distinctive argv token for the synthetic hook pack, so "did the pack's hook
 * reach the client config" cannot false-positive on a core hook row.
 */
const HOOK_SENTINEL = "--pack-hook-sentinel";

/**
 * The repo-committed script that pack's hook runs. Seeded into the fixture
 * repo, not shipped by the pack: the launcher allow-list requires a hook
 * command to name one repo-contained script that exists, and the `hooks` pack
 * class refuses executables, so naming operator-committed code is the only
 * shape a pack hook can take.
 */
const HOOK_SCRIPT = ".stamity/hooks/pack-probe.mjs";

/** Minimal agent body for a synthetic pack — frontmatter the corpus walk accepts. */
const AGENT_FIXTURE = [
  "---",
  "id: probe",
  "description: synthetic pack probe agent",
  "tags: [review]",
  "---",
  "",
  "# Probe",
  "",
  "Survey the repository and report.",
  "",
].join("\n");

/** The same body plus a `capabilities:` grant declaration, for the grant gate. */
function packAgentFixture(id: string, capabilities: readonly string[]): string {
  return [
    "---",
    `id: ${id}`,
    `description: synthetic pack ${id} agent`,
    "tags: [review]",
    `capabilities: [${capabilities.join(", ")}]`,
    "---",
    "",
    `# ${id}`,
    "",
    "Survey the repository and report.",
    "",
  ].join("\n");
}

/**
 * A pack-supplied MCP server definition that clears the ingress bar the curated
 * catalog itself clears: exact version pin against an exact package name, a
 * launcher that is not a shell, no literal credential, and a blast-radius
 * statement the operator reads before approving the install.
 */
const SERVER_DEFINITION = `${JSON.stringify(
  {
    id: "packtel",
    description: "Telemetry queries against the team's own collector.",
    command: "npx",
    args: ["-y", "@acme/telemetry-mcp@1.4.2"],
    transport: "stdio",
    pinnedVersion: "1.4.2",
    packageNameLock: "@acme/telemetry-mcp",
    blastRadius: "Low — read-only queries against a staging collector.",
    docsUrl: "https://example.invalid/telemetry-mcp",
  },
  null,
  2,
)}\n`;

/** Repo-relative path of the emitted policy document the generated guard parses. */
const POLICY_DOCUMENT = ".stamity/generated/agent-tool-policies.json";

/** The emitted policy document as a reader parses it — structural, never imported. */
interface PolicyDocument {
  policies: Array<{
    agentId: string;
    allow: string[];
    rationale: string;
    source?: { kind: string; packId?: string };
  }>;
}

/**
 * The ops pack's declared tool footprint, read from the checkout's own supply
 * rather than restated: the grant asserted below is the intersection with THIS
 * list, so a copy that drifted would assert against a footprint nobody ships.
 */
async function opsFootprint(): Promise<GrantableToolCategory[]> {
  const raw = await readFile(join(REPO_ROOT, "packs", "ops", "pack.json"), "utf8");
  const manifest = JSON.parse(raw) as { permissions?: { toolFootprint?: GrantableToolCategory[] } };
  return manifest.permissions?.toolFootprint ?? [];
}

// ── Observed JSON envelope shapes (structural — never imported from src/) ──

interface AddEnvelope {
  ok: boolean;
  command: string;
  version: string;
  packId: string;
  planned: { files: string[]; checks: Record<string, string>; collisions: string[] };
  trustTier: string;
  tierBasis: string;
  policy: { decision: string; matchedRule?: string };
  totalTokens: number;
  installed: boolean;
  written: string[];
  receiptPath: string | null;
}

interface FailureEnvelope {
  ok: boolean;
  command: string;
  version: string;
  error: { code: string; message: string; why?: string; next?: string };
}

/** `.claude/settings.json` as the client reads it — structural, never imported. */
interface ClaudeSettings {
  hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>;
}

// ── Helpers ────────────────────────────────────────────────────

/** Absolute fixture path for a repo-relative POSIX path. */
function repoPath(fixture: CliFixture, relPosix: string): string {
  return join(fixture.repoDir, ...relPosix.split("/"));
}

/** True when anything exists at `path`. */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse `--json` stdout as EXACTLY one JSON document. The funnel prints a
 * single `JSON.stringify` line, so a second document (or any stray human
 * output on stdout) shows up as an embedded newline or a parse failure.
 */
function parseOneJsonDoc(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  expect(trimmed, "expected a JSON document on stdout").not.toBe("");
  expect(
    trimmed.includes("\n"),
    `expected exactly one JSON document on stdout, got:\n${stdout}`,
  ).toBe(false);
  return JSON.parse(trimmed) as Record<string, unknown>;
}

/**
 * `stamity init -y` — the precondition every install scenario shares. `tools`
 * pins the client selection where a scenario asserts on one client's emitted
 * config; omitted, detection picks as it would for a user.
 */
async function initRepo(fixture: CliFixture, tools?: string): Promise<void> {
  const init = await fixture.run(["init", "-y", ...(tools === undefined ? [] : ["--tools", tools])]);
  expect(init.code, `init failed:\n${init.stderr}`).toBe(0);
}

/** `stamity add <…args> --json`, with the parsed single-document stdout. */
async function runAddJson(
  fixture: CliFixture,
  args: readonly string[],
): Promise<{ result: CliRunResult; doc: Record<string, unknown> }> {
  const result = await fixture.run(["add", ...args, "--json"]);
  return { result, doc: parseOneJsonDoc(result.stdout) };
}

/** Every receipt `files[]` SHA re-hashed against the actual bytes on disk. */
async function expectReceiptMatchesDisk(
  fixture: CliFixture,
  receipt: ObservedReceipt,
): Promise<void> {
  const digests = await Promise.all(
    receipt.files.map(async (file) => ({
      file,
      actual: await fileSha256(repoPath(fixture, file.path)),
    })),
  );
  for (const { file, actual } of digests) {
    expect(actual, `disk bytes vs receipt sha256 for ${file.path}`).toBe(file.sha256);
  }
}

/**
 * The ledger rows owned by `pack:<id>` are EXACTLY the receipt's file
 * inventory plus the receipt itself — nothing more (no duplicates from
 * re-installs), nothing less (uninstall would strand files) — and every row's
 * hash matches the verified content.
 */
async function expectLedgerMatchesReceipt(
  fixture: CliFixture,
  packId: string,
  receipt: ObservedReceipt,
): Promise<void> {
  const receiptRel = `${packInstallDir(packId)}/receipt.json`;
  const rows = await readLedgerRows(fixture, `pack:${packId}`);
  expect(rows.map((row) => row.path).toSorted()).toEqual(
    [...receipt.files.map((file) => file.path), receiptRel].toSorted(),
  );
  const byPath = new Map(rows.map((row) => [row.path, row] as const));
  for (const file of receipt.files) {
    expect(byPath.get(file.path)?.contentHash, `ledger hash for ${file.path}`).toBe(file.sha256);
    expect(byPath.get(file.path)?.artifactType, `artifactType for ${file.path}`).toBe("infra");
  }
  expect(
    byPath.get(receiptRel)?.contentHash,
    "the receipt's own ledger row must hash the receipt bytes on disk",
  ).toBe(await fileSha256(repoPath(fixture, receiptRel)));
}

/**
 * Catalog-id install of one first-party pack, verified end to end: exit 0,
 * the full JSON payload contract, receipt-vs-disk SHA agreement, per-class
 * spot check, and exact ledger rows. Returns the receipt for later
 * comparisons.
 */
async function installViaCatalog(
  fixture: CliFixture,
  packId: string,
  classes: readonly string[],
): Promise<ObservedReceipt> {
  const { result, doc } = await runAddJson(fixture, [packId]);
  expect(result.code, `add ${packId} failed:\n${result.stderr}\n${result.stdout}`).toBe(0);

  // JSON payload contract: the one success envelope carries the whole plan.
  const envelope = doc as unknown as AddEnvelope;
  expect(envelope.ok).toBe(true);
  expect(envelope.command).toBe("add");
  expect(typeof envelope.version).toBe("string");
  expect(envelope.packId).toBe(packId);
  expect(envelope.installed).toBe(true);
  expect(envelope.planned.collisions).toEqual([]);
  expect(envelope.planned.files.length).toBeGreaterThan(0);
  expect(envelope.policy).toEqual({ decision: "allow" });
  expect(envelope.totalTokens).toBeGreaterThan(0);
  // Every gate ran and none failed silently: pass or an honest n/a, with the
  // load-bearing gates asserted by name.
  for (const [gate, outcome] of Object.entries(envelope.planned.checks)) {
    expect(["pass", "n/a"], `gate ${gate}`).toContain(outcome);
  }
  expect(envelope.planned.checks["integrityMap"]).toBe("pass");
  expect(envelope.planned.checks["bodyScan"]).toBe("pass");
  expect(envelope.planned.checks["trustTier"]).toBe("pass");
  // The catalog lane's pin verification RAN on this install: curator-verified
  // is only ever granted off a verified pin, and the basis says so.
  expect(envelope.trustTier).toBe("curator-verified");
  expect(envelope.tierBasis).toContain("catalog pin verified");

  const receiptRel = `${packInstallDir(packId)}/receipt.json`;
  expect(envelope.receiptPath).toBe(receiptRel);
  expect(envelope.written).toEqual([...envelope.planned.files, receiptRel]);

  // Receipt on disk: matching file inventory + trust tier, SHAs = disk bytes.
  const receipt = await readReceipt(fixture, packId);
  expect(receipt.packId).toBe(packId);
  expect(receipt.trustTier).toBe("curator-verified");
  expect(receipt.files.map((file) => file.path)).toEqual(envelope.planned.files);
  await expectReceiptMatchesDisk(fixture, receipt);

  // Spot check per class: exactly the classes this pack ships, each installed
  // under the pack's own directory.
  expect([...new Set(receipt.files.map((file) => file.class))].toSorted()).toEqual(
    [...classes].toSorted(),
  );
  for (const file of receipt.files) {
    expect(file.path.startsWith(`${packInstallDir(packId)}/`), file.path).toBe(true);
  }
  // A catalog id resolves to the bundled pack root inside this checkout.
  expect(receipt.source.spec.split("\\").join("/").endsWith(`packs/${packId}`)).toBe(true);

  await expectLedgerMatchesReceipt(fixture, packId, receipt);
  return receipt;
}

/** `{path, sha256}` projection — the byte-identity view of a receipt inventory. */
function contentHashes(receipt: ObservedReceipt): { path: string; sha256: string }[] {
  return receipt.files.map((file) => ({ path: file.path, sha256: file.sha256 }));
}

// ── Suite ──────────────────────────────────────────────────────

describe("pack install smoke (real bin, pseudo-home)", () => {
  const getFixture = useCliFixture({ git: true });

  // The isolation guard: the checkout's supply trees are read-only inputs to
  // every scenario. Digest them around the whole suite so any write that
  // escapes a fixture — into the bundled packs the catalog resolves, or the
  // corpus init emits from — fails loudly here.
  let packsSupplyDigest = "";
  let corpusSupplyDigest = "";

  beforeAll(async () => {
    packsSupplyDigest = await treeDigest(join(REPO_ROOT, "packs"));
    corpusSupplyDigest = await treeDigest(join(REPO_ROOT, "content"));
  });

  afterAll(async () => {
    expect(
      await treeDigest(join(REPO_ROOT, "packs")),
      "the checkout's packs/ supply changed — a write escaped the fixture tree",
    ).toBe(packsSupplyDigest);
    expect(
      await treeDigest(join(REPO_ROOT, "content")),
      "the checkout's content/ corpus changed — a write escaped the fixture tree",
    ).toBe(corpusSupplyDigest);
  });

  it(
    "installs all 3 first-party packs via catalog id, and a second install replaces rather than duplicates",
    { timeout: 240_000 },
    async () => {
      const fixture = getFixture();
      await initRepo(fixture);

      const receipts: ObservedReceipt[] = [];
      // Awaited in a loop on purpose: each add mutates the one manifest, so
      // the three installs are a dependency chain, not parallel work.
      for (const pack of FIRST_PARTY) {
        // oxlint-disable-next-line no-await-in-loop -- serialized installs against one manifest
        receipts.push(await installViaCatalog(fixture, pack.id, pack.classes));
      }
      const opsReceipt = receipts[0];
      expect(opsReceipt).toBeDefined();
      if (opsReceipt === undefined) return;

      // All three coexist: per-pack rows stayed exact under later installs.
      await expectLedgerMatchesReceipt(fixture, "ops", opsReceipt);

      // Update path = re-install: every gate re-runs (hashes re-verified) and
      // the pack's ledger rows are REPLACED, never appended.
      const rowsBefore = await readLedgerRows(fixture, "pack:ops");
      const second = await runAddJson(fixture, ["ops"]);
      expect(second.result.code, second.result.stderr).toBe(0);
      const envelope = second.doc as unknown as AddEnvelope;
      expect(envelope.installed).toBe(true);
      expect(envelope.planned.checks["integrityMap"]).toBe("pass");

      const rowsAfter = await readLedgerRows(fixture, "pack:ops");
      expect(rowsAfter.length).toBe(rowsBefore.length);
      const reReceipt = await readReceipt(fixture, "ops");
      expect(contentHashes(reReceipt)).toEqual(contentHashes(opsReceipt));
      await expectLedgerMatchesReceipt(fixture, "ops", reReceipt);
    },
  );

  it(
    "installs the same pack from a local-path stage: identical write set, floor tier only under the waiver",
    { timeout: 240_000 },
    async () => {
      const fixture = getFixture();
      await initRepo(fixture);

      // Catalog lane first, then clear it so the stage installs into a repo
      // with no prior claim on the paths.
      const catalogReceipt = await installViaCatalog(fixture, "scaffold", ["commands"]);
      const clean = await fixture.run(["clean", "--pack", "scaffold", "-y"]);
      expect(clean.code, clean.stderr).toBe(0);
      expect(await exists(repoPath(fixture, packInstallDir("scaffold")))).toBe(false);

      const staged = await stagePack(fixture, "scaffold");

      // A path spec never consults the catalog, so the stage has no trust
      // basis — refused by default, with the waiver named as the way out.
      const refused = await runAddJson(fixture, [staged]);
      expect(refused.result.code).toBe(1);
      const refusal = refused.doc as unknown as FailureEnvelope;
      expect(refusal.ok).toBe(false);
      expect(refusal.error.code).toBe("INTEGRITY_ERROR");
      expect(refusal.error.next).toContain("--allow-untrusted");
      expect(await exists(repoPath(fixture, packInstallDir("scaffold")))).toBe(false);

      const waived = await runAddJson(fixture, [staged, "--allow-untrusted"]);
      expect(waived.result.code, waived.result.stderr).toBe(0);
      expect((waived.doc as unknown as AddEnvelope).trustTier).toBe("pinned-unsigned");

      // Identical write sets across the two source lanes: same paths, same
      // classes, same bytes (SHA), same sizes and token estimates.
      const localReceipt = await readReceipt(fixture, "scaffold");
      expect(localReceipt.files).toEqual(catalogReceipt.files);
      await expectReceiptMatchesDisk(fixture, localReceipt);
      await expectLedgerMatchesReceipt(fixture, "scaffold", localReceipt);

      // Receipt provenance differs per source. The engine's resolved-source
      // vocabulary is {local-path, npm-package} and a catalog id resolves to
      // the bundled directory, so BOTH lanes record kind "local-path" — the
      // distinguishing provenance the receipt carries is the spec and the
      // trust tier (BD candidate noted in the unit report: a distinct
      // catalog/bundled source kind would make the receipt say it outright).
      expect(localReceipt.source.kind).toBe("local-path");
      expect(catalogReceipt.source.kind).toBe("local-path");
      expect(localReceipt.source.spec).toBe(staged);
      expect(localReceipt.source.spec).not.toBe(catalogReceipt.source.spec);
      expect(localReceipt.trustTier).toBe("pinned-unsigned");
      expect(localReceipt.tierBasis).toContain("no catalog pin and no signing declaration");
      expect(catalogReceipt.trustTier).toBe("curator-verified");
    },
  );

  it(
    "projects pack skills on sync, and clean --pack round-trips to a byte-identical re-install",
    { timeout: 240_000 },
    async () => {
      const fixture = getFixture();
      await initRepo(fixture);

      const first = await runAddJson(fixture, ["ops"]);
      expect(first.result.code, first.result.stderr).toBe(0);
      const receiptBefore = await readReceipt(fixture, "ops");
      // A second installed pack + the adapter surfaces stand as bystanders
      // that the scoped uninstall must leave intact.
      const bystander = await runAddJson(fixture, ["scaffold"]);
      expect(bystander.result.code, bystander.result.stderr).toBe(0);

      // Projection liveness: sync emits installed pack content into the live
      // surfaces — a pack skill lands in the skills tree beside the corpus
      // skills.
      //
      // ASSERTED PATH CHANGED: this fixture targets claude only, and
      // that client declares `readsAgentsSkillsDir: false` — it reads its own
      // `.claude/skills/`. The vendor-neutral `.agents/skills/` tree used to be
      // emitted for it anyway: 18 files byte-identical to the native copy, for
      // a client whose own dialect facts say it never opens them. The property
      // under test is unchanged (a pack skill reaches the live skills surface);
      // the surface asserted is now the one this client actually reads.
      const syncAfterInstall = await fixture.run(["sync"]);
      expect(syncAfterInstall.code, syncAfterInstall.stderr).toBe(0);
      const projectedSkill = repoPath(fixture, ".claude/skills/st-ci-pipeline/SKILL.md");
      const corpusSkill = repoPath(fixture, ".claude/skills/st-qa/SKILL.md");
      expect(await exists(repoPath(fixture, ".agents/skills"))).toBe(false);
      expect(await exists(projectedSkill), "pack skill projected after install+sync").toBe(true);
      expect(await exists(corpusSkill), "corpus skill present").toBe(true);

      // Ledger-driven uninstall: files gone, rows gone, everything else intact.
      const clean = await fixture.run(["clean", "--pack", "ops", "-y"]);
      expect(clean.code, clean.stderr).toBe(0);
      expect(clean.stdout).toContain('Pack "ops" removed');
      expect(await exists(repoPath(fixture, packInstallDir("ops")))).toBe(false);
      expect(await readLedgerRows(fixture, "pack:ops")).toEqual([]);
      expect(
        await exists(repoPath(fixture, `${packInstallDir("scaffold")}/receipt.json`)),
        "the other installed pack survives a scoped clean",
      ).toBe(true);
      expect((await readLedgerRows(fixture, "pack:scaffold")).length).toBeGreaterThan(0);
      expect(await exists(repoPath(fixture, "AGENTS.md")), "adapter files survive").toBe(true);

      // Removal + sync reclaims the projection; corpus content stays.
      const syncAfterClean = await fixture.run(["sync"]);
      expect(syncAfterClean.code, syncAfterClean.stderr).toBe(0);
      expect(await exists(projectedSkill), "pack projection reclaimed after clean+sync").toBe(
        false,
      );
      expect(await exists(corpusSkill), "corpus skill survives the reclaim").toBe(true);

      // Converged state: re-install after clean succeeds and is byte-identical
      // per the receipt hashes.
      const again = await runAddJson(fixture, ["ops"]);
      expect(again.result.code, again.result.stderr).toBe(0);
      const receiptAfter = await readReceipt(fixture, "ops");
      expect(contentHashes(receiptAfter)).toEqual(contentHashes(receiptBefore));
      await expectReceiptMatchesDisk(fixture, receiptAfter);
      await expectLedgerMatchesReceipt(fixture, "ops", receiptAfter);
    },
  );

  it(
    "refuses an org-policy-denied install and fail-closes on malformed policy, with zero filesystem delta",
    { timeout: 240_000 },
    async () => {
      const fixture = getFixture();
      await initRepo(fixture);

      // Deny by pack id: refused naming the matched rule, nothing written.
      await writeOrgPolicy(fixture, { version: 1, packs: { deny: ["ops"] } });
      const beforeDeny = await treeDigest(fixture.repoDir);
      const denied = await runAddJson(fixture, ["ops"]);
      expect(denied.result.code).toBe(1);
      // parseOneJsonDoc inside runAddJson already held stdout to exactly one
      // JSON document — the --json deny-case contract.
      const denyDoc = denied.doc as unknown as FailureEnvelope;
      expect(denyDoc.ok).toBe(false);
      expect(denyDoc.command).toBe("add");
      expect(denyDoc.error.code).toBe("INTEGRITY_ERROR");
      expect(denyDoc.error.message).toContain("denied by the org trust policy");
      expect(denyDoc.error.message).toContain('matched rule: "ops"');
      expect(await treeDigest(fixture.repoDir), "deny must write nothing").toBe(beforeDeny);
      expect(await readLedgerRows(fixture, "pack:")).toEqual([]);

      // Malformed by shape (deny is not an array): fail-closed, named as such.
      await writeOrgPolicy(fixture, { version: 1, packs: { deny: "ops" } });
      const beforeShape = await treeDigest(fixture.repoDir);
      const shape = await runAddJson(fixture, ["ops"]);
      expect(shape.result.code).toBe(1);
      const shapeDoc = shape.doc as unknown as FailureEnvelope;
      expect(shapeDoc.error.code).toBe("CONFIG_ERROR");
      expect(shapeDoc.error.message).toContain("fail-closed");
      expect(await treeDigest(fixture.repoDir), "malformed policy must write nothing").toBe(
        beforeShape,
      );

      // Malformed by syntax (not JSON at all): same fail-closed refusal class.
      await writeOrgPolicy(fixture, "not json {");
      const beforeSyntax = await treeDigest(fixture.repoDir);
      const syntax = await runAddJson(fixture, ["ops"]);
      expect(syntax.result.code).toBe(1);
      expect((syntax.doc as unknown as FailureEnvelope).error.code).toBe("CONFIG_ERROR");
      expect(await treeDigest(fixture.repoDir), "broken policy must write nothing").toBe(
        beforeSyntax,
      );
      expect(await readLedgerRows(fixture, "pack:")).toEqual([]);
    },
  );

  it(
    "arms a pack-supplied hook on sync, and installs an MCP definition through the same lane",
    { timeout: 240_000 },
    async () => {
      // CASE RENAMED, justified: the old title and two of its comments
      // named a class-refusal this case no longer performs. `mcp_servers` got a
      // consuming seam, so the second half of the case was rewritten to prove
      // that class installs END TO END — and the title kept advertising a
      // refusal the same file disproves three lines later. The refusal half now
      // has its own case below (`refuses a defective MCP definition at install`),
      // which is where the fail-closed direction belongs.
      //
      // The live-emission invariant through the bin, on the two
      // classes no first-party pack ships — which is exactly why they went
      // unexercised: `hooks` must reach the client's config after install, and
      // an `mcp_servers` definition must survive install, projection and
      // uninstall like the five classes beside it.
      const fixture = getFixture();
      await initRepo(fixture, "claude");

      // The repo-committed script the pack's hook names. Both ends of the
      // product force this shape: `src/shared/launcherAllowlist.ts` requires
      // one repo-contained script that exists, and the `hooks` pack class takes
      // only `.json`/`.yaml`/`.yml`, so a pack can name executable code but
      // never ship it. A pack hook whose command carried no script would be
      // refused here rather than armed — which is the gate working, not a gap.
      const probePath = repoPath(fixture, HOOK_SCRIPT);
      await mkdir(dirname(probePath), { recursive: true });
      await writeFile(probePath, "process.exit(0)\n", "utf8");

      const hookPack = await stageSyntheticPack(fixture, "hookpack", {
        "hooks/hooks.json": `${JSON.stringify(
          {
            hooks: [
              {
                event: "pre_tool_use",
                matcher: "Bash",
                command: ["node", HOOK_SCRIPT, HOOK_SENTINEL],
                timeoutMs: 2500,
              },
            ],
          },
          null,
          2,
        )}\n`,
      });

      const installed = await runAddJson(fixture, [hookPack, "--allow-untrusted"]);
      expect(installed.result.code, installed.result.stderr).toBe(0);
      const envelope = installed.doc as unknown as AddEnvelope;
      expect(envelope.installed).toBe(true);
      // The definition was READ at install, not merely copied (M-1): the gate
      // table answers for this class before the operator commits, the same way
      // it answers for `mcp_servers` below.
      expect(envelope.planned.checks["hooks"]).toBe("pass");
      const hookReceipt = await readReceipt(fixture, "hookpack");
      expect(hookReceipt.files.map((file) => file.class)).toEqual(["hooks"]);
      await expectReceiptMatchesDisk(fixture, hookReceipt);
      await expectLedgerMatchesReceipt(fixture, "hookpack", hookReceipt);

      // Live, not inert: sync wires the pack's hook into the client's own
      // config, beside the core hook rows.
      const synced = await fixture.run(["sync"]);
      expect(synced.code, synced.stderr).toBe(0);
      const settingsPath = repoPath(fixture, ".claude/settings.json");
      const settings = await readFile(settingsPath, "utf8");
      expect(settings, "pack hook missing from the emitted client config").toContain(
        HOOK_SENTINEL,
      );
      const preToolUse = (JSON.parse(settings) as ClaudeSettings).hooks["PreToolUse"] ?? [];
      expect(
        preToolUse.some(
          (entry) =>
            entry.matcher === "Bash" &&
            entry.hooks.some((hook) => hook.command.includes(HOOK_SENTINEL)),
        ),
      ).toBe(true);

      // Uninstall reclaims it: the row leaves the client config on the next
      // sync, the same way a projected skill does.
      const clean = await fixture.run(["clean", "--pack", "hookpack", "-y"]);
      expect(clean.code, clean.stderr).toBe(0);
      const syncAfterClean = await fixture.run(["sync"]);
      expect(syncAfterClean.code, syncAfterClean.stderr).toBe(0);
      expect(await readFile(settingsPath, "utf8")).not.toContain(HOOK_SENTINEL);

      // The other half: `mcp_servers` HAS a consuming seam — the MCP substrate
      // resolves ids from pack supply — so the invariant is satisfied by
      // consuming the class rather than by refusing it, and a well-formed
      // definition installs end to end. The fail-closed direction is a
      // different question and has its own case below; the class-refusal half
      // of the invariant is exercised by the classes that genuinely have no
      // seam (`prompts`, refused by name at enumeration).
      const mcpPack = await stageSyntheticPack(fixture, "mcppack", {
        "agents/stamity-probe.md": AGENT_FIXTURE,
        "mcp_servers/telemetry.json": SERVER_DEFINITION,
      });

      const installedMcp = await runAddJson(fixture, [mcpPack, "--allow-untrusted"]);
      expect(installedMcp.result.code, installedMcp.result.stderr).toBe(0);
      expect((installedMcp.doc as unknown as AddEnvelope).installed).toBe(true);

      const mcpReceipt = await readReceipt(fixture, "mcppack");
      expect(mcpReceipt.files.map((file) => file.class).toSorted()).toEqual([
        "agents",
        "mcp_servers",
      ]);
      // A server definition is recorded by path and hash like every other
      // class — no per-class branch in the ledger, so uninstall reclaims it.
      await expectReceiptMatchesDisk(fixture, mcpReceipt);
      await expectLedgerMatchesReceipt(fixture, "mcppack", mcpReceipt);
      const serverPath = `${packInstallDir("mcppack")}/mcp_servers/telemetry.json`;
      expect(mcpReceipt.files.map((file) => file.path)).toContain(serverPath);
      expect(await readFile(repoPath(fixture, serverPath), "utf8")).toBe(SERVER_DEFINITION);

      // Emission still plans with the class installed, and uninstall reclaims
      // the definition with the rest of the pack.
      const syncWithServer = await fixture.run(["sync"]);
      expect(syncWithServer.code, syncWithServer.stderr).toBe(0);
      const cleanMcp = await fixture.run(["clean", "--pack", "mcppack", "-y"]);
      expect(cleanMcp.code, cleanMcp.stderr).toBe(0);
      expect(await exists(repoPath(fixture, serverPath))).toBe(false);
      expect(await readLedgerRows(fixture, "pack:mcppack")).toEqual([]);
    },
  );

  it(
    "gates pack-agent capabilities at install and carries the surviving grant into the policy document",
    { timeout: 240_000 },
    async () => {
      // Grant resolution end to end. Two enforcement points decide whether a pack agent
      // can do anything: the install-time ingress check, and the policy
      // document the generated guard parses. Before this, ops installed
      // cleanly and both /st-release and /st-incident-response were
      // inert — the guard answered NO_POLICY for every agent the pack added.
      const fixture = getFixture();
      await initRepo(fixture, "claude");

      // Ingress half, through the real bin: an over-declaring pack is refused
      // by name before a byte lands, and the refusal names the file, the
      // capability and the footprint it exceeded.
      const overreach = await stageSyntheticPack(fixture, "grabby", {
        "agents/stamity-grabby.md": packAgentFixture("grabby", ["read", "network"]),
      });
      const before = await treeDigest(fixture.repoDir);
      const refused = await runAddJson(fixture, [overreach, "--allow-untrusted"]);
      expect(refused.result.code).toBe(1);
      const failure = refused.doc as unknown as FailureEnvelope;
      expect(failure.error.code).toBe("VALIDATION_ERROR");
      expect(failure.error.message).toContain("agents/stamity-grabby.md");
      expect(failure.error.message).toContain('"network"');
      expect(await treeDigest(fixture.repoDir), "a refused pack must write nothing").toBe(before);

      // The bundled ops pack passes the same gate, and its receipt records it.
      await installViaCatalog(fixture, "ops", ["agents", "commands", "skills"]);
      const receipt = await readReceipt(fixture, "ops");
      expect(receipt.checks["agentCapabilities"]).toBe("pass");

      const synced = await fixture.run(["sync"]);
      expect(synced.code, synced.stderr).toBe(0);
      const document = JSON.parse(
        await readFile(repoPath(fixture, POLICY_DOCUMENT), "utf8"),
      ) as PolicyDocument;
      // The core rows the guard has always had are on disk, untouched by the
      // install.
      expect(document.policies.map((row) => row.agentId)).toContain("stamity-reviewer");

      // Emission half, on the document `sync` actually wrote. The block that
      // used to stand here re-ran `planHooksInfra` by hand because the
      // composer's hand-off was parked; it is wired now, so the assertion is
      // against the real file — which is the only version that proves the
      // generated guard will find these rows.
      const footprint = await opsFootprint();
      for (const runtimeId of ["stamity-devops", "stamity-incident-responder"]) {
        const row = document.policies.find((candidate) => candidate.agentId === runtimeId);
        expect(row?.allow, runtimeId).toEqual(["read", "edit", "execute"]);
        expect(row?.source, runtimeId).toEqual({ kind: "pack", packId: "ops" });
        // Every granted category is one the pack disclosed: emission grants the
        // intersection the install preview showed, never a wider re-reading of
        // the agent's own frontmatter.
        for (const category of row?.allow ?? []) expect(footprint).toContain(category);
      }

      // The agent files the clients read agree with the document: a policy row
      // the guard admits plus an empty `tools:` on the emitted sub-agent would
      // still be an inert install, one enforcement point short.
      const emittedAgent = await readFile(
        repoPath(fixture, ".claude/agents/stamity-devops.md"),
        "utf8",
      );
      expect(emittedAgent).toMatch(/^tools: \S/m);
    },
  );

  it(
    "refuses a tampered pack with INTEGRITY_ERROR and leaves no partial install",
    { timeout: 240_000 },
    async () => {
      const fixture = getFixture();
      await initRepo(fixture);

      // A stage of the bundled pack with one file corrupted after its
      // integrity map was written — the pinned-or-refuse tamper case.
      const staged = await stagePack(fixture, "product-audit");
      await tamperFile(staged, "rules/stamity-epic-audit-frame.md");

      const before = await treeDigest(fixture.repoDir);
      const { result, doc } = await runAddJson(fixture, [staged, "--allow-untrusted"]);
      expect(result.code).toBe(1);
      const failure = doc as unknown as FailureEnvelope;
      expect(failure.error.code).toBe("INTEGRITY_ERROR");
      expect(failure.error.message).toContain(
        "rules/stamity-epic-audit-frame.md does not match its digest",
      );

      // Nothing installed and no partial directory: the integrity gate
      // refuses at plan time, before any write — and the apply stage re-hashes
      // every file to the same refusal, rolling back whatever landed (the
      // plan/apply race and its rollback are unit-covered in
      // test/pack/install.test.ts; through the bin the observable is exactly
      // this: no .stamity/packs/<id> residue).
      expect(await exists(repoPath(fixture, packInstallDir("product-audit")))).toBe(false);
      expect(await treeDigest(fixture.repoDir), "refused install must write nothing").toBe(before);
      expect(await readLedgerRows(fixture, "pack:")).toEqual([]);
    },
  );

  it(
    "refuses a defective MCP definition at install rather than bricking the next sync",
    { timeout: 240_000 },
    async () => {
      // The MCP ingress gate through the bin. Before it existed, this pack
      // installed with a ten-row all-pass gate table and a receipt, and then
      // failed EVERY `sync` and `check` — a fail-closed self-DoS the operator
      // escaped only by finding `stamity clean --pack <id>`. The refusal now
      // lands where the operator is still deciding.
      const fixture = getFixture();
      await initRepo(fixture);

      const shellLauncher = await stageSyntheticPack(fixture, "shellmcp", {
        "mcp_servers/evil.json": `${JSON.stringify(
          {
            id: "evil-bridge",
            description: "Bridges to the team collector.",
            command: "bash",
            args: ["-c", "start-bridge"],
            transport: "stdio",
            pinnedVersion: "1.0.0",
            packageNameLock: "bridge",
            blastRadius: "High — arbitrary shell at editor start-up.",
            docsUrl: "https://example.invalid/bridge",
          },
          null,
          2,
        )}\n`,
      });

      const before = await treeDigest(fixture.repoDir);
      const refused = await runAddJson(fixture, [shellLauncher, "--allow-untrusted"]);
      expect(refused.result.code).toBe(1);
      const failure = refused.doc as unknown as FailureEnvelope;
      expect(failure.ok).toBe(false);
      expect(failure.error.code).toBe("VALIDATION_ERROR");
      // Definition-shape vocabulary, naming the file and the defect.
      expect(failure.error.message).toContain("mcp_servers/evil.json");
      expect(failure.error.message).toContain("names a shell");
      expect(await treeDigest(fixture.repoDir), "a refused pack must write nothing").toBe(before);
      expect(await readLedgerRows(fixture, "pack:")).toEqual([]);

      // The gate table carries an `mcpServers` row on a pack that PASSES it, so
      // the row is a real disclosure rather than a name in a refusal message.
      const clean = await stageSyntheticPack(fixture, "cleanmcp", {
        "mcp_servers/telemetry.json": SERVER_DEFINITION,
      });
      const installed = await runAddJson(fixture, [clean, "--allow-untrusted"]);
      expect(installed.result.code, installed.result.stderr).toBe(0);
      expect((installed.doc as unknown as AddEnvelope).planned.checks["mcpServers"]).toBe("pass");

      // And an id that collides with a curated catalog row is refused at `add`,
      // never at the later sync.
      const collide = await stageSyntheticPack(fixture, "collidemcp", {
        "mcp_servers/github.json": SERVER_DEFINITION.replace('"packtel"', '"github"'),
      });
      const collided = await runAddJson(fixture, [collide, "--allow-untrusted"]);
      expect(collided.result.code).toBe(1);
      expect((collided.doc as unknown as FailureEnvelope).error.message).toContain(
        "curated catalog id",
      );
    },
  );

  it(
    "refuses a defective pack hook at install rather than dropping it at the next sync",
    { timeout: 240_000 },
    async () => {
      // M-1 through the bin. The two execution-bearing pack classes were gated
      // asymmetrically: `mcp_servers/*.json` cleared an ingress gate (the case
      // directly above), `hooks/*.json` cleared none — so this pack installed
      // at exit 0 under an all-pass gate table and a receipt, and its hook was
      // dropped from the wiring at the next `sync` with nothing said. The
      // security property held (the argv never reached `.claude/settings.json`)
      // but the operator was told a pack installed clean when one of its two
      // executable classes had not been read. Both classes now answer at the
      // same moment, which is what this case pins: the refusal lands at `add`.
      const fixture = getFixture();
      await initRepo(fixture, "claude");

      // The repo-committed script the hook names — present, so the refusal
      // below is about the launcher shape and nothing else.
      const probePath = repoPath(fixture, HOOK_SCRIPT);
      await mkdir(dirname(probePath), { recursive: true });
      await writeFile(probePath, "process.exit(0)\n", "utf8");

      // `node` is not a shell, so the deny scan that preceded the launcher
      // allow-list passed this argv; the inline program is deliberately
      // innocuous, because what makes the shape dangerous is the CHANNEL — an
      // arbitrary command in the client's settings file firing on every
      // matching tool call.
      const inlineCode = await stageSyntheticPack(fixture, "inlinehook", {
        "hooks/hooks.json": `${JSON.stringify(
          {
            hooks: [
              {
                event: "pre_tool_use",
                matcher: "Bash",
                command: ["node", "-e", "process.stdout.write('x')", HOOK_SCRIPT],
              },
            ],
          },
          null,
          2,
        )}\n`,
      });

      const before = await treeDigest(fixture.repoDir);
      const refused = await runAddJson(fixture, [inlineCode, "--allow-untrusted"]);
      expect(refused.result.code).toBe(1);
      const failure = refused.doc as unknown as FailureEnvelope;
      expect(failure.ok).toBe(false);
      expect(failure.error.code).toBe("VALIDATION_ERROR");
      // Names the file in the pack's own vocabulary and the defect class the
      // hook lane reports, so the operator reads one refusal, not a shrug.
      expect(failure.error.message).toContain("hooks/hooks.json");
      expect(failure.error.message).toContain("INLINE_CODE_FLAG");
      expect(await treeDigest(fixture.repoDir), "a refused pack must write nothing").toBe(before);
      expect(await readLedgerRows(fixture, "pack:")).toEqual([]);

      // The gate table carries a `hooks` row on a pack that PASSES it, so the
      // row is a real disclosure rather than a name in a refusal message — the
      // same standard the `mcpServers` row is held to above.
      const cleanHook = await stageSyntheticPack(fixture, "cleanhook", {
        "hooks/hooks.json": `${JSON.stringify(
          {
            hooks: [{ event: "pre_tool_use", matcher: "Bash", command: ["node", HOOK_SCRIPT] }],
          },
          null,
          2,
        )}\n`,
      });
      const installed = await runAddJson(fixture, [cleanHook, "--allow-untrusted"]);
      expect(installed.result.code, installed.result.stderr).toBe(0);
      expect((installed.doc as unknown as AddEnvelope).planned.checks["hooks"]).toBe("pass");
    },
  );

  it(
    "stops projecting an installed pack the org policy later denies, and says so",
    { timeout: 240_000 },
    async () => {
      // Policy projection through the bin. Org policy was consumed from the install path and
      // nowhere else, so a repo that installed a pack and LATER adopted a
      // policy denying it kept projecting that pack's content on every sync —
      // `add` refused correctly, `check` said all green, and the pack's files
      // kept reaching the emitted setup.
      const fixture = getFixture();
      await initRepo(fixture);
      await installViaCatalog(fixture, "ops", ["agents", "commands", "skills"]);

      const synced = await fixture.run(["sync"]);
      expect(synced.code, synced.stderr).toBe(0);
      // Claude-only fixture, so the live skills surface is this client's
      // own native root rather than the vendor-neutral tree it does not read.
      const packSkill = ".claude/skills/st-release/SKILL.md";
      expect(await exists(repoPath(fixture, packSkill))).toBe(true);

      await writeOrgPolicy(fixture, { version: 1, packs: { deny: ["*"] } });
      const denied = await fixture.run(["sync"]);
      // Degrades to a warning plus zero projection, never an unrecoverable sync.
      expect(denied.code, denied.stderr).toBe(0);
      expect(`${denied.stdout}${denied.stderr}`).toContain("denied by the org trust policy");
      expect(`${denied.stdout}${denied.stderr}`).toContain("ops");
      expect(await exists(repoPath(fixture, packSkill))).toBe(false);

      // The pack's own files and ledger rows are untouched, so re-allowing the
      // source restores it with no re-install.
      expect(await readLedgerRows(fixture, "pack:ops")).not.toEqual([]);
      await writeOrgPolicy(fixture, { version: 1, packs: {} });
      const restored = await fixture.run(["sync"]);
      expect(restored.code, restored.stderr).toBe(0);
      expect(await exists(repoPath(fixture, packSkill))).toBe(true);
    },
  );

  it(
    "reports an installed pack body edited after install in integrity vocabulary",
    { timeout: 240_000 },
    async () => {
      // Pack integrity through the bin. Every installed file's SHA is a ledger row and
      // nothing read it back: `check` called the edit ordinary regeneration
      // drift, the `sync` it recommends carried the edited bytes into the
      // emitted agent files, and `check` was clean forever afterwards while the
      // ledger and the disk disagreed.
      //
      // The `check` surface that renders this row is covered elsewhere; what this case
      // pins today is that the bytes on disk really do diverge from the ledger
      // hash after an ordinary edit, which is the input that row reads.
      const fixture = getFixture();
      await initRepo(fixture);
      await installViaCatalog(fixture, "ops", ["agents", "commands", "skills"]);

      const agentRel = `${packInstallDir("ops")}/agents/stamity-devops.md`;
      const rows = await readLedgerRows(fixture, "pack:ops");
      const recorded = rows.find((row) => row.path === agentRel)?.contentHash;
      expect(recorded, "the install records a hash for every byte it lands").toBeDefined();

      const agentPath = repoPath(fixture, agentRel);
      await writeFile(agentPath, `${await readFile(agentPath, "utf8")}\nAppended after install.\n`, "utf8");

      expect(await fileSha256(agentPath)).not.toBe(recorded);
      // The ledger row is NOT rewritten by the edit — which is what makes the
      // disagreement detectable at all.
      const after = await readLedgerRows(fixture, "pack:ops");
      expect(after.find((row) => row.path === agentRel)?.contentHash).toBe(recorded);
    },
  );
});
