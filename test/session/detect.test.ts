import { describe, expect, it } from "vitest";
// @ts-expect-error — import-safe native ESM CI helper with no type declarations, outside the product package.
import { PROFILES } from "../../scripts/ci/cloud-leg.mjs";
import { buildContextOnceScript, buildSessionStartScript } from "../../src/hooks/scripts.ts";
import { detectSession, matchSessions, SESSION_MARKERS, type SessionKind } from "../../src/session/detect.ts";

/**
 * v8-detect-translator (REQ-FLOW-085, REQ-PROVE-039): one session detector the CLI and the emitted session start share.
 * Pure module, no filesystem and no process: an environment is a plain object here, so no double stands in for
 * anything.
 */

/** Every marker the detector reads, with the kind it names alone and a value that counts. */
const MARKERS: readonly (readonly [string, string, Exclude<SessionKind, "local">])[] = [
  ["CLAUDE_CODE_REMOTE", "true", "claude-cloud"],
  ["COPILOT_AGENT_PROMPT", "fix the flaky test", "copilot-cloud"],
  ["CURSOR_AGENT_SOCKET", "/tmp/cursor-agent.sock", "cursor-agent"],
  ["CI", "true", "ci"],
  ["GITHUB_ACTIONS", "true", "ci"],
];

/** Every subset of the markers, each set to a value that counts. */
function everyCombination(): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (let mask = 0; mask < 1 << MARKERS.length; mask += 1) {
    out.push(Object.fromEntries(MARKERS.filter((_, index) => (mask & (1 << index)) !== 0).map(([name, value]) => [name, value])));
  }
  return out;
}

describe("detectSession", () => {
  it.each(MARKERS)("names %s=%s alone as its session", (name, value, kind) => {
    expect(detectSession({ [name]: value })).toEqual({ kind, markers: [name] });
  });

  it("reads no marker as a local session", () => {
    expect(detectSession({})).toEqual({ kind: "local", markers: [] });
    expect(detectSession({ PATH: "/usr/bin", HOME: "/home/a", CLAUDECODE: "1" })).toEqual({ kind: "local", markers: [] });
  });

  it("counts no marker set to \"\", \"false\" or \"0\", or unset", () => {
    for (const [name] of MARKERS) {
      for (const value of ["", "false", "0", undefined]) {
        expect(detectSession({ [name]: value }), `${name}=${String(value)}`).toEqual({ kind: "local", markers: [] });
      }
    }
  });

  it("counts CLAUDE_CODE_REMOTE only as exactly true", () => {
    for (const value of ["1", "TRUE", "True", "yes", " true"]) {
      expect(detectSession({ CLAUDE_CODE_REMOTE: value }), value).toEqual({ kind: "local", markers: [] });
    }
    // A false Claude marker beside a CI one leaves the CI one standing.
    expect(detectSession({ CLAUDE_CODE_REMOTE: "1", CI: "true" })).toEqual({ kind: "ci", markers: ["CI"] });
  });

  it("names Claude Code's cloud over the CI it runs in, and lists both markers", () => {
    expect(detectSession({ CI: "true", CLAUDE_CODE_REMOTE: "true" })).toEqual({
      kind: "claude-cloud",
      markers: ["CLAUDE_CODE_REMOTE", "CI"],
    });
  });

  it("takes the first session in the order Claude Code, Copilot, Cursor, CI", () => {
    const all = Object.fromEntries(MARKERS.map(([name, value]) => [name, value]));
    expect(detectSession(all)).toEqual({
      kind: "claude-cloud",
      markers: ["CLAUDE_CODE_REMOTE", "COPILOT_AGENT_PROMPT", "CURSOR_AGENT_SOCKET", "CI", "GITHUB_ACTIONS"],
    });
    expect(detectSession({ CURSOR_AGENT_SOCKET: "/s", COPILOT_AGENT_PROMPT: "p", GITHUB_ACTIONS: "true" }).kind).toBe("copilot-cloud");
    expect(detectSession({ CI: "true", CURSOR_AGENT_SOCKET: "/s" }).kind).toBe("cursor-agent");
  });

  it("only labels: never unattended, never a value, over every combination of markers", () => {
    const kinds = new Set(["claude-cloud", "copilot-cloud", "cursor-agent", "ci", "local"]);
    for (const env of everyCombination()) {
      const result = detectSession(env);
      expect(Object.keys(result).toSorted(), JSON.stringify(env)).toEqual(["kind", "markers"]);
      expect(kinds.has(result.kind), JSON.stringify(env)).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/unattended/i);
      // The markers are names only: no value the environment spells reaches the result.
      for (const value of Object.values(env)) if (value !== "true") expect(JSON.stringify(result)).not.toContain(value);
      expect(result.markers.toSorted()).toEqual(Object.keys(env).toSorted());
    }
  });

  it("names the cloud of each container-leg profile (REQ-PROVE-039)", () => {
    const expected: Readonly<Record<string, SessionKind>> = {
      claude: "claude-cloud",
      cursor: "cursor-agent",
      copilot: "copilot-cloud",
      offline: "claude-cloud",
    };
    const profiles = PROFILES as readonly { id: string; env: Readonly<Record<string, string>> }[];
    expect(profiles.map((profile) => profile.id).toSorted()).toEqual(Object.keys(expected).toSorted());
    for (const profile of profiles) expect(detectSession(profile.env).kind, profile.id).toBe(expected[profile.id]);
  });
});

describe("the detector the session start carries", () => {
  // `new Function` sees the global scope only: a reference to anything this module imports or declares outside the
  // function body throws here, as it would in the emitted script.
  const embedded = new Function(`${matchSessions.toString()}\nreturn matchSessions;`)() as typeof matchSessions;

  it("matches the same rows from the function's own source, over every combination of markers", () => {
    for (const env of everyCombination()) {
      expect(embedded(SESSION_MARKERS, env), JSON.stringify(env)).toEqual(matchSessions(SESSION_MARKERS, env));
    }
    expect(embedded(SESSION_MARKERS, { CLAUDE_CODE_REMOTE: "1" })).toEqual([]);
  });

  it("is inlined into the session start and Cursor's context-once script, not written twice", () => {
    for (const script of [buildSessionStartScript(), buildContextOnceScript()]) {
      expect(script).toContain(`const matchSessions = ${matchSessions.toString()};`);
      expect(script).toContain("matchSessions(SESSIONS, env)");
      expect(script).not.toContain('!["", "false", "0"].includes(value) && (session.equals ?? value) === value');
    }
  });
});
