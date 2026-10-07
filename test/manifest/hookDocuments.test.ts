import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
  hookScriptReader,
  isKnownCodexHooksDescription,
  referencedHookScripts,
} from "../../src/manifest/hookDocuments.ts";
import { HOOKS_GENERATED_DIR } from "../../src/types/markers.ts";

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

const row = (event: HookInterchange["event"], script: string): HookInterchange => ({ event, command: ["node", script] });
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
});
