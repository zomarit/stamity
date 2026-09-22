import { link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claudeSettingsReclaimReducer,
  materializeClaudeSettings,
  planClaudeSettings,
  predictClaudeSettingsMerge,
  reduceClaudeSettingsToForeignContent,
  type SettingsOwnership,
} from "../../src/manifest/claudeSettings.ts";
import type * as AtomicWrite from "../../src/merge/atomicWrite.ts";
import { ledgerHashIndex } from "../../src/merge/safeWrite.ts";
import { EngineError } from "../../src/types/errors.ts";
import { sha256 } from "../../src/cli/engine/emissionWrite.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The write substrate is counted, not stubbed — the same technique
 * `./mcpFilter.test.ts` uses: every case still lands through the real
 * temp+rename writer, and the counter turns "left the file alone" into an
 * assertion rather than an inference from unchanged bytes. The lane writes
 * under its own lock, so it is the UNLOCKED body that is counted.
 */
const writes = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock("../../src/merge/atomicWrite.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof AtomicWrite>();
  return {
    ...actual,
    atomicWriteFileUnlocked: async (
      path: string,
      content: string,
      opts?: AtomicWrite.AtomicWriteOptions,
    ): Promise<void> => {
      writes.paths.push(path);
      await actual.atomicWriteFileUnlocked(path, content, opts);
    },
  };
});

const getRepo = useTempDir("claude-settings");

beforeEach(() => {
  writes.paths.length = 0;
});

const doc = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const PERMISSIONS = { allow: ["Read", "Grep", "Glob"] };
/** A hooks object as the engine renders it in repository mode: every command runs a generated script. */
const ENGINE_HOOKS = {
  SessionStart: [
    { hooks: [{ type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/stamity-session-start.mjs"' }] },
  ],
};
/** An older repository-mode rendering: a different row set, still the engine's by its commands. */
const OLDER_ENGINE_HOOKS = {
  PreToolUse: [
    { matcher: "Bash", hooks: [{ type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs"' }] },
  ],
};
/** The engine's rendering with an operator's own row added inside it — a MIXED object. */
const MIXED_HOOKS = {
  ...ENGINE_HOOKS,
  Stop: [{ hooks: [{ type: "command", command: "node scripts/notify.mjs" }] }],
};
/** An operator's own hooks: no command under the engine's generated directory. */
const OPERATOR_HOOKS = { Stop: [{ hooks: [{ type: "command", command: "node scripts/notify.mjs" }] }] };

/** The repository-mode rendering: both engine keys. */
const EMITTED_FULL = doc({ permissions: PERMISSIONS, hooks: ENGINE_HOOKS });
/** The plugin-mode rendering: the permissions half alone. */
const EMITTED_PLUGIN = doc({ permissions: PERMISSIONS });
/** The client's own project-scope install write, as measured. */
const CLIENT = doc({ enabledPlugins: { "stamity@stamity": true } });

const REPO_KEYS = ["permissions", "hooks"] as const;
const PLUGIN_KEYS = ["permissions"] as const;

function own(
  ownedKeys: readonly string[],
  over: Partial<SettingsOwnership> = {},
): SettingsOwnership {
  return { owned: false, force: false, ownedKeys, ...over };
}

/** A ledger hash index recording exactly `bytes` at the settings path under `root`. */
function ledgered(root: string, bytes: string): ReadonlyMap<string, ReadonlySet<string>> {
  return ledgerHashIndex(root, [{ path: ".claude/settings.json", contentHash: sha256(bytes) }]);
}

const ROOT = "/repo";
const PATH = join(ROOT, ".claude", "settings.json");

describe("planClaudeSettings — the rendering", () => {
  it("fails loudly on an emission that is not a JSON object — that is an engine bug", () => {
    expect(() => planClaudeSettings("x", "[]", null, own(PLUGIN_KEYS))).toThrow(EngineError);
    expect(() => planClaudeSettings("x", "{ nope", null, own(PLUGIN_KEYS))).toThrow(/emitted settings document is not valid JSON/);
    expect(() => planClaudeSettings("x", "null", null, own(PLUGIN_KEYS))).toThrow(/expected a JSON object/);
  });

  it("creates the rendering when nothing is there", () => {
    expect(planClaudeSettings("x", EMITTED_PLUGIN, null, own(PLUGIN_KEYS))).toEqual({
      result: { path: "x", action: "created" },
      content: EMITTED_PLUGIN,
      backup: null,
      collision: null,
    });
  });
});

describe("planClaudeSettings — foreign keys", () => {
  it("adopts a client-written file: foreign keys kept in place, the engine's appended, with a notice", () => {
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, CLIENT, own(PLUGIN_KEYS));

    expect(plan.result.action).toBe("updated");
    expect(plan.result.notice).toContain("kept its 1 other top-level key(s) (enabledPlugins)");
    expect(plan.content).toBe(doc({ enabledPlugins: { "stamity@stamity": true }, permissions: PERMISSIONS }));
    expect(plan.backup).toBeNull();
    expect(plan.collision).toBeNull();
  });

  it("replaces an engine-owned key in place and keeps every other key's position and value", () => {
    // Unedited by the ledger's compare — the bytes match the recorded hash —
    // so the engine's keys are regenerated silently.
    const existing = doc({ model: "opus", permissions: { allow: ["Bash"] }, env: { A: "1" }, hooks: ENGINE_HOOKS });

    const plan = planClaudeSettings(PATH, EMITTED_FULL, existing, own(REPO_KEYS, { owned: true, ledgerHashes: ledgered(ROOT, existing) }));

    expect(plan.result).toEqual({ path: PATH, action: "updated" });
    expect(plan.content).toBe(doc({ model: "opus", permissions: PERMISSIONS, env: { A: "1" }, hooks: ENGINE_HOOKS }));
  });

  it("reports unchanged, with nothing to write, when the file already holds the merged result", () => {
    const merged = doc({ permissions: PERMISSIONS, enabledPlugins: { "x@y": true } });
    expect(planClaudeSettings("x", EMITTED_PLUGIN, merged, own(PLUGIN_KEYS, { owned: true }))).toEqual({
      result: { path: "x", action: "unchanged" },
      content: null,
      backup: null,
      collision: null,
    });
    expect(planClaudeSettings("x", EMITTED_PLUGIN, merged, own(PLUGIN_KEYS)).result).toEqual({ path: "x", action: "unchanged" });
  });

  it("round-trips a foreign __proto__ key instead of dropping it while claiming it was kept", () => {
    const existing = '{\n  "__proto__": {\n    "polluted": true\n  },\n  "model": "opus"\n}\n';

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS));

    expect(plan.result.notice).toContain("(__proto__, model)");
    expect(plan.content).toContain('"__proto__": {\n    "polluted": true\n  }');
    const reduction = reduceClaudeSettingsToForeignContent(plan.content ?? "", PLUGIN_KEYS);
    expect(reduction.kind === "reduced" && reduction.content).toBe(existing);
  });

  it("keeps the file's own CRLF line ending: compares in it, writes in it, so a Windows checkout stays clean", () => {
    const crlf = doc({ permissions: PERMISSIONS, enabledPlugins: { "x@y": true } }).replaceAll("\n", "\r\n");
    expect(planClaudeSettings("x", EMITTED_PLUGIN, crlf, own(PLUGIN_KEYS, { owned: true })).result.action).toBe("unchanged");

    const stale = doc({ permissions: { allow: ["Read"] }, enabledPlugins: { "x@y": true } }).replaceAll("\n", "\r\n");
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, stale, own(PLUGIN_KEYS, { owned: true }));
    expect(plan.result.action).toBe("updated");
    expect(plan.content).toBe(crlf);
    expect(plan.content).not.toMatch(/[^\r]\n/);
  });

  it("strips a leading byte-order mark before parsing, so a BOM'd file is adopted rather than refused", () => {
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, `﻿${CLIENT}`, own(PLUGIN_KEYS));
    expect(plan.result.action).toBe("updated");
    expect(plan.content).toBe(doc({ enabledPlugins: { "stamity@stamity": true }, permissions: PERMISSIONS }));
  });

  it("classifies a document it cannot serialise back (nesting past the stack) as a collision, never a thrown error", () => {
    const depth = 200_000;
    const existing = `{"permissions": ${JSON.stringify(PERMISSIONS)}, "deep": ${"[".repeat(depth)}${"]".repeat(depth)}}`;

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS, { owned: true }));

    expect(plan.result.action).toBe("skipped");
    expect(plan.result.warning).toContain("not a settings document this engine can merge");
    expect(plan.collision).toBe(plan.result.warning);
    const forced = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS, { force: true }));
    expect(forced.result.action).toBe("updated");
    expect(forced.content).toBe(EMITTED_PLUGIN);
    expect(forced.backup).toBe(existing);
  });
});

describe("planClaudeSettings — the hooks key across install modes", () => {
  it("removes a stale repository-mode hooks rendering from a plugin-mode file behind a backup and reports it, ledgered or not", () => {
    // Recognition WIDENS what the engine may touch — never past a backup: no
    // predicate can tell the engine's rows from an operator's inside one object.
    const existing = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS, enabledPlugins: { "x@y": true } });

    for (const owned of [false, true]) {
      const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS, { owned }));
      expect(plan.result.action, `owned=${owned}`).toBe("updated");
      expect(plan.result.warning, `owned=${owned}`).toContain("Removed the repository-mode hooks");
      expect(plan.result.warning, `owned=${owned}`).toContain(".claude/settings.local.json");
      expect(plan.content, `owned=${owned}`).toBe(doc({ permissions: PERMISSIONS, enabledPlugins: { "x@y": true } }));
      expect(plan.backup, `owned=${owned}`).toBe(existing);
      expect(plan.collision, `owned=${owned}`).toBeNull();
    }
  });

  it("removes a MIXED hooks object from a plugin-mode file behind a backup with the warning — never dropped silently, never a collision", () => {
    const existing = doc({ permissions: PERMISSIONS, hooks: MIXED_HOOKS });

    for (const owned of [false, true]) {
      const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS, { owned }));
      expect(plan.result.action, `owned=${owned}`).toBe("updated");
      expect(plan.collision, `owned=${owned}`).toBeNull();
      expect(plan.backup, `owned=${owned}`).toBe(existing);
      expect(plan.result.warning, `owned=${owned}`).toContain("hooks");
      expect(plan.result.warning, `owned=${owned}`).toContain("rows of yours");
      expect(plan.content, `owned=${owned}`).toBe(EMITTED_PLUGIN);
    }
  });

  it("leaves a stale rendering that the ledger proves unedited to the silent path — bytes match, so the mode moved, not a hand", () => {
    const existing = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS });
    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, existing, own(PLUGIN_KEYS, { owned: true, ledgerHashes: ledgered(ROOT, existing) }));
    expect(plan.result.action).toBe("updated");
    expect(plan.backup).toBeNull();
    expect(plan.result.warning).toContain("Removed the repository-mode hooks");
    expect(plan.content).toBe(EMITTED_PLUGIN);
  });

  it("keeps an operator's own hooks in a plugin-mode file as a foreign key, and names it in the adoption notice", () => {
    const existing = doc({ hooks: OPERATOR_HOOKS, model: "opus" });

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS));

    expect(plan.result.action).toBe("updated");
    expect(plan.content).toBe(doc({ hooks: OPERATOR_HOOKS, model: "opus", permissions: PERMISSIONS }));
    expect(plan.result.notice).toContain("hooks");
    expect(plan.result.notice).toMatch(/loads? .*beside the plugin/);
  });

  it("in repository mode replaces an unowned older engine hooks rendering behind a backup, with a warning, rather than refusing it", () => {
    const existing = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS });

    const plan = planClaudeSettings("x", EMITTED_FULL, existing, own(REPO_KEYS));

    expect(plan.result.action).toBe("updated");
    expect(plan.collision).toBeNull();
    expect(plan.backup).toBe(existing);
    expect(plan.result.warning).toContain("hooks");
    expect(plan.content).toBe(EMITTED_FULL);
  });

  it("in repository mode replaces a MIXED hooks object in a drifted ledgered file behind a backup, warning that rows of yours may be inside", () => {
    const written = doc({ permissions: PERMISSIONS, hooks: ENGINE_HOOKS });
    const edited = doc({ permissions: PERMISSIONS, hooks: MIXED_HOOKS });

    const plan = planClaudeSettings(PATH, EMITTED_FULL, edited, own(REPO_KEYS, { owned: true, ledgerHashes: ledgered(ROOT, written) }));

    expect(plan.result.action).toBe("updated");
    expect(plan.backup).toBe(edited);
    expect(plan.result.warning).toContain("hooks");
    expect(plan.result.warning).toContain("rows of yours");
    expect(plan.result.warning).toContain(".claude/settings.local.json");
    expect(plan.content).toBe(written);
  });

  it("in repository mode, an unedited ledgered file's hooks is regenerated silently whatever it holds — the ledger's compare is the one rule", () => {
    // The reviewer's rule of record: "unedited" means "may touch silently",
    // hooks included; the route that reaches this (a hand-edited manifest mode)
    // is outside the supported ones and stays a documented residual.
    const existing = doc({ permissions: PERMISSIONS, hooks: OPERATOR_HOOKS });

    const plan = planClaudeSettings(PATH, EMITTED_FULL, existing, own(REPO_KEYS, { owned: true, ledgerHashes: ledgered(ROOT, existing) }));

    expect(plan.result).toEqual({ path: PATH, action: "updated" });
    expect(plan.backup).toBeNull();
    expect(plan.content).toBe(EMITTED_FULL);
  });
});

describe("planClaudeSettings — an engine-owned key that differs", () => {
  it("refuses an unowned file whose engine-owned key differs, naming the key and both remedies", () => {
    const existing = doc({ permissions: { allow: ["Bash"] }, model: "opus" });

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS));

    expect(plan.result.action).toBe("skipped");
    expect(plan.result.warning).toContain("carries a permissions key this engine renders");
    expect(plan.result.warning).toContain("force");
    expect(plan.content).toBeNull();
    expect(plan.collision).toBe(plan.result.warning);
  });

  it("adopts an unowned file whose engine-owned key already equals the rendering", () => {
    const existing = doc({ permissions: PERMISSIONS, model: "opus" });
    expect(planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS)).result.action).toBe("unchanged");
  });

  it("under force, replaces the disputed key behind a backup and keeps the other keys", () => {
    const existing = doc({ permissions: { allow: ["Bash"] }, model: "opus" });

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(PLUGIN_KEYS, { force: true }));

    expect(plan.result.action).toBe("updated");
    expect(plan.result.warning).toContain("Force-replaced the permissions key(s)");
    expect(plan.result.warning).toContain("(model) was kept");
    expect(plan.content).toBe(doc({ permissions: PERMISSIONS, model: "opus" }));
    expect(plan.backup).toBe(existing);
  });

  it("regenerates a ledgered file's engine key silently when its bytes match a ledgered hash — the rendering moved, nobody edited", () => {
    const existing = doc({ permissions: { allow: ["Read"] }, model: "opus" });

    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, existing, own(PLUGIN_KEYS, { owned: true, ledgerHashes: ledgered(ROOT, existing) }));

    expect(plan.result).toEqual({ path: PATH, action: "updated" });
    expect(plan.backup).toBeNull();
    expect(plan.content).toBe(doc({ permissions: PERMISSIONS, model: "opus" }));
  });

  it("backs a ledgered file up and warns, naming the key and the per-user file, when its bytes match no ledgered hash", () => {
    const written = doc({ permissions: PERMISSIONS, model: "opus" });
    const edited = doc({ permissions: { allow: ["Read", "Bash"] }, model: "opus" });

    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, edited, own(PLUGIN_KEYS, { owned: true, ledgerHashes: ledgered(ROOT, written) }));

    expect(plan.result.action).toBe("updated");
    expect(plan.backup).toBe(edited);
    expect(plan.result.warning).toContain("permissions");
    expect(plan.result.warning).toContain(".claude/settings.local.json");
    expect(plan.content).toBe(written);
  });

  it("takes no backup for a foreign-key change alone, whatever the ledger says", () => {
    const written = doc({ permissions: PERMISSIONS });
    const edited = doc({ permissions: PERMISSIONS, model: "opus" });
    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, edited, own(PLUGIN_KEYS, { owned: true, ledgerHashes: ledgered(ROOT, written) }));
    expect(plan).toMatchObject({ result: { action: "unchanged" }, backup: null });
  });

  it("never quotes a byte of an unparseable file in its message — only where the parser stopped", () => {
    const raw = '{\n  "env": {\n    "SECRET": "hunter2-token"\n  },\n}\n';
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, raw, own(PLUGIN_KEYS, { owned: true }));
    expect(plan.result.action).toBe("skipped");
    expect(plan.result.warning).not.toContain("hunter2");
    expect(plan.result.warning).not.toContain("SECRET");
    expect(plan.result.warning).toMatch(/not valid JSON \(syntax error at position \d+/);
    const reduction = reduceClaudeSettingsToForeignContent(raw, PLUGIN_KEYS);
    expect(reduction.detail).not.toContain("hunter2");
  });

  it("refuses a file that is not a JSON object, and replaces it whole only under force", () => {
    for (const raw of ["{ nope\n", "[]\n", "null\n", '"text"\n']) {
      const refused = planClaudeSettings("x", EMITTED_PLUGIN, raw, own(PLUGIN_KEYS, { owned: true }));
      expect(refused.result.action, raw).toBe("skipped");
      expect(refused.result.warning, raw).toContain("not valid JSON");
      expect(refused.collision, raw).toBe(refused.result.warning);

      const forced = planClaudeSettings("x", EMITTED_PLUGIN, raw, own(PLUGIN_KEYS, { force: true }));
      expect(forced.result.action, raw).toBe("updated");
      expect(forced.result.warning, raw).toContain("Force-overwrote");
      expect(forced.content, raw).toBe(EMITTED_PLUGIN);
      expect(forced.backup, raw).toBe(raw);
    }
  });

  it("quotes the repository-relative path in its messages when the boundary is known", () => {
    const existing = doc({ permissions: { allow: ["Bash"] } });
    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, existing, own(PLUGIN_KEYS, { boundaryDir: ROOT }));
    expect(plan.result.warning).toContain("Skipped .claude/settings.json:");
    expect(plan.result.warning).not.toContain(ROOT);
    expect(plan.result.path).toBe(PATH);
  });
});

describe("materializeClaudeSettings", () => {
  it("creates the file when nothing is there", async () => {
    const path = getRepo().path(".claude/settings.json");

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own(PLUGIN_KEYS));

    expect(result).toEqual({ path, action: "created", writtenContent: EMITTED_PLUGIN });
    expect(await readFile(path, "utf8")).toBe(EMITTED_PLUGIN);
  });

  it("merges into a client-written file, under the path's write lock, and hands back the merged bytes for the ledger", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await repo.seedFiles({ ".claude/settings.json": CLIENT });

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own(PLUGIN_KEYS, { boundaryDir: repo.dir }));

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

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own(PLUGIN_KEYS, { owned: true }));

    expect(result).toEqual({ path, action: "unchanged", writtenContent: EMITTED_PLUGIN });
    expect(writes.paths).toEqual([]);
  });

  it("skips a contested file and reports no written bytes", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    const existing = doc({ permissions: { allow: ["Bash"] } });
    await repo.seedFiles({ ".claude/settings.json": existing });

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own(PLUGIN_KEYS));

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

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own(PLUGIN_KEYS, { force: true, boundaryDir: repo.dir }));

    expect(result.action).toBe("updated");
    expect(result.warning).toContain(`Your previous file is at ${path}.bak`);
    expect(await readFile(`${path}.bak`, "utf8")).toBe(existing);
    expect(await readFile(path, "utf8")).toBe(doc({ permissions: PERMISSIONS, model: "opus" }));
  });

  it("refuses a target outside the boundary before building its parent directory", async () => {
    const repo = getRepo();
    const outside = repo.path("outside/.claude/settings.json");

    await expect(materializeClaudeSettings(outside, EMITTED_PLUGIN, own(PLUGIN_KEYS, { boundaryDir: repo.path("inside") }))).rejects.toThrow(EngineError);
    await expect(readFile(outside, "utf8")).rejects.toThrow(/ENOENT/);
    expect(writes.paths).toEqual([]);
  });

  it("writes a CRLF file back in CRLF", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await repo.seedFiles({ ".claude/settings.json": CLIENT.replaceAll("\n", "\r\n") });

    await materializeClaudeSettings(path, EMITTED_PLUGIN, own(PLUGIN_KEYS));

    const written = await readFile(path, "utf8");
    expect(written).toBe(doc({ enabledPlugins: { "stamity@stamity": true }, permissions: PERMISSIONS }).replaceAll("\n", "\r\n"));
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

    await expect(materializeClaudeSettings(target, EMITTED_PLUGIN, own(PLUGIN_KEYS, { owned: true }))).rejects.toThrow(/symbolic link/);
    expect(writes.paths).toEqual([]);
    expect(await readFile(outside, "utf8")).toBe(doc({ client_secret: "s3cret" }));

    const predicted = await predictClaudeSettingsMerge(target, EMITTED_PLUGIN, own(PLUGIN_KEYS, { owned: true }));
    expect(predicted.result.action).toBe("skipped");
    expect(predicted.collision?.kind).toBe("shared-name");
  });

  it("refuses to merge into a hard link, and says force does not help", async () => {
    const { target, outside } = await plantTarget();
    await link(outside, target);

    await expect(materializeClaudeSettings(target, EMITTED_PLUGIN, own(PLUGIN_KEYS, { force: true }))).rejects.toThrow(/hard link/);
    expect(writes.paths).toEqual([]);

    const predicted = await predictClaudeSettingsMerge(target, EMITTED_PLUGIN, own(PLUGIN_KEYS, { owned: true }));
    expect(predicted.collision?.kind).toBe("shared-name");
    expect(predicted.collision?.detail).toContain("force does not help");
  });
});

describe("predictClaudeSettingsMerge", () => {
  it("previews created, unchanged and the unmanaged-name collision without writing", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await mkdir(repo.path(".claude"), { recursive: true });

    expect((await predictClaudeSettingsMerge(path, EMITTED_PLUGIN, own(PLUGIN_KEYS))).result.action).toBe("created");

    await writeFile(path, EMITTED_PLUGIN, "utf8");
    expect(await predictClaudeSettingsMerge(path, EMITTED_PLUGIN, own(PLUGIN_KEYS, { owned: true }))).toEqual({
      result: { path, action: "unchanged" },
      collision: null,
    });

    await writeFile(path, doc({ hooks: { Stop: [] }, permissions: { allow: ["Bash"] } }), "utf8");
    const contested = await predictClaudeSettingsMerge(path, EMITTED_FULL, own(REPO_KEYS));
    expect(contested.result.action).toBe("skipped");
    expect(contested.collision).toEqual({ kind: "unmanaged-name", detail: contested.result.warning });
    expect(contested.collision?.detail).toContain("permissions, hooks key");
    expect(writes.paths).toEqual([]);
  });

  it("reports a read failure as the shared mapped sentence, not a bare syscall", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".claude/settings.json/.keep": "" });
    // A directory at the path: `lstat` succeeds, the read fails with EISDIR.
    await expect(predictClaudeSettingsMerge(repo.path(".claude/settings.json"), EMITTED_PLUGIN, own(PLUGIN_KEYS, { owned: true }))).rejects.toThrow(
      /Cannot read the settings document at .*that path is a directory/,
    );
  });
});

describe("reduceClaudeSettingsToForeignContent", () => {
  it("strips the engine's keys and keeps the rest, re-serialised in the engine's style", () => {
    const raw = doc({ enabledPlugins: { "x@y": true }, permissions: PERMISSIONS, model: "opus", hooks: ENGINE_HOOKS });

    const reduction = reduceClaudeSettingsToForeignContent(raw, REPO_KEYS);

    expect(reduction.kind).toBe("reduced");
    expect(reduction.kind === "reduced" && reduction.content).toBe(doc({ enabledPlugins: { "x@y": true }, model: "opus" }));
    expect(reduction.detail).toContain("(permissions, hooks) were removed");
    expect(reduction.detail).toContain("(enabledPlugins, model) are kept");
  });

  it("in plugin mode strips only the mode's keys: a stale repository-mode hooks rendering is left to sync and the duplicates row", () => {
    const stale = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS, model: "opus" });
    expect(claudeSettingsReclaimReducer(PLUGIN_KEYS)(stale)).toMatchObject({ kind: "reduced", content: doc({ hooks: OLDER_ENGINE_HOOKS, model: "opus" }) });

    const operator = doc({ permissions: PERMISSIONS, hooks: OPERATOR_HOOKS });
    expect(claudeSettingsReclaimReducer(PLUGIN_KEYS)(operator)).toMatchObject({ kind: "reduced", content: doc({ hooks: OPERATOR_HOOKS }) });
  });

  it("keeps a CRLF file's line ending", () => {
    const raw = doc({ permissions: PERMISSIONS, model: "opus" }).replaceAll("\n", "\r\n");
    const reduction = reduceClaudeSettingsToForeignContent(raw, PLUGIN_KEYS);
    expect(reduction.kind === "reduced" && reduction.content).toBe(doc({ model: "opus" }).replaceAll("\n", "\r\n"));
  });

  it("reports engine-only when nothing else is in the file", () => {
    expect(reduceClaudeSettingsToForeignContent(doc({ permissions: PERMISSIONS }), REPO_KEYS)).toMatchObject({ kind: "engine-only" });
  });

  it("claims nothing in a file holding none of the engine's keys", () => {
    const reduction = reduceClaudeSettingsToForeignContent(CLIENT, REPO_KEYS);
    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("none of the keys this engine writes (permissions, hooks)");
  });

  it("never claims a file it cannot parse", () => {
    const reduction = reduceClaudeSettingsToForeignContent("{ nope", REPO_KEYS);
    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("not valid JSON");
  });
});
