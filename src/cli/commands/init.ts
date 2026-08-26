// Registration-time import: `configure()` runs while the program is being built,
// so commander's Option class is a load-time dependency, not a run-time one.
import { isAbsolute, join, relative, sep } from "node:path";
import { Option, type Command } from "commander";
import { suggestStackPacks } from "../../detect/stackSupport.ts";
import { readManifest } from "../../manifest/manifest.ts";
import {
  carryPredecessorAssets,
  mapPredecessorDefaults,
  type CarryReport,
  type PredecessorDefaults,
} from "../../migration/carry.ts";
import { detectPredecessorState, type PredecessorState } from "../../migration/detect.ts";
import type { MergeResult } from "../../types/content.ts";
import type { ImportDecision } from "../../types/manifest.ts";
import {
  DEFAULT_IMPORT_MODE,
  IMPORT_MODES,
  TOOLS,
  VALID_TOOLS,
  type ImportMode,
  type MaturityTier,
  type Tool,
} from "../../types/core.ts";
import { readHistoryFacts, readWorkingTreeStatus } from "../engine/gitStatus.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import {
  closePrompts,
  confirm,
  promptGate,
  selectOne,
  textInput,
  type PromptGate,
  type PromptIo,
} from "../kit/prompts.ts";
import { applyInit, type InitApplyReport } from "./init/apply.ts";
import { buildInitDecisions, type InitDecisions, type InitOverrides } from "./init/plan.ts";
import {
  emissionSummary,
  gitignoreLine,
  migrationLines,
  nextStepsForTool,
  renderInitPanel,
  type MigrationResidue,
} from "./init/panel.ts";

/**
 * `stamity init` — one-default boot over the prompt-free plan/apply
 * core in `./init/`.
 *
 * At most TWO prompts on the ordinary path, both TTY-gated, both
 * flag-addressable, and `-y` (or `--json`, which implies it) skips both —
 * detection over asking everywhere else. A third, {@link askProceedWithoutGit},
 * fires ONLY where the git probe answers "no repository here", which is not the
 * ordinary path and is the one state where writing dozens of files leaves the
 * operator no revert path at all:
 *
 *   1. Tools confirm — fires ONLY when nothing decided the target set: no
 *      `--tools` flag and zero tool traces in the repo (`toolsSource ===
 *      "default"`). A flag or an unambiguous detection auto-skips; the panel's
 *      disclosure line covers the skipped question.
 *   2. The conditional existing-config moment, in exactly ONE of two variants:
 *      a predecessor setup was detected (migrate full/skip — full imports its
 *      config as defaults, strips its old managed blocks, and carries
 *      learnings + `.env.mcp`), OR — only when there is no predecessor — an
 *      existing agent config file was found (import supplement/replace/skip).
 *      When both exist the predecessor moment subsumes the import ask: one
 *      prompt only, and the import choice defaults to `supplement` silently
 *      but is still disclosed and recorded.
 *
 * Non-interactive runs (piped stdin, `-y`, `--json`) take every default —
 * init is not destructive, so the npx-first bar demands the default flow
 * succeed piped. All prompts fire BEFORE `applyInit`, so an abort at a
 * question leaves no partial state directory behind.
 *
 * The migration moment is the ONE place where "take the default" and "take the
 * prompt's default" are not the same answer. The prompt defaults to `full`,
 * which strips the predecessor's managed blocks and deletes a file that held
 * nothing else; a non-interactive run has nobody to consent to that, and every
 * ordinary machine invocation — CI, a pipe, `-y`, `--json` — reaches it. So the
 * NON-INTERACTIVE default is `skip`, and `full` requires either `--migrate
 * full` or an answered prompt. The sibling gate in `./clean.ts` makes the same
 * split for the same reason: a destructive step needs a person or a flag, never
 * an absent TTY. Whichever mode is chosen, the run prints a named line saying
 * so and naming the predecessor's own directory — the previous behaviour was
 * silent on `skip` only when a flag asked for it, so a machine run that had
 * just deleted files said nothing about having done it.
 *
 * The import choice is decided here, disclosed here, and handed to `applyInit`,
 * which persists it on the manifest as `importChoice: [{ path, mode }, …]` —
 * one record per pre-existing instruction file. Emission reads it from there:
 * `supplement` wraps the generated document in a managed block so the user's
 * bytes survive below it, `replace` writes over the file behind a verified
 * `.bak`, `skip` emits nothing at that path at all. Persisting rather than
 * passing it as a per-run fact is what makes every later `sync` and `check`
 * honour the same answer instead of re-litigating it as a collision.
 *
 * ONE question, EVERY detected path. The ask names all of them and the answer
 * is mapped over all of them, because the alternative shipped for a while and
 * was a lost decision: init asked about `existingConfigPaths[0]` alone, so an
 * operator with `AGENTS.md` and `CLAUDE.md` who answered `skip` got `skip` at
 * the first and an unasked-for managed block at the second. Mapping keeps the
 * prompt budget at one question — the count the panel's two-prompt ceiling is
 * built on — while the consent record covers every file the answer touches.
 */

const DEFAULT_TOOL: Tool = "claude";

const MIGRATE_MODES = ["full", "skip"] as const;
type MigrateMode = (typeof MIGRATE_MODES)[number];

const TOOLS_QUESTION = `Which tools? (comma-separated: ${TOOLS.join(", ")})`;

// ── Flag reading ───────────────────────────────────────────────

/** A string-valued flag; commander's `.choices()` already validated members. */
function stringOpt(opts: Record<string, unknown>, key: string): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Split a `--tools` CSV tolerantly: `"claude, codex"` (spaces included)
 * parses. Values are NOT validated here — `buildInitDecisions` owns the
 * membership check and its refusal lists the valid tools, before any prompt.
 */
function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== "");
}

/** Flag values as plan overrides. A present field wins over every detected value. */
function readOverrides(opts: Record<string, unknown>): InitOverrides {
  const toolsCsv = stringOpt(opts, "tools");
  const maturity = stringOpt(opts, "maturity");
  return {
    ...(toolsCsv === undefined ? {} : { tools: splitCsv(toolsCsv) as Tool[] }),
    ...(maturity === undefined ? {} : { maturityTier: maturity as MaturityTier }),
  };
}

// ── Prompt 1: tools confirm ────────────────────────────────────

/** The typed answer as tools, with whatever did not parse listed by name. */
function parseToolsAnswer(raw: string): { tools: Tool[]; unknown: string[] } {
  const names = splitCsv(raw);
  const unknown = names.filter((name) => !VALID_TOOLS.has(name));
  return { tools: TOOLS.filter((tool) => names.includes(tool)), unknown };
}

/**
 * Ask the tools question. An answer that names an unknown tool is re-asked
 * ONCE with the valid list shown (mirroring the select prompts' tolerance —
 * never a crash); a second bad answer falls back to the default.
 *
 * Returns `null` when the gate is non-interactive — the caller keeps the
 * detected decision untouched so downstream precedence (predecessor defaults)
 * still applies. An interactive completion — typed or confirmed with Enter —
 * is an explicit user choice and is returned even when it equals the default.
 */
async function askTools(gate: PromptGate, promptIo: PromptIo, ctx: CliContext): Promise<Tool[] | null> {
  if (!gate.interactive) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- a re-ask can only follow the answer it corrects
    const raw = await textInput(gate, promptIo, {
      question: TOOLS_QUESTION,
      defaultValue: DEFAULT_TOOL,
    });
    const { tools, unknown } = parseToolsAnswer(raw);
    if (unknown.length === 0 && tools.length > 0) return tools;
    if (attempt === 0) {
      ctx.io.out(
        `unknown tool${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")} — ` +
          `valid tools: ${TOOLS.join(", ")}\n`,
      );
    }
  }
  ctx.io.out(`still not a valid tool list — using the default (${DEFAULT_TOOL})\n`);
  return [DEFAULT_TOOL];
}

// ── Prompt 2: the existing-config moment ───────────────────────

/**
 * The migration question, asked only when there is somebody to answer it.
 *
 * `selectOne` on a non-interactive gate returns `defaultValue` without reading
 * or writing anything, so calling it unconditionally silently selected `full`
 * — the destructive mode — on every CI run, pipe, `-y` and `--json`. The gate
 * is checked HERE instead so the non-interactive answer is `skip`, decided at
 * the call site and visible in the code that decides it.
 */
async function askMigrate(gate: PromptGate, promptIo: PromptIo): Promise<MigrateMode> {
  if (!gate.interactive) return "skip";
  return await selectOne(gate, promptIo, {
    question: "Previous setup detected (predecessor state dir). Migrate it?",
    choices: [
      {
        value: "full",
        label:
          "full — import its config as defaults, strip its old managed blocks, " +
          "carry learnings + .env.mcp",
      },
      { value: "skip", label: "skip — leave the previous setup untouched" },
    ],
    defaultValue: "full",
  });
}

/**
 * The no-repository gate: one confirmation before writing into a directory git
 * does not answer for.
 *
 * Init used to write its whole emission here without a word, then print a panel
 * whose security line promised that `.env.mcp` "can never be committed" and
 * that the state directory "is committed on purpose" — two claims about a
 * repository that does not exist, on a run whose files nothing can revert.
 * `check` knew one command later: its `git-available` probe is this same call.
 *
 * Interactive only, defaulting to yes. `-y`, `--json` and a piped stdin proceed
 * without asking, because that is what those inputs mean and because init
 * creates files rather than replacing any — but the disclosure below prints on
 * every one of those runs, which is the half that was missing.
 */
async function askProceedWithoutGit(gate: PromptGate, promptIo: PromptIo): Promise<boolean> {
  return await confirm(gate, promptIo, {
    question:
      "No git repository here (git did not answer, or this directory is not a repo). " +
      "Files written now cannot be reverted with git. Continue?",
    defaultYes: true,
  });
}

/**
 * The line every non-git run prints — interactive, piped, `-y` and `--json`
 * alike — so the disclosure never depends on whether anyone was asked.
 */
function noGitNote(dryRun: boolean): string {
  const tense = dryRun ? "would be written" : "were written";
  return (
    `no git repository: git did not answer in this directory, so the files that ${tense} have ` +
    `no revert path — \`git init\` here first if you want one. Nothing in stamity requires git; ` +
    `what changes is only that this run is not undoable.`
  );
}

/**
 * The single import ask, over every pre-existing instruction file at once.
 *
 * The question NAMES all of them rather than the first: one answer is about to
 * bind every path in the list, and a prompt that named one while deciding two
 * would be asking for consent it does not then honour. Exactly one question is
 * asked whatever the list length, so the two-prompt ceiling is untouched.
 */
async function askImport(
  gate: PromptGate,
  promptIo: PromptIo,
  targetPaths: readonly string[],
): Promise<ImportMode> {
  const pronoun = targetPaths.length > 1 ? "them" : "it";
  return await selectOne(gate, promptIo, {
    question: `Existing agent config found (${targetPaths.join(", ")}). Import ${pronoun}?`,
    choices: [
      { value: "supplement", label: "supplement — keep it, add generated guidance alongside it" },
      { value: "replace", label: "replace — back it up, then replace it with generated guidance" },
      { value: "skip", label: "skip — leave it alone" },
    ],
    defaultValue: DEFAULT_IMPORT_MODE,
  });
}

// ── Effective view ─────────────────────────────────────────────

/**
 * The values the manifest actually carries, mirroring `applyInit`'s
 * `composeManifest` precedence exactly (flag beats predecessor default beats
 * detection/seed) — so the panel and the JSON document disclose what landed,
 * not what detection alone would have picked.
 */
function effectiveView(
  decisions: InitDecisions,
  defaults: PredecessorDefaults | undefined,
): InitDecisions {
  const tools =
    decisions.toolsSource === "flag" || defaults?.tools === undefined || defaults.tools.length === 0
      ? decisions.tools
      : [...defaults.tools];
  const maturityTier =
    decisions.maturitySource === "flag"
      ? decisions.maturityTier
      : defaults?.maturityTier ?? decisions.maturityTier;
  return { ...decisions, tools, maturityTier };
}

// ── Rendering ──────────────────────────────────────────────────

/**
 * The one-line record of what this run DID to an existing config file.
 *
 * Read off the write report rather than off the choice: the choice is an
 * intention, and the intention and the outcome are not the same sentence. A
 * `replace` whose write the merge engine refused (an unowned collision, a
 * shared-name refusal) still had this line announcing a verified `.bak` and a
 * completed replacement, so the panel asserted a backup that was never taken.
 * The disposition token the writer returned is quoted instead, and the mode is
 * named beside it so a reader can see the two agree — or that they do not.
 *
 * A `skip` has no row by construction: nothing is emitted at that path at all.
 */
function importNote(
  targetPath: string,
  choice: ImportMode,
  written: MergeResult | undefined,
  dryRun: boolean,
): string {
  const tense = dryRun ? "would be" : "was";
  // No write row at all is its own outcome, and it is NOT the outcome either
  // tail below describes. The two tails narrate a merge and a backed-up
  // replacement; both were printed verbatim after "was not written to", so the
  // one line asserted a completed merge and an untouched file in the same
  // breath. That state is reachable without a predecessor — any pre-existing
  // instruction file whose path no SELECTED adapter emits into is detected,
  // asked about, recorded, and then never written — and on a migrant repo it is
  // worse than empty: the migration's strip had already removed the old managed
  // block from that same file, so the operator's file shrank and the panel said
  // it had been merged into.
  if (written === undefined && choice !== "skip") {
    return unwrittenImportNote(targetPath, choice, dryRun);
  }
  switch (choice) {
    case "supplement":
      return (
        `existing config: ${targetPath} ${outcomeToken(written?.action, dryRun, "kept")} — ` +
        `generated guidance ${tense} merged in as a STAMITY:BEGIN/END block and every other ` +
        `byte preserved (supplement)`
      );
    case "replace":
      return (
        `existing config: ${targetPath} ${outcomeToken(written?.action, dryRun, "replaced")} ` +
        `— the previous file ${tense} copied to a verified .bak first (replace)`
      );
    case "skip":
      return (
        `existing config: ${targetPath} is left alone — nothing is generated at that path, ` +
        `now or on any later sync (skip)`
      );
  }
}

/**
 * The line for a decided path this run emitted nothing at: what the operator's
 * file looks like now, and what their answer is still good for.
 *
 * The recorded choice is not discarded — it sits on the manifest and binds the
 * first run that does target the path (a `stamity config` tool change, a later
 * adapter) — so the note says that rather than implying the answer was wasted.
 */
function unwrittenImportNote(targetPath: string, choice: ImportMode, dryRun: boolean): string {
  const verb = dryRun ? "would not be written to" : "was not written to";
  const strip = dryRun ? "would still remove" : "may still have removed";
  return (
    `existing config: ${targetPath} ${verb} — no selected tool generates anything at that path, ` +
    `so nothing is merged in and nothing is replaced. If a migration runs, its strip ${strip} a ` +
    `previous setup's managed block from this file; that is the only edit it sees. Your ` +
    `\`${choice}\` answer is recorded and applies to the first run that does target the path.`
  );
}

/**
 * What actually happened at a path, in one token. `skipped` is the outcome
 * worth naming out loud: the engine refused the write and the file is
 * untouched, which is the exact case the old wording claimed as a success.
 */
function outcomeToken(
  action: MergeResult["action"] | undefined,
  dryRun: boolean,
  verb: string,
): string {
  if (action === undefined) return dryRun ? `would be ${verb}` : "was not written to";
  if (action === "skipped") {
    return dryRun
      ? "would be LEFT UNTOUCHED — the engine would refuse the write"
      : "was LEFT UNTOUCHED — the engine refused the write (see the warning below)";
  }
  return dryRun ? `would be ${verb}` : `was ${verb}`;
}

/**
 * The migration line, for both modes and both surfaces.
 *
 * `skip` used to print only when a flag asked for it, which left the state that
 * matters most — a non-interactive run that took `skip` because nobody was
 * there to consent — with nothing on screen at all. Both modes print now, and
 * both name the predecessor directory the decision is about: "the previous
 * setup" alone told an operator nothing they could act on.
 */
function migrateNote(
  mode: MigrateMode,
  rootDir: string,
  stateDir: string | null,
  interactive: boolean,
): string {
  // A marker-only predecessor has no state directory to name; the marked files
  // it left are named by the residue line instead.
  const where =
    stateDir === null
      ? "the previous setup (marker files only — no state directory)"
      : repoRelative(rootDir, stateDir);
  if (mode === "full") return `migrate: full — ${where} is being carried over`;
  const because = interactive
    ? "you chose skip"
    : "this run is not interactive, and a full migration deletes files, so it is never the " +
      "unattended default";
  return (
    `migrate: skip — ${where} was left untouched (${because}). Migrate it later by ` +
    `re-running \`stamity init --force --migrate full\`.`
  );
}

/**
 * The `--dry-run` report: everything a real run would do, and nothing done.
 *
 * Every row is rendered from the SAME helpers the panel uses, so a preview and
 * the run it previews cannot describe one report differently. The gitignore row
 * is here for the reason it is on the panel: a preview that omits an edit to a
 * file the operator owns is not a preview of that run. `report.gitignoreEnsured`
 * is false under `--dry-run` by construction (nothing was written), so the row
 * is keyed off the mode rather than off that flag and states what WOULD land.
 *
 * The planner warnings are here for the same reason and are the ONLY warning
 * source a preview has: `report.wrote[].warning` is a writer verdict, and a dry
 * run runs no writer (`./init/apply.ts::writeOutput` predicts an action and
 * returns no warning). A hook rejected at parse time is found by PLANNING,
 * which a dry run does in full — so this is the run where saying so is worth
 * most, while the operator is still deciding whether to apply.
 */
function renderDryRun(
  ctx: CliContext,
  report: InitApplyReport,
  carry: CarryReport | null,
  residue: MigrationResidue | undefined,
  notes: readonly string[],
  gitAvailable: boolean,
): void {
  const { io, palette } = ctx;
  io.out(`${palette.bold("Dry run")} — nothing was written. A real run would:\n`);
  io.out(
    report.createdDirs.length > 0
      ? `  create: ${report.createdDirs.join(", ")}\n`
      : "  create: no new state directories (all present)\n",
  );
  io.out(`  write: ${emissionSummary(report, true)}\n`);
  io.out(`  manifest: ${report.manifestPath}\n`);
  io.out(`  ${gitignoreLine(true, gitAvailable)}\n`);
  for (const warning of report.warnings) io.out(`  ${palette.yellow(`warning: ${warning}`)}\n`);
  if (carry !== null) {
    for (const line of migrationLines(carry, residue)) io.out(`  ${line}\n`);
  }
  for (const note of notes) io.out(`  ${note}\n`);
  io.out("\nnext:\n  1. apply it: stamity init\n");
}

/**
 * What a guided migration will leave behind, from what detection already found.
 *
 * A floor rather than a census, and the panel's wording says so: these are the
 * predecessor paths this run can name without a second walk of the tree — its
 * state directory, its overrides, each workspace package holding state of its
 * own, and every marked file the strip refused (a broken block pair, an
 * unreadable file). What it cannot enumerate is the larger class the finding is
 * about: predecessor-emitted agent bodies, slash commands and CI workflows
 * carry no managed block, so nothing in the strip's input list ever sees them.
 * Naming the floor is what stops the report claiming a completed move;
 * enumerating the rest is the predecessor's own uninstall, which is what the
 * panel's line points at — by scope, and without inventing that tool's verbs
 * (see `./init/panel.ts::residueLines`).
 *
 * `state.packagesWithState` is in the list for the monorepo case: a workspace
 * package holding its own predecessor state is a separate scope, reached by
 * nothing an operator runs at the root.
 */
function migrationResidue(
  rootDir: string,
  state: PredecessorState,
  carry: CarryReport,
): MigrationResidue {
  const stateDir = state.stateDirPath;
  const paths = [
    ...(stateDir === null ? [] : [stateDir]),
    ...(state.overridesDir === null ? [] : [state.overridesDir]),
    ...state.packagesWithState,
    ...carry.strips.filter((row) => row.action === "unchanged").map((row) => row.path),
  ];
  return {
    // Repo-relative, like every other path this command prints: a detection
    // field that happens to be absolute would put the operator's machine
    // layout in the middle of a line they are meant to read at a glance.
    paths: paths.map((path) => repoRelative(rootDir, path)),
  };
}

/** Repo-relative POSIX form; an already-relative path passes through unchanged. */
function repoRelative(rootDir: string, path: string): string {
  if (!isAbsolute(path)) return path;
  const rel = relative(rootDir, path);
  return rel === "" ? "." : rel.split(sep).join("/");
}

// ── The command ────────────────────────────────────────────────

export const initCommand: CommandModule = {
  name: "init",
  summary: "set up this repo: detect the stack, decide the defaults, write the state",
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .option("--tools <csv>", `target tools, comma-separated (${TOOLS.join(", ")})`)
      .addOption(
        new Option("--maturity <tier>", "investment-calibration tier").choices([
          "solo",
          "team",
          "scaleup",
          "enterprise",
        ]),
      )
      .addOption(
        new Option("--migrate <mode>", "what to do with a detected predecessor setup").choices([
          ...MIGRATE_MODES,
        ]),
      )
      .addOption(
        new Option(
          "--import-config <mode>",
          "what to do with an existing agent config file",
        ).choices([...IMPORT_MODES]),
      )
      .option("--force", "replace an existing setup in place");
  },

  async run(ctx, opts): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    const now = ctx.app.runtime.clock.now();
    const force = opts["force"] === true;

    // Detection up front, in parallel where independent: the history seed is a
    // synchronous git probe, then the repo analysis and the predecessor scan
    // run concurrently. A bad `--tools` value refuses here — listing the valid
    // tools — before any prompt can fire.
    ctx.spinner.start("scanning this repo");
    const history = readHistoryFacts(rootDir);
    // The same probe `check` runs as its `git-available` row, run one command
    // earlier: init writes the files whose revert path git IS, so the question
    // belongs here rather than in the verb that inspects the result.
    const git = readWorkingTreeStatus(rootDir);
    const [decisions, predecessor] = await Promise.all([
      buildInitDecisions(rootDir, readOverrides(opts), { history }),
      detectPredecessorState(rootDir),
    ]);
    ctx.spinner.stop();

    // Already-initialised pre-flight: without --force the apply below refuses,
    // so asking two questions first would waste the user's answers. The
    // refusal itself stays `applyInit`'s (single source of the message); a
    // corrupt manifest surfaces `readManifest`'s own repair guidance here.
    const alreadyInitialised = !force && (await readManifest(rootDir)) !== null;

    const gate = promptGate({
      stdinIsTTY: ctx.terminal.stdinIsTTY,
      yes: ctx.yes,
      json: ctx.json,
    });

    // PROMPT 1 — tools confirm. Only a zero-evidence default is worth a
    // question; flags and detected traces skip it (the panel disclosure covers
    // them). An interactive answer is an explicit choice, so it takes flag
    // precedence — predecessor defaults must not override what the user just
    // confirmed; a non-interactive default keeps `default` precedence so a
    // migrated manifest's tools can win, which is what "import config as
    // defaults" promises.
    let settled = decisions;
    if (!alreadyInitialised && decisions.toolsSource === "default") {
      const answered = await askTools(gate, ctx.promptIo, ctx);
      if (answered !== null) settled = { ...decisions, tools: answered, toolsSource: "flag" };
    }

    // PROMPT 2 — the conditional existing-config moment, exactly one variant.
    const migrateFlag = stringOpt(opts, "migrate") as MigrateMode | undefined;
    const importFlag = stringOpt(opts, "importConfig") as ImportMode | undefined;
    // EVERY pre-existing instruction file, not the first one. One question is
    // asked about the whole set (below) and the one answered mode is mapped
    // over the whole set (further below) — a path detected here and dropped
    // from the decision would be emitted as an ordinary engine-owned row the
    // operator was never asked about.
    const importTargets = settled.existingConfigPaths;

    let migrate: MigrateMode | null = null;
    let importChoice: ImportMode | null = null;
    if (!alreadyInitialised) {
      if (predecessor !== null) {
        migrate = migrateFlag ?? (await askMigrate(gate, ctx.promptIo));
        // The predecessor moment subsumes the import ask (one prompt only):
        // the import choice defaults silently and is disclosed below.
        if (importTargets.length > 0) importChoice = importFlag ?? DEFAULT_IMPORT_MODE;
      } else if (importTargets.length > 0) {
        importChoice = importFlag ?? (await askImport(gate, ctx.promptIo, importTargets));
      }
    }

    // The consent record: paths AND mode, or nothing — a mode with no target
    // would be applied to whatever emission happened to land on. The ONE
    // answered mode is mapped over EVERY detected path, so the record reaches
    // exactly as far as the question that produced it. Built here as a `const`
    // so the mode is narrowed once, before the map closure reads it.
    const importMode = importChoice;
    const importDecisions: ImportDecision[] =
      importMode === null ? [] : importTargets.map((path) => ({ path, mode: importMode }));

    const migrating = predecessor !== null && migrate === "full" ? predecessor : null;
    const defaults = migrating !== null ? mapPredecessorDefaults(migrating.manifestRaw) : undefined;

    // The no-repository gate, LAST of the questions and still before the first
    // byte: an operator who declines has answered about this run's whole write,
    // and an abort here leaves the directory exactly as it was found.
    if (!git.available && !alreadyInitialised && !(await askProceedWithoutGit(gate, ctx.promptIo))) {
      closePrompts(ctx.promptIo);
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: "init cancelled — nothing was written",
        why: "git does not answer in this directory, so the write would have no revert path",
        next: "run `git init` here and re-run `stamity init`, or re-run with -y to accept a setup you cannot git-revert",
      });
    }

    // Every question is settled, so the prompt session has no further job — and
    // holding it open is not free. On a real terminal readline keeps stdin in
    // raw mode, where Ctrl-C is a byte the prompt kit consumes rather than a
    // signal the process receives; leaving it open past the last question meant
    // the whole write below could not be interrupted. Releasing it here (the
    // funnel's own `finally` releases it again, idempotently) restores cooked
    // mode before the first byte is written.
    closePrompts(ctx.promptIo);

    // The write half. Prompts are all settled by now, so an abort above never
    // leaves partial state. The carry runs AFTER apply: it re-persists
    // learnings through the store the apply just scaffolded, and it respects
    // --dry-run the same way apply does.
    const report = await applyInit({
      rootDir,
      decisions: settled,
      ...(defaults === undefined ? {} : { defaults }),
      ...(importDecisions.length === 0 ? {} : { importChoice: importDecisions }),
      engineVersion: ctx.app.version,
      dryRun: ctx.dryRun,
      force,
      now,
    });
    const carry: CarryReport | null =
      migrating !== null
        ? await carryPredecessorAssets(rootDir, migrating, { dryRun: ctx.dryRun, now })
        : null;

    const effective = effectiveView(settled, defaults);
    const mcpServers = defaults?.mcpServers ?? [];
    const residue =
      migrating !== null && carry !== null ? migrationResidue(rootDir, migrating, carry) : undefined;

    const notes: string[] = [];
    // FIRST, and on every non-git run whether or not anyone was asked: the
    // disclosure is about what this run can and cannot be undone by, which the
    // operator needs before reading anything else the panel says.
    if (!git.available) notes.push(noGitNote(ctx.dryRun));
    // Printed for BOTH modes, never only for the one a flag asked for: the
    // state that most needs saying out loud is a machine run that took `skip`
    // because nobody was there to consent to `full`.
    if (predecessor !== null && migrate !== null) {
      notes.push(migrateNote(migrate, rootDir, predecessor.stateDirPath, gate.interactive));
    }
    // One line PER decided path. A single line for a multi-file decision would
    // disclose the answer while hiding most of what it did — the operator sees
    // every file their one answer reached, and the disposition each one got.
    for (const decision of importDecisions) {
      notes.push(
        importNote(
          decision.path,
          decision.mode,
          report.wrote.find((row) => row.path === join(rootDir, ...decision.path.split("/"))),
          ctx.dryRun,
        ),
      );
    }

    if (ctx.dryRun) {
      renderDryRun(ctx, report, carry, residue, notes, git.available);
    } else {
      for (const note of notes) ctx.io.out(`${note}\n`);
      ctx.io.out(
        renderInitPanel({
          decisions: effective,
          report,
          carry,
          mcpServers,
          palette: ctx.palette,
          gitAvailable: git.available,
          predecessorDetected: predecessor !== null,
          ...(residue === undefined ? {} : { residue }),
          // The live analysis the plan already carries, classified into
          // the stacks nothing ships dedicated guidance for. Suggestions only —
          // stack packs are never auto-installed — and an all-covered repo
          // yields an empty list, which the panel renders as no block at all.
          stackSuggestions: suggestStackPacks(effective.repoInfo),
        }),
      );
    }

    return {
      exitCode: 0,
      json: {
        decisions: {
          tools: effective.tools,
          toolsSource: settled.toolsSource,
          detectedTools: settled.detectedTools,
          greenfield: settled.greenfield,
          maturityTier: effective.maturityTier,
          maturitySource: settled.maturitySource,
          platform: settled.platform ?? null,
          predecessorDetected: predecessor !== null,
          migrate,
          importChoice,
          existingConfigPaths: settled.existingConfigPaths,
        },
        report,
        carry,
        nextSteps: effective.tools.flatMap((tool) => nextStepsForTool(tool)),
      },
    };
  },
};
