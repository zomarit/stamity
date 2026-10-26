import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../../../src/cli.ts";
import { checkPackCatalog } from "../../../src/cli/commands/check.ts";
import { applySync, planSync } from "../../../src/cli/commands/sync/engine.ts";
import { runUpgrade, type UpgradeDeps, type UpgradeInput } from "../../../src/cli/commands/upgrade.ts";
import { createApp } from "../../../src/index.ts";
import { createManifest, manifestPath, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../../src/pack/install.ts";
import { computeAggregateContentSha } from "../../../src/pack/trust.ts";
import type { Tool } from "../../../src/types/core.ts";
import type { AutonomyConfig } from "../../../src/types/manifest.ts";
import { canonical, npxCommandOf } from "../../support/identity.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * `upgrade` (REQ-FLOW-034) over the real sync engine and the real corpus, in
 * temp directories: the verb is judged by the bytes it leaves (the pin, the
 * manifest, the user state it must not touch) and by what each refusal says,
 * neither of which a stubbed engine would prove. Nothing is mocked: the deps
 * are the engine's own functions and the real filesystem.
 *
 * The fixture is a setup written by the release before the running one (`FROM`,
 * one minor below `V`), so every sync this file runs moves real bytes: the
 * pinned calls the emitted files carry name the writer's version.
 */

const tempDir = useTempDir("stamity-upgrade");

const ID = canonical();
/** The running release: this checkout's version. */
const V = ID.version;
const PARSED = semver.parse(V);
if (PARSED === null || PARSED.minor === 0) {
  throw new Error(`upgrade.test.ts needs a running version with a minor above 0, not ${V}: pick another FROM`);
}
/** The release that wrote the fixture: one minor below the running one, same major. */
const FROM = `${PARSED.major}.${PARSED.minor - 1}.0`;
/** A release after the running one in its major, which only that release moves to. */
const NEXT_MINOR = `${PARSED.major}.${PARSED.minor + 1}.0`;
/** A release in the next major. */
const OTHER_MAJOR = `${PARSED.major + 1}.0.0`;
const T0 = new Date("2026-01-01T00:00:00.000Z");

/** The user state no upgrade may touch (REQ-FLOW-034). */
const USER_STATE: Record<string, string> = {
  ".stamity/learnings/2026-01-01-cache.md": "---\nsummary: a learning\n---\nThe cache is per package.\n",
  ".stamity/handoffs/h-1.md": "---\nid: h-1\n---\nPick up here.\n",
  ".stamity/overrides/rules/house.md": "---\nid: house\ntype: rule\n---\nOur house rule.\n",
  ".stamity/runs/2026-01-01_r/ledger.jsonl": '{"id":"r/1"}\n',
};

const pkgJson = (deps: Record<string, Record<string, string>>): string =>
  `${JSON.stringify({ name: "fixture-repo", private: true, ...deps }, null, 2)}\n`;

const DEFAULT_PIN = { devDependencies: { [ID.name]: FROM } };

interface Fixture {
  tools?: Tool[];
  autonomy?: AutonomyConfig;
  /** The root `package.json` text; `null` writes none. */
  packageJson?: string | null;
}

/** A setup written by {@link FROM}: its manifest, one real sync at FROM, the user state and a `package.json`. */
async function seedSetup(handle: TempDirHandle, fixture: Fixture = {}): Promise<string> {
  const root = handle.dir;
  const base = createManifest({
    tools: fixture.tools ?? ["claude"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: FROM,
    now: T0,
  });
  await writeManifest(root, fixture.autonomy === undefined ? base : { ...base, autonomy: fixture.autonomy }, { now: T0 });
  const plan = await planSync(root, FROM, {});
  const first = await applySync(root, plan, { engineVersion: FROM, force: false, dryRun: false, now: T0 });
  expect(first.refused, "fixture: the first sync must write everything").toEqual([]);
  await handle.seedFiles(USER_STATE);
  const text = fixture.packageJson === undefined ? pkgJson(DEFAULT_PIN) : fixture.packageJson;
  if (text !== null) await writeFile(join(root, "package.json"), text);
  return root;
}

function input(rootDir: string, over: Partial<UpgradeInput> = {}): UpgradeInput {
  return {
    rootDir,
    to: V,
    runningVersion: V,
    packageName: ID.name,
    registry: ID.registry ?? null,
    npmChannel: true,
    allowDowngrade: false,
    allowMajor: false,
    loosen: false,
    dryRun: false,
    now: T0,
    ...over,
  };
}

const realDeps: UpgradeDeps = {
  planSync,
  applySync,
  packCatalog: checkPackCatalog,
  readFile: async (path) => (existsSync(path) ? await readFile(path, "utf8") : null),
  writeFile: (path, text) => writeFile(path, text),
};

/** Every file under `root`, path -> sha256, sorted: the byte-identity check. */
async function treeDigest(root: string, rel = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
    const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
    // oxlint-disable-next-line no-await-in-loop -- a bounded tree walk
    if (entry.isDirectory()) Object.assign(out, await treeDigest(root, next));
    // oxlint-disable-next-line no-await-in-loop -- a bounded tree walk
    else out[next] = createHash("sha256").update(await readFile(join(root, next))).digest("hex");
  }
  return out;
}

async function userState(root: string): Promise<string[]> {
  return Promise.all(Object.keys(USER_STATE).map((rel) => readFile(join(root, rel), "utf8")));
}

/** The error `runUpgrade` throws, so its fields can be read. */
async function refusalOf(promise: Promise<unknown>): Promise<{ code: string; message: string; next?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; message: string; next?: string };
  }
  throw new Error("expected the upgrade to refuse");
}

describe("upgrade — moves a setup to the running release", () => {
  it("runs this release's sync, moves only the pin, and leaves the user state byte-identical", async () => {
    const handle = tempDir();
    const root = await seedSetup(handle);
    const pkgBefore = await readFile(join(root, "package.json"), "utf8");
    const stateBefore = await userState(root);
    const before = await treeDigest(root);

    const report = await runUpgrade(input(root), realDeps);

    expect(report.from).toBe(FROM);
    expect(report.to).toBe(V);
    expect(report.refused).toEqual([]);
    // `changed` names exactly the emitted files whose bytes moved. A `.bak` is the
    // overwrite's own copy where no git vouches for the previous bytes, not an emitted file.
    const after = await treeDigest(root);
    const moved = Object.keys(after).filter(
      (path) =>
        after[path] !== before[path] && path !== "package.json" && !path.startsWith(".stamity/") && !path.endsWith(".bak"),
    );
    expect(moved.length).toBeGreaterThan(0);
    expect(report.changed.filter((path) => !path.startsWith(".stamity/")).toSorted()).toEqual(moved.toSorted());
    expect(report.noop).toBe(false);
    expect(report.pin).toEqual({ field: "devDependencies", from: FROM, to: V });
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(pkgBefore.replace(`"${FROM}"`, `"${V}"`));
    expect((await readManifest(root))?.generatedBy).toBe(V);
    expect(await userState(root)).toEqual(stateBefore);
  });

  it("reports a second run as a no-op", async () => {
    const root = await seedSetup(tempDir());
    await runUpgrade(input(root), realDeps);
    const manifestBefore = await readFile(manifestPath(root), "utf8");

    // TEST CHANGE, justified: REQ-FLOW-032 — a no-op upgrade leaves the manifest
    // byte-identical. The second run's clock is a day later, so a restamp would show.
    const again = await runUpgrade(input(root, { now: new Date("2026-01-02T00:00:00.000Z") }), realDeps);

    expect(again.changed).toEqual([]);
    expect(again.pin).toEqual({ field: "devDependencies", from: V, to: V });
    expect(again.noop).toBe(true);
    expect(await readFile(manifestPath(root), "utf8")).toBe(manifestBefore);
  });

  it("moves a caret pin and keeps the caret", async () => {
    const root = await seedSetup(tempDir(), { packageJson: pkgJson({ devDependencies: { [ID.name]: `^${FROM}` } }) });

    const report = await runUpgrade(input(root), realDeps);

    expect(report.pin).toEqual({ field: "devDependencies", from: `^${FROM}`, to: `^${V}` });
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).devDependencies[ID.name]).toBe(`^${V}`);
  });

  it("moves a pin under dependencies when only that section lists the package", async () => {
    const root = await seedSetup(tempDir(), { packageJson: pkgJson({ dependencies: { [ID.name]: FROM } }) });

    const report = await runUpgrade(input(root), realDeps);

    expect(report.pin).toEqual({ field: "dependencies", from: FROM, to: V });
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).dependencies[ID.name]).toBe(V);
  });

  it("leaves a `latest` spec as it is and says why", async () => {
    const text = pkgJson({ devDependencies: { [ID.name]: "latest" } });
    const root = await seedSetup(tempDir(), { packageJson: text });

    const report = await runUpgrade(input(root), realDeps);

    expect(report.pin).toBeNull();
    expect(report.pinNote).toContain('"latest"');
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(text);
    expect((await readManifest(root))?.generatedBy).toBe(V);
  });

  it("creates no package.json where there is none", async () => {
    const root = await seedSetup(tempDir(), { packageJson: null });

    const report = await runUpgrade(input(root), realDeps);

    expect(report.pin).toBeNull();
    expect(existsSync(join(root, "package.json"))).toBe(false);
    expect(report.changed.length).toBeGreaterThan(0);
  });

  it("says a workspace monorepo's root pin is the only one it moves", async () => {
    const text = `${JSON.stringify({ name: "mono", private: true, workspaces: ["packages/*"], ...DEFAULT_PIN }, null, 2)}\n`;
    const root = await seedSetup(tempDir(), { packageJson: text });

    const report = await runUpgrade(input(root), realDeps);

    expect(report.pin?.to).toBe(V);
    expect(report.notices.some((line) => line.includes("root package.json pin only"))).toBe(true);
  });

  it("writes nothing under --dry-run, and still says what it would move", async () => {
    const root = await seedSetup(tempDir());
    const before = await treeDigest(root);

    const report = await runUpgrade(input(root, { dryRun: true }), realDeps);

    expect(report.dryRun).toBe(true);
    expect(report.changed.length).toBeGreaterThan(0);
    expect(report.pin).toEqual({ field: "devDependencies", from: FROM, to: V });
    expect(await treeDigest(root)).toEqual(before);
  });

  it("tells a Codex setup to review its hooks in /hooks", async () => {
    const root = await seedSetup(tempDir(), { tools: ["codex"] });

    const report = await runUpgrade(input(root), realDeps);

    expect(report.notices.some((line) => line.includes("`/hooks`"))).toBe(true);
  });

  it("passes a stale catalog pack's re-add on as a notice", async () => {
    const handle = tempDir();
    const root = await seedSetup(handle);
    // A catalog id at the catalog tier over content that is not the copy this
    // release bundles: the `pack-catalog` row's warn case.
    const body = "---\nid: stale-cmd\ntype: command\ndescription: fixture command\n---\n\n# Stale\n\nCommand body.\n";
    const integrity = { "commands/st-stale-cmd.md": createHash("sha256").update(body, "utf8").digest("hex") };
    await handle.seedFiles({
      "pack-src/frontend/commands/st-stale-cmd.md": body,
      "pack-src/frontend/pack.json": `${JSON.stringify({ name: "frontend", version: "1.0.0", integrity })}\n`,
    });
    const packPlan = await planPackInstall(root, handle.path("pack-src/frontend"), {
      catalogPin: { sha256: computeAggregateContentSha(integrity), tier: "scanned" },
    });
    expect(packPlan.collisions).toEqual([]);
    const seeded = await readManifest(root);
    if (seeded === null) throw new Error("fixture lost its manifest");
    const installed = await applyPackInstall(root, packPlan, seeded, { engineVersion: createApp().version, now: T0 });
    await writeManifest(root, installed.manifest, { now: T0 });

    const report = await runUpgrade(input(root), realDeps);

    expect(report.notices.some((line) => line.includes("add frontend"))).toBe(true);
  });

  it("refuses with the pin unmoved when the sync refuses a path", async () => {
    const root = await seedSetup(tempDir());
    // A file of the owner's at a path the plan writes, with its ledger row gone:
    // the collision gate refuses it, and the rest of the plan is written.
    const taken = ".claude/hooks/stamity/stamity-cloud-readiness.mjs";
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(root, { ...manifest, ledger: manifest.ledger.filter((row) => row.path !== taken) }, { now: T0 });
    await writeFile(join(root, taken), "// the owner's own script\n");
    const pkgBefore = await readFile(join(root, "package.json"), "utf8");

    const report = await runUpgrade(input(root), realDeps);

    expect(report.refused).toEqual([taken]);
    expect(report.pin).toEqual({ field: "devDependencies", from: FROM, to: FROM });
    expect(report.pinNote).toContain("the pin was not moved");
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(pkgBefore);
  });
});

describe("upgrade — refusals write nothing", () => {
  it("prints the pinned call that runs another release's own upgrade", async () => {
    const root = await seedSetup(tempDir());
    const before = await treeDigest(root);

    // TEST CHANGE, justified (review/13): `9.9.9` is another major than the fixture's
    // writer, so its printed call now ends `--allow-major`; this case keeps the same-major
    // form, matched up to the closing backtick, and the next case pins the major one.
    const error = await refusalOf(runUpgrade(input(root, { to: NEXT_MINOR }), realDeps));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain(`\`${npxCommandOf({ ...ID, npmChannel: true, version: NEXT_MINOR }, `upgrade --to ${NEXT_MINOR}`)}\``);
    expect(await treeDigest(root)).toEqual(before);
  });

  it("ends the printed call with --allow-major for another major than the setup's writer (review/13)", async () => {
    const root = await seedSetup(tempDir());
    const before = await treeDigest(root);

    const error = await refusalOf(runUpgrade(input(root, { to: OTHER_MAJOR }), realDeps));
    const offline = await refusalOf(runUpgrade(input(root, { to: OTHER_MAJOR, npmChannel: false }), realDeps));

    expect(error.message).toContain(
      `\`${npxCommandOf({ ...ID, npmChannel: true, version: OTHER_MAJOR }, `upgrade --to ${OTHER_MAJOR} --allow-major`)}\``,
    );
    expect(offline.message).toContain(`\`npx --no ${ID.name} upgrade --to ${OTHER_MAJOR} --allow-major\``);
    expect(await treeDigest(root)).toEqual(before);
  });

  it("refuses a setup naming a client this release has no adapter for in the manifest reader, writing nothing (review/8)", async () => {
    const root = await seedSetup(tempDir());
    const onDisk = JSON.parse(await readFile(manifestPath(root), "utf8")) as Record<string, unknown>;
    await writeFile(manifestPath(root), `${JSON.stringify({ ...onDisk, tools: ["claude", "windsurf"] }, null, 2)}\n`);
    const before = await treeDigest(root);

    // The refusal comes from `readManifest` (step 3), before any plan, so no
    // client-set check after the plan can ever see such a setup.
    const error = await refusalOf(runUpgrade(input(root), realDeps));

    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.message).toContain('`tools` names unknown tool "windsurf"');
    expect(await treeDigest(root)).toEqual(before);
  });

  it("prints the pinned sync for a target older than the first release with upgrade", async () => {
    const root = await seedSetup(tempDir());

    const error = await refusalOf(runUpgrade(input(root, { to: "1.10.0" }), realDeps));

    expect(error.message).toContain(npxCommandOf({ ...ID, npmChannel: true, version: "1.10.0" }, "sync"));
    expect(error.message).not.toContain("upgrade --to 1.10.0");
  });

  it("names the installed copy for a package with no npm channel", async () => {
    const root = await seedSetup(tempDir());

    // TEST CHANGE, justified (review/13): a same-major target, as in the first case of this block.
    const error = await refusalOf(runUpgrade(input(root, { to: NEXT_MINOR, npmChannel: false }), realDeps));

    expect(error.message).toContain(
      `install ${NEXT_MINOR} into this project, then \`npx --no ${ID.name} upgrade --to ${NEXT_MINOR}\``,
    );
  });

  it("refuses a target that is not a version", async () => {
    const root = await seedSetup(tempDir());

    const error = await refusalOf(runUpgrade(input(root, { to: "latest" }), realDeps));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain('"latest" is not a version');
  });

  it("refuses an uninitialised repository and points at init", async () => {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": pkgJson(DEFAULT_PIN) });

    const error = await refusalOf(runUpgrade(input(handle.dir), realDeps));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.next).toContain(npxCommandOf({ ...ID, npmChannel: true }, "init"));
  });

  it("refuses a downgrade without --allow-downgrade", async () => {
    const root = await seedSetup(tempDir());
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(root, { ...manifest, generatedBy: semver.inc(V, "patch") ?? V }, { now: T0 });
    const before = await treeDigest(root);

    const error = await refusalOf(runUpgrade(input(root), realDeps));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.next).toContain("--allow-downgrade");
    expect(await treeDigest(root)).toEqual(before);
  });

  it("refuses a major move without --allow-major, and runs it with the flag", async () => {
    const root = await seedSetup(tempDir());
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    const older = `${PARSED.major === 0 ? 0 : PARSED.major - 1}.9.0`;
    await writeManifest(root, { ...manifest, generatedBy: older }, { now: T0 });
    const before = await treeDigest(root);

    const error = await refusalOf(runUpgrade(input(root), realDeps));

    expect(error.next).toContain("--allow-major");
    expect(await treeDigest(root)).toEqual(before);
    const moved = await runUpgrade(input(root, { allowMajor: true }), realDeps);
    expect(moved.from).toBe(older);
    expect((await readManifest(root))?.generatedBy).toBe(V);
  });

  it("refuses a pin key spelled with a JSON escape before any write", async () => {
    const escaped = ID.name.replace("@", "\\u0040");
    const text = `{\n  "name": "fixture-repo",\n  "devDependencies": {\n    "${escaped}": "${FROM}"\n  }\n}\n`;
    expect(JSON.parse(text).devDependencies[ID.name], "fixture: the escape must spell the package name").toBe(FROM);
    const root = await seedSetup(tempDir(), { packageJson: text });
    const before = await treeDigest(root);

    const error = await refusalOf(runUpgrade(input(root), realDeps));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("in place");
    expect(await treeDigest(root)).toEqual(before);
  });
});

describe("upgrade — the loosen gate (REQ-FLOW-138)", () => {
  it("refuses a manifest looser than the baked guard with AUTONOMY_LOOSENED and writes nothing; --loosen moves", async () => {
    const root = await seedSetup(tempDir(), { autonomy: { mode: "ask" } });
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(root, { ...manifest, autonomy: { mode: "autonomous" } }, { now: T0 });
    const before = await treeDigest(root);

    const error = await refusalOf(runUpgrade(input(root), realDeps));

    expect(error.code).toBe("AUTONOMY_LOOSENED");
    expect(error.next).toContain(`upgrade --to ${V} --loosen`);
    expect(await treeDigest(root)).toEqual(before);
    const preview = await refusalOf(runUpgrade(input(root, { dryRun: true }), realDeps));
    expect(preview.code).toBe("AUTONOMY_LOOSENED");

    const loosened = await runUpgrade(input(root, { loosen: true }), realDeps);

    expect(loosened.refused).toEqual([]);
    expect(loosened.pin?.to).toBe(V);
    expect(loosened.notices.some((line) => line.includes("with --loosen"))).toBe(true);
  });

  it("tightens with no flag", async () => {
    const root = await seedSetup(tempDir(), { autonomy: { mode: "autonomous" } });
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(root, { ...manifest, autonomy: { mode: "ask" } }, { now: T0 });

    const report = await runUpgrade(input(root), realDeps);

    expect(report.pin?.to).toBe(V);
  });
});

describe("upgrade — the verb", () => {
  it("is registered: `upgrade --help` exits 0 and names --to", async () => {
    const handle = tempDir();

    const result = await runInProcess(COMMANDS, ["upgrade", "--help"], { cwd: handle.dir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--to <version>");
    expect(result.stdout).toContain("--loosen");
    expect(result.stdout).not.toContain("--allow-client-change");
  });

  it("offers no --allow-client-change: the flag is an unknown option, exit 2 (review/8)", async () => {
    const root = await seedSetup(tempDir());
    const before = await treeDigest(root);

    const result = await runInProcess(COMMANDS, ["upgrade", "--to", V, "--allow-client-change"], {
      cwd: root,
      env: { STAMITY_NO_CLIENT_PROBE: "1" },
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--allow-client-change");
    expect(await treeDigest(root)).toEqual(before);
  });

  it("exits 2 without --to", async () => {
    const handle = tempDir();

    const result = await runInProcess(COMMANDS, ["upgrade"], { cwd: handle.dir });

    expect(result.code).toBe(2);
  });

  it("runs end to end through the command and prints the pin it moved", async () => {
    const root = await seedSetup(tempDir());

    const result = await runInProcess(COMMANDS, ["upgrade", "--to", V], {
      cwd: root,
      env: { STAMITY_NO_CLIENT_PROBE: "1" },
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(`pin: package.json devDependencies moved ${FROM} -> ${V}`);
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).devDependencies[ID.name]).toBe(V);
  });
});
