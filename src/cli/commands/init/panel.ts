import { join } from "node:path";
import { CLAUDE_COMMANDS_DIR, CLAUDE_SKILLS_DIR } from "../../../adapters/claude.ts";
import {
  CODEX_COMMANDS_DIR,
  HOOK_TRUST_STEPS,
  type CodexHookTrustStep,
} from "../../../adapters/codex.ts";
import { COPILOT_PROMPTS_DIR, COPILOT_SETUP_STEPS_PATH } from "../../../adapters/copilot.ts";
import { CURSOR_COMMANDS_DIR } from "../../../adapters/cursor.ts";
import type { StackSuggestion } from "../../../detect/stackSupport.ts";
import { NATIVE_SKILL_DIRS, SKILLS_PROJECTION_DIR } from "../../../emit/skillsProjection.ts";
import { ENV_MCP_FILE, getSourceEnvMcpCommand } from "../../../mcp/env.ts";
import type { CarryReport } from "../../../migration/carry.ts";
import { TOOLS, type Tool } from "../../../types/core.ts";
import { MANIFEST_FILE } from "../../../types/manifest.ts";
import {
  REVIEW_GATE_LOCK_SUFFIX,
  REVIEW_GATE_STATE_FILE,
  REVIEW_GATE_TEMP_INFIX,
  STATE_DIR,
} from "../../../types/markers.ts";
import { packageCommand } from "../../kit/packageName.ts";
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
 * CI workflows it emitted. Those are NOT block-free, which is what an earlier
 * draft of this comment claimed: the predecessor wraps every file it emits in
 * its own block. They survive because of the strip's INPUT LIST, not the file
 * contents — `../../../migration/detect.ts::PREDECESSOR_MARKED_FILE_CANDIDATES`
 * opens six instruction surfaces and nothing else, so an emitted agent body or
 * workflow is never read in the first place. The report used to end at the
 * strip tally, so a real migrant read "migrated:" as a completed move while two
 * agent corpora, duplicate slash commands and a predecessor workflow that still
 * runs on push stayed exactly where they were.
 *
 * This is the count that makes the report stop overstating. It is a floor, not
 * a census — the paths the detection pass already knows about — and the panel
 * says so rather than implying the remainder has been enumerated.
 */
export interface MigrationResidue {
  /** Repo-relative paths known to remain, in reading order. */
  paths: readonly string[];
  /**
   * The client settings document this run planned but refused to claim, when
   * there is one — it is also the last entry of {@link paths}.
   *
   * It rides its own field because it is the one residue path with a REMEDY
   * this engine can state: the others are the predecessor's to remove, while
   * this one is a file the writer skipped (`../../../merge/safeWrite.ts`: no
   * ownership ledger row, no `STAMITY:BEGIN`/`END` markers), so the hook and
   * permission wiring that document holds is whatever was there before this run
   * — and removing it and re-syncing is what installs this setup's.
   *
   * Named rather than inferred from the warning stream: a skipped write already
   * prints a generic collision warning, and a reader had no way to tell that
   * THIS collision means the previous setup's hooks are the ones that fire.
   */
  unownedSettingsPath?: string;
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
      `inside Claude Code, type: /st-work — the touchpoint commands are installed in ${CLAUDE_COMMANDS_DIR}/ (no skills directory was emitted for this client)`,
    ];
  }
  return [
    open,
    `the nine touchpoint commands are installed in ${CLAUDE_COMMANDS_DIR}/`,
    `start here — inside Claude Code, type: /st-onboard, the guided first change at ${CLAUDE_SKILLS_DIR}/st-onboard/SKILL.md`,
  ];
}

/**
 * Codex discovers neutral skills and invokes them with $name.
 *
 * The hook trust steps that are the operator's to take ride here too, read off
 * the adapter's own step data (`HOOK_TRUST_STEPS`), so the panel and the two
 * emitted files name the same gates: project trust before the client opens
 * the repo, since an untrusted project loads no `.codex/` layer at all, and the
 * per-hook `/hooks` review once it is open. The feature flag carries no
 * operator step — the setup writes it.
 */
function codexSteps(): readonly string[] {
  const open = "open a terminal in this repo and type: codex";
  const onboard =
    CODEX_COMMANDS_DIR === null
      ? `then type: $st-onboard — the guided first change at ${SKILLS_PROJECTION_DIR}/st-onboard/SKILL.md`
      : `then type: /st-onboard — installed in ${CODEX_COMMANDS_DIR}/`;
  return [...codexTrustStep("project-trust"), open, ...codexTrustStep("hook-review"), onboard];
}

/** One Codex trust step's operator instruction, or nothing when the setup closes that gate itself. */
function codexTrustStep(id: CodexHookTrustStep["id"]): string[] {
  return HOOK_TRUST_STEPS.flatMap((step) =>
    step.id === id && step.operatorStep !== null ? [step.operatorStep] : [],
  );
}

/** Both neutral and native Cursor skill directories support /name invocation. */
function cursorSteps(): readonly string[] {
  const open = "open this repo in Cursor and open the chat panel";
  const nativeSkills = NATIVE_SKILL_DIRS.cursor;
  const onboard =
    nativeSkills === undefined
      ? `in the chat, type: /st-onboard, the guided first change at ${SKILLS_PROJECTION_DIR}/st-onboard/SKILL.md`
      : `in the chat, type: /st-onboard, the guided first change at ${nativeSkills}/st-onboard/SKILL.md`;
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
 * action is always ONE in-agent instruction reaching the `st-onboard`
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
    ...commandSurfaceStep(COPILOT_PROMPTS_DIR, "/st-<id>"),
    "in the chat, type: @workspace run the st-onboard workflow",
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
  // Distinct paths, not rows: several outputs address one shared file
  // (`AGENTS.md`), and a count of rows named more files than the run put on
  // disk. The manifest and the state-directory placeholders are files this run
  // writes too, so they are counted and named beside the generated set.
  const generated = new Set(
    report.wrote.filter((row) => row.action !== "skipped").map((row) => row.path),
  ).size;
  const skipped = new Set(
    report.wrote.filter((row) => row.action === "skipped").map((row) => row.path),
  ).size;
  if (generated > 0) {
    const tail = skipped > 0 ? `, ${skipped} left alone (already yours)` : "";
    const keeps = report.createdKeeps.length;
    const total = generated + 1 + keeps;
    const parts = [
      `${generated} generated`,
      `the manifest (${STATE_DIR}/${MANIFEST_FILE})`,
      ...(keeps > 0 ? [`${keeps} state-directory keep file(s)`] : []),
    ].join(", ");
    const gitignore = report.gitignoreAdded.length > 0 ? "; .gitignore changed" : "";
    return dryRun
      ? `${total} file(s) would be written (${parts})${tail}`
      : `${total} file(s) on disk (${parts}${gitignore})${tail}`;
  }
  if (skipped > 0) {
    return dryRun
      ? `no file would be written — all ${skipped} planned path(s) already exist and would be left alone`
      : `nothing installed — all ${skipped} planned path(s) already exist and were left alone; see the warnings below`;
  }
  return "state + manifest only — this build planned no content files";
}

/**
 * The plain-venv gate pins init recorded (REQ-FLOW-007), in one line, or
 * nothing when it recorded none. The pins are a decision the operator did not
 * make, written into the manifest and every charter, so the panel names them,
 * the manifest keys that hold them, and the one place they do not run: they
 * call `<venv>/bin/python`, the POSIX layout, and no Windows path is guessed.
 */
function gatePinLine(decisions: InitDecisions): string | null {
  const pins = decisions.gatePins;
  if (pins === undefined) return null;
  const pinned = (["test", "lint", "typecheck"] as const).flatMap((gate) => {
    const command = pins[gate];
    return command === undefined ? [] : [{ gate, command }];
  });
  const named = pinned.map(({ gate, command }) => `${gate} \`${command}\``).join(", ");
  const keys = pinned.map(({ gate }) => `gates.${gate}`).join(", ");
  return (
    `gates pinned to the project's virtual environment, so they run with none activated: ` +
    `${named} (recorded as ${keys} in the manifest; sync never rewrites ` +
    `them). The pins use the POSIX interpreter path and will not run on Windows until those ` +
    `keys are changed.`
  );
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
 * The line that says a client set was defaulted, or `null` when the operator
 * named it or detection found it.
 *
 * A zero-evidence init installs claude alone, and the disclosure line printed
 * only `installed claude` — which read as a choice somebody made. Shared by the
 * panel and init's dry-run report, so both say it the same way.
 *
 * The route to more clients differs by mode. Before anything is written (the
 * dry run) `--tools` on the real run is the route. After a live init, a second
 * `init` refuses without `--force`, so the route is the manifest's `tools` key
 * and a sync, in the pinned call form the panel uses elsewhere.
 */
export function defaultClientsLine(decisions: InitDecisions, dryRun: boolean): string | null {
  if (decisions.toolsSource !== "default") return null;
  const all = TOOLS.join(",");
  const route = dryRun
    ? `add more with --tools ${all}`
    : `add more with ${packageCommand(`config set tools ${all}`)}, then ${packageCommand("sync")}`;
  return (
    `clients: ${decisions.tools.join(", ")} (the default — no other client's files were found; ` +
    `${route})`
  );
}

/**
 * The Copilot coding agent's setup workflow, named where the operator reads
 * next steps — or nothing when this run did not put it on disk (a user-owned
 * file at that path is skipped, and naming it as installed would be false; a
 * dry run put nothing on disk).
 *
 * The report's rows carry the absolute target the writer resolved
 * (`apply.ts` joins the root; `safeWriteFile` returns the resolved path), so
 * the repo-relative constant is joined onto the root the same way before the
 * comparison — as init's import notes compare their rows.
 */
function copilotWorkflowStep(report: InitApplyReport, rootDir: string): string[] {
  if (report.dryRun) return [];
  const target = join(rootDir, ...COPILOT_SETUP_STEPS_PATH.split("/"));
  const row = report.wrote.find((entry) => entry.path === target);
  if (row === undefined || row.action === "skipped") return [];
  return [
    `the coding agent's setup workflow is at ${COPILOT_SETUP_STEPS_PATH} — GitHub runs it before ` +
      `the Copilot coding agent starts work on a task, on a push or pull request that changes the ` +
      `file, and by hand from the Actions tab`,
  ];
}

/**
 * One tool's next steps after this run: the static table plus, for Copilot,
 * the workflow line when this run wrote the workflow — spliced in just before
 * the in-chat instruction, which stays last. Shared by the panel and init's
 * `--json` document, so the two list the same steps.
 */
export function nextStepsAfterRun(tool: Tool, report: InitApplyReport, rootDir: string): string[] {
  const steps = nextStepsForTool(tool);
  if (tool === "copilot") steps.splice(-1, 0, ...copilotWorkflowStep(report, rootDir));
  return steps;
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
 *
 * The second line is the other half of pointing at that uninstall, and pointing
 * without it was the gap: the predecessor decides what to remove by DIRECTORY
 * rather than by name, and this setup emits into the same directories at the
 * same paths. So the uninstall this panel recommends deletes this setup's own
 * generated files — its markers are not in that tool's marker set, so they read
 * as unmarked — and a panel that recommends a sweep has to say what the sweep
 * costs. Two of the three consequences are recoverable and one is not, which is
 * the ordering: preview it, `sync` restores what is generated, and a commit is
 * the only thing that restores prose the corpus cannot regenerate.
 *
 * Still no predecessor verbs, for the reason above: the preview mode and the
 * end-of-run offer are named as behaviours to look for, conditionally, never as
 * a flag or a subcommand this run did not observe.
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
      `re-run \`${packageCommand("check")}\`.`,
    `  eyes open on that uninstall: it finds what to remove by DIRECTORY rather than by name, ` +
      `and this setup writes into the same directories at the same paths — so it takes THIS ` +
      `setup's generated files with it. Run it in its own preview mode first, if it has one, and ` +
      `read the list. Generated files come back afterwards: \`${packageCommand("check")}\` names each ` +
      `one and \`${packageCommand("sync")}\` writes it back from the corpus. Your own prose outside a ` +
      `managed block does not come back — nothing can regenerate it — so commit this repo before ` +
      `you run it. ` +
      `And if it finishes by offering to reinstall the old setup, decline.`,
  ];
  if (residue.unownedSettingsPath !== undefined) {
    lines.push(
      `  one of those paths is live wiring: ${residue.unownedSettingsPath} was already here, so ` +
        `this run refused to claim it and installed none of its own hook or permission settings ` +
        `there — whatever that file wires is what still fires. If it is the previous setup's ` +
        `rather than yours, remove it and run \`${packageCommand("sync")}\` to get this setup's.`,
    );
  }
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
 * So the gitignore half prints whenever the run appended an entry (or, in a
 * preview, would), naming exactly the entries appended — the lane reports them
 * (`InitApplyReport.gitignoreAdded`) — and the credential half stays
 * conditional: a repo with no MCP server has no credential to load, and
 * printing a load command for an empty set would be noise. The same condition
 * governs the credential wording inside the gitignore half.
 */
export interface GitignoreLineInput {
  /** A preview: the future tense, and "wherever it lacks them". */
  dryRun: boolean;
  /** Whether git answers for this directory; see {@link InitPanelInput.gitAvailable}. */
  gitAvailable?: boolean;
  /**
   * The entries named. A live run passes exactly what it appended
   * (`InitApplyReport.gitignoreAdded`); a preview, which writes nothing and so
   * cannot know which are missing, passes the whole required set
   * (`REQUIRED_GITIGNORE_ENTRIES`, `../../../mcp/env.ts`).
   */
  entries: readonly string[];
  /** Whether an MCP server is configured: the credential wording needs one. */
  mcpConfigured: boolean;
}

/**
 * Why each required entry is ignored, keyed on the exact entries the engine
 * registers (`REQUIRED_GITIGNORE_ENTRIES`), so an entry added there later gets
 * the neutral fallback below rather than a borrowed, false reason.
 */
const GITIGNORE_REASONS: ReadonlyMap<string, string> = new Map([
  [ENV_MCP_FILE, "MCP server credentials"],
  [REVIEW_GATE_STATE_FILE, "the review gate's per-run state"],
  [REVIEW_GATE_STATE_FILE + REVIEW_GATE_LOCK_SUFFIX, "the review gate's lock"],
  [`${REVIEW_GATE_STATE_FILE}${REVIEW_GATE_TEMP_INFIX}*`, "the review gate's temporary writes"],
]);

/** Why one entry is ignored, in words that assume nothing about the run. */
function gitignoreReason(entry: string): string {
  return GITIGNORE_REASONS.get(entry) ?? "machine-local state this setup writes";
}

export function gitignoreLine(input: GitignoreLineInput): string {
  const { dryRun, entries } = input;
  const gitAvailable = input.gitAvailable ?? true;
  const tense = dryRun ? "would be added to" : entries.length === 1 ? "was added to" : "were added to";
  const where = dryRun ? " wherever it lacks them" : "";
  // Each entry is named with a neutral reason. The credential wording is kept
  // for a run that configured an MCP server: with none, there is no credential
  // file this setup uses, and saying so was a claim about a file that holds nothing.
  const named = entries.map((entry) => `${entry} (${gitignoreReason(entry)})`).join(", ");
  const credential =
    input.mcpConfigured && entries.includes(ENV_MCP_FILE)
      ? `, the credential file this setup uses (${ENV_MCP_FILE}) among them`
      : "";
  const head =
    `security: ${entries.length === 1 ? "this line" : "these lines"} — ${named} — ${tense} your ` +
    `.gitignore${where}, so git leaves those files out of commits${credential}. Nothing else in ` +
    `your .gitignore is touched`;
  // Both halves of the tail are claims ABOUT A REPOSITORY, and this line used
  // to make them unconditionally — including in a directory git does not answer
  // for, where "can never be committed" and "is committed on purpose" describe
  // commits that cannot happen. The rule file is still written (it is an
  // ordinary file, and it is what makes the guarantee true the moment a repo
  // exists), so the branch requalifies the promise rather than dropping it.
  return gitAvailable
    ? `${head}, and the rest of the ${STATE_DIR}/ state directory is committed on purpose.`
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
 * carries one — and only then does the row append the install call, pinned
 * like every other remedy on this panel ({@link packageCommand}). Empty input
 * prints nothing at all, which is the state a repo whose stacks are all
 * covered reaches.
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
  for (const row of shown) {
    const install = row.packId === undefined ? "" : `: ${packageCommand(`add ${row.packId}`)}`;
    lines.push(`  ${row.name} (${row.kind}) — ${row.action}${install}`);
  }
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
      palette.dim(`(tier: ${decisions.maturityTier}, change with \`${packageCommand("config")}\`)`),
  );
  const defaulted = defaultClientsLine(decisions, false);
  if (defaulted !== null) lines.push(`  ${defaulted}`);
  const pinLine = gatePinLine(decisions);
  if (pinLine !== null) lines.push(`  ${pinLine}`);
  if (carry !== null) {
    for (const line of migrationLines(carry, input.residue)) lines.push(`  ${line}`);
  }
  // Only the entries this run appended: a .gitignore that already covered them
  // was not edited, and there is nothing to disclose.
  if (report.gitignoreEnsured && report.gitignoreAdded.length > 0) {
    lines.push(
      `  ${gitignoreLine({
        dryRun: false,
        gitAvailable: input.gitAvailable ?? true,
        entries: report.gitignoreAdded,
        mcpConfigured: mcpServers.length > 0,
      })}`,
    );
  }
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
    const steps = nextStepsAfterRun(tool, report, decisions.repoInfo.rootDir);
    for (const [index, step] of steps.entries()) {
      lines.push(`  ${index + 1}. ${step}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
