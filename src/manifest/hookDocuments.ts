/**
 * `.cursor/hooks.json` and `.codex/hooks.json` — Cursor's and Codex's hook
 * files, owned ENTRY BY ENTRY on the per-entry core (REQ-FLOW-037; S10–S14,
 * S17, S19). This module only parameterises the core (`./coOwnedJson.ts`): it
 * says which elements and members the engine writes there, how it recognises
 * its own entries, and what it can prove it wrote. It also reads, for the
 * reclaim sweep, which scripts a hooks document runs (S17), and which entries
 * of a Cursor file Cursor rejects (S19).
 *
 * WHAT THE ENGINE OWNS. Each element of a `hooks.<event>` array it wrote,
 * recorded by the hash of its canonical JSON (`LedgerEntry.coOwned`), and
 * recognised whatever the record says by the script it runs: one under
 * `.stamity/generated/hooks/<client>/`, or one of Cursor's guards. Cursor's
 * `version` while anything of the engine's remains (a `collide` member: an
 * owner's other value is a collision naming it, S12); Codex's `description`
 * unless the owner wrote one (a `yield` member). Every other entry and member
 * is the owner's, and survives `sync` and `clean`.
 *
 * THE BOUND (S11, narrowed in the safe direction as the settings lane is): an
 * engine entry leaves without a backup only when the script it EXECUTES is the
 * engine's — on Cursor the program's first argument under
 * `.stamity/generated/hooks/cursor/`, a guard path, or an installed pack's
 * `.stamity/packs/<id>/` (`./coOwnedJson.ts::executedScript`); on Codex every
 * inner command is the engine's `node -e` starter, which runs only the runner
 * beside the trusted `.codex/hooks.json`, or (≤1.6.0) an argv naming a script
 * under `.stamity/generated/hooks/codex/` or executing one under an installed
 * pack's folder (`./coOwnedJson.ts::argvExecutedScript`). The pack folder is
 * the settings lane's bound too (`./coOwnedJson.ts::commandRunsStateScript`):
 * 1.0.0–1.6.0 wired a pack's hooks directly beside the user's (review/69).
 *
 * THE RELEASE-HISTORY BOUND (`MemberSpec.known`). The core proves a member by
 * the engine's CURRENT rendering, so a release that changed a member's value
 * would make every older file collide (`collide`) or take a backup (`yield`).
 * Each member therefore declares every value a release rendered there, read
 * from the release tags' adapters and golden snapshots on 2026-10-07: Cursor's
 * `version` was `1` in every release from 1.0.0 to 1.11.0; Codex's
 * `description` first appeared in 1.7.0 and took five texts through 1.11.0,
 * the last carrying the pinned check call, which is normalised away so a fork
 * and every later version compare alike. A known engine value moves to the
 * current rendering silently; anything else collides or is kept.
 *
 * Pure: no filesystem access. Wave 6 — it cannot import the adapters, so the
 * Cursor event list and the guard paths come in as data.
 */

import { createHash } from "node:crypto";
import { isPlainObject } from "../config/parse.ts";
import { HOOKS_GENERATED_DIR, STATE_DIR } from "../types/markers.ts";
import { argvExecutedScript, executedScript, isPackScriptPath, printableName, type CoOwnedJsonSpec } from "./coOwnedJson.ts";
import { memberHash } from "./jsonMembers.ts";

// ── S19: the events Cursor accepts ───────────────────────────────────────

/**
 * The event keys Cursor's `hooks.json` validator accepts: the 21 names
 * cursor.com/docs/hooks lists (read 2026-10-07, Cursor 3.23.23), the same
 * 21 microsoft/apm#3129 quotes from Cursor 3.13.10's
 * `parseAndValidateHooksConfig`. An event Cursor adds later fails `check`
 * until this list is re-read; the message names the date.
 */
export const CURSOR_HOOK_EVENTS: readonly string[] = Object.freeze([
  "beforeShellExecution",
  "beforeMCPExecution",
  "afterShellExecution",
  "afterMCPExecution",
  "beforeReadFile",
  "afterFileEdit",
  "beforeTabFileRead",
  "afterTabFileEdit",
  "stop",
  "beforeSubmitPrompt",
  "afterAgentResponse",
  "afterAgentThought",
  "sessionStart",
  "sessionEnd",
  "preCompact",
  "subagentStart",
  "subagentStop",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "workspaceOpen",
]);

/** The day {@link CURSOR_HOOK_EVENTS} was read from the vendor. */
const CURSOR_HOOK_EVENTS_READ = "2026-10-07";

/** One entry of a Cursor hooks document that Cursor rejects. */
export interface CursorHookDefect {
  /** RFC 6901 pointer: `/hooks/<event>` for an unknown event, `/hooks/<event>/<index>` for an entry. */
  pointer: string;
  /**
   * `unknown-event`: a key Cursor does not accept; `no-command`: a command
   * entry (`type` absent or `"command"`), or an event value, that runs no
   * command; `no-prompt`: a `"prompt"` entry with no prompt; `unknown-type`: an
   * entry whose `type` is neither of those.
   */
  reason: "unknown-event" | "no-command" | "no-prompt" | "unknown-type";
}

/** True for a string holding something other than white space. */
function filled(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * What is wrong with one entry of a known event, by its `type` (S19, amended
 * 2026-10-07 after the vendor re-read): Cursor runs a command hook (`type`
 * absent or `"command"`, which needs a `command`) and a prompt hook (`"prompt"`,
 * which needs a `prompt` and has no `command`); any other `type` it refuses.
 */
function entryDefect(entry: unknown): CursorHookDefect["reason"] | null {
  if (!isPlainObject(entry)) return "no-command";
  const type = entry["type"];
  if (type === undefined || type === "command") return filled(entry["command"]) ? null : "no-command";
  if (type === "prompt") return filled(entry["prompt"]) ? null : "no-prompt";
  return "unknown-type";
}

/** One RFC 6901 reference token. */
function token(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Every entry of a parsed `.cursor/hooks.json` Cursor rejects, whoever wrote
 * it (S19): an event key outside {@link CURSOR_HOOK_EVENTS}; a command entry
 * with no command (an event whose value is not an array has no entry that
 * runs one); a prompt entry with no prompt; and an entry of any other `type`.
 * A document that is not an object, or whose `hooks` is not one, yields none
 * here: the core refuses those as a `co-owned-shape` collision.
 */
export function cursorHookDefects(doc: unknown): CursorHookDefect[] {
  if (!isPlainObject(doc) || !isPlainObject(doc["hooks"])) return [];
  const defects: CursorHookDefect[] = [];
  for (const [event, entries] of Object.entries(doc["hooks"])) {
    const pointer = `/hooks/${token(event)}`;
    if (!CURSOR_HOOK_EVENTS.includes(event)) {
      defects.push({ pointer, reason: "unknown-event" });
      continue;
    }
    if (!Array.isArray(entries)) {
      defects.push({ pointer, reason: "no-command" });
      continue;
    }
    entries.forEach((entry, index) => {
      const reason = entryDefect(entry);
      if (reason !== null) defects.push({ pointer: `${pointer}/${index}`, reason });
    });
  }
  return defects;
}

/**
 * The sentence `check` fails with and `sync`/`init` warn with when the Cursor
 * hooks document `raw` holds an entry Cursor rejects; `null` when it holds
 * none, or does not parse (the core's collision covers that). `shown` is the
 * path as messages print it.
 */
export function describeCursorHookDefects(shown: string, raw: string | null): string | null {
  if (raw === null) return null;
  let doc: unknown;
  try {
    doc = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    // reason: not silent — an unparseable document is the core's `co-owned-shape` collision, reported there.
  } catch {
    return null;
  }
  const defects = cursorHookDefects(doc);
  if (defects.length === 0) return null;
  const named = (reason: CursorHookDefect["reason"]): string[] =>
    defects.filter((defect) => defect.reason === reason).map((defect) => printableName(defect.pointer));
  const unknown = named("unknown-event");
  const commandless = named("no-command");
  const promptless = named("no-prompt");
  const untyped = named("unknown-type");
  const found = [
    ...(unknown.length === 0
      ? []
      : [
          `${unknown.join(", ")} ${unknown.length === 1 ? "is not an event" : "are not events"} Cursor accepts (the ` +
            `${CURSOR_HOOK_EVENTS.length} events cursor.com/docs/hooks listed on ${CURSOR_HOOK_EVENTS_READ})`,
        ]),
    ...(commandless.length === 0 ? [] : [`${commandless.join(", ")} ${commandless.length === 1 ? "runs" : "run"} no command`]),
    ...(promptless.length === 0 ? [] : [`${promptless.join(", ")} ${promptless.length === 1 ? "is a prompt hook" : "are prompt hooks"} with no prompt`]),
    ...(untyped.length === 0
      ? []
      : [`${untyped.join(", ")} ${untyped.length === 1 ? "has a type" : "have a type"} Cursor does not run (it runs "command" and "prompt")`]),
  ];
  const remedies = [
    ...(unknown.length === 0
      ? []
      : [
          `remove that key or rename it to the Cursor event it means — a Claude-shaped key such as PreToolUse that an ` +
            `APM package wrote goes away when that package is installed without the cursor target; if Cursor has added ` +
            `the event since ${CURSOR_HOOK_EVENTS_READ}, this engine's list is out of date`,
        ]),
    ...(commandless.length === 0 ? [] : ["give each such entry a command, or remove it"]),
    ...(promptless.length === 0 ? [] : ["give each such prompt hook a prompt, or remove it"]),
    ...(untyped.length === 0 ? [] : ['set each such type to "command" or "prompt", or remove the entry']),
  ];
  return (
    `Cursor rejects ${shown} as it stands: ${found.join("; ")}. While it holds such an entry Cursor loads none of ` +
    `the file's hooks (shown for Cursor 3.13.10 by microsoft/apm#3129), the engine's failClosed guards included. ` +
    `The entry is not the engine's, so it was kept: ${remedies.join("; ")}.`
  );
}

// ── Cursor's document ────────────────────────────────────────────────────

/** Every `version` a release wrote into `.cursor/hooks.json` (1.0.0–1.11.0: always `1`). */
const CURSOR_HOOKS_VERSIONS: ReadonlySet<unknown> = new Set([1]);

/** Cursor's generated hook scripts: the portable runner and, before 1.7.0, each core script. */
const CURSOR_SCRIPTS = `${HOOKS_GENERATED_DIR}/cursor/`;

/** The `command` of a Cursor entry, or `null` when it is not an entry with one. */
function cursorCommand(element: unknown): string | null {
  return isPlainObject(element) && typeof element["command"] === "string" ? element["command"] : null;
}

/** What `.cursor/hooks.json`'s spec needs to know about the adapter's guards. */
export interface CursorHooksSpecOptions {
  /** The guards' repo-relative paths, current names and any earlier ones. */
  guardPaths: readonly string[];
}

/**
 * What the engine writes into `.cursor/hooks.json`: each entry of a
 * `hooks.<event>` array, and `version`. An entry is recognised when its
 * command names the engine's Cursor scripts or a guard; it is in the bound
 * when the script it executes is one of them, or lies in an installed pack's
 * folder.
 */
export function cursorHooksSpec(opts: CursorHooksSpecOptions): CoOwnedJsonSpec {
  const guards = new Set(opts.guardPaths);
  return {
    noun: "Cursor hooks document",
    elements: [
      {
        pointer: "/hooks/*",
        recognise: (element) => {
          const command = cursorCommand(element);
          return command !== null && (command.includes(CURSOR_SCRIPTS) || [...guards].some((guard) => command.includes(guard)));
        },
        inBound: (element) => {
          const command = cursorCommand(element);
          const script = command === null ? null : executedScript(command);
          // `executedScript` refuses an empty segment, so a path under the folder names a file in it.
          return script !== null && (script.startsWith(CURSOR_SCRIPTS) || guards.has(script) || isPackScriptPath(script));
        },
        outsideBound: "backup",
      },
    ],
    members: [{ pointer: "/version", foreign: "collide", structural: true, known: (value) => CURSOR_HOOKS_VERSIONS.has(value) }],
    personalHint: "Personal hooks belong in ~/.cursor/hooks.json, which this engine never writes.",
    earlier: (rendering) => directHookRendering("cursor", runnerRows(rendering)),
  };
}

// ── Codex's document ─────────────────────────────────────────────────────

/** Codex's generated hook scripts: the portable runner and, before 1.7.0, each core script. */
const CODEX_SCRIPTS = `${HOOKS_GENERATED_DIR}/codex/`;

/** The `node -e` program body every Codex starter shares up to where the releases differ. */
const STARTER_REQUIRES = `const fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process');let d=process.cwd();for(;;){`;
const STARTER_RUN = `const r=cp.spawnSync(process.execPath,[f,...process.argv.slice(1)],{stdio:'inherit'});process.exitCode=r.status??1;break;}`;
const STARTER_WALK = `const up=p.dirname(d);if(up===d){process.stderr.write('Stamity hook project root not found');process.exitCode=1;break;}d=up;}`;
const RUNNER_JOIN = `const f=p.join(d,'${CODEX_SCRIPTS}stamity-portable-hook.mjs');`;

/** 1.7.0–1.8.0: walk up to the first folder holding the runner. */
const STARTER_WALK_TO_RUNNER = `${STARTER_REQUIRES}${RUNNER_JOIN}if(fs.existsSync(f)){${STARTER_RUN}${STARTER_WALK}`;

/**
 * 1.9.0 on: walk up to the folder holding `.codex/hooks.json` and run the
 * runner beside it, or say which sync call restores it — `stamity sync`
 * through 1.10.0, the pinned call from 1.11.0. Split where that call stands.
 */
const STARTER_BESIDE_TRUST_HEAD =
  `${STARTER_REQUIRES}if(fs.existsSync(p.join(d,'.codex','hooks.json'))){${RUNNER_JOIN}` +
  `if(!fs.existsSync(f)){process.stderr.write('Stamity hook script missing beside .codex/hooks.json; run `;
const STARTER_BESIDE_TRUST_TAIL = `');process.exitCode=1;break;}${STARTER_RUN}${STARTER_WALK}`;

/** The characters a sync call in the starter may carry (`../hooks/portableRunner.ts`'s, `:` and `=` for a registry fork). */
const STARTER_CALL = /^[A-Za-z0-9@/._~+ :=-]+$/;

/** The base64url row every starter command ends with. */
const ENCODED_ROW = /^[A-Za-z0-9_-]+$/;

/** True for a Codex command string that is one of the engine's starters followed by its encoded row. */
function isEngineStarter(command: string): boolean {
  const open = 'node -e "';
  const close = command.lastIndexOf('" ');
  if (!command.startsWith(open) || close === -1 || !ENCODED_ROW.test(command.slice(close + 2))) return false;
  const body = command.slice(open.length, close);
  if (body === STARTER_WALK_TO_RUNNER) return true;
  if (!body.startsWith(STARTER_BESIDE_TRUST_HEAD) || !body.endsWith(STARTER_BESIDE_TRUST_TAIL)) return false;
  return STARTER_CALL.test(body.slice(STARTER_BESIDE_TRUST_HEAD.length, body.length - STARTER_BESIDE_TRUST_TAIL.length));
}

/**
 * True for one inner Codex hook that runs the engine's own script: a starter
 * (1.7.0 on; `commandWindows` too, when present), or (≤1.6.0, which wrote no
 * `commandWindows`) an argv whose program runs a script under the generated
 * Codex folder, or that executes one under an installed pack's folder.
 */
function codexHookInBound(hook: unknown): boolean {
  if (!isPlainObject(hook)) return false;
  const { command, commandWindows } = hook;
  if (Array.isArray(command)) {
    if (commandWindows !== undefined) return false;
    const [program, script] = command;
    // Every segment named, as `./coOwnedJson.ts::executedScript` reads a
    // Cursor command: a `..` would leave the folder the prefix names.
    if (
      program === "node" &&
      typeof script === "string" &&
      script.startsWith(CODEX_SCRIPTS) &&
      script.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
    ) {
      return true;
    }
    const executed = argvExecutedScript(command);
    return executed !== null && isPackScriptPath(executed);
  }
  if (typeof command !== "string" || !isEngineStarter(command)) return false;
  return commandWindows === undefined || (typeof commandWindows === "string" && isEngineStarter(commandWindows));
}

/** True for one inner Codex hook whose command (either spelling) names the generated Codex folder. */
function codexHookNamesEngineScript(hook: unknown): boolean {
  if (!isPlainObject(hook)) return false;
  return [hook["command"], hook["commandWindows"]].some(
    (command) =>
      (typeof command === "string" && command.includes(CODEX_SCRIPTS)) ||
      (Array.isArray(command) && command.some((word) => typeof word === "string" && word.includes(CODEX_SCRIPTS))),
  );
}

/** The inner hooks of a Codex group `{ matcher?, hooks: [...] }`, or `null` when it is not one. */
function innerHooks(element: unknown): unknown[] | null {
  return isPlainObject(element) && Array.isArray(element["hooks"]) ? element["hooks"] : null;
}

/** Where the check hint stands in a description from 1.11.0 on; normalised so any version, package or registry compares alike. */
const CHECK_HINT = /so the check verb \([^()]*\) is the control/u;

/**
 * The sha256 of each `description` a release wrote into `.codex/hooks.json`,
 * its check hint normalised ({@link CHECK_HINT}): 1.7.0, 1.8.0, 1.9.0–1.9.1,
 * 1.10.0 and 1.11.0 (also the head's), read from each tag's golden snapshot on
 * 2026-10-07. The texts are `test/fixtures/codex-hooks-descriptions.json`.
 */
const CODEX_DESCRIPTION_HASHES: ReadonlySet<string> = new Set([
  "801c3b931de85348732c862591d49f3ddae223ab2fb3b6729ff6c35cef6ec03e",
  "ccb7d390556b3ccd25283c0adf6cbb382cc1f84a00a9e4065042a18e75459f0a",
  "a70cd05a08841898280cedad09b26dfe856a20efdfe988db84e0d3577d8dc1a7",
  "d69d81e005184e59cef35128b3a91d520a825d84533635faa66706ce897ed8ff",
  "a7badc68130146c7bf8335c213d98b36f4d3f6a480f645ab6cf74bb31e7f8be0",
]);

/** True for a `description` some release wrote into `.codex/hooks.json`. */
export function isKnownCodexHooksDescription(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalised = value.replace(CHECK_HINT, "so the check verb (<check call>) is the control");
  return CODEX_DESCRIPTION_HASHES.has(createHash("sha256").update(normalised).digest("hex"));
}

/**
 * The top-level `stamity` member 1.0.0–1.6.0 wrote into `.codex/hooks.json`,
 * one value through all eight of those releases (each tag's golden snapshot,
 * read 2026-10-07; `test/manifest/fixtures/codex-hooks-stamity-member.json`).
 * 1.7.0 stopped writing it, so the engine renders it no more.
 */
const CODEX_HOOKS_STAMITY_1_0_TO_1_6 = memberHash({
  blockingExitCode: 2,
  failMode: "fail-closed",
  guarantee: "Adopts the interchange shape verbatim, exit-2 blocking included; emission is a config-dialect transform, not a semantic one.",
  interchange: "claude-shape",
  trust: "Each sha256 covers the generated script bytes this setup emits; verify with `stamity check` after any edit. User-authored hooks are wired verbatim and carry no digest — their commands are the repository's own trust domain.",
});

/** True for the `stamity` member a release up to 1.6.0 wrote into `.codex/hooks.json`. */
export function isKnownCodexHooksStamity(value: unknown): boolean {
  return memberHash(value) === CODEX_HOOKS_STAMITY_1_0_TO_1_6;
}

/**
 * What the engine writes into `.codex/hooks.json`: each group of a
 * `hooks.<Event>` array, `description`, and — written up to 1.6.0, never now —
 * `stamity`. A group is recognised when some inner command names the
 * generated Codex folder; it is in the bound when every inner hook runs the
 * engine's own script or an installed pack's. An old `stamity` is the engine's by its release value
 * and leaves silently; any other `stamity` is the owner's.
 */
export function codexHooksSpec(): CoOwnedJsonSpec {
  return {
    noun: "Codex hooks document",
    elements: [
      {
        pointer: "/hooks/*",
        recognise: (element) => innerHooks(element)?.some(codexHookNamesEngineScript) === true,
        inBound: (element) => {
          const hooks = innerHooks(element);
          return hooks !== null && hooks.length > 0 && hooks.every(codexHookInBound);
        },
        outsideBound: "backup",
      },
    ],
    members: [
      { pointer: "/description", foreign: "yield", known: isKnownCodexHooksDescription },
      { pointer: "/stamity", foreign: "yield", known: isKnownCodexHooksStamity },
    ],
    earlier: (rendering) => directHookRendering("codex", runnerRows(rendering)),
  };
}

// ── Up to 1.6.0: hooks wired directly ────────────────────────────────────

/**
 * One hook row, as `.stamity/hooks/` defines it and as a portable runner's
 * encoded argument carries it: the fields a release up to 1.6.0 rendered an
 * entry from.
 */
export interface DirectHookRow {
  /** The canonical event (`pre_tool_use`). */
  event: string;
  matcher?: string;
  /** Exec-form argv. */
  command: readonly string[];
  timeoutMs?: number;
}

/**
 * Each client's event key per canonical event in 1.0.0–1.6.0, the releases
 * that wired a hook directly (Cursor's `EVENT_RENAME`, Codex's
 * `CLAUDE_EVENT_NAMES`; identical at every one of those tags, read 2026-10-07).
 */
const DIRECT_EVENTS: Readonly<Record<"cursor" | "codex", Readonly<Record<string, string>>>> = Object.freeze({
  cursor: Object.freeze({
    session_start: "sessionStart",
    pre_tool_use: "preToolUse",
    post_tool_use: "postToolUse",
    user_prompt_submit: "beforeSubmitPrompt",
    stop: "stop",
    session_end: "sessionEnd",
  }),
  codex: Object.freeze({
    session_start: "SessionStart",
    pre_tool_use: "PreToolUse",
    post_tool_use: "PostToolUse",
    user_prompt_submit: "UserPromptSubmit",
    stop: "Stop",
    session_end: "SessionEnd",
  }),
});

/** 1.0.0–1.6.0's shell-safe token, as Cursor's `shellCommand` quoted an argv then. */
const DIRECT_SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** An argv as 1.0.0–1.6.0 rendered it into a Cursor `command`. */
function directShellCommand(argv: readonly string[]): string {
  return argv.map((word) => (DIRECT_SHELL_SAFE.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`)).join(" ");
}

/**
 * What a release up to 1.6.0 rendered into `client`'s hooks document for
 * `rows` (the build/54 sign-off, as revised): each row wired directly, not
 * through the portable runner — on Cursor `{ command, matcher?, failClosed? }`,
 * `failClosed` on `preToolUse` (the one blocking event then); on Codex the
 * rows grouped by matcher in their order, each `{ type, command: argv,
 * timeout? }`. A row running a generated script is left out: those releases
 * gave the core's rows a digest this cannot re-render, so a group the core
 * shared with a definition stays recognised and leaves behind a backup. An
 * installed pack's rows stay in (review/69): 1.0.0–1.6.0 wired them beside the
 * user's with no digest, in one lane order — user rows, then pack rows
 * (`v1.6.0:src/emit/hooksInfra.ts`) — which `rows` keeps, as the runner's
 * rendering carries it, so a group they share re-renders as it was written.
 * Equal to an element on disk, an entry here proves it was the engine's direct
 * wiring of a hook it still wires, so replacing it with the runner's entry
 * runs that hook once.
 */
export function directHookRendering(client: "cursor" | "codex", rows: readonly DirectHookRow[]): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {};
  for (const row of rows) {
    const event = DIRECT_EVENTS[client][row.event];
    const script = row.command[1] ?? "";
    if (event === undefined || script.startsWith(`${HOOKS_GENERATED_DIR}/`)) continue;
    const entries = (hooks[event] ??= []);
    if (client === "cursor") {
      entries.push({
        command: directShellCommand(row.command),
        ...(row.matcher === undefined ? {} : { matcher: row.matcher }),
        ...(row.event === "pre_tool_use" ? { failClosed: true } : {}),
      });
      continue;
    }
    const hook = {
      type: "command",
      command: [...row.command],
      ...(row.timeoutMs === undefined ? {} : { timeout: Math.ceil(row.timeoutMs / 1000) }),
    };
    const group = entries.find((candidate) => (candidate as { matcher?: string }).matcher === row.matcher) as { hooks: unknown[] } | undefined;
    if (group === undefined) entries.push({ ...(row.matcher === undefined ? {} : { matcher: row.matcher }), hooks: [hook] });
    else group.hooks.push(hook);
  }
  return { hooks };
}

/** The portable runner's command prefix on Cursor; its one argument is the encoded row. */
const CURSOR_RUNNER_COMMAND = `node ${CURSOR_SCRIPTS}stamity-portable-hook.mjs `;

/** The row a runner command's trailing base64url argument encodes, or `null` when it carries none this can read. */
function encodedRow(command: string): DirectHookRow | null {
  const argument = command.slice(command.lastIndexOf(" ") + 1);
  let row: unknown;
  try {
    row = JSON.parse(Buffer.from(argument, "base64url").toString("utf8"));
    // reason: not silent — a command carrying no row proves nothing, and nothing is proved from it.
  } catch {
    return null;
  }
  if (!isPlainObject(row) || typeof row["event"] !== "string" || !Array.isArray(row["command"])) return null;
  const { event, matcher, command: argv, timeoutMs } = row;
  if (!argv.every((word) => typeof word === "string")) return null;
  return {
    event,
    command: argv as string[],
    ...(typeof matcher === "string" ? { matcher } : {}),
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
  };
}

/**
 * The rows the engine's current rendering of a hooks document wires through
 * the portable runner, in its order: each Cursor entry, and each inner hook of
 * a Codex group, whose command is the runner's (`CURSOR_RUNNER_COMMAND`, or a
 * Codex starter) — the definitions it renders now, which
 * {@link directHookRendering} re-renders as 1.6.0 did.
 */
function runnerRows(rendering: Record<string, unknown>): DirectHookRow[] {
  const rows: DirectHookRow[] = [];
  const hooks = rendering["hooks"];
  if (!isPlainObject(hooks)) return rows;
  const read = (command: unknown, runs: (text: string) => boolean): void => {
    if (typeof command !== "string" || !runs(command)) return;
    const row = encodedRow(command);
    if (row !== null) rows.push(row);
  };
  for (const elements of Object.values(hooks)) {
    if (!Array.isArray(elements)) continue;
    for (const element of elements) {
      if (!isPlainObject(element)) continue;
      read(element["command"], (text) => text.startsWith(CURSOR_RUNNER_COMMAND));
      for (const hook of innerHooks(element) ?? []) read(isPlainObject(hook) ? hook["command"] : undefined, isEngineStarter);
    }
  }
  return rows;
}

// ── S17: the scripts a hooks document runs ───────────────────────────────

/** A repo-relative script path the engine writes and a hooks document may name. */
const SCRIPT_PATH = /(?:\.stamity\/[A-Za-z0-9._/-]+|\.cursor\/hooks\/[A-Za-z0-9._-]+)\.(?:mjs|cjs|js|sh|py)\b/gu;

/**
 * A run of path separators, either spelling: a kept document may name a script
 * Windows-style, and the ledger and the sweep spell every path with one `/`.
 * Read as one `/` before matching, so retention errs toward keeping.
 */
const SEPARATORS = /[\\/]+/gu;

/** `text` with each run of {@link SEPARATORS} read as one `/`. */
function forwardSlashes(text: string): string {
  return text.replace(SEPARATORS, "/");
}

/** A run of base64url characters long enough to be a portable runner's encoded row. */
const ENCODED_TOKEN = /[A-Za-z0-9_-]{16,}/gu;

/** Every string value of a parsed JSON value, keys excluded. */
function stringsOf(value: unknown, into: string[]): void {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsOf(item, into);
  else if (isPlainObject(value)) for (const item of Object.values(value)) stringsOf(item, into);
}

/** The script paths a portable runner's encoded row names in its `command` argv, or none. */
function encodedRowScripts(encoded: string): string[] {
  let row: unknown;
  try {
    row = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    // reason: not silent — most tokens are words, not rows, and name nothing.
  } catch {
    return [];
  }
  if (!isPlainObject(row) || !Array.isArray(row["command"])) return [];
  return row["command"].flatMap((raw) => {
    if (typeof raw !== "string") return [];
    const word = forwardSlashes(raw);
    return word.includes("/") && !word.startsWith("/") ? [word.startsWith("./") ? word.slice(2) : word] : [];
  });
}

/**
 * The repo-relative scripts a hooks document runs (S17): every path under
 * `.stamity/` or `.cursor/hooks/` with a script extension its text names, plus
 * each relative path in the `command` argv of a portable runner's encoded row,
 * which names the script the runner launches and carries it only base64url
 * encoded. A document that parses is read value by value, so a JSON escape
 * (`\/`) hides nothing; one that does not is read as text. Either way a run of
 * `\` or `/` reads as one `/` ({@link SEPARATORS}).
 */
export function referencedHookScripts(text: string): Set<string> {
  const texts: string[] = [];
  try {
    stringsOf(JSON.parse(text), texts);
    // reason: not silent — an unreadable document is still read, as text.
  } catch {
    texts.push(text);
  }
  const scripts = new Set<string>();
  for (const raw of texts) {
    const value = forwardSlashes(raw);
    for (const match of value.matchAll(SCRIPT_PATH)) scripts.add(match[0]);
    for (const match of value.matchAll(ENCODED_TOKEN)) for (const script of encodedRowScripts(match[0])) scripts.add(script);
  }
  return scripts;
}

/**
 * How the reclaim sweep reads a hooks document it keeps
 * (`../merge/reclaim.ts::HookScriptReader`): which candidate paths are engine
 * hook scripts — under the generated hooks folder, an installed pack's folder,
 * or one of `guardPaths` — and whether a kept document's text runs one. Each
 * document's references are read once, however the calls interleave.
 */
export function hookScriptReader(guardPaths: readonly string[]): {
  isHookScript(path: string): boolean;
  runs(text: string, path: string): boolean;
} {
  const guards = new Set(guardPaths);
  // One entry per document text, so a sweep alternating between documents parses each once.
  const read = new Map<string, { scripts: Set<string>; flat: string }>();
  return {
    isHookScript: (path) => path.startsWith(`${HOOKS_GENERATED_DIR}/`) || path.startsWith(`${STATE_DIR}/packs/`) || guards.has(path),
    runs: (text, path) => {
      let entry = read.get(text);
      if (entry === undefined) {
        entry = { scripts: referencedHookScripts(text), flat: forwardSlashes(text) };
        read.set(text, entry);
      }
      return entry.scripts.has(path) || entry.flat.includes(path);
    },
  };
}
