/**
 * The Codex residue planner — the thinnest of the four adapters, because Codex
 * is the most standards-native client the engine targets.
 *
 * Everything portable is already planned by the core: the `AGENTS.md`
 * charter Codex reads natively, the vendor-neutral `.agents/skills/` tree, the
 * six-intent hook scripts, the MCP catalog. What is left here is residue in the
 * strict sense — four things Codex spells differently from every other client:
 *
 * 1. **`.codex/hooks.json`** — the core's portable interchange rows in the
 *    Claude SHAPE (PascalCase event names, exit-0/2 semantics), which Codex
 *    copies verbatim, so this is a config-dialect rename and not a semantic
 *    transform. Each engine-emitted script carries the SHA-256 of the exact
 *    bytes the same plan writes, because Codex trusts a committed script by
 *    content hash: a hash computed from anything other than the emitted bytes
 *    would pin a file that is not there.
 * 2. **`.codex/agents/*.toml`** — subagent definitions in TOML rather than
 *    markdown-with-frontmatter, written through this package's own narrow TOML
 *    writer ({@link serializeTomlDocument}).
 * 3. **`.codex/config.toml`** — a SINGLE-WRITER composed document. The core
 *    plan deliberately answers `mcpFor("codex")` with nothing so that this
 *    adapter can compose the MCP tables (rendered by `src/mcp/emit.ts`, caveat
 *    comments included) together with adapter-level tables into one file that
 *    exactly one emitter owns.
 * 4. **Glob-rule down-conversion + the 32 KiB budget** — the lossy one, and the
 *    reason this adapter is not free. Codex has no glob-scoped rule layer
 *    (upstream gap: open codex#34002), so a conditional rule is inlined into
 *    the `AGENTS.md` of the directory its globs anchor to, or into a root
 *    appendix when no anchor is derivable — including the case where the anchor
 *    would land inside the engine's own state directory, which is a store other
 *    code parses rather than a place to leave prose. Every inlined section
 *    opens by saying so. Codex also caps an `AGENTS.md` at
 *    {@link CODEX_AGENTS_MD_BUDGET_BYTES} bytes, so an over-budget file drops
 *    sections lowest-RISK-first and NAMES every rule it dropped: the loss is
 *    documented in the file that suffered it. That guarantee is per file, and
 *    the omission notice says as much — the client's ceiling is over the
 *    CONCATENATION a session loads, which nothing here measures, so a reader
 *    who generalized from the notice would be assuming a check that does not
 *    run.
 *
 * The root appendix is delivered through the composer's shared-path
 * replacement contract (`AdapterOutput.replacesSharedPath`): one `AGENTS.md`
 * row, content substituted, owners unioned. Codex reads the root file
 * hierarchically like every other client — there is no codex-private charter —
 * so forking a second file would give the repository two standards documents.
 *
 * A FIFTH surface was looked for and is not here: the nine touchpoint command
 * bodies. Every other client takes them somewhere repo-committed; this one
 * documents no project-scoped command surface at all
 * ({@link CODEX_COMMANDS_DIR}), so nothing is emitted and the gap is a declared
 * cap rather than an invented path.
 *
 * Planning is pure: corpus reads are reads of context, and nothing here writes.
 * The emitted bytes carry no clock and no randomness, which is what makes the
 * hook digests stable across runs.
 */

import { createHash } from "node:crypto";
import { buildContentIndex, typeIdKey, type CatalogItem } from "../content/catalog.ts";
import { buildSelectionAllowlist, classifySelection } from "../content/selection.ts";
import { isFloorTag } from "../content/tags.ts";
import { AGENTS_MD_FILE, verificationGatesFromManifest } from "../emit/agentsMd.ts";
import {
  CHARTER_ARTIFACT_ID,
  type AdapterDialectFacts,
  type CoreEmissionPlan,
  type EmissionContext,
  type ResidueEmission,
  type ResiduePlanner,
} from "../emit/planner.ts";
import {
  detectionContextFromManifest,
  substituteRepoTokens,
  substituteVerificationGateTokens,
} from "../emit/substitution.ts";
import {
  CANONICAL_HOOK_EVENTS,
  CLAUDE_EVENT_NAMES,
  CLIENT_HOOK_GUARANTEES,
  type HookInterchange,
} from "../hooks/model.ts";
import { emitCodexToml } from "../mcp/emit.ts";
import {
  grantableFootprint,
  resolveAgentGrant,
  type ResolvedAgentGrant,
} from "../roster/agentGrants.ts";
import {
  resolveEffortValue,
  resolveModelValue,
  type EffortMap,
  type ModelPinMap,
} from "../roster/modelLadder.ts";
import { substituteCanonicalPlatformMarker, toCodexToolsFrontmatter } from "../tools/translator.ts";
import type { AdapterOutput, EmissionOwner, RulePrecedence } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { CONTENT_PREFIX, STATE_DIR } from "../types/markers.ts";
import { serializeTomlDocument, type TomlValue } from "./toml.ts";

// ── Layout ───────────────────────────────────────────────────────

/** Client configuration root. Internal: the exported paths below are the handles. */
const CODEX_DIR = ".codex";

/** Hook configuration, in the interchange (Claude) shape plus trust digests. */
export const CODEX_HOOKS_FILE = `${CODEX_DIR}/hooks.json`;

/** The composed CLI configuration this adapter owns whole. */
export const CODEX_CONFIG_FILE = `${CODEX_DIR}/config.toml`;

/** Directory of TOML subagent definitions. */
export const CODEX_AGENTS_DIR = `${CODEX_DIR}/agents`;

/**
 * Project-scoped command directory — `null`, because this client documents
 * none.
 *
 * The nine touchpoint bodies reach every other client through a repo-committed
 * directory. Codex's equivalent surface is custom prompts, and it is
 * user-scoped by definition: prompts "live in your local Codex home directory
 * (for example, `~/.codex`), so they're not shared through your repository",
 * and the page carries a "Deprecated. Use skills for reusable prompts" banner
 * (learn.chatgpt.com/docs/custom-prompts, accessed 2026-08-17). Emitting into a
 * home directory is out of the question — a repo-committed setup writes inside
 * the repo — and inventing `.codex/prompts/` because the sibling
 * `.codex/agents/` happens to be project-scoped would pin a path no
 * documentation grants.
 *
 * So the honest answer is nothing, said out loud: no command rows, and a
 * `command-surface` cap in {@link CODEX_FACTS} naming the gap. Claiming a
 * per-repo surface that is really per-user is exactly the doc-versus-reality
 * defect the dialect-facts table exists to catch. Typed `string | null` so the
 * day the client documents one, this constant is the only edit and the emission
 * below reads it rather than a second decision.
 */
export const CODEX_COMMANDS_DIR: string | null = null;

/**
 * Byte ceiling Codex reads of a single `AGENTS.md` (32 KiB, recorded as a
 * per-client cap by the adapter-currency pass). Measured in UTF-8
 * bytes, not characters — the file is prose, and prose is where multi-byte
 * characters live.
 *
 * The client spells it `project_doc_max_bytes`, default `32768`
 * (learn.chatgpt.com/docs/config-file/config-reference, accessed 2026-08-17).
 *
 * DECLARED GAP — the documented ceiling is over the CONCATENATION of the
 * instruction files a run loads, while {@link shapeToBudget} shapes each file
 * independently. Per-file shaping is the conservative half: no single file can
 * exceed the whole allowance, so the root charter is safe. What it does not
 * catch is aggregate overflow — a deep tree of nested `AGENTS.md` files, each
 * legally under budget, whose concatenation is not, and which the client then
 * truncates silently. Closing that needs a plan-wide budget the shaper does not
 * have (it sees one file at a time by construction) and would change which
 * rules survive on a repo that is fine today, so it is named here rather than
 * guessed at.
 *
 * The gap is named to the OPERATOR too, not only to this file's readers:
 * {@link renderDroppedNotice} states that the shaping is per file, that the
 * aggregate is not enforced, and what to run to measure the concatenation. A
 * notice that reported this file's drops and stopped there read as an
 * all-clear for a total nothing had checked.
 */
export const CODEX_AGENTS_MD_BUDGET_BYTES = 32_768;

/** The upstream gap that makes glob down-conversion necessary, cited in every notice. */
const LOSSY_GAP = "open codex#34002";

/** Heading shared by the root appendix and every nested rules file. */
const APPENDIX_TITLE = "Conditional rules (Codex down-conversion)";

const TOOL = "codex" as const;

// ── Ledger artifact ids ──────────────────────────────────────────

/** Hook configuration row. */
const HOOKS_ARTIFACT_ID = "codex-hooks";

/** Composed CLI configuration row. */
const CONFIG_ARTIFACT_ID = "codex-config";

/**
 * A nested rules file. Composite by nature — it carries several rules — so it
 * ledgers as infrastructure under one id rather than claiming to be any single
 * rule artifact.
 */
const RULES_APPENDIX_ARTIFACT_ID = "codex-rules-appendix";

// ── Dialect facts ────────────────────────────────────────────────

/**
 * What this client actually does, as data — the row the generated capability
 * matrix renders. Claims that rest on an unverified dialect assumption say so
 * in place rather than reading as settled.
 */
const CODEX_FACTS: AdapterDialectFacts = {
  tool: TOOL,
  ruleShape:
    "no glob-scoped rule layer; conditional rules down-convert into nested AGENTS.md files " +
    `(documented lossy — upstream gap: ${LOSSY_GAP})`,
  hooksConfigPath: CODEX_HOOKS_FILE,
  readsAgentsSkillsDir: true,
  agentsFormat: `TOML subagent definitions under ${CODEX_AGENTS_DIR}/`,
  mcpDialect: "codex-toml",
  // AGENTS.md is native here: no entry-file bridge is emitted.
  entryFile: null,
  caps: [
    { name: "AGENTS.md budget", value: `${CODEX_AGENTS_MD_BUDGET_BYTES} bytes (32 KiB)` },
    {
      name: "hook enforcement",
      value: "fail-closed — a refusing hook exits 2 and the pending action stops",
    },
    {
      name: "per-agent tool allowlist",
      value:
        "none documented (provisional, re-verified 2026-08-17) — the comma-list dialect is a " +
        "placeholder and `sandbox_mode` is the native primitive that binds",
    },
    {
      // The command-surface question answered for this client, recorded rather
      // than worked around.
      name: "command-surface",
      value:
        "none — custom prompts live in the user's Codex home directory, not the " +
        "repository, and are deprecated in favour of skills, so the nine touchpoint " +
        "bodies are not emitted here; the charter's touchpoint index still names them",
    },
  ],
  citations: [
    // Subagent key set + the project-scoped `.codex/agents/` location.
    { url: "https://learn.chatgpt.com/docs/agent-configuration/subagents", accessDate: "2026-08-17" },
    // Project-level `.codex/hooks.json`, PascalCase events, exit-2 blocking,
    // and trust recorded against the hook's own hash.
    { url: "https://learn.chatgpt.com/docs/hooks", accessDate: "2026-08-17" },
    // `project_doc_max_bytes`, default 32768 — the budget shaped below.
    { url: "https://learn.chatgpt.com/docs/config-file/config-reference", accessDate: "2026-08-17" },
    // Custom prompts: home-directory scope, deprecated — why no commands emit.
    { url: "https://learn.chatgpt.com/docs/custom-prompts", accessDate: "2026-08-17" },
  ],
};

// ── Planner ──────────────────────────────────────────────────────

/**
 * The registered residue planner for Codex.
 *
 * Rows come back sorted by path so the adapter's own output is deterministic
 * before the composer sorts the whole plan — a diff of this planner's result
 * is then a content diff, never an ordering one.
 */
export const codexResiduePlanner: ResiduePlanner = {
  tool: TOOL,
  facts: CODEX_FACTS,

  async planResidue(core: CoreEmissionPlan, ctx: EmissionContext): Promise<ResidueEmission> {
    const { agents, rules } = await selectedItems(ctx);
    const render = bodyRenderer(ctx);
    // One read of the operator's allocation for the whole batch: pins and
    // efforts are per class, not per agent, so resolving them per file would
    // re-read the same two maps once per subagent.
    const models = {
      ...(ctx.manifest.models?.pins === undefined ? {} : { pins: ctx.manifest.models.pins }),
      ...(ctx.manifest.models?.effort === undefined ? {} : { efforts: ctx.manifest.models.effort }),
    };

    const rows: AdapterOutput[] = [
      emissionRow(CODEX_HOOKS_FILE, buildHooksJson(core), HOOKS_ARTIFACT_ID, "infra"),
      emissionRow(CODEX_CONFIG_FILE, composeConfigToml(core, ctx), CONFIG_ARTIFACT_ID, "infra"),
    ];

    for (const agent of agents) {
      rows.push(
        emissionRow(
          `${CODEX_AGENTS_DIR}/${runtimeAgentId(agent.id)}.toml`,
          buildAgentToml(agent, grantFor(agent), render(agent.body), models),
          agent.id,
          "agent",
        ),
      );
    }

    // Built by hand rather than mapped: the rendered rule is the catalog item
    // with one field replaced, and spreading inside a `map` is the shape the
    // lint rule (rightly) reads as an accidental copy per element.
    const renderedRules: CatalogItem[] = [];
    for (const rule of rules) renderedRules.push({ ...rule, body: render(rule.body) });

    const downConverted = downConvertRules(
      renderedRules,
      core.agentsMd.root.content,
      core.agentsMd.nestedFor(TOOL).map((target) => target.outputPath),
    );
    for (const file of downConverted.nested) {
      rows.push(emissionRow(file.path, file.content, RULES_APPENDIX_ARTIFACT_ID, "infra"));
    }
    const warnings: string[] = [commandSurfaceWarning()];
    if (downConverted.rootReplacement !== null) {
      rows.push({
        ...emissionRow(AGENTS_MD_FILE, downConverted.rootReplacement, CHARTER_ARTIFACT_ID, "infra"),
        // The appendix belongs in the file every client already reads; the
        // composer substitutes the shared row's content and unions owners.
        replacesSharedPath: true,
      });
      warnings.push(
        sharedCharterWarning(
          ctx.manifest.tools,
          Buffer.byteLength(core.agentsMd.root.content, "utf8"),
          Buffer.byteLength(downConverted.rootReplacement, "utf8"),
        ),
      );
    }
    if (downConverted.dropped.length > 0) warnings.push(droppedRulesWarning(downConverted.dropped));

    return { outputs: rows.toSorted((a, b) => compareText(a.path, b.path)), warnings };
  },
};

/**
 * The touchpoint-delivery disclosure, printed on every run that selects this
 * client.
 *
 * {@link CODEX_COMMANDS_DIR} is `null`, so none of the nine touchpoint bodies
 * is emitted here: what a Codex user gets is the charter's one-line index of
 * the nine, and nothing behind it. The capability matrix and the init panel
 * both said so; the always-on charter did not, and the charter is the file this
 * client actually loads — so the operator most likely to be misled was the one
 * reading the only surface that never disclosed it.
 */
function commandSurfaceWarning(): string {
  return (
    `touchpoints [${TOOL}]: this client documents no project-scoped command directory, so none ` +
    `of the nine touchpoint workflow bodies is written for it. What ships is the charter's ` +
    `one-line index of the nine; a user who names one gets the index entry, not the workflow ` +
    `the other clients run. Select another client alongside it to get the bodies on disk.`
  );
}

/**
 * The disclosure for replacing the SHARED root `AGENTS.md`.
 *
 * `replacesSharedPath` is deliberate — the appendix belongs in the file every
 * client already reads — but its cost lands on the co-selected clients, not on
 * this one: cursor and copilot read that same root file always-on, and the
 * rules this pass inlines verbatim are rules those two already attach natively
 * by glob. Silent, the operator saw a root charter grow several-fold with no
 * line anywhere connecting it to the client they had just added.
 *
 * Printed only when another client is actually selected, since a codex-only
 * repo has nobody to pay the cost.
 */
function sharedCharterWarning(
  tools: readonly Tool[],
  beforeBytes: number,
  afterBytes: number,
): string {
  const others = tools.filter((tool) => tool !== TOOL);
  if (others.length === 0) {
    return (
      `charter [${TOOL}]: the root ${AGENTS_MD_FILE} carries this client's inlined rules ` +
      `appendix — ${beforeBytes} bytes of charter became ${afterBytes}. That is this client's ` +
      `own always-on budget being spent; nothing else reads the file in this setup.`
    );
  }
  return (
    `charter [${TOOL}]: this client has no glob-scoped rule layer, so its rules are inlined into ` +
    `the SHARED root ${AGENTS_MD_FILE} — ${beforeBytes} bytes became ${afterBytes}. That file is ` +
    `read always-on by ${others.join(", ")} too, and those clients already attach the same rules ` +
    `natively, so they now carry the text twice. Deselecting ${TOOL} restores the shared charter ` +
    `to its ${beforeBytes}-byte form.`
  );
}

/**
 * The budget disclosure, on the channel a report can reach.
 *
 * The dropped ids were named inside the emitted file and nowhere else — at line
 * 504 of a 506-line document, which is the one place an operator who does not
 * already suspect a loss will never look. `init`, `sync` and `check` printed
 * nothing, so a rule the shaper removed (the ambiguity procedure the charter's
 * own invariants depend on, on a full selection) was gone with no run saying
 * so. The in-file notice stays — it is the record for a reader of that file —
 * and this is the same fact on the run's own warning channel.
 */
function droppedRulesWarning(dropped: readonly string[]): string {
  return (
    `rules budget [${TOOL}]: ${dropped.length} rule(s) did not fit this client's ` +
    `${CODEX_AGENTS_MD_BUDGET_BYTES}-byte instruction budget and were dropped, lowest risk ` +
    `first: ${dropped.join(", ")}. They are named again in the emitted ${AGENTS_MD_FILE}. ` +
    `Narrow the content selection to bring them back.`
  );
}

/** One planned row, owned by this adapter. */
function emissionRow(
  path: string,
  content: string,
  artifactId: string,
  artifactType: EmissionOwner["artifactType"],
): AdapterOutput {
  return { path, content, owner: { adapter: TOOL, artifactId, artifactType } };
}

/** Corpus frontmatter ids are bare; the runtime namespace carries the prefix. */
function runtimeAgentId(id: string): string {
  return `${CONTENT_PREFIX}${id}`;
}

/**
 * One agent's resolved grant.
 *
 * The roster lookup this replaced answered for shipped agents and nothing else:
 * an installed pack's agent has no roster row, so it emitted the empty grant and
 * a read-only sandbox, and everything the pack shipped was inert on arrival —
 * the live-emission invariant broken from the far end. The shared
 * resolver rules on both: a roster id is answered by its row verbatim (so core
 * agents emit byte-identically to before), and a pack agent's own
 * `capabilities:` frontmatter is intersected with the tool footprint its pack
 * declared.
 *
 * PACK CEILING. A pack-supplied agent's grant is its own `capabilities:`
 * frontmatter INTERSECTED with the footprint its pack disclosed at install.
 * That footprint reaches this layer stamped on the catalog item
 * (`../content/catalog.ts` -> `CatalogItem.provenance`), put there once by the
 * installed-pack projection, so no adapter re-derives it by reading pack files
 * of its own — four readers of the same files is four chances to disagree
 * about one agent's privilege. Two things are still deliberately NOT done: a
 * corpus agent is never handed a ceiling (it has no pack, and the resolver's
 * `undefined` says so), and an agent's own capabilities are never passed as
 * its own ceiling — an intersection with itself grants whatever a hand-edited
 * file asks for.
 */
function grantFor(item: CatalogItem): ResolvedAgentGrant {
  const pack = item.provenance;
  return resolveAgentGrant({
    runtimeId: runtimeAgentId(item.id),
    frontmatter: item.frontmatter,
    // A pack item carries its supplier's disclosed footprint (stamped on the
    // walk by `../pack/projection.ts`), which is the ceiling its own
    // `capabilities:` are intersected with. A corpus item has no pack at all,
    // and that is exactly what an omitted `declaredTools` says.
    ...(pack === undefined ? {} : { declaredTools: grantableFootprint(pack.declaredTools) }),
  });
}

/**
 * The selected agents and rules, read through the same catalog + selection
 * predicate every other emission surface uses, so this adapter cannot ship an
 * artifact the manifest deselected (or drop one the floor protects). Only the
 * reachable claimant of a contested id is emitted, matching the catalog's own
 * resolution.
 *
 * Two classes are absent for two different reasons. Skills are read by this
 * client from the vendor-neutral `.agents/skills/` tree the core already
 * projects, so a native copy would duplicate bytes for no reader. Commands have
 * nowhere to go: {@link CODEX_COMMANDS_DIR} is `null` because the client
 * documents no project-scoped command surface, and a class with no verified
 * destination is not selected into one.
 */
async function selectedItems(
  ctx: EmissionContext,
): Promise<{ agents: CatalogItem[]; rules: CatalogItem[] }> {
  const index = await buildContentIndex(ctx.contentRoot);
  const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
  const admitted = index.items.filter(
    (item) =>
      index.byKey.get(typeIdKey(item.type, item.id)) === item &&
      classifySelection(item, allowlist) !== "drop" &&
      // The `tools:` restriction, honoured here as it is in every other
      // adapter. Absent means "every tool"; a list restricts the artifact to
      // the tools it names. Skipping the check did not merely emit a stray
      // `.codex/` file — this adapter also DOWN-CONVERTS agents and rules into
      // the shared root `AGENTS.md`, so an artifact scoped away from codex
      // leaked into the document every client reads.
      (item.tools === undefined || item.tools.includes(TOOL)),
  );
  return {
    agents: admitted.filter((item) => item.type === "agent"),
    rules: admitted.filter((item) => item.type === "rule"),
  };
}

/**
 * Emission-time body rendering: repo tokens, verification-gate commands, and
 * the platform ask-user marker resolved to THIS client's note — unlike the
 * once-emitted skills projection, a `.codex/` file has exactly one audience.
 */
function bodyRenderer(ctx: EmissionContext): (raw: string) => string {
  const detection = detectionContextFromManifest(ctx.manifest);
  const gates = verificationGatesFromManifest(ctx.manifest);
  return (raw) =>
    substituteCanonicalPlatformMarker(
      substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates),
      TOOL,
    );
}

// ── 1. Hook configuration ────────────────────────────────────────

/** One command registration inside a hook group. */
interface CodexHookEntry {
  type: "command";
  /** Exec form: argv, never a shell line. */
  command: string[];
  /** Seconds, the unit the interchange shape states timeouts in. */
  timeout?: number;
  /** Digest of the emitted script bytes; absent for a command this engine does not emit. */
  sha256?: string;
}

/** Registrations sharing one event and matcher. */
interface CodexHookGroup {
  matcher?: string;
  hooks: CodexHookEntry[];
}

/**
 * Render the core's portable hook rows as `.codex/hooks.json`.
 *
 * The transform is a rename plus a placement: canonical `snake_case` events
 * become the interchange's PascalCase names, rows group by event and matcher,
 * and the argv stays argv. Codex adopts the interchange shape verbatim
 * (`CLIENT_HOOK_GUARANTEES`), so anything more than that would be this adapter
 * inventing semantics the client did not ask for.
 *
 * Trust-by-hash: every command that runs a script THIS plan emits carries the
 * SHA-256 of those exact bytes, computed from the plan rather than from disk —
 * the file has not been written yet, and hashing what is about to be written is
 * the only way the digest and the file cannot disagree. A user-authored hook
 * carries no digest: its command is the user's own trust domain, wired
 * verbatim, and this engine emits none of its bytes to vouch for.
 *
 * The `stamity` block states what the client actually enforces (fail mode,
 * blocking exit status) beside the configuration it governs, so an operator
 * reading the file is not left to infer the guarantee from its shape.
 */
export function buildHooksJson(core: CoreEmissionPlan): string {
  const digests = new Map<string, string>();
  for (const script of core.hooks.scripts) {
    if (script.tool === TOOL) digests.set(script.path, sha256Hex(script.content));
  }

  const rows = core.hooks.interchangeFor(TOOL);
  const hooks: Record<string, CodexHookGroup[]> = {};
  for (const event of CANONICAL_HOOK_EVENTS) {
    const groups = groupRows(
      rows.filter((row) => row.event === event),
      digests,
    );
    if (groups.length > 0) hooks[CLAUDE_EVENT_NAMES[event]] = groups;
  }

  // A client with no guarantee row falls back to blocking, mirroring the script
  // builders: an exit status a client ignores costs nothing, while assuming it
  // ignores one would silently disarm the gate.
  const guarantee = CLIENT_HOOK_GUARANTEES.find((row) => row.tool === TOOL);

  return `${JSON.stringify(
    {
      hooks,
      stamity: {
        interchange: "claude-shape",
        failMode: guarantee?.failMode ?? "fail-closed",
        blockingExitCode: guarantee?.blockingExitCode ?? 2,
        guarantee: guarantee?.notes ?? "",
        trust:
          "Each sha256 covers the generated script bytes this setup emits; verify with " +
          "`stamity check` after any edit. User-authored hooks are wired verbatim and " +
          "carry no digest — their commands are the repository's own trust domain.",
      },
    },
    null,
    2,
  )}\n`;
}

/** Rows for one event, grouped by matcher in first-appearance order. */
function groupRows(
  rows: readonly HookInterchange[],
  digests: ReadonlyMap<string, string>,
): CodexHookGroup[] {
  const groups: CodexHookGroup[] = [];
  const byMatcher = new Map<string, CodexHookGroup>();

  for (const row of rows) {
    const key = row.matcher ?? "";
    let group = byMatcher.get(key);
    if (group === undefined) {
      group = row.matcher === undefined ? { hooks: [] } : { matcher: row.matcher, hooks: [] };
      byMatcher.set(key, group);
      groups.push(group);
    }
    group.hooks.push(hookEntry(row, digests));
  }
  return groups;
}

function hookEntry(row: HookInterchange, digests: ReadonlyMap<string, string>): CodexHookEntry {
  const digest = emittedScriptDigest(row.command, digests);
  return {
    type: "command",
    command: [...row.command],
    // Seconds, rounded UP: a sub-second request must not round to zero, which
    // some clients read as "no timeout" and others as "expire immediately".
    ...(row.timeoutMs === undefined ? {} : { timeout: Math.ceil(row.timeoutMs / 1000) }),
    ...(digest === undefined ? {} : { sha256: digest }),
  };
}

/**
 * The digest of the engine-emitted script a command runs, located by scanning
 * argv for a path THIS plan writes rather than by assuming the
 * interpreter-then-script argv shape the core happens to build today. A command
 * that grew an interpreter flag would otherwise lose its digest silently — a
 * hook that still runs while nothing vouches for its bytes is the exact failure
 * trust-by-hash exists to prevent, and it would fail open without a diagnostic.
 *
 * A user-authored hook names no emitted path, so it matches nothing and carries
 * no digest: the intended outcome for a command this engine does not write,
 * not a miss.
 */
function emittedScriptDigest(
  command: readonly string[],
  digests: ReadonlyMap<string, string>,
): string | undefined {
  for (const argument of command) {
    const digest = digests.get(argument);
    if (digest !== undefined) return digest;
  }
  return undefined;
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// ── 2. Subagent definitions ──────────────────────────────────────

/** Grants whose presence means the agent must be able to change the workspace. */
const MUTATING_CATEGORIES: ReadonlySet<string> = new Set(["edit", "execute"]);

/** Operator allocation for one build: what `stamity config` pinned, per class. */
interface ModelOptions {
  pins?: ModelPinMap;
  efforts?: EffortMap;
}

/**
 * One agent as a Codex TOML subagent definition.
 *
 * `body` defaults to the catalog body so the function is usable on a raw
 * catalog item; emission passes the substituted body instead.
 *
 * The tool grant is emitted twice, on purpose and with the difference stated in
 * the file: `tools` is the PROVISIONAL comma-list placeholder (Codex documents
 * no per-agent allowlist — verified again 2026-08-17), while `sandbox_mode` is
 * the native primitive that actually narrows what the agent can do. It widens
 * to `workspace-write` only on a grant holding a mutating category, and the
 * test is membership in {@link MUTATING_CATEGORIES} rather than "not read-only":
 * a category from outside the grantable vocabulary matches nothing and leaves
 * the sandbox read-only, so an unknown grant narrows rather than widens.
 *
 * Both allocation axes come from the ladder (`../roster/modelLadder.ts`), never
 * from a table of this adapter's own. `model` is emitted only when an operator
 * pinned an id for the class — this client publishes no symbolic model
 * vocabulary for a class to map onto, so with no pin the key is omitted and the
 * client applies its own default, which is an honest unknown rather than a
 * sizing decision the engine invented. `model_reasoning_effort` carries the
 * class's effort, operator override first.
 */
export function buildAgentToml(
  item: CatalogItem,
  grant: ResolvedAgentGrant,
  body: string = item.body,
  opts: ModelOptions = {},
): string {
  const runtimeId = runtimeAgentId(item.id);
  const allow = grant.allow;

  const entries: [string, TomlValue][] = [
    ["name", runtimeId],
    ["description", item.description],
    ["tools", toCodexToolsFrontmatter(allow)],
    [
      "sandbox_mode",
      allow.some((category) => MUTATING_CATEGORIES.has(category)) ? "workspace-write" : "read-only",
    ],
  ];

  // A class the ladder does not know, or a frontmatter value that is not a
  // string, resolves to nothing on both axes and omits both keys.
  const declaredClass = item.frontmatter.model_class;
  if (typeof declaredClass === "string") {
    const model = resolveModelValue(declaredClass, TOOL, opts.pins);
    if (model !== undefined) entries.push(["model", model]);
    const effort = resolveEffortValue(declaredClass, TOOL, opts.efforts);
    if (effort !== undefined) entries.push(["model_reasoning_effort", effort]);
  }

  // Last: it is the long one, and a trailing multi-line string keeps the
  // scannable keys at the top of the file.
  entries.push(["developer_instructions", `${body.trim()}\n`]);

  const comments = [
    `stamity — Codex subagent "${runtimeId}". Generated file: regenerate rather than`,
    "editing it; local edits are overwritten.",
    "",
    "Key set: learn.chatgpt.com/docs/agent-configuration/subagents (accessed 2026-08-17).",
    "PROVISIONAL — Codex documents no per-agent tool allowlist, so `tools` carries the",
    "placeholder comma-list dialect and `sandbox_mode` is the primitive that binds.",
  ];
  if (grant.source === "none") {
    comments.push(
      "",
      `No resolvable grant for "${runtimeId}" — neither a roster row nor capabilities this`,
      "engine can derive one from. The grant is empty by default, and the generated",
      "pre-tool-use guard refuses every call it makes.",
    );
  }

  return serializeTomlDocument({ comments, tables: [{ header: null, entries }] });
}

// ── 3. Composed CLI configuration ────────────────────────────────

/**
 * Compose `.codex/config.toml` — one document, one writer.
 *
 * The MCP tables are rendered by the catalog's own emitter and spliced in
 * verbatim, caveat comments included: Codex does not interpolate this file, and
 * that warning has to survive to the operator who sources the environment. The
 * server ids come from the manifest rather than from `core.mcpFor("codex")`,
 * which answers empty by design so no generic placement can write this path;
 * that reservation is asserted here, because a core change that started handing
 * out a `codex-toml` row would otherwise produce two writers for one file.
 *
 * The supply the ids resolve AGAINST still comes from the core
 * ({@link CoreEmissionPlan.packMcpServers}), because a selected id may be
 * curated or pack-supplied and this adapter must not answer that question
 * differently from the four dialects the core places. Rendering the ids
 * against the curated table alone threw "nothing resolves them" on a repo that
 * had installed a pack and selected its server.
 *
 * An empty server selection still emits the file: the emitter's documented
 * empty-map spelling is written, so the hooks and subagents that reference this
 * configuration never point at a file that is not there.
 */
export function composeConfigToml(core: CoreEmissionPlan, ctx: EmissionContext): string {
  const reserved = core.mcpFor(TOOL);
  if (reserved.length > 0) {
    throw new EngineError(
      `The core plan returned ${reserved.length} generic MCP document(s) for codex ` +
        `(${reserved.map((emission) => emission.path).join(", ")}), but ${CODEX_CONFIG_FILE} is ` +
        `composed by this adapter alone. Keep the codex-toml dialect reserved to the codex ` +
        `residue planner, or move composition into the core — one path takes one writer.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const header = serializeTomlDocument({
    comments: [
      "stamity — Codex CLI configuration. Generated file: regenerate rather than editing",
      "it; local edits are overwritten.",
      "",
      "Composed by one writer: the MCP server tables below are rendered from the curated",
      "catalog, and any adapter-level table joins them here rather than in a second file.",
      "",
      `Hooks: ${CODEX_HOOKS_FILE} · subagents: ${CODEX_AGENTS_DIR}/ · standards: ${AGENTS_MD_FILE}.`,
    ],
    tables: [],
  });

  return `${header}\n${emitCodexToml(ctx.manifest.mcp?.servers ?? [], {
    packServers: core.packMcpServers,
  })}`;
}

// ── 4. Glob-rule down-conversion + budget shaping ────────────────

/**
 * What a rule costs to lose, read off the frontmatter it already declares.
 *
 * SPEC DEFECT, resolved build-side. The rules layer sanctions ONE risk
 * flag — `critical: true|absent`, which this corpus spells `precedence:
 * critical` — and exactly one rule carries it. That left the budget shaper with
 * no way to rank the rest, so `security-patterns` dropped ahead of `ai-evals`
 * on alphabet alone: the cheapest possible reason to lose the rule that governs
 * what the generated setup PERMITS. The fix derives the missing rank from what
 * rules already declare rather than inventing a second flag vocabulary — a new
 * frontmatter key would be an unledgered spec extension, and every rule would
 * need re-authoring to carry it.
 *
 * `floorTagged` is FLOOR membership — any `floor:*` tag, read through
 * {@link isFloorTag}. A floor tag is the corpus saying "content reduction must
 * not drop this" (`../content/tags.ts`, `../content/selection.ts`), and the
 * budget shaper IS content reduction, so a rule that encodes a charter floor is
 * the last to leave. The rank was `floor:security` alone before, which made the
 * ordering true of one floor and silent about the rest: a future `floor:*`
 * value would have ranked with unflagged prose the day it was authored. Reading
 * the facet keeps the ordering a property of the floor idea rather than of one
 * spelling of it, and the security floor stays covered by construction.
 */
interface RuleRisk {
  /** The one flag the rules layer sanctions. Survives everything else. */
  readonly critical: boolean;
  /** `floor:*` membership — a declared floor, not prose the reduction may shed. */
  readonly floorTagged: boolean;
}

/** One rule prepared for inlining. */
interface RuleSection {
  id: string;
  precedence: RulePrecedence;
  /** What its loss costs, ranked ahead of precedence and alphabet when dropping. */
  risk: RuleRisk;
  globs: string[];
  description: string;
  body: string;
  /** Directory whose `AGENTS.md` takes this rule, or null for the root appendix. */
  anchor: string | null;
  /** Set when an anchored rule was moved to the root because its file has an owner. */
  reroutedFrom?: string;
}

/** The result of down-converting one selection of rules. */
export interface DownConvertedRules {
  /** Nested rules files, sorted by path. Each independently under budget. */
  nested: { path: string; content: string }[];
  /**
   * Replacement content for the shared root `AGENTS.md` (core charter body plus
   * the appendix), or null when no rule down-converts to the root.
   */
  rootReplacement: string | null;
  /** Ids dropped by budget shaping, sorted — every one of them named in-file too. */
  dropped: string[];
}

/** Precedence, ranked so a bigger number drops first. */
const PRECEDENCE_RANK: Readonly<Record<RulePrecedence, number>> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Characters that end a glob's literal prefix. */
const WILDCARD_PATTERN = /[*?[\]{}!]/;

/**
 * Down-convert conditional rules into nested `AGENTS.md` files plus a root
 * appendix.
 *
 * Anchoring: a rule attaches to the deepest directory every one of its globs
 * lives under — the longest wildcard-free prefix they share. `src/db` plus
 * `src/models` globs anchor at `src`, because a file placed deeper would miss
 * half the rule's surface; a glob whose first segment is a wildcard (the
 * leading-doublestar form) anchors nowhere at all, a glob rooted at the
 * engine's own state directory is refused ({@link anchorOfGlob}), and a rule
 * with no derivable anchor — or none declared, the description-triggered case —
 * goes to the root appendix where Codex is certain to read it.
 *
 * `coreNestedPaths` names the nested `AGENTS.md` files the CORE already emits
 * (the monorepo charter copies). A rule whose anchor lands on one of those is
 * rerouted to the root appendix rather than composed into it: one path takes
 * one writer, and the composer reserves content substitution for shared core
 * rows. The section says where it was authored for, so the scoping information
 * survives even though the placement could not.
 *
 * Budget: each file is shaped independently to
 * {@link CODEX_AGENTS_MD_BUDGET_BYTES}, dropping sections lowest-RISK first
 * ({@link compareDropOrder}: critical flag, then floor-tag membership, then
 * declared precedence, then id) and naming every dropped rule — and the
 * ordering — in the file that dropped it. A file already under budget drops
 * nothing and carries no notice.
 *
 * An anchor directory that does not exist yet is still written to, creating it.
 * That is deliberate: the plan stays a function of the corpus and the manifest
 * alone, so regenerating it and diffing against disk is a real drift check. Were
 * placement to depend on the working tree, a package directory appearing or
 * disappearing would silently add or reclaim a rules file, and the same rule
 * would down-convert differently on two checkouts of one commit. The
 * directories a rule must NOT anchor in are therefore refused by name in
 * {@link anchorOfGlob} rather than by asking the filesystem what is there.
 */
export function downConvertRules(
  items: readonly CatalogItem[],
  coreRoot: string,
  coreNestedPaths: readonly string[] = [],
): DownConvertedRules {
  const sections = items.map(toSection).toSorted((a, b) => compareText(a.id, b.id));
  const taken = new Set(coreNestedPaths);

  const rootSections: RuleSection[] = [];
  const byPath = new Map<string, RuleSection[]>();
  for (const section of sections) {
    if (section.anchor === null) {
      rootSections.push(section);
      continue;
    }
    const path = `${section.anchor}/${AGENTS_MD_FILE}`;
    if (taken.has(path)) {
      rootSections.push({ ...section, reroutedFrom: section.anchor });
      continue;
    }
    byPath.set(path, [...(byPath.get(path) ?? []), section]);
  }

  const dropped: string[] = [];

  const nested = [...byPath.entries()]
    .toSorted(([a], [b]) => compareText(a, b))
    .map(([path, group]) => {
      const anchor = path.slice(0, -(AGENTS_MD_FILE.length + 1));
      const shaped = shapeToBudget(group, (kept, omitted) =>
        renderAppendix({ head: "", scope: anchor, titleLevel: 1, sections: kept, dropped: omitted }),
      );
      dropped.push(...shaped.dropped);
      return { path, content: shaped.content };
    });

  let rootReplacement: string | null = null;
  if (rootSections.length > 0) {
    const shaped = shapeToBudget(rootSections, (kept, omitted) =>
      renderAppendix({
        head: coreRoot,
        scope: null,
        titleLevel: 2,
        sections: kept,
        dropped: omitted,
      }),
    );
    dropped.push(...shaped.dropped);
    rootReplacement = shaped.content;
  }

  return { nested, rootReplacement, dropped: dropped.toSorted(compareText) };
}

/** One catalog rule as a section, with its anchor and its risk resolved. */
function toSection(item: CatalogItem): RuleSection {
  const globs = readGlobs(item);
  const precedence = item.precedence ?? "normal";
  return {
    id: item.id,
    precedence,
    risk: {
      critical: precedence === "critical",
      floorTagged: item.tags.some(isFloorTag),
    },
    globs,
    description: item.description,
    body: item.body,
    anchor: anchorOf(globs),
  };
}

/** Declared globs as a clean list; an array or a legacy comma string both parse. */
function readGlobs(item: CatalogItem): string[] {
  const declared = item.frontmatter.globs;
  const raw = Array.isArray(declared)
    ? declared
    : typeof declared === "string"
      ? declared.split(",")
      : [];
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

/**
 * The directory every glob in the set lives under, or null when there is none.
 * A single unanchorable glob makes the whole rule unanchorable: placing the
 * file deeper would silently stop covering that glob's surface. A glob
 * {@link anchorOfGlob} refuses outright — state directory, absolute,
 * `..`-climbing — takes the whole rule to the root with it: its siblings would
 * otherwise pick a home that covers them and not it.
 */
function anchorOf(globs: readonly string[]): string | null {
  let common: string[] | null = null;

  for (const glob of globs) {
    const anchor = anchorOfGlob(glob);
    if (anchor === null) return null;
    const segments = anchor.split("/");
    if (common === null) {
      common = segments;
      continue;
    }
    const shared: string[] = [];
    for (const [index, segment] of common.entries()) {
      if (segments[index] !== segment) break;
      shared.push(segment);
    }
    common = shared;
    if (common.length === 0) return null;
  }

  return common === null || common.length === 0 ? null : common.join("/");
}

/**
 * One glob's literal directory prefix: the segments before the first one
 * carrying a wildcard, with the final segment excluded because it names a file
 * rather than a directory. Anything that could address outside the repository —
 * absolute, drive-rooted, `..`-climbing — anchors nowhere, so it falls back to
 * the root appendix instead of aiming a write at another tree.
 *
 * {@link STATE_DIR} is refused for the mirror-image reason: it addresses INSIDE
 * a tree that is not free space. The state directory is the engine's own store,
 * and every file in it is read by code that knows what it expects to find —
 * `.stamity/learnings/` is walked as learnings, so an `AGENTS.md` left there is
 * parsed as a malformed learning by the validate command, the session banner,
 * and the learnings reader alike, and a fresh init would fail its own
 * `validate` on a file this planner wrote. The rules that make this reachable
 * are the ones ABOUT the state directory (`.stamity/**`, `.stamity/learnings/**`)
 * — exactly the rules a repo most wants.
 *
 * WHAT THE REFUSAL COSTS, measured rather than assumed. The fallback is the
 * root appendix, and on the shipped corpus that appendix is already over
 * budget, so the two rerouted rules do not arrive intact — they enter a
 * zero-sum file and {@link shapeToBudget} settles it. `injection-screening`
 * survives on its `floor:security` rank and displaces `contract-census`;
 * `learnings-schema` carries no risk flag, so it ranks last and drops. Net
 * against the anchored behaviour, Codex receives two FEWER rules than before
 * the refusal: both rerouted rules used to be delivered in full in their own
 * files, and now one of them and one bystander are delivered nowhere. Neither
 * loss is silent — {@link renderDroppedNotice} names both — and neither is
 * endorsed here: this comment records the measurement, and
 * `test/adapters/codex.test.ts` pins the exact inlined and omitted sets so the
 * next change to either is a diff somebody has to approve. Restoring delivery
 * is not reachable from this function: the rank comes from corpus frontmatter
 * (`content/rules/stamity-learnings-schema.md` declares no floor tag), and no
 * anchor outside the root can carry a `.stamity/**` rule, since Codex reads
 * only the `AGENTS.md` files between the repository root and the working
 * directory.
 *
 * The refusal is on the FIRST directory segment, after `./` stripping and
 * backslash normalization, and it is an equality test rather than a prefix
 * test: a sibling like `.stamityx/**` is somebody else's directory and anchors
 * normally, and a nested `src/.stamity/**` is not this engine's store either.
 */
function anchorOfGlob(glob: string): string | null {
  const normalized = glob.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;

  const segments = normalized.split("/");
  const dirs: string[] = [];
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) break;
    if (WILDCARD_PATTERN.test(segment)) break;
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    // First segment only: `dirs` is still empty exactly once, on the segment
    // that would root the anchor.
    if (dirs.length === 0 && segment === STATE_DIR) return null;
    dirs.push(segment);
  }
  return dirs.length === 0 ? null : dirs.join("/");
}

/**
 * Render, measure, drop, repeat — until the file fits or nothing is left to
 * drop. The notice grows the file too, so it is re-rendered on every pass
 * rather than estimated. A body that is over budget with no sections left is
 * returned as it stands: the charter body belongs to the core emission, and
 * trimming another emitter's content would hide the overflow instead of
 * reporting it.
 *
 * One section leaves per pass, chosen by {@link lowestRisk}, rather than a
 * whole tail estimated in one go: sizes are known only after rendering, and
 * dropping one more than the budget needed would cost a rule for nothing.
 */
function shapeToBudget(
  sections: readonly RuleSection[],
  render: (kept: readonly RuleSection[], dropped: readonly string[]) => string,
): { content: string; dropped: string[] } {
  const kept = [...sections];
  const dropped: string[] = [];
  let content = render(kept, dropped);

  while (Buffer.byteLength(content, "utf8") > CODEX_AGENTS_MD_BUDGET_BYTES && kept.length > 0) {
    const victim = lowestRisk(kept);
    kept.splice(kept.indexOf(victim), 1);
    dropped.push(victim.id);
    content = render(kept, dropped.toSorted(compareText));
  }

  return { content, dropped: dropped.toSorted(compareText) };
}

/**
 * Drop order, biggest number first — the section with the largest key is the
 * next to go, so the rule most expensive to lose is the last to leave.
 *
 * Four components, in this order: not-critical, not-floor-tagged, then the
 * declared precedence, then the id. Risk before precedence is the fix for that
 * spec defect (see {@link RuleRisk}); alphabet survives only as the final
 * tiebreak, which
 * is where it belongs — it ranks nothing about a rule except its spelling.
 *
 * TOTAL and DETERMINISTIC: ids are unique within a file's section set, so no
 * two sections compare equal, and every component is read from frontmatter
 * rather than from arrival order. Two builds over one corpus drop the same
 * rule.
 */
function compareDropOrder(a: RuleSection, b: RuleSection): number {
  const critical = rank(a.risk.critical) - rank(b.risk.critical);
  if (critical !== 0) return critical;
  const floor = rank(a.risk.floorTagged) - rank(b.risk.floorTagged);
  if (floor !== 0) return floor;
  const precedence = PRECEDENCE_RANK[a.precedence] - PRECEDENCE_RANK[b.precedence];
  if (precedence !== 0) return precedence;
  return compareText(a.id, b.id);
}

/** A risk flag as a drop rank: held ranks before absent, so a flagged rule survives. */
function rank(flagged: boolean): number {
  return flagged ? 0 : 1;
}

/** The next section to drop: the maximum under {@link compareDropOrder}. */
function lowestRisk(sections: readonly RuleSection[]): RuleSection {
  return sections.reduce((worst, section) =>
    compareDropOrder(section, worst) > 0 ? section : worst,
  );
}

interface AppendixInput {
  /** Content the appendix follows (the core charter body), or "" for a nested file. */
  head: string;
  /** Anchor directory for a nested file; null for the root appendix. */
  scope: string | null;
  /** Heading level of the appendix title. */
  titleLevel: number;
  sections: readonly RuleSection[];
  dropped: readonly string[];
}

/** The appendix as markdown: title, the lossy preamble, sections, then any omissions. */
function renderAppendix(input: AppendixInput): string {
  const blocks: string[] = [];
  if (input.head !== "") blocks.push(input.head.trimEnd());

  const title =
    input.scope === null ? APPENDIX_TITLE : `${APPENDIX_TITLE} — \`${input.scope}\``;
  blocks.push(`${"#".repeat(input.titleLevel)} ${title}`);
  blocks.push(
    "Codex has no glob-scoped rule layer, so the rules below are inlined here instead of " +
      `attaching only when a matching file is read (documented lossy — upstream gap: ${LOSSY_GAP}). ` +
      "Each section names what it was authored to attach to: apply it when those paths are in play.",
  );

  for (const section of input.sections) {
    blocks.push(renderSection(section, input.titleLevel + 1));
  }
  if (input.dropped.length > 0) {
    blocks.push(renderDroppedNotice(input.dropped, input.titleLevel + 1));
  }

  return `${blocks.join("\n\n")}\n`;
}

/** One rule: heading, the attachment notice it must open with, then its body. */
function renderSection(section: RuleSection, level: number): string {
  const heading = `${"#".repeat(level)} ${section.id}`;
  // The corpus body opens with an H1 restating the rule's own title; the
  // section heading already carries the id, so the duplicate goes and the
  // remaining headings shift under it.
  const body = demoteHeadings(stripLeadingH1(section.body), level - 1);
  return [heading, attachmentNote(section), body].filter((part) => part !== "").join("\n\n");
}

/** The DOCUMENTED-LOSSY line every down-converted section opens with. */
function attachmentNote(section: RuleSection): string {
  if (section.reroutedFrom !== undefined) {
    return (
      `**Authored for:** ${globList(section.globs)} — inlined at the repository root because ` +
      `\`${section.reroutedFrom}/${AGENTS_MD_FILE}\` is a workspace-package charter copy with its ` +
      `own writer (documented lossy — upstream gap: ${LOSSY_GAP}).`
    );
  }
  if (section.globs.length === 0) {
    const trigger = section.description === "" ? "no declared trigger" : section.description;
    return (
      `**Trigger:** ${trigger} — inlined here because Codex has no description-triggered ` +
      `rule layer (documented lossy — upstream gap: ${LOSSY_GAP}).`
    );
  }
  return (
    `**Attaches to:** ${globList(section.globs)} — inlined here because Codex cannot scope a ` +
    `rule by glob (documented lossy — upstream gap: ${LOSSY_GAP}).`
  );
}

function globList(globs: readonly string[]): string {
  return globs.map((glob) => `\`${glob}\``).join(", ");
}

/**
 * What the budget cost, named rule by rule — and by which ordering, because a
 * risk-ordered drop that silently changed which rule vanished would be worse
 * than the alphabetical one it replaced. A reader who disagrees with the
 * ranking can see the ranking.
 *
 * The second paragraph is the scope of the claim, and it is not decoration.
 * This notice used to close on "nothing was trimmed silently", which is true of
 * THIS file and false of the run: the client measures the CONCATENATION of the
 * instruction files a session loads ({@link CODEX_AGENTS_MD_BUDGET_BYTES} —
 * declared gap), the shaper sees one file at a time, and this corpus already
 * ships a tree whose files each fit while their total does not. So the notice
 * states the shaping it actually did, says the aggregate is not enforced, and
 * hands over the measurement rather than implying it was taken.
 */
function renderDroppedNotice(dropped: readonly string[], level: number): string {
  return [
    `${"#".repeat(level)} Omitted for the ${CODEX_AGENTS_MD_BUDGET_BYTES}-byte budget`,
    `Codex reads at most ${CODEX_AGENTS_MD_BUDGET_BYTES} bytes (32 KiB) of instruction text, and ` +
      `this setup shapes each ${AGENTS_MD_FILE} to that ceiling on its own. These rules did not ` +
      `fit THIS file and were dropped, lowest risk first — rules marked critical are kept ` +
      `longest, then floor-tagged rules, then by declared precedence, then by id: ` +
      `${dropped.map((id) => `\`${id}\``).join(", ")}. Narrow the content selection to bring ` +
      `them back.`,
    `**Per-file shaping only — the aggregate is not enforced.** The ceiling applies to the ` +
      `CONCATENATION a session loads: the root ${AGENTS_MD_FILE} plus every nested one down to ` +
      `the working directory. Nothing here measures that total, so files that each fit can still ` +
      `overflow together, and the excess is dropped by the client without a message. Check it ` +
      `for the directory you work in: \`cat ${AGENTS_MD_FILE} path/to/dir/${AGENTS_MD_FILE} | ` +
      `wc -c\`, against ${CODEX_AGENTS_MD_BUDGET_BYTES}.`,
  ].join("\n\n");
}

/** The body without its leading H1 title line. */
function stripLeadingH1(body: string): string {
  const trimmed = body.trim();
  if (!trimmed.startsWith("# ")) return trimmed;
  const newline = trimmed.indexOf("\n");
  return newline === -1 ? "" : trimmed.slice(newline + 1).trim();
}

/**
 * Shift every ATX heading down `levels`, capped at H6. Fenced blocks are
 * skipped: a `#` inside a shell example is a comment, not a heading, and
 * rewriting it would change code the rule is quoting.
 */
function demoteHeadings(body: string, levels: number): string {
  if (levels <= 0) return body;
  let fenced = false;

  return body
    .split("\n")
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      const match = /^(#{1,6})(?=\s)/.exec(line);
      if (match === null) return line;
      const hashes = match[1] ?? "";
      return `${"#".repeat(Math.min(6, hashes.length + levels))}${line.slice(hashes.length)}`;
    })
    .join("\n");
}

/** Codepoint order, so output never varies with the host locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
