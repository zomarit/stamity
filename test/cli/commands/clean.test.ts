import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanCommand, planCleanCandidates } from "../../../src/cli/commands/clean.ts";
import { wrapInManagedBlock } from "../../../src/merge/managedBlocks.ts";
import { MANIFEST_VERSION, type LedgerEntry, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * Real-filesystem lane. Clean's whole contract is what survives on disk — a
 * stripped file's user bytes, a co-owned file the sweep refuses, the state
 * directory that must be gone afterwards — and none of that is expressible on a
 * virtual volume the command never sees (the command resolves its root from
 * `ctx.app.runtime.cwd` and calls the real engine).
 *
 * The command runs through the in-process CLI funnel (`runInProcess`) rather
 * than being called directly, so every assertion here also covers the funnel
 * seams the UX contract lives in: exit codes 0/1, the single JSON document,
 * -y / --dry-run flag plumbing, and the TTY gating of the prompt.
 *
 * The recursive snapshot walk is ordered by necessity (a directory is read
 * before its children), so no-await-in-loop is off for this file exactly as it
 * is in the reclaim suite.
 */
/* oxlint-disable no-await-in-loop */

const tempDir = useTempDir("stamity-clean");

const AGENT_FILE = ".claude/agents/stamity-implementer.md";
const RULE_FILE = ".cursor/rules/50-stamity-testing.mdc";
const MCP_FILE = ".mcp.json";
const PACK_FILE = `${STATE_DIR}/packs/acme__ops/agents/reviewer.md`;
const MISSING_FILE = ".claude/agents/stamity-reviewer.md";
const LEARNING_FILE = `${STATE_DIR}/learnings/2026-01-01-lesson.md`;
/** State-dir extras no ledger row claims: they go with the directory, not the sweep. */
const HANDOFF_FILE = `${STATE_DIR}/handoffs/session.json`;

/** User prose written after a managed block — it must outlive the block. */
const USER_NOTES = "## My notes\n\nkeep me\n";
/** What the strip leaves behind: the newline that terminated the END-marker line
 *  is outside the block token, so it is preserved verbatim with the user bytes. */
const STRIPPED_REMAINDER = `\n${USER_NOTES}`;
/** A co-owned infra path the user replaced wholesale: no markers, no engine bytes. */
const USER_MCP = '{\n  "mcpServers": {}\n}\n';
const PACK_BODY = "---\nid: reviewer\n---\nReview the change.\n";

function sha256(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

/**
 * The ledger under test, one row per reclaim disposition the sweep can reach:
 * whole-file delete, managed-block strip, trusted-but-user-owned skip, a pack
 * row proved by content hash, and a row whose file the user already deleted.
 */
function ledgerFixture(): LedgerEntry[] {
  return [
    { path: AGENT_FILE, adapter: "claude", artifactId: "stamity-implementer", artifactType: "agent" },
    { path: RULE_FILE, adapter: "cursor", artifactId: "stamity-testing", artifactType: "rule" },
    { path: MCP_FILE, adapter: "claude", artifactId: "mcp-config", artifactType: "infra" },
    {
      path: PACK_FILE,
      adapter: "pack:@acme/ops",
      artifactId: "@acme/ops/agents/reviewer.md",
      artifactType: "infra",
      contentHash: sha256(PACK_BODY),
    },
    { path: MISSING_FILE, adapter: "claude", artifactId: "stamity-reviewer", artifactType: "agent" },
  ];
}

function manifestFixture(ledger: LedgerEntry[]): SetupManifest {
  return {
    version: MANIFEST_VERSION,
    generatedBy: "0.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tools: ["claude", "cursor"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    ledger,
  };
}

/** An initialised repo: five ledgered paths, user extras in the state dir, and
 *  one unmanaged user file that every run must leave alone. */
async function seedInitialisedRepo(temp: TempDirHandle): Promise<string> {
  await temp.seedFiles({
    "repo/README.md": "# fixture\n",
    [`repo/${AGENT_FILE}`]: `${wrapInManagedBlock("engine agent body")}${USER_NOTES}`,
    [`repo/${RULE_FILE}`]: wrapInManagedBlock("engine rule body"),
    [`repo/${MCP_FILE}`]: USER_MCP,
    [`repo/${PACK_FILE}`]: PACK_BODY,
    [`repo/${LEARNING_FILE}`]: "user learning\n",
    [`repo/${HANDOFF_FILE}`]: "{}\n",
    [`repo/${STATE_DIR}/manifest.json`]: `${JSON.stringify(manifestFixture(ledgerFixture()), null, 2)}\n`,
  });
  return temp.path("repo");
}

/** Every path under `dir` as `relative/posix/path` -> content; directories keyed
 *  with a trailing slash so a pruned directory shows up in a comparison too. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const seen: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      const key = relative(dir, abs).split(sep).join("/");
      if (entry.isDirectory()) {
        seen[`${key}/`] = "";
        await walk(abs);
      } else {
        seen[key] = await readFile(abs, "utf-8");
      }
    }
  };
  await walk(dir);
  return seen;
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

function parseSingleDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

interface ReportEntry {
  path: string;
  action: string;
  detail: string;
}

function entriesOf(doc: Record<string, unknown>): ReportEntry[] {
  return doc["entries"] as ReportEntry[];
}

function actionFor(entries: readonly ReportEntry[], path: string): string | undefined {
  return entries.find((entry) => entry.path === path)?.action;
}

/** Runs the command through the funnel with the repo as cwd. Defaults are the
 *  hostile ones: no TTY anywhere, empty env. */
function runClean(
  root: string,
  argv: readonly string[],
  opts?: { stdinLines?: readonly string[]; tty?: { stdout?: boolean; stdin?: boolean } },
): ReturnType<typeof runInProcess> {
  return runInProcess([cleanCommand], ["clean", ...argv], {
    cwd: root,
    ...(opts?.stdinLines !== undefined ? { stdinLines: opts.stdinLines } : {}),
    ...(opts?.tty !== undefined ? { tty: opts.tty } : {}),
  });
}

describe("planCleanCandidates", () => {
  it("turns every ledger row — pack rows included — into an adapter-removed candidate", () => {
    const manifest = manifestFixture(ledgerFixture());
    const candidates = planCleanCandidates(manifest);

    expect(candidates).toHaveLength(manifest.ledger.length);
    expect(candidates.map((candidate) => candidate.reason)).toEqual(
      Array.from({ length: manifest.ledger.length }, () => "adapter-removed"),
    );
    // Uninstall-all is the remit: the pack row is not filtered out the way
    // computeReclaimCandidates deliberately filters it during a sync.
    expect(candidates.map((candidate) => candidate.entry.path)).toContain(PACK_FILE);
  });

  it("returns fresh rows, so a candidate never aliases the caller's manifest", () => {
    const manifest = manifestFixture(ledgerFixture());
    const [first] = planCleanCandidates(manifest);

    expect(first?.entry).toEqual(manifest.ledger[0]);
    expect(first?.entry).not.toBe(manifest.ledger[0]);
  });

  it("plans nothing for a manifest whose ledger is empty", () => {
    expect(planCleanCandidates(manifestFixture([]))).toEqual([]);
  });
});

describe("clean — nothing to clean", () => {
  it("exits 0 on a repo with no manifest and offers a fresh init", async () => {
    const temp = tempDir();
    await temp.seedFiles({ "repo/README.md": "# fixture\n" });
    const root = temp.path("repo");
    const before = await snapshot(root);

    const result = await runClean(root, []);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Nothing to clean");
    expect(result.stdout).toContain("npx @zomarit/stamity init");
    expect(await snapshot(root)).toEqual(before);
  });

  it("reports the empty counts in the JSON envelope", async () => {
    const temp = tempDir();
    await temp.seedFiles({ "repo/README.md": "# fixture\n" });

    const result = await runClean(temp.path("repo"), ["--json", "-y"]);

    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)).toEqual({
      ok: true,
      command: "clean",
      version: expect.any(String),
      removed: 0,
      stripped: 0,
      skipped: 0,
      stateDirRemoved: false,
      entries: [],
    });
  });

  it("is idempotent: the second clean of a repo is the nothing-to-clean success", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const first = await runClean(root, ["-y"]);
    expect(first.code).toBe(0);

    const second = await runClean(root, ["-y"]);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("Nothing to clean");
  });
});

describe("clean — full removal", () => {
  it("deletes engine-owned files, strips blocks around user bytes, and removes the state dir", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, ["-y"]);

    expect(result.code).toBe(0);
    // Whole-file engine output: gone, and its now-empty parents pruned with it.
    expect(await readIfPresent(join(root, RULE_FILE))).toBeNull();
    // User bytes outside the managed block veto the delete and survive verbatim.
    expect(await readIfPresent(join(root, AGENT_FILE))).toBe(STRIPPED_REMAINDER);
    // The state directory — manifest, learnings, handoffs, packs — goes whole.
    // The extras are consented by the confirm text naming the directory (asserted
    // in the gate suite); no ledger row claims them, so only the rm reaches them.
    expect(await readIfPresent(join(root, `${STATE_DIR}/manifest.json`))).toBeNull();
    expect(await readIfPresent(join(root, LEARNING_FILE))).toBeNull();
    expect(await readIfPresent(join(root, HANDOFF_FILE))).toBeNull();
    // The directory itself, not just its contents: readIfPresent cannot prove
    // this (readFile on a directory throws EISDIR and would read as absent), so
    // the assertion goes through the tree walk.
    expect(Object.keys(await snapshot(root)).filter((key) => key.startsWith(STATE_DIR))).toEqual([]);
    // Nothing the ledger never claimed is touched.
    expect(await readIfPresent(join(root, "README.md"))).toBe("# fixture\n");
    expect(result.stdout).toContain("Clean complete");
  });

  it("removes installed pack content through the sweep — clean is uninstall-all", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, ["--json", "-y"]);

    const entries = entriesOf(parseSingleDoc(result.stdout));
    // Proved by the sweep's own disposition, not by the state-dir removal that
    // follows it: a pack row is a first-class reclaim candidate here.
    expect(actionFor(entries, PACK_FILE)).toBe("deleted");
    expect(await readIfPresent(join(root, PACK_FILE))).toBeNull();
  });

  it("keeps a ledgered path the user replaced with their own content", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, ["--json", "-y"]);

    const entries = entriesOf(parseSingleDoc(result.stdout));
    expect(actionFor(entries, MCP_FILE)).toBe("skipped-user-content");
    expect(await readIfPresent(join(root, MCP_FILE))).toBe(USER_MCP);
  });

  it("succeeds when a ledgered file was already deleted by hand", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, ["--json", "-y"]);

    expect(result.code).toBe(0);
    expect(actionFor(entriesOf(parseSingleDoc(result.stdout)), MISSING_FILE)).toBe("skipped-missing");
  });

  it("ends on the printed reinit offer, and leaves .gitignore alone", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);
    await temp.seedFiles({ "repo/.gitignore": `${STATE_DIR}/\nnode_modules/\n` });

    const result = await runClean(root, ["-y"]);

    expect(result.stdout).toContain("npx @zomarit/stamity init");
    expect(result.stdout).toContain(".gitignore");
    expect(await readIfPresent(join(root, ".gitignore"))).toBe(`${STATE_DIR}/\nnode_modules/\n`);
  });
});

describe("clean — destructive confirmation gate", () => {
  it("aborts with exit 1 and zero writes when the TTY prompt is declined", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);
    const before = await snapshot(root);

    const result = await runClean(root, [], {
      stdinLines: ["n"],
      tty: { stdout: true, stdin: true },
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("clean cancelled");
    expect(await snapshot(root)).toEqual(before);
  });

  it("names the state directory in the prompt, so removing its extras is consented", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, [], {
      stdinLines: ["n"],
      tty: { stdout: true, stdin: true },
    });

    expect(result.stdout).toContain(`${STATE_DIR}/ state directory`);
    expect(result.stdout).toContain("5 generated file(s)");
  });

  it("proceeds when the TTY prompt is accepted", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, [], {
      stdinLines: ["y"],
      tty: { stdout: true, stdin: true },
    });

    expect(result.code).toBe(0);
    expect(await readIfPresent(join(root, `${STATE_DIR}/manifest.json`))).toBeNull();
  });

  it("refuses a non-interactive run without -y, naming the flag, and writes nothing", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);
    const before = await snapshot(root);

    const result = await runClean(root, []);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("-y");
    expect(result.stderr).toContain("not a terminal");
    expect(await snapshot(root)).toEqual(before);
  });

  it("proceeds non-interactively with -y", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, ["-y"]);

    expect(result.code).toBe(0);
    expect(await readIfPresent(join(root, `${STATE_DIR}/manifest.json`))).toBeNull();
  });
});

describe("clean --dry-run", () => {
  it("reports every candidate as dry-run and leaves the tree byte-identical", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);
    const before = await snapshot(root);

    // No -y and no TTY: a dry run has nothing to consent to, so the destructive
    // gate must not fire here the way it does for a live run.
    const result = await runClean(root, ["--dry-run", "--json", "-y"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    const entries = entriesOf(doc);
    expect(entries.map((entry) => entry.action)).toEqual([
      "dry-run",
      "dry-run",
      "skipped-user-content",
      "dry-run",
      "skipped-missing",
    ]);
    expect(doc["stateDirRemoved"]).toBe(false);
    expect(await snapshot(root)).toEqual(before);
  });

  it("says so in the human output and keeps the state directory intact", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, ["--dry-run"]);

    expect(result.stdout).toContain("Dry run");
    expect(result.stdout).toContain("stamity clean");
    expect(await readIfPresent(join(root, `${STATE_DIR}/manifest.json`))).not.toBeNull();
  });
});

describe("clean --json", () => {
  it("carries counts matching the sweep report in exactly one document", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);

    const result = await runClean(root, ["--json", "-y"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["command"]).toBe("clean");
    // Two whole-file deletes (engine-named rule + hash-proved pack file), one
    // strip (user notes outside the block), two skips (user-owned, missing).
    const removed = doc["removed"] as number;
    const stripped = doc["stripped"] as number;
    const skipped = doc["skipped"] as number;
    expect(removed).toBe(2);
    expect(stripped).toBe(1);
    expect(skipped).toBe(2);
    expect(doc["stateDirRemoved"]).toBe(true);

    const entries = entriesOf(doc);
    expect(entries).toHaveLength(5);
    expect(entries.filter((entry) => entry.action === "deleted")).toHaveLength(removed);
    expect(entries.filter((entry) => entry.action === "managed-block-stripped")).toHaveLength(
      stripped,
    );
    expect(entries.filter((entry) => entry.action.startsWith("skipped-"))).toHaveLength(skipped);
    // JSON mode owns stdout: no human summary leaks into the document stream.
    expect(result.stdout).not.toContain("Clean complete");
  });
});

describe("clean — corrupt manifest", () => {
  const CORRUPT = `${JSON.stringify(
    {
      version: MANIFEST_VERSION,
      generatedBy: "0.0.0",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tools: [],
      selection: { items: {} },
      ledger: "not-an-array",
    },
    null,
    2,
  )}\n`;

  it("exits 1 with the engine's repair guidance and removes nothing", async () => {
    const temp = tempDir();
    await temp.seedFiles({
      "repo/README.md": "# fixture\n",
      [`repo/${STATE_DIR}/manifest.json`]: CORRUPT,
    });
    const root = temp.path("repo");
    const before = await snapshot(root);

    const result = await runClean(root, ["-y"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("delete the file and re-initialise the repo");
    expect(await snapshot(root)).toEqual(before);
  });

  it("codes the failure CONFIG_ERROR in the JSON error document", async () => {
    const temp = tempDir();
    await temp.seedFiles({ [`repo/${STATE_DIR}/manifest.json`]: CORRUPT });

    const result = await runClean(temp.path("repo"), ["--json", "-y"]);

    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(false);
    expect((doc["error"] as { code: string }).code).toBe("CONFIG_ERROR");
  });
});

// ── Scoped mode: clean --pack <id> ─────────────────────────────
//
// A second fixture family rather than a reuse of `seedInitialisedRepo`: the
// scoped contract is about what SURVIVES — the sibling pack, the adapter
// output, the shrunk-but-present manifest — so the fixture installs two packs
// whose ids share a scope prefix (`@acme/ops` / `@acme/ops-extra`), which is
// exactly the cross-match bait exact-owner equality must ignore, plus the
// engine-generated receipt row the uninstall must reclaim like any other row.

const OPS_ID = "@acme/ops";
const OPS_DIR = `${STATE_DIR}/packs/acme__ops`;
/** The target pack's engine-generated install receipt — reclaimed with the pack. */
const OPS_RECEIPT = `${OPS_DIR}/receipt.json`;
const OPS_RECEIPT_BODY = `{\n  "packId": "${OPS_ID}",\n  "files": 1\n}\n`;

const EXTRA_ID = "@acme/ops-extra";
const EXTRA_DIR = `${STATE_DIR}/packs/acme__ops-extra`;
const EXTRA_SKILL = `${EXTRA_DIR}/skills/deploy.md`;
const EXTRA_SKILL_BODY = "---\nid: deploy\n---\nShip it.\n";

/** The adapter-owned file's full seeded content, for survives-verbatim checks. */
const AGENT_CONTENT = `${wrapInManagedBlock("engine agent body")}${USER_NOTES}`;

/** One adapter row, the target pack's two rows (content + receipt), and the
 *  scope-prefix sibling's row. `PACK_FILE`/`PACK_BODY` are the shared pack-file
 *  constants from the full-clean fixture — same path, same bytes. */
function scopedLedgerFixture(): LedgerEntry[] {
  return [
    { path: AGENT_FILE, adapter: "claude", artifactId: "stamity-implementer", artifactType: "agent" },
    {
      path: PACK_FILE,
      adapter: "pack:@acme/ops",
      artifactId: `${OPS_ID}/agents/reviewer.md`,
      artifactType: "infra",
      contentHash: sha256(PACK_BODY),
    },
    {
      path: OPS_RECEIPT,
      adapter: "pack:@acme/ops",
      artifactId: `${OPS_ID}/receipt.json`,
      artifactType: "infra",
      contentHash: sha256(OPS_RECEIPT_BODY),
    },
    {
      path: EXTRA_SKILL,
      adapter: "pack:@acme/ops-extra",
      artifactId: `${EXTRA_ID}/skills/deploy.md`,
      artifactType: "infra",
      contentHash: sha256(EXTRA_SKILL_BODY),
    },
  ];
}

/** Two installed packs plus adapter output. `opsAgentBody` seeds drifted bytes
 *  for the salvage case; `omitOpsFiles` seeds the hand-deleted-directory case. */
async function seedScopedRepo(
  temp: TempDirHandle,
  opts?: { opsAgentBody?: string; omitOpsFiles?: boolean },
): Promise<string> {
  const files: Record<string, string> = {
    "repo/README.md": "# fixture\n",
    [`repo/${AGENT_FILE}`]: AGENT_CONTENT,
    [`repo/${EXTRA_SKILL}`]: EXTRA_SKILL_BODY,
    [`repo/${STATE_DIR}/manifest.json`]: `${JSON.stringify(manifestFixture(scopedLedgerFixture()), null, 2)}\n`,
  };
  if (opts?.omitOpsFiles !== true) {
    files[`repo/${PACK_FILE}`] = opts?.opsAgentBody ?? PACK_BODY;
    files[`repo/${OPS_RECEIPT}`] = OPS_RECEIPT_BODY;
  }
  await temp.seedFiles(files);
  return temp.path("repo");
}

/** The persisted ledger, straight off the disk the command wrote. */
async function readLedgerOnDisk(root: string): Promise<LedgerEntry[]> {
  const raw = await readFile(join(root, STATE_DIR, "manifest.json"), "utf-8");
  return (JSON.parse(raw) as SetupManifest).ledger;
}

function rowsOwnedBy(ledger: readonly LedgerEntry[], owner: string): LedgerEntry[] {
  return ledger.filter((entry) => entry.adapter === owner);
}

describe("clean --pack — scoped removal", () => {
  it("removes exactly the pack's files — receipt included — and leaves every other owner alone", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    const result = await runClean(root, ["--pack", OPS_ID, "-y"]);

    expect(result.code).toBe(0);
    // The pack's content and its receipt are gone, and the sweep's parent
    // prune took the now-empty pack directory with them.
    expect(await readIfPresent(join(root, PACK_FILE))).toBeNull();
    expect(await readIfPresent(join(root, OPS_RECEIPT))).toBeNull();
    expect(Object.keys(await snapshot(root))).not.toContain(`${OPS_DIR}/`);
    // The sibling pack shares the scope prefix and survives byte-for-byte:
    // matching is exact owner equality, never a prefix test.
    expect(await readIfPresent(join(root, EXTRA_SKILL))).toBe(EXTRA_SKILL_BODY);
    // Adapter-owned output and the state dir are outside the scoped remit.
    expect(await readIfPresent(join(root, AGENT_FILE))).toBe(AGENT_CONTENT);
    expect(await readIfPresent(join(root, `${STATE_DIR}/manifest.json`))).not.toBeNull();
    expect(result.stdout).toContain(`Pack "${OPS_ID}" removed`);
  });

  it("persists a manifest with zero rows of the pack and byte-unchanged foreign rows", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    await runClean(root, ["--pack", OPS_ID, "-y"]);

    const ledger = await readLedgerOnDisk(root);
    expect(ledger).toEqual(
      scopedLedgerFixture().filter((entry) => entry.adapter !== "pack:@acme/ops"),
    );
  });

  it("carries pack and removedRows in the JSON envelope", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    const result = await runClean(root, ["--pack", OPS_ID, "--json", "-y"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["command"]).toBe("clean");
    expect(doc["pack"]).toBe(OPS_ID);
    expect(doc["removedRows"]).toBe(2);
    expect(doc["removed"]).toBe(2);
    expect(doc["stateDirRemoved"]).toBe(false);
    const entries = entriesOf(doc);
    expect(entries).toHaveLength(2);
    expect(actionFor(entries, PACK_FILE)).toBe("deleted");
    expect(actionFor(entries, OPS_RECEIPT)).toBe("deleted");
  });

  it("ends on the sync next-step; the reinit offer stays full-clean-only", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    const result = await runClean(root, ["--pack", OPS_ID, "-y"]);

    expect(result.stdout).toContain("stamity sync");
    expect(result.stdout).not.toContain("npx @zomarit/stamity init");
  });

  it("composes with a full clean afterwards, which still removes everything else", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    await runClean(root, ["--pack", OPS_ID, "-y"]);
    const result = await runClean(root, ["-y"]);

    expect(result.code).toBe(0);
    expect(Object.keys(await snapshot(root)).filter((key) => key.startsWith(STATE_DIR))).toEqual(
      [],
    );
  });
});

describe("clean --pack — unknown id and missing manifest", () => {
  it("refuses an unknown pack id, listing the installed ids, and writes nothing", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);
    const before = await snapshot(root);

    const result = await runClean(root, ["--pack", "@acme/nosuch", "-y"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("@acme/nosuch");
    expect(result.stderr).toContain(OPS_ID);
    expect(result.stderr).toContain(EXTRA_ID);
    expect(await snapshot(root)).toEqual(before);
  });

  it("codes the unknown-id refusal VALIDATION_ERROR in JSON", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    const result = await runClean(root, ["--pack", "@acme/nosuch", "--json", "-y"]);

    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(false);
    expect((doc["error"] as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("points at stamity add when no packs are installed at all", async () => {
    const temp = tempDir();
    await temp.seedFiles({
      [`repo/${AGENT_FILE}`]: AGENT_CONTENT,
      [`repo/${STATE_DIR}/manifest.json`]: `${JSON.stringify(
        manifestFixture([
          {
            path: AGENT_FILE,
            adapter: "claude",
            artifactId: "stamity-implementer",
            artifactType: "agent",
          },
        ]),
        null,
        2,
      )}\n`,
    });

    const result = await runClean(temp.path("repo"), ["--pack", OPS_ID, "-y"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no packs are installed");
    expect(result.stderr).toContain("stamity add");
  });

  it("refuses a malformed pack id before matching it against the ledger", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    const result = await runClean(root, ["--pack", "../escape", "--json", "-y"]);

    expect(result.code).toBe(1);
    expect((parseSingleDoc(result.stdout)["error"] as { code: string }).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("keeps the nothing-to-clean path for a repo with no manifest", async () => {
    const temp = tempDir();
    await temp.seedFiles({ "repo/README.md": "# fixture\n" });

    const result = await runClean(temp.path("repo"), ["--pack", OPS_ID]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Nothing to clean");
  });
});

describe("clean --pack — destructive gate", () => {
  it("names the pack and its file count in the prompt, and a decline removes nothing", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);
    const before = await snapshot(root);

    const result = await runClean(root, ["--pack", OPS_ID], {
      stdinLines: ["n"],
      tty: { stdout: true, stdin: true },
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("clean cancelled");
    expect(result.stdout).toContain(`pack "${OPS_ID}"`);
    expect(result.stdout).toContain("2 installed file(s)");
    expect(await snapshot(root)).toEqual(before);
  });

  it("refuses a non-TTY run without -y, naming the flag, and writes nothing", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);
    const before = await snapshot(root);

    const result = await runClean(root, ["--pack", OPS_ID]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("-y");
    expect(result.stderr).toContain("not a terminal");
    expect(result.stderr).toContain(`pack "${OPS_ID}"`);
    expect(await snapshot(root)).toEqual(before);
  });

  it("proceeds when the TTY prompt is accepted", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    const result = await runClean(root, ["--pack", OPS_ID], {
      stdinLines: ["y"],
      tty: { stdout: true, stdin: true },
    });

    expect(result.code).toBe(0);
    expect(await readIfPresent(join(root, PACK_FILE))).toBeNull();
    expect(rowsOwnedBy(await readLedgerOnDisk(root), "pack:@acme/ops")).toEqual([]);
  });
});

describe("clean --pack --dry-run", () => {
  it("prints the candidates, prompts nothing, and leaves the tree byte-identical", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);
    const before = await snapshot(root);

    // No -y and no TTY: exit 0 here is the proof that no gate fired.
    const result = await runClean(root, ["--pack", OPS_ID, "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dry run");
    expect(result.stdout).toContain(PACK_FILE);
    expect(result.stdout).toContain(OPS_RECEIPT);
    expect(result.stdout).toContain(`stamity clean --pack ${OPS_ID}`);
    expect(await snapshot(root)).toEqual(before);
  });

  it("reports dry-run actions and zero dropped rows in JSON", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    const result = await runClean(root, ["--pack", OPS_ID, "--dry-run", "--json", "-y"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["pack"]).toBe(OPS_ID);
    expect(doc["removedRows"]).toBe(0);
    expect(doc["stateDirRemoved"]).toBe(false);
    expect(entriesOf(doc).map((entry) => entry.action)).toEqual(["dry-run", "dry-run"]);
    // The manifest still records the pack: a dry run drops no rows.
    expect(rowsOwnedBy(await readLedgerOnDisk(root), "pack:@acme/ops")).toHaveLength(2);
  });
});

describe("clean --pack — salvage and convergence", () => {
  const EDITED = "---\nid: reviewer\n---\nMy own reviewer now.\n";

  it("keeps an operator-edited pack file as salvage while still dropping its row", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp, { opsAgentBody: EDITED });

    const result = await runClean(root, ["--pack", OPS_ID, "--json", "-y"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    // The sweep reports the drift and keeps the bytes ...
    expect(actionFor(entriesOf(doc), PACK_FILE)).toBe("skipped-user-content");
    expect(await readIfPresent(join(root, PACK_FILE))).toBe(EDITED);
    // ... the untouched receipt still hashes clean and is deleted ...
    expect(await readIfPresent(join(root, OPS_RECEIPT))).toBeNull();
    // ... and BOTH rows are dropped regardless of disposition — the kept file
    // is user-owned from here on.
    expect(doc["removedRows"]).toBe(2);
    expect(rowsOwnedBy(await readLedgerOnDisk(root), "pack:@acme/ops")).toEqual([]);
  });

  it("states the salvage in human output", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp, { opsAgentBody: EDITED });

    const result = await runClean(root, ["--pack", OPS_ID, "-y"]);

    expect(result.stdout).toContain("user-owned");
  });

  it("converges when the pack's directory was already deleted by hand", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp, { omitOpsFiles: true });

    const result = await runClean(root, ["--pack", OPS_ID, "--json", "-y"]);

    expect(result.code).toBe(0);
    const entries = entriesOf(parseSingleDoc(result.stdout));
    expect(entries.map((entry) => entry.action)).toEqual(["skipped-missing", "skipped-missing"]);
    expect(rowsOwnedBy(await readLedgerOnDisk(root), "pack:@acme/ops")).toEqual([]);
  });

  it("cleans the scope-prefix sibling in the reverse direction without touching the pack", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    const result = await runClean(root, ["--pack", EXTRA_ID, "-y"]);

    expect(result.code).toBe(0);
    expect(await readIfPresent(join(root, EXTRA_SKILL))).toBeNull();
    expect(await readIfPresent(join(root, PACK_FILE))).toBe(PACK_BODY);
    expect(await readIfPresent(join(root, OPS_RECEIPT))).toBe(OPS_RECEIPT_BODY);
    const ledger = await readLedgerOnDisk(root);
    expect(rowsOwnedBy(ledger, "pack:@acme/ops")).toHaveLength(2);
    expect(rowsOwnedBy(ledger, "pack:@acme/ops-extra")).toEqual([]);
  });
});

describe("clean — consent is separate from output format", () => {
  /**
   * `stamity clean --json` is the natural machine-readable spelling and used to
   * delete `.stamity/` outright: `--json` was folded into `--yes` at the flag
   * funnel, so the whole invocation carried no consent token anywhere. A
   * formatting choice must not be an authorisation to destroy state.
   */
  it("refuses `--json` alone and leaves the state directory in place", async () => {
    const temp = tempDir();
    await temp.seedFiles({
      "repo/.stamity/manifest.json": JSON.stringify(manifestFixture(ledgerFixture()), null, 2),
      "repo/README.md": "# fixture\n",
    });
    const root = temp.path("repo");

    const result = await runClean(root, ["--json"]);

    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("needs confirmation");
    expect(existsSync(join(root, ".stamity"))).toBe(true);
  });

  it("proceeds once consent is stated explicitly", async () => {
    const temp = tempDir();
    await temp.seedFiles({
      "repo/.stamity/manifest.json": JSON.stringify(manifestFixture(ledgerFixture()), null, 2),
      "repo/README.md": "# fixture\n",
    });
    const root = temp.path("repo");

    const result = await runClean(root, ["--json", "-y"]);

    expect(result.code).toBe(0);
    expect(existsSync(join(root, ".stamity"))).toBe(false);
  });
});
