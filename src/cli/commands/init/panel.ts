import { CLAUDE_COMMANDS_DIR, CLAUDE_SKILLS_DIR } from "../../../adapters/claude.ts";
import { CODEX_COMMANDS_DIR } from "../../../adapters/codex.ts";
import { COPILOT_PROMPTS_DIR } from "../../../adapters/copilot.ts";
import { CURSOR_COMMANDS_DIR } from "../../../adapters/cursor.ts";
import type { StackSuggestion } from "../../../detect/stackSupport.ts";
import { NATIVE_SKILL_DIRS, SKILLS_PROJECTION_DIR } from "../../../emit/skillsProjection.ts";
import { ENV_MCP_FILE, getSourceEnvMcpCommand } from "../../../mcp/env.ts";
import type { CarryReport } from "../../../migration/carry.ts";
import type { Tool } from "../../../types/core.ts";
import { STATE_DIR } from "../../../types/markers.ts";
import type { Palette } from "../../kit/terminal.ts";
import type { InitApplyReport } from "./apply.ts";
import type { InitDecisions } from "./plan.ts";

/**
 * The end-of-init panel — the product's first UI.
 *
 * Pure string rendering: the command decides WHEN to print (never in JSON mode,
 * never under --dry-run); this module decides only what the ready-state looks
 * like. Register is plain-language by default: every step is imperative and
 * copy-paste-only, with no assumed shell fluency — the half-dev segment the
 * spec names is the reader.
 *
 * The disclosure line is the established substitute for the prompts init does
 * not ask: `detected {X} -> installed {Y} (tier: {Z}, change with \`stamity
 * config\`)`, where X names what detection found (languages, tool traces), Y
 * names the target tools plus the emitted file count, and Z is the maturity
 * tier. Y is keyed off what the writer actually did, per {@link emissionSummary}
 * — a zero written count has two very different causes and used to render one
 * sentence for both.
 *
 * Section order is reading order, and next steps come LAST on purpose: the last
 * thing on screen is the first thing to do.
 */

export interface InitPanelInput {
  decisions: InitDecisions;
  report: InitApplyReport;
  carry: CarryReport | null;
  mcpServers: readonly string[];
  palette: Palette;
  /**
   * Detected stacks nothing ships dedicated guidance for, from
   * `src/detect/stackSupport.ts::suggestStackPacks`. Omitted or empty prints
   * nothing at all — a repo whose stacks are all covered has no gap to disclose.
   */
  stackSuggestions?: readonly StackSuggestion[];
  /**
   * What a guided migration leaves behind. Only meaningful beside a `carry`,
   * and omitted everywhere else; see {@link MigrationResidue}.
   */
  residue?: MigrationResidue;
  /**
   * Whether git answered for this directory (`../../engine/gitStatus.ts` →
   * `readWorkingTreeStatus().available`). Absent means yes, which is the state
   * every caller that does not probe is in.
   *
   * Read by the security disclosure, whose commit guarantees are claims about a
   * repository and are false where there is none.
   */
  gitAvailable?: boolean;
  /**
   * Whether a previous setup was found, whatever the operator then chose to do
   * with it. Read by {@link detectedLabel}, which must not call a repo carrying
   * one "fresh" — including on `--migrate skip`, where no `carry` exists to
   * infer it from.
   */
  predecessorDetected?: boolean;
}

/**
 * Predecessor state a guided migration does NOT remove.
 *
 * The carry does two things to the old setup: it re-persists learnings and
 * `.env.mcp`, and it strips managed blocks out of six known instruction files
 * ({@link CarryReport.strips}). It removes nothing else — not the predecessor's
 * state directory, not its overrides, not the agent bodies, slash commands or
 * CI workflows it emitted, none of which carry a managed block to strip. The
 * report used to end at the strip tally, so a real migrant read "migrated:" as
 * a completed move while two agent corpora, duplicate slash commands and a
 * predecessor workflow that still runs on push stayed exactly where they were.
 *
 * This is the count that makes the report stop overstating. It is a floor, not
 * a census — the paths the detection pass already knows about — and the panel
 * says so rather than implying the remainder has been enumerated.
 */
export interface MigrationResidue {
  /** Repo-relative paths known to remain, in reading order. */
  paths: readonly string[];
}

/**
 * Most rows a suggestion block may print before it collapses into a count.
 *
 * The panel is the first thing a user reads, and a repo on five languages
 * would otherwise push the one instruction that matters off the top of the
 * screen. Three rows plus an omitted-count line keeps the block one glance
 * wide while the cap stays honest about what it left out.
 */
export const MAX_STACK_SUGGESTION_ROWS = 3;

/**
 * Steps for Claude Code, read from the constants its adapter emits rather than
 * spelled again here.
 *
 * The nine touchpoints land as slash commands under {@link CLAUDE_COMMANDS_DIR}
 * and the skills — this one included — land under {@link CLAUDE_SKILLS_DIR},
 * the client's project-level skills location, where a command file and a skill
 * directory of the same name produce the same `/name` invocation. Naming the
 * installed path is the "explain what was decided" half of the panel's
 * contract, and it is the LAST line the panel prints, which the piped-run e2e
 * reads as its stdout-completeness probe.
 *
 * An empty {@link CLAUDE_SKILLS_DIR} means the adapter emitted no native copy
 * for this client (its skills-location row went missing upstream). There is
 * then no skill to invoke, so the row falls back to the command surface that
 * IS emitted rather than printing an invocation that resolves to nothing.
 */
function claudeSteps(): readonly string[] {
  const open = "open a terminal in this repo and type: claude";
  if (CLAUDE_SKILLS_DIR === "") {
    return [
      open,
      `inside Claude Code, type: /stamity-work — the touchpoint commands are installed in ${CLAUDE_COMMANDS_DIR}/ (no skills directory was emitted for this client)`,
    ];
  }
  return [
    open,
    `the nine touchpoint commands are installed in ${CLAUDE_COMMANDS_DIR}/`,
    `start here — inside Claude Code, type: /stamity-onboard, the guided first change at ${CLAUDE_SKILLS_DIR}/stamity-onboard/SKILL.md`,
  ];
}

/**
 * Steps for Codex, read from {@link CODEX_COMMANDS_DIR}.
 *
 * That constant is `null` while the client documents no project-scoped command
 * directory — its prompts surface is per-user, not per-repo — so the row falls
 * back to the spelling that does work on this client: it reads
 * {@link SKILLS_PROJECTION_DIR} natively, so a plain-words request naming the
 * skill reaches a file that is actually on disk. The day the client documents a
 * command directory, that constant changes and this row follows it.
 */
function codexSteps(): readonly string[] {
  const open = "open a terminal in this repo and type: codex";
  if (CODEX_COMMANDS_DIR === null) {
    return [
      open,
      `then ask in plain words: run the stamity-onboard workflow from ${SKILLS_PROJECTION_DIR}/`,
    ];
  }
  return [open, `then type: /stamity-onboard — installed in ${CODEX_COMMANDS_DIR}/`];
}

/**
 * Steps for Cursor, branched on {@link NATIVE_SKILL_DIRS} — the table the
 * adapters themselves read when deciding whether a client needs a native copy
 * of the skills projection.
 *
 * `cursor` is absent from that table, so `stamity-onboard` exists at
 * {@link SKILLS_PROJECTION_DIR} and nowhere else on this client. Its
 * `.cursor/skills/` root is NOT a second home for it: the client folded slash
 * commands into skills, so that directory receives the nine touchpoint COMMAND
 * bodies only. `stamity-onboard` is a SKILL, which means a `/stamity-onboard`
 * spelling here would name an invocation no emitted file answers — so the row
 * asks for the workflow by path instead, the same fallback {@link codexSteps}
 * takes. This client declares `readsAgentsSkillsDir: true`, so the path it
 * names is one the agent already reads.
 *
 * The day the projection gains a native cursor copy, that table changes and
 * this row follows it into the slash spelling.
 */
function cursorSteps(): readonly string[] {
  const open = "open this repo in Cursor and open the chat panel";
  const nativeSkills = NATIVE_SKILL_DIRS.cursor;
  const onboard =
    nativeSkills === undefined
      ? `in the chat, ask in plain words: run the stamity-onboard workflow from ${SKILLS_PROJECTION_DIR}/`
      : `in the chat, type: /stamity-onboard, the guided first change at ${nativeSkills}/stamity-onboard/SKILL.md`;
  return [open, ...commandSurfaceStep(CURSOR_COMMANDS_DIR, "/<id>"), onboard];
}

/**
 * The row that names a client's installed touchpoint commands, or nothing when
 * the client has no project command surface to name.
 *
 * Every client with a command directory got nine touchpoint bodies emitted into
 * it and only claude's row said so — cursor was told to "ask in plain words"
 * and copilot to use `@workspace` while eighteen invocable files sat on disk,
 * unmentioned on the one screen that exists to say what landed. The next steps
 * are the panel's last section and the first thing an operator acts on, so a
 * surface missing from here is a surface most users never find.
 *
 * Derived, like the rest of these rows: the directory comes from the adapter
 * that emits it, so a client that gains or loses the surface moves this line
 * with it.
 */
function commandSurfaceStep(dir: string | null, invocation: string): string[] {
  if (dir === null) return [];
  return [`the nine touchpoint commands are installed in ${dir}/ — invoke one as ${invocation}`];
}

/**
 * Per-tool first-workflow steps, in the TARGET TOOL'S OWN syntax. The first
 * action is always ONE in-agent instruction reaching the `stamity-onboard`
 * touchpoint — the guided first change, not a document generator.
 *
 * The spelling per client is whatever that client can actually resolve, not a
 * uniform-looking slash command. Three of the four rows are DERIVED from the
 * emission facts that decide it — claude and codex from the constants their
 * adapters export, cursor from {@link NATIVE_SKILL_DIRS} — so a client that
 * gains or loses a surface moves this panel with it instead of leaving a dead
 * instruction on the first screen a user ever sees. Copilot's row is the one
 * literal, and it names no path to dangle: `@workspace` is that client's own
 * whole-workspace request syntax, which resolves the skill by searching the
 * tree its dialect facts already declare it reads.
 */
const NEXT_STEPS: Record<Tool, readonly string[]> = {
  claude: claudeSteps(),
  cursor: cursorSteps(),
  copilot: [
    "open VS Code Copilot chat in this repo",
    ...commandSurfaceStep(COPILOT_PROMPTS_DIR, "/stamity-<id>"),
    "in the chat, type: @workspace run the stamity-onboard workflow",
  ],
  codex: codexSteps(),
};

/** The numbered-ready steps for one tool. Fresh array per call — callers may mutate. */
export function nextStepsForTool(tool: Tool): string[] {
  return [...NEXT_STEPS[tool]];
}

/** Evidence rows past this many collapse into a `+N more` tail. */
const MAX_DETECTED_PARTS = 6;

/**
 * What detection found, named — over the WHOLE analysis, not one field of it.
 *
 * This read `detected.languages` plus tool traces and called everything else "a
 * fresh repo (no traces)". Languages are probed by config-file indicators, so
 * an ordinary Node service with a `package.json`, eslint, vitest, a GitHub
 * Actions workflow and a pnpm lockfile — and no `tsconfig.json` — fell through
 * to that sentence, on the first screen, in the same run whose charter listed
 * eslint, vitest, GHA and pnpm by name three files later. A repo carrying a
 * previous agent setup got it too, two lines above the panel's own "a
 * predecessor setup is being carried over".
 *
 * So the label reads every evidence field the analysis carries plus the
 * predecessor verdict, and "a fresh repo (no traces)" survives only where all
 * of them are empty — which is what the sentence claims. Order is specificity:
 * the predecessor first (it changes what this run IS), then frameworks and
 * languages, then the toolchain rows, then tool traces.
 */
function detectedLabel(input: InitPanelInput): string {
  const { decisions } = input;
  const info = decisions.repoInfo;
  const parts = [
    ...(input.predecessorDetected === true ? ["a predecessor setup"] : []),
    ...info.frameworks,
    ...(info.languages.length > 0 ? info.languages : decisions.detected.languages),
    ...info.linters,
    ...info.testFrameworks,
    ...info.ciProviders,
    ...(info.packageManager === undefined ? [] : [info.packageManager]),
    ...decisions.detectedTools.map((tool) => `${tool} traces`),
  ];
  if (parts.length === 0) return "a fresh repo (no traces)";
  const shown = parts.slice(0, MAX_DETECTED_PARTS);
  const omitted = parts.length - shown.length;
  return omitted > 0 ? `${shown.join(", ")} +${omitted} more` : shown.join(", ");
}

/**
 * What the writer did, in one clause — the shared vocabulary for the panel's
 * disclosure line and the dry-run report, so the two surfaces cannot describe
 * one write report differently.
 *
 * A zero written count has two causes and they are not the same news:
 *
 * - every planned path COLLIDED, so the engine refused each write and left the
 *   user's files alone. The setup is not installed, and the warnings below say
 *   which files;
 * - nothing was planned at all, which in a build that emits is a broken corpus.
 *
 * Both used to render "content emission arrives with the adapter phase" — a
 * sentence about a build that no longer exists, told to a user of a build where
 * a live init emits dozens of files. It read as "this is normal, wait for a
 * later release" at precisely the moment the setup had failed to install.
 */
export function emissionSummary(report: InitApplyReport, dryRun = report.dryRun): string {
  const written = report.wrote.filter((row) => row.action !== "skipped").length;
  const skipped = report.wrote.filter((row) => row.action === "skipped").length;
  if (written > 0) {
    const tail = skipped > 0 ? `, ${skipped} left alone (already yours)` : "";
    return dryRun ? `${written} file(s) would be written${tail}` : `${written} file(s)${tail}`;
  }
  if (skipped > 0) {
    return dryRun
      ? `no file would be written — all ${skipped} planned path(s) already exist and would be left alone`
      : `nothing installed — all ${skipped} planned path(s) already exist and were left alone; see the warnings below`;
  }
  return "state + manifest only — this build planned no content files";
}

/**
 * What landed: target tools plus what the writer did with the planned set.
 * Skipped rows are files the engine refused to claim (user-owned collisions),
 * so they never count as installed — and {@link emissionSummary} says which of
 * the two zero-written states this is.
 */
function installedLabel(decisions: InitDecisions, report: InitApplyReport): string {
  return `${decisions.tools.join(", ")} (${emissionSummary(report)})`;
}

/**
 * What the guided migration moved, and what it left — one line per claim.
 *
 * The tally is split because `deleted` and `stripped` are different outcomes
 * and were counted as one. A strip keeps the file and removes a block from it;
 * a delete removes the whole file, because it held nothing but blocks and
 * whitespace. Reporting both as "stripped of old managed blocks" meant the one
 * outcome that destroys a path never named it — so every deleted path is listed
 * here, on this surface and on the dry-run preview alike.
 */
export function migrationLines(carry: CarryReport, residue?: MigrationResidue): string[] {
  const deleted = carry.strips.filter((row) => row.action === "deleted").map((row) => row.path);
  const stripped = carry.strips.filter((row) => row.action === "stripped").length;
  const verb = carry.dryRun ? "would be " : "";
  const parts = [
    `${carry.learningsCarried} learning(s) ${verb}carried` +
      (carry.learningsSkipped > 0 ? ` (${carry.learningsSkipped} skipped)` : ""),
    `${stripped} file(s) ${verb}stripped of old managed blocks`,
    `${deleted.length} file(s) ${verb}deleted`,
  ];
  if (carry.envMcpCarried) parts.push(`${ENV_MCP_FILE} ${verb}carried`);
  const tail = carry.overridesPresent
    ? " — old overrides were left in place for you to review by hand"
    : "";

  const lines = [`migrated: ${parts.join(", ")}${tail}`];
  if (deleted.length > 0) {
    lines.push(
      `  deleted (held nothing but the old generated block): ${deleted.join(", ")}`,
    );
  }
  lines.push(...residueLines(residue, carry));
  return lines;
}

/**
 * The honesty line for everything the migration did not touch. Silent when
 * there is nothing left over, which is the only state that earns silence.
 *
 * No cleanup COMMAND is printed, and that is the fix rather than a gap. This
 * line used to close on a command assembled from the predecessor's state
 * directory name — `<name> clean --purge` — with both the verb and the flag
 * hard-coded here. Two things were wrong with it at once. It asserted a CLI
 * surface nothing in this run had observed: the directory name is the only
 * evidence, and a subcommand and a flag are not derivable from it. And where
 * that guess happened to be right it was destructive in the one direction this
 * panel must never point: a purge of a predecessor setup removes the credential
 * file at {@link ENV_MCP_FILE} — the file the carry two lines above adopted IN
 * PLACE, with no second copy anywhere — so the operator would be running an
 * unrecoverable delete of live tokens on this panel's own instruction.
 *
 * What replaces it is the part this run can actually stand behind: the paths,
 * the fact that each listed directory is its own scope (a workspace package
 * holding predecessor state is not reached by anything run at the root), and —
 * when a credential file was carried — the back-up step to take BEFORE any
 * uninstall runs.
 */
function residueLines(residue: MigrationResidue | undefined, carry: CarryReport): string[] {
  if (residue === undefined || residue.paths.length === 0) return [];
  const lines = [
    `  left in place: ${residue.paths.length} predecessor path(s) — ${residue.paths.join(", ")}. ` +
      `The migration carries learnings and credentials and strips old managed blocks; it removes ` +
      `nothing else, so predecessor-emitted agents, slash commands and CI workflows are still ` +
      `live. Removing them is the previous setup's own uninstall, run by you: this run knows the ` +
      `paths above but not that tool's verbs, so it names none — and each listed directory is a ` +
      `separate scope, so a workspace package holding its own state needs its own run. Then ` +
      `re-run \`stamity check\`.`,
  ];
  if (carry.envMcpCarried) {
    lines.push(
      `  before any of that: ${ENV_MCP_FILE} at the repo root is now THIS setup's credential ` +
        `file. The carry adopted the previous setup's file where it stood — no copy was made — so ` +
        `an uninstall that removes credentials would take the live tokens with it. Copy it ` +
        `somewhere outside the repo first.`,
    );
  }
  return lines;
}

/**
 * Every warning this init produced, from its two independent sources:
 *
 * 1. **The writer.** Per-file results the merge engine returned — a skipped
 *    collision, a force-overwrite naming its `.bak`, a restored managed block.
 *    A skipped write means a file the setup counts on is NOT there while the
 *    panel's headline still says the setup is ready: printing "ready" over a
 *    silent skip is how a repo ends up permanently red on `stamity check` with
 *    nothing on screen having said so.
 * 2. **The planner.** {@link InitApplyReport.warnings} — the hooks-planner
 *    channel (`../../../emit/hooksInfra.ts` → `CoreHooksPlan.warnings`): a user
 *    or pack hook rejected at parse time and so simply never firing, a pack
 *    agent whose grant resolved empty, a policy document past the size cap the
 *    generated guard parses, which denies every agent in the repo. These have
 *    no `wrote[]` row to ride on — a hook that was rejected is precisely one
 *    that produced no output — which is why the report carries them separately.
 *
 * Source 2 reached nothing at all until the emission seam was widened to return
 * it (`../../engine/emission.ts` → `EmissionPlanner.planWithWarnings`, carried
 * by `./apply.ts`). While the seam returned rows alone, an operator learned
 * about a rejected hook from the hook not running — the outcome the channel was
 * built to prevent. Writer rows first, then planner rows: reading order follows
 * the run, and every row is printed, never sampled.
 */
function warningLines(report: InitApplyReport): string[] {
  return [
    ...report.wrote.flatMap((row) => (row.warning === undefined ? [] : [row.warning])),
    ...report.warnings,
  ];
}

/**
 * Per-file dispositions worth saying that are not degradations — today, the
 * first adoption of a file the operator already had.
 *
 * They ride their own list because they ride their own colour. Printed as
 * warnings, a happy-path outcome taught the reader that this panel's yellow
 * does not mean anything, which is the whole cost: the run that reports a real
 * skipped write is then read the same way.
 */
function noticeLines(report: InitApplyReport): string[] {
  return report.wrote.flatMap((row) => (row.notice === undefined ? [] : [row.notice]));
}

/**
 * The end-of-init security disclosure, in two independent halves.
 *
 * They were one string gated on MCP servers existing, which made the whole
 * disclosure unreachable on an ordinary init — while `applyInit` writes to the
 * user's `.gitignore` on EVERY run. Editing a file the operator owns and
 * saying nothing is the disclosure gap the decision exists to close, and it has
 * nothing to do with whether any MCP server was configured.
 *
 * So the gitignore half prints whenever the rule was put in place (or, in a
 * preview, would be), and the credential half stays conditional: a repo with no
 * MCP server has no credential to load, and printing a load command for an
 * empty set would be noise.
 */
export function gitignoreLine(dryRun: boolean, gitAvailable = true): string {
  const tense = dryRun ? "would be added to" : "was added to";
  const head =
    `security: one line — ${ENV_MCP_FILE} — ${tense} your .gitignore, so the credential file ` +
    `this setup uses can never be committed. Nothing else in your .gitignore is touched`;
  // Both halves of the tail are claims ABOUT A REPOSITORY, and this line used
  // to make them unconditionally — including in a directory git does not answer
  // for, where "can never be committed" and "is committed on purpose" describe
  // commits that cannot happen. The rule file is still written (it is an
  // ordinary file, and it is what makes the guarantee true the moment a repo
  // exists), so the branch requalifies the promise rather than dropping it.
  return gitAvailable
    ? `${head}, and the ${STATE_DIR}/ state directory is committed on purpose.`
    : `${head}. This directory is not a git repository yet, so nothing is tracked or ignored ` +
        `here at all: the rule takes effect on the first \`git init\`, and the ${STATE_DIR}/ ` +
        `state directory is meant to be committed once there is somewhere to commit it.`;
}

/** Credential disclosure, shown only when MCP servers are configured. */
function credentialLine(mcpServers: readonly string[]): string {
  return (
    `credentials: ${ENV_MCP_FILE} holds the credentials for ${mcpServers.join(", ")}. ` +
    `Before starting your tool, load it by copy-pasting this into your terminal: ` +
    `${getSourceEnvMcpCommand()}`
  );
}

/**
 * Frameworks before languages, stably within each group.
 *
 * The cap below only prints the head of the list, so ordering is what makes it
 * survivable: a user on Next.js wants to hear about Next.js before TypeScript,
 * and a language-first input would push every framework row past the cap. The
 * suggestion API already returns this order; re-establishing it here is what
 * lets the cap belong to the panel without depending on a caller's sort.
 */
function mostSpecificFirst(suggestions: readonly StackSuggestion[]): StackSuggestion[] {
  return [
    ...suggestions.filter((row) => row.kind === "framework"),
    ...suggestions.filter((row) => row.kind !== "framework"),
  ];
}

/**
 * The stack-suggestion block: detected stacks nothing ships dedicated guidance
 * for, each with the one truthful next step its tier allows.
 *
 * Suggestions only — stack packs are never auto-installed, and no row here
 * invents an install instruction: the row prints the action the suggestion API
 * computed, which names a pack id only when the curated catalog actually
 * carries one. Empty input prints nothing at all, which is the state a repo
 * whose stacks are all covered reaches.
 */
function stackSuggestionLines(
  suggestions: readonly StackSuggestion[],
  palette: Palette,
): string[] {
  if (suggestions.length === 0) return [];

  const ordered = mostSpecificFirst(suggestions);
  const shown = ordered.slice(0, MAX_STACK_SUGGESTION_ROWS);
  const omitted = ordered.length - shown.length;

  const lines = [palette.bold("detected stacks with no dedicated guidance yet:")];
  for (const row of shown) lines.push(`  ${row.name} (${row.kind}) — ${row.action}`);
  if (omitted > 0) {
    lines.push(palette.dim(`  … and ${omitted} more in the same position.`));
  }
  lines.push("");
  return lines;
}

/**
 * The ready-state panel. Sections in reading order: ready header, the
 * detected->installed disclosure, the migration summary (when a carry ran),
 * the gitignore disclosure (whenever the rule was put in place) and the
 * credential disclosure (when MCP servers exist), merge warnings, the
 * stack-suggestion block (when detection found an uncovered stack), then
 * numbered next steps per target tool.
 *
 * The maturity tier rides the disclosure line as a FACT with its change
 * instruction. It is a calibration dial, never a gate on what content was
 * admitted, so the line states it beside the install rather than between the
 * arrow's two halves — nothing here implies the tier selected or withheld a
 * single file.
 */
export function renderInitPanel(input: InitPanelInput): string {
  const { decisions, report, carry, mcpServers, palette } = input;
  const stackSuggestions = input.stackSuggestions ?? [];

  const lines: string[] = [];
  lines.push(palette.bold(palette.green("stamity is ready.")));
  lines.push("");
  lines.push(
    `  detected ${detectedLabel(input)} -> installed ${installedLabel(decisions, report)} ` +
      palette.dim(`(tier: ${decisions.maturityTier}, change with \`stamity config\`)`),
  );
  if (carry !== null) {
    for (const line of migrationLines(carry, input.residue)) lines.push(`  ${line}`);
  }
  if (report.gitignoreEnsured) lines.push(`  ${gitignoreLine(false, input.gitAvailable ?? true)}`);
  if (mcpServers.length > 0) lines.push(`  ${credentialLine(mcpServers)}`);
  for (const notice of noticeLines(report)) lines.push(`  ${notice}`);
  for (const warning of warningLines(report)) {
    lines.push(`  ${palette.yellow(`warning: ${warning}`)}`);
  }
  lines.push("");

  lines.push(...stackSuggestionLines(stackSuggestions, palette));

  for (const tool of decisions.tools) {
    const heading =
      decisions.tools.length > 1
        ? `${palette.bold(`next steps (${tool}):`)}`
        : palette.bold("next steps:");
    lines.push(heading);
    for (const [index, step] of nextStepsForTool(tool).entries()) {
      lines.push(`  ${index + 1}. ${step}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
