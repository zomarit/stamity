import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeCliFixture, type CliFixture } from "../support/cliHarness.ts";
import { ensureDistBuilt } from "../support/distBuild.ts";
import { tsRepoFiles } from "../support/repoFixtures.ts";

/**
 * review/217: the person-only guard as shipped. What a user receives is the guard the BUILT bundle renders — both
 * verdicts embedded as the dist bundle's `Function.toString()` text — while `personOnlyGuard.test.ts` executes the
 * rendering vitest's transform produces. So this file runs `init --tools claude -y` through `node dist/cli.js`
 * (cliHarness `entry: "dist"`) into a temporary repository, then spawns the guard that run wrote, the way Claude Code
 * runs it: a fresh process, the payload on stdin. A bundler change that breaks an embedded function makes the guard
 * throw at call time and fail closed, which the allowed row turns red, and the denied row reads its refusal's text,
 * so a fail-closed refusal does not pass for the rule's.
 *
 * Nothing is stubbed: the build, the CLI, the git repository and the guard are real. The build precondition is
 * `ensureDistBuilt` (absent-only; the verify step runs `npm run build` first). Git-less machines skip per the harness
 * convention.
 */

/** Per-case budget: one cold dist `init` over a one-client tree, plus two guard spawns. */
const CASE_TIMEOUT_MS = 120_000;

/**
 * Where emission writes Claude Code's guard, relative to the repository.
 * TEST CHANGE, justified (u5-hook-copies, plan 018 file 2, REQ-FLOW-088): the copy under `.claude/hooks/stamity/`,
 * the one Claude Code's hook entries run; the generated Claude folder is no longer written.
 */
const GUARD_PATH = [".claude", "hooks", "stamity", "stamity-person-only-guard.mjs"];

/** Claude Code's PreToolUse payload for a Bash call. */
function payload(command: string): string {
  return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
}

/**
 * Runs the guard as Claude Code does, unattended through the variable unless `attended`, with the run's own variables
 * cleared first.
 */
function runGuard(guard: string, command: string, attended = false): ReturnType<typeof spawnSync> {
  const env = { ...process.env };
  delete env.STAMITY_UNATTENDED;
  delete env.STAMITY_REPO_ROOT;
  return spawnSync(process.execPath, [guard], {
    input: payload(command),
    encoding: "utf8",
    env: attended ? env : { ...env, STAMITY_UNATTENDED: "1" },
  });
}

describe("the person-only guard the built bundle renders (review/217)", () => {
  beforeAll(async () => {
    await ensureDistBuilt();
  }, 240_000);

  it("refuses a raw push and allows a git read, unattended, on Claude Code", { timeout: CASE_TIMEOUT_MS }, async (ctx) => {
    let fixture: CliFixture;
    try {
      fixture = await makeCliFixture({ seed: tsRepoFiles(), git: true, entry: "dist" });
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") ctx.skip();
      throw error;
    }
    try {
      const init = await fixture.run(["init", "--tools", "claude", "-y"]);
      expect(init.code, `init failed:\n${init.stderr}`).toBe(0);
      const guard = join(fixture.repoDir, ...GUARD_PATH);
      expect(existsSync(guard), guard).toBe(true);

      // Denied: the person-only verdict lets the push through, and the unattended rule refuses it, naming the run verbs;
      // a guard whose embedded verdicts throw refuses with "could not decide" instead.
      const denied = runGuard(guard, "git push origin HEAD:refs/heads/x");
      expect(String(denied.stdout).trim()).toBe("");
      expect(denied.status, String(denied.stderr)).toBe(2);
      expect(String(denied.stderr)).toContain("stamity run checkpoint");
      expect(String(denied.stderr)).not.toContain("could not decide");

      // Allowed: the same session, a read that both verdicts read through and pass.
      const allowed = runGuard(guard, "git status");
      expect(allowed.status, String(allowed.stderr)).toBe(0);
      expect(String(allowed.stdout).trim()).toBe("");
      expect(String(allowed.stderr)).toBe("");

      // v0b (REQ-FLOW-121): unattended, the run verb alone passes, and the same verb behind a wrapper is refused by the
      // stand-alone rule as the bundle renders it, not by a fault.
      const alone = runGuard(guard, "npx --no stamity run end --run x");
      expect(alone.status, String(alone.stderr)).toBe(0);
      const wrapped = runGuard(guard, "env -u GIT_EXEC_PATH npx --no stamity run end --run x");
      expect(wrapped.status, String(wrapped.stderr)).toBe(2);
      expect(String(wrapped.stderr)).toContain("on a line that is more than the verb");
      expect(String(wrapped.stderr)).toContain("REQ-FLOW-121");

      // v0a2 (REQ-FLOW-123): attended, a merge asks through Claude Code's hookSpecificOutput on stdout, exit 0, its
      // sentence built by the bundle; unattended, the same merge is refused for the morning list.
      const asked = runGuard(guard, "gh pr merge 1", true);
      expect(asked.status, String(asked.stderr)).toBe(0);
      expect(String(asked.stderr)).toBe("");
      expect(JSON.parse(String(asked.stdout))).toEqual({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason:
            "Merging a pull request (`gh pr merge`) is a person-only act (`pr-merge`): approve it to let the agent run it once (REQ-FLOW-102).",
        },
      });
      const held = runGuard(guard, "gh pr merge 1");
      expect(held.status, String(held.stderr)).toBe(2);
      // TEST CHANGE, justified: REQ-FLOW-143, a4 — the list is named as morning.md
      expect(String(held.stderr)).toContain("this run is unattended: list it on the run's summary list (`morning.md`)");

      // The settings the bundle wrote carry both lists (REQ-FLOW-025): the refused rows and the rows that ask.
      const settings = JSON.parse(readFileSync(join(fixture.repoDir, ".claude", "settings.json"), "utf8")) as {
        permissions?: { deny?: string[]; ask?: string[] };
      };
      expect(settings.permissions?.deny).toContain("Bash(git push --force:*)");
      expect(settings.permissions?.ask).toContain("Bash(gh pr merge:*)");
      expect(settings.permissions?.deny).not.toContain("Bash(gh pr merge:*)");
    } finally {
      await fixture.cleanup();
    }
  });
});
