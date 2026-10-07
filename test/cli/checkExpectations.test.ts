import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCommand } from "../../src/cli/commands/check.ts";
import { applyInit } from "../../src/cli/commands/init/apply.ts";
import { buildInitDecisions } from "../../src/cli/commands/init/plan.ts";
import { createApp } from "../../src/index.ts";
import type { Tool } from "../../src/types/core.ts";
import type { LedgerEntry } from "../../src/types/manifest.ts";
import { npxCommand } from "../support/identity.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * `check --expect-tools` against the measured client drop (REQ-PLUGIN-047),
 * over a repository the real corpus set up the way `init -y --tools
 * claude,cursor` sets one up.
 *
 * The defect, measured 2026-10-06 on 1.11.0: removing `cursor` from
 * `manifest.tools` together with its ledger rows and the files only it owned —
 * `.cursor/hooks.json` and both guards among them — leaves `check` at exit 0,
 * "drift: clean", because every surface `check` compares against is one the
 * pull request itself can edit. The expectation has to come from a caller the
 * pull request cannot edit, and these cases prove the flag catches the drop
 * while the plain run stays exactly what it was.
 */

/* oxlint-disable no-await-in-loop */

const ENGINE_VERSION = createApp().version;
const T0 = new Date("2026-10-07T09:00:00.000Z");

const getTemp = useTempDir("check-expectations");

/** A repository set up by the real corpus, as `init -y --tools …` sets one up. */
async function initialisedRepo(tools: readonly Tool[]): Promise<string> {
  const root = getTemp().path("repo");
  await mkdir(root, { recursive: true });
  const decisions = await buildInitDecisions(
    root,
    { tools: [...tools] },
    { history: null, skipWorkspaceProbe: true },
  );
  await applyInit({ rootDir: root, decisions, engineVersion: ENGINE_VERSION, dryRun: false, force: false, now: T0 });
  return root;
}

/**
 * The measured drop: `cursor` leaves `tools`, every `cursor` row leaves the
 * ledger, and every path only `cursor` owned leaves the disk. Returns the
 * removed paths, so the case can prove the fixture removed something.
 */
async function dropClient(root: string, client: Tool): Promise<string[]> {
  const path = join(root, ".stamity", "manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as { tools: Tool[]; ledger: LedgerEntry[] };
  const kept = manifest.ledger.filter((row) => row.adapter !== client);
  const keptPaths = new Set(kept.map((row) => row.path));
  const only = [
    ...new Set(manifest.ledger.filter((row) => row.adapter === client).map((row) => row.path)),
  ].filter((rowPath) => !keptPaths.has(rowPath));
  for (const rowPath of only) await rm(join(root, rowPath), { force: true });
  manifest.tools = manifest.tools.filter((tool) => tool !== client);
  manifest.ledger = kept;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return only;
}

interface CheckDoc {
  ok?: boolean;
  doctor?: { id: string; status: string; detail: string }[];
  drift?: { clean: boolean } | null;
  expectations?: unknown;
  error?: { code?: string; message?: string; why?: string; next?: string };
}

async function runJson(root: string, flags: readonly string[]): Promise<{ code: number; doc: CheckDoc }> {
  const result = await runInProcess([checkCommand], ["check", ...flags, "--json"], { cwd: root });
  return { code: result.code, doc: JSON.parse(result.stdout.trim()) as CheckDoc };
}

/** The report above the closing block: the doctor rows, the drift verdict and the provenance rollup. */
function beforeClose(stdout: string): string {
  const provenance = stdout.indexOf("provenance (the manifest is the record)");
  expect(provenance).toBeGreaterThan(0);
  return stdout.slice(0, stdout.indexOf("\n\n", provenance) + 1);
}

describe("check --expect-tools catches a client dropped with its rows and files (REQ-PLUGIN-047)", () => {
  it("fails with EXPECTATION_ERROR naming cursor, where plain check passes", async () => {
    const root = await initialisedRepo(["claude", "cursor"]);
    const removed = await dropClient(root, "cursor");
    // Non-degenerate: the drop removed the client's files, guards included.
    expect(removed.length).toBeGreaterThan(10);
    expect(removed.some((path) => path.startsWith(".cursor/hooks"))).toBe(true);
    expect(existsSync(join(root, ".cursor", "hooks.json"))).toBe(false);

    // The defect as measured: nothing a plain check compares notices the drop.
    const plain = await runJson(root, []);
    expect(plain.code).toBe(0);
    expect(plain.doc.ok).toBe(true);
    expect(plain.doc.drift?.clean).toBe(true);
    // Without a flag the payload carries no `expectations` key and no extra row.
    expect(plain.doc).not.toHaveProperty("expectations");
    expect(plain.doc.doctor?.map((row) => row.id)).not.toContain("expectations");

    const expecting = await runJson(root, ["--expect-tools", "claude,cursor"]);
    expect(expecting.code).toBe(1);
    expect(expecting.doc.ok).toBe(false);
    expect(expecting.doc.error?.code).toBe("EXPECTATION_ERROR");
    expect(expecting.doc.expectations).toEqual({
      ok: false,
      tools: { expected: ["claude", "cursor"], recorded: ["claude"], missing: ["cursor"], extra: [], ok: false },
    });
    expect(expecting.doc.error?.why).toContain("cursor missing");
    expect(expecting.doc.error?.next).toContain(npxCommand("config set tools claude,cursor"));
    expect(expecting.doc.error?.next).toContain(npxCommand("sync"));
  });

  it("prints the expectations row failing on cursor, and the remedy first", async () => {
    const root = await initialisedRepo(["claude", "cursor"]);
    await dropClient(root, "cursor");

    const plain = await runInProcess([checkCommand], ["check"], { cwd: root });
    expect(plain.code).toBe(0);
    expect(plain.stdout).not.toContain("expectations");

    const result = await runInProcess([checkCommand], ["check", "--expect-tools", "claude,cursor"], {
      cwd: root,
    });
    expect(result.code).toBe(1);
    const line = result.stdout.split("\n").find((text) => /^\s+fail\s+expectations\s/.test(text));
    expect(line, result.stdout).toBeDefined();
    expect(line).toContain("clients claude — cursor missing");
    // The row sits after `invariants`, the last of the fifteen doctor rows.
    expect(result.stdout.indexOf("invariants")).toBeLessThan(result.stdout.indexOf("expectations"));
    const next = result.stdout.slice(result.stdout.indexOf("\nnext:\n"));
    expect(next).toMatch(/^\nnext:\n {2}1\. .*config set tools claude,cursor/);
    // Everything above the closing block is the plain run's, line for line,
    // with the one row added: the flag adds a verdict and changes no other.
    const withoutRow = result.stdout
      .split("\n")
      .filter((text) => !/^\s+fail\s+expectations\s/.test(text))
      .join("\n");
    expect(beforeClose(withoutRow)).toBe(beforeClose(plain.stdout));
  });

  it("passes when the manifest's clients are the expected set", async () => {
    const root = await initialisedRepo(["claude", "cursor"]);

    const { code, doc } = await runJson(root, ["--expect-tools", "cursor, Claude"]);

    expect(code).toBe(0);
    expect(doc.ok).toBe(true);
    expect(doc.expectations).toEqual({
      ok: true,
      tools: { expected: ["claude", "cursor"], recorded: ["claude", "cursor"], missing: [], extra: [], ok: true },
    });
    const row = doc.doctor?.find((entry) => entry.id === "expectations");
    expect(row).toEqual({
      id: "expectations",
      status: "pass",
      detail: "clients claude, cursor — as expected",
    });
  });
});
