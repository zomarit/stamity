import { link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claudeSettingsReclaimReducer,
  claudeSettingsSpec,
  ENGINE_PERMISSION_ROWS,
  isEngineHookGroup,
  materializeClaudeSettings,
  planClaudeSettings,
  predictClaudeSettingsMerge,
  reduceClaudeSettingsToForeignContent,
  type SettingsOwnership,
} from "../../src/manifest/claudeSettings.ts";
import { memberHash } from "../../src/manifest/jsonMembers.ts";
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

// TEST CHANGE, justified: REQ-FLOW-036 — the lane takes the per-entry core's ownership (a ledger row, a 1.11.0
// row, the record of the engine's entries) instead of the install mode's key
// set and a force flag, which this lane no longer has. Every call site below
// moves with it: `own()` is adoption (no row), `own({ owned: true, legacy: true })`
// a 1.11.0 row, and a `record` a row this release wrote.
function own(over: Partial<SettingsOwnership> = {}): SettingsOwnership {
  return { owned: false, legacy: false, record: null, ...over };
}

/** A 1.11.0 ledger row at the path: no record, so the bound and the rendering decide. */
const LEGACY = { owned: true, legacy: true } as const;

/** The sweep's view of a row this release wrote, over `record`. */
const reduceOpts = (record: SettingsOwnership["record"], deleteWhenEngineOnly = true) =>
  ({ record, legacy: false, deleteWhenEngineOnly }) as const;

/** A ledger hash index recording exactly `bytes` at the settings path under `root`. */
function ledgered(root: string, bytes: string): ReadonlyMap<string, ReadonlySet<string>> {
  return ledgerHashIndex(root, [{ path: ".claude/settings.json", contentHash: sha256(bytes) }]);
}

/** A line break or an escape byte in a message would forge a panel line. */
function hasControlBytes(text: string): boolean {
  return text.includes("\n") || text.includes("\u001b");
}

const ROOT = "/repo";
const PATH = join(ROOT, ".claude", "settings.json");

describe("planClaudeSettings — the rendering", () => {
  it("fails loudly on an emission that is not a JSON object — that is an engine bug", () => {
    expect(() => planClaudeSettings("x", "[]", null, own())).toThrow(EngineError);
    expect(() => planClaudeSettings("x", "{ nope", null, own())).toThrow(/emitted settings document is not valid JSON/);
    // TEST CHANGE, justified: REQ-FLOW-036 — the core's parser names the kind ("null, not a JSON object").
    expect(() => planClaudeSettings("x", "null", null, own())).toThrow(/not a JSON object/);
  });

  it("creates the rendering when nothing is there", () => {
    // TEST CHANGE, justified: REQ-FLOW-036 — a created file's plan carries the record of every rendered row.
    expect(planClaudeSettings("x", EMITTED_PLUGIN, null, own())).toEqual({
      result: { path: "x", action: "created" },
      content: EMITTED_PLUGIN,
      backup: null,
      collision: null,
      record: { elements: { "/permissions/allow": PERMISSIONS.allow.map(memberHash) }, createdFile: true },
    });
  });
});

describe("planClaudeSettings — foreign keys", () => {
  it("adopts a client-written file: foreign keys kept in place, the engine's appended, with a notice", () => {
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, CLIENT, own());

    expect(plan.result.action).toBe("updated");
    // TEST CHANGE, justified: REQ-FLOW-036 — the adoption notice counts the owner's entries, not top-level keys.
    expect(plan.result.notice).toContain("kept your 1 entry (enabledPlugins ×1)");
    expect(plan.content).toBe(doc({ enabledPlugins: { "stamity@stamity": true }, permissions: PERMISSIONS }));
    expect(plan.backup).toBeNull();
    expect(plan.collision).toBeNull();
  });

  it("writes the engine's rows into an existing permissions member in place and keeps every other key's position and value", () => {
    const existing = doc({ model: "opus", permissions: { allow: ["Bash"] }, env: { A: "1" }, hooks: ENGINE_HOOKS });

    const plan = planClaudeSettings(PATH, EMITTED_FULL, existing, own({ ...LEGACY, ledgerHashes: ledgered(ROOT, existing) }));

    expect(plan.result).toEqual({ path: PATH, action: "updated" });
    // TEST CHANGE, justified: REQ-FLOW-036 — the owner's `Bash` row is theirs and stays beside the engine's rows;
    // it was replaced with the whole `permissions` key.
    expect(plan.content).toBe(doc({ model: "opus", permissions: { allow: ["Bash", ...PERMISSIONS.allow] }, env: { A: "1" }, hooks: ENGINE_HOOKS }));
  });

  it("reports unchanged, with nothing to write, when the file already holds the merged result", () => {
    const merged = doc({ permissions: PERMISSIONS, enabledPlugins: { "x@y": true } });
    // TEST CHANGE, justified: REQ-FLOW-036 — an unchanged plan carries the record (here a 1.11.0 row's first one),
    // and an adopted file's unchanged plan carries the adoption notice.
    expect(planClaudeSettings("x", EMITTED_PLUGIN, merged, own(LEGACY))).toEqual({
      result: { path: "x", action: "unchanged" },
      content: null,
      backup: null,
      collision: null,
      record: { elements: { "/permissions/allow": PERMISSIONS.allow.map(memberHash) }, createdFile: true },
    });
    expect(planClaudeSettings("x", EMITTED_PLUGIN, merged, own()).result).toMatchObject({ path: "x", action: "unchanged" });
  });

  it("round-trips a foreign __proto__ key instead of dropping it while claiming it was kept", () => {
    const existing = '{\n  "__proto__": {\n    "polluted": true\n  },\n  "model": "opus"\n}\n';

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own());

    // TEST CHANGE, justified: REQ-FLOW-036 — the adoption notice lists entries by member.
    expect(plan.result.notice).toContain("(__proto__ ×1, model ×1)");
    expect(plan.content).toContain('"__proto__": {\n    "polluted": true\n  }');
    const reduction = reduceClaudeSettingsToForeignContent(plan.content ?? "", reduceOpts(plan.record));
    expect(reduction.kind === "reduced" && reduction.content).toBe(existing);
  });

  it("never lets a file-authored key name forge a panel line: control bytes are stripped from every name it prints", () => {
    const forged = "bad\nkey\u001b[31m";

    const adopted = planClaudeSettings("x", EMITTED_PLUGIN, doc({ [forged]: 1 }), own());
    expect(adopted.result.notice).toContain("(bad key[31m ×1)");
    expect(hasControlBytes(adopted.result.notice ?? "")).toBe(false);

    // TEST CHANGE, justified: REQ-FLOW-036 — no force replacement exists to print the kept keys; the names a
    // message prints now are the members of the entries the engine removes, so
    // a forged event name is the one carried through a warning and a detail.
    const existing = doc({ [forged]: 1, permissions: PERMISSIONS, hooks: { [forged]: OLDER_ENGINE_HOOKS.PreToolUse } });
    const replaced = planClaudeSettings("x", EMITTED_PLUGIN, existing, own());
    expect(replaced.result.warning).toContain("hooks.bad key[31m[0]");
    expect(hasControlBytes(replaced.result.warning ?? "")).toBe(false);

    const reduction = reduceClaudeSettingsToForeignContent(existing, reduceOpts(null));
    expect(reduction.detail).toContain("hooks.bad key[31m[0]");
    expect(hasControlBytes(reduction.detail)).toBe(false);
    // The key itself is carried through untouched; only the message is sanitised.
    expect(reduction.kind === "reduced" && reduction.content).toBe(doc({ [forged]: 1, permissions: PERMISSIONS }));
  });

  it("keeps the file's own CRLF line ending: compares in it, writes in it, so a Windows checkout stays clean", () => {
    const crlf = doc({ permissions: PERMISSIONS, enabledPlugins: { "x@y": true } }).replaceAll("\n", "\r\n");
    expect(planClaudeSettings("x", EMITTED_PLUGIN, crlf, own(LEGACY)).result.action).toBe("unchanged");

    const stale = doc({ permissions: { allow: ["Read"] }, enabledPlugins: { "x@y": true } }).replaceAll("\n", "\r\n");
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, stale, own(LEGACY));
    expect(plan.result.action).toBe("updated");
    expect(plan.content).toBe(crlf);
    expect(plan.content).not.toMatch(/[^\r]\n/);
  });

  it("strips a leading byte-order mark before parsing, so a BOM'd file is adopted rather than refused", () => {
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, `﻿${CLIENT}`, own());
    expect(plan.result.action).toBe("updated");
    // TEST CHANGE, justified: review/37 — the byte-order mark survives the merge.
    expect(plan.content).toBe(`${String.fromCharCode(0xfeff)}${doc({ enabledPlugins: { "stamity@stamity": true }, permissions: PERMISSIONS })}`);
  });

  it("classifies a document it cannot serialise back (nesting past the stack) as a collision, never a thrown error", () => {
    const depth = 200_000;
    const existing = `{"permissions": ${JSON.stringify(PERMISSIONS)}, "deep": ${"[".repeat(depth)}${"]".repeat(depth)}}`;

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own(LEGACY));

    expect(plan.result.action).toBe("skipped");
    // TEST CHANGE, justified: REQ-FLOW-036 — the core's wording, and no force replacement exists: the file
    // is the owner's to fix (`co-owned-shape`, never force-clearable).
    expect(plan.result.warning).toContain("not a document this engine can serialise back");
    expect(plan.result.warning).not.toContain("force");
    expect(plan.collision).toBe(plan.result.warning);
  });
});

describe("planClaudeSettings — the hooks key across install modes", () => {
  it("removes a stale repository-mode hooks rendering from a plugin-mode file behind a backup and reports it, ledgered or not", () => {
    // Recognition WIDENS what the engine may touch — never past a backup: no
    // predicate can tell the engine's rows from an operator's inside one object.
    const existing = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS, enabledPlugins: { "x@y": true } });

    for (const owned of [false, true]) {
      const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own({ owned, legacy: owned }));
      expect(plan.result.action, `owned=${owned}`).toBe("updated");
      expect(plan.result.warning, `owned=${owned}`).toContain("Removed the repository-mode hooks");
      expect(plan.result.warning, `owned=${owned}`).toContain(".claude/settings.local.json");
      expect(plan.content, `owned=${owned}`).toBe(doc({ permissions: PERMISSIONS, enabledPlugins: { "x@y": true } }));
      expect(plan.backup, `owned=${owned}`).toBe(existing);
      expect(plan.collision, `owned=${owned}`).toBeNull();
    }
  });

  it("removes the engine's entry from a MIXED hooks object in a plugin-mode file behind a backup with the warning, and keeps the operator's entry", () => {
    const existing = doc({ permissions: PERMISSIONS, hooks: MIXED_HOOKS });

    for (const owned of [false, true]) {
      const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own({ owned, legacy: owned }));
      expect(plan.result.action, `owned=${owned}`).toBe("updated");
      expect(plan.collision, `owned=${owned}`).toBeNull();
      expect(plan.backup, `owned=${owned}`).toBe(existing);
      expect(plan.result.warning, `owned=${owned}`).toContain("hooks.SessionStart[0]");
      expect(plan.result.warning, `owned=${owned}`).toContain("rows of yours");
      // TEST CHANGE, justified: REQ-FLOW-036 — ownership is per entry: the operator's `Stop` entry
      // is theirs and stays; only the recognised engine entry leaves.
      expect(plan.content, `owned=${owned}`).toBe(doc({ permissions: PERMISSIONS, hooks: OPERATOR_HOOKS }));
    }
  });

  it("leaves a stale rendering that the ledger proves unedited to the silent path — bytes match, so the mode moved, not a hand", () => {
    const existing = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS });
    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, existing, own({ ...LEGACY, ledgerHashes: ledgered(ROOT, existing) }));
    expect(plan.result.action).toBe("updated");
    expect(plan.backup).toBeNull();
    expect(plan.result.warning).toContain("Removed the repository-mode hooks");
    expect(plan.content).toBe(EMITTED_PLUGIN);
  });

  it("keeps an operator's own hooks in a plugin-mode file as foreign entries, and names them in the adoption notice", () => {
    const existing = doc({ hooks: OPERATOR_HOOKS, model: "opus" });

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own());

    expect(plan.result.action).toBe("updated");
    expect(plan.content).toBe(doc({ hooks: OPERATOR_HOOKS, model: "opus", permissions: PERMISSIONS }));
    // TEST CHANGE, justified: REQ-FLOW-036 — the notice names the entries it kept; that the client loads
    // them beside the plugin's hooks is the `plugin-duplicates` row's to say.
    expect(plan.result.notice).toContain("hooks.Stop ×1");
  });

  it("in repository mode replaces an unowned older engine hooks rendering behind a backup, with a warning, rather than refusing it", () => {
    const existing = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS });

    const plan = planClaudeSettings("x", EMITTED_FULL, existing, own());

    expect(plan.result.action).toBe("updated");
    expect(plan.collision).toBeNull();
    expect(plan.backup).toBe(existing);
    expect(plan.result.warning).toContain("hooks");
    expect(plan.content).toBe(EMITTED_FULL);
  });

  it("in repository mode regenerates an unedited older hooks rendering silently — the rendering moved with an upgrade, nobody edited", () => {
    // The round-2 pin, restored: a ledgered, hash-matching file whose hooks
    // rendering is an older engine's gets no warning and no backup on the sync
    // that brings it up to date — every sync after an upgrade would otherwise
    // print a false "rows of yours may have been inside it".
    const existing = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS });

    const plan = planClaudeSettings(PATH, EMITTED_FULL, existing, own({ ...LEGACY, ledgerHashes: ledgered(ROOT, existing) }));

    expect(plan.result).toEqual({ path: PATH, action: "updated" });
    expect(plan.backup).toBeNull();
    expect(plan.content).toBe(EMITTED_FULL);
  });

  it("in repository mode keeps an operator's entry added to a ledgered file beside the engine's, with nothing to back up", () => {
    const written = doc({ permissions: PERMISSIONS, hooks: ENGINE_HOOKS });
    const edited = doc({ permissions: PERMISSIONS, hooks: MIXED_HOOKS });

    const plan = planClaudeSettings(PATH, EMITTED_FULL, edited, own({ ...LEGACY, ledgerHashes: ledgered(ROOT, written) }));

    // TEST CHANGE, justified: REQ-FLOW-036 — the operator's `Stop` entry is theirs, so a sync leaves the
    // file as it is; it was replaced whole behind a backup.
    expect(plan.result.action).toBe("unchanged");
    expect(plan.backup).toBeNull();
    expect(plan.content).toBeNull();
  });

  it("in repository mode, an unedited ledgered file's operator hooks stay and the engine's entries are added beside them", () => {
    const existing = doc({ permissions: PERMISSIONS, hooks: OPERATOR_HOOKS });

    const plan = planClaudeSettings(PATH, EMITTED_FULL, existing, own({ ...LEGACY, ledgerHashes: ledgered(ROOT, existing) }));

    expect(plan.result).toEqual({ path: PATH, action: "updated" });
    expect(plan.backup).toBeNull();
    // TEST CHANGE, justified: REQ-FLOW-036 — an entry the engine did not write is never replaced, unedited
    // file or not; it was regenerated to the rendering.
    expect(plan.content).toBe(doc({ permissions: PERMISSIONS, hooks: { ...OPERATOR_HOOKS, ...ENGINE_HOOKS } }));
  });
});

describe("planClaudeSettings — an owner's permissions member", () => {
  it("merges into an unowned file's permissions: the owner's row stays and the engine's rows are added, with no collision", () => {
    const existing = doc({ permissions: { allow: ["Bash"] }, model: "opus" });

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own());

    // TEST CHANGE, justified: REQ-FLOW-036 — an owner's `permissions` is merged, never a collision; it
    // skipped the file naming the key and offering force.
    expect(plan.result.action).toBe("updated");
    expect(plan.collision).toBeNull();
    expect(plan.backup).toBeNull();
    expect(plan.content).toBe(doc({ permissions: { allow: ["Bash", ...PERMISSIONS.allow] }, model: "opus" }));
    expect(plan.record).toEqual({
      elements: { "/permissions/allow": PERMISSIONS.allow.map(memberHash) },
      preexisting: ["/permissions", "/permissions/allow"],
    });
  });

  it("adopts an unowned file whose engine-owned key already equals the rendering", () => {
    const existing = doc({ permissions: PERMISSIONS, model: "opus" });
    expect(planClaudeSettings("x", EMITTED_PLUGIN, existing, own()).result.action).toBe("unchanged");
  });

  it("never writes, replaces or removes permissions.deny or ask, whatever the record claims", () => {
    const existing = doc({ permissions: { allow: PERMISSIONS.allow, deny: ["Bash(rm -rf:*)"], ask: ["Bash"] } });
    // A forged record over the deny rule and the whole member proves nothing:
    // neither pointer is one the engine writes.
    const record = {
      members: { "/permissions": memberHash(JSON.parse(existing).permissions) },
      elements: { "/permissions/deny": [memberHash("Bash(rm -rf:*)")], "/permissions/allow": PERMISSIONS.allow.map(memberHash) },
    };

    const plan = planClaudeSettings("x", EMITTED_PLUGIN, existing, own({ owned: true, record }));

    expect(plan.result.action).toBe("unchanged");
    const reduction = reduceClaudeSettingsToForeignContent(existing, reduceOpts(record));
    expect(reduction).toMatchObject({ kind: "reduced", content: doc({ permissions: { deny: ["Bash(rm -rf:*)"], ask: ["Bash"] } }), proven: true });
  });

  it("regenerates a ledgered file's engine key silently when its bytes match a ledgered hash — the rendering moved, nobody edited", () => {
    const existing = doc({ permissions: { allow: ["Read"] }, model: "opus" });

    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, existing, own({ ...LEGACY, ledgerHashes: ledgered(ROOT, existing) }));

    expect(plan.result).toEqual({ path: PATH, action: "updated" });
    expect(plan.backup).toBeNull();
    expect(plan.content).toBe(doc({ permissions: PERMISSIONS, model: "opus" }));
  });

  it("keeps an owner's row added inside allow of an edited ledgered file, with no backup", () => {
    const written = doc({ permissions: PERMISSIONS, model: "opus" });
    const edited = doc({ permissions: { allow: ["Read", "Bash"] }, model: "opus" });

    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, edited, own({ ...LEGACY, ledgerHashes: ledgered(ROOT, written) }));

    // TEST CHANGE, justified: REQ-FLOW-036 — the owner's `Bash` row is theirs and stays beside the engine's
    // block, so no engine row leaves and no backup is owed; the whole key was
    // replaced behind a backup.
    expect(plan.result.action).toBe("updated");
    expect(plan.result.warning).toBeUndefined();
    expect(plan.backup).toBeNull();
    expect(plan.content).toBe(doc({ permissions: { allow: [...PERMISSIONS.allow, "Bash"] }, model: "opus" }));
  });

  it("takes no backup for a foreign-key change alone, whatever the ledger says", () => {
    const written = doc({ permissions: PERMISSIONS });
    const edited = doc({ permissions: PERMISSIONS, model: "opus" });
    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, edited, own({ ...LEGACY, ledgerHashes: ledgered(ROOT, written) }));
    expect(plan).toMatchObject({ result: { action: "unchanged" }, backup: null });
  });

  it("never quotes a byte of an unparseable file in its message — only where the parser stopped", () => {
    const raw = '{\n  "env": {\n    "SECRET": "hunter2-token"\n  },\n}\n';
    const plan = planClaudeSettings("x", EMITTED_PLUGIN, raw, own(LEGACY));
    expect(plan.result.action).toBe("skipped");
    expect(plan.result.warning).not.toContain("hunter2");
    expect(plan.result.warning).not.toContain("SECRET");
    expect(plan.result.warning).toMatch(/not valid JSON \(syntax error at position \d+/);
    const reduction = reduceClaudeSettingsToForeignContent(raw, reduceOpts(null));
    expect(reduction.detail).not.toContain("hunter2");
  });

  it("refuses a file that is not a JSON object, or whose members the engine writes into have another type, and offers no force", () => {
    // TEST CHANGE, justified: REQ-FLOW-036 — no force replacement exists on this lane; each refusal names
    // what the file is (or the member and the type) and the fix.
    const cases: [string, string][] = [
      ["{ nope\n", "not valid JSON"],
      ["[]\n", "an array, not a JSON object"],
      ["null\n", "null, not a JSON object"],
      ['"text"\n', "a string, not a JSON object"],
      [doc({ permissions: "allow-all" }), "permissions is a string, not an object"],
      [doc({ permissions: { allow: "Read" } }), "permissions.allow is a string, not an array"],
      [doc({ hooks: [] }), "hooks is an array, not an object"],
      [doc({ hooks: { SessionStart: {} } }), "hooks.SessionStart is an object, not an array"],
    ];
    for (const [raw, named] of cases) {
      const refused = planClaudeSettings("x", EMITTED_FULL, raw, own(LEGACY));
      expect(refused.result.action, raw).toBe("skipped");
      expect(refused.result.warning, raw).toContain(named);
      expect(refused.result.warning, raw).not.toContain("force");
      expect(refused.collision, raw).toBe(refused.result.warning);
      expect(refused.record, raw).toBeNull();
    }
  });

  it("quotes the repository-relative path in its messages when the boundary is known", () => {
    // TEST CHANGE, justified: REQ-FLOW-036 — an owner's `permissions` merges now, so a member of another
    // type is what produces a message to read the path in.
    const existing = doc({ permissions: "allow-all" });
    const plan = planClaudeSettings(PATH, EMITTED_PLUGIN, existing, own({ boundaryDir: ROOT }));
    expect(plan.result.warning).toContain("Skipped .claude/settings.json:");
    expect(plan.result.warning).not.toContain(ROOT);
    expect(plan.result.path).toBe(PATH);
  });
});

describe("materializeClaudeSettings", () => {
  it("creates the file when nothing is there", async () => {
    const path = getRepo().path(".claude/settings.json");

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own());

    // TEST CHANGE, justified: REQ-FLOW-036 — the result carries the record for the ledger row.
    expect(result).toEqual({
      path,
      action: "created",
      writtenContent: EMITTED_PLUGIN,
      writtenRecord: { elements: { "/permissions/allow": PERMISSIONS.allow.map(memberHash) }, createdFile: true },
    });
    expect(await readFile(path, "utf8")).toBe(EMITTED_PLUGIN);
  });

  it("merges into a client-written file, under the path's write lock, and hands back the merged bytes for the ledger", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await repo.seedFiles({ ".claude/settings.json": CLIENT });

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own({ boundaryDir: repo.dir }));

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

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own(LEGACY));

    // TEST CHANGE, justified: REQ-FLOW-036 — the result carries the record a 1.11.0 row gains with no write.
    expect(result).toEqual({
      path,
      action: "unchanged",
      writtenContent: EMITTED_PLUGIN,
      writtenRecord: { elements: { "/permissions/allow": PERMISSIONS.allow.map(memberHash) }, createdFile: true },
    });
    expect(writes.paths).toEqual([]);
  });

  it("skips a file whose permissions has another type and reports no written bytes", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    // TEST CHANGE, justified: REQ-FLOW-036 — an owner's `permissions` object merges now; a string is the shape that collides.
    const existing = doc({ permissions: "allow-all" });
    await repo.seedFiles({ ".claude/settings.json": existing });

    const result = await materializeClaudeSettings(path, EMITTED_PLUGIN, own());

    expect(result.action).toBe("skipped");
    expect(result.writtenContent).toBeNull();
    expect(result.writtenRecord).toBeNull();
    expect(writes.paths).toEqual([]);
    expect(await readFile(path, "utf8")).toBe(existing);
  });

  it("backs the previous file up before replacing an engine entry it cannot prove, names the .bak, and writes the merge", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    // TEST CHANGE, justified: REQ-FLOW-036 — no force exists; the backup now follows an engine entry the
    // engine cannot prove (an older setup's guard entry, no ledger row).
    const existing = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS, model: "opus" });
    await repo.seedFiles({ ".claude/settings.json": existing });

    const result = await materializeClaudeSettings(path, EMITTED_FULL, own({ boundaryDir: repo.dir }));

    expect(result.action).toBe("updated");
    expect(result.warning).toContain(`Your previous file is at ${path}.bak`);
    expect(await readFile(`${path}.bak`, "utf8")).toBe(existing);
    expect(await readFile(path, "utf8")).toBe(doc({ permissions: PERMISSIONS, hooks: ENGINE_HOOKS, model: "opus" }));
  });

  it("refuses a target outside the boundary before building its parent directory", async () => {
    const repo = getRepo();
    const outside = repo.path("outside/.claude/settings.json");

    await expect(materializeClaudeSettings(outside, EMITTED_PLUGIN, own({ boundaryDir: repo.path("inside") }))).rejects.toThrow(EngineError);
    await expect(readFile(outside, "utf8")).rejects.toThrow(/ENOENT/);
    expect(writes.paths).toEqual([]);
  });

  it("writes a CRLF file back in CRLF", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await repo.seedFiles({ ".claude/settings.json": CLIENT.replaceAll("\n", "\r\n") });

    await materializeClaudeSettings(path, EMITTED_PLUGIN, own());

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

    await expect(materializeClaudeSettings(target, EMITTED_PLUGIN, own(LEGACY))).rejects.toThrow(/symbolic link/);
    expect(writes.paths).toEqual([]);
    expect(await readFile(outside, "utf8")).toBe(doc({ client_secret: "s3cret" }));

    const predicted = await predictClaudeSettingsMerge(target, EMITTED_PLUGIN, own(LEGACY));
    expect(predicted.result.action).toBe("skipped");
    expect(predicted.collision?.kind).toBe("shared-name");
  });

  it("refuses to merge into a hard link, and says force does not help", async () => {
    const { target, outside } = await plantTarget();
    await link(outside, target);

    await expect(materializeClaudeSettings(target, EMITTED_PLUGIN, own())).rejects.toThrow(/hard link/);
    expect(writes.paths).toEqual([]);

    const predicted = await predictClaudeSettingsMerge(target, EMITTED_PLUGIN, own(LEGACY));
    expect(predicted.collision?.kind).toBe("shared-name");
    expect(predicted.collision?.detail).toContain("force does not help");
  });
});

describe("predictClaudeSettingsMerge", () => {
  it("previews created, unchanged and the co-owned-shape collision without writing", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await mkdir(repo.path(".claude"), { recursive: true });

    expect((await predictClaudeSettingsMerge(path, EMITTED_PLUGIN, own())).result.action).toBe("created");

    await writeFile(path, EMITTED_PLUGIN, "utf8");
    // TEST CHANGE, justified: review/68 — a prediction now also carries `after`, the text the write
    // leaves (here the unchanged bytes), so a preview reads a hooks document as the write will leave it.
    expect(await predictClaudeSettingsMerge(path, EMITTED_PLUGIN, own(LEGACY))).toEqual({
      result: { path, action: "unchanged" },
      collision: null,
      after: EMITTED_PLUGIN,
    });

    // TEST CHANGE, justified: REQ-FLOW-036 — an owner's `permissions` and `hooks` merge; the collision is
    // a member of another type, classified `co-owned-shape` (never force-clearable).
    await writeFile(path, doc({ hooks: { Stop: [] }, permissions: { allow: "Bash" } }), "utf8");
    const contested = await predictClaudeSettingsMerge(path, EMITTED_FULL, own());
    expect(contested.result.action).toBe("skipped");
    expect(contested.collision).toEqual({ kind: "co-owned-shape", detail: contested.result.warning });
    expect(contested.collision?.detail).toContain("permissions.allow is a string");
    expect(writes.paths).toEqual([]);
  });

  it("reports a read failure as the shared mapped sentence, not a bare syscall", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".claude/settings.json/.keep": "" });
    // A directory at the path: `lstat` succeeds, the read fails with EISDIR.
    await expect(predictClaudeSettingsMerge(repo.path(".claude/settings.json"), EMITTED_PLUGIN, own(LEGACY))).rejects.toThrow(
      /Cannot read the settings document at .*that path is a directory/,
    );
  });
});

describe("reduceClaudeSettingsToForeignContent", () => {
  // TEST CHANGE, justified: REQ-FLOW-036 — the reducer takes the row's record instead of the install mode's
  // key set, removes the engine's ENTRIES (not keys) and keeps the file's own
  // style; each case below states the behaviour that moved.
  const recorded = {
    elements: {
      "/permissions/allow": PERMISSIONS.allow.map(memberHash),
      "/hooks/SessionStart": ENGINE_HOOKS.SessionStart.map(memberHash),
    },
    createdFile: true as const,
  };

  it("removes the engine's recorded entries and keeps the rest, in the file's own style, proven", () => {
    const raw = JSON.stringify({ enabledPlugins: { "x@y": true }, permissions: PERMISSIONS, model: "opus", hooks: ENGINE_HOOKS }, null, 4);

    const reduction = reduceClaudeSettingsToForeignContent(raw, reduceOpts(recorded));

    expect(reduction.kind).toBe("reduced");
    expect(reduction.kind === "reduced" && reduction.content).toBe(JSON.stringify({ enabledPlugins: { "x@y": true }, model: "opus" }, null, 4));
    expect(reduction).toMatchObject({ proven: true });
    expect(reduction.detail).toContain("permissions.allow[0]");
    expect(reduction.detail).toContain("hooks.SessionStart[0]");
  });

  it("removes a stale recognised repository-mode entry too, unproven, and keeps an operator's own hooks", () => {
    const pluginRecord = { elements: { "/permissions/allow": PERMISSIONS.allow.map(memberHash) }, createdFile: true as const };
    const stale = doc({ permissions: PERMISSIONS, hooks: OLDER_ENGINE_HOOKS, model: "opus" });
    expect(claudeSettingsReclaimReducer(reduceOpts(pluginRecord))(stale)).toMatchObject({ kind: "reduced", content: doc({ model: "opus" }), proven: false });

    const operator = doc({ permissions: PERMISSIONS, hooks: OPERATOR_HOOKS });
    expect(claudeSettingsReclaimReducer(reduceOpts(pluginRecord))(operator)).toMatchObject({ kind: "reduced", content: doc({ hooks: OPERATOR_HOOKS }), proven: true });
  });

  it("flags a recorded hook entry outside the bound as one the sweep must back up", () => {
    const raw = doc({ hooks: OPERATOR_HOOKS, model: "opus" });
    const forged = { elements: { "/hooks/Stop": OPERATOR_HOOKS.Stop.map(memberHash) } };
    expect(reduceClaudeSettingsToForeignContent(raw, reduceOpts(forged))).toMatchObject({ kind: "reduced", proven: false, mustBackUp: true, content: doc({ model: "opus" }) });
  });

  it("keeps a CRLF file's line ending", () => {
    const raw = doc({ permissions: PERMISSIONS, model: "opus" }).replaceAll("\n", "\r\n");
    const reduction = reduceClaudeSettingsToForeignContent(raw, reduceOpts(recorded));
    expect(reduction.kind === "reduced" && reduction.content).toBe(doc({ model: "opus" }).replaceAll("\n", "\r\n"));
  });

  it("reports engine-only when nothing else is in a file the engine created, and reduced to an empty object when it did not", () => {
    expect(reduceClaudeSettingsToForeignContent(doc({ permissions: PERMISSIONS }), reduceOpts(recorded))).toMatchObject({ kind: "engine-only", proven: true });
    expect(reduceClaudeSettingsToForeignContent(doc({ permissions: PERMISSIONS }), reduceOpts(recorded, false))).toMatchObject({ kind: "reduced", content: "{}\n" });
  });

  it("reads a 1.11.0 row's in-bound rows and recognised entries as the engine's, unproven", () => {
    const raw = doc({ permissions: { allow: ["Bash", ...PERMISSIONS.allow] }, hooks: ENGINE_HOOKS });
    expect(reduceClaudeSettingsToForeignContent(raw, { record: null, legacy: true, deleteWhenEngineOnly: true })).toMatchObject({
      kind: "reduced",
      content: doc({ permissions: { allow: ["Bash"] } }),
      proven: false,
    });
  });

  it("claims nothing in a file holding none of the engine's entries", () => {
    const reduction = reduceClaudeSettingsToForeignContent(CLIENT, reduceOpts(recorded));
    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("holding none of the entries this engine wrote");
  });

  it("never claims a file it cannot parse", () => {
    const reduction = reduceClaudeSettingsToForeignContent("{ nope", reduceOpts(recorded));
    expect(reduction.kind).toBe("untouched");
    expect(reduction.detail).toContain("not valid JSON");
  });
});

describe("claudeSettingsSpec", () => {
  it("owns the allow rows the engine renders and the hook entries, and passes declared members through", () => {
    expect(ENGINE_PERMISSION_ROWS).toEqual(["Read", "Grep", "Glob"]);
    const spec = claudeSettingsSpec([{ pointer: "/a/b", foreign: "yield" }]);
    expect(spec.members).toEqual([{ pointer: "/a/b", foreign: "yield" }]);
    expect(claudeSettingsSpec().members).toEqual([]);
    const [allow, hooks] = spec.elements;
    expect(allow?.recognise("Read")).toBe(false);
    expect(["Read", "Bash", 3].map((row) => allow?.inBound(row))).toEqual([true, false, false]);
    expect(allow?.outsideBound).toBe("foreign");
    expect(hooks?.outsideBound).toBe("backup");
  });

  it("bounds a hook entry by every command running an engine script, and recognises one by the generated hooks directory", () => {
    const [, hooks] = claudeSettingsSpec().elements;
    const group = ENGINE_HOOKS.SessionStart[0];
    expect(hooks?.inBound(group)).toBe(true);
    expect(isEngineHookGroup(group)).toBe(true);
    // TEST CHANGE, justified: review/44 (signed off) — the user's own
    // `.stamity/hooks/` is outside the backup-free bound; a pack's folder is in it.
    const userHook = { hooks: [{ type: "command", command: "node .stamity/hooks/mine.mjs" }] };
    expect(hooks?.inBound(userHook)).toBe(false);
    expect(hooks?.inBound({ hooks: [{ type: "command", command: "node .stamity/packs/acme/hooks/audit.mjs" }] })).toBe(true);
    expect(isEngineHookGroup(userHook)).toBe(false);
    // One command outside the state directory takes the whole entry out of the bound.
    expect(hooks?.inBound({ hooks: [...(group?.hooks ?? []), { type: "command", command: "./scripts/guard.sh" }] })).toBe(false);
    expect(hooks?.inBound({ hooks: [] })).toBe(false);
    expect(hooks?.inBound({ hooks: [{ type: "prompt", prompt: "x" }] })).toBe(false);
    expect(hooks?.inBound({ hooks: [7] })).toBe(false);
    expect(hooks?.inBound({ matcher: "Bash" })).toBe(false);
    expect(hooks?.inBound("text")).toBe(false);
    expect(isEngineHookGroup({ matcher: "Bash" })).toBe(false);
    expect(isEngineHookGroup(null)).toBe(false);
    expect(isEngineHookGroup({ hooks: [null, { command: 3 }] })).toBe(false);
  });
});
