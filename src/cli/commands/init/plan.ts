import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { ContentIndex } from "../../../content/catalog.ts";
import { analyzeRepo, isGreenfield, summarizeDetection } from "../../../detect/repoAnalyzer.ts";
import { CONTENT_CLASSES, type ContentSelection } from "../../../types/content.ts";
import {
  DEFAULT_MATURITY_TIER,
  TOOLS,
  VALID_TOOLS,
  type MaturityTier,
  type Platform,
  type Tool,
} from "../../../types/core.ts";
import type { DetectedSummary, PackageEntry, RepoInfo } from "../../../types/detect.ts";
import { EngineError } from "../../../types/errors.ts";
import {
  detectSubRepos,
  detectWorkspaceContext,
  type DetectedRepo,
  type WorkspaceRole,
} from "../../../workspace/detect.ts";
import { detectRepoGitIdentity } from "../../../workspace/git.ts";
import { readHistoryFacts, type HistoryFacts } from "../../engine/gitStatus.ts";

/**
 * The prompt-free planning half of init: everything COMPUTABLE about the repo,
 * with no commander, no readline, and no writes.
 *
 * The wave-2 init command wraps this: it renders {@link InitDecisions} into its
 * disclosure panel, asks its (at most two) TTY-gated questions, and hands the
 * settled decisions to `./apply.ts`. Every decision here records its source
 * (`toolsSource`, `maturitySource`) because the command's prompt-skip rule
 * reads them — a decision that arrived by flag or unambiguous detection is
 * never re-asked, only disclosed.
 *
 * Detection over asking: the repo analyzers run once and their evidence picks
 * every default. The only refusal in this module is a tools override naming a
 * tool the engine does not know — silently dropping it would generate for the
 * wrong targets.
 */

/** Flag-supplied overrides. A present field wins over every detected value. */
export interface InitOverrides {
  tools?: Tool[];
  maturityTier?: MaturityTier;
  platform?: Platform;
}

/** Everything the init flow decided, each decision tagged with where it came from. */
export interface InitDecisions {
  /** Target tools, in {@link TOOLS} order. */
  tools: Tool[];
  /**
   * Where `tools` came from. `flag` and `detected` are unambiguous — the
   * command skips its tools prompt for both and only discloses the choice.
   */
  toolsSource: "flag" | "detected" | "default";
  /** Tools with traces in the repo, in {@link TOOLS} order — kept even when a flag overrode them. */
  detectedTools: Tool[];
  /** True when the repo shows no language, no tool traces, and no setup of our own. */
  greenfield: boolean;
  /** Live workspace layout, carried into emission facts; per-package emission is the adapters' job. */
  monorepoPackages: PackageEntry[];
  maturityTier: MaturityTier;
  /** Where the maturity pair came from: any explicit override, the git-history seed, or the defaults. */
  maturitySource: "flag" | "git-history" | "default";
  /** Hosting platform; absent outside a recognised remote (and never guessed). */
  platform?: Platform;
  /**
   * Existing instruction files an init could import: root `AGENTS.md` /
   * `AGENT.md`, plus each detected tool's own instruction file. Feeds the
   * command's conditional import prompt.
   */
  existingConfigPaths: string[];
  /** The manifest-persisted detection subset. */
  detected: DetectedSummary;
  /**
   * The full live analysis, for the disclosure panel.
   *
   * Two consumers read it, and both are display-only: the panel's
   * detected->installed line, and `suggestStackPacks`, which classifies
   * the detected frameworks and languages into the ones nothing ships dedicated
   * guidance for. The suggestion pass needs the FULL analysis — `detected` is
   * the manifest-persisted subset and carries no frameworks — which is why the
   * live shape is kept here rather than narrowed at the plan boundary.
   */
  repoInfo: RepoInfo;
  /**
   * Sibling repositories this directory holds — the candidate members of a
   * workspace it does not have yet. Empty whenever {@link workspaceSource} is
   * not `standalone`, because the scan never ran.
   *
   * The candidate list and NOTHING derived from it: whether two candidates are
   * enough to offer anything is {@link workspaceOfferArmed}'s question, and
   * which of them join is the operator's.
   */
  workspaceCandidates: DetectedRepo[];
  /**
   * Where {@link workspaceCandidates} came from — the source tag, in the shape
   * `toolsSource` and `maturitySource` already use.
   *
   * `standalone` means the scan ran and the list is its result. The other two
   * roles mean the scan never ran because the question is already settled:
   * `workspace-root` is a directory that HAS a `workspace.json`, and
   * `workspace-member` is a directory INSIDE one, where an offer would propose
   * a workspace nested inside another one.
   */
  workspaceSource: WorkspaceRole;
}

/**
 * How many candidate repositories a directory must hold before init offers
 * anything, mirroring the engine's own `shouldSuggestWorkspace` threshold
 * (`../../../workspace/detect.ts::MIN_REPOS_TO_SUGGEST`, unexported).
 *
 * One repository is just a repository; propagation only starts paying at two.
 * The duplication is behaviourally pinned rather than referential — the command
 * suite asserts that one candidate offers nothing and two do — so a drift in
 * either value fails a test rather than silently changing when init speaks.
 */
const MIN_WORKSPACE_CANDIDATES = 2;

/**
 * Whether this run has a workspace to offer: the probe reached a standalone
 * directory AND found at least {@link MIN_WORKSPACE_CANDIDATES} repositories in
 * it.
 *
 * A predicate over the decisions rather than a flag computed in the command, so
 * the ask-or-disclose choice reads off data both surfaces already carry instead
 * of a condition spelled twice.
 */
export function workspaceOfferArmed(decisions: InitDecisions): boolean {
  return (
    decisions.workspaceSource === "standalone" &&
    decisions.workspaceCandidates.length >= MIN_WORKSPACE_CANDIDATES
  );
}

/**
 * Zero-trace default target (resolved SoT silence: prompt confirms it on a TTY,
 * flags and detection skip the prompt entirely).
 */
const DEFAULT_TOOLS: readonly Tool[] = ["claude"];

/** Contributor count at which the git-history seed reads a repo as a team's. */
const TEAM_CONTRIBUTOR_FLOOR = 2;

/** Cross-tool instruction files probed at the repo root regardless of detection. */
const CROSS_TOOL_CONFIG_FILES: readonly string[] = ["AGENTS.md", "AGENT.md"];

/**
 * Importable instruction FILES per tool, probed only for detected tools. Cursor
 * keeps its config as a rules directory and codex reads the cross-tool
 * `AGENTS.md` (probed above) — neither has a single importable file of its own,
 * so their rows are empty rather than pointing the import prompt at a
 * directory it cannot merge.
 */
const TOOL_INSTRUCTION_FILES: Record<Tool, readonly string[]> = {
  claude: ["CLAUDE.md"],
  cursor: [],
  copilot: [".github/copilot-instructions.md"],
  codex: [],
};

/**
 * Run detection once and derive every init decision.
 *
 * `deps.history` is the injectable maturity seed: pass `null` for "no usable
 * git history", a {@link HistoryFacts} to seed from, or omit the field to read
 * the live repository. The git identity probe (platform) is likewise total —
 * a non-git directory yields an absent platform, never a failure.
 *
 * `deps.skipWorkspaceProbe` (B10) skips {@link probeWorkspace}'s stage-2
 * fan-out (`detectSubRepos`' depth-4 walk) and reports an unarmed offer
 * instead — `workspaceCandidates: []`, `workspaceSource: "standalone"`. The
 * ONE caller that sets it is `../init.ts`'s already-initialised pre-flight: a
 * run refusing for cause (no `--force`, a manifest already on disk) never
 * reads the candidate list — `workspaceOfferArmed` and every downstream
 * consumer of it in `../init.ts::run` are gated on `!alreadyInitialised` — so
 * paying for the walk and discarding the result was pure waste on exactly the
 * run where the operator is about to be told "already initialised" and
 * nothing else.
 */
export async function buildInitDecisions(
  rootDir: string,
  overrides: InitOverrides,
  deps: { history?: HistoryFacts | null; skipWorkspaceProbe?: boolean } = {},
): Promise<InitDecisions> {
  // Two independent walks of the same tree, so they run concurrently under the
  // spinner the command already started rather than one after the other.
  const [info, workspace] = await Promise.all([
    analyzeRepo(rootDir),
    deps.skipWorkspaceProbe === true
      ? Promise.resolve<Pick<InitDecisions, "workspaceCandidates" | "workspaceSource">>({
          workspaceCandidates: [],
          workspaceSource: "standalone",
        })
      : probeWorkspace(rootDir),
  ]);

  // The `agents` trace (a bare AGENTS.md) is cross-tool and maps to no Tool;
  // filtering through the closed enum drops it, and TOOLS order makes the
  // detected list deterministic whatever order the analyzer reported.
  const detectedTools = TOOLS.filter((tool) => info.existingTools.includes(tool));
  const { tools, toolsSource } = resolveTools(overrides.tools, detectedTools);

  const history = deps.history === undefined ? readHistoryFacts(rootDir) : deps.history;
  const maturity = resolveMaturity(overrides, history);

  // ?? short-circuits: a flagged platform skips the git spawn entirely.
  const platform = overrides.platform ?? detectPlatform(rootDir);

  const existingConfigPaths = await collectExistingConfigPaths(rootDir, detectedTools);

  return {
    tools,
    toolsSource,
    detectedTools,
    greenfield: isGreenfield(info),
    monorepoPackages: info.monorepoPackages,
    ...maturity,
    ...(platform === undefined ? {} : { platform }),
    existingConfigPaths,
    detected: summarizeDetection(info),
    repoInfo: info,
    ...workspace,
  };
}

/**
 * The workspace probe, in two stages, cheap one first.
 *
 * Stage 1 is `detectWorkspaceContext`: one round of at most eleven `stat` calls
 * over a path chain computed arithmetically. It VETOES both directions of
 * "already settled" — a directory that is itself a workspace root, and a
 * directory inside somebody else's workspace, where an offer would propose a
 * workspace nested inside another one. `shouldSuggestWorkspace` covers only the
 * first of those, which is why this calls the two probes itself rather than it.
 *
 * Stage 2 is the genuine fan-out, at `detectSubRepos`' own default depth. Three
 * properties bound it: the walk stops at the first repository on a branch, so a
 * workspace-shaped tree — the tree where the offer actually fires — costs one
 * level plus two probes per child; `node_modules` and every dot-directory are
 * skipped at every level; and the expensive case (a deep, repository-free tree)
 * is exactly the case that returns fewer than two candidates, so the run pays
 * once and never asks.
 *
 * No cheap child-count precheck ahead of stage 2: listing the root's children
 * IS stage 2's first level, so a precheck would duplicate the one read it was
 * meant to avoid. And no shallower depth than `stamity workspace init` uses,
 * because init offering over three members while the verb one second later
 * found five is a contradiction, not a saving.
 */
async function probeWorkspace(
  rootDir: string,
): Promise<Pick<InitDecisions, "workspaceCandidates" | "workspaceSource">> {
  const context = await detectWorkspaceContext(rootDir);
  if (context.role !== "standalone") {
    return { workspaceCandidates: [], workspaceSource: context.role };
  }
  return { workspaceCandidates: await detectSubRepos(rootDir), workspaceSource: "standalone" };
}

/**
 * The full-core content selection: every catalog id, per class (composition
 * ships the whole corpus; there is no selection UI). An empty index — the
 * state until the corpus lands — yields all-empty arrays, and every future
 * sync recomputes this, so nothing is permanently narrowed by initialising
 * against an empty catalog. Duplicate-id claimants are listed once.
 */
export function fullCoreSelection(index: ContentIndex): ContentSelection {
  const items = Object.fromEntries(
    CONTENT_CLASSES.map((contentClass) => [contentClass, [] as string[]]),
  ) as ContentSelection["items"];

  const seen = new Set<string>();
  for (const item of index.items) {
    // Ids are unique per class, not globally — the key mirrors the catalog's.
    const key = `${item.type}\0${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items[item.type].push(item.id);
  }
  return { items };
}

/** Precedence: flag > detected traces > default. An empty flag array is "not given". */
function resolveTools(
  flagged: Tool[] | undefined,
  detected: Tool[],
): { tools: Tool[]; toolsSource: InitDecisions["toolsSource"] } {
  if (flagged !== undefined && flagged.length > 0) {
    // The values arrive as CLI flag strings cast to Tool[]; membership is a
    // runtime fact, so it is checked here rather than trusted from the type.
    const unknown = flagged.filter((name) => !VALID_TOOLS.has(name));
    if (unknown.length > 0) {
      throw new EngineError(
        `Unknown tool${unknown.length > 1 ? "s" : ""} ${unknown.map((name) => JSON.stringify(name)).join(", ")}. ` +
          `Valid tools: ${TOOLS.join(", ")}.`,
        { code: "VALIDATION_ERROR" },
      );
    }
    // Normalised to TOOLS order and deduplicated — one canonical spelling for
    // any flag order, matching how the detected list is reported.
    return { tools: TOOLS.filter((tool) => flagged.includes(tool)), toolsSource: "flag" };
  }
  if (detected.length > 0) return { tools: [...detected], toolsSource: "detected" };
  return { tools: [...DEFAULT_TOOLS], toolsSource: "default" };
}

/**
 * Maturity seed (resolved SoT silence): `contributorCount >= 2` reads as a
 * team repo (`team`/`team`), anything else — including no usable history —
 * seeds the solo defaults. Explicit overrides win per field; an override on
 * EITHER dial marks the pair `flag`, since the operator engaged that surface.
 */
function resolveMaturity(
  overrides: InitOverrides,
  history: HistoryFacts | null,
): { maturityTier: MaturityTier; maturitySource: InitDecisions["maturitySource"] } {
  const seedIsTeam = history !== null && history.contributorCount >= TEAM_CONTRIBUTOR_FLOOR;
  const flagged = overrides.maturityTier !== undefined;
  return {
    maturityTier: overrides.maturityTier ?? (seedIsTeam ? "team" : DEFAULT_MATURITY_TIER),
    maturitySource: flagged ? "flag" : history !== null ? "git-history" : "default",
  };
}

/** Platform off the origin remote; `undefined` for a non-repo or an unmapped host. */
function detectPlatform(rootDir: string): Platform | undefined {
  return detectRepoGitIdentity(rootDir).platform ?? undefined;
}

/**
 * The instruction files that actually exist, as repo-relative POSIX paths in a
 * fixed order: the cross-tool root files first, then each detected tool's own
 * file in {@link TOOLS} order.
 */
async function collectExistingConfigPaths(
  rootDir: string,
  detectedTools: readonly Tool[],
): Promise<string[]> {
  const candidates = [
    ...CROSS_TOOL_CONFIG_FILES,
    ...detectedTools.flatMap((tool) => TOOL_INSTRUCTION_FILES[tool]),
  ];
  const present = await Promise.all(
    candidates.map((relative) => fileExists(join(rootDir, ...relative.split("/")))),
  );
  return candidates.filter((_candidate, index) => present[index] === true);
}

/** True when `path` names a regular file. Any filesystem refusal reads as absent. */
async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
