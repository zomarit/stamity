/**
 * Read-only git for verdict roles, decided by the generated Claude Code guard
 * (sw05-read-only-git-grants, REQ-CTX-017).
 *
 * The guard runs as a real child process on the policy document the shipped
 * roster emits, placed at the paths emission writes them — the one layout in
 * which the guard carries the read-only git branch. A role that withholds
 * `execute` but carries `readOnlyGit` may send `Bash` a command that is `git`
 * plus one listed subcommand, with no writing option and no shell syntax; any
 * other command refuses as `GIT_COMMAND_DENIED`.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { GENERATED_DIR, HOOKS_GENERATED_DIR } from "../../src/emit/hooksInfra.ts";
import { planCoreHookScripts, type GeneratedHookScript } from "../../src/hooks/scripts.ts";
import { AGENT_POLICY_ROSTER, READ_ONLY_GIT_SUBCOMMANDS } from "../../src/roster/agentPolicies.ts";
import {
  AGENT_TOOL_POLICIES_FILE,
  buildAgentToolPoliciesJson,
  type AgentToolPolicy,
} from "../../src/tools/allowlist.ts";
import { useTempDir } from "../support/tempDir.ts";

/** The package and version the core scripts' CLI hints pin; a literal, so a renamed fork renders the same bytes. */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };

const getRepo = useTempDir("read-only-git-guard");

/** The five rows that carry `readOnlyGit`: the four verdict roles and the spec-author. */
const GIT_READERS = [
  "stamity-reviewer",
  "stamity-security",
  "stamity-performance",
  "stamity-design-quality",
  "stamity-spec-author",
] as const;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function guardOf(plan: readonly GeneratedHookScript[]): GeneratedHookScript {
  const guard = plan.find((script) => script.event === "pre_tool_use");
  if (guard === undefined) throw new Error("the core plan emitted no pre_tool_use script");
  return guard;
}

/**
 * The claude guard and a policy document at the paths emission writes them.
 * `layout: "container"` places the guard as a plugin root would, beside its
 * document, where no read-only git branch is rendered.
 */
async function placeGuard(
  opts: { document?: string; layout?: "generated" | "container" } = {},
): Promise<string> {
  const document = opts.document ?? buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER);
  if (opts.layout === "container") {
    const guard = guardOf(planCoreHookScripts(AGENT_TOOL_POLICIES_FILE, "claude", CLI_PIN));
    await getRepo().seedFiles({
      [`plugin/hooks/${AGENT_TOOL_POLICIES_FILE}`]: document,
      [`plugin/hooks/${guard.fileName}`]: guard.content,
    });
    return getRepo().path("plugin", "hooks", guard.fileName);
  }
  const guard = guardOf(planCoreHookScripts(`../../${AGENT_TOOL_POLICIES_FILE}`, "claude", CLI_PIN));
  await getRepo().seedFiles({
    [`${GENERATED_DIR}/${AGENT_TOOL_POLICIES_FILE}`]: document,
    [`${HOOKS_GENERATED_DIR}/claude/${guard.fileName}`]: guard.content,
  });
  return getRepo().path(...HOOKS_GENERATED_DIR.split("/"), "claude", guard.fileName);
}

/** A fixture policy row: read only, plus whatever `extra` a document might carry. */
function fixtureRow(agentId: string, extra: Record<string, unknown>): AgentToolPolicy {
  return { agentId, allow: ["read"], rationale: "fixture", ...extra };
}

/** A shell call as Claude Code sends it; `command` undefined sends no `tool_input` at all. */
function shellCall(agentId: string, command: string | undefined, tool = "Bash"): string {
  return JSON.stringify({
    agent_type: agentId,
    agent_id: `${agentId}-01`,
    tool_name: tool,
    ...(command === undefined ? {} : { tool_input: { command } }),
  });
}

/** Runs the guard the way a client does: fresh process, piped stdio. */
function run(guard: string, input: string): RunResult {
  const result = spawnSync(process.execPath, [guard], { input, encoding: "utf8" });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/** The refusal event a guard reports on stderr, parsed. */
function refusal(result: RunResult): Record<string, unknown> {
  const line = result.stderr.trim().split("\n").at(-1) ?? "";
  return JSON.parse(line) as Record<string, unknown>;
}

function expectAdmitted(result: RunResult, label: string): void {
  expect(result, label).toEqual({ code: 0, stdout: "", stderr: "" });
}

function expectRefused(result: RunResult, reasonCode: string, label: string): void {
  expect(result.code, label).toBe(2);
  expect(refusal(result), label).toMatchObject({ blocked: true, reasonCode });
  expect(result.stdout, label).toBe("");
}

describe("the guard's read-only git for verdict roles", () => {
  it("admits the reviewer's git diff with no stderr", async () => {
    const guard = await placeGuard();

    expectAdmitted(run(guard, shellCall("stamity-reviewer", "git diff abc..def")), "git diff abc..def");
  });

  it("admits every listed subcommand for every read-only git row, the spec-author included", async () => {
    const guard = await placeGuard();

    expect([...READ_ONLY_GIT_SUBCOMMANDS]).toEqual(["log", "show", "diff", "rev-list", "merge-base"]);
    for (const agentId of GIT_READERS) {
      // Non-degenerate: the row withholds `execute`, so without the branch this
      // Bash call would refuse through the category.
      const row = AGENT_POLICY_ROSTER.find((entry) => entry.agentId === agentId);
      expect(row?.readOnlyGit, agentId).toBe(true);
      expect(row?.allow, agentId).not.toContain("execute");
      for (const sub of READ_ONLY_GIT_SUBCOMMANDS) {
        const command = `git ${sub} HEAD~1 HEAD -- src/cli.ts`;
        expectAdmitted(run(guard, shellCall(agentId, command)), `${agentId}: ${command}`);
      }
    }
  });

  it("refuses a writing subcommand, a writing option, shell syntax, a top-level option and a non-git command", async () => {
    const guard = await placeGuard();

    for (const command of [
      "git commit -m x",
      "git checkout main",
      "git reset --hard HEAD",
      "git stash",
      "git push origin main",
      "git show --ext-diff HEAD",
      "git diff --output=x",
      "git log; rm -rf x",
      "git -c a=b log",
      "ls",
      "git log --ext-diff",
      "git show --textconv HEAD",
      "git diff --no-index a b",
      "git -p log",
      "git --paginate log",
      "git log | sh",
      "git log > out.txt",
      "git log $(id)",
      "git log 'x'",
      "git log\nrm x",
      "git\tlog",
      " git log",
      "git  log",
      "git",
      "",
      `git log ${"a".repeat(1_024)}`,
    ]) {
      const label = JSON.stringify(command);
      const result = run(guard, shellCall("stamity-reviewer", command));
      expectRefused(result, "GIT_COMMAND_DENIED", label);
      expect(refusal(result), label).toMatchObject({ agentId: "stamity-reviewer", tool: "Bash", category: "execute" });
    }
  });

  it("refuses --show-signature (runs gpg.program) and --help (git runs `git help <sub>`) on every subcommand", async () => {
    const guard = await placeGuard();

    // Git 2.52 refuses the abbreviations (`--show-sig`, `--hel`) itself, so
    // only the full spellings need the guard; the prefix match also catches a
    // longer token such as `--help-all`.
    for (const sub of READ_ONLY_GIT_SUBCOMMANDS) {
      for (const command of [`git ${sub} --show-signature HEAD`, `git ${sub} --help`, `git ${sub} HEAD --help-all`]) {
        expectRefused(run(guard, shellCall("stamity-security", command)), "GIT_COMMAND_DENIED", command);
      }
    }
  });

  it("names both new options and the no-option-before-the-subcommand rule in the refusal", async () => {
    const guard = await placeGuard();

    const message = String(refusal(run(guard, shellCall("stamity-reviewer", "git --no-pager log"))).message);
    expect(message).toContain("--show-signature");
    expect(message).toContain("--help");
    expect(message).toContain("no option before the subcommand, not even --no-pager");
  });

  it("refuses a Bash call that carries no command", async () => {
    const guard = await placeGuard();

    expectRefused(run(guard, shellCall("stamity-security", undefined)), "GIT_COMMAND_DENIED", "no tool_input");
  });

  it("admits a command at the 1,024-character limit and refuses one past it", async () => {
    const guard = await placeGuard();
    const head = "git log ";
    const atLimit = `${head}${"a".repeat(1_024 - head.length)}`;

    expect(atLimit).toHaveLength(1_024);
    expectAdmitted(run(guard, shellCall("stamity-reviewer", atLimit)), "1,024 characters");
    expectRefused(run(guard, shellCall("stamity-reviewer", `${atLimit}a`)), "GIT_COMMAND_DENIED", "1,025 characters");
  });

  it("never admits PowerShell, even for a read-only git command", async () => {
    const guard = await placeGuard();

    expectRefused(
      run(guard, shellCall("stamity-reviewer", "git log", "PowerShell")),
      "CATEGORY_DENIED",
      "PowerShell git log",
    );
  });

  it("refuses git for a role without readOnlyGit through the category", async () => {
    const guard = await placeGuard();
    const researcher = AGENT_POLICY_ROSTER.find((entry) => entry.agentId === "stamity-researcher");
    expect(Object.hasOwn(researcher ?? {}, "readOnlyGit")).toBe(false);

    expectRefused(run(guard, shellCall("stamity-researcher", "git log")), "CATEGORY_DENIED", "researcher git log");
    expectRefused(run(guard, shellCall("stamity-creator", "git log")), "CATEGORY_DENIED", "creator git log");
  });

  it("leaves a role that holds execute to its category: any command passes", async () => {
    const guard = await placeGuard();

    expectAdmitted(run(guard, shellCall("stamity-implementer", "ls")), "implementer ls");
  });

  it("admits only the literal true, and fails closed on a document that predates the key", async () => {
    // One document, one row per value: the control row carries `true`, the
    // row with no key is a document written before the field existed, and the
    // rest are values a hand-edited document could hold.
    const refusedRows: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["stamity-predates", {}],
      ["stamity-string", { readOnlyGit: "true" }],
      ["stamity-number", { readOnlyGit: 1 }],
      ["stamity-false", { readOnlyGit: false }],
    ];
    const guard = await placeGuard({
      document: JSON.stringify({
        schema: "stamity/agent-tool-policies/v1",
        policies: [
          fixtureRow("stamity-reviewer", { readOnlyGit: true }),
          ...refusedRows.map(([agentId, extra]) => fixtureRow(agentId, extra)),
        ],
      }),
    });

    expectAdmitted(run(guard, shellCall("stamity-reviewer", "git log")), "control");
    for (const [agentId] of refusedRows) {
      expectRefused(run(guard, shellCall(agentId, "git log")), "CATEGORY_DENIED", agentId);
    }
  });

  it("renders no read-only git branch in a plugin root (the container layout)", async () => {
    const guard = await placeGuard({ layout: "container" });

    expectRefused(run(guard, shellCall("stamity-reviewer", "git log")), "CATEGORY_DENIED", "container git log");
  });
});
