import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, cp, link, lstat, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COPILOT_SETUP_STEPS_PATH } from "../../../src/adapters/copilot.ts";
import { COMMANDS } from "../../../src/cli.ts";
import { cleanCommand, moveWithoutClobber, planCleanCandidates } from "../../../src/cli/commands/clean.ts";
import { applySync, planSync } from "../../../src/cli/commands/sync/engine.ts";
import { resolveAutonomy } from "../../../src/config/autonomy.ts";
import { claudeAskRows } from "../../../src/hooks/personOnly.ts";
import { readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { REQUIRED_GITIGNORE_ENTRIES } from "../../../src/mcp/env.ts";
import { wrapInManagedBlock } from "../../../src/merge/managedBlocks.ts";
import { ORG_POLICY_REL_PATH } from "../../../src/pack/orgPolicy.ts";
import { createApp } from "../../../src/index.ts";
import { MANIFEST_VERSION, type LedgerEntry, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { canonical, canonicalOnly, npxCommand } from "../../support/identity.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { madeUpArtifact, writeMadeUpPack } from "../../support/packFixtures.ts";
import { seedGitRepo } from "../../support/repoFixtures.ts";
import { makeTempDir, useTempDir, type TempDirHandle } from "../../support/tempDir.ts";
/**
 * TEST CHANGE, justified (audit FORK-3): every `npx @zomarit/stamity …` literal below
 * became `npxCommand("…")`, which reads the running checkout's own `package.json`.
 * The assertion is unchanged on this tree — the derived string is byte-for-byte the
 * literal it replaced — and a downstream that renamed the package as
 * `docs/enterprise-forks.md` instructs now reads its own remedy instead of failing on
 * a registry name it cannot install. Nothing here proves the production string: that
 * is `test/cli/kit/packageName.test.ts`, against a pseudo package root.
 */

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

/** chmod-based failure fixtures are meaningless as root, which bypasses the bits, and on Windows, which has none. */
const CAN_TEST_PERMISSIONS = typeof process.getuid === "function" && process.getuid() !== 0;

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
/** What the strip leaves behind: exactly the user bytes.
 *  TEST CHANGE, justified: REQ-FLOW-027 — a block at byte 0 takes the newline that
 *  terminated its END-marker line with it, so the user bytes come back as they were;
 *  this read `\n${USER_NOTES}`. */
const STRIPPED_REMAINDER = USER_NOTES;
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
    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; the pack rows are candidates under purge only.
    const candidates = planCleanCandidates(manifest, { purge: true });

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
    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; the planner now takes the flag.
    const [first] = planCleanCandidates(manifest, { purge: false });

    expect(first?.entry).toEqual(manifest.ledger[0]);
    expect(first?.entry).not.toBe(manifest.ledger[0]);
  });

  it("plans nothing for a manifest whose ledger is empty", () => {
    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; the planner now takes the flag.
    expect(planCleanCandidates(manifestFixture([]), { purge: false })).toEqual([]);
  });

  it("leaves the pack rows out without --purge, and keeps every client row (REQ-FLOW-028)", () => {
    const manifest = manifestFixture(ledgerFixture());

    const candidates = planCleanCandidates(manifest, { purge: false });

    expect(candidates.map((candidate) => candidate.entry.path)).toEqual(
      manifest.ledger.filter((row) => !row.adapter.startsWith("pack:")).map((row) => row.path),
    );
    expect(candidates.map((candidate) => candidate.entry.path)).not.toContain(PACK_FILE);
  });

  it("skips the Copilot setup workflow's row under setupSteps user, --purge included, and keeps it under off (REQ-FLOW-149)", () => {
    const workflow: LedgerEntry = {
      path: COPILOT_SETUP_STEPS_PATH,
      adapter: "copilot",
      artifactId: "copilot-setup-steps",
      artifactType: "infra",
    };
    const withMode = (setupSteps: string): SetupManifest => ({
      ...manifestFixture([...ledgerFixture(), workflow]),
      toolOptions: { copilot: { setupSteps } },
    });
    const pathsOf = (manifest: SetupManifest, purge: boolean): string[] =>
      planCleanCandidates(manifest, { purge }).map((candidate) => candidate.entry.path);

    expect(pathsOf(withMode("user"), false)).not.toContain(COPILOT_SETUP_STEPS_PATH);
    expect(pathsOf(withMode("user"), true)).not.toContain(COPILOT_SETUP_STEPS_PATH);
    // Only that row goes: every other client row is still a candidate.
    expect(pathsOf(withMode("user"), false)).toContain(AGENT_FILE);
    expect(pathsOf(withMode("off"), false)).toContain(COPILOT_SETUP_STEPS_PATH);
    expect(pathsOf(withMode("managed"), false)).toContain(COPILOT_SETUP_STEPS_PATH);
  });
});

/**
 * REQ-FLOW-149 through the command: a real Copilot setup, its mode moved by
 * `config set`, then `clean -y` with no sync between, so the ledger still
 * records the workflow.
 */
describe("clean — Copilot's setup workflow", () => {
  async function initialisedCopilot(mode: string): Promise<string> {
    const root = tempDir().path("repo");
    await mkdir(root, { recursive: true });
    const init = await runInProcess(COMMANDS, ["init", "-y", "--tools", "copilot"], { cwd: root });
    expect(init.code, init.stderr).toBe(0);
    expect(existsSync(join(root, COPILOT_SETUP_STEPS_PATH))).toBe(true);
    const set = await runInProcess(COMMANDS, ["config", "set", "copilot.setupSteps", mode], { cwd: root });
    expect(set.code, set.stderr).toBe(0);
    return root;
  }

  it("leaves the workflow under user, byte for byte", async () => {
    const root = await initialisedCopilot("user");
    const before = await readFile(join(root, COPILOT_SETUP_STEPS_PATH), "utf8");

    const result = await runClean(root, ["-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(join(root, COPILOT_SETUP_STEPS_PATH), "utf8")).toBe(before);
    // The rest of the setup went, so the workflow's survival is the mode's doing.
    expect(existsSync(join(root, ".github/hooks/stamity.json"))).toBe(false);
  });

  it("takes the unedited workflow back under off", async () => {
    const root = await initialisedCopilot("off");

    const result = await runClean(root, ["-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(join(root, COPILOT_SETUP_STEPS_PATH))).toBe(false);
  });

  // TEST CHANGE, justified: REQ-PLUGIN-033 (b1-fork-ci-job, step 0) — the earlier copy is made by moving the version on
  // the install line, which only a checkout with an npm channel renders; on a registry-less fork the workflow carries no
  // install line, the copy equals the current one, and the case went red for the fork's identity, not for the delete.
  it.skipIf(!canonical().canonical)(canonicalOnly("takes back under off the unedited workflow an earlier version wrote, which the ledger records (review/66)"), async () => {
    const root = await initialisedCopilot("off");
    // An earlier release's copy: another version on the install line, hashed by its row as that sync left it.
    const current = await readFile(join(root, COPILOT_SETUP_STEPS_PATH), "utf8");
    const earlier = current.replace(/(npm install --global \S+@)\S+/u, "$10.9.0");
    expect(earlier).not.toBe(current);
    await writeFile(join(root, COPILOT_SETUP_STEPS_PATH), earlier, "utf8");
    const manifest = await readManifest(root);
    const row = manifest!.ledger.find((entry) => entry.path === COPILOT_SETUP_STEPS_PATH);
    row!.contentHash = createHash("sha256").update(earlier).digest("hex");
    await writeManifest(root, manifest!);

    const result = await runClean(root, ["-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(join(root, COPILOT_SETUP_STEPS_PATH))).toBe(false);
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
    expect(result.stdout).toContain(npxCommand("init"));
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

    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; removing the whole state dir is --purge's.
    const result = await runClean(root, ["-y", "--purge"]);

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

    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; uninstall-all, packs included, is --purge's.
    const result = await runClean(root, ["--json", "-y", "--purge"]);

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

    expect(result.stdout).toContain(npxCommand("init"));
    expect(result.stdout).toContain(".gitignore");
    expect(await readIfPresent(join(root, ".gitignore"))).toBe(`${STATE_DIR}/\nnode_modules/\n`);
  });

  it("takes back none of the engine's own lines a 1.16.0 setup wrote, since its ledger records none (review/30)", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);
    const engineLines = `node_modules/\n${REQUIRED_GITIGNORE_ENTRIES.join("\n")}\n`;
    await temp.seedFiles({ "repo/.gitignore": engineLines });

    const result = await runClean(root, ["--json", "-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(await readIfPresent(join(root, ".gitignore"))).toBe(engineLines);
    expect(parseSingleDoc(result.stdout)).not.toHaveProperty("gitignoreRemoved");
  });
});

// ── The .gitignore lines setup recorded (REQ-FLOW-016, REQ-FLOW-027) ─────
//
// Real `init` through the funnel: the record clean reads is the one `init`
// writes on the `.gitignore` row, which a hand-built ledger would only restate.
describe("clean — the .gitignore lines setup recorded", () => {
  const MACHINE_LOCAL = [
    ".stamity/review-gate.json",
    ".stamity/review-gate.json.lock",
    ".stamity/review-gate.json.tmp-*",
    ".stamity/preflight-canary.json",
    ".stamity/run-ended.json",
    ".stamity/context-once/",
    ".stamity/client-models.json",
  ];

  async function initialised(): Promise<string> {
    const root = tempDir().path("repo");
    await mkdir(root, { recursive: true });
    const init = await runInProcess(COMMANDS, ["init", "-y", "--tools", "claude"], { cwd: root });
    expect(init.code, init.stderr).toBe(0);
    expect(await readIfPresent(join(root, ".gitignore"))).toBe(`${MACHINE_LOCAL.join("\n")}\n`);
    return root;
  }

  it("takes back the lines it added and keeps a line the owner added after setup", async () => {
    const root = await initialised();
    await writeFile(join(root, ".gitignore"), `${await readFile(join(root, ".gitignore"), "utf8")}my.log\n`, "utf8");

    const result = await runClean(root, ["--json", "-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(await readIfPresent(join(root, ".gitignore"))).toBe("my.log\n");
    expect(parseSingleDoc(result.stdout)["gitignoreRemoved"]).toEqual(MACHINE_LOCAL);
  });

  it("says in a dry run that a real run takes back the recorded lines, and touches nothing", async () => {
    // 2026-10-25_autonomy-distribution-02/build/13: the preview did not name the edit a real run makes.
    const root = await initialised();
    const before = await readFile(join(root, ".gitignore"), "utf8");

    const result = await runClean(root, ["--dry-run"]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `A real run also takes back the .gitignore line(s) this setup added, each once the file it ignores is gone: ${MACHINE_LOCAL.join(", ")}.`,
    );
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(before);
  });

  it("keeps every recorded line while .stamity/ is kept for a hook still wired to it (review/29)", async () => {
    const root = tempDir().path("repo");
    await mkdir(root, { recursive: true });
    const init = await runInProcess(COMMANDS, ["init", "-y", "--tools", "cursor"], { cwd: root });
    expect(init.code, init.stderr).toBe(0);
    const before = await readFile(join(root, ".gitignore"), "utf8");
    expect(before).toBe(`${MACHINE_LOCAL.join("\n")}\n`);
    // The engine's own bytes with a stray tail: still every script named, no longer JSON (S17).
    await writeFile(join(root, ".cursor/hooks.json"), `${await readFile(join(root, ".cursor/hooks.json"), "utf8")},`, "utf8");

    const result = await runClean(root, ["-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(join(root, STATE_DIR))).toBe(true);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(before);
    expect(result.stdout).toContain(`Left your .gitignore untouched: ${STATE_DIR}/ is kept`);
    // review/57: the manifest stays here, but --purge keeps .stamity/ whole while that wiring runs, so the line says when it works.
    const keptLine = result.stdout.split("\n").find((line) => line.startsWith(`Kept under ${STATE_DIR}/: `)) ?? "";
    expect(keptLine).toContain("manifest.json");
    expect(keptLine.endsWith(`. Once that wiring is gone, ${npxCommand("clean --purge")} deletes these too.`), keptLine).toBe(true);
  });

  it.skipIf(!CAN_TEST_PERMISSIONS)(
    "keeps the manifest when a step after the sweep fails, so the re-run takes the lines back (review/58, review/61)",
    async () => {
      const root = await initialised();
      const learnings = join(root, STATE_DIR, "learnings");
      // The placeholder's folder refuses the unlink: the step after the machine-local files and the gate state fails.
      await chmod(learnings, 0o555);
      let first;
      try {
        first = await runClean(root, ["-y"]);
      } finally {
        await chmod(learnings, 0o755);
      }

      expect(first.code).not.toBe(0);
      expect(existsSync(join(root, STATE_DIR, "manifest.json"))).toBe(true);
      expect(await readIfPresent(join(root, ".gitignore"))).toBe(`${MACHINE_LOCAL.join("\n")}\n`);

      const second = await runClean(root, ["-y", "--json"]);

      expect(second.code, second.stderr).toBe(0);
      expect(parseSingleDoc(second.stdout)["gitignoreRemoved"]).toEqual(MACHINE_LOCAL);
      expect(existsSync(join(root, ".gitignore"))).toBe(false);
      expect(existsSync(join(root, STATE_DIR))).toBe(false);
    },
  );

  it("says which lines it took back, and deletes the .gitignore it created", async () => {
    const root = await initialised();

    const result = await runClean(root, ["-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
    expect(result.stdout).toContain("Removed .gitignore: the setup created it, and nothing of yours was in it.");
  });

  it.skipIf(process.platform === "win32")(
    "refuses a linked .gitignore after the rest is clean, naming the lines left, and writes nothing through it",
    async () => {
      const root = await initialised();
      const outside = tempDir().path("outside-ignore");
      await writeFile(outside, await readFile(join(root, ".gitignore"), "utf8"), "utf8");
      const victim = await readFile(outside, "utf8");
      await rm(join(root, ".gitignore"));
      await symlink(outside, join(root, ".gitignore"));

      const result = await runClean(root, ["-y"]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(".gitignore lines this setup added were not taken back");
      expect(result.stderr).toContain(MACHINE_LOCAL[0]);
      expect(await readFile(outside, "utf8")).toBe(victim);
      // The refusal still ends the clean: it names the lines to delete by hand, and the manifest goes (review/58's order).
      expect(existsSync(join(root, STATE_DIR, "manifest.json"))).toBe(false);
    },
  );
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

    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; the question naming the whole
    // state directory and the pack's row among five files is --purge's, and the default one says what stays.
    const result = await runClean(root, ["--purge"], {
      stdinLines: ["n"],
      tty: { stdout: true, stdin: true },
    });

    expect(result.stdout).toContain(`${STATE_DIR}/ state directory`);
    expect(result.stdout).toContain("5 generated file(s)");

    const kept = await runClean(root, [], { stdinLines: ["n"], tty: { stdout: true, stdin: true } });
    // review/57: --purge is offered as the alternative to this run, never as a step after it (a default clean
    // removes the manifest, and a later `clean --purge` then finds no record to remove anything by).
    expect(kept.stdout).toContain(
      `Remove 4 generated file(s) and the setup's own files under ${STATE_DIR}/? Learnings, handoffs, overrides, run records ` +
        `and installed packs under ${STATE_DIR}/ stay; to delete them too, run ${npxCommand("clean --purge")} instead of this run.`,
    );
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
    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; the pack's row is no candidate,
    // so four entries remain, the pack file's `dry-run` the one gone.
    expect(entries.map((entry) => entry.action)).toEqual(["dry-run", "dry-run", "skipped-user-content", "skipped-missing"]);
    expect(entries.map((entry) => entry.path)).not.toContain(PACK_FILE);
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

    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; these counts (the pack file
    // deleted, the state dir removed) are --purge's.
    const result = await runClean(root, ["--json", "-y", "--purge"]);

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

    // TEST CHANGE, justified (2026-10-08, unit d1a2-clean-pack-copies): the step read
    // "reclaim any projected copies of the pack's content: stamity sync", a bare call that
    // runs only where a global install put the binary, for copies `clean --pack` now removes
    // itself. It now regenerates the clients' files in the pinned call every other remedy
    // prints. What this case pins, a sync next step and no reinit offer, holds.
    expect(result.stdout).toContain(`regenerate the clients' files without the pack: ${npxCommand("sync")}`);
    expect(result.stdout).not.toContain(npxCommand("init"));
  });

  it("composes with a full clean afterwards, which still removes everything else", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);

    await runClean(root, ["--pack", OPS_ID, "-y"]);
    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; a plain clean keeps the other
    // pack, so "everything else" is --purge's.
    const result = await runClean(root, ["-y", "--purge"]);

    expect(result.code).toBe(0);
    expect(Object.keys(await snapshot(root)).filter((key) => key.startsWith(STATE_DIR))).toEqual(
      [],
    );
  });

  // n13 (REQ-LADDER-009, review/237): the scoped write leaves `models.listed` out, so a 1.15.0
  // manifest's saved lists move to the git-ignored cache first, as `sync` moves them.
  it("moves a 1.15.0 manifest's saved model lists to the cache before it writes the shrunk manifest", async () => {
    const temp = tempDir();
    const root = await seedScopedRepo(temp);
    const manifestFile = join(root, STATE_DIR, "manifest.json");
    const saved = { codex: { ids: ["gpt-6-sol", "gpt-6-luna"], source: "codex-debug-models" } };
    const onDisk = JSON.parse(await readFile(manifestFile, "utf-8")) as Record<string, unknown>;
    await writeFile(manifestFile, `${JSON.stringify({ ...onDisk, models: { listed: saved } }, null, 2)}\n`);

    const result = await runClean(root, ["--pack", OPS_ID, "-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(await readFile(join(root, STATE_DIR, "client-models.json"), "utf-8"))).toEqual({ listed: saved });
    expect(await readFile(manifestFile, "utf-8")).not.toContain('"listed"');
    expect(rowsOwnedBy(await readLedgerOnDisk(root), "pack:@acme/ops")).toEqual([]);
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
    // TEST CHANGE, justified: REQ-PLUGIN-048 (inbox row 487) — the next step printed the bare
    // `stamity clean --pack` form, which runs only where a global install put the binary; it now
    // prints the pinned call every other remedy prints (`add`, `sync`, `pack-reach`), so a registry
    // fork's carries its registry too. What this case pins, the apply step naming the pack, holds.
    expect(result.stdout).toContain(`apply it: ${npxCommand(`clean --pack ${OPS_ID}`)}`);
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

// ── Scoped mode: the pack's projected copies (REQ-PLUGIN-046, d1a2) ─────
//
// Real setups, no hand-built ledger: `clean --pack` finds a copy by planning
// the emission twice (the pack installed, and the pack's rows removed), so the
// fixture has to be one the real planner renders — `init --tools claude`,
// `add`, `sync`. Each template is built once per describe and copied per case.

// TEST CHANGE, justified (2026-10-21, plan 018-packs-rebuilt-02, unit u2-refixture-cli-tests,
// REQ-PACK-012, REQ-PACK-023): the cases below installed the first-party `ops` pack from the
// catalog, for the agent and the skills it projects into the clients, and `scaffold` beside it.
// Both packs retire in this package, and `frontend`, the one first-party pack left, ships no agent.
// So the pack under test is this made-up one, added from a path with `--allow-untrusted` (a path
// spec carries no trust basis); the other installed pack is the catalog's `frontend`. It ships a
// command, agents and a skill, so its copies span the classes `ops`'s did, and what each case
// asserts on the copies, their rows and the refusals is unchanged.
/** The made-up pack's id: its owner is `pack:acme-ship`, its folder `.stamity/packs/acme-ship`. */
const SHIP_ID = "acme-ship";
const SHIP_AGENT_REL = "agents/stamity-acme-deployer.md";
const SHIP_SKILL_REL = "skills/st-acme-pipeline/SKILL.md";
const SHIP_COMMAND_REL = "commands/st-acme-ship.md";
/**
 * The deployer's `model_class` is `advanced`, the class a moved Codex list re-picks below. A second
 * agent keeps the pack's `agents/` folder from emptying when a case moves the deployer out by hand,
 * as `ops`'s two agents did, so `clean --pack` still prunes the pack's whole folder there.
 */
const SHIP_FILES: Readonly<Record<string, string>> = {
  [SHIP_AGENT_REL]: madeUpArtifact("acme-deployer", "agent", "Deploys the acme service.").replace(
    "load: on-demand\n",
    "load: on-demand\nmodel_class: advanced\n",
  ),
  "agents/stamity-acme-watcher.md": madeUpArtifact("acme-watcher", "agent", "Watches the acme service."),
  [SHIP_SKILL_REL]: madeUpArtifact("acme-pipeline", "skill", "Designs the acme pipeline."),
  [SHIP_COMMAND_REL]: madeUpArtifact("acme-ship", "command", "Ships the acme service."),
};

/** Writes the made-up pack into `dir` and returns the `add` argv that installs it. */
async function shipPackArgs(dir: string): Promise<string[]> {
  return ["add", await writeMadeUpPack(dir, SHIP_ID, { ...SHIP_FILES }), "--allow-untrusted", "-y"];
}

describe("clean --pack — the pack's projected copies", () => {
  type Row = LedgerEntry;
  type Entry = ReportEntry & { proof?: string };

  let templates: TempDirHandle;
  /** `init -y --tools claude`, `add <the made-up pack> --allow-untrusted -y`, `sync`. */
  let shipSynced: string;
  /** The same, with the catalog's `frontend` added and synced too. */
  let twoPacksSynced: string;
  /** The claude rows the made-up pack's `add` + `sync` added under `.claude/`: the pack's copies. */
  let shipCopies: string[];
  /** The claude rows `add frontend` + `sync` added under `.claude/`. */
  let frontendCopies: string[];

  async function run(cwd: string, argv: readonly string[]): Promise<Awaited<ReturnType<typeof runInProcess>>> {
    const result = await runInProcess(COMMANDS, argv, { cwd });
    expect(result.code, `${argv.join(" ")}: ${result.stdout}\n${result.stderr}`).toBe(0);
    return result;
  }

  async function addAndSync(repo: string, addArgv: readonly string[]): Promise<string[]> {
    const before = new Set((await readLedgerOnDisk(repo)).map((row) => row.path));
    await run(repo, addArgv);
    await run(repo, ["sync"]);
    return (await readLedgerOnDisk(repo))
      .filter((row) => row.adapter === "claude" && row.path.startsWith(".claude/") && !before.has(row.path))
      .map((row) => row.path);
  }

  beforeAll(async () => {
    templates = await makeTempDir("stamity-clean-copies");
    shipSynced = templates.path("ship");
    await mkdir(shipSynced, { recursive: true });
    await seedGitRepo(shipSynced);
    await run(shipSynced, ["init", "-y", "--tools", "claude"]);
    shipCopies = await addAndSync(shipSynced, await shipPackArgs(templates.path("packs")));
    twoPacksSynced = templates.path("two");
    await cp(shipSynced, twoPacksSynced, { recursive: true });
    frontendCopies = await addAndSync(twoPacksSynced, ["add", "frontend", "-y"]);
  }, 180_000);

  afterAll(async () => {
    await templates.cleanup();
  });

  async function copyOf(template: string): Promise<string> {
    const root = tempDir().path("repo");
    await cp(template, root, { recursive: true });
    return root;
  }

  function cleanJson(root: string, extra: readonly string[] = []): Promise<Record<string, unknown>> {
    return runClean(root, ["--pack", SHIP_ID, "--json", "-y", ...extra]).then((result) => {
      expect(result.code, result.stderr).toBe(0);
      return parseSingleDoc(result.stdout);
    });
  }

  function entryAt(doc: Record<string, unknown>, path: string): Entry | undefined {
    return (entriesOf(doc) as Entry[]).find((entry) => entry.path === path);
  }

  const EDITED_COPY = ".claude/skills/st-acme-pipeline/SKILL.md";
  const AGENT_COPY = ".claude/agents/stamity-acme-deployer.md";
  const COMMAND_COPY = ".claude/commands/st-acme-ship.md";

  it("the fixture: the made-up pack projects its skill, its agent and its command into .claude/", () => {
    expect(shipCopies).toContain(AGENT_COPY);
    expect(shipCopies).toContain(EDITED_COPY);
    expect(shipCopies).toContain(COMMAND_COPY);
    expect(frontendCopies.length).toBeGreaterThan(0);
  });

  it(
    "deletes every .claude/ copy of the pack with proof hash, drops its rows, and moves no row of the corpus",
    async () => {
      const root = await copyOf(shipSynced);
      const before = await readLedgerOnDisk(root);

      const doc = await cleanJson(root);

      for (const copy of shipCopies) {
        expect(entryAt(doc, copy), copy).toMatchObject({ action: "deleted", proof: "hash" });
        expect(existsSync(join(root, copy)), copy).toBe(false);
      }
      const after = await readLedgerOnDisk(root);
      for (const copy of shipCopies) expect(after.map((row) => row.path), copy).not.toContain(copy);
      expect(rowsOwnedBy(after, `pack:${SHIP_ID}`)).toEqual([]);
      // Every other row is byte-unchanged: the corpus's own content did not move.
      const untouched = (rows: readonly Row[]): Row[] =>
        rows.filter((row) => row.adapter !== `pack:${SHIP_ID}` && !shipCopies.includes(row.path));
      expect(after).toEqual(untouched(before));
      expect(doc["removedRows"]).toBe(before.length - after.length);
    },
    60_000,
  );

  it(
    "keeps a copy its owner edited, names it, and still drops its row",
    async () => {
      const root = await copyOf(shipSynced);
      const edited = `${await readFile(join(root, EDITED_COPY), "utf-8")}\nOur own step.\n`;
      await writeFile(join(root, EDITED_COPY), edited, "utf-8");

      const result = await runClean(root, ["--pack", SHIP_ID, "-y"]);

      expect(result.code, result.stderr).toBe(0);
      expect(await readFile(join(root, EDITED_COPY), "utf-8")).toBe(edited);
      expect(result.stdout).toContain(`skipped-user-content  ${EDITED_COPY}`);
      expect((await readLedgerOnDisk(root)).map((row) => row.path)).not.toContain(EDITED_COPY);
      // The unedited copies still leave.
      expect(existsSync(join(root, AGENT_COPY))).toBe(false);
    },
    60_000,
  );

  it(
    "refuses, keeping an owner's own file at a copy's name under a forged claude row hashing it",
    async () => {
      const root = await copyOf(shipSynced);
      const ownerBytes = "---\nname: st-acme-pipeline\ndescription: our own pipeline notes\n---\n\nOurs.\n";
      await writeFile(join(root, EDITED_COPY), ownerBytes, "utf-8");
      const manifestFile = join(root, STATE_DIR, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf-8")) as SetupManifest;
      for (const row of manifest.ledger) if (row.path === EDITED_COPY) row.contentHash = sha256(ownerBytes);
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
      const manifestBefore = await readFile(manifestFile, "utf-8");

      // TEST CHANGE, justified (2026-10-08, review/128, the maintainer's sign-off on
      // the whole-branch review's W-1): the run exited 0 and reported the file
      // `skipped-user-content`. The path is one the running engine writes for this
      // setup and the bytes hash to the recorded hash, so `clean --pack` now
      // refuses before touching anything, with CLEAN_ERROR naming the path. The
      // owner's file stays, as before, and so does every row.
      const result = await runClean(root, ["--pack", SHIP_ID, "--json", "-y"]);

      expect(result.code).toBe(1);
      const error = parseSingleDoc(result.stdout)["error"] as { code: string; message: string; why: string };
      expect(error.code).toBe("CLEAN_ERROR");
      expect(error.message).toContain(EDITED_COPY);
      expect(error.why).toContain("if one of them is yours");
      expect(await readFile(join(root, EDITED_COPY), "utf-8")).toBe(ownerBytes);
      expect(await readFile(manifestFile, "utf-8")).toBe(manifestBefore);
    },
    60_000,
  );

  // Run 2026-10-11_release-1-14-0, rows build/18, fix/1 and review/10 (one
  // defect). A pack file edited after install renders other bytes at its client
  // copy, so the copy, which still hashes to the ledger, is one a `sync`
  // rewrites, and the refusal's next step said to `sync` first: the step
  // `check`'s pack-integrity row forbids, since that `sync` carries the edited
  // bytes into the client's files. The step now names the exception, in both
  // forms of the command, and what it says is held here too: with the file out
  // of the pack's directory the same commands run, with no `sync` in between.
  it(
    "refuses over the copy of an edited pack file, and its next step keeps that pack away from sync",
    async () => {
      const root = await copyOf(shipSynced);
      const packAgent = `${STATE_DIR}/packs/${SHIP_ID}/${SHIP_AGENT_REL}`;
      const agentCopy = AGENT_COPY;
      const copyBefore = await readFile(join(root, agentCopy), "utf-8");
      const edited = `${await readFile(join(root, packAgent), "utf-8")}\nA line added after install.\n`;
      await writeFile(join(root, packAgent), edited, "utf-8");

      const forms = [
        { argv: ["--pack", SHIP_ID, "--json", "-y"], rerun: `clean --pack ${SHIP_ID}` },
        { argv: ["--json", "--dry-run"], rerun: "clean -y" },
      ];
      for (const { argv, rerun } of forms) {
        const refused = await runClean(root, argv);

        expect(refused.code, rerun).toBe(1);
        const error = parseSingleDoc(refused.stdout)["error"] as { code: string; message: string; next: string };
        expect(error.code, rerun).toBe("CLEAN_ERROR");
        expect(error.message, rerun).toContain(`1 file(s) the ledger records as unedited`);
        expect(error.message, rerun).toContain(agentCopy);
        // The step it always gave, word for word.
        expect(error.next, rerun).toContain(
          `run ${npxCommand("sync")} with this version first, then ${npxCommand(rerun)}`,
        );
        // The exception, in the same step.
        expect(error.next, rerun).toContain(
          `unless the pack-integrity row of ${npxCommand("check")} names an edited pack file`,
        );
        expect(error.next, rerun).toContain("then do not run sync");
        expect(error.next, rerun).toContain(
          `move that file out of the pack's directory first, as that row says, and run ${npxCommand(rerun)} again`,
        );
      }
      // Refused twice, and the edit reached no client file.
      expect(await readFile(join(root, agentCopy), "utf-8")).toBe(copyBefore);

      await rename(join(root, packAgent), join(root, "stamity-acme-deployer.edited.md"));

      const fullPreview = await runClean(root, ["--dry-run"]);
      expect(fullPreview.code, fullPreview.stderr).toBe(0);
      const scoped = await runClean(root, ["--pack", SHIP_ID, "-y"]);
      expect(scoped.code, scoped.stderr).toBe(0);
      // The moved file's own copy is kept and named; it never held the edit.
      expect(scoped.stdout).toContain(`skipped-user-content  ${agentCopy}`);
      expect(await readFile(join(root, agentCopy), "utf-8")).toBe(copyBefore);
      expect(existsSync(join(root, STATE_DIR, "packs", SHIP_ID))).toBe(false);
      expect(rowsOwnedBy(await readLedgerOnDisk(root), `pack:${SHIP_ID}`)).toEqual([]);
      // The copies of the pack's unedited files left with it.
      expect(existsSync(join(root, EDITED_COPY))).toBe(false);
    },
    90_000,
  );

  it(
    "lists each copy as dry-run, counts it, and writes nothing",
    async () => {
      const root = await copyOf(shipSynced);
      const before = await snapshot(root);

      const result = await runClean(root, ["--pack", SHIP_ID, "--dry-run"]);

      expect(result.code, result.stderr).toBe(0);
      for (const copy of shipCopies) expect(result.stdout).toContain(`dry-run  ${copy}`);
      expect(result.stdout).toContain(`the rows of its ${shipCopies.length} client copy(ies)`);
      expect(await snapshot(root)).toEqual(before);
    },
    60_000,
  );

  it(
    "leaves no empty class folder after the class's only file was moved out of the pack by hand (build/5)",
    async () => {
      const root = await copyOf(shipSynced);
      const packDir = join(root, STATE_DIR, "packs", SHIP_ID);
      await rename(join(packDir, ...SHIP_COMMAND_REL.split("/")), join(root, "st-acme-ship.moved.md"));
      expect(await readdir(join(packDir, "commands"))).toEqual([]);

      const result = await runClean(root, ["--pack", SHIP_ID, "-y"]);

      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(`skipped-missing  ${STATE_DIR}/packs/${SHIP_ID}/${SHIP_COMMAND_REL}`);
      expect(existsSync(join(packDir, "commands"))).toBe(false);
      expect(existsSync(packDir)).toBe(false);
      expect(await readFile(join(root, "st-acme-ship.moved.md"), "utf-8")).toBe(SHIP_FILES[SHIP_COMMAND_REL]);
    },
    60_000,
  );

  it(
    "leaves another installed pack's copies and rows untouched",
    async () => {
      const root = await copyOf(twoPacksSynced);
      const before = await readLedgerOnDisk(root);

      const doc = await cleanJson(root);

      const after = await readLedgerOnDisk(root);
      for (const copy of frontendCopies) {
        expect(entryAt(doc, copy), copy).toBeUndefined();
        expect(existsSync(join(root, copy)), copy).toBe(true);
      }
      const frontendRows = (rows: readonly Row[]): Row[] =>
        rows.filter((row) => row.adapter === "pack:frontend" || frontendCopies.includes(row.path));
      expect(frontendRows(after)).toEqual(frontendRows(before));
      for (const copy of shipCopies) expect(existsSync(join(root, copy)), copy).toBe(false);
    },
    60_000,
  );

  it(
    "finds the copies of a pack the org policy denies, and removes them",
    async () => {
      const root = await copyOf(shipSynced);
      await writeFile(
        join(root, ORG_POLICY_REL_PATH),
        `${JSON.stringify({ version: 1, packs: { deny: ["*"] } }, null, 2)}\n`,
        "utf-8",
      );

      const doc = await cleanJson(root);

      for (const copy of shipCopies) {
        expect(entryAt(doc, copy), copy).toMatchObject({ action: "deleted", proof: "hash" });
        expect(existsSync(join(root, copy)), copy).toBe(false);
      }
    },
    60_000,
  );

  it(
    "ends on the pinned sync that regenerates the clients' files without the pack",
    async () => {
      const root = await copyOf(shipSynced);

      const result = await runClean(root, ["--pack", SHIP_ID, "-y"]);

      expect(result.stdout).toContain(`regenerate the clients' files without the pack: ${npxCommand("sync")}`);
    },
    60_000,
  );

  // build/43 under review/61 (signed off: unproven is not disproven): a pack
  // the planner refuses cannot prove any of its copies, so each is kept and
  // keeps its ledger row for the next sync, and the copy set is bounded to the
  // pack's own artifacts (review/68, review/70) — a retired engine file at an
  // engine name, which the pack-less plan does not render either, and an
  // owner's file under a forged row, even one naming a pack artifact, are not
  // the pack's and are left alone: neither named a copy nor disowned.
  it(
    "keeps an unplannable pack's copies with their rows, and takes nothing that is not the pack's",
    async () => {
      const root = await copyOf(shipSynced);
      // A command under the name of the pack's own skill: the planner refuses
      // the pack, as it refuses 1.11.0's ops.
      const clashRel = "commands/st-acme-pipeline.md";
      const clashBytes = "---\ndescription: Run the CI pipeline.\n---\n\nRun the pipeline.\n";
      const retired = ".claude/agents/stamity-retired.md";
      const retiredBytes = "---\nname: stamity-retired\ndescription: an agent an earlier release shipped\n---\n\nRetired.\n";
      const owned = ".claude/skills/st-local/SKILL.md";
      const ownedBytes = "---\nname: st-local\ndescription: the owner's own skill\n---\n\nOurs.\n";
      const ownedToo = ".claude/agents/stamity-ours.md";
      const ownedTooBytes = "---\nname: stamity-ours\ndescription: the owner's own agent\n---\n\nOurs.\n";
      await writeFile(join(root, STATE_DIR, "packs", SHIP_ID, ...clashRel.split("/")), clashBytes, "utf-8");
      await writeFile(join(root, retired), retiredBytes, "utf-8");
      await mkdir(join(root, ".claude", "skills", "st-local"), { recursive: true });
      await writeFile(join(root, owned), ownedBytes, "utf-8");
      await writeFile(join(root, ownedToo), ownedTooBytes, "utf-8");
      const manifestFile = join(root, STATE_DIR, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf-8")) as SetupManifest;
      manifest.ledger.push(
        {
          path: `${STATE_DIR}/packs/${SHIP_ID}/${clashRel}`,
          adapter: `pack:${SHIP_ID}`,
          artifactId: `${SHIP_ID}/${clashRel}`,
          artifactType: "infra",
          contentHash: sha256(clashBytes),
        },
        { path: retired, adapter: "claude", artifactId: "retired", artifactType: "agent", contentHash: sha256(retiredBytes) },
        // Forged: an owner's skill under its own name, and an owner's agent under a row naming the pack's agent.
        { path: owned, adapter: "claude", artifactId: "local", artifactType: "skill", contentHash: sha256(ownedBytes) },
        { path: ownedToo, adapter: "claude", artifactId: "acme-deployer", artifactType: "agent", contentHash: sha256(ownedTooBytes) },
      );
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

      const result = await runClean(root, ["--pack", SHIP_ID, "-y"]);

      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).toContain(`Pack "${SHIP_ID}" could not be planned as installed`);
      const after = await readLedgerOnDisk(root);
      expect(rowsOwnedBy(after, `pack:${SHIP_ID}`)).toEqual([]);
      for (const copy of shipCopies) {
        expect(existsSync(join(root, copy)), copy).toBe(true);
        expect(after.some((row) => row.path === copy && row.adapter === "claude"), `the row of ${copy} stays`).toBe(true);
      }
      expect(result.stdout).toContain("could not be built");
      // Not the pack's: never a candidate, so neither swept, named, nor disowned.
      for (const [path, bytes] of [
        [retired, retiredBytes],
        [owned, ownedBytes],
        [ownedToo, ownedTooBytes],
      ] as const) {
        expect(await readFile(join(root, path), "utf-8"), path).toBe(bytes);
        expect(after.some((row) => row.path === path), `the row of ${path} stays`).toBe(true);
        expect(result.stdout, path).not.toContain(path);
      }
      // Every kept copy is named with the step by hand, hedged for the owner's own file.
      expect(result.stdout).toContain("delete by hand each client copy kept above, unless it is yours");
    },
    60_000,
  );

  // The security lens on review/61's fix: with the pack unplannable, only a copy whose bytes
  // were never judged keeps its row. A copy the sweep did judge, as one its owner edited, loses
  // it, and the run's sentence says which keep theirs rather than that every copy does.
  it(
    "says which of an unplannable pack's copies keep their rows: an edited copy loses its row",
    async () => {
      const root = await copyOf(shipSynced);
      const clashRel = "commands/st-acme-pipeline.md";
      const clashBytes = "---\ndescription: Run the CI pipeline.\n---\n\nRun the pipeline.\n";
      await writeFile(join(root, STATE_DIR, "packs", SHIP_ID, ...clashRel.split("/")), clashBytes, "utf-8");
      const manifestFile = join(root, STATE_DIR, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf-8")) as SetupManifest;
      manifest.ledger.push({
        path: `${STATE_DIR}/packs/${SHIP_ID}/${clashRel}`,
        adapter: `pack:${SHIP_ID}`,
        artifactId: `${SHIP_ID}/${clashRel}`,
        artifactType: "infra",
        contentHash: sha256(clashBytes),
      });
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
      const edited = `${await readFile(join(root, EDITED_COPY), "utf-8")}\nOur own step.\n`;
      await writeFile(join(root, EDITED_COPY), edited, "utf-8");

      const result = await runClean(root, ["--pack", SHIP_ID, "-y"]);

      expect(result.code, result.stderr).toBe(0);
      const after = await readLedgerOnDisk(root);
      expect(await readFile(join(root, EDITED_COPY), "utf-8")).toBe(edited);
      expect(after.map((row) => row.path)).not.toContain(EDITED_COPY);
      for (const copy of shipCopies.filter((path) => path !== EDITED_COPY)) {
        expect(after.some((row) => row.path === copy && row.adapter === "claude"), `the row of ${copy} stays`).toBe(true);
      }
      expect(result.stdout).not.toContain("each is kept with its ledger row");
      expect(result.stdout).toContain(
        `${shipCopies.length - 1} of them, unedited since their recorded hash, keep their ledger rows`,
      );
      expect(result.stdout).toContain("a copy you edited, or one whose row records no content hash, loses its row");
    },
    60_000,
  );

  // review/74: an overlay patching the pack's own agent applies while the pack is installed,
  // so the plan with the pack builds; with the pack's rows removed its slug names no artifact
  // in any layer and is refused, so the plan without the pack throws. No copy can be told
  // from a shared path then: none is taken, each copy and its row stay, and the run says so.
  it(
    "takes no copy when the setup cannot be planned without the pack, keeps their rows, and says why",
    async () => {
      const root = await copyOf(shipSynced);
      await mkdir(join(root, STATE_DIR, "overrides", "agents"), { recursive: true });
      await writeFile(join(root, STATE_DIR, "overrides", "agents", "acme-deployer.customize.md"), "Our own closing step.\n", "utf-8");
      const before = await readLedgerOnDisk(root);
      const copyBytes = Object.fromEntries(
        await Promise.all(shipCopies.map(async (copy) => [copy, await readFile(join(root, copy), "utf-8")] as const)),
      );

      const result = await runClean(root, ["--pack", SHIP_ID, "-y"]);

      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain(`The setup could not be planned without pack "${SHIP_ID}" (`);
      expect(result.stdout).toContain("so its client copies were not looked for: their rows stay.");
      expect(result.stdout).not.toContain("delete by hand each client copy kept above");
      const after = await readLedgerOnDisk(root);
      expect(rowsOwnedBy(after, `pack:${SHIP_ID}`)).toEqual([]);
      for (const copy of shipCopies) {
        expect(await readFile(join(root, copy), "utf-8"), copy).toBe(copyBytes[copy]);
        expect(after.find((row) => row.path === copy), `the row of ${copy} stays`).toEqual(
          before.find((row) => row.path === copy),
        );
        expect(result.stdout, copy).not.toContain(copy);
      }
    },
    60_000,
  );
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

/**
 * TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): `clean`
 * printed each recorded client's vendor uninstall command and carried them as
 * `pluginUninstall` in `--json`. 1.15.0 deleted the plugin route and removed that
 * key outright; the lines became the leftover-plugin warning `check` and `sync`
 * printed, which `clean` printed before it deleted the held block.
 *
 * TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-014,
 * REQ-PLUGIN-016): the warning left with the held block. A manifest still
 * carrying the 1.14 block loads with no refusal, and neither it nor Claude's
 * `enabledPlugins` makes `clean` print a leftover-plugin line, preview included.
 * What stays: the block changes nothing `clean` removes, and `--json` carries no
 * plugin key.
 */
describe("a 1.14 plugin block under clean", () => {
  /** The initialised fixture, with a 1.14 plugin block recorded for two of the four clients. */
  async function seedWithPlugin(temp: TempDirHandle): Promise<string> {
    const root = await seedInitialisedRepo(temp);
    // Raw JSON, as a 1.14 setup left it on disk: the writer and the type hold no `plugin` key.
    const manifest = {
      ...manifestFixture(ledgerFixture()),
      plugin: {
        mode: "plugin-backed",
        clients: {
          codex: { version: "1.9.0", classes: ["agent"] },
          claude: { version: "1.9.0", classes: ["agent", "skill", "command", "hooks"] },
        },
      },
    };
    await temp.seedFiles({
      [`repo/${STATE_DIR}/manifest.json`]: `${JSON.stringify(manifest, null, 2)}\n`,
    });
    return root;
  }

  const LEFTOVER = "a plugin install from before 1.15.0";

  it("cleans a repository whose manifest carries the block, printing no leftover-plugin line and no pluginUninstall key", async () => {
    const root = await seedWithPlugin(tempDir());

    const result = await runClean(root, ["-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain(LEFTOVER);
    expect(result.stdout).not.toContain("plugin uninstall");
    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; the manifest carrying the
    // block goes, and the fixture's learning keeps .stamity/.
    expect(existsSync(join(root, STATE_DIR, "manifest.json"))).toBe(false);
    expect(existsSync(join(root, LEARNING_FILE))).toBe(true);

    const preview = await runClean(await seedWithPlugin(tempDir()), ["--dry-run"]);
    expect(preview.code).toBe(0);
    expect(preview.stdout).not.toContain(LEFTOVER);
    expect(preview.stdout).not.toContain("plugin uninstall");

    const again = await seedWithPlugin(tempDir());
    const doc = parseSingleDoc((await runClean(again, ["-y", "--json"])).stdout);
    expect(doc).not.toHaveProperty("pluginUninstall");
    expect(doc["removed"]).toEqual(expect.any(Number));
  });

  it("removes nothing outside the ledger, plugin record or not", async () => {
    const withPlugin = await seedWithPlugin(tempDir());
    await runClean(withPlugin, ["-y"]);
    const after = await snapshot(withPlugin);

    // The control: the same repository with no plugin field at all. The sweep's
    // result is identical, which is the whole claim — the record changes nothing
    // about what is removed.
    const control = await seedInitialisedRepo(tempDir());
    await runClean(control, ["-y"]);

    expect(after).toEqual(await snapshot(control));
    expect(Object.keys(after)).toContain("README.md");
  });

  it("prints no leftover-plugin line for a plugin Claude's settings record", async () => {
    const temp = tempDir();
    const root = await seedInitialisedRepo(temp);
    await temp.seedFiles({
      "repo/.claude/settings.json": `${JSON.stringify({ enabledPlugins: { "stamity@acme-market": true } }, null, 2)}\n`,
    });

    const result = await runClean(root, ["-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain(LEFTOVER);
    expect(result.stdout).not.toContain("plugin uninstall");
    // TEST CHANGE, justified: REQ-FLOW-028 — clean keeps user state unless --purge; the manifest carrying the
    // block goes, and the fixture's learning keeps .stamity/.
    expect(existsSync(join(root, STATE_DIR, "manifest.json"))).toBe(false);
    expect(existsSync(join(root, LEARNING_FILE))).toBe(true);
  });
});

/**
 * review/114: the account's model lists live in the git-ignored cache, not in the manifest
 * `clean` reads, so a Codex pick a list moved off the shipped entry 0 has to be rendered with
 * the lists the emitted files carry, or no rendering proves the agent files and every `clean`
 * refuses them as stale, while the `sync` it names writes the same bytes again.
 */
describe("clean — a setup whose model list moved a Codex pick", () => {
  /** An account's Codex list lacking the shipped entry 0 of frontier, advanced and economy. */
  const OTHER_CODEX = { codex: { ids: ["gpt-5.6-terra", "gpt-6-sol", "gpt-5.6-luna"], source: "codex-debug-models" as const } };
  const REVIEWER = ".codex/agents/stamity-reviewer.toml";
  // TEST CHANGE, justified (2026-10-21, plan 018-packs-rebuilt-02, unit u2-refixture-cli-tests,
  // REQ-PACK-023): the pack agent was `ops`'s incident responder, from the catalog; `ops` retires in
  // this package, so it is the made-up pack's `advanced` agent (SHIP_FILES above), added from a path.
  const RESPONDER = ".codex/agents/stamity-acme-deployer.toml";

  async function run(cwd: string, argv: readonly string[]): Promise<void> {
    const result = await runInProcess(COMMANDS, argv, { cwd });
    expect(result.code, `${argv.join(" ")}: ${result.stdout}\n${result.stderr}`).toBe(0);
  }

  /** `init -y --tools claude,codex`, `add <the made-up pack> --allow-untrusted -y` with `pack`, then a sync whose Codex list moves the advanced pick. */
  async function listMoved(pack: boolean): Promise<string> {
    const root = tempDir().path("repo");
    await mkdir(root, { recursive: true });
    await seedGitRepo(root);
    await run(root, ["init", "-y", "--tools", "claude,codex"]);
    if (pack) await run(root, await shipPackArgs(tempDir().path("packs")));
    const engineVersion = createApp().version;
    const plan = await planSync(root, engineVersion, { listedOverlay: structuredClone(OTHER_CODEX) });
    await applySync(root, plan, { engineVersion, force: false, dryRun: false, now: new Date() });
    // The list moved the pick: with no list the advanced class runs on the shipped gpt-6-astra.
    expect(await readFile(join(root, REVIEWER), "utf-8")).toMatch(/^model = "gpt-6-sol"$/m);
    return root;
  }

  it("cleans with -y, deleting the agent files the list moved", async () => {
    const root = await listMoved(false);

    const result = await runClean(root, ["-y"]);

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(join(root, REVIEWER))).toBe(false);
    expect(existsSync(join(root, STATE_DIR))).toBe(false);
  }, 60_000);

  it("removes a pack with --pack, deleting its Codex copy the list moved", async () => {
    const root = await listMoved(true);
    expect(await readFile(join(root, RESPONDER), "utf-8")).toMatch(/^model = "gpt-6-sol"$/m);

    const result = await runClean(root, ["--pack", SHIP_ID, "-y"]);

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(join(root, RESPONDER))).toBe(false);
    expect(existsSync(join(root, REVIEWER))).toBe(true);
  }, 60_000);
});

/**
 * REQ-FLOW-027, the restore of a `replace` import: `clean` moves the recorded
 * `.bak` back only when it is the decision's own backup name, nothing is at the
 * target after the sweep, and its bytes still hash to the record. The record is
 * repository data, so each check is driven with a record a person could forge.
 */
describe("clean — the backup a replace import recorded", () => {
  const OWNER = "# Team\n\nour own instructions\n";

  async function replacedRepo(): Promise<string> {
    const root = tempDir().path("repo");
    await mkdir(root, { recursive: true });
    await seedGitRepo(root);
    await writeFile(join(root, "AGENTS.md"), OWNER, "utf-8");
    const init = await runInProcess(COMMANDS, ["init", "-y", "--tools", "claude", "--import-config", "replace"], { cwd: root });
    expect(init.code, init.stderr).toBe(0);
    expect(await readFile(join(root, "AGENTS.md.bak"), "utf-8")).toBe(OWNER);
    return root;
  }

  async function forgeBackup(root: string, backup: { path: string; sha256: string }): Promise<void> {
    const path = join(root, STATE_DIR, "manifest.json");
    const manifest = JSON.parse(await readFile(path, "utf-8")) as SetupManifest;
    const decision = (manifest.importChoice ?? []).find((row) => row.path === "AGENTS.md");
    if (decision === undefined) throw new Error("init recorded no decision for AGENTS.md");
    Object.assign(decision, { backup });
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  }

  it("moves nothing on a forged record naming another file of the tree, even with its true hash", async () => {
    const root = await replacedRepo();
    await mkdir(join(root, "notes"), { recursive: true });
    await writeFile(join(root, "notes/a.md"), "a note\n", "utf-8");
    await forgeBackup(root, { path: "notes/a.md", sha256: sha256("a note\n") });
    const engineCharter = await readFile(join(root, "AGENTS.md"), "utf-8");

    const result = await runClean(root, ["-y"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("importChoice[0].backup.path");
    expect(await readFile(join(root, "notes/a.md"), "utf-8")).toBe("a note\n");
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toBe(engineCharter);
    expect(await readFile(join(root, "AGENTS.md.bak"), "utf-8")).toBe(OWNER);
  }, 60_000);

  it("leaves an edited .bak in place, and the reason names the hash it found", async () => {
    const root = await replacedRepo();
    await writeFile(join(root, "AGENTS.md.bak"), `${OWNER}edited\n`, "utf-8");

    const doc = parseSingleDoc((await runClean(root, ["-y", "--json"])).stdout);

    expect(doc["restored"]).toEqual([]);
    const skipped = doc["restoreSkipped"] as { path: string; backup: string; reason: string }[];
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ path: "AGENTS.md", backup: "AGENTS.md.bak" });
    expect(skipped[0]?.reason).toContain(sha256(`${OWNER}edited\n`));
    expect(await readFile(join(root, "AGENTS.md.bak"), "utf-8")).toBe(`${OWNER}edited\n`);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  }, 60_000);

  it("never renames onto a target the sweep left, and names why", async () => {
    const root = await replacedRepo();
    // The owner edited the engine's charter: the sweep keeps it, so it is still at the path.
    const edited = `${await readFile(join(root, "AGENTS.md"), "utf-8")}\nmy line\n`;
    await writeFile(join(root, "AGENTS.md"), edited, "utf-8");

    const doc = parseSingleDoc((await runClean(root, ["-y", "--json"])).stdout);

    expect(doc["restored"]).toEqual([]);
    expect((doc["restoreSkipped"] as { reason: string }[])[0]?.reason).toContain("AGENTS.md is there");
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toBe(edited);
    expect(await readFile(join(root, "AGENTS.md.bak"), "utf-8")).toBe(OWNER);
  }, 60_000);

  it("never replaces a file that appears at the target between the checks and the move", async () => {
    // The move itself is what has to refuse: a file created at the target after
    // the checks is, at the moment of the move, simply a file that is there.
    const temp = tempDir();
    await temp.seedFiles({ "AGENTS.md.bak": OWNER, "AGENTS.md": "appeared after the checks\n" });

    const reason = await moveWithoutClobber(temp.path("AGENTS.md.bak"), temp.path("AGENTS.md"));

    expect(reason).toContain("appeared at the target");
    expect(await readFile(temp.path("AGENTS.md"), "utf-8")).toBe("appeared after the checks\n");
    expect(await readFile(temp.path("AGENTS.md.bak"), "utf-8")).toBe(OWNER);
    // With nothing there the same move goes through, and the old name is gone.
    await rm(temp.path("AGENTS.md"));
    expect(await moveWithoutClobber(temp.path("AGENTS.md.bak"), temp.path("AGENTS.md"))).toBeNull();
    expect(await readFile(temp.path("AGENTS.md"), "utf-8")).toBe(OWNER);
    expect(existsSync(temp.path("AGENTS.md.bak"))).toBe(false);
  });

  it("moves the backup back and says so", async () => {
    const root = await replacedRepo();

    const result = await runClean(root, ["-y"]);

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("Restored AGENTS.md from AGENTS.md.bak");
    expect(await readFile(join(root, "AGENTS.md"), "utf-8")).toBe(OWNER);
    expect(existsSync(join(root, "AGENTS.md.bak"))).toBe(false);
  }, 60_000);

  /** The one recorded backup a full clean left, and the reason it gives. */
  async function skippedReason(root: string): Promise<string | undefined> {
    const doc = parseSingleDoc((await runClean(root, ["-y", "--json"])).stdout);
    expect(doc["restored"]).toEqual([]);
    return (doc["restoreSkipped"] as { reason: string }[])[0]?.reason;
  }

  it.skipIf(process.platform === "win32")("never moves a backup that is a symbolic link, even to the owner's own bytes", async () => {
    const root = await replacedRepo();
    await mkdir(join(root, "notes"), { recursive: true });
    await writeFile(join(root, "notes/owner.md"), OWNER, "utf-8");
    await rm(join(root, "AGENTS.md.bak"));
    await symlink(join("notes", "owner.md"), join(root, "AGENTS.md.bak"));

    expect(await skippedReason(root)).toContain("is a symbolic link");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(await readFile(join(root, "notes/owner.md"), "utf-8")).toBe(OWNER);
  }, 60_000);

  it("never moves a backup that is not a regular file", async () => {
    const root = await replacedRepo();
    await rm(join(root, "AGENTS.md.bak"));
    await mkdir(join(root, "AGENTS.md.bak"));

    expect(await skippedReason(root)).toContain("is not a regular file");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  }, 60_000);

  it("never moves a backup that has a second name", async () => {
    const root = await replacedRepo();
    await mkdir(join(root, "notes"), { recursive: true });
    await link(join(root, "AGENTS.md.bak"), join(root, "notes/second.md"));

    expect(await skippedReason(root)).toContain("is a hard link");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(await readFile(join(root, "AGENTS.md.bak"), "utf-8")).toBe(OWNER);
  }, 60_000);

  it("copies the backup back, never over a file, on a file system that keeps no hard links", async () => {
    const temp = tempDir();
    await temp.seedFiles({ "AGENTS.md.bak": OWNER });
    const calls: string[] = [];
    const noHardLinks = (existing: string): Promise<void> => {
      calls.push(existing);
      return Promise.reject(Object.assign(new Error("operation not permitted, link"), { code: "EPERM" }));
    };

    expect(await moveWithoutClobber(temp.path("AGENTS.md.bak"), temp.path("AGENTS.md"), noHardLinks)).toBeNull();

    expect(calls).toEqual([temp.path("AGENTS.md.bak")]);
    expect(await readFile(temp.path("AGENTS.md"), "utf-8")).toBe(OWNER);
    expect(existsSync(temp.path("AGENTS.md.bak"))).toBe(false);
    // The copy refuses a file at the target as the link does.
    await writeFile(temp.path("AGENTS.md.bak"), OWNER, "utf-8");
    await writeFile(temp.path("AGENTS.md"), "appeared after the checks\n", "utf-8");
    expect(await moveWithoutClobber(temp.path("AGENTS.md.bak"), temp.path("AGENTS.md"), noHardLinks)).toContain("appeared at the target");
    expect(await readFile(temp.path("AGENTS.md"), "utf-8")).toBe("appeared after the checks\n");
    expect(await readFile(temp.path("AGENTS.md.bak"), "utf-8")).toBe(OWNER);
  });
});

/**
 * REQ-FLOW-027, the pack part (inbox `pass/1`): `clean --pack <id>` rewrites the
 * hooks documents from the setup without the pack in the same run, so no client
 * still runs the pack's hook until the next `sync`.
 */
describe("clean --pack — the hooks documents leave the pack's hooks behind", () => {
  const HOOK_PACK = "acme-hook";
  /** The script the pack's hook runs, inside the pack's own folder. */
  const HOOK_SCRIPT = `${STATE_DIR}/packs/${HOOK_PACK}/audit.mjs`;

  async function run(cwd: string, argv: readonly string[]): Promise<Awaited<ReturnType<typeof runInProcess>>> {
    const result = await runInProcess(COMMANDS, argv, { cwd });
    expect(result.code, `${argv.join(" ")}: ${result.stdout}\n${result.stderr}`).toBe(0);
    return result;
  }

  const DOCUMENTS = [".claude/settings.json", ".github/hooks/stamity.json"];

  /**
   * `init -y --tools claude,copilot`, then the pack added, with one hook unless
   * `hooks` is false, then `sync` unless `synced` is false. With a hook and the
   * sync, both hooks documents run the pack's script.
   */
  async function packedRepo(opts: { hooks?: boolean; synced?: boolean } = {}): Promise<string> {
    const temp = tempDir();
    const root = temp.path("repo");
    await mkdir(root, { recursive: true });
    await seedGitRepo(root);
    await run(root, ["init", "-y", "--tools", "claude,copilot"]);
    const packDir = await writeMadeUpPack(temp.path("packs"), HOOK_PACK, {
      "skills/st-acme-audit/SKILL.md": madeUpArtifact("acme-audit", "skill", "Audits the acme service."),
      ...(opts.hooks === false
        ? {}
        : {
            "hooks/hooks.json": `${JSON.stringify({ hooks: [{ event: "pre_tool_use", matcher: "Bash", command: ["node", HOOK_SCRIPT], timeoutMs: 3000 }] }, null, 2)}\n`,
          }),
    });
    // The owner's committed script, which the pack's hook names: a pack ships no script of its own.
    await mkdir(join(root, STATE_DIR, "packs", HOOK_PACK), { recursive: true });
    await writeFile(join(root, HOOK_SCRIPT), "process.exit(0)\n", "utf-8");
    await run(root, ["add", packDir, "--allow-untrusted", "-y"]);
    if (opts.synced !== false) await run(root, ["sync"]);
    return root;
  }

  const readDocuments = (root: string): Promise<string[]> => Promise.all(DOCUMENTS.map((doc) => readFile(join(root, doc), "utf-8")));

  /** The `permissions.ask` rows of `.claude/settings.json`. */
  async function askRows(root: string): Promise<unknown> {
    return (JSON.parse(await readFile(join(root, ".claude/settings.json"), "utf-8")) as { permissions?: { ask?: unknown } }).permissions?.ask;
  }

  it("leaves no entry in .claude/settings.json or .github/hooks/stamity.json that runs the pack's script, and check is green", async () => {
    const root = await packedRepo();
    const documents = DOCUMENTS;
    // The setup did wire the pack's hook in both: the removal below is not a no-op.
    for (const doc of documents) expect(await readFile(join(root, doc), "utf-8")).toContain(`packs/${HOOK_PACK}/`);

    // The preview names the documents the real run rewrites, and writes none of them.
    const before = await Promise.all(documents.map((doc) => readFile(join(root, doc), "utf-8")));
    const preview = await run(root, ["clean", "--pack", HOOK_PACK, "--dry-run"]);
    for (const doc of documents) expect(preview.stdout).toContain(doc);
    expect(preview.stdout).toContain("from the setup without the pack");
    expect(await Promise.all(documents.map((doc) => readFile(join(root, doc), "utf-8")))).toEqual(before);

    await run(root, ["clean", "--pack", HOOK_PACK, "-y"]);

    for (const doc of documents) expect(await readFile(join(root, doc), "utf-8")).not.toContain(`packs/${HOOK_PACK}/`);
    const check = await runInProcess(COMMANDS, ["check", "--json"], { cwd: root });
    expect(JSON.parse(check.stdout.trim()) as { ok: boolean }, check.stdout).toMatchObject({ ok: true });
  }, 120_000);

  it("rewrites nothing under a CLI other than the one that last wrote the setup, and says the documents wait for sync", async () => {
    const root = await packedRepo();
    const current = await readManifest(root);
    if (current === null) throw new Error("no manifest");
    await writeManifest(root, { ...current, generatedBy: "1.0.0" }, { now: new Date("2026-01-01T00:00:00Z") });
    const before = await readDocuments(root);

    const result = await run(root, ["clean", "--pack", HOOK_PACK, "-y"]);

    expect(await readDocuments(root)).toEqual(before);
    expect(result.stdout).toContain("version 1.0.0 last wrote this setup");
    expect(result.stdout).toContain("still run the pack's hooks until the next sync");
    expect(result.stdout).not.toContain("Rewrote ");
  }, 120_000);

  it("rewrites nothing for a pack that ships no hooks, and reports no document rewritten", async () => {
    const root = await packedRepo({ hooks: false });
    const before = await readDocuments(root);

    const result = await run(root, ["clean", "--pack", HOOK_PACK, "-y", "--json"]);

    expect(parseSingleDoc(result.stdout)["hookDocumentsRewritten"]).toEqual([]);
    expect(await readDocuments(root)).toEqual(before);
  }, 120_000);

  it("names no document as rewritten when the write changed none of its bytes", async () => {
    // Added but never synced: the documents do not run the pack's hook yet, so the rewrite changes nothing.
    const root = await packedRepo({ synced: false });
    for (const text of await readDocuments(root)) expect(text).not.toContain(`packs/${HOOK_PACK}/`);
    const before = await readDocuments(root);

    const result = await run(root, ["clean", "--pack", HOOK_PACK, "-y", "--json"]);

    expect(parseSingleDoc(result.stdout)["hookDocumentsRewritten"]).toEqual([]);
    expect(await readDocuments(root)).toEqual(before);
  }, 120_000);

  it("refuses the rewrite over a manifest whose autonomy was loosened, keeps every ask row, and says why", async () => {
    const root = await packedRepo();
    const tighten = await readManifest(root);
    if (tighten === null) throw new Error("no manifest");
    await writeManifest(root, { ...tighten, autonomy: { mode: "ask" } }, { now: new Date("2026-01-01T00:00:00Z") });
    await run(root, ["sync"]);
    const asked = await askRows(root);
    // Mode `ask` renders an ask row for each act mode `autonomous` runs unasked: the loosening below drops some.
    expect(Array.isArray(asked) && asked.length > 0).toBe(true);
    const loosen = await readManifest(root);
    if (loosen === null) throw new Error("no manifest");
    const { autonomy: _dropped, ...rest } = loosen;
    await writeManifest(root, rest, { now: new Date("2026-01-02T00:00:00Z") });
    const before = await readDocuments(root);

    const result = await run(root, ["clean", "--pack", HOOK_PACK, "-y"]);

    expect(await askRows(root)).toEqual(asked);
    expect(await readDocuments(root)).toEqual(before);
    expect(result.stdout).toContain("were not rewritten");
    expect(result.stdout).toContain("looser autonomy setting");
    expect(result.stdout).toContain("sync --loosen");
  }, 120_000);

  it("keeps the owner's entry in .claude/settings.json and backs up an edited .github/hooks/stamity.json, naming the backup", async () => {
    const root = await packedRepo();
    const settingsPath = join(root, ".claude/settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf-8")) as { permissions: { allow?: string[] } };
    settings.permissions.allow = [...(settings.permissions.allow ?? []), "Bash(make owner-task)"];
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
    const copilotPath = join(root, ".github/hooks/stamity.json");
    const edited = (await readFile(copilotPath, "utf-8")).replace(/\n$/, "\n\n");
    await writeFile(copilotPath, edited, "utf-8");
    // The sync above may have kept a backup of its own (an uncommitted file); only the one this run takes counts.
    const backupsOf = async (): Promise<string[]> =>
      (await readdir(join(root, ".github/hooks"))).filter((name) => name.startsWith("stamity.json.bak"));
    const earlier = new Set(await backupsOf());

    const result = await run(root, ["clean", "--pack", HOOK_PACK, "-y"]);

    const after = await readFile(settingsPath, "utf-8");
    expect(after).toContain("Bash(make owner-task)");
    expect(after).not.toContain(`packs/${HOOK_PACK}/`);
    expect(await readFile(copilotPath, "utf-8")).not.toContain(`packs/${HOOK_PACK}/`);
    const backups = (await backupsOf()).filter((name) => !earlier.has(name));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(root, ".github/hooks", backups[0] ?? ""), "utf-8")).toBe(edited);
    expect(result.stdout).toContain(backups[0]);
  }, 120_000);

  it("names the hooks documents it rewrites in the question it asks", async () => {
    const root = await packedRepo();
    const before = await readDocuments(root);

    const result = await runInProcess(COMMANDS, ["clean", "--pack", HOOK_PACK], { cwd: root, stdinLines: ["n"], tty: { stdout: true, stdin: true } });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(`and rewrite ${DOCUMENTS.join(", ")} without its hooks`);
    expect(await readDocuments(root)).toEqual(before);
  }, 120_000);

  it("prints the settings write's notice on an ask row equal to one the setting no longer renders", async () => {
    const root = await packedRepo();
    // An ask row mode `ask` renders and the default mode does not, added by the owner: kept, and named as maybe theirs.
    const unrendered = claudeAskRows([]).find((row) => !claudeAskRows(resolveAutonomy({}).runs).includes(row));
    if (unrendered === undefined) throw new Error("every ask row renders under the default setting");
    const settingsPath = join(root, ".claude/settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf-8")) as { permissions: { ask?: string[] } };
    settings.permissions.ask = [...(settings.permissions.ask ?? []), unrendered];
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");

    const result = await run(root, ["clean", "--pack", HOOK_PACK, "-y"]);

    expect(await readFile(settingsPath, "utf-8")).toContain(JSON.stringify(unrendered));
    expect(result.stdout).toContain(`Kept permissions.ask ${JSON.stringify(unrendered)}`);
  }, 120_000);
});

// ── REQ-FLOW-028: clean keeps user state unless --purge ─────────────────
//
// Real `init`, `add` and `sync` through the funnel: what stays is decided by the
// ledger `init` and `sync` write and by what the engine itself puts under
// `.stamity/`, which a hand-built fixture would only restate.
describe("clean keeps the user's state under .stamity/ (REQ-FLOW-028)", () => {
  /** One of each kind of user state, at the path a person or a flow writes it. */
  const USER_STATE: Readonly<Record<string, string>> = {
    [`${STATE_DIR}/learnings/2026-10-25-lesson.md`]: "a learning\n",
    [`${STATE_DIR}/handoffs/session.json`]: '{ "next": "finish" }\n',
    [`${STATE_DIR}/overrides/rules/team-style.md`]: madeUpArtifact("team-style", "rule", "The team's own style rule."),
    [`${STATE_DIR}/hooks/probe.mjs`]: "// the owner's own hook script\n",
    [`${STATE_DIR}/runs/2026-10-25_work/record.md`]: "# run record\n",
    [`${STATE_DIR}/inbox.md`]: "| id | row |\n|---|---|\n| 1 | a row |\n",
    [`${STATE_DIR}/verify/security-0123abc.json`]: '{ "axis": "security" }\n',
  };
  /** The review gate's state as a run leaves it: the counter, a held lock and an interrupted publish. */
  const GATE_STATE: Readonly<Record<string, string>> = {
    [`${STATE_DIR}/review-gate.json`]: '{ "rounds": 2 }\n',
    [`${STATE_DIR}/review-gate.json.lock/owner`]: "12345\n",
    [`${STATE_DIR}/review-gate.json.tmp-0123456789abcdef`]: '{ "rounds": 3 }\n',
  };

  let templates: TempDirHandle;
  /** `init -y --tools claude`, the made-up pack added, the user state written, then `sync`. */
  let withState: string;
  /** `init -y --tools claude` and nothing else. */
  let bare: string;

  async function run(cwd: string, argv: readonly string[]): Promise<void> {
    const result = await runInProcess(COMMANDS, argv, { cwd });
    expect(result.code, `${argv.join(" ")}: ${result.stdout}\n${result.stderr}`).toBe(0);
  }

  beforeAll(async () => {
    templates = await makeTempDir("stamity-clean-keeps");
    bare = templates.path("bare");
    await mkdir(bare, { recursive: true });
    await seedGitRepo(bare);
    await run(bare, ["init", "-y", "--tools", "claude"]);
    withState = templates.path("state");
    await cp(bare, withState, { recursive: true });
    await run(withState, await shipPackArgs(templates.path("packs")));
    for (const [path, body] of Object.entries(USER_STATE)) {
      await mkdir(join(withState, ...path.split("/").slice(0, -1)), { recursive: true });
      await writeFile(join(withState, ...path.split("/")), body, "utf-8");
    }
    await run(withState, ["sync"]);
  }, 180_000);

  afterAll(async () => {
    await templates.cleanup();
  });

  async function copyOf(template: string): Promise<string> {
    const root = tempDir().path("repo");
    await cp(template, root, { recursive: true });
    return root;
  }

  async function seedGateState(root: string): Promise<void> {
    for (const [path, body] of Object.entries(GATE_STATE)) {
      await mkdir(join(root, ...path.split("/").slice(0, -1)), { recursive: true });
      await writeFile(join(root, ...path.split("/")), body, "utf-8");
    }
  }

  /** Every file under the pack's folder, as `path -> content`. */
  async function packFiles(root: string): Promise<Record<string, string>> {
    return Object.fromEntries(
      Object.entries(await snapshot(root)).filter(([path]) => path.startsWith(`${STATE_DIR}/packs/`) && !path.endsWith("/")),
    );
  }

  it(
    "keeps each kind of user state and the installed pack byte for byte, and removes the setup's own files (red on the parent)",
    async () => {
      const root = await copyOf(withState);
      await seedGateState(root);
      const ledger = await readLedgerOnDisk(root);
      const copies = ledger.filter((row) => row.adapter === "claude" && row.path.includes("acme")).map((row) => row.path);
      expect(copies.length).toBeGreaterThan(0);
      expect(existsSync(join(root, STATE_DIR, "generated"))).toBe(true);
      const packBefore = await packFiles(root);
      expect(Object.keys(packBefore).length).toBeGreaterThan(Object.keys(SHIP_FILES).length);

      const result = await runClean(root, ["-y", "--json"]);

      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
      for (const [path, body] of Object.entries(USER_STATE)) expect(await readIfPresent(join(root, path)), path).toBe(body);
      expect(await packFiles(root)).toEqual(packBefore);
      for (const copy of copies) expect(existsSync(join(root, copy)), copy).toBe(false);
      expect(existsSync(join(root, STATE_DIR, "manifest.json"))).toBe(false);
      expect(existsSync(join(root, STATE_DIR, "generated"))).toBe(false);
      expect((await readdir(join(root, STATE_DIR))).filter((name) => name.startsWith("review-gate.json"))).toEqual([]);
      const doc = parseSingleDoc(result.stdout);
      expect(doc["kept"]).toEqual(["handoffs/", "hooks/", "inbox.md", "learnings/", "overrides/", "packs/", "runs/", "verify/"]);
      expect(doc["packsKept"]).toEqual([SHIP_ID]);
      expect(doc["purge"]).toBe(false);
      expect(doc["stateDirRemoved"]).toBe(false);
    },
    90_000,
  );

  it(
    "says what it kept and that the next init takes the pack back",
    async () => {
      const root = await copyOf(withState);

      const result = await runClean(root, ["-y"]);

      expect(result.code, result.stderr).toBe(0);
      // review/57: the manifest is gone now, so no later `clean --purge` can remove these; the line says what can.
      expect(result.stdout).toContain(
        `Kept under ${STATE_DIR}/: handoffs/, hooks/, inbox.md, learnings/, overrides/, packs/, runs/, verify/. ` +
          `To remove these too, delete ${STATE_DIR}/ yourself: the setup's record is gone, so no clean removes them now.`,
      );
      expect(result.stdout).not.toContain(`${npxCommand("clean --purge")} deletes these too`);
      expect(result.stdout).toContain(
        `The installed pack(s) ${SHIP_ID} stay under ${STATE_DIR}/packs/: the next ${npxCommand("init")} records them again from their receipts.`,
      );
      expect(result.stdout).not.toContain(`${STATE_DIR}/ removed`);
    },
    60_000,
  );

  it(
    "says on a clean --purge after a default clean that no record is left, and how to remove what stays (review/57)",
    async () => {
      const root = await copyOf(withState);
      expect((await runClean(root, ["-y"])).code).toBe(0);
      const before = await snapshot(root);

      const result = await runClean(root, ["-y", "--purge"]);

      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).toContain(
        `Nothing to clean — this repo has no ${STATE_DIR}/ manifest. ${npxCommand("clean --purge")} removes ${STATE_DIR}/ ` +
          `only by the setup's record, and there is none, so what is under ${STATE_DIR}/ stays: delete ${STATE_DIR}/ yourself to remove it.`,
      );
      expect(await snapshot(root)).toEqual(before);
      // Without --purge, or with no state directory, the bare line stays: there is nothing a purge would add.
      expect((await runClean(root, ["-y"])).stdout).not.toContain("delete .stamity/ yourself");
      await rm(join(root, STATE_DIR), { recursive: true });
      expect((await runClean(root, ["-y", "--purge"])).stdout).not.toContain("delete .stamity/ yourself");
    },
    60_000,
  );

  it.skipIf(process.platform === "win32")(
    "never removes a placeholder through a linked store folder, and leaves and names the link (review/60)",
    async () => {
      const root = await copyOf(bare);
      const scaffold = await readFile(join(root, STATE_DIR, "learnings", ".gitkeep"), "utf-8");
      // Another checkout's store, with its own tracked placeholder holding the scaffold's very bytes.
      const shared = tempDir().path("shared-learnings");
      await mkdir(shared, { recursive: true });
      await writeFile(join(shared, ".gitkeep"), scaffold, "utf-8");
      await rm(join(root, STATE_DIR, "learnings"), { recursive: true });
      await symlink(shared, join(root, STATE_DIR, "learnings"));

      const result = await runClean(root, ["-y"]);

      expect(result.code, result.stderr).toBe(0);
      expect(await readIfPresent(join(shared, ".gitkeep"))).toBe(scaffold);
      expect((await lstat(join(root, STATE_DIR, "learnings"))).isSymbolicLink()).toBe(true);
      expect(result.stdout).toContain(`Left ${STATE_DIR}/learnings/: it is a link, so clean did not follow it.`);
      expect(existsSync(join(root, STATE_DIR, "handoffs"))).toBe(false);
    },
    60_000,
  );

  it.skipIf(process.platform === "win32")(
    "names in --json each name it left, apart from kept, which lists only what is the owner's (review/59)",
    async () => {
      const root = await copyOf(withState);
      const outside = tempDir().path("models-elsewhere.json");
      await writeFile(outside, "{}\n", "utf-8");
      await symlink(outside, join(root, STATE_DIR, "client-models.json"));

      const result = await runClean(root, ["-y", "--json"]);

      expect(result.code, result.stderr).toBe(0);
      const doc = parseSingleDoc(result.stdout);
      expect(doc["left"]).toEqual([{ path: `${STATE_DIR}/client-models.json`, why: "it is a link, so clean did not follow it" }]);
      expect(doc["kept"]).toEqual(["handoffs/", "hooks/", "inbox.md", "learnings/", "overrides/", "packs/", "runs/", "verify/"]);
      expect((await lstat(join(root, STATE_DIR, "client-models.json"))).isSymbolicLink()).toBe(true);
    },
    60_000,
  );

  it(
    "lets a later init take the kept pack back with the hashes its install recorded, and check pass",
    async () => {
      const root = await copyOf(withState);
      const packRows = (ledger: readonly LedgerEntry[]): LedgerEntry[] =>
        ledger.filter((row) => row.adapter === `pack:${SHIP_ID}`).toSorted((a, b) => a.path.localeCompare(b.path));
      const recorded = packRows(await readLedgerOnDisk(root));
      expect(recorded.length).toBeGreaterThan(Object.keys(SHIP_FILES).length);

      expect((await runClean(root, ["-y"])).code).toBe(0);
      await run(root, ["init", "-y", "--tools", "claude"]);

      expect(packRows(await readLedgerOnDisk(root))).toEqual(recorded);
      const check = await runInProcess(COMMANDS, ["check", "--json"], { cwd: root });
      expect(check.code, check.stdout).toBe(0);
    },
    120_000,
  );

  it(
    "removes .stamity/ whole with --purge",
    async () => {
      const root = await copyOf(withState);

      const result = await runClean(root, ["-y", "--purge", "--json"]);

      expect(result.code, result.stderr).toBe(0);
      expect(existsSync(join(root, STATE_DIR))).toBe(false);
      const doc = parseSingleDoc(result.stdout);
      expect(doc["stateDirRemoved"]).toBe(true);
      expect(doc["purge"]).toBe(true);
      expect(doc["kept"]).toEqual([]);
      expect(doc["packsKept"]).toEqual([]);
    },
    60_000,
  );

  it(
    "removes .stamity/ on a setup that holds no user state, so a fresh init then clean leaves none",
    async () => {
      const root = await copyOf(bare);

      const result = await runClean(root, ["-y", "--json"]);

      expect(result.code, result.stderr).toBe(0);
      expect(parseSingleDoc(result.stdout)["stateDirRemoved"]).toBe(true);
      expect(existsSync(join(root, STATE_DIR))).toBe(false);
    },
    60_000,
  );

  it(
    "refuses --purge with --pack as a VALIDATION_ERROR and changes nothing",
    async () => {
      const root = await copyOf(withState);
      const before = await snapshot(root);

      const result = await runClean(root, ["-y", "--purge", "--pack", SHIP_ID, "--json"]);

      expect(result.code).toBe(1);
      const error = parseSingleDoc(result.stdout)["error"] as { code: string; message: string };
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toBe("--purge deletes the whole state directory and cannot be combined with --pack");
      expect(await snapshot(root)).toEqual(before);
    },
    60_000,
  );

  it(
    "keeps a placeholder the owner edited, and the store folder with it",
    async () => {
      const root = await copyOf(bare);
      const keep = join(root, STATE_DIR, "handoffs", ".gitkeep");
      await writeFile(keep, "# we commit handoffs on purpose\n", "utf-8");

      const result = await runClean(root, ["-y", "--json"]);

      expect(result.code, result.stderr).toBe(0);
      expect(await readIfPresent(keep)).toBe("# we commit handoffs on purpose\n");
      expect(existsSync(join(root, STATE_DIR, "learnings"))).toBe(false);
      expect(parseSingleDoc(result.stdout)["kept"]).toEqual(["handoffs/"]);
    },
    60_000,
  );

  it(
    "says in a dry run what a real run removes and keeps, and touches nothing",
    async () => {
      const root = await copyOf(withState);
      const before = await snapshot(root);

      const result = await runClean(root, ["--dry-run"]);

      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).toContain(
        `A real run also removes the setup's own files under ${STATE_DIR}/ (the manifest, the review gate's state and the ` +
          `machine-local files) and keeps the rest: learnings, handoffs, overrides, run records and installed packs. ` +
          `To delete those too, run ${npxCommand("clean --purge")} instead of this run.`,
      );
      expect(result.stdout).not.toContain("--purge deletes those too");
      expect(result.stdout).not.toContain("orphaned");
      expect(await snapshot(root)).toEqual(before);
    },
    60_000,
  );
});
