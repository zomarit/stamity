/**
 * Core closed enums shared engine-wide. Zero-import leaf: const tuples are
 * the single source of truth; each ships a `VALID_*` set for parse-time
 * membership checks and, where a meaningful default exists, a `DEFAULT_*`.
 */

/** Target AI coding tools an adapter can generate a setup for. */
export const TOOLS = ["claude", "cursor", "copilot", "codex"] as const;
export type Tool = (typeof TOOLS)[number];
export const VALID_TOOLS: Set<string> = new Set(TOOLS);

/** System-of-record platform hosting the repo (issues, PRs, CI). */
export type Platform = "github" | "azure-devops" | "gitlab";

/**
 * Project maturity tier — an investment-calibration dial, not a content gate:
 * every tier installs the identical corpus.
 *
 * WHAT THE TIER REACHES. It travels to generated agents as TEXT and only as
 * text: the `${STAMITY:MATURITY_TIER}` token renders the tier name into the
 * emitted charter (`src/emit/substitution.ts`), and an agent reading that line
 * sizes its own investment. ZERO engine branches read the VALUE — no gate
 * changes strictness with it, no content is admitted or withheld by it, and
 * all four tiers are indistinguishable to every code path here. (One branch
 * used to: the removed confidence-floor resolver defaulted an unset floor to
 * `high` at `scaleup` and above. That dial is gone — see the removal note at
 * the foot of this file — so the tier is now a pure text dial.)
 *
 * So the lines below say how deep a tier ASKS a generated agent to invest.
 * They are not four behaviours the engine switches between, and writing them
 * as though they were is how a text dial gets read as a mechanism.
 *
 * - `solo`       — individual developer / hobby project; the shallowest ask.
 * - `team`       — small team, shared repo; asks for review and handoff depth.
 * - `scaleup`    — multi-team org; asks for production-operations depth.
 * - `enterprise` — regulated environment; asks for org-governance depth.
 */
export const MATURITY_TIERS = ["solo", "team", "scaleup", "enterprise"] as const;
export type MaturityTier = (typeof MATURITY_TIERS)[number];
export const VALID_MATURITY_TIERS: Set<string> = new Set(MATURITY_TIERS);
export const DEFAULT_MATURITY_TIER: MaturityTier = "solo";

/**
 * How generated agents are ASKED to talk to the human operator — and, today,
 * are not: the value reaches no generated file.
 *
 * The only renderer is `communicationStyleDirective`
 * (`src/manifest/manifest.ts`), and no emission path calls it; its sole caller
 * is that module's own suite. So the key is settable, validated, persisted and
 * shown by `stamity config`, and an agent never sees it. Recorded here because
 * this is where a reader decides whether setting it changes anything, and the
 * honest answer is that it changes what the manifest carries, not what an
 * agent does.
 *
 * - `plain`     — define jargon on first use; lead with outcomes.
 * - `technical` — precise domain terminology; lead with implementation detail.
 */
export const COMMUNICATION_STYLES = ["plain", "technical"] as const;
export type CommunicationStyle = (typeof COMMUNICATION_STYLES)[number];
export const VALID_COMMUNICATION_STYLES: Set<string> = new Set(COMMUNICATION_STYLES);
export const DEFAULT_COMMUNICATION_STYLE: CommunicationStyle = "plain";

/**
 * What a run does with an agent-instruction file the repository already had
 * at the emitted path. Decided once at init, persisted on the manifest, and
 * honoured by every regeneration — the choice has to outlive the prompt that
 * asked it, or the next `sync` would re-litigate it against the user's file.
 *
 * - `supplement` — keep the file; the generated guidance merges in as a
 *   managed block, every other byte preserved.
 * - `replace`    — back the file up (size + digest verified), then write the
 *   generated document over it.
 * - `skip`       — emit nothing at that path, ever. The file stays the user's,
 *   and it is not recorded in the ledger, so no collision and no reclaim.
 */
export const IMPORT_MODES = ["supplement", "replace", "skip"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];
export const VALID_IMPORT_MODES: Set<string> = new Set(IMPORT_MODES);
export const DEFAULT_IMPORT_MODE: ImportMode = "supplement";

/**
 * The four-class model ladder, ordered strongest to cheapest. A class is a
 * SIZING statement about a role — how much capability the work needs — and
 * never a model id: ids move on the vendor's release cadence, classes do not,
 * so shipped content names the class and the engine projects it per client.
 * `src/roster/modelLadder.ts` owns that projection and the role assignments.
 *
 * There is deliberately no `DEFAULT_MODEL_CLASS`. A role's class comes from
 * its own artifact frontmatter (`model_class:`); a global default would be a
 * sizing decision taken on behalf of an artifact that never declared one, and
 * the honest answer for an artifact with no class is to emit nothing.
 */
export const MODEL_CLASSES = ["frontier", "advanced", "standard", "economy"] as const;
export type ModelClass = (typeof MODEL_CLASSES)[number];
export const VALID_MODEL_CLASSES: Set<string> = new Set(MODEL_CLASSES);

/**
 * How much reasoning a class asks for, on the clients whose dialect has a
 * field for it. Three levels, and only three: this is the band the supported
 * clients share. A client whose own scale is wider still accepts all three, so
 * no per-client translation table is needed — only the key name changes, which
 * is what the per-client projection carries.
 *
 * No `DEFAULT_EFFORT_LEVEL` either: effort is a property of the CLASS, not of
 * the system, so each ladder row carries its own default.
 */
export const EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export const VALID_EFFORT_LEVELS: Set<string> = new Set(EFFORT_LEVELS);

/*
 * There is deliberately no team-size axis here.
 *
 * `teamSize` shipped as a type, a manifest field, a `config` key, an
 * `--team-size` init flag, a migration carry, and a documented "content
 * selection" behaviour — with zero consumers. Nothing read it; content
 * admission is decided by ids, tags, and language filters
 * (`src/content/selection.ts`), and the docs described an effect the engine
 * never had. The spec bans the lever by name.
 *
 * {@link MATURITY_TIERS} stays, and its reach is smaller than its own doc used
 * to claim: it renders into the emitted charter through the
 * `${STAMITY:MATURITY_TIER}` token and reaches a generated agent as text. No
 * engine branch reads its value. That is still not `teamSize`, which reached
 * NOTHING — not an emitted byte, not a branch. Rendering into a shipped
 * artifact is the whole difference, which is exactly why removing one does not
 * weaken the other.
 *
 * There is deliberately no confidence-floor axis here either.
 *
 * `confidenceFloor` shipped as a closed enum trio, a manifest field, a
 * preserved-field carry, a `stamity config` key, a `docs/configuration.md` row,
 * and a one-line prompt-directive renderer — and reached no emitted artifact.
 * No substitution token carried it (`REPO_SUBSTITUTION_TOKENS`,
 * `src/emit/substitution.ts`), no adapter and no hook read it, and its only
 * production reader was the `config` row that displayed it back.
 *
 * It was removed rather than wired because the review-loop confidence gate is
 * ALREADY enforced, at a fixed threshold the operator does not set: the emitted
 * review-gate hook refuses exactly one verdict/confidence pair — an approval
 * the reviewer itself rated `low` — and lets `medium` and `high` approvals
 * close the loop (`UNTRUSTED_CONFIDENCE` in `src/hooks/scripts.ts`). A
 * settable floor would have declared a threshold that shipped enforcement
 * ignores, so the dial did not merely lack a caller; it contradicted the
 * mechanism it claimed to configure. The spec ratifies the confidence gate as
 * prompt-carried and lists exactly two operator dials — intensity and the
 * model ladder — so a third was never ratified.
 */
