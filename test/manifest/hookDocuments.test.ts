import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CURSOR_GUARD_EVENTS, EVENT_RENAME, MCP_GUARD_PATH, SUBAGENT_GUARD_PATH, buildHooksJson } from "../../src/adapters/cursor.ts";
import type { HookInterchange } from "../../src/hooks/model.ts";
import { portableHookCommand } from "../../src/hooks/portableRunner.ts";
import { planCoOwnedJson, reduceCoOwnedJson } from "../../src/manifest/coOwnedJson.ts";
import {
  CURSOR_HOOK_EVENTS,
  codexHooksSpec,
  cursorHookDefects,
  cursorHooksSpec,
  describeCursorHookDefects,
  directHookRendering,
  hookScriptReader,
  isKnownCodexHooksDescription,
  isKnownCodexHooksStamity,
  referencedHookScripts,
} from "../../src/manifest/hookDocuments.ts";
import { memberHash } from "../../src/manifest/jsonMembers.ts";
import { HOOKS_GENERATED_DIR, STATE_DIR } from "../../src/types/markers.ts";

/**
 * The two hook documents' specs, the release-history bound, S19's defect
 * reader and S17's script reader, pure. The verbs that use them are
 * `../merge/hookFilesOwnership.test.ts`.
 */

const GUARDS = [SUBAGENT_GUARD_PATH, MCP_GUARD_PATH];
const cursor = cursorHooksSpec({ guardPaths: GUARDS });
const codex = codexHooksSpec();
const cursorElement = cursor.elements[0]!;
const codexElement = codex.elements[0]!;

/** Every `description` 1.7.0–1.11.0 wrote, from each tag's golden snapshot (read 2026-10-07). */
const RELEASE_DESCRIPTIONS = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "codex-hooks-descriptions.json"), "utf8"),
) as Record<string, string>;

/** The `stamity` member 1.0.0–1.6.0 wrote into `.codex/hooks.json`, one value in every one of those tags' golden snapshots. */
const RELEASE_STAMITY = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "codex-hooks-stamity-member.json"), "utf8")) as {
  releases: string[];
  stamity: Record<string, unknown>;
};

/** `.cursor/hooks.json` and `.codex/hooks.json` as 1.6.0's golden snapshot holds them, user hook included. */
const RELEASE_ONE_SIX = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "release-1-6-0-hook-files.json"), "utf8")) as Record<
  string,
  string
>;

const row = (event: HookInterchange["event"], script: string): HookInterchange => ({ event, command: ["node", script] });

/** A script in an installed pack's folder, which the bound proves by path as the settings lane's does (review/69). */
const PACK_SCRIPT = `${STATE_DIR}/packs/acme__ops/tools/gate.mjs`;

/** Cursor commands that name a pack's folder but do not execute a script in it. */
const OUTSIDE_PACK_BOUND = [
  `node ${STATE_DIR}/packs/gate.mjs`,
  `node ${STATE_DIR}/packs/acme/../../hooks/x.mjs`,
  `node scripts/wrap.mjs ${PACK_SCRIPT}`,
  `npx ${PACK_SCRIPT}`,
  `node ${PACK_SCRIPT}; node scripts/x.mjs`,
  `node $(echo ${PACK_SCRIPT})`,
];
const encoded = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

/** The 1.7.0–1.8.0 starter, its body as that golden holds it, and a row. */
const STARTER_1_7 =
  `node -e "const fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process');let d=process.cwd();for(;;){` +
  `const f=p.join(d,'.stamity/generated/hooks/codex/stamity-portable-hook.mjs');if(fs.existsSync(f)){const r=cp.spawnSync(` +
  `process.execPath,[f,...process.argv.slice(1)],{stdio:'inherit'});process.exitCode=r.status??1;break;}const up=p.dirname(d);` +
  `if(up===d){process.stderr.write('Stamity hook project root not found');process.exitCode=1;break;}d=up;}" ` +
  encoded({ event: "session_start", command: ["node", `${HOOKS_GENERATED_DIR}/codex/stamity-session-start.mjs`] });

/** The renderer's own starter (1.9.0 on), with the given sync call. */
const starter = (syncCall: string): string =>
  portableHookCommand("codex", row("session_start", `${HOOKS_GENERATED_DIR}/codex/stamity-session-start.mjs`), { syncCall });

const group = (...hooks: unknown[]): unknown => ({ hooks });
const starterHook = (command: string, commandWindows: unknown = command): unknown => ({ type: "command", command, commandWindows });

// ── S19 ────────────────────────────────────────────────────────

describe("CURSOR_HOOK_EVENTS", () => {
  it("holds the 21 events Cursor's validator accepts, each once, every event the adapter writes among them", () => {
    expect(CURSOR_HOOK_EVENTS).toHaveLength(21);
    expect(new Set(CURSOR_HOOK_EVENTS).size).toBe(21);
    for (const event of [...Object.values(EVENT_RENAME), ...Object.values(CURSOR_GUARD_EVENTS)]) {
      expect(CURSOR_HOOK_EVENTS).toContain(event);
    }
    expect(Object.isFrozen(CURSOR_HOOK_EVENTS)).toBe(true);
  });
});

describe("cursorHookDefects", () => {
  it("reads nothing from a document that is not an object, or whose hooks is not one", () => {
    expect(cursorHookDefects(null)).toEqual([]);
    expect(cursorHookDefects([])).toEqual([]);
    expect(cursorHookDefects({ hooks: [] })).toEqual([]);
    expect(cursorHookDefects({ version: 1 })).toEqual([]);
  });

  it("names an unknown event by its pointer, escaped per RFC 6901, and an entry or event value that runs no command", () => {
    const doc = {
      version: 1,
      hooks: {
        sessionStart: [{ command: "node a.mjs" }, { matcher: "x" }, "bare", { command: "  " }, { command: 3 }],
        PreToolUse: [{ hooks: [{ type: "command", command: "node b.mjs" }] }],
        "a/b~c": [],
        stop: { command: "node c.mjs" },
      },
    };
    expect(cursorHookDefects(doc)).toEqual([
      { pointer: "/hooks/sessionStart/1", reason: "no-command" },
      { pointer: "/hooks/sessionStart/2", reason: "no-command" },
      { pointer: "/hooks/sessionStart/3", reason: "no-command" },
      { pointer: "/hooks/sessionStart/4", reason: "no-command" },
      { pointer: "/hooks/PreToolUse", reason: "unknown-event" },
      { pointer: "/hooks/a~1b~0c", reason: "unknown-event" },
      { pointer: "/hooks/stop", reason: "no-command" },
    ]);
  });

  it("finds none in the engine's own rendering", () => {
    const rendered = JSON.parse(buildHooksJson([row("session_start", `${HOOKS_GENERATED_DIR}/cursor/s.mjs`)]));
    expect(cursorHookDefects(rendered)).toEqual([]);
  });

  // S19, amended 2026-10-07 after the vendor re-read: Cursor documents
  // prompt-based hooks, `{ "type": "prompt", "prompt": … }` with no command.
  it("reads each entry by its type: a command one needs a command, a prompt one a prompt, and any other type fails", () => {
    const cursorExample = { version: 1, hooks: { beforeShellExecution: [{ type: "prompt", prompt: "Is this command safe?", timeout: 10 }] } };
    expect(cursorHookDefects(cursorExample)).toEqual([]);
    const doc = {
      hooks: {
        stop: [
          { type: "command", command: "node a.mjs" },
          { type: "command" },
          { type: "prompt", prompt: "  " },
          { type: "prompt", command: "node b.mjs" },
          { type: "agent", command: "node c.mjs" },
          { type: 3, prompt: "x" },
        ],
      },
    };
    expect(cursorHookDefects(doc)).toEqual([
      { pointer: "/hooks/stop/1", reason: "no-command" },
      { pointer: "/hooks/stop/2", reason: "no-prompt" },
      { pointer: "/hooks/stop/3", reason: "no-prompt" },
      { pointer: "/hooks/stop/4", reason: "unknown-type" },
      { pointer: "/hooks/stop/5", reason: "unknown-type" },
    ]);
  });
});

describe("describeCursorHookDefects", () => {
  const text = (doc: unknown): string => `${JSON.stringify(doc, null, 2)}\n`;

  it("says nothing for no file, a file that does not parse, or one Cursor accepts", () => {
    expect(describeCursorHookDefects(".cursor/hooks.json", null)).toBeNull();
    expect(describeCursorHookDefects(".cursor/hooks.json", "{ not json")).toBeNull();
    expect(describeCursorHookDefects(".cursor/hooks.json", text({ version: 1, hooks: { stop: [{ command: "x" }] } }))).toBeNull();
  });

  it("names one unknown event, the date of the list and the remedy, past a byte-order mark", () => {
    const said = describeCursorHookDefects(".cursor/hooks.json", `\uFEFF${text({ hooks: { PreToolUse: [] } })}`);
    expect(said).toBe(
      "Cursor rejects .cursor/hooks.json as it stands: /hooks/PreToolUse is not an event Cursor accepts (the 21 events " +
        "cursor.com/docs/hooks listed on 2026-10-07). While it holds such an entry Cursor loads none of the file's hooks " +
        "(shown for Cursor 3.13.10 by microsoft/apm#3129), the engine's failClosed guards included. The entry is not the " +
        "engine's, so it was kept: remove that key or rename it to the Cursor event it means — a Claude-shaped key such " +
        "as PreToolUse that an APM package wrote goes away when that package is installed without the cursor target; if " +
        "Cursor has added the event since 2026-10-07, this engine's list is out of date.",
    );
  });

  it("names several of each kind, and drops unprintable code points from an owner's key", () => {
    const said = describeCursorHookDefects(
      "x.json",
      text({ hooks: { PreToolUse: [], "Up\u0007date": [], stop: [{}], sessionEnd: [{ matcher: "y" }] } }),
    );
    expect(said).toContain("/hooks/PreToolUse, /hooks/Update are not events Cursor accepts");
    expect(said).toContain("/hooks/stop/0, /hooks/sessionEnd/0 run no command");
    expect(said).toContain("give each such entry a command, or remove it.");
    expect(said).not.toContain("\u0007");
  });

  it("names a prompt hook with no prompt and an entry of another type, each with its remedy", () => {
    const said = describeCursorHookDefects("x.json", text({ hooks: { stop: [{ type: "prompt" }, { type: "agent" }, { type: "x" }] } }));
    expect(said).toContain("/hooks/stop/0 is a prompt hook with no prompt");
    expect(said).toContain('/hooks/stop/1, /hooks/stop/2 have a type Cursor does not run (it runs "command" and "prompt")');
    expect(said).toContain('so it was kept: give each such prompt hook a prompt, or remove it; set each such type to "command" or "prompt", or remove the entry.');
    const one = describeCursorHookDefects("x.json", text({ hooks: { stop: [{ type: "prompt" }, { type: "prompt" }, { type: "agent" }] } }));
    expect(one).toContain("/hooks/stop/0, /hooks/stop/1 are prompt hooks with no prompt");
    expect(one).toContain("/hooks/stop/2 has a type Cursor does not run");
    expect(one).not.toContain("give each such entry a command");
  });

  it("names one commandless entry alone, with only its remedy", () => {
    const said = describeCursorHookDefects("x.json", text({ hooks: { stop: [{}] } }));
    expect(said).toContain("/hooks/stop/0 runs no command.");
    expect(said).toContain("so it was kept: give each such entry a command, or remove it.");
    expect(said).not.toContain("APM");
  });
});

// ── Cursor's spec ──────────────────────────────────────────────

describe("cursorHooksSpec", () => {
  const runner = { command: portableHookCommand("cursor", row("session_start", `${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs`)) };

  it("recognises and bounds the runner rows, the pre-1.7.0 direct rows and both guards", () => {
    const direct = { command: `node ${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs` };
    for (const entry of [runner, direct, { command: `node ${SUBAGENT_GUARD_PATH}`, failClosed: true }, { command: `node ${MCP_GUARD_PATH}` }]) {
      expect(cursorElement.recognise(entry)).toBe(true);
      expect(cursorElement.inBound(entry)).toBe(true);
    }
  });

  it("recognises but does not bound an entry that only names an engine script as an argument", () => {
    const entry = { command: `node scripts/wrap.mjs ${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs` };
    expect(cursorElement.recognise(entry)).toBe(true);
    expect(cursorElement.inBound(entry)).toBe(false);
  });

  it("neither recognises nor bounds an owner's entry, another client's script, or a value with no command", () => {
    for (const entry of [{ command: "node scripts/fmt.mjs" }, { command: `node ${HOOKS_GENERATED_DIR}/claude/x.mjs` }, { matcher: "x" }, "node x", null]) {
      expect(cursorElement.recognise(entry)).toBe(false);
      expect(cursorElement.inBound(entry)).toBe(false);
    }
    // A command this grammar cannot read executes nothing it can prove.
    expect(cursorElement.inBound({ command: `node $(echo ${MCP_GUARD_PATH})` })).toBe(false);
  });

  it("bounds, without recognising, an entry executing a script in an installed pack's folder, as the settings lane does (review/69)", () => {
    for (const command of [`node ${PACK_SCRIPT}`, `node ./${PACK_SCRIPT}`, `deno run ${PACK_SCRIPT}`, PACK_SCRIPT]) {
      expect(cursorElement.recognise({ command, failClosed: true })).toBe(false);
      expect(cursorElement.inBound({ command, failClosed: true })).toBe(true);
    }
    for (const command of OUTSIDE_PACK_BOUND) expect(cursorElement.inBound({ command })).toBe(false);
  });

  it("knows `version` 1, the one value every release wrote, and no other", () => {
    const [version] = cursor.members;
    expect(version).toMatchObject({ pointer: "/version", foreign: "collide", structural: true });
    expect(version?.known?.(1)).toBe(true);
    expect(version?.known?.(2)).toBe(false);
    expect(version?.known?.("1")).toBe(false);
  });
});

// ── Codex's spec ───────────────────────────────────────────────

describe("codexHooksSpec", () => {
  it("bounds a group of the renderer's starters, any sync call it may carry, and every earlier release's starter", () => {
    for (const command of [
      starter("npx -y @zomarit/stamity@1.12.0 sync"),
      starter("stamity sync"),
      // A registry fork's call (`u0-registry-bound-calls` admits `:` and `=` in the renderer).
      starter("npx -y @zomarit/stamity@1.12.0 sync").replace(
        "npx -y @zomarit/stamity@1.12.0 sync",
        "npx -y --@acme:registry=https://npm.acme.example/ @acme/stamity@2.0.0 sync",
      ),
      STARTER_1_7,
    ]) {
      expect(codexElement.recognise(group(starterHook(command)))).toBe(true);
      expect(codexElement.inBound(group(starterHook(command), starterHook(command, undefined)))).toBe(true);
    }
  });

  it("bounds the argv rows 1.0.0–1.6.0 wrote", () => {
    const argv = { type: "command", command: ["node", `${HOOKS_GENERATED_DIR}/codex/stamity-session-start.mjs`], sha256: "a".repeat(64) };
    expect(codexElement.recognise(group(argv))).toBe(true);
    expect(codexElement.inBound(group(argv))).toBe(true);
  });

  it("bounds, without recognising, a 1.0.0–1.6.0 argv executing a script in an installed pack's folder (review/69)", () => {
    for (const command of [["node", PACK_SCRIPT], ["node", `./${PACK_SCRIPT}`], ["deno", "run", PACK_SCRIPT], [PACK_SCRIPT]]) {
      expect(codexElement.recognise(group({ type: "command", command }))).toBe(false);
      expect(codexElement.inBound(group({ type: "command", command }))).toBe(true);
    }
    const argvOutside: unknown[][] = [
      ["node", `${STATE_DIR}/packs/gate.mjs`],
      ["node", `${STATE_DIR}/packs/acme/../../hooks/x.mjs`],
      ["node", `${STATE_DIR}/packs/acme//x.mjs`],
      ["node", "scripts/wrap.mjs", PACK_SCRIPT],
      ["npx", PACK_SCRIPT],
      ["node", PACK_SCRIPT, 3],
      ["node", `${String.fromCharCode(0)}/${PACK_SCRIPT}`],
      ["node", `${STATE_DIR}/hooks/x.mjs`],
    ];
    for (const command of argvOutside) expect(codexElement.inBound(group({ type: "command", command }))).toBe(false);
    // 1.0.0–1.6.0 wrote no `commandWindows`, so an argv carrying one proves nothing, the engine's folder included.
    for (const script of [PACK_SCRIPT, `${HOOKS_GENERATED_DIR}/codex/x.mjs`]) {
      expect(codexElement.inBound(group({ type: "command", command: ["node", script], commandWindows: "node scripts/team.mjs" }))).toBe(false);
    }
  });

  it("does not bound a group holding anything but the engine's starter", () => {
    const good = starter("stamity sync");
    const cases: unknown[] = [
      group(starterHook(good), { type: "command", command: "node scripts/team-audit.mjs" }),
      group(starterHook(good, "node x")),
      group(starterHook(good, 7)),
      group(starterHook(`${good}!`)),
      group(starterHook(good.replace('node -e "', 'node -e  "'))),
      group(starterHook(good.slice(0, good.lastIndexOf('" ')))),
      group(starterHook(good.replace("Stamity hook script missing", "Stamity hook gone"))),
      group(starterHook(good.replace("process.exitCode=1;break;}const r=", "process.exitCode=2;break;}const r="))),
      group(starterHook(starter("stamity sync").replace("run stamity sync", "run stamity sync';evil();'"))),
      group({ type: "command", command: ["python3", `${HOOKS_GENERATED_DIR}/codex/a.py`] }),
      group({ type: "command", command: ["node", `${HOOKS_GENERATED_DIR}/codex/`] }),
      // review/61: a segment that leaves the folder the prefix names, as `executedScript` refuses on Cursor.
      group({ type: "command", command: ["node", `${HOOKS_GENERATED_DIR}/codex/../../../x.mjs`] }),
      group({ type: "command", command: ["node", `${HOOKS_GENERATED_DIR}/codex/./x.mjs`] }),
      group({ type: "command", command: ["node", `${HOOKS_GENERATED_DIR}/codex//x.mjs`] }),
      group({ type: "command", command: ["node"] }),
      group({ type: "command", command: 3 }),
      group("bare"),
      group(),
      { hooks: "x" },
      null,
    ];
    for (const value of cases) expect(codexElement.inBound(value)).toBe(false);
  });

  it("recognises a group by any inner command naming the engine's Codex scripts, in either spelling", () => {
    expect(codexElement.recognise(group({ command: "node scripts/x.mjs", commandWindows: `node ${HOOKS_GENERATED_DIR}/codex/a.mjs` }))).toBe(true);
    expect(codexElement.recognise(group({ command: ["node", "scripts/x.mjs"] }, { command: ["node", `${HOOKS_GENERATED_DIR}/codex/a.mjs`] }))).toBe(true);
    expect(codexElement.recognise(group({ command: ["node", 3] }, "bare", { command: "node scripts/x.mjs" }))).toBe(false);
    expect(codexElement.recognise({ matcher: "Bash" })).toBe(false);
  });

  it("knows every description a release wrote, the check call normalised, and nothing edited", () => {
    const [description] = codex.members;
    expect(description).toMatchObject({ pointer: "/description", foreign: "yield" });
    expect(Object.keys(RELEASE_DESCRIPTIONS)).toEqual(["1.7.0", "1.8.0", "1.9.0", "1.10.0", "1.11.0"]);
    for (const text of Object.values(RELEASE_DESCRIPTIONS)) expect(isKnownCodexHooksDescription(text)).toBe(true);
    const latest = RELEASE_DESCRIPTIONS["1.11.0"] as string;
    expect(latest).toContain("npx -y @zomarit/stamity@1.0.0-golden check");
    const fork = latest.replace("npx -y @zomarit/stamity@1.0.0-golden check", "npx -y --@acme:registry=https://npm.acme.example/ @acme/stamity@3.1.4 check");
    expect(isKnownCodexHooksDescription(fork)).toBe(true);
    expect(isKnownCodexHooksDescription(`${latest} Team note.`)).toBe(false);
    expect(isKnownCodexHooksDescription("Team hooks.")).toBe(false);
    expect(isKnownCodexHooksDescription(1)).toBe(false);
    expect(description?.known).toBe(isKnownCodexHooksDescription);
  });

  it("knows the stamity member 1.0.0–1.6.0 wrote, in any key order, and nothing edited (review/59)", () => {
    const [, stamity] = codex.members;
    expect(stamity).toMatchObject({ pointer: "/stamity", foreign: "yield" });
    expect(stamity?.known).toBe(isKnownCodexHooksStamity);
    expect(RELEASE_STAMITY.releases).toEqual(["v1.0.0", "v1.0.1", "v1.1.0", "v1.2.0", "v1.3.0", "v1.4.0", "v1.5.0", "v1.6.0"]);
    expect(isKnownCodexHooksStamity(RELEASE_STAMITY.stamity)).toBe(true);
    expect(isKnownCodexHooksStamity(JSON.parse(RELEASE_ONE_SIX[".codex/hooks.json"] as string).stamity)).toBe(true);
    expect(isKnownCodexHooksStamity({ ...RELEASE_STAMITY.stamity, blockingExitCode: 1 })).toBe(false);
    expect(isKnownCodexHooksStamity({ team: true })).toBe(false);
  });
});

// ── The release-history bound at the core ──────────────────────

describe("the release-history bound through the core", () => {
  const emitted = `${JSON.stringify({ description: "Now.", hooks: {} }, null, 2)}\n`;
  const oldText = RELEASE_DESCRIPTIONS["1.10.0"] as string;
  const owned = { owned: true, legacy: false, record: { members: { "/description": "f".repeat(64) } } };

  it("moves a description an earlier release wrote to the rendering silently, whatever the record says", () => {
    const plan = planCoOwnedJson("/r/.codex/hooks.json", emitted, `${JSON.stringify({ description: oldText, hooks: {} }, null, 2)}\n`, codex, owned);
    expect(plan.result.action).toBe("updated");
    expect(plan.backup).toBeNull();
    expect(plan.result.warning).toBeUndefined();
    expect(JSON.parse(plan.content as string)).toEqual({ description: "Now.", hooks: {} });
  });

  it("removes a known description the rendering no longer carries without a backup, and keeps a known structural version", () => {
    const none = `${JSON.stringify({ hooks: {} }, null, 2)}\n`;
    const plan = planCoOwnedJson("/r/.codex/hooks.json", none, `${JSON.stringify({ description: oldText, hooks: {} }, null, 2)}\n`, codex, owned);
    expect(plan.backup).toBeNull();
    expect(JSON.parse(plan.content as string)).toEqual({ hooks: {} });
    const versionless = planCoOwnedJson(
      "/r/.cursor/hooks.json",
      `${JSON.stringify({ hooks: {} }, null, 2)}\n`,
      `${JSON.stringify({ version: 1, hooks: { stop: [{ command: "node scripts/x.mjs" }] } }, null, 2)}\n`,
      cursor,
      { owned: true, legacy: false, record: { members: { "/version": "0".repeat(64) } } },
    );
    expect(versionless.result.action).toBe("unchanged");
    expect(versionless.record?.members?.["/version"]).toBeDefined();
  });

  it("lets the sweep remove a known member with no backup, though the record names another value", () => {
    const reduced = reduceCoOwnedJson(`${JSON.stringify({ description: oldText, hooks: { Stop: [] } }, null, 2)}\n`, codex, {
      record: owned.record,
      legacy: false,
      deleteWhenEngineOnly: false,
    });
    expect(reduced).toMatchObject({ kind: "reduced", proven: true });
    expect(reduced).not.toHaveProperty("mustBackUp");
  });
});

describe("the 1.0.0–1.6.0 stamity member through the core (review/59)", () => {
  const oneSixDoc = JSON.parse(RELEASE_ONE_SIX[".codex/hooks.json"] as string) as { hooks: Record<string, unknown[]>; stamity: unknown };
  // 1.6.0's file without its user hook: the engine's argv groups and the member.
  const engineOnly = {
    ...oneSixDoc,
    hooks: { ...oneSixDoc.hooks, PreToolUse: (oneSixDoc.hooks["PreToolUse"] ?? []).filter((wired) => !JSON.stringify(wired).includes(".stamity/hooks/")) },
  };
  const emitted = `${JSON.stringify({ description: "Now.", hooks: {} }, null, 2)}\n`;
  const legacy = { owned: true, legacy: true, record: null };

  it("leaves silently on a write, whatever the ledger says; an owner's own stamity member is kept", () => {
    for (const ownership of [legacy, { owned: true, legacy: false, record: {} }, { owned: false, legacy: false, record: null }]) {
      const plan = planCoOwnedJson("/r/.codex/hooks.json", emitted, `${JSON.stringify({ hooks: {}, stamity: oneSixDoc.stamity }, null, 2)}\n`, codex, ownership);
      expect(plan.backup).toBeNull();
      expect(JSON.parse(plan.content as string)).not.toHaveProperty("stamity");
    }
    const owners = `${JSON.stringify({ stamity: { team: true }, hooks: {} }, null, 2)}\n`;
    const kept = planCoOwnedJson("/r/.codex/hooks.json", emitted, owners, codex, { owned: true, legacy: false, record: {} });
    expect(JSON.parse(kept.content as string)).toMatchObject({ stamity: { team: true } });
  });

  it("lets the sweep remove it from a legacy file, which then holds nothing foreign", () => {
    const reduced = reduceCoOwnedJson(`${JSON.stringify(engineOnly, null, 2)}\n`, codex, {
      record: null,
      legacy: true,
      deleteWhenEngineOnly: true,
    });
    expect(reduced).toMatchObject({ kind: "engine-only" });
    expect(reduced).not.toHaveProperty("mustBackUp");
  });
});

describe("directHookRendering — what releases up to 1.6.0 wired directly (build/54, review/60)", () => {
  const user = { event: "pre_tool_use", matcher: "Bash", command: ["node", ".stamity/hooks/guard.mjs"], timeoutMs: 5000 };

  it("renders a definition exactly as 1.6.0's golden snapshot holds it, on both clients", () => {
    const cursorEntry = (JSON.parse(RELEASE_ONE_SIX[".cursor/hooks.json"] as string).hooks.preToolUse as unknown[])[1];
    const codexGroup = (JSON.parse(RELEASE_ONE_SIX[".codex/hooks.json"] as string).hooks.PreToolUse as unknown[])[1];
    expect(directHookRendering("cursor", [user])).toEqual({ hooks: { preToolUse: [cursorEntry] } });
    expect(directHookRendering("codex", [user])).toEqual({ hooks: { PreToolUse: [codexGroup] } });
  });

  it("groups Codex rows by matcher, rounds a timeout up, quotes as 1.6.0 quoted, keeps a pack's row, and skips the generated rows and a later event", () => {
    const rows = [
      { event: "stop", command: ["node", "scripts/a b.mjs", "it's"] },
      { event: "stop", command: ["node", "scripts/c.mjs"], timeoutMs: 1 },
      { event: "stop", matcher: "x", command: ["node", "scripts/d.mjs"] },
      { event: "session_start", command: ["node", `${HOOKS_GENERATED_DIR}/codex/stamity-session-start.mjs`] },
      { event: "session_start", command: ["node", ".stamity/packs/p/hook.mjs"] },
      { event: "subagent_start", command: ["node", "scripts/e.mjs"] },
      { event: "stop", command: [] },
    ];
    expect(directHookRendering("cursor", rows)).toEqual({
      hooks: {
        stop: [
          { command: `node 'scripts/a b.mjs' 'it'\\''s'` },
          { command: "node scripts/c.mjs" },
          { command: "node scripts/d.mjs", matcher: "x" },
          { command: "" },
        ],
        sessionStart: [{ command: "node .stamity/packs/p/hook.mjs" }],
      },
    });
    expect(directHookRendering("codex", rows)).toEqual({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: ["node", ".stamity/packs/p/hook.mjs"] }] }],
        Stop: [
          {
            hooks: [
              { type: "command", command: ["node", "scripts/a b.mjs", "it's"] },
              { type: "command", command: ["node", "scripts/c.mjs"], timeout: 1 },
              { type: "command", command: [] },
            ],
          },
          { matcher: "x", hooks: [{ type: "command", command: ["node", "scripts/d.mjs"] }] },
        ],
      },
    });
  });

  it("is each spec's earlier rendering: the rows the runner's entries encode, re-rendered, and nothing else", () => {
    const cursorRendering = JSON.parse(buildHooksJson([user as HookInterchange, row("session_start", `${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs`)]));
    expect(cursor.earlier?.(cursorRendering)).toEqual(directHookRendering("cursor", [user]));
    const startedUser = portableHookCommand("codex", user as HookInterchange, { syncCall: "stamity sync" });
    const codexRendering = { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: startedUser, commandWindows: startedUser }] }] } };
    expect(codex.earlier?.(codexRendering)).toEqual(directHookRendering("codex", [user]));
    // Nothing a runner's command does not carry: no hooks object, a value that
    // is not an array or an object, a command that is not the runner's, a row
    // that does not decode, is not an object, or names no string argv.
    const runner = `node ${HOOKS_GENERATED_DIR}/cursor/stamity-portable-hook.mjs `;
    const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
    for (const rendering of [
      {},
      { hooks: [] },
      { hooks: { stop: "x", sessionStart: ["bare", { command: "node scripts/x.mjs" }, { hooks: ["bare", { command: 3 }] }] } },
      { hooks: { stop: [{ command: `${runner}!!` }, { command: `${runner}${b64([1])}` }, { command: `${runner}${b64({ event: "stop", command: [1] })}` }] } },
      { hooks: { stop: [{ command: `${runner}${b64({ event: 1, command: [] })}` }, { command: `${runner}${b64({ event: "stop" })}` }] } },
    ]) {
      expect(cursor.earlier?.(rendering)).toEqual({ hooks: {} });
    }
    const odd = { event: "stop", matcher: 3, timeoutMs: "5", command: ["node", "scripts/x.mjs"] };
    expect(cursor.earlier?.({ hooks: { stop: [{ command: `${runner}${b64(odd)}` }] } })).toEqual({ hooks: { stop: [{ command: "node scripts/x.mjs" }] } });
  });

  it("re-renders a Codex group 1.6.0 shared between a user row and a pack row, user row first, from the runner's rendering (review/69)", () => {
    const pack = { event: "pre_tool_use", matcher: "Bash", command: ["node", PACK_SCRIPT] };
    const started = (value: unknown): { type: string; command: string; commandWindows: string } => {
      const command = portableHookCommand("codex", value as HookInterchange, { syncCall: "stamity sync" });
      return { type: "command", command, commandWindows: command };
    };
    const rendering = { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [started(user), started(pack)] }] } };
    const oneSix = JSON.parse(RELEASE_ONE_SIX[".codex/hooks.json"] as string).hooks.PreToolUse[1] as { hooks: unknown[] };
    const shared = { ...oneSix, hooks: [...oneSix.hooks, { type: "command", command: ["node", PACK_SCRIPT] }] };
    expect(codex.earlier?.(rendering)).toEqual({ hooks: { PreToolUse: [shared] } });

    // Through the planner under a legacy row: the shared group is the engine's and leaves.
    const existing = `${JSON.stringify({ hooks: { PreToolUse: [shared] } }, null, 2)}\n`;
    const plan = planCoOwnedJson("/r/.codex/hooks.json", `${JSON.stringify(rendering, null, 2)}\n`, existing, codex, { owned: true, legacy: true, record: null });
    expect(JSON.parse(plan.content as string).hooks.PreToolUse).toEqual(rendering.hooks.PreToolUse);
  });

  it("a forged record over an owner's entry that only looks like a pack's proves nothing beyond the bound (review/69)", () => {
    const emitted = `${JSON.stringify({ version: 1, hooks: {} }, null, 2)}\n`;
    for (const command of OUTSIDE_PACK_BOUND) {
      const owner = { command };
      const existing = `${JSON.stringify({ version: 1, hooks: { stop: [owner] } }, null, 2)}\n`;
      // Recorded: the record makes it the engine's to touch, but it leaves only behind a backup, named.
      const recorded = { owned: true, legacy: false, record: { elements: { "/hooks/stop": [memberHash(owner)] } } };
      const plan = planCoOwnedJson("/r/.cursor/hooks.json", emitted, existing, cursor, recorded);
      expect(plan.backup).toBe(existing);
      expect(plan.result.warning).toContain("hooks.stop[0]");
      // A legacy row proves nothing outside the bound: the entry stays.
      const kept = planCoOwnedJson("/r/.cursor/hooks.json", emitted, existing, cursor, { owned: true, legacy: true, record: null });
      expect(kept.backup).toBeNull();
      expect(JSON.parse(kept.content ?? existing).hooks.stop).toEqual([owner]);
    }
  });

  it("proves a 1.6.0 direct entry the engine's under a legacy row, through the planner and the reducer; an owner's differing entry stays", () => {
    const emitted = buildHooksJson([user as HookInterchange]);
    const lookalike = { command: "node .stamity/hooks/guard.mjs", matcher: "Edit", failClosed: true };
    const direct = { command: "node .stamity/hooks/guard.mjs", matcher: "Bash", failClosed: true };
    const existing = `${JSON.stringify({ version: 1, hooks: { preToolUse: [direct, lookalike] } }, null, 2)}\n`;
    const legacy = { owned: true, legacy: true, record: null };

    const plan = planCoOwnedJson("/r/.cursor/hooks.json", emitted, existing, cursor, legacy);
    const written = JSON.parse(plan.content as string) as { hooks: { preToolUse: unknown[] } };
    expect(written.hooks.preToolUse).toContainEqual(lookalike);
    expect(written.hooks.preToolUse).not.toContainEqual(direct);
    // Without the ledger's proof the file is unedited, the old entry leaves only behind a backup, as rule 3 says.
    expect(plan.backup).toBe(existing);

    const reduced = reduceCoOwnedJson(existing, cursor, { record: null, legacy: true, deleteWhenEngineOnly: true, rendered: directHookRendering("cursor", [user]) });
    expect(reduced).toMatchObject({ kind: "reduced" });
    expect(JSON.parse((reduced as { content: string }).content)).toEqual({ version: 1, hooks: { preToolUse: [lookalike] } });
    expect(memberHash(direct)).not.toBe(memberHash(lookalike));
  });
});

// ── S17 ────────────────────────────────────────────────────────

describe("referencedHookScripts", () => {
  it("over each client's rendering: the runner, each core script inside the encoded rows and, on Cursor, both guards", () => {
    const core = [row("session_start", `${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs`), row("pre_tool_use", ".stamity/hooks/guard.mjs")];
    const cursorText = buildHooksJson(core);
    expect([...referencedHookScripts(cursorText)].toSorted()).toEqual(
      [
        `${HOOKS_GENERATED_DIR}/cursor/stamity-portable-hook.mjs`,
        `${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs`,
        ".stamity/hooks/guard.mjs",
        MCP_GUARD_PATH,
        SUBAGENT_GUARD_PATH,
      ].toSorted(),
    );
    const codexText = `${JSON.stringify({ hooks: { SessionStart: [group(starterHook(starter("stamity sync")))] } }, null, 2)}\n`;
    expect([...referencedHookScripts(codexText)].toSorted()).toEqual(
      [`${HOOKS_GENERATED_DIR}/codex/stamity-portable-hook.mjs`, `${HOOKS_GENERATED_DIR}/codex/stamity-session-start.mjs`].toSorted(),
    );
  });

  it("finds none of the engine's in a document holding only owner entries", () => {
    const owner = `${JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: "node scripts/fmt.mjs" }] } }, null, 2)}\n`;
    expect([...referencedHookScripts(owner)]).toEqual([]);
  });

  it("reads a JSON-escaped path in a document that parses, and the raw text of one that does not", () => {
    expect([...referencedHookScripts('{"a":"node .stamity\\/generated\\/hooks\\/cursor\\/x.mjs"}')]).toEqual([`${HOOKS_GENERATED_DIR}/cursor/x.mjs`]);
    expect([...referencedHookScripts("{ node .cursor/hooks/mcp-guard.mjs")]).toEqual([".cursor/hooks/mcp-guard.mjs"]);
  });

  it("takes from an encoded row only the relative paths of a command argv", () => {
    const tokens = [
      encoded({ command: ["node", "./.stamity/packs/acme__ops/hook.ts", "/abs/x.mjs", "plain", 3] }),
      encoded({ command: "node x/y.mjs" }),
      encoded(["node", "x/y.mjs"]),
      encoded("a string long enough"),
    ];
    expect([...referencedHookScripts(`run ${tokens.join(" ")}`)]).toEqual([".stamity/packs/acme__ops/hook.ts"]);
  });

  // review/92: a kept document may spell a script with Windows separators. Read only as
  // forward slashes, the sweep took such a script for unwired and deleted it from under the
  // command that still runs it. Runs of either separator read as one `/`, so retention errs
  // toward keeping.
  it("reads backslash and mixed separators as the ledger's forward slashes, in plain commands and encoded rows", () => {
    const back = (path: string): string => path.replaceAll("/", String.fromCharCode(92));
    const runner = `${HOOKS_GENERATED_DIR}/cursor/stamity-portable-hook.mjs`;
    const core = `${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs`;
    const token = encoded({ event: "sessionStart", command: ["node", `.${String.fromCharCode(92)}${back(core)}`] });
    const doc = JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: `node ${back(runner)} ${token}` }] } });
    expect([...referencedHookScripts(doc)].toSorted()).toEqual([core, runner].toSorted());
    const mixed = JSON.stringify({ hooks: { x: [{ command: `node .stamity${String.fromCharCode(92, 92)}/hooks//guard.mjs` }] } });
    expect([...referencedHookScripts(mixed)]).toEqual([".stamity/hooks/guard.mjs"]);
    // A document that does not parse is read as text, its JSON-escaped backslashes included.
    expect([...referencedHookScripts(`{ ${JSON.stringify(back(runner))}`)]).toEqual([runner]);
    // An absolute argv word stays outside, however it is spelled.
    expect([...referencedHookScripts(`run ${encoded({ command: ["node", back("/abs/x.mjs")] })}`)]).toEqual([]);
    const reader = hookScriptReader(GUARDS);
    expect(reader.runs(doc, runner)).toBe(true);
    expect(reader.runs(doc, core)).toBe(true);
    // A path no pattern reads (a pack's TypeScript hook) counts through the text, separators read the same way.
    const pack = JSON.stringify({ hooks: { x: [{ command: `node ${back(".stamity/packs/acme__ops/hook.ts")}` }] } });
    expect(reader.runs(pack, ".stamity/packs/acme__ops/hook.ts")).toBe(true);
    expect(reader.runs(pack, ".stamity/packs/acme__ops/other.ts")).toBe(false);
  });
});

describe("hookScriptReader", () => {
  const reader = hookScriptReader(GUARDS);

  it("counts the generated hooks folder, an installed pack's folder and the guards as hook scripts, and nothing else", () => {
    expect(reader.isHookScript(`${HOOKS_GENERATED_DIR}/codex/a.mjs`)).toBe(true);
    expect(reader.isHookScript(".stamity/packs/acme__ops/hook.mjs")).toBe(true);
    expect(reader.isHookScript(MCP_GUARD_PATH)).toBe(true);
    expect(reader.isHookScript(".stamity/hooks/mine.mjs")).toBe(false);
    expect(reader.isHookScript(".cursor/hooks/mine.mjs")).toBe(false);
  });

  it("says a text runs a script it names, encoded or plain, reading each text once", () => {
    const script = `${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs`;
    const text = buildHooksJson([row("session_start", script)]);
    expect(reader.runs(text, script)).toBe(true);
    expect(reader.runs(text, MCP_GUARD_PATH)).toBe(true);
    expect(reader.runs(text, `${HOOKS_GENERATED_DIR}/cursor/other.mjs`)).toBe(false);
    // A path no pattern reads, named in the text, still counts.
    expect(reader.runs('{"x":"bin/tool.rb"}', "bin/tool.rb")).toBe(true);
  });

  it("parses each of two kept documents once while the sweep alternates between them (review/80)", () => {
    const fresh = hookScriptReader(GUARDS);
    const script = `${HOOKS_GENERATED_DIR}/cursor/stamity-session-start.mjs`;
    const cursorDoc = buildHooksJson([row("session_start", script)]);
    const other = '{"hooks":{"x":[{"command":"node .stamity/hooks/mine.mjs"}]}}';
    const parse = vi.spyOn(JSON, "parse");
    try {
      for (const path of [script, MCP_GUARD_PATH, ".stamity/hooks/mine.mjs"]) {
        fresh.runs(cursorDoc, path);
        fresh.runs(other, path);
      }
      const documents = parse.mock.calls.filter(([text]) => text === cursorDoc || text === other).map(([text]) => text);
      expect(documents).toEqual([cursorDoc, other]);
    } finally {
      parse.mockRestore();
    }
  });
});
