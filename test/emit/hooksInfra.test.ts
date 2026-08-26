import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../src/content/frontmatter.ts";
import {
  AGENT_TOOL_POLICIES_PATH,
  planHooksInfra,
  type CoreHooksPlan,
  type HooksPlanContext,
  type PackAgentDeclaration,
} from "../../src/emit/hooksInfra.ts";
import { CANONICAL_HOOK_EVENTS } from "../../src/hooks/model.ts";
import { MAX_POLICY_FILE_BYTES } from "../../src/hooks/scripts.ts";
import { AGENT_POLICY_ROSTER } from "../../src/roster/agentPolicies.ts";
import { AGENT_TOOL_POLICIES_SCHEMA } from "../../src/tools/allowlist.ts";
import type { Tool } from "../../src/types/core.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Real temp directories rather than the virtual-fs lane: the user-hook reader
 * gates on `lstat` symlink facts and script existence, and the purity probe
 * asserts against a real tree.
 */
const getRepo = useTempDir("emit-hooks-infra");

const HOOKS_ROOT = ".stamity/generated/hooks";
const USER_HOOKS_DIR = ".stamity/hooks";
const NOTIFY_SCRIPT = `${USER_HOOKS_DIR}/notify.mjs`;

const SESSION_START = "stamity-session-start.mjs";
const GUARD = "stamity-pre-tool-use-guard.mjs";
const TAMPER = "stamity-config-tamper-notice.mjs";

const hookDoc = (...hooks: unknown[]): string => JSON.stringify({ hooks }, null, 2);

/** The emitted policy document as a reader parses it — structural, never imported. */
interface PolicyDocument {
  schema: string;
  policies: Array<{
    agentId: string;
    allow: string[];
    rationale: string;
    source?: { kind: string; packId?: string };
  }>;
}

/**
 * The bundled ops pack's declared tool footprint, verbatim from
 * `packs/ops/pack.json`. `spawn` is in it deliberately: the footprint is what
 * bounds a grant, and neither ops agent declares `spawn`, so no emitted row may
 * carry it either.
 */
const OPS_FOOTPRINT = ["read", "edit", "execute", "network", "spawn"] as const;

/** Repo root, for reading the real first-party pack this suite composes rows from. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The two ops-pack agents as the composer would hand them over: real files,
 * real frontmatter, real footprint. Reading the shipped pack rather than
 * inventing a fixture is what makes the grants asserted below the grants an
 * operator actually gets.
 */
let opsAgents: PackAgentDeclaration[] = [];

beforeAll(async () => {
  opsAgents = await Promise.all(
    ["stamity-devops", "stamity-incident-responder"].map(async (runtimeId) => {
      const relPath = `packs/ops/agents/${runtimeId}.md`;
      const raw = await readFile(`${REPO_ROOT}${relPath}`, "utf8");
      return {
        runtimeId,
        packId: "ops",
        frontmatter: parseFrontmatter(raw, relPath).frontmatter,
        declaredTools: [...OPS_FOOTPRINT],
      };
    }),
  );
});

/** One declaration literal, for the cases a synthetic pack expresses better than ops does. */
function packAgent(
  runtimeId: string,
  capabilities: unknown,
  declaredTools: readonly PackAgentDeclaration["declaredTools"][number][] = [
    "read",
    "edit",
    "execute",
  ],
  packId = "probe",
): PackAgentDeclaration {
  return { runtimeId, packId, frontmatter: { capabilities }, declaredTools };
}

/** Parsed policy document off a plan. */
function policyDoc(p: CoreHooksPlan): PolicyDocument {
  return JSON.parse(p.policyDocument.content) as PolicyDocument;
}

function ctxFor(rootDir: string, tools: readonly Tool[], userHooksDir?: string): HooksPlanContext {
  return {
    rootDir,
    manifest: {
      tools: [...tools],
      ...(userHooksDir === undefined ? {} : { hooks: { userHooksDir } }),
    },
  };
}

/** Plans against the current test repo without seeding anything extra. */
async function plan(tools: readonly Tool[], userHooksDir?: string): Promise<CoreHooksPlan> {
  return planHooksInfra(ctxFor(getRepo().dir, tools, userHooksDir));
}

function scriptContent(p: CoreHooksPlan, tool: Tool, fileName: string): string {
  const row = p.scripts.find((s) => s.tool === tool && s.path.endsWith(`/${fileName}`));
  expect(row, `${tool}/${fileName}`).toBeDefined();
  return row!.content;
}

/** Every file under `dir`, POSIX-relative and sorted, for before/after purity snapshots. */
async function tree(dir: string): Promise<string[]> {
  const entries = (await readdir(dir, { recursive: true })) as string[];
  return entries.map((entry) => entry.split(sep).join("/")).toSorted();
}

describe("core script rows", () => {
  it("plans three scripts per selected tool plus exactly one policy document", async () => {
    // Manifest order is cursor-first on purpose: the plan normalizes to
    // canonical tool order, so selection spelling never changes the bytes.
    const p = await plan(["cursor", "claude"]);

    expect(p.scripts.map((s) => s.path)).toEqual([
      `${HOOKS_ROOT}/claude/${SESSION_START}`,
      `${HOOKS_ROOT}/claude/${GUARD}`,
      `${HOOKS_ROOT}/claude/${TAMPER}`,
      `${HOOKS_ROOT}/cursor/${SESSION_START}`,
      `${HOOKS_ROOT}/cursor/${GUARD}`,
      `${HOOKS_ROOT}/cursor/${TAMPER}`,
    ]);
    expect(p.scripts.map((s) => s.tool)).toEqual([
      "claude",
      "claude",
      "claude",
      "cursor",
      "cursor",
      "cursor",
    ]);

    expect(p.policyDocument.path).toBe(AGENT_TOOL_POLICIES_PATH);
    expect(p.policyDocument.path).toBe(".stamity/generated/agent-tool-policies.json");
    expect(p.policyDocument.owners).toEqual(["claude", "cursor"]);
    expect(p.warnings).toEqual([]);
  });

  it("emits no orphan rows for unselected tools on a single-tool selection", async () => {
    const p = await plan(["codex"]);

    expect(p.scripts).toHaveLength(3);
    for (const script of p.scripts) {
      expect(script.tool).toBe("codex");
      expect(script.path.startsWith(`${HOOKS_ROOT}/codex/`)).toBe(true);
    }
    expect(p.policyDocument.owners).toEqual(["codex"]);
    // An unselected tool has no planned scripts, so its interchange is empty
    // rather than a set of rows pointing at files nothing will write.
    expect(p.interchangeFor("claude")).toEqual([]);
    expect(p.interchangeFor("copilot")).toEqual([]);
  });

  it("bakes each client's honest fail mode into its guard; shared bodies stay byte-identical", async () => {
    const p = await plan(["claude", "cursor", "copilot"]);

    const claudeGuard = scriptContent(p, "claude", GUARD);
    const cursorGuard = scriptContent(p, "cursor", GUARD);
    const copilotGuard = scriptContent(p, "copilot", GUARD);

    // copilot never blocks on a hook, and its guard says so in its bytes.
    expect(copilotGuard).not.toBe(claudeGuard);
    expect(claudeGuard).toContain("const BLOCKING = true");
    expect(claudeGuard).toContain("Blocking client");
    expect(copilotGuard).toContain("const BLOCKING = false");
    expect(copilotGuard).toContain("Reporting-only client");

    // Assertion INVERTED, and the BD-candidate this comment used to flag is the
    // reason. The two bodies were byte-identical because blocking was derived
    // from the exit-status guarantee alone, and on that axis claude and cursor
    // agree. The axis that was missing is identity: cursor's tool-call payload
    // names no agent, so the guard's scope test returns early on every call and
    // the blocking body it was handed could never fire — while the adapter wired
    // it `failClosed` and the capability matrix advertised the claim.
    expect(cursorGuard).not.toBe(claudeGuard);
    expect(cursorGuard).toContain("const BLOCKING = false");
    expect(cursorGuard).toContain("carries no agent identity");

    // The tool-independent bodies never fork per tool.
    expect(scriptContent(p, "cursor", SESSION_START)).toBe(scriptContent(p, "claude", SESSION_START));
    expect(scriptContent(p, "copilot", SESSION_START)).toBe(scriptContent(p, "claude", SESSION_START));
    expect(scriptContent(p, "cursor", TAMPER)).toBe(scriptContent(p, "claude", TAMPER));
    expect(scriptContent(p, "copilot", TAMPER)).toBe(scriptContent(p, "claude", TAMPER));
  });

  it("keeps the trust posture in the emitted bytes: no network vocabulary beyond the builders' own gate", async () => {
    const p = await plan(["claude", "cursor", "copilot", "codex"]);

    for (const script of p.scripts) {
      expect(script.content, script.path).not.toMatch(/https?:\/\/|\bcurl\b|\bwget\b|\bfetch\(/i);
      expect(script.content.startsWith("#!/usr/bin/env node\n"), script.path).toBe(true);
    }
  });
});

describe("policy document", () => {
  it("parses as JSON with the schema discriminator and one row per roster entry", async () => {
    const p = await plan(["claude"]);

    expect(p.policyDocument.content.endsWith("\n")).toBe(true);
    const document = JSON.parse(p.policyDocument.content) as PolicyDocument;

    expect(document.schema).toBe(AGENT_TOOL_POLICIES_SCHEMA);
    // Length assertion updated, not weakened: the shipped roster grew from 7
    // rows to 10 when the trigger-conditional specialists landed
    // (stamity-security / stamity-design-quality / stamity-performance). The
    // invariant under test is unchanged — one document row per roster row —
    // and the row-level parity below is what the literal count was standing in
    // for.
    expect(AGENT_POLICY_ROSTER).toHaveLength(10);
    expect(document.policies).toHaveLength(AGENT_POLICY_ROSTER.length);
    expect(document.policies.map((row) => row.agentId).toSorted()).toEqual(
      AGENT_POLICY_ROSTER.map((row) => row.agentId).toSorted(),
    );
    // Every row is its roster row, specialists included: a document that
    // restated a grant instead of serializing it would pass the count and fail
    // here.
    for (const row of AGENT_POLICY_ROSTER) {
      const emitted = document.policies.find((candidate) => candidate.agentId === row.agentId);
      expect(emitted?.allow, row.agentId).toEqual([...row.allow]);
      expect(emitted?.rationale, row.agentId).toBe(row.rationale);
      // Core rows carry no provenance: absence is what reads as core, and it is
      // what keeps a pack-unaware document byte-identical to a pack-aware one.
      expect(Object.hasOwn(emitted ?? {}, "source"), row.agentId).toBe(false);
    }
    for (const specialist of ["stamity-security", "stamity-design-quality", "stamity-performance"]) {
      expect(document.policies.map((row) => row.agentId)).toContain(specialist);
    }
  });

  it("is referenced by every guard script at exactly the path the plan places it", async () => {
    // The guard hardcodes a climb relative to its own directory; the plan
    // places the document absolutely. Re-derive the climb from the emitted
    // bytes and walk it from the script's planned location — moving either
    // side without the other fails here.
    const p = await plan(["claude", "codex"]);

    for (const tool of ["claude", "codex"] as const) {
      const guardRow = p.scripts.find((s) => s.tool === tool && s.path.endsWith(`/${GUARD}`))!;
      const match =
        /^const POLICY_FILE = join\(dirname\(fileURLToPath\(import\.meta\.url\)\), (.+)\);$/m.exec(
          guardRow.content,
        );
      expect(match, `${tool} guard declares POLICY_FILE as a directory-relative join`).not.toBeNull();

      const segments = JSON.parse(`[${match![1]!}]`) as string[];
      const resolved = posix.normalize(posix.join(posix.dirname(guardRow.path), ...segments));
      expect(resolved, tool).toBe(p.policyDocument.path);
    }
  });
});

describe("policy document: installed-pack agent rows", () => {
  /** Plans the current repo with `packAgents` supplied, tools pinned to claude. */
  async function planWithPackAgents(
    packAgents: readonly PackAgentDeclaration[],
  ): Promise<CoreHooksPlan> {
    return planHooksInfra({ ...ctxFor(getRepo().dir, ["claude"]), packAgents });
  }

  it("carries a row per ops-pack agent with the grant its frontmatter and footprint agree on", async () => {
    // Grant resolution, the emission half: without these rows the generated guard answers
    // NO_POLICY for every agent the ops pack installed, and /stamity-release and
    // /stamity-incident-response are inert on a repo that installed it cleanly.
    const p = await planWithPackAgents(opsAgents);
    const document = policyDoc(p);

    for (const runtimeId of ["stamity-devops", "stamity-incident-responder"]) {
      const row = document.policies.find((candidate) => candidate.agentId === runtimeId);
      expect(row, runtimeId).toBeDefined();
      expect(row?.allow, runtimeId).toEqual(["read", "edit", "execute"]);
      expect(row?.source, runtimeId).toEqual({ kind: "pack", packId: "ops" });
      expect(row?.rationale, runtimeId).toContain("ops");
    }
    expect(document.policies).toHaveLength(AGENT_POLICY_ROSTER.length + 2);
    expect(p.warnings).toEqual([]);
  });

  it("leaves every core row byte-identical when pack rows join the document", async () => {
    const withoutPacks = await plan(["claude"]);
    const withPacks = await planWithPackAgents(opsAgents);

    const core = policyDoc(withoutPacks).policies;
    const composed = policyDoc(withPacks).policies;

    // Row-for-row byte identity on the whole shipped roster: an install adds
    // rows and may not touch one. This is the property that makes "the pack
    // extension cannot change a core grant" a fact rather than a hope.
    for (const row of core) {
      const emitted = composed.find((candidate) => candidate.agentId === row.agentId);
      expect(JSON.stringify(emitted), row.agentId).toBe(JSON.stringify(row));
    }
    expect(core).toHaveLength(AGENT_POLICY_ROSTER.length);
    expect(composed).toHaveLength(core.length + 2);
  });

  it("emits the intersection with the pack footprint, never the agent's declaration", async () => {
    // The agent asks for network; its pack disclosed only read and edit. The
    // install preview showed the footprint, so the footprint is the ceiling —
    // accepting an install is not a second, wider grant applied at emission.
    const p = await planWithPackAgents([
      packAgent("stamity-probe", ["read", "edit", "network"], ["read", "edit"]),
    ]);

    const row = policyDoc(p).policies.find((candidate) => candidate.agentId === "stamity-probe");
    expect(row?.allow).toEqual(["read", "edit"]);
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toContain("stamity-probe");
    expect(p.warnings[0]).toContain("declared tool footprint");
  });

  it("never emits a spawn grant, whatever the agent declares and its pack allows", async () => {
    const p = await planWithPackAgents([
      packAgent("stamity-probe", ["read", "spawn"], ["read", "spawn"]),
    ]);

    const document = policyDoc(p);
    const row = document.policies.find((candidate) => candidate.agentId === "stamity-probe");
    expect(row?.allow).toEqual(["read"]);
    // No row in the whole document holds it — the envelope's `categories` array
    // still names the taxonomy, which is vocabulary rather than a grant.
    expect(document.policies.flatMap((policy) => policy.allow)).not.toContain("spawn");
    expect(p.warnings.some((warning) => warning.includes("Delegation depth stays 1"))).toBe(true);
  });

  it("resolves a core id from the roster and emits no second row for it", async () => {
    // One id, one row — or the first-match lookup on both enforcement points
    // becomes order-dependent. The pack's wider declaration is ignored and said
    // to be ignored.
    const p = await planWithPackAgents([
      packAgent("stamity-reviewer", ["read", "edit", "execute"], ["read", "edit", "execute"], "ops"),
    ]);
    const document = policyDoc(p);

    const rows = document.policies.filter((row) => row.agentId === "stamity-reviewer");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.allow).toEqual(["read"]);
    expect(Object.hasOwn(rows[0] ?? {}, "source")).toBe(false);
    expect(document.policies).toHaveLength(AGENT_POLICY_ROSTER.length);
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toContain("resolved from the agent policy roster");
  });

  it("warns with a reason when a pack agent's grant resolves to nothing", async () => {
    const p = await planWithPackAgents([
      packAgent("stamity-silent", undefined),
      packAgent("stamity-outside", ["network"], ["read"]),
    ]);
    const document = policyDoc(p);

    // No row for either: an empty row and an absent row reach the same verdict
    // at the guard, and the warning is the part that used to be missing — a
    // silently ungranted agent reads as installed and does nothing.
    expect(document.policies.map((row) => row.agentId)).not.toContain("stamity-silent");
    expect(document.policies.map((row) => row.agentId)).not.toContain("stamity-outside");

    const silent = p.warnings.filter((warning) => warning.includes("stamity-silent"));
    expect(silent).toHaveLength(2);
    expect(silent[0]).toContain("declares no `capabilities:` frontmatter");
    expect(silent[1]).toContain("resolved to no tool categories");
    expect(silent[1]).toContain("denies every tool it requests");
    expect(p.warnings.some((w) => w.includes("stamity-outside") && w.includes("footprint"))).toBe(
      true,
    );
  });

  it("drops an uninstalled pack's rows from the next document", async () => {
    // A stale grant surviving uninstall is privilege that outlives its consent.
    // The composer stops handing the declaration over; the document reverts to
    // bytes identical to a repo that never installed the pack.
    const installed = await planWithPackAgents(opsAgents);
    const uninstalled = await planWithPackAgents([]);
    const neverInstalled = await plan(["claude"]);

    expect(installed.policyDocument.content).toContain("stamity-devops");
    expect(uninstalled.policyDocument.content).not.toContain("stamity-devops");
    expect(uninstalled.policyDocument.content).toBe(neverInstalled.policyDocument.content);
  });

  it("reports a duplicate id across two packs instead of resolving it by input order", async () => {
    const p = await planWithPackAgents([
      packAgent("stamity-probe", ["read"], ["read"], "alpha"),
      packAgent("stamity-probe", ["read", "edit"], ["read", "edit"], "beta"),
    ]);
    const rows = policyDoc(p).policies.filter((row) => row.agentId === "stamity-probe");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toEqual({ kind: "pack", packId: "alpha" });
    expect(
      p.warnings.some(
        (warning) => warning.startsWith("agent-tool-policy pack rows: ") && warning.includes("Duplicate"),
      ),
    ).toBe(true);
  });

  it("warns when pack rows push the document past the size the guard parses", async () => {
    // The cap is a whole-file bound: past it the guard refuses to parse at all,
    // so the core rows go down with the pack rows. Reporting it is what keeps a
    // repo-wide lockout from being silent.
    const many = Array.from({ length: 600 }, (_, index) =>
      packAgent(`stamity-bulk-${String(index).padStart(4, "0")}`, ["read", "edit", "execute"]),
    );
    const p = await planWithPackAgents(many);

    expect(Buffer.byteLength(p.policyDocument.content, "utf8")).toBeGreaterThan(
      MAX_POLICY_FILE_BYTES,
    );
    const overflow = p.warnings.filter((warning) =>
      warning.startsWith("agent-tool-policy document: "),
    );
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toContain(`${MAX_POLICY_FILE_BYTES}-byte cap`);
    expect(overflow[0]).toContain("600 installed-pack row(s)");
  });

  it("is deterministic and order-independent across pack agent orderings", async () => {
    const forward = await planWithPackAgents(opsAgents);
    const reversed = await planWithPackAgents([...opsAgents].toReversed());

    expect(reversed.policyDocument.content).toBe(forward.policyDocument.content);
    expect(await planWithPackAgents(opsAgents)).toEqual(
      expect.objectContaining({ policyDocument: forward.policyDocument }),
    );
  });
});

describe("interchange rows", () => {
  it("yields session_start twice and pre_tool_use once for the core scripts, in script order", async () => {
    const p = await plan(["claude", "cursor"]);
    const rows = p.interchangeFor("claude");

    expect(rows.map((row) => row.event)).toEqual(["session_start", "pre_tool_use", "session_start"]);
    expect(rows.map((row) => row.command)).toEqual([
      ["node", `${HOOKS_ROOT}/claude/${SESSION_START}`],
      ["node", `${HOOKS_ROOT}/claude/${GUARD}`],
      ["node", `${HOOKS_ROOT}/claude/${TAMPER}`],
    ]);

    for (const row of rows) {
      // Exec form: argv, never a shell line — and nothing shell-shaped inside it.
      expect(Array.isArray(row.command)).toBe(true);
      for (const part of row.command) {
        expect(typeof part).toBe("string");
        expect(part).not.toMatch(/[;|&`<>]|\$\(|\s{2}/);
      }
      expect(Object.hasOwn(row, "matcher")).toBe(false);
      expect(Object.hasOwn(row, "timeoutMs")).toBe(false);
    }
  });

  it("carries a user hook into every selected tool's rows, after the core set", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      [`${USER_HOOKS_DIR}/notify.json`]: hookDoc({
        event: "session_end",
        command: ["node", NOTIFY_SCRIPT],
        timeoutMs: 3000,
      }),
      [NOTIFY_SCRIPT]: "process.exit(0)\n",
    });

    const p = await plan(["claude", "cursor"]);
    expect(p.warnings).toEqual([]);

    const userRow = {
      event: "session_end",
      command: ["node", NOTIFY_SCRIPT],
      timeoutMs: 3000,
    };
    const claudeRows = p.interchangeFor("claude");
    const cursorRows = p.interchangeFor("cursor");

    expect(claudeRows).toHaveLength(4);
    expect(cursorRows).toHaveLength(4);
    expect(claudeRows[3]).toEqual(userRow);
    expect(cursorRows[3]).toEqual(userRow);
    // Portable interchange shape only — reader provenance stays out of the rows.
    expect(Object.hasOwn(claudeRows[3]!, "sourceFile")).toBe(false);
  });

  it("carries an installed pack's hooks after the repo's own, into every selected tool", async () => {
    // The live-emission invariant's hook seam: the composer reads a
    // pack's hooks/ through the user-hook reader and hands them in here, so
    // an installed pack's hook class is emitted rather than inert.
    const repo = getRepo();
    await repo.seedFiles({
      [`${USER_HOOKS_DIR}/notify.json`]: hookDoc({
        event: "session_end",
        command: ["node", NOTIFY_SCRIPT],
      }),
      [NOTIFY_SCRIPT]: "process.exit(0)\n",
    });

    const packRow = {
      event: "pre_tool_use" as const,
      matcher: "Bash",
      command: ["node", "--pack-hook-sentinel"],
      timeoutMs: 2500,
    };
    const p = await planHooksInfra({
      ...ctxFor(repo.dir, ["claude", "cursor"]),
      packHooks: {
        hooks: [{ ...packRow, sourceFile: ".stamity/packs/ops/hooks/hooks.json" }],
        errors: [],
      },
    });

    expect(p.warnings).toEqual([]);
    for (const tool of ["claude", "cursor"] as const) {
      const rows = p.interchangeFor(tool);
      expect(rows).toHaveLength(5);
      // Lane order: core scripts, then the repo's own hook, then pack supply.
      expect(rows[3]?.event).toBe("session_end");
      expect(rows[4]).toEqual(packRow);
      expect(Object.hasOwn(rows[4]!, "sourceFile")).toBe(false);
    }
  });

  it("agrees with the adapters about which clients have a hook config home", async () => {
    // The planner restates the fact because the architecture boundary forbids an
    // engine module importing an adapter. A restatement with nothing checking it
    // is how the copilot drop went unreported in the first place, so the binding
    // is asserted from the adapters' own dialect facts here.
    const { claudeResiduePlanner } = await import("../../src/adapters/claude.ts");
    const { cursorResiduePlanner } = await import("../../src/adapters/cursor.ts");
    const { copilotResiduePlanner } = await import("../../src/adapters/copilot.ts");
    const { codexResiduePlanner } = await import("../../src/adapters/codex.ts");
    const declared = [
      claudeResiduePlanner.facts,
      cursorResiduePlanner.facts,
      copilotResiduePlanner.facts,
      codexResiduePlanner.facts,
    ];

    const withConfig = declared
      .filter((facts) => facts.hooksConfigPath !== null)
      .map((facts) => facts.tool)
      .toSorted();
    const withoutConfig = declared
      .filter((facts) => facts.hooksConfigPath === null)
      .map((facts) => facts.tool)
      .toSorted();

    expect(withoutConfig.length, "no client declares a null hook config path").toBeGreaterThan(0);

    // Every client with a config home plans rows and raises no drop row; every
    // client without one raises exactly one.
    const planned = await Promise.all(
      [...withConfig, ...withoutConfig].map(async (tool) => [tool, await plan([tool])] as const),
    );
    for (const [tool, p] of planned) {
      const rows = p.warnings.filter((warning) => warning.startsWith("hook wiring ["));
      expect(rows, tool).toHaveLength(withConfig.includes(tool) ? 0 : 1);
      if (rows.length === 1) expect(rows[0], tool).toContain(`hook wiring [${tool}]`);
    }
  });

  it("names the client that takes no hook config, so the drop is not silent", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      [`${USER_HOOKS_DIR}/notify.json`]: hookDoc({
        event: "stop",
        command: ["node", NOTIFY_SCRIPT],
      }),
      [NOTIFY_SCRIPT]: "process.exit(0)\n",
    });

    const p = await plan(["claude", "copilot"]);

    // The bytes land and nothing registers them, and an authored hook that
    // passed every ingress check is dropped. Both facts were unreported.
    const dropped = p.warnings.filter((warning) => warning.startsWith("hook wiring [copilot]"));
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatch(/takes no hook configuration/);
    expect(dropped[0]).toMatch(/\d{4,} bytes of generated hook scripts/);
    expect(dropped[0]).toMatch(/1 accepted hook row\(s\)/);
    // Only the client that cannot wire them: claude gets no such row.
    expect(p.warnings.filter((warning) => warning.includes("[claude]"))).toEqual([]);
  });

  it("names the drop when a selection is empty, where no per-client row can carry it", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      [`${USER_HOOKS_DIR}/notify.json`]: hookDoc(
        { event: "stop", command: ["node", NOTIFY_SCRIPT] },
        { event: "session_end", command: ["node", NOTIFY_SCRIPT] },
      ),
      [NOTIFY_SCRIPT]: "process.exit(0)\n",
    });

    const p = await plan([]);

    // The blind spot the per-client row cannot see: that row is raised once per
    // SELECTED tool, so a selection of none raises none of them — while the
    // accepted rows were pushed into a row map with no lists in it and vanished.
    // Both hooks passed every ingress check; neither will ever run.
    //
    // Reached deliberately through the planner's structural context, which takes
    // a `Pick` of the manifest rather than a validated one. The validator itself
    // refuses this shape (`src/manifest/manifest.ts:607-608`), so this pins a
    // defence-in-depth branch, not a defect a validated CLI run can hit — which
    // is why it asserts the row's text rather than claiming an operator sees it.
    expect(p.interchangeFor("claude")).toEqual([]);
    expect(p.warnings.filter((warning) => warning.startsWith("hook wiring ["))).toEqual([]);

    const dropped = p.warnings.filter((warning) => warning.startsWith("hook wiring:"));
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatch(/2 accepted hook row\(s\)/);
    expect(dropped[0]).toMatch(/no selected client/);
    // The remedy names the clients that can actually carry a hook — copilot,
    // which takes no hook configuration, must not be offered as one.
    expect(dropped[0]).toContain("claude, cursor, codex");
    expect(dropped[0]).not.toContain("copilot");
  });

  it("stays silent on an empty selection with nothing accepted to drop", async () => {
    // The row above is about ROWS that vanished, not about selecting no tool:
    // an empty selection with no authored hook is an ordinary empty build and
    // must not manufacture a warning for it.
    const p = await plan([]);

    expect(p.scripts).toEqual([]);
    expect(p.policyDocument.owners).toEqual([]);
    expect(p.warnings).toEqual([]);
  });

  it("refuses an inline-interpreter pack hook before it can reach a client's settings file", async () => {
    const repo = getRepo();
    // The pack lane reads through the SAME ingress as the repo's own hooks, so
    // this fixture is the real path a pack takes: a hooks/*.json shipped in an
    // installed pack, read by the user-hook reader, handed here.
    await repo.seedFiles({
      ".stamity/packs/evil/hooks/hooks.json": hookDoc({
        event: "pre_tool_use",
        command: ["node", "-e", "process.stdout.write('owned')"],
      }),
    });
    const { readHookDefinitions } = await import("../../src/hooks/userHooks.ts");
    const packHooks = await readHookDefinitions(
      repo.path(".stamity", "packs", "evil", "hooks"),
      repo.dir,
    );

    const p = await planHooksInfra({ ...ctxFor(repo.dir, ["claude"]), packHooks });

    // Nothing is wired: the three core rows are all a client's config receives.
    expect(p.interchangeFor("claude")).toHaveLength(3);
    for (const row of p.interchangeFor("claude")) {
      expect(row.command).not.toContain("-e");
    }
    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toContain("[INLINE_CODE_FLAG]");
    expect(p.warnings[0]).toContain(".stamity/packs/evil/hooks/hooks.json");
  });

  it("reports a defective pack hook as a warning naming its lane and file", async () => {
    const p = await planHooksInfra({
      ...ctxFor(getRepo().dir, ["claude"]),
      packHooks: {
        hooks: [],
        errors: [
          {
            file: ".stamity/packs/ops/hooks/hooks.json",
            code: "SHELL_FORM_COMMAND",
            message: "hooks[0]: command must be exec-form argv",
          },
        ],
      },
    });

    expect(p.warnings).toEqual([
      "pack hook .stamity/packs/ops/hooks/hooks.json [SHELL_FORM_COMMAND]: " +
        "hooks[0]: command must be exec-form argv",
    ]);
    // A defective pack hook costs itself: the core rows still plan.
    expect(p.interchangeFor("claude")).toHaveLength(3);
  });

  it("reads user hooks from manifest.hooks.userHooksDir when configured", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "tools/hooks/run.json": hookDoc({ event: "stop", command: ["node", "tools/hooks/run.mjs"] }),
      "tools/hooks/run.mjs": "process.exit(0)\n",
    });

    const p = await plan(["claude"], "tools/hooks");

    expect(p.warnings).toEqual([]);
    expect(p.interchangeFor("claude").at(-1)).toEqual({
      event: "stop",
      command: ["node", "tools/hooks/run.mjs"],
    });
  });

  it("anchors a depth-1 userHooksDir on the repo root, not on the hooks dir's grandparent", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "hooks/run.json": hookDoc({ event: "stop", command: ["node", "hooks/run.mjs"] }),
      "hooks/run.mjs": "process.exit(0)\n",
    });

    // The manifest permits any repo-relative directory, so the reader's anchor
    // has to come from the emission context rather than from counting segments
    // above the hooks directory — at depth 1 the grandparent is the repo's
    // PARENT, which puts every in-repo script one level out of reach.
    const p = await plan(["claude"], "hooks");

    expect(p.warnings).toEqual([]);
    expect(p.interchangeFor("claude").at(-1)).toEqual({
      event: "stop",
      command: ["node", "hooks/run.mjs"],
    });
  });

  it("anchors a depth-3 userHooksDir on the repo root", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      ".config/stamity/hooks/run.json": hookDoc({
        event: "stop",
        command: ["node", "tools/run.mjs"],
      }),
      "tools/run.mjs": "process.exit(0)\n",
    });

    const p = await plan(["claude"], ".config/stamity/hooks");

    expect(p.warnings).toEqual([]);
    expect(p.interchangeFor("claude").at(-1)).toEqual({
      event: "stop",
      command: ["node", "tools/run.mjs"],
    });
  });

  it("names a rejected hook by its true repo-relative path at a non-default depth", async () => {
    const repo = getRepo();
    await repo.seedFiles({ "hooks/bad.json": "{not json" });

    const p = await plan(["claude"], "hooks");

    expect(p.warnings).toHaveLength(1);
    expect(p.warnings[0]).toContain("user hook hooks/bad.json");
    // Provenance is relative to the repo root; an anchor guessed from the hooks
    // directory would prefix the repo directory's own basename onto the path.
    expect(p.warnings[0]).not.toContain(basename(repo.dir));
  });

  it("warns and excludes malformed user hooks without throwing, naming each file", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      // Non-canonical event: rejected at ingress by the user-hook parser.
      [`${USER_HOOKS_DIR}/bad.json`]: hookDoc({
        event: "on_save",
        command: ["node", NOTIFY_SCRIPT],
      }),
      [`${USER_HOOKS_DIR}/broken.json`]: "{not json",
      [`${USER_HOOKS_DIR}/good.json`]: hookDoc({
        event: "session_end",
        command: ["node", NOTIFY_SCRIPT],
      }),
      [NOTIFY_SCRIPT]: "process.exit(0)\n",
    });

    const p = await plan(["claude"]);

    expect(p.warnings).toHaveLength(2);
    expect(p.warnings[0]).toContain(`${USER_HOOKS_DIR}/bad.json`);
    expect(p.warnings[0]).toContain("UNKNOWN_EVENT");
    expect(p.warnings[0]).toContain("on_save");
    expect(p.warnings[1]).toContain(`${USER_HOOKS_DIR}/broken.json`);
    expect(p.warnings[1]).toContain("INVALID_JSON");

    // The healthy hook still loads; every carried event is canonical.
    const rows = p.interchangeFor("claude");
    expect(rows).toHaveLength(4);
    expect(rows[3]!.event).toBe("session_end");
    for (const row of rows) {
      expect(CANONICAL_HOOK_EVENTS).toContain(row.event);
    }
  });

  it("treats an absent user hooks dir as a non-event: zero user rows, zero warnings", async () => {
    const p = await plan(["claude"]);

    expect(p.warnings).toEqual([]);
    expect(p.interchangeFor("claude")).toHaveLength(3);
  });

  it("passes an outside-root userHooksDir through unchanged and wires accepted commands verbatim", async () => {
    const repo = getRepo();
    // Fixture change (behaviour under test unchanged): the hook's script now
    // sits under the declared repo root rather than beside the outside-root
    // hooks directory. Repo-relative command paths anchor on the emission
    // context's root; this fixture previously relied on the reader inferring an
    // anchor from the hooks directory's grandparent, which happened to land on
    // the temp dir and is the defect being fixed.
    await repo.seedFiles({
      "elsewhere/hooks/h.json": hookDoc({
        event: "user_prompt_submit",
        command: ["node", "tools/run.mjs"],
      }),
      "repo/tools/run.mjs": "process.exit(0)\n",
    });

    // The configured directory sits outside the repo root the plan targets.
    // Emission hands the path to the reader unchanged and never rewrites what
    // it reads — user hook commands are the user's trust domain, gated by the
    // reader's own ingress checks.
    const p = await planHooksInfra(
      ctxFor(repo.path("repo"), ["claude"], repo.path("elsewhere", "hooks")),
    );

    expect(p.warnings).toEqual([]);
    expect(p.interchangeFor("claude").at(-1)).toEqual({
      event: "user_prompt_submit",
      command: ["node", "tools/run.mjs"],
    });
  });
});

describe("determinism and purity", () => {
  it("produces identical bytes across runs and across manifest tool orderings", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      [`${USER_HOOKS_DIR}/notify.json`]: hookDoc({
        event: "post_tool_use",
        matcher: "Bash",
        command: ["node", NOTIFY_SCRIPT],
      }),
      [NOTIFY_SCRIPT]: "process.exit(0)\n",
    });

    const first = await plan(["claude", "cursor", "codex"]);
    const second = await plan(["claude", "cursor", "codex"]);
    const reordered = await plan(["codex", "cursor", "claude"]);

    // Byte-for-byte equality on every row is what codex trust-by-hash needs:
    // a re-plan over an unchanged repo must not move a single digest.
    for (const other of [second, reordered]) {
      expect(other.scripts).toEqual(first.scripts);
      expect(other.policyDocument).toEqual(first.policyDocument);
      expect(other.warnings).toEqual(first.warnings);
      for (const tool of ["claude", "cursor", "codex"] as const) {
        expect(other.interchangeFor(tool)).toEqual(first.interchangeFor(tool));
      }
    }
  });

  it("writes nothing while planning: a seeded tree is untouched and a ghost root stays absent", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      [`${USER_HOOKS_DIR}/notify.json`]: hookDoc({
        event: "session_end",
        command: ["node", NOTIFY_SCRIPT],
      }),
      [NOTIFY_SCRIPT]: "process.exit(0)\n",
    });

    const before = await tree(repo.dir);
    await plan(["claude", "cursor"]);
    expect(await tree(repo.dir)).toEqual(before);

    // Ghost-root probe: planning against a root that does not exist succeeds
    // (hook-dir absence is a non-event) and creates nothing — if any planning
    // step wrote, the root would exist afterwards.
    const ghost = repo.path("ghost");
    const ghostPlan = await planHooksInfra(ctxFor(ghost, ["claude", "cursor"]));
    expect(ghostPlan.scripts).toHaveLength(6);
    expect(ghostPlan.warnings).toEqual([]);
    expect(existsSync(ghost)).toBe(false);
  });
});
