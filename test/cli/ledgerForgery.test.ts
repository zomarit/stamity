import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { addCommand } from "../../src/cli/commands/add.ts";
import { checkCommand } from "../../src/cli/commands/check.ts";
import { cleanCommand } from "../../src/cli/commands/clean.ts";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
import { syncCommand } from "../../src/cli/commands/sync.ts";
import { createApp } from "../../src/index.ts";
import type { Tool } from "../../src/types/core.ts";
import type { LedgerEntry } from "../../src/types/manifest.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * A hand edit of the committed `.stamity/manifest.json`, driven through the
 * shipped verbs over a real repository set up by the real corpus
 * (REQ-PLUGIN-045, REQ-PLUGIN-016's bound paragraph).
 *
 * The defect, measured on 1.11.0: `sync` and `clean` act on whatever the
 * ledger names. An `infra` row was trusted by type alone and a matching hash
 * proved a whole-file delete, a hashless row whose basename carried `st-` or
 * `stamity-` was deleted on its name, and a hash proved a delete anywhere under
 * `.stamity/`. So six hand-added rows made `sync -y` exit 0 after deleting five
 * owner files, and `check` reported them only as "5 queued for reclaim" with
 * `sync` as the remedy.
 *
 * Every assertion reads the tree back: "nothing changed" is a byte snapshot of
 * every file outside `.git/` — stricter than `git status --porcelain`, since it
 * also sees ignored files — taken before and after the verb.
 */

/* oxlint-disable no-await-in-loop */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-10-07T09:00:00.000Z");

const getTemp = useTempDir("ledger-forgery");

/** Owner files the forged rows point at; none of them is the engine's. */
const OWNER_FILES: Readonly<Record<string, string>> = {
  "docs/owner.md": "# Owner doc\n",
  "notes/st-owner.md": "# Owner notes\n",
  "src/stamity-x.ts": "export const owner = 1;\n",
  "packages/app/skills/st-foo/index.ts": "export const foo = 1;\n",
  "lib/30-stamity-y.js": "module.exports = 1;\n",
  ".github/workflows/ci.yml": "name: ci\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo owner ci\n",
  ".github/CODEOWNERS": "* @owner\n",
};

/** Owner files inside the state folder, written after `init` created it. */
const OWNER_STATE_FILES: Readonly<Record<string, string>> = {
  ".stamity/learnings/keep-me.md": "owner learning\n",
  ".stamity/overrides/x.md": "owner override\n",
};

function sha256(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

async function seed(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
}

/** A repository set up by the real corpus, the way `init -y --tools …` sets one up. */
async function initialisedRepo(tools: readonly Tool[] = ["claude", "cursor"]): Promise<string> {
  const root = getTemp().path("repo");
  await mkdir(root, { recursive: true });
  await seed(root, OWNER_FILES);
  const decisions = await buildInitDecisions(root, { tools: [...tools] }, { history: null, skipWorkspaceProbe: true });
  await applyInit({ rootDir: root, decisions, engineVersion: ENGINE_VERSION, dryRun: false, force: false, now: T0 });
  await seed(root, OWNER_STATE_FILES);
  return root;
}

/** Appends rows to the committed ledger, as a hand edit of the manifest does. */
async function forgeRows(root: string, rows: readonly LedgerEntry[]): Promise<void> {
  const path = join(root, ".stamity", "manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as { ledger: LedgerEntry[] };
  manifest.ledger.push(...rows);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/** An `infra` row recording the hash of the owner's own bytes at `path`. */
function hashedInfraRow(path: string, content: string, adapter: Tool = "claude"): LedgerEntry {
  return { path, adapter, artifactId: `forged:${path}`, artifactType: "infra", contentHash: sha256(content) };
}

/** Every file under `dir` outside `.git/`, as `posix/path` -> bytes. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const seen: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const abs = join(current, entry.name);
      const key = relative(dir, abs).split(sep).join("/");
      if (entry.isDirectory()) {
        seen[`${key}/`] = "";
        await walk(abs);
      } else {
        seen[key] = await readFile(abs, "utf8");
      }
    }
  };
  await walk(dir);
  return seen;
}

interface JsonDoc {
  ok?: boolean;
  error?: { code?: string; message?: string; why?: string };
  doctor?: { id: string; status: string; detail: string }[];
}

async function runJson(
  command: typeof syncCommand,
  root: string,
  argv: readonly string[],
): Promise<{ code: number; doc: JsonDoc }> {
  const result = await runInProcess([command], [...argv, "--json"], { cwd: root });
  return { code: result.code, doc: JSON.parse(result.stdout.trim()) as JsonDoc };
}

/** The text of a failing `--json` run, wherever the command put the cause. */
function failureText(doc: JsonDoc): string {
  return `${doc.error?.message ?? ""} ${doc.error?.why ?? ""}`;
}

describe("a committed ledger row outside the owned-path bound refuses the manifest", () => {
  it("check exits 1 and its manifest row names the row", async () => {
    const root = await initialisedRepo();
    await forgeRows(root, [hashedInfraRow("docs/owner.md", OWNER_FILES["docs/owner.md"] as string)]);

    const { code, doc } = await runJson(checkCommand, root, ["check"]);

    expect(code).toBe(1);
    const manifestRow = doc.doctor?.find((row) => row.id === "manifest");
    expect(manifestRow?.status).toBe("fail");
    expect(manifestRow?.detail).toMatch(/`ledger\[\d+\]\.path` "docs\/owner\.md" lies outside the paths a stamity release writes/);
  });

  it("sync -y and clean -y exit 1 with CONFIG_ERROR naming the row and change nothing", async () => {
    const root = await initialisedRepo();
    await forgeRows(root, [hashedInfraRow("docs/owner.md", OWNER_FILES["docs/owner.md"] as string)]);
    const before = await snapshot(root);

    const sync = await runJson(syncCommand, root, ["sync", "-y"]);
    expect(sync.code).toBe(1);
    expect(sync.doc.error?.code).toBe("CONFIG_ERROR");
    expect(failureText(sync.doc)).toContain('"docs/owner.md"');
    expect(await snapshot(root)).toEqual(before);

    const clean = await runJson(cleanCommand, root, ["clean", "-y"]);
    expect(clean.code).toBe(1);
    expect(clean.doc.error?.code).toBe("CONFIG_ERROR");
    expect(failureText(clean.doc)).toContain('"docs/owner.md"');
    expect(await snapshot(root)).toEqual(before);
  });

  it("refuses every row of the measured reproduction, hashless and hashed, in one error", async () => {
    const root = await initialisedRepo();
    const forged: LedgerEntry[] = [
      { path: "notes/st-owner.md", adapter: "claude", artifactId: "f2", artifactType: "rule" },
      { path: "src/stamity-x.ts", adapter: "cursor", artifactId: "f3", artifactType: "skill" },
      { path: "packages/app/skills/st-foo/index.ts", adapter: "cursor", artifactId: "f4", artifactType: "skill" },
      { path: "lib/30-stamity-y.js", adapter: "claude", artifactId: "f5", artifactType: "rule" },
      hashedInfraRow(".stamity/learnings/keep-me.md", OWNER_STATE_FILES[".stamity/learnings/keep-me.md"] as string),
      hashedInfraRow(".stamity/overrides/x.md", OWNER_STATE_FILES[".stamity/overrides/x.md"] as string),
      hashedInfraRow(".github/workflows/ci.yml", OWNER_FILES[".github/workflows/ci.yml"] as string),
      hashedInfraRow(".github/CODEOWNERS", OWNER_FILES[".github/CODEOWNERS"] as string),
    ];
    await forgeRows(root, forged);
    const before = await snapshot(root);

    const sync = await runJson(syncCommand, root, ["sync", "-y"]);
    expect(sync.code).toBe(1);
    expect(sync.doc.error?.code).toBe("CONFIG_ERROR");
    for (const row of forged) expect(failureText(sync.doc)).toContain(JSON.stringify(row.path));
    expect(await snapshot(root)).toEqual(before);

    const clean = await runJson(cleanCommand, root, ["clean", "-y"]);
    expect(clean.code).toBe(1);
    for (const row of forged) expect(failureText(clean.doc)).toContain(JSON.stringify(row.path));
    expect(await snapshot(root)).toEqual(before);
  });

  it("clean -y --pack acts on nothing either", async () => {
    const root = await initialisedRepo();
    const added = await runInProcess([addCommand], ["add", "ops", "-y"], { cwd: root });
    expect(added.code).toBe(0);
    await forgeRows(root, [hashedInfraRow("docs/owner.md", OWNER_FILES["docs/owner.md"] as string)]);
    const before = await snapshot(root);

    const clean = await runJson(cleanCommand, root, ["clean", "-y", "--pack", "ops"]);

    expect(clean.code).toBe(1);
    expect(clean.doc.error?.code).toBe("CONFIG_ERROR");
    expect(failureText(clean.doc)).toContain('"docs/owner.md"');
    expect(await snapshot(root)).toEqual(before);
  });
});

describe("inside the bound, a row with no content hash proves nothing", () => {
  const GONE = ".claude/agents/stamity-gone.md";
  const GONE_BYTES = "a block-less file under an engine name\n";

  it("keeps an engine-named file whose row records no hash, and names why", async () => {
    const root = await initialisedRepo();
    await seed(root, { [GONE]: GONE_BYTES });
    await forgeRows(root, [{ path: GONE, adapter: "claude", artifactId: "stamity-gone", artifactType: "agent" }]);

    const sync = await runInProcess([syncCommand], ["sync", "-y", "--json"], { cwd: root });

    expect(sync.code).toBe(0);
    const doc = JSON.parse(sync.stdout.trim()) as { reclaim: { entries: { path: string; action: string; detail: string }[] } };
    const entry = doc.reclaim.entries.find((candidate) => candidate.path === GONE);
    expect(entry?.action).toBe("skipped-unsafe-path");
    expect(entry?.detail).toContain("records no content hash");
    expect(await readFile(join(root, GONE), "utf8")).toBe(GONE_BYTES);
  });

  it("deletes the same file when its row records the hash of its bytes", async () => {
    const root = await initialisedRepo();
    await seed(root, { [GONE]: GONE_BYTES });
    await forgeRows(root, [
      { path: GONE, adapter: "claude", artifactId: "stamity-gone", artifactType: "agent", contentHash: sha256(GONE_BYTES) },
    ]);

    const sync = await runInProcess([syncCommand], ["sync", "-y", "--json"], { cwd: root });

    expect(sync.code).toBe(0);
    const doc = JSON.parse(sync.stdout.trim()) as {
      reclaim: { entries: { path: string; action: string; proof?: string }[] };
    };
    expect(doc.reclaim.entries.find((candidate) => candidate.path === GONE)).toMatchObject({
      action: "deleted",
      proof: "hash",
    });
  });

  // The co-owned lane: `.claude/settings.json` sits in the bound by its exact
  // path, and its reducer strips `permissions` and `hooks` by key name, so a
  // hand-added row with no hash in a repository that never selected claude
  // used to delete or rewrite an owner's settings with no backup. A missing
  // hash reads as drift there, so the change lands behind a verified `.bak`.
  describe("a co-owned settings document a hashless row names is backed up before the sweep changes it", () => {
    const SETTINGS = ".claude/settings.json";
    const OWNER_DENY_ONLY = `${JSON.stringify({ permissions: { deny: ["Read(./secrets/**)"] } }, null, 2)}\n`;
    const OWNER_WITH_MODEL = `${JSON.stringify({ model: "owner-model", permissions: { deny: ["Bash(rm:*)"] } }, null, 2)}\n`;
    const hashlessRow: LedgerEntry = { path: SETTINGS, adapter: "claude", artifactId: "forged-settings", artifactType: "infra" };

    /** `sync --json` nests the sweep under `reclaim`; `clean --json` is the sweep. */
    interface SweepDoc {
      reclaim?: { entries: SweepEntry[] };
      entries?: SweepEntry[];
    }
    interface SweepEntry {
      path: string;
      action: string;
      detail: string;
    }

    it.each([
      { verb: "sync", command: syncCommand, owner: OWNER_DENY_ONLY, action: "deleted" },
      { verb: "clean", command: cleanCommand, owner: OWNER_DENY_ONLY, action: "deleted" },
      { verb: "sync", command: syncCommand, owner: OWNER_WITH_MODEL, action: "co-owned-reduced" },
      { verb: "clean", command: cleanCommand, owner: OWNER_WITH_MODEL, action: "co-owned-reduced" },
    ])("$verb -y leaves the owner's bytes in $action's verified .bak", async ({ verb, command, owner, action }) => {
      const root = await initialisedRepo(["cursor"]);
      await seed(root, { [SETTINGS]: owner });
      await forgeRows(root, [hashlessRow]);

      const run = await runInProcess([command], [verb, "-y", "--json"], { cwd: root });

      expect(run.code).toBe(0);
      const doc = JSON.parse(run.stdout.trim()) as SweepDoc;
      const entry = (doc.reclaim?.entries ?? doc.entries)?.find((candidate) => candidate.path === SETTINGS);
      expect(entry?.action).toBe(action);
      expect(entry?.detail).toContain("records no content hash");
      // The detail names the backup the way the engine names every backup: the
      // resolved NATIVE path (backslashes on Windows), so the expectation is
      // built with `join` rather than spelled as a POSIX substring of it.
      expect(entry?.detail).toContain(`Your previous file is at ${join(root, `${SETTINGS}.bak`)}.`);
      expect(await readFile(join(root, `${SETTINGS}.bak`), "utf8")).toBe(owner);
    });
  });
});

// ── REQ-PLUGIN-046: the import decisions ───────────────────────────────────

/** The owner's own instruction file, which a `supplement` import keeps below the engine's block. */
const OWNER_AGENTS = "# Team notes\n\nOur own agent instructions. Keep this.\n";

interface ManifestDoc {
  ledger: LedgerEntry[];
  importChoice?: { path: string; mode: string }[];
  tools?: string[];
}

/** Rewrites the committed manifest, as a hand edit of it does. */
async function editManifest(root: string, edit: (manifest: ManifestDoc) => void): Promise<void> {
  const path = join(root, ".stamity", "manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as ManifestDoc;
  edit(manifest);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/** A repository whose owner `AGENTS.md` was imported with `supplement`, as `init --import-config supplement` does. */
async function supplementedRepo(): Promise<string> {
  const root = getTemp().path("repo");
  await mkdir(root, { recursive: true });
  await seed(root, { "AGENTS.md": OWNER_AGENTS });
  const decisions = await buildInitDecisions(root, { tools: ["claude", "cursor"] }, { history: null, skipWorkspaceProbe: true });
  await applyInit({
    rootDir: root,
    decisions,
    importChoice: [{ path: "AGENTS.md", mode: "supplement" }],
    engineVersion: ENGINE_VERSION,
    dryRun: false,
    force: false,
    now: T0,
  });
  return root;
}

interface CheckDoc extends JsonDoc {
  drift?: { changes: { path: string; action: string; collisionKind?: string; detail?: string }[] } | null;
  error?: { code?: string; message?: string; why?: string; next?: string };
}

describe("an import decision binds only as init records it", () => {
  it("refuses a skip decision for a file init never imports, naming each decision", async () => {
    const root = await initialisedRepo();
    const guards = [".cursor/hooks.json", ".cursor/hooks/subagent-guard.mjs", ".cursor/hooks/mcp-guard.mjs"];
    await editManifest(root, (manifest) => {
      manifest.importChoice = [...(manifest.importChoice ?? []), ...guards.map((path) => ({ path, mode: "skip" }))];
      manifest.ledger = manifest.ledger.filter((row) => !guards.includes(row.path));
    });
    for (const path of guards) await rm(join(root, path), { force: true });

    const { code, doc } = await runJson(checkCommand, root, ["check"]);

    expect(code).toBe(1);
    const manifestRow = doc.doctor?.find((row) => row.id === "manifest");
    expect(manifestRow?.status).toBe("fail");
    for (const path of guards) {
      expect(manifestRow?.detail).toMatch(
        new RegExp(`\`importChoice\\[\\d+\\]\\.path\` ${JSON.stringify(path).replaceAll(".", "\\.")} is not an instruction file init imports`),
      );
    }
  });

  it("refuses a skip decision beside a ledger row for the same path, and sync leaves AGENTS.md as it is", async () => {
    const root = await supplementedRepo();
    const bytes = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(bytes).toContain("Keep this.");
    await editManifest(root, (manifest) => {
      const decision = manifest.importChoice?.find((choice) => choice.path === "AGENTS.md");
      if (decision !== undefined) decision.mode = "skip";
      for (const row of manifest.ledger) if (row.path === "AGENTS.md") row.contentHash = sha256(bytes);
    });
    const before = await snapshot(root);

    const sync = await runJson(syncCommand, root, ["sync", "-y"]);

    expect(sync.code).toBe(1);
    expect(sync.doc.error?.code).toBe("CONFIG_ERROR");
    expect(failureText(sync.doc)).toMatch(/`ledger\[\d+\]` records "AGENTS\.md", which `importChoice\[\d+\]` skips/);
    expect(await snapshot(root)).toEqual(before);
  }, 60_000);

  const FLIPS = [
    ["replace", ["sync", "-y"]],
    ["replace", ["sync", "-y", "--force"]],
    ["removed", ["sync", "-y"]],
    ["removed", ["sync", "-y", "--force"]],
  ] as const;

  it.each(FLIPS)(
    "never writes over a supplemented AGENTS.md whose decision reads %s (%j)",
    async (flip, argv) => {
      const root = await supplementedRepo();
      await editManifest(root, (manifest) => {
        if (flip === "removed") {
          manifest.importChoice = (manifest.importChoice ?? []).filter((choice) => choice.path !== "AGENTS.md");
          if (manifest.importChoice.length === 0) delete manifest.importChoice;
          return;
        }
        const decision = manifest.importChoice?.find((choice) => choice.path === "AGENTS.md");
        if (decision !== undefined) decision.mode = flip;
      });
      const bytes = await readFile(join(root, "AGENTS.md"), "utf8");

      const check = await runInProcess([checkCommand], ["check", "--json"], { cwd: root });
      expect(check.code).toBe(1);
      const doc = JSON.parse(check.stdout.trim()) as CheckDoc;
      expect(doc.drift?.changes.find((entry) => entry.path === "AGENTS.md")).toMatchObject({
        action: "collision",
        collisionKind: "import-decision",
      });
      expect(doc.error?.next).toContain("init --force --import-config replace");
      expect(doc.error?.next).not.toContain("sync --force");

      const sync = await runInProcess([syncCommand], [...argv], { cwd: root });

      expect(sync.code).toBe(1);
      expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(bytes);
      expect((await readdir(root)).filter((name) => name.startsWith("AGENTS.md.bak"))).toEqual([]);
      // The text names the remedy that works, and never offers the one that does not.
      expect(sync.stdout).toContain("Skipped AGENTS.md. AGENTS.md holds your text outside the engine's managed block");
      expect(sync.stdout).toContain("init --force --import-config replace");
      expect(sync.stdout).toContain("--force does not clear this");
      expect(sync.stdout).not.toContain("re-run with --force");
      expect(sync.stdout).not.toContain("--force overwrites after a verified .bak");
    },
    60_000,
  );
});

describe("an instruction file leaves only on its own bytes", () => {
  it("keeps an owner's docs/AGENTS.md that a forged row hashes", async () => {
    const root = await initialisedRepo();
    const owner = "# Docs agents\n\nHow we write docs here.\n";
    await seed(root, { "docs/AGENTS.md": owner });
    await forgeRows(root, [hashedInfraRow("docs/AGENTS.md", owner, "codex")]);

    const sync = await runInProcess([syncCommand], ["sync", "-y", "--json"], { cwd: root });

    expect(sync.code).toBe(0);
    const doc = JSON.parse(sync.stdout.trim()) as { reclaim: { entries: { path: string; action: string; detail: string }[] } };
    const entry = doc.reclaim.entries.find((candidate) => candidate.path === "docs/AGENTS.md");
    expect(entry?.action).toBe("skipped-user-content");
    expect(entry?.detail).toContain("only when its own bytes show the engine wrote it");
    expect(await readFile(join(root, "docs/AGENTS.md"), "utf8")).toBe(owner);
  });

  it("deletes the engine's unedited per-package charter once its package leaves", async () => {
    const root = getTemp().path("repo");
    await mkdir(root, { recursive: true });
    await seed(root, {
      "package.json": `${JSON.stringify({ name: "x", private: true, workspaces: ["packages/*"] })}\n`,
      "packages/app/package.json": `${JSON.stringify({ name: "app", version: "1.0.0" })}\n`,
    });
    const decisions = await buildInitDecisions(root, { tools: ["codex"] }, { history: null, skipWorkspaceProbe: true });
    await applyInit({ rootDir: root, decisions, engineVersion: ENGINE_VERSION, dryRun: false, force: false, now: T0 });
    const manifest = JSON.parse(await readFile(join(root, ".stamity", "manifest.json"), "utf8")) as ManifestDoc;
    expect(manifest.ledger.map((row) => row.path)).toContain("packages/app/AGENTS.md");
    await rm(join(root, "packages/app/package.json"));

    const sync = await runInProcess([syncCommand], ["sync", "-y", "--json"], { cwd: root });

    expect(sync.code).toBe(0);
    const doc = JSON.parse(sync.stdout.trim()) as {
      reclaim: { entries: { path: string; action: string; proof?: string }[] };
    };
    expect(doc.reclaim.entries.find((candidate) => candidate.path === "packages/app/AGENTS.md")).toMatchObject({
      action: "deleted",
      proof: "hash",
    });
  });
});

// ── REQ-PLUGIN-046: the engine's own Codex override ───────────────────────

/**
 * The Codex-only root `AGENTS.override.md` repeats the shared `AGENTS.md` as
 * the run leaves it, then the root rules appendix. Under a `skip` decision, or
 * a `supplement` with owner text above the block, it opens with the owner's
 * text rather than the charter, so the appendix heading on a line of its own
 * is what proves the engine wrote it.
 */
describe("the engine's own AGENTS.override.md proves itself by its appendix heading", () => {
  const OVERRIDE = "AGENTS.override.md";
  const APPENDIX_HEADING = "## Conditional rules (Codex down-conversion)";

  /** A codex repository whose owner `AGENTS.md` init imported under `mode`. */
  async function codexRepo(mode: "skip" | "supplement"): Promise<string> {
    const root = getTemp().path("repo");
    await mkdir(root, { recursive: true });
    await seed(root, { "AGENTS.md": OWNER_AGENTS });
    const decisions = await buildInitDecisions(root, { tools: ["claude", "codex"] }, { history: null, skipWorkspaceProbe: true });
    await applyInit({
      rootDir: root,
      decisions,
      importChoice: [{ path: "AGENTS.md", mode }],
      engineVersion: ENGINE_VERSION,
      dryRun: false,
      force: false,
      now: T0,
    });
    expect((await readFile(join(root, OVERRIDE), "utf8")).split("\n")).toContain(APPENDIX_HEADING);
    return root;
  }

  async function overrideBackups(root: string): Promise<string[]> {
    return (await readdir(root)).filter((name) => name.startsWith(`${OVERRIDE}.bak`));
  }

  // Under `supplement` a first adoption puts the block on top, so the override
  // still opens with the charter; the owner's text above the block is set up by
  // one sync, and the change under test is the next one.
  it.each([
    ["skip", (bytes: string) => bytes],
    ["supplement", (bytes: string) => `# Above\n\nThe owner's line above the block.\n\n${bytes}`],
  ] as const)("a sync that changes the override under %s takes no .bak and no warning", async (mode, ownerAbove) => {
    const root = await codexRepo(mode);
    const agents = join(root, "AGENTS.md");
    await writeFile(agents, ownerAbove(await readFile(agents, "utf8")), "utf8");
    const setup = await runInProcess([syncCommand], ["sync", "-y"], { cwd: root });
    expect(setup.code).toBe(0);
    const before = await readFile(join(root, OVERRIDE), "utf8");
    expect(before.startsWith("# Charter")).toBe(false);
    await writeFile(agents, `${await readFile(agents, "utf8")}\nA line the owner added.\n`, "utf8");

    const sync = await runInProcess([syncCommand], ["sync", "-y"], { cwd: root });

    expect(sync.code).toBe(0);
    const after = await readFile(join(root, OVERRIDE), "utf8");
    expect(after).not.toBe(before);
    expect(after).toContain("A line the owner added.");
    expect(await overrideBackups(root)).toEqual([]);
    expect(`${setup.stdout}${sync.stdout}`).not.toContain("may be yours");
  }, 60_000);

  it("deselecting codex removes the unedited override", async () => {
    const root = await codexRepo("skip");
    await editManifest(root, (manifest) => {
      manifest.tools = ["claude"];
    });

    const sync = await runInProcess([syncCommand], ["sync", "-y", "--json"], { cwd: root });

    expect(sync.code).toBe(0);
    const doc = JSON.parse(sync.stdout.trim()) as { reclaim: { entries: { path: string; action: string; proof?: string }[] } };
    expect(doc.reclaim.entries.find((entry) => entry.path === OVERRIDE)).toMatchObject({ action: "deleted", proof: "hash" });
    expect(existsSync(join(root, OVERRIDE))).toBe(false);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(OWNER_AGENTS);
  }, 60_000);

  it("keeps a hand-edited override on deselect, and names it", async () => {
    const root = await codexRepo("skip");
    const edited = `${await readFile(join(root, OVERRIDE), "utf8")}\nMy own Codex note.\n`;
    await writeFile(join(root, OVERRIDE), edited, "utf8");
    await editManifest(root, (manifest) => {
      manifest.tools = ["claude"];
    });

    const sync = await runInProcess([syncCommand], ["sync", "-y", "--json"], { cwd: root });

    expect(sync.code).toBe(0);
    const doc = JSON.parse(sync.stdout.trim()) as { reclaim: { entries: { path: string; action: string; detail: string }[] } };
    const entry = doc.reclaim.entries.find((candidate) => candidate.path === OVERRIDE);
    expect(entry?.action).toBe("skipped-user-content");
    expect(entry?.detail).toContain("edited since");
    expect(await readFile(join(root, OVERRIDE), "utf8")).toBe(edited);
  }, 60_000);

  describe("an owner's own AGENTS.override.md without the heading keeps the fail-safe", () => {
    const OWNER_OVERRIDE = "# Our Codex overrides\n\nUse the staging database.\n";

    it("is backed up, with the warning, before a codex sync overwrites it under a row hashing it", async () => {
      const root = await initialisedRepo(["claude", "codex"]);
      await writeFile(join(root, OVERRIDE), OWNER_OVERRIDE, "utf8");
      await editManifest(root, (manifest) => {
        for (const row of manifest.ledger) if (row.path === OVERRIDE) row.contentHash = sha256(OWNER_OVERRIDE);
      });

      const sync = await runInProcess([syncCommand], ["sync", "-y"], { cwd: root });

      expect(sync.code).toBe(0);
      expect(sync.stdout).toContain("may be yours");
      const backups = await overrideBackups(root);
      expect(backups).toHaveLength(1);
      expect(await readFile(join(root, backups[0] as string), "utf8")).toBe(OWNER_OVERRIDE);
    }, 60_000);

    it("is kept by the sweep under a forged row hashing it", async () => {
      const root = await initialisedRepo();
      await seed(root, { [OVERRIDE]: OWNER_OVERRIDE });
      await forgeRows(root, [hashedInfraRow(OVERRIDE, OWNER_OVERRIDE, "codex")]);

      const sync = await runInProcess([syncCommand], ["sync", "-y", "--json"], { cwd: root });

      expect(sync.code).toBe(0);
      const doc = JSON.parse(sync.stdout.trim()) as { reclaim: { entries: { path: string; action: string; detail: string }[] } };
      const entry = doc.reclaim.entries.find((candidate) => candidate.path === OVERRIDE);
      expect(entry?.action).toBe("skipped-user-content");
      expect(entry?.detail).toContain("only when its own bytes show the engine wrote it");
      expect(await readFile(join(root, OVERRIDE), "utf8")).toBe(OWNER_OVERRIDE);
    });
  });
});
