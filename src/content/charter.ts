import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { resolveBundledContentRoot } from "./contentRoot.ts";
import { parseFrontmatter } from "./frontmatter.ts";

/**
 * Charter loader — the one reader for the single `load: always` artifact.
 *
 * The charter is deliberately not a catalog content class: `CONTENT_CLASSES`
 * is the closed set the class-directory walk indexes, and the charter is one
 * fixed file with one fixed identity, not a roster that grows. It lives at
 * {@link CHARTER_RELATIVE_PATH} under the same bundled content root the
 * catalog reads, and emission (the adapter layer) consumes it through this
 * module rather than re-deriving the path.
 *
 * Two gates live here because they are properties of the charter itself, not
 * of any one consumer:
 *
 * - **Presence.** A corpus without its charter cannot emit a setup — the
 *   always-on slice would be empty. That is a corpus defect (`VALIDATION_ERROR`,
 *   exit 64), distinct from the content root failing to resolve at all
 *   (`CONFIG_ERROR` from the probe).
 * - **The charter's own budget.** {@link CHARTER_MAX_LINES} binds this physical
 *   file — frontmatter spends budget too, because the cap models what a session
 *   loads, not what a section contains. It binds the TEMPLATE and nothing else:
 *   the charter is not the whole always-on slice on any client, which is what
 *   {@link composeAlwaysOnLoad} and {@link ALWAYS_ON_BUDGET_LINES} measure.
 *
 * Frontmatter *shape* (load class, obsolete_when, tags) is the corpus test
 * suite's contract, shared with every other artifact; this loader stays thin
 * and hands the parsed map to the caller.
 *
 * Reads are per-call, never cached — unlike the content-root probe, which pins
 * one directory for the process. The template is data that changes underneath
 * a long-lived process legitimately (a package update, an editor mid-authoring,
 * a test mutating its fixture), and one stale always-on slice would silently
 * shape every emission after it.
 */

/** Where the charter template lives, POSIX-relative to the content root. */
export const CHARTER_RELATIVE_PATH = "charter/stamity-charter.md";

/**
 * Hard cap on the charter TEMPLATE's physical file lines.
 *
 * Not the always-on budget: this cap binds one file, and what a client actually
 * loads unconditionally is charter PLUS every rule that client has no way to
 * attach conditionally. {@link composeAlwaysOnLoad} computes that composite and
 * {@link ALWAYS_ON_BUDGET_LINES} bounds it per client.
 */
export const CHARTER_MAX_LINES = 150;

// ── The composite always-on slice ────────────────────────────────

/**
 * Clients that pull a description-scoped rule (no globs) on relevance rather
 * than loading it every session.
 *
 * Cursor's apply-intelligently mode reads the rule `description` and pulls the
 * body in when the conversation matches (cursor.com/docs/context/rules,
 * accessed 2026-08-13), so a glob-less rule costs that client nothing until it
 * is relevant. No other supported client has the primitive: on claude and
 * copilot a rule with no attach trigger is simply loaded, and codex has no
 * per-rule mechanism at all — see {@link composeAlwaysOnLoad}.
 */
export const DESCRIPTION_PULL_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["cursor"]);

/**
 * Clients with no per-rule attach mechanism, which therefore carry every
 * selected rule in their always-on slice.
 *
 * Codex reads one `AGENTS.md`; the adapter down-converts the whole rule set
 * into an appendix on that file, so every rule is unconditional for codex and —
 * because the root `AGENTS.md` is SHARED — the appendix is paid by every
 * co-selected client too. {@link ALWAYS_ON_SHARED_BYTES_WITH_CODEX} is that
 * cross-client cost in bytes.
 */
export const RULE_APPENDIX_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["codex"]);

/** One rule, as the always-on computation reads it off the emission plan. */
export interface AlwaysOnRule {
  /** Rule id, so an over-budget message can name what is spending the budget. */
  id: string;
  /** Physical file lines, `wc -l` semantics — the same accounting as {@link CHARTER_MAX_LINES}. */
  lineCount: number;
  /**
   * True when the rule declares globs and therefore attaches on paths. False is
   * the description-scoped rule, which only cursor can defer.
   */
  globScoped: boolean;
}

/**
 * The always-on inputs, taken from the emission plan rather than a hand-kept
 * list: the rules a run emits are the rules a run loads, so a rule added,
 * dropped, or re-scoped moves this number without anything here being edited.
 */
export interface AlwaysOnPlan {
  /** Physical lines of the charter template ({@link CharterTemplate.lineCount}). */
  charterLines: number;
  /** Every rule the plan emits. Order is irrelevant; the result is a sum. */
  rules: readonly AlwaysOnRule[];
}

/**
 * Per-client ceiling on the composite always-on slice, in physical lines.
 *
 * These are RATCHET ceilings pinned at today's measured load, not a doctrine
 * target: what the ≤150-line budget should count — charter only, charter plus
 * unconditional rules, hook stdout as well — is an open sizing question, and
 * pinning a target before it is settled would either bless the current cost or
 * fail the build on a number nobody has ratified. What is settled is the
 * direction: the slice may shrink, never grow unnoticed. Every value below is
 * therefore a today-measurement, and lowering one as the slice shrinks is the
 * only edit this table should ever take.
 *
 * Read them against {@link CHARTER_MAX_LINES}: cursor pays the charter alone,
 * claude and copilot pay it plus the description-scoped rules they cannot
 * defer, and codex pays it plus the entire rule set — an order of magnitude
 * over the cap that binds the template.
 */
export const ALWAYS_ON_BUDGET_LINES: Readonly<Record<Tool, number>> = {
  cursor: 97,
  claude: 240,
  copilot: 240,
  // 1082 -> 1065 on 2026-09-02: the closure run folded the learnings-schema
  // authoring contract into the writer that enforces it, and the rule set is
  // what this client loads whole.
  codex: 1065,
};

/**
 * Bytes of the SHARED root `AGENTS.md` when codex is among the selected tools —
 * the cross-client cost of selecting it.
 *
 * Selecting codex does not add a codex file: it rewrites the file every other
 * selected client already reads, so a claude+codex repo hands claude the codex
 * rules appendix too. Against {@link ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX} that
 * is ≈6.5x the always-on bytes every co-selected client pays — a today-measured
 * figure like the ceilings above, not a target.
 *
 * **A tripwire AND a published figure**, which are two different jobs.
 *
 * The tripwire: the corpus suite re-reads both numbers off the cross-client
 * emission golden (`test/emit/__snapshots__/crossClientGoldens.test.ts.snap`)
 * and fails when the two diverge, so the cost cannot move without a maintainer
 * editing this line and meeting the number. A golden refresh that moves the
 * cost is a two-line edit here plus a regeneration of the page below.
 *
 * The disclosure: `src/emit/capabilityMatrix.ts` renders both figures under
 * `## Always-on cost by client` on `docs/capability-matrix.md`, the page a
 * reader consults when choosing a client, with the sentence saying what
 * co-selecting codex costs the clients already there. DELIVERED, not open — the
 * corpus suite asserts the page carries both numbers and that heading, so the
 * day a regeneration drops them this paragraph cannot quietly stay false. That
 * is the failure an earlier wording of this comment had twice: first claiming a
 * disclosure that did not exist, then claiming its absence after it did.
 */
// 28_956 -> 29_026 on 2026-09-04: invariant 7 took the paste-handback clause and
// was rewrapped around it, net-zero in lines. So the line ceilings above did not
// move and only the byte figures did — which is exactly the cost this pair
// measures and that one does not.
export const ALWAYS_ON_SHARED_BYTES_WITH_CODEX = 29_026;

/**
 * Bytes of the same shared file when codex is NOT selected — the charter alone.
 * Same tripwire, and the same delivered disclosure, as
 * {@link ALWAYS_ON_SHARED_BYTES_WITH_CODEX}.
 */
// 4_404 -> 4_474 on 2026-09-04: the same reflow. Its +70 bytes land on the
// charter itself, so both figures move by the same amount and the appendix is
// unchanged.
export const ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX = 4_474;

/**
 * The composite always-on line count one client pays for a plan: the charter,
 * plus every rule that client cannot attach conditionally.
 *
 * - {@link DESCRIPTION_PULL_TOOLS} pay the charter alone.
 * - Clients without that primitive add every description-scoped (glob-less)
 *   rule, which has no attach trigger and so loads every session.
 * - {@link RULE_APPENDIX_TOOLS} add EVERY rule, glob-scoped included, because
 *   the client has no per-rule mechanism and the adapter folds the set into the
 *   always-on document.
 *
 * The appendix figure is an upper bound: that client caps its single document
 * at 32 KiB and the adapter drops the tail of the rule set to fit. Counting the
 * dropped rules is deliberate — a rule silently dropped is a floor that stopped
 * binding, which is a loss to report, not a budget saving to bank.
 */
export function composeAlwaysOnLoad(tool: Tool, plan: AlwaysOnPlan): number {
  const unconditional = plan.rules.filter((rule) => {
    if (RULE_APPENDIX_TOOLS.has(tool)) return true;
    if (DESCRIPTION_PULL_TOOLS.has(tool)) return false;
    return !rule.globScoped;
  });
  return unconditional.reduce((total, rule) => total + rule.lineCount, plan.charterLines);
}

/** The loaded charter template, split and measured. */
export interface CharterTemplate {
  /** Parsed frontmatter map; field validation is the corpus contract's job. */
  frontmatter: Record<string, unknown>;
  /** Markdown body with the frontmatter block removed. */
  body: string;
  /** Physical line count of the whole file, frontmatter included (`wc -l` semantics). */
  lineCount: number;
  /** {@link CHARTER_RELATIVE_PATH}, echoed so consumers carry one path spelling. */
  relativePath: string;
}

/**
 * Read and gate the charter template.
 *
 * `contentRoot` defaults to the bundled corpus root; tests and tooling pass an
 * explicit directory. Throws `VALIDATION_ERROR` when the file is absent or over
 * {@link CHARTER_MAX_LINES}, `VALIDATION_ERROR` from the frontmatter parser when
 * the YAML head is malformed, and `FS_ERROR` for any other read failure.
 */
export async function readCharterTemplate(contentRoot?: string): Promise<CharterTemplate> {
  const root = contentRoot ?? resolveBundledContentRoot();
  const filePath = join(root, CHARTER_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissing(error)) {
      throw new EngineError(
        `Charter template not found at ${filePath}. The charter is the single always-on ` +
          `artifact; a corpus without it cannot emit a setup. Reinstall the package, or ` +
          `restore ${CHARTER_RELATIVE_PATH} under the content root.`,
        { code: "VALIDATION_ERROR", cause: error },
      );
    }
    throw new EngineError(`Cannot read the charter template at ${filePath}: ${messageOf(error)}`, {
      code: "FS_ERROR",
      cause: error,
    });
  }

  const lineCount = countLines(raw);
  if (lineCount > CHARTER_MAX_LINES) {
    throw new EngineError(
      `Charter template ${filePath} is ${lineCount} lines; the always-on budget caps it at ` +
        `${CHARTER_MAX_LINES} physical lines, frontmatter included. Cut content or demote it ` +
        `to the conditional layer (rules/skills).`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const parsed = parseFrontmatter(raw, filePath);
  return {
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    lineCount,
    relativePath: CHARTER_RELATIVE_PATH,
  };
}

/**
 * Physical lines, `wc -l` style: a trailing newline terminates the last line
 * rather than opening an empty one, and a final line without a newline still
 * counts. Empty file → 0.
 */
function countLines(raw: string): number {
  if (raw === "") return 0;
  const lines = raw.split(/\r?\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

/**
 * Absence in every form the path can meet it: no entry, or a path segment that
 * is not a directory. Anything else — permissions, I/O — is a real failure.
 */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
