import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { COMMANDS } from "../../../src/cli.ts";
import { applySync, planSync } from "../../../src/cli/commands/sync/engine.ts";
import { movedSkillLines, renderSyncReport } from "../../../src/cli/commands/sync/report.ts";
import { engineRenderingsFor, type EmissionPlanFor } from "../../../src/cli/engine/emissionWrite.ts";
import { makePalette } from "../../../src/cli/kit/terminal.ts";
import { __resetContentRootCacheForTests, __setContentRootForTests } from "../../../src/content/contentRoot.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { MOVED_CORE_SKILLS, MOVED_SKILL_FOLDERS, movedCoreSkill, movedRenderingAt } from "../../../src/pack/moved.ts";
import type { Tool } from "../../../src/types/core.ts";
import type { LedgerEntry, SetupManifest } from "../../../src/types/manifest.ts";
import { npxCommand } from "../../support/identity.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * u12-moved-prune (REQ-PACK-008): a skill that left the core for a pack keeps
 * no core copy behind. Once the running corpus no longer holds it, `sync`
 * meets the copies an earlier release wrote as reclaim candidates, proves each
 * against the frozen core rendering at exactly its engine path
 * (`src/pack/moved.ts`), deletes the unedited ones, keeps an edited one, and
 * says so once.
 *
 * Real filesystem, real planner, real sweep: the subject is what lands on disk.
 * The pinned corpus holds only the charter core emission requires, so neither
 * moved skill is in it — the state a release past the move runs in. The frozen
 * bytes are read from the 1.14.0 release tree the upgrade suite already keeps
 * (`test/fixtures/release-1-14-0-tree/`), which holds both copies of each file
 * as that release wrote them; nothing here hard-codes a body.
 */

const ENGINE_VERSION = "1.17.0";
const T0 = new Date("2026-10-20T00:00:00.000Z");
const T1 = new Date("2026-10-21T00:00:00.000Z");
const plainPalette = makePalette(false);

// TEST CHANGE, justified (2026-10-21, 2026-10-20_packs-rebuilt branch review round 1, M-1): the
// notice's remedy was a bare `stamity add frontend`, a binary a fork's install does not have and
// the documented `npx` setup never puts on PATH; it is now the pinned call `check`'s
// `moved-skills` row prints, spelled from this checkout's identity rather than the helper.
const KEEP_IT = `To keep it: \`${npxCommand("add frontend")}\``;

const RELEASE_TREE = fileURLToPath(new URL("../../fixtures/release-1-14-0-tree", import.meta.url));

/** The stored folder for each moved-skill folder in the release tree (its names carry `.fixture`). */
const STORED_FOLDER: Readonly<Record<string, string>> = {
  ".agents/skills": ".agents.fixture/skills",
  ".claude/skills": ".claude.fixture/skills",
};

/** Each client this setup wrote for, and the folder its skill rows name. */
const ROW_OWNER: Readonly<Record<string, Tool>> = { ".agents/skills": "codex", ".claude/skills": "claude" };

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

const tempDir = useTempDir("stamity-moved-prune");

afterEach(() => {
  __resetContentRootCacheForTests();
});

const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** One frozen copy: the path a 1.16.0 sync wrote, its owner, and its bytes. */
interface FrozenCopy {
  path: string;
  owner: Tool;
  id: string;
  bytes: string;
}

/** Every core copy 1.16.0 wrote for the moved skills, at both folders, read off the release tree. */
async function frozenCopies(): Promise<FrozenCopy[]> {
  const wanted = MOVED_CORE_SKILLS.flatMap((skill) =>
    MOVED_SKILL_FOLDERS.flatMap((folder) => Object.keys(skill.renderings).map((file) => ({ skill, folder, file }))),
  );
  return Promise.all(
    wanted.map(async ({ skill, folder, file }) => ({
      path: `${folder}/st-${skill.id}/${file}`,
      owner: ROW_OWNER[folder] as Tool,
      id: skill.id,
      bytes: await readFile(`${RELEASE_TREE}/${STORED_FOLDER[folder]}/st-${skill.id}/${file}`, "utf8"),
    })),
  );
}

/** The ledger row 1.16.0 recorded for `copy`: its client, the skill, and the hash of what it wrote. */
function rowFor(copy: FrozenCopy, contentHash = sha256(copy.bytes)): LedgerEntry {
  return { path: copy.path, adapter: copy.owner, artifactId: copy.id, artifactType: "skill", contentHash };
}

/**
 * A repository a 1.16.0 sync left: the pinned charter-only corpus beside it,
 * and a manifest for Claude Code and Codex whose ledger holds `ledger`.
 * Returns the repository root; each case seeds its own files.
 */
async function seedRepo(
  handle: TempDirHandle,
  ledger: readonly LedgerEntry[],
  tools: Tool[] = ["claude", "codex"],
): Promise<string> {
  __setContentRootForTests(handle.path("corpus"));
  await handle.seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE });
  const root = handle.path("repo");
  const manifest: SetupManifest = {
    ...createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "1.16.0",
      now: T0,
    }),
    ledger: [...ledger],
  };
  await writeManifest(root, manifest, { now: T0 });
  return root;
}

/** One live `sync`, as the command runs it, with its report text. */
async function syncOnce(root: string) {
  const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
  const report = await applySync(root, plan, { engineVersion: ENGINE_VERSION, force: false, dryRun: false, now: T1 });
  return { plan, report, text: renderSyncReport(plan, report, plainPalette) };
}

const movedLines = (text: string): string[] => text.split("\n").filter((line) => line.startsWith("  moved: "));

describe("the moved-skills table", () => {
  it("holds the frozen digests of the bytes the 1.14.0 release tree keeps at both folders", async () => {
    const copies = await frozenCopies();
    expect(copies).toHaveLength(8);
    for (const copy of copies) {
      const skill = movedCoreSkill(copy.id);
      expect(skill?.pack).toBe("frontend");
      expect(skill?.since).toBe("1.17.0");
      expect(skill === undefined ? undefined : movedRenderingAt(skill, copy.path)).toBe(sha256(copy.bytes));
    }
  });

  it("names exactly two folders and the skill's own files, so any other path gains no digest", () => {
    const skill = movedCoreSkill("design-system-detect");
    expect(skill).toBeDefined();
    if (skill === undefined) return;
    expect(movedCoreSkill("qa")).toBeUndefined();
    for (const path of [
      ".cursor/skills/st-design-system-detect/SKILL.md",
      ".claude/skills/st-browser-evidence/SKILL.md",
      ".claude/skills/st-design-system-detect/notes.md",
      ".claude/skills/st-design-system-detect/constructor",
      "docs/.claude/skills/st-design-system-detect/SKILL.md",
      ".claude/skills/design-system-detect/SKILL.md",
    ]) {
      expect(movedRenderingAt(skill, path), path).toBeUndefined();
    }
  });
});

describe("engineRenderingsFor at a moved skill's copies", () => {
  // A plan that renders nothing: the running corpus holds neither moved skill,
  // so whatever the planner renders, none of it lands at these paths. The
  // proof under test is the frozen table, not the planner.
  const noPlan: EmissionPlanFor = async () => [];

  it("adds the frozen digest at a client row's exact engine path, and nowhere a forged row names", async () => {
    const handle = tempDir();
    const [copy] = await frozenCopies();
    if (copy === undefined) throw new Error("no frozen copy");
    const forged: LedgerEntry[] = [
      { ...rowFor(copy), path: ".cursor/skills/st-design-system-detect/SKILL.md", adapter: "cursor" },
      { ...rowFor(copy), path: ".claude/skills/st-browser-evidence/SKILL.md" },
      { ...rowFor(copy), path: ".claude/skills/st-design-system-detect/notes.md" },
      // A pack's row is the pack's own copy, never a core one.
      { ...rowFor(copy), path: ".claude/skills/st-design-system-detect/agents/openai.yaml", adapter: "pack:frontend" },
      // A row of another type at the engine path selects nothing either.
      { ...rowFor(copy), path: ".agents/skills/st-design-system-detect/agents/openai.yaml", artifactType: "rule" },
    ];
    const root = await seedRepo(handle, [rowFor(copy)]);
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("no manifest");
    // In memory: the manifest writer refuses some of these rows outright, and
    // the proof has to hold for a ledger that reached it some other way.
    manifest.ledger.push(...forged);

    const { renderings, renderingsUnbuilt } = await engineRenderingsFor(
      root,
      manifest,
      [copy.path, ...forged.map((row) => row.path)],
      noPlan,
    );

    expect(renderingsUnbuilt).toBeUndefined();
    expect([...renderings.keys()]).toEqual([copy.path]);
    expect([...(renderings.get(copy.path) ?? [])]).toEqual([sha256(copy.bytes)]);
  });

  it("adds nothing while the running corpus still holds the skill: the engine's own rendering proves it then", async () => {
    const handle = tempDir();
    const [copy] = await frozenCopies();
    if (copy === undefined) throw new Error("no frozen copy");
    const root = await seedRepo(handle, [rowFor(copy)]);
    await handle.seedFiles({
      "corpus/skills/st-design-system-detect/SKILL.md":
        "---\nid: design-system-detect\ntype: skill\ndescription: fixture skill\ntags: [maintenance]\nload: on-demand\nobsolete_when: fixture trigger\n---\n\n# Detect\n\nBody.\n",
    });
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("no manifest");

    const { renderings } = await engineRenderingsFor(root, manifest, [copy.path], noPlan);

    expect(renderings.has(copy.path)).toBe(false);
  });
});

describe("sync prunes a moved skill's core copies on the frozen proof", () => {
  it("deletes the unedited copies at both folders, drops their rows, and names them in one notice printed once", async () => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const root = await seedRepo(
      handle,
      copies.map((copy) => rowFor(copy)),
    );
    await handle.seedFiles(Object.fromEntries(copies.map((copy) => [`repo/${copy.path}`, copy.bytes])));

    const first = await syncOnce(root);

    for (const copy of copies) expect(existsSync(`${root}/${copy.path}`), copy.path).toBe(false);
    const deleted = (first.report.reclaimed?.entries ?? []).filter((entry) => entry.action === "deleted").map((entry) => entry.path);
    expect(deleted.toSorted()).toEqual(copies.map((copy) => copy.path).toSorted());
    const ledger = (await readManifest(root))?.ledger ?? [];
    expect(ledger.filter((row) => movedCoreSkill(row.artifactId) !== undefined)).toEqual([]);

    const notice = movedLines(first.text);
    expect(notice).toHaveLength(2);
    for (const skill of MOVED_CORE_SKILLS) {
      const line = notice.find((candidate) => candidate.includes(`skill st-${skill.id} `));
      expect(line, skill.id).toBeDefined();
      expect(line).toContain("left the core for the frontend pack in 1.17.0; its copies were removed: ");
      expect(line).toContain(KEEP_IT);
      expect(line).not.toContain("kept");
      for (const copy of copies.filter((candidate) => candidate.id === skill.id)) expect(line).toContain(copy.path);
    }

    const second = await syncOnce(root);

    expect(movedLines(second.text)).toEqual([]);
    expect(second.report.reclaimed).toBeNull();
  });

  it("keeps a copy edited by one byte, drops its row, and names it as kept", async () => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const edited = copies.find((copy) => copy.path === ".claude/skills/st-design-system-detect/SKILL.md");
    if (edited === undefined) throw new Error("no edited copy");
    const editedBytes = `${edited.bytes.slice(0, -1)}!`;
    const root = await seedRepo(
      handle,
      copies.map((copy) => rowFor(copy)),
    );
    await handle.seedFiles(
      Object.fromEntries(copies.map((copy) => [`repo/${copy.path}`, copy === edited ? editedBytes : copy.bytes])),
    );

    const first = await syncOnce(root);

    expect(await readFile(`${root}/${edited.path}`, "utf8")).toBe(editedBytes);
    for (const copy of copies.filter((candidate) => candidate !== edited)) {
      expect(existsSync(`${root}/${copy.path}`), copy.path).toBe(false);
    }
    const ledger = (await readManifest(root))?.ledger ?? [];
    expect(ledger.some((row) => row.path === edited.path)).toBe(false);
    const line = movedLines(first.text).find((candidate) => candidate.includes("st-design-system-detect "));
    // TEST CHANGE, justified (review/9, review/10): one kept copy reads "wrote
    // it", the signed-off wording; "them" stays for two or more.
    expect(line).toContain(`kept — edited since sync wrote it; delete by hand: ${edited.path}`);
    expect(line).toContain("its copies were removed: ");
    expect(line).toContain(".claude/skills/st-design-system-detect/agents/openai.yaml");

    const second = await syncOnce(root);

    expect(movedLines(second.text)).toEqual([]);
    expect(await readFile(`${root}/${edited.path}`, "utf8")).toBe(editedBytes);
  });

  it("keeps an owner's file even when a forged row records the hash of its bytes: the recorded hash alone deletes nothing", async () => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const target = copies.find((copy) => copy.path === ".agents/skills/st-browser-evidence/SKILL.md");
    if (target === undefined) throw new Error("no target copy");
    const owners = "# My own notes\n\nNot the engine's.\n";
    const root = await seedRepo(handle, [rowFor(target, sha256(owners))]);
    await handle.seedFiles({ [`repo/${target.path}`]: owners });

    const first = await syncOnce(root);

    expect(await readFile(`${root}/${target.path}`, "utf8")).toBe(owners);
    const entry = first.report.reclaimed?.entries.find((candidate) => candidate.path === target.path);
    expect(entry?.action).toBe("skipped-user-content");
    // TEST CHANGE, justified (review/10): the row records the hash of the
    // owner's bytes, not the frozen digest, so nothing was edited since sync
    // wrote it. The notice carries the sweep's own hedge, "if it is yours", and
    // never the false "edited" reason with a bare instruction to delete.
    expect(movedLines(first.text)).toEqual([
      `  moved: skill st-browser-evidence left the core for the frontend pack in 1.17.0; its copies were kept — its ledger row does not record the last core rendering; delete it by hand only if it is yours to remove: ${target.path}. ${KEEP_IT}`,
    ]);
    expect(movedLines(first.text).join("\n")).not.toContain("edited since sync");
  });

  it("deletes a CRLF copy of the frozen bytes, whichever line endings its row recorded", async () => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const lfRecorded = copies.find((copy) => copy.path === ".claude/skills/st-browser-evidence/SKILL.md");
    const crlfRecorded = copies.find((copy) => copy.path === ".claude/skills/st-browser-evidence/agents/openai.yaml");
    if (lfRecorded === undefined || crlfRecorded === undefined) throw new Error("no target copy");
    const crlf = (copy: FrozenCopy): string => copy.bytes.replaceAll("\n", "\r\n");
    expect(crlf(lfRecorded)).not.toBe(lfRecorded.bytes);
    expect(crlf(crlfRecorded)).not.toBe(crlfRecorded.bytes);
    // One row as sync wrote it (LF, then a checkout converted the file), one as
    // a sync on a CRLF disk recorded it: the hash of the bytes there.
    const root = await seedRepo(handle, [rowFor(lfRecorded), rowFor(crlfRecorded, sha256(crlf(crlfRecorded)))]);
    await handle.seedFiles({
      [`repo/${lfRecorded.path}`]: crlf(lfRecorded),
      [`repo/${crlfRecorded.path}`]: crlf(crlfRecorded),
    });

    const first = await syncOnce(root);

    expect(existsSync(`${root}/${lfRecorded.path}`)).toBe(false);
    expect(existsSync(`${root}/${crlfRecorded.path}`)).toBe(false);
    expect(movedLines(first.text)).toEqual([
      `  moved: skill st-browser-evidence left the core for the frontend pack in 1.17.0; its copies were removed: ${lfRecorded.path}, ${crlfRecorded.path}. ${KEEP_IT}`,
    ]);
  });

  it("keeps the frozen bytes at a path outside the two engine folders", async () => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const source = copies.find((copy) => copy.path === ".claude/skills/st-design-system-detect/SKILL.md");
    if (source === undefined) throw new Error("no source copy");
    const elsewhere = { ...source, path: ".cursor/skills/st-design-system-detect/SKILL.md", owner: "cursor" as Tool };
    const root = await seedRepo(handle, [rowFor(elsewhere)]);
    await handle.seedFiles({ [`repo/${elsewhere.path}`]: source.bytes });

    const first = await syncOnce(root);

    expect(await readFile(`${root}/${elsewhere.path}`, "utf8")).toBe(source.bytes);
    const entry = first.report.reclaimed?.entries.find((candidate) => candidate.path === elsewhere.path);
    expect(entry?.action).toBe("skipped-user-content");
    // Not a core copy of the moved skill: the notice does not name it at all,
    // so nothing tells the owner to delete their file (review/9, review/10).
    expect(movedLines(first.text)).toEqual([]);
  });

  it("names a copy reached through a symlinked skill folder as refused, with no instruction to delete it", async () => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const target = copies.find((copy) => copy.path === ".claude/skills/st-browser-evidence/SKILL.md");
    if (target === undefined) throw new Error("no target copy");
    const root = await seedRepo(handle, [rowFor(target)]);
    // The frozen bytes themselves, in a folder of the owner's that the skill
    // folder links to: the bytes would prove the delete, the link refuses it.
    await handle.seedFiles({ "repo/owner/linked/SKILL.md": target.bytes });
    await mkdir(join(root, ".claude/skills"), { recursive: true });
    await symlink(join(root, "owner/linked"), join(root, ".claude/skills/st-browser-evidence"), "dir");

    const first = await syncOnce(root);

    expect(await readFile(join(root, "owner/linked/SKILL.md"), "utf8")).toBe(target.bytes);
    const entry = first.report.reclaimed?.entries.find((candidate) => candidate.path === target.path);
    expect(entry?.action).toBe("skipped-unsafe-path");
    expect(movedLines(first.text)).toEqual([
      `  moved: skill st-browser-evidence left the core for the frontend pack in 1.17.0; its copies were left in place — the sweep refused the path as unsafe to touch, for the reason the reclaim report gives: ${target.path}. ${KEEP_IT}`,
    ]);
  });

  // Runs where the temp volume folds case (APFS, NTFS by default), as the
  // sweep's own case tests do (`test/merge/reclaim.test.ts`).
  it("names a copy the row reaches only through a folder of another spelling as refused, with no instruction to delete it", async (ctx) => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const target = copies.find((copy) => copy.path === ".claude/skills/st-design-system-detect/SKILL.md");
    if (target === undefined) throw new Error("no target copy");
    const root = await seedRepo(handle, [rowFor(target)]);
    const spelled = ".claude/skills/St-Design-System-Detect/SKILL.md";
    await handle.seedFiles({ [`repo/${spelled}`]: target.bytes });
    const folds = await lstat(join(root, target.path)).then(
      () => true,
      () => false,
    );
    if (!folds) ctx.skip();

    const first = await syncOnce(root);

    expect(await readFile(join(root, spelled), "utf8")).toBe(target.bytes);
    const entry = first.report.reclaimed?.entries.find((candidate) => candidate.path === target.path);
    expect(entry?.action).toBe("skipped-unsafe-path");
    const [line] = movedLines(first.text);
    expect(line).toContain(`left in place — the sweep refused the path as unsafe to touch, for the reason the reclaim report gives: ${target.path}`);
    expect(line).not.toContain("delete by hand");
  });

  it("prints no notice when the pack owns rows in the ledger", async () => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const root = await seedRepo(
      handle,
      copies.map((copy) => rowFor(copy)),
    );
    await handle.seedFiles(Object.fromEntries(copies.map((copy) => [`repo/${copy.path}`, copy.bytes])));
    const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
    const report = await applySync(root, plan, { engineVersion: ENGINE_VERSION, force: false, dryRun: false, now: T1 });
    expect(movedLines(renderSyncReport(plan, report, plainPalette))).toHaveLength(2);

    // The same run read against a pre-run ledger holding the pack's own rows:
    // the pack is installed, so the skill did not leave this setup.
    const [copy] = copies;
    if (copy === undefined) throw new Error("no frozen copy");
    const withPack = structuredClone(plan);
    withPack.manifest.ledger.push({ ...rowFor(copy), path: ".stamity/packs/frontend/pack.json", adapter: "pack:frontend", artifactType: "infra" });

    expect(movedLines(renderSyncReport(withPack, report, plainPalette))).toEqual([]);
  });

  it("prints no notice on a dry run, which removed nothing", async () => {
    const handle = tempDir();
    const copies = await frozenCopies();
    const root = await seedRepo(
      handle,
      copies.map((copy) => rowFor(copy)),
    );
    await handle.seedFiles(Object.fromEntries(copies.map((copy) => [`repo/${copy.path}`, copy.bytes])));
    const plan = await planSync(root, ENGINE_VERSION, { runner: () => "" });
    const report = await applySync(root, plan, { engineVersion: ENGINE_VERSION, force: false, dryRun: true, now: T1 });

    expect(movedLines(renderSyncReport(plan, report, plainPalette))).toEqual([]);
    for (const copy of copies) expect(existsSync(`${root}/${copy.path}`), copy.path).toBe(true);
  });
});

/**
 * The upgrade order the change log and REQ-PACK-008 state (plan 018 branch
 * review, W-1), through the commands themselves: on a setup 1.16.0 synced,
 * `add frontend` first is refused — the client rows of the moved ids still
 * claim them and no layer supplies them — and its remedy names `sync` first;
 * `sync`, `add frontend`, `sync` then installs the pack over the copies the
 * first `sync` removed. The copy that `sync` kept because it was edited stays
 * in the way: the last `sync` writes every other pack copy, refuses that one
 * by name and exits 1, and once the copy is deleted by hand, as the `moved:`
 * line asks, the next `sync` writes it. Claude Code alone: the four copies
 * 1.16.0 wrote under `.claude/skills/`, one of them edited.
 */
describe("the upgrade order from 1.16.0: sync, then add frontend, then sync", () => {
  const cli = (root: string, argv: readonly string[]) => runInProcess(COMMANDS, argv, { cwd: root });
  const sync = npxCommand("sync");
  const addFrontend = npxCommand("add frontend");

  it("refuses add frontend before the first sync, naming sync first; the stated order installs the pack", async () => {
    const handle = tempDir();
    const copies = (await frozenCopies()).filter((copy) => copy.path.startsWith(".claude/skills/"));
    expect(copies).toHaveLength(4);
    const root = await seedRepo(
      handle,
      copies.map((copy) => rowFor(copy)),
      ["claude"],
    );
    const edited = copies.find((copy) => copy.path === ".claude/skills/st-design-system-detect/SKILL.md");
    if (edited === undefined) throw new Error("no SKILL.md copy");
    await handle.seedFiles(
      Object.fromEntries(
        copies.map((copy) => [`repo/${copy.path}`, copy === edited ? `${copy.bytes}\nHouse note.\n` : copy.bytes]),
      ),
    );

    const packRoot = join(root, ".stamity", "packs", "frontend");
    const said = (result: { code: number; stdout: string; stderr: string }): string =>
      `exit ${result.code}; ${result.stdout}\n${result.stderr}`.slice(0, 2000);

    // 1. `add frontend` first: refused, nothing installed, and the remedy runs `sync` before `add`.
    const early = await cli(root, ["add", "frontend", "-y", "--json"]);
    expect(early.code, said(early)).toBe(1);
    const refusal = (JSON.parse(early.stdout.trim()) as { error: { code: string; next: string } }).error;
    expect(refusal.code).toBe("VALIDATION_ERROR");
    expect(refusal.next).toContain(`run \`${sync}\`, then delete by hand each client copy it keeps and names`);
    expect(refusal.next.indexOf(`\`${sync}\``)).toBeLessThan(refusal.next.indexOf(`\`${addFrontend}\``));
    expect(existsSync(packRoot)).toBe(false);

    // 2. `sync`: the three unedited copies go, the edited one is kept and named.
    const first = await cli(root, ["sync"]);
    expect(first.code, said(first)).toBe(0);
    for (const copy of copies) expect(existsSync(join(root, copy.path)), copy.path).toBe(copy === edited);
    expect(movedLines(first.stdout)).toEqual([
      `  moved: skill st-design-system-detect left the core for the frontend pack in 1.17.0; its copies were ` +
        `removed: .claude/skills/st-design-system-detect/agents/openai.yaml; kept — edited since sync wrote it; ` +
        `delete by hand: ${edited.path}. ${KEEP_IT}`,
      `  moved: skill st-browser-evidence left the core for the frontend pack in 1.17.0; its copies were ` +
        `removed: .claude/skills/st-browser-evidence/SKILL.md, .claude/skills/st-browser-evidence/agents/openai.yaml. ` +
        KEEP_IT,
    ]);

    // 3. `add frontend`: installs.
    const added = await cli(root, ["add", "frontend", "-y"]);
    expect(added.code, said(added)).toBe(0);
    expect(existsSync(join(packRoot, "receipt.json"))).toBe(true);

    // 4. `sync`: every pack copy but the one the kept file holds; that one is refused by name.
    const second = await cli(root, ["sync"]);
    expect(second.code, said(second)).toBe(1);
    expect(second.stdout).toContain(`existing file(s) would collide with generated output: ${edited.path}`);
    for (const copy of copies) expect(existsSync(join(root, copy.path)), copy.path).toBe(true);
    expect(await readFile(join(root, edited.path), "utf8")).toBe(`${edited.bytes}\nHouse note.\n`);

    // 5. The kept copy deleted by hand, as its `moved:` line said: the next `sync` writes the pack's.
    await rm(join(root, edited.path));
    const third = await cli(root, ["sync"]);
    expect(third.code, said(third)).toBe(0);
    const projected = await readFile(join(root, edited.path), "utf8");
    expect(projected).not.toContain("House note.");
    expect(projected).toContain("name: st-design-system-detect");
    const ledger = (await readManifest(root))?.ledger ?? [];
    for (const copy of copies) {
      expect(ledger.filter((row) => row.path === copy.path).map((row) => row.artifactId), copy.path).toEqual([copy.id]);
    }
  });
});

describe("movedSkillLines", () => {
  it("prints one line per skill with copies removed or kept, and nothing for a skill with neither", () => {
    expect(
      movedSkillLines([
        { id: "design-system-detect", pack: "frontend", removed: ["a/SKILL.md", "b/SKILL.md"], kept: ["c/SKILL.md"] },
        { id: "browser-evidence", pack: "frontend", removed: [], kept: [] },
      ]),
    ).toEqual([
      // TEST CHANGE, justified (review/9, review/10): one kept copy reads
      // "wrote it", the signed-off wording.
      "  moved: skill st-design-system-detect left the core for the frontend pack in 1.17.0; its copies were removed: a/SKILL.md, b/SKILL.md; kept — edited since sync wrote it; delete by hand: c/SKILL.md. " + KEEP_IT,
    ]);
    expect(movedSkillLines([])).toEqual([]);
  });

  it("names refused copies apart from kept ones, and tells the reader to delete only the kept ones", () => {
    const [line] = movedSkillLines([
      {
        id: "browser-evidence",
        pack: "frontend",
        removed: [],
        kept: ["a/SKILL.md", "b/SKILL.md"],
        skipped: ["c/SKILL.md", "d/SKILL.md"],
      },
    ]);
    expect(line).toBe(
      "  moved: skill st-browser-evidence left the core for the frontend pack in 1.17.0; its copies were kept — edited since sync wrote them; delete by hand: a/SKILL.md, b/SKILL.md; left in place — the sweep refused each path as unsafe to touch, for the reason the reclaim report gives: c/SKILL.md, d/SKILL.md. " + KEEP_IT,
    );
    expect(movedSkillLines([{ id: "browser-evidence", pack: "frontend", removed: [], kept: [], skipped: [] }])).toEqual([]);
  });

  it("names kept copies whose rows do not record the frozen digest with the sweep's hedge, apart from edited ones", () => {
    const [line] = movedSkillLines([
      {
        id: "browser-evidence",
        pack: "frontend",
        removed: [],
        kept: ["a/SKILL.md"],
        keptForeign: ["b/SKILL.md", "c/SKILL.md"],
      },
    ]);
    expect(line).toBe(
      "  moved: skill st-browser-evidence left the core for the frontend pack in 1.17.0; its copies were kept — edited since sync wrote it; delete by hand: a/SKILL.md; kept — their ledger rows do not record the last core rendering; delete each by hand only if it is yours to remove: b/SKILL.md, c/SKILL.md. " + KEEP_IT,
    );
    expect(movedSkillLines([{ id: "browser-evidence", pack: "frontend", removed: [], kept: [], keptForeign: [] }])).toEqual([]);
  });
});
