/**
 * The capability matrix page, rendered from adapter code.
 *
 * The drift class this closes: a hand-written capability page says
 * what a client supports, an adapter later changes what it emits, and the two
 * disagree with no signal at all — the page keeps reading as true. Here every
 * cell is a projection of a code constant: the four residue planners'
 * {@link AdapterDialectFacts}, the shared `CLIENT_HOOK_GUARANTEES` ladder the
 * emitters read, and `ADAPTER_ALLOWLIST_COVERAGE` from the tool translator.
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
import { codexResiduePlanner } from "../adapters/codex.ts";
import { copilotResiduePlanner } from "../adapters/copilot.ts";
import { cursorResiduePlanner } from "../adapters/cursor.ts";
import { CLIENT_HOOK_GUARANTEES, type ClientHookGuarantee } from "../hooks/model.ts";
import {
  ADAPTER_ALLOWLIST_COVERAGE,
  buildAllowlistCoverageTable,
  type AdapterAllowlistCoverage,
} from "../tools/translator.ts";
import { TOOLS, VALID_TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import type { AdapterDialectFacts } from "./planner.ts";

/** Repo-relative path of the committed page this module renders. */
export const CAPABILITY_MATRIX_DOC_PATH = "docs/capability-matrix.md";

/** The one command that rewrites {@link CAPABILITY_MATRIX_DOC_PATH}. */
export const REGENERATE_COMMAND = "node scripts/generate-capability-matrix.mjs";

/** An access date is an ISO calendar date; anything else is undated prose. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
      "No container is emitted. Skills reach this client at its native skills location " +
      "instead, per its declared `skills-access` cap.",
  },
  {
    when: "VS Code deny-gate GA",
    action: "Copilot enforcement upgrade",
    watch: "copilot",
    status: "Still Preview — the `copilot` deny-gate cap emits the gate when it reaches GA.",
  },
];

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
 * clients exactly once, when a client's facts carry no dated citation, or when
 * a revisit trigger is half-stated or watches a client with no facts here.
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

  const lines = [
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

/** The shipped page: {@link renderCapabilityMatrixFrom} over the live data. */
export function renderCapabilityMatrix(): string {
  return renderCapabilityMatrixFrom(LIVE_CAPABILITY_INPUTS);
}
