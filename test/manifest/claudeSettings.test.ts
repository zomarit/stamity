import { link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claudeSettingsReclaimReducer,
  engineOwnedSettingsKeys,
  materializeClaudeSettings,
  planClaudeSettings,
  predictClaudeSettingsMerge,
  reduceClaudeSettingsToForeignContent,
} from "../../src/manifest/claudeSettings.ts";
import type * as AtomicWrite from "../../src/merge/atomicWrite.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The write substrate is counted, not stubbed — the same technique
 * `./mcpFilter.test.ts` uses: every case still lands through the real
 * temp+rename writer, and the counter turns "left the file alone" into an
 * assertion rather than an inference from unchanged bytes.
 */
const writes = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock("../../src/merge/atomicWrite.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof AtomicWrite>();
  return {
    ...actual,
    atomicWriteFile: async (path: string, content: string, opts?: AtomicWrite.AtomicWriteOptions): Promise<void> => {
      writes.paths.push(path);
      await actual.atomicWriteFile(path, content, opts);
    },
  };
});

const getRepo = useTempDir("claude-settings");

beforeEach(() => {
  writes.paths.length = 0;
});

const doc = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const PERMISSIONS = { allow: ["Read", "Grep", "Glob"] };
const HOOKS = { SessionStart: [{ hooks: [{ type: "command", command: "node x.mjs" }] }] };
/** The repository-mode rendering: both engine keys. */
const EMITTED_FULL = doc({ permissions: PERMISSIONS, hooks: HOOKS });
/** The plugin-mode rendering: the permissions half alone. */
const EMITTED_PLUGIN = doc({ permissions: PERMISSIONS });
/** The client's own project-scope install write, as measured. */
const CLIENT = doc({ enabledPlugins: { "stamity@stamity": true } });

const UNOWNED = { owned: false, force: false };
const OWNED = { owned: true, force: false };
const FORCED = { owned: false, force: true };

describe("engineOwnedSettingsKeys", () => {
  it("names exactly the rendering's top-level keys, in its order", () => {
    expect(engineOwnedSettingsKeys("x", EMITTED_FULL)).toEqual(["permissions", "hooks"]);
    expect(engineOwnedSettingsKeys("x", EMITTED_PLUGIN)).toEqual(["permissions"]);
  });

  it("fails loudly on an emission that is not a JSON object — that is an engine bug", () => {
    expect(() => engineOwnedSettingsKeys("x", "[]")).toThrow(EngineError);
    expect(() => engineOwnedSettingsKeys("x", "{ nope")).toThrow(/emitted settings document is not valid JSON/);
    expect(() => planClaudeSettings("x", "null", null, UNOWNED)).toThrow(/expected a JSON object/);
  });
});

describe("planClaudeSettings", () => {
  it("creates the rendering when nothing is there", () => {
    expect(planClaudeSettings("x", EMITTED_PLUGIN, null, UNOWNED)).toEqual({
      result: { path: "x", action: "created" },
      content: EMITTED_PLUGIN,
      backup: null,
      collision: null,
    });
  });

  it("adopts a client-written file: foreign keys kept in place, the engine's appended, with a notice", () => {
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, CLIENT, UNOWNED);

    expect(plan.result.action).toBe("updated");
    expect(plan.result.notice).toContain("kept its 1 other top-level key(s) (enabledPlugins)");
    expect(plan.content).toBe(doc({ enabledPlugins: { "stamity@stamity": true }, permissions: PERMISSIONS }));
    expect(plan.backup).toBeNull();
    expect(plan.collision).toBeNull();
  });

  it("replaces an engine-owned key in place and keeps every other key's position and bytes", () => {
    const existing = doc({ model: "opus", permissions: { allow: ["Bash"] }, env: { A: "1" }, hooks: {} });

    const plan = planClaudeSettings("x", EMITTED_FULL, existing, OWNED);

    expect(plan.result).toEqual({ path: "x", action: "updated" });
    expect(plan.content).toBe(doc({ model: "opus", permissions: PERMISSIONS, env: { A: "1" }, hooks: HOOKS }));
  });

  it("reports unchanged, with nothing to write, when the file already holds the merged result", () => {
    const merged = doc({ permissions: PERMISSIONS, enabledPlugins: { "x@y": true } });
    expect(planClaudeSettings("x", EMITTED_PLUGIN, merged, OWNED)).toEqual({
      result: { path: "x", action: "unchanged" },
      content: null,
      backup: null,
      collision: null,
    });
    // No notice on a no-op adoption either: nothing was written.
    expect(planClaudeSettings("x", EMITTED_PLUGIN, merged, UNOWNED).result).toEqual({ path: "x", action: "unchanged" });
  });

  it("leaves a plugin-mode file's own hooks key alone: the engine renders none, so it is foreign", () => {
    const existing = doc({ hooks: { Stop: [] }, permissions: { allow: ["Read"] } });

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, OWNED);

    expect(plan.content).toBe(doc({ hooks: { Stop: [] }, permissions: PERMISSIONS }));
  });

  it("refuses an unowned file whose engine-owned key differs, naming the key and both remedies", () => {
    const existing = doc({ permissions: { allow: ["Bash"] }, model: "opus" });

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, UNOWNED);

    expect(plan.result.action).toBe("skipped");
    expect(plan.result.warning).toContain("carries a permissions key this engine renders");
    expect(plan.result.warning).toContain("force");
    expect(plan.content).toBeNull();
    expect(plan.collision).toBe(plan.result.warning);
  });

  it("adopts an unowned file whose engine-owned key already equals the rendering", () => {
    const existing = doc({ permissions: PERMISSIONS, model: "opus" });
    expect(planClaudeSettings("x", EMITTED_PLUGIN, existing, UNOWNED).result.action).toBe("unchanged");
  });

  it("under force, replaces the disputed key behind a backup and keeps the other keys", () => {
    const existing = doc({ permissions: { allow: ["Bash"] }, model: "opus" });

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, FORCED);

    expect(plan.result.action).toBe("updated");
    expect(plan.result.warning).toContain("Force-replaced the permissions key(s)");
    expect(plan.result.warning).toContain("(model) was kept");
    expect(plan.content).toBe(doc({ permissions: PERMISSIONS, model: "opus" }));
    expect(plan.backup).toBe(existing);
  });

  it("under force with no foreign key, says so rather than listing none", () => {
    const existing = doc({ permissions: { allow: ["Bash"] } });
    expect(planClaudeSettings("x", EMITTED_PLUGIN, existing, FORCED).result.warning).toContain("(none) was kept");
  });

  it("refuses a file that is not a JSON object, and replaces it whole only under force", () => {
    for (const raw of ["{ nope\n", "[]\n", "null\n", '"text"\n']) {
      const refused = planClaudeSettings("x", EMITTED_PLUGIN, raw, OWNED);
      expect(refused.result.action, raw).toBe("skipped");
      expect(refused.result.warning, raw).toContain("not valid JSON");
      expect(refused.collision, raw).toBe(refused.result.warning);

      const forced = planClaudeSettings("x", EMITTED_PLUGIN, raw, FORCED);
      expect(forced.result.action, raw).toBe("updated");
      expect(forced.result.warning, raw).toContain("Force-overwrote");
      expect(forced.content, raw).toBe(EMITTED_PLUGIN);
      expect(forced.backup, raw).toBe(raw);
    }
  });
});

describe("materializeClaudeSettings", () => {
  it("creates the file when nothing is there", async () => {
    const path = getRepo().path(".claude/settings.json");

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, UNOWNED);

    expect(result).toEqual({ path, action: "created", writtenContent: EMITTED_PLUGIN });
    expect(await readFile(path, "utf8")).toBe(EMITTED_PLUGIN);
  });

  it("merges into a client-written file and hands back the merged bytes for the ledger", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await repo.seedFiles({ ".claude/settings.json": CLIENT });

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, { ...UNOWNED, boundaryDir: repo.dir });

    const expected = doc({ enabledPlugins: { "stamity@stamity": true }, permissions: PERMISSIONS });
    expect(result.action).toBe("updated");
    expect(result.writtenContent).toBe(expected);
    expect(await readFile(path, "utf8")).toBe(expected);
    expect(writes.paths).toEqual([path]);
  });

  it("does not rewrite a file that already holds the merged result, and still reports its bytes", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await repo.seedFiles({ ".claude/settings.json": EMITTED_PLUGIN });

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, OWNED);

    expect(result).toEqual({ path, action: "unchanged", writtenContent: EMITTED_PLUGIN });
    expect(writes.paths).toEqual([]);
  });

  it("skips a contested file and reports no written bytes", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    const existing = doc({ permissions: { allow: ["Bash"] } });
    await repo.seedFiles({ ".claude/settings.json": existing });

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, UNOWNED);

    expect(result.action).toBe("skipped");
    expect(result.writtenContent).toBeNull();
    expect(writes.paths).toEqual([]);
    expect(await readFile(path, "utf8")).toBe(existing);
  });

  it("under force, backs the previous file up, names the .bak, and writes the merge", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    const existing = doc({ permissions: { allow: ["Bash"] }, model: "opus" });
    await repo.seedFiles({ ".claude/settings.json": existing });

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, { ...FORCED, boundaryDir: repo.dir });

    expect(result.action).toBe("updated");
    expect(result.warning).toContain(`Your previous file is at ${path}.bak`);
    expect(await readFile(`${path}.bak`, "utf8")).toBe(existing);
    expect(await readFile(path, "utf8")).toBe(doc({ permissions: PERMISSIONS, model: "opus" }));
  });
});

describe.skipIf(process.platform === "win32")("linked target refusal", () => {
  async function plantTarget(): Promise<{ target: string; outside: string }> {
    const repo = getRepo();
    const outside = repo.path("outside/credentials.json");
    await repo.seedFiles({ "outside/credentials.json": doc({ client_secret: "s3cret" }) });
    await mkdir(repo.path(".claude"), { recursive: true });
    return { target: repo.path(".claude/settings.json"), outside };
  }

  it("refuses to merge into a symbolic link, writing nothing", async () => {
    const { target, outside } = await plantTarget();
    await symlink(outside, target);

    await expect(materializeClaudeSettings(target, EMITTED_PLUGIN, OWNED)).rejects.toThrow(/symbolic link/);
    expect(writes.paths).toEqual([]);
    expect(await readFile(outside, "utf8")).toBe(doc({ client_secret: "s3cret" }));

    const predicted = await predictClaudeSettingsMerge(target, EMITTED_PLUGIN, OWNED);
    expect(predicted.result.action).toBe("skipped");
    expect(predicted.collision?.kind).toBe("shared-name");
  });

  it("refuses to merge into a hard link, and says force does not help", async () => {
    const { target, outside } = await plantTarget();
    await link(outside, target);

    await expect(materializeClaudeSettings(target, EMITTED_PLUGIN, FORCED)).rejects.toThrow(/hard link/);
    expect(writes.paths).toEqual([]);

    const predicted = await predictClaudeSettingsMerge(target, EMITTED_PLUGIN, OWNED);
    expect(predicted.collision?.kind).toBe("shared-name");
    expect(predicted.collision?.detail).toContain("force does not help");
  });
});

describe("predictClaudeSettingsMerge", () => {
  it("previews created, unchanged and the unmanaged-name collision without writing", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await mkdir(repo.path(".claude"), { recursive: true });

    expect((await predictClaudeSettingsMerge(path, EMITTED_PLUGIN, UNOWNED)).result.action).toBe("created");

    await writeFile(path, EMITTED_PLUGIN, "utf8");
    expect(await predictClaudeSettingsMerge(path, EMITTED_PLUGIN, OWNED)).toEqual({
      result: { path, action: "unchanged" },
      collision: null,
    });

    await writeFile(path, doc({ hooks: { Stop: [] }, permissions: { allow: ["Bash"] } }), "utf8");
    const contested = await predictClaudeSettingsMerge(path, EMITTED_FULL, UNOWNED);
    expect(contested.result.action).toBe("skipped");
    expect(contested.collision).toEqual({ kind: "unmanaged-name", detail: contested.result.warning });
    expect(contested.collision?.detail).toContain("permissions, hooks key");
    expect(writes.paths).toEqual([]);
  });

  it("propagates a read failure that is not a link refusal", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".claude/settings.json/.keep": "" });
    // A directory at the path: `lstat` succeeds, the read fails with EISDIR.
    await expect(predictClaudeSettingsMerge(repo.path(".claude/settings.json"), EMITTED_PLUGIN, OWNED)).rejects.toThrow(/EISDIR/);
  });
});

describe("reduceClaudeSettingsToForeignContent", () => {
  const BOTH = ["permissions", "hooks"];

  it("strips the engine's keys and keeps the rest verbatim", () => {
    const raw = doc({ enabledPlugins: { "x@y": true }, permissions: PERMISSIONS, model: "opus", hooks: HOOKS });

    const reduction = reduceClaudeSettingsToForeignContent(raw, BOTH);

    expect(reduction.kind).toBe("reduced");
    expect(reduction.kind === "reduced" && reduction.content).toBe(doc({ enabledPlugins: { "x@y": true }, model: "opus" }));
    expect(reduction.detail).toContain("(permissions, hooks) were removed");
    expect(reduction.detail).toContain("(enabledPlugins, model) are kept");
  });

  it("keeps a plugin-mode file's own hooks key when only permissions is the engine's", () => {
    const raw = doc({ permissions: PERMISSIONS, hooks: { Stop: [] } });
    const reduction = claudeSettingsReclaimReducer(["permissions"])(raw);
    expect(reduction.kind === "reduced" && reduction.content).toBe(doc({ hooks: { Stop: [] } }));
  });

  it("reports engine-only when nothing else is in the file", () => {
    expect(reduceClaudeSettingsToForeignContent(doc({ permissions: PERMISSIONS }), BOTH)).toMatchObject({
      kind: "engine-only",
    });
  });

  it("claims nothing in a file holding none of the engine's keys", () => {
    const reduction = reduceClaudeSettingsToForeignContent(CLIENT, BOTH);
    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("none of the keys this engine writes (permissions, hooks)");
  });

  it("never claims a file it cannot parse", () => {
    const reduction = reduceClaudeSettingsToForeignContent("{ nope", BOTH);
    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("not valid JSON");
  });
});
