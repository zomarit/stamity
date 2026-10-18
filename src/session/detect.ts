/**
 * The one session detector (REQ-FLOW-085, REQ-PROVE-039): which cloud or CI
 * session an environment's markers name. The CLI's pre-flight reads its
 * `client` and `cloud` fields and Cursor's egress warning through
 * {@link detectSession}, and the emitted session start, with Cursor's
 * context-once script, carries {@link matchSessions} as its own source
 * (`../hooks/scripts.ts`), so the two never disagree on what a marker means.
 *
 * **Set.** A marker counts when it is set to a value other than `""`, `"false"`
 * and `"0"`, and to its row's `equals` where one is given: `CLAUDE_CODE_REMOTE`
 * counts only as exactly `true`, so `1` names no cloud. A value is compared,
 * never trimmed or folded, and never returned: the result holds marker names.
 *
 * **Order.** The first row that matches names the session, in the order
 * Claude Code's cloud, Copilot's cloud agent, a Cursor agent machine, CI: a
 * cloud runs inside CI more often than the reverse, so the cloud wins.
 *
 * **Only a label.** A marker is an environment variable anyone can set, so the
 * detector only names a session: it never selects an unattended run, which is
 * a declaration (REQ-FLOW-089), and it grants nothing.
 *
 * Pure: no imports, no filesystem, no process.
 */

/** The sessions the detector names; `local` when no marker counts. */
export type SessionKind = "claude-cloud" | "copilot-cloud" | "cursor-agent" | "ci" | "local";

/** An environment as the detector reads it. */
export type SessionEnv = Readonly<Record<string, string | undefined>>;

/** One session's markers: any of `vars` set names it; `equals`, where given, is the one value that counts. */
export interface SessionMarkerRow {
  readonly kind: Exclude<SessionKind, "local">;
  readonly vars: readonly string[];
  readonly equals?: string;
}

/** What {@link detectSession} returns: the first session by order, and every marker that counted, by name. */
export interface DetectedSession {
  readonly kind: SessionKind;
  readonly markers: readonly string[];
}

/** The markers, in priority order. */
export const SESSION_MARKERS: readonly SessionMarkerRow[] = [
  { kind: "claude-cloud", vars: ["CLAUDE_CODE_REMOTE"], equals: "true" },
  { kind: "copilot-cloud", vars: ["COPILOT_AGENT_PROMPT"] },
  { kind: "cursor-agent", vars: ["CURSOR_AGENT_SOCKET"] },
  { kind: "ci", vars: ["CI", "GITHUB_ACTIONS"] },
];

/**
 * Every row with at least one marker set, in the rows' order, each with the
 * names of its markers that counted. Embedded as source in the session start,
 * so the body names no binding outside it and declares no named inner function.
 */
export function matchSessions<Row extends { readonly vars: readonly string[]; readonly equals?: string }>(
  rows: readonly Row[],
  env: SessionEnv,
): { row: Row; markers: string[] }[] {
  const matches: { row: Row; markers: string[] }[] = [];
  for (const row of rows) {
    const markers = row.vars.filter((name) => {
      const value = env[name];
      return (
        typeof value === "string" &&
        value !== "" &&
        value !== "false" &&
        value !== "0" &&
        (row.equals === undefined || value === row.equals)
      );
    });
    if (markers.length > 0) matches.push({ row, markers });
  }
  return matches;
}

/** The session `env` names: the first match's kind, or `local`, and every marker that counted. */
export function detectSession(env: SessionEnv): DetectedSession {
  const matches = matchSessions(SESSION_MARKERS, env);
  return { kind: matches[0]?.row.kind ?? "local", markers: matches.flatMap((match) => match.markers) };
}
