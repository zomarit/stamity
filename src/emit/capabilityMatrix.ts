/**
 * The capability matrix page, rendered from adapter code.
 *
 * The drift class this closes: a hand-written capability page says
 * what a client supports, an adapter later changes what it emits, and the two
 * disagree with no signal at all — the page keeps reading as true. Here every
 * cell is a projection of a code constant: the four residue planners'
 * {@link AdapterDialectFacts}, the shared `CLIENT_HOOK_GUARANTEES` ladder the
 * emitters read, `ADAPTER_ALLOWLIST_COVERAGE` from the tool translator, and the
 * always-on ratchet pins from `../content/charter.ts`
 * ({@link AlwaysOnDisclosure}).
 * The committed {@link CAPABILITY_MATRIX_DOC_PATH} is rewritten by
 * {@link REGENERATE_COMMAND}, and a test re-renders in-process and
 * byte-compares against it, so the page cannot be hand-edited and cannot lag a
 * change to those declarations.
 *
 * **What the byte-compare does not prove, said here as well as on the page.**
 * It pins the PAGE to the DECLARATIONS. It does not pin a declaration to what
 * the adapter emits — that holds only where a test pins the two together, as
 * `test/emit/hooksInfra.test.ts` does for the hook-config column — and it pins
 * nothing to the client's live documentation. A declared value is prose someone
 * wrote into a constant beside a citation, so a cell is what the adapter SAYS
 * and its access date is how old the saying is. The earlier header claimed the
 * page "cannot drift from what the generator emits", which is the reading a
 * reader takes and one the mechanism does not support.
 *
 * The four planners are imported directly rather than through an adapter
 * barrel: the barrel would make this renderer depend on registration order,
 * and the matrix wants the declarations themselves.
 *
 * Citation discipline is load-bearing, not decorative. A facts entry with no
 * citation — or one whose access date is not an ISO date — refuses to render,
 * naming the client at fault. A platform claim without a date is not a fact,
 * it is a recollection, and the whole point of a generated matrix is that a
 * reader can tell how old each row is. {@link REVISIT_TRIGGERS} extends the
 * same discipline to the currency PROCESS: each named condition that re-opens a
 * decision renders with the oldest access date among the watched client's own
 * citations, so the date on a trigger is a date a page was actually read rather
 * than a stamp anyone can type here.
 *
 * Pure and clock-free: the render is a function of its inputs alone. Access
 * dates come from the facts constants, never from the wall clock, so two runs
 * a month apart are byte-identical until an adapter actually changes.
 */

import { claudeResiduePlanner } from "../adapters/claude.ts";
import { CODEX_SKILLS_LIST_BUDGET_CHARS, codexResiduePlanner } from "../adapters/codex.ts";
import { copilotResiduePlanner } from "../adapters/copilot.ts";
import { cursorResiduePlanner } from "../adapters/cursor.ts";
import {
  ALWAYS_ON_BUDGET_LINES,
  ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX,
  ALWAYS_ON_SHARED_BYTES_WITH_CODEX,
  CHARTER_MAX_LINES,
  DESCRIPTION_PULL_TOOLS,
  RULE_APPENDIX_TOOLS,
} from "../content/charter.ts";
import { CLIENT_HOOK_GUARANTEES, type ClientHookGuarantee } from "../hooks/model.ts";
import {
  ADAPTER_ALLOWLIST_COVERAGE,
  buildAllowlistCoverageTable,
  type AdapterAllowlistCoverage,
} from "../tools/translator.ts";
import { TOOLS, VALID_TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { RULE_DELIVERY_DEFAULT, type RuleDelivery } from "../types/manifest.ts";
import type { AdapterDialectFacts } from "./planner.ts";

/** Repo-relative path of the committed page this module renders. */
export const CAPABILITY_MATRIX_DOC_PATH = "docs/capability-matrix.md";

/** The one command that rewrites {@link CAPABILITY_MATRIX_DOC_PATH}. */
export const REGENERATE_COMMAND = "node scripts/generate-capability-matrix.mjs";

/** An access date is an ISO calendar date; anything else is undated prose. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Column at which {@link paragraph} wraps, matching the page's hand-wrapped prose. */
const PROSE_WIDTH = 95;

// ── Inputs ───────────────────────────────────────────────────────

/**
 * The three per-client data sets the page renders. Named as one input record
 * so the renderer stays a pure function of data — tests exercise the
 * discipline gates by deriving a variant of {@link LIVE_CAPABILITY_INPUTS}
 * instead of hand-building a fixture that would itself drift.
 */
export interface CapabilityMatrixInputs {
  /** One entry per client, in any order; the page renders in `TOOLS` order. */
  readonly facts: readonly AdapterDialectFacts[];
  /** Rendered row-for-row, in ITS order — the table is a strength ladder. */
  readonly guarantees: readonly ClientHookGuarantee[];
  /**
   * Per-client allowlist enforcement. Checked for client coverage here, but
   * the rows are rendered by the translator's own `buildAllowlistCoverageTable`
   * — one formatter owns that row shape, beside the transforms it describes,
   * so a second copy of it here could not disagree with the first.
   */
  readonly coverage: readonly AdapterAllowlistCoverage[];
  /** The currency process's named revisit conditions, in declared order. */
  readonly triggers: readonly RevisitTrigger[];
  /** What a session loads before it has done anything, per client. */
  readonly alwaysOn: AlwaysOnDisclosure;
  /**
   * The four plugin containers, or absent.
   *
   * OPTIONAL, and the reason is a layering fact rather than a preference. These
   * facts are decided by the plugin emitter's per-client modules under
   * `scripts/plugins/clients/`, which are build-time modules: they are not
   * bundled into `dist/` and this file — engine code — cannot import them. So
   * the one caller that CAN read them supplies them:
   * `scripts/generate-capability-matrix.mjs` builds the rows through
   * `scripts/plugin-container-facts.mjs` and passes them here, and
   * `test/emit/capabilityMatrix.test.ts` byte-compares the committed page
   * against a render built the same way. A render without them omits the
   * section rather than inventing one — which is what {@link
   * renderCapabilityMatrix} does, and why it is not the function that writes
   * the page.
   */
  readonly plugins?: readonly PluginContainerFact[];
}

/**
 * Every artifact class a plugin container declares a status for, in the order
 * the capability file lists them (`scripts/plugins/capability.mjs`).
 *
 * `mcp` is on this list and not on the manifest's `PluginOwnedClass`, and the
 * difference is real: a container can DECLARE mcp repository-owned, which all
 * four do, while the manifest only ever records classes a plugin owns.
 */
export const PLUGIN_CONTAINER_CLASSES = [
  "agent",
  "skill",
  "command",
  "rule",
  "hooks",
  "mcp",
] as const;

/** One artifact class as a container declares it. */
export type PluginContainerClass = (typeof PLUGIN_CONTAINER_CLASSES)[number];

/**
 * One client's plugin container, as its emitter module declares it.
 *
 * `carries` and `repositoryOwned` partition {@link PLUGIN_CONTAINER_CLASSES}:
 * every class is in exactly one of them, which is what makes the pair a
 * BOUNDARY rather than two lists. A class in neither would be a class nobody
 * delivers, and a class in both would be the duplicate `stamity check`'s
 * `plugin-duplicates` row exists to report.
 */
export interface PluginContainerFact {
  readonly tool: Tool;
  /** The container manifest's path inside the root — what the client discovers it by. */
  readonly container: string;
  /** Classes the root ships and the client reads from there. */
  readonly carries: readonly PluginContainerClass[];
  /** Classes `stamity plugin setup` writes into the repository instead. */
  readonly repositoryOwned: readonly PluginContainerClass[];
  /** What an operator types to reach each carried class. */
  readonly invocation: string;
  /** The client version the container needs, with the reason `unknown` is one. */
  readonly floor: string;
  /** The environment variable this client expands inside the root. */
  readonly rootVariable: string;
  /** Dated sources behind the row — the same shape a dialect citation takes. */
  readonly citations: readonly { readonly url: string; readonly accessDate: string }[];
}

/**
 * The always-on cost, as data this renderer projects rather than measures.
 *
 * The measurement itself is a corpus read — charter lines plus the rule files a
 * client cannot attach conditionally — and this module is a synchronous, pure
 * function of its inputs with no filesystem behind it. So the figures arrive as
 * the ratchet constants `src/content/charter.ts` already pins, and the page
 * says which they are: a ceiling measured at the last refresh, not a reading
 * taken as the page rendered.
 *
 * That is a real limit, stated rather than hidden. The pins are held to the
 * corpus by `test/corpus/invariants.test.ts` (every client's measured composite
 * must sit under its ceiling) and to the emission by the cross-client golden
 * (both byte figures), so a stale cell here means a ratchet nobody lowered — a
 * number that is too high — never a number that is too low.
 */
export interface AlwaysOnDisclosure {
  /** Physical-line ceiling per client, pinned at the last measured load. */
  readonly ceilings: Readonly<Record<Tool, number>>;
  /** The charter TEMPLATE's own cap, which the composite is read against. */
  readonly charterCap: number;
  /** Bytes of the shared root instruction file with codex among the selection. */
  readonly sharedBytesWithCodex: number;
  /** The same file without it — the charter alone. */
  readonly sharedBytesWithoutCodex: number;
  /**
   * How many rules the codex budget shaper drops from the appendix on the full
   * selection. A count rather than the ids: the ids are only knowable by
   * running the emission, which this renderer cannot do, and a hand-kept list
   * would be a second place for them to be wrong. The emitted file names them,
   * and `test/adapters/codex.test.ts` pins both this number and that set
   * against the real emission.
   */
  readonly codexDroppedRuleCount: number;
  /**
   * The delivery mode the figures above were measured under, so a reader knows
   * which of the two shapes the page describes and the column below cannot
   * silently describe the other one.
   */
  readonly ruleDelivery: RuleDelivery;
  /**
   * The rule ids codex still folds into its appendix under that mode — the ones
   * that have to be in front of the model unconditionally. Ids and not a count
   * here, unlike the dropped set above, because these are a DECLARED property
   * of the corpus (`precedence: critical`, a `floor:*` tag, an anchorable glob
   * set) rather than an outcome of the 32 KiB shaper, and a reader choosing
   * codex wants to know which floors survive by name.
   */
  readonly codexFoldedRuleIds: readonly string[];
  /** How many rules reach codex as a projected skill instead of as appendix text. */
  readonly codexRuleSkillCount: number;
  /**
   * Characters the whole projected skills list costs codex — every skill's
   * `name` plus `description`, the text the client holds for the session so it
   * can decide when to open one. The same measurement the adapter refuses past,
   * taken on the full selection; like {@link codexDroppedRuleCount} it needs an
   * emission this renderer cannot run, so it is pinned here and held to the
   * real emission by `test/adapters/codex.test.ts`.
   */
  readonly codexSkillsListChars: number;
  /** The client's own published ceiling on that list. */
  readonly codexSkillsListCap: number;
  /**
   * Per client, how many rule-skills in the SHARED `.agents/skills/` tree
   * duplicate a rule that client still receives as a rule of its own.
   *
   * The residual of the delivery option, and the one cost co-selection creates
   * rather than reclaims. The shared tree holds the UNION of every selected
   * client's demotions because it is one directory that cursor, copilot and
   * codex all read — a directory cannot be made client-specific — so a rule
   * codex demoted arrives for cursor too, beside the `.mdc` rule cursor already
   * has. Zero for a client that reads no shared tree (its native copy is
   * filtered to its own demotions) and zero for the client whose demotions the
   * union is made of.
   *
   * Needs an emission, like the two figures above, so it is pinned here and
   * held to the real one by `test/adapters/claude.test.ts`.
   */
  readonly sharedTreeDuplicateRules: Readonly<Record<Tool, number>>;
}

/**
 * One named condition that re-opens a design decision, from the currency
 * process.
 *
 * The process named five and the page recorded one of them, so four conditions
 * were a process nobody could check: an unrecorded trigger fires without a
 * reader, and a trigger recorded as a GAP ("upstream gap: open codex#34002")
 * says what is broken without saying what the engine does when it is fixed.
 * Both halves are separate fields here so a row cannot carry one without the
 * other.
 */
export interface RevisitTrigger {
  /** The condition, in the currency process's own words. */
  readonly when: string;
  /** What the engine does when it fires — the other half of the pair. */
  readonly action: string;
  /**
   * The client whose declared facts and dated sources are where this
   * condition's status is read, or `null` when no supported client covers it.
   * `null` is a real answer, not a gap: a trigger about a client this engine
   * has no adapter for is watched by nothing here, and rendering a date beside
   * it would claim a page someone read.
   */
  readonly watch: Tool | null;
  /** Where the condition stands in this repo today. */
  readonly status: string;
}

/**
 * The five named revisit triggers, in the order the currency process names
 * them.
 *
 * Each `status` is an assertion about this repo, so each is pinned to a
 * declaration by `test/emit/capabilityMatrix.test.ts` rather than left as prose
 * — the codex row against that client's `ruleShape`, the entry-file row against
 * the one non-null `entryFile`, the container row against the absent plugin
 * claim, the deny-gate row against copilot's own `deny-gate` cap. The
 * Antigravity row is the one with nothing to pin: no adapter exists, which is
 * exactly what its status says.
 */
export const REVISIT_TRIGGERS: readonly RevisitTrigger[] = [
  {
    when: "Antigravity adoption/demand",
    action: "adapter #5",
    watch: null,
    status:
      "No adapter, so no row above carries a source for it — the trigger is adoption or " +
      "demand, not a page this repo re-reads.",
  },
  {
    when: "codex#34002 resolution",
    action: "native glob emission",
    watch: "codex",
    status:
      "Open — that client's declared rule shape still down-converts conditional rules into " +
      "nested `AGENTS.md` files.",
  },
  {
    when: "Claude Code AGENTS.md support change",
    action: "drop the bridge",
    watch: "claude",
    status:
      "Unchanged — `claude` is the one client still declaring an entry file, so the bridge " +
      "block stays emitted.",
  },
  {
    when: "Agent Plugins scope expansion",
    action: "container widens",
    watch: "claude",
    status:
      "Four containers are emitted — one root per client, built by " +
      "`scripts/generate-plugin-packages.mjs` — and the Plugin containers section above states " +
      "what each carries. The condition is now about the classes a container may hold: an agent " +
      "or a command class reaching the Agent Plugins format would move two of codex's " +
      "repository-owned rows into its root.",
  },
  {
    when: "VS Code deny-gate GA",
    action: "recheck editor-specific hook compatibility",
    watch: "copilot",
    status:
      "CLI/cloud preToolUse hooks are emitted now, with timeout fail-open. " +
      "[VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks) " +
      "remain Preview; editor-specific compatibility needs separate verification.",
  },
];

/**
 * The always-on figures as `src/content/charter.ts` pins them today.
 *
 * `codexDroppedRuleCount` is the one value with no constant behind it, because
 * the drop set is a property of the corpus and the 32 KiB ceiling together
 * rather than of any declaration. It is re-measured on every golden refresh and
 * held to the emission by the codex adapter suite.
 */
const LIVE_ALWAYS_ON: AlwaysOnDisclosure = {
  ceilings: ALWAYS_ON_BUDGET_LINES,
  charterCap: CHARTER_MAX_LINES,
  sharedBytesWithCodex: ALWAYS_ON_SHARED_BYTES_WITH_CODEX,
  sharedBytesWithoutCodex: ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX,
  // 8 -> 0 on the `on-demand` flip: what reaches the appendix is now three
  // floor-class rules, which fit the 32 KiB ceiling with room to spare, so the
  // shaper has nothing to drop. The nine it used to drop or barely fit are
  // delivered as skills instead. (No dated comment here, and none below: this
  // module carries no ISO date literal by contract — the dated record of this
  // measurement is the ratchet comment in `../content/charter.ts`.)
  codexDroppedRuleCount: 0,
  ruleDelivery: RULE_DELIVERY_DEFAULT,
  codexFoldedRuleIds: ["injection-screening", "secrets", "security-patterns"],
  codexRuleSkillCount: 9,
  // 5_570 characters over the 17 skills of the full selection — the 8 shipped
  // skills plus the 9 projected rules — measured against the real emission by
  // `test/adapters/codex.test.ts`, which fails when this number stops matching
  // it. 70% of the ceiling, and the remainder is the headroom a repository
  // adding its own skills spends into.
  codexSkillsListChars: 5_570,
  codexSkillsListCap: CODEX_SKILLS_LIST_BUDGET_CHARS,
  // Measured on the full four-client selection. `cursor` demotes nothing of its
  // own, so all nine rule-skills in the shared tree duplicate an `.mdc` rule it
  // already has; `copilot` demoted two of the nine itself, so seven are
  // duplicates of its instruction files. `codex` is the client the union is made
  // of, and `claude` reads no shared tree — its native copy carries only its own
  // two demotions.
  sharedTreeDuplicateRules: { claude: 0, cursor: 9, copilot: 7, codex: 0 },
};

/** What the shipped page is made of: the live declarations, nothing else. */
export const LIVE_CAPABILITY_INPUTS: CapabilityMatrixInputs = {
  facts: [
    claudeResiduePlanner.facts,
    cursorResiduePlanner.facts,
    copilotResiduePlanner.facts,
    codexResiduePlanner.facts,
  ],
  guarantees: CLIENT_HOOK_GUARANTEES,
  coverage: ADAPTER_ALLOWLIST_COVERAGE,
  triggers: REVISIT_TRIGGERS,
  alwaysOn: LIVE_ALWAYS_ON,
};

// ── Validation ───────────────────────────────────────────────────

function fail(message: string): never {
  throw new EngineError(message, { code: "ADAPTER_ERROR" });
}

/**
 * Every client is present exactly once, and no client outside {@link TOOLS}
 * appears. A missing row would silently shorten a table — the reader would
 * see four clients where the engine supports five, which is the same lie the
 * generated page exists to prevent.
 */
function requireExactToolCoverage(label: string, rows: readonly { tool: Tool }[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!VALID_TOOLS.has(row.tool)) {
      fail(`${label} declares \`${row.tool}\`, which is not a supported client.`);
    }
    if (seen.has(row.tool)) fail(`${label} declares \`${row.tool}\` twice.`);
    seen.add(row.tool);
  }
  const missing = TOOLS.filter((tool) => !seen.has(tool));
  if (missing.length > 0) {
    fail(`${label} is missing a row for ${missing.map((t) => `\`${t}\``).join(", ")}.`);
  }
}

/** A dated citation behind every claim, or the client's row does not render. */
function requireCitations(facts: AdapterDialectFacts): void {
  if (facts.citations.length === 0) {
    fail(
      `The \`${facts.tool}\` adapter declares no platform citation, so its capability row ` +
        `would state undated facts. Add at least one { url, accessDate } to its dialect facts.`,
    );
  }
  for (const citation of facts.citations) {
    if (citation.url.trim() === "") {
      fail(`The \`${facts.tool}\` adapter declares a citation with no URL.`);
    }
    if (!ISO_DATE.test(citation.accessDate)) {
      fail(
        `The \`${facts.tool}\` citation ${citation.url} carries access date ` +
          `"${citation.accessDate}", which is not an ISO calendar date (YYYY-MM-DD).`,
      );
    }
  }
}

/**
 * Every container names a home, a variable, an invocation form and a dated
 * source, and its two class lists PARTITION {@link PLUGIN_CONTAINER_CLASSES}.
 *
 * The partition is the assertion worth having. A class missing from both lists
 * is one no reader can find an owner for, and a class in both is a container
 * claiming to deliver what the repository also writes — the duplicate state
 * `stamity check` reports rather than a fact this page should publish.
 */
function requirePluginContainers(rows: readonly PluginContainerFact[]): void {
  requireExactToolCoverage("The plugin-container set", rows);
  for (const row of rows) {
    for (const [label, value] of [
      ["container manifest path", row.container],
      ["root variable", row.rootVariable],
      ["invocation form", row.invocation],
      ["client floor", row.floor],
    ] as const) {
      if (value.trim() === "") {
        fail(`The \`${row.tool}\` plugin container declares no ${label}.`);
      }
    }
    if (row.carries.length === 0) {
      fail(
        `The \`${row.tool}\` plugin container carries no class at all, so the root it describes ` +
          `would deliver nothing.`,
      );
    }
    const declared = [...row.carries, ...row.repositoryOwned];
    for (const klass of PLUGIN_CONTAINER_CLASSES) {
      const count = declared.filter((name) => name === klass).length;
      if (count === 0) {
        fail(
          `The \`${row.tool}\` plugin container declares no owner for \`${klass}\`, so a reader ` +
            `could not tell whether the root or the repository delivers it.`,
        );
      }
      if (count > 1) {
        fail(
          `The \`${row.tool}\` plugin container declares \`${klass}\` twice — a class is carried ` +
            `or repository-owned, never both.`,
        );
      }
    }
    if (row.citations.length === 0) {
      fail(
        `The \`${row.tool}\` plugin container declares no source, so its client floor would be ` +
          `an undated claim.`,
      );
    }
    for (const citation of row.citations) {
      if (citation.url.trim() === "") {
        fail(`The \`${row.tool}\` plugin container declares a source with no URL.`);
      }
      if (!ISO_DATE.test(citation.accessDate)) {
        fail(
          `The \`${row.tool}\` plugin container's source ${citation.url} carries access date ` +
            `"${citation.accessDate}", which is not an ISO calendar date (YYYY-MM-DD).`,
        );
      }
    }
  }
}

/**
 * Every client carries a ceiling, both byte figures are real, and the with-codex
 * figure is the larger of the two. A zero or a missing client would render a
 * cost claim the corpus never measured, which is the one thing this section is
 * for.
 */
function requireAlwaysOnFigures(alwaysOn: AlwaysOnDisclosure): void {
  for (const tool of TOOLS) {
    const ceiling = alwaysOn.ceilings[tool];
    if (!Number.isFinite(ceiling) || ceiling <= 0) {
      fail(
        `The always-on disclosure carries no measured ceiling for \`${tool}\`, so its row would ` +
          `state a load nobody took.`,
      );
    }
  }
  if (alwaysOn.sharedBytesWithCodex <= alwaysOn.sharedBytesWithoutCodex) {
    fail(
      `The always-on disclosure puts the shared instruction file at ` +
        `${alwaysOn.sharedBytesWithCodex} bytes with codex and ` +
        `${alwaysOn.sharedBytesWithoutCodex} without it. The rules appendix only adds bytes, so ` +
        `these two are the wrong way round or one of them is stale.`,
    );
  }
  // A zero here would render "0 of 8000 characters" — a budget claim from a
  // measurement nobody took — and a total over the cap would publish a
  // selection the emission itself refuses.
  if (alwaysOn.codexSkillsListChars <= 0 || alwaysOn.codexSkillsListChars > alwaysOn.codexSkillsListCap) {
    fail(
      `The always-on disclosure puts the codex skills list at ` +
        `${alwaysOn.codexSkillsListChars} characters against a cap of ` +
        `${alwaysOn.codexSkillsListCap}. A list at or below zero was never measured, and one ` +
        `over the cap is an emission this setup refuses, so neither can be published as a cost.`,
    );
  }
  if (alwaysOn.codexFoldedRuleIds.length === 0) {
    fail(
      `The always-on disclosure names no rule that codex still folds into its appendix. The ` +
        `floors are what that appendix is for, so an empty set is a stale reading rather than a ` +
        `client that stopped needing them.`,
    );
  }
  for (const tool of TOOLS) {
    const duplicates = alwaysOn.sharedTreeDuplicateRules[tool];
    // A negative or fractional count is a reading nobody took; a count over the
    // projected set would claim more duplicates than there are directories.
    if (!Number.isInteger(duplicates) || duplicates < 0) {
      fail(
        `The always-on disclosure puts \`${tool}\`'s shared-tree duplicate count at ` +
          `${duplicates}, which is not a number of directories anyone counted.`,
      );
    }
    if (duplicates > alwaysOn.codexRuleSkillCount) {
      fail(
        `The always-on disclosure says \`${tool}\` receives ${duplicates} duplicated rules from a ` +
          `shared tree holding ${alwaysOn.codexRuleSkillCount} rule-skills. A client cannot be ` +
          `handed more copies than the tree contains.`,
      );
    }
  }
}

/** A trigger with the facts that date it already resolved — or none to date it. */
interface DatedTrigger {
  readonly trigger: RevisitTrigger;
  /** The watched client's facts, or `null` when nothing here watches it. */
  readonly watched: AdapterDialectFacts | null;
}

/**
 * Validate the triggers and resolve each one's watched facts in the same pass.
 * A blank half is the defect the split fields exist to catch; a watched client
 * with no facts here would render a status with no date behind it, which is
 * the undated recollection {@link requireCitations} refuses one level down.
 *
 * The lookup happens here rather than in the cell renderer so the renderer has
 * no miss to narrow: every row it receives already carries its facts or a
 * declared `null`.
 */
function resolveTriggers(
  triggers: readonly RevisitTrigger[],
  ordered: readonly AdapterDialectFacts[],
): DatedTrigger[] {
  if (triggers.length === 0) {
    fail(
      "The currency block declares no revisit trigger, so the page would publish a currency " +
        "process with nothing bound to it.",
    );
  }
  const seen = new Set<string>();
  return triggers.map((trigger) => {
    for (const [label, value] of [
      ["condition", trigger.when],
      ["action", trigger.action],
      ["status", trigger.status],
    ] as const) {
      if (value.trim() === "") {
        fail(
          `A revisit trigger declares no ${label}, so its row would render a blank cell — a ` +
            `condition with no action, or an action with nowhere it stands, is not a trigger.`,
        );
      }
    }
    if (seen.has(trigger.when)) fail(`The revisit trigger "${trigger.when}" is declared twice.`);
    seen.add(trigger.when);

    if (trigger.watch === null) return { trigger, watched: null };
    const watched = ordered.find((facts) => facts.tool === trigger.watch);
    if (watched === undefined) {
      fail(
        `The revisit trigger "${trigger.when}" watches \`${trigger.watch}\`, which declares no ` +
          `dialect facts here, so its status would carry no access date.`,
      );
    }
    return { trigger, watched };
  });
}

// ── Markdown primitives ──────────────────────────────────────────

/**
 * One table cell. Newlines collapse (a wrapped declaration is still one cell)
 * and pipes escape — GFM reads an unescaped `|` as a column break even inside
 * a code span, so a dialect quirk that contains one would silently shear the
 * row into extra columns.
 */
function cell(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, " ").replaceAll("|", "\\|").trim();
}

/** Fixed-width markdown table: header, delimiter, then the given rows. */
function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ];
}

/**
 * One paragraph as page lines, greedily wrapped at {@link PROSE_WIDTH}.
 *
 * Used only where a sentence carries an interpolated figure: a hand-wrapped
 * literal would keep its line breaks where the OLD number ended, so a figure
 * that gained a digit would leave a ragged paragraph behind on every refresh.
 * Deterministic — one input, one wrapping — so the byte-compare still holds.
 */
function paragraph(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ").filter((part) => part !== "")) {
    if (current === "") current = word;
    else if (current.length + 1 + word.length <= PROSE_WIDTH) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

/** Inline code, or a plain word when the value is a rendered absence. */
function code(value: string): string {
  return `\`${value}\``;
}

// ── Cell renderers ───────────────────────────────────────────────

/**
 * `hooksConfigPath: null` is the declared "this client takes no hook config
 * in v1", and `entryFile: null` is the declared "AGENTS.md is native here" —
 * both per the field contracts on {@link AdapterDialectFacts}. Rendering the
 * field's meaning keeps the absence readable without inventing a claim.
 */
function hooksConfigCell(facts: AdapterDialectFacts): string {
  return facts.hooksConfigPath === null ? "none emitted" : code(facts.hooksConfigPath);
}

function entryFileCell(facts: AdapterDialectFacts): string {
  return facts.entryFile === null ? "none — `AGENTS.md` is native" : code(facts.entryFile);
}

/** The honest one-line strength, joined from the guarantee ladder. */
function enforcementCell(guarantee: ClientHookGuarantee | undefined): string {
  if (guarantee === undefined) return "undeclared";
  return guarantee.blockingExitCode === null
    ? `${code(guarantee.failMode)} — never blocks`
    : `${code(guarantee.failMode)} — blocks on exit ${code(String(guarantee.blockingExitCode))}`;
}

/** `null` renders as the mandated words, not as an empty or invented code. */
function blockingExitCell(guarantee: ClientHookGuarantee): string {
  return guarantee.blockingExitCode === null
    ? "never blocks"
    : code(String(guarantee.blockingExitCode));
}

// ── Sections ─────────────────────────────────────────────────────

function glanceSection(
  ordered: readonly AdapterDialectFacts[],
  guarantees: readonly ClientHookGuarantee[],
): string[] {
  const rows = ordered.map((facts) => [
    code(facts.tool),
    entryFileCell(facts),
    facts.readsAgentsSkillsDir ? "yes" : "no",
    hooksConfigCell(facts),
    enforcementCell(guarantees.find((row) => row.tool === facts.tool)),
    code(facts.mcpDialect),
  ]);
  return [
    "## Coverage at a glance",
    "",
    ...table(
      [
        "Client",
        "Entry file",
        "Reads `.agents/skills/`",
        "Hook config",
        "Hook enforcement",
        "MCP dialect",
      ],
      rows,
    ),
  ];
}

/** One client's row group: declared facts, declared caps, dated sources. */
function clientSection(facts: AdapterDialectFacts): string[] {
  const lines = [
    `### ${code(facts.tool)}`,
    "",
    ...table(
      ["Fact", "Declared value"],
      [
        ["Rule shape", facts.ruleShape],
        ["Agent format", facts.agentsFormat],
        ["Hook config", hooksConfigCell(facts)],
        ["Reads `.agents/skills/`", facts.readsAgentsSkillsDir ? "yes" : "no"],
        ["MCP dialect", code(facts.mcpDialect)],
        ["Entry file", entryFileCell(facts)],
      ],
    ),
    "",
  ];

  if (facts.caps.length === 0) {
    lines.push("Declared caps: none.", "");
  } else {
    lines.push(
      "Declared caps:",
      "",
      ...table(
        ["Cap", "Declared value"],
        facts.caps.map((cap) => [code(cap.name), cap.value]),
      ),
      "",
    );
  }

  lines.push(
    "Sources:",
    "",
    ...facts.citations.map((c) => `- <${c.url}> — accessed ${c.accessDate}`),
  );
  return lines;
}

/**
 * The four plugin containers: one row each, then the dated sources behind them.
 *
 * Rendered in {@link TOOLS} order like every other table here, and the class
 * lists render in {@link PLUGIN_CONTAINER_CLASSES} order rather than in the
 * order a module happened to declare them, so two containers agreeing about a
 * class read the same way.
 */
function pluginSection(rows: readonly PluginContainerFact[]): string[] {
  const ordered = TOOLS.map((tool) => {
    const row = rows.find((candidate) => candidate.tool === tool);
    // Unreachable after the coverage check; kept so the narrowing is real.
    if (row === undefined) fail(`No plugin container declared for \`${tool}\`.`);
    return row;
  });
  const classes = (list: readonly PluginContainerClass[]): string =>
    list.length === 0
      ? "none"
      : PLUGIN_CONTAINER_CLASSES.filter((klass) => list.includes(klass)).join(", ");

  return [
    "## Plugin containers",
    "",
    "A release also publishes one plugin root per client. Each root's own emitter module decides",
    "which artifact classes travel inside it and which stay in the repository, and this table is",
    "built from those modules rather than beside them. `carried` means the root ships the class",
    "and the client reads it from there; the repository-owned column is what",
    "`stamity plugin setup` writes instead. Together the two columns cover every class, so no",
    "class is left without an owner.",
    "",
    ...table(
      [
        "Client",
        "Container manifest",
        "Carries",
        "Repository-owned",
        "Invocation",
        "Root variable",
        "Client floor",
      ],
      ordered.map((row) => [
        code(row.tool),
        code(row.container),
        classes(row.carries),
        classes(row.repositoryOwned),
        row.invocation,
        code(row.rootVariable),
        row.floor,
      ]),
    ),
    "",
    "Sources:",
    "",
    ...ordered.flatMap((row) =>
      row.citations.map((c) => `- ${code(row.tool)}: <${c.url}> — accessed ${c.accessDate}`),
    ),
  ];
}

function guaranteeSection(guarantees: readonly ClientHookGuarantee[]): string[] {
  return [
    "## Hook guarantee honesty",
    "",
    "A hook written once is a gate on some of these clients and telemetry on others. Each row",
    "states what that client enforces, read from the same table the emitters use, so this page",
    "and the emitted guards cannot disagree. Rows keep the ladder order: strongest first.",
    "",
    ...table(
      ["Client", "Fail mode", "Blocking exit code", "What an operator actually gets"],
      guarantees.map((row) => [
        code(row.tool),
        code(row.failMode),
        blockingExitCell(row),
        row.notes,
      ]),
    ),
  ];
}

/**
 * The staleness bound for one client: the OLDEST access date among its
 * citations, not the newest. A trigger's status is only as fresh as the least
 * recently read page behind it, so the newest date would flatter every row that
 * carries one stale source.
 */
function oldestAccessDate(facts: AdapterDialectFacts): string {
  // ISO calendar dates sort lexicographically, and requireCitations has already
  // refused every other shape, so the string minimum IS the earliest date.
  // Seedless reduce: requireCitations guarantees at least one citation, so
  // there is no empty case to invent a date for.
  return facts.citations
    .map((citation) => citation.accessDate)
    .reduce((earliest, date) => (date < earliest ? date : earliest));
}

/** Where a trigger's status is read, and how old the reading can be. */
function watchCell(row: DatedTrigger): string {
  if (row.watched === null) return "unwatched — no supported client carries a source for it";
  return `${code(row.watched.tool)}, oldest source read ${oldestAccessDate(row.watched)}`;
}

function currencySection(rows: readonly DatedTrigger[]): string[] {
  return [
    "## Currency and revisit triggers",
    "",
    "The standing check is per release: re-read each client's sources, regenerate this page, and",
    "the diff is the currency report. On top of it, these named conditions each re-open a",
    "decision when they fire. A row states where its condition stands in this repo today and the",
    "oldest access date among the watched client's sources — the bound on how stale that status",
    "can be, since nothing here re-reads a page on its own.",
    "",
    ...table(
      ["Revisit when", "Then", "Status today", "Where the status is read"],
      rows.map((row) => [row.trigger.when, row.trigger.action, row.trigger.status, watchCell(row)]),
    ),
  ];
}

/**
 * What one client loads unconditionally, read off the two attach-primitive sets
 * and the delivery mode rather than restated here. A client that gains or loses
 * the primitive moves this cell with it, and so does a change of mode, so the
 * reason and the number beside it cannot disagree — which they did the moment
 * the mode became a variable and this cell did not.
 */
function alwaysOnReasonCell(tool: Tool, mode: RuleDelivery): string {
  if (DESCRIPTION_PULL_TOOLS.has(tool)) {
    return "the charter alone — a rule with no globs is pulled in when the conversation matches it";
  }
  if (RULE_APPENDIX_TOOLS.has(tool)) {
    return mode === "on-demand"
      ? "the charter plus the rules that must be unconditional — critical, floor-tagged, or " +
          "anchored to a nested instruction file; the rest are skills"
      : "the charter plus EVERY selected rule — no per-rule attach mechanism, so the whole set " +
          "is folded into the one instruction file";
  }
  return mode === "on-demand"
    ? "the charter alone — a rule with no globs is delivered as a skill instead, and every " +
        "other rule attaches on paths"
    : "the charter plus every rule with no globs — those carry no attach trigger, so they load " +
        "every session";
}

/**
 * How a rule with no globs reaches one client under the disclosed delivery
 * mode. Derived from the mode and the attach-primitive set rather than typed
 * per client, so a page rendered under the other mode says the other thing
 * instead of keeping this one's wording.
 */
function deliveryCell(tool: Tool, mode: RuleDelivery): string {
  if (DESCRIPTION_PULL_TOOLS.has(tool)) return "rule, pulled on relevance";
  return mode === "on-demand" ? "skill, on demand" : "rule, every session";
}

function alwaysOnSection(alwaysOn: AlwaysOnDisclosure): string[] {
  const ratio = (alwaysOn.sharedBytesWithCodex / alwaysOn.sharedBytesWithoutCodex).toFixed(1);
  return [
    "## Always-on cost by client",
    "",
    ...paragraph(
      "What a session pays before it has done anything: the charter every client reads, plus " +
        "every rule that client cannot attach conditionally. The charter TEMPLATE is capped at " +
        `${alwaysOn.charterCap} physical lines, and what a session actually loads is that ` +
        "template plus whatever rules the client's own delivery leaves in front of it.",
    ),
    "",
    ...table(
      [
        "Client",
        "Always-on lines",
        "Delivery of description-scoped rules",
        "What it loads unconditionally",
      ],
      TOOLS.map((tool) => [
        code(tool),
        String(alwaysOn.ceilings[tool]),
        deliveryCell(tool, alwaysOn.ruleDelivery),
        alwaysOnReasonCell(tool, alwaysOn.ruleDelivery),
      ]),
    ),
    "",
    ...paragraph(
      `Measured under \`ruleDelivery: ${alwaysOn.ruleDelivery}\`, the shipped default. A rule ` +
        "that carries no globs has no attach trigger, so under `always-on` claude and copilot " +
        "load its whole body every session; under `on-demand` it is projected as " +
        "`.agents/skills/stamity-<rule-id>/SKILL.md` and the client opens it when its " +
        "description matches. Cursor is the one client that never needed the option — its own " +
        "rule layer already pulls such a rule on relevance. A repository can take the other " +
        "shape back with `stamity config set ruleDelivery always-on`, which moves the first two " +
        "columns and nothing else.",
    ),
    "",
    ...paragraph(
      "The line figures are the ratchet ceilings in `src/content/charter.ts`, each pinned at " +
        "the load measured on the last corpus refresh: the corpus suite fails the build when a " +
        "client's real composite differs from its cell in either direction, so a cell that grew " +
        "is a slice nobody authorised and one that shrank is a saving nobody wrote down. They " +
        "are a bound a reader can plan against, not a reading this page took as it rendered.",
    ),
    "",
    ...paragraph(
      "**What co-selecting codex costs every other client.** Selecting `codex` does not add a " +
        "codex-only file. It rewrites the root `AGENTS.md` that every other selected client " +
        "already reads, so a claude+codex repository hands claude the codex rules appendix too: " +
        `${alwaysOn.sharedBytesWithCodex} bytes of shared instruction text against ` +
        `${alwaysOn.sharedBytesWithoutCodex} without it — ≈${ratio}x the always-on bytes every ` +
        "co-selected client pays.",
    ),
    "",
    ...paragraph(
      "**What codex folds, and what it pulls.** Under the delivery mode above, the appendix " +
        `carries ${alwaysOn.codexFoldedRuleIds.length} rules — ` +
        `${alwaysOn.codexFoldedRuleIds.map((id) => code(id)).join(", ")} — and they are there ` +
        "for the reason the client has no conditional layer to put them anywhere else: each is " +
        "either marked critical or carries a `floor:*` tag, and a floor that loads on relevance " +
        "is a floor that stops binding the moment the model does not notice it applies. The " +
        `other ${alwaysOn.codexRuleSkillCount} rules are projected as ` +
        "`.agents/skills/stamity-<rule-id>/SKILL.md` instead, one directory each.",
    ),
    "",
    ...paragraph(
      "**What that costs the clients beside it.** Those directories sit in the SHARED " +
        "`.agents/skills/` tree, which cursor, copilot and codex all read — a directory cannot " +
        "be made client-specific, so it holds the union of every selected client's demotions. " +
        "Co-selecting `codex` therefore hands " +
        TOOLS.filter((tool) => alwaysOn.sharedTreeDuplicateRules[tool] > 0)
          .map((tool) => `${code(tool)} ${alwaysOn.sharedTreeDuplicateRules[tool]}`)
          .join(" and ") +
        " rules a second time: each is already delivered to that client as its own `.mdc` rule " +
        "or `.instructions.md` file, and is now also description-pullable as a skill. The " +
        "duplicate is pulled on relevance and never loaded at launch, so it moves none of the " +
        "line figures above — and a selection without `codex` does not pay it at all. `claude` " +
        "is absent from that list because it reads no shared tree: its native skills directory " +
        "carries only the rules it demoted itself.",
    ),
    "",
    ...paragraph(
      "That trade is paid in a second budget, so it is measured too. The client holds every " +
        "skill's name and description for the whole session in order to decide when to open " +
        `one, and caps that list at ${alwaysOn.codexSkillsListCap} characters when the context ` +
        `window is unknown. The full selection measures ${alwaysOn.codexSkillsListChars} — ` +
        "the shipped skills plus the projected rules — and emission refuses outright rather " +
        "than truncating past the cap, the same way it refuses an oversized instruction file. " +
        "The remaining headroom is what a repository's own skills spend into.",
    ),
    "",
    ...paragraph(
      "The appendix is shaped to the client's own 32 KiB ceiling, lowest risk first — rules " +
        "marked critical are kept longest, then floor-tagged rules, then declared precedence, " +
        `then id. On the full selection it drops ${alwaysOn.codexDroppedRuleCount} rules. The ` +
        "emitted file names any it dropped in its own omission notice, so the current set is " +
        `read there rather than here. Re-measure with \`${REGENERATE_COMMAND}\` after a corpus ` +
        "change.",
    ),
  ];
}

function coverageSection(coverage: readonly AdapterAllowlistCoverage[]): string[] {
  return [
    "## Agent tool-allowlist enforcement coverage",
    "",
    "How far each client can actually hold an agent to its granted tools. Where a client",
    "exposes no primitive the emission is none at all — a guessed frontmatter key reads to an",
    `operator as a restriction that is not there. ${coverage.length} clients, one row each:`,
    "",
    buildAllowlistCoverageTable(),
  ];
}

// ── Render ───────────────────────────────────────────────────────

/**
 * Render the page from explicit inputs. Deterministic and newline-terminated:
 * clients render in canonical {@link TOOLS} order, facts and caps in their
 * declared order, guarantees in the ladder's own order.
 *
 * Throws `EngineError` (`ADAPTER_ERROR`) when a data set does not cover the
 * clients exactly once, when a client's facts carry no dated citation, when a
 * revisit trigger is half-stated or watches a client with no facts here, or when
 * the always-on disclosure is missing a client's ceiling or carries the two
 * shared-byte figures the wrong way round.
 */
export function renderCapabilityMatrixFrom(inputs: CapabilityMatrixInputs): string {
  requireExactToolCoverage("The dialect-facts set", inputs.facts);
  requireExactToolCoverage("The hook-guarantee table", inputs.guarantees);
  requireExactToolCoverage("The allowlist-coverage table", inputs.coverage);

  const ordered = TOOLS.map((tool) => {
    const facts = inputs.facts.find((row) => row.tool === tool);
    // Unreachable after the coverage check; kept so the narrowing is real.
    if (facts === undefined) fail(`No dialect facts declared for \`${tool}\`.`);
    requireCitations(facts);
    return facts;
  });
  const dated = resolveTriggers(inputs.triggers, ordered);
  requireAlwaysOnFigures(inputs.alwaysOn);
  if (inputs.plugins !== undefined) requirePluginContainers(inputs.plugins);

  const lines = [
    // Frontmatter first, banner second: the site generator parses the block only
    // at byte 0, so the banner cannot lead the file without the page taking its
    // navigation label from the slug. Spelled out here rather than imported from
    // the docs renderers' shared helper, for the same reason the banner below is:
    // this is the emit layer, and it does not depend on the CLI's docs lane.
    "---",
    "title: Client capability matrix",
    "---",
    "",
    `<!-- GENERATED FILE — do not edit by hand. Rewrite it with \`${REGENERATE_COMMAND}\`. -->`,
    "",
    "# Client capability matrix",
    "",
    "Every cell below renders from code: the dialect facts each client's residue planner",
    "declares, the hook-guarantee ladder the emitters read, and the tool-allowlist coverage the",
    "translator applies. A test re-renders this page and byte-compares this file, so it cannot",
    "be hand-edited and cannot lag a change to those declarations.",
    "",
    "That is the whole of the guarantee, and its edges are worth stating. The byte-compare pins",
    "this page to what the adapters DECLARE. It does not pin a declaration to what an adapter",
    "EMITS — that holds only where a test pins the two together, as `test/emit/hooksInfra.test.ts`",
    "does for the hook-config column — and it pins nothing at all to a client's live",
    "documentation. A declared value is prose someone wrote into a constant: read a cell as what",
    "the adapter says, and the access date beside it as how old the saying is.",
    "",
    "A platform fact is only as current as the access date beside it. Each client's sources carry",
    "the date its documentation was last read; re-read them per release and the diff of this page",
    "is the currency report. The named conditions that re-open a decision are at the foot of the",
    "page, under Currency and revisit triggers.",
    "",
    ...glanceSection(ordered, inputs.guarantees),
    "",
    ...alwaysOnSection(inputs.alwaysOn),
    "",
    ...(inputs.plugins === undefined ? [] : [...pluginSection(inputs.plugins), ""]),
    "## Dialect facts by client",
    "",
    ...ordered.flatMap((facts) => clientSection(facts).concat("")),
    ...guaranteeSection(inputs.guarantees),
    "",
    ...coverageSection(inputs.coverage),
    "",
    ...currencySection(dated),
  ];

  return `${lines.join("\n")}\n`;
}

/**
 * The live data, WITHOUT the plugin containers — see {@link
 * CapabilityMatrixInputs.plugins} for why the engine cannot read those.
 *
 * Every section but `## Plugin containers` renders here, which is what the
 * per-section assertions in `test/emit/capabilityMatrix.test.ts` and
 * `test/adapters/copilot.test.ts` read. The committed page is written by
 * {@link REGENERATE_COMMAND}, which supplies the containers, and its drift gate
 * byte-compares against a render built the same way.
 */
export function renderCapabilityMatrix(): string {
  return renderCapabilityMatrixFrom(LIVE_CAPABILITY_INPUTS);
}
