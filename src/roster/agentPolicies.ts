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
  /** Why this agent holds this grant, in its own terms. Read by operators auditing privilege. */
  readonly rationale: string;
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
    rationale:
      "Returns a verdict on a change set it must not touch, citing path:line for every behavior claim it makes. Withholding edit is what keeps the following round reviewing the author's work instead of the reviewer's own.",
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
    rationale:
      "Judges authentication, cryptography, trust boundaries and the dependency set on triggered paths, quoting locations for each defect it names. No write grant: those surfaces are where an unexamined edit costs most, and the repair belongs to a later pass under its own review.",
  },
  {
    agentId: "stamity-design-quality",
    allow: ["read"],
    rationale:
      "Measures rendered surfaces against named success criteria and the project's token source, so its output is numbers rather than preferences. Inspection alone — nudging a spacing value while judging it would make one pass both author and judge of the same pixel.",
  },
  {
    agentId: "stamity-performance",
    allow: ["read"],
    rationale:
      "Weighs cost per operation against declared budgets across data-access, background-work and cache paths. Nothing beyond inspection: an agent tuning what it measures forfeits the independence that makes the measurement worth reading, and tuning is the implementer's lane.",
  },
];

/**
 * The rostered agent ids, in roster order — derived, never restated, so the
 * two can not disagree. For consumers that need the id set (emission naming,
 * corpus parity, docs) rather than the grants themselves.
 */
export const RUNTIME_AGENT_IDS: readonly string[] = AGENT_POLICY_ROSTER.map((row) => row.agentId);
