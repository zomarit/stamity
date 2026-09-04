// Registration-time import: `configure()` runs while the program is being built,
// so commander's Option class is a load-time dependency, not a run-time one.
import { isAbsolute, join, relative, sep } from "node:path";
import { Option, type Command } from "commander";
import { CLAUDE_SETTINGS_PATH } from "../../adapters/claude.ts";
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
  type ImportMode,
  type MaturityTier,
  type Tool,
} from "../../types/core.ts";
import { STATE_DIR } from "../../types/markers.ts";
import type { DetectedRepo } from "../../workspace/detect.ts";
import {
  createWorkspaceManifest,
  writeWorkspaceManifest,
} from "../../workspace/manifest.ts";
import { WORKSPACE_MANIFEST_FILE } from "../../workspace/model.ts";
import { readHistoryFacts, readWorkingTreeStatus } from "../engine/gitStatus.ts";
import { bannerBlock } from "../kit/banner.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import {
  closePrompts,
  confirm,
  promptGate,
  sanitizeLabel,
  selectMany,
  selectOne,
  type PromptGate,
  type PromptIo,
} from "../kit/prompts.ts";
import { applyInit, type InitApplyReport } from "./init/apply.ts";
import {
  buildInitDecisions,
  workspaceOfferArmed,
  type InitDecisions,
  type InitOverrides,
} from "./init/plan.ts";
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
 * detection over asking everywhere else:
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
 * TWO further prompts sit OUTSIDE that ceiling, and neither is on the ordinary
 * path: each fires only where a detected precondition holds, each is asked
 * after both questions above, and a run can meet both preconditions at once —
 * a directory holding sibling repositories can also be one git does not answer
 * for.
 *
 *   a. {@link askProceedWithoutGit} — fires ONLY where the git probe answers
 *      "no repository here", the one state where writing dozens of files leaves
 *      the operator no revert path at all. Defaults to YES: init creates files
 *      rather than replacing any.
 *   b. {@link askCreateWorkspace} — fires ONLY where this directory is
 *      standalone (not a workspace root, not inside one) and holds two or more
 *      repositories. Defaults to NO, and asked LAST, after the git gate has
 *      settled whether this run happens at all. A yes runs the same guided
 *      selection `stamity workspace init` runs, and the `workspace.json` it
 *      composes is written AFTER `applyInit` returns — a failed init that left
 *      one behind would leave a workspace with no initialised root and no
 *      explanation.
 *
 * Default NO on (b) because creating `workspace.json` at the root of somebody's
 * projects directory declares an intent about repositories the operator did not
 * name. It is reversible — one file, deleted — but noisily so, since the next
 * `workspace sync` would rewrite manifests in every member. Which is also why a
 * NON-INTERACTIVE run never creates one: `-y` means "take the defaults for this
 * repository's setup", and no reading of it reaches a sibling repository's
 * configuration. Those runs print {@link workspaceOfferNote} instead, on every
 * one of them, because staying silent is exactly the state where an operator
 * never learns the surface exists.
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

const TOOLS_QUESTION = "Which tools?";

/**
 * The product name behind each tool id, for the menu rows.
 *
 * `Record<Tool, string>` rather than a lookup with a fallback: a tool added to
 * `TOOLS` with no label here fails the build, which is the only way a choice
 * list stays complete without anybody remembering to check it.
 */
const TOOL_LABELS: Readonly<Record<Tool, string>> = {
  claude: "Claude Code",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  codex: "Codex CLI",
};

/**
 * The rows the tools question offers, in `TOOLS` order.
 *
 * Each label leads with the ID rather than the product name alone, because the
 * id is what `--tools` takes and what the panel and the manifest echo back: an
 * operator who picks a row and later wants the same set unattended can read the
 * flag value straight off the menu.
 */
const TOOL_CHOICES: readonly { value: Tool; label: string }[] = TOOLS.map((tool) => ({
  value: tool,
  label: `${tool} — ${TOOL_LABELS[tool]}`,
}));

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

/**
 * Ask the tools question, as a checkbox multi-select over every valid tool with
 * the default one preselected.
 *
 * The kit owns the input METHOD and its tolerance: boxes toggled with space on
 * a terminal that can carry a menu, its numbered comma-separated list — one
 * re-ask on an unusable answer, then the defaults, never a crash — everywhere
 * else. The question used to take tool NAMES as free text, which asked the
 * operator to know the id vocabulary before being shown it and made a typo the
 * common case the re-ask existed for.
 *
 * Returns `null` when the gate is non-interactive — the caller keeps the
 * detected decision untouched so downstream precedence (predecessor defaults)
 * still applies. Any interactive completion, Enter on the untouched default
 * included, is an explicit user choice and is returned even when it equals the
 * default.
 *
 * The EMPTY set is the one answer this caller does not take at face value.
 * `selectMany` returns it faithfully — every box cleared is a real answer to
 * the question asked — but a setup targeting no tool emits nothing at all, so
 * it is read back as the default and the substitution is printed rather than
 * made silently.
 */
async function askTools(
  gate: PromptGate,
  promptIo: PromptIo,
  ctx: CliContext,
): Promise<Tool[] | null> {
  if (!gate.interactive) return null;
  const picked = await selectMany<Tool>(gate, promptIo, {
    question: TOOLS_QUESTION,
    choices: TOOL_CHOICES,
    defaultValues: [DEFAULT_TOOL],
  });
  if (picked.length > 0) return picked;
  ctx.io.out(`no tool selected — using the default (${DEFAULT_TOOL})\n`);
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

// ── The conditional workspace offer ────────────────────────────

/**
 * The guided creation this offer runs is `stamity workspace init`'s, and it is
 * REBUILT here over the shared engine primitives rather than imported from
 * `./workspace.ts`.
 *
 * Not a preference — the architecture gate forbids the import. `test/
 * architecture/boundaries.test.ts` keeps a plan map keyed by source path, and
 * `checkWaveLayering` allows an edge only within one unit or strictly DOWN a
 * wave (`toEntry.wave < fromEntry.wave`). This file and `./workspace.ts` both
 * sit at wave 15 under different units, so `init.ts -> workspace.ts` is exactly
 * the violation that gate names. Nor can the shared half move down: the engine
 * layer may not import the CLI (boundary rule 4), so `selectMany` and the
 * rendering cannot live under `src/workspace/`, and the one piece that could —
 * the tool union — would need a NEW engine module, which is a plan-map row plus
 * a composition-root registration in files this unit does not own.
 *
 * What is duplicated is therefore only the thin glue: the marker label, the
 * union, and the fallback. Everything with a decision in it is shared already
 * and reached directly — `detectSubRepos` (through `./init/plan.ts`'s probe),
 * `createWorkspaceManifest` and `writeWorkspaceManifest` — so the two paths
 * cannot mint different manifest SHAPES, and each suite pins its own path's
 * tool derivation against the same stated rule. Collapsing the glue is a
 * deliberate wave-map re-plan, which is a change of its own.
 */

/**
 * Most candidate paths the disclosure line names before it collapses into a
 * count. Three keeps the line one glance wide while the cap stays honest about
 * what it left out — the same trade the panel's suggestion block makes.
 */
const MAX_DISCLOSED_CANDIDATES = 3;

/**
 * The workspace offer: one confirm, interactive only, defaulting to NO.
 *
 * A conditional prompt in {@link askProceedWithoutGit}'s shape — gated on a
 * detected precondition, outside the two-question ordinary-path ceiling, and
 * asked last. It is deliberately NOT a third variant of the existing-config
 * moment: that moment is a decision about ONE repository's files, this is a
 * decision about several repositories, and folding them would make one answer
 * bind two unrelated things.
 */
async function askCreateWorkspace(
  gate: PromptGate,
  promptIo: PromptIo,
  count: number,
): Promise<boolean> {
  return await confirm(gate, promptIo, {
    question:
      `${String(count)} repositories found under this directory. Create a workspace.json ` +
      `so one policy reaches all of them?`,
    defaultYes: false,
  });
}

/**
 * The markers that qualified a directory, for the selection row's label:
 * `.git`, the state directory, or both. `detectSubRepos` never returns a row
 * carrying neither, so the list is never empty.
 */
function workspaceMarkers(repo: DetectedRepo): string {
  return [...(repo.hasGit ? [".git"] : []), ...(repo.hasManifest ? [STATE_DIR] : [])].join(", ");
}

/**
 * One `selectMany` over the candidates in scan order, every one preselected.
 *
 * The empty set is a REAL answer: an operator who clears every box has said
 * "not these", and reading it back as the defaults would write a manifest they
 * just declined. The caller turns it into a nothing-created line rather than a
 * refusal, because declining is not an error.
 *
 * Paths come off the filesystem rather than out of this process, so labels go
 * through `sanitizeLabel` — a directory name may carry control bytes.
 */
async function askWorkspaceMembers(
  gate: PromptGate,
  promptIo: PromptIo,
  candidates: readonly DetectedRepo[],
): Promise<DetectedRepo[]> {
  const picked = await selectMany<string>(gate, promptIo, {
    question: `Which repositories join this workspace? (${String(candidates.length)} found)`,
    choices: candidates.map((repo) => ({
      value: repo.path,
      label: `${sanitizeLabel(repo.path)} — ${workspaceMarkers(repo)}`,
    })),
    defaultValues: candidates.map((repo) => repo.path),
  });
  const chosen = new Set(picked);
  return candidates.filter((repo) => chosen.has(repo.path));
}

/**
 * One member's declared tools, or nothing.
 *
 * A member whose setup manifest exists and does not validate contributes
 * NOTHING to the union rather than failing the offer: `defaults.tools` is a
 * baseline in a file the operator can edit the moment it is written, while
 * refusing would mean an init cannot finish until a repository it does not yet
 * manage is repaired. `stamity validate` is the surface that reports a
 * defective member manifest.
 */
async function workspaceMemberTools(memberDir: string): Promise<readonly Tool[]> {
  try {
    return (await readManifest(memberDir))?.tools ?? [];
  } catch {
    return [];
  }
}

/**
 * The union of the selected members' own tool lists, in {@link TOOLS} order,
 * falling back to {@link DEFAULT_TOOL} when no selected member declares one.
 *
 * UNION rather than intersection: `defaults` is the baseline every member
 * inherits before its own overrides, so a union preserves what each member
 * already had and lets a member narrow itself. An intersection would silently
 * drop a client one member was already targeting, and the first cascade would
 * then reclaim that client's files.
 *
 * Only a member the scan already saw a manifest on is read — `hasManifest` is
 * the same probe that qualified it, so a member with no manifest costs no read.
 */
async function deriveWorkspaceTools(
  rootDir: string,
  selected: readonly DetectedRepo[],
): Promise<Tool[]> {
  const lists = await Promise.all(
    selected.map(async (repo) =>
      repo.hasManifest ? workspaceMemberTools(join(rootDir, repo.path)) : [],
    ),
  );
  const declared = new Set<string>(lists.flat());
  const tools = TOOLS.filter((tool) => declared.has(tool));
  return tools.length === 0 ? [DEFAULT_TOOL] : tools;
}

/**
 * Compose and persist the manifest for the selected members.
 *
 * Built by `createWorkspaceManifest` and written by `writeWorkspaceManifest`,
 * never hand-serialized, so this path cannot mint a shape the writer refuses —
 * and the writer's own validation is what keeps a bad composition off disk.
 * `--dry-run` composes and reports without writing, like everything else in
 * this command.
 */
async function createOfferedWorkspace(
  rootDir: string,
  selected: readonly DetectedRepo[],
  dryRun: boolean,
): Promise<{ path: string; members: string[]; tools: Tool[] }> {
  const tools = await deriveWorkspaceTools(rootDir, selected);
  const manifest = createWorkspaceManifest(
    { tools },
    selected.map((repo) => ({ path: repo.path })),
  );
  if (!dryRun) await writeWorkspaceManifest(rootDir, manifest);
  return {
    path: join(rootDir, WORKSPACE_MANIFEST_FILE),
    members: manifest.repos.map((entry) => entry.path),
    tools: [...manifest.defaults.tools],
  };
}

/**
 * Candidate paths for a one-line disclosure, capped and honest about the tail.
 *
 * B9: `repo.path` is a directory NAME off the filesystem, exactly the content
 * `askWorkspaceMembers` already runs through `sanitizeLabel` before it reaches
 * a menu row — this is the non-interactive twin of that same sink (every
 * non-interactive run with an armed offer prints this line), so it gets the
 * same guard.
 */
function candidateSummary(candidates: readonly DetectedRepo[]): string {
  const shown = candidates.slice(0, MAX_DISCLOSED_CANDIDATES).map((repo) => sanitizeLabel(repo.path));
  const omitted = candidates.length - shown.length;
  return omitted > 0 ? `${shown.join(", ")}, … and ${String(omitted)} more` : shown.join(", ");
}

/**
 * The line every non-interactive run with an armed offer prints — piped, `-y`
 * and `--json` alike.
 *
 * The migrate gate's split, applied to a different decision for the same stated
 * reason: the unattended default is the one that changes nothing, and it says
 * so out loud. It is also the question protocol's unattested-product-decision
 * trigger — the change would move configuration in repositories the request
 * never named — so the declared default executes and the run names it.
 */
function workspaceOfferNote(candidates: readonly DetectedRepo[]): string {
  return (
    `workspace: ${String(candidates.length)} repositories found under this directory ` +
    `(${candidateSummary(candidates)}). No ${WORKSPACE_MANIFEST_FILE} was created — this run ` +
    `is not interactive, and declaring a policy over repositories you did not name is not an ` +
    `unattended default. Create one with \`stamity workspace init\`.`
  );
}

/**
 * What the answered offer did, on both surfaces.
 *
 * B9: `created.members` is `manifest.repos.map((entry) => entry.path)` — the
 * same directory names {@link candidateSummary} sanitizes, carried through
 * `createOfferedWorkspace`'s composed manifest rather than off the raw scan,
 * but still filesystem content this process did not author.
 */
function workspaceCreatedNote(
  created: { path: string; members: string[]; tools: Tool[] },
  dryRun: boolean,
): string {
  const tense = dryRun ? "would be created" : "was created";
  const members = created.members.map((member) => sanitizeLabel(member));
  return (
    `workspace: ${created.path} ${tense}, registering ${String(created.members.length)} ` +
    `member${created.members.length === 1 ? "" : "s"} (${members.join(", ")}) with ` +
    `tools ${created.tools.join(", ")}. Run \`stamity workspace sync\` to apply this policy ` +
    `to every member.`
  );
}

/** The keep-none ending: an answer, not a refusal, so it says so and nothing is written. */
function workspaceKeptNoneNote(): string {
  return (
    `workspace: no repositories selected — no ${WORKSPACE_MANIFEST_FILE} was created. ` +
    `Run \`stamity workspace init\` to pick the repositories that join.`
  );
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
 * Warnings come from BOTH channels, in the panel's own order — writer rows
 * first, then the planner. The planner's are the ones a dry run always has: a
 * hook rejected at parse time is found by PLANNING, which a dry run does in
 * full, so this is the run where saying so is worth most, while the operator is
 * still deciding whether to apply.
 *
 * `report.wrote[].warning` used to be empty here by construction — a dry run
 * runs no writer, and `./init/apply.ts::writeOutput` predicts an action and
 * returns no warning — so this loop read the planner channel alone. That stopped
 * being true when the three merged MCP documents began previewing through the
 * real merge (`./init/apply.ts::writeMcpDocument`): a hard-linked `.mcp.json` is
 * refused before that merge and an unreadable one is left untouched, and both
 * come back as a `skipped` row whose warning is the only place the preview says
 * so. Dropping them would preview a refusal as `1 left alone (already yours)`,
 * which is the reading it is least like.
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
  for (const warning of [
    ...report.wrote.flatMap((row) => (row.warning === undefined ? [] : [row.warning])),
    ...report.warnings,
  ]) {
    io.out(`  ${palette.yellow(`warning: ${warning}`)}\n`);
  }
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
 * about: the agent bodies, slash commands, hook scripts and CI workflows the
 * predecessor emitted. Those are not block-free — the predecessor wraps every
 * file it emits in its own block — they are simply never opened: the strip's
 * input list is `../../migration/detect.ts::PREDECESSOR_MARKED_FILE_CANDIDATES`,
 * six instruction surfaces, and an emitted agent or workflow is not one of them.
 * (The one overlap is `.cursor/rules/`, whose per-rule files ARE candidates, so
 * a Cursor migration strips those down to their frontmatter and counts them.)
 * Naming the floor is what stops the report claiming a completed move;
 * enumerating the rest is the predecessor's own uninstall, which is what the
 * panel's line points at — by scope, and without inventing that tool's verbs
 * (see `./init/panel.ts::residueLines`).
 *
 * `state.packagesWithState` is in the list for the monorepo case: a workspace
 * package holding its own predecessor state is a separate scope, reached by
 * nothing an operator runs at the root.
 *
 * {@link unownedSettings} is the one entry read off THIS run's write report
 * rather than off detection, and it is the only residue path with a remedy this
 * engine owns — see that helper.
 */
function migrationResidue(
  rootDir: string,
  state: PredecessorState,
  carry: CarryReport,
  report: InitApplyReport,
): MigrationResidue {
  const stateDir = state.stateDirPath;
  const settings = unownedSettings(rootDir, report);
  const found = [
    ...(stateDir === null ? [] : [stateDir]),
    ...(state.overridesDir === null ? [] : [state.overridesDir]),
    ...state.packagesWithState,
    ...carry.strips.filter((row) => row.action === "unchanged").map((row) => row.path),
  ];
  // Repo-relative, like every other path this command prints: a detection field
  // that happens to be absolute would put the operator's machine layout in the
  // middle of a line they are meant to read at a glance. The settings document
  // is appended LAST and is already repo-relative — it is the one entry that
  // comes from the write report rather than from the scan.
  const paths = found.map((path) => repoRelative(rootDir, path));
  return {
    paths: settings === null ? paths : [...paths, settings],
    ...(settings === null ? {} : { unownedSettingsPath: settings }),
  };
}

/**
 * The repo-relative path of the client settings document this run planned and
 * then refused to claim, or `null` when it claimed every path it planned.
 *
 * Detection never sees this file: it is not a marked instruction surface and it
 * is not under the predecessor's state directory, so every earlier residue
 * report omitted it — while `../../merge/safeWrite.ts` was skipping it on every
 * guided migration for exactly the reason that makes it worth naming. The
 * predecessor emits this same path as unwrapped JSON, so it carries no block of
 * anyone's; the writer therefore cannot prove ownership, leaves it untouched,
 * and this setup's hook and permission wiring never lands, so whatever that
 * document already wired is what still fires. The panel's remedy
 * line is conditional on it actually being the predecessor's, because that is
 * the half this run cannot verify — what it CAN verify is that the file predates
 * the run and that the run did not write it.
 *
 * Read off `wrote` rather than re-probed off disk: the writer's own disposition
 * is the fact, and a second `stat` here would answer a different question (the
 * file exists) than the one the line makes a claim about (this run did not
 * write it). A run that does not target that client plans no such row at all,
 * so the check is self-limiting rather than gated on the tool list.
 */
function unownedSettings(rootDir: string, report: InitApplyReport): string | null {
  const skipped = report.wrote.some(
    (row) => row.action === "skipped" && repoRelative(rootDir, row.path) === CLAUDE_SETTINGS_PATH,
  );
  return skipped ? CLAUDE_SETTINGS_PATH : null;
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
    // Already-initialised pre-flight, AHEAD of `buildInitDecisions` (B10):
    // without --force the apply below refuses, so asking two questions first
    // would waste the user's answers — and `buildInitDecisions` runs a
    // depth-4 `detectSubRepos` walk whenever this directory is standalone,
    // which a run about to refuse never uses (every consumer of the
    // candidate list below is gated on `!alreadyInitialised`). Checking here
    // costs one manifest read; `skipWorkspaceProbe` below is what actually
    // saves the walk. The refusal itself stays `applyInit`'s (single source
    // of the message); a corrupt manifest surfaces `readManifest`'s own
    // repair guidance here.
    const alreadyInitialised = !force && (await readManifest(rootDir)) !== null;
    const [decisions, predecessor] = await Promise.all([
      buildInitDecisions(rootDir, readOverrides(opts), {
        history,
        skipWorkspaceProbe: alreadyInitialised,
      }),
      detectPredecessorState(rootDir),
    ]);
    ctx.spinner.stop();

    const gate = promptGate({
      stdinIsTTY: ctx.terminal.stdinIsTTY,
      yes: ctx.yes,
      json: ctx.json,
      env: ctx.app.runtime.env,
      palette: ctx.palette,
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

    // THE WORKSPACE OFFER — the second conditional prompt, and the LAST
    // question of the run. Asked after the git gate on purpose: that gate
    // decides whether this run happens at all, and an operator who is about to
    // cancel should not first be asked to design a policy for it. Suppressed on
    // an already-initialised repo for the reason every other prompt is: the
    // apply below refuses, so the answer would be discarded.
    //
    // `null` covers three states that all write nothing — no offer, a declined
    // one, and a non-interactive run — and the note the panel prints
    // distinguishes them. A non-null empty array is the fourth: an operator who
    // opened the selection and cleared every box.
    const offerArmed = !alreadyInitialised && workspaceOfferArmed(settled);
    let workspaceMembers: DetectedRepo[] | null = null;
    if (offerArmed && gate.interactive) {
      const wanted = await askCreateWorkspace(
        gate,
        ctx.promptIo,
        settled.workspaceCandidates.length,
      );
      if (wanted) {
        workspaceMembers = await askWorkspaceMembers(
          gate,
          ctx.promptIo,
          settled.workspaceCandidates,
        );
      }
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

    // AFTER `applyInit`, and only after it returned: a failed init that left a
    // workspace.json behind would leave a workspace with no initialised root
    // and no explanation. Every throw above this line therefore leaves the
    // sibling repositories exactly as they were found.
    const workspaceCreation =
      workspaceMembers !== null && workspaceMembers.length > 0
        ? await createOfferedWorkspace(rootDir, workspaceMembers, ctx.dryRun)
        : null;

    const effective = effectiveView(settled, defaults);
    const mcpServers = defaults?.mcpServers ?? [];
    const residue =
      migrating !== null && carry !== null
        ? migrationResidue(rootDir, migrating, carry, report)
        : undefined;

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
    // LAST, because it is the only note about repositories other than this one.
    // An armed offer always leaves exactly one line, whatever the answer was —
    // except the interactive `no`, which writes nothing and prints nothing
    // further, because the operator was asked and declined.
    if (workspaceCreation !== null) {
      notes.push(workspaceCreatedNote(workspaceCreation, ctx.dryRun));
    } else if (workspaceMembers !== null) {
      notes.push(workspaceKeptNoneNote());
    } else if (offerArmed && !gate.interactive) {
      notes.push(workspaceOfferNote(settled.workspaceCandidates));
    }

    if (ctx.dryRun) {
      renderDryRun(ctx, report, carry, residue, notes, git.available);
    } else {
      for (const note of notes) ctx.io.out(`${note}\n`);
      // The mark, once, on the one surface that is a first screen for a person.
      // It gates itself: `""` on a non-TTY or a `--json` run, so nothing here
      // needs a second condition, and `""` writes zero bytes rather than a
      // blank line. The color decision travels from the funnel because
      // `--no-color` is parsed on the root program and cannot be read here.
      const welcome = bannerBlock({
        stdoutIsTTY: ctx.terminal.stdoutIsTTY,
        machineReadable: ctx.json,
        env: ctx.app.runtime.env,
        noColorFlag: !ctx.colorEnabled,
        // The width gate, wired the same way the root help wires it
        // (`../kit/program.ts`): the mark is a fixed-width picture, so a window
        // narrower than it wraps rather than shrinks it, and a wrapped mark
        // reads worse than none. Absent off a pipe or a test double, which
        // `bannerBlock` reads as "the caller does not know" and prints.
        ...(ctx.terminal.stdoutColumns === undefined
          ? {}
          : { columns: ctx.terminal.stdoutColumns }),
      });
      if (welcome !== "") ctx.io.out(`${welcome}\n`);
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
          // Present ONLY on a run whose offer armed. Every other init produces
          // the key set it produced before this feature existed, which is the
          // byte-identity property the whole hook is held to: the document
          // either fires on the detected precondition or does not exist.
          // `--json` makes a run non-interactive, so `workspaceCreated` is
          // false on every document that carries it — stated rather than
          // implied, because the field is what tells a machine reader that a
          // workspace was found and deliberately not created.
          ...(offerArmed
            ? {
                workspaceCandidates: settled.workspaceCandidates.map((repo) => repo.path),
                workspaceCreated: workspaceCreation !== null && !ctx.dryRun,
              }
            : {}),
        },
        report,
        carry,
        nextSteps: effective.tools.flatMap((tool) => nextStepsForTool(tool)),
      },
    };
  },
};
