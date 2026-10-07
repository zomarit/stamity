import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
});
