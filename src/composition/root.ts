/**
 * Composition root: the one place the engine's module namespaces are composed
 * into a single typed registry.
 *
 * What this file guarantees, exactly: every module listed below is wired, and
 * the type checker verifies the wiring — renaming or deleting one is a
 * compile error here and in every consumer of {@link EngineRegistry}, never a
 * runtime discovery.
 *
 * What it does NOT guarantee, stated because the previous wording claimed it:
 * a module on disk that is missing here is not a build-time error. Nothing in
 * the compiler or the bundler notices an engine module this file forgot, so
 * completeness is a TEST obligation, not a type one. `test/composition/root.test.ts`
 * derives the expected registry from the on-disk tree minus a short commented
 * EXCLUSIONS list and fails when the two disagree — that derived check is what
 * makes "every engine module is wired" true, and it is the reason this comment
 * no longer asserts it on its own.
 *
 * Wiring a module here does not make it REACHED, either: the namespace imports
 * below reach every module by construction, so a module whose only consumer is
 * this registry has no production call site.
 * `test/architecture/boundaries.test.ts` re-walks reachability with this file's
 * outgoing edges removed and names those modules, so registry membership can
 * never stand in for a caller.
 *
 * Only the entrypoints (src/index.ts, src/cli.ts) may import this file.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as configParse from "../config/parse.ts";
import * as denyScan from "../denyscan/denyScan.ts";
import * as managedBlocks from "../merge/managedBlocks.ts";
import * as atomicWrite from "../merge/atomicWrite.ts";
import * as safeWrite from "../merge/safeWrite.ts";
import * as reclaim from "../merge/reclaim.ts";
import * as fsErrors from "../merge/fsErrors.ts";
import * as frontmatter from "../content/frontmatter.ts";
import * as contentRoot from "../content/contentRoot.ts";
import * as tags from "../content/tags.ts";
import * as contentCatalog from "../content/catalog.ts";
import * as charter from "../content/charter.ts";
import * as selection from "../content/selection.ts";
import * as ruleDelivery from "../content/ruleDelivery.ts";
import * as mdcCompanions from "../content/mdcCompanions.ts";
import * as userContent from "../content/userContent.ts";
import * as learningsValidation from "../learnings/validation.ts";
import * as learningsStore from "../learnings/store.ts";
import * as handoffSchema from "../handoffs/schema.ts";
import * as handoffValidation from "../handoffs/validation.ts";
import * as handoffStore from "../handoffs/store.ts";
import * as manifestCore from "../manifest/manifest.ts";
import * as ledger from "../manifest/ledger.ts";
import * as mcpFilter from "../manifest/mcpFilter.ts";
import * as claudeSettings from "../manifest/claudeSettings.ts";
import * as mcpCatalog from "../mcp/catalog.ts";
import * as descriptionScan from "../mcp/descriptionScan.ts";
import * as mcpEnv from "../mcp/env.ts";
import * as mcpEmit from "../mcp/emit.ts";
import * as secretScan from "../mcp/secretScan.ts";
import * as packManifest from "../pack/manifest.ts";
import * as packInstall from "../pack/install.ts";
import * as packPermissions from "../pack/permissions.ts";
import * as packTrust from "../pack/trust.ts";
import * as packSign from "../pack/sign.ts";
import * as packSigstoreVerifier from "../pack/sigstoreVerifier.ts";
import * as packOrgPolicy from "../pack/orgPolicy.ts";
import * as packReceipt from "../pack/receipt.ts";
import * as packProjection from "../pack/projection.ts";
import * as packCurated from "../pack/curated.ts";
import * as packCatalogPins from "../pack/catalogPins.ts";
import * as packVerifyInstalled from "../pack/verifyInstalled.ts";
import * as workspaceModel from "../workspace/model.ts";
import * as workspaceGit from "../workspace/git.ts";
import * as workspaceDetect from "../workspace/detect.ts";
import * as workspaceResolve from "../workspace/resolve.ts";
import * as workspaceManifest from "../workspace/manifest.ts";
import * as workspaceSync from "../workspace/sync.ts";
import * as worktreePolicy from "../worktree/policy.ts";
import * as worktreeGit from "../worktree/git.ts";
import * as worktreeReceipt from "../worktree/receipt.ts";
import * as worktreeMaterialize from "../worktree/materialize.ts";
import * as worktreeSetup from "../worktree/setup.ts";
import * as worktreeCleanup from "../worktree/cleanup.ts";
import * as runsLayout from "../runs/layout.ts";
import * as runsCardSource from "../runs/cardSource.ts";
import * as runsBlocks from "../runs/blocks.ts";
import * as runsLedgerStore from "../runs/ledgerStore.ts";
import * as runsResumeCard from "../runs/resumeCard.ts";
import * as hooksModel from "../hooks/model.ts";
import * as portableRunner from "../hooks/portableRunner.ts";
import * as userHooks from "../hooks/userHooks.ts";
import * as hookScripts from "../hooks/scripts.ts";
import * as toolCategories from "../tools/categories.ts";
import * as allowlist from "../tools/allowlist.ts";
import * as translator from "../tools/translator.ts";
import * as repoAnalyzer from "../detect/repoAnalyzer.ts";
import * as packageManager from "../detect/packageManager.ts";
import * as stackSupport from "../detect/stackSupport.ts";
import * as verificationGates from "../detect/verificationGates.ts";
import * as substitution from "../emit/substitution.ts";
import * as monorepoPlan from "../emit/monorepoPlan.ts";
import * as agentsMd from "../emit/agentsMd.ts";
import * as skillsProjection from "../emit/skillsProjection.ts";
import * as stateScaffold from "../emit/stateScaffold.ts";
import * as hooksInfra from "../emit/hooksInfra.ts";
import * as emitOwnership from "../emit/ownership.ts";
import * as emitPlanner from "../emit/planner.ts";
import * as capabilityMatrix from "../emit/capabilityMatrix.ts";
import * as adapterClaude from "../adapters/claude.ts";
import * as adapterCursor from "../adapters/cursor.ts";
import * as adapterCopilot from "../adapters/copilot.ts";
import * as adapterCodex from "../adapters/codex.ts";
import * as adapterToml from "../adapters/toml.ts";
import * as adapterRegistry from "../adapters/registry.ts";
import * as promptGuard from "../guard/promptGuard.ts";
import * as outputBounds from "../guard/outputBounds.ts";
import * as tokenEstimate from "../guard/tokenEstimate.ts";
import * as retry from "../resilience/retry.ts";
import * as failureClass from "../resilience/failureClass.ts";
import * as failureLog from "../resilience/failureLog.ts";
import * as adapterTimeout from "../resilience/adapterTimeout.ts";
import * as rosterTriggers from "../roster/triggers.ts";
import * as reviewCaps from "../roster/reviewCaps.ts";
import * as agentPolicies from "../roster/agentPolicies.ts";
import * as agentGrants from "../roster/agentGrants.ts";
import * as modelLadder from "../roster/modelLadder.ts";
import * as pluginCapabilityFile from "../plugins/capabilityFile.ts";

/**
 * Every engine module, grouped by feature. Fields are concrete module namespace
 * types: removing a module from the wiring (or renaming one) is a type error here
 * and in every consumer, not a silent drop.
 */
export interface EngineRegistry {
  readonly denyscan: typeof denyScan;
  readonly merge: {
    readonly managedBlocks: typeof managedBlocks;
    readonly atomicWrite: typeof atomicWrite;
    readonly safeWrite: typeof safeWrite;
    readonly reclaim: typeof reclaim;
    readonly fsErrors: typeof fsErrors;
  };
  readonly content: {
    readonly frontmatter: typeof frontmatter;
    readonly contentRoot: typeof contentRoot;
    readonly tags: typeof tags;
    readonly catalog: typeof contentCatalog;
    readonly charter: typeof charter;
    readonly selection: typeof selection;
    readonly ruleDelivery: typeof ruleDelivery;
    readonly mdcCompanions: typeof mdcCompanions;
    readonly userContent: typeof userContent;
  };
  readonly learnings: {
    readonly validation: typeof learningsValidation;
    readonly store: typeof learningsStore;
  };
  readonly handoffs: {
    readonly schema: typeof handoffSchema;
    readonly validation: typeof handoffValidation;
    readonly store: typeof handoffStore;
  };
  readonly manifest: {
    readonly manifest: typeof manifestCore;
    readonly ledger: typeof ledger;
    readonly mcpFilter: typeof mcpFilter;
    readonly claudeSettings: typeof claudeSettings;
  };
  readonly mcp: {
    readonly catalog: typeof mcpCatalog;
    readonly descriptionScan: typeof descriptionScan;
    readonly env: typeof mcpEnv;
    readonly emit: typeof mcpEmit;
    readonly secretScan: typeof secretScan;
  };
  /**
   * The pack lane, whole. Eight of these leaves were on disk and reachable
   * from the CLI while this group named only two, which is the shape the
   * derived completeness check in `test/composition/root.test.ts` now refuses:
   * a module the CLI reaches by its own import path and the registry does not
   * name is exactly the second competing path the composition doctrine exists
   * to rule out.
   */
  readonly pack: {
    readonly manifest: typeof packManifest;
    readonly install: typeof packInstall;
    readonly permissions: typeof packPermissions;
    readonly trust: typeof packTrust;
    readonly sign: typeof packSign;
    readonly sigstoreVerifier: typeof packSigstoreVerifier;
    readonly orgPolicy: typeof packOrgPolicy;
    readonly receipt: typeof packReceipt;
    readonly projection: typeof packProjection;
    readonly curated: typeof packCurated;
    readonly catalogPins: typeof packCatalogPins;
    readonly verifyInstalled: typeof packVerifyInstalled;
  };
  readonly workspace: {
    readonly model: typeof workspaceModel;
    readonly git: typeof workspaceGit;
    readonly detect: typeof workspaceDetect;
    readonly resolve: typeof workspaceResolve;
    readonly manifest: typeof workspaceManifest;
    readonly sync: typeof workspaceSync;
  };
  /**
   * The managed worktree lane: the policy file and its longest-prefix
   * resolution, the receipt schema with its git-dir home, and the TOCTOU-safe
   * materialization the receipt records — plus the git orchestration over
   * them. `git` is the lane's one subprocess seam and the pure parsers over
   * what git prints; `setup` and `cleanup` are the two flows, one creating a
   * checkout under a name lock and writing the receipt, the other inverting
   * that receipt and never touching a branch.
   *
   * A worktree is a checkout of ONE repository; the `workspace` group above
   * holds several repositories. The two are separate concerns that differ at
   * the fifth character, which is why they are separate groups rather than one.
   */
  readonly worktree: {
    readonly policy: typeof worktreePolicy;
    readonly receipt: typeof worktreeReceipt;
    readonly materialize: typeof worktreeMaterialize;
    readonly git: typeof worktreeGit;
    readonly setup: typeof worktreeSetup;
    readonly cleanup: typeof worktreeCleanup;
  };
  /**
   * A work run's on-disk shape (the run folder, its record head, its ledger and
   * reports, the resume card's bounds), the resume card's embeddable body, the
   * findings-block reader, the ledger's one serialized writer, and the engine's
   * own reader of the resume card, the hook body's twin.
   */
  readonly runs: {
    readonly layout: typeof runsLayout;
    readonly cardSource: typeof runsCardSource;
    readonly blocks: typeof runsBlocks;
    readonly ledgerStore: typeof runsLedgerStore;
    readonly resumeCard: typeof runsResumeCard;
  };
  readonly hooks: {
    readonly model: typeof hooksModel;
    readonly portableRunner: typeof portableRunner;
    readonly userHooks: typeof userHooks;
    readonly scripts: typeof hookScripts;
  };
  readonly tools: {
    readonly categories: typeof toolCategories;
    readonly allowlist: typeof allowlist;
    readonly translator: typeof translator;
  };
  readonly detect: {
    readonly repoAnalyzer: typeof repoAnalyzer;
    readonly packageManager: typeof packageManager;
    readonly stackSupport: typeof stackSupport;
    readonly verificationGates: typeof verificationGates;
  };
  readonly emit: {
    readonly substitution: typeof substitution;
    readonly monorepoPlan: typeof monorepoPlan;
    readonly agentsMd: typeof agentsMd;
    readonly skillsProjection: typeof skillsProjection;
    readonly stateScaffold: typeof stateScaffold;
    readonly hooksInfra: typeof hooksInfra;
    /**
     * The plugin ownership boundary — the one predicate deciding which content
     * classes reach a client from an installed plugin rather than from
     * emission. Wired like any other engine module because four adapters, the
     * core composer and the sync report all ask it: a second reader deciding
     * that question for itself is the competing path this registry rules out.
     */
    readonly ownership: typeof emitOwnership;
    readonly planner: typeof emitPlanner;
    /**
     * The generated capability page's renderer. Wired like any other engine
     * module even though its only production caller is
     * `scripts/generate-capability-matrix.mjs`: the registry is what declares a
     * module reachable, and a doc generator that lived outside it would be an
     * unwired file the composition doctrine cannot see.
     */
    readonly capabilityMatrix: typeof capabilityMatrix;
  };
  readonly adapters: {
    readonly claude: typeof adapterClaude;
    readonly cursor: typeof adapterCursor;
    readonly copilot: typeof adapterCopilot;
    readonly codex: typeof adapterCodex;
    readonly toml: typeof adapterToml;
    /**
     * The typed residue table itself. Named `registry` after the module that
     * holds it (`src/adapters/registry.ts`) — this repo has no `index.ts`
     * barrels below the public entry, so there is no `index` field either.
     */
    readonly registry: typeof adapterRegistry;
  };
  readonly guard: {
    readonly promptGuard: typeof promptGuard;
    readonly outputBounds: typeof outputBounds;
    readonly tokenEstimate: typeof tokenEstimate;
  };
  readonly resilience: {
    readonly retry: typeof retry;
    readonly failureClass: typeof failureClass;
    readonly failureLog: typeof failureLog;
    readonly adapterTimeout: typeof adapterTimeout;
  };
  readonly roster: {
    readonly triggers: typeof rosterTriggers;
    readonly reviewCaps: typeof reviewCaps;
    readonly agentPolicies: typeof agentPolicies;
    readonly agentGrants: typeof agentGrants;
    readonly modelLadder: typeof modelLadder;
  };
  /**
   * The plugin lane's ENGINE half: the reader of a root's `stamity-plugin.json`
   * (REQ-PLUGIN-015). Unit C4 adds `status` beside it.
   *
   * A group of one, deliberately, and the absence is worth naming: the setup
   * engine that consumes this reader is NOT here and cannot be. It composes
   * init's planning and write halves, which are `src/cli/**`, so it lives at
   * `../cli/commands/plugin/setup.ts` — and this file is at wave 12, below the
   * whole CLI layer, so the registry could not reach it even if the boundary
   * rule allowed the import. A group naming only what the registry may actually
   * hold is honest about where the lane's two halves sit.
   */
  readonly plugins: {
    readonly capabilityFile: typeof pluginCapabilityFile;
  };
  readonly config: {
    readonly parse: typeof configParse;
  };
}

/** Composes the full module registry. Pure: a fresh, frozen object per call. */
export function createEngine(): EngineRegistry {
  return Object.freeze({
    denyscan: denyScan,
    merge: { managedBlocks, atomicWrite, safeWrite, reclaim, fsErrors },
    content: {
      frontmatter,
      contentRoot,
      tags,
      catalog: contentCatalog,
      charter,
      selection,
      ruleDelivery,
      mdcCompanions,
      userContent,
    },
    learnings: { validation: learningsValidation, store: learningsStore },
    handoffs: {
      schema: handoffSchema,
      validation: handoffValidation,
      store: handoffStore,
    },
    manifest: { manifest: manifestCore, ledger, mcpFilter, claudeSettings },
    mcp: {
      catalog: mcpCatalog,
      descriptionScan,
      env: mcpEnv,
      emit: mcpEmit,
      secretScan,
    },
    pack: {
      manifest: packManifest,
      install: packInstall,
      permissions: packPermissions,
      trust: packTrust,
      sign: packSign,
      sigstoreVerifier: packSigstoreVerifier,
      orgPolicy: packOrgPolicy,
      receipt: packReceipt,
      projection: packProjection,
      curated: packCurated,
      catalogPins: packCatalogPins,
      verifyInstalled: packVerifyInstalled,
    },
    workspace: {
      model: workspaceModel,
      git: workspaceGit,
      detect: workspaceDetect,
      resolve: workspaceResolve,
      manifest: workspaceManifest,
      sync: workspaceSync,
    },
    worktree: {
      policy: worktreePolicy,
      receipt: worktreeReceipt,
      materialize: worktreeMaterialize,
      git: worktreeGit,
      setup: worktreeSetup,
      cleanup: worktreeCleanup,
    },
    runs: {
      layout: runsLayout,
      cardSource: runsCardSource,
      blocks: runsBlocks,
      ledgerStore: runsLedgerStore,
      resumeCard: runsResumeCard,
    },
    hooks: { model: hooksModel, portableRunner, userHooks, scripts: hookScripts },
    tools: { categories: toolCategories, allowlist, translator },
    detect: {
      repoAnalyzer,
      packageManager,
      stackSupport,
      verificationGates,
    },
    emit: {
      substitution,
      monorepoPlan,
      agentsMd,
      skillsProjection,
      stateScaffold,
      hooksInfra,
      ownership: emitOwnership,
      planner: emitPlanner,
      capabilityMatrix,
    },
    adapters: {
      claude: adapterClaude,
      cursor: adapterCursor,
      copilot: adapterCopilot,
      codex: adapterCodex,
      toml: adapterToml,
      registry: adapterRegistry,
    },
    guard: { promptGuard, outputBounds, tokenEstimate },
    resilience: { retry, failureClass, failureLog, adapterTimeout },
    roster: { triggers: rosterTriggers, reviewCaps, agentPolicies, agentGrants, modelLadder },
    plugins: { capabilityFile: pluginCapabilityFile },
    config: { parse: configParse },
  });
}

/** Injectable wall clock, so time-dependent behaviour stays deterministic under test. */
export interface Clock {
  now(): Date;
}

/**
 * Ambient process facts, offered as injection seams.
 *
 * Read this as what the root OFFERS, not as a repo-wide invariant: the earlier
 * wording ("nothing below the composition root reads `process` directly") was
 * false, and three modules disprove it — `../mcp/env.ts` reads
 * `process.platform` and `process.env.PSModulePath` to pick a shell dialect,
 * `../resilience/failureLog.ts` reads `process.env` for its size cap, and
 * `../hooks/scripts.ts` reads `process.cwd()` and `process.env.STAMITY_REPO_ROOT`.
 * Two of those produce operator-facing strings that differ by machine with no
 * injection point, which is the defect the honest wording keeps visible rather
 * than the promise hiding.
 *
 * {@link cwd} and {@link clock} ARE threaded (the CLI passes both down through
 * `App`), and so is {@link env}: seven CLI call sites now read it and pass it
 * on — `../cli/commands/init.ts` (twice), `config.ts`, `clean.ts`,
 * `worktree.ts` (twice) and `workspace.ts`, each populating a prompt gate's
 * `env` from `ctx.app.runtime.env` rather than reading `process.env` where it
 * stands. What is still NOT threaded is the three engine modules named above;
 * `../config/parse.ts` shows the shape they should take —
 * `env: Readonly<Record<string, string | undefined>> = process.env` as a
 * defaulted parameter — and threading them is a change to those modules, not
 * to this one.
 */
export interface Runtime {
  readonly cwd: string;
  /**
   * Process environment. Populated from `process.env` (or an override) and
   * exposed on `App`. The CLI reads it through this field — every prompt gate
   * the seven command call sites build takes its `env` from here — while the
   * three ENGINE modules named in the interface note above still read
   * `process.env` directly.
   */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly clock: Clock;
}

/** Overrides for the composition root; every field falls back to the live process. */
export interface AppOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly clock?: Clock;
}

/** The wired application. Feature modules receive this, never globals. */
export interface App {
  readonly version: string;
  readonly runtime: Runtime;
}

/**
 * Single source of the version: the nearest package.json with a version field,
 * walking up from this file. Works from both the source tree (src/composition/)
 * and the emitted bundle (dist/), whatever chunk layout the bundler picks.
 */
function resolvePackageVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, "package.json");
    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string") return parsed.version;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`no package.json with a version field above ${import.meta.url}`);
    }
    dir = parent;
  }
}

export const VERSION: string = resolvePackageVersion();

const systemClock: Clock = {
  now: () => new Date(),
};

/**
 * Composes the application shell. Every dependency is constructed here and passed
 * down explicitly, so wiring is verified by the type checker rather than by
 * scanning for call sites.
 */
export function createApp(options: AppOptions = {}): App {
  const runtime: Runtime = {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    clock: options.clock ?? systemClock,
  };

  return {
    version: VERSION,
    runtime,
  };
}
