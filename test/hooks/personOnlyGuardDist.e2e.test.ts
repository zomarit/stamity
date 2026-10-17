import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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

/** Where emission writes Claude Code's guard, relative to the repository. */
const GUARD_PATH = [".stamity", "generated", "hooks", "claude", "stamity-person-only-guard.mjs"];

/** Claude Code's PreToolUse payload for a Bash call. */
function payload(command: string): string {
  return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
}

/** Runs the guard as Claude Code does, unattended through the variable, with the run's own variables cleared first. */
function runGuard(guard: string, command: string): ReturnType<typeof spawnSync> {
  const env = { ...process.env };
  delete env.STAMITY_UNATTENDED;
  delete env.STAMITY_REPO_ROOT;
  return spawnSync(process.execPath, [guard], {
    input: payload(command),
    encoding: "utf8",
    env: { ...env, STAMITY_UNATTENDED: "1" },
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
    } finally {
      await fixture.cleanup();
    }
  });
});
