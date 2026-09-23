/**
 * The agent tool-policy roster: exactly one grant per shipped agent, and the
 * data half of the deny-by-default authorization the engine already
 * implements. Zero-import kernel data module.
 *
 * `src/tools/allowlist.ts` ships the mechanism and deliberately no roster —
 * which agents exist, and what each may do, is content. This module is that
 * content, in the form the ONE live reader takes: the emitted policy document,
 * serialized by `buildAgentToolPoliciesJson` and written through
 * `src/emit/hooksInfra.ts`, which the generated pre-tool-use guard parses once
 * the engine no longer sits in front of the agent.
 *
 * The in-process half is BUILT BUT UNWIRED. `checkToolAccess` is the check at
 * the delegation boundary these rows were also written for, and it has zero
 * production call sites — this repo's suite is the only thing that calls it.
 * This header used to name it as a second reader, which is the claim an
 * operator would price as defence-in-depth while the generated guard script
 * was in fact the whole of it. A row here buys one grant with one reader, on a
 * client that guard can fail open on. `test/roster/agentPolicies.test.ts` pins
 * the wording to the call graph, so wiring the check fails the suite until the
 * header follows it.
 *
 * Ids are the RUNTIME form. Corpus frontmatter carries bare ids (`reviewer`)
 * because the catalog strips the filename prefix before registering an
 * artifact; the guard governs the prefixed namespace it sees on the wire
 * (`stamity-reviewer`) and treats anything outside that prefix as not this
 * setup's to police. A bare id here would match nothing at runtime while
 * reading like a configured grant, so rows carry the prefix and the corpus
 * parity check compares across it.
 *
 * Every row mirrors its agent file's `capabilities:` frontmatter exactly.
 * Adding an agent is therefore two edits — one file under `content/agents/`,
 * one row here — and the corpus parity test is what enforces the
 * pair, because skipping the row is not a smaller grant but a silent lockout:
 * the guard answers `NO_POLICY` and the agent may use nothing, while its
 * corpus file still reads as shipped.
 *
 * `spawn` is ungranted on every row, and that is a decision rather than an
 * omission. Commands orchestrate from the main thread, so delegation depth
 * stays 1 and no shipped agent body delegates; `spawn` is also the one
 * category whose blast radius is not bounded by the tools it names, since a
 * spawned agent carries its own grant. It gets added the day an agent body
 * actually delegates — consciously, on that agent's row, and never by copying
 * a neighbouring one.
 *
 * `denyTools` is unused for a related reason: it is the escape hatch for one
 * dangerous member of an otherwise needed category, and no grant here is in
 * that position — the single `network` row belongs to the agent whose whole
 * job is fetching. An empty escape hatch is a statement about these grants,
 * not an oversight.
 *
 * The row shape below mirrors `AgentToolPolicy` from `src/tools/allowlist.ts`
 * structurally instead of importing it, because `src/roster/` may import only
 * `src/types/` — a boundary held by both the oxlint kernel override and
 * `test/architecture/boundaries.test.ts`, and one an `import type` would
 * break just as an import would. `test/roster/agentPolicies.test.ts` binds the
 * two ends instead: the roster must stay assignable to
 * `readonly AgentToolPolicy[]`, and the grantable vocabulary must equal the
 * engine's functional categories, so a taxonomy change fails there rather than
 * at a call site.
 */

/**
 * The categories a row may grant — the engine's functional tool categories,
 * mirrored per the module header. Reserved categories are absent by
 * construction: no policy can grant one, so a row here cannot even spell a
 * grant the emitter would strip back out.
 */
export const GRANTABLE_TOOL_CATEGORIES = [
  "read",
  "edit",
  "execute",
  "network",
  "spawn",
  "planning",
] as const;

export type GrantableToolCategory = (typeof GRANTABLE_TOOL_CATEGORIES)[number];

/** One agent's grant: the structural mirror of `AgentToolPolicy`, narrowed to grantable categories. */
export interface AgentPolicyRow {
  /**
   * Runtime (prefixed) agent id, matched exactly by the one live reader: the
   * emitted policy document the generated guard parses. `checkToolAccess`
   * matches the same way and nothing in production calls it — see the header.
   */
  readonly agentId: string;
  /** Categories this agent may use. Everything else denies. */
  readonly allow: readonly GrantableToolCategory[];
  /** Client-native tool names denied regardless of category — unused, see the module header. */
  readonly denyTools?: readonly string[];
  /**
   * Repo-relative patterns this agent may create or overwrite with the client's
   * single-file `Write` tool only — never `Edit`, `NotebookEdit` or the `edit`
   * category, which {@link allow} still withholds. Honoured only by the
   * generated Claude Code guard in the repository layout; ignored by every
   * other reader, so a reader unaware of the field denies the write through the
   * category. Absent on every row but the four verdict roles'.
   */
  readonly writePaths?: readonly string[];
  /** Why this agent holds this grant, in its own terms. Read by operators auditing privilege. */
  readonly rationale: string;
}

/**
 * The report files one verdict role may write: its own, in any run, and no
 * other role's. One pattern per role rather than one for the whole folder, so
 * a verdict role steered by text in the code under review cannot overwrite
 * another role's findings before they reach the ledger.
 *
 * The isolation between roles is enforced by the generated guard's round-number
 * rule, not by the pass slug: in a pattern's final segment the LAST `*` — the
 * round, just before `.md` — matches ASCII digits only, so `*-reviewer-r*.md`
 * admits `<pass>-reviewer-r<N>.md` and never a name in which another role's
 * token follows `-reviewer-r`, even when the pass slug itself holds a role
 * token. The rule's precondition is that no role token is a suffix of another:
 * `-reviewer-r`, `-security-r`, `-performance-r` and `-design-quality-r` today.
 * A future role such as `quality` would collide with `design-quality`, so adding
 * a role re-checks this precondition. The rule's limit: the round takes the
 * LONGEST trailing digit run, so a pattern whose piece just before that last `*`
 * ends in a digit (`*-v2*.md`) matches nothing; every role token here ends in
 * `-r`, so no pattern this returns has one.
 */
export function verdictReportWritePaths(
  role: "reviewer" | "security" | "performance" | "design-quality",
): readonly string[] {
  return [`.stamity/runs/*/reports/*-${role}-r*.md`];
}

/** Longest pattern the grammar admits, in UTF-16 code units. */
const MAX_WRITE_PATH_CHARS = 200;

/** Most `/`-separated segments a pattern may have. */
const MAX_WRITE_PATH_SEGMENTS = 16;

/** One segment's alphabet. `*` matches within its own segment only. */
const WRITE_PATH_SEGMENT = /^[A-Za-z0-9._*-]+$/;

/**
 * Whether a value is a write-path pattern the generated guard can read
 * unambiguously: a string of 1–200 characters splitting on `/` into 1–16
 * segments, each non-empty, neither `.` nor `..`, and drawn from letters,
 * digits, `.`, `_`, `-` and `*`.
 *
 * That alphabet is what rules out the escapes by construction — no `\`, no
 * drive letter (`:`), no leading `/` (an empty first segment). `*` may appear
 * more than once in a segment, but never twice in a row: no reader may take a
 * `**` for a match across directories. Typed over `unknown` because a roster
 * is data, whatever it was typed as on the way in.
 *
 * It lives beside the rows rather than beside the emitter so that both readers
 * of a row's `writePaths` — the policy-document emitter in
 * `src/tools/allowlist.ts` and the grant resolver in `./agentGrants.ts`, which
 * the kernel boundary keeps from importing `src/tools/` — filter through the
 * one grammar, and no renderer is handed a pattern the document drops.
 */
export function isWritePathPattern(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_WRITE_PATH_CHARS) return false;
  if (value.includes("**")) return false;
  const segments = value.split("/");
  if (segments.length > MAX_WRITE_PATH_SEGMENTS) return false;
  return segments.every(
    (segment) => segment !== "." && segment !== ".." && WRITE_PATH_SEGMENT.test(segment),
  );
}

/**
 * The shipped roster, ordered as the flow uses it: the four spine agents, the
 * three that support them, then the three trigger-conditional specialists.
 * Order is presentation only — the emitted policy document sorts by id, and
 * every reader looks a row up by id rather than by position.
 */
export const AGENT_POLICY_ROSTER: readonly AgentPolicyRow[] = [
  {
    agentId: "stamity-researcher",
    allow: ["read", "network"],
    rationale:
      "Answers briefs against the codebase and, at its widest tool tier, vendor docs and the web, so it reads and it fetches. It creates no files — every artifact belongs to the flow that spawned it — which is why no edit grant appears here.",
  },
  {
    agentId: "stamity-implementer",
    allow: ["read", "edit", "execute"],
    rationale:
      "Builds one planned unit: reads the surrounding code, writes the unit's files and their tests, and runs the gate commands whose output it must return as evidence. Execute covers that gate run and nothing further; it is not a path to another agent.",
  },
  {
    agentId: "stamity-reviewer",
    allow: ["read"],
    writePaths: verdictReportWritePaths("reviewer"),
    rationale:
      "Returns a verdict on a change set it must not touch, citing path:line for every behavior claim it makes. Withholding edit is what keeps the following round reviewing the author's work instead of the reviewer's own. Its single file write is the review report it saves for the run.",
  },
  {
    agentId: "stamity-fixer",
    allow: ["read", "edit", "execute"],
    rationale:
      "Applies the minimal fix for one review round's Critical and Warning findings, then re-runs the gates that fix has to clear. Same surface as the implementer, bounded by a finding list rather than by a unit brief.",
  },
  {
    agentId: "stamity-test-runner",
    allow: ["read", "execute"],
    rationale:
      "Runs the declared gate commands and returns their structured results. Independence from whoever wrote the change is the entire point of the role, so it inspects the tree and executes commands but never edits what it is grading.",
  },
  {
    agentId: "stamity-spec-author",
    allow: ["read", "edit"],
    rationale:
      "Writes specs, plans, decision records and docs after reading the code and history they describe. No execute: authoring needs no shell, and a spec pass able to run commands drifts into the implementation it exists to specify.",
  },
  {
    agentId: "stamity-creator",
    allow: ["read", "edit"],
    rationale:
      "Authors one user artifact per invocation under the overrides tree, reading the bundled corpus to match its shape. The engine owns the save gates, so clearing them costs no shell — inspecting and writing are the whole job.",
  },
  {
    agentId: "stamity-security",
    allow: ["read"],
    writePaths: verdictReportWritePaths("security"),
    rationale:
      "Judges authentication, cryptography, trust boundaries and the dependency set on triggered paths, quoting locations for each defect it names. No code write grant: those surfaces are where an unexamined edit costs most, and the repair belongs to a later pass under its own review. Only its own findings report may be saved.",
  },
  {
    agentId: "stamity-design-quality",
    allow: ["read"],
    writePaths: verdictReportWritePaths("design-quality"),
    rationale:
      "Measures rendered surfaces against named success criteria and the project's token source, so its output is numbers rather than preferences. Inspection alone — nudging a spacing value while judging it would make one pass both author and judge of the same pixel. The lone file it creates is that measurement report.",
  },
  {
    agentId: "stamity-performance",
    allow: ["read"],
    writePaths: verdictReportWritePaths("performance"),
    rationale:
      "Weighs cost per operation against declared budgets across data-access, background-work and cache paths. Nothing beyond inspection: an agent tuning what it measures forfeits the independence that makes the measurement worth reading, and tuning is the implementer's lane. Keeping its budget report on disk is the exception.",
  },
];

/**
 * The rostered agent ids, in roster order — derived, never restated, so the
 * two can not disagree. For consumers that need the id set (emission naming,
 * corpus parity, docs) rather than the grants themselves.
 */
export const RUNTIME_AGENT_IDS: readonly string[] = AGENT_POLICY_ROSTER.map((row) => row.agentId);
