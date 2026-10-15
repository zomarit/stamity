/**
 * u14-shell-guard (REQ-FLOW-101, REQ-FLOW-102, REQ-FLOW-120): the emitted
 * person-only shell guard, run as a real child process in a scratch repository
 * the way a client runs it — fresh process, the payload on stdin, the script at
 * the path emission writes it.
 *
 * No double stands in for anything: the git metadata, the run records and the
 * canary are real files in a temp directory, and the verdicts are u6's own
 * functions, carried into the script as their source text. Each case asserts
 * against the in-process verdict as well as a literal, so the copy and the
 * source cannot drift apart, and every deny case has an allow case one fact
 * away (a branch, a tag, a record, a variable), so a guard that denied
 * everything, or nothing, fails.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gitignoreLine } from "../../src/cli/commands/init/panel.ts";
import { PREFLIGHT_CANARY_FILE, REQUIRED_GITIGNORE_ENTRIES } from "../../src/mcp/env.ts";
import { personOnlyVerdict, unattendedPushVerdict } from "../../src/hooks/personOnly.ts";
import { PERSON_ONLY_GUARD_FILE, planCoreHookScripts } from "../../src/hooks/scripts.ts";
import { type Tool, TOOLS } from "../../src/types/core.ts";
import { assertRulesAdmissible, parseWorktreePolicy, resolveStrategy } from "../../src/worktree/policy.ts";
import { useTempDir } from "../support/tempDir.ts";

/** The package and version the core scripts' CLI hints pin; a literal, so a renamed fork renders the same bytes. */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };
const POLICY = "../../agent-tool-policies.json";

const getRepo = useTempDir("person-only-guard");

type Decision = { deny: false } | { deny: true; reason: string };

/** The guard for one client, at `.stamity/generated/hooks/<tool>/`, and the repository it sits in. */
async function placeGuard(tool: Tool, files: Record<string, string> = {}): Promise<string> {
  const guard = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true }).find(
    (script) => script.fileName === PERSON_ONLY_GUARD_FILE,
  );
  if (guard === undefined) throw new Error("the plan carried no person-only guard");
  await getRepo().seedFiles({
    ...(Object.hasOwn(files, ".git") ? {} : { ".git/HEAD": "ref: refs/heads/feat/x\n" }),
    [`.stamity/generated/hooks/${tool}/${guard.fileName}`]: guard.content,
    ...files,
  });
  return getRepo().path(".stamity", "generated", "hooks", tool, guard.fileName);
}

/**
 * A shell call as each client hands it to the script: Claude Code natively; Codex
 * and Copilot through the portable runner, which restores `tool_name` and
 * `tool_input` (Copilot's `bash` mapped to `Bash`); Cursor's `beforeShellExecution`.
 */
function payload(tool: Tool, command: string): string {
  if (tool === "cursor") return JSON.stringify({ hook_event_name: "beforeShellExecution", command, cwd: "." });
  const extra = tool === "copilot" ? { toolName: "bash" } : { hook_event_name: "PreToolUse" };
  return JSON.stringify({ ...extra, tool_name: "Bash", tool_input: { command } });
}

/** Runs the guard as a client does, with the two variables it reads under the test's control. */
function run(guard: string, input: string, env: Record<string, string> = {}): ReturnType<typeof spawnSync> {
  const base = { ...process.env };
  delete base.STAMITY_UNATTENDED;
  delete base.STAMITY_REPO_ROOT;
  return spawnSync(process.execPath, [guard], { input, encoding: "utf8", env: { ...base, ...env } });
}

/** The decision each client's output carries: exit 2 and stderr, or the client's own JSON. */
function decide(tool: Tool, guard: string, command: string, env?: Record<string, string>): Decision {
  const result = run(guard, payload(tool, command), env);
  const stdout = String(result.stdout).trim();
  if (tool === "claude" || tool === "codex") {
    expect(stdout, command).toBe("");
    if (result.status === 0) return { deny: false };
    expect(result.status, command).toBe(2);
    return { deny: true, reason: String(result.stderr) };
  }
  expect(result.status, command).toBe(0);
  if (tool === "copilot" && stdout === "") return { deny: false };
  const out = JSON.parse(stdout) as Record<string, string>;
  const verdict = tool === "cursor" ? out.permission : out.permissionDecision;
  if (verdict === "allow") return { deny: false };
  expect(verdict, command).toBe("deny");
  return { deny: true, reason: tool === "cursor" ? (out.user_message ?? "") : (out.permissionDecisionReason ?? "") };
}

const ON_FEATURE = { defaultBranches: [], currentBranch: "feat/x", tags: ["v1.0.0"] };

/** One case per person-only rule, each beside an allowed neighbour. The repository is on `feat/x`, tag `v1.0.0`. */
const MATRIX: readonly (readonly [command: string, rule: string | null])[] = [
  ["git push --force origin feat/x", "force-push"],
  ["git push -u origin feat/x", null],
  ["git push origin HEAD:main", "push-default"],
  ["git push origin HEAD:refs/heads/stamity/2026-10-16_x", null],
  ["git push origin v1.0.0", "push-tags"],
  ["git push origin v9.9.9", null],
  ["git push origin --delete feat/old", "push-delete"],
  ["git tag v2", "tag"],
  ["git tag -l", null],
  ["gh pr merge 3 --squash", "pr-merge"],
  ["gh pr ready 3", "pr-ready"],
  ["gh pr view 3", null],
  ["gh release create v2", "release"],
  ["gh release view v1", null],
  ["npm publish", "publish"],
  ["npm test", null],
  ["gh secret set TOKEN", "secrets"],
  ["gh api -X PUT repos/o/r/branches/main/protection", "protection"],
];

describe("the person-only guard, on every client", () => {
  it.each(TOOLS)("%s: denies each person-only act and allows its neighbour, as u6's verdict says", async (tool) => {
    const guard = await placeGuard(tool, { ".git/refs/tags/v1.0.0": "0".repeat(40) });
    for (const [command, rule] of MATRIX) {
      const source = personOnlyVerdict(command, ON_FEATURE);
      expect(source.deny ? source.rule : null, command).toBe(rule);
      const decision = decide(tool, guard, command);
      expect(decision.deny, `${tool}: ${command}`).toBe(rule !== null);
      if (decision.deny && source.deny) expect(decision.reason, command).toContain(source.reason);
    }
  });

  it.each(TOOLS)("%s: allows a call that is not a shell call at once", async (tool) => {
    const guard = await placeGuard(tool);
    const read = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "git push --force" } });
    const result = run(guard, read);
    expect(result.status).toBe(0);
    expect(String(result.stdout).trim()).toBe(tool === "cursor" ? '{"permission":"allow"}' : "");
  });

  it.each(TOOLS)("%s: fails closed on a payload it cannot read", async (tool) => {
    const guard = await placeGuard(tool);
    const decisions = ["{not json", JSON.stringify({ tool_name: "Bash", tool_input: {} })].map((input) => {
      const result = run(guard, input);
      return tool === "claude" || tool === "codex" ? result.status : String(result.stdout);
    });
    for (const decision of decisions) expect(decision).toEqual(tool === "claude" || tool === "codex" ? 2 : expect.stringContaining("deny"));
  });
});

describe("the branch context read from .git", () => {
  it("denies a refspec-less push on main and allows it on a feature branch", async () => {
    const onMain = await placeGuard("claude", { ".git/HEAD": "ref: refs/heads/main\n" });
    expect(decide("claude", onMain, "git push").deny).toBe(true);
    expect(decide("claude", onMain, "git push origin HEAD").deny).toBe(true);
    const onFeature = await placeGuard("claude", { ".git/HEAD": "ref: refs/heads/feat/x\n" });
    expect(decide("claude", onFeature, "git push").deny).toBe(false);
  });

  it("reads the default branch from origin's HEAD and the tags from packed-refs", async () => {
    const guard = await placeGuard("claude");
    expect(decide("claude", guard, "git push origin trunk").deny).toBe(false);
    expect(decide("claude", guard, "git push origin v3.0.0").deny).toBe(false);
    await getRepo().seedFiles({
      ".git/refs/remotes/origin/HEAD": "ref: refs/remotes/origin/trunk\n",
      ".git/packed-refs": `# pack-refs with: peeled fully-peeled sorted\n${"a".repeat(40)} refs/tags/v3.0.0\n^${"b".repeat(40)}\n`,
    });
    expect(decide("claude", guard, "git push origin trunk")).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    expect(decide("claude", guard, "git push origin v3.0.0")).toMatchObject({ deny: true, reason: expect.stringContaining("push-tags") });
  });

  it("follows a worktree's gitdir file to its HEAD, and its commondir to the tags", async () => {
    const guard = await placeGuard("claude", {
      ".git": "gitdir: main/.git/worktrees/lane\n",
      "main/.git/worktrees/lane/HEAD": "ref: refs/heads/main\n",
      "main/.git/worktrees/lane/commondir": "../..\n",
      "main/.git/refs/tags/lane/v1": "0".repeat(40),
    });
    expect(decide("claude", guard, "git push").deny).toBe(true);
    expect(decide("claude", guard, "git push origin lane/v1").deny).toBe(true);
    expect(decide("claude", guard, "git push origin lane/v2").deny).toBe(false);
  });

  it("counts main and master alone when .git cannot be read", async () => {
    const guard = await placeGuard("claude", { ".git": "not a pointer\n" });
    expect(decide("claude", guard, "git push origin master").deny).toBe(true);
    expect(decide("claude", guard, "git push").deny).toBe(false);
  });
});

/** A run record's head, as `/st-work` and `/st-debug` open one. */
function record(status: string, mode?: "attended" | "unattended"): string {
  return `# Run\n\nStatus: ${status}\nPlan: docs/plans/x.md\n${mode === undefined ? "" : `Mode: ${mode}\n`}Invocation: /st-work x\n`;
}

const RAW_PUSH = "git push origin HEAD:refs/heads/x";
const RUN_END = "npx --no stamity run end --run x";

describe("the unattended push rule, the mode read from the run records", () => {
  it("denies a raw push and gh pr create while an unattended run is in progress, and allows the run verb", async () => {
    const guard = await placeGuard("claude");
    // Non-degenerate: with no record the same push passes.
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_x/record.md": record("in progress", "unattended") });
    for (const command of [RAW_PUSH, "gh pr create --draft --fill"]) {
      const source = unattendedPushVerdict(command);
      expect(source.deny, command).toBe(true);
      if (source.deny) expect(decide("claude", guard, command)).toEqual({ deny: true, reason: expect.stringContaining(source.reason) });
    }
    expect(decide("claude", guard, RUN_END).deny).toBe(false);
  });

  it("reads a debug round's record too", async () => {
    const guard = await placeGuard("claude", {
      ".stamity/runs/2026-10-16_debug-flake/record.md": record("in progress", "unattended"),
    });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(true);
  });

  it("stays unattended when an attended record opens beside an unattended one, and lets a closed one go", async () => {
    const guard = await placeGuard("claude", {
      ".stamity/runs/2026-10-15_night/record.md": record("in progress", "unattended"),
      ".stamity/runs/2026-10-16_walk/record.md": record("in progress", "attended"),
    });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(true);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-15_night/record.md": record("done", "unattended") });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
  });

  it("reads the 50 newest run folders only", async () => {
    const files: Record<string, string> = { ".stamity/runs/2026-01-01_old/record.md": record("in progress", "unattended") };
    for (let day = 1; day <= 50; day += 1) {
      files[`.stamity/runs/2026-09-${String(day).padStart(2, "0")}_r${day}/record.md`] = record("done", "unattended");
    }
    const guard = await placeGuard("claude", files);
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
    await getRepo().seedFiles({ ".stamity/runs/2026-09-01_r1/record.md": record("in progress", "unattended") });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(true);
  });

  it("lets STAMITY_UNATTENDED govern a run with no Mode: line, and never an attended one", async () => {
    const guard = await placeGuard("claude");
    expect(decide("claude", guard, RAW_PUSH, { STAMITY_UNATTENDED: "1" }).deny).toBe(true);
    for (const off of ["", "0", "false"]) expect(decide("claude", guard, RAW_PUSH, { STAMITY_UNATTENDED: off }).deny, off).toBe(false);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_old/record.md": record("in progress") });
    expect(decide("claude", guard, RAW_PUSH, { STAMITY_UNATTENDED: "1" }).deny).toBe(true);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_walk/record.md": record("in progress", "attended") });
    expect(decide("claude", guard, RAW_PUSH, { STAMITY_UNATTENDED: "1" }).deny).toBe(false);
  });
});

describe("the mode read when a record cannot be", () => {
  // A permission bit is the real failure here; Windows and root ignore it, so the case runs where it holds.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "refuses a raw push, naming the code and the record, when a run record cannot be read",
    async () => {
      const guard = await placeGuard("claude", { ".stamity/runs/2026-10-16_x/record.md": record("in progress", "attended") });
      expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
      chmodSync(getRepo().path(".stamity", "runs", "2026-10-16_x", "record.md"), 0o000);
      expect(decide("claude", guard, RAW_PUSH)).toEqual({ deny: true, reason: expect.stringMatching(/EACCES on .*record\.md/) });
      chmodSync(getRepo().path(".stamity", "runs", "2026-10-16_x", "record.md"), 0o644);
    },
  );
});

describe("the hooks canary", () => {
  it("writes the canary when the command names the pre-flight, and allows the call", async () => {
    const guard = await placeGuard("cursor");
    const canary = getRepo().path(...PREFLIGHT_CANARY_FILE.split("/"));
    expect(decide("cursor", guard, "npm test").deny).toBe(false);
    expect(existsSync(canary)).toBe(false);
    const before = Date.now();
    expect(decide("cursor", guard, "npx --no stamity gate preflight --unattended --json").deny).toBe(false);
    const at = Date.parse((JSON.parse(readFileSync(canary, "utf8")) as { at: string }).at);
    expect(at).toBeGreaterThanOrEqual(before - 1_000);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("is ignored by git, named in the setup line, and never carried into a worktree", () => {
    expect(PREFLIGHT_CANARY_FILE).toBe(".stamity/preflight-canary.json");
    expect(REQUIRED_GITIGNORE_ENTRIES).toContain(PREFLIGHT_CANARY_FILE);
    const line = gitignoreLine({ dryRun: false, entries: [PREFLIGHT_CANARY_FILE], mcpConfigured: false });
    expect(line).toContain(`${PREFLIGHT_CANARY_FILE} (the shell guard's hooks canary)`);
    const policy = parseWorktreePolicy(
      JSON.stringify({ version: 1, entries: [{ path: ".stamity", strategy: "copy" }] }),
      "/repo/.stamity/worktree.json",
    );
    expect(resolveStrategy(policy, ".stamity/manifest.json")).toBe("copy");
    expect(resolveStrategy(policy, PREFLIGHT_CANARY_FILE)).toBe("skip");
    const named = parseWorktreePolicy(
      JSON.stringify({ version: 1, entries: [{ path: PREFLIGHT_CANARY_FILE, strategy: "copy" }] }),
      "/repo/.stamity/worktree.json",
    );
    expect(() => assertRulesAdmissible(named, () => "ignored")).toThrow(/hooks canary/);
  });
});

describe("the guard's place in the plan", () => {
  it("is rendered only when asked for, so the default plan and its wiring stay as they were", () => {
    for (const tool of TOOLS) {
      const plain = planCoreHookScripts(POLICY, tool, CLI_PIN).map((script) => script.fileName);
      expect(plain, tool).not.toContain(PERSON_ONLY_GUARD_FILE);
      const asked = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true });
      expect(asked.map((script) => script.fileName), tool).toEqual([...plain, PERSON_ONLY_GUARD_FILE]);
      expect(asked.at(-1)?.event, tool).toBe("pre_tool_use");
    }
  });

  it("carries u6's two verdicts as their source, and reaches for no network, shell or evaluation", () => {
    for (const tool of TOOLS) {
      const content = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true }).at(-1)?.content ?? "";
      expect(content).toContain(personOnlyVerdict.toString());
      expect(content).toContain(unattendedPushVerdict.toString());
      expect(content).toMatch(/^#!\/usr\/bin\/env node\n\/\* eslint-disable \*\/\n/);
      for (const token of ["http://", "https://", "fetch(", "child_process", "new Function"]) expect(content).not.toContain(token);
      expect(content).not.toMatch(/\beval\s*\(/);
    }
  });
});
