import { chmod, link, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPlainObject } from "../../src/config/parse.ts";
import {
  commandRunsStateScript,
  executedScript,
  materializeCoOwned,
  planCoOwnedJson,
  predictCoOwnedMerge,
  reduceCoOwnedJson,
  refuseLinkedCoOwnedTarget,
  type CoOwnedJsonSpec,
  type CoOwnedOwnership,
  type CoOwnedPlan,
} from "../../src/manifest/coOwnedJson.ts";
import { memberHash } from "../../src/manifest/jsonMembers.ts";
import { collectManifestErrors } from "../../src/manifest/manifest.ts";
import type * as AtomicWrite from "../../src/merge/atomicWrite.ts";
import { ledgerHashIndex } from "../../src/merge/safeWrite.ts";
import { sha256 } from "../../src/cli/engine/emissionWrite.ts";
import { EngineError } from "../../src/types/errors.ts";
import type { CoOwnership } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The write substrate is counted, not stubbed — the technique
 * `./claudeSettings.test.ts` uses: every case still lands through the real
 * temp+rename writer, and the counter turns "left the file alone" into an
 * assertion. The lane writes under its own lock, so the UNLOCKED body is counted.
 */
const writes = vi.hoisted(() => ({ paths: [] as string[], releaseThrows: undefined as unknown }));

vi.mock("../../src/merge/atomicWrite.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof AtomicWrite>();
  return {
    ...actual,
    // The real lock is taken and released; only a release FAILURE is injected,
    // because no real filesystem state makes an unlock throw on demand.
    acquireWriteLock: async (...args: Parameters<typeof actual.acquireWriteLock>) => {
      const release = await actual.acquireWriteLock(...args);
      return async (): Promise<void> => {
        await release();
        if (writes.releaseThrows !== undefined) throw writes.releaseThrows;
      };
    },
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

const getRepo = useTempDir("co-owned-json");

beforeEach(() => {
  writes.paths.length = 0;
  writes.releaseThrows = undefined;
});

// ── Fixtures ───────────────────────────────────────────────────────────────

const ROOT = join("/", "repo");
const FILE = join(ROOT, ".claude", "settings.json");
const SHOWN = ".claude/settings.json";
const HINT = "Personal rows belong in .claude/settings.local.json, which this engine never writes.";

const doc = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const ENGINE_ROWS = ["Read", "Grep", "Glob"];
const command = (cmd: string): { type: string; command: string } => ({ type: "command", command: cmd });
const group = (...cmds: string[]): { hooks: { type: string; command: string }[] } => ({ hooks: cmds.map(command) });

/** The engine's guard group: its command runs a generated script. */
const GUARD = { matcher: "Bash", hooks: [command('node "${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/stamity-guard.mjs"')] };
const SESSION = group('node "${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/stamity-session-start.mjs"');
const OLDER = group("node .stamity/generated/hooks/claude/stamity-older.mjs");
/** An operator's own group: its script lies outside `.stamity/`. */
const OWNER_GROUP = { matcher: "Bash", hooks: [command("./scripts/guard.sh")] };
const OWNER_STOP = group("node scripts/notify.mjs");

/** A recognised group that also runs an operator script: the engine's to touch, outside its bound. */
const MIXED = group("node .stamity/generated/hooks/claude/stamity-guard.mjs", "./scripts/mine.sh");

const isEngineGroup = (element: unknown): boolean =>
  isPlainObject(element) &&
  Array.isArray(element["hooks"]) &&
  element["hooks"].some(
    (hook) => isPlainObject(hook) && typeof hook["command"] === "string" && hook["command"].includes(".stamity/generated/hooks/"),
  );
const groupInBound = (element: unknown): boolean =>
  isPlainObject(element) &&
  Array.isArray(element["hooks"]) &&
  element["hooks"].length > 0 &&
  element["hooks"].every(
    (hook) => isPlainObject(hook) && typeof hook["command"] === "string" && commandRunsStateScript(hook["command"]),
  );

/** A settings-shaped spec, as `claudeSettingsSpec` declares it. */
const SPEC: CoOwnedJsonSpec = {
  noun: "settings document",
  elements: [
    {
      pointer: "/permissions/allow",
      recognise: () => false,
      inBound: (element) => typeof element === "string" && ENGINE_ROWS.includes(element),
      outsideBound: "foreign",
    },
    { pointer: "/hooks/*", recognise: isEngineGroup, inBound: groupInBound, outsideBound: "backup" },
  ],
  members: [],
  personalHint: HINT,
};

const RENDERING = { permissions: { allow: ENGINE_ROWS }, hooks: { PreToolUse: [GUARD] } };
const EMITTED = doc(RENDERING);
const EMITTED_PLUGIN = doc({ permissions: { allow: ENGINE_ROWS } });

/** The record the engine writes for {@link RENDERING}. */
const ENGINE_ELEMENTS = {
  "/permissions/allow": ENGINE_ROWS.map(memberHash),
  "/hooks/PreToolUse": [memberHash(GUARD)],
};

/** The criteria's first fixture: an owner's allow row, deny rule, hook and model. */
const OWNER = {
  permissions: { allow: ["Bash(npm test:*)"], deny: ["Bash(rm -rf:*)"] },
  hooks: { PreToolUse: [OWNER_GROUP] },
  model: "opus",
};
const OWNER_RAW = doc(OWNER);
const MERGED = {
  permissions: { allow: ["Bash(npm test:*)", ...ENGINE_ROWS], deny: ["Bash(rm -rf:*)"] },
  hooks: { PreToolUse: [OWNER_GROUP, GUARD] },
  model: "opus",
};
const MERGED_RECORD: CoOwnership = {
  elements: ENGINE_ELEMENTS,
  preexisting: ["/hooks", "/hooks/PreToolUse", "/permissions", "/permissions/allow"],
};

const noRow = (extra: Partial<CoOwnedOwnership> = {}): CoOwnedOwnership => ({
  owned: false,
  legacy: false,
  record: null,
  boundaryDir: ROOT,
  ...extra,
});
const legacyRow = (extra: Partial<CoOwnedOwnership> = {}): CoOwnedOwnership => ({
  owned: true,
  legacy: true,
  record: null,
  boundaryDir: ROOT,
  ...extra,
});
const recorded = (record: CoOwnership, extra: Partial<CoOwnedOwnership> = {}): CoOwnedOwnership => ({
  owned: true,
  legacy: false,
  record,
  boundaryDir: ROOT,
  ...extra,
});
/** The ledger's hash index proving `raw` is what the engine last wrote at {@link FILE}. */
const unedited = (raw: string): ReadonlyMap<string, ReadonlySet<string>> =>
  ledgerHashIndex(ROOT, [{ path: ".claude/settings.json", contentHash: sha256(raw) }]);

const plan = (existing: string | null, ownership: CoOwnedOwnership, emitted = EMITTED, spec = SPEC): CoOwnedPlan =>
  planCoOwnedJson(FILE, emitted, existing, spec, ownership);

const parsed = (content: string | null): unknown => JSON.parse(content ?? "null");

/** This repository's own committed manifest with its settings row's record replaced: what the reader would see. */
const manifestWith = async (record: CoOwnership | null): Promise<unknown> => {
  const manifest = JSON.parse(await readFile(join(process.cwd(), ".stamity", "manifest.json"), "utf8")) as {
    ledger: { path: string; coOwned?: unknown }[];
  };
  const row = manifest.ledger.find((entry) => entry.path === SHOWN);
  if (row === undefined) throw new Error("the committed manifest has no settings row");
  row.coOwned = record;
  return manifest;
};

// ── planCoOwnedJson ──────────────────────────────────────────────────────

describe("planCoOwnedJson — the rendering", () => {
  it("fails loudly on an emission that is not a JSON object, or that carries a member outside the spec — an engine bug", () => {
    for (const emitted of ["[]", "{", doc({ permissions: { allow: ENGINE_ROWS }, model: "x" }), doc({ permissions: { deny: ["x"] } }), doc({ permissions: { allow: "Read" } })]) {
      let caught: unknown = null;
      try {
        plan(null, noRow(), emitted);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EngineError);
      expect((caught as EngineError).code).toBe("ADAPTER_ERROR");
    }
  });

  it("creates the rendering in the engine's style and records every entry it wrote, with createdFile", () => {
    const out = plan(null, noRow());
    expect(out.result).toEqual({ path: FILE, action: "created" });
    expect(out.content).toBe(EMITTED);
    expect(out.backup).toBeNull();
    expect(out.collision).toBeNull();
    expect(out.record).toEqual({ elements: ENGINE_ELEMENTS, createdFile: true });
  });
});

describe("planCoOwnedJson — an owner's entries survive (REQ-FLOW-036)", () => {
  it("merges beside an owner's allow row, deny rule, hook and model: placed, recorded, kept byte for byte, with the adoption notice", () => {
    const out = plan(OWNER_RAW, noRow());

    expect(out.result.action).toBe("updated");
    expect(out.content).toBe(doc(MERGED));
    expect(out.backup).toBeNull();
    expect(out.result.warning).toBeUndefined();
    expect(out.record).toEqual(MERGED_RECORD);
    expect(out.result.notice).toBe(
      `Merged into ${SHOWN}: kept your 4 entries (permissions.allow ×1, permissions.deny ×1, hooks.PreToolUse ×1, model ×1) ` +
        `beside the engine's; the engine owns only the entries it wrote.`,
    );
  });

  it("re-plans its own merge as unchanged and carries the record forward", () => {
    const out = plan(doc(MERGED), recorded(MERGED_RECORD));
    expect(out.result).toEqual({ path: FILE, action: "unchanged" });
    expect(out.content).toBeNull();
    expect(out.record).toEqual(MERGED_RECORD);
  });

  it("leaves a deny rule added after setup alone: unchanged, nothing to write", () => {
    const setup = plan(null, noRow());
    const edited = doc({ ...RENDERING, permissions: { ...RENDERING.permissions, deny: ["Bash(rm -rf:*)"] } });
    const out = plan(edited, recorded(setup.record as CoOwnership));
    expect(out.result.action).toBe("unchanged");
    expect(out.content).toBeNull();
    expect(out.backup).toBeNull();
  });

  it("keeps an owner's allow row equal to an engine row as the owner's: not recorded, not duplicated (S13)", () => {
    const out = plan(doc({ permissions: { allow: ["Read"] } }), noRow());
    expect(parsed(out.content)).toEqual({ permissions: { allow: ["Read", "Grep", "Glob"] }, hooks: { PreToolUse: [GUARD] } });
    expect(out.record?.elements?.["/permissions/allow"]).toEqual([memberHash("Grep"), memberHash("Glob")]);
    // And the next run still reads it as the owner's: unchanged, same record.
    const again = plan(out.content, recorded(out.record as CoOwnership));
    expect(again.result.action).toBe("unchanged");
    expect(again.record?.elements?.["/permissions/allow"]).toEqual([memberHash("Grep"), memberHash("Glob")]);
  });

  it("adopts a lost manifest's own hook entries by their script, with no notice when nothing foreign is in the file", () => {
    const out = plan(doc({ hooks: { PreToolUse: [GUARD] } }), noRow());
    expect(out.result.notice).toBeUndefined();
    expect(out.result.warning).toBeUndefined();
    expect(out.backup).toBeNull();
    // The recognised group's container is not the owner's: not preexisting.
    expect(out.record).toEqual({ elements: ENGINE_ELEMENTS });
  });

  it("ignores a forged record over the owner's deny rule, its whole permissions member and its allow row", () => {
    const forged: CoOwnership = {
      ...MERGED_RECORD,
      members: { "/permissions": memberHash(MERGED.permissions) },
      elements: {
        ...ENGINE_ELEMENTS,
        "/permissions/allow": [memberHash("Bash(npm test:*)"), ...ENGINE_ELEMENTS["/permissions/allow"]],
        "/permissions/deny": [memberHash("Bash(rm -rf:*)")],
      },
    };
    const out = plan(doc(MERGED), recorded(forged));
    expect(out.result).toEqual({ path: FILE, action: "unchanged" });
    expect(out.record).toEqual(MERGED_RECORD);
  });

  it("takes an owner's hook entry the record claims, outside .stamity/, only behind a backup with a warning naming it (r2 item 4)", () => {
    const forged: CoOwnership = {
      ...MERGED_RECORD,
      elements: { ...ENGINE_ELEMENTS, "/hooks/PreToolUse": [memberHash(OWNER_GROUP), memberHash(GUARD)] },
    };
    const out = plan(doc(MERGED), recorded(forged));
    expect(out.result.action).toBe("updated");
    expect(out.backup).toBe(doc(MERGED));
    expect(parsed(out.content)).toEqual({ ...MERGED, hooks: { PreToolUse: [GUARD] } });
    expect(out.result.warning).toBe(
      `Removed hooks.PreToolUse[0] from ${SHOWN}: the ledger records it as the engine's, but it lies outside what the ` +
        `engine can prove it wrote by path, so the previous file was backed up first. ${HINT}`,
    );
  });

  it("restores an engine hook entry the owner edited, behind a backup, naming it and the per-user file", () => {
    const setup = plan(null, noRow());
    const editedGuard = { ...GUARD, hooks: [{ ...GUARD.hooks[0], timeout: 5 }] };
    const existing = doc({ ...RENDERING, hooks: { PreToolUse: [editedGuard] } });

    const out = plan(existing, recorded(setup.record as CoOwnership));

    expect(out.content).toBe(EMITTED);
    expect(out.backup).toBe(existing);
    expect(out.result.warning).toBe(
      `Replaced hooks.PreToolUse[0] of ${SHOWN}: it runs the engine's hook script but is not the entry the engine last ` +
        `wrote (an earlier setup's, or edited by hand), so the previous file was backed up first. Keep a hook of your ` +
        `own in an entry of its own. ${HINT}`,
    );
  });

  it("replaces a recognised group that also runs an owner script, behind a backup", () => {
    const existing = doc({ ...RENDERING, hooks: { PreToolUse: [MIXED] } });
    const out = plan(existing, recorded({ elements: { ...ENGINE_ELEMENTS, "/hooks/PreToolUse": [memberHash(MIXED)] } }));
    expect(out.backup).toBe(existing);
    expect(out.content).toBe(EMITTED);
    expect(out.result.warning).toContain("Replaced hooks.PreToolUse[0] of");
  });
});

describe("planCoOwnedJson — the three ownership states × each element kind", () => {
  // One existing element under /hooks/PreToolUse beside the rendering's GUARD,
  // and one under /permissions/allow. `engine` says whether the element is the
  // engine's (it leaves, since the rendering does not carry it), `backup`
  // whether it leaves only behind the .bak.
  type Kind = "recorded-in-bound" | "recorded-outside-bound" | "recognised" | "equal-foreign" | "foreign";
  const HOOK: Record<Kind, unknown> = {
    // TEST CHANGE, justified: review/44 (signed off) — in bound and not
    // recognised is now an installed pack's script; the user's .stamity/hooks/ is outside.
    "recorded-in-bound": group("node .stamity/packs/acme/hooks/user-hook.sh"),
    "recorded-outside-bound": OWNER_STOP,
    recognised: OLDER,
    "equal-foreign": GUARD,
    foreign: OWNER_STOP,
  };
  const ROW: Record<Kind, string> = {
    "recorded-in-bound": "Glob",
    "recorded-outside-bound": "Bash(npm test:*)",
    recognised: "Glob",
    "equal-foreign": "Read",
    foreign: "Bash(ls:*)",
  };

  const run = (state: "none" | "legacy" | "recorded", kind: Kind, slot: "hook" | "row"): CoOwnedPlan => {
    const element = slot === "hook" ? HOOK[kind] : ROW[kind];
    const recordedKind = kind === "recorded-in-bound" || kind === "recorded-outside-bound";
    const existing =
      slot === "hook"
        ? doc({ hooks: { Stop: [element] } })
        : doc({ permissions: { allow: [element] } });
    const pointer = slot === "hook" ? "/hooks/Stop" : "/permissions/allow";
    const record: CoOwnership = recordedKind ? { elements: { [pointer]: [memberHash(element)] } } : {};
    const emitted = slot === "hook" ? doc({ hooks: { PreToolUse: [GUARD] } }) : doc({ permissions: { allow: ["Read", "Grep"] } });
    const ownership = state === "none" ? noRow() : state === "legacy" ? legacyRow() : recorded(record);
    return plan(existing, ownership, emitted);
  };
  const kept = (out: CoOwnedPlan, slot: "hook" | "row", kind: Kind): boolean => {
    const value = parsed(out.content ?? (out.result.action === "unchanged" ? "{}" : null)) as Record<string, Record<string, unknown[]>>;
    const element = slot === "hook" ? HOOK[kind] : ROW[kind];
    const list = slot === "hook" ? value["hooks"]?.["Stop"] : value["permissions"]?.["allow"];
    return JSON.stringify(list ?? []).includes(JSON.stringify(element));
  };

  const CASES: readonly [state: "none" | "legacy" | "recorded", kind: Kind, slot: "hook" | "row", engine: boolean, backup: boolean][] = [
    // No ledger row (adoption): only recognition counts.
    ["none", "recorded-in-bound", "hook", false, false],
    ["none", "recorded-outside-bound", "hook", false, false],
    ["none", "recognised", "hook", true, true],
    ["none", "foreign", "hook", false, false],
    ["none", "recorded-in-bound", "row", false, false],
    ["none", "foreign", "row", false, false],
    // Legacy (a 1.11.0 row, no coOwned): in bound or recognised counts; unproven leaves behind the .bak.
    ["legacy", "recorded-in-bound", "hook", true, true],
    ["legacy", "recorded-outside-bound", "hook", false, false],
    ["legacy", "recognised", "hook", true, true],
    ["legacy", "foreign", "hook", false, false],
    ["legacy", "recorded-in-bound", "row", true, true],
    ["legacy", "recorded-outside-bound", "row", false, false],
    // Recorded: the record in bound (or outsideBound "backup") counts, and recognition.
    ["recorded", "recorded-in-bound", "hook", true, false],
    ["recorded", "recorded-outside-bound", "hook", true, true],
    ["recorded", "recognised", "hook", true, true],
    ["recorded", "foreign", "hook", false, false],
    ["recorded", "recorded-in-bound", "row", true, false],
    ["recorded", "recorded-outside-bound", "row", false, false],
    ["recorded", "foreign", "row", false, false],
  ];

  it.each(CASES)("%s × %s (%s): engine's=%s, backup=%s", (state, kind, slot, engine, backup) => {
    const out = run(state, kind, slot);
    expect(out.collision).toBeNull();
    expect(kept(out, slot, kind)).toBe(!engine);
    expect(out.backup !== null).toBe(backup);
    expect(out.result.warning !== undefined).toBe(backup);
  });

  it.each(["none", "recorded"] as const)("%s: an element equal to a rendered one, not recognised, stays the owner's and is not added twice", (state) => {
    const existing = doc({ permissions: { allow: ["Read"] } });
    const out = plan(existing, state === "none" ? noRow() : recorded({}), EMITTED_PLUGIN);
    expect(parsed(out.content)).toEqual({ permissions: { allow: ["Read", "Grep", "Glob"] } });
    expect(out.record?.elements?.["/permissions/allow"]).toEqual([memberHash("Grep"), memberHash("Glob")]);
  });

  it("legacy: an element equal to a rendered one is the engine's and recorded", () => {
    const out = plan(doc({ hooks: { PreToolUse: [SESSION] } }), legacyRow(), doc({ hooks: { PreToolUse: [SESSION] } }), {
      ...SPEC,
      elements: [{ pointer: "/hooks/*", recognise: () => false, inBound: () => false, outsideBound: "backup" }],
    });
    expect(out.result.action).toBe("unchanged");
    expect(out.record).toEqual({ elements: { "/hooks/PreToolUse": [memberHash(SESSION)] }, createdFile: true });
  });

  it("legacy: an unedited file regenerates silently — the rendering moved, nobody edited", () => {
    const existing = doc({ permissions: { allow: ENGINE_ROWS }, hooks: { PreToolUse: [OLDER] } });
    const out = plan(existing, legacyRow({ ledgerHashes: unedited(existing) }));
    expect(out.content).toBe(EMITTED);
    expect(out.backup).toBeNull();
    expect(out.result.warning).toBeUndefined();
    expect(out.record).toEqual({ elements: ENGINE_ELEMENTS, createdFile: true });
  });

  it("legacy: an unedited 1.11.0 file is unchanged and gains its per-entry record", () => {
    const out = plan(EMITTED, legacyRow({ ledgerHashes: unedited(EMITTED) }));
    expect(out.result.action).toBe("unchanged");
    expect(out.record).toEqual({ elements: ENGINE_ELEMENTS, createdFile: true });
  });

  it("legacy: an engine row the rendering dropped leaves behind a backup when the file was edited", () => {
    const existing = doc({ permissions: { allow: ["Read", "Grep", "Glob", "Bash(x)"] } });
    const out = plan(existing, legacyRow(), doc({ permissions: { allow: ["Read", "Grep"] } }));
    expect(parsed(out.content)).toEqual({ permissions: { allow: ["Read", "Grep", "Bash(x)"] } });
    expect(out.backup).toBe(existing);
    expect(out.result.warning).toBe(
      `Removed permissions.allow[2] from ${SHOWN}: the file has changed since the engine last wrote it, so the ` +
        `previous file was backed up first. ${HINT}`,
    );
  });
});

describe("planCoOwnedJson — placement (S14)", () => {
  const E1 = group("node .stamity/generated/hooks/claude/one.mjs");
  const E2 = group("node .stamity/generated/hooks/claude/two.mjs");
  const E3 = group("node .stamity/generated/hooks/claude/three.mjs");
  const O1 = group("node scripts/one.mjs");
  const O2 = group("node scripts/two.mjs");

  it("places the engine's block where its first entry stood; an owner entry inside the block moves after it", () => {
    const existing = doc({ hooks: { Stop: [O1, E1, O2, E2] } });
    const record: CoOwnership = { elements: { "/hooks/Stop": [memberHash(E1), memberHash(E2)] } };
    const out = plan(existing, recorded(record), doc({ hooks: { Stop: [E1, E3] } }));
    expect(parsed(out.content)).toEqual({ hooks: { Stop: [O1, E1, E3, O2] } });
    // E2 was recorded and in bound: it leaves silently.
    expect(out.backup).toBeNull();
    expect(out.result.warning).toBeUndefined();
    expect(out.record).toEqual({ elements: { "/hooks/Stop": [memberHash(E1), memberHash(E3)] } });
  });

  it("appends the block when the array holds no engine entry, and appends new events and containers in the rendering's order", () => {
    const existing = doc({ model: "opus", hooks: { Stop: [O1] } });
    const out = plan(existing, noRow(), doc({ permissions: { allow: ["Read"] }, hooks: { PreToolUse: [E1], Stop: [E2] } }));
    expect(out.content).toBe(doc({ model: "opus", hooks: { Stop: [O1, E2], PreToolUse: [E1] }, permissions: { allow: ["Read"] } }));
  });
});

describe("planCoOwnedJson — the repository-mode hooks wiring under a plugin-backed setup", () => {
  it("removes a recorded engine group silently but says so, and deletes the emptied hooks container", () => {
    const out = plan(EMITTED, recorded({ elements: ENGINE_ELEMENTS, createdFile: true }), EMITTED_PLUGIN);
    expect(out.content).toBe(EMITTED_PLUGIN);
    expect(out.backup).toBeNull();
    expect(out.result.warning).toBe(
      `Removed the repository-mode hooks wiring (hooks.PreToolUse[0]) from ${SHOWN}: it runs the engine's hook ` +
        `scripts, which this setup no longer wires, and a wiring pointing at scripts that are not there fails closed ` +
        `on every tool call.`,
    );
    expect(out.record).toEqual({ elements: { "/permissions/allow": ENGINE_ROWS.map(memberHash) }, createdFile: true });
  });

  it("removes an unrecorded one (a lost manifest's) behind a backup, and keeps an operator's own hooks", () => {
    const existing = doc({ hooks: { PreToolUse: [GUARD, SESSION], Stop: [OWNER_STOP] } });
    const out = plan(existing, noRow(), EMITTED_PLUGIN);
    expect(parsed(out.content)).toEqual({ hooks: { Stop: [OWNER_STOP] }, permissions: { allow: ENGINE_ROWS } });
    expect(out.backup).toBe(existing);
    expect(out.result.warning).toBe(
      `Removed the repository-mode hooks wiring (hooks.PreToolUse[0], hooks.PreToolUse[1]) from ${SHOWN}: they run ` +
        `the engine's hook scripts, which this setup no longer wires, and a wiring pointing at scripts that are not ` +
        `there fails closed on every tool call. The previous file was backed up first: if it carried rows of yours, ` +
        `they are there. ${HINT}`,
    );
  });

  it("removes a recognised group in an event the rendering no longer carries, behind a backup when unproven", () => {
    const existing = doc({ hooks: { PreToolUse: [GUARD], Stop: [OLDER] } });
    const out = plan(existing, recorded({ elements: ENGINE_ELEMENTS }));
    // The file's own key order wins: the engine's new permissions member is appended.
    expect(out.content).toBe(doc({ hooks: { PreToolUse: [GUARD] }, permissions: { allow: ENGINE_ROWS } }));
    expect(out.backup).toBe(existing);
    expect(out.result.warning).toBe(
      `Removed hooks.Stop[0] from ${SHOWN}: it runs the engine's hook script but is not the entry the engine last ` +
        `wrote (an earlier setup's, or edited by hand), so the previous file was backed up first. Keep a hook of your ` +
        `own in an entry of its own. ${HINT}`,
    );
  });
});

describe("planCoOwnedJson — containers", () => {
  it("records an owner's empty containers as preexisting, so they outlive the engine's entries", () => {
    const raw = doc({ permissions: { allow: [], deny: [] } });
    const out = plan(raw, noRow());
    expect(out.record?.preexisting).toEqual(["/permissions", "/permissions/allow"]);
    expect(out.record?.createdFile).toBeUndefined();
  });

  it("carries preexisting forward while the container exists, and drops it once it is gone", () => {
    const record: CoOwnership = { elements: ENGINE_ELEMENTS, preexisting: ["/permissions", "/permissions/allow", "/hooks"] };
    const out = plan(EMITTED, recorded(record), EMITTED_PLUGIN);
    expect(out.record?.preexisting).toEqual(["/permissions", "/permissions/allow", "/hooks"]);
    // /hooks stays, emptied, because it is preexisting.
    expect(parsed(out.content)).toEqual({ permissions: { allow: ENGINE_ROWS }, hooks: {} });

    const gone = plan(EMITTED_PLUGIN, recorded(record), EMITTED_PLUGIN);
    expect(gone.record?.preexisting).toEqual(["/permissions", "/permissions/allow"]);
  });

  it("keeps createdFile from a previous row", () => {
    expect(plan(EMITTED, recorded({ elements: ENGINE_ELEMENTS, createdFile: true })).record?.createdFile).toBe(true);
  });

  it("holds the manifest reader's pointer bound: adopting more containers than a record takes is a named collision, never a refused manifest (review/36)", async () => {
    const events = (count: number): string =>
      doc({ hooks: Object.fromEntries(Array.from({ length: count }, (_, i) => [`Event${i}`, []])) });
    // `/hooks` plus 63 events: 64 preexisting pointers, the bound itself.
    const atBound = plan(events(63), noRow(), EMITTED_PLUGIN);
    expect(atBound.collision).toBeNull();
    expect(atBound.record?.preexisting).toHaveLength(64);
    expect(collectManifestErrors(await manifestWith(atBound.record))).toEqual([]);

    const over = plan(events(64), noRow(), EMITTED_PLUGIN);
    expect(over.result.action).toBe("skipped");
    expect(over.record).toBeNull();
    expect(over.collision).toBe(
      `Skipped ${SHOWN}: it holds 65 containers on the engine's pointers (hooks events and the like), more than ` +
        `the 64 the ledger can record for one file, so the engine cannot record which entries in it are its own. ` +
        `It was left untouched. Remove the containers you do not use and re-run sync.`,
    );
    expect(over.collision).not.toContain("--force");
  });

  it("refuses, rather than records, more engine entries in one array than a record takes", () => {
    const spec: CoOwnedJsonSpec = {
      noun: "list document",
      elements: [{ pointer: "/list", recognise: () => false, inBound: () => true, outsideBound: "foreign" }],
      members: [],
    };
    const many = doc({ list: Array.from({ length: 257 }, (_, i) => `row${i}`) });
    const out = plan(null, noRow(), many, spec);
    expect(out.result.action).toBe("skipped");
    expect(out.collision).toBe(
      `Skipped ${SHOWN}: the engine's entries in it exceed what the ledger can record for one file (64 members or ` +
        `arrays, 256 entries in one array). It was left untouched; nothing in the file needs to change.`,
    );
  });

  it("adopts an owner's event under the empty key (RFC 6901's empty token) instead of aborting, and the reducer keeps it", () => {
    const raw = '{"hooks":{"":[]}}\n';
    const out = plan(raw, noRow());
    expect(out.collision).toBeNull();
    expect(out.record?.preexisting).toEqual(["/hooks", "/hooks/"]);
    expect(parsed(out.content)).toEqual({ hooks: { "": [], PreToolUse: [GUARD] }, permissions: { allow: ENGINE_ROWS } });
    const back = reduceCoOwnedJson(out.content as string, SPEC, { record: out.record, legacy: false, deleteWhenEngineOnly: true });
    expect(back).toMatchObject({ kind: "reduced", content: raw, proven: true });
  });
});

describe("planCoOwnedJson — collisions (co-owned-shape; no --force anywhere)", () => {
  const shapes: readonly [string, string, string][] = [
    [doc({ permissions: "allow-all" }), "permissions is a string, not an object", "Make it an object"],
    [doc({ permissions: { allow: "Read" } }), "permissions.allow is a string, not an array", "Make it an array"],
    [doc({ hooks: [] }), "hooks is an array, not an object", "Make it an object"],
    [doc({ hooks: { PreToolUse: { x: 1 } } }), "hooks.PreToolUse is an object, not an array", "Make it an array"],
  ];

  it.each(shapes)("refuses %j, naming the member and the fix", (raw, what, fix) => {
    const out = plan(raw, recorded({ elements: ENGINE_ELEMENTS }));
    expect(out.result.action).toBe("skipped");
    expect(out.content).toBeNull();
    expect(out.backup).toBeNull();
    expect(out.record).toBeNull();
    expect(out.collision).toBe(out.result.warning);
    expect(out.collision).toBe(
      `Skipped ${SHOWN}: ${what}, so the engine cannot add its entries beside yours without replacing them. It was ` +
        `left untouched. ${fix} (or remove it) and re-run sync.`,
    );
  });

  it("does not collide on a container of another type the engine writes nothing into", () => {
    const out = plan(doc({ hooks: "off" }), recorded({}), EMITTED_PLUGIN);
    expect(out.collision).toBeNull();
    expect(parsed(out.content)).toEqual({ hooks: "off", permissions: { allow: ENGINE_ROWS } });
  });

  it("refuses an unparseable file without quoting a byte of it, and a file that is not an object", () => {
    const bad = plan('{"permissions": {"allow": [SECRET-TOKEN', noRow());
    expect(bad.collision).toMatch(
      new RegExp(`^Skipped ${SHOWN.replaceAll(".", "\\.")}: it is not valid JSON \\(syntax error.*\\), so nothing in it can be kept beside the engine's entries\\. It was left untouched\\. Fix or delete it and re-run sync\\.$`),
    );
    expect(bad.collision).not.toContain("SECRET");

    const array = plan("[1]\n", noRow());
    expect(array.collision).toBe(
      `Skipped ${SHOWN}: it is an array, not a JSON object, so nothing in it can be kept beside the engine's entries. ` +
        `It was left untouched. Fix or delete it and re-run sync.`,
    );
  });

  it("classifies a document it cannot serialise back (nesting past the stack) as a collision, never a thrown error", () => {
    const deep = `{"model":${"[".repeat(200_000)}${"]".repeat(200_000)}}`;
    const out = plan(deep, noRow());
    expect(out.result.action).toBe("skipped");
    expect(out.collision).toMatch(/^Skipped \.claude\/settings\.json: it is not a document this engine can serialise back \(/);
  });

  it("never offers --force in any message", () => {
    for (const raw of [doc({ permissions: 1 }), "{", "null"]) {
      expect(plan(raw, noRow()).collision).not.toContain("force");
    }
  });
});

describe("planCoOwnedJson — style (S15)", () => {
  const STYLES: readonly [string, string][] = [
    ["four-space without a final newline", '{\n    "model": "opus"\n}'],
    ["tab-indented", '{\n\t"model": "opus"\n}\n'],
    ["one line", '{"model":"opus"}\n'],
    ["CRLF", '{\r\n  "model": "opus"\r\n}\r\n'],
  ];

  it.each(STYLES)("merges into a %s file in its own style, and the reducer brings it back byte-identical", (_name, raw) => {
    const out = plan(raw, noRow());
    expect(out.result.action).toBe("updated");
    const content = out.content as string;
    expect(content.endsWith("\n")).toBe(raw.endsWith("\n"));
    expect(content.includes("\r\n")).toBe(raw.includes("\r\n"));
    if (raw.includes("\t")) expect(content).toContain('\n\t"permissions": {\n\t\t"allow"');
    if (raw.includes("    ")) expect(content).toContain('\n    "permissions": {\n        "allow"');
    if (!raw.includes("\n  ") && !raw.includes("\t") && !raw.includes("    ")) expect(content.trim().includes("\n")).toBe(false);

    const back = reduceCoOwnedJson(content, SPEC, { record: out.record, legacy: false, deleteWhenEngineOnly: false });
    expect(back).toMatchObject({ kind: "reduced", content: raw, proven: true });
  });

  it("does not rewrite a file in a style it cannot reproduce when nothing changes", () => {
    const raw = '{\n  "permissions" : { "allow": ["Read", "Grep", "Glob"] }\n}\n';
    const out = plan(raw, recorded({ elements: { "/permissions/allow": ENGINE_ROWS.map(memberHash) } }), EMITTED_PLUGIN);
    expect(out.result.action).toBe("unchanged");
    expect(out.content).toBeNull();
  });

  // TEST CHANGE, justified: review/37 — the byte-order mark survives the round
  // trip: the merge writes it back, and the reducer returns the file byte-identical.
  it("merges past a leading byte-order mark rather than refusing, keeps it, and the reducer brings the file back byte-identical", () => {
    const bom = String.fromCharCode(0xfeff);
    const raw = `${bom}{"model":"opus"}\n`;
    const out = plan(raw, noRow(), EMITTED_PLUGIN);
    expect(out.content).toBe(`${bom}{"model":"opus","permissions":{"allow":["Read","Grep","Glob"]}}\n`);
    const back = reduceCoOwnedJson(out.content as string, SPEC, { record: out.record, legacy: false, deleteWhenEngineOnly: false });
    expect(back).toMatchObject({ kind: "reduced", content: raw, proven: true });
  });

  // review/34: a document that cannot round-trip loses an owner's value on any
  // write, so the write is backed up first and the warning says why.
  it.each([
    ['{"model":"a","model":"b"}\n', "repeats a key inside one object, and writing it back keeps only the last value"],
    ['{"limit":1e400}\n', "holds a number that writing it back would change, past what a double holds exactly"],
    ['{"id":12345678901234567890}\n', "holds a number that writing it back would change, past what a double holds exactly"],
  ])("backs up %j before writing it, naming why it cannot round-trip", (raw, why) => {
    const out = plan(raw, noRow(), EMITTED_PLUGIN);
    expect(out.result.action).toBe("updated");
    expect(out.backup).toBe(raw);
    expect(out.result.warning).toBe(`${SHOWN} ${why}, so the previous file was backed up first.`);
  });

  it("owes no backup for a document that cannot round-trip when nothing is written", () => {
    const raw = '{"permissions":{"allow":["Read","Grep","Glob"]},"n":1e400}\n';
    const out = plan(raw, recorded({ elements: { "/permissions/allow": ENGINE_ROWS.map(memberHash) } }), EMITTED_PLUGIN);
    expect(out.result.action).toBe("unchanged");
    expect(out.backup).toBeNull();
  });

  it("marks a reduction of a document that cannot round-trip mustBackUp, naming why", () => {
    const raw = '{"permissions":{"allow":["Read","Grep","Glob"]},"model":"a","model":"b"}\n';
    const out = reduceCoOwnedJson(raw, SPEC, { record: { elements: { "/permissions/allow": ENGINE_ROWS.map(memberHash) } }, legacy: false, deleteWhenEngineOnly: false });
    expect(out).toMatchObject({ kind: "reduced", proven: true, mustBackUp: true });
    expect(out.detail).toContain(
      "It repeats a key inside one object, and writing it back keeps only the last value, so it is backed up first.",
    );
  });

  it("round-trips a foreign __proto__ key and prints a file-authored key without its control bytes", () => {
    const raw = '{"__proto__":{"x":1},"hooks":{"Ev\\nil\\u001b[2J":[{"hooks":[{"command":"x"}]}]}}\n';
    const out = plan(raw, noRow(), EMITTED_PLUGIN);
    expect(out.content).toBe(
      '{"__proto__":{"x":1},"hooks":{"Ev\\nil\\u001b[2J":[{"hooks":[{"command":"x"}]}]},"permissions":{"allow":["Read","Grep","Glob"]}}\n',
    );
    expect(out.result.notice).toContain("hooks.Ev il[2J ×1");
    expect(out.result.notice).toContain("__proto__ ×1");
  });
});

describe("planCoOwnedJson — members (collide, yield, structural)", () => {
  const E = { command: "node .stamity/generated/hooks/cursor/stamity-portable-hook.mjs x" };
  const O = { command: "node scripts/fmt.mjs" };
  const isEngineEntry = (element: unknown): boolean =>
    isPlainObject(element) && typeof element["command"] === "string" && element["command"].includes(".stamity/generated/hooks/cursor/");
  const MSPEC: CoOwnedJsonSpec = {
    noun: "hooks document",
    elements: [{ pointer: "/hooks/*", recognise: isEngineEntry, inBound: isEngineEntry, outsideBound: "backup" }],
    members: [
      { pointer: "/version", foreign: "collide", structural: true },
      { pointer: "/description", foreign: "yield" },
    ],
  };
  const MEMITTED = doc({ version: 1, description: "engine", hooks: { stop: [E] } });
  const mplan = (raw: string | null, ownership: CoOwnedOwnership): CoOwnedPlan => plan(raw, ownership, MEMITTED, MSPEC);
  const engineMembers = { "/version": memberHash(1), "/description": memberHash("engine") };

  it("adds what the file lacks in the rendering's order, after the owner's keys, at both depths", () => {
    expect(mplan(doc({ model: "x" }), noRow()).content).toBe(doc({ model: "x", version: 1, description: "engine", hooks: { stop: [E] } }));
    // Slots are placed before members, so without the rendering's order the added
    // `version` would land after the added `PreToolUse`.
    const out = plan(doc({ hooks: { Stop: [OWNER_STOP] } }), noRow(), doc({ hooks: { version: 1, PreToolUse: [GUARD], Stop: [SESSION] } }), {
      ...SPEC,
      members: [{ pointer: "/hooks/version", foreign: "yield" }],
      elements: [{ pointer: "/hooks/PreToolUse", recognise: isEngineGroup, inBound: groupInBound, outsideBound: "backup" }, { pointer: "/hooks/Stop", recognise: isEngineGroup, inBound: groupInBound, outsideBound: "backup" }],
    });
    expect(out.content).toBe(doc({ hooks: { Stop: [OWNER_STOP, SESSION], version: 1, PreToolUse: [GUARD] } }));
  });

  it("writes and records an absent member, after the owner's keys", () => {
    const out = mplan(doc({ hooks: { stop: [O] } }), noRow());
    expect(out.content).toBe(doc({ hooks: { stop: [O, E] }, version: 1, description: "engine" }));
    expect(out.record?.members).toEqual(engineMembers);
  });

  // TEST CHANGE, justified: review/31 (signed off) — a `yield` member changes
  // without a backup only when its value equals the engine's current rendering;
  // a recorded hash alone is a claim (S11), so the replacement takes a `.bak`.
  const BOUND = "the engine can prove it wrote a value there only when it equals its current rendering, and this one does not";
  it("yield: replaces a recorded, unedited member behind a backup, because a recorded hash alone proves nothing (S11)", () => {
    const existing = doc({ version: 1, description: "old", hooks: { stop: [E] } });
    const out = mplan(existing, recorded({ members: { ...engineMembers, "/description": memberHash("old") } }));
    expect(parsed(out.content)).toEqual({ version: 1, description: "engine", hooks: { stop: [E] } });
    expect(out.backup).toBe(existing);
    expect(out.result.warning).toBe(`Replaced description of ${SHOWN}: ${BOUND}, so the previous file was backed up first.`);
    expect(out.record?.members).toEqual(engineMembers);
  });

  it("yield: a forged record over the owner's own value replaces it only behind a backup (review/31)", () => {
    const existing = doc({ description: "mine", hooks: { stop: [E] } });
    const out = mplan(existing, recorded({ members: { "/description": memberHash("mine") }, elements: { "/hooks/stop": [memberHash(E)] } }));
    expect(parsed(out.content)).toEqual({ description: "engine", hooks: { stop: [E] }, version: 1 });
    expect(out.backup).toBe(existing);
    expect(out.result.warning).toContain(`Replaced description of ${SHOWN}: ${BOUND}`);
  });

  it("collide: a forged record equal to the owner's edited value is still a co-owned-shape collision, the file unchanged (review/45)", () => {
    const existing = doc({ version: 2, description: "engine", hooks: { stop: [E] } });
    const out = mplan(existing, recorded({ members: { ...engineMembers, "/version": memberHash(2) } }));
    expect(out.result.action).toBe("skipped");
    expect(out.content).toBeNull();
    expect(out.backup).toBeNull();
    expect(out.record).toBeNull();
    expect(out.collision).toBe(
      `Skipped ${SHOWN}: version differs from the engine's current rendering, which is the one proof the engine has ` +
        `for it, where it writes 1, so the engine cannot add its entries beside yours without replacing it. It was ` +
        `left untouched. Make it 1 (or remove it) and re-run sync.`,
    );
  });

  // TEST CHANGE, justified: review/45 (signed off) — a `collide` member that
  // differs from the engine's current rendering is a collision whatever the
  // record says; a recorded, unedited value no longer licenses a silent replacement.
  it("collide: a recorded, unedited member the rendering moved past is a collision too, never a silent replacement", () => {
    const existing = doc({ version: 0, description: "engine", hooks: { stop: [E] } });
    const out = mplan(existing, recorded({ members: { ...engineMembers, "/version": memberHash(0) } }));
    expect(out.result.action).toBe("skipped");
    expect(out.content).toBeNull();
    expect(out.collision).toBe(
      `Skipped ${SHOWN}: version differs from the engine's current rendering, which is the one proof the engine has ` +
        `for it, where it writes 1, so the engine cannot add its entries beside yours without replacing it. It was ` +
        `left untouched. Make it 1 (or remove it) and re-run sync.`,
    );
  });

  it("yield: a recorded member the owner edited becomes theirs — kept, dropped from the record, with a notice", () => {
    const out = mplan(doc({ version: 1, description: "mine", hooks: { stop: [E] } }), recorded({ members: engineMembers }));
    expect(out.result.action).toBe("unchanged");
    expect(out.record?.members).toEqual({ "/version": memberHash(1) });
    expect(out.result.notice).toBe(
      `Kept your description in ${SHOWN}: it differs from what the engine last wrote there, so it is yours now and ` +
        `the engine no longer writes it.`,
    );
  });

  // TEST CHANGE, justified: review/35 (signed off) — a `collide` member that
  // differs is a co-owned-shape collision naming it (S12), recorded or not; it
  // is no longer replaced behind a `.bak`.
  it("collide: a recorded member the owner edited is a co-owned-shape collision naming it, never replaced", () => {
    const existing = doc({ version: 2, description: "engine", hooks: { stop: [E] } });
    const out = mplan(existing, recorded({ members: engineMembers }));
    expect(out.result.action).toBe("skipped");
    expect(out.content).toBeNull();
    expect(out.backup).toBeNull();
    expect(out.record).toBeNull();
    expect(out.collision).toBe(
      `Skipped ${SHOWN}: version differs from what the engine last wrote there, where it writes 1, so the engine ` +
        `cannot add its entries beside yours without replacing it. It was left untouched. Make it 1 (or remove it) ` +
        `and re-run sync.`,
    );
    expect(out.collision).not.toContain("--force");
  });

  it("collide: a recorded member the owner set back to the rendering is the engine's again, with no collision", () => {
    const out = mplan(doc({ version: 1, description: "engine", hooks: { stop: [E] } }), recorded({ members: { ...engineMembers, "/version": memberHash(0) } }));
    expect(out.collision).toBeNull();
    expect(out.result.action).toBe("unchanged");
    expect(out.record?.members).toEqual(engineMembers);
  });

  it("an unrecorded member equal to the rendering stays the owner's: not recorded", () => {
    const out = mplan(doc({ version: 1, hooks: { stop: [O] } }), noRow());
    expect(out.record?.members).toEqual({ "/description": memberHash("engine") });
  });

  it("yield: an unrecorded member that differs is kept and the rendering is not written, with a notice", () => {
    const out = mplan(doc({ description: "mine", hooks: { stop: [O] } }), noRow());
    expect(parsed(out.content)).toEqual({ description: "mine", hooks: { stop: [O, E] }, version: 1 });
    expect(out.record?.members).toEqual({ "/version": memberHash(1) });
    expect(out.result.notice).toContain(
      `Kept your description in ${SHOWN}; the engine's rendering of it is not written there — remove yours to get it back.`,
    );
  });

  it("collide: an unrecorded member that differs is a co-owned-shape collision naming it", () => {
    const out = mplan(doc({ version: 2, hooks: { stop: [O] } }), noRow());
    expect(out.result.action).toBe("skipped");
    expect(out.collision).toBe(
      `Skipped ${SHOWN}: version holds a value the engine did not write, where it writes 1, so the engine cannot ` +
        `add its entries beside yours without replacing it. It was left untouched. Make it 1 (or remove it) and ` +
        `re-run sync.`,
    );
  });

  // TEST CHANGE, justified: review/31 (signed off) — the whole-file hash is a
  // recorded claim too: an unedited legacy file's differing `yield` member is
  // replaced behind a `.bak`; its `collide` member still regenerates silently.
  it("legacy: a member equal to the rendering is the engine's and recorded; an unedited file's differing one is replaced, a yield one behind a backup", () => {
    const out = mplan(MEMITTED, legacyRow());
    expect(out.record?.members).toEqual(engineMembers);
    const older = doc({ version: 1, description: "old", hooks: { stop: [E] } });
    const regenerated = mplan(older, legacyRow({ ledgerHashes: unedited(older) }));
    expect(parsed(regenerated.content)).toEqual(parsed(MEMITTED));
    expect(regenerated.backup).toBe(older);
    expect(regenerated.result.warning).toBe(`Replaced description of ${SHOWN}: ${BOUND}, so the previous file was backed up first.`);
    // TEST CHANGE, justified: review/45 (signed off) — the whole-file hash is a
    // recorded claim too, so a legacy file's differing `collide` member collides.
    const olderVersion = doc({ version: 0, description: "engine", hooks: { stop: [E] } });
    const collided = mplan(olderVersion, legacyRow({ ledgerHashes: unedited(olderVersion) }));
    expect(collided.result.action).toBe("skipped");
    expect(collided.collision).toContain("version differs from the engine's current rendering");
  });

  // TEST CHANGE, justified: review/31 (signed off) — a recorded `yield` member
  // the rendering no longer carries leaves only behind a `.bak`.
  it("removes a recorded member the rendering no longer carries behind a backup: a yield one always, a collide one when edited", () => {
    const noDescription = doc({ version: 1, hooks: { stop: [E] } });
    const engineFile = doc({ version: 1, description: "engine", hooks: { stop: [E] } });
    const proven = plan(engineFile, recorded({ members: engineMembers }), noDescription, MSPEC);
    expect(proven.content).toBe(noDescription);
    expect(proven.backup).toBe(engineFile);
    expect(proven.result.warning).toBe(`Removed description from ${SHOWN}: ${BOUND}, so the previous file was backed up first.`);

    const collideSpec: CoOwnedJsonSpec = { ...MSPEC, members: [{ pointer: "/description", foreign: "collide" }] };
    const existing = doc({ description: "edited", hooks: { stop: [E] } });
    const edited = plan(existing, recorded({ members: engineMembers }), doc({ hooks: { stop: [E] } }), collideSpec);
    expect(edited.content).toBe(doc({ hooks: { stop: [E] } }));
    expect(edited.backup).toBe(existing);
    expect(edited.result.warning).toBe(
      `Removed description from ${SHOWN}: it differs from what the engine last wrote there, so the previous file was backed up first.`,
    );
  });

  it("refuses a depth-2 member under a parent of another type the engine writes into", () => {
    const spec: CoOwnedJsonSpec = { noun: "settings document", elements: [], members: [{ pointer: "/env/A", foreign: "yield" }] };
    const out = plan(doc({ env: "x" }), noRow(), doc({ env: { A: "1" } }), spec);
    expect(out.collision).toContain("env is a string, not an object");
    const written = plan(doc({ env: { B: "2" } }), noRow(), doc({ env: { A: "1" } }), spec);
    expect(written.content).toBe(doc({ env: { B: "2", A: "1" } }));
    expect(written.record).toEqual({ members: { "/env/A": memberHash("1") }, preexisting: ["/env"] });
  });
});

// ── reduceCoOwnedJson ────────────────────────────────────────────────────

describe("reduceCoOwnedJson", () => {
  const reduce = (raw: string, record: CoOwnership | null, opts: Partial<{ legacy: boolean; deleteWhenEngineOnly: boolean; rendered: unknown }> = {}) =>
    reduceCoOwnedJson(raw, SPEC, { record, legacy: false, deleteWhenEngineOnly: false, ...opts });

  it("brings the criteria's first fixture back byte-identical, proven, with no backup owed", () => {
    const merged = plan(OWNER_RAW, noRow());
    const out = reduce(merged.content as string, merged.record);
    expect(out).toEqual({
      kind: "reduced",
      content: OWNER_RAW,
      proven: true,
      detail:
        "Co-owned settings document: the engine's 4 entries (permissions.allow[1], permissions.allow[2], " +
        "permissions.allow[3], hooks.PreToolUse[1]) were removed and everything else in it is kept, so the file stays.",
    });
  });

  it("brings pre-existing empty containers and a bare {} back byte-identical", () => {
    for (const raw of [doc({ permissions: { allow: [], deny: [] } }), "{}\n"]) {
      const merged = plan(raw, noRow());
      expect(reduce(merged.content as string, merged.record)).toMatchObject({ kind: "reduced", content: raw });
    }
  });

  it("keeps a key another writer added after setup, with nothing else, and proves the removal", () => {
    const setup = plan(null, noRow());
    const withPlugin = doc({ ...RENDERING, enabledPlugins: { "other@othermkt": true } });
    const out = reduce(withPlugin, setup.record, { deleteWhenEngineOnly: true });
    expect(out).toMatchObject({ kind: "reduced", content: '{\n  "enabledPlugins": {\n    "other@othermkt": true\n  }\n}\n', proven: true });
    expect(out).not.toHaveProperty("mustBackUp");
  });

  it("answers engine-only when nothing foreign remains and the engine created the file", () => {
    const out = reduce(EMITTED, { elements: ENGINE_ELEMENTS, createdFile: true }, { deleteWhenEngineOnly: true });
    expect(out).toEqual({
      kind: "engine-only",
      proven: true,
      detail:
        "Co-owned settings document that proved to be engine-only: removing the engine's 4 entries " +
        "(permissions.allow[0], permissions.allow[1], permissions.allow[2], hooks.PreToolUse[0]) left nothing of the " +
        "client's or the operator's.",
    });
  });

  it("reduces to {} rather than deleting a file the engine did not create", () => {
    expect(reduce(EMITTED, { elements: ENGINE_ELEMENTS })).toMatchObject({ kind: "reduced", content: "{}\n", proven: true });
  });

  it("legacy: removes the in-bound and recognised entries unproven, so the sweep's whole-file hash decides the backup", () => {
    const out = reduce(doc({ ...RENDERING, model: "opus" }), null, { legacy: true, deleteWhenEngineOnly: true });
    expect(out).toMatchObject({ kind: "reduced", content: doc({ model: "opus" }), proven: false });
    expect(out).not.toHaveProperty("mustBackUp");
  });

  it("marks a removal outside the bound mustBackUp, and keeps an owner's allow row the record claims", () => {
    const forged: CoOwnership = {
      elements: {
        "/permissions/allow": [memberHash("Bash(npm test:*)"), ...ENGINE_ELEMENTS["/permissions/allow"]],
        "/hooks/PreToolUse": [memberHash(OWNER_GROUP), memberHash(GUARD)],
      },
    };
    const out = reduce(doc(MERGED), forged);
    expect(out).toMatchObject({
      kind: "reduced",
      content: doc({ permissions: { allow: ["Bash(npm test:*)"], deny: ["Bash(rm -rf:*)"] }, model: "opus" }),
      proven: false,
      mustBackUp: true,
    });
  });

  it("proves a recorded entry outside the path bound by re-rendering: equal to the rendering handed in, it leaves with no backup owed (review/44)", () => {
    const USER = group('node "${CLAUDE_PROJECT_DIR}/.stamity/hooks/audit.mjs"');
    const record: CoOwnership = { elements: { "/hooks/PreToolUse": [memberHash(USER)] } };
    const raw = doc({ hooks: { PreToolUse: [USER] }, model: "x" });
    expect(reduce(raw, record, { rendered: { hooks: { PreToolUse: [USER] } } })).toEqual({
      kind: "reduced",
      content: doc({ model: "x" }),
      proven: true,
      detail: expect.any(String) as unknown,
    });
    // Its definition gone (nothing rendered) or changed (another rendering): outside the bound.
    expect(reduce(raw, record)).toMatchObject({ proven: false, mustBackUp: true });
    expect(reduce(raw, record, { rendered: { hooks: { PreToolUse: [group("node other.mjs")] } } })).toMatchObject({ proven: false, mustBackUp: true });
  });

  it("reads an edited engine group as the engine's, unproven", () => {
    const edited = { ...GUARD, hooks: [{ ...GUARD.hooks[0], timeout: 5 }] };
    const out = reduce(doc({ hooks: { PreToolUse: [edited] }, model: "x" }), { elements: ENGINE_ELEMENTS });
    expect(out).toMatchObject({ kind: "reduced", content: doc({ model: "x" }), proven: false });
  });

  it("claims nothing in a file holding none of the engine's entries, or one it cannot read", () => {
    expect(reduce(OWNER_RAW, { elements: ENGINE_ELEMENTS })).toEqual({
      kind: "untouched",
      detail:
        "Co-owned settings document holding none of the entries this engine wrote — every entry in it is the " +
        "client's or the operator's, so the file is left exactly as it is.",
    });
    const bad = reduce("{ nope", null);
    expect(bad.kind).toBe("untouched");
    expect(bad.detail).toMatch(/^This settings document is not valid JSON \(syntax error/);
    expect(bad.detail).not.toContain("nope");
    expect(reduce("[]", null).detail).toContain("is an array, not a JSON object");
    // Nesting past the stack under an engine pointer, where the reducer must hash it.
    expect(reduce(`{"hooks":{"Stop":[${"[".repeat(200_000)}${"]".repeat(200_000)}]}}`, null).detail).toContain("not a document this engine can serialise back");
  });

  describe("members", () => {
    const E = { command: "node .stamity/generated/hooks/codex/x.mjs" };
    const O = { command: "node scripts/team-audit.mjs" };
    const isE = (element: unknown): boolean => isPlainObject(element) && String(element["command"]).includes(".stamity/");
    const MSPEC: CoOwnedJsonSpec = {
      noun: "hooks document",
      elements: [{ pointer: "/hooks/*", recognise: isE, inBound: isE, outsideBound: "backup" }],
      members: [
        { pointer: "/version", foreign: "collide", structural: true },
        { pointer: "/description", foreign: "yield" },
      ],
    };
    const record: CoOwnership = {
      members: { "/version": memberHash(1), "/description": memberHash("engine") },
      elements: { "/hooks/stop": [memberHash(E)] },
      createdFile: true,
    };
    const mreduce = (value: unknown, rec: CoOwnership | null, opts: Partial<{ legacy: boolean; deleteWhenEngineOnly: boolean; rendered: unknown }> = {}) =>
      reduceCoOwnedJson(doc(value), MSPEC, { record: rec, legacy: false, deleteWhenEngineOnly: true, ...opts });

    // TEST CHANGE, justified: review/31 (signed off) — a recorded `yield`
    // member leaves without a backup only when it equals the engine's current
    // rendering; with no rendering handed in, its removal is mustBackUp.
    it("keeps a structural member while foreign content remains, and removes the rest", () => {
      expect(mreduce({ version: 1, description: "engine", hooks: { stop: [E, O] } }, record, { rendered: { description: "engine" } })).toEqual({
        kind: "reduced",
        content: doc({ version: 1, hooks: { stop: [O] } }),
        proven: true,
        detail: expect.any(String) as unknown,
      });
      expect(mreduce({ version: 1, description: "engine", hooks: { stop: [E, O] } }, record)).toMatchObject({
        kind: "reduced",
        content: doc({ version: 1, hooks: { stop: [O] } }),
        proven: false,
        mustBackUp: true,
      });
    });

    // TEST CHANGE, justified: review/45 (signed off) — a `collide` member, the
    // structural `version` included, leaves without a backup only when it
    // equals the rendering handed in; with none, its removal is mustBackUp.
    it("removes a structural member with everything else when nothing foreign remains", () => {
      expect(mreduce({ version: 1, description: "engine", hooks: { stop: [E] } }, record, { rendered: { description: "engine", version: 1 } })).toEqual({
        kind: "engine-only",
        proven: true,
        detail: expect.any(String) as unknown,
      });
      expect(mreduce({ version: 1, description: "engine", hooks: { stop: [E] } }, record, { rendered: { description: "engine" } })).toMatchObject({
        kind: "engine-only",
        proven: false,
        mustBackUp: true,
      });
      expect(mreduce({ version: 1, description: "engine", hooks: { stop: [E] } }, record)).toMatchObject({ kind: "engine-only", proven: false, mustBackUp: true });
      expect(mreduce({ version: 1, hooks: { stop: [E] } }, record, { deleteWhenEngineOnly: false, rendered: { version: 1 } })).toEqual({
        kind: "reduced",
        content: "{}\n",
        proven: true,
        detail: expect.any(String) as unknown,
      });
    });

    it("yield: a forged record over the owner's own value removes it only behind a backup (review/31)", () => {
      const forged: CoOwnership = { members: { "/description": memberHash("mine") }, elements: { "/hooks/stop": [memberHash(E)] } };
      expect(mreduce({ description: "mine", hooks: { stop: [E] } }, forged, { rendered: { description: "engine" } })).toMatchObject({
        kind: "engine-only",
        proven: false,
        mustBackUp: true,
      });
    });

    it("collide: a forged record over the owner's own value removes it only behind a backup (review/45)", () => {
      const spec: CoOwnedJsonSpec = { ...MSPEC, members: [{ pointer: "/meta", foreign: "collide" }] };
      const forged: CoOwnership = { members: { "/meta": memberHash("mine") }, elements: { "/hooks/stop": [memberHash(E)] } };
      const out = reduceCoOwnedJson(doc({ meta: "mine", hooks: { stop: [E] }, keep: 1 }), spec, {
        record: forged,
        legacy: false,
        deleteWhenEngineOnly: false,
        rendered: { meta: "engine" },
      });
      expect(out).toMatchObject({ kind: "reduced", content: doc({ keep: 1 }), proven: false, mustBackUp: true });
    });

    it("yield, structural: a removed one outside the bound is mustBackUp; one kept beside foreign content owes nothing", () => {
      const spec: CoOwnedJsonSpec = { ...MSPEC, members: [{ pointer: "/description", foreign: "yield", structural: true }] };
      const rec: CoOwnership = { members: { "/description": memberHash("engine") }, elements: { "/hooks/stop": [memberHash(E)] }, createdFile: true };
      const run = (value: unknown): unknown =>
        reduceCoOwnedJson(doc(value), spec, { record: rec, legacy: false, deleteWhenEngineOnly: true });
      expect(run({ description: "engine", hooks: { stop: [E] } })).toMatchObject({ kind: "engine-only", proven: false, mustBackUp: true });
      expect(run({ description: "engine", hooks: { stop: [E, O] } })).toEqual({
        kind: "reduced",
        content: doc({ description: "engine", hooks: { stop: [O] } }),
        proven: true,
        detail: expect.any(String) as unknown,
      });
    });

    it("keeps an edited yield member as the owner's; removes an edited collide member unproven", () => {
      expect(mreduce({ description: "mine", hooks: { stop: [E] } }, record)).toMatchObject({
        kind: "reduced",
        content: doc({ description: "mine" }),
        proven: true,
      });
      expect(mreduce({ version: 2, description: "engine", hooks: { stop: [E] } }, record)).toMatchObject({ kind: "engine-only", proven: false });
    });

    it("keeps an unrecorded member; under a legacy row a structural one or one equal to the rendering is the engine's", () => {
      expect(mreduce({ description: "engine", hooks: { stop: [O] } }, { elements: {} })).toMatchObject({ kind: "untouched" });
      // With no rendering the legacy description is the owner's, so foreign
      // content remains and the structural version stays beside it.
      expect(mreduce({ version: 1, description: "engine", hooks: { stop: [E] } }, null, { legacy: true })).toMatchObject({
        kind: "reduced",
        content: doc({ version: 1, description: "engine" }),
        proven: false,
      });
      expect(mreduce({ version: 1, description: "engine", hooks: { stop: [E] } }, null, { legacy: true, rendered: { description: "engine" } })).toMatchObject({
        kind: "engine-only",
        proven: false,
      });
    });

    it("legacy with a rendering: an element equal to a rendered one is the engine's", () => {
      const R = { command: "node other.mjs" };
      expect(mreduce({ hooks: { stop: [R, O] } }, null, { legacy: true, rendered: { hooks: { stop: [R] } } })).toMatchObject({
        kind: "reduced",
        content: doc({ hooks: { stop: [O] } }),
      });
    });
  });
});

// ── executedScript ───────────────────────────────────────────────────────

describe("executedScript", () => {
  // REQ-FLOW-037: the hook documents bound an entry by where the script it
  // executes lies, read by the same grammar `commandRunsStateScript` uses.
  it.each([
    ["node .cursor/hooks/mcp-guard.mjs", ".cursor/hooks/mcp-guard.mjs"],
    ["node ./.stamity/generated/hooks/cursor/a.mjs eyJhIjoxfQ", ".stamity/generated/hooks/cursor/a.mjs"],
    ['node "${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/a.mjs"', ".stamity/generated/hooks/claude/a.mjs"],
    ["scripts/run.sh --flag", "scripts/run.sh"],
    ["deno run scripts/x.ts", "scripts/x.ts"],
    ["node", null],
    ["deno run", null],
    ["", null],
    ["node a//b.mjs", null],
    ["node ../x.mjs", null],
    ["node x.mjs; rm -rf y", null],
  ] as const)("%j → %j", (cmd, expected) => {
    expect(executedScript(cmd)).toBe(expected);
  });
});

// ── commandRunsStateScript ───────────────────────────────────────────────

describe("commandRunsStateScript", () => {
  // TEST CHANGE, justified: review/44 (signed off) — the backup-free bound is
  // the engine's own script folders, `.stamity/generated/hooks/` and an
  // installed pack's `.stamity/packs/<id>/`; the user's `.stamity/hooks/` and
  // the rest of `.stamity/` are outside it. The in-bound cases moved onto
  // those folders; the user's folder is pinned out of bound below.
  it.each([
    ["node .stamity/hooks/x.mjs", false],
    ["node .stamity/x.mjs", false],
    ["node .stamity/packs/acme__ops/hooks/audit.mjs", true],
    ['node "${CLAUDE_PROJECT_DIR}/.stamity/packs/acme/a.mjs"', true],
    ["node .stamity/packs/a.mjs", false],
    ["node .stamity/packs//a.mjs", false],
    ["node .stamity/generated/hooks/", false],
    ["node .stamity/generated/x.mjs", false],
    ["node .stamity/generated/hooks/x.mjs", true],
    ['node "${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/a.mjs"', true],
    ["node './.stamity/generated/hooks/x.mjs'", true],
    ['".stamity/generated/hooks/x.sh"', true],
    [".stamity/generated/hooks/x.sh", true],
    ["node scripts/guard.sh", false],
    ["node my.stamity/generated/hooks/x.mjs", false],
    ["node .stamityx/x.mjs", false],
    ["node scripts/.stamity", false],
  ] as const)("%j → %s", (cmd, expected) => {
    expect(commandRunsStateScript(cmd)).toBe(expected);
  });

  // review/32 (signed off): the EXECUTED script decides — the program, or the
  // first argument after the interpreter — in each form the engine renders. A
  // `.stamity/` path anywhere else in the command does not count.
  const TAIL = `|| { s=$?; [ "$s" -eq 2 ] && exit 2; echo 'stamity: the pre-tool-use guard could not run; run \`stamity sync\`' >&2; exit 2; }`;
  it.each([
    [`node "\${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs" ${TAIL}`, true],
    ["node .stamity/generated/hooks/cursor/stamity-portable-hook.mjs eyJhIjoxfQ", true],
    ["deno run .stamity/generated/hooks/x.ts", true],
    ["bun run .stamity/generated/hooks/x.ts", true],
    ["python3 .stamity/generated/hooks/x.py --flag value", true],
    ['"${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/x.sh"', true],
    ["./scripts/guard.sh --config .stamity/guard.json", false],
    ["node scripts/x.mjs .stamity/a.json", false],
    ["node --import .stamity/generated/hooks/x.mjs scripts/evil.mjs", false],
    ["node .stamity/../scripts/evil.mjs", false],
    ["node .stamity/", false],
    ["node .stamity/generated/hooks/x.mjs; ./evil.sh", false],
    ["node .stamity/generated/hooks/x.mjs && ./evil.sh", false],
    ["node .stamity/generated/hooks/x.mjs | sh", false],
    ["node .stamity/generated/hooks/x.mjs || ./evil.sh", false],
    ["node .stamity/generated/hooks/x.mjs > out.txt", false],
    ["sh -c 'node .stamity/generated/hooks/x.mjs'", false],
    ["bash .stamity/generated/hooks/x.sh", false],
    ["/tmp/node .stamity/generated/hooks/x.mjs", false],
    ["deno .stamity/generated/hooks/x.ts", true],
    ["deno run --allow-all .stamity/generated/hooks/x.ts", false],
    ['node "$HOME/.stamity/generated/hooks/x.mjs"', false],
    ["node $CLAUDE_PROJECT_DIR/.stamity/generated/hooks/x.mjs", false],
    ["node '${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/x.mjs'", false],
    ['node "x${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/x.mjs"', false],
    ['node "${CLAUDE_PROJECT_DIR}/scripts/x.mjs" .stamity/a.json', false],
    ["node $(echo .stamity/generated/hooks/x.mjs)", false],
    ["node `echo .stamity/generated/hooks/x.mjs`", false],
    ['node "unterminated', false],
    ["node 'unterminated", false],
    [`node .stamity/x${String.fromCharCode(0)}.mjs`, false],
    ['node "$CLAUDE_PROJECT_DIR/.stamity/generated/hooks/x.mjs"', true],
    ['node "$CLAUDE_PROJECT_DIRX/.stamity/generated/hooks/x.mjs"', false],
    ['node "${CLAUDE_PROJECT_DIR}', false],
    ['node ".stamity/`x`.mjs"', false],
    ['node ".stamity/x\\".mjs"', false],
    ["node .stamity/x\\ y.mjs", false],
    ["node \t .stamity/generated/hooks/x.mjs  ", true],
    [`node ".stamity/generated/hooks/a"'b'.mjs`, true],
    ['"./.stamity/generated/hooks/x.sh"', true],
    [`node .stamity/generated/hooks/x.mjs || { s=$?; [ "$s" -eq 2 ] && exit 2; echo 'a'\\''b' >&2; exit 2; }`, false],
    ["", false],
  ] as const)("the executed script decides: %j → %s", (cmd, expected) => {
    expect(commandRunsStateScript(cmd)).toBe(expected);
  });

  it("holds every command of the engine's own rendered settings document in bound", async () => {
    const settings = JSON.parse(await readFile(join(process.cwd(), ".claude", "settings.json"), "utf8")) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    const commands = Object.values(settings.hooks).flatMap((groups) => groups.flatMap((entry) => entry.hooks.map((hook) => hook.command)));
    expect(commands.length).toBeGreaterThan(0);
    for (const cmd of commands) expect(commandRunsStateScript(cmd), cmd).toBe(true);
  });
});

// ── predictCoOwnedMerge / materializeCoOwned ─────────────────────────────

describe("predictCoOwnedMerge / materializeCoOwned", () => {
  const planner = (filePath: string, ownership: CoOwnedOwnership, emitted = EMITTED) => (raw: string | null): CoOwnedPlan =>
    planCoOwnedJson(filePath, emitted, raw, SPEC, ownership);

  it("creates the file, writes once, and hands back the bytes and the record for the ledger", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    const ownership = noRow({ boundaryDir: repo.dir });

    expect((await predictCoOwnedMerge(path, planner(path, ownership), SPEC.noun)).result.action).toBe("created");
    const result = await materializeCoOwned(path, planner(path, ownership), ownership, SPEC.noun);

    expect(result).toEqual({ path, action: "created", writtenContent: EMITTED, writtenRecord: { elements: ENGINE_ELEMENTS, createdFile: true } });
    expect(await readFile(path, "utf8")).toBe(EMITTED);
    expect(writes.paths).toEqual([path]);
  });

  it("does not rewrite an unchanged file and still reports its bytes and record", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    await repo.seedFiles({ ".claude/settings.json": EMITTED });
    const ownership = recorded({ elements: ENGINE_ELEMENTS }, { boundaryDir: repo.dir });

    const result = await materializeCoOwned(path, planner(path, ownership), ownership, SPEC.noun);

    expect(result).toEqual({ path, action: "unchanged", writtenContent: EMITTED, writtenRecord: { elements: ENGINE_ELEMENTS } });
    expect(writes.paths).toEqual([]);
  });

  it("backs the previous file up before a write that owes it, and names the .bak", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    const existing = doc({ hooks: { PreToolUse: [OLDER] } });
    await repo.seedFiles({ ".claude/settings.json": existing });
    const ownership = noRow({ boundaryDir: repo.dir });

    const result = await materializeCoOwned(path, planner(path, ownership), ownership, SPEC.noun);

    expect(result.action).toBe("updated");
    expect(result.warning).toMatch(/Your previous file is at .*settings\.json\.bak/);
    const baks = (await readdir(repo.path(".claude"))).filter((name) => name.includes(".bak"));
    expect(baks).toHaveLength(1);
    expect(await readFile(repo.path(".claude", baks[0] as string), "utf8")).toBe(existing);
    expect(await readFile(path, "utf8")).toBe(doc({ hooks: { PreToolUse: [GUARD] }, permissions: { allow: ENGINE_ROWS } }));
  });

  it("previews and skips a collision as co-owned-shape, writing nothing and recording nothing", async () => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    const existing = doc({ permissions: "allow-all" });
    await repo.seedFiles({ ".claude/settings.json": existing });
    const ownership = noRow({ boundaryDir: repo.dir });

    const predicted = await predictCoOwnedMerge(path, planner(path, ownership), SPEC.noun);
    expect(predicted.result.action).toBe("skipped");
    expect(predicted.collision).toEqual({ kind: "co-owned-shape", detail: predicted.result.warning });

    const result = await materializeCoOwned(path, planner(path, ownership), ownership, SPEC.noun);
    expect(result.action).toBe("skipped");
    expect(result.writtenContent).toBeNull();
    expect(result.writtenRecord).toBeNull();
    expect(writes.paths).toEqual([]);
    expect(await readFile(path, "utf8")).toBe(existing);
  });

  it("refuses a target outside the boundary before building its parent directory", async () => {
    const repo = getRepo();
    const outside = join(repo.dir, "..", `co-owned-outside-${Date.now()}`, "settings.json");
    const ownership = noRow({ boundaryDir: repo.dir });
    await expect(materializeCoOwned(outside, planner(outside, ownership), ownership, SPEC.noun)).rejects.toThrow();
    expect(writes.paths).toEqual([]);
  });

  it("refuses a symbolic or hard link before any read: shared-name in the preview, a throw on the write", async () => {
    const repo = getRepo();
    await repo.seedFiles({ "outside/secret.json": doc({ client_secret: "s3cret" }), ".claude/.keep": "" });
    const outside = repo.path("outside/secret.json");
    const ownership = recorded({}, { boundaryDir: repo.dir });

    const soft = repo.path(".claude/settings.json");
    await symlink(outside, soft);
    const predicted = await predictCoOwnedMerge(soft, planner(soft, ownership), SPEC.noun);
    expect(predicted.collision?.kind).toBe("shared-name");
    await expect(materializeCoOwned(soft, planner(soft, ownership), ownership, SPEC.noun)).rejects.toThrow(/symbolic link/);
    await expect(refuseLinkedCoOwnedTarget(soft)).rejects.toThrow(/symbolic link/);

    const hard = repo.path(".claude/other.json");
    await link(outside, hard);
    const hardPredicted = await predictCoOwnedMerge(hard, planner(hard, ownership), SPEC.noun);
    expect(hardPredicted.collision?.kind).toBe("shared-name");
    expect(hardPredicted.collision?.detail).toContain("hard link");
    await expect(materializeCoOwned(hard, planner(hard, ownership), ownership, SPEC.noun)).rejects.toThrow(/hard link/);

    expect(writes.paths).toEqual([]);
    expect(await readFile(outside, "utf8")).toBe(doc({ client_secret: "s3cret" }));
  });

  it("reports a read failure as the shared mapped sentence naming the noun", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".claude/settings.json/.keep": "" });
    const path = repo.path(".claude/settings.json");
    await expect(predictCoOwnedMerge(path, planner(path, noRow()), SPEC.noun)).rejects.toThrow(
      /Cannot read the settings document at .*that path is a directory/,
    );
  });

  it("refuses nothing at a missing path, and rethrows an lstat failure that is not ENOENT", async () => {
    const repo = getRepo();
    await expect(refuseLinkedCoOwnedTarget(repo.path("nothing-here.json"))).resolves.toBeUndefined();
    await writeFile(repo.path("file"), "x");
    await expect(refuseLinkedCoOwnedTarget(repo.path("file", "below.json"))).rejects.toMatchObject({ code: "ENOTDIR" });
  });
});

// ── The edges of every rule ──────────────────────────────────────────────

describe("planCoOwnedJson / reduceCoOwnedJson — edges", () => {
  const LIST_SPEC: CoOwnedJsonSpec = {
    noun: "list document",
    elements: [{ pointer: "/list", recognise: () => false, inBound: (element) => element === "engine", outsideBound: "foreign" }],
    members: [],
  };

  it("writes a depth-1 array slot, and refuses a rendering that is not an array there or a container that is not an object", () => {
    const out = plan(doc({ list: ["mine"] }), noRow(), doc({ list: ["engine"] }), LIST_SPEC);
    expect(out.content).toBe(doc({ list: ["mine", "engine"] }));
    expect(out.record).toEqual({ elements: { "/list": [memberHash("engine")] }, preexisting: ["/list"] });
    expect(plan(doc({ list: "x" }), noRow(), doc({ list: ["engine"] }), LIST_SPEC).collision).toContain("list is a string, not an array");
    expect(() => plan(null, noRow(), doc({ list: "engine" }), LIST_SPEC)).toThrow(/carries list as a string, not an array/);
    expect(() => plan(null, noRow(), doc({ permissions: "x" }))).toThrow(/carries permissions as a string, not an object/);
  });

  it("skips an empty rendered event and a non-array event it writes nothing into", () => {
    const out = plan(doc({ hooks: { Stop: "x", Notification: [] } }), recorded({}), doc({ permissions: { allow: ENGINE_ROWS }, hooks: { PreToolUse: [GUARD], Notification: [] } }));
    expect(out.collision).toBeNull();
    expect(parsed(out.content)).toEqual({ hooks: { Stop: "x", Notification: [], PreToolUse: [GUARD] }, permissions: { allow: ENGINE_ROWS } });
    expect(plan(null, noRow(), doc({ hooks: { PreToolUse: [GUARD], Notification: [] } })).record).toEqual({
      elements: { "/hooks/PreToolUse": [memberHash(GUARD)] },
      createdFile: true,
    });
  });

  it("leaves an already-empty container alone when it is not preexisting", () => {
    const out = plan(doc({ permissions: { allow: ENGINE_ROWS }, hooks: {} }), recorded({ elements: ENGINE_ELEMENTS }), EMITTED_PLUGIN);
    expect(out.result.action).toBe("unchanged");
  });

  it("names several entries in one warning, in the plural", () => {
    const two = [group("node .stamity/generated/hooks/claude/a.mjs", "x"), group("node .stamity/generated/hooks/claude/b.mjs", "y")];
    const replaced = plan(doc({ hooks: { PreToolUse: two } }), noRow());
    expect(replaced.result.warning).toContain("Replaced hooks.PreToolUse[0], hooks.PreToolUse[1] of .claude/settings.json: each runs the engine's hook script");

    const owners = [group("./one.sh"), group("./two.sh")];
    const forged = plan(doc({ hooks: { Stop: owners } }), recorded({ elements: { "/hooks/Stop": owners.map(memberHash) } }));
    expect(forged.result.warning).toContain("the ledger records them as the engine's, but they lie outside");
  });

  it("names a file-authored key with every unprintable code point dropped", () => {
    const unprintable = [0x07, 0x85, 0x200b, 0x202a, 0x2060, 0x2066, 0xfeff].map((code) => String.fromCharCode(code)).join("");
    const out = plan(doc({ hooks: { [`A${unprintable}B\tC`]: [OWNER_STOP] } }), noRow(), EMITTED_PLUGIN);
    expect(out.result.notice).toContain("hooks.AB C ×1");
  });

  it("rethrows a failure that is not the stack's, from the planner and the reducer alike", () => {
    const boom: CoOwnedJsonSpec = {
      ...SPEC,
      elements: [{ pointer: "/hooks/*", recognise: () => { throw new TypeError("spec bug"); }, inBound: () => false, outsideBound: "backup" }],
    };
    expect(() => plan(doc({ hooks: { Stop: [1] } }), noRow(), doc({ hooks: {} }), boom)).toThrow("spec bug");
    expect(() => reduceCoOwnedJson(doc({ hooks: { Stop: [1] } }), boom, { record: null, legacy: false, deleteWhenEngineOnly: false })).toThrow("spec bug");
  });

  it("skips a non-array slot in the reducer and removes the engine's entries beside it", () => {
    const out = reduceCoOwnedJson(doc({ hooks: { Stop: "x", PreToolUse: [GUARD] } }), SPEC, {
      record: { elements: ENGINE_ELEMENTS },
      legacy: false,
      deleteWhenEngineOnly: true,
    });
    expect(out).toMatchObject({ kind: "reduced", content: doc({ hooks: { Stop: "x" } }), proven: true });
  });

  describe("members", () => {
    const MSPEC: CoOwnedJsonSpec = {
      noun: "hooks document",
      elements: [],
      members: [
        { pointer: "/version", foreign: "collide", structural: true },
        { pointer: "/description", foreign: "yield" },
        { pointer: "/meta", foreign: "collide" },
      ],
    };

    it("records every rendered member of a created file", () => {
      expect(plan(null, noRow(), doc({ version: 1, description: "d" }), MSPEC).record).toEqual({
        members: { "/version": memberHash(1), "/description": memberHash("d") },
        createdFile: true,
      });
    });

    it("keeps a structural member the rendering stops carrying, recording it only while proven", () => {
      const proven = plan(doc({ version: 1, description: "d" }), recorded({ members: { "/version": memberHash(1) } }), doc({ description: "d" }), MSPEC);
      expect(proven.content).toBeNull();
      // The description is unrecorded and equal to the rendering: the owner's (rule 5), so not recorded.
      expect(proven.record?.members).toEqual({ "/version": memberHash(1) });
      const edited = plan(doc({ version: 2, description: "d" }), recorded({ members: { "/version": memberHash(1) } }), doc({ description: "d" }), MSPEC);
      expect(edited.content).toBeNull();
      expect(edited.record?.members).toBeUndefined();
    });

    // TEST CHANGE, justified: review/45 (signed off) — a value the rendering no
    // longer carries cannot equal it, so its removal takes the backup.
    it("collide: removes a recorded, unedited member the rendering no longer carries behind a backup", () => {
      const existing = doc({ meta: { a: 1 }, keep: 1 });
      const out = plan(existing, recorded({ members: { "/meta": memberHash({ a: 1 }) } }), doc({}), MSPEC);
      expect(out.content).toBe(doc({ keep: 1 }));
      expect(out.backup).toBe(existing);
      expect(out.result.warning).toBe(
        `Removed meta from ${SHOWN}: the engine can prove it wrote a value there only when it equals its current ` +
          `rendering, and this one does not, so the previous file was backed up first.`,
      );
    });

    it("does nothing for a member neither the file nor the rendering carries", () => {
      expect(plan(doc({ version: 1 }), noRow(), doc({ version: 1 }), MSPEC).result.action).toBe("unchanged");
    });

    it("keeps an owner's differing yield member quietly once the ledger owns the file", () => {
      const out = plan(doc({ description: "mine" }), recorded({}), doc({ description: "d" }), MSPEC);
      expect(out.result).toEqual({ path: FILE, action: "unchanged" });
    });

    it("names the engine's value in a collide remedy only when it is a short scalar", () => {
      expect(plan(doc({ meta: { a: 2 } }), noRow(), doc({ meta: { a: 1 } }), MSPEC).collision).toContain(
        "where it writes the engine's value, so",
      );
      expect(plan(doc({ meta: "x" }), noRow(), doc({ meta: "y".repeat(80) }), MSPEC).collision).toContain("Make it the engine's value (or remove it)");
      expect(plan(doc({ meta: 2 }), noRow(), doc({ meta: 1 }), MSPEC).collision).toContain("Make it 1 (or remove it)");
    });
  });
});

describe("predictCoOwnedMerge / materializeCoOwned — edges", () => {
  const planner = (filePath: string, ownership: CoOwnedOwnership) => (raw: string | null): CoOwnedPlan =>
    planCoOwnedJson(filePath, EMITTED, raw, SPEC, ownership);

  it("rethrows an lstat failure from the preview that is not a link refusal", async () => {
    const repo = getRepo();
    await writeFile(repo.path("file"), "x");
    const path = repo.path("file", "below.json");
    await expect(predictCoOwnedMerge(path, planner(path, noRow()), SPEC.noun)).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("passes an errno the shared table does not map through unchanged when the parent cannot be created", async () => {
    const repo = getRepo();
    await writeFile(repo.path("file"), "x");
    const path = repo.path("file", "below", "settings.json");
    await expect(materializeCoOwned(path, planner(path, noRow()), { boundaryDir: repo.dir }, SPEC.noun)).rejects.toMatchObject({ code: "ENOTDIR" });
    expect(writes.paths).toEqual([]);
  });

  // A POSIX mode cannot deny a directory write on Windows (learning
  // the-local-test-gate-is-weaker-than-ci), and root ignores it.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "maps a parent directory it is denied to the shared errno sentence",
    async () => {
      const repo = getRepo();
      await repo.seedFiles({ "locked/.keep": "" });
      await chmod(repo.path("locked"), 0o500);
      try {
        const path = repo.path("locked", "below", "settings.json");
        await expect(materializeCoOwned(path, planner(path, noRow()), { boundaryDir: repo.dir }, SPEC.noun)).rejects.toBeInstanceOf(EngineError);
      } finally {
        await chmod(repo.path("locked"), 0o700);
      }
    },
  );

  it("writes with no boundary declared, and backs up for a plan whose backup carries no warning", async () => {
    const repo = getRepo();
    const path = repo.path("doc.json");
    await repo.seedFiles({ "doc.json": "{}\n" });
    const result = await materializeCoOwned(
      path,
      () => ({ result: { path, action: "updated" }, content: '{"a":1}\n', backup: "{}\n", collision: null, record: {} }),
      {},
      SPEC.noun,
    );
    expect(result.warning).toMatch(/^Your previous file is at .*doc\.json\.bak/);
    expect(await readFile(path, "utf8")).toBe('{"a":1}\n');
  });

  it.each([new Error("unlock failed"), "unlock failed"])("never masks the write with a lock-release failure (%j)", async (thrown) => {
    const repo = getRepo();
    const path = repo.path(".claude/settings.json");
    writes.releaseThrows = thrown;
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = await materializeCoOwned(path, planner(path, noRow({ boundaryDir: repo.dir })), { boundaryDir: repo.dir }, SPEC.noun);
      expect(result.action).toBe("created");
      expect(logged).toHaveBeenCalledWith(`Failed to release the write lock on ${path}: unlock failed`);
    } finally {
      logged.mockRestore();
    }
  });
});
